"""Preprocessing & Local Augmentation Service.

Applies Roboflow-style image-level and bounding-box-level transforms
using PIL/OpenCV. All transforms are local — no API calls needed.
Augmented images get copies of source annotations with adjusted bboxes.
"""
from __future__ import annotations

import logging
import math
import os
import random
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image as PILImage, ImageEnhance, ImageFilter

logger = logging.getLogger(__name__)

# ── Image-Level Transforms ──────────────────────────────────────────

def apply_flip_horizontal(img: np.ndarray, bboxes: list[dict]) -> tuple[np.ndarray, list[dict]]:
    h, w = img.shape[:2]
    out = cv2.flip(img, 1)
    new_bboxes = []
    for b in bboxes:
        new_bboxes.append({**b, "x": w - b["x"] - b["w"]})
    return out, new_bboxes


def apply_flip_vertical(img: np.ndarray, bboxes: list[dict]) -> tuple[np.ndarray, list[dict]]:
    h, w = img.shape[:2]
    out = cv2.flip(img, 0)
    new_bboxes = []
    for b in bboxes:
        new_bboxes.append({**b, "y": h - b["y"] - b["h"]})
    return out, new_bboxes


def apply_rotate90(img: np.ndarray, bboxes: list[dict]) -> tuple[np.ndarray, list[dict]]:
    h, w = img.shape[:2]
    out = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    new_bboxes = []
    for b in bboxes:
        new_bboxes.append({**b, "x": h - b["y"] - b["h"], "y": b["x"], "w": b["h"], "h": b["w"]})
    return out, new_bboxes


def apply_rotation(img: np.ndarray, bboxes: list[dict], angle: float = 15) -> tuple[np.ndarray, list[dict]]:
    """Random rotation within [-angle, +angle] degrees."""
    h, w = img.shape[:2]
    a = random.uniform(-angle, angle)
    M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1.0)
    cos_a, sin_a = abs(M[0, 0]), abs(M[0, 1])
    nw = int(h * sin_a + w * cos_a)
    nh = int(h * cos_a + w * sin_a)
    M[0, 2] += (nw - w) / 2
    M[1, 2] += (nh - h) / 2
    out = cv2.warpAffine(img, M, (nw, nh), borderMode=cv2.BORDER_REFLECT)
    new_bboxes = []
    for b in bboxes:
        corners = np.array([
            [b["x"], b["y"]], [b["x"] + b["w"], b["y"]],
            [b["x"] + b["w"], b["y"] + b["h"]], [b["x"], b["y"] + b["h"]],
        ], dtype=np.float32)
        ones = np.ones((4, 1), dtype=np.float32)
        corners_h = np.hstack([corners, ones])
        rotated = (M @ corners_h.T).T
        x_min, y_min = rotated.min(axis=0)
        x_max, y_max = rotated.max(axis=0)
        x_min = max(0, x_min)
        y_min = max(0, y_min)
        x_max = min(nw, x_max)
        y_max = min(nh, y_max)
        new_bboxes.append({**b, "x": float(x_min), "y": float(y_min), "w": float(x_max - x_min), "h": float(y_max - y_min)})
    return out, new_bboxes


def apply_crop(img: np.ndarray, bboxes: list[dict], min_pct: float = 0.8) -> tuple[np.ndarray, list[dict]]:
    """Random crop keeping at least min_pct of the image."""
    h, w = img.shape[:2]
    crop_w = int(w * random.uniform(min_pct, 1.0))
    crop_h = int(h * random.uniform(min_pct, 1.0))
    x0 = random.randint(0, w - crop_w)
    y0 = random.randint(0, h - crop_h)
    out = img[y0:y0 + crop_h, x0:x0 + crop_w]
    new_bboxes = []
    for b in bboxes:
        nx = max(0, b["x"] - x0)
        ny = max(0, b["y"] - y0)
        nx2 = min(crop_w, b["x"] + b["w"] - x0)
        ny2 = min(crop_h, b["y"] + b["h"] - y0)
        nw = nx2 - nx
        nh = ny2 - ny
        if nw > 5 and nh > 5:
            new_bboxes.append({**b, "x": float(nx), "y": float(ny), "w": float(nw), "h": float(nh)})
    return out, new_bboxes


def apply_shear(img: np.ndarray, bboxes: list[dict], max_shear: float = 0.1) -> tuple[np.ndarray, list[dict]]:
    h, w = img.shape[:2]
    sx = random.uniform(-max_shear, max_shear)
    sy = random.uniform(-max_shear, max_shear)
    M = np.array([[1, sx, 0], [sy, 1, 0]], dtype=np.float32)
    nw = int(w + abs(sx) * h)
    nh = int(h + abs(sy) * w)
    if sx < 0:
        M[0, 2] = -sx * h
    if sy < 0:
        M[1, 2] = -sy * w
    out = cv2.warpAffine(img, M, (nw, nh), borderMode=cv2.BORDER_REFLECT)
    new_bboxes = []
    for b in bboxes:
        corners = np.array([
            [b["x"], b["y"]], [b["x"] + b["w"], b["y"]],
            [b["x"] + b["w"], b["y"] + b["h"]], [b["x"], b["y"] + b["h"]],
        ], dtype=np.float32)
        ones = np.ones((4, 1), dtype=np.float32)
        corners_h = np.hstack([corners, ones])
        transformed = (M @ corners_h.T).T
        x_min, y_min = transformed.min(axis=0)
        x_max, y_max = transformed.max(axis=0)
        x_min = max(0, x_min)
        y_min = max(0, y_min)
        new_bboxes.append({**b, "x": float(x_min), "y": float(y_min), "w": float(x_max - x_min), "h": float(y_max - y_min)})
    return out, new_bboxes


def apply_brightness(img: np.ndarray, bboxes: list[dict], factor_range: tuple = (0.6, 1.4)) -> tuple[np.ndarray, list[dict]]:
    factor = random.uniform(*factor_range)
    out = np.clip(img.astype(np.float32) * factor, 0, 255).astype(np.uint8)
    return out, bboxes


def apply_exposure(img: np.ndarray, bboxes: list[dict], gamma_range: tuple = (0.5, 2.0)) -> tuple[np.ndarray, list[dict]]:
    gamma = random.uniform(*gamma_range)
    table = np.array([((i / 255.0) ** (1.0 / gamma)) * 255 for i in range(256)]).astype("uint8")
    out = cv2.LUT(img, table)
    return out, bboxes


def apply_blur(img: np.ndarray, bboxes: list[dict], max_kernel: int = 7) -> tuple[np.ndarray, list[dict]]:
    k = random.choice(range(3, max_kernel + 1, 2))
    out = cv2.GaussianBlur(img, (k, k), 0)
    return out, bboxes


def apply_noise(img: np.ndarray, bboxes: list[dict], strength: float = 25) -> tuple[np.ndarray, list[dict]]:
    noise = np.random.randn(*img.shape) * strength
    out = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return out, bboxes


def apply_motion_blur(img: np.ndarray, bboxes: list[dict], kernel_size: int = 15) -> tuple[np.ndarray, list[dict]]:
    k = random.choice(range(5, kernel_size + 1, 2))
    kernel = np.zeros((k, k))
    if random.random() > 0.5:
        kernel[k // 2, :] = 1.0
    else:
        kernel[:, k // 2] = 1.0
    kernel /= k
    out = cv2.filter2D(img, -1, kernel)
    return out, bboxes


def apply_cutout(img: np.ndarray, bboxes: list[dict], max_pct: float = 0.15) -> tuple[np.ndarray, list[dict]]:
    h, w = img.shape[:2]
    out = img.copy()
    cw = int(w * random.uniform(0.05, max_pct))
    ch = int(h * random.uniform(0.05, max_pct))
    cx = random.randint(0, w - cw)
    cy = random.randint(0, h - ch)
    out[cy:cy + ch, cx:cx + cw] = 0
    return out, bboxes


def apply_mosaic(img: np.ndarray, bboxes: list[dict], block_size: int = 20) -> tuple[np.ndarray, list[dict]]:
    h, w = img.shape[:2]
    out = img.copy()
    rh = int(h * random.uniform(0.1, 0.3))
    rw = int(w * random.uniform(0.1, 0.3))
    rx = random.randint(0, w - rw)
    ry = random.randint(0, h - rh)
    region = out[ry:ry + rh, rx:rx + rw]
    small = cv2.resize(region, (max(1, rw // block_size), max(1, rh // block_size)), interpolation=cv2.INTER_LINEAR)
    out[ry:ry + rh, rx:rx + rw] = cv2.resize(small, (rw, rh), interpolation=cv2.INTER_NEAREST)
    return out, bboxes


def apply_grayscale(img: np.ndarray, bboxes: list[dict]) -> tuple[np.ndarray, list[dict]]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    out = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    return out, bboxes


def apply_contrast(img: np.ndarray, bboxes: list[dict], factor_range: tuple = (0.5, 1.5)) -> tuple[np.ndarray, list[dict]]:
    factor = random.uniform(*factor_range)
    mean = img.mean()
    out = np.clip((img.astype(np.float32) - mean) * factor + mean, 0, 255).astype(np.uint8)
    return out, bboxes


# ── Transform Registry ──────────────────────────────────────────────

IMAGE_LEVEL_TRANSFORMS = {
    "flip_horizontal": {"fn": apply_flip_horizontal, "label": "水平翻轉", "category": "image"},
    "flip_vertical": {"fn": apply_flip_vertical, "label": "垂直翻轉", "category": "image"},
    "rotate_90": {"fn": apply_rotate90, "label": "90° 旋轉", "category": "image"},
    "rotation": {"fn": apply_rotation, "label": "隨機旋轉", "category": "image"},
    "crop": {"fn": apply_crop, "label": "隨機裁剪", "category": "image"},
    "shear": {"fn": apply_shear, "label": "錯切變換", "category": "image"},
    "brightness": {"fn": apply_brightness, "label": "亮度調整", "category": "bbox"},
    "exposure": {"fn": apply_exposure, "label": "曝光調整", "category": "bbox"},
    "blur": {"fn": apply_blur, "label": "模糊", "category": "bbox"},
    "noise": {"fn": apply_noise, "label": "噪點", "category": "bbox"},
    "motion_blur": {"fn": apply_motion_blur, "label": "運動模糊", "category": "bbox"},
    "cutout": {"fn": apply_cutout, "label": "遮擋 (Cutout)", "category": "image"},
    "mosaic": {"fn": apply_mosaic, "label": "馬賽克", "category": "image"},
    "grayscale": {"fn": apply_grayscale, "label": "灰度化", "category": "image"},
    "auto_contrast": {"fn": apply_contrast, "label": "自動對比度", "category": "image"},
}

PREPROCESSING_OPTIONS = {
    "auto_orient": {"label": "自動方向校正", "category": "preprocessing"},
    "resize": {"label": "調整大小", "category": "preprocessing"},
    "tile": {"label": "圖片分塊 (Tile)", "category": "preprocessing"},
    "grayscale": {"label": "灰度化", "category": "preprocessing"},
    "auto_contrast": {"label": "自動對比度", "category": "preprocessing"},
    "filter_null": {"label": "過濾無標註圖片", "category": "preprocessing"},
}


def get_available_transforms() -> list[dict]:
    result = []
    for key, info in IMAGE_LEVEL_TRANSFORMS.items():
        result.append({"id": key, "label": info["label"], "category": info["category"]})
    return result


def get_available_preprocessing() -> list[dict]:
    result = []
    for key, info in PREPROCESSING_OPTIONS.items():
        result.append({"id": key, "label": info["label"], "category": info["category"]})
    return result


def apply_transforms(
    img_path: str,
    bboxes: list[dict],
    transforms: list[str],
    output_dir: str,
) -> list[dict]:
    """Apply selected transforms to an image, producing augmented copies.

    Each enabled transform produces ONE new image+annotations pair.
    Returns: [{"filepath": str, "filename": str, "width": int, "height": int, "bboxes": [...]}, ...]
    """
    if not os.path.exists(img_path):
        return []

    img = cv2.imread(img_path)
    if img is None:
        return []

    os.makedirs(output_dir, exist_ok=True)
    stem = Path(img_path).stem
    results = []

    for t_name in transforms:
        info = IMAGE_LEVEL_TRANSFORMS.get(t_name)
        if not info:
            continue
        try:
            aug_img, aug_bboxes = info["fn"](img.copy(), [dict(b) for b in bboxes])
            h, w = aug_img.shape[:2]
            fname = f"{stem}_{t_name}_{uuid.uuid4().hex[:6]}.jpg"
            fpath = os.path.join(output_dir, fname)
            cv2.imwrite(fpath, aug_img, [cv2.IMWRITE_JPEG_QUALITY, 95])
            results.append({
                "filepath": fpath,
                "filename": fname,
                "width": w,
                "height": h,
                "bboxes": aug_bboxes,
            })
        except Exception as e:
            logger.warning("Transform %s failed for %s: %s", t_name, img_path, e)

    return results


def preprocess_image(img_path: str, options: dict) -> str | None:
    """Apply preprocessing to an image in-place. Returns new path or None."""
    img = cv2.imread(img_path)
    if img is None:
        return None

    if options.get("grayscale"):
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    if options.get("auto_contrast"):
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    resize = options.get("resize")
    if resize and isinstance(resize, int) and resize > 0:
        h, w = img.shape[:2]
        scale = resize / max(h, w)
        if scale != 1.0:
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)

    cv2.imwrite(img_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return img_path
