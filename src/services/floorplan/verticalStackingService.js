import { createStableId } from "../cad/projectGeometrySchema.js";

function normalizeRoomCollection(program = []) {
  if (Array.isArray(program)) return program;
  if (Array.isArray(program.rooms)) return program.rooms;
  return [];
}

function normalizeFamilyKey(room = {}) {
  const source = String(room.type || room.name || room.id || "room")
    .trim()
    .toLowerCase()
    .replace(/\d+/g, "")
    .replace(/[_\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return source || "room";
}

function levelCountFromInput(levelsOrCount, constraints = {}) {
  if (Array.isArray(levelsOrCount)) {
    return Math.max(1, levelsOrCount.length);
  }
  return Math.max(
    1,
    Number(
      constraints.levelCount ||
        constraints.level_count ||
        levelsOrCount ||
        constraints.levels ||
        1,
    ) || 1,
  );
}

function buildLevelDescriptors(levelCount) {
  return Array.from({ length: levelCount }, (_, index) => ({
    id: `level-${index}`,
    level_number: index,
  }));
}

function inferPreferredLevelRange(room = {}, levelCount = 1) {
  if (Number.isFinite(Number(room.level_hint))) {
    const exact = Math.max(
      0,
      Math.min(levelCount - 1, Number(room.level_hint)),
    );
    return { min: exact, max: exact };
  }

  if (levelCount === 1) {
    return { min: 0, max: 0 };
  }

  if (room.zone === "public")
    return { min: 0, max: Math.min(1, levelCount - 1) };
  if (room.zone === "service" && room.wet_zone)
    return { min: 0, max: levelCount - 1 };
  if (room.zone === "service")
    return { min: 0, max: Math.min(1, levelCount - 1) };
  if (room.zone === "core") return { min: 0, max: levelCount - 1 };
  if (room.zone === "private")
    return { min: Math.min(1, levelCount - 1), max: levelCount - 1 };
  return { min: 0, max: levelCount - 1 };
}

function buildWetZoneTargets(levelCount) {
  if (levelCount === 1) return [0];
  return Array.from({ length: levelCount }, (_, index) => index);
}

function isVerticalStackSensitive(room = {}) {
  if (room.wet_zone) return true;
  if (room.zone === "core") return true;
  return (room.access_requirements || []).includes("vertical_circulation");
}

function scoreLevel(room, levelNumber, context = {}) {
  const {
    levelCount = 1,
    wetTargets = [],
    levelLoads = new Map(),
    averageLevelLoad = 0,
    assignedWetLevels = new Set(),
  } = context;
  const range = inferPreferredLevelRange(room, levelCount);

  if (levelNumber < range.min || levelNumber > range.max) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (room.zone === "public") score += levelNumber === 0 ? 40 : 5;
  if (room.zone === "service") score += levelNumber <= 1 ? 24 : 8;
  if (room.zone === "private") score += levelNumber > 0 ? 34 : 2;
  if (room.zone === "core") score += 28;
  if (room.wet_zone && wetTargets.includes(levelNumber)) score += 18;
  if (room.requires_daylight && levelNumber === 0) score += 4;

  if (room.wet_zone && levelCount > 1) {
    score += assignedWetLevels.has(levelNumber) ? 4 : 10;
  }

  if (room.zone === "private" && levelCount > 2) {
    score += levelNumber >= 1 ? levelNumber * 3 : 0;
  }

  if (isVerticalStackSensitive(room) && room.zone !== "public") {
    score += levelNumber <= Math.max(1, levelCount - 1) ? 4 : 0;
  }

  const existingLoad = Number(levelLoads.get(levelNumber) || 0);
  const loadPenaltyBase = averageLevelLoad || room.target_area || 1;
  score -= (existingLoad / Math.max(loadPenaltyBase, 1)) * 6;
  score += room.target_area ? Math.max(0, 10 - room.target_area * 0.05) : 0;
  score -= levelNumber * (room.zone === "public" ? 4 : 0);
  return score;
}

export function buildVerticalStackingPlan(levelsOrCount, roomsInput = []) {
  const rooms = normalizeRoomCollection(roomsInput);
  const levelCount = levelCountFromInput(levelsOrCount);
  const groups = new Map();

  rooms.forEach((room) => {
    const familyKey = normalizeFamilyKey(room);
    if (!groups.has(familyKey)) {
      groups.set(familyKey, {
        stack_id: createStableId("stack", familyKey),
        family_key: familyKey,
        room_ids: [],
        wet_zone: false,
        privacy_level: 0,
        stack_policy: "cluster",
      });
    }

    const group = groups.get(familyKey);
    group.room_ids.push(room.id);
    group.wet_zone = group.wet_zone || room.wet_zone === true;
    group.privacy_level = Math.max(
      group.privacy_level,
      Number(room.privacy_level || 0),
    );
    if (room.wet_zone || room.zone === "core") {
      group.stack_policy = "vertical_repeat";
    } else if (Number(room.privacy_level || 0) >= 2) {
      group.stack_policy = "upper_cluster";
    }
  });

  const orderedGroups = [...groups.values()].sort((left, right) => {
    if (right.wet_zone !== left.wet_zone) {
      return Number(right.wet_zone) - Number(left.wet_zone);
    }
    if (right.privacy_level !== left.privacy_level) {
      return right.privacy_level - left.privacy_level;
    }
    return left.family_key.localeCompare(right.family_key);
  });

  return {
    level_count: levelCount,
    stacks: orderedGroups.map((group, index) => ({
      ...group,
      stack_order: index,
      preferred_anchor: index % Math.max(1, levelCount),
    })),
  };
}

export function optimizeLevelDistribution(
  levelsOrCount,
  roomsInput = [],
  constraints = {},
) {
  const rooms = normalizeRoomCollection(roomsInput);
  const levelCount = levelCountFromInput(levelsOrCount, constraints);
  const levels = buildLevelDescriptors(levelCount).map((level) => ({
    ...level,
    rooms: [],
  }));
  const stackingPlan = buildVerticalStackingPlan(levelCount, rooms);
  const wetTargets = buildWetZoneTargets(levelCount);
  const levelLoads = new Map(levels.map((level) => [level.level_number, 0]));
  const assignedWetLevels = new Set();
  const stackLookup = new Map(
    stackingPlan.stacks.flatMap((stack) =>
      stack.room_ids.map((roomId) => [roomId, stack]),
    ),
  );

  const assignments = [...rooms]
    .sort((left, right) => {
      const leftHint = Number.isFinite(Number(left.level_hint)) ? 1 : 0;
      const rightHint = Number.isFinite(Number(right.level_hint)) ? 1 : 0;
      if (rightHint !== leftHint) return rightHint - leftHint;
      if (
        Number(right.privacy_level || 0) !== Number(left.privacy_level || 0)
      ) {
        return (
          Number(right.privacy_level || 0) - Number(left.privacy_level || 0)
        );
      }
      if (Number(right.wet_zone) !== Number(left.wet_zone)) {
        return Number(right.wet_zone) - Number(left.wet_zone);
      }
      if (Number(right.target_area || 0) !== Number(left.target_area || 0)) {
        return Number(right.target_area || 0) - Number(left.target_area || 0);
      }
      return String(left.id).localeCompare(String(right.id));
    })
    .map((room) => {
      const scoring = levels
        .map((level) => ({
          level_number: level.level_number,
          score: scoreLevel(room, level.level_number, {
            levelCount,
            wetTargets,
            levelLoads,
            averageLevelLoad:
              levels.length > 0
                ? [...levelLoads.values()].reduce(
                    (sum, value) => sum + value,
                    0,
                  ) / levels.length
                : 0,
            assignedWetLevels,
          }),
        }))
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.level_number - right.level_number;
        });

      const selected = scoring[0];
      const stack = stackLookup.get(room.id);
      const reasons = [];
      if (room.zone === "public" && selected.level_number === 0)
        reasons.push("Public/shared room kept on the lower level.");
      if (room.zone === "private" && selected.level_number > 0)
        reasons.push("Private room moved to an upper level.");
      if (room.wet_zone)
        reasons.push(
          "Wet zone assigned with vertical wet-stack continuity in mind.",
        );
      if (stack?.stack_policy === "vertical_repeat") {
        reasons.push(
          `Family "${stack.family_key}" marked for vertical repetition across levels.`,
        );
      } else if (stack) {
        reasons.push(
          `Family "${stack.family_key}" kept in a consistent level cluster.`,
        );
      }
      if (Number.isFinite(Number(room.level_hint)))
        reasons.push("Explicit level hint preserved.");
      if (!Number.isFinite(Number(room.level_hint))) {
        reasons.push(
          "Level load balancing used to avoid over-concentrating one floor.",
        );
      }

      const assignment = {
        ...room,
        assigned_level: selected.level_number,
        stack_id: stack?.stack_id || null,
        stack_order: stack?.stack_order ?? null,
        assignment_reasoning: reasons,
      };

      levels[selected.level_number].rooms.push(assignment);
      levelLoads.set(
        selected.level_number,
        Number(levelLoads.get(selected.level_number) || 0) +
          Number(room.target_area || 0),
      );
      if (room.wet_zone) {
        assignedWetLevels.add(selected.level_number);
      }
      return assignment;
    });

  return {
    level_count: levelCount,
    levels,
    assignments,
    stackingPlan,
  };
}

export function explainLevelAssignment(distribution = {}) {
  const assignments = Array.isArray(distribution.assignments)
    ? distribution.assignments
    : [];

  return assignments.map((room) => ({
    room_id: room.id,
    level_number: room.assigned_level,
    reasons: room.assignment_reasoning || [],
  }));
}

export default {
  buildVerticalStackingPlan,
  optimizeLevelDistribution,
  explainLevelAssignment,
};
