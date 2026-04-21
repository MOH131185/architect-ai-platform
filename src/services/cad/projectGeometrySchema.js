import { safeNumber } from "./architecturalSchema.js";
import { deriveBuildableEnvelope } from "../site/buildableEnvelopeService.js";

export const CANONICAL_PROJECT_GEOMETRY_VERSION =
  "canonical-project-geometry-v2";
export const DEFAULT_LEVEL_HEIGHT_M = 3.2;
export const DEFAULT_WALL_THICKNESS_M = 0.2;
export const DEFAULT_INTERIOR_WALL_THICKNESS_M = 0.14;

export const CANONICAL_GEOMETRY_ENTITY_COLLECTIONS = [
  "levels",
  "rooms",
  "walls",
  "doors",
  "windows",
  "stairs",
  "circulation",
  "columns",
  "beams",
  "slabs",
  "roof_primitives",
  "foundations",
  "base_conditions",
  "footprints",
  "elevations",
  "sections",
  "annotations",
];

export const CANONICAL_PROJECT_GEOMETRY_DEFINITIONS = {
  project: [
    "project_id",
    "site",
    "levels",
    "rooms",
    "walls",
    "doors",
    "windows",
    "stairs",
    "circulation",
    "columns",
    "beams",
    "slabs",
    "roof_primitives",
    "foundations",
    "base_conditions",
    "roof",
    "footprints",
    "elevations",
    "sections",
    "annotations",
    "metadata",
    "provenance",
  ],
  level: [
    "id",
    "name",
    "level_number",
    "elevation_m",
    "height_m",
    "room_ids",
    "wall_ids",
    "door_ids",
    "window_ids",
    "stair_ids",
    "circulation_ids",
    "column_ids",
    "beam_ids",
    "slab_ids",
    "footprint_id",
  ],
};

export function roundMetric(value, precision = 3) {
  const numeric = safeNumber(value);
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

export function createStableHash(input) {
  const text = String(input || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function createStableId(prefix, ...parts) {
  const normalized = parts
    .flat()
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map((part) =>
      typeof part === "string"
        ? part.trim().toLowerCase()
        : JSON.stringify(part),
    )
    .join("|");

  return `${prefix}-${createStableHash(normalized || prefix)}`;
}

export function normalizeCoordinate(value) {
  return roundMetric(value, 3);
}

export function normalizePoint2D(point = {}) {
  if (Array.isArray(point)) {
    return {
      x: normalizeCoordinate(point[0]),
      y: normalizeCoordinate(point[1]),
    };
  }

  return {
    x: normalizeCoordinate(point.x),
    y: normalizeCoordinate(point.y),
  };
}

export function normalizePolygon(points = []) {
  return Array.isArray(points) ? points.map(normalizePoint2D) : [];
}

export function buildBoundingBoxFromPolygon(points = []) {
  const polygon = normalizePolygon(points);
  if (!polygon.length) {
    return {
      min_x: 0,
      min_y: 0,
      max_x: 0,
      max_y: 0,
      width: 0,
      height: 0,
    };
  }

  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    min_x: roundMetric(minX),
    min_y: roundMetric(minY),
    max_x: roundMetric(maxX),
    max_y: roundMetric(maxY),
    width: roundMetric(maxX - minX),
    height: roundMetric(maxY - minY),
  };
}

export function buildBoundingBoxFromRect(x, y, width, height) {
  return {
    min_x: roundMetric(x),
    min_y: roundMetric(y),
    max_x: roundMetric(x + width),
    max_y: roundMetric(y + height),
    width: roundMetric(width),
    height: roundMetric(height),
  };
}

export function rectangleToPolygon(x, y, width, height) {
  return [
    { x: roundMetric(x), y: roundMetric(y) },
    { x: roundMetric(x + width), y: roundMetric(y) },
    { x: roundMetric(x + width), y: roundMetric(y + height) },
    { x: roundMetric(x), y: roundMetric(y + height) },
  ];
}

export function computePolygonArea(points = []) {
  const polygon = normalizePolygon(points);
  if (polygon.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }

  return roundMetric(Math.abs(area) / 2);
}

export function computeCentroid(points = []) {
  const polygon = normalizePolygon(points);
  if (!polygon.length) {
    return { x: 0, y: 0 };
  }

  const bbox = buildBoundingBoxFromPolygon(polygon);
  return {
    x: roundMetric((bbox.min_x + bbox.max_x) / 2),
    y: roundMetric((bbox.min_y + bbox.max_y) / 2),
  };
}

export function normalizeSetbacks(setbacks = {}) {
  const all = safeNumber(setbacks.all, 0);
  return {
    front: roundMetric(setbacks.front ?? all),
    right: roundMetric(setbacks.right ?? all),
    rear: roundMetric(setbacks.rear ?? all),
    left: roundMetric(setbacks.left ?? all),
  };
}

export function normalizeNorthOrientation(value) {
  const normalized = safeNumber(value, 0) % 360;
  return normalized >= 0 ? normalized : normalized + 360;
}

export function ensureBoundaryPolygon(site = {}) {
  const boundaryPolygon = normalizePolygon(
    site.boundary_polygon || site.boundaryPolygon || site.boundary || [],
  );

  if (boundaryPolygon.length >= 3) {
    return boundaryPolygon;
  }

  const width = Math.max(12, safeNumber(site.width_m ?? site.width, 18));
  const depth = Math.max(10, safeNumber(site.depth_m ?? site.depth, 14));
  return rectangleToPolygon(0, 0, width, depth);
}

export function buildBuildableEnvelope(site = {}) {
  return deriveBuildableEnvelope(site);
}

export function createProjectGeometrySkeleton(input = {}) {
  const projectId = input.project_id || input.projectId || "phase2-project";
  const siteEnvelope = buildBuildableEnvelope(input.site || {});
  const inheritedMetadata = input.metadata || {};

  return {
    schema_version: CANONICAL_PROJECT_GEOMETRY_VERSION,
    project_id: projectId,
    site: {
      id: createStableId("site", projectId),
      ...siteEnvelope,
    },
    levels: [],
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    stairs: [],
    circulation: [],
    columns: [],
    beams: [],
    slabs: [],
    roof_primitives: [],
    foundations: [],
    base_conditions: [],
    roof: null,
    footprints: [],
    elevations: [],
    sections: [],
    annotations: [],
    metadata: {
      units: "meters",
      status: "draft",
      created_at: inheritedMetadata.created_at || input.created_at || null,
      requested_building_type:
        input.building_type || input.buildingType || "unspecified",
      deterministic: true,
      canonical_construction_truth: {
        roof: {
          support_mode: "missing",
          primitive_count: 0,
          explicit_generated_count: 0,
          primitive_families: [],
          plane_count: 0,
          ridge_count: 0,
          edge_count: 0,
          parapet_count: 0,
          roof_break_count: 0,
          dormer_attachment_count: 0,
          hip_count: 0,
          valley_count: 0,
        },
        foundation: {
          support_mode: "missing",
          foundation_count: 0,
          base_condition_count: 0,
          foundation_types: [],
          condition_types: [],
          explicit_ground_relation_count: 0,
          foundation_zone_count: 0,
          base_wall_condition_count: 0,
        },
      },
    },
    provenance: {
      source: input.source || "phase2-geometry-pipeline",
      generator: "phase2-deterministic-geometry",
      strategy: "geometry-first",
      pipeline: [],
    },
  };
}

export default {
  CANONICAL_PROJECT_GEOMETRY_VERSION,
  CANONICAL_GEOMETRY_ENTITY_COLLECTIONS,
  CANONICAL_PROJECT_GEOMETRY_DEFINITIONS,
  DEFAULT_LEVEL_HEIGHT_M,
  DEFAULT_WALL_THICKNESS_M,
  DEFAULT_INTERIOR_WALL_THICKNESS_M,
  roundMetric,
  createStableHash,
  createStableId,
  normalizeCoordinate,
  normalizePoint2D,
  normalizePolygon,
  buildBoundingBoxFromPolygon,
  buildBoundingBoxFromRect,
  rectangleToPolygon,
  computePolygonArea,
  computeCentroid,
  normalizeSetbacks,
  normalizeNorthOrientation,
  ensureBoundaryPolygon,
  buildBuildableEnvelope,
  createProjectGeometrySkeleton,
};
