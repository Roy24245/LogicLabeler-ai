"""Settings API — System configuration management.

Includes:
- Basic settings (DashScope key, soldier mode, augmentation toggle)
- Custom model provider registry (OpenAI-compatible / Anthropic)
- Active model selection per role (text / vision)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.database import get_db
from app.models import SystemSetting
from app.services import model_providers as mp

router = APIRouter(tags=["settings"])


# ── Basic settings ────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    dashscope_api_key: str | None = None
    soldier_mode: str | None = None
    augmentation_enabled: bool | None = None


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    stored = {s.key: s.value for s in db.query(SystemSetting).all()}
    active_text = stored.get("active_text_model", {}).get("value") or mp.DEFAULT_TEXT_MODEL
    active_vision = stored.get("active_vision_model", {}).get("value") or mp.DEFAULT_VISION_MODEL
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
        "active_text_model": active_text,
        "active_vision_model": active_vision,
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


# ── Model providers ───────────────────────────────────────────────

class ProviderCreate(BaseModel):
    name: str
    type: str  # "openai" | "anthropic"
    api_key: str = ""
    base_url: str = ""
    models: list[str] = []


class ProviderUpdate(BaseModel):
    name: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    models: list[str] | None = None


class ActiveModelUpdate(BaseModel):
    role: str  # "text" | "vision"
    provider_id: str
    model: str


@router.get("/settings/providers")
def list_providers():
    return mp.list_providers(unmasked=False)


@router.post("/settings/providers")
def create_provider(body: ProviderCreate, db: Session = Depends(get_db)):
    if body.type not in {"openai", "anthropic"}:
        raise HTTPException(400, "type must be 'openai' or 'anthropic'")
    if not body.name.strip():
        raise HTTPException(400, "name is required")

    providers = _read_providers(db)
    new_provider = {
        "id": uuid.uuid4().hex,
        "name": body.name.strip(),
        "type": body.type,
        "api_key": body.api_key,
        "base_url": (body.base_url or "").strip(),
        "models": [m.strip() for m in body.models if m.strip()],
    }
    providers.append(new_provider)
    _write_providers(db, providers)

    out = dict(new_provider)
    out["api_key_set"] = bool(out.pop("api_key", ""))
    out["builtin"] = False
    return out


@router.put("/settings/providers/{provider_id}")
def update_provider(provider_id: str, body: ProviderUpdate, db: Session = Depends(get_db)):
    if provider_id == mp.BUILTIN_DASHSCOPE_ID:
        raise HTTPException(400, "Built-in DashScope provider is managed via the API key field.")

    providers = _read_providers(db)
    target = next((p for p in providers if p.get("id") == provider_id), None)
    if not target:
        raise HTTPException(404, "Provider not found")

    if body.name is not None:
        target["name"] = body.name.strip()
    if body.base_url is not None:
        target["base_url"] = body.base_url.strip()
    if body.api_key is not None and body.api_key.strip():
        target["api_key"] = body.api_key
    if body.models is not None:
        target["models"] = [m.strip() for m in body.models if m.strip()]

    _write_providers(db, providers)
    return {"ok": True}


@router.delete("/settings/providers/{provider_id}")
def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    if provider_id == mp.BUILTIN_DASHSCOPE_ID:
        raise HTTPException(400, "Built-in DashScope provider cannot be removed.")

    providers = _read_providers(db)
    new_list = [p for p in providers if p.get("id") != provider_id]
    if len(new_list) == len(providers):
        raise HTTPException(404, "Provider not found")
    _write_providers(db, new_list)

    # If the deleted provider was active for any role, fall back to defaults.
    for key, default in (
        ("active_text_model", mp.DEFAULT_TEXT_MODEL),
        ("active_vision_model", mp.DEFAULT_VISION_MODEL),
    ):
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if row and isinstance(row.value, dict):
            cur = row.value.get("value") or {}
            if cur.get("provider_id") == provider_id:
                _upsert(db, key, default)
    db.commit()
    mp.reload_active_models()
    return {"ok": True}


@router.put("/settings/active-model")
def set_active_model(body: ActiveModelUpdate, db: Session = Depends(get_db)):
    if body.role not in {"text", "vision"}:
        raise HTTPException(400, "role must be 'text' or 'vision'")

    provider = mp.get_provider(body.provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")
    if body.model and provider.get("models") and body.model not in provider["models"]:
        # Allow free-form model name but warn — do not block.
        pass

    key = "active_text_model" if body.role == "text" else "active_vision_model"
    _upsert(db, key, {"provider_id": body.provider_id, "model": body.model})
    db.commit()
    mp.reload_active_models()
    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────────────

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


def _read_providers(db: Session) -> list[dict]:
    row = db.query(SystemSetting).filter(SystemSetting.key == "model_providers").first()
    if not row or not isinstance(row.value, dict):
        return []
    val = row.value.get("value")
    return list(val) if isinstance(val, list) else []


def _write_providers(db: Session, providers: list[dict]) -> None:
    _upsert(db, "model_providers", providers)
    db.commit()
