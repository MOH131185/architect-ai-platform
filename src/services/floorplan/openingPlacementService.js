import { createOpeningGeometry } from "../cad/geometryFactory.js";

function midpointOfWall(wall = {}) {
  return {
    x: Number(
      ((Number(wall.start?.x || 0) + Number(wall.end?.x || 0)) / 2).toFixed(3),
    ),
    y: Number(
      ((Number(wall.start?.y || 0) + Number(wall.end?.y || 0)) / 2).toFixed(3),
    ),
  };
}

function edgeKey(a, b) {
  return [a, b].sort().join("::");
}

function buildAdjacencySet(graph = {}) {
  return new Set(
    (graph.edges || []).map((edge) => edgeKey(edge.from, edge.to)),
  );
}

function shouldPlaceDoorOnWall(
  wall = {},
  adjacencySet = new Set(),
  roomMap = new Map(),
) {
  if (
    wall.exterior ||
    !Array.isArray(wall.room_ids) ||
    wall.room_ids.length !== 2
  ) {
    return false;
  }

  const [leftRoomId, rightRoomId] = wall.room_ids;
  const leftRoom = roomMap.get(leftRoomId);
  const rightRoom = roomMap.get(rightRoomId);
  if (leftRoom?.type === "stair_core" || rightRoom?.type === "stair_core") {
    return wall.length_m >= 0.9;
  }
  return (
    wall.length_m >= 0.9 && adjacencySet.has(edgeKey(leftRoomId, rightRoomId))
  );
}

function pickWindowWallsForRooms(walls = [], roomMap = new Map()) {
  const bestWallByRoom = new Map();

  walls
    .filter(
      (wall) =>
        wall.exterior &&
        Array.isArray(wall.room_ids) &&
        wall.room_ids.length === 1,
    )
    .forEach((wall) => {
      const roomId = wall.room_ids[0];
      const room = roomMap.get(roomId);
      if (!room || room.requires_daylight === false || wall.length_m < 1.2) {
        return;
      }

      const existing = bestWallByRoom.get(roomId);
      if (!existing || wall.length_m > existing.length_m) {
        bestWallByRoom.set(roomId, wall);
      }
    });

  return [...bestWallByRoom.values()];
}

export function placeOpenings(level = {}, options = {}) {
  const projectId = options.projectId || level.project_id || "phase2-project";
  const levelId =
    options.levelId || level.id || `level-${level.level_number || 0}`;
  const walls = Array.isArray(level.walls) ? level.walls : [];
  const rooms = Array.isArray(level.rooms) ? level.rooms : [];
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const adjacencySet = buildAdjacencySet(options.adjacencyGraph || {});

  const doors = walls
    .filter((wall) => shouldPlaceDoorOnWall(wall, adjacencySet, roomMap))
    .map((wall, index) =>
      createOpeningGeometry(
        projectId,
        levelId,
        "door",
        {
          wall_id: wall.id,
          room_ids: wall.room_ids,
          width_m: Math.min(1.2, Math.max(0.9, wall.length_m * 0.35)),
          position_m: midpointOfWall(wall),
          swing: wall.orientation === "vertical" ? "left" : "right",
          source: "opening-placement-service",
        },
        index,
      ),
    );

  const windows = pickWindowWallsForRooms(walls, roomMap).map((wall, index) =>
    createOpeningGeometry(
      projectId,
      levelId,
      "window",
      {
        wall_id: wall.id,
        room_ids: wall.room_ids,
        width_m: Math.min(2.4, Math.max(1.2, wall.length_m * 0.45)),
        position_m: midpointOfWall(wall),
        sill_height_m: 0.9,
        head_height_m: 2.1,
        exterior: true,
        source: "opening-placement-service",
      },
      index,
    ),
  );

  return {
    doors,
    windows,
    stats: {
      door_count: doors.length,
      window_count: windows.length,
    },
  };
}

export default {
  placeOpenings,
};
