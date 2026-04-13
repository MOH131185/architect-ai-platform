from fastapi import APIRouter

from app.api.archcad import router as archcad_router

api_router = APIRouter()
api_router.include_router(archcad_router)
