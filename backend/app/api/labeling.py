"""Labeling API — Auto-labeling pipeline orchestration.

Chains Commander -> Soldier -> Critic -> RAG in a complete flow.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
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
from app.services import model_providers as mp

logger = logging.getLogger(__name__)

router = APIRouter(tags=["labeling"])

_job_logs: dict[int, list[str]] = {}
_log_subscribers: dict[int, list[asyncio.Queue]] = {}
_job_current_image: dict[int, dict | None] = {}


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


class OptimizePromptRequest(BaseModel):
    instruction: str


OPTIMIZER_SYSTEM_PROMPT = """你是一個目標檢測標註提示詞 (prompt) 改寫專家。
使用者會提供一段「標註指令」，你需要產出**恰好 3 個**經過優化的版本，每個版本從不同角度改進原指令：

1. **更精確 (more_specific)**：補充明確的物體外觀、屬性、上下文細節，讓檢測模型能精準辨識目標。
2. **加入邏輯 (with_logic)**：加入空間/邏輯條件 (例如「未戴」、「包含」、「靠近」、「位於…之上」)、排除條件、邊界情境，讓多智能體 (Commander) 能拆解出邏輯規則。
3. **更簡潔 (more_concise)**：保留核心目標但去除冗餘文字，盡量簡短無歧義，適合快速指令。

要求：
- 三個版本都必須保留原指令的核心目標。
- 三個版本內容必須**明顯不同**，不要互相重複。
- 使用與原指令相同的語言（使用者用中文則用中文，使用英文則用英文）。
- 每個版本長度不超過 300 字。
- 不要加入額外解釋或前綴。

嚴格以下列 JSON 格式輸出（不要 markdown 程式碼區塊以外的任何文字）：
```json
{
  "suggestions": [
    {"label": "more_specific", "text": "..."},
    {"label": "with_logic", "text": "..."},
    {"label": "more_concise", "text": "..."}
  ]
}
```"""

LABEL_TO_TITLE = {
    "more_specific": "更精確",
    "with_logic": "加入邏輯",
    "more_concise": "更簡潔",
}


def _extract_json_block(text: str) -> str:
    if "```json" in text:
        text = text.split("```json", 1)[1]
        if "```" in text:
            text = text.split("```", 1)[0]
    elif "```" in text:
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
    return text.strip()


def _parse_optimizer_output(text: str, instruction: str) -> list[dict[str, str]]:
    """Parse LLM output into a list of {label, title, text} suggestions (length 3)."""
    raw = _extract_json_block(text)
    suggestions: list[dict[str, str]] = []
    try:
        data = json.loads(raw)
        items = data.get("suggestions") if isinstance(data, dict) else None
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict) and it.get("text"):
                    label = it.get("label") or ""
                    suggestions.append({
                        "label": label,
                        "title": LABEL_TO_TITLE.get(label, label or "建議"),
                        "text": str(it["text"]).strip(),
                    })
                elif isinstance(it, str):
                    suggestions.append({"label": "", "title": "建議", "text": it.strip()})
    except json.JSONDecodeError:
        # Fallback: split by numbered list / bullet markers.
        chunks = re.split(r"\n\s*(?:\d+[\.\)]|[-*])\s+", text.strip())
        chunks = [c.strip() for c in chunks if c.strip()]
        for c in chunks[:3]:
            suggestions.append({"label": "", "title": "建議", "text": c})

    seen = set()
    deduped: list[dict[str, str]] = []
    for s in suggestions:
        if s["text"] and s["text"] not in seen:
            deduped.append(s)
            seen.add(s["text"])

    while len(deduped) < 3:
        idx = len(deduped)
        fallback_titles = ["更精確", "加入邏輯", "更簡潔"]
        fallback_labels = ["more_specific", "with_logic", "more_concise"]
        deduped.append({
            "label": fallback_labels[idx],
            "title": fallback_titles[idx],
            "text": instruction.strip(),
        })

    return deduped[:3]


@router.post("/labeling/optimize-prompt")
def optimize_prompt(body: OptimizePromptRequest):
    instruction = (body.instruction or "").strip()
    if not instruction:
        raise HTTPException(400, "instruction is empty")

    try:
        text = mp.text_complete(
            messages=[
                {"role": "system", "content": OPTIMIZER_SYSTEM_PROMPT},
                {"role": "user", "content": instruction},
            ],
            temperature=0.7,
            max_tokens=1200,
        )
    except Exception as e:
        logger.exception("Prompt optimizer call failed: %s", e)
        raise HTTPException(502, f"模型呼叫失敗: {e}")

    suggestions = _parse_optimizer_output(text, instruction)
    return {"suggestions": suggestions}


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
    _job_current_image[job.id] = None

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
        "current_image": _job_current_image.get(job.id),
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
        mp.reload_active_models()
        job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
        if not job:
            return

        _log(job_id, "=== LogicLabeler Auto-Labeling Pipeline ===")
        _log(job_id, f"Instruction: {request.instruction}")
        commander_model = mp.describe_active_model("text")
        soldier_model = mp.describe_active_model("soldier")
        critic_model = mp.describe_active_model("vision")
        _log(
            job_id,
            "[Model] Commander: "
            f"{commander_model['provider_name']} / {commander_model['model']}",
        )
        _log(
            job_id,
            "[Model] Soldier: "
            f"{soldier_model['provider_name']} / {soldier_model['model']}",
        )
        _log(
            job_id,
            "[Model] Critic/Reviewer: "
            f"{critic_model['provider_name']} / {critic_model['model']}",
        )

        # Step 1: Commander — parse instruction
        _log(job_id, f"[Commander] Parsing instruction with {commander_model['model']}...")
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
        _log(job_id, f"[Soldier] Mode: {mode}")

        for idx, img in enumerate(images):
            _log(
                job_id,
                f"\n[Soldier] Processing image {idx + 1}/{len(images)} "
                f"with {soldier_model['model']}: {img.filename}",
            )

            plan_examples = plan.get("examples", {}) or {}
            plan_open_vocab = bool(plan.get("open_vocabulary", False))
            if plan_open_vocab:
                _log(job_id, f"  [Commander] open_vocabulary=ON, examples={list(plan_examples.keys())}")

            if request.use_sahi and (img.width > 1200 or img.height > 1200):
                from app.core.sahi_utils import sahi_detect
                detections = sahi_detect(
                    image_path=img.filepath,
                    detect_fn=lambda p, t, d, examples=None, open_vocabulary=False: soldier.detect_objects(
                        p, t, d, mode,
                        examples=examples,
                        open_vocabulary=open_vocabulary,
                    ),
                    targets=plan.get("targets", []),
                    detection_prompts=plan.get("detection_prompts", {}),
                    image_width=img.width,
                    image_height=img.height,
                    examples=plan_examples,
                    open_vocabulary=plan_open_vocab,
                )
                _log(job_id, f"  [SAHI] Detected {len(detections)} objects (with slicing)")
            else:
                detections = soldier.detect_objects(
                    img.filepath,
                    plan.get("targets", []),
                    plan.get("detection_prompts", {}),
                    mode,
                    examples=plan_examples,
                    open_vocabulary=plan_open_vocab,
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

            _job_current_image[job_id] = {
                "image_id": img.id,
                "filename": img.filename,
                "url": f"/static/datasets/{img.dataset_id}/images/{img.filename}",
                "width": img.width,
                "height": img.height,
                "index": idx + 1,
                "annotations": [
                    {"class_name": d["class_name"], "bbox": d.get("bbox"), "confidence": d.get("confidence")}
                    for d in validated
                ],
            }

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
        _job_current_image.pop(job_id, None)
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
_review_current_image: dict[int, dict | None] = {}


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
    _review_current_image[job.id] = None

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
        "current_image": _review_current_image.get(job.id),
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

            review_annotations = []
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
                review_annotations.append({
                    "class_name": ann.class_name,
                    "bbox": ann.bbox,
                    "confidence": ann.confidence,
                    "review_status": result["review_status"],
                    "review_comment": result.get("review_comment", ""),
                })

            _review_current_image[job_id] = {
                "image_id": img.id,
                "filename": img.filename,
                "url": f"/static/datasets/{img.dataset_id}/images/{img.filename}",
                "width": img.width,
                "height": img.height,
                "index": idx + 1,
                "annotations": review_annotations,
            }

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
        _review_current_image.pop(job_id, None)
        db.close()


def _review_log(job_id: int, msg: str):
    logger.info("[ReviewJob %d] %s", job_id, msg)
    _review_logs.setdefault(job_id, []).append(msg)
