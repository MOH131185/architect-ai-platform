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

  geometry.metadata = {
    ...geometry.metadata,
    status: geometry.metadata.status || "draft",
    stats: collectionSizes,
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
    return finalizeProjectGeometry(cloneGeometryData(input));
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
      {},
    );
  }

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
  appendEntity,
  appendLevelEntityReference,
  finalizeProjectGeometry,
  coerceToCanonicalProjectGeometry,
};
