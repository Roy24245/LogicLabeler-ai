from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import dataset_service as svc

router = APIRouter(tags=["datasets"])


class DatasetCreate(BaseModel):
    name: str
    description: str = ""
    task_type: str = "detection"
    label_classes: list[str] | None = None


class AnnotationIn(BaseModel):
    class_name: str
    bbox: dict | None = None
    confidence: float | None = None
    source: str = "manual"


# ── Dataset CRUD ─────────────────────────────────────────────────────

@router.post("/datasets")
def create_dataset(body: DatasetCreate, db: Session = Depends(get_db)):
    ds = svc.create_dataset(db, body.name, body.description, body.task_type, body.label_classes)
    return _ds_dict(ds)


@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db)):
    return [_ds_dict(d) for d in svc.get_datasets(db)]


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return _ds_dict(ds)


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    if not svc.delete_dataset(db, dataset_id):
        raise HTTPException(404, "Dataset not found")
    return {"ok": True}


# ── Images ───────────────────────────────────────────────────────────

@router.post("/datasets/{dataset_id}/images")
async def upload_images(dataset_id: int, files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    results = []
    for f in files:
        data = await f.read()
        img = svc.add_image_to_dataset(db, dataset_id, f.filename or "image.jpg", data)
        results.append(_img_dict(img))
    return results


@router.get("/datasets/{dataset_id}/images")
def list_images(
    dataset_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    images = svc.get_images(db, dataset_id, skip, limit)
    return [_img_dict(i) for i in images]


@router.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    if not svc.delete_image(db, image_id):
        raise HTTPException(404, "Image not found")
    return {"ok": True}


# ── Annotations ──────────────────────────────────────────────────────

@router.get("/images/{image_id}/annotations")
def get_annotations(image_id: int, db: Session = Depends(get_db)):
    return [_ann_dict(a) for a in svc.get_annotations(db, image_id)]


@router.put("/images/{image_id}/annotations")
def update_annotations(image_id: int, body: list[AnnotationIn], db: Session = Depends(get_db)):
    anns = svc.update_annotations(db, image_id, [a.model_dump() for a in body])
    return [_ann_dict(a) for a in anns]


# ── Import / Export ──────────────────────────────────────────────────

@router.post("/datasets/{dataset_id}/import")
async def import_dataset(
    dataset_id: int,
    format: str = Query("yolo", pattern="^(yolo|coco|voc)$"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    data = await file.read()
    if format == "yolo":
        svc.import_yolo_zip(db, dataset_id, data)
    elif format == "coco":
        svc.import_coco_zip(db, dataset_id, data)
    elif format == "voc":
        svc.import_voc_zip(db, dataset_id, data)
    return {"ok": True, "message": f"Imported {format} dataset"}


@router.get("/datasets/{dataset_id}/export")
def export_dataset(
    dataset_id: int,
    format: str = Query("yolo"),
    db: Session = Depends(get_db),
):
    if format != "yolo":
        raise HTTPException(400, "Only YOLO export is currently supported")
    try:
        zip_bytes = svc.export_yolo(db, dataset_id)
    except ValueError:
        raise HTTPException(404, "Dataset not found")
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=dataset_{dataset_id}_yolo.zip"},
    )


# ── Helpers ──────────────────────────────────────────────────────────

def _ds_dict(ds):
    return {
        "id": ds.id,
        "name": ds.name,
        "description": ds.description,
        "task_type": ds.task_type,
        "label_classes": ds.label_classes,
        "image_count": ds.image_count,
        "annotation_count": ds.annotation_count,
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
    }


def _img_dict(img):
    rel = f"/static/datasets/{img.dataset_id}/images/{img.filename}"
    return {
        "id": img.id,
        "dataset_id": img.dataset_id,
        "filename": img.filename,
        "url": rel,
        "width": img.width,
        "height": img.height,
        "is_augmented": img.is_augmented,
        "created_at": img.created_at.isoformat() if img.created_at else None,
    }


def _ann_dict(a):
    return {
        "id": a.id,
        "image_id": a.image_id,
        "class_name": a.class_name,
        "bbox": a.bbox,
        "confidence": a.confidence,
        "source": a.source,
    }
