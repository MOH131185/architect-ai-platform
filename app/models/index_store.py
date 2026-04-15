from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable

from app.core.exceptions import ArchCADError
from app.schemas.archcad import ArchCADSample

VALID_MODALITIES = {"image", "svg", "json", "qa", "pointcloud"}


class ArchCADIndexStore:
    """SQLite-backed sample and annotation index."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def initialize(self, *, reset: bool = False) -> None:
        if reset and self.db_path.exists():
            self.db_path.unlink()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS samples (
                    sample_id TEXT PRIMARY KEY,
                    split TEXT,
                    has_image INTEGER NOT NULL,
                    has_svg INTEGER NOT NULL,
                    has_json INTEGER NOT NULL,
                    has_qa INTEGER NOT NULL,
                    has_pointcloud INTEGER NOT NULL,
                    modalities_json TEXT NOT NULL,
                    stats_json TEXT NOT NULL,
                    validation_json TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS elements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sample_id TEXT NOT NULL,
                    element_id TEXT,
                    element_type TEXT NOT NULL,
                    semantic TEXT,
                    instance TEXT,
                    source_modality TEXT NOT NULL,
                    geometry_json TEXT NOT NULL,
                    style_json TEXT NOT NULL,
                    bbox_json TEXT
                );

                CREATE TABLE IF NOT EXISTS qa_pairs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sample_id TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    metadata_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_elements_sample_id ON elements(sample_id);
                CREATE INDEX IF NOT EXISTS idx_elements_semantic ON elements(semantic);
                CREATE INDEX IF NOT EXISTS idx_elements_instance ON elements(instance);
                CREATE INDEX IF NOT EXISTS idx_qa_sample_id ON qa_pairs(sample_id);
                """
            )

    def upsert_sample(self, sample: ArchCADSample) -> None:
        payload = sample.model_dump(mode="json", by_alias=True)
        modalities = payload["modalities"]
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO samples (
                    sample_id, split, has_image, has_svg, has_json, has_qa, has_pointcloud,
                    modalities_json, stats_json, validation_json, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sample.sample_id,
                    sample.split,
                    int(bool(modalities.get("image"))),
                    int(bool(modalities.get("svg"))),
                    int(bool(modalities.get("json"))),
                    int(bool(modalities.get("qa"))),
                    int(bool(modalities.get("pointcloud"))),
                    json.dumps(modalities),
                    json.dumps(payload["stats"]),
                    json.dumps(payload["validation_flags"]),
                    json.dumps(payload),
                ),
            )
            connection.execute("DELETE FROM elements WHERE sample_id = ?", (sample.sample_id,))
            connection.execute("DELETE FROM qa_pairs WHERE sample_id = ?", (sample.sample_id,))
            connection.executemany(
                """
                INSERT INTO elements (
                    sample_id, element_id, element_type, semantic, instance,
                    source_modality, geometry_json, style_json, bbox_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    (
                        sample.sample_id,
                        element.element_id,
                        element.type,
                        element.semantic,
                        element.instance,
                        element.source_modality,
                        json.dumps(element.geometry),
                        json.dumps(element.style),
                        json.dumps(element.bounding_box.model_dump())
                        if element.bounding_box
                        else None,
                    )
                    for element in sample.elements
                ),
            )
            connection.executemany(
                """
                INSERT INTO qa_pairs (sample_id, question, answer, metadata_json)
                VALUES (?, ?, ?, ?)
                """,
                (
                    (
                        sample.sample_id,
                        qa.question,
                        qa.answer,
                        json.dumps(qa.metadata),
                    )
                    for qa in sample.qa_pairs
                ),
            )

    def list_samples(
        self,
        *,
        offset: int,
        limit: int,
        semantic: str | None = None,
        instance: str | None = None,
        modalities: Iterable[str] | None = None,
        split: str | None = None,
    ) -> dict[str, Any]:
        conditions, params = self._sample_conditions(
            semantic=semantic,
            instance=instance,
            modalities=modalities,
            split=split,
        )
        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        with self._connect() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) AS total FROM samples s{where_clause}",
                params,
            ).fetchone()["total"]
            rows = connection.execute(
                f"""
                SELECT s.sample_id, s.split, s.modalities_json, s.stats_json, s.validation_json
                FROM samples s
                {where_clause}
                ORDER BY s.sample_id
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ).fetchall()

        items = [
            {
                "sample_id": row["sample_id"],
                "split": row["split"],
                "modalities": json.loads(row["modalities_json"]),
                "stats": json.loads(row["stats_json"]),
                "validation_flags": json.loads(row["validation_json"]),
            }
            for row in rows
        ]
        return {"items": items, "total": total}

    def get_sample(self, sample_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM samples WHERE sample_id = ?",
                (sample_id,),
            ).fetchone()
        return json.loads(row["payload_json"]) if row else None

    def get_elements(
        self,
        sample_id: str,
        *,
        offset: int,
        limit: int,
        semantic: str | None = None,
        instance: str | None = None,
    ) -> dict[str, Any]:
        conditions = ["sample_id = ?"]
        params: list[Any] = [sample_id]
        if semantic:
            conditions.append("semantic = ?")
            params.append(semantic)
        if instance:
            conditions.append("instance = ?")
            params.append(instance)
        where_clause = f" WHERE {' AND '.join(conditions)}"

        with self._connect() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) AS total FROM elements{where_clause}",
                params,
            ).fetchone()["total"]
            rows = connection.execute(
                f"""
                SELECT element_id, element_type, semantic, instance, source_modality,
                       geometry_json, style_json, bbox_json
                FROM elements
                {where_clause}
                ORDER BY id
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ).fetchall()

        items = [
            {
                "element_id": row["element_id"],
                "type": row["element_type"],
                "semantic": row["semantic"],
                "instance": row["instance"],
                "source_modality": row["source_modality"],
                "geometry": json.loads(row["geometry_json"]),
                "style": json.loads(row["style_json"]),
                "bounding_box": json.loads(row["bbox_json"]) if row["bbox_json"] else None,
            }
            for row in rows
        ]
        return {"items": items, "total": total}

    def get_qa(self, sample_id: str, *, offset: int, limit: int) -> dict[str, Any]:
        with self._connect() as connection:
            total = connection.execute(
                "SELECT COUNT(*) AS total FROM qa_pairs WHERE sample_id = ?",
                (sample_id,),
            ).fetchone()["total"]
            rows = connection.execute(
                """
                SELECT question, answer, metadata_json
                FROM qa_pairs
                WHERE sample_id = ?
                ORDER BY id
                LIMIT ? OFFSET ?
                """,
                (sample_id, limit, offset),
            ).fetchall()

        items = [
            {
                "question": row["question"],
                "answer": row["answer"],
                "metadata": json.loads(row["metadata_json"]),
            }
            for row in rows
        ]
        return {"items": items, "total": total}

    def search(
        self,
        *,
        semantic: str | None,
        instance: str | None,
        modalities: Iterable[str] | None,
        split: str | None,
        min_count: int | None,
        max_count: int | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        if not semantic and not instance:
            return self.list_samples(
                offset=offset,
                limit=limit,
                modalities=modalities,
                split=split,
            )

        conditions = []
        params: list[Any] = []
        if semantic:
            conditions.append("e.semantic = ?")
            params.append(semantic)
        if instance:
            conditions.append("e.instance = ?")
            params.append(instance)
        if split:
            conditions.append("s.split = ?")
            params.append(split)
        for modality in modalities or []:
            conditions.append(f"s.has_{modality} = 1")

        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        having_parts = []
        having_params: list[Any] = []
        if min_count is not None:
            having_parts.append("COUNT(e.id) >= ?")
            having_params.append(min_count)
        if max_count is not None:
            having_parts.append("COUNT(e.id) <= ?")
            having_params.append(max_count)
        having_clause = f" HAVING {' AND '.join(having_parts)}" if having_parts else ""

        count_query = (
            "SELECT COUNT(*) AS total FROM ("
            "SELECT s.sample_id FROM samples s "
            "JOIN elements e ON e.sample_id = s.sample_id "
            f"{where_clause} GROUP BY s.sample_id{having_clause}"
            ")"
        )
        data_query = (
            "SELECT s.sample_id, s.split, s.modalities_json, s.stats_json, "
            "COUNT(e.id) AS match_count "
            "FROM samples s "
            "JOIN elements e ON e.sample_id = s.sample_id "
            f"{where_clause} GROUP BY s.sample_id{having_clause} "
            "ORDER BY match_count DESC, s.sample_id "
            "LIMIT ? OFFSET ?"
        )

        with self._connect() as connection:
            total = connection.execute(
                count_query,
                [*params, *having_params],
            ).fetchone()["total"]
            rows = connection.execute(
                data_query,
                [*params, *having_params, limit, offset],
            ).fetchall()

        items = [
            {
                "sample_id": row["sample_id"],
                "split": row["split"],
                "match_count": row["match_count"],
                "modalities": json.loads(row["modalities_json"]),
                "stats": json.loads(row["stats_json"]),
            }
            for row in rows
        ]
        return {"items": items, "total": total}

    def semantic_stats(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT semantic, COUNT(*) AS element_count, COUNT(DISTINCT sample_id) AS sample_count
                FROM elements
                WHERE semantic IS NOT NULL AND semantic != ''
                GROUP BY semantic
                ORDER BY sample_count DESC, semantic ASC
                """
            ).fetchall()
        return [
            {
                "semantic": row["semantic"],
                "element_count": row["element_count"],
                "sample_count": row["sample_count"],
            }
            for row in rows
        ]

    def summary(self) -> dict[str, int]:
        with self._connect() as connection:
            sample_count = connection.execute("SELECT COUNT(*) AS total FROM samples").fetchone()["total"]
            element_count = connection.execute("SELECT COUNT(*) AS total FROM elements").fetchone()["total"]
            qa_count = connection.execute("SELECT COUNT(*) AS total FROM qa_pairs").fetchone()["total"]
        return {
            "sample_count": sample_count,
            "element_count": element_count,
            "qa_count": qa_count,
        }

    def _sample_conditions(
        self,
        *,
        semantic: str | None,
        instance: str | None,
        modalities: Iterable[str] | None,
        split: str | None,
    ) -> tuple[list[str], list[Any]]:
        conditions: list[str] = []
        params: list[Any] = []
        if split:
            conditions.append("s.split = ?")
            params.append(split)
        if semantic:
            conditions.append(
                "EXISTS (SELECT 1 FROM elements e WHERE e.sample_id = s.sample_id AND e.semantic = ?)"
            )
            params.append(semantic)
        if instance:
            conditions.append(
                "EXISTS (SELECT 1 FROM elements e WHERE e.sample_id = s.sample_id AND e.instance = ?)"
            )
            params.append(instance)
        for modality in modalities or []:
            if modality not in VALID_MODALITIES:
                raise ArchCADError(
                    "Invalid modality filter",
                    context={"invalid_modality": modality, "allowed": sorted(VALID_MODALITIES)},
                )
            conditions.append(f"s.has_{modality} = 1")
        return conditions, params

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection
