"""
JSON export for floor plans.

Exports floor plans to JSON format for interchange with
other systems and the existing JavaScript codebase.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from genarch.models.floor_plan import FloorPlan
from genarch.models.run_metadata import RunMetadata


class JSONExporter:
    """
    Export floor plan to JSON format.

    Creates a JSON file compatible with the existing JavaScript
    geometry services in the architect-ai-platform.
    """

    def export(
        self,
        floor_plan: FloorPlan,
        output_path: Path,
        metadata: Optional[RunMetadata] = None,
        include_statistics: bool = True,
    ) -> None:
        """
        Export floor plan to JSON file.

        Args:
            floor_plan: Floor plan to export
            output_path: Output file path
            metadata: Optional run metadata
            include_statistics: Include computed statistics
        """
        data = floor_plan.to_dict()

        # Add metadata if provided
        if metadata:
            data["metadata"] = metadata.to_dict()

        # Add computed statistics
        if include_statistics:
            data["statistics"] = self._compute_statistics(floor_plan)

        # Ensure output directory exists
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Write JSON file
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)

    def _compute_statistics(self, floor_plan: FloorPlan) -> dict:
        """Compute statistics about the floor plan."""
        rooms = floor_plan.rooms
        walls = floor_plan.walls
        openings = floor_plan.openings

        # Room statistics
        room_areas = [r.area_m2 for r in rooms]
        total_area = sum(room_areas)

        # Wall statistics
        exterior_walls = [w for w in walls if w.is_exterior]
        interior_walls = [w for w in walls if not w.is_exterior]

        exterior_length = sum(w.length for w in exterior_walls)
        interior_length = sum(w.length for w in interior_walls)

        # Opening statistics
        doors = [o for o in openings if o.is_door]
        windows = [o for o in openings if o.is_window]

        return {
            "room_count": len(rooms),
            "total_area_m2": total_area,
            "average_room_area_m2": total_area / len(rooms) if rooms else 0,
            "largest_room_m2": max(room_areas) if room_areas else 0,
            "smallest_room_m2": min(room_areas) if room_areas else 0,
            "wall_count": len(walls),
            "exterior_wall_count": len(exterior_walls),
            "interior_wall_count": len(interior_walls),
            "exterior_wall_length_m": exterior_length,
            "interior_wall_length_m": interior_length,
            "total_wall_length_m": exterior_length + interior_length,
            "opening_count": len(openings),
            "door_count": len(doors),
            "window_count": len(windows),
            "doors_per_room": len(doors) / len(rooms) if rooms else 0,
            "windows_per_room": len(windows) / len(rooms) if rooms else 0,
        }

    def export_ssot_format(
        self,
        floor_plan: FloorPlan,
        output_path: Path,
        metadata: Optional[RunMetadata] = None,
    ) -> None:
        """
        Export in SSoTBuildingModel format (JS codebase compatible).

        Converts coordinates to millimeters for compatibility with
        the existing JavaScript geometry services.

        Args:
            floor_plan: Floor plan to export
            output_path: Output file path
            metadata: Optional run metadata
        """
        from genarch.utils.units import m_to_mm

        # Convert to SSoT format
        ssot_data = {
            "units": "mm",
            "designId": metadata.seed if metadata else 0,
            "floors": [
                {
                    "level": floor_plan.floor_index,
                    "rooms": [
                        {
                            "id": room.id,
                            "name": room.name,
                            "polygon": [
                                {"x": m_to_mm(p.x), "y": m_to_mm(p.y)}
                                for p in room.polygon
                            ],
                            "area": m_to_mm(m_to_mm(room.area_m2)),  # mm²
                            "center": {
                                "x": m_to_mm(room.centroid.x),
                                "y": m_to_mm(room.centroid.y),
                            },
                        }
                        for room in floor_plan.rooms
                    ],
                    "walls": [
                        {
                            "id": wall.id,
                            "start": {
                                "x": m_to_mm(wall.start.x),
                                "y": m_to_mm(wall.start.y),
                            },
                            "end": {
                                "x": m_to_mm(wall.end.x),
                                "y": m_to_mm(wall.end.y),
                            },
                            "thickness": m_to_mm(wall.thickness_m),
                            "type": "exterior" if wall.is_exterior else "interior",
                            "exterior": wall.is_exterior,
                            "facade": wall.facade,
                        }
                        for wall in floor_plan.walls
                    ],
                    "openings": [
                        {
                            "id": opening.id,
                            "type": opening.type,
                            "facade": opening.facade,
                            "wallId": opening.wall_id,
                            "position": opening.position_along_wall,
                            "width": m_to_mm(opening.width_m),
                            "height": m_to_mm(opening.height_m),
                            "sillHeight": m_to_mm(opening.sill_height_m),
                            "x": m_to_mm(opening.center.x) if opening.center else 0,
                            "y": m_to_mm(opening.center.y) if opening.center else 0,
                        }
                        for opening in floor_plan.openings
                    ],
                }
            ],
            "building": {
                "footprint": {
                    "polygon": [
                        {"x": m_to_mm(p.x), "y": m_to_mm(p.y)}
                        for p in floor_plan.envelope
                    ],
                    "area": sum(m_to_mm(m_to_mm(r.area_m2)) for r in floor_plan.rooms),
                },
            },
        }

        if metadata:
            ssot_data["metadata"] = {
                "seed": metadata.seed,
                "timestamp": metadata.generation_timestamp,
                "version": metadata.version,
            }

        # Write JSON file
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w") as f:
            json.dump(ssot_data, f, indent=2)


def export_json(
    floor_plan: FloorPlan,
    output_path: Path,
    metadata: Optional[RunMetadata] = None,
) -> None:
    """
    Convenience function for JSON export.

    Args:
        floor_plan: Floor plan to export
        output_path: Output file path
        metadata: Optional run metadata
    """
    exporter = JSONExporter()
    exporter.export(floor_plan, output_path, metadata)
