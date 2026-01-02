"""
UK Building Regulations compliance validator.

Validates floor plans against UK Building Regulations requirements
for residential buildings.
"""

from __future__ import annotations

from typing import List, Tuple, Dict

from genarch.models.floor_plan import FloorPlan, Room
from genarch.utils.geometry import minimum_width, polygon_area


class UKBuildingRegsValidator:
    """
    Validates compliance with UK Building Regulations.

    Key regulations checked:
    - Minimum room sizes (Approved Document B for habitable rooms)
    - Minimum corridor widths (Approved Document M)
    - Window requirements for habitable rooms
    - Door widths for accessibility
    """

    # Minimum room areas (m²) for different room types
    MIN_ROOM_AREAS = {
        "single_bedroom": 6.5,    # Single bedroom minimum
        "double_bedroom": 11.0,   # Double bedroom minimum
        "living_room": 13.0,      # Living room minimum
        "kitchen": 5.5,           # Kitchen minimum
        "bathroom": 2.5,          # Bathroom minimum
        "wc": 1.5,                # WC minimum
    }

    # Minimum room dimensions (m)
    MIN_DIMENSIONS = {
        "bedroom": 2.1,           # Minimum bedroom width
        "habitable_room": 2.4,    # General habitable room
        "corridor": 0.9,          # Corridor width
        "bathroom": 1.7,          # Bathroom width
    }

    # Minimum door widths (m)
    MIN_DOOR_WIDTHS = {
        "internal": 0.75,         # Internal doors
        "entrance": 0.80,         # Main entrance
        "accessible": 0.85,       # Accessible route
    }

    # Minimum window area as % of floor area for habitable rooms
    MIN_GLAZING_RATIO = 0.10  # 10% of floor area

    def __init__(self, strict: bool = False):
        """
        Initialize validator.

        Args:
            strict: If True, apply stricter interpretation of regulations
        """
        self.strict = strict

    def validate(self, floor_plan: FloorPlan) -> Tuple[bool, List[str]]:
        """
        Validate floor plan against UK Building Regulations.

        Args:
            floor_plan: Floor plan to validate

        Returns:
            Tuple of (is_valid, list of error messages)
        """
        errors = []

        # Check room dimensions
        dim_errors = self._check_room_dimensions(floor_plan.rooms)
        errors.extend(dim_errors)

        # Check room areas
        area_errors = self._check_room_areas(floor_plan.rooms)
        errors.extend(area_errors)

        # Check door widths
        door_errors = self._check_door_widths(floor_plan)
        errors.extend(door_errors)

        # Check window requirements
        window_errors = self._check_window_requirements(floor_plan)
        errors.extend(window_errors)

        return len(errors) == 0, errors

    def _check_room_dimensions(self, rooms: List[Room]) -> List[str]:
        """Check minimum room dimensions."""
        errors = []

        for room in rooms:
            room_type = self._classify_room(room.name)
            min_width = self._get_min_dimension(room_type)

            actual_width = minimum_width(room.polygon)

            if actual_width < min_width:
                errors.append(
                    f"Room '{room.name}' ({room_type}) width {actual_width:.2f}m "
                    f"below minimum {min_width:.2f}m (UK Building Regs)"
                )

        return errors

    def _check_room_areas(self, rooms: List[Room]) -> List[str]:
        """Check minimum room areas."""
        errors = []

        for room in rooms:
            room_type = self._classify_room(room.name)
            min_area = self._get_min_area(room_type, room.name)

            if min_area > 0 and room.area_m2 < min_area:
                errors.append(
                    f"Room '{room.name}' ({room_type}) area {room.area_m2:.1f}m² "
                    f"below minimum {min_area:.1f}m² (UK Building Regs)"
                )

        return errors

    def _check_door_widths(self, floor_plan: FloorPlan) -> List[str]:
        """Check door widths meet minimum requirements."""
        errors = []

        for opening in floor_plan.openings:
            if not opening.is_door:
                continue

            min_width = self._get_min_door_width(opening.type)

            if opening.width_m < min_width:
                errors.append(
                    f"Door '{opening.id}' width {opening.width_m:.2f}m "
                    f"below minimum {min_width:.2f}m (UK Building Regs)"
                )

        return errors

    def _check_window_requirements(self, floor_plan: FloorPlan) -> List[str]:
        """Check habitable rooms have adequate windows."""
        errors = []

        # Calculate window area per room
        room_windows: Dict[str, float] = {room.id: 0.0 for room in floor_plan.rooms}

        for wall in floor_plan.walls:
            for opening in wall.openings:
                if opening.is_window:
                    # Attribute window to first room on wall
                    if wall.room_ids:
                        room_id = wall.room_ids[0]
                        if room_id in room_windows:
                            room_windows[room_id] += opening.width_m * opening.height_m

        # Check each habitable room has adequate glazing
        for room in floor_plan.rooms:
            if not self._is_habitable_room(room.name):
                continue

            window_area = room_windows.get(room.id, 0.0)
            min_window_area = room.area_m2 * self.MIN_GLAZING_RATIO

            if window_area < min_window_area:
                errors.append(
                    f"Room '{room.name}' window area {window_area:.2f}m² "
                    f"below minimum {min_window_area:.2f}m² "
                    f"({self.MIN_GLAZING_RATIO*100:.0f}% of floor area, UK Building Regs)"
                )

        return errors

    def _classify_room(self, room_name: str) -> str:
        """Classify room by type based on name."""
        name_lower = room_name.lower()

        if "bedroom" in name_lower or "bed" in name_lower:
            return "bedroom"
        elif "living" in name_lower or "lounge" in name_lower:
            return "living_room"
        elif "kitchen" in name_lower:
            return "kitchen"
        elif "bathroom" in name_lower or "bath" in name_lower:
            return "bathroom"
        elif "wc" in name_lower or "toilet" in name_lower:
            return "wc"
        elif "hallway" in name_lower or "corridor" in name_lower:
            return "corridor"
        elif "dining" in name_lower:
            return "dining"
        elif "study" in name_lower or "office" in name_lower:
            return "study"
        elif "storage" in name_lower or "utility" in name_lower:
            return "utility"
        elif "entrance" in name_lower:
            return "entrance"
        else:
            return "other"

    def _get_min_dimension(self, room_type: str) -> float:
        """Get minimum dimension for room type."""
        if room_type == "bedroom":
            return self.MIN_DIMENSIONS["bedroom"]
        elif room_type in ("bathroom", "wc"):
            return self.MIN_DIMENSIONS["bathroom"]
        elif room_type == "corridor":
            return self.MIN_DIMENSIONS["corridor"]
        else:
            return self.MIN_DIMENSIONS["habitable_room"]

    def _get_min_area(self, room_type: str, room_name: str) -> float:
        """Get minimum area for room type."""
        name_lower = room_name.lower()

        if room_type == "bedroom":
            if "master" in name_lower or "double" in name_lower:
                return self.MIN_ROOM_AREAS["double_bedroom"]
            else:
                return self.MIN_ROOM_AREAS["single_bedroom"]
        elif room_type == "living_room":
            return self.MIN_ROOM_AREAS["living_room"]
        elif room_type == "kitchen":
            return self.MIN_ROOM_AREAS["kitchen"]
        elif room_type == "bathroom":
            return self.MIN_ROOM_AREAS["bathroom"]
        elif room_type == "wc":
            return self.MIN_ROOM_AREAS["wc"]
        else:
            return 0  # No minimum for other rooms

    def _get_min_door_width(self, door_type: str) -> float:
        """Get minimum door width for door type."""
        if door_type == "entrance":
            return self.MIN_DOOR_WIDTHS["entrance"]
        elif door_type in ("patio", "french", "sliding"):
            return self.MIN_DOOR_WIDTHS["accessible"]
        else:
            return self.MIN_DOOR_WIDTHS["internal"]

    def _is_habitable_room(self, room_name: str) -> bool:
        """Check if room is habitable (requires natural light)."""
        room_type = self._classify_room(room_name)
        return room_type in (
            "bedroom", "living_room", "kitchen", "dining", "study"
        )

    def get_compliance_report(self, floor_plan: FloorPlan) -> dict:
        """
        Generate detailed compliance report.

        Args:
            floor_plan: Floor plan to analyze

        Returns:
            Dict with compliance analysis
        """
        is_valid, errors = self.validate(floor_plan)

        # Room analysis
        room_analysis = []
        for room in floor_plan.rooms:
            room_type = self._classify_room(room.name)
            min_width = self._get_min_dimension(room_type)
            min_area = self._get_min_area(room_type, room.name)
            actual_width = minimum_width(room.polygon)

            room_analysis.append({
                "name": room.name,
                "type": room_type,
                "area_m2": room.area_m2,
                "min_area_m2": min_area,
                "width_m": actual_width,
                "min_width_m": min_width,
                "area_compliant": min_area <= 0 or room.area_m2 >= min_area,
                "width_compliant": actual_width >= min_width,
            })

        return {
            "compliant": is_valid,
            "errors": errors,
            "error_count": len(errors),
            "room_analysis": room_analysis,
            "total_rooms": len(floor_plan.rooms),
        }
