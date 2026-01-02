"""
BSP (Binary Space Partition) subdivision algorithm for room layout.

Recursively divides the building envelope into room-sized regions,
then assigns rooms to regions based on area matching and adjacency requirements.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from genarch.models.constraints import Point2D, RoomSpec, FloorPlanConstraints
from genarch.utils.geometry import (
    polygon_area,
    polygon_bounds,
    split_polygon_horizontal,
    split_polygon_vertical,
    rectangle_from_bounds,
)
from genarch.utils.random_seeded import SeededRandom


@dataclass
class BSPNode:
    """
    Binary Space Partition node.

    Represents a region of the floor plan that may be subdivided
    or assigned to a room.
    """
    polygon: List[Point2D]
    room_spec: Optional[RoomSpec] = None
    left: Optional[BSPNode] = None
    right: Optional[BSPNode] = None
    split_direction: Optional[str] = None  # 'horizontal' or 'vertical'
    split_position: Optional[float] = None
    depth: int = 0

    @property
    def area(self) -> float:
        """Get polygon area."""
        return polygon_area(self.polygon)

    @property
    def bounds(self) -> Tuple[float, float, float, float]:
        """Get bounding box."""
        return polygon_bounds(self.polygon)

    @property
    def width(self) -> float:
        """Get width (X dimension)."""
        min_x, _, max_x, _ = self.bounds
        return max_x - min_x

    @property
    def height(self) -> float:
        """Get height (Y dimension)."""
        _, min_y, _, max_y = self.bounds
        return max_y - min_y

    @property
    def is_leaf(self) -> bool:
        """Check if this is a leaf node (no children)."""
        return self.left is None and self.right is None

    @property
    def aspect_ratio(self) -> float:
        """Get aspect ratio (width / height)."""
        if self.height == 0:
            return float('inf')
        return self.width / self.height


class BSPSubdivider:
    """
    BSP-based room subdivision algorithm.

    Divides the building envelope into room regions using binary space
    partitioning, then assigns rooms to best-fit regions.
    """

    # Minimum room dimension in meters
    MIN_ROOM_DIM = 2.0

    # Maximum BSP tree depth
    MAX_DEPTH = 10

    # Area tolerance for room assignment (±10%)
    AREA_TOLERANCE = 0.10

    def __init__(self, seed: int = 42):
        """
        Initialize subdivider.

        Args:
            seed: Random seed for deterministic generation
        """
        self.rng = SeededRandom(seed)

    def subdivide(
        self,
        constraints: FloorPlanConstraints,
    ) -> List[BSPNode]:
        """
        Subdivide envelope into room polygons.

        Args:
            constraints: Floor plan constraints with envelope and rooms

        Returns:
            List of BSP leaf nodes with room assignments
        """
        # Create root node from envelope
        root = BSPNode(polygon=constraints.envelope_polygon, depth=0)

        # Sort rooms by area (largest first for better fit)
        rooms_to_assign = sorted(
            constraints.rooms,
            key=lambda r: r.area_m2,
            reverse=True
        )

        # Build BSP tree by recursive subdivision
        self._build_tree(root, rooms_to_assign, constraints)

        # Collect leaf nodes
        leaves = self._collect_leaves(root)

        # Assign rooms to best-matching leaves
        assigned_leaves = self._assign_rooms_to_leaves(leaves, rooms_to_assign)

        return assigned_leaves

    def _build_tree(
        self,
        node: BSPNode,
        rooms: List[RoomSpec],
        constraints: FloorPlanConstraints,
    ) -> None:
        """
        Recursively build BSP tree by subdivision.

        Args:
            node: Current node to potentially subdivide
            rooms: Remaining rooms to place
            constraints: Floor plan constraints
        """
        if node.depth >= self.MAX_DEPTH:
            return

        if not rooms:
            return

        # Calculate total remaining room area
        total_room_area = sum(r.area_m2 for r in rooms)

        # If node area is close to a single room, don't subdivide
        if len(rooms) == 1:
            return

        # If node is too small to subdivide meaningfully, stop
        if node.width < self.MIN_ROOM_DIM * 2 or node.height < self.MIN_ROOM_DIM * 2:
            return

        # Choose split direction based on aspect ratio
        direction = self._choose_split_direction(node)

        # Calculate split position to create regions for rooms
        split_pos = self._calculate_split_position(node, rooms, direction)

        if split_pos is None:
            return  # Can't split

        # Split the polygon
        if direction == "horizontal":
            left_poly, right_poly = split_polygon_horizontal(node.polygon, split_pos)
        else:
            left_poly, right_poly = split_polygon_vertical(node.polygon, split_pos)

        if not left_poly or not right_poly:
            return  # Split failed

        # Create child nodes
        node.split_direction = direction
        node.split_position = split_pos
        node.left = BSPNode(polygon=left_poly, depth=node.depth + 1)
        node.right = BSPNode(polygon=right_poly, depth=node.depth + 1)

        # Partition rooms between children based on area
        left_area = polygon_area(left_poly)
        right_area = polygon_area(right_poly)
        total_area = left_area + right_area

        left_rooms, right_rooms = self._partition_rooms(
            rooms, left_area / total_area
        )

        # Recurse on children
        self._build_tree(node.left, left_rooms, constraints)
        self._build_tree(node.right, right_rooms, constraints)

    def _choose_split_direction(self, node: BSPNode) -> str:
        """
        Choose split direction based on node aspect ratio.

        Prefer splitting along the longer dimension for more square rooms.
        Add some randomness for variety.
        """
        aspect = node.aspect_ratio

        # Strong preference: split perpendicular to longer side
        if aspect > 1.5:
            # Wide: split vertically to make narrower
            if self.rng.random() < 0.85:
                return "vertical"
            return "horizontal"
        elif aspect < 0.67:
            # Tall: split horizontally to make shorter
            if self.rng.random() < 0.85:
                return "horizontal"
            return "vertical"
        else:
            # Roughly square: random direction
            return self.rng.choice(["horizontal", "vertical"])

    def _calculate_split_position(
        self,
        node: BSPNode,
        rooms: List[RoomSpec],
        direction: str,
    ) -> Optional[float]:
        """
        Calculate optimal split position.

        Tries to create regions that match room areas.
        """
        min_x, min_y, max_x, max_y = node.bounds

        if direction == "horizontal":
            # Split along Y axis
            min_pos = min_y + self.MIN_ROOM_DIM
            max_pos = max_y - self.MIN_ROOM_DIM

            if min_pos >= max_pos:
                return None

            # Target: split to match largest room area ratio
            if rooms:
                largest_room_area = rooms[0].area_m2
                total_area = sum(r.area_m2 for r in rooms)
                target_ratio = largest_room_area / total_area

                # Add some noise for variety
                target_ratio += self.rng.uniform(-0.1, 0.1)
                target_ratio = max(0.3, min(0.7, target_ratio))

                split_pos = min_y + target_ratio * (max_y - min_y)
            else:
                split_pos = (min_y + max_y) / 2

            # Clamp to valid range
            split_pos = max(min_pos, min(max_pos, split_pos))
            return split_pos

        else:
            # Split along X axis
            min_pos = min_x + self.MIN_ROOM_DIM
            max_pos = max_x - self.MIN_ROOM_DIM

            if min_pos >= max_pos:
                return None

            # Target: split to match largest room area ratio
            if rooms:
                largest_room_area = rooms[0].area_m2
                total_area = sum(r.area_m2 for r in rooms)
                target_ratio = largest_room_area / total_area

                target_ratio += self.rng.uniform(-0.1, 0.1)
                target_ratio = max(0.3, min(0.7, target_ratio))

                split_pos = min_x + target_ratio * (max_x - min_x)
            else:
                split_pos = (min_x + max_x) / 2

            split_pos = max(min_pos, min(max_pos, split_pos))
            return split_pos

    def _partition_rooms(
        self,
        rooms: List[RoomSpec],
        left_ratio: float,
    ) -> Tuple[List[RoomSpec], List[RoomSpec]]:
        """
        Partition rooms between left and right children based on area ratio.
        """
        total_area = sum(r.area_m2 for r in rooms)
        target_left_area = total_area * left_ratio

        left_rooms = []
        right_rooms = []
        left_area = 0.0

        for room in rooms:
            if left_area < target_left_area:
                left_rooms.append(room)
                left_area += room.area_m2
            else:
                right_rooms.append(room)

        # Ensure at least one room in each partition if possible
        if not left_rooms and right_rooms:
            left_rooms.append(right_rooms.pop(0))
        elif not right_rooms and left_rooms:
            right_rooms.append(left_rooms.pop())

        return left_rooms, right_rooms

    def _collect_leaves(self, node: BSPNode) -> List[BSPNode]:
        """Collect all leaf nodes from BSP tree."""
        if node.is_leaf:
            return [node]

        leaves = []
        if node.left:
            leaves.extend(self._collect_leaves(node.left))
        if node.right:
            leaves.extend(self._collect_leaves(node.right))
        return leaves

    def _assign_rooms_to_leaves(
        self,
        leaves: List[BSPNode],
        rooms: List[RoomSpec],
    ) -> List[BSPNode]:
        """
        Assign rooms to leaf nodes based on best area match.

        Uses greedy assignment: for each room (largest first),
        find the best-matching unassigned leaf.
        """
        # Sort leaves by area (largest first)
        available_leaves = sorted(leaves, key=lambda n: n.area, reverse=True)
        assigned_leaves = []

        for room in rooms:
            if not available_leaves:
                break

            # Find best matching leaf by area
            best_leaf = None
            best_diff = float('inf')

            for leaf in available_leaves:
                diff = abs(leaf.area - room.area_m2)
                if diff < best_diff:
                    best_diff = diff
                    best_leaf = leaf

            if best_leaf:
                best_leaf.room_spec = room
                assigned_leaves.append(best_leaf)
                available_leaves.remove(best_leaf)

        # Add remaining unassigned leaves (may be combined or left empty)
        assigned_leaves.extend(available_leaves)

        return assigned_leaves
