from __future__ import annotations

import json
import os
import shutil
import xml.etree.ElementTree as ET
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image as PILImage
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Annotation, Dataset, Image


def create_dataset(db: Session, name: str, description: str = "", task_type: str = "detection", label_classes: list | None = None) -> Dataset:
    ds = Dataset(
        name=name,
        description=description,
        task_type=task_type,
        label_classes=label_classes or [],
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    ds_dir = settings.datasets_dir / str(ds.id)
    ds_dir.mkdir(parents=True, exist_ok=True)
    (ds_dir / "images").mkdir(exist_ok=True)
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
    filepath = ds_dir / filename
    with open(filepath, "wb") as f:
        f.write(file_bytes)

    pil = PILImage.open(BytesIO(file_bytes))
    w, h = pil.size

    img = Image(
        dataset_id=dataset_id,
        filename=filename,
        filepath=str(filepath),
        width=w,
        height=h,
    )
    db.add(img)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds:
        ds.image_count = db.query(Image).filter(Image.dataset_id == dataset_id).count() + 1
    db.commit()
    db.refresh(img)
    return img


def get_images(db: Session, dataset_id: int, skip: int = 0, limit: int = 50) -> list[Image]:
    return (
        db.query(Image)
        .filter(Image.dataset_id == dataset_id)
        .order_by(Image.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def delete_image(db: Session, image_id: int) -> bool:
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        return False
    if os.path.exists(img.filepath):
        os.remove(img.filepath)
    dataset_id = img.dataset_id
    db.delete(img)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds:
        ds.image_count = max(0, db.query(Image).filter(Image.dataset_id == dataset_id).count() - 1)
    db.commit()
    return True


def get_annotations(db: Session, image_id: int) -> list[Annotation]:
    return db.query(Annotation).filter(Annotation.image_id == image_id).all()


def update_annotations(db: Session, image_id: int, annotations_data: list[dict]) -> list[Annotation]:
    db.query(Annotation).filter(Annotation.image_id == image_id).delete()
    results = []
    for a in annotations_data:
        ann = Annotation(
            image_id=image_id,
            class_name=a["class_name"],
            bbox=a.get("bbox"),
            confidence=a.get("confidence"),
            source=a.get("source", "manual"),
        )
        db.add(ann)
        results.append(ann)
    img = db.query(Image).filter(Image.id == image_id).first()
    if img:
        ds = db.query(Dataset).filter(Dataset.id == img.dataset_id).first()
        if ds:
            ds.annotation_count = (
                db.query(Annotation)
                .join(Image)
                .filter(Image.dataset_id == ds.id)
                .count()
                + len(results)
            )
    db.commit()
    for r in results:
        db.refresh(r)
    return results


def _sync_counts(db: Session, dataset_id: int):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds:
        ds.image_count = db.query(Image).filter(Image.dataset_id == dataset_id).count()
        ds.annotation_count = (
            db.query(Annotation)
            .join(Image)
            .filter(Image.dataset_id == dataset_id)
            .count()
        )
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
            out = img_dir / fname
            with open(out, "wb") as f:
                f.write(content)

            pil = PILImage.open(BytesIO(content))
            w, h = pil.size
            img = Image(dataset_id=dataset_id, filename=fname, filepath=str(out), width=w, height=h)
            db.add(img)
            db.flush()

            stem = Path(fname).stem
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
            out = img_dir / os.path.basename(fname)
            with open(out, "wb") as f:
                f.write(content)
            img = Image(
                dataset_id=dataset_id,
                filename=os.path.basename(fname),
                filepath=str(out),
                width=coco_img.get("width", 0),
                height=coco_img.get("height", 0),
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
            out = img_dir / fname
            with open(out, "wb") as f:
                f.write(content)
            pil = PILImage.open(BytesIO(content))
            w, h = pil.size
            img = Image(dataset_id=dataset_id, filename=fname, filepath=str(out), width=w, height=h)
            db.add(img)
            db.flush()

            stem = Path(fname).stem
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


def export_yolo(db: Session, dataset_id: int) -> bytes:
    """Export dataset in YOLO format as ZIP bytes."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")

    classes: list[str] = ds.label_classes or []
    images = db.query(Image).filter(Image.dataset_id == dataset_id).all()

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("classes.txt", "\n".join(classes))
        for img in images:
            if os.path.exists(img.filepath):
                zf.write(img.filepath, f"images/{img.filename}")
            anns = db.query(Annotation).filter(Annotation.image_id == img.id).all()
            lines = []
            for a in anns:
                if not a.bbox:
                    continue
                cls_idx = classes.index(a.class_name) if a.class_name in classes else -1
                if cls_idx < 0:
                    classes.append(a.class_name)
                    cls_idx = len(classes) - 1
                bx, by, bw, bh = a.bbox["x"], a.bbox["y"], a.bbox["w"], a.bbox["h"]
                cx = (bx + bw / 2) / img.width if img.width else 0
                cy = (by + bh / 2) / img.height if img.height else 0
                nw = bw / img.width if img.width else 0
                nh = bh / img.height if img.height else 0
                lines.append(f"{cls_idx} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")
            stem = Path(img.filename).stem
            zf.writestr(f"labels/{stem}.txt", "\n".join(lines))
        zf.writestr("classes.txt", "\n".join(classes))

        yaml_content = (
            f"train: images\nval: images\nnc: {len(classes)}\n"
            f"names: {classes}\n"
        )
        zf.writestr("data.yaml", yaml_content)

    return buf.getvalue()


def _is_image(name: str) -> bool:
    ext = Path(name).suffix.lower()
    return ext in {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
