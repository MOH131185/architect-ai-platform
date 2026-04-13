from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


def _read_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


class Settings(BaseModel):
    """Environment-backed settings for the ArchCAD backend."""

    hf_token: str | None = Field(default=None, alias="HF_TOKEN")
    archcad_dataset_id: str = Field(default="jackluoluo/ArchCAD", alias="ARCHCAD_DATASET_ID")
    archcad_local_dir: Path = Field(default=Path("./data/archcad/raw"), alias="ARCHCAD_LOCAL_DIR")
    archcad_processed_dir: Path = Field(
        default=Path("./data/archcad/processed"),
        alias="ARCHCAD_PROCESSED_DIR",
    )

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @property
    def archcad_root_dir(self) -> Path:
        return self.archcad_local_dir.resolve().parent

    @property
    def archcad_cache_dir(self) -> Path:
        return self.archcad_root_dir / "cache"

    @property
    def archcad_manifest_dir(self) -> Path:
        return self.archcad_root_dir / "manifests"

    @property
    def archcad_download_manifest_path(self) -> Path:
        return self.archcad_manifest_dir / "download_manifest.json"

    @property
    def archcad_manifest_path(self) -> Path:
        return self.archcad_manifest_dir / "archcad_manifest.json"

    @property
    def archcad_semantic_index_path(self) -> Path:
        return self.archcad_processed_dir / "semantic_inverted_index.json"

    @property
    def archcad_stats_path(self) -> Path:
        return self.archcad_processed_dir / "stats_cache.json"

    @property
    def archcad_jsonl_path(self) -> Path:
        return self.archcad_processed_dir / "normalized_samples.jsonl"

    @property
    def archcad_db_path(self) -> Path:
        return self.archcad_processed_dir / "archcad_index.sqlite3"

    def ensure_directories(self) -> None:
        """Create managed directories if they do not exist yet."""
        for directory in (
            self.archcad_local_dir,
            self.archcad_processed_dir,
            self.archcad_cache_dir,
            self.archcad_manifest_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_env(cls) -> "Settings":
        """Build settings from environment variables with a lightweight `.env` fallback."""
        dotenv = _read_dotenv(Path(".env"))

        def resolve(name: str, default: str | None = None) -> str | None:
            return os.getenv(name, dotenv.get(name, default))

        return cls(
            HF_TOKEN=resolve("HF_TOKEN"),
            ARCHCAD_DATASET_ID=resolve("ARCHCAD_DATASET_ID", "jackluoluo/ArchCAD"),
            ARCHCAD_LOCAL_DIR=resolve("ARCHCAD_LOCAL_DIR", "./data/archcad/raw"),
            ARCHCAD_PROCESSED_DIR=resolve("ARCHCAD_PROCESSED_DIR", "./data/archcad/processed"),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance."""
    settings = Settings.from_env()
    settings.ensure_directories()
    return settings
