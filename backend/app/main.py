from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _migrate_db()
    _load_settings_from_db()
    yield


def _migrate_db():
    from sqlalchemy import inspect, text
    from app.database import engine
    insp = inspect(engine)
    with engine.connect() as conn:
        img_cols = [c["name"] for c in insp.get_columns("images")]
        if "split" not in img_cols:
            conn.execute(text("ALTER TABLE images ADD COLUMN split VARCHAR(16)"))
            conn.commit()


def _load_settings_from_db():
    """Restore persisted settings (API key, etc.) from the database on startup."""
    from app.database import SessionLocal
    from app.models import SystemSetting
    from app.config import settings as cfg

    db = SessionLocal()
    try:
        for row in db.query(SystemSetting).all():
            val = row.value.get("value") if isinstance(row.value, dict) else None
            if val is None:
                continue
            if row.key == "dashscope_api_key" and val:
                cfg.dashscope_api_key = val
            elif row.key == "soldier_mode":
                cfg.soldier_mode = val
            elif row.key == "augmentation_enabled":
                cfg.augmentation_enabled = bool(val)
    finally:
        db.close()


app = FastAPI(
    title="LogicLabeler API",
    description="基於 MLLM 語義推理與多智能體協作的下一代自動標註系統",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import datasets, labeling, training, augmentation, ws, settings as settings_api  # noqa: E402

app.include_router(datasets.router, prefix="/api")
app.include_router(labeling.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(augmentation.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(ws.router)

import os
data_dir = settings.data_dir
datasets_dir = os.path.join(data_dir, "datasets")
models_dir = os.path.join(data_dir, "models")
os.makedirs(datasets_dir, exist_ok=True)
os.makedirs(models_dir, exist_ok=True)

app.mount("/static/datasets", StaticFiles(directory=datasets_dir), name="dataset_files")
app.mount("/static/models", StaticFiles(directory=models_dir), name="model_files")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
