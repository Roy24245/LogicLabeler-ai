"""Segment Assist — interactive smart segmentation backed by OpenCV grabCut.

Given an image and a hint (a click point or a bbox), produce a polygon outlining
the foreground object. No heavy ML weights required.
"""
from __future__ import annotations

import logging
import math
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Maximum number of polygon vertices we keep after simplification.
MAX_POLY_POINTS = 80
# Minimum contour area (px^2) to consider a candidate object.
MIN_CONTOUR_AREA = 25
# Default crop margin around a click point, expressed as a fraction of image diagonal.
CLICK_REGION_FRAC = 0.18


def smart_segment(
    image_path: str,
    *,
    point: tuple[float, float] | None = None,
    bbox: dict[str, float] | None = None,
    iterations: int = 5,
) -> dict[str, Any]:
    """Generate a polygon for the object indicated by `point` or `bbox`.

    Returns: {success, points: [[x, y], ...], bbox: {x, y, w, h}}.
    """
    image = cv2.imread(image_path)
    if image is None:
        return {"success": False, "error": "Image not readable"}
    h, w = image.shape[:2]

    if bbox is None and point is None:
        return {"success": False, "error": "Need a point or bbox hint"}

    # Build the rect that grabCut should look inside.
    if bbox is not None:
        x = int(max(0, bbox.get("x", 0)))
        y = int(max(0, bbox.get("y", 0)))
        bw = int(min(w - x, bbox.get("w", 0)))
        bh = int(min(h - y, bbox.get("h", 0)))
        if bw <= 4 or bh <= 4:
            return {"success": False, "error": "bbox too small"}
        rect = (x, y, bw, bh)
    else:
        cx, cy = point  # type: ignore[misc]
        diag = math.hypot(w, h)
        side = max(40, int(diag * CLICK_REGION_FRAC))
        x = int(max(0, cx - side / 2))
        y = int(max(0, cy - side / 2))
        bw = min(w - x, side)
        bh = min(h - y, side)
        rect = (x, y, bw, bh)

    mask = np.zeros((h, w), dtype=np.uint8)
    bgd = np.zeros((1, 65), dtype=np.float64)
    fgd = np.zeros((1, 65), dtype=np.float64)
    try:
        cv2.grabCut(image, mask, rect, bgd, fgd, iterations, cv2.GC_INIT_WITH_RECT)
    except cv2.error as e:
        logger.warning("grabCut failed: %s", e)
        return {"success": False, "error": str(e)}

    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # If a click point was supplied, restrict to the connected component containing it.
    if point is not None:
        cx, cy = int(round(point[0])), int(round(point[1]))
        cx = min(max(cx, 0), w - 1)
        cy = min(max(cy, 0), h - 1)
        if fg[cy, cx] == 0:
            # Find nearest foreground pixel within a small radius.
            ys, xs = np.where(fg > 0)
            if len(xs):
                d2 = (xs - cx) ** 2 + (ys - cy) ** 2
                idx = int(np.argmin(d2))
                cx, cy = int(xs[idx]), int(ys[idx])
        num, comps = cv2.connectedComponents(fg)
        if num > 1:
            label = comps[cy, cx]
            if label > 0:
                fg = np.where(comps == label, 255, 0).astype(np.uint8)

    contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return {"success": False, "error": "no contour found"}
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < MIN_CONTOUR_AREA:
        return {"success": False, "error": "contour too small"}

    # Simplify the contour with Douglas-Peucker to keep payload small.
    epsilon = max(1.0, 0.0035 * cv2.arcLength(contour, True))
    approx = cv2.approxPolyDP(contour, epsilon, True)
    pts = approx.reshape(-1, 2)
    if len(pts) > MAX_POLY_POINTS:
        # Subsample evenly when oversimplified contours still have too many points.
        idx = np.linspace(0, len(pts) - 1, MAX_POLY_POINTS).astype(int)
        pts = pts[idx]

    points = [[float(p[0]), float(p[1])] for p in pts]
    bx, by, bbw, bbh = cv2.boundingRect(contour)
    return {
        "success": True,
        "points": points,
        "bbox": {"x": float(bx), "y": float(by), "w": float(bbw), "h": float(bbh)},
    }


def polygon_to_mask(points: list[list[float]], width: int, height: int) -> np.ndarray:
    """Rasterize a polygon into an 8-bit mask."""
    mask = np.zeros((height, width), dtype=np.uint8)
    if not points:
        return mask
    poly = np.array([[int(round(x)), int(round(y))] for x, y in points], dtype=np.int32)
    cv2.fillPoly(mask, [poly], 255)
    return mask
