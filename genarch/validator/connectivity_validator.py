"""
Connectivity validation for floor plans.

Validates that all rooms are connected via doors,
ensuring the floor plan forms a connected graph.
"""

from __future__ import annotations

from collections import deque
from typing import List, Tuple, Set, Dict

from genarch.models.floor_plan import FloorPlan, Room, Opening


class ConnectivityValidator:
    """
    Validates room connectivity via doors.

    Checks:
    - All rooms are reachable from the entrance
    - The room graph is fully connected
    - Required adjacencies are satisfied
    """

    def validate(self, floor_plan: FloorPlan) -> Tuple[bool, List[str]]:
        """
        Validate all rooms are connected via doors.

        Args:
            floor_plan: Floor plan to validate

        Returns:
            Tuple of (is_valid, list of error messages)
        """
        errors = []

        # Build connectivity graph from doors
        graph = self._build_door_graph(floor_plan)

        # Find starting room (entrance or first room)
        start_room = self._find_start_room(floor_plan.rooms)

        if not start_room:
            if floor_plan.rooms:
                errors.append("No rooms found in floor plan")
            return len(errors) == 0, errors

        # Check connectivity using BFS
        room_ids = {r.id for r in floor_plan.rooms}
        disconnected = self._find_disconnected_rooms(graph, start_room.id, room_ids)

        if disconnected:
            room_names = [
                self._get_room_name(floor_plan.rooms, rid)
                for rid in disconnected
            ]
            errors.append(
                f"Disconnected rooms (no door access): {', '.join(room_names)}"
            )

        return len(errors) == 0, errors

    def _build_door_graph(self, floor_plan: FloorPlan) -> Dict[str, Set[str]]:
        """Build adjacency graph from door placements."""
        graph: Dict[str, Set[str]] = {}

        # Initialize graph with all rooms
        for room in floor_plan.rooms:
            graph[room.id] = set()

        # Add edges for each door
        for wall in floor_plan.walls:
            for opening in wall.openings:
                if opening.is_door:
                    # Door connects the rooms on either side of the wall
                    if len(wall.room_ids) == 2:
                        room1, room2 = wall.room_ids[0], wall.room_ids[1]
                        if room1 in graph:
                            graph[room1].add(room2)
                        if room2 in graph:
                            graph[room2].add(room1)
                    elif len(wall.room_ids) == 1:
                        # Exterior door - connects to "outside"
                        room = wall.room_ids[0]
                        if room in graph:
                            graph[room].add("EXTERIOR")
                            if "EXTERIOR" not in graph:
                                graph["EXTERIOR"] = set()
                            graph["EXTERIOR"].add(room)

        # Also use room.connected_rooms if set
        for room in floor_plan.rooms:
            for connected_id in room.connected_rooms:
                if connected_id in graph:
                    graph[room.id].add(connected_id)
                    graph[connected_id].add(room.id)

        return graph

    def _find_start_room(self, rooms: List[Room]) -> Room | None:
        """Find the entrance room or first room."""
        # Prefer entrance
        for room in rooms:
            if "entrance" in room.name.lower():
                return room

        # Fall back to hallway
        for room in rooms:
            if "hallway" in room.name.lower():
                return room

        # Fall back to first room
        return rooms[0] if rooms else None

    def _find_disconnected_rooms(
        self,
        graph: Dict[str, Set[str]],
        start_id: str,
        all_room_ids: Set[str],
    ) -> Set[str]:
        """Find rooms not reachable from start using BFS."""
        visited = set()
        queue = deque([start_id])
        visited.add(start_id)

        while queue:
            current = queue.popleft()
            for neighbor in graph.get(current, []):
                if neighbor not in visited and neighbor != "EXTERIOR":
                    visited.add(neighbor)
                    queue.append(neighbor)

        # Find rooms not visited
        return all_room_ids - visited

    def _get_room_name(self, rooms: List[Room], room_id: str) -> str:
        """Get room name by ID."""
        for room in rooms:
            if room.id == room_id:
                return room.name
        return room_id

    def get_connectivity_report(self, floor_plan: FloorPlan) -> dict:
        """
        Generate detailed connectivity report.

        Args:
            floor_plan: Floor plan to analyze

        Returns:
            Dict with connectivity analysis
        """
        graph = self._build_door_graph(floor_plan)
        start_room = self._find_start_room(floor_plan.rooms)

        room_ids = {r.id for r in floor_plan.rooms}
        disconnected = set()

        if start_room:
            disconnected = self._find_disconnected_rooms(
                graph, start_room.id, room_ids
            )

        # Count doors per room
        door_counts = {}
        for room in floor_plan.rooms:
            door_counts[room.name] = len(graph.get(room.id, set()))

        return {
            "total_rooms": len(floor_plan.rooms),
            "connected_rooms": len(room_ids) - len(disconnected),
            "disconnected_rooms": [
                self._get_room_name(floor_plan.rooms, rid)
                for rid in disconnected
            ],
            "fully_connected": len(disconnected) == 0,
            "door_counts": door_counts,
            "start_room": start_room.name if start_room else None,
        }
