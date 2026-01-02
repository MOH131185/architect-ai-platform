"""
Circulation placement for hallways and corridors.

Ensures all rooms are connected by adding hallway space
when rooms cannot be directly connected via doors.
"""

from __future__ import annotations

from typing import List, Set
from collections import deque

from genarch.models.constraints import RoomSpec, FloorPlanConstraints
from genarch.generator.bsp_subdivider import BSPNode


class CirculationPlacer:
    """
    Places circulation (hallways) to connect rooms.

    In BSP-based layouts, hallways are typically explicitly specified
    in the room program. This class verifies connectivity and identifies
    rooms that may need hallway access.
    """

    def ensure_connectivity(
        self,
        nodes: List[BSPNode],
        constraints: FloorPlanConstraints,
    ) -> List[str]:
        """
        Check connectivity and return list of disconnected room names.

        For BSP layouts, rooms should be connected via the hallway
        if specified in adjacency requirements.

        Args:
            nodes: BSP leaf nodes with room assignments
            constraints: Floor plan constraints

        Returns:
            List of room names that may have connectivity issues
        """
        # Build adjacency graph from BSP geometry
        room_names = set()
        adjacencies = {}

        for node in nodes:
            if node.room_spec:
                name = node.room_spec.name
                room_names.add(name)
                adjacencies[name] = set()

        # Compute geometric adjacencies
        for i, node1 in enumerate(nodes):
            if not node1.room_spec:
                continue

            for node2 in nodes[i + 1:]:
                if not node2.room_spec:
                    continue

                if self._are_geometrically_adjacent(node1, node2):
                    adjacencies[node1.room_spec.name].add(node2.room_spec.name)
                    adjacencies[node2.room_spec.name].add(node1.room_spec.name)

        # Find hallway or entrance to use as starting point
        start_room = None
        for name in room_names:
            if "hallway" in name.lower() or "entrance" in name.lower():
                start_room = name
                break

        if not start_room and room_names:
            start_room = next(iter(room_names))

        if not start_room:
            return []

        # BFS to find connected component
        visited = set()
        queue = deque([start_room])
        visited.add(start_room)

        while queue:
            current = queue.popleft()
            for neighbor in adjacencies.get(current, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        # Find disconnected rooms
        disconnected = room_names - visited
        return list(disconnected)

    def _are_geometrically_adjacent(
        self,
        node1: BSPNode,
        node2: BSPNode,
    ) -> bool:
        """Check if two nodes share an edge."""
        from genarch.utils.geometry import polygon_bounds

        tol = 0.1  # 100mm tolerance

        b1 = polygon_bounds(node1.polygon)
        b2 = polygon_bounds(node2.polygon)

        # Quick bounds check
        if (b1[2] + tol < b2[0] or b2[2] + tol < b1[0] or
            b1[3] + tol < b2[1] or b2[3] + tol < b1[1]):
            return False

        # Check for shared edge (axis-aligned)
        # Vertical edge shared if:
        # - Same X coordinate for edge
        # - Y ranges overlap

        # Check right edge of node1 vs left edge of node2
        if abs(b1[2] - b2[0]) < tol:
            y_overlap = min(b1[3], b2[3]) - max(b1[1], b2[1])
            if y_overlap > tol:
                return True

        # Check left edge of node1 vs right edge of node2
        if abs(b1[0] - b2[2]) < tol:
            y_overlap = min(b1[3], b2[3]) - max(b1[1], b2[1])
            if y_overlap > tol:
                return True

        # Check top edge of node1 vs bottom edge of node2
        if abs(b1[3] - b2[1]) < tol:
            x_overlap = min(b1[2], b2[2]) - max(b1[0], b2[0])
            if x_overlap > tol:
                return True

        # Check bottom edge of node1 vs top edge of node2
        if abs(b1[1] - b2[3]) < tol:
            x_overlap = min(b1[2], b2[2]) - max(b1[0], b2[0])
            if x_overlap > tol:
                return True

        return False

    def get_connectivity_report(
        self,
        nodes: List[BSPNode],
        constraints: FloorPlanConstraints,
    ) -> dict:
        """
        Generate a connectivity report.

        Returns:
            Dict with connectivity analysis
        """
        disconnected = self.ensure_connectivity(nodes, constraints)

        room_count = sum(1 for n in nodes if n.room_spec)
        connected_count = room_count - len(disconnected)

        return {
            "total_rooms": room_count,
            "connected_rooms": connected_count,
            "disconnected_rooms": disconnected,
            "fully_connected": len(disconnected) == 0,
        }
