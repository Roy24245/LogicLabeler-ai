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
    examples: dict[str, list[str]] | None = None,
    open_vocabulary: bool = False,
) -> list[dict[str, Any]]:
    """Run object detection on an image, return list of detections.

    Each detection: {"class_name": str, "bbox": {x,y,w,h}, "confidence": float}

    Args:
        targets: top-level class names to detect (e.g. ["cat", "dog"]).
        detection_prompts: per-target hints for the detector.
        examples: optional fine-grained example sub-types per target. When
            ``open_vocabulary`` is true the detector is told to use real
            breeds/types, with these as hints only (not an exclusive list).
        open_vocabulary: if true, the detector may emit any specific class
            name (e.g. "Persian", "Tabby") rather than only the strings in
            ``targets``.
    """
    mode = mode or settings.soldier_mode
    examples = examples or {}
    if mode == "grounded_sam":
        return _detect_grounded_sam(
            image_path,
            targets,
            detection_prompts,
            examples=examples,
            open_vocabulary=open_vocabulary,
        )
    else:
        return _detect_qwen_vision(
            image_path,
            targets,
            detection_prompts,
            examples=examples,
            open_vocabulary=open_vocabulary,
        )


# ── Qwen Vision API ─────────────────────────────────────────────────

def _detect_qwen_vision(
    image_path: str,
    targets: list[str],
    detection_prompts: dict[str, str],
    *,
    examples: dict[str, list[str]] | None = None,
    open_vocabulary: bool = False,
) -> list[dict[str, Any]]:
    """Run vision detection via the configured vision provider."""
    examples = examples or {}

    prompt_text = (
        "你是一個精確的目標檢測助手。請在這張圖片中找出符合下列描述的所有物體實例，"
        "並為每個物體返回邊界框與類別名。\n\n"
    )

    target_lines: list[str] = []
    for t in targets:
        line = f"- **{t}**"
        hint = detection_prompts.get(t)
        if hint and hint.strip() and hint.strip() != t:
            line += f"：{hint.strip()}"
        ex = examples.get(t) or []
        if ex:
            joined = "、".join(str(e) for e in ex)
            if open_vocabulary:
                line += (
                    f"\n  常見子型/品種範例（僅供參考、**不限於**這些）：{joined}"
                )
            else:
                line += f"\n  允許的子型：{joined}"
        target_lines.append(line)
    prompt_text += "需要檢測的主類別：\n" + "\n".join(target_lines) + "\n\n"

    if open_vocabulary:
        prompt_text += (
            "**重要規則（開放詞彙模式）**：\n"
            "1. 對每一個檢測到的物體，`class_name` 必須是該物體在現實中**最具體的細粒度類別**。\n"
            "   例如：屬於 cat 主類別的個體，class_name 應寫實際品種——British Shorthair、"
            "Persian、Ragdoll、Tabby、Maine Coon、Mixed 等等；屬於 dog 的寫實際犬種；"
            "屬於 vehicle 的寫實際車型。\n"
            "2. **不要被列出的範例品種限制**：圖中只要屬於對應主類別的個體，無論是否在範例清單裡，都必須輸出。\n"
            "3. 若不能 100% 確定品種，請使用最具體的近似類別並在 class_name 末尾附加 ' (uncertain)' 標記，"
            "**仍然要輸出該物件**，不可漏掉。\n"
            "4. 若完全無法判斷品種，使用 `\"<主類別> (unknown breed)\"` 例如 `\"cat (unknown breed)\"`。\n"
            "5. 一張圖中如有多個個體，逐一輸出，不可合併或省略。\n"
            "6. 不要把屬於主類別但品種不在範例中的物件硬塞進範例品種——保持誠實。\n\n"
        )
    else:
        prompt_text += (
            "**規則（封閉類別模式）**：\n"
            f"1. `class_name` 必須是上述主類別之一：{', '.join(targets)}。\n"
            "2. 不要輸出未列出的類別。\n"
            "3. 一張圖中如有多個個體，逐一輸出。\n\n"
        )

    prompt_text += (
        "請嚴格以 JSON 數組格式返回結果，每個元素包含：\n"
        '{"class_name": "細粒度類別名", "bbox": [x1, y1, x2, y2], "confidence": 0.0-1.0}\n'
        "其中 bbox 使用像素坐標（左上角為原點）。\n"
        "如果沒有找到任何符合的目標，返回空數組 []。\n"
        "只返回 JSON，不要附加任何解釋文字。"
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
            role="soldier",
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
    *,
    examples: dict[str, list[str]] | None = None,
    open_vocabulary: bool = False,
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

        prompt_parts = list(detection_prompts.values())
        if examples:
            for t, exs in examples.items():
                if exs:
                    prompt_parts.append(f"{t}: " + ", ".join(str(e) for e in exs))
        text_prompt = ". ".join(p for p in prompt_parts if p) + "."

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
        return _detect_qwen_vision(
            image_path,
            targets,
            detection_prompts,
            examples=examples,
            open_vocabulary=open_vocabulary,
        )
    except Exception as e:
        logger.exception("Grounded-SAM failed: %s", e)
        return []


def _match_target(phrase: str, targets: list[str]) -> str:
    phrase_lower = phrase.lower()
    for t in targets:
        if t.lower() in phrase_lower or phrase_lower in t.lower():
            return t
    return phrase
