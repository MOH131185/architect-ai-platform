import {
  validateEntityReferences,
  validateProjectGeometrySchema,
} from "../cad/geometryValidators.js";
import {
  explainAdjacencyConflicts,
  scoreAdjacencySolution,
} from "../floorplan/adjacencyGraphBuilder.js";

const EPSILON = 0.01;

function bbox(entity = {}) {
  return (
    entity.bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 0,
      max_y: 0,
      width: 0,
      height: 0,
    }
  );
}

function overlapArea(left = {}, right = {}) {
  const a = bbox(left);
  const b = bbox(right);
  const overlapWidth = Math.min(a.max_x, b.max_x) - Math.max(a.min_x, b.min_x);
  const overlapHeight = Math.min(a.max_y, b.max_y) - Math.max(a.min_y, b.min_y);
  if (overlapWidth <= EPSILON || overlapHeight <= EPSILON) {
    return 0;
  }
  return overlapWidth * overlapHeight;
}

function roomInsideEnvelope(room = {}, envelope = {}) {
  const roomBox = bbox(room);
  return (
    roomBox.min_x >= envelope.min_x - EPSILON &&
    roomBox.min_y >= envelope.min_y - EPSILON &&
    roomBox.max_x <= envelope.max_x + EPSILON &&
    roomBox.max_y <= envelope.max_y + EPSILON
  );
}

export function detectRoomOverlaps(rooms = []) {
  const overlaps = [];
  const roomGroups = new Map();

  rooms.forEach((room) => {
    const key = room.level_id || "ground";
    if (!roomGroups.has(key)) {
      roomGroups.set(key, []);
    }
    roomGroups.get(key).push(room);
  });

  roomGroups.forEach((groupRooms) => {
    for (let leftIndex = 0; leftIndex < groupRooms.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < groupRooms.length;
        rightIndex += 1
      ) {
        const area = overlapArea(groupRooms[leftIndex], groupRooms[rightIndex]);
        if (area > EPSILON) {
          overlaps.push({
            room_a: groupRooms[leftIndex].id,
            room_b: groupRooms[rightIndex].id,
            overlap_area_m2: Number(area.toFixed(3)),
          });
        }
      }
    }
  });

  return overlaps;
}

function checkRoomAreaSanity(rooms = []) {
  const warnings = [];
  const errors = [];
  rooms.forEach((room) => {
    if (room.actual_area <= 0) {
      errors.push(`room "${room.id}" has non-positive area.`);
      return;
    }

    if (room.actual_area < room.min_area - EPSILON) {
      errors.push(
        `room "${room.id}" is smaller than its min_area (${room.actual_area} < ${room.min_area}).`,
      );
    } else if (room.actual_area > room.max_area + EPSILON) {
      errors.push(
        `room "${room.id}" exceeds its max_area (${room.actual_area} > ${room.max_area}).`,
      );
    } else if (
      Math.abs(room.actual_area - room.target_area) /
        Math.max(room.target_area, 1) >
      0.2
    ) {
      warnings.push(
        `room "${room.id}" differs from target_area by more than 20%.`,
      );
    }
  });

  return { warnings, errors };
}

function checkRoomsInsideEnvelope(geometry = {}) {
  const envelope = geometry.site?.buildable_bbox || null;
  if (!envelope) {
    return {
      warnings: ["geometry.site.buildable_bbox is missing."],
      errors: [],
    };
  }

  const invalidRooms = (geometry.rooms || []).filter(
    (room) => !roomInsideEnvelope(room, envelope),
  );

  return {
    warnings: [],
    errors: invalidRooms.map(
      (room) => `room "${room.id}" is outside the buildable envelope.`,
    ),
  };
}

function checkOpenings(geometry = {}) {
  const warnings = [];
  const errors = [];
  const wallMap = new Map(
    (geometry.walls || []).map((wall) => [wall.id, wall]),
  );

  (geometry.doors || []).forEach((door) => {
    const wall = wallMap.get(door.wall_id);
    if (!wall) {
      errors.push(`door "${door.id}" references a missing wall.`);
      return;
    }
    if (wall.exterior || (wall.room_ids || []).length < 2) {
      errors.push(`door "${door.id}" is not placed on a valid shared wall.`);
    }
    if (door.level_id !== wall.level_id) {
      errors.push(`door "${door.id}" does not match wall level assignment.`);
    }
  });

  (geometry.windows || []).forEach((window) => {
    const wall = wallMap.get(window.wall_id);
    if (!wall) {
      errors.push(`window "${window.id}" references a missing wall.`);
      return;
    }
    if (!wall.exterior) {
      errors.push(`window "${window.id}" must be placed on an exterior wall.`);
    }
    if (window.level_id !== wall.level_id) {
      errors.push(
        `window "${window.id}" does not match wall level assignment.`,
      );
    }
  });

  return { warnings, errors };
}

function checkStairs(geometry = {}) {
  if ((geometry.levels || []).length <= 1) {
    return { warnings: [], errors: [] };
  }

  if ((geometry.stairs || []).length) {
    return { warnings: [], errors: [] };
  }

  return {
    warnings: [],
    errors: ["multi-level projects must include at least one stair element."],
  };
}

function checkAdjacency(geometry = {}, adjacencyGraph = null) {
  if (!adjacencyGraph?.edges?.length) {
    return {
      warnings: [],
      errors: [],
      metrics: {
        score: 1,
      },
    };
  }

  const scoring = scoreAdjacencySolution(adjacencyGraph, {
    projectGeometry: geometry,
  });
  const conflicts = explainAdjacencyConflicts(adjacencyGraph, {
    projectGeometry: geometry,
  });

  const errors = conflicts
    .filter((conflict) => conflict.severity === "high")
    .map((conflict) => conflict.explanation);
  const warnings = conflicts
    .filter((conflict) => conflict.severity !== "high")
    .map((conflict) => conflict.explanation);

  return {
    warnings,
    errors,
    repairSuggestions: conflicts.map((conflict) => conflict.suggested_repair),
    metrics: scoring,
  };
}

function checkLevelMembershipConsistency(geometry = {}) {
  const warnings = [];
  const errors = [];
  const roomMap = new Map(
    (geometry.rooms || []).map((room) => [room.id, room]),
  );
  const wallMap = new Map(
    (geometry.walls || []).map((wall) => [wall.id, wall]),
  );

  (geometry.levels || []).forEach((level) => {
    (level.room_ids || []).forEach((roomId) => {
      if (roomMap.get(roomId)?.level_id !== level.id) {
        errors.push(
          `room "${roomId}" is referenced by level "${level.id}" but belongs to another level.`,
        );
      }
    });
    (level.wall_ids || []).forEach((wallId) => {
      if (wallMap.get(wallId)?.level_id !== level.id) {
        errors.push(
          `wall "${wallId}" is referenced by level "${level.id}" but belongs to another level.`,
        );
      }
    });
  });

  if (
    (geometry.rooms || []).length &&
    !(geometry.levels || []).some((level) => (level.room_ids || []).length)
  ) {
    warnings.push(
      "levels do not contain room_ids references for the current rooms.",
    );
  }

  return { warnings, errors };
}

export function runGeometryConsistencyChecks({
  projectGeometry,
  adjacencyGraph = null,
} = {}) {
  const schemaCheck = validateProjectGeometrySchema(projectGeometry);
  const referenceCheck = validateEntityReferences(projectGeometry);
  const overlaps = detectRoomOverlaps(projectGeometry.rooms || []);
  const roomAreaCheck = checkRoomAreaSanity(projectGeometry.rooms || []);
  const roomInsideCheck = checkRoomsInsideEnvelope(projectGeometry);
  const openingCheck = checkOpenings(projectGeometry);
  const stairCheck = checkStairs(projectGeometry);
  const adjacencyCheck = checkAdjacency(projectGeometry, adjacencyGraph);
  const levelMembershipCheck = checkLevelMembershipConsistency(projectGeometry);

  const errors = [
    ...schemaCheck.errors,
    ...referenceCheck.errors,
    ...roomAreaCheck.errors,
    ...roomInsideCheck.errors,
    ...openingCheck.errors,
    ...stairCheck.errors,
    ...adjacencyCheck.errors,
    ...levelMembershipCheck.errors,
    ...overlaps.map(
      (overlap) =>
        `rooms "${overlap.room_a}" and "${overlap.room_b}" overlap by ${overlap.overlap_area_m2} m2.`,
    ),
  ];
  const warnings = [
    ...schemaCheck.warnings,
    ...referenceCheck.warnings,
    ...roomAreaCheck.warnings,
    ...roomInsideCheck.warnings,
    ...openingCheck.warnings,
    ...stairCheck.warnings,
    ...(adjacencyCheck.warnings || []),
    ...levelMembershipCheck.warnings,
  ];
  const repairSuggestions = [...(adjacencyCheck.repairSuggestions || [])];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairSuggestions,
    checks: {
      schema: schemaCheck,
      references: referenceCheck,
      overlaps,
      area: roomAreaCheck,
      insideEnvelope: roomInsideCheck,
      openings: openingCheck,
      stairs: stairCheck,
      adjacency: adjacencyCheck,
      levelMembership: levelMembershipCheck,
    },
  };
}

export default {
  detectRoomOverlaps,
  runGeometryConsistencyChecks,
};
