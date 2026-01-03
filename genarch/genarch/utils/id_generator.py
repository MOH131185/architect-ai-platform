"""
ID generation utilities for stable, semantic identifiers.

Generates IDs that match the format used by the JavaScript codebase
for cross-system compatibility.

ID Formats:
- Room:    room_{floor}_{index}       e.g., room_0_3
- Wall:    wall_{floor}_{type}_{index} e.g., wall_0_ext_0, wall_0_int_5
- Opening: {type}_{floor}_{facade}_{index} e.g., win_0_S_1, door_0_INT_2
"""

from typing import Dict

# Counters for generating sequential IDs
_counters: Dict[str, int] = {}


def reset_counters() -> None:
    """Reset all ID counters (call at start of new generation)."""
    global _counters
    _counters = {}


def _next_count(prefix: str) -> int:
    """Get next sequential count for a prefix."""
    if prefix not in _counters:
        _counters[prefix] = 0
    count = _counters[prefix]
    _counters[prefix] += 1
    return count


def generate_room_id(floor_index: int = 0, index: int | None = None) -> str:
    """
    Generate room ID in format: room_{floor}_{index}

    Args:
        floor_index: Floor level (0 = ground)
        index: Optional explicit index; if None, auto-increments

    Returns:
        Room ID string
    """
    if index is None:
        index = _next_count(f"room_{floor_index}")
    return f"room_{floor_index}_{index}"


def generate_wall_id(
    floor_index: int = 0,
    is_exterior: bool = True,
    index: int | None = None
) -> str:
    """
    Generate wall ID in format: wall_{floor}_{type}_{index}

    Args:
        floor_index: Floor level (0 = ground)
        is_exterior: True for exterior walls, False for interior
        index: Optional explicit index; if None, auto-increments

    Returns:
        Wall ID string
    """
    wall_type = "ext" if is_exterior else "int"
    if index is None:
        index = _next_count(f"wall_{floor_index}_{wall_type}")
    return f"wall_{floor_index}_{wall_type}_{index}"


def generate_opening_id(
    opening_type: str,
    floor_index: int = 0,
    facade: str = "INT",
    index: int | None = None
) -> str:
    """
    Generate opening ID in format: {type}_{floor}_{facade}_{index}

    Args:
        opening_type: Type of opening (window, door, entrance, patio)
        floor_index: Floor level (0 = ground)
        facade: Facade code (N, S, E, W) or INT for internal
        index: Optional explicit index; if None, auto-increments

    Returns:
        Opening ID string

    Examples:
        generate_opening_id("window", 0, "S") -> "win_0_S_0"
        generate_opening_id("door", 0, "INT") -> "door_0_INT_0"
        generate_opening_id("entrance", 0, "S") -> "entrance_0_S_0"
    """
    # Abbreviate window type for consistency with JS codebase
    type_prefix = "win" if opening_type == "window" else opening_type
    facade_upper = facade.upper()

    if index is None:
        index = _next_count(f"{type_prefix}_{floor_index}_{facade_upper}")
    return f"{type_prefix}_{floor_index}_{facade_upper}_{index}"


def parse_opening_id(opening_id: str) -> Dict[str, str | int]:
    """
    Parse opening ID into components.

    Args:
        opening_id: Opening ID string (e.g., "win_0_S_1")

    Returns:
        Dict with keys: type, floor, facade, index
    """
    parts = opening_id.split("_")
    if len(parts) < 4:
        raise ValueError(f"Invalid opening ID format: {opening_id}")

    opening_type = parts[0]
    if opening_type == "win":
        opening_type = "window"

    return {
        "type": opening_type,
        "floor": int(parts[1]),
        "facade": parts[2],
        "index": int(parts[3]),
    }


def parse_wall_id(wall_id: str) -> Dict[str, str | int | bool]:
    """
    Parse wall ID into components.

    Args:
        wall_id: Wall ID string (e.g., "wall_0_ext_3")

    Returns:
        Dict with keys: floor, is_exterior, index
    """
    parts = wall_id.split("_")
    if len(parts) < 4:
        raise ValueError(f"Invalid wall ID format: {wall_id}")

    return {
        "floor": int(parts[1]),
        "is_exterior": parts[2] == "ext",
        "index": int(parts[3]),
    }


def parse_room_id(room_id: str) -> Dict[str, int]:
    """
    Parse room ID into components.

    Args:
        room_id: Room ID string (e.g., "room_0_5")

    Returns:
        Dict with keys: floor, index
    """
    parts = room_id.split("_")
    if len(parts) < 3:
        raise ValueError(f"Invalid room ID format: {room_id}")

    return {
        "floor": int(parts[1]),
        "index": int(parts[2]),
    }
