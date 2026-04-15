import { roundMetric } from "../cad/projectGeometrySchema.js";

function centroid(room = {}) {
  return {
    x: Number(room.centroid?.x || room.bbox?.min_x || 0),
    y: Number(room.centroid?.y || room.bbox?.min_y || 0),
  };
}

function distance(a = {}, b = {}) {
  return Math.hypot(
    Number(a.x || 0) - Number(b.x || 0),
    Number(a.y || 0) - Number(b.y || 0),
  );
}

export function scoreCorridorQuality(layout = {}) {
  const levels = Array.isArray(layout.levels) ? layout.levels : [];
  if (!levels.length) {
    return {
      score: 1,
      metrics: {
        average_core_distance_m: 0,
        inaccessible_room_count: 0,
      },
    };
  }

  let totalDistance = 0;
  let countedRooms = 0;
  let inaccessibleRoomCount = 0;

  levels.forEach((level) => {
    const coreRoom = (level.rooms || []).find(
      (room) => room.type === "stair_core",
    );
    const occupiedRooms = (level.rooms || []).filter(
      (room) => room.type !== "stair_core",
    );
    if (!occupiedRooms.length) return;

    occupiedRooms.forEach((room) => {
      const touchesCore = coreRoom
        ? Number(room.bbox?.min_y || 0) <
            Number(coreRoom.bbox?.max_y || 0) + 0.01 &&
          Number(room.bbox?.max_y || 0) >
            Number(coreRoom.bbox?.min_y || 0) - 0.01
        : true;
      if (!touchesCore && coreRoom) {
        inaccessibleRoomCount += 1;
      }

      totalDistance += coreRoom
        ? distance(centroid(room), centroid(coreRoom))
        : 0;
      countedRooms += 1;
    });
  });

  const averageCoreDistance = countedRooms
    ? roundMetric(totalDistance / countedRooms)
    : 0;
  const distancePenalty =
    averageCoreDistance > 0 ? Math.min(0.45, averageCoreDistance / 30) : 0;
  const accessPenalty = countedRooms ? inaccessibleRoomCount / countedRooms : 0;
  const score = roundMetric(
    Math.max(0.25, 1 - distancePenalty - accessPenalty * 0.75),
  );

  return {
    score,
    metrics: {
      average_core_distance_m: averageCoreDistance,
      inaccessible_room_count: inaccessibleRoomCount,
      room_count: countedRooms,
    },
  };
}

export default {
  scoreCorridorQuality,
};
