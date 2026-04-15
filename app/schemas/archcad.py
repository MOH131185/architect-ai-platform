from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ArchCADPoint(BaseModel):
    x: float
    y: float
    z: float | None = None


class ArchCADBoundingBox(BaseModel):
    min_x: float
    min_y: float
    max_x: float
    max_y: float


class ArchCADQA(BaseModel):
    question: str
    answer: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArchCADModalityRefs(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    image: str | None = None
    svg: str | None = None
    json_path: str | None = Field(default=None, alias="json")
    qa: str | None = None
    pointcloud: str | None = None


class ArchCADElement(BaseModel):
    element_id: str | None = None
    type: str
    semantic: str | None = None
    instance: str | None = None
    geometry: dict[str, Any] = Field(default_factory=dict)
    style: dict[str, Any] = Field(default_factory=dict)
    bounding_box: ArchCADBoundingBox | None = None
    source_modality: str = "json"


class ArchCADSampleStats(BaseModel):
    element_count: int = 0
    semantic_counts: dict[str, int] = Field(default_factory=dict)
    instance_counts: dict[str, int] = Field(default_factory=dict)
    qa_count: int = 0


class ArchCADSample(BaseModel):
    sample_id: str
    split: str | None = None
    modalities: ArchCADModalityRefs = Field(default_factory=ArchCADModalityRefs)
    elements: list[ArchCADElement] = Field(default_factory=list)
    qa_pairs: list[ArchCADQA] = Field(default_factory=list)
    stats: ArchCADSampleStats = Field(default_factory=ArchCADSampleStats)
    validation_flags: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArchCADManifestRecord(BaseModel):
    sample_id: str
    split: str | None = None
    available_modalities: list[str] = Field(default_factory=list)
    file_paths: dict[str, str] = Field(default_factory=dict)
    validation_flags: dict[str, Any] = Field(default_factory=dict)


class ArchCADDatasetManifest(BaseModel):
    dataset_id: str
    dataset_dir: str
    generated_at: str
    sample_count: int
    modality_summary: dict[str, int] = Field(default_factory=dict)
    samples: list[ArchCADManifestRecord] = Field(default_factory=list)
