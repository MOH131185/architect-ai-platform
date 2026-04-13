from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ArchCADError(Exception):
    """Base exception for ArchCAD backend failures."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        context: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.context = context or {}


class ArchCADNotFoundError(ArchCADError):
    """Raised when a requested resource cannot be found."""

    def __init__(self, message: str, *, context: dict[str, Any] | None = None) -> None:
        super().__init__(message, status_code=404, context=context)


class ArchCADDownloadError(ArchCADError):
    """Raised when dataset download fails."""

    def __init__(self, message: str, *, context: dict[str, Any] | None = None) -> None:
        super().__init__(message, status_code=502, context=context)


class ArchCADIndexError(ArchCADError):
    """Raised when indexing or normalization fails."""

    def __init__(self, message: str, *, context: dict[str, Any] | None = None) -> None:
        super().__init__(message, status_code=500, context=context)


def register_exception_handlers(application: FastAPI) -> None:
    """Register JSON exception handlers."""

    @application.exception_handler(ArchCADError)
    async def handle_archcad_error(_: Request, exc: ArchCADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "error_type": exc.__class__.__name__,
                "context": exc.context,
            },
        )

    @application.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Unexpected backend error",
                "error_type": exc.__class__.__name__,
                "context": {"message": str(exc)},
            },
        )
