import {
  buildBoundingBoxFromPolygon,
  computeCentroid,
  createStableHash,
  createStableId,
  roundMetric,
} from "./projectGeometrySchema.js";

export const CANONICAL_DRAWING_MODEL_VERSION = "canonical-drawing-model-v1";

export const CANONICAL_DRAWING_ENTITY_TYPES = Object.freeze([
  "LINE",
  "LWPOLYLINE",
  "HATCH",
  "TEXT",
  "MTEXT",
  "DIMENSION",
  "BLOCK",
  "INSERT",
  "VIEWPORT",
]);

export const REQUIRED_CANONICAL_CAD_LAYERS = Object.freeze([
  "A-WALL",
  "A-WALL-EXT",
  "A-DOOR",
  "A-WINDOW",
  "A-STAIR",
  "A-ROOM",
  "A-DIMS",
  "A-TEXT",
  "A-HATCH",
  "A-SITE",
  "A-TITLE",
  "S-FOUNDATION",
  "S-COLUMN",
  "S-BEAM",
  "S-SLAB",
  "S-ROOF",
  "S-GRID",
  "S-NOTES",
  "M-DUCT",
  "M-PIPE",
  "P-DRAIN",
  "E-LIGHT",
  "E-POWER",
  "E-SWITCH",
  "F-FIRE",
]);

export const DEFAULT_CANONICAL_CAD_LAYERS = Object.freeze([
  {
    name: "A-WALL",
    discipline: "architectural",
    color: 7,
    lineweight: 50,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-WALL-EXT",
    discipline: "architectural",
    color: 1,
    lineweight: 70,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-DOOR",
    discipline: "architectural",
    color: 4,
    lineweight: 30,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-WINDOW",
    discipline: "architectural",
    color: 5,
    lineweight: 30,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-STAIR",
    discipline: "architectural",
    color: 6,
    lineweight: 30,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-ROOM",
    discipline: "architectural",
    color: 8,
    lineweight: 18,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-DIMS",
    discipline: "architectural",
    color: 2,
    lineweight: 18,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-TEXT",
    discipline: "architectural",
    color: 7,
    lineweight: 18,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-HATCH",
    discipline: "architectural",
    color: 9,
    lineweight: 13,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-SITE",
    discipline: "architectural",
    color: 30,
    lineweight: 35,
    linetype: "CONTINUOUS",
  },
  {
    name: "A-TITLE",
    discipline: "architectural",
    color: 7,
    lineweight: 25,
    linetype: "CONTINUOUS",
  },
  {
    name: "S-FOUNDATION",
    discipline: "structural",
    color: 1,
    lineweight: 60,
    linetype: "CONTINUOUS",
  },
  {
    name: "S-COLUMN",
    discipline: "structural",
    color: 1,
    lineweight: 60,
    linetype: "CONTINUOUS",
  },
  {
    name: "S-BEAM",
    discipline: "structural",
    color: 3,
    lineweight: 50,
    linetype: "CONTINUOUS",
  },
  {
    name: "S-SLAB",
    discipline: "structural",
    color: 4,
    lineweight: 35,
    linetype: "CONTINUOUS",
  },
  {
    name: "S-ROOF",
    discipline: "structural",
    color: 6,
    lineweight: 35,
    linetype: "CONTINUOUS",
  },
  {
    name: "S-GRID",
    discipline: "structural",
    color: 2,
    lineweight: 18,
    linetype: "CENTER",
  },
  {
    name: "S-NOTES",
    discipline: "structural",
    color: 7,
    lineweight: 18,
    linetype: "CONTINUOUS",
  },
  {
    name: "M-DUCT",
    discipline: "mechanical",
    color: 5,
    lineweight: 25,
    linetype: "CONTINUOUS",
  },
  {
    name: "M-PIPE",
    discipline: "mechanical",
    color: 4,
    lineweight: 25,
    linetype: "CONTINUOUS",
  },
  {
    name: "P-DRAIN",
    discipline: "plumbing",
    color: 6,
    lineweight: 25,
    linetype: "DASHED",
  },
  {
    name: "E-LIGHT",
    discipline: "electrical",
    color: 2,
    lineweight: 18,
    linetype: "CONTINUOUS",
  },
  {
    name: "E-POWER",
    discipline: "electrical",
    color: 3,
    lineweight: 18,
    linetype: "CONTINUOUS",
  },
  {
    name: "E-SWITCH",
    discipline: "electrical",
    color: 2,
    lineweight: 18,
    linetype: "CONTINUOUS",
  },
  {
    name: "F-FIRE",
    discipline: "fire",
    color: 1,
    lineweight: 25,
    linetype: "CONTINUOUS",
  },
]);

const DEFAULT_HATCHES = Object.freeze([
  { name: "BRICK", material: "brick", pattern: "ANSI32", scale: 0.35 },
  { name: "CONCRETE", material: "concrete", pattern: "AR-CONC", scale: 0.25 },
  {
    name: "INSULATION",
    material: "insulation",
    pattern: "BATTING",
    scale: 0.2,
  },
  { name: "EARTH", material: "earth", pattern: "EARTH", scale: 0.5 },
  { name: "TIMBER", material: "timber", pattern: "ANSI31", scale: 0.4 },
  { name: "GLAZING", material: "glazing", pattern: "ANSI37", scale: 0.25 },
  { name: "STEEL", material: "steel", pattern: "ANSI34", scale: 0.3 },
]);

const DEFAULT_LINE_TYPES = Object.freeze([
  { name: "CONTINUOUS", pattern: [] },
  { name: "DASHED", pattern: [0.35, -0.18] },
  { name: "CENTER", pattern: [0.5, -0.12, 0.1, -0.12] },
]);

const DEFAULT_LINEWEIGHTS = Object.freeze([
  { name: "thin", value: 13 },
  { name: "annotation", value: 18 },
  { name: "medium", value: 35 },
  { name: "heavy", value: 50 },
  { name: "cut", value: 70 },
]);

const DEFAULT_TEXT_STYLES = Object.freeze([
  {
    name: "ARCH_TITLE",
    fontFamily: "Arial",
    height: 5,
    widthFactor: 0.8,
  },
  {
    name: "ARCH_BODY",
    fontFamily: "Arial",
    height: 2.5,
    widthFactor: 0.8,
  },
]);

const DEFAULT_DIMENSION_STYLES = Object.freeze([
  {
    name: "ARCH_100",
    textHeight: 2.5,
    arrowSize: 2.5,
    arrowStyle: "architectural_tick",
    tickSize: 2.5,
    extensionOffset: 1.25,
    units: "meters",
    precision: 2,
  },
]);

const ISO_PAPER_SIZES_MM = Object.freeze({
  A1: { width: 841, height: 594 },
  A2: { width: 594, height: 420 },
  A3: { width: 420, height: 297 },
});

const DEFAULT_PLOT_STYLE_METADATA = Object.freeze({
  version: "cad-plot-style-v1",
  mode: "ctb",
  ctbFile: "archiai-monochrome.ctb",
  stbFile: null,
  colorPolicy: "aci-by-layer",
  lineweightPolicy: "layer-weight-to-ctb",
  mappings: [
    {
      layerPattern: "A-WALL-*",
      color: 7,
      lineweightMm: 0.35,
      plotStyle: "Black_035",
    },
    {
      layerPattern: "A-DIMS",
      color: 3,
      lineweightMm: 0.18,
      plotStyle: "Black_018",
    },
    {
      layerPattern: "A-TEXT",
      color: 7,
      lineweightMm: 0.18,
      plotStyle: "Black_018",
    },
    {
      layerPattern: "A-TITLE",
      color: 7,
      lineweightMm: 0.25,
      plotStyle: "Black_025",
    },
    {
      layerPattern: "A-METADATA",
      color: 8,
      lineweightMm: 0.13,
      plotStyle: "Grey_013",
    },
  ],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteMetric(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMetric(numeric, 3) : fallback;
}

function point2(point = {}) {
  return {
    x: finiteMetric(point.x),
    y: finiteMetric(point.y),
  };
}

function polygon(points = []) {
  return toArray(points).map(point2);
}

function hasUsablePolygon(points = []) {
  return Array.isArray(points) && points.length >= 3;
}

function sourceProjectGraphHashOf(compiledProject = {}) {
  return (
    compiledProject.sourceProjectGraphHash ||
    compiledProject.projectGraphHash ||
    compiledProject.project_graph_hash ||
    compiledProject.metadata?.sourceProjectGraphHash ||
    compiledProject.metadata?.projectGraphHash ||
    compiledProject.metadata?.source_project_graph_hash ||
    compiledProject.geometryHash ||
    null
  );
}

function projectNameOf(
  compiledProject = {},
  fallback = "Architect AI Project",
) {
  return (
    compiledProject.projectName ||
    compiledProject.name ||
    compiledProject.metadata?.projectName ||
    compiledProject.metadata?.project_name ||
    fallback
  );
}

function jurisdictionOf(compiledProject = {}, fallback = "generic") {
  return (
    compiledProject.jurisdiction ||
    compiledProject.regulations?.jurisdiction ||
    compiledProject.metadata?.jurisdiction ||
    fallback
  );
}

function entityHash(parts = []) {
  return createStableHash(JSON.stringify(parts));
}

function createEntity({
  type,
  layer,
  viewType,
  viewId,
  geometryHash,
  sourceId = null,
  levelId = null,
  geometry = {},
  metadata = {},
}) {
  return {
    id: createStableId(
      "cad-entity",
      type,
      layer,
      viewId,
      levelId,
      sourceId,
      entityHash([geometry, metadata]),
    ),
    type,
    layer,
    viewType,
    viewId,
    levelId,
    sourceId,
    geometry,
    imageProviderUsed: "none",
    technicalDrawing: true,
    geometryHash,
    metadata: {
      source: "compiled_project_to_canonical_drawing_model",
      ...metadata,
    },
  };
}

function lineEntity({
  start,
  end,
  layer,
  viewType,
  viewId,
  geometryHash,
  sourceId,
  levelId,
  metadata,
}) {
  return createEntity({
    type: "LINE",
    layer,
    viewType,
    viewId,
    geometryHash,
    sourceId,
    levelId,
    geometry: {
      start: point2(start),
      end: point2(end),
    },
    metadata,
  });
}

function polylineEntity({
  points,
  layer,
  viewType,
  viewId,
  geometryHash,
  sourceId,
  levelId,
  closed = true,
  metadata,
}) {
  return createEntity({
    type: "LWPOLYLINE",
    layer,
    viewType,
    viewId,
    geometryHash,
    sourceId,
    levelId,
    geometry: {
      points: polygon(points),
      closed,
    },
    metadata,
  });
}

function hatchEntity({
  boundary,
  layer = "A-HATCH",
  pattern = "CONCRETE",
  viewType,
  viewId,
  geometryHash,
  sourceId,
  levelId,
  metadata,
}) {
  return createEntity({
    type: "HATCH",
    layer,
    viewType,
    viewId,
    geometryHash,
    sourceId,
    levelId,
    geometry: {
      boundary: polygon(boundary),
      pattern,
    },
    metadata,
  });
}

function textEntity({
  point,
  text,
  layer = "A-TEXT",
  viewType,
  viewId,
  geometryHash,
  sourceId,
  levelId,
  height = 2.5,
  metadata,
}) {
  return createEntity({
    type: "TEXT",
    layer,
    viewType,
    viewId,
    geometryHash,
    sourceId,
    levelId,
    geometry: {
      point: point2(point),
      text: String(text || ""),
      height: finiteMetric(height, 2.5),
      styleName: "ARCH_BODY",
    },
    metadata,
  });
}

function dimensionEntity({
  start,
  end,
  offset,
  text,
  viewType,
  viewId,
  geometryHash,
  sourceId,
  levelId,
  metadata,
}) {
  return createEntity({
    type: "DIMENSION",
    layer: "A-DIMS",
    viewType,
    viewId,
    geometryHash,
    sourceId,
    levelId,
    geometry: {
      dimensionType: "linear",
      start: point2(start),
      end: point2(end),
      offset: point2(offset),
      text: String(text || ""),
      styleName: "ARCH_100",
      arrowStyle: "architectural_tick",
      layer: "A-DIMS",
    },
    metadata,
  });
}

function insertEntity({
  blockName,
  point,
  layer,
  viewType,
  viewId,
  geometryHash,
  sourceId,
  levelId,
  rotation = 0,
  scale = 1,
  metadata,
}) {
  return createEntity({
    type: "INSERT",
    layer,
    viewType,
    viewId,
    geometryHash,
    sourceId,
    levelId,
    geometry: {
      blockName,
      point: point2(point),
      rotation: finiteMetric(rotation),
      scale: finiteMetric(scale, 1),
    },
    metadata,
  });
}

function levelIdOf(entry = {}) {
  return entry.levelId || entry.level_id || entry.level || null;
}

function matchingLevel(entry = {}, level = {}, levelCount = 1) {
  const entryLevelId = levelIdOf(entry);
  if (
    entryLevelId &&
    (entryLevelId === level.id || entryLevelId === level.level_id)
  ) {
    return true;
  }
  if (Number.isFinite(Number(entry.level_number))) {
    return Number(entry.level_number) === Number(level.level_number);
  }
  return (
    !entryLevelId &&
    !Number.isFinite(Number(entry.level_number)) &&
    levelCount === 1
  );
}

function levelViewId(level = {}, index = 0) {
  if (Number(level.level_number) === 0 || index === 0)
    return "floor_plan_ground";
  return `floor_plan_level${Number(level.level_number) || index}`;
}

function bboxFromCandidates(candidates = []) {
  const points = candidates.flatMap((candidate) => {
    if (hasUsablePolygon(candidate?.polygon)) return candidate.polygon;
    if (candidate?.start && candidate?.end)
      return [candidate.start, candidate.end];
    if (candidate?.position_m) return [candidate.position_m];
    if (candidate?.position) return [candidate.position];
    return [];
  });
  if (!points.length) return null;
  return buildBoundingBoxFromPolygon(points);
}

function dimensionText(length) {
  return `${roundMetric(length, 2)} m`;
}

function appendPlanDimensions(
  entities,
  { bbox, viewId, levelId, geometryHash },
) {
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return;
  entities.push(
    dimensionEntity({
      start: { x: bbox.min_x, y: bbox.min_y },
      end: { x: bbox.max_x, y: bbox.min_y },
      offset: { x: bbox.min_x, y: bbox.min_y - 1 },
      text: dimensionText(bbox.width),
      viewType: "floor_plan",
      viewId,
      geometryHash,
      sourceId: `${viewId}-width`,
      levelId,
    }),
  );
  entities.push(
    dimensionEntity({
      start: { x: bbox.max_x, y: bbox.min_y },
      end: { x: bbox.max_x, y: bbox.max_y },
      offset: { x: bbox.max_x + 1, y: bbox.min_y },
      text: dimensionText(bbox.height),
      viewType: "floor_plan",
      viewId,
      geometryHash,
      sourceId: `${viewId}-depth`,
      levelId,
    }),
  );
}

function buildFloorPlanEntities(compiledProject = {}, geometryHash) {
  const levels = toArray(compiledProject.levels);
  const sourceLevels = levels.length
    ? levels
    : [{ id: "level-0", level_number: 0, name: "Ground Floor" }];
  const entities = [];

  sourceLevels.forEach((level, index) => {
    const levelId = level.id || `level-${index}`;
    const viewId = levelViewId(level, index);
    const levelCount = sourceLevels.length;
    const slabs = toArray(compiledProject.slabs).filter((entry) =>
      matchingLevel(entry, level, levelCount),
    );
    const rooms = toArray(compiledProject.rooms).filter((entry) =>
      matchingLevel(entry, level, levelCount),
    );
    const walls = toArray(compiledProject.walls).filter((entry) =>
      matchingLevel(entry, level, levelCount),
    );
    const openings = toArray(compiledProject.openings).filter((entry) =>
      matchingLevel(entry, level, levelCount),
    );
    const stairs = toArray(compiledProject.stairs).filter((entry) =>
      matchingLevel(entry, level, levelCount),
    );
    const columns = toArray(compiledProject.columns).filter((entry) =>
      matchingLevel(entry, level, levelCount),
    );
    const beams = toArray(compiledProject.beams).filter((entry) =>
      matchingLevel(entry, level, levelCount),
    );

    slabs.forEach((slab, slabIndex) => {
      if (hasUsablePolygon(slab.polygon)) {
        entities.push(
          polylineEntity({
            points: slab.polygon,
            layer: "S-SLAB",
            viewType: "floor_plan",
            viewId,
            geometryHash,
            sourceId: slab.id || `slab-${slabIndex}`,
            levelId,
            metadata: { role: "slab_outline" },
          }),
        );
        entities.push(
          hatchEntity({
            boundary: slab.polygon,
            layer: "A-HATCH",
            pattern: "CONCRETE",
            viewType: "floor_plan",
            viewId,
            geometryHash,
            sourceId: slab.id || `slab-hatch-${slabIndex}`,
            levelId,
            metadata: { role: "slab_hatch" },
          }),
        );
      }
    });

    rooms.forEach((room, roomIndex) => {
      if (hasUsablePolygon(room.polygon)) {
        entities.push(
          polylineEntity({
            points: room.polygon,
            layer: "A-ROOM",
            viewType: "floor_plan",
            viewId,
            geometryHash,
            sourceId: room.id || `room-${roomIndex}`,
            levelId,
            metadata: { role: "room_boundary" },
          }),
        );
        const labelPoint = room.centroid || computeCentroid(room.polygon);
        entities.push(
          textEntity({
            point: labelPoint,
            text: room.name || room.type || "Room",
            layer: "A-TEXT",
            viewType: "floor_plan",
            viewId,
            geometryHash,
            sourceId: `${room.id || roomIndex}-label`,
            levelId,
            height: 0.25,
            metadata: { role: "room_label" },
          }),
        );
      }
    });

    walls.forEach((wall, wallIndex) => {
      if (wall.start && wall.end) {
        entities.push(
          lineEntity({
            start: wall.start,
            end: wall.end,
            layer: wall.exterior ? "A-WALL-EXT" : "A-WALL",
            viewType: "floor_plan",
            viewId,
            geometryHash,
            sourceId: wall.id || `wall-${wallIndex}`,
            levelId,
            metadata: {
              role: wall.exterior ? "external_wall" : "internal_wall",
              thickness_m: finiteMetric(wall.thickness_m, 0),
            },
          }),
        );
      }
    });

    openings.forEach((opening, openingIndex) => {
      const position = opening.position_m || opening.position || null;
      if (!position) return;
      const width = finiteMetric(opening.width_m, 0.9);
      const start = { x: position.x - width / 2, y: position.y };
      const end = { x: position.x + width / 2, y: position.y };
      const kind = String(opening.type || opening.kind || "").toLowerCase();
      const isWindow = kind.includes("window");
      const layer = isWindow ? "A-WINDOW" : "A-DOOR";
      const blockName = isWindow ? "WINDOW_SYMBOL" : "DOOR_SINGLE";
      entities.push(
        lineEntity({
          start,
          end,
          layer,
          viewType: "floor_plan",
          viewId,
          geometryHash,
          sourceId: opening.id || `opening-${openingIndex}`,
          levelId,
          metadata: { role: isWindow ? "window_opening" : "door_opening" },
        }),
      );
      entities.push(
        insertEntity({
          blockName,
          point: position,
          layer,
          viewType: "floor_plan",
          viewId,
          geometryHash,
          sourceId: `${opening.id || openingIndex}-symbol`,
          levelId,
          scale: width,
          metadata: { role: isWindow ? "window_symbol" : "door_symbol" },
        }),
      );
    });

    stairs.forEach((stair, stairIndex) => {
      if (hasUsablePolygon(stair.polygon)) {
        entities.push(
          polylineEntity({
            points: stair.polygon,
            layer: "A-STAIR",
            viewType: "floor_plan",
            viewId,
            geometryHash,
            sourceId: stair.id || `stair-${stairIndex}`,
            levelId,
            metadata: { role: "stair_outline" },
          }),
        );
      }
    });

    columns.forEach((column, columnIndex) => {
      const position = column.position || column.position_m || null;
      if (!position) return;
      const half = finiteMetric(column.width_m || column.depth_m, 0.3) / 2;
      entities.push(
        polylineEntity({
          points: [
            { x: position.x - half, y: position.y - half },
            { x: position.x + half, y: position.y - half },
            { x: position.x + half, y: position.y + half },
            { x: position.x - half, y: position.y + half },
          ],
          layer: "S-COLUMN",
          viewType: "floor_plan",
          viewId,
          geometryHash,
          sourceId: column.id || `column-${columnIndex}`,
          levelId,
          metadata: { role: "structural_column" },
        }),
      );
    });

    beams.forEach((beam, beamIndex) => {
      if (beam.start && beam.end) {
        entities.push(
          lineEntity({
            start: beam.start,
            end: beam.end,
            layer: "S-BEAM",
            viewType: "floor_plan",
            viewId,
            geometryHash,
            sourceId: beam.id || `beam-${beamIndex}`,
            levelId,
            metadata: { role: "structural_beam" },
          }),
        );
      }
    });

    const bbox =
      bboxFromCandidates([...slabs, ...rooms, ...walls]) ||
      compiledProject.footprint?.bbox ||
      null;
    appendPlanDimensions(entities, { bbox, viewId, levelId, geometryHash });
  });

  return entities;
}

function projectBBox(compiledProject = {}) {
  const direct =
    compiledProject.envelope?.bbox ||
    compiledProject.footprint?.bbox ||
    bboxFromCandidates([
      ...toArray(compiledProject.slabs),
      ...toArray(compiledProject.rooms),
      ...toArray(compiledProject.walls),
      ...(toArray(compiledProject.site?.boundary_polygon).length
        ? [{ polygon: compiledProject.site.boundary_polygon }]
        : []),
    ]);
  return (
    direct || {
      min_x: 0,
      min_y: 0,
      max_x: 10,
      max_y: 8,
      width: 10,
      height: 8,
    }
  );
}

function projectHeight(compiledProject = {}) {
  const levels = toArray(compiledProject.levels);
  if (!levels.length) return 3.2;
  return levels.reduce((height, level) => {
    const top =
      Number(level.top_m) ||
      Number(level.elevation_m || 0) + Number(level.height_m || 3.2);
    return Math.max(height, top);
  }, 0);
}

function buildElevationEntities(compiledProject = {}, geometryHash) {
  const bbox = projectBBox(compiledProject);
  const width = Math.max(
    1,
    finiteMetric(bbox.width || bbox.max_x - bbox.min_x, 10),
  );
  const height = Math.max(1, finiteMetric(projectHeight(compiledProject), 3.2));
  const directions = ["north", "south", "east", "west"];
  const entities = [];

  directions.forEach((direction) => {
    const viewId = `elevation_${direction}`;
    const outline = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
    entities.push(
      polylineEntity({
        points: outline,
        layer: "A-WALL-EXT",
        viewType: "elevation",
        viewId,
        geometryHash,
        sourceId: viewId,
        metadata: { role: "facade_outline", direction },
      }),
    );
    entities.push(
      hatchEntity({
        boundary: outline,
        layer: "A-HATCH",
        pattern: "BRICK",
        viewType: "elevation",
        viewId,
        geometryHash,
        sourceId: `${viewId}-hatch`,
        metadata: { role: "facade_material_hatch", direction },
      }),
    );
    entities.push(
      lineEntity({
        start: { x: 0, y: 0 },
        end: { x: width, y: 0 },
        layer: "A-DIMS",
        viewType: "elevation",
        viewId,
        geometryHash,
        sourceId: `${viewId}-ground-line`,
        metadata: { role: "ground_line", direction },
      }),
    );
    entities.push(
      dimensionEntity({
        start: { x: width + 1, y: 0 },
        end: { x: width + 1, y: height },
        offset: { x: width + 2, y: 0 },
        text: dimensionText(height),
        viewType: "elevation",
        viewId,
        geometryHash,
        sourceId: `${viewId}-height`,
        metadata: { role: "overall_height_dimension", direction },
      }),
    );
  });

  return entities;
}

function buildSectionEntities(compiledProject = {}, geometryHash) {
  const bbox = projectBBox(compiledProject);
  const width = Math.max(
    1,
    finiteMetric(bbox.width || bbox.max_x - bbox.min_x, 10),
  );
  const height = Math.max(1, finiteMetric(projectHeight(compiledProject), 3.2));
  const views = ["section_AA", "section_BB"];
  const entities = [];
  const levels = toArray(compiledProject.levels).length
    ? toArray(compiledProject.levels)
    : [{ id: "level-0", elevation_m: 0, height_m: height }];

  views.forEach((viewId) => {
    levels.forEach((level, index) => {
      const y = finiteMetric(level.elevation_m, index * 3.2);
      entities.push(
        lineEntity({
          start: { x: 0, y },
          end: { x: width, y },
          layer: "S-SLAB",
          viewType: "section",
          viewId,
          geometryHash,
          sourceId: `${viewId}-${level.id || index}-slab`,
          levelId: level.id || `level-${index}`,
          metadata: { role: "section_slab" },
        }),
      );
    });
    const cutPolygon = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
    entities.push(
      polylineEntity({
        points: cutPolygon,
        layer: "A-WALL-EXT",
        viewType: "section",
        viewId,
        geometryHash,
        sourceId: `${viewId}-cut-envelope`,
        metadata: { role: "section_cut_envelope" },
      }),
    );
    entities.push(
      hatchEntity({
        boundary: cutPolygon,
        layer: "A-HATCH",
        pattern: "CONCRETE",
        viewType: "section",
        viewId,
        geometryHash,
        sourceId: `${viewId}-cut-hatch`,
        metadata: { role: "section_cut_hatch" },
      }),
    );
    entities.push(
      dimensionEntity({
        start: { x: width + 1, y: 0 },
        end: { x: width + 1, y: height },
        offset: { x: width + 2, y: 0 },
        text: dimensionText(height),
        viewType: "section",
        viewId,
        geometryHash,
        sourceId: `${viewId}-height`,
        metadata: { role: "section_height_dimension" },
      }),
    );
  });

  return entities;
}

function buildSiteEntities(compiledProject = {}, geometryHash) {
  const entities = [];
  const boundary = toArray(compiledProject.site?.boundary_polygon);
  const buildable = toArray(compiledProject.site?.buildable_polygon);
  if (hasUsablePolygon(boundary)) {
    entities.push(
      polylineEntity({
        points: boundary,
        layer: "A-SITE",
        viewType: "site_plan",
        viewId: "site_plan",
        geometryHash,
        sourceId: "site-boundary",
        metadata: { role: "site_boundary" },
      }),
    );
  }
  if (hasUsablePolygon(buildable)) {
    entities.push(
      polylineEntity({
        points: buildable,
        layer: "A-SITE",
        viewType: "site_plan",
        viewId: "site_plan",
        geometryHash,
        sourceId: "site-buildable-envelope",
        metadata: { role: "buildable_envelope" },
      }),
    );
  }
  return entities;
}

function buildStructuralPrimitiveEntities(compiledProject = {}, geometryHash) {
  const entities = [];
  toArray(compiledProject.foundations).forEach((foundation, index) => {
    if (hasUsablePolygon(foundation.polygon)) {
      entities.push(
        polylineEntity({
          points: foundation.polygon,
          layer: "S-FOUNDATION",
          viewType: "structural_plan",
          viewId: "foundation_plan",
          geometryHash,
          sourceId: foundation.id || `foundation-${index}`,
          levelId: levelIdOf(foundation),
          metadata: { role: "foundation_outline" },
        }),
      );
    }
  });
  toArray(compiledProject.roof_primitives).forEach((roof, index) => {
    if (hasUsablePolygon(roof.polygon)) {
      entities.push(
        polylineEntity({
          points: roof.polygon,
          layer: "S-ROOF",
          viewType: "structural_plan",
          viewId: "roof_framing_plan",
          geometryHash,
          sourceId: roof.id || `roof-${index}`,
          levelId: levelIdOf(roof),
          metadata: { role: "roof_primitive" },
        }),
      );
    }
  });
  return entities;
}

function defaultBlocks(geometryHash) {
  const block = (name, description, entities = []) => ({
    name,
    description,
    units: "meters",
    geometryHash,
    entities,
  });

  return [
    block("TITLE_BLOCK_A1", "A1 title block vector definition", [
      {
        type: "LWPOLYLINE",
        layer: "A-TITLE",
        geometry: {
          points: [
            { x: 0, y: 0 },
            { x: 180, y: 0 },
            { x: 180, y: 55 },
            { x: 0, y: 55 },
          ],
          closed: true,
        },
      },
    ]),
    block("DOOR_SINGLE", "Single door plan symbol", []),
    block("WINDOW_SYMBOL", "Window plan symbol", []),
    block("NORTH_ARROW", "North arrow symbol", [
      {
        type: "LINE",
        layer: "A-TITLE",
        geometry: { start: { x: 0, y: 0 }, end: { x: 0, y: 12 } },
      },
      {
        type: "LINE",
        layer: "A-TITLE",
        geometry: { start: { x: 0, y: 12 }, end: { x: -3, y: 2 } },
      },
      {
        type: "LINE",
        layer: "A-TITLE",
        geometry: { start: { x: 0, y: 12 }, end: { x: 3, y: 2 } },
      },
      {
        type: "TEXT",
        layer: "A-TITLE",
        geometry: { point: { x: -2, y: 14 }, height: 2.5, text: "N" },
      },
    ]),
    block("SECTION_MARKER", "Section cut marker symbol", [
      {
        type: "LINE",
        layer: "A-DIMS",
        geometry: { start: { x: -6, y: 0 }, end: { x: 6, y: 0 } },
      },
      {
        type: "TEXT",
        layer: "A-DIMS",
        geometry: { point: { x: -1.5, y: 2 }, height: 2.5, text: "A" },
      },
    ]),
    block("LEVEL_DATUM", "Level datum marker symbol", [
      {
        type: "LINE",
        layer: "A-DIMS",
        geometry: { start: { x: -8, y: 0 }, end: { x: 8, y: 0 } },
      },
      {
        type: "TEXT",
        layer: "A-DIMS",
        geometry: { point: { x: 9, y: -1 }, height: 2.5, text: "LVL" },
      },
    ]),
    block("SANITARY_WC", "Sanitary WC symbol", []),
    block("ELECTRICAL_LIGHT", "Electrical light symbol", []),
    block("ELECTRICAL_SOCKET", "Electrical socket symbol", []),
  ];
}

function sheetDateOf(compiledProject = {}) {
  return (
    compiledProject.metadata?.drawingDate ||
    compiledProject.metadata?.date ||
    compiledProject.drawingDate ||
    "undated"
  );
}

function authorOf(compiledProject = {}) {
  return (
    compiledProject.metadata?.author ||
    compiledProject.author ||
    "Architect AI Platform"
  );
}

function companyOf(compiledProject = {}) {
  return (
    compiledProject.metadata?.company ||
    compiledProject.company ||
    "Architect AI Platform"
  );
}

function buildSheetMetadata({
  compiledProject = {},
  projectName,
  geometryHash,
  sourceProjectGraphHash,
  jurisdiction,
  units,
  sheetNumber,
  title,
  scale,
  discipline = "architectural",
  paperSize = "A1",
  orientation = "landscape",
} = {}) {
  return {
    projectName,
    drawingNumber: sheetNumber,
    title,
    discipline,
    geometryHash,
    sourceProjectGraphHash,
    jurisdiction,
    units,
    revision: compiledProject.metadata?.revision || "P01",
    status: compiledProject.metadata?.status || "Preliminary",
    date: sheetDateOf(compiledProject),
    author: authorOf(compiledProject),
    company: companyOf(compiledProject),
    paperSize,
    orientation,
    scale,
  };
}

function cadHandle(...parts) {
  const hash = String(createStableHash(parts)).replace(/[^a-fA-F0-9]/g, "");
  return (hash.slice(0, 12) || "1").toUpperCase();
}

function scaleDenominator(scale = "1:100") {
  const [, denominator] = String(scale).split(":");
  const numeric = Number(denominator);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 100;
}

function buildPlotSettings({
  sheetId,
  paperSize = "A1",
  orientation = "landscape",
  scale = "1:100",
} = {}) {
  const paper = ISO_PAPER_SIZES_MM[paperSize] || ISO_PAPER_SIZES_MM.A1;
  return {
    plotSettingsId: createStableId(
      "cad-plot-settings",
      sheetId,
      paperSize,
      orientation,
      scale,
    ),
    plotConfigurationName: "DWG To PDF.pc3",
    canonicalMediaName: `ISO_full_bleed_${paperSize}_(${paper.width.toFixed(2)}_x_${paper.height.toFixed(2)}_MM)`,
    paperSize,
    paperSizeMm: paper,
    orientation,
    plotPaperUnits: "mm",
    plotRotation: orientation === "portrait" ? 1 : 0,
    standardScale: scale,
    customPrintScale: {
      numerator: 1,
      denominator: scaleDenominator(scale),
    },
    plotOrigin: { x: 0, y: 0 },
    plotWindowArea: {
      min: { x: 0, y: 0 },
      max: { x: paper.width, y: paper.height },
    },
    plotStyleTable: DEFAULT_PLOT_STYLE_METADATA.ctbFile,
    plotType: "layout",
    useStandardScale: true,
    shadePlotMode: "as_displayed",
  };
}

function nativeLayoutMetadata({
  sheetId,
  sheetNumber,
  paperSize,
  orientation,
  scale,
} = {}) {
  const layoutName = sheetId || sheetNumber || "Sheet";
  return {
    className: "AcDbLayout",
    layoutName,
    tabOrder: Number(String(sheetNumber || "").replace(/[^0-9]/g, "")) || 1,
    layoutHandle: cadHandle("layout", layoutName),
    blockRecordHandle: cadHandle("block-record", layoutName),
    ownerDictionaryHandle: cadHandle("layout-dictionary", "ACAD_LAYOUT"),
    paperSpaceBlockName: `*Paper_Space_${layoutName}`,
    plotSettings: buildPlotSettings({
      sheetId: layoutName,
      paperSize,
      orientation,
      scale,
    }),
  };
}

function createViewport({
  viewportId,
  viewId,
  viewType,
  scale,
  origin,
  size,
  geometryHash,
  sourceProjectGraphHash,
  modelSpaceUnits = "meters",
  paperUnits = "mm",
} = {}) {
  const normalizedOrigin = point2(origin);
  const normalizedSize = {
    width: finiteMetric(size?.width, 0),
    height: finiteMetric(size?.height, 0),
  };
  const center = {
    x: finiteMetric(normalizedOrigin.x + normalizedSize.width / 2),
    y: finiteMetric(normalizedOrigin.y + normalizedSize.height / 2),
  };
  return {
    viewportId,
    viewId,
    viewType,
    scale,
    origin: normalizedOrigin,
    size: normalizedSize,
    modelSpaceUnits,
    paperUnits,
    nativeViewport: {
      entityType: "VIEWPORT",
      className: "AcDbViewport",
      viewportHandle: cadHandle("viewport", viewportId, viewId, geometryHash),
      center,
      width: normalizedSize.width,
      height: normalizedSize.height,
      viewCenter: { x: 0, y: 0 },
      viewHeight: finiteMetric(
        normalizedSize.height / scaleDenominator(scale),
        1,
      ),
      status: "active",
      frozenLayers: [],
    },
    geometryHash,
    sourceProjectGraphHash,
  };
}

function createSheet({
  compiledProject = {},
  sheetId,
  sheetNumber,
  title,
  discipline = "architectural",
  scale = "1:100",
  paperSize = "A1",
  orientation = "landscape",
  titleBlock = "TITLE_BLOCK_A1",
  viewports = [],
  modelViews = [],
  projectName,
  geometryHash,
  sourceProjectGraphHash,
  jurisdiction,
  units,
} = {}) {
  const revision = compiledProject.metadata?.revision || "P01";
  const status = compiledProject.metadata?.status || "Preliminary";
  const layoutName = sheetId || sheetNumber || "Sheet";
  const nativeLayout = nativeLayoutMetadata({
    sheetId: layoutName,
    sheetNumber,
    paperSize,
    orientation,
    scale,
  });
  return {
    sheetId,
    sheetNumber,
    drawingNumber: sheetNumber,
    layoutName,
    title,
    discipline,
    paperSize,
    paperSizeMm: ISO_PAPER_SIZES_MM[paperSize] || ISO_PAPER_SIZES_MM.A1,
    orientation,
    scale,
    titleBlock,
    viewports,
    modelViews,
    plotSettings: nativeLayout.plotSettings,
    nativeLayout,
    drawingIndex: {
      sheetId,
      sheetNumber,
      title,
      scale,
      discipline,
      revision,
      status,
    },
    geometryHash,
    sourceProjectGraphHash,
    jurisdiction,
    revision,
    status,
    date: sheetDateOf(compiledProject),
    author: authorOf(compiledProject),
    company: companyOf(compiledProject),
    sheetMetadata: buildSheetMetadata({
      compiledProject,
      projectName,
      geometryHash,
      sourceProjectGraphHash,
      jurisdiction,
      units,
      sheetNumber,
      title,
      scale,
      discipline,
      paperSize,
      orientation,
    }),
  };
}

function buildPaperSpaceSheets({
  compiledProject = {},
  geometryHash,
  sourceProjectGraphHash,
  jurisdiction,
  units,
  projectName,
}) {
  const levels = toArray(compiledProject.levels).length
    ? toArray(compiledProject.levels)
    : [{ id: "level-0", level_number: 0, name: "Ground Floor" }];
  const sheets = [
    createSheet({
      compiledProject,
      sheetId: "A-000",
      sheetNumber: "A-000",
      title: "Cover Sheet / Drawing Index",
      discipline: "architectural",
      scale: "NTS",
      modelViews: [],
      viewports: [],
      projectName,
      geometryHash,
      sourceProjectGraphHash,
      jurisdiction,
      units,
    }),
    createSheet({
      compiledProject,
      sheetId: "A-100",
      sheetNumber: "A-100",
      title: "Site Plan",
      discipline: "architectural",
      scale: "1:500",
      modelViews: ["site_plan"],
      viewports: [
        createViewport({
          viewportId: "vp-site-plan",
          viewId: "site_plan",
          viewType: "site_plan",
          scale: "1:500",
          origin: { x: 30, y: 60 },
          size: { width: 520, height: 360 },
          geometryHash,
          sourceProjectGraphHash,
        }),
      ],
      projectName,
      geometryHash,
      sourceProjectGraphHash,
      jurisdiction,
      units,
    }),
  ];

  levels.forEach((level, index) => {
    const viewId = levelViewId(level, index);
    const number = 101 + index;
    sheets.push(
      createSheet({
        compiledProject,
        sheetId: `A-${number}`,
        sheetNumber: `A-${number}`,
        title: `${level.name || `Level ${index}`} Plan`,
        discipline: "architectural",
        scale: "1:100",
        modelViews: [viewId],
        viewports: [
          createViewport({
            viewportId: `vp-${viewId}`,
            viewId,
            viewType: "floor_plan",
            scale: "1:100",
            origin: { x: 30, y: 60 },
            size: { width: 520, height: 360 },
            geometryHash,
            sourceProjectGraphHash,
          }),
        ],
        projectName,
        geometryHash,
        sourceProjectGraphHash,
        jurisdiction,
        units,
      }),
    );
  });

  sheets.push(
    createSheet({
      compiledProject,
      sheetId: "A-200",
      sheetNumber: "A-200",
      title: "Elevations",
      discipline: "architectural",
      scale: "1:100",
      modelViews: ["north", "south", "east", "west"].map(
        (direction) => `elevation_${direction}`,
      ),
      viewports: ["north", "south", "east", "west"].map((direction, index) =>
        createViewport({
          viewportId: `vp-elevation-${direction}`,
          viewId: `elevation_${direction}`,
          viewType: "elevation",
          scale: "1:100",
          origin: {
            x: 30 + (index % 2) * 270,
            y: 60 + Math.floor(index / 2) * 180,
          },
          size: { width: 240, height: 150 },
          geometryHash,
          sourceProjectGraphHash,
        }),
      ),
      projectName,
      geometryHash,
      sourceProjectGraphHash,
      jurisdiction,
      units,
    }),
    createSheet({
      compiledProject,
      sheetId: "A-300",
      sheetNumber: "A-300",
      title: "Sections",
      discipline: "architectural",
      scale: "1:100",
      modelViews: ["section_AA", "section_BB"],
      viewports: ["section_AA", "section_BB"].map((viewId, index) =>
        createViewport({
          viewportId: `vp-${viewId}`,
          viewId,
          viewType: "section",
          scale: "1:100",
          origin: { x: 30, y: 60 + index * 180 },
          size: { width: 520, height: 150 },
          geometryHash,
          sourceProjectGraphHash,
        }),
      ),
      projectName,
      geometryHash,
      sourceProjectGraphHash,
      jurisdiction,
      units,
    }),
  );

  return sheets;
}

function buildDrawingScales() {
  return [
    { name: "site", ratio: "1:500", paperUnits: "mm", modelUnits: "m" },
    {
      name: "general_arrangement",
      ratio: "1:100",
      paperUnits: "mm",
      modelUnits: "m",
    },
    { name: "details", ratio: "1:20", paperUnits: "mm", modelUnits: "m" },
    { name: "large_details", ratio: "1:5", paperUnits: "mm", modelUnits: "m" },
  ];
}

export function buildCanonicalDrawingModelFromCompiledProject({
  compiledProject,
  projectName = null,
  jurisdiction = null,
  units = "meters",
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required to build CanonicalDrawingModel.",
    );
  }

  const geometryHash = compiledProject.geometryHash;
  const resolvedProjectName = projectName || projectNameOf(compiledProject);
  const resolvedJurisdiction = jurisdiction || jurisdictionOf(compiledProject);
  const sourceProjectGraphHash = sourceProjectGraphHashOf(compiledProject);
  const modelSpaceEntities = [
    ...buildSiteEntities(compiledProject, geometryHash),
    ...buildFloorPlanEntities(compiledProject, geometryHash),
    ...buildElevationEntities(compiledProject, geometryHash),
    ...buildSectionEntities(compiledProject, geometryHash),
    ...buildStructuralPrimitiveEntities(compiledProject, geometryHash),
  ];
  const sheets = buildPaperSpaceSheets({
    compiledProject,
    geometryHash,
    sourceProjectGraphHash,
    jurisdiction: resolvedJurisdiction,
    units,
    projectName: resolvedProjectName,
  });

  return {
    schema_version: CANONICAL_DRAWING_MODEL_VERSION,
    modelId: createStableId("canonical-drawing-model", geometryHash),
    source: "compiled_project",
    geometryHash,
    sourceProjectGraphHash,
    jurisdiction: resolvedJurisdiction,
    units,
    modelSpace: {
      units,
      entities: modelSpaceEntities,
      extents: projectBBox(compiledProject),
    },
    paperSpace: {
      defaultPaperSize: "A1",
      sheets,
      nativeLayouts: sheets.map((sheet) => sheet.nativeLayout),
    },
    plotStyleMetadata: clone(DEFAULT_PLOT_STYLE_METADATA),
    layers: clone(DEFAULT_CANONICAL_CAD_LAYERS),
    blocks: defaultBlocks(geometryHash),
    hatches: clone(DEFAULT_HATCHES),
    lineweights: clone(DEFAULT_LINEWEIGHTS),
    linetypes: clone(DEFAULT_LINE_TYPES),
    dimensionStyles: clone(DEFAULT_DIMENSION_STYLES),
    textStyles: clone(DEFAULT_TEXT_STYLES),
    titleBlocks: [
      {
        name: "TITLE_BLOCK_A1",
        paperSize: "A1",
        projectName: resolvedProjectName,
        fields: [
          "projectName",
          "drawingNumber",
          "title",
          "revision",
          "status",
          "scale",
          "date",
          "author",
          "company",
          "geometryHash",
          "sourceProjectGraphHash",
        ],
        geometryHash,
        sourceProjectGraphHash,
      },
    ],
    viewports: sheets.flatMap((sheet) =>
      toArray(sheet.viewports).map((viewport) => ({
        ...viewport,
        sheetId: sheet.sheetId,
      })),
    ),
    drawingScales: buildDrawingScales(),
    sheetMetadata: {
      projectName: resolvedProjectName,
      geometryHash,
      sourceProjectGraphHash,
      jurisdiction: resolvedJurisdiction,
      units,
      revision: "P01",
      status: "Preliminary",
      date: sheetDateOf(compiledProject),
      author: authorOf(compiledProject),
      company: companyOf(compiledProject),
    },
    metadata: {
      createdBy: "architect-ai-platform",
      createdAt: null,
      technicalDrawing: true,
      imageProviderUsed: "none",
      source: "compiled_project",
    },
  };
}

function validationError(code, message, details = {}) {
  return { code, message, details };
}

function entityUsesRaster(entity = {}) {
  const type = String(entity.type || "").toUpperCase();
  return (
    type === "IMAGE" ||
    type === "RASTER" ||
    Boolean(entity.rasterSource) ||
    Boolean(entity.imageSource) ||
    (entity.imageProviderUsed !== undefined &&
      entity.imageProviderUsed !== "none")
  );
}

export function validateCanonicalDrawingModel(model = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const dimensionPolicy = options.dimensionPolicy || "warn";

  if (model.schema_version !== CANONICAL_DRAWING_MODEL_VERSION) {
    errors.push(
      validationError(
        "CAD_MODEL_SCHEMA_VERSION_INVALID",
        `schema_version must be ${CANONICAL_DRAWING_MODEL_VERSION}.`,
      ),
    );
  }
  if (!model.geometryHash) {
    errors.push(
      validationError(
        "CAD_MODEL_GEOMETRY_HASH_MISSING",
        "CanonicalDrawingModel requires geometryHash.",
      ),
    );
  }
  if (!model.sourceProjectGraphHash) {
    errors.push(
      validationError(
        "CAD_MODEL_SOURCE_PROJECT_GRAPH_HASH_MISSING",
        "CanonicalDrawingModel requires sourceProjectGraphHash.",
      ),
    );
  }
  if (!model.units) {
    errors.push(
      validationError(
        "CAD_MODEL_UNITS_MISSING",
        "CanonicalDrawingModel requires units.",
      ),
    );
  }

  const entities = toArray(model.modelSpace?.entities);
  if (!entities.length) {
    errors.push(
      validationError(
        "CAD_MODEL_ENTITIES_MISSING",
        "CanonicalDrawingModel requires modelSpace.entities.",
      ),
    );
  }

  const sheets = toArray(model.paperSpace?.sheets);
  if (!sheets.length) {
    errors.push(
      validationError(
        "CAD_MODEL_PAPER_SPACE_MISSING",
        "CanonicalDrawingModel requires paperSpace.sheets.",
      ),
    );
  }
  if (!toArray(model.titleBlocks).length) {
    errors.push(
      validationError(
        "CAD_MODEL_TITLE_BLOCK_MISSING",
        "CanonicalDrawingModel requires at least one title block definition.",
      ),
    );
  }

  sheets.forEach((sheet, index) => {
    [
      "sheetId",
      "sheetNumber",
      "layoutName",
      "title",
      "paperSize",
      "orientation",
      "scale",
      "titleBlock",
      "plotSettings",
      "nativeLayout",
      "geometryHash",
      "sourceProjectGraphHash",
      "jurisdiction",
      "revision",
      "status",
      "date",
      "author",
      "company",
    ].forEach((field) => {
      if (!sheet?.[field]) {
        errors.push(
          validationError(
            "CAD_MODEL_SHEET_FIELD_MISSING",
            `paperSpace.sheets[${index}] is missing ${field}.`,
            { sheetIndex: index, field },
          ),
        );
      }
    });
    if (!Array.isArray(sheet.viewports)) {
      errors.push(
        validationError(
          "CAD_MODEL_SHEET_VIEWPORTS_MISSING",
          `paperSpace.sheets[${index}] must define viewports.`,
          { sheetIndex: index },
        ),
      );
    }
    const viewportDefinitions = toArray(sheet.viewports);
    const requiresNativeViewport =
      toArray(sheet.modelViews).length > 0 || viewportDefinitions.length > 0;
    if (
      requiresNativeViewport &&
      !viewportDefinitions.some(
        (viewport) => viewport.nativeViewport?.entityType === "VIEWPORT",
      )
    ) {
      errors.push(
        validationError(
          "CAD_MODEL_NATIVE_VIEWPORT_MISSING",
          `paperSpace.sheets[${index}] must define native VIEWPORT metadata.`,
          { sheetIndex: index },
        ),
      );
    }
    if (sheet.nativeLayout?.className !== "AcDbLayout") {
      errors.push(
        validationError(
          "CAD_MODEL_NATIVE_LAYOUT_MISSING",
          `paperSpace.sheets[${index}] must define an AcDbLayout native layout record.`,
          { sheetIndex: index },
        ),
      );
    }
    if (
      !sheet.plotSettings?.plotConfigurationName ||
      !sheet.plotSettings?.canonicalMediaName ||
      !sheet.plotSettings?.plotStyleTable
    ) {
      errors.push(
        validationError(
          "CAD_MODEL_PLOT_SETTINGS_MISSING",
          `paperSpace.sheets[${index}] must define plot/page setup metadata.`,
          { sheetIndex: index },
        ),
      );
    }
    if (sheet.geometryHash && sheet.geometryHash !== model.geometryHash) {
      errors.push(
        validationError(
          "CAD_MODEL_SHEET_GEOMETRY_HASH_MISMATCH",
          `paperSpace.sheets[${index}] does not share the model geometryHash.`,
          { sheetIndex: index, sheetGeometryHash: sheet.geometryHash },
        ),
      );
    }
  });

  const layerNames = new Set(toArray(model.layers).map((layer) => layer.name));
  REQUIRED_CANONICAL_CAD_LAYERS.forEach((layerName) => {
    if (!layerNames.has(layerName)) {
      errors.push(
        validationError(
          "CAD_MODEL_REQUIRED_LAYER_MISSING",
          `CanonicalDrawingModel is missing required layer ${layerName}.`,
          { layerName },
        ),
      );
    }
  });

  entities.forEach((entity, index) => {
    if (
      !CANONICAL_DRAWING_ENTITY_TYPES.includes(
        String(entity.type || "").toUpperCase(),
      )
    ) {
      errors.push(
        validationError(
          "CAD_MODEL_ENTITY_TYPE_INVALID",
          `modelSpace.entities[${index}] has unsupported CAD entity type.`,
          { type: entity.type },
        ),
      );
    }
    if (!layerNames.has(entity.layer)) {
      errors.push(
        validationError(
          "CAD_MODEL_ENTITY_LAYER_UNKNOWN",
          `modelSpace.entities[${index}] references unknown layer ${entity.layer}.`,
          { layer: entity.layer },
        ),
      );
    }
    if (entity.geometryHash !== model.geometryHash) {
      errors.push(
        validationError(
          "CAD_MODEL_ENTITY_GEOMETRY_HASH_MISMATCH",
          `modelSpace.entities[${index}] does not share the model geometryHash.`,
          {
            entityGeometryHash: entity.geometryHash,
            geometryHash: model.geometryHash,
          },
        ),
      );
    }
    if (entityUsesRaster(entity)) {
      errors.push(
        validationError(
          "CAD_MODEL_RASTER_TECHNICAL_ENTITY",
          `modelSpace.entities[${index}] is raster or image-provider backed.`,
          { type: entity.type, imageProviderUsed: entity.imageProviderUsed },
        ),
      );
    }
  });

  const entityTypes = new Set(
    entities.map((entity) => String(entity.type || "").toUpperCase()),
  );
  if (!entityTypes.has("DIMENSION")) {
    const issue = validationError(
      "CAD_MODEL_DIMENSIONS_MISSING",
      "CanonicalDrawingModel has no DIMENSION entities.",
    );
    if (dimensionPolicy === "error") {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  if (!model.plotStyleMetadata?.ctbFile && !model.plotStyleMetadata?.stbFile) {
    errors.push(
      validationError(
        "CAD_MODEL_PLOT_STYLE_METADATA_MISSING",
        "CanonicalDrawingModel requires CTB/STB plot style metadata.",
      ),
    );
  }

  const hasNativeLayouts =
    sheets.length > 0 &&
    sheets.every((sheet) => sheet.nativeLayout?.className === "AcDbLayout");
  const hasNativeViewports = sheets.some((sheet) =>
    toArray(sheet.viewports).some(
      (viewport) => viewport.nativeViewport?.entityType === "VIEWPORT",
    ),
  );
  const hasPlotSettings =
    sheets.length > 0 &&
    sheets.every(
      (sheet) =>
        sheet.plotSettings?.plotConfigurationName &&
        sheet.plotSettings?.canonicalMediaName &&
        sheet.plotSettings?.plotStyleTable,
    );
  const hasPlotStyleMetadata = Boolean(
    model.plotStyleMetadata?.ctbFile || model.plotStyleMetadata?.stbFile,
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks: {
      entityCount: entities.length,
      sheetCount: sheets.length,
      layerCount: layerNames.size,
      entityTypes: [...entityTypes].sort(),
      hasGeometryHash: Boolean(model.geometryHash),
      hasSourceProjectGraphHash: Boolean(model.sourceProjectGraphHash),
      imageProviderUsed: "none",
      hasTitleBlock: toArray(model.titleBlocks).length > 0,
      hasPaperSpace: sheets.length > 0,
      hasDimensions: entityTypes.has("DIMENSION"),
      hasNativeLayouts,
      hasNativeViewports,
      hasPlotSettings,
      hasPlotStyleMetadata,
    },
  };
}

export function summarizeCanonicalDrawingModel(model = {}) {
  const entities = toArray(model.modelSpace?.entities);
  const byViewType = entities.reduce((acc, entity) => {
    const key = entity.viewType || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    schema_version: model.schema_version || null,
    geometryHash: model.geometryHash || null,
    sourceProjectGraphHash: model.sourceProjectGraphHash || null,
    units: model.units || null,
    jurisdiction: model.jurisdiction || null,
    entityCount: entities.length,
    sheetCount: toArray(model.paperSpace?.sheets).length,
    layerCount: toArray(model.layers).length,
    byViewType,
  };
}

export default {
  CANONICAL_DRAWING_MODEL_VERSION,
  CANONICAL_DRAWING_ENTITY_TYPES,
  DEFAULT_CANONICAL_CAD_LAYERS,
  REQUIRED_CANONICAL_CAD_LAYERS,
  buildCanonicalDrawingModelFromCompiledProject,
  validateCanonicalDrawingModel,
  summarizeCanonicalDrawingModel,
};
