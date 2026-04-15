import { assignRoomZones } from "./zoningEngine.js";
import {
  buildVerticalStackingPlan as buildVerticalStackingPlanBase,
  explainLevelAssignment as explainLevelAssignmentBase,
  optimizeLevelDistribution as optimizeLevelDistributionBase,
} from "./verticalStackingService.js";

function normalizeRooms(program = []) {
  if (Array.isArray(program)) return program;
  if (Array.isArray(program.rooms)) return program.rooms;
  return [];
}

export function assignRoomsToLevels(program = [], constraints = {}) {
  const zonedRooms = assignRoomZones(normalizeRooms(program));
  const optimized = optimizeLevelDistributionBase(
    constraints.levelCount ||
      constraints.level_count ||
      constraints.levels ||
      1,
    zonedRooms,
    constraints,
  );

  return {
    level_count: optimized.level_count,
    levels: optimized.levels,
    stackingPlan: optimized.stackingPlan,
    explanations: explainLevelAssignmentBase(optimized),
  };
}

export function buildVerticalStackingPlan(levels, rooms) {
  return buildVerticalStackingPlanBase(levels, rooms);
}

export function optimizeLevelDistribution(levels, rooms, constraints = {}) {
  return optimizeLevelDistributionBase(levels, rooms, constraints);
}

export function explainLevelAssignment(distribution = {}) {
  return explainLevelAssignmentBase(distribution);
}

export default {
  assignRoomsToLevels,
  buildVerticalStackingPlan,
  optimizeLevelDistribution,
  explainLevelAssignment,
};
