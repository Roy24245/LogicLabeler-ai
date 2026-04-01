"""SAHI (Slicing Aided Hyper Inference) utility.

Splits high-resolution images into overlapping patches, runs detection
on each patch, maps coordinates back, and applies NMS to merge results.
"""
from __future__ import annotations

import math
from typing import Any, Callable

from app.core.geometry import iou, BBox


def sahi_detect(
    image_path: str,
    detect_fn: Callable[..., list[dict[str, Any]]],
    targets: list[str],
    detection_prompts: dict[str, str],
    slice_size: int = 800,
    overlap_ratio: float = 0.2,
    nms_threshold: float = 0.5,
    image_width: int = 0,
    image_height: int = 0,
) -> list[dict[str, Any]]:
    """Run detection with SAHI slicing for high-resolution images.

    If image dimensions are smaller than slice_size, runs detection directly.
    """
    if image_width <= slice_size and image_height <= slice_size:
        return detect_fn(image_path, targets, detection_prompts)

    from PIL import Image as PILImage
    import tempfile
    import os

    img = PILImage.open(image_path)
    w, h = img.size

    stride = int(slice_size * (1 - overlap_ratio))
    all_detections: list[dict[str, Any]] = []

    for y_start in range(0, h, stride):
        for x_start in range(0, w, stride):
            x_end = min(x_start + slice_size, w)
            y_end = min(y_start + slice_size, h)
            patch = img.crop((x_start, y_start, x_end, y_end))

            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                patch.save(tmp, format="JPEG")
                tmp_path = tmp.name

            try:
                dets = detect_fn(tmp_path, targets, detection_prompts)
                for d in dets:
                    bbox = d.get("bbox", {})
                    d["bbox"] = {
                        "x": bbox.get("x", 0) + x_start,
                        "y": bbox.get("y", 0) + y_start,
                        "w": bbox.get("w", 0),
                        "h": bbox.get("h", 0),
                    }
                    all_detections.append(d)
            finally:
                os.unlink(tmp_path)

            if x_end >= w:
                break
        if y_end >= h:
            break

    return _nms(all_detections, nms_threshold)


def _nms(detections: list[dict[str, Any]], threshold: float) -> list[dict[str, Any]]:
    """Class-aware Non-Maximum Suppression."""
    if not detections:
        return []

    by_class: dict[str, list[dict]] = {}
    for d in detections:
        by_class.setdefault(d["class_name"], []).append(d)

    results = []
    for cls, dets in by_class.items():
        dets.sort(key=lambda d: d.get("confidence", 0), reverse=True)
        keep = []
        while dets:
            best = dets.pop(0)
            keep.append(best)
            remaining = []
            for d in dets:
                if iou(best["bbox"], d["bbox"]) < threshold:
                    remaining.append(d)
            dets = remaining
        results.extend(keep)

    return results
