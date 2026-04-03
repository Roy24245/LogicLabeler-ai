"""Augmentation API — Data augmentation endpoints."""
from __future__ import annotations

import logging
import threading
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, SessionLocal
from app.models import Dataset, Image
from app.services import augmentation as aug_svc
from app.services import dataset_service as ds_svc

router = APIRouter(tags=["augmentation"])
logger = logging.getLogger(__name__)

_aug_jobs: dict[int, dict] = {}
_aug_job_counter = 0
_job_lock = threading.Lock()


class AugmentationRequest(BaseModel):
    dataset_id: int
    variation_types: list[str] = ["angle_change"]
    image_ids: list[int] | None = None


def _run_augmentation_bg(job_id: int, dataset_id: int, image_filepaths: list[str], variation_types: list[str], output_dir: str):
    """Background worker for augmentation tasks."""
    job = _aug_jobs[job_id]
    job["status"] = "running"
    total = len(image_filepaths) * len(variation_types)
    job["total"] = total

    try:
        results = aug_svc.batch_augment(image_filepaths, variation_types, output_dir)
        db = SessionLocal()
        try:
            created = 0
            for r in results:
                if r.get("success"):
                    aug_img = Image(
                        dataset_id=dataset_id,
                        filename=r["output_filename"],
                        filepath=r["output_path"],
                        width=0,
                        height=0,
                        is_augmented=True,
                    )
                    db.add(aug_img)
                    created += 1

            if created:
                ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
                if ds:
                    ds.image_count = db.query(Image).filter(Image.dataset_id == dataset_id).count() + created
                db.commit()

            job["successfully_created"] = created
            job["results"] = results
            job["status"] = "completed"
            logger.info("Augmentation job %d completed: %d/%d succeeded", job_id, created, total)
        finally:
            db.close()
    except Exception as e:
        logger.exception("Augmentation job %d failed: %s", job_id, e)
        job["status"] = "failed"
        job["error"] = str(e)


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

    image_filepaths = [img.filepath for img in images]
    output_dir = str(settings.datasets_dir / str(body.dataset_id) / "images")
    total = len(images) * len(body.variation_types)

    global _aug_job_counter
    with _job_lock:
        _aug_job_counter += 1
        job_id = _aug_job_counter

    _aug_jobs[job_id] = {
        "id": job_id,
        "dataset_id": body.dataset_id,
        "status": "pending",
        "total": total,
        "successfully_created": 0,
        "results": [],
        "error": None,
    }

    thread = threading.Thread(
        target=_run_augmentation_bg,
        args=(job_id, body.dataset_id, image_filepaths, body.variation_types, output_dir),
        daemon=True,
    )
    thread.start()

    return {
        "job_id": job_id,
        "total_requested": total,
        "status": "pending",
        "message": f"增強任務已提交，共 {total} 個任務，每個任務間隔 {aug_svc.REQUEST_INTERVAL} 秒以避免速率限制",
    }


@router.get("/augmentation/jobs/{job_id}")
def get_augmentation_job(job_id: int):
    job = _aug_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Augmentation job not found")
    done = len(job.get("results", []))
    return {
        "id": job["id"],
        "status": job["status"],
        "total": job["total"],
        "processed": done,
        "successfully_created": job["successfully_created"],
        "error": job.get("error"),
    }


@router.get("/augmentation/types")
def get_augmentation_types():
    return aug_svc.get_variation_types()


@router.get("/augmentation/status")
def get_augmentation_status():
    return {"enabled": aug_svc.is_enabled()}
