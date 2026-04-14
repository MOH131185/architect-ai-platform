import { createCirculationGeometry } from "../cad/geometryFactory.js";

function levelMidline(level = {}) {
  const bbox = level.buildable_bbox ||
    level.footprint_bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 12,
      max_y: 10,
    };
  const midY = Number(((bbox.min_y + bbox.max_y) / 2).toFixed(3));
  return [
    { x: Number((bbox.min_x + 0.8).toFixed(3)), y: midY },
    { x: Number((bbox.max_x - 0.8).toFixed(3)), y: midY },
  ];
}

function doorConnectorPolyline(door = {}, room = {}) {
  const start = room.centroid || {
    x: Number(((room.bbox?.min_x || 0) + (room.bbox?.max_x || 0)) / 2),
    y: Number(((room.bbox?.min_y || 0) + (room.bbox?.max_y || 0)) / 2),
  };
  const end = door.position_m || { x: 0, y: 0 };
  return [
    { x: Number(start.x.toFixed(3)), y: Number(start.y.toFixed(3)) },
    { x: Number(end.x.toFixed(3)), y: Number(end.y.toFixed(3)) },
  ];
}

export function generateCirculation(level = {}, options = {}) {
  const projectId = options.projectId || level.project_id || "phase2-project";
  const levelId =
    options.levelId || level.id || `level-${level.level_number || 0}`;
  const rooms = Array.isArray(level.rooms) ? level.rooms : [];
  const doors = Array.isArray(level.doors) ? level.doors : [];
  const roomMap = new Map(rooms.map((room) => [room.id, room]));

  const circulation = [
    createCirculationGeometry(projectId, levelId, {
      path_type: "main_spine",
      polyline: levelMidline(level),
      width_m: 1.4,
      source: "circulation-generator",
    }),
  ];

  doors.forEach((door, index) => {
    const fromRoomId = Array.isArray(door.room_ids) ? door.room_ids[0] : null;
    const toRoomId = Array.isArray(door.room_ids)
      ? door.room_ids[1] || null
      : null;
    const fromRoom = roomMap.get(fromRoomId);
    if (!fromRoom) {
      return;
    }

    circulation.push(
      createCirculationGeometry(
        projectId,
        levelId,
        {
          path_type: "door_connector",
          from_room_id: fromRoomId,
          to_room_id: toRoomId,
          polyline: doorConnectorPolyline(door, fromRoom),
          width_m: 1.1,
          source: "circulation-generator",
        },
        index + 1,
      ),
    );
  });

  return {
    circulation,
    stats: {
      path_count: circulation.length,
    },
  };
}

export default {
  generateCirculation,
};
