"""
Geometry utility functions for polygon operations.

Provides area calculation, centroid, bounds, intersection checking,
and minimum width calculation for room polygons.
"""

from __future__ import annotations

from typing import List, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from genarch.models.constraints import Point2D


def polygon_area(polygon: List[Point2D]) -> float:
    """
    Calculate polygon area using Shoelace formula.

    Args:
        polygon: List of vertices (clockwise or counter-clockwise)

    Returns:
        Absolute area in square meters
    """
    n = len(polygon)
    if n < 3:
        return 0.0

    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i].x * polygon[j].y
        area -= polygon[j].x * polygon[i].y

    return abs(area) / 2.0


def polygon_centroid(polygon: List[Point2D]) -> Tuple[float, float]:
    """
    Calculate polygon centroid.

    Args:
        polygon: List of vertices

    Returns:
        Tuple of (x, y) centroid coordinates
    """
    n = len(polygon)
    if n == 0:
        return (0.0, 0.0)
    if n == 1:
        return (polygon[0].x, polygon[0].y)
    if n == 2:
        return ((polygon[0].x + polygon[1].x) / 2,
                (polygon[0].y + polygon[1].y) / 2)

    cx, cy = 0.0, 0.0
    signed_area = 0.0

    for i in range(n):
        j = (i + 1) % n
        x0, y0 = polygon[i].x, polygon[i].y
        x1, y1 = polygon[j].x, polygon[j].y
        cross = x0 * y1 - x1 * y0
        signed_area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross

    signed_area *= 0.5
    if abs(signed_area) < 1e-10:
        # Degenerate polygon, return simple average
        avg_x = sum(p.x for p in polygon) / n
        avg_y = sum(p.y for p in polygon) / n
        return (avg_x, avg_y)

    cx /= 6 * signed_area
    cy /= 6 * signed_area
    return (cx, cy)


def polygon_bounds(polygon: List[Point2D]) -> Tuple[float, float, float, float]:
    """
    Calculate polygon bounding box.

    Args:
        polygon: List of vertices

    Returns:
        Tuple of (min_x, min_y, max_x, max_y)
    """
    if not polygon:
        return (0.0, 0.0, 0.0, 0.0)

    xs = [p.x for p in polygon]
    ys = [p.y for p in polygon]
    return (min(xs), min(ys), max(xs), max(ys))


def point_in_polygon(x: float, y: float, polygon: List[Point2D]) -> bool:
    """
    Check if point is inside polygon using ray casting algorithm.

    Args:
        x: Point x coordinate
        y: Point y coordinate
        polygon: List of vertices

    Returns:
        True if point is inside polygon
    """
    n = len(polygon)
    if n < 3:
        return False

    inside = False
    j = n - 1

    for i in range(n):
        xi, yi = polygon[i].x, polygon[i].y
        xj, yj = polygon[j].x, polygon[j].y

        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside


def polygons_intersect(poly1: List[Point2D], poly2: List[Point2D]) -> bool:
    """
    Check if two polygons intersect (overlap).

    Uses SAT (Separating Axis Theorem) for convex polygons,
    or edge intersection + containment check for general polygons.

    Args:
        poly1: First polygon vertices
        poly2: Second polygon vertices

    Returns:
        True if polygons intersect
    """
    if not poly1 or not poly2:
        return False

    # Check if any vertex of poly1 is inside poly2
    for p in poly1:
        if point_in_polygon(p.x, p.y, poly2):
            return True

    # Check if any vertex of poly2 is inside poly1
    for p in poly2:
        if point_in_polygon(p.x, p.y, poly1):
            return True

    # Check edge intersections
    for i in range(len(poly1)):
        i2 = (i + 1) % len(poly1)
        for j in range(len(poly2)):
            j2 = (j + 1) % len(poly2)
            if _segments_intersect(
                poly1[i].x, poly1[i].y, poly1[i2].x, poly1[i2].y,
                poly2[j].x, poly2[j].y, poly2[j2].x, poly2[j2].y
            ):
                return True

    return False


def _segments_intersect(
    x1: float, y1: float, x2: float, y2: float,
    x3: float, y3: float, x4: float, y4: float
) -> bool:
    """Check if two line segments intersect."""
    def ccw(ax: float, ay: float, bx: float, by: float, cx: float, cy: float) -> bool:
        return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax)

    return (ccw(x1, y1, x3, y3, x4, y4) != ccw(x2, y2, x3, y3, x4, y4) and
            ccw(x1, y1, x2, y2, x3, y3) != ccw(x1, y1, x2, y2, x4, y4))


def minimum_width(polygon: List[Point2D]) -> float:
    """
    Calculate minimum width of polygon (rotating calipers approach simplified).

    For axis-aligned rectangles, returns the smaller of width and height.
    For general polygons, approximates using bounding box.

    Args:
        polygon: List of vertices

    Returns:
        Minimum width in meters
    """
    if len(polygon) < 3:
        return 0.0

    min_x, min_y, max_x, max_y = polygon_bounds(polygon)
    width = max_x - min_x
    height = max_y - min_y

    return min(width, height)


def polygon_perimeter(polygon: List[Point2D]) -> float:
    """
    Calculate polygon perimeter.

    Args:
        polygon: List of vertices

    Returns:
        Perimeter in meters
    """
    n = len(polygon)
    if n < 2:
        return 0.0

    perimeter = 0.0
    for i in range(n):
        j = (i + 1) % n
        dx = polygon[j].x - polygon[i].x
        dy = polygon[j].y - polygon[i].y
        perimeter += (dx ** 2 + dy ** 2) ** 0.5

    return perimeter


def split_polygon_horizontal(
    polygon: List[Point2D],
    y_split: float
) -> Tuple[List[Point2D], List[Point2D]]:
    """
    Split a rectangle-like polygon horizontally at y_split.

    Args:
        polygon: Rectangle vertices (assumed axis-aligned)
        y_split: Y coordinate to split at

    Returns:
        Tuple of (lower polygon, upper polygon)
    """
    from genarch.models.constraints import Point2D as P2D

    min_x, min_y, max_x, max_y = polygon_bounds(polygon)

    if y_split <= min_y or y_split >= max_y:
        # Split outside bounds, return original and empty
        return (polygon, [])

    lower = [
        P2D(min_x, min_y),
        P2D(max_x, min_y),
        P2D(max_x, y_split),
        P2D(min_x, y_split),
    ]
    upper = [
        P2D(min_x, y_split),
        P2D(max_x, y_split),
        P2D(max_x, max_y),
        P2D(min_x, max_y),
    ]

    return (lower, upper)


def split_polygon_vertical(
    polygon: List[Point2D],
    x_split: float
) -> Tuple[List[Point2D], List[Point2D]]:
    """
    Split a rectangle-like polygon vertically at x_split.

    Args:
        polygon: Rectangle vertices (assumed axis-aligned)
        x_split: X coordinate to split at

    Returns:
        Tuple of (left polygon, right polygon)
    """
    from genarch.models.constraints import Point2D as P2D

    min_x, min_y, max_x, max_y = polygon_bounds(polygon)

    if x_split <= min_x or x_split >= max_x:
        # Split outside bounds, return original and empty
        return (polygon, [])

    left = [
        P2D(min_x, min_y),
        P2D(x_split, min_y),
        P2D(x_split, max_y),
        P2D(min_x, max_y),
    ]
    right = [
        P2D(x_split, min_y),
        P2D(max_x, min_y),
        P2D(max_x, max_y),
        P2D(x_split, max_y),
    ]

    return (left, right)


def rectangle_from_bounds(
    min_x: float, min_y: float, max_x: float, max_y: float
) -> List[Point2D]:
    """
    Create rectangle polygon from bounds.

    Args:
        min_x, min_y, max_x, max_y: Bounding box coordinates

    Returns:
        List of 4 vertices (clockwise from bottom-left)
    """
    from genarch.models.constraints import Point2D as P2D

    return [
        P2D(min_x, min_y),
        P2D(max_x, min_y),
        P2D(max_x, max_y),
        P2D(min_x, max_y),
    ]


def distance(p1: Point2D, p2: Point2D) -> float:
    """Calculate distance between two points."""
    dx = p2.x - p1.x
    dy = p2.y - p1.y
    return (dx ** 2 + dy ** 2) ** 0.5


def shared_edge(
    poly1: List[Point2D], poly2: List[Point2D], tolerance: float = 0.01
) -> Tuple[Point2D, Point2D] | None:
    """
    Find shared edge between two adjacent polygons.

    Args:
        poly1: First polygon
        poly2: Second polygon
        tolerance: Distance tolerance for edge matching

    Returns:
        Tuple of (start, end) points of shared edge, or None if not adjacent
    """
    # Check each edge of poly1 against each edge of poly2
    for i in range(len(poly1)):
        i2 = (i + 1) % len(poly1)
        p1_start, p1_end = poly1[i], poly1[i2]

        for j in range(len(poly2)):
            j2 = (j + 1) % len(poly2)
            p2_start, p2_end = poly2[j], poly2[j2]

            # Check if edges overlap (same line, overlapping segments)
            # Simplified: check if endpoints are close and collinear
            if (distance(p1_start, p2_end) < tolerance and
                distance(p1_end, p2_start) < tolerance):
                return (p1_start, p1_end)
            if (distance(p1_start, p2_start) < tolerance and
                distance(p1_end, p2_end) < tolerance):
                return (p1_start, p1_end)

    return None
