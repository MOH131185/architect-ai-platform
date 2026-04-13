from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.exceptions import ArchCADNotFoundError
from app.core.logging import get_logger
from app.core.settings import Settings
from app.schemas.archcad import ArchCADDatasetManifest, ArchCADManifestRecord
from app.utils.file_refs import iter_files, make_file_ref, write_json, zip_member_paths

logger = get_logger(__name__)

KNOWN_SPLITS = {"train", "val", "valid", "validation", "test"}
MODALITIES = ("image", "svg", "json", "qa", "pointcloud")


def _normalize_label(value: str | None) -> str | None:
    if not value:
        return None
    normalized = (
        str(value)
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )
    return normalized or None


def detect_modality(path_like: str, *, fallback: str | None = None) -> str | None:
    """Infer modality from a file or archive path."""
    lower = path_like.lower()
    suffix = Path(lower).suffix

    if "caption" in lower or "qa" in lower:
        return "qa"
    if "point" in lower or "cloud" in lower:
        return "pointcloud"
    if suffix == ".svg" or "svg" in lower:
        return "svg"
    if suffix == ".json":
        return "json" if fallback != "qa" else "qa"
    if suffix in {".png", ".jpg", ".jpeg", ".webp"} or "png" in lower or "image" in lower:
        return "image"
    if suffix in {".npy", ".npz", ".csv", ".ply", ".pts"}:
        return "pointcloud"
    if suffix in {".txt", ".jsonl"} and fallback == "qa":
        return "qa"
    return fallback


class ArchCADInspector:
    """Inspect downloaded dataset files and produce a sample manifest."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def inspect(self) -> dict[str, Any]:
        dataset_dir = self.settings.archcad_local_dir.resolve()
        if not dataset_dir.exists():
            raise ArchCADNotFoundError(
                "ArchCAD dataset directory does not exist",
                context={"dataset_dir": str(dataset_dir)},
            )

        grouped_samples: dict[str, dict[str, Any]] = {}

        for entry in self._iter_dataset_entries(dataset_dir):
            sample_id = entry["sample_id"]
            sample = grouped_samples.setdefault(
                sample_id,
                {
                    "sample_id": sample_id,
                    "split": entry["split"],
                    "file_paths": {},
                    "available_modalities": [],
                    "duplicates": [],
                },
            )
            modality = entry["modality"]
            if modality in sample["file_paths"]:
                sample["duplicates"].append(modality)
                continue
            sample["file_paths"][modality] = entry["ref"]
            if modality not in sample["available_modalities"]:
                sample["available_modalities"].append(modality)
            if not sample["split"] and entry["split"]:
                sample["split"] = entry["split"]

        modality_summary: Counter[str] = Counter()
        records: list[ArchCADManifestRecord] = []
        for sample_id in sorted(grouped_samples):
            raw = grouped_samples[sample_id]
            validation_flags = self._build_validation_flags(raw["available_modalities"], raw["duplicates"])
            for modality in raw["available_modalities"]:
                modality_summary[modality] += 1
            records.append(
                ArchCADManifestRecord(
                    sample_id=sample_id,
                    split=raw["split"],
                    available_modalities=sorted(raw["available_modalities"]),
                    file_paths=raw["file_paths"],
                    validation_flags=validation_flags,
                )
            )

        manifest = ArchCADDatasetManifest(
            dataset_id=self.settings.archcad_dataset_id,
            dataset_dir=str(dataset_dir),
            generated_at=datetime.now(timezone.utc).isoformat(),
            sample_count=len(records),
            modality_summary=dict(modality_summary),
            samples=records,
        )

        payload = manifest.model_dump(mode="json")
        write_json(self.settings.archcad_manifest_path, payload)
        logger.info(
            "ArchCAD manifest generated",
            extra={
                "context": {
                    "sample_count": manifest.sample_count,
                    "manifest_path": str(self.settings.archcad_manifest_path),
                }
            },
        )
        return payload

    def _iter_dataset_entries(self, dataset_dir: Path) -> list[dict[str, str | None]]:
        entries: list[dict[str, str | None]] = []

        for path in iter_files(dataset_dir):
            if self._should_ignore(path):
                continue

            archive_hint = detect_modality(str(path))
            if path.suffix.lower() == ".zip":
                for member_path in zip_member_paths(path):
                    modality = detect_modality(member_path, fallback=archive_hint)
                    if not modality:
                        continue
                    split = self._infer_split(member_path)
                    basename = Path(member_path).stem
                    sample_id = f"{split}/{basename}" if split else basename
                    entries.append(
                        {
                            "sample_id": sample_id,
                            "split": split,
                            "modality": modality,
                            "ref": make_file_ref(path, member_path),
                        }
                    )
                continue

            modality = detect_modality(str(path))
            if not modality:
                continue
            relative_path = path.relative_to(dataset_dir).as_posix()
            split = self._infer_split(relative_path)
            basename = path.stem
            sample_id = f"{split}/{basename}" if split else basename
            entries.append(
                {
                    "sample_id": sample_id,
                    "split": split,
                    "modality": modality,
                    "ref": make_file_ref(path),
                }
            )

        return entries

    def _build_validation_flags(self, available_modalities: list[str], duplicates: list[str]) -> dict[str, Any]:
        available = set(available_modalities)
        missing = [modality for modality in MODALITIES if modality not in available]
        return {
            "has_image": "image" in available,
            "has_svg": "svg" in available,
            "has_json": "json" in available,
            "has_qa": "qa" in available,
            "has_pointcloud": "pointcloud" in available,
            "is_fully_aligned": not missing,
            "missing_modalities": missing,
            "duplicate_modalities": sorted(set(duplicates)),
        }

    def _infer_split(self, relative_path: str) -> str | None:
        for part in Path(relative_path).parts:
            normalized = _normalize_label(part)
            if normalized in KNOWN_SPLITS:
                return normalized
        return None

    def _should_ignore(self, path: Path) -> bool:
        ignored_parts = {".cache", ".ipynb_checkpoints", "assets"}
        return bool(ignored_parts.intersection(path.parts)) or path.name.lower().startswith("readme")
