"""Semantic-Geometric mapping library.

Provides spatial logic functions used by the Commander's generated logic
scripts and the Critic's consistency checker.

All boxes use {"x": float, "y": float, "w": float, "h": float} format
where (x, y) is the top-left corner.
"""
from __future__ import annotations

from typing import TypedDict


class BBox(TypedDict):
    x: float
    y: float
    w: float
    h: float


def iou(a: BBox, b: BBox) -> float:
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = ax1 + a["w"], ay1 + a["h"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["w"], by1 + b["h"]

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_a = a["w"] * a["h"]
    area_b = b["w"] * b["h"]
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def contains(outer: BBox, inner: BBox) -> bool:
    return (
        inner["x"] >= outer["x"]
        and inner["y"] >= outer["y"]
        and inner["x"] + inner["w"] <= outer["x"] + outer["w"]
        and inner["y"] + inner["h"] <= outer["y"] + outer["h"]
    )


def overlap_ratio(a: BBox, b: BBox) -> float:
    """Fraction of b's area that overlaps with a."""
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = ax1 + a["w"], ay1 + a["h"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["w"], by1 + b["h"]

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_b = b["w"] * b["h"]
    return inter / area_b if area_b > 0 else 0.0


def head_region(person_box: BBox) -> BBox:
    """Upper 25 % of a person bounding box."""
    return {
        "x": person_box["x"],
        "y": person_box["y"],
        "w": person_box["w"],
        "h": person_box["h"] * 0.25,
    }


def hand_region(person_box: BBox) -> BBox:
    """Middle-lower 50 % of a person bounding box."""
    return {
        "x": person_box["x"],
        "y": person_box["y"] + person_box["h"] * 0.35,
        "w": person_box["w"],
        "h": person_box["h"] * 0.45,
    }


def is_wearing(person_box: BBox, item_box: BBox, threshold: float = 0.3) -> bool:
    """Check if an item is on the person's head region."""
    return iou(head_region(person_box), item_box) > threshold


def is_holding(person_box: BBox, item_box: BBox, threshold: float = 0.2) -> bool:
    """Check if an item overlaps the person's hand region."""
    return iou(hand_region(person_box), item_box) > threshold


def is_above(a: BBox, b: BBox) -> bool:
    """Is box *a* above box *b*?"""
    return (a["y"] + a["h"]) < (b["y"] + b["h"] * 0.5)


def is_near(a: BBox, b: BBox, distance_ratio: float = 0.5) -> bool:
    """Are centres within *distance_ratio* * max(a_diag, b_diag)?"""
    import math

    acx = a["x"] + a["w"] / 2
    acy = a["y"] + a["h"] / 2
    bcx = b["x"] + b["w"] / 2
    bcy = b["y"] + b["h"] / 2
    dist = math.hypot(acx - bcx, acy - bcy)
    diag_a = math.hypot(a["w"], a["h"])
    diag_b = math.hypot(b["w"], b["h"])
    return dist < distance_ratio * max(diag_a, diag_b)
