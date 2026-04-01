"""Critic Agent — Quality control and adversarial validation.

Uses Qwen3.5-Plus Vision to verify detections by cropping candidate regions
and performing secondary semantic checks. Also runs geometric logic validation.
"""
from __future__ import annotations

import json
import logging
from io import BytesIO
from pathlib import Path
from typing import Any

import dashscope
from dashscope import MultiModalConversation
from PIL import Image as PILImage

from app.config import settings
from app.core.geometry import iou, contains, is_wearing, is_holding, is_near, is_above

logger = logging.getLogger(__name__)

LOGIC_FUNCTIONS = {
    "iou": iou,
    "contains": contains,
    "is_wearing": is_wearing,
    "is_holding": is_holding,
    "is_near": is_near,
    "is_above": is_above,
}


def validate_detections(
    image_path: str,
    detections: list[dict[str, Any]],
    logic_rules: list[dict],
    targets: list[str],
) -> list[dict[str, Any]]:
    """Validate detections through geometric logic and VLM verification.

    Returns filtered and enriched detections with validation results.
    """
    if not detections:
        return []

    validated = _geometric_validation(detections, logic_rules, targets)

    low_confidence = [d for d in validated if d.get("confidence", 0) < 0.5]
    if low_confidence:
        validated = _vlm_verification(image_path, validated, low_confidence)

    return validated


def _geometric_validation(
    detections: list[dict[str, Any]],
    logic_rules: list[dict],
    targets: list[str],
) -> list[dict[str, Any]]:
    """Apply Commander's geometric logic rules to filter/relabel detections."""
    if not logic_rules:
        return detections

    by_class: dict[str, list[dict]] = {}
    for d in detections:
        cls = d["class_name"]
        by_class.setdefault(cls, []).append(d)

    results = list(detections)

    for rule in logic_rules:
        func_name = rule.get("function", "none")
        if func_name == "none" or func_name not in LOGIC_FUNCTIONS:
            continue

        func = LOGIC_FUNCTIONS[func_name]
        args = rule.get("args", [])
        threshold = rule.get("threshold", 0.3)
        negate = rule.get("negate", False)
        output_label = rule.get("output_label", "")

        if len(args) < 2:
            continue

        class_a = args[0]
        class_b = args[1]
        group_a = by_class.get(class_a, [])
        group_b = by_class.get(class_b, [])

        for det_a in group_a:
            bbox_a = det_a.get("bbox", {})
            matched = False
            for det_b in group_b:
                bbox_b = det_b.get("bbox", {})
                try:
                    if func_name in ("iou", "is_near"):
                        val = func(bbox_a, bbox_b)
                        check = val > threshold
                    elif func_name in ("is_wearing", "is_holding"):
                        check = func(bbox_a, bbox_b, threshold)
                    else:
                        check = func(bbox_a, bbox_b)
                except Exception:
                    check = False

                if check:
                    matched = True
                    break

            should_label = (not matched) if negate else matched
            if should_label and output_label:
                new_det = dict(det_a)
                new_det["class_name"] = output_label
                new_det["source"] = "critic_logic"
                results.append(new_det)

    return results


def _vlm_verification(
    image_path: str,
    all_detections: list[dict[str, Any]],
    to_verify: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Use Qwen VL to verify low-confidence detections by cropping regions."""
    dashscope.api_key = settings.dashscope_api_key

    try:
        pil_img = PILImage.open(image_path)
    except Exception:
        return all_detections

    verified = set()
    rejected = set()

    for i, det in enumerate(to_verify):
        bbox = det.get("bbox", {})
        x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)

        pad = 10
        crop = pil_img.crop((
            max(0, x - pad),
            max(0, y - pad),
            min(pil_img.width, x + w + pad),
            min(pil_img.height, y + h + pad),
        ))

        buf = BytesIO()
        crop.save(buf, format="JPEG")
        buf.seek(0)

        import base64
        b64 = base64.b64encode(buf.read()).decode()
        data_uri = f"data:image/jpeg;base64,{b64}"

        cls_name = det.get("class_name", "object")
        prompt = (
            f"Is there a '{cls_name}' in this image? "
            f"Reply with JSON: "
            f'{{"is_present": true/false, "confidence": 0.0-1.0, "reason": "brief reason"}}'
        )

        try:
            response = MultiModalConversation.call(
                model="qwen-vl-plus",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"image": data_uri},
                            {"text": prompt},
                        ],
                    }
                ],
                temperature=0.1,
            )

            if response.status_code == 200:
                text = response.output.choices[0].message.content
                if isinstance(text, list):
                    text = text[0].get("text", "")
                result = _parse_verification(text)
                if result.get("is_present", True):
                    verified.add(id(det))
                    det["confidence"] = max(det.get("confidence", 0), result.get("confidence", 0.6))
                    det["source"] = "critic_verified"
                else:
                    rejected.add(id(det))
        except Exception as e:
            logger.warning("VLM verification failed for detection: %s", e)

    return [d for d in all_detections if id(d) not in rejected]


def _parse_verification(text: str) -> dict:
    try:
        if "```json" in text:
            text = text.split("```json")[1]
        if "```" in text:
            text = text.split("```")[0]
        return json.loads(text.strip())
    except Exception:
        lower = text.lower()
        return {"is_present": "true" in lower or "yes" in lower, "confidence": 0.5}
