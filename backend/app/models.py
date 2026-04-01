from __future__ import annotations

import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, Boolean, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, default="")
    task_type: Mapped[str] = mapped_column(String(64), default="detection")
    label_classes: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    image_count: Mapped[int] = mapped_column(Integer, default=0)
    annotation_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    images: Mapped[list["Image"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    filepath: Mapped[str] = mapped_column(String(1024), nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    is_augmented: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    dataset: Mapped["Dataset"] = relationship(back_populates="images")
    annotations: Mapped[list["Annotation"]] = relationship(
        back_populates="image", cascade="all, delete-orphan"
    )


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"))
    class_name: Mapped[str] = mapped_column(String(256), nullable=False)
    bbox: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    mask_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    image: Mapped["Image"] = relationship(back_populates="annotations")


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"))
    model_type: Mapped[str] = mapped_column(String(64), default="yolov8n")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    epochs: Mapped[int] = mapped_column(Integer, default=100)
    batch_size: Mapped[int] = mapped_column(Integer, default=16)
    img_size: Mapped[int] = mapped_column(Integer, default=640)
    config: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    metrics: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    log_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    best_model_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    run_dir: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    pid: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class LabelingJob(Base):
    __tablename__ = "labeling_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"))
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    soldier_mode: Mapped[str] = mapped_column(String(32), default="qwen_vision")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    total_images: Mapped[int] = mapped_column(Integer, default=0)
    processed_images: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(256), primary_key=True)
    value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
