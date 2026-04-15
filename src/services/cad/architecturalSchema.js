/**
 * Architectural Geometry Schema Helpers
 *
 * Local-first normalized schema used by the new open-source-ready backend
 * modules. The schema is deliberately plain JSON so it can flow through the
 * existing Express/Vercel endpoints and later back onto vector DB / training
 * pipelines without translation overhead.
 */

export const ARCHITECTURAL_ELEMENT_FAMILIES = [
  "walls",
  "doors",
  "windows",
  "stairs",
  "columns",
  "beams",
  "furniture",
  "rooms",
  "labels",
  "annotations",
];

export const ARCHITECTURAL_SCHEMA_VERSION = "open-source-geometry-v1";

export const ARCHITECTURAL_SCHEMA_DEFINITIONS = {
  rooms: ["id", "family", "semantic", "level_id", "bbox"],
  walls: ["id", "family", "semantic", "level_id", "geometry"],
  doors: ["id", "family", "semantic", "level_id", "bbox"],
  windows: ["id", "family", "semantic", "level_id", "bbox"],
  stairs: ["id", "family", "semantic", "level_id", "bbox"],
  columns: ["id", "family", "semantic", "level_id", "bbox"],
  beams: ["id", "family", "semantic", "level_id", "geometry"],
  furniture: ["id", "family", "semantic", "level_id", "bbox"],
  annotations: ["id", "family", "semantic", "level_id"],
  levels: ["id", "name", "level_number", "elevation_m", "height_m"],
  footprints: ["id", "level_id", "polygon", "bbox"],
};

export function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeLevelName(levelInput, index = 0) {
  if (typeof levelInput === "string" && levelInput.trim()) {
    return levelInput.trim();
  }

  const levelNumber = safeNumber(
    levelInput?.levelNumber ?? levelInput?.index,
    index,
  );
  if (levelNumber === 0) return "ground";
  if (levelNumber === 1) return "level_1";
  return `level_${levelNumber}`;
}

export function createEmptyLevel(levelInput = {}, index = 0) {
  return {
    id: levelInput.id || normalizeLevelName(levelInput, index),
    name: levelInput.name || normalizeLevelName(levelInput, index),
    level_number: safeNumber(
      levelInput.level_number ?? levelInput.levelNumber,
      index,
    ),
    elevation_m: safeNumber(levelInput.elevation_m ?? levelInput.elevation),
    height_m: safeNumber(levelInput.height_m ?? levelInput.height, 3),
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    stairs: [],
    columns: [],
    beams: [],
    furniture: [],
    labels: [],
    annotations: [],
  };
}

export function createEmptyArchitecturalGeometry(
  projectId = "archiai-project",
  options = {},
) {
  return {
    schema_version: ARCHITECTURAL_SCHEMA_VERSION,
    project_id: projectId,
    source: options.source || "unknown",
    units: options.units || "meters",
    levels: [],
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    stairs: [],
    columns: [],
    beams: [],
    furniture: [],
    labels: [],
    annotations: [],
    footprints: [],
    elevations: [],
    sections: [],
    stats: {
      level_count: 0,
      room_count: 0,
      wall_count: 0,
      door_count: 0,
      window_count: 0,
      stair_count: 0,
    },
    metadata: {
      created_at: new Date().toISOString(),
      technical_constraints: options.technical_constraints || [],
    },
  };
}

export function buildBoundingBox(raw = {}) {
  const x = safeNumber(raw.x ?? raw.minX);
  const y = safeNumber(raw.y ?? raw.minY);
  const width = safeNumber(raw.width, safeNumber(raw.maxX) - x);
  const height = safeNumber(raw.height, safeNumber(raw.maxY) - y);

  return {
    x,
    y,
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

export function normalizePoint(point = {}) {
  if (Array.isArray(point)) {
    return {
      x: safeNumber(point[0]),
      y: safeNumber(point[1]),
      z: safeNumber(point[2]),
    };
  }

  return {
    x: safeNumber(point.x),
    y: safeNumber(point.y),
    z: safeNumber(point.z),
  };
}

export function normalizePolyline(points = []) {
  return Array.isArray(points) ? points.map(normalizePoint) : [];
}

export function normalizeFootprint(raw = {}, index = 0) {
  return {
    id: raw.id || `footprint-${index}`,
    level_id: raw.level_id || raw.level || "ground",
    polygon: normalizePolyline(raw.polygon || raw.points || raw.vertices || []),
    bbox: buildBoundingBox(raw.bbox || raw.bounds || raw),
    metadata: {
      source: raw.source || "unknown",
    },
  };
}

export function inferElementFamily(type = "", semantic = "") {
  const value = `${type} ${semantic}`.toLowerCase();

  if (value.includes("wall")) return "walls";
  if (value.includes("door")) return "doors";
  if (value.includes("window")) return "windows";
  if (value.includes("stair")) return "stairs";
  if (value.includes("column")) return "columns";
  if (value.includes("beam")) return "beams";
  if (
    value.includes("furniture") ||
    value.includes("table") ||
    value.includes("chair")
  )
    return "furniture";
  if (value.includes("room") || value.includes("space")) return "rooms";
  if (value.includes("label") || value.includes("text")) return "labels";
  return "annotations";
}

export function createNormalizedElement(
  raw = {},
  family = "annotations",
  overrides = {},
) {
  const type =
    raw.type || raw.element_type || raw.primitive || family.slice(0, -1);
  const semantic =
    raw.semantic || raw.label || raw.class || raw.category || type;
  const points = normalizePolyline(
    raw.points || raw.vertices || raw.polyline || [],
  );

  return {
    id:
      raw.id ||
      raw.instance ||
      `${family}-${Math.random().toString(36).slice(2, 10)}`,
    family,
    type,
    semantic,
    instance: raw.instance || raw.instance_id || raw.name || null,
    level_id: raw.level_id || raw.level || overrides.level_id || "ground",
    bbox: buildBoundingBox(raw.bbox || raw.bounds || raw),
    points,
    geometry: raw.geometry || {
      start: raw.start ? normalizePoint(raw.start) : null,
      end: raw.end ? normalizePoint(raw.end) : null,
      center: raw.center ? normalizePoint(raw.center) : null,
      radius: safeNumber(raw.radius),
      width_m: safeNumber(raw.width_m ?? raw.width),
      height_m: safeNumber(raw.height_m ?? raw.height),
      depth_m: safeNumber(raw.depth_m ?? raw.depth),
    },
    style: {
      rgb: raw.rgb || raw.color || null,
      linetype: raw.linetype || raw.lineType || null,
      lineweight: safeNumber(raw.lineweight ?? raw.lineWeight),
    },
    metadata: {
      source: raw.source || overrides.source || "unknown",
      raw_type: raw.type || null,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
    },
    ...overrides,
  };
}

export default {
  ARCHITECTURAL_ELEMENT_FAMILIES,
  ARCHITECTURAL_SCHEMA_DEFINITIONS,
  ARCHITECTURAL_SCHEMA_VERSION,
  safeNumber,
  normalizeLevelName,
  createEmptyLevel,
  createEmptyArchitecturalGeometry,
  buildBoundingBox,
  normalizePoint,
  normalizeFootprint,
  normalizePolyline,
  inferElementFamily,
  createNormalizedElement,
};
