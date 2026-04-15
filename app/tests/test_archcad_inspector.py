from __future__ import annotations

import zipfile
from pathlib import Path

from app.core.settings import Settings
from app.services.archcad_inspector import ArchCADInspector


def _write_zip(path: Path, members: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)


def test_inspector_groups_modalities(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw"
    processed_dir = tmp_path / "processed"

    _write_zip(raw_dir / "data" / "json.zip", {"train/sample-001.json": "[]"})
    _write_zip(raw_dir / "data" / "svg.zip", {"train/sample-001.svg": "<svg></svg>"})
    _write_zip(raw_dir / "data" / "png.zip", {"train/sample-001.png": "binary"})

    settings = Settings(
        HF_TOKEN="test-token",
        ARCHCAD_LOCAL_DIR=raw_dir,
        ARCHCAD_PROCESSED_DIR=processed_dir,
    )
    settings.ensure_directories()

    manifest = ArchCADInspector(settings).inspect()
    assert manifest["sample_count"] == 1
    sample = manifest["samples"][0]
    assert sample["sample_id"] == "train/sample-001"
    assert set(sample["available_modalities"]) == {"image", "json", "svg"}
    assert sample["validation_flags"]["is_fully_aligned"] is False
