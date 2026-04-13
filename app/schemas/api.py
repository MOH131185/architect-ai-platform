from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ArchCADDownloadRequest(BaseModel):
    """Request body for dataset downloads."""

    force: bool = False
    strategy: Literal["auto", "snapshot", "hf-cli", "git"] = "auto"


class ArchCADIndexRequest(BaseModel):
    """Request body for dataset indexing."""

    force_reindex: bool = False
    limit: int | None = Field(default=None, ge=1)
