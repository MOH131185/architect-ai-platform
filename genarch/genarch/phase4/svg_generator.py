"""
SVG Generator Module

Generates SVG floor plan from plan.json data when no SVG or DXF exists.
Produces architectural-style drawings with rooms, walls, openings,
dimensions, and north arrow.
"""

import json
import math
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any


# SVG styling constants
WALL_COLOR = "#333333"
WALL_WIDTH = 3
INTERIOR_WALL_WIDTH = 2
ROOM_FILL_OPACITY = 0.1
DOOR_COLOR = "#666666"
WINDOW_COLOR = "#3399FF"
DIMENSION_COLOR = "#888888"
TEXT_COLOR = "#333333"
GRID_COLOR = "#EEEEEE"

# Room colors by type
ROOM_COLORS = {
    "Living": "#E8F5E9",
    "Kitchen": "#FFF3E0",
    "Bedroom": "#E3F2FD",
    "Bathroom": "#FCE4EC",
    "Dining": "#FFF8E1",
    "Hall": "#F5F5F5",
    "Corridor": "#FAFAFA",
    "Storage": "#ECEFF1",
    "Office": "#E8EAF6",
    "default": "#F5F5F5",
}


def generate_svg_from_plan(
    plan_data: Dict[str, Any],
    output_path: Optional[Path] = None,
    scale: float = 100,  # pixels per meter
    margin: float = 50,  # margin in pixels
    show_dimensions: bool = True,
    show_grid: bool = False,
    show_north_arrow: bool = True,
) -> str:
    """
    Generate SVG from plan.json data.

    Args:
        plan_data: Parsed plan.json dictionary
        output_path: Optional path to save SVG file
        scale: Pixels per meter (default: 100)
        margin: Margin around drawing in pixels
        show_dimensions: Whether to show room dimensions
        show_grid: Whether to show background grid
        show_north_arrow: Whether to show north arrow

    Returns:
        SVG content as string
    """
    # Extract data
    rooms = plan_data.get("rooms", [])
    walls = plan_data.get("walls", [])
    openings = plan_data.get("openings", [])
    envelope = plan_data.get("envelope", [])
    metadata = plan_data.get("metadata", {})

    # Calculate bounds
    all_points = []
    for room in rooms:
        polygon = room.get("polygon", [])
        all_points.extend(polygon)
    for point in envelope:
        all_points.append(point)

    if not all_points:
        # No geometry data, create minimal SVG
        return _create_empty_svg(margin)

    xs = [p.get("x", 0) for p in all_points]
    ys = [p.get("y", 0) for p in all_points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    width_m = max_x - min_x
    height_m = max_y - min_y

    # SVG dimensions
    svg_width = width_m * scale + 2 * margin
    svg_height = height_m * scale + 2 * margin

    # Build SVG
    svg_parts = []
    svg_parts.append(_svg_header(svg_width, svg_height))
    svg_parts.append(_svg_defs())

    # Background grid
    if show_grid:
        svg_parts.append(_draw_grid(svg_width, svg_height, scale))

    # Transform group (flip Y axis for architectural convention)
    transform = f"translate({margin - min_x * scale}, {svg_height - margin + min_y * scale}) scale({scale}, -{scale})"
    svg_parts.append(f'<g transform="{transform}">')

    # Draw rooms
    for room in rooms:
        svg_parts.append(_draw_room(room, show_dimensions))

    # Draw envelope/exterior walls
    if envelope:
        svg_parts.append(_draw_envelope(envelope))

    # Draw walls
    for wall in walls:
        svg_parts.append(_draw_wall(wall))

    # Draw openings
    for opening in openings:
        svg_parts.append(_draw_opening(opening))

    svg_parts.append("</g>")  # Close transform group

    # North arrow (in SVG coordinates)
    if show_north_arrow:
        north_dir = metadata.get("north_direction", 0)
        svg_parts.append(_draw_north_arrow(margin + 30, margin + 30, north_dir))

    # Scale bar
    svg_parts.append(_draw_scale_bar(margin, svg_height - margin / 2, scale))

    svg_parts.append("</svg>")

    svg_content = "\n".join(svg_parts)

    # Save to file if path provided
    if output_path:
        output_path = Path(output_path)
        output_path.write_text(svg_content, encoding="utf-8")

    return svg_content


def _svg_header(width: float, height: float) -> str:
    """Generate SVG header."""
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {width:.1f} {height:.1f}"
     width="{width:.1f}" height="{height:.1f}"
     style="background-color: white;">'''


def _svg_defs() -> str:
    """Generate SVG defs for markers and patterns."""
    return '''<defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7"
            refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#888888"/>
    </marker>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4">
        <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2"
              style="stroke:#cccccc; stroke-width:0.5"/>
    </pattern>
</defs>'''


def _draw_grid(width: float, height: float, scale: float) -> str:
    """Draw background grid."""
    lines = []
    lines.append(f'<g stroke="{GRID_COLOR}" stroke-width="0.5">')

    # Vertical lines (every meter)
    x = 0
    while x < width:
        lines.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{height}"/>')
        x += scale

    # Horizontal lines
    y = 0
    while y < height:
        lines.append(f'<line x1="0" y1="{y}" x2="{width}" y2="{y}"/>')
        y += scale

    lines.append("</g>")
    return "\n".join(lines)


def _draw_room(room: Dict, show_dimensions: bool = True) -> str:
    """Draw a room polygon with label."""
    polygon = room.get("polygon", [])
    if not polygon:
        return ""

    name = room.get("name", "Room")
    area = room.get("area_m2", 0)
    room_id = room.get("id", "")

    # Get room color
    color = ROOM_COLORS.get(name.split()[0] if name else "", ROOM_COLORS["default"])

    # Build polygon points
    points = " ".join([f"{p.get('x', 0)},{p.get('y', 0)}" for p in polygon])

    # Calculate centroid for label
    cx = sum(p.get("x", 0) for p in polygon) / len(polygon)
    cy = sum(p.get("y", 0) for p in polygon) / len(polygon)

    parts = []

    # Room fill
    parts.append(
        f'<polygon points="{points}" '
        f'fill="{color}" fill-opacity="{ROOM_FILL_OPACITY}" '
        f'stroke="none"/>'
    )

    # Room label (in flipped coordinates, so text needs transform)
    label = name
    if show_dimensions and area > 0:
        label += f"\n{area:.1f} m²"

    # Text needs to be un-flipped
    parts.append(
        f'<g transform="translate({cx}, {cy}) scale(1, -1)">'
        f'<text text-anchor="middle" font-size="0.12" '
        f'font-family="Arial, sans-serif" fill="{TEXT_COLOR}">'
        f'{name}'
        f'</text>'
    )
    if show_dimensions and area > 0:
        parts.append(
            f'<text text-anchor="middle" font-size="0.08" '
            f'font-family="Arial, sans-serif" fill="{DIMENSION_COLOR}" dy="0.15">'
            f'{area:.1f} m²'
            f'</text>'
        )
    parts.append("</g>")

    return "\n".join(parts)


def _draw_envelope(envelope: List[Dict]) -> str:
    """Draw building envelope/exterior walls."""
    if not envelope:
        return ""

    points = " ".join([f"{p.get('x', 0)},{p.get('y', 0)}" for p in envelope])

    return (
        f'<polygon points="{points}" '
        f'fill="none" stroke="{WALL_COLOR}" '
        f'stroke-width="{WALL_WIDTH / 100}" stroke-linejoin="miter"/>'
    )


def _draw_wall(wall: Dict) -> str:
    """Draw a wall segment."""
    start = wall.get("start", {})
    end = wall.get("end", {})

    if not start or not end:
        return ""

    x1, y1 = start.get("x", 0), start.get("y", 0)
    x2, y2 = end.get("x", 0), end.get("y", 0)

    # Exterior vs interior
    is_exterior = wall.get("facade") is not None
    width = WALL_WIDTH if is_exterior else INTERIOR_WALL_WIDTH

    return (
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
        f'stroke="{WALL_COLOR}" stroke-width="{width / 100}" '
        f'stroke-linecap="square"/>'
    )


def _draw_opening(opening: Dict) -> str:
    """Draw a door or window opening."""
    opening_type = opening.get("type", "window")
    wall_ref = opening.get("wall_ref", {})

    # Get position from wall reference or direct coordinates
    x = opening.get("x", wall_ref.get("x", 0))
    y = opening.get("y", wall_ref.get("y", 0))
    width = opening.get("width_m", 1.0)
    orientation = opening.get("orientation", 0)

    parts = []

    if opening_type == "door":
        # Draw door symbol (arc + line)
        parts.append(
            f'<g transform="translate({x}, {y}) rotate({orientation})">'
            f'<line x1="0" y1="0" x2="{width}" y2="0" '
            f'stroke="{DOOR_COLOR}" stroke-width="0.02"/>'
            f'<path d="M 0 0 A {width} {width} 0 0 1 {width} 0" '
            f'fill="none" stroke="{DOOR_COLOR}" stroke-width="0.01"/>'
            f'</g>'
        )
    else:
        # Draw window symbol (double line)
        parts.append(
            f'<g transform="translate({x}, {y}) rotate({orientation})">'
            f'<line x1="0" y1="-0.05" x2="{width}" y2="-0.05" '
            f'stroke="{WINDOW_COLOR}" stroke-width="0.02"/>'
            f'<line x1="0" y1="0.05" x2="{width}" y2="0.05" '
            f'stroke="{WINDOW_COLOR}" stroke-width="0.02"/>'
            f'</g>'
        )

    return "\n".join(parts)


def _draw_north_arrow(x: float, y: float, direction: float = 0) -> str:
    """Draw north arrow at specified position."""
    # direction is in degrees, 0 = up
    rad = math.radians(direction)

    return f'''<g transform="translate({x}, {y}) rotate({direction})">
    <polygon points="0,-20 5,10 0,5 -5,10" fill="#333333"/>
    <text x="0" y="-25" text-anchor="middle" font-size="12"
          font-family="Arial, sans-serif" font-weight="bold">N</text>
</g>'''


def _draw_scale_bar(x: float, y: float, scale: float) -> str:
    """Draw scale bar at specified position."""
    # 1 meter at current scale
    bar_length = scale

    return f'''<g transform="translate({x}, {y})">
    <line x1="0" y1="0" x2="{bar_length}" y2="0"
          stroke="#333333" stroke-width="2"/>
    <line x1="0" y1="-5" x2="0" y2="5" stroke="#333333" stroke-width="1"/>
    <line x1="{bar_length}" y1="-5" x2="{bar_length}" y2="5"
          stroke="#333333" stroke-width="1"/>
    <text x="{bar_length / 2}" y="15" text-anchor="middle"
          font-size="10" font-family="Arial, sans-serif">1m</text>
</g>'''


def _create_empty_svg(margin: float) -> str:
    """Create minimal SVG for empty plan data."""
    size = margin * 4
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {size} {size}"
     width="{size}" height="{size}"
     style="background-color: white;">
    <text x="{size/2}" y="{size/2}" text-anchor="middle"
          font-family="Arial, sans-serif" fill="#999999">
        No floor plan data
    </text>
</svg>'''


def load_plan_json(path: Path) -> Dict[str, Any]:
    """Load and parse plan.json file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
