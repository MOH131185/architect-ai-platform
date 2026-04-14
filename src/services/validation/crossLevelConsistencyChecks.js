import { validateVerticalCirculation } from "../floorplan/verticalCirculationValidator.js";

function isWet(room = {}) {
  return room.wet_zone === true;
}

function center(room = {}) {
  return {
    x: Number(room.centroid?.x || 0),
    y: Number(room.centroid?.y || 0),
  };
}

function distance(a = {}, b = {}) {
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function runCrossLevelConsistencyChecks(projectGeometry = {}) {
  const verticalCirculation = validateVerticalCirculation(projectGeometry);
  const warnings = [...verticalCirculation.warnings];
  const errors = [...verticalCirculation.errors];
  const repairHints = [...(verticalCirculation.repairSuggestions || [])];
  const affectedEntities = [...(verticalCirculation.affectedEntities || [])];
  const levels = [...(projectGeometry.levels || [])].sort(
    (left, right) =>
      Number(left.level_number || 0) - Number(right.level_number || 0),
  );

  levels.slice(1).forEach((level) => {
    const wetRooms = (projectGeometry.rooms || []).filter(
      (room) => room.level_id === level.id && isWet(room),
    );
    const belowLevel = levels.find(
      (entry) => entry.level_number === level.level_number - 1,
    );
    const belowWetRooms = (projectGeometry.rooms || []).filter(
      (room) => room.level_id === belowLevel?.id && isWet(room),
    );

    wetRooms.forEach((room) => {
      const nearest = belowWetRooms
        .map((candidate) => ({
          room: candidate,
          distance: distance(center(room), center(candidate)),
        }))
        .sort((left, right) => left.distance - right.distance)[0];

      if (!nearest) {
        warnings.push(
          `wet room "${room.id}" has no wet-zone stack anchor on the level below.`,
        );
        repairHints.push(
          `Add or align a wet-zone room below "${room.id}" to improve vertical service stacking.`,
        );
        affectedEntities.push(room.id);
        return;
      }

      if (nearest && nearest.distance > 4) {
        warnings.push(
          `wet room "${room.id}" is not vertically aligned with the wet stack below.`,
        );
        affectedEntities.push(room.id, nearest.room.id);
      }
    });
  });

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairHints: [...new Set(repairHints)],
    affectedEntities: [...new Set(affectedEntities.filter(Boolean))],
    checks: {
      verticalCirculation: verticalCirculation.checks,
    },
  };
}

export default {
  runCrossLevelConsistencyChecks,
};
