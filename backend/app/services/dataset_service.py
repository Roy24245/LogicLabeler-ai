from __future__ import annotations

import json
import os
import random
import shutil
import xml.etree.ElementTree as ET
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image as PILImage
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models import Annotation, Dataset, Image


def _resolve_unique_path(base_dir: Path, stem: str, suffix: str = ".jpg") -> Path:
    """Return a path that does not exist yet by appending _1, _2, ... when needed."""
    base_dir.mkdir(parents=True, exist_ok=True)
    candidate = base_dir / f"{stem}{suffix}"
    if not candidate.exists():
        return candidate
    counter = 1
    while True:
        candidate = base_dir / f"{stem}_{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def _convert_to_jpg(file_bytes: bytes, target_path: Path) -> tuple[bytes, str, int, int]:
    """Convert any image to JPEG with collision-safe naming.
    Returns (jpg_bytes, jpg_filename, width, height).
    target_path is a hint (without extension); the actual filename will be deduplicated
    against existing files in the same directory by appending _1, _2, ... when needed.
    """
    pil = PILImage.open(BytesIO(file_bytes))
    if pil.mode in ("RGBA", "P", "LA"):
        pil = pil.convert("RGB")
    elif pil.mode != "RGB":
        pil = pil.convert("RGB")
    w, h = pil.size
    jpg_path = _resolve_unique_path(target_path.parent, target_path.stem, ".jpg")
    pil.save(jpg_path, "JPEG", quality=95)
    with open(jpg_path, "rb") as f:
        jpg_bytes = f.read()
    return jpg_bytes, jpg_path.name, w, h


def create_dataset(db: Session, name: str, description: str = "", task_type: str = "detection", label_classes: list | None = None) -> Dataset:
    ds = Dataset(name=name, description=description, task_type=task_type, label_classes=label_classes or [])
    db.add(ds)
    db.commit()
    db.refresh(ds)
    ds_dir = settings.datasets_dir / str(ds.id)
    ds_dir.mkdir(parents=True, exist_ok=True)
    (ds_dir / "images").mkdir(exist_ok=True)
    return ds


def update_dataset(db: Session, dataset_id: int, **kwargs) -> Optional[Dataset]:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(ds, k):
            setattr(ds, k, v)
    db.commit()
    db.refresh(ds)
    return ds


def get_datasets(db: Session) -> list[Dataset]:
    return db.query(Dataset).order_by(Dataset.created_at.desc()).all()


def get_dataset(db: Session, dataset_id: int) -> Optional[Dataset]:
    return db.query(Dataset).filter(Dataset.id == dataset_id).first()


def delete_dataset(db: Session, dataset_id: int) -> bool:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        return False
    ds_dir = settings.datasets_dir / str(ds.id)
    if ds_dir.exists():
        shutil.rmtree(ds_dir)
    db.delete(ds)
    db.commit()
    return True


def add_image_to_dataset(db: Session, dataset_id: int, filename: str, file_bytes: bytes) -> Image:
    ds_dir = settings.datasets_dir / str(dataset_id) / "images"
    ds_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(filename or "image").stem or "image"
    target_base = ds_dir / stem
    _, jpg_name, w, h = _convert_to_jpg(file_bytes, target_base)
    jpg_path = ds_dir / jpg_name
    img = Image(dataset_id=dataset_id, filename=jpg_name, filepath=str(jpg_path), width=w, height=h)
    db.add(img)
    db.commit()
    db.refresh(img)
    _sync_counts(db, dataset_id)
    return img


def get_images(db: Session, dataset_id: int, skip: int = 0, limit: int = 50, labeled: bool | None = None, class_name: str | None = None, split: str | None = None, search: str | None = None) -> tuple[list[Image], int]:
    q = db.query(Image).filter(Image.dataset_id == dataset_id).options(selectinload(Image.annotations))
    if split is not None:
        if split == "unassigned":
            q = q.filter(Image.split.is_(None))
        else:
            q = q.filter(Image.split == split)
    if search:
        q = q.filter(Image.filename.ilike(f"%{search}%"))
    if labeled is not None:
        sub = db.query(Annotation.image_id).group_by(Annotation.image_id)
        if labeled:
            q = q.filter(Image.id.in_(sub))
        else:
            q = q.filter(~Image.id.in_(sub))
    if class_name:
        sub = db.query(Annotation.image_id).filter(Annotation.class_name == class_name).group_by(Annotation.image_id)
        q = q.filter(Image.id.in_(sub))
    total = q.count()
    images = q.order_by(Image.created_at.desc()).offset(skip).limit(limit).all()
    return images, total


def delete_image(db: Session, image_id: int) -> bool:
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        return False
    if os.path.exists(img.filepath):
        os.remove(img.filepath)
    dataset_id = img.dataset_id
    db.delete(img)
    db.commit()
    _sync_counts(db, dataset_id)
    return True


def batch_delete_images(db: Session, image_ids: list[int]) -> int:
    deleted = 0
    for iid in image_ids:
        if delete_image(db, iid):
            deleted += 1
    return deleted


def update_image(db: Session, image_id: int, **kwargs) -> Optional[Image]:
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        return None
    for k, v in kwargs.items():
        if hasattr(img, k):
            setattr(img, k, v)
    db.commit()
    db.refresh(img)
    return img


def get_annotations(db: Session, image_id: int) -> list[Annotation]:
    return db.query(Annotation).filter(Annotation.image_id == image_id).all()


def update_annotations(db: Session, image_id: int, annotations_data: list[dict]) -> list[Annotation]:
    db.query(Annotation).filter(Annotation.image_id == image_id).delete()
    results = []
    for a in annotations_data:
        ann = Annotation(
            image_id=image_id,
            class_name=a["class_name"],
            shape_type=a.get("shape_type") or "bbox",
            bbox=a.get("bbox"),
            points=a.get("points"),
            confidence=a.get("confidence"),
            source=a.get("source", "manual"),
            attributes=a.get("attributes") or {},
            locked=bool(a.get("locked", False)),
            note=a.get("note"),
        )
        db.add(ann)
        results.append(ann)
    db.commit()
    img = db.query(Image).filter(Image.id == image_id).first()
    if img:
        _sync_counts(db, img.dataset_id)
    for r in results:
        db.refresh(r)
    return results


def rename_class(db: Session, dataset_id: int, old_name: str, new_name: str) -> int:
    anns = db.query(Annotation).join(Image).filter(Image.dataset_id == dataset_id, Annotation.class_name == old_name).all()
    for a in anns:
        a.class_name = new_name
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds and ds.label_classes:
        classes = list(ds.label_classes)
        if old_name in classes:
            classes[classes.index(old_name)] = new_name
        if new_name not in classes:
            classes.append(new_name)
        ds.label_classes = classes
    db.commit()
    return len(anns)


def merge_classes(db: Session, dataset_id: int, source: str, target: str) -> int:
    return rename_class(db, dataset_id, source, target)


def delete_class(db: Session, dataset_id: int, class_name: str) -> int:
    anns = db.query(Annotation).join(Image).filter(Image.dataset_id == dataset_id, Annotation.class_name == class_name).all()
    count = len(anns)
    for a in anns:
        db.delete(a)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds and ds.label_classes:
        ds.label_classes = [c for c in ds.label_classes if c != class_name]
    db.commit()
    _sync_counts(db, dataset_id)
    return count


def auto_split(db: Session, dataset_id: int, train_ratio: float = 0.7, val_ratio: float = 0.2, test_ratio: float = 0.1) -> dict:
    images = db.query(Image).filter(Image.dataset_id == dataset_id).all()
    random.shuffle(images)
    n = len(images)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)
    for i, img in enumerate(images):
        if i < n_train:
            img.split = "train"
        elif i < n_train + n_val:
            img.split = "val"
        else:
            img.split = "test"
    db.commit()
    return {"train": n_train, "val": n_val, "test": n - n_train - n_val}


def batch_split(db: Session, image_ids: list[int], split_val: str | None) -> int:
    images = db.query(Image).filter(Image.id.in_(image_ids)).all()
    for img in images:
        img.split = split_val
    db.commit()
    return len(images)


def get_dataset_stats(db: Session, dataset_id: int) -> dict:
    images = db.query(Image).filter(Image.dataset_id == dataset_id).options(selectinload(Image.annotations)).all()
    class_dist: dict[str, int] = {}
    source_dist: dict[str, int] = {}
    split_dist: dict[str, int] = {"train": 0, "val": 0, "test": 0, "unassigned": 0}
    image_sizes: list[dict] = []
    anns_per_image: list[int] = []
    labeled = 0
    unlabeled = 0
    total_anns = 0
    for img in images:
        ann_count = len(img.annotations) if img.annotations else 0
        anns_per_image.append(ann_count)
        image_sizes.append({"w": img.width, "h": img.height})
        if ann_count > 0:
            labeled += 1
        else:
            unlabeled += 1
        sp = getattr(img, "split", None) or "unassigned"
        split_dist[sp] = split_dist.get(sp, 0) + 1
        for ann in (img.annotations or []):
            total_anns += 1
            class_dist[ann.class_name] = class_dist.get(ann.class_name, 0) + 1
            source_dist[ann.source] = source_dist.get(ann.source, 0) + 1
    return {
        "class_distribution": class_dist,
        "annotation_sources": source_dist,
        "labeled_images": labeled,
        "unlabeled_images": unlabeled,
        "total_annotations": total_anns,
        "image_sizes": image_sizes,
        "annotations_per_image": anns_per_image,
        "split_distribution": split_dist,
    }


def _sync_counts(db: Session, dataset_id: int):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds:
        ds.image_count = db.query(Image).filter(Image.dataset_id == dataset_id).count()
        ds.annotation_count = db.query(Annotation).join(Image).filter(Image.dataset_id == dataset_id).count()
        db.commit()


# ── Import / Export ──────────────────────────────────────────────────

def import_yolo_zip(db: Session, dataset_id: int, zip_bytes: bytes):
    """Import YOLO-format dataset from a ZIP file.
    Expected structure: images/ + labels/ + optional classes.txt or data.yaml
    """
    ds_dir = settings.datasets_dir / str(dataset_id)
    ds_dir.mkdir(parents=True, exist_ok=True)
    img_dir = ds_dir / "images"
    img_dir.mkdir(exist_ok=True)

    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        names = zf.namelist()

        class_names: list[str] = []
        for n in names:
            base = os.path.basename(n)
            if base == "classes.txt":
                class_names = zf.read(n).decode().strip().split("\n")
                break

        image_files = [n for n in names if _is_image(n)]
        label_map: dict[str, str] = {}
        for n in names:
            if "/labels/" in n and n.endswith(".txt") and os.path.basename(n) != "classes.txt":
                stem = Path(n).stem
                label_map[stem] = n

        for img_path in image_files:
            fname = os.path.basename(img_path)
            content = zf.read(img_path)
            stem = Path(fname).stem
            _, jpg_name, w, h = _convert_to_jpg(content, img_dir / stem)
            img = Image(dataset_id=dataset_id, filename=jpg_name, filepath=str(img_dir / jpg_name), width=w, height=h)
            db.add(img)
            db.flush()

            if stem in label_map:
                lbl_content = zf.read(label_map[stem]).decode().strip()
                for line in lbl_content.split("\n"):
                    if not line.strip():
                        continue
                    parts = line.strip().split()
                    cls_id = int(parts[0])
                    cx, cy, bw, bh = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                    x1 = (cx - bw / 2) * w
                    y1 = (cy - bh / 2) * h
                    box_w = bw * w
                    box_h = bh * h
                    cls_name = class_names[cls_id] if cls_id < len(class_names) else f"class_{cls_id}"
                    ann = Annotation(
                        image_id=img.id,
                        class_name=cls_name,
                        bbox={"x": x1, "y": y1, "w": box_w, "h": box_h},
                        source="imported",
                    )
                    db.add(ann)

        if class_names:
            ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if ds:
                ds.label_classes = class_names

    db.commit()
    _sync_counts(db, dataset_id)


def import_coco_zip(db: Session, dataset_id: int, zip_bytes: bytes):
    """Import COCO-format dataset from a ZIP file.
    Expected: images/ + annotations.json (or *.json with 'images' key).
    """
    ds_dir = settings.datasets_dir / str(dataset_id)
    img_dir = ds_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        coco_json = None
        for n in names:
            if n.endswith(".json"):
                data = json.loads(zf.read(n))
                if "images" in data:
                    coco_json = data
                    break

        if not coco_json:
            return

        cat_map = {c["id"]: c["name"] for c in coco_json.get("categories", [])}
        img_id_map: dict[int, int] = {}

        image_files = [n for n in names if _is_image(n)]
        fname_to_path = {os.path.basename(n): n for n in image_files}

        for coco_img in coco_json.get("images", []):
            fname = coco_img["file_name"]
            zpath = fname_to_path.get(fname) or fname_to_path.get(os.path.basename(fname))
            if not zpath:
                continue
            content = zf.read(zpath)
            stem = Path(os.path.basename(fname)).stem
            _, jpg_name, w, h = _convert_to_jpg(content, img_dir / stem)
            img = Image(
                dataset_id=dataset_id,
                filename=jpg_name,
                filepath=str(img_dir / jpg_name),
                width=w,
                height=h,
            )
            db.add(img)
            db.flush()
            img_id_map[coco_img["id"]] = img.id

        for coco_ann in coco_json.get("annotations", []):
            db_img_id = img_id_map.get(coco_ann["image_id"])
            if not db_img_id:
                continue
            bbox = coco_ann.get("bbox", [0, 0, 0, 0])
            ann = Annotation(
                image_id=db_img_id,
                class_name=cat_map.get(coco_ann["category_id"], "unknown"),
                bbox={"x": bbox[0], "y": bbox[1], "w": bbox[2], "h": bbox[3]},
                source="imported",
            )
            db.add(ann)

        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if ds:
            ds.label_classes = list(cat_map.values())

    db.commit()
    _sync_counts(db, dataset_id)


def import_voc_zip(db: Session, dataset_id: int, zip_bytes: bytes):
    """Import Pascal VOC format (images/ + Annotations/ XML)."""
    ds_dir = settings.datasets_dir / str(dataset_id)
    img_dir = ds_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        image_files = [n for n in names if _is_image(n)]
        xml_map: dict[str, str] = {}
        for n in names:
            if n.endswith(".xml"):
                stem = Path(n).stem
                xml_map[stem] = n

        all_classes = set()
        for img_path in image_files:
            fname = os.path.basename(img_path)
            content = zf.read(img_path)
            stem = Path(fname).stem
            _, jpg_name, w, h = _convert_to_jpg(content, img_dir / stem)
            img = Image(dataset_id=dataset_id, filename=jpg_name, filepath=str(img_dir / jpg_name), width=w, height=h)
            db.add(img)
            db.flush()

            if stem in xml_map:
                tree = ET.parse(BytesIO(zf.read(xml_map[stem])))
                for obj in tree.findall(".//object"):
                    cls = obj.findtext("name", "unknown")
                    all_classes.add(cls)
                    bnd = obj.find("bndbox")
                    if bnd is not None:
                        x1, y1 = float(bnd.findtext("xmin", "0")), float(bnd.findtext("ymin", "0"))
                        x2, y2 = float(bnd.findtext("xmax", "0")), float(bnd.findtext("ymax", "0"))
                        ann = Annotation(
                            image_id=img.id,
                            class_name=cls,
                            bbox={"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1},
                            source="imported",
                        )
                        db.add(ann)

        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if ds:
            ds.label_classes = list(all_classes)

    db.commit()
    _sync_counts(db, dataset_id)


def _detect_export_mode(task_type: str | None, annotations: list[Annotation]) -> str:
    """Decide export sub-format based on task_type or annotation shape coverage."""
    tt = (task_type or "detection").lower()
    if tt in ("segmentation", "instance_segmentation", "seg"):
        return "segmentation"
    if tt in ("pose", "keypoint", "keypoints"):
        return "pose"
    if tt in ("obb", "rotated", "oriented"):
        return "obb"
    shapes = {(getattr(a, "shape_type", None) or "bbox") for a in annotations}
    if "polygon" in shapes:
        return "segmentation"
    if "keypoint" in shapes:
        return "pose"
    if "obb" in shapes:
        return "obb"
    return "detection"


def _bbox_to_polygon(bbox: dict) -> list[list[float]]:
    x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def _obb_corners(obb: dict) -> list[list[float]]:
    """Convert {cx, cy, w, h, theta(rad)} to 4 corner points in image coordinates."""
    import math as _math
    cx = float(obb.get("cx", 0))
    cy = float(obb.get("cy", 0))
    w = float(obb.get("w", 0))
    h = float(obb.get("h", 0))
    t = float(obb.get("theta", 0))
    cos_t, sin_t = _math.cos(t), _math.sin(t)
    half = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    return [[cx + dx * cos_t - dy * sin_t, cy + dx * sin_t + dy * cos_t] for dx, dy in half]


def _build_yolo_line(
    mode: str,
    cls_idx: int,
    ann: Annotation,
    img_w: int,
    img_h: int,
    keypoint_count: int = 0,
) -> str | None:
    """Encode one annotation as a YOLO label line for the active export mode."""
    if not img_w or not img_h:
        return None
    bbox = ann.bbox
    shape = (getattr(ann, "shape_type", None) or "bbox")

    if mode == "segmentation":
        pts: list[list[float]] | None = None
        if shape == "polygon" and isinstance(ann.points, list) and len(ann.points) >= 3:
            pts = [[float(p[0]), float(p[1])] for p in ann.points]
        elif bbox:
            pts = _bbox_to_polygon(bbox)
        if not pts:
            return None
        flat = " ".join(f"{p[0] / img_w:.6f} {p[1] / img_h:.6f}" for p in pts)
        return f"{cls_idx} {flat}"

    if mode == "pose":
        if not bbox:
            return None
        bx, by, bw, bh = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
        cx_n = (bx + bw / 2) / img_w
        cy_n = (by + bh / 2) / img_h
        nw = bw / img_w
        nh = bh / img_h
        head = f"{cls_idx} {cx_n:.6f} {cy_n:.6f} {nw:.6f} {nh:.6f}"
        kps_out: list[str] = []
        kps_in: list[dict] = []
        if shape == "keypoint" and isinstance(ann.points, list):
            kps_in = [p for p in ann.points if isinstance(p, dict)]
        for i in range(keypoint_count):
            if i < len(kps_in):
                k = kps_in[i]
                kx = float(k.get("x", 0)) / img_w
                ky = float(k.get("y", 0)) / img_h
                kv = int(k.get("v", 2))
                kps_out.append(f"{kx:.6f} {ky:.6f} {kv}")
            else:
                kps_out.append("0 0 0")
        return head + " " + " ".join(kps_out) if kps_out else head

    if mode == "obb":
        corners: list[list[float]] | None = None
        if shape == "obb" and isinstance(ann.points, dict):
            corners = _obb_corners(ann.points)
        elif shape == "obb" and isinstance(ann.points, list) and len(ann.points) == 4:
            corners = [[float(p[0]), float(p[1])] for p in ann.points]
        elif bbox:
            corners = _bbox_to_polygon(bbox)
        if not corners:
            return None
        flat = " ".join(f"{c[0] / img_w:.6f} {c[1] / img_h:.6f}" for c in corners)
        return f"{cls_idx} {flat}"

    # detection (default)
    if not bbox:
        return None
    bx, by, bw, bh = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
    cx_n = (bx + bw / 2) / img_w
    cy_n = (by + bh / 2) / img_h
    nw = bw / img_w
    nh = bh / img_h
    return f"{cls_idx} {cx_n:.6f} {cy_n:.6f} {nw:.6f} {nh:.6f}"


def export_yolo(db: Session, dataset_id: int) -> bytes:
    """Export dataset in YOLO format as ZIP bytes, organized by split.

    Automatically chooses the YOLO sub-format (detection / seg / pose / OBB) based on
    the dataset task_type and the shape_types present in annotations.
    """
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    classes: list[str] = list(ds.label_classes or [])
    images = db.query(Image).filter(Image.dataset_id == dataset_id).all()
    all_anns = db.query(Annotation).join(Image).filter(Image.dataset_id == dataset_id).all()
    mode = _detect_export_mode(ds.task_type, all_anns)
    has_splits = any(getattr(img, "split", None) for img in images)

    kp_schema = getattr(ds, "keypoint_schema", None) or {}
    kp_names: list[str] = list(kp_schema.get("names") or [])
    keypoint_count = len(kp_names)
    skeleton = kp_schema.get("skeleton") or []

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for img in images:
            sp = (getattr(img, "split", None) or "train") if has_splits else ""
            img_prefix = f"{sp}/images" if sp else "images"
            lbl_prefix = f"{sp}/labels" if sp else "labels"
            mask_prefix = f"{sp}/masks" if sp else "masks"
            if os.path.exists(img.filepath):
                zf.write(img.filepath, f"{img_prefix}/{img.filename}")
            anns = db.query(Annotation).filter(Annotation.image_id == img.id).all()
            lines: list[str] = []
            mask_arr = None
            for a in anns:
                cls_idx = classes.index(a.class_name) if a.class_name in classes else -1
                if cls_idx < 0:
                    classes.append(a.class_name)
                    cls_idx = len(classes) - 1
                line = _build_yolo_line(mode, cls_idx, a, img.width, img.height, keypoint_count)
                if line:
                    lines.append(line)
                # Generate composite PNG mask for segmentation tasks.
                if mode == "segmentation" and (getattr(a, "shape_type", None) == "polygon"):
                    if mask_arr is None and img.width and img.height:
                        try:
                            from app.services.segment_assist import polygon_to_mask
                            import numpy as _np
                            mask_arr = _np.zeros((img.height, img.width), dtype=_np.uint8)
                        except Exception:
                            mask_arr = None
                    if mask_arr is not None and isinstance(a.points, list) and len(a.points) >= 3:
                        try:
                            from app.services.segment_assist import polygon_to_mask
                            piece = polygon_to_mask(
                                [[float(p[0]), float(p[1])] for p in a.points],
                                img.width,
                                img.height,
                            )
                            mask_arr[piece > 0] = (cls_idx + 1) & 0xFF
                        except Exception:
                            pass
            stem = Path(img.filename).stem
            zf.writestr(f"{lbl_prefix}/{stem}.txt", "\n".join(lines))
            if mask_arr is not None:
                try:
                    import io as _io
                    from PIL import Image as _PIL
                    pil = _PIL.fromarray(mask_arr)
                    out = _io.BytesIO()
                    pil.save(out, format="PNG")
                    zf.writestr(f"{mask_prefix}/{stem}.png", out.getvalue())
                except Exception:
                    pass

        zf.writestr("classes.txt", "\n".join(classes))

        if has_splits:
            yaml_lines = ["train: train/images", "val: val/images", "test: test/images"]
        else:
            yaml_lines = ["train: images", "val: images"]
        yaml_lines.append(f"nc: {len(classes)}")
        yaml_lines.append(f"names: {classes}")
        if mode == "pose" and keypoint_count:
            yaml_lines.append(f"kpt_shape: [{keypoint_count}, 3]")
            if skeleton:
                yaml_lines.append(f"skeleton: {skeleton}")
            if kp_names:
                yaml_lines.append(f"keypoint_names: {kp_names}")
        yaml_lines.append(f"task: {mode}")
        zf.writestr("data.yaml", "\n".join(yaml_lines) + "\n")
    return buf.getvalue()


def convert_existing_images(db: Session, dataset_id: int) -> int:
    """Convert all non-JPG images in a dataset to JPEG. Returns count of converted images."""
    images = db.query(Image).filter(Image.dataset_id == dataset_id).all()
    converted = 0
    for img in images:
        ext = Path(img.filename).suffix.lower()
        if ext in (".jpg", ".jpeg"):
            continue
        old_path = Path(img.filepath)
        if not old_path.exists():
            continue
        with open(old_path, "rb") as f:
            raw = f.read()
        stem = Path(img.filename).stem
        target_dir = old_path.parent
        _, jpg_name, w, h = _convert_to_jpg(raw, target_dir / stem)
        if old_path.exists() and old_path.name != jpg_name:
            old_path.unlink()
        img.filename = jpg_name
        img.filepath = str(target_dir / jpg_name)
        img.width = w
        img.height = h
        converted += 1
    db.commit()
    return converted


def _is_image(name: str) -> bool:
    ext = Path(name).suffix.lower()
    return ext in {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
