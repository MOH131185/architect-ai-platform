"""Utility functions for genarch."""

from genarch.utils.geometry import (
    polygon_area,
    polygon_centroid,
    polygon_bounds,
    point_in_polygon,
    polygons_intersect,
    minimum_width,
)
from genarch.utils.units import m_to_mm, mm_to_m
from genarch.utils.id_generator import (
    generate_room_id,
    generate_wall_id,
    generate_opening_id,
)
from genarch.utils.random_seeded import SeededRandom

__all__ = [
    # Geometry
    "polygon_area",
    "polygon_centroid",
    "polygon_bounds",
    "point_in_polygon",
    "polygons_intersect",
    "minimum_width",
    # Units
    "m_to_mm",
    "mm_to_m",
    # IDs
    "generate_room_id",
    "generate_wall_id",
    "generate_opening_id",
    # Random
    "SeededRandom",
]
