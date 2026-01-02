"""
Output floor plan models.

These models represent the generated floor plan structure including
rooms, walls, and openings.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

from genarch.models.constraints import Point2D


@dataclass
class Opening:
    """
    Door or window opening.

    Attributes:
        id: Stable ID in format {type}_{floor}_{facade}_{index}
            Examples: win_0_S_1, door_0_INT_2, entrance_0_S_0
        type: Opening type (window, door, entrance, patio, french)
        wall_id: ID of the host wall
        position_along_wall: Position along wall (0.0 to 1.0 normalized)
        width_m: Opening width in meters
        height_m: Opening height in meters
        sill_height_m: Sill height from floor in meters
        center: Center point of opening in plan view
    """
    id: str
    type: str
    wall_id: str
    position_along_wall: float  # 0.0 to 1.0
    width_m: float
    height_m: float
    sill_height_m: float = 0.0
    center: Optional[Point2D] = None

    @property
    def is_door(self) -> bool:
        return self.type in ("door", "entrance", "patio", "french", "sliding")

    @property
    def is_window(self) -> bool:
        return self.type == "window"

    @property
    def facade(self) -> str:
        """Extract facade from ID (e.g., 'win_0_S_1' -> 'S')."""
        parts = self.id.split("_")
        if len(parts) >= 3:
            return parts[2]
        return "INT"

    @property
    def floor_index(self) -> int:
        """Extract floor index from ID (e.g., 'win_0_S_1' -> 0)."""
        parts = self.id.split("_")
        if len(parts) >= 2:
            return int(parts[1])
        return 0

    @classmethod
    def from_dict(cls, data: dict) -> Opening:
        center = Point2D.from_dict(data["center"]) if data.get("center") else None
        return cls(
            id=data["id"],
            type=data["type"],
            wall_id=data["wall_id"],
            position_along_wall=data["position_along_wall"],
            width_m=data["width_m"],
            height_m=data["height_m"],
            sill_height_m=data.get("sill_height_m", 0.0),
            center=center,
        )

    def to_dict(self) -> dict:
        result = {
            "id": self.id,
            "type": self.type,
            "wall_id": self.wall_id,
            "position_along_wall": self.position_along_wall,
            "width_m": self.width_m,
            "height_m": self.height_m,
            "sill_height_m": self.sill_height_m,
        }
        if self.center:
            result["center"] = self.center.to_dict()
        return result


@dataclass
class WallSegment:
    """
    Wall segment between two points.

    Attributes:
        id: Stable ID in format wall_{floor}_{type}_{index}
            Examples: wall_0_ext_0, wall_0_int_5
        start: Start point in meters
        end: End point in meters
        thickness_m: Wall thickness in meters
        is_exterior: True if external wall
        facade: Facade direction (N, S, E, W) for exterior walls, None for interior
        room_ids: IDs of rooms bounded by this wall (1 for exterior, 2 for interior)
        openings: List of openings on this wall
    """
    id: str
    start: Point2D
    end: Point2D
    thickness_m: float
    is_exterior: bool
    facade: Optional[str] = None  # N, S, E, W for exterior walls
    room_ids: List[str] = field(default_factory=list)
    openings: List[Opening] = field(default_factory=list)

    @property
    def length(self) -> float:
        """Calculate wall length in meters."""
        dx = self.end.x - self.start.x
        dy = self.end.y - self.start.y
        return (dx ** 2 + dy ** 2) ** 0.5

    @property
    def direction(self) -> Tuple[float, float]:
        """Get normalized direction vector."""
        length = self.length
        if length == 0:
            return (0.0, 0.0)
        dx = self.end.x - self.start.x
        dy = self.end.y - self.start.y
        return (dx / length, dy / length)

    @property
    def midpoint(self) -> Point2D:
        """Get wall midpoint."""
        return Point2D(
            x=(self.start.x + self.end.x) / 2,
            y=(self.start.y + self.end.y) / 2,
        )

    def get_point_at_position(self, t: float) -> Point2D:
        """Get point at position t along wall (0.0 = start, 1.0 = end)."""
        return Point2D(
            x=self.start.x + t * (self.end.x - self.start.x),
            y=self.start.y + t * (self.end.y - self.start.y),
        )

    @classmethod
    def from_dict(cls, data: dict) -> WallSegment:
        openings = [Opening.from_dict(o) for o in data.get("openings", [])]
        return cls(
            id=data["id"],
            start=Point2D.from_dict(data["start"]),
            end=Point2D.from_dict(data["end"]),
            thickness_m=data["thickness_m"],
            is_exterior=data["is_exterior"],
            facade=data.get("facade"),
            room_ids=data.get("room_ids", []),
            openings=openings,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "start": self.start.to_dict(),
            "end": self.end.to_dict(),
            "thickness_m": self.thickness_m,
            "is_exterior": self.is_exterior,
            "facade": self.facade,
            "room_ids": self.room_ids,
            "openings": [o.to_dict() for o in self.openings],
        }


@dataclass
class Room:
    """
    Room with polygon boundary.

    Attributes:
        id: Stable ID in format room_{floor}_{index}
        name: Room name from specification
        polygon: Boundary vertices in meters (clockwise)
        area_m2: Calculated area in square meters
        floor_index: Floor level (0 = ground)
        connected_rooms: IDs of rooms connected via doors
        wall_ids: IDs of walls bounding this room
    """
    id: str
    name: str
    polygon: List[Point2D]
    area_m2: float
    floor_index: int = 0
    connected_rooms: List[str] = field(default_factory=list)
    wall_ids: List[str] = field(default_factory=list)

    @property
    def centroid(self) -> Point2D:
        """Calculate room centroid."""
        if not self.polygon:
            return Point2D(0, 0)

        # Signed area calculation for centroid
        n = len(self.polygon)
        cx, cy = 0.0, 0.0
        signed_area = 0.0

        for i in range(n):
            x0, y0 = self.polygon[i].x, self.polygon[i].y
            x1, y1 = self.polygon[(i + 1) % n].x, self.polygon[(i + 1) % n].y
            cross = x0 * y1 - x1 * y0
            signed_area += cross
            cx += (x0 + x1) * cross
            cy += (y0 + y1) * cross

        signed_area *= 0.5
        if abs(signed_area) < 1e-10:
            # Degenerate polygon, return simple average
            avg_x = sum(p.x for p in self.polygon) / n
            avg_y = sum(p.y for p in self.polygon) / n
            return Point2D(avg_x, avg_y)

        cx /= 6 * signed_area
        cy /= 6 * signed_area
        return Point2D(cx, cy)

    @property
    def bounds(self) -> Tuple[float, float, float, float]:
        """Get bounding box (min_x, min_y, max_x, max_y)."""
        xs = [p.x for p in self.polygon]
        ys = [p.y for p in self.polygon]
        return (min(xs), min(ys), max(xs), max(ys))

    @property
    def width(self) -> float:
        """Get room width (X dimension)."""
        min_x, _, max_x, _ = self.bounds
        return max_x - min_x

    @property
    def depth(self) -> float:
        """Get room depth (Y dimension)."""
        _, min_y, _, max_y = self.bounds
        return max_y - min_y

    @classmethod
    def from_dict(cls, data: dict) -> Room:
        polygon = [Point2D.from_dict(p) for p in data["polygon"]]
        return cls(
            id=data["id"],
            name=data["name"],
            polygon=polygon,
            area_m2=data["area_m2"],
            floor_index=data.get("floor_index", 0),
            connected_rooms=data.get("connected_rooms", []),
            wall_ids=data.get("wall_ids", []),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "polygon": [p.to_dict() for p in self.polygon],
            "area_m2": self.area_m2,
            "floor_index": self.floor_index,
            "connected_rooms": self.connected_rooms,
            "wall_ids": self.wall_ids,
        }


@dataclass
class FloorPlan:
    """
    Complete floor plan output.

    Attributes:
        rooms: List of room definitions
        walls: List of wall segments
        openings: List of all openings (also referenced from walls)
        envelope: Building envelope polygon
        floor_index: Floor level (0 = ground)
        total_area_m2: Total floor area
    """
    rooms: List[Room]
    walls: List[WallSegment]
    openings: List[Opening]
    envelope: List[Point2D]
    floor_index: int = 0
    total_area_m2: float = 0.0

    def __post_init__(self):
        """Calculate total area if not provided."""
        if self.total_area_m2 == 0.0 and self.rooms:
            self.total_area_m2 = sum(room.area_m2 for room in self.rooms)

    def get_room_by_id(self, room_id: str) -> Optional[Room]:
        """Lookup room by ID."""
        for room in self.rooms:
            if room.id == room_id:
                return room
        return None

    def get_room_by_name(self, name: str) -> Optional[Room]:
        """Lookup room by name."""
        for room in self.rooms:
            if room.name == name:
                return room
        return None

    def get_wall_by_id(self, wall_id: str) -> Optional[WallSegment]:
        """Lookup wall by ID."""
        for wall in self.walls:
            if wall.id == wall_id:
                return wall
        return None

    def get_walls_for_room(self, room_id: str) -> List[WallSegment]:
        """Get all walls bounding a room."""
        return [wall for wall in self.walls if room_id in wall.room_ids]

    def get_exterior_walls(self) -> List[WallSegment]:
        """Get all exterior walls."""
        return [wall for wall in self.walls if wall.is_exterior]

    def get_interior_walls(self) -> List[WallSegment]:
        """Get all interior walls."""
        return [wall for wall in self.walls if not wall.is_exterior]

    def get_openings_by_type(self, opening_type: str) -> List[Opening]:
        """Get openings of a specific type."""
        return [o for o in self.openings if o.type == opening_type]

    def get_openings_by_facade(self, facade: str) -> List[Opening]:
        """Get openings on a specific facade."""
        return [o for o in self.openings if o.facade == facade.upper()]

    @classmethod
    def from_dict(cls, data: dict) -> FloorPlan:
        rooms = [Room.from_dict(r) for r in data["rooms"]]
        walls = [WallSegment.from_dict(w) for w in data["walls"]]
        openings = [Opening.from_dict(o) for o in data["openings"]]
        envelope = [Point2D.from_dict(p) for p in data["envelope"]]
        return cls(
            rooms=rooms,
            walls=walls,
            openings=openings,
            envelope=envelope,
            floor_index=data.get("floor_index", 0),
            total_area_m2=data.get("total_area_m2", 0.0),
        )

    @classmethod
    def from_json(cls, path: Path | str) -> FloorPlan:
        """Load floor plan from JSON file."""
        with open(path, "r") as f:
            data = json.load(f)
        return cls.from_dict(data)

    def to_dict(self) -> dict:
        return {
            "rooms": [r.to_dict() for r in self.rooms],
            "walls": [w.to_dict() for w in self.walls],
            "openings": [o.to_dict() for o in self.openings],
            "envelope": [p.to_dict() for p in self.envelope],
            "floor_index": self.floor_index,
            "total_area_m2": self.total_area_m2,
        }

    def to_json(self, path: Path | str) -> None:
        """Save floor plan to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
