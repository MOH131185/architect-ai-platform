/**
 * Map Utilities - Geometry Calculations
 *
 * Pure utility functions for computing polygon geometry:
 * - Segment lengths using Haversine formula
 * - Interior angles between edges
 * - Area using Shoelace formula
 * - Centroid calculation
 * - DNA conversion for workflow integration
 */

/**
 * Earth's radius in meters for Haversine calculations
 */
const EARTH_RADIUS_M = 6371000;

/**
 * Convert degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
export function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 * @param {number} rad - Angle in radians
 * @returns {number} Angle in degrees
 */
export function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} p1 - First point {lat, lng}
 * @param {Object} p2 - Second point {lat, lng}
 * @returns {number} Distance in meters
 */
export function haversineDistance(p1, p2) {
  const lat1 = toRadians(p1.lat);
  const lat2 = toRadians(p2.lat);
  const deltaLat = toRadians(p2.lat - p1.lat);
  const deltaLng = toRadians(p2.lng - p1.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Compute segment lengths for all edges of a polygon
 * @param {Array<{lat: number, lng: number}>} polygon - Array of polygon vertices
 * @returns {Array<{index: number, from: number, to: number, length: number}>} Segment data
 */
export function computeSegmentLengths(polygon) {
  if (!polygon || polygon.length < 2) return [];

  const segments = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const length = haversineDistance(p1, p2);

    segments.push({
      index: i + 1,
      from: i,
      to: (i + 1) % n,
      length: Math.round(length * 100) / 100, // Round to 2 decimal places
    });
  }

  return segments;
}

/**
 * Calculate angle between two vectors
 * @param {Object} v1 - First vector {x, y}
 * @param {Object} v2 - Second vector {x, y}
 * @returns {number} Angle in degrees
 */
function angleBetweenVectors(v1, v2) {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  const angle = Math.atan2(cross, dot);
  return toDegrees(angle);
}

/**
 * Compute interior angles at each vertex of a polygon
 * @param {Array<{lat: number, lng: number}>} polygon - Array of polygon vertices
 * @returns {Array<{index: number, angle: number}>} Angle data at each vertex
 */
export function computeAngles(polygon) {
  if (!polygon || polygon.length < 3) return [];

  const angles = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    // Vectors from current vertex to neighbors
    const v1 = {
      x: prev.lng - curr.lng,
      y: prev.lat - curr.lat,
    };
    const v2 = {
      x: next.lng - curr.lng,
      y: next.lat - curr.lat,
    };

    // Calculate interior angle
    let angle = angleBetweenVectors(v1, v2);

    // Ensure positive angle (interior)
    if (angle < 0) {
      angle = 360 + angle;
    }

    angles.push({
      index: i + 1,
      vertex: i,
      angle: Math.round(angle * 10) / 10, // Round to 1 decimal place
    });
  }

  return angles;
}

/**
 * Compute polygon area using Shoelace formula (Surveyor's formula)
 * Adapted for geographic coordinates
 * @param {Array<{lat: number, lng: number}>} polygon - Array of polygon vertices
 * @returns {number} Area in square meters
 */
export function computeArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;

  const n = polygon.length;

  // Convert to approximate planar coordinates (meters from centroid)
  const centroid = computeCentroid(polygon);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(centroid.lat));

  const planarPoints = polygon.map((p) => ({
    x: (p.lng - centroid.lng) * metersPerDegreeLng,
    y: (p.lat - centroid.lat) * metersPerDegreeLat,
  }));

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += planarPoints[i].x * planarPoints[j].y;
    area -= planarPoints[j].x * planarPoints[i].y;
  }

  return Math.abs(area / 2);
}

/**
 * Compute centroid (geometric center) of a polygon
 * @param {Array<{lat: number, lng: number}>} polygon - Array of polygon vertices
 * @returns {{lat: number, lng: number}} Centroid coordinates
 */
export function computeCentroid(polygon) {
  if (!polygon || polygon.length === 0) {
    return { lat: 0, lng: 0 };
  }

  const n = polygon.length;
  let sumLat = 0;
  let sumLng = 0;

  for (const point of polygon) {
    sumLat += point.lat;
    sumLng += point.lng;
  }

  return {
    lat: sumLat / n,
    lng: sumLng / n,
  };
}

/**
 * Compute total perimeter of a polygon
 * @param {Array<{lat: number, lng: number}>} polygon - Array of polygon vertices
 * @returns {number} Perimeter in meters
 */
export function computePerimeter(polygon) {
  const segments = computeSegmentLengths(polygon);
  return segments.reduce((sum, seg) => sum + seg.length, 0);
}

/**
 * Convert polygon data to DNA format for workflow integration
 * @param {Array<{lat: number, lng: number}>} polygon - Array of polygon vertices
 * @returns {Object} DNA-compatible boundary data
 */
export function convertToDNA(polygon) {
  if (!polygon || polygon.length < 3) {
    return null;
  }

  const segments = computeSegmentLengths(polygon);
  const angles = computeAngles(polygon);
  const area = computeArea(polygon);
  const perimeter = computePerimeter(polygon);
  const centroid = computeCentroid(polygon);

  // Calculate bounding box
  const lats = polygon.map((p) => p.lat);
  const lngs = polygon.map((p) => p.lng);
  const bounds = {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };

  // Calculate approximate dimensions
  const width = haversineDistance(
    { lat: centroid.lat, lng: bounds.west },
    { lat: centroid.lat, lng: bounds.east }
  );
  const length = haversineDistance(
    { lat: bounds.south, lng: centroid.lng },
    { lat: bounds.north, lng: centroid.lng }
  );

  return {
    vertices: polygon.map((p, i) => ({
      index: i,
      lat: p.lat,
      lng: p.lng,
    })),
    segments: segments.map((s) => ({
      index: s.index,
      length: s.length,
    })),
    angles: angles.map((a) => ({
      vertex: a.index,
      angle: a.angle,
    })),
    metrics: {
      area: Math.round(area * 100) / 100,
      perimeter: Math.round(perimeter * 100) / 100,
      vertexCount: polygon.length,
      approximateDimensions: {
        width: Math.round(width * 100) / 100,
        length: Math.round(length * 100) / 100,
      },
    },
    centroid,
    bounds,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a mock rectangular boundary around a center point
 * Used as placeholder until real API integration
 * @param {{lat: number, lng: number}} center - Center coordinates
 * @param {number} widthMeters - Width in meters
 * @param {number} heightMeters - Height in meters
 * @returns {Array<{lat: number, lng: number}>} Rectangular polygon vertices
 */
export function generateMockBoundary(center, widthMeters = 30, heightMeters = 25) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(center.lat));

  const halfWidth = widthMeters / 2 / metersPerDegreeLng;
  const halfHeight = heightMeters / 2 / metersPerDegreeLat;

  return [
    { lat: center.lat + halfHeight, lng: center.lng - halfWidth }, // NW
    { lat: center.lat + halfHeight, lng: center.lng + halfWidth }, // NE
    { lat: center.lat - halfHeight, lng: center.lng + halfWidth }, // SE
    { lat: center.lat - halfHeight, lng: center.lng - halfWidth }, // SW
  ];
}

/**
 * Fetch auto-detected boundary for an address
 * Currently returns mock data - replace with real API call
 * @param {string} address - Address string
 * @param {{lat: number, lng: number}} coordinates - Geocoded coordinates
 * @returns {Promise<Array<{lat: number, lng: number}>>} Polygon vertices
 */
export async function fetchAutoBoundary(address, coordinates) {
  // TODO: Replace with real boundary detection API
  // Options: OpenStreetMap Nominatim, Google Places, custom ML service

  // For now, generate a mock rectangular boundary
  // Vary size slightly based on address hash for variety
  const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const width = 25 + (hash % 20);
  const height = 20 + (hash % 15);

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  return generateMockBoundary(coordinates, width, height);
}

/**
 * Validate polygon geometry
 * @param {Array<{lat: number, lng: number}>} polygon - Array of polygon vertices
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validatePolygon(polygon) {
  const errors = [];

  if (!polygon || !Array.isArray(polygon)) {
    errors.push('Polygon must be an array');
    return { valid: false, errors };
  }

  if (polygon.length < 3) {
    errors.push('Polygon must have at least 3 vertices');
  }

  // Check for valid coordinates
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
      errors.push(`Vertex ${i} has invalid coordinates`);
    }
    if (p.lat < -90 || p.lat > 90) {
      errors.push(`Vertex ${i} latitude out of range`);
    }
    if (p.lng < -180 || p.lng > 180) {
      errors.push(`Vertex ${i} longitude out of range`);
    }
  }

  // Check for reasonable area (not too small or too large)
  if (polygon.length >= 3) {
    const area = computeArea(polygon);
    if (area < 10) {
      errors.push('Site area is too small (< 10 m²)');
    }
    if (area > 100000) {
      errors.push('Site area is too large (> 100,000 m²)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
