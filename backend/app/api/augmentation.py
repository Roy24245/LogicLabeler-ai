"""Augmentation API — Data augmentation endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Dataset, Image
from app.services import augmentation as aug_svc
from app.services import dataset_service as ds_svc

router = APIRouter(tags=["augmentation"])


class AugmentationRequest(BaseModel):
    dataset_id: int
    variation_types: list[str] = ["angle_change"]
    image_ids: list[int] | None = None


@router.post("/augmentation/run")
def run_augmentation(body: AugmentationRequest, db: Session = Depends(get_db)):
    if not aug_svc.is_enabled():
        raise HTTPException(400, "Augmentation is disabled in settings")

    ds = ds_svc.get_dataset(db, body.dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")

    if body.image_ids:
        images = db.query(Image).filter(Image.id.in_(body.image_ids)).all()
    else:
        images = db.query(Image).filter(
            Image.dataset_id == body.dataset_id,
            Image.is_augmented == False,
        ).limit(50).all()

    if not images:
        raise HTTPException(400, "No images to augment")

    output_dir = str(settings.datasets_dir / str(body.dataset_id) / "images")
    results = aug_svc.batch_augment(
        [img.filepath for img in images],
        body.variation_types,
        output_dir,
    )

    created = 0
    for r in results:
        if r.get("success"):
            aug_img = Image(
                dataset_id=body.dataset_id,
                filename=r["output_filename"],
                filepath=r["output_path"],
                width=0,
                height=0,
                is_augmented=True,
            )
            db.add(aug_img)
            created += 1

    if created:
        ds.image_count = db.query(Image).filter(Image.dataset_id == body.dataset_id).count() + created
        db.commit()

    return {
        "total_requested": len(images) * len(body.variation_types),
        "successfully_created": created,
        "results": results,
    }


@router.get("/augmentation/types")
def get_augmentation_types():
    return aug_svc.get_variation_types()


@router.get("/augmentation/status")
def get_augmentation_status():
    return {"enabled": aug_svc.is_enabled()}
