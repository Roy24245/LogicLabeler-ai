"""Augmentation API — Data augmentation with optional auto-labeling."""
from __future__ import annotations

import logging
import threading
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, SessionLocal
from app.models import Annotation, Dataset, Image
from app.services import augmentation as aug_svc
from app.services import commander, soldier, critic, rag_service
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
    auto_label: bool = True
    label_instruction: str = ""


def _job_log(job_id: int, msg: str):
    """Append a log line to the job and emit to logger."""
    logger.info("[AugJob %d] %s", job_id, msg)
    job = _aug_jobs.get(job_id)
    if job:
        job.setdefault("logs", []).append(msg)


def _run_augmentation_bg(
    job_id: int,
    dataset_id: int,
    image_filepaths: list[str],
    variation_types: list[str],
    output_dir: str,
    auto_label: bool,
    label_instruction: str,
):
    """Background worker: augment images, then optionally auto-label new ones."""
    job = _aug_jobs[job_id]
    job["status"] = "augmenting"

    total_aug = len(image_filepaths) * len(variation_types)
    job["total"] = total_aug

    _job_log(job_id, "=== 數據增強任務開始 ===")
    _job_log(job_id, f"源圖片: {len(image_filepaths)} 張 × {len(variation_types)} 種變換 = {total_aug} 個任務")

    new_image_ids: list[int] = []

    try:
        db = SessionLocal()
        try:
            for i, img_path in enumerate(image_filepaths):
                for j, vtype in enumerate(variation_types):
                    idx = i * len(variation_types) + j
                    if idx > 0:
                        time.sleep(aug_svc.REQUEST_INTERVAL)

                    import os
                    src_name = os.path.basename(img_path)
                    _job_log(job_id, f"[增強] ({idx + 1}/{total_aug}) {src_name} → {vtype}")

                    result = aug_svc.generate_variation(img_path, vtype, output_dir=output_dir)
                    result["source_image"] = img_path
                    job.setdefault("results", []).append(result)

                    if result.get("success"):
                        aug_img = Image(
                            dataset_id=dataset_id,
                            filename=result["output_filename"],
                            filepath=result["output_path"],
                            width=0,
                            height=0,
                            is_augmented=True,
                        )
                        db.add(aug_img)
                        db.flush()
                        new_image_ids.append(aug_img.id)
                        job["successfully_created"] = job.get("successfully_created", 0) + 1
                        _job_log(job_id, f"  ✓ 生成成功 → {result['output_filename']}")
                    else:
                        _job_log(job_id, f"  ✗ 生成失敗: {result.get('error', '未知錯誤')}")

            if new_image_ids:
                ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
                if ds:
                    ds.image_count = db.query(Image).filter(Image.dataset_id == dataset_id).count()
                db.commit()

            _job_log(job_id, f"\n增強階段完成: 成功 {len(new_image_ids)}/{total_aug}")

        finally:
            db.close()

        if auto_label and new_image_ids:
            _auto_label_images(job_id, dataset_id, new_image_ids, label_instruction)

        job["status"] = "completed"
        _job_log(job_id, "\n=== 所有任務完成 ===")

    except Exception as e:
        logger.exception("Augmentation job %d failed: %s", job_id, e)
        job["status"] = "failed"
        job["error"] = str(e)
        _job_log(job_id, f"\n[ERROR] 任務失敗: {e}")


def _auto_label_images(job_id: int, dataset_id: int, image_ids: list[int], instruction: str):
    """Run Commander→Soldier→Critic pipeline on newly augmented images."""
    job = _aug_jobs[job_id]
    job["status"] = "labeling"

    _job_log(job_id, "\n=== 自動標註階段開始 ===")

    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        existing_classes = list(ds.label_classes or []) if ds else []

        if instruction:
            _job_log(job_id, f"[Commander] 解析標註指令: {instruction}")
            rag_context = rag_service.retrieve_context(query_text=instruction)
            plan = commander.parse_instruction(instruction, rag_context)
        elif existing_classes:
            auto_instruction = f"請檢測圖片中的以下物件: {', '.join(existing_classes)}"
            _job_log(job_id, f"[Commander] 使用現有類別自動生成指令: {auto_instruction}")
            plan = commander.parse_instruction(auto_instruction, "")
        else:
            _job_log(job_id, "[跳過] 無標註指令且數據集無已知類別，跳過自動標註")
            return

        targets = plan.get("targets", [])
        logic_rules = plan.get("logic_rules", [])
        detection_prompts = plan.get("detection_prompts", {})
        _job_log(job_id, f"[Commander] 目標類別: {targets}")

        mode = settings.soldier_mode
        labeled_count = 0
        total_anns = 0

        for idx, img_id in enumerate(image_ids):
            img = db.query(Image).filter(Image.id == img_id).first()
            if not img:
                continue

            _job_log(job_id, f"\n[Soldier] ({idx + 1}/{len(image_ids)}) 標註 {img.filename}")

            try:
                detections = soldier.detect_objects(
                    img.filepath, targets, detection_prompts, mode
                )
                _job_log(job_id, f"  檢測到 {len(detections)} 個物件")

                validated = critic.validate_detections(
                    img.filepath, detections, logic_rules, targets
                )
                _job_log(job_id, f"  [Critic] {len(validated)} 個通過驗證")

                for det in validated:
                    ann = Annotation(
                        image_id=img.id,
                        class_name=det["class_name"],
                        bbox=det.get("bbox"),
                        confidence=det.get("confidence"),
                        source="auto_augmented",
                    )
                    db.add(ann)
                    total_anns += 1

                if validated:
                    labeled_count += 1

                db.commit()

            except Exception as e:
                _job_log(job_id, f"  [ERROR] 標註失敗: {e}")
                logger.exception("Auto-label failed for image %d: %s", img_id, e)

            time.sleep(1)

        if ds:
            all_classes = set(existing_classes)
            for ann in db.query(Annotation).join(Image).filter(Image.dataset_id == dataset_id).all():
                all_classes.add(ann.class_name)
            ds.label_classes = list(all_classes)
            ds.annotation_count = db.query(Annotation).join(Image).filter(Image.dataset_id == dataset_id).count()
            db.commit()

        job["labeled_count"] = labeled_count
        job["total_annotations"] = total_anns
        _job_log(job_id, f"\n自動標註完成: {labeled_count}/{len(image_ids)} 張圖片, 共 {total_anns} 個標註")

    except Exception as e:
        logger.exception("Auto-labeling failed for job %d: %s", job_id, e)
        _job_log(job_id, f"\n[ERROR] 自動標註階段失敗: {e}")
    finally:
        db.close()


@router.post("/augmentation/run")
def run_augmentation(body: AugmentationRequest, db: Session = Depends(get_db)):
    if not aug_svc.is_enabled():
        raise HTTPException(400, "Augmentation is disabled in settings")

    ds = ds_svc.get_dataset(db, body.dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")

    if body.auto_label and not settings.dashscope_api_key:
        raise HTTPException(400, "自動標註需要 DashScope API Key，請先在設定頁面配置")

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
        "labeled_count": 0,
        "total_annotations": 0,
        "results": [],
        "logs": [],
        "error": None,
        "auto_label": body.auto_label,
    }

    thread = threading.Thread(
        target=_run_augmentation_bg,
        args=(job_id, body.dataset_id, image_filepaths, body.variation_types, output_dir, body.auto_label, body.label_instruction),
        daemon=True,
    )
    thread.start()

    return {
        "job_id": job_id,
        "total_requested": total,
        "status": "pending",
        "message": f"增強任務已提交，共 {total} 個任務" + ("，完成後將自動標註" if body.auto_label else ""),
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
        "successfully_created": job.get("successfully_created", 0),
        "labeled_count": job.get("labeled_count", 0),
        "total_annotations": job.get("total_annotations", 0),
        "auto_label": job.get("auto_label", False),
        "logs": job.get("logs", [])[-100:],
        "error": job.get("error"),
    }


@router.get("/augmentation/types")
def get_augmentation_types():
    return aug_svc.get_variation_types()


@router.get("/augmentation/status")
def get_augmentation_status():
    return {"enabled": aug_svc.is_enabled()}
