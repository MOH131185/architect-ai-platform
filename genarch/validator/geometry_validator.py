"""
Geometry validation for floor plans.

Validates geometric constraints:
- No overlapping room polygons
- Minimum room dimensions
- Total area within tolerance
- Opening positions valid
"""

from __future__ import annotations

from typing import List, Tuple

from genarch.models.floor_plan import FloorPlan, Room
from genarch.utils.geometry import (
    polygon_area,
    polygon_bounds,
    polygons_intersect,
    minimum_width,
)


class GeometryValidator:
    """
    Validates geometric constraints of floor plan.

    Checks:
    - No room polygons overlap
    - All rooms meet minimum width requirements
    - Total area is within tolerance of target
    - Openings are positioned correctly (not too close to corners)
    """

    # Default minimum room width (UK Building Regs)
    DEFAULT_MIN_WIDTH = 2.0  # 2m

    # Default area tolerance
    DEFAULT_AREA_TOLERANCE = 0.05  # 5%

    # Minimum distance from corners for openings
    MIN_CORNER_DISTANCE = 0.2  # 200mm

    def __init__(
        self,
        min_room_width: float = DEFAULT_MIN_WIDTH,
        area_tolerance: float = DEFAULT_AREA_TOLERANCE,
    ):
        """
        Initialize validator.

        Args:
            min_room_width: Minimum room width in meters
            area_tolerance: Acceptable area deviation (0.05 = 5%)
        """
        self.min_room_width = min_room_width
        self.area_tolerance = area_tolerance

    def validate(
        self,
        floor_plan: FloorPlan,
        target_area: float = 0.0,
    ) -> Tuple[bool, List[str]]:
        """
        Validate floor plan geometry.

        Args:
            floor_plan: Floor plan to validate
            target_area: Target total area in m² (0 to skip check)

        Returns:
            Tuple of (is_valid, list of error messages)
        """
        errors = []

        # Check for overlapping rooms
        overlap_errors = self._check_no_overlaps(floor_plan.rooms)
        errors.extend(overlap_errors)

        # Check minimum room widths
        width_errors = self._check_minimum_widths(floor_plan.rooms)
        errors.extend(width_errors)

        # Check total area
        if target_area > 0:
            area_errors = self._check_total_area(floor_plan, target_area)
            errors.extend(area_errors)

        # Check opening positions
        opening_errors = self._check_opening_positions(floor_plan)
        errors.extend(opening_errors)

        return len(errors) == 0, errors

    def _check_no_overlaps(self, rooms: List[Room]) -> List[str]:
        """Check that no room polygons overlap."""
        errors = []

        for i, room1 in enumerate(rooms):
            for room2 in rooms[i + 1:]:
                if self._rooms_overlap(room1, room2):
                    errors.append(
                        f"Rooms overlap: '{room1.name}' and '{room2.name}'"
                    )

        return errors

    def _rooms_overlap(self, room1: Room, room2: Room) -> bool:
        """Check if two rooms overlap (more than just touching)."""
        # Quick bounds check
        b1 = room1.bounds
        b2 = room2.bounds

        # Add small tolerance to allow touching
        tol = 0.01  # 10mm

        # Check if bounds are completely separate
        if (b1[2] + tol < b2[0] or b2[2] + tol < b1[0] or
            b1[3] + tol < b2[1] or b2[3] + tol < b1[1]):
            return False

        # Check for actual polygon overlap
        # Use a smaller, inset version to ignore edge touching
        inset1 = self._inset_polygon(room1.polygon, tol)
        inset2 = self._inset_polygon(room2.polygon, tol)

        if not inset1 or not inset2:
            return False

        return polygons_intersect(inset1, inset2)

    def _inset_polygon(self, polygon, amount):
        """Create inset polygon (simplified for axis-aligned rectangles)."""
        from genarch.models.constraints import Point2D

        min_x, min_y, max_x, max_y = polygon_bounds(polygon)

        # Only inset if there's room
        if max_x - min_x <= 2 * amount or max_y - min_y <= 2 * amount:
            return None

        return [
            Point2D(min_x + amount, min_y + amount),
            Point2D(max_x - amount, min_y + amount),
            Point2D(max_x - amount, max_y - amount),
            Point2D(min_x + amount, max_y - amount),
        ]

    def _check_minimum_widths(self, rooms: List[Room]) -> List[str]:
        """Check that all rooms meet minimum width requirements."""
        errors = []

        for room in rooms:
            width = minimum_width(room.polygon)
            if width < self.min_room_width:
                errors.append(
                    f"Room '{room.name}' too narrow: {width:.2f}m "
                    f"(minimum: {self.min_room_width}m)"
                )

        return errors

    def _check_total_area(
        self,
        floor_plan: FloorPlan,
        target_area: float,
    ) -> List[str]:
        """Check total area is within tolerance."""
        errors = []

        total = floor_plan.total_area_m2
        deviation = abs(total - target_area) / target_area if target_area > 0 else 0

        if deviation > self.area_tolerance:
            errors.append(
                f"Total area {total:.1f}m² deviates {deviation*100:.1f}% "
                f"from target {target_area:.1f}m² "
                f"(tolerance: {self.area_tolerance*100:.0f}%)"
            )

        return errors

    def _check_opening_positions(self, floor_plan: FloorPlan) -> List[str]:
        """Check openings are at least MIN_CORNER_DISTANCE from corners."""
        errors = []

        for wall in floor_plan.walls:
            wall_length = wall.length

            for opening in wall.openings:
                pos = opening.position_along_wall
                opening_half = (opening.width_m / 2) / wall_length if wall_length > 0 else 0
                min_pos = self.MIN_CORNER_DISTANCE / wall_length if wall_length > 0 else 0

                # Check distance from start
                start_dist = pos - opening_half
                if start_dist < min_pos:
                    errors.append(
                        f"Opening '{opening.id}' too close to wall start: "
                        f"{start_dist * wall_length * 1000:.0f}mm "
                        f"(minimum: {self.MIN_CORNER_DISTANCE * 1000:.0f}mm)"
                    )

                # Check distance from end
                end_dist = 1.0 - pos - opening_half
                if end_dist < min_pos:
                    errors.append(
                        f"Opening '{opening.id}' too close to wall end: "
                        f"{end_dist * wall_length * 1000:.0f}mm "
                        f"(minimum: {self.MIN_CORNER_DISTANCE * 1000:.0f}mm)"
                    )

        return errors
