"""Training API — YOLO model training management."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Annotation, Image, TrainingJob
from app.services import training_service as svc
from app.services import preprocessing as preproc

router = APIRouter(tags=["training"])
logger = logging.getLogger(__name__)


class PreprocessingConfig(BaseModel):
    preprocessing: dict = {}
    augmentations: list[str] = []


class TrainingStart(BaseModel):
    dataset_id: int
    model_type: str = "yolov8n"
    epochs: int = 100
    batch_size: int = 16
    img_size: int = 640
    preprocess: PreprocessingConfig | None = None


@router.post("/training/start")
def start_training(body: TrainingStart, db: Session = Depends(get_db)):
    job = TrainingJob(
        dataset_id=body.dataset_id,
        model_type=body.model_type,
        epochs=body.epochs,
        batch_size=body.batch_size,
        img_size=body.img_size,
        status="preparing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    if body.preprocess and body.preprocess.augmentations:
        logger.info("Applying %d augmentations before training job %d", len(body.preprocess.augmentations), job.id)
        _apply_augmentations_to_dataset(db, body.dataset_id, body.preprocess.augmentations)

    try:
        job = svc.start_training(db, job)
    except Exception as e:
        job.status = "failed"
        db.commit()
        raise HTTPException(500, f"Failed to start training: {e}")

    return _job_dict(job)


def _apply_augmentations_to_dataset(db: Session, dataset_id: int, transforms: list[str]):
    """Apply local augmentations to all images in a dataset, creating new images+annotations."""
    from app.config import settings
    images = db.query(Image).filter(Image.dataset_id == dataset_id).all()
    output_dir = str(settings.datasets_dir / str(dataset_id) / "images")
    created = 0
    for img in images:
        anns = db.query(Annotation).filter(Annotation.image_id == img.id).all()
        bboxes = []
        for a in anns:
            if a.bbox:
                bboxes.append({**a.bbox, "_class_name": a.class_name, "_confidence": a.confidence, "_source": a.source})
        results = preproc.apply_transforms(img.filepath, bboxes, transforms, output_dir)
        for r in results:
            new_img = Image(
                dataset_id=dataset_id,
                filename=r["filename"],
                filepath=r["filepath"],
                width=r["width"],
                height=r["height"],
                is_augmented=True,
            )
            db.add(new_img)
            db.flush()
            for bb in r["bboxes"]:
                ann = Annotation(
                    image_id=new_img.id,
                    class_name=bb.get("_class_name", "unknown"),
                    bbox={"x": bb["x"], "y": bb["y"], "w": bb["w"], "h": bb["h"]},
                    confidence=bb.get("_confidence"),
                    source="augmented_local",
                )
                db.add(ann)
            created += 1
    db.commit()
    logger.info("Local augmentation created %d new images for dataset %d", created, dataset_id)


@router.get("/preprocessing/transforms")
def list_transforms():
    return {
        "augmentations": preproc.get_available_transforms(),
        "preprocessing": preproc.get_available_preprocessing(),
    }


@router.get("/training/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(TrainingJob).order_by(TrainingJob.created_at.desc()).all()
    return [_job_dict(j) for j in jobs]


@router.get("/training/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    status = svc.get_job_status(db, job_id)
    if not status:
        raise HTTPException(404, "Job not found")
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    return _job_dict(job)


@router.post("/training/jobs/{job_id}/stop")
def stop_job(job_id: int, db: Session = Depends(get_db)):
    if svc.stop_training(job_id):
        job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
        if job:
            job.status = "stopped"
            db.commit()
        return {"ok": True}
    raise HTTPException(400, "Job not running or not found")


@router.post("/training/jobs/{job_id}/resume")
def resume_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status not in ("stopped", "failed"):
        raise HTTPException(400, f"Cannot resume job with status '{job.status}'")
    try:
        job = svc.resume_training(db, job)
    except Exception as e:
        raise HTTPException(500, f"Failed to resume training: {e}")
    return _job_dict(job)


@router.post("/training/jobs/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    svc.cancel_training(job_id)
    job.status = "cancelled"
    db.commit()
    return {"ok": True}


@router.delete("/training/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status == "running":
        svc.cancel_training(job_id)
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.get("/training/jobs/{job_id}/metrics")
def get_metrics(job_id: int, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    metrics = svc.parse_results_csv(job.run_dir)
    return metrics


@router.get("/training/jobs/{job_id}/artifacts")
def get_artifacts(job_id: int, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return svc.get_training_artifacts(job.run_dir)


@router.get("/training/jobs/{job_id}/artifacts/{artifact_path:path}")
def get_artifact_file(job_id: int, artifact_path: str, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job or not job.run_dir:
        raise HTTPException(404, "Job not found")
    full_path = Path(job.run_dir) / artifact_path
    if not full_path.exists():
        raise HTTPException(404, "Artifact not found")
    return FileResponse(str(full_path))


@router.get("/training/jobs/{job_id}/log")
def get_log(job_id: int, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job or not job.log_path:
        raise HTTPException(404, "Log not found")
    if not os.path.exists(job.log_path):
        return {"log": ""}
    with open(job.log_path, "r") as f:
        return {"log": f.read()}


def _job_dict(job):
    if not job:
        return {}
    return {
        "id": job.id,
        "dataset_id": job.dataset_id,
        "model_type": job.model_type,
        "status": job.status,
        "epochs": job.epochs,
        "batch_size": job.batch_size,
        "img_size": job.img_size,
        "metrics": job.metrics,
        "log_path": job.log_path,
        "best_model_path": job.best_model_path,
        "run_dir": job.run_dir,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }
