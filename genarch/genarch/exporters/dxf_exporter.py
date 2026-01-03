"""
DXF export for floor plans.

Exports floor plans to AutoCAD DXF format with proper layers,
dimensions, and annotations.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import ezdxf
from ezdxf import units
from ezdxf.enums import TextEntityAlignment

from genarch.models.floor_plan import FloorPlan, Room, WallSegment, Opening
from genarch.models.run_metadata import RunMetadata


class DXFExporter:
    """
    Export floor plan to DXF format.

    Creates a DXF file with layers:
    - WALLS: Wall outlines
    - DOORS: Door symbols
    - WINDOWS: Window symbols
    - TEXT: Room labels and annotations
    - DIMS: Dimension annotations
    - ROOMS: Room fill areas (hatches)
    """

    # Layer definitions
    LAYER_WALLS = "WALLS"
    LAYER_DOORS = "DOORS"
    LAYER_WINDOWS = "WINDOWS"
    LAYER_TEXT = "TEXT"
    LAYER_DIMS = "DIMS"
    LAYER_ROOMS = "ROOMS"

    # Colors (AutoCAD color index)
    COLOR_WALLS = 7       # White/Black
    COLOR_DOORS = 1       # Red
    COLOR_WINDOWS = 5     # Blue
    COLOR_TEXT = 7        # White/Black
    COLOR_DIMS = 3        # Green
    COLOR_ROOMS = 8       # Gray

    # Text heights
    ROOM_LABEL_HEIGHT = 0.2   # Room name text height (m)
    AREA_LABEL_HEIGHT = 0.15  # Area text height (m)
    DIM_TEXT_HEIGHT = 0.1     # Dimension text height (m)

    def __init__(self):
        """Initialize exporter."""
        self.doc = None
        self.msp = None

    def export(
        self,
        floor_plan: FloorPlan,
        output_path: Path,
        metadata: Optional[RunMetadata] = None,
        scale: float = 1.0,
    ) -> None:
        """
        Export floor plan to DXF file.

        Args:
            floor_plan: Floor plan to export
            output_path: Output file path
            metadata: Optional run metadata
            scale: Drawing scale (1.0 = real-world 1:1 in meters)
        """
        # Create new DXF document
        self.doc = ezdxf.new("R2010")  # AutoCAD 2010 format
        self.doc.units = units.M  # Set units to meters

        # Create model space
        self.msp = self.doc.modelspace()

        # Set up layers
        self._setup_layers()

        # Draw elements
        self._add_walls(floor_plan, scale)
        self._add_rooms(floor_plan, scale)
        self._add_openings(floor_plan, scale)
        self._add_room_labels(floor_plan, scale)
        self._add_dimensions(floor_plan, scale)

        # Add title block if metadata provided
        if metadata:
            self._add_title_block(floor_plan, metadata, scale)

        # Save file
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        self.doc.saveas(str(output_path))

    def _setup_layers(self) -> None:
        """Create DXF layers with proper colors."""
        layers = self.doc.layers

        layers.add(self.LAYER_WALLS, color=self.COLOR_WALLS)
        layers.add(self.LAYER_DOORS, color=self.COLOR_DOORS)
        layers.add(self.LAYER_WINDOWS, color=self.COLOR_WINDOWS)
        layers.add(self.LAYER_TEXT, color=self.COLOR_TEXT)
        layers.add(self.LAYER_DIMS, color=self.COLOR_DIMS)
        layers.add(self.LAYER_ROOMS, color=self.COLOR_ROOMS)

    def _add_walls(self, floor_plan: FloorPlan, scale: float) -> None:
        """Add wall polylines to model space."""
        for wall in floor_plan.walls:
            # Draw wall centerline as polyline
            points = [
                (wall.start.x * scale, wall.start.y * scale),
                (wall.end.x * scale, wall.end.y * scale),
            ]

            # Use different lineweight for exterior vs interior
            lineweight = 50 if wall.is_exterior else 25  # 0.5mm or 0.25mm

            self.msp.add_line(
                points[0],
                points[1],
                dxfattribs={
                    "layer": self.LAYER_WALLS,
                    "lineweight": lineweight,
                }
            )

            # Add wall thickness visualization (offset lines)
            if wall.thickness_m > 0:
                self._add_wall_thickness(wall, scale)

    def _add_wall_thickness(self, wall: WallSegment, scale: float) -> None:
        """Add offset lines to show wall thickness."""
        dx = wall.end.x - wall.start.x
        dy = wall.end.y - wall.start.y
        length = (dx ** 2 + dy ** 2) ** 0.5

        if length == 0:
            return

        # Perpendicular direction
        px = -dy / length
        py = dx / length

        half_thick = wall.thickness_m / 2

        # Offset points
        for sign in [1, -1]:
            p1 = (
                (wall.start.x + sign * px * half_thick) * scale,
                (wall.start.y + sign * py * half_thick) * scale,
            )
            p2 = (
                (wall.end.x + sign * px * half_thick) * scale,
                (wall.end.y + sign * py * half_thick) * scale,
            )

            self.msp.add_line(
                p1, p2,
                dxfattribs={
                    "layer": self.LAYER_WALLS,
                    "lineweight": 13,  # 0.13mm
                }
            )

    def _add_rooms(self, floor_plan: FloorPlan, scale: float) -> None:
        """Add room boundaries as closed polylines."""
        for room in floor_plan.rooms:
            points = [
                (p.x * scale, p.y * scale)
                for p in room.polygon
            ]

            # Close the polygon
            if points:
                self.msp.add_lwpolyline(
                    points,
                    close=True,
                    dxfattribs={
                        "layer": self.LAYER_ROOMS,
                        "lineweight": 13,
                    }
                )

    def _add_openings(self, floor_plan: FloorPlan, scale: float) -> None:
        """Add door and window symbols."""
        for wall in floor_plan.walls:
            for opening in wall.openings:
                if opening.is_door:
                    self._add_door_symbol(wall, opening, scale)
                elif opening.is_window:
                    self._add_window_symbol(wall, opening, scale)

    def _add_door_symbol(
        self,
        wall: WallSegment,
        opening: Opening,
        scale: float,
    ) -> None:
        """Add door symbol (break in wall with arc)."""
        # Get opening position
        pos = opening.position_along_wall
        center = wall.get_point_at_position(pos)

        # Door width in drawing units
        door_width = opening.width_m * scale

        # Get wall direction
        dx = wall.end.x - wall.start.x
        dy = wall.end.y - wall.start.y
        length = (dx ** 2 + dy ** 2) ** 0.5

        if length == 0:
            return

        # Direction vector
        ux = dx / length
        uy = dy / length

        # Perpendicular (swing direction)
        px = -uy
        py = ux

        # Door endpoints
        half_width = door_width / 2
        p1 = (
            center.x * scale - ux * half_width,
            center.y * scale - uy * half_width,
        )
        p2 = (
            center.x * scale + ux * half_width,
            center.y * scale + uy * half_width,
        )

        # Draw door break (two short perpendicular lines)
        thick = wall.thickness_m * scale / 2
        for p in [p1, p2]:
            self.msp.add_line(
                (p[0] - px * thick, p[1] - py * thick),
                (p[0] + px * thick, p[1] + py * thick),
                dxfattribs={"layer": self.LAYER_DOORS}
            )

        # Draw door swing arc (quarter circle)
        arc_center = p1
        arc_radius = door_width
        # Simplified: draw line representing door leaf
        self.msp.add_line(
            arc_center,
            (arc_center[0] + px * arc_radius, arc_center[1] + py * arc_radius),
            dxfattribs={"layer": self.LAYER_DOORS}
        )

    def _add_window_symbol(
        self,
        wall: WallSegment,
        opening: Opening,
        scale: float,
    ) -> None:
        """Add window symbol (break in wall with glass lines)."""
        pos = opening.position_along_wall
        center = wall.get_point_at_position(pos)

        window_width = opening.width_m * scale

        # Get wall direction
        dx = wall.end.x - wall.start.x
        dy = wall.end.y - wall.start.y
        length = (dx ** 2 + dy ** 2) ** 0.5

        if length == 0:
            return

        ux = dx / length
        uy = dy / length
        px = -uy
        py = ux

        # Window endpoints
        half_width = window_width / 2
        p1 = (
            center.x * scale - ux * half_width,
            center.y * scale - uy * half_width,
        )
        p2 = (
            center.x * scale + ux * half_width,
            center.y * scale + uy * half_width,
        )

        # Draw window frame (outer rectangle)
        thick = wall.thickness_m * scale / 2
        frame_points = [
            (p1[0] - px * thick, p1[1] - py * thick),
            (p1[0] + px * thick, p1[1] + py * thick),
            (p2[0] + px * thick, p2[1] + py * thick),
            (p2[0] - px * thick, p2[1] - py * thick),
        ]
        self.msp.add_lwpolyline(
            frame_points,
            close=True,
            dxfattribs={"layer": self.LAYER_WINDOWS}
        )

        # Draw glass line (center line)
        self.msp.add_line(
            p1, p2,
            dxfattribs={"layer": self.LAYER_WINDOWS}
        )

    def _add_room_labels(self, floor_plan: FloorPlan, scale: float) -> None:
        """Add room name and area labels."""
        for room in floor_plan.rooms:
            center = room.centroid

            # Room name
            self.msp.add_text(
                room.name,
                dxfattribs={
                    "layer": self.LAYER_TEXT,
                    "height": self.ROOM_LABEL_HEIGHT * scale,
                    "insert": (center.x * scale, center.y * scale + 0.1 * scale),
                }
            ).set_placement(
                (center.x * scale, center.y * scale + 0.1 * scale),
                align=TextEntityAlignment.MIDDLE_CENTER
            )

            # Area label
            area_text = f"{room.area_m2:.1f} m²"
            self.msp.add_text(
                area_text,
                dxfattribs={
                    "layer": self.LAYER_TEXT,
                    "height": self.AREA_LABEL_HEIGHT * scale,
                    "insert": (center.x * scale, center.y * scale - 0.2 * scale),
                }
            ).set_placement(
                (center.x * scale, center.y * scale - 0.2 * scale),
                align=TextEntityAlignment.MIDDLE_CENTER
            )

    def _add_dimensions(self, floor_plan: FloorPlan, scale: float) -> None:
        """Add dimension annotations."""
        # Add overall dimensions for envelope
        if floor_plan.envelope:
            from genarch.utils.geometry import polygon_bounds
            min_x, min_y, max_x, max_y = polygon_bounds(floor_plan.envelope)

            # Width dimension (bottom)
            self._add_linear_dimension(
                (min_x * scale, min_y * scale - 0.5 * scale),
                (max_x * scale, min_y * scale - 0.5 * scale),
                offset=-0.3 * scale,
            )

            # Height dimension (left)
            self._add_linear_dimension(
                (min_x * scale - 0.5 * scale, min_y * scale),
                (min_x * scale - 0.5 * scale, max_y * scale),
                offset=-0.3 * scale,
            )

    def _add_linear_dimension(
        self,
        p1: tuple,
        p2: tuple,
        offset: float,
    ) -> None:
        """Add a linear dimension."""
        # Calculate distance
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        dist = (dx ** 2 + dy ** 2) ** 0.5

        # Dimension text
        dim_text = f"{dist:.2f}"

        # Midpoint
        mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + offset)

        # Draw dimension line
        self.msp.add_line(p1, p2, dxfattribs={"layer": self.LAYER_DIMS})

        # Draw extension lines
        if abs(dy) < abs(dx):  # Horizontal
            self.msp.add_line((p1[0], p1[1] - offset), p1, dxfattribs={"layer": self.LAYER_DIMS})
            self.msp.add_line((p2[0], p2[1] - offset), p2, dxfattribs={"layer": self.LAYER_DIMS})
        else:  # Vertical
            self.msp.add_line((p1[0] - offset, p1[1]), p1, dxfattribs={"layer": self.LAYER_DIMS})
            self.msp.add_line((p2[0] - offset, p2[1]), p2, dxfattribs={"layer": self.LAYER_DIMS})

        # Add dimension text
        self.msp.add_text(
            dim_text,
            dxfattribs={
                "layer": self.LAYER_DIMS,
                "height": self.DIM_TEXT_HEIGHT,
            }
        ).set_placement(mid, align=TextEntityAlignment.MIDDLE_CENTER)

    def _add_title_block(
        self,
        floor_plan: FloorPlan,
        metadata: RunMetadata,
        scale: float,
    ) -> None:
        """Add title block with metadata."""
        from genarch.utils.geometry import polygon_bounds

        if not floor_plan.envelope:
            return

        min_x, min_y, max_x, max_y = polygon_bounds(floor_plan.envelope)

        # Position title block below drawing
        title_y = min_y * scale - 1.5 * scale

        # Title text
        title_lines = [
            f"Floor Plan - Ground Floor",
            f"Total Area: {floor_plan.total_area_m2:.1f} m²",
            f"Seed: {metadata.seed}",
            f"Generated: {metadata.generation_timestamp[:10]}",
        ]

        for i, line in enumerate(title_lines):
            self.msp.add_text(
                line,
                dxfattribs={
                    "layer": self.LAYER_TEXT,
                    "height": 0.15 * scale,
                }
            ).set_placement(
                (min_x * scale, title_y - i * 0.25 * scale),
                align=TextEntityAlignment.LEFT
            )


def export_dxf(
    floor_plan: FloorPlan,
    output_path: Path,
    metadata: Optional[RunMetadata] = None,
) -> None:
    """
    Convenience function for DXF export.

    Args:
        floor_plan: Floor plan to export
        output_path: Output file path
        metadata: Optional run metadata
    """
    exporter = DXFExporter()
    exporter.export(floor_plan, output_path, metadata)
