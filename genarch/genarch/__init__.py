"""
genarch - Generative Architecture Floor Plan and 3D Mesh Generator

A deterministic Python package for generating floor plans (DXF) and 3D meshes (GLB/OBJ)
from architectural constraints.

Usage:
    python -m genarch --constraints constraints.json --out runs/run_001 --seed 123

Or programmatically:
    from genarch import generate_floorplan, FloorPlanConstraints

    constraints = FloorPlanConstraints.from_json("constraints.json")
    floor_plan, metadata = generate_floorplan(constraints, seed=123)
"""

__version__ = "0.1.0"
__author__ = "Architect AI Platform"

from genarch.models.constraints import (
    FloorPlanConstraints,
    RoomSpec,
    OpeningSpec,
    Point2D,
    BuildingType,
)
from genarch.models.floor_plan import (
    FloorPlan,
    Room,
    WallSegment,
    Opening,
)
from genarch.models.run_metadata import RunMetadata
from genarch.generator.floor_plan_generator import generate_floorplan

__all__ = [
    # Version
    "__version__",
    # Constraints
    "FloorPlanConstraints",
    "RoomSpec",
    "OpeningSpec",
    "Point2D",
    "BuildingType",
    # Floor Plan
    "FloorPlan",
    "Room",
    "WallSegment",
    "Opening",
    # Metadata
    "RunMetadata",
    # Generator
    "generate_floorplan",
]
