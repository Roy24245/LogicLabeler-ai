"""Settings API — System configuration management."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.database import get_db
from app.models import SystemSetting

router = APIRouter(tags=["settings"])


class SettingsUpdate(BaseModel):
    dashscope_api_key: str | None = None
    soldier_mode: str | None = None
    augmentation_enabled: bool | None = None


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    stored = {s.key: s.value for s in db.query(SystemSetting).all()}
    return {
        "dashscope_api_key": _mask_key(
            stored.get("dashscope_api_key", {}).get("value", app_settings.dashscope_api_key)
        ),
        "dashscope_api_key_set": bool(
            stored.get("dashscope_api_key", {}).get("value") or app_settings.dashscope_api_key
        ),
        "soldier_mode": stored.get("soldier_mode", {}).get("value", app_settings.soldier_mode),
        "augmentation_enabled": stored.get("augmentation_enabled", {}).get(
            "value", app_settings.augmentation_enabled
        ),
    }


@router.put("/settings")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    if body.dashscope_api_key is not None:
        _upsert(db, "dashscope_api_key", body.dashscope_api_key)
        app_settings.dashscope_api_key = body.dashscope_api_key

    if body.soldier_mode is not None:
        _upsert(db, "soldier_mode", body.soldier_mode)
        app_settings.soldier_mode = body.soldier_mode

    if body.augmentation_enabled is not None:
        _upsert(db, "augmentation_enabled", body.augmentation_enabled)
        app_settings.augmentation_enabled = body.augmentation_enabled

    db.commit()
    return {"ok": True}


def _upsert(db: Session, key: str, value):
    existing = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if existing:
        existing.value = {"value": value}
    else:
        db.add(SystemSetting(key=key, value={"value": value}))


def _mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return "****"
    return key[:4] + "*" * (len(key) - 8) + key[-4:]
