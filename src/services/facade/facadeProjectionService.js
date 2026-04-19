function orientationToSide(orientation = "south") {
  const normalized = String(orientation || "south").toLowerCase();
  return ["north", "south", "east", "west"].includes(normalized)
    ? normalized
    : "south";
}

function getBounds(geometry = {}) {
  return (
    geometry.site?.buildable_bbox ||
    geometry.site?.boundary_bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 12,
      max_y: 10,
      width: 12,
      height: 10,
    }
  );
}

function getLevelProfiles(geometry = {}) {
  let offset = 0;
  return (geometry.levels || [])
    .slice()
    .sort(
      (left, right) =>
        Number(left.level_number || 0) - Number(right.level_number || 0),
    )
    .map((level) => {
      const height = Number(level.height_m || 3.2);
      const profile = {
        ...level,
        bottom_m: offset,
        top_m: offset + height,
      };
      offset += height;
      return profile;
    });
}

function projectAlongOrientation(
  point = {},
  bounds = {},
  orientation = "south",
) {
  const side = orientationToSide(orientation);
  const coordinate =
    side === "east" || side === "west"
      ? (point.y ?? point.min_y ?? 0)
      : (point.x ?? point.min_x ?? 0);
  const base =
    side === "east" || side === "west"
      ? Number(bounds.min_y || 0)
      : Number(bounds.min_x || 0);
  return Number(coordinate || 0) - base;
}

function resolveWallLength(wall = {}) {
  if (Number.isFinite(Number(wall.length_m))) {
    return Number(wall.length_m);
  }

  const startX = Number(wall.start?.x || 0);
  const startY = Number(wall.start?.y || 0);
  const endX = Number(wall.end?.x || 0);
  const endY = Number(wall.end?.y || 0);
  return Math.hypot(endX - startX, endY - startY);
}

function resolveSideWidth(bounds = {}, orientation = "south") {
  const side = orientationToSide(orientation);
  return side === "east" || side === "west"
    ? Number(bounds.height || 10)
    : Number(bounds.width || 12);
}

function resolveLevelForOpening(opening = {}, wall = {}, levelProfiles = []) {
  return (
    levelProfiles.find(
      (level) =>
        level.id === opening.level_id ||
        level.id === opening.levelId ||
        level.id === wall.level_id ||
        level.id === wall.levelId,
    ) ||
    levelProfiles[0] ||
    null
  );
}

function projectOpening(
  opening = {},
  wall = {},
  bounds = {},
  orientation = "south",
  levelProfiles = [],
  kind = "window",
) {
  const level = resolveLevelForOpening(opening, wall, levelProfiles);
  if (!level) {
    return null;
  }

  return {
    id: opening.id || `${kind}:${wall.id || "wall"}`,
    kind,
    levelId: level.id,
    center_m: projectAlongOrientation(
      opening.position_m || opening.position || wall.start || {},
      bounds,
      orientation,
    ),
    width_m: Math.max(
      kind === "door" ? 0.95 : 0.8,
      Number(opening.width_m || opening.width || (kind === "door" ? 1.1 : 1.4)),
    ),
    sill_height_m: Number(opening.sill_height_m || opening.sillHeightM || 0.9),
    head_height_m: Number(opening.head_height_m || opening.headHeightM || 2.1),
    wallId: wall.id || null,
  };
}

export function projectFacadeGeometry(geometry = {}, orientation = "south") {
  const side = orientationToSide(orientation);
  const bounds = getBounds(geometry);
  const levelProfiles = getLevelProfiles(geometry);
  const sideWalls = (geometry.walls || []).filter(
    (wall) =>
      wall.exterior && String(wall.metadata?.side || "").toLowerCase() === side,
  );
  const sideWidthM = resolveSideWidth(bounds, side);
  const totalExplicitLength = sideWalls.reduce(
    (sum, wall) => sum + resolveWallLength(wall),
    0,
  );
  const explicitCoverageRatio =
    sideWidthM > 0
      ? Math.max(0, Math.min(1, totalExplicitLength / sideWidthM))
      : 0;

  const wallById = new Map(
    (geometry.walls || []).map((wall) => [wall.id, wall]),
  );
  const projectedWindows = (geometry.windows || [])
    .map((windowElement) => {
      const wall = wallById.get(windowElement.wall_id);
      if (!wall || String(wall.metadata?.side || "").toLowerCase() !== side) {
        return null;
      }
      return projectOpening(
        windowElement,
        wall,
        bounds,
        side,
        levelProfiles,
        "window",
      );
    })
    .filter(Boolean);
  const projectedDoors = (geometry.doors || [])
    .map((door) => {
      const wall = wallById.get(door.wall_id);
      if (!wall || String(wall.metadata?.side || "").toLowerCase() !== side) {
        return null;
      }
      return projectOpening(door, wall, bounds, side, levelProfiles, "door");
    })
    .filter(Boolean);

  return {
    version: "phase9-facade-projection-v1",
    side,
    bounds,
    sideWidthM,
    levelProfiles,
    sideWalls,
    explicitCoverageRatio: Number(explicitCoverageRatio.toFixed(3)),
    projectedWindows,
    projectedDoors,
    openingCount: projectedWindows.length + projectedDoors.length,
    geometrySource:
      sideWalls.length > 0 ? "explicit_side_walls" : "envelope_derived",
  };
}

export {
  getBounds as getFacadeBounds,
  getLevelProfiles as getFacadeLevelProfiles,
  orientationToSide,
  projectAlongOrientation,
  resolveSideWidth,
};

export default {
  projectFacadeGeometry,
  getFacadeBounds: getBounds,
  getFacadeLevelProfiles: getLevelProfiles,
  orientationToSide,
  projectAlongOrientation,
  resolveSideWidth,
};
