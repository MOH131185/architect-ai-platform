import { buildBoundingBoxFromPolygon } from "../cad/projectGeometrySchema.js";

const DEFAULT_BOUNDS = {
  min_x: 0,
  min_y: 0,
  max_x: 12,
  max_y: 10,
  width: 12,
  height: 10,
};

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

function boundsFromEntity(entity = {}) {
  if (!entity || typeof entity !== "object") {
    return null;
  }

  return (
    normalizeBounds(entity.bbox) ||
    normalizeBounds(entity.boundingBox) ||
    boundsFromPoints(entity.polygon) ||
    boundsFromPoints(entity.polyline) ||
    boundsFromPoints([entity.start, entity.end]) ||
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
  const bounds = mergeBounds([
    ...collectEntityBounds(geometry.footprints),
    ...collectEntityBounds(geometry.rooms),
    ...collectEntityBounds(geometry.walls),
    ...collectEntityBounds(geometry.slabs),
    ...collectEntityBounds(geometry.roof ? [geometry.roof] : []),
    ...collectEntityBounds(geometry.stairs),
    ...collectEntityBounds(geometry.circulation),
  ]);

  return bounds || resolveSiteFallbackBounds(geometry);
}

export function getLevelDrawingBounds(geometry = {}, levelId = null) {
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
  ]);

  return (
    levelBounds ||
    normalizeBounds(level?.buildable_bbox) ||
    getEnvelopeDrawingBounds(geometry)
  );
}

export function getEnvelopeDrawingBounds(geometry = {}) {
  return resolveEnvelopeBoundsBase(geometry);
}

export default {
  getEnvelopeDrawingBounds,
  getLevelDrawingBounds,
};
