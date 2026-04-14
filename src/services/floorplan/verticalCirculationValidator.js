function bboxCenter(bbox = {}) {
  return {
    x: Number((Number(bbox.min_x || 0) + Number(bbox.max_x || 0)) / 2),
    y: Number((Number(bbox.min_y || 0) + Number(bbox.max_y || 0)) / 2),
  };
}

function distance(a = {}, b = {}) {
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function validateVerticalCirculation(projectGeometry = {}) {
  const warnings = [];
  const errors = [];
  const repairSuggestions = [];
  const affectedEntities = [];
  const levels = [...(projectGeometry.levels || [])].sort(
    (left, right) =>
      Number(left.level_number || 0) - Number(right.level_number || 0),
  );

  if (levels.length <= 1) {
    return {
      valid: true,
      warnings,
      errors,
      repairSuggestions,
      affectedEntities,
      checks: {
        continuityPairs: [],
      },
    };
  }

  const stairsByLevel = new Map(
    levels.map((level) => [
      level.id,
      (projectGeometry.stairs || []).filter(
        (stair) => stair.level_id === level.id,
      ),
    ]),
  );
  const coreRoomsByLevel = new Map(
    levels.map((level) => [
      level.id,
      (projectGeometry.rooms || []).filter(
        (room) => room.level_id === level.id && room.type === "stair_core",
      ),
    ]),
  );
  const doorsByLevel = new Map(
    levels.map((level) => [
      level.id,
      (projectGeometry.doors || []).filter(
        (door) => door.level_id === level.id,
      ),
    ]),
  );
  const circulationByLevel = new Map(
    levels.map((level) => [
      level.id,
      (projectGeometry.circulation || []).filter(
        (path) => path.level_id === level.id,
      ),
    ]),
  );
  const continuityPairs = [];

  levels.forEach((level, index) => {
    const stairs = stairsByLevel.get(level.id) || [];
    const coreRooms = coreRoomsByLevel.get(level.id) || [];
    if (!stairs.length) {
      errors.push(`level "${level.id}" is missing a stair/core element.`);
      affectedEntities.push(level.id);
      repairSuggestions.push(
        `Add a stair/core footprint to level "${level.id}".`,
      );
      return;
    }
    if (!coreRooms.length) {
      errors.push(
        `level "${level.id}" is missing a stair_core room aligned to the stair footprint.`,
      );
      affectedEntities.push(level.id);
      repairSuggestions.push(
        `Add a stair_core room container to level "${level.id}".`,
      );
    }
    if (stairs.length > 1) {
      warnings.push(
        `level "${level.id}" has multiple stair elements; only the primary run is validated for continuity.`,
      );
    }

    const circulation = circulationByLevel.get(level.id) || [];
    if (!circulation.length) {
      warnings.push(
        `level "${level.id}" has no circulation path connected to the stair core.`,
      );
    }

    const coreRoomIds = new Set(coreRooms.map((room) => room.id));
    const connectedDoors = (doorsByLevel.get(level.id) || []).filter(
      (door) =>
        Array.isArray(door.room_ids) &&
        door.room_ids.some((roomId) => coreRoomIds.has(roomId)),
    );
    if (!connectedDoors.length && coreRoomIds.size) {
      errors.push(
        `level "${level.id}" has no door linking the stair core to occupied rooms.`,
      );
      affectedEntities.push(...coreRoomIds);
      repairSuggestions.push(
        `Connect the stair core on "${level.id}" to a major room with a valid shared wall door.`,
      );
    }

    if (index === levels.length - 1) {
      return;
    }

    const currentStair = stairs[0];
    const nextLevel = levels[index + 1];
    const nextStair = (stairsByLevel.get(nextLevel.id) || [])[0];
    if (!nextStair) {
      errors.push(
        `level "${nextLevel.id}" is missing a continuous stair core.`,
      );
      affectedEntities.push(nextLevel.id);
      return;
    }

    const currentCenter = bboxCenter(currentStair.bbox);
    const nextCenter = bboxCenter(nextStair.bbox);
    const offset = distance(currentCenter, nextCenter);
    continuityPairs.push({
      from_level: level.id,
      to_level: nextLevel.id,
      offset_m: Number(offset.toFixed(3)),
    });

    if (offset > 0.75) {
      errors.push(
        `stairs on "${level.id}" and "${nextLevel.id}" are misaligned by ${offset.toFixed(2)}m.`,
      );
      affectedEntities.push(currentStair.id, nextStair.id);
      repairSuggestions.push(
        `Align stair/core footprints between "${level.id}" and "${nextLevel.id}".`,
      );
    }

    if (
      currentStair.connects_to_level !== null &&
      currentStair.connects_to_level !== nextLevel.level_number
    ) {
      warnings.push(
        `stair "${currentStair.id}" does not point to the next sequential level.`,
      );
    }
  });

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairSuggestions: [...new Set(repairSuggestions)],
    affectedEntities: [...new Set(affectedEntities.filter(Boolean))],
    checks: {
      continuityPairs,
    },
  };
}

export default {
  validateVerticalCirculation,
};
