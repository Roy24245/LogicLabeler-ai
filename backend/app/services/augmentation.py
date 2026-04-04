"""Augmentation Layer — Image editing via qwen-image-2.0-pro.

Takes existing dataset images and generates variations by modifying
non-core attributes (angle, lighting, weather) while preserving objects.
The original image is sent to the API so modifications are based on real content.
"""
from __future__ import annotations

import base64
import logging
import mimetypes
import os
import time
import uuid
from typing import Any

import dashscope
from dashscope import MultiModalConversation

from app.config import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
BASE_DELAY = 10.0
REQUEST_INTERVAL = 2.0

VARIATION_PRESETS = {
    "angle_change": "Slightly adjust the camera viewing angle of this image while keeping all objects, their types, positions and sizes exactly the same.",
    "lighting_bright": "Make this image brighter as if taken during a sunny daytime, keeping all objects unchanged.",
    "lighting_dark": "Make this image darker as if taken during dusk or low-light conditions, keeping all objects unchanged.",
    "weather_rain": "Add a realistic rain effect to this image while keeping all objects clearly visible and in the same positions.",
    "weather_fog": "Add a light fog effect to this image while keeping all objects recognizable and in the same positions.",
    "shadow_change": "Change the shadow directions and intensity in this image as if the light source moved, keeping all objects unchanged.",
}


def is_enabled() -> bool:
    return settings.augmentation_enabled


def _encode_image(file_path: str) -> str:
    """Encode a local image file to Base64 data URI."""
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("image/"):
        mime_type = "image/jpeg"
    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def _is_rate_limited(obj) -> bool:
    s = str(obj)
    return "429" in s or "RateQuota" in s or "Throttling" in s


def _call_with_retry(messages: list, size: str | None = None) -> Any:
    """Call MultiModalConversation with exponential backoff on rate-limit errors."""
    response = None
    kwargs: dict[str, Any] = dict(
        api_key=settings.dashscope_api_key,
        model="qwen-image-2.0-pro",
        messages=messages,
        stream=False,
        n=1,
        watermark=False,
        prompt_extend=False,
    )
    if size:
        kwargs["size"] = size

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = MultiModalConversation.call(**kwargs)
            if response.status_code == 200:
                return response
            if _is_rate_limited(response.code) or _is_rate_limited(response.message):
                if attempt < MAX_RETRIES:
                    delay = BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "Rate limited via response (attempt %d/%d), waiting %.0fs...",
                        attempt + 1, MAX_RETRIES, delay,
                    )
                    time.sleep(delay)
                    continue
            return response
        except Exception as e:
            if _is_rate_limited(e) and attempt < MAX_RETRIES:
                delay = BASE_DELAY * (2 ** attempt)
                logger.warning(
                    "Rate limited via exception (attempt %d/%d), waiting %.0fs...",
                    attempt + 1, MAX_RETRIES, delay,
                )
                time.sleep(delay)
                continue
            raise
    return response


def generate_variation(
    image_path: str,
    variation_type: str = "angle_change",
    custom_prompt: str = "",
    output_dir: str | None = None,
) -> dict[str, Any]:
    """Generate a variation of the input image using qwen-image-2.0-pro image editing.

    The source image is encoded as Base64 and sent alongside the editing instruction,
    so the API modifies the actual image content rather than generating from scratch.
    """
    if not is_enabled():
        return {"success": False, "error": "Augmentation is disabled"}

    if not os.path.exists(image_path):
        return {"success": False, "error": f"Source image not found: {image_path}"}

    dashscope.api_key = settings.dashscope_api_key

    image_b64 = _encode_image(image_path)

    instruction = custom_prompt or VARIATION_PRESETS.get(variation_type, VARIATION_PRESETS["angle_change"])

    messages = [
        {
            "role": "user",
            "content": [
                {"image": image_b64},
                {"text": instruction},
            ],
        }
    ]

    if not output_dir:
        output_dir = str(settings.datasets_dir / "augmented")
    os.makedirs(output_dir, exist_ok=True)

    try:
        logger.info("Sending image editing request: source=%s variation=%s", os.path.basename(image_path), variation_type)
        response = _call_with_retry(messages)

        if response.status_code != 200:
            logger.error("Image editing error: code=%s message=%s", response.code, response.message)
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
                    logger.info("Generated variation saved: %s (from %s)", output_path, os.path.basename(image_path))
                    return {
                        "success": True,
                        "output_path": output_path,
                        "output_filename": output_filename,
                        "variation_type": variation_type,
                    }

        logger.warning("No image in API response: %s", response)
        return {"success": False, "error": "No image in API response"}

    except Exception as e:
        logger.exception("Augmentation failed for %s: %s", os.path.basename(image_path), e)
        return {"success": False, "error": str(e)}


def batch_augment(
    image_paths: list[str],
    variation_types: list[str],
    output_dir: str,
) -> list[dict[str, Any]]:
    """Generate variations for a batch of images, one at a time with rate-limit pacing.

    Each request completes fully (image received and saved) before the next one starts.
    """
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
