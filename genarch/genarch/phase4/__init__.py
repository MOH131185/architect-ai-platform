"""
Phase 4: A1 Sheet Assembler

Composes a single print-ready A1 PDF from Phase 1-3 outputs.

Usage:
    python -m genarch.phase4 --run runs/run_001 --out output.pdf
"""

__version__ = "4.0.0"

from .assemble import A1SheetAssembler
from .layout import A1Layout, mm_to_points, points_to_mm
from .assets import load_image, hash_file, find_asset
from .vector_import import load_svg, convert_dxf_to_svg
from .svg_generator import generate_svg_from_plan

__all__ = [
    "A1SheetAssembler",
    "A1Layout",
    "mm_to_points",
    "points_to_mm",
    "load_image",
    "hash_file",
    "find_asset",
    "load_svg",
    "convert_dxf_to_svg",
    "generate_svg_from_plan",
]
