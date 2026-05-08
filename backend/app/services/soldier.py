"""Soldier Agent — Visual detection & segmentation.

Supports two modes:
  A) Local Grounded-SAM  (groundingdino + SAM)
  B) Vision API (Qwen-VL via DashScope, OpenAI GPT-4o, Anthropic Claude, ...)
     — actual model is determined by the active vision provider.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import settings
from app.services import model_providers as mp

logger = logging.getLogger(__name__)


def detect_objects(
    image_path: str,
    targets: list[str],
    detection_prompts: dict[str, str],
    mode: str | None = None,
) -> list[dict[str, Any]]:
    """Run object detection on an image, return list of detections.

    Each detection: {"class_name": str, "bbox": {x,y,w,h}, "confidence": float}
    """
    mode = mode or settings.soldier_mode
    if mode == "grounded_sam":
        return _detect_grounded_sam(image_path, targets, detection_prompts)
    else:
        return _detect_qwen_vision(image_path, targets, detection_prompts)


# ── Qwen Vision API ─────────────────────────────────────────────────

def _detect_qwen_vision(
    image_path: str,
    targets: list[str],
    detection_prompts: dict[str, str],
) -> list[dict[str, Any]]:
    """Run vision detection via the configured vision provider."""
    prompt_text = (
        "你是一個精確的目標檢測助手。請在這張圖片中找出以下所有目標物體，"
        "並為每個檢測到的物體返回邊界框。\n\n"
        f"需要檢測的目標: {', '.join(targets)}\n\n"
    )
    for t, p in detection_prompts.items():
        prompt_text += f"- {t}: {p}\n"
    prompt_text += (
        "\n請嚴格以 JSON 數組格式返回結果，每個元素包含：\n"
        '{"class_name": "類別名", "bbox": [x1, y1, x2, y2], "confidence": 0.0-1.0}\n'
        "其中 bbox 使用像素坐標（左上角為原點）。"
        "如果沒有找到任何目標，返回空數組 []。"
    )

    try:
        data_url = mp.encode_image_to_data_url(image_path)
        text = mp.vision_complete(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": prompt_text},
                    ],
                }
            ],
            temperature=0.1,
        )
        return _parse_detections(text, image_path)

    except Exception as e:
        logger.exception("Soldier (Vision) failed: %s", e)
        return []


def _parse_detections(text: str, image_path: str) -> list[dict[str, Any]]:
    """Parse JSON array of detections from model response."""
    if "```json" in text:
        text = text.split("```json")[1]
    if "```" in text:
        text = text.split("```")[0]
    text = text.strip()

    match = re.search(r'\[.*\]', text, re.DOTALL)
    if not match:
        return []

    try:
        items = json.loads(match.group())
    except json.JSONDecodeError:
        return []

    results = []
    for item in items:
        bbox_raw = item.get("bbox", [0, 0, 0, 0])
        if len(bbox_raw) == 4:
            x1, y1, x2, y2 = bbox_raw
            results.append({
                "class_name": item.get("class_name", "unknown"),
                "bbox": {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1},
                "confidence": float(item.get("confidence", 0.5)),
            })
    return results


# ── Grounded-SAM (local) ────────────────────────────────────────────

def _detect_grounded_sam(
    image_path: str,
    targets: list[str],
    detection_prompts: dict[str, str],
) -> list[dict[str, Any]]:
    """Local Grounded-SAM detection.

    Requires `groundingdino` and `segment_anything` to be installed
    and model weights to be available.
    """
    try:
        from groundingdino.util.inference import load_model, predict
        import cv2
        import torch

        GROUNDING_DINO_CONFIG = "GroundingDINO/groundingdino/config/GroundingDINO_SwinT_OGC.py"
        GROUNDING_DINO_CHECKPOINT = "weights/groundingdino_swint_ogc.pth"

        model = load_model(GROUNDING_DINO_CONFIG, GROUNDING_DINO_CHECKPOINT)
        image = cv2.imread(image_path)
        h_img, w_img = image.shape[:2]

        text_prompt = ". ".join(detection_prompts.values()) + "."

        boxes, logits, phrases = predict(
            model=model,
            image=image,
            caption=text_prompt,
            box_threshold=0.3,
            text_threshold=0.25,
        )

        results = []
        for box, logit, phrase in zip(boxes, logits, phrases):
            cx, cy, w, h = box.tolist()
            x1 = (cx - w / 2) * w_img
            y1 = (cy - h / 2) * h_img
            bw = w * w_img
            bh = h * h_img

            cls = _match_target(phrase, targets)
            results.append({
                "class_name": cls,
                "bbox": {"x": x1, "y": y1, "w": bw, "h": bh},
                "confidence": float(logit),
            })
        return results

    except ImportError:
        logger.warning(
            "Grounded-SAM not installed. Falling back to Qwen Vision."
        )
        return _detect_qwen_vision(image_path, targets, detection_prompts)
    except Exception as e:
        logger.exception("Grounded-SAM failed: %s", e)
        return []


def _match_target(phrase: str, targets: list[str]) -> str:
    phrase_lower = phrase.lower()
    for t in targets:
        if t.lower() in phrase_lower or phrase_lower in t.lower():
            return t
    return phrase
