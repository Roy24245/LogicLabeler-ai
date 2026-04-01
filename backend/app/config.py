from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    dashscope_api_key: str = ""
    database_url: str = "sqlite:///./data/logiclabeler.db"
    chromadb_host: str = "localhost"
    chromadb_port: int = 8100
    data_dir: str = "./data"

    soldier_mode: str = "qwen_vision"  # "qwen_vision" | "grounded_sam"
    augmentation_enabled: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def datasets_dir(self) -> Path:
        p = Path(self.data_dir) / "datasets"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def models_dir(self) -> Path:
        p = Path(self.data_dir) / "models"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def exports_dir(self) -> Path:
        p = Path(self.data_dir) / "exports"
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
