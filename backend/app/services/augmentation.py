"""Augmentation Layer — Synthetic data generation via qwen-image-2.0-pro.

Generates training data variations by modifying non-core attributes
(angle, lighting, weather) while preserving semantic content and annotations.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any

import dashscope
from dashscope import MultiModalConversation

from app.config import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BASE_DELAY = 5.0
REQUEST_INTERVAL = 3.0

VARIATION_PRESETS = {
    "angle_change": "Change the camera viewing angle slightly while keeping the same objects and their positions",
    "lighting_bright": "Make the scene brighter, as if taken during sunny daytime",
    "lighting_dark": "Make the scene darker, as if taken during dusk or in low light conditions",
    "weather_rain": "Add rain effect to the scene while keeping all objects visible",
    "weather_fog": "Add light fog to the scene while keeping all objects recognizable",
    "shadow_change": "Change the shadow directions and intensity as if the light source moved",
}


def is_enabled() -> bool:
    return settings.augmentation_enabled


def _call_with_retry(messages: list, size: str = "1024*1024") -> Any:
    """Call MultiModalConversation with exponential backoff on 429 errors."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = MultiModalConversation.call(
                api_key=settings.dashscope_api_key,
                model="qwen-image-2.0-pro",
                messages=messages,
                result_format="message",
                stream=False,
                watermark=False,
                prompt_extend=True,
                size=size,
            )
            return response
        except Exception as e:
            is_rate_limit = "429" in str(e) or "RateQuota" in str(e) or "Throttling" in str(e)
            if is_rate_limit and attempt < MAX_RETRIES:
                delay = BASE_DELAY * (2 ** attempt)
                logger.warning("Rate limited (attempt %d/%d), retrying in %.1fs...", attempt + 1, MAX_RETRIES, delay)
                time.sleep(delay)
                continue
            raise


def generate_variation(
    image_path: str,
    variation_type: str = "angle_change",
    custom_prompt: str = "",
    output_dir: str | None = None,
) -> dict[str, Any]:
    """Generate a variation of the input image using qwen-image-2.0-pro.

    Returns: {"success": bool, "output_path": str, "variation_type": str}
    """
    if not is_enabled():
        return {"success": False, "error": "Augmentation is disabled"}

    dashscope.api_key = settings.dashscope_api_key

    variation_desc = custom_prompt or VARIATION_PRESETS.get(variation_type, VARIATION_PRESETS["angle_change"])
    prompt = (
        f"Based on the reference image, generate a new version with the following modification: {variation_desc}. "
        "Keep all the main objects, their types, approximate positions and sizes the same. "
        "Only modify the environmental conditions as specified."
    )

    messages = [
        {
            "role": "user",
            "content": [
                {"text": prompt},
            ],
        }
    ]

    if not output_dir:
        output_dir = str(settings.datasets_dir / "augmented")
    os.makedirs(output_dir, exist_ok=True)

    try:
        response = _call_with_retry(messages, size="1024*1024")

        if response.status_code != 200:
            logger.error("Image generation error: code=%s message=%s", response.code, response.message)
            return {"success": False, "error": f"API error: {response.code} - {response.message}"}

        output_filename = f"aug_{variation_type}_{uuid.uuid4().hex[:8]}.png"
        output_path = os.path.join(output_dir, output_filename)

        choices = response.output.get("choices", [])
        if choices:
            content = choices[0].get("message", {}).get("content", [])
            for item in content:
                if "image" in item:
                    image_url = item["image"]
                    import httpx
                    img_resp = httpx.get(image_url, timeout=60)
                    with open(output_path, "wb") as f:
                        f.write(img_resp.content)
                    logger.info("Generated image saved: %s", output_path)
                    return {
                        "success": True,
                        "output_path": output_path,
                        "output_filename": output_filename,
                        "variation_type": variation_type,
                    }

        logger.warning("No image in API response: %s", response)
        return {"success": False, "error": "No image in API response"}

    except Exception as e:
        logger.exception("Augmentation failed: %s", e)
        return {"success": False, "error": str(e)}


def batch_augment(
    image_paths: list[str],
    variation_types: list[str],
    output_dir: str,
) -> list[dict[str, Any]]:
    """Generate multiple variations for a batch of images with rate-limit-safe pacing."""
    results = []
    total = len(image_paths) * len(variation_types)
    done = 0
    for img_path in image_paths:
        for vtype in variation_types:
            if done > 0:
                time.sleep(REQUEST_INTERVAL)
            result = generate_variation(img_path, vtype, output_dir=output_dir)
            result["source_image"] = img_path
            results.append(result)
            done += 1
            logger.info("Augmentation progress: %d/%d (last: %s)", done, total, "ok" if result.get("success") else "fail")
    return results


def get_variation_types() -> list[dict[str, str]]:
    """Return available variation presets."""
    return [
        {"id": k, "description": v} for k, v in VARIATION_PRESETS.items()
    ]
