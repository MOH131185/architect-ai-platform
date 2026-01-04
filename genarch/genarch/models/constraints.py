"""
Input constraint models for floor plan generation.

These models define the specification format for generating floor plans,
including room requirements, envelope geometry, and building parameters.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Optional, Tuple


class BuildingType(Enum):
    """Building type classification."""
    RESIDENTIAL = "residential"
    COMMERCIAL = "commercial"
    HEALTHCARE = "healthcare"
    EDUCATIONAL = "educational"


@dataclass
class Point2D:
    """2D point in meters."""
    x: float
    y: float

    def __iter__(self):
        return iter((self.x, self.y))

    def to_tuple(self) -> Tuple[float, float]:
        return (self.x, self.y)

    @classmethod
    def from_dict(cls, data: dict) -> Point2D:
        return cls(x=data["x"], y=data["y"])

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y}


@dataclass
class RoomSpec:
    """
    Room specification from constraints.

    Attributes:
        name: Room name (e.g., "Living Room", "Master Bedroom")
        area_m2: Target area in square meters
        adjacency: Names of rooms that should be adjacent to this room
        exterior_wall_preference: If True, room prefers placement on exterior (for windows)
        min_width_m: Minimum room width in meters (UK default: 2.4m)
        min_depth_m: Minimum room depth in meters (UK default: 2.4m)
        aspect_ratio_range: Valid aspect ratio range (width/depth)
    """
    name: str
    area_m2: float
    adjacency: List[str] = field(default_factory=list)
    exterior_wall_preference: bool = False
    min_width_m: float = 2.4  # UK Building Regs minimum
    min_depth_m: float = 2.4
    aspect_ratio_range: Tuple[float, float] = (0.5, 2.0)

    @classmethod
    def from_dict(cls, data: dict) -> RoomSpec:
        return cls(
            name=data["name"],
            area_m2=data["area_m2"],
            adjacency=data.get("adjacency", []),
            exterior_wall_preference=data.get("exterior_wall_preference", False),
            min_width_m=data.get("min_width_m", 2.4),
            min_depth_m=data.get("min_depth_m", 2.4),
            aspect_ratio_range=tuple(data.get("aspect_ratio_range", [0.5, 2.0])),
        )

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "area_m2": self.area_m2,
            "adjacency": self.adjacency,
            "exterior_wall_preference": self.exterior_wall_preference,
            "min_width_m": self.min_width_m,
            "min_depth_m": self.min_depth_m,
            "aspect_ratio_range": list(self.aspect_ratio_range),
        }


@dataclass
class OpeningSpec:
    """
    Opening specification (door/window defaults).

    Attributes:
        type: Opening type (door, window, entrance, patio)
        width_m: Opening width in meters
        height_m: Opening height in meters
        sill_height_m: Sill height from floor in meters (0 for doors)
        wall_preference: Where to place ("exterior", "interior", or specific facade)
    """
    type: str  # door, window, entrance, patio, french, sliding
    width_m: float
    height_m: float
    sill_height_m: float = 0.0
    wall_preference: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> OpeningSpec:
        return cls(
            type=data["type"],
            width_m=data["width_m"],
            height_m=data["height_m"],
            sill_height_m=data.get("sill_height_m", 0.0),
            wall_preference=data.get("wall_preference"),
        )

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "width_m": self.width_m,
            "height_m": self.height_m,
            "sill_height_m": self.sill_height_m,
            "wall_preference": self.wall_preference,
        }


# Default opening specifications (UK Building Regs)
DEFAULT_OPENINGS = {
    "window": OpeningSpec(type="window", width_m=1.2, height_m=1.2, sill_height_m=0.9),
    "door": OpeningSpec(type="door", width_m=0.9, height_m=2.1, sill_height_m=0.0),
    "entrance": OpeningSpec(type="entrance", width_m=1.0, height_m=2.1, sill_height_m=0.0),
    "patio": OpeningSpec(type="patio", width_m=2.4, height_m=2.1, sill_height_m=0.0),
    "french": OpeningSpec(type="french", width_m=1.8, height_m=2.1, sill_height_m=0.0),
}


@dataclass
class FloorPlanConstraints:
    """
    Complete constraints for floor plan generation.

    Attributes:
        envelope_polygon: Building envelope vertices in meters (clockwise)
        total_area_m2: Total target floor area in square meters
        rooms: List of room specifications
        building_type: Type of building (residential, commercial, etc.)
        floor_count: Number of floors (Phase 1: single floor only)
        floor_height_m: Floor-to-floor height in meters
        external_wall_thickness_m: Exterior wall thickness in meters
        internal_wall_thickness_m: Interior wall thickness in meters
        entrance_facade: Facade for main entrance (north, south, east, west)
        openings: Default opening specifications
    """
    envelope_polygon: List[Point2D]
    total_area_m2: float
    rooms: List[RoomSpec]
    building_type: BuildingType = BuildingType.RESIDENTIAL
    floor_count: int = 1  # Phase 1: single floor only
    floor_height_m: float = 3.0
    external_wall_thickness_m: float = 0.35  # 350mm cavity wall
    internal_wall_thickness_m: float = 0.1   # 100mm partition
    entrance_facade: str = "south"  # N, S, E, W
    openings: dict = field(default_factory=lambda: DEFAULT_OPENINGS.copy())

    def __post_init__(self):
        """Validate constraints after initialization."""
        if len(self.envelope_polygon) < 3:
            raise ValueError("Envelope polygon must have at least 3 vertices")
        if self.total_area_m2 <= 0:
            raise ValueError("Total area must be positive")
        if not self.rooms:
            raise ValueError("At least one room is required")
        if self.entrance_facade.lower() not in ("north", "south", "east", "west", "n", "s", "e", "w"):
            raise ValueError(f"Invalid entrance facade: {self.entrance_facade}")

    @property
    def envelope_bounds(self) -> Tuple[float, float, float, float]:
        """Get envelope bounding box (min_x, min_y, max_x, max_y)."""
        xs = [p.x for p in self.envelope_polygon]
        ys = [p.y for p in self.envelope_polygon]
        return (min(xs), min(ys), max(xs), max(ys))

    @property
    def envelope_width(self) -> float:
        """Get envelope width (X dimension)."""
        min_x, _, max_x, _ = self.envelope_bounds
        return max_x - min_x

    @property
    def envelope_depth(self) -> float:
        """Get envelope depth (Y dimension)."""
        _, min_y, _, max_y = self.envelope_bounds
        return max_y - min_y

    @property
    def total_room_area(self) -> float:
        """Get sum of all room target areas."""
        return sum(room.area_m2 for room in self.rooms)

    @classmethod
    def from_dict(cls, data: dict) -> FloorPlanConstraints:
        """Create constraints from dictionary."""
        envelope = [Point2D.from_dict(p) for p in data["envelope"]]
        rooms = [RoomSpec.from_dict(r) for r in data["rooms"]]

        # Parse openings if provided
        openings = DEFAULT_OPENINGS.copy()
        if "openings" in data:
            for key, spec in data["openings"].items():
                openings[key] = OpeningSpec.from_dict(spec)

        return cls(
            envelope_polygon=envelope,
            total_area_m2=data["total_area_m2"],
            rooms=rooms,
            building_type=BuildingType(data.get("building_type", "residential")),
            floor_count=data.get("floor_count", 1),
            floor_height_m=data.get("floor_height_m", 3.0),
            external_wall_thickness_m=data.get("external_wall_thickness_m", 0.35),
            internal_wall_thickness_m=data.get("internal_wall_thickness_m", 0.1),
            entrance_facade=data.get("entrance_facade", "south"),
            openings=openings,
        )

    @classmethod
    def from_json(cls, path: Path | str) -> FloorPlanConstraints:
        """Load constraints from JSON file."""
        with open(path, "r") as f:
            data = json.load(f)
        return cls.from_dict(data)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "envelope": [p.to_dict() for p in self.envelope_polygon],
            "total_area_m2": self.total_area_m2,
            "rooms": [r.to_dict() for r in self.rooms],
            "building_type": self.building_type.value,
            "floor_count": self.floor_count,
            "floor_height_m": self.floor_height_m,
            "external_wall_thickness_m": self.external_wall_thickness_m,
            "internal_wall_thickness_m": self.internal_wall_thickness_m,
            "entrance_facade": self.entrance_facade,
            "openings": {k: v.to_dict() for k, v in self.openings.items()},
        }

    def to_json(self, path: Path | str) -> None:
        """Save constraints to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
