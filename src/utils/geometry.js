/**
 * Geometry utilities for site analysis and polygon operations
 */

/**
 * Calculate distance between two lat/lng points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

/**
 * Calculate all edge lengths of a polygon
 * @param {Array<{lat: number, lng: number}>} polygon
 * @returns {Array<{start: {lat, lng}, end: {lat, lng}, length: number, midpoint: {lat, lng}}>}
 */
export function calculateEdgeLengths(polygon) {
  if (!polygon || polygon.length < 2) return [];

  const edges = [];
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const length = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    const midpoint = {
      lat: (start.lat + end.lat) / 2,
      lng: (start.lng + end.lng) / 2
    };

    edges.push({
      start,
      end,
      length,
      midpoint,
      index: i
    });
  }

  return edges;
}

/**
 * Calculate perimeter of polygon
 * @param {Array<{lat: number, lng: number}>} polygon
 * @returns {number} Perimeter in meters
 */
export function calculatePerimeter(polygon) {
  const edges = calculateEdgeLengths(polygon);
  return edges.reduce((sum, edge) => sum + edge.length, 0);
}

/**
 * Compute area of a polygon using the Shoelace formula
 * @param {Array<{lat: number, lng: number}>} polygon - Array of lat/lng points
 * @returns {number} Area in square meters
 */
export function computePolygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;

  // Convert lat/lng to approximate meters using Haversine
  const toMeters = (lat, lng, refLat, refLng) => {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat - refLat) * Math.PI / 180;
    const dLng = (lng - refLng) * Math.PI / 180;
    const x = dLng * Math.cos((lat + refLat) / 2 * Math.PI / 180) * R;
    const y = dLat * R;
    return { x, y };
  };

  const ref = polygon[0];
  const points = polygon.map(p => toMeters(p.lat, p.lng, ref.lat, ref.lng));

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

/**
 * Compute centroid of a polygon
 * @param {Array<{lat: number, lng: number}>} polygon
 * @returns {{lat: number, lng: number}}
 */
export function computeCentroid(polygon) {
  if (!polygon || polygon.length === 0) return { lat: 0, lng: 0 };

  const sum = polygon.reduce((acc, p) => ({
    lat: acc.lat + p.lat,
    lng: acc.lng + p.lng
  }), { lat: 0, lng: 0 });

  return {
    lat: sum.lat / polygon.length,
    lng: sum.lng / polygon.length
  };
}

/**
 * Compute bounding box of a polygon
 * @param {Array<{lat: number, lng: number}>} polygon
 * @returns {{minLat: number, maxLat: number, minLng: number, maxLng: number}}
 */
export function computeBounds(polygon) {
  if (!polygon || polygon.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }

  return polygon.reduce((bounds, p) => ({
    minLat: Math.min(bounds.minLat, p.lat),
    maxLat: Math.max(bounds.maxLat, p.lat),
    minLng: Math.min(bounds.minLng, p.lng),
    maxLng: Math.max(bounds.maxLng, p.lng)
  }), {
    minLat: polygon[0].lat,
    maxLat: polygon[0].lat,
    minLng: polygon[0].lng,
    maxLng: polygon[0].lng
  });
}

/**
 * Compute primary orientation of a polygon using PCA
 * @param {Array<{lat: number, lng: number}>} polygon
 * @returns {number} Orientation in degrees (0-360, where 0 is North)
 */
export function computeOrientation(polygon) {
  if (!polygon || polygon.length < 3) return 0;

  const centroid = computeCentroid(polygon);

  // Convert to local coordinates
  const points = polygon.map(p => ({
    x: (p.lng - centroid.lng) * 111320 * Math.cos(centroid.lat * Math.PI / 180),
    y: (p.lat - centroid.lat) * 110540
  }));

  // Compute covariance matrix
  let xx = 0, xy = 0, yy = 0;
  points.forEach(p => {
    xx += p.x * p.x;
    xy += p.x * p.y;
    yy += p.y * p.y;
  });
  xx /= points.length;
  xy /= points.length;
  yy /= points.length;

  // Find principal axis (eigenvector of largest eigenvalue)
  const trace = xx + yy;
  const det = xx * yy - xy * xy;
  const lambda1 = trace / 2 + Math.sqrt(trace * trace / 4 - det);

  // Eigenvector
  let vx = xy;
  let vy = lambda1 - xx;
  const mag = Math.sqrt(vx * vx + vy * vy);
  if (mag > 0) {
    vx /= mag;
    vy /= mag;
  }

  // Convert to bearing (0 = North, clockwise)
  let angle = Math.atan2(vx, vy) * 180 / Math.PI;
  if (angle < 0) angle += 360;

  return angle;
}

/**
 * Create an inset (setback) polygon
 * @param {Array<{lat: number, lng: number}>} polygon
 * @param {number} setbackMeters - Setback distance in meters
 * @returns {Array<{lat: number, lng: number}>}
 */
export function computeSetbackPolygon(polygon, setbackMeters = 3) {
  if (!polygon || polygon.length < 3) return polygon;

  const centroid = computeCentroid(polygon);

  // Simple inset: move each point toward centroid
  return polygon.map(p => {
    const dx = centroid.lat - p.lat;
    const dy = centroid.lng - p.lng;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return p;

    // Convert setback to lat/lng degrees (approximate)
    const setbackLat = setbackMeters / 110540;
    const setbackLng = setbackMeters / (111320 * Math.cos(p.lat * Math.PI / 180));
    const setbackDeg = Math.sqrt(setbackLat * setbackLat + setbackLng * setbackLng);

    const ratio = Math.min(setbackDeg / dist, 0.9); // Don't collapse too much

    return {
      lat: p.lat + dx * ratio,
      lng: p.lng + dy * ratio
    };
  });
}

/**
 * Convert lat/lng polygon to local XY coordinates (meters)
 * @param {Array<{lat: number, lng: number}>} polygon
 * @param {{lat: number, lng: number}} origin - Reference point (usually centroid)
 * @returns {Array<{x: number, y: number}>}
 */
export function polygonToLocalXY(polygon, origin) {
  if (!polygon || polygon.length === 0) return [];

  return polygon.map(p => ({
    x: (p.lng - origin.lng) * 111320 * Math.cos(origin.lat * Math.PI / 180),
    y: (p.lat - origin.lat) * 110540
  }));
}

/**
 * Convert local XY coordinates back to lat/lng
 * @param {Array<{x: number, y: number}>} points
 * @param {{lat: number, lng: number}} origin
 * @returns {Array<{lat: number, lng: number}>}
 */
export function localXYToPolygon(points, origin) {
  if (!points || points.length === 0) return [];

  return points.map(p => ({
    lat: origin.lat + p.y / 110540,
    lng: origin.lng + p.x / (111320 * Math.cos(origin.lat * Math.PI / 180))
  }));
}

/**
 * Compute site metrics from polygon
 * @param {Array<{lat: number, lng: number}>} polygon
 * @returns {Object} Site metrics
 */
export function computeSiteMetrics(polygon) {
  if (!polygon || polygon.length < 3) {
    return {
      areaM2: 0,
      orientationDeg: 0,
      centroid: { lat: 0, lng: 0 },
      bounds: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
      setbackPolygon: [],
      edges: [],
      perimeterM: 0,
      vertices: 0
    };
  }

  const areaM2 = computePolygonArea(polygon);
  const orientationDeg = computeOrientation(polygon);
  const centroid = computeCentroid(polygon);
  const bounds = computeBounds(polygon);
  const setbackPolygon = computeSetbackPolygon(polygon, 3);
  const edges = calculateEdgeLengths(polygon);
  const perimeterM = calculatePerimeter(polygon);

  return {
    areaM2,
    orientationDeg,
    centroid,
    bounds,
    setbackPolygon,
    edges,
    perimeterM,
    vertices: polygon.length
  };
}

// ========================================
// BOUNDARY VALIDATION AND COMPLIANCE
// ========================================

/**
 * Check if a point is inside a polygon (ray casting algorithm)
 * @param {{x: number, y: number}} point - Point in XY coordinates
 * @param {Array<{x: number, y: number}>} polygon - Polygon vertices in XY
 * @returns {boolean} True if point is inside polygon
 */
export function pointInPolygon(point, polygon) {
  let inside = false;
  const { x, y } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Validate if a footprint is fully inside a boundary
 * @param {Array<{x, y}>} footprint - Building footprint in XY coordinates (meters)
 * @param {Array<{x, y}>} boundary - Site boundary in XY coordinates (meters)
 * @returns {Object} Validation result with compliance percentage
 */
export function validateFootprintInsideBoundary(footprint, boundary) {
  const result = {
    isValid: true,
    outsideVertices: [],
    compliancePercentage: 100,
    errors: []
  };

  // Check if all footprint vertices are inside boundary
  for (let i = 0; i < footprint.length; i++) {
    const vertex = footprint[i];
    if (!pointInPolygon(vertex, boundary)) {
      result.isValid = false;
      result.outsideVertices.push({
        index: i,
        vertex,
        message: `Vertex ${i + 1} at (${vertex.x.toFixed(2)}m, ${vertex.y.toFixed(2)}m) is outside site boundary`
      });
    }
  }

  // Calculate compliance percentage
  const insideCount = footprint.length - result.outsideVertices.length;
  result.compliancePercentage = (insideCount / footprint.length) * 100;

  // Add summary error
  if (!result.isValid) {
    result.errors.push(
      `Building footprint violates boundary: ${result.outsideVertices.length}/${footprint.length} vertices outside (${result.compliancePercentage.toFixed(1)}% compliance)`
    );
  }

  return result;
}

/**
 * Apply directional setbacks to a site boundary
 * @param {Array<{x, y}>} boundary - Site boundary in XY coordinates (meters)
 * @param {Object} setbacks - Setbacks in meters for each direction
 * @param {number} setbacks.front - Front setback
 * @param {number} setbacks.rear - Rear setback
 * @param {number} setbacks.sideLeft - Left side setback
 * @param {number} setbacks.sideRight - Right side setback
 * @param {number} [orientationDeg=0] - Building orientation (0 = North)
 * @returns {Array<{x, y}>} Buildable area polygon
 */
export function applyDirectionalSetbacks(boundary, setbacks, orientationDeg = 0) {
  // For now, use uniform setback (average)
  // TODO: Implement directional setbacks based on orientation
  const avgSetback = (
    setbacks.front +
    setbacks.rear +
    setbacks.sideLeft +
    setbacks.sideRight
  ) / 4;

  return insetPolygonUniform(boundary, avgSetback);
}

/**
 * Inset a polygon uniformly by a given distance
 * @param {Array<{x, y}>} polygon - Polygon in XY coordinates (meters)
 * @param {number} distance - Inset distance in meters
 * @returns {Array<{x, y}>} Inset polygon
 */
export function insetPolygonUniform(polygon, distance) {
  const centroid = {
    x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
    y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
  };

  // Move each vertex toward centroid by the setback distance
  return polygon.map(vertex => {
    const dx = centroid.x - vertex.x;
    const dy = centroid.y - vertex.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0 || dist < distance) return vertex;

    const ratio = distance / dist;
    return {
      x: vertex.x + dx * ratio,
      y: vertex.y + dy * ratio
    };
  });
}

/**
 * Clip footprint to buildable boundary (auto-correct)
 * @param {Array<{x, y}>} footprint - Proposed footprint in XY coordinates
 * @param {Array<{x, y}>} buildableBoundary - Buildable area boundary in XY
 * @returns {Array<{x, y}>} Corrected footprint
 */
export function clipFootprintToBoundary(footprint, buildableBoundary) {
  // Simplified: move outside vertices to nearest boundary point
  return footprint.map(vertex => {
    if (pointInPolygon(vertex, buildableBoundary)) {
      return vertex; // Already inside
    }

    // Find nearest point on boundary
    return nearestPointOnPolygon(vertex, buildableBoundary);
  });
}

/**
 * Find nearest point on a polygon boundary to a given point
 * @param {{x, y}} point - Point in XY coordinates
 * @param {Array<{x, y}>} polygon - Polygon in XY coordinates
 * @returns {{x, y}} Nearest point on polygon edge
 */
export function nearestPointOnPolygon(point, polygon) {
  let minDist = Infinity;
  let nearest = polygon[0];

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const edgePoint = nearestPointOnSegment(point, polygon[i], polygon[j]);
    const dist = distanceXY(point, edgePoint);

    if (dist < minDist) {
      minDist = dist;
      nearest = edgePoint;
    }
  }

  return nearest;
}

/**
 * Find nearest point on a line segment to a given point
 * @param {{x, y}} point - Point
 * @param {{x, y}} segmentStart - Segment start
 * @param {{x, y}} segmentEnd - Segment end
 * @returns {{x, y}} Nearest point on segment
 */
export function nearestPointOnSegment(point, segmentStart, segmentEnd) {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;

  if (dx === 0 && dy === 0) return segmentStart;

  const t = Math.max(0, Math.min(1,
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / (dx * dx + dy * dy)
  ));

  return {
    x: segmentStart.x + t * dx,
    y: segmentStart.y + t * dy
  };
}

/**
 * Calculate distance between two points in XY coordinates
 * @param {{x, y}} p1 - Point 1
 * @param {{x, y}} p2 - Point 2
 * @returns {number} Distance in meters
 */
export function distanceXY(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Validate and auto-correct building footprint
 * Ensures footprint respects site boundary and setbacks
 * @param {Object} params - Validation parameters
 * @param {Array<{lat, lng}>} params.siteBoundary - Site boundary in lat/lng
 * @param {Object} params.setbacks - Setbacks in meters
 * @param {Array<{x, y}>} params.proposedFootprint - Proposed footprint in XY (meters)
 * @param {{lat, lng}} params.origin - Reference origin for coordinate conversion
 * @returns {Object} Corrected footprint and validation results
 */
export function validateAndCorrectFootprint(params) {
  const { siteBoundary, setbacks, proposedFootprint, origin } = params;

  // Convert site boundary to XY coordinates
  const boundaryXY = polygonToLocalXY(siteBoundary, origin);

  // Apply setbacks to get buildable area
  const buildableBoundary = applyDirectionalSetbacks(boundaryXY, setbacks);

  // Validate proposed footprint
  const validation = validateFootprintInsideBoundary(proposedFootprint, buildableBoundary);

  // Auto-correct if needed
  let correctedFootprint = proposedFootprint;
  let wasCorrected = false;

  if (!validation.isValid) {
    console.warn(`⚠️  Footprint violates boundary/setbacks (${validation.compliancePercentage.toFixed(1)}% compliant), auto-correcting...`);
    correctedFootprint = clipFootprintToBoundary(proposedFootprint, buildableBoundary);
    wasCorrected = true;

    // Re-validate corrected footprint
    const revalidation = validateFootprintInsideBoundary(correctedFootprint, buildableBoundary);
    console.log(`✅ Corrected footprint compliance: ${revalidation.compliancePercentage.toFixed(1)}%`);
  } else {
    console.log(`✅ Footprint respects boundaries and setbacks (100% compliant)`);
  }

  return {
    correctedFootprint,
    originalFootprint: proposedFootprint,
    buildableBoundary,
    boundaryXY,
    validation,
    wasCorrected,
    origin
  };
}

