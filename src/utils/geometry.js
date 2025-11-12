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

