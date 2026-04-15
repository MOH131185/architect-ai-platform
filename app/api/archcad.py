from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.exceptions import ArchCADError
from app.core.settings import Settings, get_settings
from app.schemas.api import ArchCADDownloadRequest, ArchCADIndexRequest
from app.services.archcad_downloader import ArchCADDownloader
from app.services.archcad_indexer import ArchCADIndexer
from app.services.archcad_search import ArchCADSearchService

router = APIRouter(prefix="/datasets/archcad", tags=["archcad"])
VALID_MODALITIES = {"image", "svg", "json", "qa", "pointcloud"}


def _modalities_from_query(raw_modalities: str | None) -> list[str]:
    if not raw_modalities:
        return []
    values = [item.strip() for item in raw_modalities.split(",") if item.strip()]
    invalid = sorted(set(values) - VALID_MODALITIES)
    if invalid:
        raise ArchCADError(
            "Invalid modality filter",
            context={"invalid_modalities": invalid, "allowed": sorted(VALID_MODALITIES)},
        )
    return values


@router.post("/download")
async def download_archcad(
    request: ArchCADDownloadRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    downloader = ArchCADDownloader(settings)
    return downloader.download(force=request.force, strategy=request.strategy)


@router.get("/status")
async def archcad_status(settings: Settings = Depends(get_settings)) -> dict[str, object]:
    search_service = ArchCADSearchService(settings)
    return search_service.status()


@router.post("/index")
async def index_archcad(
    request: ArchCADIndexRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    indexer = ArchCADIndexer(settings)
    return indexer.build_index(force_reindex=request.force_reindex, limit=request.limit)


@router.get("/samples")
async def list_archcad_samples(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    semantic: str | None = Query(default=None),
    instance: str | None = Query(default=None),
    modalities: str | None = Query(default=None, description="Comma-separated modalities"),
    split: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    search_service = ArchCADSearchService(settings)
    return search_service.list_samples(
        offset=offset,
        limit=limit,
        semantic=semantic,
        instance=instance,
        modalities=_modalities_from_query(modalities),
        split=split,
    )


@router.get("/samples/{sample_id}")
async def get_archcad_sample(
    sample_id: str,
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    search_service = ArchCADSearchService(settings)
    return search_service.get_sample(sample_id)


@router.get("/samples/{sample_id}/elements")
async def get_archcad_elements(
    sample_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    semantic: str | None = Query(default=None),
    instance: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    search_service = ArchCADSearchService(settings)
    return search_service.get_elements(
        sample_id=sample_id,
        offset=offset,
        limit=limit,
        semantic=semantic,
        instance=instance,
    )


@router.get("/samples/{sample_id}/qa")
async def get_archcad_qa(
    sample_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    search_service = ArchCADSearchService(settings)
    return search_service.get_qa(sample_id=sample_id, offset=offset, limit=limit)


@router.get("/search")
async def search_archcad(
    semantic: str | None = Query(default=None),
    instance: str | None = Query(default=None),
    modalities: str | None = Query(default=None, description="Comma-separated modalities"),
    split: str | None = Query(default=None),
    min_count: int | None = Query(default=None, ge=1),
    max_count: int | None = Query(default=None, ge=1),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    search_service = ArchCADSearchService(settings)
    return search_service.search(
        semantic=semantic,
        instance=instance,
        modalities=_modalities_from_query(modalities),
        split=split,
        min_count=min_count,
        max_count=max_count,
        offset=offset,
        limit=limit,
    )


@router.get("/stats/semantics")
async def semantic_stats(settings: Settings = Depends(get_settings)) -> dict[str, object]:
    search_service = ArchCADSearchService(settings)
    return search_service.semantic_stats()
