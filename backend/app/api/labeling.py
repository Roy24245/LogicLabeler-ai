"""Labeling API — Auto-labeling pipeline orchestration.

Chains Commander -> Soldier -> Critic -> RAG in a complete flow.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import Annotation, Dataset, Image, LabelingJob, ReviewJob
from app.services import commander, soldier, critic, rag_service, augmentation, reviewer
from app.services import dataset_service as ds_svc

logger = logging.getLogger(__name__)

router = APIRouter(tags=["labeling"])

_job_logs: dict[int, list[str]] = {}
_log_subscribers: dict[int, list[asyncio.Queue]] = {}


class LabelingRequest(BaseModel):
    dataset_id: int
    instruction: str
    soldier_mode: str | None = None
    use_sahi: bool = False
    use_rag: bool = True
    augment_after: bool = False
    augment_types: list[str] | None = None


class ReviewRequest(BaseModel):
    dataset_id: int
    image_ids: list[int] | None = None


@router.post("/labeling/run")
def run_labeling(body: LabelingRequest, db: Session = Depends(get_db)):
    if not settings.dashscope_api_key:
        raise HTTPException(
            400,
            "DashScope API Key 尚未設定。請先在「設定」頁面輸入有效的 API Key。",
        )

    ds = ds_svc.get_dataset(db, body.dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")

    images = db.query(Image).filter(Image.dataset_id == body.dataset_id).all()
    if not images:
        raise HTTPException(400, "Dataset has no images")

    job = LabelingJob(
        dataset_id=body.dataset_id,
        instruction=body.instruction,
        soldier_mode=body.soldier_mode or settings.soldier_mode,
        status="running",
        total_images=len(images),
        processed_images=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    _job_logs[job.id] = []
    _log_subscribers.setdefault(job.id, [])

    thread = threading.Thread(
        target=_run_pipeline,
        args=(job.id, body),
        daemon=True,
    )
    thread.start()

    return {
        "job_id": job.id,
        "status": "running",
        "total_images": len(images),
    }


@router.get("/labeling/status/{job_id}")
def labeling_status(job_id: int, db: Session = Depends(get_db)):
    job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return {
        "job_id": job.id,
        "status": job.status,
        "total_images": job.total_images,
        "processed_images": job.processed_images,
        "logs": _job_logs.get(job.id, [])[-50:],
    }


@router.get("/labeling/jobs")
def list_labeling_jobs(db: Session = Depends(get_db)):
    jobs = db.query(LabelingJob).order_by(LabelingJob.created_at.desc()).all()
    return [
        {
            "id": j.id,
            "dataset_id": j.dataset_id,
            "instruction": j.instruction,
            "status": j.status,
            "total_images": j.total_images,
            "processed_images": j.processed_images,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        }
        for j in jobs
    ]


def _run_pipeline(job_id: int, request: LabelingRequest):
    """Execute the full Commander -> Soldier -> Critic -> RAG pipeline."""
    db = SessionLocal()
    try:
        job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
        if not job:
            return

        _log(job_id, "=== LogicLabeler Auto-Labeling Pipeline ===")
        _log(job_id, f"Instruction: {request.instruction}")

        # Step 1: Commander — parse instruction
        _log(job_id, "[Commander] Parsing instruction with Qwen3.5-Plus...")
        rag_context = ""
        if request.use_rag:
            rag_context = rag_service.retrieve_context(query_text=request.instruction)
            if rag_context:
                _log(job_id, f"[RAG] Injected {len(rag_context.splitlines())} historical error hints")

        plan = commander.parse_instruction(request.instruction, rag_context)
        _log(job_id, f"[Commander] Targets: {plan.get('targets', [])}")
        _log(job_id, f"[Commander] Logic type: {plan.get('logic_type', 'N/A')}")
        _log(job_id, f"[Commander] Rules: {len(plan.get('logic_rules', []))}")

        # Step 2 & 3: Soldier + Critic for each image
        images = db.query(Image).filter(Image.dataset_id == request.dataset_id).all()
        mode = request.soldier_mode or settings.soldier_mode

        for idx, img in enumerate(images):
            _log(job_id, f"\n[Soldier] Processing image {idx + 1}/{len(images)}: {img.filename}")

            if request.use_sahi and (img.width > 1200 or img.height > 1200):
                from app.core.sahi_utils import sahi_detect
                detections = sahi_detect(
                    image_path=img.filepath,
                    detect_fn=lambda p, t, d: soldier.detect_objects(p, t, d, mode),
                    targets=plan.get("targets", []),
                    detection_prompts=plan.get("detection_prompts", {}),
                    image_width=img.width,
                    image_height=img.height,
                )
                _log(job_id, f"  [SAHI] Detected {len(detections)} objects (with slicing)")
            else:
                detections = soldier.detect_objects(
                    img.filepath,
                    plan.get("targets", []),
                    plan.get("detection_prompts", {}),
                    mode,
                )
                _log(job_id, f"  Detected {len(detections)} objects")

            # Critic validation
            _log(job_id, f"  [Critic] Validating {len(detections)} detections...")
            validated = critic.validate_detections(
                img.filepath,
                detections,
                plan.get("logic_rules", []),
                plan.get("targets", []),
            )
            _log(job_id, f"  [Critic] {len(validated)} detections passed validation")

            # Save annotations
            db.query(Annotation).filter(Annotation.image_id == img.id).delete()
            for det in validated:
                ann = Annotation(
                    image_id=img.id,
                    class_name=det["class_name"],
                    bbox=det.get("bbox"),
                    confidence=det.get("confidence"),
                    source=det.get("source", "auto"),
                )
                db.add(ann)

            job.processed_images = idx + 1
            db.commit()

        # Update dataset classes
        ds = db.query(Dataset).filter(Dataset.id == request.dataset_id).first()
        if ds:
            all_classes = set()
            for ann in (
                db.query(Annotation)
                .join(Image)
                .filter(Image.dataset_id == request.dataset_id)
                .all()
            ):
                all_classes.add(ann.class_name)
            ds.label_classes = list(all_classes)
            ds.annotation_count = (
                db.query(Annotation)
                .join(Image)
                .filter(Image.dataset_id == request.dataset_id)
                .count()
            )

        job.status = "completed"
        db.commit()
        _log(job_id, "\n=== Pipeline Complete ===")

    except Exception as e:
        logger.exception("Labeling pipeline failed: %s", e)
        _log(job_id, f"\n[ERROR] Pipeline failed: {e}")
        if job:
            job.status = "failed"
            db.commit()
    finally:
        db.close()


def _log(job_id: int, msg: str):
    logger.info("[Job %d] %s", job_id, msg)
    _job_logs.setdefault(job_id, []).append(msg)
    for q in _log_subscribers.get(job_id, []):
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass


# ── AI Review ──────────────────────────────────────────────────────

_review_logs: dict[int, list[str]] = {}


@router.post("/labeling/review")
def start_review(body: ReviewRequest, db: Session = Depends(get_db)):
    if not settings.dashscope_api_key:
        raise HTTPException(400, "DashScope API Key 尚未設定。")

    ds = ds_svc.get_dataset(db, body.dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")

    if body.image_ids:
        images = db.query(Image).filter(Image.id.in_(body.image_ids), Image.dataset_id == body.dataset_id).all()
    else:
        images = db.query(Image).filter(Image.dataset_id == body.dataset_id).all()

    if not images:
        raise HTTPException(400, "No images to review")

    images_with_anns = [img for img in images if db.query(Annotation).filter(Annotation.image_id == img.id).count() > 0]
    if not images_with_anns:
        raise HTTPException(400, "所選圖片沒有標註可供審查")

    job = ReviewJob(
        dataset_id=body.dataset_id,
        status="running",
        total_images=len(images_with_anns),
        processed_images=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    _review_logs[job.id] = []

    thread = threading.Thread(target=_run_review, args=(job.id, body.dataset_id, [img.id for img in images_with_anns]), daemon=True)
    thread.start()

    return {"job_id": job.id, "status": "running", "total_images": len(images_with_anns)}


@router.get("/labeling/review/{job_id}")
def review_status(job_id: int, db: Session = Depends(get_db)):
    job = db.query(ReviewJob).filter(ReviewJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Review job not found")
    return {
        "job_id": job.id,
        "status": job.status,
        "total_images": job.total_images,
        "processed_images": job.processed_images,
        "results_summary": job.results_summary,
        "logs": _review_logs.get(job.id, [])[-50:],
    }


@router.post("/labeling/review/{job_id}/apply")
def apply_review(job_id: int, db: Session = Depends(get_db)):
    job = db.query(ReviewJob).filter(ReviewJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Review job not found")
    if job.status != "completed":
        raise HTTPException(400, "Review not completed yet")

    applied = 0
    rejected_anns = db.query(Annotation).filter(
        Annotation.review_status == "rejected",
        Annotation.image_id.in_(
            db.query(Image.id).filter(Image.dataset_id == job.dataset_id)
        ),
    ).all()
    for ann in rejected_anns:
        db.delete(ann)
        applied += 1

    needs_adj = db.query(Annotation).filter(
        Annotation.review_status == "needs_adjustment",
        Annotation.image_id.in_(
            db.query(Image.id).filter(Image.dataset_id == job.dataset_id)
        ),
    ).all()
    for ann in needs_adj:
        if ann.review_comment and "建議類別:" in ann.review_comment:
            suggested = ann.review_comment.split("建議類別:")[-1].strip()
            if suggested:
                ann.class_name = suggested
                applied += 1
        ann.review_status = "approved"
        ann.review_comment = None

    db.commit()
    ds_svc._sync_counts(db, job.dataset_id)
    return {"ok": True, "applied": applied}


def _run_review(job_id: int, dataset_id: int, image_ids: list[int]):
    db = SessionLocal()
    try:
        job = db.query(ReviewJob).filter(ReviewJob.id == job_id).first()
        if not job:
            return

        _review_log(job_id, "=== AI 標註審查開始 ===")
        summary = {"approved": 0, "rejected": 0, "needs_adjustment": 0}

        for idx, img_id in enumerate(image_ids):
            img = db.query(Image).filter(Image.id == img_id).first()
            if not img:
                continue

            anns = db.query(Annotation).filter(Annotation.image_id == img_id).all()
            if not anns:
                job.processed_images = idx + 1
                db.commit()
                continue

            _review_log(job_id, f"[Review] 審查圖片 {idx + 1}/{len(image_ids)}: {img.filename} ({len(anns)} 標註)")

            ann_dicts = [{"id": a.id, "class_name": a.class_name, "bbox": a.bbox, "confidence": a.confidence} for a in anns]
            results = reviewer.review_image_annotations(img.filepath, ann_dicts)

            for result in results:
                ann_id = result.get("annotation_id")
                if not ann_id:
                    continue
                ann = db.query(Annotation).filter(Annotation.id == ann_id).first()
                if not ann:
                    continue
                ann.review_status = result["review_status"]
                ann.review_comment = result.get("review_comment")
                summary[result["review_status"]] = summary.get(result["review_status"], 0) + 1
                status_icon = {"approved": "✓", "rejected": "✗", "needs_adjustment": "⚠"}.get(result["review_status"], "?")
                _review_log(job_id, f"  {status_icon} [{ann.class_name}] → {result['review_status']}: {result.get('review_comment', '')}")

            job.processed_images = idx + 1
            db.commit()

        job.results_summary = summary
        job.status = "completed"
        db.commit()
        _review_log(job_id, f"\n=== 審查完成 === 通過: {summary['approved']}, 拒絕: {summary['rejected']}, 需調整: {summary['needs_adjustment']}")

    except Exception as e:
        logger.exception("Review pipeline failed: %s", e)
        _review_log(job_id, f"\n[ERROR] 審查失敗: {e}")
        job = db.query(ReviewJob).filter(ReviewJob.id == job_id).first()
        if job:
            job.status = "failed"
            db.commit()
    finally:
        db.close()


def _review_log(job_id: int, msg: str):
    logger.info("[ReviewJob %d] %s", job_id, msg)
    _review_logs.setdefault(job_id, []).append(msg)
