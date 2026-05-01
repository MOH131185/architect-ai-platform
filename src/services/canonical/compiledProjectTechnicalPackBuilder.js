import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import {
  WORKING_HEIGHT,
  WORKING_WIDTH,
  resolveLayout as resolveComposeLayout,
  toPixelRect,
} from "../a1/composeCore.js";
import { COMPILED_PROJECT_SCHEMA_VERSION } from "../compiler/compiledProjectCompiler.js";
import { renderPlanSvg } from "../drawing/svgPlanRenderer.js";
import { renderElevationSvg } from "../drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../drawing/svgSectionRenderer.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";

export const TECHNICAL_FLOOR_PANEL_TYPES = [
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "floor_plan_level3",
  "floor_plan_level4",
  "floor_plan_level5",
  "floor_plan_level6",
  "floor_plan_level7",
];

export function technicalFloorPanelType(levelIndex) {
  if (levelIndex === 0) return "floor_plan_ground";
  if (levelIndex === 1) return "floor_plan_first";
  return `floor_plan_level${levelIndex}`;
}

export const TECHNICAL_ELEVATION_PANELS = {
  north: "elevation_north",
  south: "elevation_south",
  east: "elevation_east",
  west: "elevation_west",
};

export const TECHNICAL_SECTION_PANELS = {
  longitudinal: "section_AA",
  transverse: "section_BB",
};

export const TECHNICAL_CANONICAL_PANEL_TYPES = [
  ...TECHNICAL_FLOOR_PANEL_TYPES,
  ...Object.values(TECHNICAL_ELEVATION_PANELS),
  ...Object.values(TECHNICAL_SECTION_PANELS),
];

const TECHNICAL_RENDER_SCALE_FACTOR = 1.4;
const SVG_NUMBER_PATTERN = /[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi;

function roundEven(value, minimum = 0) {
  const numeric = Math.max(minimum, Math.round(Number(value) || 0));
  return numeric % 2 === 0 ? numeric : numeric + 1;
}

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getTechnicalPanelRenderSize(
  panelType,
  floorCount = 1,
  layoutTemplate = "board-v2",
) {
  const { layout } = resolveComposeLayout({
    layoutTemplate,
    floorCount,
  });
  const slot = layout?.[panelType];

  if (!slot) {
    return { width: 1200, height: 760 };
  }

  const slotRect = toPixelRect(slot, WORKING_WIDTH, WORKING_HEIGHT);
  const isPlan = panelType.startsWith("floor_plan_");
  const isSection = panelType.startsWith("section_");
  const minWidth = isPlan ? 760 : isSection ? 720 : 560;
  const minHeight = isPlan ? 420 : isSection ? 400 : 320;

  // Render the SVG at the slot's actual aspect ratio. If either dimension
  // would fall below its readability minimum, scale BOTH dimensions up by
  // the same factor so the aspect ratio (and the downstream fit:"contain"
  // placement) still fills the A1 panel slot completely.
  const targetWidth = slotRect.width * TECHNICAL_RENDER_SCALE_FACTOR;
  const targetHeight = slotRect.height * TECHNICAL_RENDER_SCALE_FACTOR;
  const widthDeficit = targetWidth > 0 ? minWidth / targetWidth : 1;
  const heightDeficit = targetHeight > 0 ? minHeight / targetHeight : 1;
  const upscale = Math.max(1, widthDeficit, heightDeficit);

  return {
    width: roundEven(targetWidth * upscale, 0),
    height: roundEven(targetHeight * upscale, 0),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function looksLikeCompiledProject(candidate) {
  if (!isPlainObject(candidate)) return false;
  return Boolean(
    candidate.schema_version ||
    Array.isArray(candidate.levels) ||
    Array.isArray(candidate.rooms) ||
    Array.isArray(candidate.walls) ||
    Array.isArray(candidate.footprints) ||
    Array.isArray(candidate.doors) ||
    Array.isArray(candidate.windows) ||
    isPlainObject(candidate.site),
  );
}

function normalizeSchemaVersion(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function hasCompiledProjectAuthorityMarkers(candidate) {
  if (!isPlainObject(candidate)) {
    return false;
  }

  return Boolean(
    candidate.metadata?.compiler === "compiledProjectCompiler" ||
    candidate.metadata?.canonical_geometry_schema ||
    candidate.geometryHash ||
    isPlainObject(candidate.envelope) ||
    isPlainObject(candidate.facades) ||
    isPlainObject(candidate.sectionCuts) ||
    Array.isArray(candidate.openings),
  );
}

function isCompiledProjectSchema(candidate) {
  if (!looksLikeCompiledProject(candidate)) {
    return false;
  }
  const schemaVersion = normalizeSchemaVersion(candidate?.schema_version);
  if (schemaVersion?.startsWith("canonical-project-geometry")) {
    return false;
  }
  if (
    schemaVersion === COMPILED_PROJECT_SCHEMA_VERSION ||
    schemaVersion?.startsWith("compiled-project")
  ) {
    return true;
  }

  if (candidate?.metadata?.source !== "compiled_project") {
    return false;
  }

  return hasCompiledProjectAuthorityMarkers(candidate);
}

export function isCompiledProjectAuthoritySource(candidate) {
  return isCompiledProjectSchema(candidate);
}

export function resolveCompiledProjectSource(input = {}) {
  const candidates = [
    input?.compiledProject,
    input?.compiled_project,
    input?.projectGeometry,
    input?.geometry,
    input?.compiled?.project,
    input?.metadata?.projectGeometry,
    input?.metadata?.geometry,
    input,
  ];

  for (const candidate of candidates) {
    if (isCompiledProjectAuthoritySource(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeLevelAssignment(value, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : fallback;
}

function openingFamily(opening = {}) {
  const normalized = String(
    opening.type || opening.kind || opening.family || "",
  )
    .trim()
    .toLowerCase();

  if (normalized === "door" || normalized === "window") {
    return normalized;
  }
  return "window";
}

function buildRoofPrimitivesFromCompiledProject(compiledProject = {}) {
  const roof = compiledProject.roof || {};
  const collections = [
    {
      primitiveFamily: "roof_plane",
      entries: Array.isArray(roof.planes) ? roof.planes : [],
    },
    {
      primitiveFamily: "ridge",
      entries: Array.isArray(roof.ridges) ? roof.ridges : [],
    },
    {
      primitiveFamily: "eave",
      entries: Array.isArray(roof.eaves) ? roof.eaves : [],
    },
    {
      primitiveFamily: "hip",
      entries: Array.isArray(roof.hips) ? roof.hips : [],
    },
    {
      primitiveFamily: "valley",
      entries: Array.isArray(roof.valleys) ? roof.valleys : [],
    },
    {
      primitiveFamily: "parapet",
      entries: Array.isArray(roof.parapets) ? roof.parapets : [],
    },
    {
      primitiveFamily: "dormer",
      entries: Array.isArray(roof.dormers) ? roof.dormers : [],
    },
  ];

  return collections
    .flatMap(({ primitiveFamily, entries }) =>
      entries.map((entry, index) => ({
        id: entry.id || `${primitiveFamily}-${index + 1}`,
        primitive_family: primitiveFamily,
        level_id: entry.levelId || entry.level_id || null,
        polygon: cloneData(entry.polygon || entry.footprint || []),
        start: cloneData(entry.start || null),
        end: cloneData(entry.end || null),
        side: entry.side || null,
        slope_deg: entry.slope_deg || entry.slopeDeg || null,
        eave_depth_m: entry.eave_depth_m || entry.eaveDepthM || null,
        ridge_height_m: entry.ridge_height_m || entry.ridgeHeightM || null,
        width_m: entry.width_m || entry.width || null,
        depth_m: entry.depth_m || entry.depth || null,
        metadata: {
          source: "compiled_project",
        },
      })),
    )
    .filter((entry) => {
      const hasLine = entry.start && entry.end;
      const hasPolygon =
        Array.isArray(entry.polygon) && entry.polygon.length >= 3;
      return hasLine || hasPolygon;
    });
}

function adaptCompiledProjectToCanonicalGeometry(
  compiledProject = {},
  styleDNA = {},
) {
  const levels = Array.isArray(compiledProject.levels)
    ? compiledProject.levels
    : [];
  const openings = Array.isArray(compiledProject.openings)
    ? compiledProject.openings
    : [];
  const roof = compiledProject.roof || {};

  return {
    project_id:
      compiledProject.metadata?.project_id ||
      compiledProject.projectId ||
      compiledProject.project_id ||
      compiledProject.compiledProjectId ||
      "compiled-project",
    site: cloneData(compiledProject.site || {}),
    metadata: {
      source: "compiled_project",
      style_dna: cloneData(styleDNA || {}),
      geometry_hash: compiledProject.geometryHash || null,
    },
    levels: levels.map((level) => ({
      id: level.id,
      name: level.name,
      level_number: level.level_number,
      elevation_m: level.elevation_m ?? level.bottom_m ?? 0,
      height_m: level.height_m || null,
      footprint: cloneData(level.footprint?.polygon || level.footprint || []),
    })),
    rooms: (Array.isArray(compiledProject.rooms)
      ? compiledProject.rooms
      : []
    ).map((room) => ({
      id: room.id || room.sourceId,
      level_id: normalizeLevelAssignment(room.levelId || room.level_id),
      name: room.name,
      type: room.type || room.programType || room.zone || null,
      polygon: cloneData(room.polygon || []),
      bbox: cloneData(room.bbox || null),
      actual_area: room.area_m2 || room.actual_area || null,
      metadata: cloneData(room.metadata || {}),
    })),
    walls: (Array.isArray(compiledProject.walls)
      ? compiledProject.walls
      : []
    ).map((wall) => ({
      id: wall.id || wall.sourceId,
      level_id: normalizeLevelAssignment(wall.levelId || wall.level_id),
      kind: wall.kind || null,
      exterior: wall.exterior === true,
      side: wall.side || wall.facade || wall.metadata?.side || null,
      orientation:
        wall.orientation || wall.metadata?.orientation || wall.side || null,
      start: cloneData(wall.start || wall.points?.[0] || null),
      end: cloneData(wall.end || wall.points?.[1] || null),
      polygon: cloneData(wall.polygon || []),
      bbox: cloneData(wall.bbox || null),
      thickness_m: wall.thickness_m || wall.thickness || null,
      room_ids: cloneData(wall.roomIds || wall.room_ids || []),
      metadata: {
        ...(cloneData(wall.metadata || {}) || {}),
        side: wall.side || wall.facade || wall.metadata?.side || null,
      },
    })),
    doors: openings
      .filter((opening) => openingFamily(opening) === "door")
      .map((opening) => ({
        id: opening.id || opening.sourceId,
        level_id: normalizeLevelAssignment(opening.levelId || opening.level_id),
        wall_id: opening.wallId || opening.wall_id || null,
        position_m: cloneData(opening.position_m || opening.position || null),
        width_m: opening.width_m || opening.width || null,
        sill_height_m: opening.sill_height_m || opening.sillHeightM || 0,
        head_height_m: opening.head_height_m || opening.headHeightM || 2.2,
        room_ids: cloneData(opening.roomIds || opening.room_ids || []),
        swing: opening.swing || opening.metadata?.swing || null,
        bbox: cloneData(opening.bbox || null),
        metadata: cloneData(opening.metadata || {}),
      })),
    windows: openings
      .filter((opening) => openingFamily(opening) === "window")
      .map((opening) => ({
        id: opening.id || opening.sourceId,
        level_id: normalizeLevelAssignment(opening.levelId || opening.level_id),
        wall_id: opening.wallId || opening.wall_id || null,
        position_m: cloneData(opening.position_m || opening.position || null),
        width_m: opening.width_m || opening.width || null,
        sill_height_m: opening.sill_height_m || opening.sillHeightM || 0.9,
        head_height_m: opening.head_height_m || opening.headHeightM || 2.1,
        room_ids: cloneData(opening.roomIds || opening.room_ids || []),
        bbox: cloneData(opening.bbox || null),
        metadata: cloneData(opening.metadata || {}),
      })),
    stairs: (Array.isArray(compiledProject.stairs)
      ? compiledProject.stairs
      : []
    ).map((stair) => ({
      id: stair.id || stair.sourceId,
      level_id: normalizeLevelAssignment(stair.levelId || stair.level_id),
      type: stair.type || null,
      polygon: cloneData(stair.polygon || []),
      bbox: cloneData(stair.bbox || null),
      width_m: stair.width_m || stair.width || null,
      run_length_m: stair.run_length_m || stair.runLengthM || null,
      metadata: cloneData(stair.metadata || {}),
    })),
    slabs: (Array.isArray(compiledProject.slabs)
      ? compiledProject.slabs
      : []
    ).map((slab) => ({
      id: slab.id || slab.sourceId,
      level_id: normalizeLevelAssignment(slab.levelId || slab.level_id),
      polygon: cloneData(slab.polygon || slab.footprint?.polygon || []),
      bbox: cloneData(slab.bbox || slab.footprint?.bbox || null),
      thickness_m: slab.thickness_m || slab.thickness || null,
      metadata: cloneData(slab.metadata || {}),
    })),
    roof: {
      id: roof.id || "roof-main",
      type: roof.type || "pitched",
      polygon: cloneData(
        roof.polygon ||
          levels[0]?.footprint?.polygon ||
          compiledProject.footprint?.polygon ||
          [],
      ),
      bbox: cloneData(
        roof.bbox ||
          levels[0]?.footprint?.bbox ||
          compiledProject.footprint?.bbox ||
          null,
      ),
    },
    roof_primitives: buildRoofPrimitivesFromCompiledProject(compiledProject),
  };
}

function resolveStyleDNA(input = {}) {
  return (
    input?.styleDNA ||
    input?.style ||
    input?.metadata?.styleDNA ||
    input?.metadata?.style_dna ||
    {}
  );
}

function normalizeRendererFailure(panelType, result, fallbackMessage) {
  const blockingReasons = Array.isArray(result?.blocking_reasons)
    ? result.blocking_reasons.filter(Boolean)
    : [];
  const warnings = Array.isArray(result?.warnings)
    ? result.warnings.filter(Boolean)
    : [];
  const issues = [...new Set([...blockingReasons, ...warnings])];

  return {
    panelType,
    message: issues[0] || fallbackMessage,
    details: issues,
    status: result?.status || "blocked",
  };
}

function parseSvgAttributes(attributeString = "") {
  const attributes = {};
  String(attributeString || "").replace(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g,
    (_match, key, _quote, value) => {
      attributes[key] = value;
      return _match;
    },
  );
  return attributes;
}

function numberAttr(attributes = {}, key, fallback = 0) {
  const numeric = Number(attributes[key]);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function mergePixelBounds(bounds, candidate) {
  if (!candidate) {
    return bounds;
  }
  const minX = Number(candidate.minX);
  const minY = Number(candidate.minY);
  const maxX = Number(candidate.maxX);
  const maxY = Number(candidate.maxY);
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    maxX <= minX ||
    maxY <= minY
  ) {
    return bounds;
  }
  if (!bounds) {
    return { minX, minY, maxX, maxY };
  }
  return {
    minX: Math.min(bounds.minX, minX),
    minY: Math.min(bounds.minY, minY),
    maxX: Math.max(bounds.maxX, maxX),
    maxY: Math.max(bounds.maxY, maxY),
  };
}

function boundsFromNumberPairs(values = []) {
  const points = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    const x = Number(values[index]);
    const y = Number(values[index + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }
  if (!points.length) {
    return null;
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function extractSvgRootSize(
  svgString = "",
  fallbackWidth = 0,
  fallbackHeight = 0,
) {
  const viewBoxMatch = String(svgString).match(/viewBox\s*=\s*(["'])(.*?)\1/i);
  if (viewBoxMatch?.[2]) {
    const values = viewBoxMatch[2]
      .match(SVG_NUMBER_PATTERN)
      ?.map((value) => Number(value));
    if (values?.length >= 4 && values[2] > 0 && values[3] > 0) {
      return {
        x: values[0],
        y: values[1],
        width: values[2],
        height: values[3],
        viewBox: values.slice(0, 4),
      };
    }
  }

  const widthMatch = String(svgString).match(/\bwidth\s*=\s*(["'])(.*?)\1/i);
  const heightMatch = String(svgString).match(/\bheight\s*=\s*(["'])(.*?)\1/i);
  const widthValue = Number(
    String(widthMatch?.[2] || "").replace(/[^\d.-]/g, ""),
  );
  const heightValue = Number(
    String(heightMatch?.[2] || "").replace(/[^\d.-]/g, ""),
  );
  return {
    x: 0,
    y: 0,
    width:
      Number.isFinite(widthValue) && widthValue > 0
        ? widthValue
        : fallbackWidth,
    height:
      Number.isFinite(heightValue) && heightValue > 0
        ? heightValue
        : fallbackHeight,
    viewBox: null,
  };
}

function looksLikeRootBackgroundRect(attributes = {}, root = {}) {
  const x = numberAttr(attributes, "x", 0);
  const y = numberAttr(attributes, "y", 0);
  const width = numberAttr(attributes, "width", 0);
  const height = numberAttr(attributes, "height", 0);
  return (
    Math.abs(x - Number(root.x || 0)) <= 0.5 &&
    Math.abs(y - Number(root.y || 0)) <= 0.5 &&
    width >= Number(root.width || 0) * 0.95 &&
    height >= Number(root.height || 0) * 0.95
  );
}

function analyseTechnicalSvgContentFrame(
  svgString = "",
  width = 0,
  height = 0,
) {
  const root = extractSvgRootSize(svgString, width, height);
  const rootWidth = Number(root.width || width || 0);
  const rootHeight = Number(root.height || height || 0);
  if (!(rootWidth > 0 && rootHeight > 0)) {
    return null;
  }

  const body = String(svgString || "")
    .replace(/<defs\b[\s\S]*?<\/defs>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  let bounds = null;

  body.replace(/<rect\b([^>]*)>/gi, (match, attrs) => {
    const attributes = parseSvgAttributes(attrs);
    if (looksLikeRootBackgroundRect(attributes, root)) {
      return match;
    }
    const x = numberAttr(attributes, "x", 0);
    const y = numberAttr(attributes, "y", 0);
    const rectWidth = numberAttr(attributes, "width", 0);
    const rectHeight = numberAttr(attributes, "height", 0);
    bounds = mergePixelBounds(bounds, {
      minX: x,
      minY: y,
      maxX: x + rectWidth,
      maxY: y + rectHeight,
    });
    return match;
  });

  body.replace(/<line\b([^>]*)>/gi, (match, attrs) => {
    const attributes = parseSvgAttributes(attrs);
    bounds = mergePixelBounds(bounds, {
      minX: Math.min(
        numberAttr(attributes, "x1", 0),
        numberAttr(attributes, "x2", 0),
      ),
      minY: Math.min(
        numberAttr(attributes, "y1", 0),
        numberAttr(attributes, "y2", 0),
      ),
      maxX: Math.max(
        numberAttr(attributes, "x1", 0),
        numberAttr(attributes, "x2", 0),
      ),
      maxY: Math.max(
        numberAttr(attributes, "y1", 0),
        numberAttr(attributes, "y2", 0),
      ),
    });
    return match;
  });

  body.replace(/<(?:polygon|polyline)\b([^>]*)>/gi, (match, attrs) => {
    const attributes = parseSvgAttributes(attrs);
    const values = String(attributes.points || "")
      .match(SVG_NUMBER_PATTERN)
      ?.map((value) => Number(value));
    bounds = mergePixelBounds(bounds, boundsFromNumberPairs(values || []));
    return match;
  });

  body.replace(/<(?:circle|ellipse)\b([^>]*)>/gi, (match, attrs) => {
    const attributes = parseSvgAttributes(attrs);
    const cx = numberAttr(attributes, "cx", 0);
    const cy = numberAttr(attributes, "cy", 0);
    const rx = numberAttr(attributes, "rx", numberAttr(attributes, "r", 0));
    const ry = numberAttr(attributes, "ry", numberAttr(attributes, "r", 0));
    bounds = mergePixelBounds(bounds, {
      minX: cx - rx,
      minY: cy - ry,
      maxX: cx + rx,
      maxY: cy + ry,
    });
    return match;
  });

  body.replace(/<path\b([^>]*)>/gi, (match, attrs) => {
    const attributes = parseSvgAttributes(attrs);
    const pathData = String(attributes.d || "").trim();
    if (
      !pathData ||
      pathData.includes("undefined") ||
      pathData.includes("NaN")
    ) {
      return match;
    }
    const values = pathData
      .match(SVG_NUMBER_PATTERN)
      ?.map((value) => Number(value));
    bounds = mergePixelBounds(bounds, boundsFromNumberPairs(values || []));
    return match;
  });

  if (!bounds) {
    return null;
  }

  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  if (!(contentWidth > 0 && contentHeight > 0)) {
    return null;
  }

  const padX = clamp(contentWidth * 0.06, 10, rootWidth * 0.08);
  const padY = clamp(contentHeight * 0.08, 8, rootHeight * 0.1);
  const normalized = {
    x: bounds.minX - padX,
    y: bounds.minY - padY,
    width: contentWidth + padX * 2,
    height: contentHeight + padY * 2,
  };
  const normalizedViewBox = [
    roundMetric(normalized.x, 2),
    roundMetric(normalized.y, 2),
    roundMetric(normalized.width, 2),
    roundMetric(normalized.height, 2),
  ].join(" ");
  const contentBounds = {
    x: roundMetric(bounds.minX, 2),
    y: roundMetric(bounds.minY, 2),
    width: roundMetric(contentWidth, 2),
    height: roundMetric(contentHeight, 2),
    widthRatio: roundMetric(contentWidth / rootWidth, 4),
    heightRatio: roundMetric(contentHeight / rootHeight, 4),
    occupancyRatio: roundMetric(
      (contentWidth * contentHeight) / (rootWidth * rootHeight),
      4,
    ),
  };

  return {
    contentBounds,
    normalizedViewBox,
    originalViewBox: root.viewBox
      ? root.viewBox.map((value) => roundMetric(value, 2)).join(" ")
      : `0 0 ${roundMetric(rootWidth, 2)} ${roundMetric(rootHeight, 2)}`,
    normalization: {
      mode: "content_bounds_padded",
      source: "svg_shape_bounds",
      paddingX: roundMetric(padX, 2),
      paddingY: roundMetric(padY, 2),
      tightViewBoxAreaRatio: roundMetric(
        (normalized.width * normalized.height) / (rootWidth * rootHeight),
        4,
      ),
    },
  };
}

function buildPanelRecord(panelType, rendererResult, width, height) {
  const svgString = rendererResult?.svg;
  if (typeof svgString !== "string" || !svgString.trim()) {
    return {
      ok: false,
      failure: normalizeRendererFailure(
        panelType,
        rendererResult,
        `${panelType} could not be rendered from compiled project geometry.`,
      ),
    };
  }

  const contentFrame = analyseTechnicalSvgContentFrame(
    svgString,
    width,
    height,
  );
  const technicalQualityMetadata = {
    ...(rendererResult?.technical_quality_metadata || {}),
    ...(contentFrame
      ? {
          contentBounds: contentFrame.contentBounds,
          normalizedViewBox: contentFrame.normalizedViewBox,
          originalViewBox: contentFrame.originalViewBox,
          viewBoxNormalization: contentFrame.normalization,
        }
      : {}),
  };

  return {
    ok: true,
    panel: {
      dataUrl: null,
      svgString,
      svgHash: computeCDSHashSync({ svg: svgString }),
      width,
      height,
      title: rendererResult?.title || panelType,
      status: rendererResult?.status || "ready",
      contentBounds: contentFrame?.contentBounds || null,
      normalizedViewBox: contentFrame?.normalizedViewBox || null,
      viewBoxNormalization: contentFrame?.normalization || null,
      technicalQualityMetadata,
      renderer: rendererResult?.renderer || null,
      drawingType: technicalQualityMetadata?.drawing_type || null,
    },
  };
}

function resolveSectionProfile(
  compiledProject = {},
  sectionType = "longitudinal",
) {
  const sectionCuts = compiledProject.sectionCuts || {};
  const candidates = Array.isArray(sectionCuts.candidates)
    ? sectionCuts.candidates
    : [];
  const preferredId = sectionCuts.byType?.[sectionType] || null;

  if (preferredId) {
    const match = candidates.find((candidate) => candidate.id === preferredId);
    if (match) {
      return cloneData(match);
    }
  }

  const typedMatch = candidates.find(
    (candidate) => candidate.sectionType === sectionType,
  );
  return typedMatch ? cloneData(typedMatch) : { sectionType };
}

export function buildCompiledProjectTechnicalPanels(source = {}, options = {}) {
  const compiledProjectSource = resolveCompiledProjectSource(source);
  if (!compiledProjectSource) {
    return {
      ok: false,
      failures: [
        {
          panelType: "compiled_project",
          status: "missing",
          message:
            "No real compiled project geometry was available to build the canonical technical pack.",
          details: [],
        },
      ],
    };
  }

  const styleDNA = resolveStyleDNA(source);
  const canonicalSource = isCompiledProjectSchema(compiledProjectSource)
    ? adaptCompiledProjectToCanonicalGeometry(compiledProjectSource, styleDNA)
    : compiledProjectSource;
  const compiledProject = coerceToCanonicalProjectGeometry(canonicalSource);
  const technicalPanels = {};
  const technicalPanelTypes = [];
  const failures = [];
  const customRenderWidth = Number(options.width);
  const customPlanHeight = Number(options.planHeight || options.height);
  const customElevationHeight = Number(
    options.elevationHeight || options.height,
  );
  const customSectionHeight = Number(options.sectionHeight || options.height);
  // Default to board-v2 so non-residential / unspecified callers retain
  // existing behaviour. Residential/presentation-v3 callers pass it
  // explicitly so floor plans and sections render at slot aspect.
  const layoutTemplate =
    typeof options.layoutTemplate === "string" && options.layoutTemplate
      ? options.layoutTemplate
      : "board-v2";

  const levels = Array.isArray(compiledProject.levels)
    ? compiledProject.levels
    : [];
  const floorCount = Math.max(1, levels.length || 1);

  levels.forEach((level, index) => {
    const panelType = technicalFloorPanelType(index);
    const slotRenderSize = getTechnicalPanelRenderSize(
      panelType,
      floorCount,
      layoutTemplate,
    );
    const renderSize = {
      width:
        Number.isFinite(customRenderWidth) && customRenderWidth > 0
          ? customRenderWidth
          : slotRenderSize.width,
      height:
        Number.isFinite(customPlanHeight) && customPlanHeight > 0
          ? customPlanHeight
          : slotRenderSize.height,
    };
    const result = renderPlanSvg(compiledProject, {
      width: renderSize.width,
      height: renderSize.height,
      levelId: level.id,
      showDimensions: true,
      showRoomLabels: true,
      sheetMode: true,
    });
    const normalized = buildPanelRecord(
      panelType,
      result,
      renderSize.width,
      renderSize.height,
    );
    if (!normalized.ok) {
      failures.push(normalized.failure);
      return;
    }
    technicalPanels[panelType] = normalized.panel;
    technicalPanelTypes.push(panelType);
  });

  Object.entries(TECHNICAL_ELEVATION_PANELS).forEach(
    ([orientation, panelType]) => {
      const slotRenderSize = getTechnicalPanelRenderSize(
        panelType,
        floorCount,
        layoutTemplate,
      );
      const renderSize = {
        width:
          Number.isFinite(customRenderWidth) && customRenderWidth > 0
            ? customRenderWidth
            : slotRenderSize.width,
        height:
          Number.isFinite(customElevationHeight) && customElevationHeight > 0
            ? customElevationHeight
            : slotRenderSize.height,
      };
      const result = renderElevationSvg(compiledProject, styleDNA, {
        width: renderSize.width,
        height: renderSize.height,
        orientation,
        sheetMode: true,
        allowWeakFacadeFallback: true,
      });
      const normalized = buildPanelRecord(
        panelType,
        result,
        renderSize.width,
        renderSize.height,
      );
      if (!normalized.ok) {
        failures.push(normalized.failure);
        return;
      }
      technicalPanels[panelType] = normalized.panel;
      technicalPanelTypes.push(panelType);
    },
  );

  Object.entries(TECHNICAL_SECTION_PANELS).forEach(
    ([sectionType, panelType]) => {
      const slotRenderSize = getTechnicalPanelRenderSize(
        panelType,
        floorCount,
        layoutTemplate,
      );
      const renderSize = {
        width:
          Number.isFinite(customRenderWidth) && customRenderWidth > 0
            ? customRenderWidth
            : slotRenderSize.width,
        height:
          Number.isFinite(customSectionHeight) && customSectionHeight > 0
            ? customSectionHeight
            : slotRenderSize.height,
      };
      const sectionProfile = resolveSectionProfile(
        compiledProjectSource,
        sectionType,
      );
      const result = renderSectionSvg(compiledProject, styleDNA, {
        width: renderSize.width,
        height: renderSize.height,
        sectionType,
        sectionProfile,
        sheetMode: true,
      });
      const normalized = buildPanelRecord(
        panelType,
        result,
        renderSize.width,
        renderSize.height,
      );
      if (!normalized.ok) {
        failures.push(normalized.failure);
        return;
      }
      technicalPanels[panelType] = normalized.panel;
      technicalPanelTypes.push(panelType);
    },
  );

  return {
    ok: failures.length === 0,
    compiledProjectSource,
    compiledProjectSchemaVersion:
      normalizeSchemaVersion(compiledProjectSource?.schema_version) || null,
    compiledProject,
    projectGeometry: compiledProject,
    styleDNA,
    technicalPanels,
    technicalPanelTypes,
    failures,
  };
}
