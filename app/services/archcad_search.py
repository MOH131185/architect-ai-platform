from __future__ import annotations

from typing import Any

from app.core.exceptions import ArchCADNotFoundError
from app.core.settings import Settings
from app.models.index_store import ArchCADIndexStore
from app.utils.file_refs import read_json_if_exists


class ArchCADSearchService:
    """Query indexed ArchCAD samples and annotations."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.store = ArchCADIndexStore(settings.archcad_db_path)

    def status(self) -> dict[str, Any]:
        download_manifest = read_json_if_exists(self.settings.archcad_download_manifest_path)
        dataset_manifest = read_json_if_exists(self.settings.archcad_manifest_path)
        stats_cache = read_json_if_exists(self.settings.archcad_stats_path)
        sqlite_available = self.settings.archcad_db_path.exists()
        summary = self.store.summary() if sqlite_available else {"sample_count": 0, "element_count": 0, "qa_count": 0}
        return {
            "dataset_id": self.settings.archcad_dataset_id,
            "directories": {
                "raw": str(self.settings.archcad_local_dir.resolve()),
                "processed": str(self.settings.archcad_processed_dir.resolve()),
                "cache": str(self.settings.archcad_cache_dir.resolve()),
                "manifests": str(self.settings.archcad_manifest_dir.resolve()),
            },
            "download": download_manifest,
            "manifest": {
                "path": str(self.settings.archcad_manifest_path),
                "available": dataset_manifest is not None,
                "sample_count": dataset_manifest.get("sample_count", 0) if dataset_manifest else 0,
            },
            "index": {
                "sqlite_path": str(self.settings.archcad_db_path),
                "sqlite_available": sqlite_available,
                "jsonl_path": str(self.settings.archcad_jsonl_path),
                "jsonl_available": self.settings.archcad_jsonl_path.exists(),
                "semantic_index_path": str(self.settings.archcad_semantic_index_path),
                "semantic_index_available": self.settings.archcad_semantic_index_path.exists(),
                "stats_cache": stats_cache,
                "summary": summary,
            },
        }

    def list_samples(
        self,
        *,
        offset: int,
        limit: int,
        semantic: str | None = None,
        instance: str | None = None,
        modalities: list[str] | None = None,
        split: str | None = None,
    ) -> dict[str, Any]:
        result = self.store.list_samples(
            offset=offset,
            limit=limit,
            semantic=semantic,
            instance=instance,
            modalities=modalities,
            split=split,
        )
        return {
            "items": result["items"],
            "pagination": {"offset": offset, "limit": limit, "total": result["total"]},
            "filters": {
                "semantic": semantic,
                "instance": instance,
                "modalities": modalities or [],
                "split": split,
            },
            "summary": {"returned": len(result["items"])},
        }

    def get_sample(self, sample_id: str) -> dict[str, Any]:
        sample = self.store.get_sample(sample_id)
        if not sample:
            raise ArchCADNotFoundError("Sample not found", context={"sample_id": sample_id})
        return sample

    def get_elements(
        self,
        *,
        sample_id: str,
        offset: int,
        limit: int,
        semantic: str | None = None,
        instance: str | None = None,
    ) -> dict[str, Any]:
        self._ensure_sample(sample_id)
        result = self.store.get_elements(
            sample_id,
            offset=offset,
            limit=limit,
            semantic=semantic,
            instance=instance,
        )
        return {
            "sample_id": sample_id,
            "items": result["items"],
            "pagination": {"offset": offset, "limit": limit, "total": result["total"]},
            "filters": {"semantic": semantic, "instance": instance},
        }

    def get_qa(self, *, sample_id: str, offset: int, limit: int) -> dict[str, Any]:
        self._ensure_sample(sample_id)
        result = self.store.get_qa(sample_id, offset=offset, limit=limit)
        return {
            "sample_id": sample_id,
            "items": result["items"],
            "pagination": {"offset": offset, "limit": limit, "total": result["total"]},
        }

    def search(
        self,
        *,
        semantic: str | None,
        instance: str | None,
        modalities: list[str] | None,
        split: str | None,
        min_count: int | None,
        max_count: int | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        result = self.store.search(
            semantic=semantic,
            instance=instance,
            modalities=modalities,
            split=split,
            min_count=min_count,
            max_count=max_count,
            offset=offset,
            limit=limit,
        )
        return {
            "items": result["items"],
            "pagination": {"offset": offset, "limit": limit, "total": result["total"]},
            "filters": {
                "semantic": semantic,
                "instance": instance,
                "modalities": modalities or [],
                "split": split,
                "min_count": min_count,
                "max_count": max_count,
            },
            # TODO: Extend this search service to use embeddings/vector DB retrieval for CAD RAG.
        }

    def semantic_stats(self) -> dict[str, Any]:
        items = self.store.semantic_stats()
        return {
            "items": items,
            "summary": {
                "semantic_count": len(items),
                "top_semantic": items[0]["semantic"] if items else None,
            },
        }

    def _ensure_sample(self, sample_id: str) -> None:
        if not self.store.get_sample(sample_id):
            raise ArchCADNotFoundError("Sample not found", context={"sample_id": sample_id})
