from __future__ import annotations

import zipfile
from pathlib import Path

from app.schemas.archcad import ArchCADManifestRecord
from app.services.archcad_normalizer import ArchCADNormalizer
from app.utils.file_refs import make_file_ref


def _write_zip(path: Path, members: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)


def test_normalizer_builds_stats_from_json_and_qa(tmp_path: Path) -> None:
    json_zip = tmp_path / "json.zip"
    qa_zip = tmp_path / "caption.zip"
    _write_zip(
        json_zip,
        {
            "sample-001.json": """
            [
              {"type":"LINE","start":[0,0],"end":[10,0],"semantic":"single_door","instance":"single_door_1"},
              {"type":"CIRCLE","center":[5,5],"radius":2,"semantic":"column","instance":"column_1"}
            ]
            """
        },
    )
    _write_zip(
        qa_zip,
        {"sample-001.txt": "Question: How many doors?\\nAnswer: One single door."},
    )

    record = ArchCADManifestRecord(
        sample_id="sample-001",
        available_modalities=["json", "qa"],
        file_paths={
            "json": make_file_ref(json_zip, "sample-001.json"),
            "qa": make_file_ref(qa_zip, "sample-001.txt"),
        },
        validation_flags={"has_json": True},
    )

    sample = ArchCADNormalizer().normalize_sample(record)
    assert sample.stats.element_count == 2
    assert sample.stats.semantic_counts["single_door"] == 1
    assert sample.stats.semantic_counts["column"] == 1
    assert sample.stats.qa_count == 1
