"""
Main floor plan generator orchestrator.

Coordinates BSP subdivision, adjacency resolution, wall generation,
and opening placement to produce a complete floor plan.
"""

from __future__ import annotations

from typing import List, Tuple

from genarch.models.constraints import Point2D, FloorPlanConstraints
from genarch.models.floor_plan import FloorPlan, Room, WallSegment, Opening
from genarch.models.run_metadata import RunMetadata
from genarch.generator.bsp_subdivider import BSPSubdivider, BSPNode
from genarch.generator.adjacency_resolver import AdjacencyResolver
from genarch.generator.circulation_placer import CirculationPlacer
from genarch.generator.opening_placer import OpeningPlacer
from genarch.utils.id_generator import (
    generate_room_id,
    generate_wall_id,
    reset_counters,
)
from genarch.utils.geometry import polygon_area, polygon_bounds


class FloorPlanGenerator:
    """
    Main floor plan generator orchestrator.

    Coordinates all generation steps:
    1. BSP subdivision of envelope into room regions
    2. Adjacency resolution (room swapping)
    3. Wall generation from room boundaries
    4. Opening placement (doors and windows)
    """

    def __init__(self, seed: int = 42):
        """
        Initialize generator.

        Args:
            seed: Random seed for deterministic generation
        """
        self.seed = seed
        self.subdivider = BSPSubdivider(seed)
        self.adjacency_resolver = AdjacencyResolver()
        self.circulation_placer = CirculationPlacer()
        self.opening_placer = OpeningPlacer(seed)

    def generate(
        self,
        constraints: FloorPlanConstraints,
    ) -> Tuple[FloorPlan, RunMetadata]:
        """
        Generate floor plan from constraints.

        Args:
            constraints: Floor plan constraints

        Returns:
            Tuple of (FloorPlan, RunMetadata)
        """
        # Reset ID counters for fresh generation
        reset_counters()

        # Step 1: BSP subdivision
        bsp_nodes = self.subdivider.subdivide(constraints)

        # Step 2: Adjacency resolution
        bsp_nodes = self.adjacency_resolver.resolve(bsp_nodes, constraints)

        # Step 3: Check connectivity
        connectivity = self.circulation_placer.get_connectivity_report(
            bsp_nodes, constraints
        )

        # Step 4: Convert BSP nodes to Room objects
        rooms = self._create_rooms(bsp_nodes)

        # Step 5: Generate walls from room boundaries
        walls = self._generate_walls(rooms, constraints)

        # Step 6: Assign walls to rooms
        self._assign_walls_to_rooms(rooms, walls)

        # Step 7: Place openings (doors and windows)
        openings = self.opening_placer.place_openings(
            rooms, walls, constraints
        )

        # Create floor plan
        floor_plan = FloorPlan(
            rooms=rooms,
            walls=walls,
            openings=openings,
            envelope=constraints.envelope_polygon,
            floor_index=0,
            total_area_m2=sum(r.area_m2 for r in rooms),
        )

        # Create metadata
        metadata = RunMetadata(
            seed=self.seed,
            units="meters",
            north_direction=0.0,
        )

        # Add statistics
        metadata.add_statistic("room_count", len(rooms))
        metadata.add_statistic("wall_count", len(walls))
        metadata.add_statistic("opening_count", len(openings))
        metadata.add_statistic("total_area_m2", floor_plan.total_area_m2)
        metadata.add_statistic("target_area_m2", constraints.total_area_m2)
        metadata.add_statistic(
            "area_accuracy",
            floor_plan.total_area_m2 / constraints.total_area_m2
            if constraints.total_area_m2 > 0 else 0
        )
        metadata.add_statistic("connectivity", connectivity)

        return floor_plan, metadata

    def _create_rooms(self, bsp_nodes: List[BSPNode]) -> List[Room]:
        """Convert BSP nodes to Room objects."""
        rooms = []
        room_index = 0

        for node in bsp_nodes:
            if node.room_spec:
                room_id = generate_room_id(floor_index=0, index=room_index)
                room = Room(
                    id=room_id,
                    name=node.room_spec.name,
                    polygon=node.polygon,
                    area_m2=polygon_area(node.polygon),
                    floor_index=0,
                )
                rooms.append(room)
                room_index += 1

        return rooms

    def _generate_walls(
        self,
        rooms: List[Room],
        constraints: FloorPlanConstraints,
    ) -> List[WallSegment]:
        """Generate walls from room boundaries and envelope."""
        walls = []
        wall_index_ext = 0
        wall_index_int = 0

        # Generate exterior walls from envelope
        envelope = constraints.envelope_polygon
        for i in range(len(envelope)):
            i2 = (i + 1) % len(envelope)
            start = envelope[i]
            end = envelope[i2]

            # Determine facade based on wall orientation
            facade = self._determine_facade(start, end)

            wall_id = generate_wall_id(
                floor_index=0,
                is_exterior=True,
                index=wall_index_ext
            )
            wall_index_ext += 1

            # Find rooms adjacent to this wall
            adjacent_rooms = self._find_rooms_adjacent_to_edge(
                rooms, start, end
            )

            wall = WallSegment(
                id=wall_id,
                start=start,
                end=end,
                thickness_m=constraints.external_wall_thickness_m,
                is_exterior=True,
                facade=facade,
                room_ids=adjacent_rooms,
            )
            walls.append(wall)

        # Generate interior walls between rooms
        processed_edges = set()

        for i, room1 in enumerate(rooms):
            for room2 in rooms[i + 1:]:
                edge = self._find_shared_edge(room1, room2)
                if edge:
                    start, end = edge
                    edge_key = self._edge_key(start, end)

                    if edge_key not in processed_edges:
                        processed_edges.add(edge_key)

                        wall_id = generate_wall_id(
                            floor_index=0,
                            is_exterior=False,
                            index=wall_index_int
                        )
                        wall_index_int += 1

                        wall = WallSegment(
                            id=wall_id,
                            start=start,
                            end=end,
                            thickness_m=constraints.internal_wall_thickness_m,
                            is_exterior=False,
                            facade=None,
                            room_ids=[room1.id, room2.id],
                        )
                        walls.append(wall)

        return walls

    def _determine_facade(self, start: Point2D, end: Point2D) -> str:
        """Determine facade direction based on wall orientation."""
        dx = end.x - start.x
        dy = end.y - start.y

        # Wall normal points outward (90 degrees clockwise from direction)
        # For clockwise envelope, interior is on the right
        nx = dy  # Normal X
        ny = -dx  # Normal Y

        # Determine primary direction
        if abs(nx) > abs(ny):
            return "E" if nx > 0 else "W"
        else:
            return "N" if ny > 0 else "S"

    def _find_rooms_adjacent_to_edge(
        self,
        rooms: List[Room],
        start: Point2D,
        end: Point2D,
    ) -> List[str]:
        """Find rooms adjacent to an edge."""
        adjacent = []
        tol = 0.1  # 100mm tolerance

        for room in rooms:
            # Check if edge is part of room boundary
            for i in range(len(room.polygon)):
                i2 = (i + 1) % len(room.polygon)
                r_start = room.polygon[i]
                r_end = room.polygon[i2]

                if self._edges_match(start, end, r_start, r_end, tol):
                    adjacent.append(room.id)
                    break

        return adjacent

    def _edges_match(
        self,
        e1_start: Point2D,
        e1_end: Point2D,
        e2_start: Point2D,
        e2_end: Point2D,
        tol: float,
    ) -> bool:
        """Check if two edges match (same or reversed)."""
        from genarch.utils.geometry import distance

        return (
            (distance(e1_start, e2_start) < tol and distance(e1_end, e2_end) < tol) or
            (distance(e1_start, e2_end) < tol and distance(e1_end, e2_start) < tol)
        )

    def _find_shared_edge(
        self,
        room1: Room,
        room2: Room,
    ) -> Tuple[Point2D, Point2D] | None:
        """Find shared edge between two rooms."""
        tol = 0.1  # 100mm tolerance

        for i in range(len(room1.polygon)):
            i2 = (i + 1) % len(room1.polygon)
            e1_start = room1.polygon[i]
            e1_end = room1.polygon[i2]

            for j in range(len(room2.polygon)):
                j2 = (j + 1) % len(room2.polygon)
                e2_start = room2.polygon[j]
                e2_end = room2.polygon[j2]

                # Check for overlapping edges (opposite direction)
                if self._edges_overlap(e1_start, e1_end, e2_start, e2_end, tol):
                    return (e1_start, e1_end)

        return None

    def _edges_overlap(
        self,
        e1_start: Point2D,
        e1_end: Point2D,
        e2_start: Point2D,
        e2_end: Point2D,
        tol: float,
    ) -> bool:
        """Check if two edges overlap."""
        from genarch.utils.geometry import distance

        # Check if endpoints match (reversed for adjacent rooms)
        if (distance(e1_start, e2_end) < tol and distance(e1_end, e2_start) < tol):
            return True

        # Check for partial overlap on same line (axis-aligned)
        if abs(e1_start.x - e1_end.x) < tol and abs(e2_start.x - e2_end.x) < tol:
            # Both vertical
            if abs(e1_start.x - e2_start.x) < tol:
                y1_min = min(e1_start.y, e1_end.y)
                y1_max = max(e1_start.y, e1_end.y)
                y2_min = min(e2_start.y, e2_end.y)
                y2_max = max(e2_start.y, e2_end.y)
                overlap = min(y1_max, y2_max) - max(y1_min, y2_min)
                return overlap > tol

        if abs(e1_start.y - e1_end.y) < tol and abs(e2_start.y - e2_end.y) < tol:
            # Both horizontal
            if abs(e1_start.y - e2_start.y) < tol:
                x1_min = min(e1_start.x, e1_end.x)
                x1_max = max(e1_start.x, e1_end.x)
                x2_min = min(e2_start.x, e2_end.x)
                x2_max = max(e2_start.x, e2_end.x)
                overlap = min(x1_max, x2_max) - max(x1_min, x2_min)
                return overlap > tol

        return False

    def _edge_key(self, start: Point2D, end: Point2D) -> tuple:
        """Create unique key for edge (order-independent)."""
        p1 = (round(start.x, 3), round(start.y, 3))
        p2 = (round(end.x, 3), round(end.y, 3))
        return tuple(sorted([p1, p2]))

    def _assign_walls_to_rooms(
        self,
        rooms: List[Room],
        walls: List[WallSegment],
    ) -> None:
        """Assign wall IDs to rooms."""
        for room in rooms:
            room.wall_ids = [
                wall.id for wall in walls
                if room.id in wall.room_ids
            ]


def generate_floorplan(
    constraints: FloorPlanConstraints,
    seed: int = 42,
) -> Tuple[FloorPlan, RunMetadata]:
    """
    Convenience function for floor plan generation.

    Args:
        constraints: Floor plan constraints
        seed: Random seed for deterministic generation

    Returns:
        Tuple of (FloorPlan, RunMetadata)
    """
    generator = FloorPlanGenerator(seed)
    return generator.generate(constraints)
