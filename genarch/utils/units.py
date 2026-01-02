"""
Unit conversion utilities.

Handles conversion between meters and millimeters for compatibility
with the existing JavaScript codebase which uses mm internally.
"""


def m_to_mm(meters: float) -> float:
    """
    Convert meters to millimeters.

    Args:
        meters: Value in meters

    Returns:
        Value in millimeters
    """
    return meters * 1000.0


def mm_to_m(millimeters: float) -> float:
    """
    Convert millimeters to meters.

    Args:
        millimeters: Value in millimeters

    Returns:
        Value in meters
    """
    return millimeters / 1000.0


def sqm_to_sqmm(square_meters: float) -> float:
    """
    Convert square meters to square millimeters.

    Args:
        square_meters: Area in square meters

    Returns:
        Area in square millimeters
    """
    return square_meters * 1_000_000.0


def sqmm_to_sqm(square_millimeters: float) -> float:
    """
    Convert square millimeters to square meters.

    Args:
        square_millimeters: Area in square millimeters

    Returns:
        Area in square meters
    """
    return square_millimeters / 1_000_000.0
