"""Reviewer Service — AI-powered annotation quality review.

Uses Qwen VL to verify each annotation by cropping the bbox region and asking
the VLM whether the classification is correct and the bounding box is accurate.
"""
from __future__ import annotations

import base64
import json
import logging
from io import BytesIO
from typing import Any

import dashscope
from dashscope import MultiModalConversation
from PIL import Image as PILImage

from app.config import settings

logger = logging.getLogger(__name__)

REVIEW_PROMPT_TEMPLATE = """請審查這個目標檢測結果:
- 標記類別: {class_name}
- 邊界框在原圖中的位置: x={x:.0f}, y={y:.0f}, w={w:.0f}, h={h:.0f}

請回答以下問題:
1. 裁剪區域中是否確實包含 "{class_name}"？
2. 邊界框是否緊密貼合目標物體？（是否太大、太小、或偏移？）
3. 如果分類錯誤，正確的類別應該是什麼？

請嚴格以 JSON 格式返回結果:
{{"is_correct_class": true或false, "bbox_quality": "good"或"too_large"或"too_small"或"offset"或"wrong", "confidence": 0.0到1.0, "reason": "簡要說明", "suggested_class": null或"正確類別名"}}"""


def review_single_annotation(
    pil_img: PILImage.Image,
    annotation: dict[str, Any],
) -> dict[str, Any]:
    """Review a single annotation against its image region."""
    bbox = annotation.get("bbox", {})
    x = bbox.get("x", 0)
    y = bbox.get("y", 0)
    w = bbox.get("w", 0)
    h = bbox.get("h", 0)
    class_name = annotation.get("class_name", "object")

    pad = max(int(min(w, h) * 0.15), 10)
    crop = pil_img.crop((
        max(0, x - pad),
        max(0, y - pad),
        min(pil_img.width, x + w + pad),
        min(pil_img.height, y + h + pad),
    ))

    buf = BytesIO()
    crop.save(buf, format="JPEG")
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    data_uri = f"data:image/jpeg;base64,{b64}"

    prompt = REVIEW_PROMPT_TEMPLATE.format(class_name=class_name, x=x, y=y, w=w, h=h)

    try:
        response = MultiModalConversation.call(
            model="qwen-vl-plus",
            messages=[{"role": "user", "content": [{"image": data_uri}, {"text": prompt}]}],
            temperature=0.1,
        )
        if response.status_code != 200:
            logger.error("Review VLM error: %s", response)
            return _default_result(annotation)

        text = response.output.choices[0].message.content
        if isinstance(text, list):
            text = text[0].get("text", "")
        return _parse_review_result(text, annotation)

    except Exception as e:
        logger.warning("Review failed for annotation %s: %s", annotation.get("id"), e)
        return _default_result(annotation)


def review_image_annotations(
    image_path: str,
    annotations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Review all annotations on a single image."""
    dashscope.api_key = settings.dashscope_api_key

    try:
        pil_img = PILImage.open(image_path)
    except Exception as e:
        logger.error("Failed to open image %s: %s", image_path, e)
        return [_default_result(a) for a in annotations]

    results = []
    for ann in annotations:
        if not ann.get("bbox"):
            results.append(_default_result(ann))
            continue
        result = review_single_annotation(pil_img, ann)
        results.append(result)

    return results


def _parse_review_result(text: str, annotation: dict) -> dict[str, Any]:
    if "```json" in text:
        text = text.split("```json")[1]
    if "```" in text:
        text = text.split("```")[0]
    text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return _default_result(annotation)

    is_correct = parsed.get("is_correct_class", True)
    bbox_quality = parsed.get("bbox_quality", "good")
    confidence = float(parsed.get("confidence", 0.5))
    reason = parsed.get("reason", "")
    suggested_class = parsed.get("suggested_class")

    if is_correct and bbox_quality == "good" and confidence >= 0.6:
        status = "approved"
    elif not is_correct or bbox_quality == "wrong":
        status = "rejected"
    else:
        status = "needs_adjustment"

    comment_parts = []
    if reason:
        comment_parts.append(reason)
    if bbox_quality != "good":
        comment_parts.append(f"框質量: {bbox_quality}")
    if suggested_class:
        comment_parts.append(f"建議類別: {suggested_class}")

    return {
        "annotation_id": annotation.get("id"),
        "review_status": status,
        "review_comment": " | ".join(comment_parts) if comment_parts else None,
        "suggested_class": suggested_class,
        "confidence": confidence,
    }


def _default_result(annotation: dict) -> dict[str, Any]:
    return {
        "annotation_id": annotation.get("id"),
        "review_status": "approved",
        "review_comment": None,
        "suggested_class": None,
        "confidence": 0.5,
    }
