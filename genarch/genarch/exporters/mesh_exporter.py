"""
3D mesh export for floor plans.

Exports floor plans to GLB (GLTF Binary) and OBJ formats
with extruded walls and floor slab.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Literal, List
import json

import numpy as np
import trimesh

from genarch.models.floor_plan import FloorPlan, WallSegment, Opening
from genarch.models.run_metadata import RunMetadata


class MeshExporter:
    """
    Export floor plan to 3D mesh (GLB/OBJ).

    Creates a 3D model with:
    - Extruded walls
    - Floor slab
    - Opening positions stored as metadata (not boolean cuts)
    """

    def __init__(
        self,
        wall_height_m: float = 3.0,
        floor_thickness_m: float = 0.3,
        ceiling_thickness_m: float = 0.1,
    ):
        """
        Initialize exporter.

        Args:
            wall_height_m: Wall height in meters
            floor_thickness_m: Floor slab thickness in meters
            ceiling_thickness_m: Ceiling thickness in meters
        """
        self.wall_height_m = wall_height_m
        self.floor_thickness_m = floor_thickness_m
        self.ceiling_thickness_m = ceiling_thickness_m

    def export(
        self,
        floor_plan: FloorPlan,
        output_path: Path,
        format: Literal["glb", "obj"] = "glb",
        metadata: Optional[RunMetadata] = None,
    ) -> None:
        """
        Export floor plan to 3D mesh.

        Args:
            floor_plan: Floor plan to export
            output_path: Output file path
            format: Output format (glb or obj)
            metadata: Optional run metadata
        """
        # Create scene with all geometry
        scene = self._create_scene(floor_plan)

        # Add metadata as scene extras
        if metadata:
            scene.metadata["genarch_metadata"] = metadata.to_dict()

        # Add opening positions as metadata
        openings_data = self._create_openings_metadata(floor_plan)
        scene.metadata["openings"] = openings_data

        # Ensure output directory exists
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Export based on format
        if format == "glb":
            scene.export(str(output_path), file_type="glb")
        elif format == "obj":
            # For OBJ, export the combined mesh
            combined = scene.dump(concatenate=True)
            combined.export(str(output_path), file_type="obj")

            # Also export metadata as JSON
            meta_path = output_path.with_suffix(".json")
            with open(meta_path, "w") as f:
                json.dump({
                    "metadata": metadata.to_dict() if metadata else {},
                    "openings": openings_data,
                }, f, indent=2)
        else:
            raise ValueError(f"Unknown format: {format}")

    def _create_scene(self, floor_plan: FloorPlan) -> trimesh.Scene:
        """Create trimesh scene from floor plan."""
        scene = trimesh.Scene()

        # Create floor slab
        floor_mesh = self._create_floor_slab(floor_plan)
        if floor_mesh:
            scene.add_geometry(floor_mesh, node_name="floor_slab")

        # Create walls
        for i, wall in enumerate(floor_plan.walls):
            wall_mesh = self._extrude_wall(wall)
            if wall_mesh:
                scene.add_geometry(wall_mesh, node_name=f"wall_{i}")

        return scene

    def _create_floor_slab(self, floor_plan: FloorPlan) -> Optional[trimesh.Trimesh]:
        """Create floor slab mesh from envelope."""
        if not floor_plan.envelope:
            return None

        # Get envelope vertices
        vertices_2d = np.array([
            [p.x, p.y] for p in floor_plan.envelope
        ])

        # Create extruded floor slab
        try:
            # Create 2D path
            path = trimesh.path.Path2D(
                vertices=vertices_2d,
                entities=[
                    trimesh.path.entities.Line(
                        list(range(len(vertices_2d))) + [0]
                    )
                ]
            )

            # Extrude to create 3D mesh
            mesh = trimesh.creation.extrude_polygon(
                polygon=trimesh.path.polygons.paths_to_polygons([path])[0],
                height=self.floor_thickness_m,
            )

            # Move slab down so top surface is at z=0
            mesh.apply_translation([0, 0, -self.floor_thickness_m])

            # Set visual properties
            mesh.visual = trimesh.visual.ColorVisuals(
                mesh=mesh,
                face_colors=[200, 200, 200, 255]  # Light gray
            )

            return mesh

        except Exception:
            # Fallback: create simple box from bounds
            from genarch.utils.geometry import polygon_bounds
            min_x, min_y, max_x, max_y = polygon_bounds(floor_plan.envelope)

            mesh = trimesh.creation.box(
                extents=[max_x - min_x, max_y - min_y, self.floor_thickness_m],
                transform=trimesh.transformations.translation_matrix([
                    (min_x + max_x) / 2,
                    (min_y + max_y) / 2,
                    -self.floor_thickness_m / 2,
                ])
            )

            mesh.visual = trimesh.visual.ColorVisuals(
                mesh=mesh,
                face_colors=[200, 200, 200, 255]
            )

            return mesh

    def _extrude_wall(self, wall: WallSegment) -> Optional[trimesh.Trimesh]:
        """Extrude wall segment to 3D."""
        if wall.length == 0:
            return None

        # Wall direction and perpendicular
        dx = wall.end.x - wall.start.x
        dy = wall.end.y - wall.start.y
        length = (dx ** 2 + dy ** 2) ** 0.5

        # Unit vectors
        ux = dx / length
        uy = dy / length
        px = -uy  # Perpendicular
        py = ux

        # Half thickness
        ht = wall.thickness_m / 2

        # Wall corners (bottom)
        corners_bottom = [
            [wall.start.x - px * ht, wall.start.y - py * ht, 0],
            [wall.start.x + px * ht, wall.start.y + py * ht, 0],
            [wall.end.x + px * ht, wall.end.y + py * ht, 0],
            [wall.end.x - px * ht, wall.end.y - py * ht, 0],
        ]

        # Wall corners (top)
        corners_top = [
            [c[0], c[1], self.wall_height_m] for c in corners_bottom
        ]

        # Create box mesh
        vertices = np.array(corners_bottom + corners_top)

        # Faces (two triangles per face)
        faces = np.array([
            # Bottom
            [0, 1, 2], [0, 2, 3],
            # Top
            [4, 6, 5], [4, 7, 6],
            # Front
            [0, 4, 5], [0, 5, 1],
            # Back
            [2, 6, 7], [2, 7, 3],
            # Left
            [0, 3, 7], [0, 7, 4],
            # Right
            [1, 5, 6], [1, 6, 2],
        ])

        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)

        # Set color based on exterior/interior
        if wall.is_exterior:
            color = [180, 120, 80, 255]  # Brick color
        else:
            color = [240, 240, 230, 255]  # Off-white

        mesh.visual = trimesh.visual.ColorVisuals(
            mesh=mesh,
            face_colors=[color] * len(faces)
        )

        return mesh

    def _create_openings_metadata(self, floor_plan: FloorPlan) -> List[dict]:
        """Create metadata for opening positions."""
        openings_data = []

        for wall in floor_plan.walls:
            for opening in wall.openings:
                # Calculate 3D position
                center = wall.get_point_at_position(opening.position_along_wall)

                # Wall direction
                dx = wall.end.x - wall.start.x
                dy = wall.end.y - wall.start.y
                length = (dx ** 2 + dy ** 2) ** 0.5

                if length > 0:
                    ux = dx / length
                    uy = dy / length
                else:
                    ux, uy = 1, 0

                opening_data = {
                    "id": opening.id,
                    "type": opening.type,
                    "wall_id": opening.wall_id,
                    "position": {
                        "x": center.x,
                        "y": center.y,
                        "z": opening.sill_height_m + opening.height_m / 2,
                    },
                    "dimensions": {
                        "width": opening.width_m,
                        "height": opening.height_m,
                    },
                    "sill_height": opening.sill_height_m,
                    "direction": {
                        "x": ux,
                        "y": uy,
                    },
                    "facade": opening.facade,
                }
                openings_data.append(opening_data)

        return openings_data


def export_mesh(
    floor_plan: FloorPlan,
    output_path: Path,
    format: Literal["glb", "obj"] = "glb",
    wall_height_m: float = 3.0,
    metadata: Optional[RunMetadata] = None,
) -> None:
    """
    Convenience function for mesh export.

    Args:
        floor_plan: Floor plan to export
        output_path: Output file path
        format: Output format (glb or obj)
        wall_height_m: Wall height in meters
        metadata: Optional run metadata
    """
    exporter = MeshExporter(wall_height_m=wall_height_m)
    exporter.export(floor_plan, output_path, format, metadata)
