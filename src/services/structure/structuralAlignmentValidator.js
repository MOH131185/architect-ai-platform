function roomCenter(room = {}) {
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

function sideAxisPosition(wall = {}) {
  if ((wall.metadata?.side || wall.side) === "west")
    return Number(wall.start?.x || 0);
  if ((wall.metadata?.side || wall.side) === "east")
    return Number(wall.start?.x || 0);
  if ((wall.metadata?.side || wall.side) === "north")
    return Number(wall.start?.y || 0);
  if ((wall.metadata?.side || wall.side) === "south")
    return Number(wall.start?.y || 0);
  return 0;
}

export function validateStructuralAlignment(
  projectGeometry = {},
  structuralGrid = null,
) {
  const warnings = [];
  const errors = [];
  const repairHints = [];
  const affectedEntities = [];
  const levels = projectGeometry.levels || [];

  levels.slice(1).forEach((level) => {
    const currentRooms = (projectGeometry.rooms || []).filter(
      (room) => room.level_id === level.id,
    );
    const belowLevel = levels.find(
      (entry) => entry.level_number === level.level_number - 1,
    );
    const belowRooms = (projectGeometry.rooms || []).filter(
      (room) => room.level_id === belowLevel?.id,
    );

    currentRooms.forEach((room) => {
      const nearestBelow = belowRooms
        .map((candidate) => ({
          room: candidate,
          distance: distance(roomCenter(room), roomCenter(candidate)),
        }))
        .sort((left, right) => left.distance - right.distance)[0];

      if (nearestBelow && nearestBelow.distance > 4.2) {
        warnings.push(
          `room "${room.id}" is weakly supported by the level below (offset ${nearestBelow.distance.toFixed(2)}m).`,
        );
        affectedEntities.push(room.id, nearestBelow.room.id);
      }
    });
  });

  levels.slice(1).forEach((level) => {
    const belowLevel = levels.find(
      (entry) => entry.level_number === level.level_number - 1,
    );
    const currentExteriorWalls = (projectGeometry.walls || []).filter(
      (wall) => wall.level_id === level.id && wall.exterior,
    );
    const belowExteriorWalls = (projectGeometry.walls || []).filter(
      (wall) => wall.level_id === belowLevel?.id && wall.exterior,
    );

    ["north", "south", "east", "west"].forEach((side) => {
      const currentSideWalls = currentExteriorWalls.filter(
        (wall) => (wall.metadata?.side || wall.side) === side,
      );
      const belowSideWalls = belowExteriorWalls.filter(
        (wall) => (wall.metadata?.side || wall.side) === side,
      );

      if (currentSideWalls.length && !belowSideWalls.length) {
        warnings.push(
          `level "${level.id}" has unsupported upper-level massing on the ${side} facade.`,
        );
        affectedEntities.push(...currentSideWalls.map((wall) => wall.id));
        return;
      }

      if (!currentSideWalls.length || !belowSideWalls.length) {
        return;
      }

      const currentPosition =
        currentSideWalls.reduce(
          (sum, wall) => sum + sideAxisPosition(wall),
          0,
        ) / currentSideWalls.length;
      const belowPosition =
        belowSideWalls.reduce((sum, wall) => sum + sideAxisPosition(wall), 0) /
        belowSideWalls.length;
      const offset = Math.abs(currentPosition - belowPosition);
      if (offset > 1.2) {
        warnings.push(
          `exterior wall stack on "${level.id}" is offset ${offset.toFixed(2)}m from the level below on the ${side} side.`,
        );
        repairHints.push(
          `Realign the ${side} exterior wall stack between "${belowLevel?.id}" and "${level.id}".`,
        );
        affectedEntities.push(
          ...currentSideWalls.map((wall) => wall.id),
          ...belowSideWalls.map((wall) => wall.id),
        );
      }
    });
  });

  const spans = structuralGrid?.spans || [];
  spans.forEach((span) => {
    if (span.span_m > 7.5) {
      warnings.push(
        `structural span ${span.from}-${span.to} is wide at ${span.span_m.toFixed(2)}m.`,
      );
      repairHints.push(
        `Reduce span ${span.from}-${span.to} or add intermediate support.`,
      );
    }
  });

  if ((projectGeometry.columns || []).length && structuralGrid) {
    (projectGeometry.columns || []).forEach((column) => {
      const xDistance = Math.min(
        ...(structuralGrid.x_axes || []).map((axis) =>
          Math.abs(
            Number(axis.position_m || 0) - Number(column.centroid?.x || 0),
          ),
        ),
      );
      const yDistance = Math.min(
        ...(structuralGrid.y_axes || []).map((axis) =>
          Math.abs(
            Number(axis.position_m || 0) - Number(column.centroid?.y || 0),
          ),
        ),
      );
      if (xDistance > 0.75 && yDistance > 0.75) {
        warnings.push(
          `column "${column.id}" is weakly aligned to the structural grid.`,
        );
        affectedEntities.push(column.id);
      }
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairHints: [...new Set(repairHints)],
    affectedEntities: [...new Set(affectedEntities.filter(Boolean))],
  };
}

export default {
  validateStructuralAlignment,
};
