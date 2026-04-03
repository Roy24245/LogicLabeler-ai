"""Augmentation Layer — Synthetic data generation via qwen-image-2.0-pro.

Generates training data variations by modifying non-core attributes
(angle, lighting, weather) while preserving semantic content and annotations.
"""
from __future__ import annotations

import base64
import logging
import os
import uuid
from pathlib import Path
from typing import Any

import dashscope
from dashscope import ImageSynthesis

from app.config import settings

logger = logging.getLogger(__name__)

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

    prompt = custom_prompt or VARIATION_PRESETS.get(variation_type, VARIATION_PRESETS["angle_change"])
    prompt = (
        f"Based on the reference image, generate a new version with the following modification: {prompt}. "
        "Keep all the main objects, their types, approximate positions and sizes the same. "
        "Only modify the environmental conditions as specified."
    )

    if not output_dir:
        output_dir = str(settings.datasets_dir / "augmented")
    os.makedirs(output_dir, exist_ok=True)

    try:
        response = ImageSynthesis.call(
            model="qwen-image-2.0-pro",
            prompt=prompt,
            n=1,
            size="1024*1024",
        )

        if response.status_code != 200:
            logger.error("Image generation error: %s", response)
            return {"success": False, "error": f"API error: {response.status_code}"}

        output_filename = f"aug_{variation_type}_{uuid.uuid4().hex[:8]}.png"
        output_path = os.path.join(output_dir, output_filename)

        if hasattr(response.output, "results") and response.output.results:
            result = response.output.results[0]
            if hasattr(result, "url") and result.url:
                import httpx
                img_resp = httpx.get(result.url)
                with open(output_path, "wb") as f:
                    f.write(img_resp.content)
            elif hasattr(result, "b64_image") and result.b64_image:
                img_bytes = base64.b64decode(result.b64_image)
                with open(output_path, "wb") as f:
                    f.write(img_bytes)

        return {
            "success": True,
            "output_path": output_path,
            "output_filename": output_filename,
            "variation_type": variation_type,
        }

    except Exception as e:
        logger.exception("Augmentation failed: %s", e)
        return {"success": False, "error": str(e)}


def batch_augment(
    image_paths: list[str],
    variation_types: list[str],
    output_dir: str,
) -> list[dict[str, Any]]:
    """Generate multiple variations for a batch of images."""
    results = []
    for img_path in image_paths:
        for vtype in variation_types:
            result = generate_variation(img_path, vtype, output_dir=output_dir)
            result["source_image"] = img_path
            results.append(result)
    return results


def get_variation_types() -> list[dict[str, str]]:
    """Return available variation presets."""
    return [
        {"id": k, "description": v} for k, v in VARIATION_PRESETS.items()
    ]
