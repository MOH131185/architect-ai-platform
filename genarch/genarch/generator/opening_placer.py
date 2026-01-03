"""
Opening placement algorithm for doors and windows.

Places doors between connected rooms and windows on exterior walls
based on room requirements and UK building regulations.
"""

from __future__ import annotations

from typing import List, Optional, Dict, Tuple

from genarch.models.constraints import Point2D, FloorPlanConstraints
from genarch.models.floor_plan import Room, WallSegment, Opening
from genarch.utils.id_generator import generate_opening_id, reset_counters
from genarch.utils.geometry import distance, polygon_centroid
from genarch.utils.random_seeded import SeededRandom


# UK Building Regulations opening defaults (in meters)
OPENING_DEFAULTS = {
    "window": {"width": 1.2, "height": 1.2, "sill_height": 0.9},
    "door": {"width": 0.9, "height": 2.1, "sill_height": 0.0},
    "entrance": {"width": 1.0, "height": 2.1, "sill_height": 0.0},
    "patio": {"width": 2.4, "height": 2.1, "sill_height": 0.0},
}

# Placement constraints
MIN_CORNER_DISTANCE = 0.2  # 200mm from corners
MIN_OPENING_SPACING = 0.6  # 600mm between openings
DOOR_MIN_FROM_CORNER = 0.2  # 200mm
WINDOW_MIN_FROM_CORNER = 0.4  # 400mm


class OpeningPlacer:
    """
    Places doors and windows on walls.

    Handles:
    - Internal doors between connected rooms
    - Main entrance door on specified facade
    - Windows on exterior walls for rooms requiring daylight
    """

    def __init__(self, seed: int = 42):
        """
        Initialize placer.

        Args:
            seed: Random seed for deterministic placement
        """
        self.rng = SeededRandom(seed)

    def place_openings(
        self,
        rooms: List[Room],
        walls: List[WallSegment],
        constraints: FloorPlanConstraints,
    ) -> List[Opening]:
        """
        Place all openings (doors and windows).

        Args:
            rooms: List of rooms
            walls: List of wall segments
            constraints: Floor plan constraints

        Returns:
            List of Opening objects
        """
        openings = []

        # Reset ID counters for this generation
        reset_counters()

        # Build room lookup
        room_by_name = {r.name: r for r in rooms}
        room_by_id = {r.id: r for r in rooms}

        # Place entrance door first
        entrance_opening = self._place_entrance_door(
            rooms, walls, constraints
        )
        if entrance_opening:
            openings.append(entrance_opening)

        # Place internal doors based on adjacency requirements
        internal_doors = self._place_internal_doors(
            rooms, walls, constraints, openings
        )
        openings.extend(internal_doors)

        # Place windows on exterior walls
        windows = self._place_windows(
            rooms, walls, constraints, openings
        )
        openings.extend(windows)

        # Update wall references
        for opening in openings:
            wall = self._find_wall_by_id(walls, opening.wall_id)
            if wall:
                wall.openings.append(opening)

        return openings

    def _place_entrance_door(
        self,
        rooms: List[Room],
        walls: List[WallSegment],
        constraints: FloorPlanConstraints,
    ) -> Optional[Opening]:
        """Place main entrance door on specified facade."""
        facade = constraints.entrance_facade.upper()[0]  # N, S, E, W

        # Find entrance room or first room near entrance facade
        entrance_room = None
        for room in rooms:
            if "entrance" in room.name.lower():
                entrance_room = room
                break

        if not entrance_room:
            # Use first room adjacent to entrance facade
            entrance_room = rooms[0] if rooms else None

        if not entrance_room:
            return None

        # Find exterior wall on entrance facade
        entrance_wall = None
        for wall in walls:
            if wall.is_exterior and wall.facade == facade:
                if entrance_room.id in wall.room_ids:
                    entrance_wall = wall
                    break

        # If no wall directly adjacent to entrance room, pick any on facade
        if not entrance_wall:
            for wall in walls:
                if wall.is_exterior and wall.facade == facade:
                    entrance_wall = wall
                    break

        if not entrance_wall:
            return None

        # Place door at center of wall (or offset if too close to corner)
        position = 0.5
        opening_width = OPENING_DEFAULTS["entrance"]["width"]

        # Validate position
        position = self._adjust_position_for_corners(
            entrance_wall, position, opening_width, DOOR_MIN_FROM_CORNER
        )

        opening_id = generate_opening_id("entrance", 0, facade)
        center = entrance_wall.get_point_at_position(position)

        return Opening(
            id=opening_id,
            type="entrance",
            wall_id=entrance_wall.id,
            position_along_wall=position,
            width_m=opening_width,
            height_m=OPENING_DEFAULTS["entrance"]["height"],
            sill_height_m=0.0,
            center=center,
        )

    def _place_internal_doors(
        self,
        rooms: List[Room],
        walls: List[WallSegment],
        constraints: FloorPlanConstraints,
        existing_openings: List[Opening],
    ) -> List[Opening]:
        """Place doors between rooms based on adjacency requirements."""
        doors = []
        placed_connections = set()  # Track room pairs with doors

        # Get interior walls
        interior_walls = [w for w in walls if not w.is_exterior]

        for room in rooms:
            room_spec = self._find_room_spec(room.name, constraints)
            if not room_spec:
                continue

            for adj_name in room_spec.adjacency:
                # Skip if already placed
                connection_key = tuple(sorted([room.name, adj_name]))
                if connection_key in placed_connections:
                    continue

                # Find adjacent room
                adj_room = self._find_room_by_name(rooms, adj_name)
                if not adj_room:
                    continue

                # Find shared wall
                shared_wall = self._find_shared_wall(
                    room, adj_room, interior_walls
                )

                if shared_wall:
                    door = self._place_door_on_wall(
                        shared_wall,
                        room,
                        adj_room,
                        existing_openings + doors
                    )
                    if door:
                        doors.append(door)
                        placed_connections.add(connection_key)

                        # Update room connectivity
                        if adj_room.id not in room.connected_rooms:
                            room.connected_rooms.append(adj_room.id)
                        if room.id not in adj_room.connected_rooms:
                            adj_room.connected_rooms.append(room.id)

        return doors

    def _place_windows(
        self,
        rooms: List[Room],
        walls: List[WallSegment],
        constraints: FloorPlanConstraints,
        existing_openings: List[Opening],
    ) -> List[Opening]:
        """Place windows on exterior walls for rooms requiring daylight."""
        windows = []

        # Get exterior walls
        exterior_walls = [w for w in walls if w.is_exterior]

        for room in rooms:
            room_spec = self._find_room_spec(room.name, constraints)

            # Check if room needs windows
            needs_window = (
                room_spec and room_spec.exterior_wall_preference
            ) or self._room_type_requires_window(room.name)

            if not needs_window:
                continue

            # Find exterior walls adjacent to this room
            room_ext_walls = [
                w for w in exterior_walls
                if room.id in w.room_ids
            ]

            if not room_ext_walls:
                continue

            # Place window on best wall (prefer south-facing)
            best_wall = self._select_best_wall_for_window(room_ext_walls)

            if best_wall:
                window = self._place_window_on_wall(
                    best_wall,
                    room,
                    existing_openings + windows
                )
                if window:
                    windows.append(window)

        return windows

    def _place_door_on_wall(
        self,
        wall: WallSegment,
        room1: Room,
        room2: Room,
        existing_openings: List[Opening],
    ) -> Optional[Opening]:
        """Place a door on an internal wall between two rooms."""
        door_width = OPENING_DEFAULTS["door"]["width"]

        # Try center position first
        position = 0.5

        # Check for conflicts with existing openings
        position = self._find_valid_position(
            wall, position, door_width,
            DOOR_MIN_FROM_CORNER, MIN_OPENING_SPACING,
            existing_openings
        )

        if position is None:
            return None

        opening_id = generate_opening_id("door", 0, "INT")
        center = wall.get_point_at_position(position)

        return Opening(
            id=opening_id,
            type="door",
            wall_id=wall.id,
            position_along_wall=position,
            width_m=door_width,
            height_m=OPENING_DEFAULTS["door"]["height"],
            sill_height_m=0.0,
            center=center,
        )

    def _place_window_on_wall(
        self,
        wall: WallSegment,
        room: Room,
        existing_openings: List[Opening],
    ) -> Optional[Opening]:
        """Place a window on an exterior wall."""
        window_width = OPENING_DEFAULTS["window"]["width"]

        # Try center position
        position = 0.5

        # Find valid position
        position = self._find_valid_position(
            wall, position, window_width,
            WINDOW_MIN_FROM_CORNER, MIN_OPENING_SPACING,
            existing_openings
        )

        if position is None:
            return None

        facade = wall.facade or "N"
        opening_id = generate_opening_id("window", 0, facade)
        center = wall.get_point_at_position(position)

        return Opening(
            id=opening_id,
            type="window",
            wall_id=wall.id,
            position_along_wall=position,
            width_m=window_width,
            height_m=OPENING_DEFAULTS["window"]["height"],
            sill_height_m=OPENING_DEFAULTS["window"]["sill_height"],
            center=center,
        )

    def _find_valid_position(
        self,
        wall: WallSegment,
        target_position: float,
        opening_width: float,
        min_corner_distance: float,
        min_spacing: float,
        existing_openings: List[Opening],
    ) -> Optional[float]:
        """Find valid position for opening on wall."""
        wall_length = wall.length

        # Convert distances to normalized positions
        min_pos = min_corner_distance / wall_length if wall_length > 0 else 0.1
        max_pos = 1.0 - min_pos
        opening_half = (opening_width / 2) / wall_length if wall_length > 0 else 0.1

        # Adjust for opening width
        min_pos = max(min_pos, opening_half)
        max_pos = min(max_pos, 1.0 - opening_half)

        if min_pos >= max_pos:
            return None

        # Check existing openings on this wall
        wall_openings = [o for o in existing_openings if o.wall_id == wall.id]

        # Try target position first
        if self._is_position_valid(
            target_position, opening_width, wall_length,
            min_pos, max_pos, min_spacing, wall_openings
        ):
            return target_position

        # Try alternative positions
        for offset in [0.1, 0.2, 0.3, -0.1, -0.2, -0.3]:
            alt_pos = target_position + offset
            if min_pos <= alt_pos <= max_pos:
                if self._is_position_valid(
                    alt_pos, opening_width, wall_length,
                    min_pos, max_pos, min_spacing, wall_openings
                ):
                    return alt_pos

        return None

    def _is_position_valid(
        self,
        position: float,
        opening_width: float,
        wall_length: float,
        min_pos: float,
        max_pos: float,
        min_spacing: float,
        existing_openings: List[Opening],
    ) -> bool:
        """Check if position is valid (no conflicts)."""
        if position < min_pos or position > max_pos:
            return False

        opening_half_norm = (opening_width / 2) / wall_length if wall_length > 0 else 0.1
        spacing_norm = min_spacing / wall_length if wall_length > 0 else 0.1

        for existing in existing_openings:
            existing_half = (existing.width_m / 2) / wall_length if wall_length > 0 else 0.1
            min_distance = opening_half_norm + existing_half + spacing_norm

            if abs(position - existing.position_along_wall) < min_distance:
                return False

        return True

    def _adjust_position_for_corners(
        self,
        wall: WallSegment,
        position: float,
        opening_width: float,
        min_corner_distance: float,
    ) -> float:
        """Adjust position to maintain minimum corner distance."""
        wall_length = wall.length
        opening_half = (opening_width / 2) / wall_length if wall_length > 0 else 0.1
        min_pos = min_corner_distance / wall_length if wall_length > 0 else 0.1

        min_bound = min_pos + opening_half
        max_bound = 1.0 - min_bound

        return max(min_bound, min(max_bound, position))

    def _find_shared_wall(
        self,
        room1: Room,
        room2: Room,
        walls: List[WallSegment],
    ) -> Optional[WallSegment]:
        """Find wall shared between two rooms."""
        for wall in walls:
            if room1.id in wall.room_ids and room2.id in wall.room_ids:
                return wall
        return None

    def _select_best_wall_for_window(
        self,
        walls: List[WallSegment],
    ) -> Optional[WallSegment]:
        """Select best wall for window placement (prefer south-facing)."""
        # Priority: S > E > W > N
        facade_priority = {"S": 0, "E": 1, "W": 2, "N": 3}

        if not walls:
            return None

        # Sort by facade preference and wall length
        sorted_walls = sorted(
            walls,
            key=lambda w: (facade_priority.get(w.facade, 4), -w.length)
        )

        return sorted_walls[0]

    def _find_room_spec(
        self,
        room_name: str,
        constraints: FloorPlanConstraints,
    ) -> Optional[any]:
        """Find room spec by name."""
        for spec in constraints.rooms:
            if spec.name == room_name:
                return spec
        return None

    def _find_room_by_name(
        self,
        rooms: List[Room],
        name: str,
    ) -> Optional[Room]:
        """Find room by name."""
        for room in rooms:
            if room.name == name:
                return room
        return None

    def _find_wall_by_id(
        self,
        walls: List[WallSegment],
        wall_id: str,
    ) -> Optional[WallSegment]:
        """Find wall by ID."""
        for wall in walls:
            if wall.id == wall_id:
                return wall
        return None

    def _room_type_requires_window(self, room_name: str) -> bool:
        """Check if room type requires natural light."""
        name_lower = room_name.lower()
        window_rooms = [
            "living", "kitchen", "bedroom", "dining",
            "study", "office", "lounge"
        ]
        return any(r in name_lower for r in window_rooms)
