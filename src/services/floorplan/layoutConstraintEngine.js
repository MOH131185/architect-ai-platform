import logger from "../../utils/logger.js";
import { safeNumber } from "../cad/architecturalSchema.js";

const DEFAULT_ROOM_DIMENSION_M = 3;

function normalizeZone(zone = "public") {
  const value = String(zone || "public").toLowerCase();
  if (["public", "private", "service", "core", "outdoor"].includes(value)) {
    return value;
  }
  return "public";
}

function inferZone(room = {}) {
  if (room.zone) return normalizeZone(room.zone);

  const value = `${room.name || ""} ${room.type || ""}`.toLowerCase();
  if (value.includes("bed") || value.includes("bath")) return "private";
  if (value.includes("stair") || value.includes("core")) return "core";
  if (
    value.includes("store") ||
    value.includes("utility") ||
    value.includes("laundry") ||
    value.includes("plant")
  ) {
    return "service";
  }
  return "public";
}

function normalizeRoom(room = {}, index = 0) {
  const targetArea = safeNumber(
    room.target_area_m2 ?? room.area_m2 ?? room.area,
    12,
  );
  return {
    id: room.id || `room-${index}`,
    name: room.name || room.label || `Room ${index + 1}`,
    type: room.type || room.program || room.name || "room",
    zone: inferZone(room),
    level: safeNumber(room.level, 0),
    target_area_m2: Math.max(4, targetArea),
    adjacency: Array.isArray(room.adjacency) ? room.adjacency : [],
    preferred_orientation:
      room.preferred_orientation || room.orientation || null,
    needs_daylight: room.needs_daylight !== false,
  };
}

function extractRoomProgram(request = {}) {
  if (Array.isArray(request.room_program)) return request.room_program;
  if (Array.isArray(request.roomProgram)) return request.roomProgram;
  if (Array.isArray(request.program)) return request.program;
  if (Array.isArray(request.program?.rooms)) return request.program.rooms;
  return [];
}

function inferFootprint(request = {}, roomProgram = []) {
  const explicitWidth = safeNumber(
    request.footprint?.width_m ?? request.width_m,
  );
  const explicitDepth = safeNumber(
    request.footprint?.depth_m ?? request.depth_m,
  );

  if (explicitWidth > 0 && explicitDepth > 0) {
    return {
      width_m: explicitWidth,
      depth_m: explicitDepth,
    };
  }

  const totalArea = roomProgram.reduce(
    (sum, room) => sum + room.target_area_m2,
    0,
  );
  const aspectRatio = safeNumber(request.aspect_ratio, 1.35) || 1.35;
  const levelCount = Math.max(
    1,
    safeNumber(request.level_count ?? request.levels, 1),
  );
  const perLevelArea = totalArea / levelCount;
  const width = Math.sqrt(perLevelArea * aspectRatio);
  const depth = perLevelArea / Math.max(width, 1);

  return {
    width_m: Number(width.toFixed(2)),
    depth_m: Number(depth.toFixed(2)),
  };
}

export function buildAdjacencyGraph(roomProgram = []) {
  const nodes = roomProgram.map((room) => ({
    id: room.id,
    label: room.name,
    zone: room.zone,
    level: room.level,
  }));

  const roomMap = new Map(roomProgram.map((room) => [room.id, room]));
  const edgeMap = new Map();

  roomProgram.forEach((room) => {
    room.adjacency.forEach((adjacentId) => {
      if (!roomMap.has(adjacentId)) return;
      const key = [room.id, adjacentId].sort().join("::");
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          id: key,
          from: room.id,
          to: adjacentId,
          weight: room.zone === roomMap.get(adjacentId).zone ? 1 : 0.75,
        });
      }
    });
  });

  return {
    nodes,
    edges: [...edgeMap.values()],
  };
}

export function validateProgram(program = []) {
  if (!Array.isArray(program) || !program.length) {
    return {
      isValid: false,
      errors: ["program must contain at least one room definition"],
      warnings: [],
      normalizedProgram: [],
    };
  }

  const normalizedProgram = program.map(normalizeRoom);
  const errors = [];
  const warnings = [];
  const seenIds = new Set();

  normalizedProgram.forEach((room) => {
    if (seenIds.has(room.id)) {
      errors.push(`duplicate room id "${room.id}"`);
    }
    seenIds.add(room.id);

    if (room.target_area_m2 <= 0) {
      errors.push(`room "${room.name}" must have a positive target area`);
    }

    if (!room.adjacency.length) {
      warnings.push(`room "${room.name}" has no adjacency preferences`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    normalizedProgram,
  };
}

function orderRoomsForLevel(rooms) {
  const zonePriority = {
    public: 0,
    core: 1,
    service: 2,
    private: 3,
    outdoor: 4,
  };

  return [...rooms].sort((left, right) => {
    const zoneDelta = zonePriority[left.zone] - zonePriority[right.zone];
    if (zoneDelta !== 0) return zoneDelta;
    return right.target_area_m2 - left.target_area_m2;
  });
}

function allocateRoomBoxes(rooms, footprint, levelNumber) {
  if (!rooms.length) {
    return [];
  }

  const orderedRooms = orderRoomsForLevel(rooms);
  const totalArea = orderedRooms.reduce(
    (sum, room) => sum + room.target_area_m2,
    0,
  );
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  return orderedRooms.map((room, index) => {
    const widthRatio = room.target_area_m2 / Math.max(totalArea, 1);
    const roomWidth = Math.max(
      DEFAULT_ROOM_DIMENSION_M,
      Number((footprint.width_m * Math.min(0.55, widthRatio * 2.6)).toFixed(2)),
    );
    const roomDepth = Math.max(
      DEFAULT_ROOM_DIMENSION_M,
      Number((room.target_area_m2 / Math.max(roomWidth, 1)).toFixed(2)),
    );

    if (cursorX + roomWidth > footprint.width_m) {
      cursorX = 0;
      cursorY += rowDepth;
      rowDepth = 0;
    }

    const box = {
      id: room.id,
      name: room.name,
      type: room.type,
      zone: room.zone,
      level: levelNumber,
      area_m2: room.target_area_m2,
      x_m: Number(cursorX.toFixed(2)),
      y_m: Number(cursorY.toFixed(2)),
      width_m: roomWidth,
      depth_m: roomDepth,
      center: {
        x_m: Number((cursorX + roomWidth / 2).toFixed(2)),
        y_m: Number((cursorY + roomDepth / 2).toFixed(2)),
      },
      preferred_orientation: room.preferred_orientation,
      needs_daylight: room.needs_daylight,
      order: index,
    };

    cursorX += roomWidth;
    rowDepth = Math.max(rowDepth, roomDepth);
    return box;
  });
}

function buildCirculation(levelLayouts, footprint) {
  return levelLayouts.map((level) => ({
    level: level.level,
    spine: {
      x1_m: Number((footprint.width_m * 0.15).toFixed(2)),
      y1_m: Number((footprint.depth_m * 0.5).toFixed(2)),
      x2_m: Number((footprint.width_m * 0.85).toFixed(2)),
      y2_m: Number((footprint.depth_m * 0.5).toFixed(2)),
    },
    entry_node: level.rooms[0]?.id || null,
    vertical_core: level.core?.id || null,
  }));
}

function buildCorePlacement(levelLayouts, footprint) {
  const coreWidth = Math.max(
    2.4,
    Number((footprint.width_m * 0.18).toFixed(2)),
  );
  const coreDepth = Math.max(
    3.6,
    Number((footprint.depth_m * 0.22).toFixed(2)),
  );

  return levelLayouts.map((level) => ({
    level: level.level,
    id: `core-${level.level}`,
    type: "stair-core",
    x_m: Number((footprint.width_m * 0.5 - coreWidth / 2).toFixed(2)),
    y_m: Number((footprint.depth_m * 0.5 - coreDepth / 2).toFixed(2)),
    width_m: coreWidth,
    depth_m: coreDepth,
  }));
}

function buildZoningSummary(roomProgram) {
  return roomProgram.reduce(
    (summary, room) => {
      summary[room.zone] = (summary[room.zone] || 0) + 1;
      return summary;
    },
    { public: 0, private: 0, service: 0, core: 0, outdoor: 0 },
  );
}

export function applyLayoutConstraints(layout = {}, constraints = {}) {
  const applied = [];
  const warnings = [];
  const targetArea =
    safeNumber(constraints.target_area_m2 ?? constraints.targetAreaM2) ||
    safeNumber(layout.target_area_m2);
  const actualArea = Array.isArray(layout.levels)
    ? layout.levels.reduce(
        (sum, level) =>
          sum +
          level.rooms.reduce(
            (roomSum, room) => roomSum + safeNumber(room.area_m2),
            0,
          ),
        0,
      )
    : 0;

  if (targetArea > 0) {
    applied.push("target_area");
    const delta = Number((actualArea - targetArea).toFixed(2));
    if (Math.abs(delta) > Math.max(8, targetArea * 0.15)) {
      warnings.push(
        `placeholder layout area differs from target by ${delta} m2 and will need refinement in Phase 2`,
      );
    }
  }

  const maxLevels = safeNumber(constraints.max_levels ?? constraints.maxLevels);
  if (maxLevels > 0) {
    applied.push("max_levels");
    if (safeNumber(layout.level_count) > maxLevels) {
      warnings.push(
        `layout level count ${layout.level_count} exceeds max_levels ${maxLevels}`,
      );
    }
  }

  const preserveAdjacency = constraints.preserve_adjacency !== false;
  if (preserveAdjacency) {
    applied.push("preserve_adjacency");
  }

  return {
    ...layout,
    constraint_report: {
      applied,
      warnings,
      target_area_m2: targetArea || null,
      actual_area_m2: Number(actualArea.toFixed(2)),
      preserve_adjacency: preserveAdjacency,
    },
  };
}

/**
 * Deterministic fallback solver for structured floorplan generation.
 */
export function solveLayoutConstraints(request = {}) {
  const validation = validateProgram(extractRoomProgram(request));
  if (!validation.isValid) {
    throw new Error(validation.errors.join("; "));
  }

  const roomProgram = validation.normalizedProgram;
  const requestedLevels = Array.isArray(request.levels)
    ? request.levels.length
    : request.program?.levels
      ? safeNumber(request.program.levels)
      : request.levels;
  const levelCount = Math.max(
    1,
    safeNumber(request.level_count ?? requestedLevels, 1),
  );
  const footprint = inferFootprint(request, roomProgram);
  const adjacency_graph = buildAdjacencyGraph(roomProgram);

  const roomsByLevel = Array.from({ length: levelCount }, (_, index) =>
    roomProgram.filter((room) => room.level === index),
  );

  if (!roomProgram.length) {
    throw new Error("room_program is required to solve layout constraints");
  }

  if (!roomsByLevel.some((rooms) => rooms.length > 0)) {
    roomsByLevel[0] = roomProgram;
  }

  const levelLayouts = roomsByLevel.map((rooms, level) => ({
    level,
    rooms: allocateRoomBoxes(
      rooms.length ? rooms : roomProgram.filter((room) => room.level === 0),
      footprint,
      level,
    ),
  }));

  const cores = buildCorePlacement(levelLayouts, footprint);
  levelLayouts.forEach((layout, index) => {
    layout.core = cores[index];
    layout.stairs = [
      {
        id: `stair-${layout.level}`,
        type: "stair",
        x_m: layout.core.x_m,
        y_m: layout.core.y_m,
        width_m: layout.core.width_m,
        depth_m: layout.core.depth_m,
      },
    ];
  });

  const baseLayout = {
    project_id: request.project_id || request.projectId || "archiai-floorplan",
    building_type: request.building_type || request.buildingType || null,
    strategy: "deterministic-constraint-solver",
    footprint,
    level_count: levelCount,
    target_area_m2:
      safeNumber(request.target_area_m2 ?? request.targetAreaM2) ||
      roomProgram.reduce((sum, room) => sum + room.target_area_m2, 0),
    adjacency_graph,
    zoning: buildZoningSummary(roomProgram),
    circulation: buildCirculation(levelLayouts, footprint),
    levels: levelLayouts,
    validation,
    site_boundary: request.site_boundary || request.site || null,
    solver_notes: [
      "Uses deterministic zoning and strip-packing fallback.",
      "Designed as a clean contract until a HouseDiffusion-like adapter is attached.",
    ],
  };

  return applyLayoutConstraints(baseLayout, request.constraints || {});
}

export function buildLayoutSummary(layout = {}) {
  const roomCount = Array.isArray(layout.levels)
    ? layout.levels.reduce((sum, level) => sum + level.rooms.length, 0)
    : 0;

  return {
    project_id: layout.project_id || null,
    strategy: layout.strategy || "unknown",
    room_count: roomCount,
    level_count: safeNumber(layout.level_count),
    footprint: layout.footprint || null,
    adjacency_count: layout.adjacency_graph?.edges?.length || 0,
    zoning: layout.zoning || null,
  };
}

logger.debug("[Floorplan] Layout constraint engine ready");

export default {
  applyLayoutConstraints,
  buildAdjacencyGraph,
  solveLayoutConstraints,
  buildLayoutSummary,
  validateProgram,
};
