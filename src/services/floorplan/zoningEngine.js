import { roundMetric } from "../cad/projectGeometrySchema.js";

const ZONE_ORDER_GROUND = ["public", "core", "service", "private", "outdoor"];
const ZONE_ORDER_UPPER = ["private", "core", "service", "public", "outdoor"];

function inferZoneFromRoom(room = {}) {
  if (room.zone) {
    return room.zone;
  }

  if (room.privacy_level >= 2) {
    return "private";
  }
  if (room.wet_zone) {
    return "service";
  }
  if (
    (room.access_requirements || []).includes("vertical_circulation") ||
    String(room.type || "").includes("stair")
  ) {
    return "core";
  }
  return "public";
}

export function assignRoomZones(program = []) {
  return program.map((room) => ({
    ...room,
    zone: inferZoneFromRoom(room),
  }));
}

export function assignRoomsToLevels(program = [], levelCount = 1) {
  const normalizedLevelCount = Math.max(1, Number(levelCount) || 1);
  const zonedRooms = assignRoomZones(program);

  if (normalizedLevelCount === 1) {
    return {
      level_count: 1,
      levels: [
        {
          level_number: 0,
          rooms: zonedRooms,
        },
      ],
    };
  }

  const groundRooms = [];
  const upperRooms = Array.from({ length: normalizedLevelCount - 1 }, () => []);
  let privateIndex = 0;

  zonedRooms.forEach((room) => {
    if (
      Number.isFinite(Number(room.level_hint)) &&
      Number(room.level_hint) >= 0 &&
      Number(room.level_hint) < normalizedLevelCount
    ) {
      const preferredLevel = Number(room.level_hint);
      if (preferredLevel === 0) {
        groundRooms.push(room);
      } else {
        upperRooms[preferredLevel - 1].push(room);
      }
      return;
    }

    if (room.zone === "private" && upperRooms.length) {
      upperRooms[privateIndex % upperRooms.length].push(room);
      privateIndex += 1;
      return;
    }

    groundRooms.push(room);
  });

  return {
    level_count: normalizedLevelCount,
    levels: [
      {
        level_number: 0,
        rooms: groundRooms,
      },
      ...upperRooms.map((rooms, index) => ({
        level_number: index + 1,
        rooms,
      })),
    ],
  };
}

export function buildZoneBands(
  rooms = [],
  buildableBbox = {},
  levelNumber = 0,
) {
  const zoneOrder = levelNumber === 0 ? ZONE_ORDER_GROUND : ZONE_ORDER_UPPER;
  const totalArea = rooms.reduce((sum, room) => sum + room.target_area, 0) || 1;
  const width = buildableBbox.width || 12;
  const envelopeDepth = buildableBbox.height || 10;
  const requiredDepth = totalArea / Math.max(width, 1);
  const depthScale =
    requiredDepth > envelopeDepth ? envelopeDepth / requiredDepth : 1;
  const presentZones = zoneOrder.filter((zone) =>
    rooms.some((room) => room.zone === zone),
  );
  let cursorY = buildableBbox.min_y || 0;

  const bands = presentZones.map((zone, index) => {
    const zoneArea = rooms
      .filter((room) => room.zone === zone)
      .reduce((sum, room) => sum + room.target_area, 0);
    const depth = roundMetric((zoneArea / Math.max(width, 1)) * depthScale);
    const band = {
      zone,
      x: buildableBbox.min_x || 0,
      y: roundMetric(cursorY),
      width: roundMetric(width),
      depth: Math.max(2.4, depth),
      scale_factor: depthScale,
    };
    cursorY += band.depth;
    return band;
  });

  if (!bands.length) {
    return [];
  }

  const lastBand = bands[bands.length - 1];
  const overflow = roundMetric(
    cursorY - ((buildableBbox.min_y || 0) + envelopeDepth),
  );
  if (overflow > 0) {
    lastBand.depth = roundMetric(Math.max(2.4, lastBand.depth - overflow));
  }

  return bands;
}

export function buildZoningSummary(levelAssignments = {}) {
  const levels = Array.isArray(levelAssignments.levels)
    ? levelAssignments.levels
    : [];
  const totals = { public: 0, private: 0, service: 0, core: 0, outdoor: 0 };

  levels.forEach((level) => {
    level.rooms.forEach((room) => {
      totals[room.zone] = (totals[room.zone] || 0) + 1;
    });
  });

  return totals;
}

export default {
  assignRoomZones,
  assignRoomsToLevels,
  buildZoneBands,
  buildZoningSummary,
};
