from __future__ import annotations

from fastapi import FastAPI

from app.api.router import api_router
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    """Create the FastAPI application."""
    configure_logging()

    application = FastAPI(
        title="ArchiAI ArchCAD Backend",
        version="0.1.0",
        summary="ArchCAD ingestion, indexing, and retrieval services for ArchiAI",
    )
    application.include_router(api_router)
    register_exception_handlers(application)

    @application.get("/health", tags=["health"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
