from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Annotation, Image
from app.services import dataset_service as svc

router = APIRouter(tags=["datasets"])


# ── Pydantic Models ──────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    name: str
    description: str = ""
    task_type: str = "detection"
    label_classes: list[str] | None = None


class DatasetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    task_type: str | None = None
    label_classes: list | None = None


class AnnotationIn(BaseModel):
    class_name: str
    bbox: dict | None = None
    confidence: float | None = None
    source: str = "manual"


class ClassRename(BaseModel):
    old_name: str
    new_name: str


class ClassMerge(BaseModel):
    source: str
    target: str


class AutoSplitRequest(BaseModel):
    train_ratio: float = 0.7
    val_ratio: float = 0.2
    test_ratio: float = 0.1


class BatchSplitRequest(BaseModel):
    image_ids: list[int]
    split: str | None = None


class ImageUpdate(BaseModel):
    split: str | None = None


class BatchDeleteRequest(BaseModel):
    image_ids: list[int]


# ── Dataset CRUD ─────────────────────────────────────────────────────

@router.post("/datasets")
def create_dataset(body: DatasetCreate, db: Session = Depends(get_db)):
    ds = svc.create_dataset(db, body.name, body.description, body.task_type, body.label_classes)
    return _ds_dict(ds, db)


@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db)):
    return [_ds_dict(d, db) for d in svc.get_datasets(db)]


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return _ds_dict(ds, db)


@router.put("/datasets/{dataset_id}")
def update_dataset(dataset_id: int, body: DatasetUpdate, db: Session = Depends(get_db)):
    ds = svc.update_dataset(db, dataset_id, **body.model_dump(exclude_unset=True))
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return _ds_dict(ds, db)


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
    limit: int = Query(50, ge=1, le=500),
    labeled: bool | None = Query(None),
    class_name: str | None = Query(None),
    split: str | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
):
    images, total = svc.get_images(db, dataset_id, skip, limit, labeled=labeled, class_name=class_name, split=split, search=search)
    return {"images": [_img_dict(i) for i in images], "total": total}


@router.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    if not svc.delete_image(db, image_id):
        raise HTTPException(404, "Image not found")
    return {"ok": True}


@router.put("/images/{image_id}")
def update_image(image_id: int, body: ImageUpdate, db: Session = Depends(get_db)):
    img = svc.update_image(db, image_id, **body.model_dump(exclude_unset=True))
    if not img:
        raise HTTPException(404, "Image not found")
    return _img_dict(img)


@router.post("/datasets/{dataset_id}/images/batch-delete")
def batch_delete_images(dataset_id: int, body: BatchDeleteRequest, db: Session = Depends(get_db)):
    deleted = svc.batch_delete_images(db, body.image_ids)
    return {"ok": True, "deleted": deleted}


@router.post("/datasets/{dataset_id}/images/convert-jpg")
def convert_images_to_jpg(dataset_id: int, db: Session = Depends(get_db)):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    converted = svc.convert_existing_images(db, dataset_id)
    return {"ok": True, "converted": converted}


# ── Annotations ──────────────────────────────────────────────────────

@router.get("/images/{image_id}/annotations")
def get_annotations(image_id: int, db: Session = Depends(get_db)):
    return [_ann_dict(a) for a in svc.get_annotations(db, image_id)]


@router.put("/images/{image_id}/annotations")
def update_annotations(image_id: int, body: list[AnnotationIn], db: Session = Depends(get_db)):
    anns = svc.update_annotations(db, image_id, [a.model_dump() for a in body])
    return [_ann_dict(a) for a in anns]


# ── Class Management ─────────────────────────────────────────────────

@router.post("/datasets/{dataset_id}/classes/rename")
def rename_class(dataset_id: int, body: ClassRename, db: Session = Depends(get_db)):
    count = svc.rename_class(db, dataset_id, body.old_name, body.new_name)
    return {"ok": True, "updated": count}


@router.post("/datasets/{dataset_id}/classes/merge")
def merge_classes(dataset_id: int, body: ClassMerge, db: Session = Depends(get_db)):
    count = svc.merge_classes(db, dataset_id, body.source, body.target)
    return {"ok": True, "updated": count}


@router.delete("/datasets/{dataset_id}/classes/{class_name}")
def delete_class(dataset_id: int, class_name: str, db: Session = Depends(get_db)):
    count = svc.delete_class(db, dataset_id, class_name)
    return {"ok": True, "deleted": count}


# ── Stats ────────────────────────────────────────────────────────────

@router.get("/datasets/{dataset_id}/stats")
def dataset_stats(dataset_id: int, db: Session = Depends(get_db)):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return svc.get_dataset_stats(db, dataset_id)


# ── Split Management ─────────────────────────────────────────────────

@router.post("/datasets/{dataset_id}/auto-split")
def auto_split(dataset_id: int, body: AutoSplitRequest, db: Session = Depends(get_db)):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    result = svc.auto_split(db, dataset_id, body.train_ratio, body.val_ratio, body.test_ratio)
    return result


@router.put("/datasets/{dataset_id}/batch-split")
def batch_split(dataset_id: int, body: BatchSplitRequest, db: Session = Depends(get_db)):
    ds = svc.get_dataset(db, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    count = svc.batch_split(db, body.image_ids, body.split)
    return {"ok": True, "updated": count}


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

def _ds_dict(ds, db: Session | None = None):
    labeled = 0
    if db is not None:
        from sqlalchemy import func as sqla_func
        labeled = (
            db.query(sqla_func.count(Image.id))
            .filter(
                Image.dataset_id == ds.id,
                db.query(Annotation).filter(Annotation.image_id == Image.id).exists(),
            )
            .scalar()
        ) or 0
    return {
        "id": ds.id,
        "name": ds.name,
        "description": ds.description,
        "task_type": ds.task_type,
        "label_classes": ds.label_classes,
        "image_count": ds.image_count,
        "annotation_count": ds.annotation_count,
        "labeled_image_count": labeled,
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
    }


def _img_dict(img):
    rel = f"/static/datasets/{img.dataset_id}/images/{img.filename}"
    ann_count = len(img.annotations) if img.annotations is not None else 0
    return {
        "id": img.id,
        "dataset_id": img.dataset_id,
        "filename": img.filename,
        "url": rel,
        "width": img.width,
        "height": img.height,
        "is_augmented": img.is_augmented,
        "split": getattr(img, "split", None),
        "annotation_count": ann_count,
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
        "review_status": a.review_status,
        "review_comment": a.review_comment,
    }
