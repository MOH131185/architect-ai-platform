import { getEnvelopeDrawingBoundsWithSource } from "../drawing/drawingBounds.js";

function tokenizeOrientation(orientation = "south") {
  return String(orientation || "south")
    .trim()
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

export function normalizeFacadeOrientation(orientation = "south") {
  return orientationToSide(orientation);
}

function resolveEntitySide(entity = {}) {
  return orientationToSide(
    entity?.metadata?.side ||
      entity?.metadata?.orientation ||
      entity?.side ||
      entity?.orientation ||
      "south",
  );
}

function orientationToSide(orientation = "south") {
  const tokens = tokenizeOrientation(orientation);
  const tokenSet = new Set(tokens);
  const aliasMap = {
    n: "north",
    s: "south",
    e: "east",
    w: "west",
  };

  for (const [alias, side] of Object.entries(aliasMap)) {
    if (tokenSet.has(alias)) {
      return side;
    }
  }

  for (const side of ["north", "south", "east", "west"]) {
    if (tokenSet.has(side)) {
      return side;
    }
  }

  return "south";
}

function getBounds(geometry = {}) {
  const envelope = getEnvelopeDrawingBoundsWithSource(geometry);
  return (
    envelope?.bounds ||
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

function buildWallZoneSeeds(
  sideWalls = [],
  bounds = {},
  orientation = "south",
) {
  const side = orientationToSide(orientation);
  return (sideWalls || []).map((wall, index) => ({
    id: wall.id || `wall-zone-seed:${side}:${index}`,
    wallId: wall.id || null,
    side,
    levelId: wall.level_id || wall.levelId || null,
    startM: projectAlongOrientation(wall.start || {}, bounds, side),
    endM: projectAlongOrientation(wall.end || {}, bounds, side),
  }));
}

function buildRoofEdgeSeed(geometry = {}, side = "south") {
  const roofLanguage = String(geometry?.roof?.type || "").toLowerCase();
  return {
    id: `roof-edge-seed:${side}`,
    side,
    kind: roofLanguage.includes("flat")
      ? "parapet-transition"
      : roofLanguage.includes("gable") || roofLanguage.includes("pitch")
        ? "ridge-eave-transition"
        : "roof-edge",
    roofLanguage: roofLanguage || "unknown",
  };
}

function roofPrimitiveFamiliesForFacadeSeeds() {
  return [
    "roof_edge",
    "eave",
    "ridge",
    "parapet",
    "roof_break",
    "dormer_attachment",
    "hip",
    "valley",
  ];
}

function matchesRoofPrimitiveSide(entry = {}, side = "south") {
  const entrySide = orientationToSide(
    entry.side ||
      entry.orientation ||
      entry.metadata?.side ||
      entry.metadata?.orientation ||
      "",
  );
  return entrySide === side;
}

function buildRoofEdgeSeeds(geometry = {}, side = "south") {
  const explicitSeeds = (geometry.roof_primitives || [])
    .filter((entry) =>
      roofPrimitiveFamiliesForFacadeSeeds().includes(
        String(entry.primitive_family || ""),
      ),
    )
    .filter((entry) => {
      if (
        !entry.side &&
        ["ridge", "hip", "valley"].includes(
          String(entry.primitive_family || ""),
        )
      ) {
        return true;
      }
      return matchesRoofPrimitiveSide(entry, side);
    })
    .map((entry, index) => ({
      id: entry.id || `roof-edge-seed:${side}:${index}`,
      side,
      kind: String(entry.primitive_family || entry.type || "roof-edge"),
      roofLanguage: String(
        entry.roof_language || geometry?.roof?.type || "unknown",
      ),
      supportMode: entry.support_mode || "explicit_generated",
      primitiveFamily: entry.primitive_family || null,
      start: entry.start || null,
      end: entry.end || null,
      bbox: entry.bbox || null,
    }));

  return explicitSeeds.length
    ? explicitSeeds
    : [buildRoofEdgeSeed(geometry, side)];
}

export function projectFacadeGeometry(geometry = {}, orientation = "south") {
  const side = orientationToSide(orientation);
  const bounds = getBounds(geometry);
  const levelProfiles = getLevelProfiles(geometry);
  const sideWalls = (geometry.walls || []).filter(
    (wall) => wall.exterior && resolveEntitySide(wall) === side,
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
      if (!wall || resolveEntitySide(wall) !== side) {
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
      if (!wall || resolveEntitySide(wall) !== side) {
        return null;
      }
      return projectOpening(door, wall, bounds, side, levelProfiles, "door");
    })
    .filter(Boolean);
  const projectedOpenings = [...projectedWindows, ...projectedDoors].sort(
    (left, right) => Number(left.center_m || 0) - Number(right.center_m || 0),
  );
  const roofEdgeSeeds = buildRoofEdgeSeeds(geometry, side);
  const roofSeedFamilies = roofEdgeSeeds.map(
    (entry) => entry.primitiveFamily || entry.kind || "roof-edge",
  );
  const roofHipCount = roofSeedFamilies.filter(
    (family) => family === "hip",
  ).length;
  const roofValleyCount = roofSeedFamilies.filter(
    (family) => family === "valley",
  ).length;

  return {
    version:
      roofHipCount > 0 || roofValleyCount > 0
        ? "phase17-facade-projection-v1"
        : (geometry.roof_primitives || []).length
          ? "phase16-facade-projection-v1"
          : "phase10-facade-projection-v1",
    side,
    bounds,
    sideWidthM,
    explicitWallCount: sideWalls.length,
    levelProfiles,
    sideWalls,
    explicitCoverageRatio: Number(explicitCoverageRatio.toFixed(3)),
    openingCoverageRatio: Number(
      (
        [...projectedWindows, ...projectedDoors].reduce(
          (sum, opening) => sum + Number(opening.width_m || 0),
          0,
        ) / Math.max(sideWidthM || 1, 1)
      ).toFixed(3),
    ),
    levelSpanM: Number(
      levelProfiles
        .reduce((sum, level) => sum + Number(level.height_m || 3.2), 0)
        .toFixed(3),
    ),
    projectedWindows,
    projectedDoors,
    projectedOpenings,
    openingCount: projectedWindows.length + projectedDoors.length,
    wallZoneSeeds: buildWallZoneSeeds(sideWalls, bounds, side),
    roofEdgeSeed: buildRoofEdgeSeed(geometry, side),
    roofEdgeSeeds,
    roofPrimitiveCount: Number((geometry.roof_primitives || []).length || 0),
    roofHipCount,
    roofValleyCount,
    roofSupportMode:
      geometry?.metadata?.canonical_construction_truth?.roof?.support_mode ||
      (geometry?.roof_primitives?.length
        ? "explicit_generated"
        : "derived_profile_only"),
    geometrySource:
      sideWalls.length > 0 ? "explicit_side_walls" : "envelope_derived",
  };
}

export {
  getBounds as getFacadeBounds,
  getLevelProfiles as getFacadeLevelProfiles,
  orientationToSide,
  projectAlongOrientation,
  resolveEntitySide,
  resolveSideWidth,
};

export default {
  projectFacadeGeometry,
  getFacadeBounds: getBounds,
  getFacadeLevelProfiles: getLevelProfiles,
  normalizeFacadeOrientation,
  orientationToSide,
  projectAlongOrientation,
  resolveEntitySide,
  resolveSideWidth,
};
