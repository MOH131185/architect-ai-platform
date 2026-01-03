"""
genarch Pipeline - End-to-end architectural generation.

Orchestrates all phases:
- Phase 1: Floor plan + 3D mesh generation
- Phase 2: Blender ControlNet snapshot rendering
- Phase 3: AI perspective render generation (future)
- Phase 4: A1 sheet PDF assembly

Usage:
    python -m genarch.pipeline --prompt "modern minimalist villa 200sqm" --out runs/run_001
"""

__version__ = "1.0.0"

from .runner import PipelineRunner, PipelineConfig
from .cache import PipelineCache

__all__ = [
    "PipelineRunner",
    "PipelineConfig",
    "PipelineCache",
]
