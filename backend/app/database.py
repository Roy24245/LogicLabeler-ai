from __future__ import annotations

import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Lightweight migrations: idempotently add new columns introduced after initial schema.
# SQLite-only; expand the list whenever models gain new optional columns.
_PENDING_COLUMNS: list[tuple[str, str, str]] = [
    ("images", "split", "VARCHAR(16)"),
    ("annotations", "shape_type", "VARCHAR(16) DEFAULT 'bbox'"),
    ("annotations", "points", "JSON"),
    ("annotations", "attributes", "JSON"),
    ("annotations", "locked", "BOOLEAN DEFAULT 0"),
    ("annotations", "note", "TEXT"),
    ("images", "verified", "BOOLEAN DEFAULT 0"),
    ("images", "tags", "JSON"),
    ("images", "note", "TEXT"),
    ("datasets", "keypoint_schema", "JSON"),
]


def _apply_lightweight_migrations() -> None:
    if "sqlite" not in settings.database_url:
        return
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in _PENDING_COLUMNS:
            if table not in existing_tables:
                continue
            cols = {c["name"] for c in inspector.get_columns(table)}
            if column in cols:
                continue
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                logger.info("Added column %s.%s", table, column)
            except Exception as e:  # pragma: no cover
                logger.warning("Failed to add column %s.%s: %s", table, column, e)


def init_db():
    from app.models import Annotation, Dataset, Image, LabelingJob, ReviewJob, SystemSetting, TrainingJob  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()
