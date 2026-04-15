import { safeNumber } from "../cad/architecturalSchema.js";

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function normalizePoint(point = {}) {
  if (Array.isArray(point)) {
    return {
      x: roundMetric(point[0]),
      y: roundMetric(point[1]),
    };
  }

  return {
    x: roundMetric(point.x),
    y: roundMetric(point.y),
  };
}

function normalizePolygon(points = []) {
  return Array.isArray(points) ? points.map(normalizePoint) : [];
}

function rectangleToPolygon(x, y, width, height) {
  return [
    { x: roundMetric(x), y: roundMetric(y) },
    { x: roundMetric(x + width), y: roundMetric(y) },
    { x: roundMetric(x + width), y: roundMetric(y + height) },
    { x: roundMetric(x), y: roundMetric(y + height) },
  ];
}

function buildBoundingBox(points = []) {
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

function computePolygonArea(points = []) {
  const polygon = normalizePolygon(points);
  if (polygon.length < 3) return 0;

  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }

  return roundMetric(Math.abs(area) / 2);
}

function computePolygonPerimeter(points = []) {
  const polygon = normalizePolygon(points);
  if (polygon.length < 2) return 0;

  let perimeter = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    perimeter += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return roundMetric(perimeter);
}

function computeCentroid(points = []) {
  const bbox = buildBoundingBox(points);
  return {
    x: roundMetric((bbox.min_x + bbox.max_x) / 2),
    y: roundMetric((bbox.min_y + bbox.max_y) / 2),
  };
}

function normalizeSetbacks(setbacks = {}) {
  const all = safeNumber(setbacks.all, 0);
  return {
    front: roundMetric(setbacks.front ?? all),
    right: roundMetric(setbacks.right ?? all),
    rear: roundMetric(setbacks.rear ?? all),
    left: roundMetric(setbacks.left ?? all),
  };
}

function normalizeNorthOrientation(value) {
  const numeric = safeNumber(value, 0) % 360;
  return numeric >= 0 ? numeric : numeric + 360;
}

export function normalizeBoundaryPolygon(site = {}) {
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

export function interpretSiteConstraints(site = {}) {
  const boundaryPolygon = normalizeBoundaryPolygon(site);
  const boundaryBbox = buildBoundingBox(boundaryPolygon);
  const boundaryArea = computePolygonArea(boundaryPolygon);
  const bboxArea = roundMetric(boundaryBbox.width * boundaryBbox.height);
  const perimeter = computePolygonPerimeter(boundaryPolygon);
  const compactness =
    perimeter > 0
      ? roundMetric(
          (4 * Math.PI * Math.max(boundaryArea, 0.001)) /
            (perimeter * perimeter),
        )
      : 1;
  const bboxEfficiency =
    bboxArea > 0 ? roundMetric(boundaryArea / Math.max(bboxArea, 0.001)) : 1;
  const irregularityScore = roundMetric(1 - bboxEfficiency);
  const setbacks = normalizeSetbacks(site.setbacks || {});
  const warnings = [];

  if (irregularityScore >= 0.18) {
    warnings.push(
      "Site shape is irregular enough that the deterministic solver may need to compress room bands.",
    );
  }
  if (compactness <= 0.6) {
    warnings.push(
      "Site compactness is low; circulation and facade regularity may be constrained.",
    );
  }
  if (boundaryBbox.width < 8 || boundaryBbox.height < 8) {
    warnings.push(
      "Site dimensions are tight; buildable-envelope fit will likely constrain room proportions.",
    );
  }

  return {
    boundary_polygon: boundaryPolygon,
    boundary_bbox: boundaryBbox,
    boundary_area_m2: boundaryArea,
    perimeter_m: perimeter,
    bbox_efficiency: bboxEfficiency,
    irregularity_score: irregularityScore,
    compactness_score: compactness,
    setbacks,
    centroid: computeCentroid(boundaryPolygon),
    north_orientation_deg: normalizeNorthOrientation(
      site.north_orientation_deg || site.northOrientation || site.north || 0,
    ),
    warnings,
  };
}

export default {
  interpretSiteConstraints,
  normalizeBoundaryPolygon,
};
