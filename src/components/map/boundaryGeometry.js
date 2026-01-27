/**
 * boundaryGeometry.js
 *
 * Expert-level geometry utilities for site boundary editing.
 * Uses turf.js for robust geometric operations.
 *
 * Features:
 * - GeoJSON canonical format (EPSG:4326, [lng, lat])
 * - Self-intersection detection
 * - Ring normalization and validation
 * - Snapping utilities
 * - Coordinate precision management
 *
 * @module boundaryGeometry
 */

import * as turf from "@turf/turf";

// Constants
export const EARTH_RADIUS_METERS = 6371000;
export const COORDINATE_PRECISION = 7; // ~1cm precision
export const MIN_VERTICES = 3;
export const SNAP_PIXEL_THRESHOLD = 12;
export const ANGLE_SNAP_DEGREES = 45;

// ============================================================
// COORDINATE PRECISION & NORMALIZATION
// ============================================================

/**
 * Round coordinate to fixed precision to prevent floating point drift
 * @param {number} value - Coordinate value
 * @param {number} [precision=COORDINATE_PRECISION] - Decimal places
 * @returns {number} Rounded value
 */
export function roundCoord(value, precision = COORDINATE_PRECISION) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Normalize a single point to canonical format
 * @param {{lat: number, lng: number} | [number, number]} point - Input point
 * @returns {[number, number]} [lng, lat] format
 */
export function normalizePoint(point) {
  if (Array.isArray(point)) {
    return [roundCoord(point[0]), roundCoord(point[1])];
  }
  return [roundCoord(point.lng), roundCoord(point.lat)];
}

/**
 * Convert [lng, lat] to {lat, lng} object
 * @param {[number, number]} coord - [lng, lat] array
 * @returns {{lat: number, lng: number}} Object format
 */
export function coordToLatLng(coord) {
  return { lat: coord[1], lng: coord[0] };
}

/**
 * Convert {lat, lng} to [lng, lat] array
 * @param {{lat: number, lng: number}} point - Object format
 * @returns {[number, number]} [lng, lat] array
 */
export function latLngToCoord(point) {
  return [roundCoord(point.lng), roundCoord(point.lat)];
}

// ============================================================
// RING VALIDATION & NORMALIZATION
// ============================================================

/**
 * Check if a ring is closed (first point equals last point)
 * @param {Array<[number, number]>} ring - Array of [lng, lat] coordinates
 * @returns {boolean}
 */
export function isRingClosed(ring) {
  if (!ring || ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/**
 * Close a ring by appending the first point if not already closed
 * @param {Array<[number, number]>} ring - Array of [lng, lat] coordinates
 * @returns {Array<[number, number]>} Closed ring
 */
export function closeRing(ring) {
  if (!ring || ring.length === 0) return [];
  if (isRingClosed(ring)) return ring;
  return [...ring, [...ring[0]]];
}

/**
 * Open a ring by removing the last point if it duplicates the first
 * @param {Array<[number, number]>} ring - Array of [lng, lat] coordinates
 * @returns {Array<[number, number]>} Open ring (vertices only)
 */
export function openRing(ring) {
  if (!ring || ring.length === 0) return [];
  if (!isRingClosed(ring)) return ring;
  return ring.slice(0, -1);
}

/**
 * Remove consecutive duplicate points from a ring
 * @param {Array<[number, number]>} ring - Array of [lng, lat] coordinates
 * @returns {Array<[number, number]>} Ring without consecutive duplicates
 */
export function removeDuplicates(ring) {
  if (!ring || ring.length < 2) return ring || [];

  const result = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const prev = result[result.length - 1];
    const curr = ring[i];
    if (curr[0] !== prev[0] || curr[1] !== prev[1]) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * Normalize a ring to canonical format:
 * - Remove consecutive duplicates
 * - Ensure minimum vertices
 * - Ensure proper closure for GeoJSON
 * @param {Array<[number, number]>} ring - Input ring
 * @returns {{ring: Array<[number, number]>, valid: boolean, errors: string[]}}
 */
export function normalizeRing(ring) {
  const errors = [];

  if (!ring || ring.length === 0) {
    return { ring: [], valid: false, errors: ["Ring is empty"] };
  }

  // Open the ring for processing
  let vertices = openRing(ring);

  // Remove duplicates
  vertices = removeDuplicates(vertices);

  // Check minimum vertices
  if (vertices.length < MIN_VERTICES) {
    errors.push(
      `Ring must have at least ${MIN_VERTICES} unique vertices (has ${vertices.length})`,
    );
    return { ring: closeRing(vertices), valid: false, errors };
  }

  // Close for GeoJSON format
  const closedRing = closeRing(vertices);

  return {
    ring: closedRing,
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================
// SELF-INTERSECTION DETECTION
// ============================================================

/**
 * Detect self-intersections in a polygon using turf.kinks
 * @param {Array<[number, number]>} ring - Closed ring of coordinates
 * @returns {{intersects: boolean, points: Array<[number, number]>}}
 */
export function detectSelfIntersection(ring) {
  if (!ring || ring.length < 4) {
    return { intersects: false, points: [] };
  }

  try {
    const polygon = turf.polygon([ring]);
    const kinks = turf.kinks(polygon);

    if (kinks.features.length > 0) {
      const points = kinks.features.map((f) => f.geometry.coordinates);
      return { intersects: true, points };
    }

    return { intersects: false, points: [] };
  } catch (e) {
    // If turf fails, use manual segment intersection check
    return detectSelfIntersectionManual(ring);
  }
}

/**
 * Manual segment intersection detection (fallback)
 * @param {Array<[number, number]>} ring - Closed ring
 * @returns {{intersects: boolean, points: Array<[number, number]>}}
 */
function detectSelfIntersectionManual(ring) {
  const vertices = openRing(ring);
  const n = vertices.length;
  const intersectionPoints = [];

  for (let i = 0; i < n; i++) {
    const a1 = vertices[i];
    const a2 = vertices[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip adjacent segments
      if (j === (i + n - 1) % n) continue;

      const b1 = vertices[j];
      const b2 = vertices[(j + 1) % n];

      const intersection = segmentIntersection(a1, a2, b1, b2);
      if (intersection) {
        intersectionPoints.push(intersection);
      }
    }
  }

  return {
    intersects: intersectionPoints.length > 0,
    points: intersectionPoints,
  };
}

/**
 * Calculate intersection point of two line segments (if any)
 * @param {[number, number]} a1 - Segment 1 start
 * @param {[number, number]} a2 - Segment 1 end
 * @param {[number, number]} b1 - Segment 2 start
 * @param {[number, number]} b2 - Segment 2 end
 * @returns {[number, number] | null} Intersection point or null
 */
function segmentIntersection(a1, a2, b1, b2) {
  const dxa = a2[0] - a1[0];
  const dya = a2[1] - a1[1];
  const dxb = b2[0] - b1[0];
  const dyb = b2[1] - b1[1];

  const denom = dxa * dyb - dya * dxb;
  if (Math.abs(denom) < 1e-12) return null; // Parallel

  const t = ((b1[0] - a1[0]) * dyb - (b1[1] - a1[1]) * dxb) / denom;
  const u = ((b1[0] - a1[0]) * dya - (b1[1] - a1[1]) * dxa) / denom;

  // Check if intersection is within both segments (exclusive of endpoints)
  const epsilon = 1e-10;
  if (t > epsilon && t < 1 - epsilon && u > epsilon && u < 1 - epsilon) {
    return [roundCoord(a1[0] + t * dxa), roundCoord(a1[1] + t * dya)];
  }

  return null;
}

// ============================================================
// POLYGON ORIENTATION
// ============================================================

/**
 * Check if ring is clockwise
 * @param {Array<[number, number]>} ring - Ring coordinates
 * @returns {boolean}
 */
export function isClockwise(ring) {
  const vertices = openRing(ring);
  let sum = 0;

  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    sum += (next[0] - curr[0]) * (next[1] + curr[1]);
  }

  return sum > 0;
}

/**
 * Ensure ring is in specified orientation
 * @param {Array<[number, number]>} ring - Ring coordinates
 * @param {boolean} [clockwise=true] - Desired orientation
 * @returns {Array<[number, number]>} Properly oriented ring
 */
export function ensureOrientation(ring, clockwise = true) {
  if (isClockwise(ring) !== clockwise) {
    const vertices = openRing(ring);
    return closeRing(vertices.reverse());
  }
  return ring;
}

// ============================================================
// METRICS CALCULATION (using turf.js)
// ============================================================

/**
 * Calculate polygon area in square meters
 * @param {Array<[number, number]>} ring - Closed ring
 * @returns {number} Area in m²
 */
export function calculateArea(ring) {
  if (!ring || ring.length < 4) return 0;

  try {
    const polygon = turf.polygon([ring]);
    return turf.area(polygon);
  } catch (e) {
    return 0;
  }
}

/**
 * Calculate polygon perimeter in meters
 * @param {Array<[number, number]>} ring - Closed ring
 * @returns {number} Perimeter in meters
 */
export function calculatePerimeter(ring) {
  if (!ring || ring.length < 3) return 0;

  try {
    const polygon = turf.polygon([ring]);
    const line = turf.polygonToLine(polygon);
    return turf.length(line, { units: "meters" });
  } catch (e) {
    return 0;
  }
}

/**
 * Calculate centroid of polygon
 * @param {Array<[number, number]>} ring - Closed ring
 * @returns {[number, number]} Centroid [lng, lat]
 */
export function calculateCentroid(ring) {
  if (!ring || ring.length < 4) return [0, 0];

  try {
    const polygon = turf.polygon([ring]);
    const centroid = turf.centroid(polygon);
    return centroid.geometry.coordinates;
  } catch (e) {
    // Fallback to simple average
    const vertices = openRing(ring);
    const sum = vertices.reduce(
      (acc, v) => [acc[0] + v[0], acc[1] + v[1]],
      [0, 0],
    );
    return [sum[0] / vertices.length, sum[1] / vertices.length];
  }
}

/**
 * Calculate all segment lengths
 * @param {Array<[number, number]>} ring - Ring coordinates (open or closed)
 * @returns {Array<{index: number, length: number, start: [number, number], end: [number, number], midpoint: [number, number], bearing: number}>}
 */
export function calculateSegments(ring) {
  const vertices = openRing(ring);
  const segments = [];

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];

    const from = turf.point(start);
    const to = turf.point(end);

    const length = turf.distance(from, to, { units: "meters" });
    const bearing = turf.bearing(from, to);
    const midpoint = turf.midpoint(from, to).geometry.coordinates;

    segments.push({
      index: i,
      length: roundCoord(length, 3),
      start,
      end,
      midpoint,
      bearing: roundCoord((bearing + 360) % 360, 2),
    });
  }

  return segments;
}

/**
 * Calculate interior angles at each vertex
 * @param {Array<[number, number]>} ring - Ring coordinates
 * @returns {Array<{index: number, angle: number, vertex: [number, number]}>}
 */
export function calculateAngles(ring) {
  const vertices = openRing(ring);
  const n = vertices.length;
  const angles = [];

  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    const bearing1 = turf.bearing(turf.point(curr), turf.point(prev));
    const bearing2 = turf.bearing(turf.point(curr), turf.point(next));

    let angle = bearing2 - bearing1;
    if (angle < 0) angle += 360;

    angles.push({
      index: i,
      angle: roundCoord(angle, 2),
      vertex: curr,
    });
  }

  return angles;
}

// ============================================================
// SNAPPING UTILITIES
// ============================================================

/**
 * Snap point to nearest vertex within threshold
 * @param {[number, number]} point - Point to snap [lng, lat]
 * @param {Array<[number, number]>} vertices - Available snap targets
 * @param {number} thresholdMeters - Maximum snap distance in meters
 * @returns {{snapped: boolean, point: [number, number], snapIndex: number | null, distance: number}}
 */
export function snapToVertex(point, vertices, thresholdMeters = 2) {
  let minDist = Infinity;
  let snapIndex = null;
  let snappedPoint = point;

  const from = turf.point(point);

  for (let i = 0; i < vertices.length; i++) {
    const to = turf.point(vertices[i]);
    const dist = turf.distance(from, to, { units: "meters" });

    if (dist < minDist && dist <= thresholdMeters) {
      minDist = dist;
      snapIndex = i;
      snappedPoint = vertices[i];
    }
  }

  return {
    snapped: snapIndex !== null,
    point: snappedPoint,
    snapIndex,
    distance: minDist,
  };
}

/**
 * Snap point to nearest edge (perpendicular projection)
 * @param {[number, number]} point - Point to snap
 * @param {Array<[number, number]>} ring - Ring coordinates
 * @param {number} thresholdMeters - Maximum snap distance
 * @returns {{snapped: boolean, point: [number, number], edgeIndex: number | null, distance: number}}
 */
export function snapToEdge(point, ring, thresholdMeters = 2) {
  const vertices = openRing(ring);
  let minDist = Infinity;
  let edgeIndex = null;
  let snappedPoint = point;

  const pt = turf.point(point);

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    const line = turf.lineString([start, end]);

    const nearest = turf.nearestPointOnLine(line, pt);
    const dist = turf.distance(pt, nearest, { units: "meters" });

    if (dist < minDist && dist <= thresholdMeters) {
      minDist = dist;
      edgeIndex = i;
      snappedPoint = nearest.geometry.coordinates;
    }
  }

  return {
    snapped: edgeIndex !== null,
    point: snappedPoint,
    edgeIndex,
    distance: minDist,
  };
}

/**
 * Snap bearing to nearest angle multiple (for SHIFT+drag precision)
 * @param {number} bearing - Current bearing in degrees
 * @param {number} [snapAngle=45] - Snap angle increment
 * @returns {number} Snapped bearing
 */
export function snapBearing(bearing, snapAngle = ANGLE_SNAP_DEGREES) {
  const normalized = ((bearing % 360) + 360) % 360;
  const snapped = Math.round(normalized / snapAngle) * snapAngle;
  return snapped % 360;
}

/**
 * Calculate new position when dragging with angle constraint
 * @param {[number, number]} anchor - Anchor point (previous vertex)
 * @param {[number, number]} target - Target position (cursor)
 * @param {number} snapAngle - Angle snap increment
 * @returns {[number, number]} Constrained position
 */
export function constrainToAngle(
  anchor,
  target,
  snapAngle = ANGLE_SNAP_DEGREES,
) {
  const from = turf.point(anchor);
  const to = turf.point(target);

  const distance = turf.distance(from, to, { units: "meters" });
  const bearing = turf.bearing(from, to);
  const snappedBearing = snapBearing(bearing, snapAngle);

  const destination = turf.destination(from, distance, snappedBearing, {
    units: "meters",
  });
  return destination.geometry.coordinates;
}

// ============================================================
// VALIDATION SUITE
// ============================================================

/**
 * Comprehensive polygon validation
 * @param {Array<[number, number]>} ring - Ring to validate
 * @returns {{valid: boolean, errors: string[], warnings: string[], metrics: Object}}
 */
export function validatePolygon(ring) {
  const errors = [];
  const warnings = [];
  const metrics = {};

  // Normalize first
  const { ring: normalizedRing, errors: normErrors } = normalizeRing(ring);
  errors.push(...normErrors);

  if (normalizedRing.length < 4) {
    return {
      valid: false,
      errors: [...errors, "Polygon must have at least 3 vertices"],
      warnings,
      metrics: { area: 0, perimeter: 0, vertices: 0 },
    };
  }

  // Check self-intersection
  const { intersects, points: intersectionPoints } =
    detectSelfIntersection(normalizedRing);
  if (intersects) {
    errors.push(
      `Polygon self-intersects at ${intersectionPoints.length} point(s)`,
    );
  }

  // Calculate metrics
  const area = calculateArea(normalizedRing);
  const perimeter = calculatePerimeter(normalizedRing);
  const segments = calculateSegments(normalizedRing);
  const angles = calculateAngles(normalizedRing);
  const vertices = openRing(normalizedRing).length;

  metrics.area = area;
  metrics.perimeter = perimeter;
  metrics.vertices = vertices;
  metrics.segments = segments;
  metrics.angles = angles;
  metrics.selfIntersects = intersects;
  metrics.intersectionPoints = intersectionPoints;

  // Area checks
  if (area < 10) {
    warnings.push(`Site area is very small (${area.toFixed(1)} m²)`);
  }
  if (area > 100000) {
    warnings.push(
      `Site area is very large (${(area / 10000).toFixed(2)} hectares)`,
    );
  }

  // Segment length checks
  segments.forEach((seg) => {
    if (seg.length < 0.5) {
      warnings.push(
        `Segment ${seg.index + 1} is very short (${seg.length.toFixed(2)}m)`,
      );
    }
  });

  // Angle checks
  angles.forEach((ang) => {
    if (ang.angle < 15 || ang.angle > 345) {
      warnings.push(
        `Vertex ${ang.index + 1} has a very acute angle (${ang.angle.toFixed(1)}°)`,
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics,
  };
}

/**
 * Check if a move would create self-intersection
 * @param {Array<[number, number]>} ring - Current ring
 * @param {number} vertexIndex - Index of vertex being moved
 * @param {[number, number]} newPosition - Proposed new position
 * @returns {boolean} True if move would cause self-intersection
 */
export function wouldCauseSelfIntersection(ring, vertexIndex, newPosition) {
  const vertices = openRing(ring);
  const newVertices = [...vertices];
  newVertices[vertexIndex] = newPosition;
  const newRing = closeRing(newVertices);

  const { intersects } = detectSelfIntersection(newRing);
  return intersects;
}

// ============================================================
// GEOJSON CONVERSION
// ============================================================

/**
 * Create GeoJSON Polygon from ring
 * @param {Array<[number, number]>} ring - Closed ring
 * @returns {Object} GeoJSON Feature
 */
export function toGeoJSON(ring) {
  const validation = validatePolygon(ring);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    properties: {
      area: validation.metrics.area,
      perimeter: validation.metrics.perimeter,
      vertices: validation.metrics.vertices,
      valid: validation.valid,
    },
  };
}

/**
 * Parse GeoJSON to ring
 * @param {Object} geojson - GeoJSON Feature or Geometry
 * @returns {Array<[number, number]>} Ring coordinates
 */
export function fromGeoJSON(geojson) {
  if (!geojson) return [];

  const geometry = geojson.geometry || geojson;

  if (geometry.type !== "Polygon") {
    console.warn("Expected Polygon geometry, got:", geometry.type);
    return [];
  }

  return geometry.coordinates[0] || [];
}

/**
 * Convert to WKT format
 * @param {Array<[number, number]>} ring - Closed ring
 * @returns {string} WKT string
 */
export function toWKT(ring) {
  if (!ring || ring.length < 4) return "POLYGON EMPTY";

  const coords = ring.map((c) => `${c[0]} ${c[1]}`).join(", ");
  return `POLYGON ((${coords}))`;
}

/**
 * Parse WKT to ring
 * @param {string} wkt - WKT string
 * @returns {Array<[number, number]>} Ring coordinates
 */
export function fromWKT(wkt) {
  if (!wkt) return [];

  const match = wkt.match(/POLYGON\s*\(\(\s*(.+?)\s*\)\)/i);
  if (!match) return [];

  const coordPairs = match[1].split(",").map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return [lng, lat];
  });

  return coordPairs;
}

/**
 * Parse CSV to vertices (for paste support)
 * @param {string} csv - CSV string (lng,lat per line)
 * @returns {Array<[number, number]>} Coordinates
 */
export function fromCSV(csv) {
  if (!csv) return [];

  const lines = csv.trim().split("\n");
  const coords = [];

  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((s) => s.trim());
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lng) && !isNaN(lat)) {
        coords.push([roundCoord(lng), roundCoord(lat)]);
      }
    }
  }

  return coords;
}

/**
 * Export vertices to CSV
 * @param {Array<[number, number]>} ring - Ring coordinates
 * @returns {string} CSV string
 */
export function toCSV(ring) {
  const vertices = openRing(ring);
  return vertices.map((c) => `${c[0]},${c[1]}`).join("\n");
}

// ============================================================
// COORDINATE CONVERSION (for Google Maps integration)
// ============================================================

/**
 * Convert lat/lng array to GeoJSON ring
 * @param {Array<{lat: number, lng: number}>} latLngArray - Array of {lat, lng} objects
 * @returns {Array<[number, number]>} GeoJSON ring [lng, lat]
 */
export function latLngArrayToRing(latLngArray) {
  if (!latLngArray || latLngArray.length === 0) return [];

  const coords = latLngArray.map((p) => [roundCoord(p.lng), roundCoord(p.lat)]);
  return closeRing(coords);
}

/**
 * Convert GeoJSON ring to lat/lng array
 * @param {Array<[number, number]>} ring - GeoJSON ring
 * @returns {Array<{lat: number, lng: number}>} Array of {lat, lng} objects
 */
export function ringToLatLngArray(ring) {
  return openRing(ring).map((c) => ({ lat: c[1], lng: c[0] }));
}

export default {
  // Precision & normalization
  roundCoord,
  normalizePoint,
  coordToLatLng,
  latLngToCoord,

  // Ring operations
  isRingClosed,
  closeRing,
  openRing,
  removeDuplicates,
  normalizeRing,

  // Validation
  detectSelfIntersection,
  isClockwise,
  ensureOrientation,
  validatePolygon,
  wouldCauseSelfIntersection,

  // Metrics
  calculateArea,
  calculatePerimeter,
  calculateCentroid,
  calculateSegments,
  calculateAngles,

  // Snapping
  snapToVertex,
  snapToEdge,
  snapBearing,
  constrainToAngle,

  // Format conversion
  toGeoJSON,
  fromGeoJSON,
  toWKT,
  fromWKT,
  toCSV,
  fromCSV,
  latLngArrayToRing,
  ringToLatLngArray,

  // Constants
  EARTH_RADIUS_METERS,
  COORDINATE_PRECISION,
  MIN_VERTICES,
  SNAP_PIXEL_THRESHOLD,
  ANGLE_SNAP_DEGREES,
};
