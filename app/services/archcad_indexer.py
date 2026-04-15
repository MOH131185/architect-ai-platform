from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from app.core.exceptions import ArchCADIndexError
from app.core.logging import get_logger
from app.core.settings import Settings
from app.models.index_store import ArchCADIndexStore
from app.schemas.archcad import ArchCADDatasetManifest, ArchCADManifestRecord
from app.services.archcad_inspector import ArchCADInspector
from app.services.archcad_normalizer import ArchCADNormalizer
from app.utils.file_refs import write_json

logger = get_logger(__name__)


class ArchCADIndexer:
    """Build lightweight search indices from ArchCAD raw data."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.inspector = ArchCADInspector(settings)
        self.normalizer = ArchCADNormalizer()
        self.store = ArchCADIndexStore(settings.archcad_db_path)

    def build_index(self, *, force_reindex: bool = False, limit: int | None = None) -> dict[str, Any]:
        manifest_payload = self.inspector.inspect()
        manifest = ArchCADDatasetManifest.model_validate(manifest_payload)
        records: list[ArchCADManifestRecord] = manifest.samples[:limit] if limit else manifest.samples
        if not records:
            raise ArchCADIndexError("No ArchCAD samples were discovered to index")

        self.store.initialize(reset=force_reindex)
        processed_samples = 0
        failed_samples = 0
        element_total = 0
        qa_total = 0
        semantic_counts: Counter[str] = Counter()
        semantic_index: defaultdict[str, list[str]] = defaultdict(list)
        failures: list[dict[str, str]] = []

        with self.settings.archcad_jsonl_path.open("w", encoding="utf-8") as jsonl_handle:
            for record in records:
                try:
                    sample = self.normalizer.normalize_sample(record)
                    self.store.upsert_sample(sample)
                    jsonl_handle.write(sample.model_dump_json(by_alias=True))
                    jsonl_handle.write("\n")

                    processed_samples += 1
                    element_total += sample.stats.element_count
                    qa_total += sample.stats.qa_count
                    for semantic, count in sample.stats.semantic_counts.items():
                        semantic_counts[semantic] += count
                        semantic_index[semantic].append(sample.sample_id)
                except Exception as exc:
                    failed_samples += 1
                    failures.append({"sample_id": record.sample_id, "error": str(exc)})
                    logger.warning(
                        "ArchCAD sample normalization failed",
                        extra={"context": {"sample_id": record.sample_id, "error": str(exc)}},
                    )

        write_json(
            self.settings.archcad_semantic_index_path,
            {semantic: sorted(set(sample_ids)) for semantic, sample_ids in semantic_index.items()},
        )
        write_json(
            self.settings.archcad_stats_path,
            {
                "dataset_id": self.settings.archcad_dataset_id,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "processed_samples": processed_samples,
                "failed_samples": failed_samples,
                "element_total": element_total,
                "qa_total": qa_total,
                "semantic_counts": dict(semantic_counts),
                "failures": failures[:100],
            },
        )

        summary = self.store.summary()
        return {
            "dataset_id": self.settings.archcad_dataset_id,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
            "processed_samples": processed_samples,
            "failed_samples": failed_samples,
            "element_total": element_total,
            "qa_total": qa_total,
            "manifest_path": str(self.settings.archcad_manifest_path),
            "jsonl_path": str(self.settings.archcad_jsonl_path),
            "sqlite_path": str(self.settings.archcad_db_path),
            "semantic_index_path": str(self.settings.archcad_semantic_index_path),
            "summary": summary,
        }
