import {
  CANONICAL_PROJECT_GEOMETRY_VERSION,
  CANONICAL_GEOMETRY_ENTITY_COLLECTIONS,
  DEFAULT_INTERIOR_WALL_THICKNESS_M,
  DEFAULT_LEVEL_HEIGHT_M,
  DEFAULT_WALL_THICKNESS_M,
  buildBoundingBoxFromPolygon,
  buildBoundingBoxFromRect,
  computeCentroid,
  computePolygonArea,
  createProjectGeometrySkeleton,
  createStableId,
  rectangleToPolygon,
  roundMetric,
} from "./projectGeometrySchema.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { deriveGroundRelationSemantics } from "../site/buildableEnvelopeService.js";

function cloneGeometryData(value) {
  return JSON.parse(JSON.stringify(value));
}

function entityFamilyPrefix(family = "") {
  const normalized = String(family || "")
    .trim()
    .toLowerCase();
  const overrides = {
    roof: "roof",
    circulation: "circulation",
    stairs: "stair",
    columns: "column",
    beams: "beam",
    slabs: "slab",
    elevations: "elevation",
    sections: "section",
    annotations: "annotation",
  };

  return overrides[normalized] || normalized.replace(/s$/, "") || "entity";
}

function createGenericGeometryEntity(
  projectId,
  levelId,
  family,
  entity = {},
  index = 0,
) {
  return {
    ...cloneGeometryData(entity),
    id:
      entity.id ||
      createStableId(entityFamilyPrefix(family), projectId, levelId, index),
    level_id: entity.level_id || levelId || null,
    provenance: {
      ...(entity.provenance || {}),
      source:
        entity.provenance?.source || entity.source || "canonical-coercion",
    },
  };
}

export function createLevelGeometry(projectId, levelInput = {}, index = 0) {
  const levelNumber = Number.isFinite(Number(levelInput.level_number))
    ? Number(levelInput.level_number)
    : index;
  const name =
    levelInput.name ||
    (levelNumber === 0 ? "Ground Floor" : `Level ${levelNumber}`);
  const id =
    levelInput.id || createStableId("level", projectId, levelNumber, name);

  return {
    id,
    name,
    level_number: levelNumber,
    elevation_m: roundMetric(
      levelInput.elevation_m ?? levelNumber * DEFAULT_LEVEL_HEIGHT_M,
    ),
    height_m: roundMetric(levelInput.height_m ?? DEFAULT_LEVEL_HEIGHT_M),
    room_ids: [],
    wall_ids: [],
    door_ids: [],
    window_ids: [],
    stair_ids: [],
    circulation_ids: [],
    column_ids: [],
    beam_ids: [],
    slab_ids: [],
    footprint_id: null,
  };
}

export function createRoomGeometry(projectId, levelId, room = {}, index = 0) {
  const bbox =
    room.bbox ||
    buildBoundingBoxFromRect(room.x, room.y, room.width, room.height);
  const polygon =
    room.polygon ||
    rectangleToPolygon(bbox.min_x, bbox.min_y, bbox.width, bbox.height);
  const area = roundMetric(
    room.actual_area ?? room.actual_area_m2 ?? computePolygonArea(polygon),
  );
  const roomId =
    room.id || createStableId("room", projectId, levelId, room.name, index);

  return {
    id: roomId,
    level_id: levelId,
    name: room.name || `Room ${index + 1}`,
    type: room.type || room.program_type || "room",
    zone: room.zone || "public",
    target_area: roundMetric(room.target_area ?? room.target_area_m2 ?? area),
    actual_area: area,
    min_area: roundMetric(room.min_area ?? room.min_area_m2 ?? area * 0.8),
    max_area: roundMetric(room.max_area ?? room.max_area_m2 ?? area * 1.2),
    privacy_level: room.privacy_level ?? 0,
    requires_daylight: room.requires_daylight !== false,
    wet_zone: room.wet_zone === true,
    access_requirements: Array.isArray(room.access_requirements)
      ? room.access_requirements
      : [],
    adjacency_preferences: Array.isArray(room.adjacency_preferences)
      ? room.adjacency_preferences
      : [],
    bbox,
    polygon,
    centroid: room.centroid || computeCentroid(polygon),
    metadata: {
      layout_order: room.layout_order ?? index,
      level_number: room.level_number ?? null,
    },
    provenance: {
      source: room.source || "layout-solver",
    },
  };
}

export function createWallGeometry(projectId, levelId, wall = {}, index = 0) {
  const roomIds = Array.isArray(wall.room_ids)
    ? [...new Set(wall.room_ids)]
    : [];
  return {
    id:
      wall.id ||
      createStableId(
        "wall",
        projectId,
        levelId,
        wall.start?.x,
        wall.start?.y,
        wall.end?.x,
        wall.end?.y,
        index,
      ),
    level_id: levelId,
    kind: wall.kind || (wall.exterior ? "exterior" : "interior"),
    room_ids: roomIds,
    start: wall.start,
    end: wall.end,
    orientation: wall.orientation || "horizontal",
    length_m: roundMetric(wall.length_m),
    thickness_m: roundMetric(
      wall.thickness_m ||
        (wall.exterior
          ? DEFAULT_WALL_THICKNESS_M
          : DEFAULT_INTERIOR_WALL_THICKNESS_M),
    ),
    exterior: wall.exterior === true,
    bbox: wall.bbox || buildBoundingBoxFromPolygon([wall.start, wall.end]),
    metadata: {
      side: wall.side || null,
    },
    provenance: {
      source: wall.source || "wall-graph-builder",
    },
  };
}

export function createOpeningGeometry(
  projectId,
  levelId,
  openingType,
  opening = {},
  index = 0,
) {
  const width = roundMetric(
    opening.width_m ?? (openingType === "door" ? 0.9 : 1.5),
  );
  const position = opening.position_m || opening.position || { x: 0, y: 0 };
  return {
    id:
      opening.id ||
      createStableId(
        openingType,
        projectId,
        levelId,
        opening.wall_id,
        position.x,
        position.y,
        index,
      ),
    level_id: levelId,
    wall_id: opening.wall_id,
    room_ids: Array.isArray(opening.room_ids)
      ? [...new Set(opening.room_ids)]
      : [],
    opening_type: openingType,
    kind: opening.kind || openingType,
    width_m: width,
    sill_height_m: roundMetric(
      opening.sill_height_m ?? (openingType === "window" ? 0.9 : 0),
    ),
    head_height_m: roundMetric(opening.head_height_m ?? 2.1),
    position_m: {
      x: roundMetric(position.x),
      y: roundMetric(position.y),
    },
    bbox:
      opening.bbox ||
      buildBoundingBoxFromRect(
        roundMetric(position.x - width / 2),
        roundMetric(position.y - 0.05),
        width,
        openingType === "door" ? 0.1 : 0.08,
      ),
    metadata: {
      swing: opening.swing || null,
      exterior: opening.exterior === true,
    },
    provenance: {
      source: opening.source || "opening-placement-service",
    },
  };
}

export function createStairGeometry(projectId, levelId, stair = {}, index = 0) {
  const bbox =
    stair.bbox ||
    buildBoundingBoxFromRect(
      stair.x ?? stair.position?.x ?? 0,
      stair.y ?? stair.position?.y ?? 0,
      stair.width ?? stair.width_m ?? 2.4,
      stair.height ?? stair.depth_m ?? 4.2,
    );
  const polygon =
    stair.polygon ||
    rectangleToPolygon(bbox.min_x, bbox.min_y, bbox.width, bbox.height);

  return {
    id:
      stair.id ||
      createStableId("stair", projectId, levelId, stair.type, index),
    level_id: levelId,
    type: stair.type || "straight_run",
    width_m: roundMetric(stair.width_m ?? bbox.width),
    depth_m: roundMetric(stair.depth_m ?? bbox.height),
    bbox,
    polygon,
    connects_to_level: stair.connects_to_level ?? null,
    provenance: {
      source: stair.source || "geometry-factory",
    },
  };
}

export function createCirculationGeometry(
  projectId,
  levelId,
  path = {},
  index = 0,
) {
  const polyline = Array.isArray(path.polyline) ? path.polyline : [];
  return {
    id:
      path.id ||
      createStableId("circulation", projectId, levelId, path.path_type, index),
    level_id: levelId,
    path_type: path.path_type || "connector",
    from_room_id: path.from_room_id || null,
    to_room_id: path.to_room_id || null,
    polyline,
    width_m: roundMetric(path.width_m ?? 1.2),
    bbox: buildBoundingBoxFromPolygon(polyline),
    provenance: {
      source: path.source || "circulation-generator",
    },
  };
}

export function createFootprintGeometry(
  projectId,
  levelId,
  polygon = [],
  index = 0,
) {
  const normalizedPolygon = Array.isArray(polygon) ? polygon : [];
  return {
    id: createStableId("footprint", projectId, levelId, index),
    level_id: levelId,
    polygon: normalizedPolygon,
    bbox: buildBoundingBoxFromPolygon(normalizedPolygon),
    area: computePolygonArea(normalizedPolygon),
    provenance: {
      source: "layout-solver",
    },
  };
}

export function createSlabGeometry(
  projectId,
  levelId,
  footprint = {},
  index = 0,
) {
  return {
    id: createStableId("slab", projectId, levelId, footprint.id, index),
    level_id: levelId,
    thickness_m: 0.22,
    footprint_id: footprint.id || null,
    polygon: footprint.polygon || [],
    bbox:
      footprint.bbox || buildBoundingBoxFromPolygon(footprint.polygon || []),
    provenance: {
      source: "geometry-factory",
    },
  };
}

export function createRoofGeometry(projectId, topFootprint = {}, style = {}) {
  return {
    id: createStableId("roof", projectId, topFootprint.id || "top"),
    type: String(style.roof_language || "").includes("flat")
      ? "flat"
      : "pitched",
    footprint_id: topFootprint.id || null,
    polygon: topFootprint.polygon || [],
    bbox:
      topFootprint.bbox ||
      buildBoundingBoxFromPolygon(topFootprint.polygon || []),
    provenance: {
      source: "geometry-factory",
    },
  };
}

function normalizeRoofLanguage(roof = {}, style = {}) {
  return String(
    roof.roof_language || roof.type || style.roof_language || "pitched gable",
  )
    .trim()
    .toLowerCase();
}

function totalBuildingHeight(levels = []) {
  return roundMetric(
    (levels || []).reduce(
      (sum, level) => sum + Number(level.height_m || DEFAULT_LEVEL_HEIGHT_M),
      0,
    ),
  );
}

function inferRoofRiseM(roof = {}, style = {}) {
  const explicit =
    roof.ridge_rise_m ||
    roof.roof_rise_m ||
    style.ridge_rise_m ||
    style.roof_rise_m;
  if (Number.isFinite(Number(explicit))) {
    return roundMetric(explicit);
  }
  const language = normalizeRoofLanguage(roof, style);
  if (language.includes("flat")) return 0.28;
  if (language.includes("mono")) return 1.2;
  if (language.includes("hip")) return 1.45;
  return 1.65;
}

function normalizePrimitiveFamily(type = "", fallback = "roof_plane") {
  const normalized = String(type || "")
    .trim()
    .toLowerCase();
  return normalized || fallback;
}

function createRoofPrimitiveGeometry(
  projectId,
  primitive = {},
  index = 0,
  { fallbackLevelId = null } = {},
) {
  const polygon = primitive.polygon || [];
  const segmentPoints =
    primitive.start && primitive.end ? [primitive.start, primitive.end] : [];
  return {
    ...cloneGeometryData(primitive),
    id:
      primitive.id ||
      createStableId(
        "roof-primitive",
        projectId,
        primitive.type || primitive.primitive_family || index,
      ),
    primitive_family: normalizePrimitiveFamily(
      primitive.primitive_family || primitive.type,
      "roof_plane",
    ),
    type: primitive.type || primitive.primitive_family || "roof_plane",
    level_id: primitive.level_id || fallbackLevelId,
    support_mode: resolveRoofPrimitiveSupportMode(primitive),
    polygon,
    bbox:
      primitive.bbox ||
      (polygon.length
        ? buildBoundingBoxFromPolygon(polygon)
        : segmentPoints.length
          ? buildBoundingBoxFromPolygon(segmentPoints)
          : null),
    ridge_height_m: roundMetric(
      primitive.ridge_height_m ?? primitive.ridgeHeightM ?? 0,
    ),
    eave_height_m: roundMetric(
      primitive.eave_height_m ?? primitive.eaveHeightM ?? 0,
    ),
    overhang_m: roundMetric(primitive.overhang_m ?? primitive.overhangM ?? 0),
    provenance: {
      ...(primitive.provenance || {}),
      source:
        primitive.provenance?.source ||
        primitive.source ||
        "canonical-roof-primitives",
    },
  };
}

function rectanglePolygonFromBounds(minX, minY, maxX, maxY) {
  return rectangleToPolygon(
    roundMetric(minX),
    roundMetric(minY),
    roundMetric(maxX - minX),
    roundMetric(maxY - minY),
  );
}

function getRoofBounds(projectGeometry = {}, roof = {}, polygon = []) {
  return (
    roof.bbox ||
    buildBoundingBoxFromPolygon(polygon || []) ||
    projectGeometry.footprints?.[projectGeometry.footprints.length - 1]?.bbox ||
    projectGeometry.footprints?.[0]?.bbox ||
    null
  );
}

function roofSupportEnabled() {
  return (
    isFeatureEnabled("useCanonicalRoofPrimitivesPhase15") ||
    isFeatureEnabled("useRicherCanonicalRoofGeometryPhase16")
  );
}

function foundationSupportEnabled() {
  return (
    isFeatureEnabled("useCanonicalFoundationPrimitivesPhase15") ||
    isFeatureEnabled("useRicherCanonicalFoundationGeometryPhase16")
  );
}

function resolveRoofPrimitiveSupportMode(primitive = {}) {
  const explicitMode = String(
    primitive.support_mode || primitive.supportMode || "",
  )
    .trim()
    .toLowerCase();
  if (explicitMode) {
    return explicitMode;
  }

  const family = String(
    primitive.primitive_family ||
      primitive.primitiveFamily ||
      primitive.type ||
      "",
  )
    .trim()
    .toLowerCase();
  if (
    [
      "roof_plane",
      "roof_edge",
      "eave",
      "ridge",
      "parapet",
      "roof_break",
      "dormer_attachment",
    ].includes(family)
  ) {
    return "explicit_generated";
  }
  if (
    family.includes("derived_roof_profile") ||
    family.includes("roof_profile")
  ) {
    return "derived_profile_only";
  }
  if (family.includes("roof_language")) {
    return "roof_language_only";
  }
  return roofSupportEnabled() ? "explicit_generated" : "derived_profile_only";
}

function resolveFoundationSupportMode(foundation = {}) {
  const explicitMode = String(
    foundation.support_mode || foundation.supportMode || "",
  )
    .trim()
    .toLowerCase();
  if (explicitMode) {
    return explicitMode;
  }
  return foundationSupportEnabled()
    ? "explicit_ground_primitives"
    : "contextual_ground_relation";
}

function resolveBaseConditionSupportMode(baseCondition = {}) {
  const explicitMode = String(
    baseCondition.support_mode || baseCondition.supportMode || "",
  )
    .trim()
    .toLowerCase();
  if (explicitMode) {
    return explicitMode;
  }
  const conditionType = String(
    baseCondition.condition_type || baseCondition.type || "",
  )
    .trim()
    .toLowerCase();
  if (
    [
      "ground_line",
      "plinth_line",
      "slab_ground_interface",
      "grade_break",
      "step_line",
    ].includes(conditionType)
  ) {
    return "explicit_ground_primitives";
  }
  return "contextual_ground_relation";
}

function buildRoofPlanePrimitives({
  projectGeometry = {},
  roof = {},
  style = {},
  polygon = [],
  bbox = null,
  roofLanguage = "",
  ridgeHeight = 0,
  eaveHeight = 0,
  fallbackLevelId = null,
} = {}) {
  if (!bbox) {
    return [];
  }
  const primitives = [];
  const overhangM = roof.overhang_m ?? style.roof_overhang_m ?? 0.45;
  const isFlat = roofLanguage.includes("flat");
  const isMono = roofLanguage.includes("mono");
  const isHip = roofLanguage.includes("hip");
  const isPitched = !isFlat;
  const splitAlongX = Number(bbox.width || 0) >= Number(bbox.height || 0);
  const midX = roundMetric(
    (Number(bbox.min_x || 0) + Number(bbox.max_x || 0)) / 2,
  );
  const midY = roundMetric(
    (Number(bbox.min_y || 0) + Number(bbox.max_y || 0)) / 2,
  );

  if (isFlat) {
    primitives.push(
      createRoofPrimitiveGeometry(
        projectGeometry.project_id,
        {
          primitive_family: "roof_plane",
          type: "flat_roof_plane",
          polygon: polygon.length
            ? polygon
            : rectanglePolygonFromBounds(
                bbox.min_x,
                bbox.min_y,
                bbox.max_x,
                bbox.max_y,
              ),
          bbox,
          roof_language: roofLanguage,
          ridge_height_m: eaveHeight + 0.18,
          eave_height_m: eaveHeight,
          overhang_m: overhangM,
          support_mode: "explicit_generated",
          provenance: {
            source: "geometry-factory",
            derivation: "phase16-flat-plane",
          },
        },
        0,
        { fallbackLevelId },
      ),
    );
    return primitives;
  }

  if (isMono) {
    primitives.push(
      createRoofPrimitiveGeometry(
        projectGeometry.project_id,
        {
          primitive_family: "roof_plane",
          type: "mono_pitch_roof_plane",
          polygon: polygon.length
            ? polygon
            : rectanglePolygonFromBounds(
                bbox.min_x,
                bbox.min_y,
                bbox.max_x,
                bbox.max_y,
              ),
          bbox,
          roof_language: roofLanguage,
          ridge_height_m: ridgeHeight,
          eave_height_m: eaveHeight,
          overhang_m: overhangM,
          support_mode: "explicit_generated",
          provenance: {
            source: "geometry-factory",
            derivation: "phase16-mono-plane",
          },
        },
        0,
        { fallbackLevelId },
      ),
    );
    return primitives;
  }

  const planePolygons = splitAlongX
    ? [
        rectanglePolygonFromBounds(bbox.min_x, bbox.min_y, bbox.max_x, midY),
        rectanglePolygonFromBounds(bbox.min_x, midY, bbox.max_x, bbox.max_y),
      ]
    : [
        rectanglePolygonFromBounds(bbox.min_x, bbox.min_y, midX, bbox.max_y),
        rectanglePolygonFromBounds(midX, bbox.min_y, bbox.max_x, bbox.max_y),
      ];

  planePolygons.forEach((planePolygon, index) => {
    primitives.push(
      createRoofPrimitiveGeometry(
        projectGeometry.project_id,
        {
          primitive_family: "roof_plane",
          type: isHip
            ? `hip_roof_plane_${index + 1}`
            : `pitched_roof_plane_${index + 1}`,
          polygon: planePolygon,
          bbox: buildBoundingBoxFromPolygon(planePolygon),
          roof_language: roofLanguage,
          ridge_height_m: ridgeHeight,
          eave_height_m: eaveHeight,
          overhang_m: overhangM,
          support_mode: "explicit_generated",
          provenance: {
            source: "geometry-factory",
            derivation: isHip ? "phase16-hip-split" : "phase16-gable-split",
          },
        },
        index,
        { fallbackLevelId },
      ),
    );
  });

  return primitives;
}

function buildRoofEdgeAndBreakPrimitives({
  projectGeometry = {},
  bbox = null,
  roofLanguage = "",
  ridgeHeight = 0,
  eaveHeight = 0,
  fallbackLevelId = null,
} = {}) {
  if (!bbox) {
    return [];
  }
  const primitives = [];
  const splitAlongX = Number(bbox.width || 0) >= Number(bbox.height || 0);
  const midX = roundMetric(
    (Number(bbox.min_x || 0) + Number(bbox.max_x || 0)) / 2,
  );
  const midY = roundMetric(
    (Number(bbox.min_y || 0) + Number(bbox.max_y || 0)) / 2,
  );
  const segments = [
    {
      side: "north",
      start: { x: roundMetric(bbox.min_x), y: roundMetric(bbox.min_y) },
      end: { x: roundMetric(bbox.max_x), y: roundMetric(bbox.min_y) },
    },
    {
      side: "east",
      start: { x: roundMetric(bbox.max_x), y: roundMetric(bbox.min_y) },
      end: { x: roundMetric(bbox.max_x), y: roundMetric(bbox.max_y) },
    },
    {
      side: "south",
      start: { x: roundMetric(bbox.max_x), y: roundMetric(bbox.max_y) },
      end: { x: roundMetric(bbox.min_x), y: roundMetric(bbox.max_y) },
    },
    {
      side: "west",
      start: { x: roundMetric(bbox.min_x), y: roundMetric(bbox.max_y) },
      end: { x: roundMetric(bbox.min_x), y: roundMetric(bbox.min_y) },
    },
  ];
  const isFlat = roofLanguage.includes("flat");
  const isMono = roofLanguage.includes("mono");
  const isHip = roofLanguage.includes("hip");

  segments.forEach((segment, index) => {
    const primitiveFamily = isFlat
      ? "parapet"
      : /north|south/.test(segment.side) === splitAlongX
        ? "eave"
        : "roof_edge";
    primitives.push(
      createRoofPrimitiveGeometry(
        projectGeometry.project_id,
        {
          primitive_family: primitiveFamily,
          type: `${primitiveFamily}_${segment.side}`,
          side: segment.side,
          start: segment.start,
          end: segment.end,
          bbox: buildBoundingBoxFromPolygon([segment.start, segment.end]),
          roof_language: roofLanguage,
          ridge_height_m: ridgeHeight,
          eave_height_m: eaveHeight,
          support_mode: "explicit_generated",
          provenance: {
            source: "geometry-factory",
            derivation: isFlat ? "phase16-parapet-edge" : "phase16-roof-edge",
          },
        },
        20 + index,
        { fallbackLevelId },
      ),
    );
  });

  const ridgeStart = splitAlongX
    ? { x: roundMetric(bbox.min_x), y: midY }
    : { x: midX, y: roundMetric(bbox.min_y) };
  const ridgeEnd = splitAlongX
    ? { x: roundMetric(bbox.max_x), y: midY }
    : { x: midX, y: roundMetric(bbox.max_y) };

  if (!isFlat) {
    primitives.push(
      createRoofPrimitiveGeometry(
        projectGeometry.project_id,
        {
          primitive_family: "ridge",
          type: isHip ? "hip_ridge_line" : "ridge_line",
          start: ridgeStart,
          end: ridgeEnd,
          bbox: buildBoundingBoxFromPolygon([ridgeStart, ridgeEnd]),
          roof_language: roofLanguage,
          ridge_height_m: ridgeHeight,
          eave_height_m: eaveHeight,
          support_mode: "explicit_generated",
          provenance: {
            source: "geometry-factory",
            derivation: "phase16-ridge",
          },
        },
        30,
        { fallbackLevelId },
      ),
    );
  }

  if (!isFlat || isMono) {
    primitives.push(
      createRoofPrimitiveGeometry(
        projectGeometry.project_id,
        {
          primitive_family: "roof_break",
          type: isMono ? "mono_pitch_break" : "ridge_break",
          start: ridgeStart,
          end: ridgeEnd,
          bbox: buildBoundingBoxFromPolygon([ridgeStart, ridgeEnd]),
          roof_language: roofLanguage,
          ridge_height_m: ridgeHeight,
          eave_height_m: eaveHeight,
          support_mode: "explicit_generated",
          provenance: {
            source: "geometry-factory",
            derivation: "phase16-roof-break",
          },
        },
        31,
        { fallbackLevelId },
      ),
    );
  }

  return primitives;
}

function findDormerSources(projectGeometry = {}) {
  const normalizeFeatureCollection = (collection) => {
    if (Array.isArray(collection)) {
      return collection;
    }
    if (!collection || typeof collection !== "object") {
      return [];
    }
    return Object.values(collection).flatMap((entry) =>
      Array.isArray(entry)
        ? entry
        : entry && typeof entry === "object"
          ? [entry]
          : [],
    );
  };
  const featureSources = [
    ...normalizeFeatureCollection(projectGeometry.metadata?.facade_features),
    ...normalizeFeatureCollection(projectGeometry.metadata?.facadeFeatures),
    ...normalizeFeatureCollection(
      projectGeometry.metadata?.facade_grammar?.features,
    ),
  ];
  return featureSources.filter((feature) =>
    String(feature?.type || feature?.family || "")
      .toLowerCase()
      .includes("dormer"),
  );
}

function attachDormersToRoofPrimitives(
  projectGeometry = {},
  primitives = [],
  style = {},
  input = {},
) {
  const fallbackLevelId =
    projectGeometry.levels[projectGeometry.levels.length - 1]?.id || null;
  const roofPlanes = (primitives || []).filter(
    (entry) => entry.primitive_family === "roof_plane",
  );
  if (!roofPlanes.length) {
    return [];
  }
  const dormers = [
    ...findDormerSources(projectGeometry),
    ...(input.dormers || input.roofDormers || []),
  ];
  return dormers.map((dormer, index) => {
    const host = roofPlanes[index % roofPlanes.length];
    const bbox = host.bbox || {};
    const width = Math.max(0.9, Number(dormer.width_m || dormer.width || 1.2));
    const height = Math.max(
      0.55,
      Number(dormer.height_m || dormer.height || 0.8),
    );
    const centerX = roundMetric(
      dormer.center_x ??
        dormer.x ??
        (Number(bbox.min_x || 0) + Number(bbox.max_x || 0)) / 2,
    );
    const centerY = roundMetric(
      dormer.center_y ??
        dormer.y ??
        (Number(bbox.min_y || 0) + Number(bbox.max_y || 0)) / 2,
    );
    const polygon = rectanglePolygonFromBounds(
      centerX - width / 2,
      centerY - height / 2,
      centerX + width / 2,
      centerY + height / 2,
    );
    return createRoofPrimitiveGeometry(
      projectGeometry.project_id,
      {
        primitive_family: "dormer_attachment",
        type: String(dormer.type || "dormer_attachment").toLowerCase(),
        polygon,
        bbox: buildBoundingBoxFromPolygon(polygon),
        attached_primitive_id: host.id,
        roof_language: normalizeRoofLanguage(projectGeometry.roof || {}, style),
        ridge_height_m: roundMetric(host.ridge_height_m || 0),
        eave_height_m: roundMetric(host.eave_height_m || 0),
        support_mode: "explicit_generated",
        provenance: {
          source: "geometry-factory",
          derivation: "phase16-dormer-attachment",
        },
      },
      40 + index,
      { fallbackLevelId },
    );
  });
}

export function summarizeCanonicalRoofTruth(
  projectGeometry = {},
  roofPrimitives = [],
  roof = {},
  style = {},
) {
  const families = [
    ...new Set(
      (roofPrimitives || [])
        .map((entry) => entry.primitive_family)
        .filter(Boolean),
    ),
  ];
  const explicitGeneratedCount = (roofPrimitives || []).filter((entry) => {
    const supportMode = String(
      entry.support_mode || entry.supportMode || "",
    ).toLowerCase();
    const primitiveFamily = String(
      entry.primitive_family || entry.type || "",
    ).toLowerCase();
    return (
      supportMode === "explicit_generated" ||
      (!supportMode &&
        [
          "roof_plane",
          "roof_edge",
          "eave",
          "ridge",
          "parapet",
          "roof_break",
          "dormer_attachment",
        ].includes(primitiveFamily))
    );
  }).length;
  let supportMode = "missing";
  if (explicitGeneratedCount > 0) {
    supportMode = "explicit_generated";
  } else if (roof?.polygon?.length || roof?.bbox) {
    supportMode = "derived_profile_only";
  } else if (normalizeRoofLanguage(roof, style)) {
    supportMode = "roof_language_only";
  }

  return {
    support_mode: supportMode,
    primitive_count: Number((roofPrimitives || []).length || 0),
    explicit_generated_count: explicitGeneratedCount,
    primitive_families: families,
    edge_count: (roofPrimitives || []).filter((entry) =>
      ["roof_edge", "eave", "ridge", "parapet", "roof_break"].includes(
        String(entry.primitive_family || ""),
      ),
    ).length,
    parapet_count: (roofPrimitives || []).filter(
      (entry) => String(entry.primitive_family || "") === "parapet",
    ).length,
    roof_break_count: (roofPrimitives || []).filter(
      (entry) => String(entry.primitive_family || "") === "roof_break",
    ).length,
    dormer_attachment_count: (roofPrimitives || []).filter(
      (entry) => String(entry.primitive_family || "") === "dormer_attachment",
    ).length,
  };
}

function buildDerivedRoofPrimitives(projectGeometry = {}, style = {}) {
  const topFootprint =
    projectGeometry.footprints[projectGeometry.footprints.length - 1] ||
    projectGeometry.footprints[0] ||
    {};
  const roof =
    projectGeometry.roof ||
    createRoofGeometry(projectGeometry.project_id, topFootprint, style);
  const polygon = roof.polygon?.length
    ? roof.polygon
    : topFootprint.polygon || [];
  const bbox = getRoofBounds(projectGeometry, roof, polygon);
  if (!bbox || !Number.isFinite(Number(bbox.width || 0))) {
    return [];
  }

  const roofLanguage = normalizeRoofLanguage(roof, style);
  const buildingHeight = totalBuildingHeight(projectGeometry.levels);
  const eaveHeight = roundMetric(buildingHeight || DEFAULT_LEVEL_HEIGHT_M);
  const ridgeHeight = roundMetric(eaveHeight + inferRoofRiseM(roof, style));
  const fallbackLevelId =
    projectGeometry.levels[projectGeometry.levels.length - 1]?.id || null;
  const roofPrimitives = [
    ...buildRoofPlanePrimitives({
      projectGeometry,
      roof,
      style,
      polygon,
      bbox,
      roofLanguage,
      ridgeHeight,
      eaveHeight,
      fallbackLevelId,
    }),
    ...buildRoofEdgeAndBreakPrimitives({
      projectGeometry,
      bbox,
      roofLanguage,
      ridgeHeight,
      eaveHeight,
      fallbackLevelId,
    }),
  ];
  if (roofSupportEnabled()) {
    roofPrimitives.push(
      ...attachDormersToRoofPrimitives(
        projectGeometry,
        roofPrimitives,
        style,
        projectGeometry,
      ),
    );
  }
  return roofPrimitives;
}

export function buildCanonicalRoofPrimitives(projectGeometry = {}, input = {}) {
  const explicit =
    input.roof_primitives || input.roofPrimitives || input.roofElements || [];
  if (Array.isArray(explicit) && explicit.length) {
    const fallbackLevelId =
      projectGeometry.levels[projectGeometry.levels.length - 1]?.id || null;
    return explicit.map((entry, index) =>
      createRoofPrimitiveGeometry(projectGeometry.project_id, entry, index, {
        fallbackLevelId,
      }),
    );
  }
  return buildDerivedRoofPrimitives(projectGeometry, input.styleDNA || {});
}

function createFoundationGeometry(
  projectId,
  foundation = {},
  index = 0,
  { fallbackLevelId = null } = {},
) {
  const polygon = foundation.polygon || [];
  const segmentPoints =
    foundation.start && foundation.end
      ? [foundation.start, foundation.end]
      : [];
  const bbox =
    foundation.bbox ||
    (polygon.length
      ? buildBoundingBoxFromPolygon(polygon)
      : segmentPoints.length
        ? buildBoundingBoxFromPolygon(segmentPoints)
        : null);
  const provenanceWallId =
    foundation.provenance?.wall_id || foundation.wall_id || null;
  return {
    ...cloneGeometryData(foundation),
    id:
      foundation.id ||
      createStableId(
        "foundation",
        projectId,
        foundation.level_id || fallbackLevelId,
        foundation.foundation_type || foundation.condition_type || index,
        provenanceWallId,
        foundation.start?.x,
        foundation.start?.y,
        foundation.end?.x,
        foundation.end?.y,
        bbox?.min_x,
        bbox?.min_y,
        bbox?.max_x,
        bbox?.max_y,
        index,
      ),
    foundation_type:
      foundation.foundation_type || foundation.type || "continuous_footing",
    level_id: foundation.level_id || fallbackLevelId,
    support_mode: resolveFoundationSupportMode(foundation),
    polygon,
    bbox,
    depth_m: roundMetric(foundation.depth_m ?? foundation.depthM ?? 0.75),
    thickness_m: roundMetric(
      foundation.thickness_m ?? foundation.thicknessM ?? 0.42,
    ),
    provenance: {
      ...(foundation.provenance || {}),
      source:
        foundation.provenance?.source ||
        foundation.source ||
        "canonical-foundation-primitives",
    },
  };
}

function createBaseConditionGeometry(
  projectId,
  baseCondition = {},
  index = 0,
  { fallbackLevelId = null } = {},
) {
  const polygon = baseCondition.polygon || [];
  const segmentPoints =
    baseCondition.start && baseCondition.end
      ? [baseCondition.start, baseCondition.end]
      : [];
  const bbox =
    baseCondition.bbox ||
    (polygon.length
      ? buildBoundingBoxFromPolygon(polygon)
      : segmentPoints.length
        ? buildBoundingBoxFromPolygon(segmentPoints)
        : null);
  return {
    ...cloneGeometryData(baseCondition),
    id:
      baseCondition.id ||
      createStableId(
        "base-condition",
        projectId,
        baseCondition.level_id || fallbackLevelId,
        baseCondition.condition_type || index,
        baseCondition.start?.x,
        baseCondition.start?.y,
        baseCondition.end?.x,
        baseCondition.end?.y,
        bbox?.min_x,
        bbox?.min_y,
        bbox?.max_x,
        bbox?.max_y,
        index,
      ),
    condition_type:
      baseCondition.condition_type || baseCondition.type || "level_ground",
    level_id: baseCondition.level_id || fallbackLevelId,
    support_mode: resolveBaseConditionSupportMode(baseCondition),
    polygon,
    bbox,
    plinth_height_m: roundMetric(
      baseCondition.plinth_height_m ?? baseCondition.plinthHeightM ?? 0.15,
    ),
    ground_line_elevation_m: roundMetric(
      baseCondition.ground_line_elevation_m ??
        baseCondition.groundLineElevationM ??
        0,
    ),
    provenance: {
      ...(baseCondition.provenance || {}),
      source:
        baseCondition.provenance?.source ||
        baseCondition.source ||
        "canonical-base-conditions",
    },
  };
}

export function deriveBaseConditionSemantics(projectGeometry = {}, input = {}) {
  const site = input.site || projectGeometry.site || {};
  const envelope = {
    boundary_polygon: projectGeometry.site?.boundary_polygon,
    buildable_polygon: projectGeometry.site?.buildable_polygon,
    boundary_bbox: projectGeometry.site?.boundary_bbox,
    buildable_bbox: projectGeometry.site?.buildable_bbox,
    constraints: projectGeometry.site?.constraints,
  };
  return deriveGroundRelationSemantics(site, envelope);
}

export function deriveGroundRelationPrimitives(
  projectGeometry = {},
  input = {},
) {
  const semantics = deriveBaseConditionSemantics(projectGeometry, input);
  const canonicalSupportMode = foundationSupportEnabled()
    ? "explicit_ground_primitives"
    : "contextual_ground_relation";
  const fallbackLevelId = projectGeometry.levels[0]?.id || null;
  const footprint = projectGeometry.footprints?.[0] || {
    polygon: projectGeometry.site?.buildable_polygon || [],
    bbox: projectGeometry.site?.buildable_bbox || null,
  };
  const bbox =
    footprint.bbox ||
    buildBoundingBoxFromPolygon(
      footprint.polygon || projectGeometry.site?.buildable_polygon || [],
    );
  if (!bbox) {
    return [];
  }
  const width = Number(bbox.width || 0);
  const height = Number(bbox.height || 0);
  const baseConditions = [
    createBaseConditionGeometry(
      projectGeometry.project_id,
      {
        condition_type: semantics.groundCondition,
        level_id: fallbackLevelId,
        polygon:
          footprint.polygon ||
          rectanglePolygonFromBounds(
            bbox.min_x,
            bbox.min_y,
            bbox.max_x,
            bbox.max_y,
          ),
        bbox,
        plinth_height_m: semantics.plinthHeightM,
        ground_line_elevation_m: 0,
        support_mode: canonicalSupportMode,
        provenance: {
          source: "geometry-factory",
          derivation: "phase16-ground-condition",
        },
      },
      0,
      { fallbackLevelId },
    ),
    createBaseConditionGeometry(
      projectGeometry.project_id,
      {
        condition_type: "ground_line",
        level_id: fallbackLevelId,
        start: { x: roundMetric(bbox.min_x), y: roundMetric(bbox.max_y) },
        end: { x: roundMetric(bbox.max_x), y: roundMetric(bbox.max_y) },
        bbox: buildBoundingBoxFromPolygon([
          { x: roundMetric(bbox.min_x), y: roundMetric(bbox.max_y) },
          { x: roundMetric(bbox.max_x), y: roundMetric(bbox.max_y) },
        ]),
        plinth_height_m: semantics.plinthHeightM,
        ground_line_elevation_m: 0,
        support_mode: canonicalSupportMode,
        provenance: {
          source: "geometry-factory",
          derivation: "phase16-ground-line",
        },
      },
      1,
      { fallbackLevelId },
    ),
  ];

  if (semantics.plinthHeightM > 0.02) {
    baseConditions.push(
      createBaseConditionGeometry(
        projectGeometry.project_id,
        {
          condition_type: "plinth_line",
          level_id: fallbackLevelId,
          start: {
            x: roundMetric(bbox.min_x),
            y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
          },
          end: {
            x: roundMetric(bbox.max_x),
            y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
          },
          bbox: buildBoundingBoxFromPolygon([
            {
              x: roundMetric(bbox.min_x),
              y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
            },
            {
              x: roundMetric(bbox.max_x),
              y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
            },
          ]),
          plinth_height_m: semantics.plinthHeightM,
          ground_line_elevation_m: semantics.plinthHeightM,
          support_mode: canonicalSupportMode,
          provenance: {
            source: "geometry-factory",
            derivation: "phase16-plinth-line",
          },
        },
        2,
        { fallbackLevelId },
      ),
    );
  }

  if (projectGeometry.slabs?.length) {
    const slab = projectGeometry.slabs[0];
    baseConditions.push(
      createBaseConditionGeometry(
        projectGeometry.project_id,
        {
          condition_type: "slab_ground_interface",
          level_id: slab.level_id || fallbackLevelId,
          polygon: slab.polygon || [],
          bbox: slab.bbox || bbox,
          plinth_height_m: semantics.plinthHeightM,
          ground_line_elevation_m: 0,
          support_mode: canonicalSupportMode,
          provenance: {
            source: "geometry-factory",
            derivation: "phase16-slab-ground-interface",
            slab_id: slab.id || null,
          },
        },
        3,
        { fallbackLevelId },
      ),
    );
  }

  if (semantics.hasStepCondition || semantics.supportMode === "graded") {
    baseConditions.push(
      createBaseConditionGeometry(
        projectGeometry.project_id,
        {
          condition_type: semantics.hasStepCondition
            ? "step_line"
            : "grade_break",
          level_id: fallbackLevelId,
          start: {
            x: roundMetric(bbox.min_x + width * 0.25),
            y: roundMetric(bbox.max_y - height * 0.08),
          },
          end: {
            x: roundMetric(bbox.max_x - width * 0.25),
            y: roundMetric(bbox.max_y - height * 0.18),
          },
          bbox: buildBoundingBoxFromPolygon([
            {
              x: roundMetric(bbox.min_x + width * 0.25),
              y: roundMetric(bbox.max_y - height * 0.08),
            },
            {
              x: roundMetric(bbox.max_x - width * 0.25),
              y: roundMetric(bbox.max_y - height * 0.18),
            },
          ]),
          plinth_height_m: semantics.plinthHeightM,
          ground_line_elevation_m: semantics.gradeDeltaM,
          support_mode: canonicalSupportMode,
          provenance: {
            source: "geometry-factory",
            derivation: "phase16-ground-step",
          },
        },
        4,
        { fallbackLevelId },
      ),
    );
  }

  return baseConditions;
}

export function summarizeCanonicalFoundationTruth(
  projectGeometry = {},
  foundations = [],
  baseConditions = [],
) {
  const conditionTypes = [
    ...new Set(
      (baseConditions || [])
        .map((entry) => entry.condition_type)
        .filter(Boolean),
    ),
  ];
  const foundationTypes = [
    ...new Set(
      (foundations || []).map((entry) => entry.foundation_type).filter(Boolean),
    ),
  ];
  const supportModes = [
    ...(foundations || []).map(
      (entry) => entry.support_mode || entry.supportMode,
    ),
    ...(baseConditions || []).map(
      (entry) => entry.support_mode || entry.supportMode,
    ),
  ]
    .filter(Boolean)
    .map((entry) => String(entry).toLowerCase());
  const explicitGroundRelationCount = (baseConditions || []).filter((entry) => {
    const supportMode = String(
      entry.support_mode || entry.supportMode || "",
    ).toLowerCase();
    const isExplicitGroundCondition = [
      "ground_line",
      "plinth_line",
      "slab_ground_interface",
      "grade_break",
      "step_line",
    ].includes(String(entry.condition_type || ""));
    return (
      supportMode === "explicit_ground_primitives" ||
      (!supportMode && isExplicitGroundCondition)
    );
  }).length;
  const supportMode =
    explicitGroundRelationCount > 0 ||
    supportModes.includes("explicit_ground_primitives") ||
    (supportModes.length === 0 && (foundations || []).length > 0)
      ? "explicit_ground_primitives"
      : (baseConditions || []).length > 0 ||
          supportModes.some((entry) =>
            ["contextual_ground_relation", "derived_perimeter"].includes(entry),
          ) ||
          projectGeometry.walls?.some((wall) => wall.exterior)
        ? "contextual_ground_relation"
        : "missing";

  return {
    support_mode: supportMode,
    foundation_count: Number((foundations || []).length || 0),
    base_condition_count: Number((baseConditions || []).length || 0),
    foundation_types: foundationTypes,
    condition_types: conditionTypes,
    explicit_ground_relation_count: explicitGroundRelationCount,
  };
}

function buildDerivedFoundations(projectGeometry = {}) {
  const fallbackLevelId = projectGeometry.levels[0]?.id || null;
  const exteriorWalls = (projectGeometry.walls || []).filter(
    (wall) => wall.exterior === true || wall.kind === "exterior",
  );
  if (exteriorWalls.length) {
    return exteriorWalls.map((wall, index) =>
      createFoundationGeometry(
        projectGeometry.project_id,
        {
          foundation_type: "continuous_footing",
          level_id: wall.level_id || fallbackLevelId,
          start: wall.start,
          end: wall.end,
          bbox: wall.bbox,
          thickness_m: Math.max(0.38, Number(wall.thickness_m || 0.2) + 0.14),
          depth_m: 0.8,
          support_mode: foundationSupportEnabled()
            ? "explicit_ground_primitives"
            : "contextual_ground_relation",
          provenance: {
            source: "geometry-factory",
            derivation: "exterior-wall-footing",
            wall_id: wall.id || null,
          },
        },
        index,
        { fallbackLevelId },
      ),
    );
  }

  const footprint = projectGeometry.footprints[0] || {};
  const bbox =
    footprint.bbox ||
    buildBoundingBoxFromPolygon(
      footprint.polygon || projectGeometry.site?.buildable_polygon || [],
    );
  if (!bbox || !Number.isFinite(Number(bbox.width || 0))) {
    return [];
  }
  const perimeterSegments = [
    {
      start: { x: bbox.min_x, y: bbox.min_y },
      end: { x: bbox.max_x, y: bbox.min_y },
    },
    {
      start: { x: bbox.max_x, y: bbox.min_y },
      end: { x: bbox.max_x, y: bbox.max_y },
    },
    {
      start: { x: bbox.max_x, y: bbox.max_y },
      end: { x: bbox.min_x, y: bbox.max_y },
    },
    {
      start: { x: bbox.min_x, y: bbox.max_y },
      end: { x: bbox.min_x, y: bbox.min_y },
    },
  ];
  return perimeterSegments.map((segment, index) =>
    createFoundationGeometry(
      projectGeometry.project_id,
      {
        foundation_type: "perimeter_footing",
        level_id: fallbackLevelId,
        start: segment.start,
        end: segment.end,
        bbox: buildBoundingBoxFromPolygon([segment.start, segment.end]),
        depth_m: 0.78,
        thickness_m: 0.42,
        support_mode: foundationSupportEnabled()
          ? "explicit_ground_primitives"
          : "contextual_ground_relation",
        provenance: {
          source: "geometry-factory",
          derivation: "footprint-perimeter",
        },
      },
      index,
      { fallbackLevelId },
    ),
  );
}

function buildDerivedBaseConditions(projectGeometry = {}, input = {}) {
  return deriveGroundRelationPrimitives(projectGeometry, input);
}

export function buildCanonicalFoundationPrimitives(
  projectGeometry = {},
  input = {},
) {
  const explicit = input.foundations || [];
  const explicitBaseConditions =
    input.base_conditions || input.baseConditions || [];
  const fallbackLevelId = projectGeometry.levels[0]?.id || null;
  if (Array.isArray(explicit) && explicit.length) {
    return explicit.map((entry, index) =>
      createFoundationGeometry(projectGeometry.project_id, entry, index, {
        fallbackLevelId,
      }),
    );
  }
  if (Array.isArray(explicitBaseConditions) && explicitBaseConditions.length) {
    const hasExplicitGroundPrimitiveEvidence = explicitBaseConditions.some(
      (entry) => {
        const supportMode = String(
          entry.support_mode || entry.supportMode || "",
        ).toLowerCase();
        const conditionType = String(
          entry.condition_type || entry.type || "",
        ).toLowerCase();
        return (
          supportMode === "explicit_ground_primitives" ||
          (!supportMode &&
            [
              "ground_line",
              "plinth_line",
              "slab_ground_interface",
              "grade_break",
              "step_line",
            ].includes(conditionType))
        );
      },
    );
    if (!hasExplicitGroundPrimitiveEvidence) {
      return [];
    }
  }
  return buildDerivedFoundations(projectGeometry);
}

export function buildCanonicalBaseConditions(projectGeometry = {}, input = {}) {
  const explicit = input.base_conditions || input.baseConditions || [];
  const fallbackLevelId = projectGeometry.levels[0]?.id || null;
  if (Array.isArray(explicit) && explicit.length) {
    return explicit.map((entry, index) =>
      createBaseConditionGeometry(projectGeometry.project_id, entry, index, {
        fallbackLevelId,
      }),
    );
  }
  return buildDerivedBaseConditions(projectGeometry, input);
}

export function appendEntity(geometry, collectionName, entity) {
  geometry[collectionName].push(entity);
  return entity;
}

export function appendLevelEntityReference(level, collectionName, entityId) {
  const referenceKey = `${collectionName}_ids`;
  if (!Array.isArray(level[referenceKey])) {
    level[referenceKey] = [];
  }
  if (!level[referenceKey].includes(entityId)) {
    level[referenceKey].push(entityId);
  }
}

export function finalizeProjectGeometry(geometry) {
  const collectionSizes = Object.fromEntries(
    Object.entries(geometry)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, value.length]),
  );
  const roofTruth = summarizeCanonicalRoofTruth(
    geometry,
    geometry.roof_primitives || [],
    geometry.roof || {},
    geometry.metadata?.style_dna || {},
  );
  const foundationTruth = summarizeCanonicalFoundationTruth(
    geometry,
    geometry.foundations || [],
    geometry.base_conditions || [],
  );

  geometry.metadata = {
    ...geometry.metadata,
    status: geometry.metadata.status || "draft",
    stats: collectionSizes,
    canonical_construction_truth: {
      ...(geometry.metadata?.canonical_construction_truth || {}),
      roof: roofTruth,
      foundation: foundationTruth,
    },
  };
  geometry.roof = geometry.roof
    ? {
        ...geometry.roof,
        truth_summary: roofTruth,
      }
    : geometry.roof;
  geometry.site = {
    ...(geometry.site || {}),
    base_condition_summary: foundationTruth,
  };

  return geometry;
}

export function createProjectGeometry(input = {}) {
  const geometry = createProjectGeometrySkeleton(input);
  geometry.metadata = {
    ...geometry.metadata,
    ...(input.metadata || {}),
    source_geometry_schema: CANONICAL_PROJECT_GEOMETRY_VERSION,
  };
  geometry.provenance = {
    ...geometry.provenance,
    ...(input.provenance || {}),
  };
  return geometry;
}

function normalizeLegacyRoom(room = {}) {
  if (room.bbox) {
    return {
      ...room,
      bbox: {
        min_x: roundMetric(room.bbox.min_x ?? room.bbox.x ?? 0),
        min_y: roundMetric(room.bbox.min_y ?? room.bbox.y ?? 0),
        max_x: roundMetric(
          room.bbox.max_x ?? (room.bbox.x ?? 0) + (room.bbox.width ?? 0),
        ),
        max_y: roundMetric(
          room.bbox.max_y ?? (room.bbox.y ?? 0) + (room.bbox.height ?? 0),
        ),
        width: roundMetric(room.bbox.width ?? room.width_m ?? room.width ?? 0),
        height: roundMetric(
          room.bbox.height ?? room.depth_m ?? room.height ?? 0,
        ),
      },
    };
  }

  return {
    ...room,
    bbox: buildBoundingBoxFromRect(
      room.x ?? room.x_m ?? 0,
      room.y ?? room.y_m ?? 0,
      room.width ?? room.width_m ?? 3,
      room.height ?? room.depth_m ?? 3,
    ),
  };
}

function extractWallSegment(wall = {}) {
  const start = wall.start || wall.geometry?.start || wall.points?.[0];
  const end = wall.end || wall.geometry?.end || wall.points?.[1];
  return start && end ? { start, end } : null;
}

export function coerceToCanonicalProjectGeometry(input = {}) {
  if (input?.schema_version === CANONICAL_PROJECT_GEOMETRY_VERSION) {
    const cloned = finalizeProjectGeometry(cloneGeometryData(input));
    CANONICAL_GEOMETRY_ENTITY_COLLECTIONS.forEach((collectionName) => {
      if (!Array.isArray(cloned[collectionName])) {
        cloned[collectionName] = [];
      }
    });
    if (!cloned.roof && cloned.footprints?.length) {
      cloned.roof = createRoofGeometry(
        cloned.project_id,
        cloned.footprints[cloned.footprints.length - 1],
        cloned.metadata?.style_dna || {},
      );
    }
    if (!cloned.roof_primitives?.length) {
      cloned.roof_primitives = buildCanonicalRoofPrimitives(cloned, {
        styleDNA: cloned.metadata?.style_dna || {},
      });
    }
    if (!cloned.foundations?.length) {
      cloned.foundations = buildCanonicalFoundationPrimitives(cloned, cloned);
    }
    if (!cloned.base_conditions?.length) {
      cloned.base_conditions = buildCanonicalBaseConditions(cloned, cloned);
    }
    return finalizeProjectGeometry(cloned);
  }

  const projectGeometry = createProjectGeometry(input);
  const topLevelRooms = Array.isArray(input.rooms) ? input.rooms : [];
  const topLevelWalls = Array.isArray(input.walls) ? input.walls : [];
  const topLevelDoors = Array.isArray(input.doors) ? input.doors : [];
  const topLevelWindows = Array.isArray(input.windows) ? input.windows : [];
  const topLevelStairs = Array.isArray(input.stairs) ? input.stairs : [];
  const topLevelCirculation = Array.isArray(input.circulation)
    ? input.circulation
    : [];
  const topLevelColumns = Array.isArray(input.columns) ? input.columns : [];
  const topLevelBeams = Array.isArray(input.beams) ? input.beams : [];
  const rawLevels =
    Array.isArray(input.levels) && input.levels.length
      ? input.levels
      : [
          {
            id: "ground",
            name: "Ground Floor",
            level_number: 0,
            rooms: topLevelRooms,
            walls: topLevelWalls,
            doors: topLevelDoors,
            windows: topLevelWindows,
            stairs: topLevelStairs,
            circulation: topLevelCirculation,
            columns: topLevelColumns,
            beams: topLevelBeams,
          },
        ];

  rawLevels.forEach((rawLevel, levelIndex) => {
    const level = createLevelGeometry(
      projectGeometry.project_id,
      rawLevel,
      levelIndex,
    );
    appendEntity(projectGeometry, "levels", level);

    const roomInputs =
      Array.isArray(rawLevel.rooms) && rawLevel.rooms.length
        ? rawLevel.rooms
        : topLevelRooms.filter(
            (room) =>
              room.level_id === level.id ||
              room.level === level.level_number ||
              room.level_number === level.level_number,
          );

    roomInputs.forEach((rawRoom, roomIndex) => {
      const room = createRoomGeometry(
        projectGeometry.project_id,
        level.id,
        normalizeLegacyRoom(rawRoom),
        roomIndex,
      );
      appendEntity(projectGeometry, "rooms", room);
      appendLevelEntityReference(level, "room", room.id);
    });

    const footprint = createFootprintGeometry(
      projectGeometry.project_id,
      level.id,
      rawLevel.footprint ||
        rawLevel.polygon ||
        projectGeometry.site.buildable_polygon,
      levelIndex,
    );
    appendEntity(projectGeometry, "footprints", footprint);
    level.footprint_id = footprint.id;

    const slab = createSlabGeometry(
      projectGeometry.project_id,
      level.id,
      footprint,
      levelIndex,
    );
    appendEntity(projectGeometry, "slabs", slab);
    appendLevelEntityReference(level, "slab", slab.id);

    const wallInputs = Array.isArray(rawLevel.walls) ? rawLevel.walls : [];
    wallInputs.forEach((rawWall, wallIndex) => {
      const segment = extractWallSegment(rawWall);
      if (!segment) {
        return;
      }
      const wall = createWallGeometry(
        projectGeometry.project_id,
        level.id,
        {
          ...rawWall,
          ...segment,
          source: "canonical-coercion",
        },
        wallIndex,
      );
      appendEntity(projectGeometry, "walls", wall);
      appendLevelEntityReference(level, "wall", wall.id);
    });

    const doorInputs = Array.isArray(rawLevel.doors) ? rawLevel.doors : [];
    doorInputs.forEach((rawDoor, doorIndex) => {
      const door = createOpeningGeometry(
        projectGeometry.project_id,
        level.id,
        "door",
        {
          ...rawDoor,
          source: "canonical-coercion",
        },
        doorIndex,
      );
      appendEntity(projectGeometry, "doors", door);
      appendLevelEntityReference(level, "door", door.id);
    });

    const windowInputs = Array.isArray(rawLevel.windows)
      ? rawLevel.windows
      : [];
    windowInputs.forEach((rawWindow, windowIndex) => {
      const windowElement = createOpeningGeometry(
        projectGeometry.project_id,
        level.id,
        "window",
        {
          ...rawWindow,
          exterior: true,
          source: "canonical-coercion",
        },
        windowIndex,
      );
      appendEntity(projectGeometry, "windows", windowElement);
      appendLevelEntityReference(level, "window", windowElement.id);
    });

    const stairInputs =
      Array.isArray(rawLevel.stairs) && rawLevel.stairs.length
        ? rawLevel.stairs
        : topLevelStairs.filter(
            (stair) =>
              stair.level_id === level.id ||
              stair.level === level.level_number ||
              stair.level_number === level.level_number,
          );
    stairInputs.forEach((rawStair, stairIndex) => {
      const stair = createStairGeometry(
        projectGeometry.project_id,
        level.id,
        {
          ...rawStair,
          source: "canonical-coercion",
        },
        stairIndex,
      );
      appendEntity(projectGeometry, "stairs", stair);
      appendLevelEntityReference(level, "stair", stair.id);
    });

    const circulationInputs =
      Array.isArray(rawLevel.circulation) && rawLevel.circulation.length
        ? rawLevel.circulation
        : topLevelCirculation.filter(
            (entry) =>
              entry.level_id === level.id ||
              entry.level === level.level_number ||
              entry.level_number === level.level_number,
          );
    circulationInputs.forEach((rawPath, pathIndex) => {
      const path = createCirculationGeometry(
        projectGeometry.project_id,
        level.id,
        {
          ...rawPath,
          source: "canonical-coercion",
        },
        pathIndex,
      );
      appendEntity(projectGeometry, "circulation", path);
      appendLevelEntityReference(level, "circulation", path.id);
    });

    const structuralFamilies = [
      ["columns", topLevelColumns],
      ["beams", topLevelBeams],
    ];
    structuralFamilies.forEach(([family, topLevelEntries]) => {
      const familyInputs =
        Array.isArray(rawLevel[family]) && rawLevel[family].length
          ? rawLevel[family]
          : topLevelEntries.filter(
              (entry) =>
                entry.level_id === level.id ||
                entry.level === level.level_number ||
                entry.level_number === level.level_number,
            );
      familyInputs.forEach((rawEntry, entryIndex) => {
        const normalized = createGenericGeometryEntity(
          projectGeometry.project_id,
          level.id,
          family,
          rawEntry,
          entryIndex,
        );
        appendEntity(projectGeometry, family, normalized);
        appendLevelEntityReference(level, family.slice(0, -1), normalized.id);
      });
    });
  });

  ["elevations", "sections", "annotations"].forEach((family) => {
    const entries = Array.isArray(input[family]) ? input[family] : [];
    entries.forEach((entry, index) => {
      appendEntity(
        projectGeometry,
        family,
        createGenericGeometryEntity(
          projectGeometry.project_id,
          entry.level_id || null,
          family,
          entry,
          index,
        ),
      );
    });
  });

  if (Array.isArray(input.slabs) && input.slabs.length) {
    input.slabs.forEach((slab, index) => {
      appendEntity(
        projectGeometry,
        "slabs",
        createGenericGeometryEntity(
          projectGeometry.project_id,
          slab.level_id || null,
          "slabs",
          slab,
          index,
        ),
      );
    });
  }

  if (input.roof) {
    projectGeometry.roof = createGenericGeometryEntity(
      projectGeometry.project_id,
      null,
      "roof",
      input.roof,
      0,
    );
  }

  CANONICAL_GEOMETRY_ENTITY_COLLECTIONS.forEach((collectionName) => {
    if (!Array.isArray(projectGeometry[collectionName])) {
      projectGeometry[collectionName] = [];
    }
  });

  if (!projectGeometry.roof && projectGeometry.footprints.length) {
    projectGeometry.roof = createRoofGeometry(
      projectGeometry.project_id,
      projectGeometry.footprints[projectGeometry.footprints.length - 1],
      input.styleDNA || {},
    );
  }

  projectGeometry.roof_primitives = buildCanonicalRoofPrimitives(
    projectGeometry,
    input,
  );
  projectGeometry.foundations = buildCanonicalFoundationPrimitives(
    projectGeometry,
    input,
  );
  projectGeometry.base_conditions = buildCanonicalBaseConditions(
    projectGeometry,
    input,
  );

  return finalizeProjectGeometry(projectGeometry);
}

export default {
  createProjectGeometry,
  createLevelGeometry,
  createRoomGeometry,
  createWallGeometry,
  createOpeningGeometry,
  createStairGeometry,
  createCirculationGeometry,
  createFootprintGeometry,
  createSlabGeometry,
  createRoofGeometry,
  summarizeCanonicalRoofTruth,
  summarizeCanonicalFoundationTruth,
  deriveBaseConditionSemantics,
  deriveGroundRelationPrimitives,
  buildCanonicalRoofPrimitives,
  buildCanonicalFoundationPrimitives,
  buildCanonicalBaseConditions,
  appendEntity,
  appendLevelEntityReference,
  finalizeProjectGeometry,
  coerceToCanonicalProjectGeometry,
};
