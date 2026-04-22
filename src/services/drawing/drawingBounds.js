import { buildBoundingBoxFromPolygon } from "../cad/projectGeometrySchema.js";

const DEFAULT_BOUNDS = {
  min_x: 0,
  min_y: 0,
  max_x: 12,
  max_y: 10,
  width: 12,
  height: 10,
};

const BLUEPRINT_THEME = Object.freeze({
  name: "blueprint-monochrome",
  paper: "#ffffff",
  line: "#111111",
  lineMuted: "#3f4752",
  lineLight: "#59616d",
  guide: "#7f8a98",
  poche: "#151515",
  pocheSoft: "#2b3138",
  fillSoft: "#f5f6f7",
  hatch: "#c4c9cf",
  openFill: "#ffffff",
});

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function looksLikeGeometry(candidate = null) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  return Boolean(
    candidate.schema_version ||
    candidate.project_id ||
    candidate.site ||
    Array.isArray(candidate.levels) ||
    Array.isArray(candidate.rooms) ||
    Array.isArray(candidate.walls) ||
    Array.isArray(candidate.footprints),
  );
}

export function resolveCompiledProjectGeometryInput(input = {}) {
  if (looksLikeGeometry(input) && !input?.projectGeometry && !input?.geometry) {
    return input;
  }

  const candidates = [
    input?.projectGeometry,
    input?.canonicalGeometry,
    input?.compiledProject?.projectGeometry,
    input?.compiledProject?.canonicalGeometry,
    input?.compiledProject?.geometry,
    input?.project?.projectGeometry,
    input?.project?.canonicalGeometry,
    input?.project?.geometry,
    input?.payload?.projectGeometry,
    input?.payload?.canonicalGeometry,
    input?.payload?.geometry,
    input?.result?.projectGeometry,
    input?.result?.canonicalGeometry,
    input?.result?.geometry,
    input?.masterDNA?.projectGeometry,
    input?.masterDNA?.canonicalGeometry,
    input?.masterDNA?.geometry,
    input?.meta?.projectGeometry,
    input?.meta?.canonicalGeometry,
    input?.meta?.geometry,
    input?.data?.projectGeometry,
    input?.data?.canonicalGeometry,
    input?.data?.geometry,
    input?.geometry?.projectGeometry,
    input?.geometry?.canonicalGeometry,
    input?.geometry,
  ];

  return candidates.find(looksLikeGeometry) || input;
}

export function resolveCompiledProjectStyleDNA(input = {}, fallback = {}) {
  const candidates = [
    input?.styleDNA,
    input?.style_dna,
    input?.style,
    input?.style_blend,
    input?.compiledProject?.styleDNA,
    input?.compiledProject?.style_dna,
    input?.compiledProject?.style,
    input?.compiledProject?.style_blend,
    input?.project?.styleDNA,
    input?.project?.style_dna,
    input?.project?.style,
    input?.project?.style_blend,
    input?.payload?.styleDNA,
    input?.payload?.style_dna,
    input?.payload?.style,
    input?.payload?.style_blend,
    input?.meta?.styleDNA,
    input?.meta?.style_dna,
    fallback,
  ];

  return (
    candidates.find(
      (candidate) => candidate && typeof candidate === "object",
    ) || {}
  );
}

export function getBlueprintTheme() {
  return BLUEPRINT_THEME;
}

function normalizeBounds(bounds = null) {
  if (!bounds || typeof bounds !== "object") {
    return null;
  }

  const minX = toFiniteNumber(bounds.min_x ?? bounds.minX ?? bounds.x);
  const minY = toFiniteNumber(bounds.min_y ?? bounds.minY ?? bounds.y);
  const maxX = toFiniteNumber(
    bounds.max_x ?? bounds.maxX,
    minX !== null ? minX + toFiniteNumber(bounds.width, 0) : null,
  );
  const maxY = toFiniteNumber(
    bounds.max_y ?? bounds.maxY,
    minY !== null ? minY + toFiniteNumber(bounds.height, 0) : null,
  );

  if (
    minX === null ||
    minY === null ||
    maxX === null ||
    maxY === null ||
    maxX <= minX ||
    maxY <= minY
  ) {
    return null;
  }

  return {
    min_x: minX,
    min_y: minY,
    max_x: maxX,
    max_y: maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function boundsFromPoints(points = []) {
  const validPoints = (points || []).filter(
    (point) =>
      point &&
      Number.isFinite(Number(point.x)) &&
      Number.isFinite(Number(point.y)),
  );

  if (validPoints.length < 2) {
    return null;
  }

  return normalizeBounds(buildBoundingBoxFromPolygon(validPoints));
}

function boundsFromWallSegment(entity = {}) {
  const start = entity.start || entity.points?.[0] || null;
  const end = entity.end || entity.points?.[1] || null;
  if (
    !start ||
    !end ||
    !Number.isFinite(Number(start.x)) ||
    !Number.isFinite(Number(start.y)) ||
    !Number.isFinite(Number(end.x)) ||
    !Number.isFinite(Number(end.y))
  ) {
    return null;
  }

  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  const length = Math.hypot(dx, dy);
  const halfThickness = Math.max(
    0.03,
    Number(entity.thickness_m || entity.thickness || 0) / 2,
  );

  if (length < 1e-6) {
    return normalizeBounds({
      min_x: Number(start.x) - halfThickness,
      min_y: Number(start.y) - halfThickness,
      max_x: Number(start.x) + halfThickness,
      max_y: Number(start.y) + halfThickness,
    });
  }

  const nx = (-dy / length) * halfThickness;
  const ny = (dx / length) * halfThickness;

  return boundsFromPoints([
    { x: Number(start.x) + nx, y: Number(start.y) + ny },
    { x: Number(end.x) + nx, y: Number(end.y) + ny },
    { x: Number(end.x) - nx, y: Number(end.y) - ny },
    { x: Number(start.x) - nx, y: Number(start.y) - ny },
  ]);
}

function boundsFromEntity(entity = {}) {
  if (!entity || typeof entity !== "object") {
    return null;
  }

  return (
    normalizeBounds(entity.bbox) ||
    normalizeBounds(entity.boundingBox) ||
    boundsFromPoints(entity.polygon) ||
    boundsFromPoints(entity.polyline) ||
    boundsFromWallSegment(entity) ||
    null
  );
}

function mergeBounds(boundsList = []) {
  const normalized = boundsList.map(normalizeBounds).filter(Boolean);
  if (!normalized.length) {
    return null;
  }

  const minX = Math.min(...normalized.map((bounds) => bounds.min_x));
  const minY = Math.min(...normalized.map((bounds) => bounds.min_y));
  const maxX = Math.max(...normalized.map((bounds) => bounds.max_x));
  const maxY = Math.max(...normalized.map((bounds) => bounds.max_y));

  return normalizeBounds({
    min_x: minX,
    min_y: minY,
    max_x: maxX,
    max_y: maxY,
  });
}

function collectEntityBounds(entities = [], predicate = () => true) {
  return (entities || [])
    .filter(predicate)
    .map((entity) => boundsFromEntity(entity))
    .filter(Boolean);
}

function resolveSiteFallbackBounds(geometry = {}) {
  return (
    normalizeBounds(geometry.site?.buildable_bbox) ||
    normalizeBounds(geometry.site?.boundary_bbox) ||
    normalizeBounds(geometry.levels?.[0]?.buildable_bbox) ||
    normalizeBounds(geometry.footprints?.[0]?.bbox) ||
    DEFAULT_BOUNDS
  );
}

function resolveEnvelopeBoundsBase(geometry = {}) {
  const buildingBounds = mergeBounds([
    ...collectEntityBounds(geometry.levels),
    ...collectEntityBounds(geometry.footprints),
    ...collectEntityBounds(geometry.rooms),
    ...collectEntityBounds(geometry.walls),
    ...collectEntityBounds(geometry.doors),
    ...collectEntityBounds(geometry.windows),
    ...collectEntityBounds(geometry.slabs),
    ...collectEntityBounds(geometry.roof ? [geometry.roof] : []),
    ...collectEntityBounds(geometry.stairs),
    ...collectEntityBounds(geometry.circulation),
    ...collectEntityBounds(geometry.columns),
    ...collectEntityBounds(geometry.beams),
  ]);

  if (buildingBounds) {
    return {
      bounds: buildingBounds,
      source: "building_derived",
    };
  }

  return {
    bounds: resolveSiteFallbackBounds(geometry),
    source: "site_fallback",
  };
}

export function getLevelDrawingBoundsWithSource(
  geometryInput = {},
  levelId = null,
) {
  const geometry = resolveCompiledProjectGeometryInput(geometryInput);
  const level = levelId
    ? (geometry.levels || []).find((entry) => entry.id === levelId) || null
    : geometry.levels?.[0] || null;
  const resolvedLevelId = level?.id || levelId || null;

  const levelBounds = mergeBounds([
    ...collectEntityBounds(
      geometry.footprints,
      (entry) =>
        entry.level_id === resolvedLevelId || entry.id === level?.footprint_id,
    ),
    ...collectEntityBounds(
      geometry.rooms,
      (entry) => entry.level_id === resolvedLevelId,
    ),
    ...collectEntityBounds(
      geometry.walls,
      (entry) => entry.level_id === resolvedLevelId,
    ),
    ...collectEntityBounds(
      geometry.doors,
      (entry) => entry.level_id === resolvedLevelId,
    ),
    ...collectEntityBounds(
      geometry.windows,
      (entry) => entry.level_id === resolvedLevelId,
    ),
    ...collectEntityBounds(
      geometry.stairs,
      (entry) => entry.level_id === resolvedLevelId,
    ),
    ...collectEntityBounds(
      geometry.circulation,
      (entry) => entry.level_id === resolvedLevelId,
    ),
    ...collectEntityBounds(
      geometry.columns,
      (entry) => entry.level_id === resolvedLevelId,
    ),
    ...collectEntityBounds(
      geometry.beams,
      (entry) => entry.level_id === resolvedLevelId,
    ),
  ]);

  if (levelBounds) {
    return {
      bounds: levelBounds,
      source: "building_derived",
    };
  }

  const levelFallback = normalizeBounds(level?.buildable_bbox);
  if (levelFallback) {
    return {
      bounds: levelFallback,
      source: "level_fallback",
    };
  }

  return getEnvelopeDrawingBoundsWithSource(geometry);
}

export function getEnvelopeDrawingBoundsWithSource(geometryInput = {}) {
  const geometry = resolveCompiledProjectGeometryInput(geometryInput);
  return resolveEnvelopeBoundsBase(geometry);
}

export function getLevelDrawingBounds(geometryInput = {}, levelId = null) {
  return getLevelDrawingBoundsWithSource(geometryInput, levelId).bounds;
}

export function getEnvelopeDrawingBounds(geometryInput = {}) {
  return getEnvelopeDrawingBoundsWithSource(geometryInput).bounds;
}

export default {
  getBlueprintTheme,
  getEnvelopeDrawingBounds,
  getEnvelopeDrawingBoundsWithSource,
  getLevelDrawingBounds,
  getLevelDrawingBoundsWithSource,
  resolveCompiledProjectGeometryInput,
  resolveCompiledProjectStyleDNA,
};
