"""
Room adjacency resolution.

Post-processes BSP-generated room layout to ensure required
adjacencies are satisfied by swapping room positions when needed.
"""

from __future__ import annotations

from typing import List, Dict, Set, Tuple, Optional

from genarch.models.constraints import RoomSpec, FloorPlanConstraints
from genarch.generator.bsp_subdivider import BSPNode
from genarch.utils.geometry import polygon_bounds, distance
from genarch.models.constraints import Point2D


class AdjacencyResolver:
    """
    Resolves room adjacency requirements.

    After BSP subdivision, checks if required adjacencies are satisfied
    and attempts to swap room assignments to fix violations.
    """

    # Distance threshold for considering rooms adjacent (meters)
    ADJACENCY_THRESHOLD = 0.1  # 100mm tolerance

    def resolve(
        self,
        nodes: List[BSPNode],
        constraints: FloorPlanConstraints,
    ) -> List[BSPNode]:
        """
        Resolve adjacency requirements by swapping rooms.

        Args:
            nodes: BSP leaf nodes with room assignments
            constraints: Floor plan constraints with adjacency requirements

        Returns:
            Modified list of nodes with improved adjacency
        """
        # Build adjacency requirements map
        requirements = self._build_requirements(constraints)

        # Build current adjacency graph
        adjacencies = self._compute_adjacencies(nodes)

        # Check violations and attempt swaps
        max_iterations = 20
        for _ in range(max_iterations):
            violations = self._find_violations(nodes, requirements, adjacencies)

            if not violations:
                break  # All requirements satisfied

            # Attempt to fix first violation by swapping
            fixed = self._attempt_swap(nodes, violations[0], adjacencies)
            if not fixed:
                break  # Can't fix, accept current state

            # Recompute adjacencies after swap
            adjacencies = self._compute_adjacencies(nodes)

        return nodes

    def _build_requirements(
        self,
        constraints: FloorPlanConstraints,
    ) -> Dict[str, Set[str]]:
        """Build adjacency requirements from constraints."""
        requirements = {}
        for room in constraints.rooms:
            requirements[room.name] = set(room.adjacency)
        return requirements

    def _compute_adjacencies(
        self,
        nodes: List[BSPNode],
    ) -> Dict[str, Set[str]]:
        """
        Compute which rooms are actually adjacent based on geometry.

        Two rooms are adjacent if they share an edge (within tolerance).
        """
        adjacencies = {}

        for node in nodes:
            if node.room_spec:
                adjacencies[node.room_spec.name] = set()

        # Check each pair of nodes for adjacency
        for i, node1 in enumerate(nodes):
            if not node1.room_spec:
                continue

            for node2 in nodes[i + 1:]:
                if not node2.room_spec:
                    continue

                if self._are_adjacent(node1.polygon, node2.polygon):
                    adjacencies[node1.room_spec.name].add(node2.room_spec.name)
                    adjacencies[node2.room_spec.name].add(node1.room_spec.name)

        return adjacencies

    def _are_adjacent(
        self,
        poly1: List[Point2D],
        poly2: List[Point2D],
    ) -> bool:
        """Check if two polygons share an edge (are adjacent)."""
        # Get bounds for quick rejection
        b1 = polygon_bounds(poly1)
        b2 = polygon_bounds(poly2)

        # Check if bounds are close enough
        if (b1[2] + self.ADJACENCY_THRESHOLD < b2[0] or
            b2[2] + self.ADJACENCY_THRESHOLD < b1[0] or
            b1[3] + self.ADJACENCY_THRESHOLD < b2[1] or
            b2[3] + self.ADJACENCY_THRESHOLD < b1[1]):
            return False

        # Check for shared edge
        for i in range(len(poly1)):
            i2 = (i + 1) % len(poly1)
            e1_start, e1_end = poly1[i], poly1[i2]

            for j in range(len(poly2)):
                j2 = (j + 1) % len(poly2)
                e2_start, e2_end = poly2[j], poly2[j2]

                if self._edges_overlap(e1_start, e1_end, e2_start, e2_end):
                    return True

        return False

    def _edges_overlap(
        self,
        e1_start: Point2D,
        e1_end: Point2D,
        e2_start: Point2D,
        e2_end: Point2D,
    ) -> bool:
        """Check if two edges overlap (share a segment)."""
        tol = self.ADJACENCY_THRESHOLD

        # Check if edges are collinear and overlap
        # Simplified: check if endpoints match (within tolerance)
        if ((distance(e1_start, e2_end) < tol and distance(e1_end, e2_start) < tol) or
            (distance(e1_start, e2_start) < tol and distance(e1_end, e2_end) < tol)):
            return True

        # Check for partial overlap on same line
        # For axis-aligned edges (which BSP produces)
        if abs(e1_start.x - e1_end.x) < tol and abs(e2_start.x - e2_end.x) < tol:
            # Both vertical, check if on same X
            if abs(e1_start.x - e2_start.x) < tol:
                # Check Y overlap
                y1_min = min(e1_start.y, e1_end.y)
                y1_max = max(e1_start.y, e1_end.y)
                y2_min = min(e2_start.y, e2_end.y)
                y2_max = max(e2_start.y, e2_end.y)
                overlap = min(y1_max, y2_max) - max(y1_min, y2_min)
                return overlap > tol

        if abs(e1_start.y - e1_end.y) < tol and abs(e2_start.y - e2_end.y) < tol:
            # Both horizontal, check if on same Y
            if abs(e1_start.y - e2_start.y) < tol:
                # Check X overlap
                x1_min = min(e1_start.x, e1_end.x)
                x1_max = max(e1_start.x, e1_end.x)
                x2_min = min(e2_start.x, e2_end.x)
                x2_max = max(e2_start.x, e2_end.x)
                overlap = min(x1_max, x2_max) - max(x1_min, x2_min)
                return overlap > tol

        return False

    def _find_violations(
        self,
        nodes: List[BSPNode],
        requirements: Dict[str, Set[str]],
        adjacencies: Dict[str, Set[str]],
    ) -> List[Tuple[str, str]]:
        """Find pairs that should be adjacent but aren't."""
        violations = []

        for room_name, required in requirements.items():
            actual = adjacencies.get(room_name, set())
            for req_adj in required:
                if req_adj not in actual and req_adj in requirements:
                    violations.append((room_name, req_adj))

        return violations

    def _attempt_swap(
        self,
        nodes: List[BSPNode],
        violation: Tuple[str, str],
        adjacencies: Dict[str, Set[str]],
    ) -> bool:
        """
        Attempt to fix a violation by swapping room assignments.

        Returns True if swap was successful.
        """
        room1_name, room2_name = violation

        # Find nodes for these rooms
        node1 = self._find_node_by_room_name(nodes, room1_name)
        node2 = self._find_node_by_room_name(nodes, room2_name)

        if not node1 or not node2:
            return False

        # Find a room adjacent to node1 that isn't room2
        # and try swapping it with room2
        current_adj_to_1 = adjacencies.get(room1_name, set())

        for adj_name in current_adj_to_1:
            if adj_name == room2_name:
                continue

            adj_node = self._find_node_by_room_name(nodes, adj_name)
            if not adj_node:
                continue

            # Check if adj_node is adjacent to node2's position
            if self._are_adjacent(adj_node.polygon, node2.polygon):
                # Swap room assignments
                node2.room_spec, adj_node.room_spec = adj_node.room_spec, node2.room_spec
                return True

        return False

    def _find_node_by_room_name(
        self,
        nodes: List[BSPNode],
        room_name: str,
    ) -> Optional[BSPNode]:
        """Find node by room name."""
        for node in nodes:
            if node.room_spec and node.room_spec.name == room_name:
                return node
        return None
