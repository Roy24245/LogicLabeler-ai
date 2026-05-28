"""AI-assisted annotation endpoints (smart segment + single-image auto-label)."""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Dataset, Image
from app.services import commander, segment_assist, soldier
from app.services import model_providers as mp

logger = logging.getLogger(__name__)

router = APIRouter(tags=["annotation-assist"])


class SegmentRequest(BaseModel):
    image_id: int
    type: str = "click"  # 'click' | 'bbox'
    point: list[float] | None = None  # [x, y] in image-pixel coords
    bbox: dict | None = None  # {x, y, w, h}


@router.post("/assist/segment")
def assist_segment(body: SegmentRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    img = db.query(Image).filter(Image.id == body.image_id).first()
    if not img:
        raise HTTPException(404, "Image not found")
    if not os.path.exists(img.filepath):
        raise HTTPException(404, "Image file missing on disk")

    if body.type == "bbox":
        if not body.bbox:
            raise HTTPException(400, "bbox is required when type='bbox'")
        result = segment_assist.smart_segment(img.filepath, bbox=body.bbox)
    else:
        if not body.point or len(body.point) != 2:
            raise HTTPException(400, "point [x, y] is required when type='click'")
        result = segment_assist.smart_segment(img.filepath, point=(body.point[0], body.point[1]))
    return result


class AutoLabelRequest(BaseModel):
    image_id: int
    classes: list[str] | None = None
    instruction: str | None = None
    mode: str | None = None  # override soldier mode if needed


@router.post("/assist/autolabel-image")
def assist_autolabel_image(body: AutoLabelRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    img = db.query(Image).filter(Image.id == body.image_id).first()
    if not img:
        raise HTTPException(404, "Image not found")
    if not os.path.exists(img.filepath):
        raise HTTPException(404, "Image file missing on disk")

    ds = db.query(Dataset).filter(Dataset.id == img.dataset_id).first()
    classes = body.classes or (list(ds.label_classes) if ds and ds.label_classes else [])

    targets: list[str]
    detection_prompts: dict[str, str]
    examples: dict[str, list[str]] = {}
    open_vocabulary = False
    plan_used: dict[str, Any] | None = None

    if body.instruction:
        try:
            plan_used = commander.parse_instruction(body.instruction)
        except Exception as e:
            logger.warning("Commander parse failed for autolabel-image: %s", e)
            plan_used = None

    if plan_used and plan_used.get("targets"):
        targets = list(plan_used.get("targets") or [])
        detection_prompts = dict(plan_used.get("detection_prompts") or {})
        examples = dict(plan_used.get("examples") or {})
        open_vocabulary = bool(plan_used.get("open_vocabulary", False))
        for t in targets:
            detection_prompts.setdefault(t, t)
    elif classes:
        targets = list(classes)
        if body.instruction:
            detection_prompts = {c: body.instruction for c in classes}
        else:
            detection_prompts = {c: c for c in classes}
    else:
        raise HTTPException(
            400,
            "No instruction or classes provided and dataset has no label classes",
        )

    try:
        mp.reload_active_models()
        soldier_model = mp.describe_active_model("soldier")
        detections = soldier.detect_objects(
            image_path=img.filepath,
            targets=targets,
            detection_prompts=detection_prompts,
            mode=body.mode,
            examples=examples,
            open_vocabulary=open_vocabulary,
        )
    except Exception as e:
        logger.exception("autolabel-image failed: %s", e)
        raise HTTPException(500, f"Detection failed: {e}")

    return {
        "success": True,
        "detections": detections,
        "model": soldier_model,
        "open_vocabulary": open_vocabulary,
        "targets": targets,
        "examples": examples,
    }
