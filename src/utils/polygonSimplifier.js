/**
 * Polygon Simplification Utility
 *
 * Uses Douglas-Peucker algorithm to simplify complex polygons
 * while preserving essential shape characteristics
 */

/**
 * Simplify a polygon using Douglas-Peucker algorithm
 * @param {Array} points - Array of {lat, lng} points
 * @param {number} tolerance - Maximum distance tolerance in meters (default 0.5m)
 * @returns {Array} Simplified polygon
 */
export function simplifyPolygon(points, tolerance = 0.5) {
  if (!points || points.length < 3) return points;

  // Convert tolerance from meters to degrees (approximate)
  const toleranceDeg = tolerance / 111000; // 1 degree ≈ 111km

  // Douglas-Peucker algorithm
  const simplified = douglasPeucker(points, toleranceDeg);

  // Ensure minimum vertices for valid polygon
  if (simplified.length < 3) {
    return points; // Return original if simplification went too far
  }

  // Detect and preserve right angles
  const anglePreserved = preserveRightAngles(simplified);

  console.log(`📐 Simplified polygon: ${points.length} → ${anglePreserved.length} vertices`);

  return anglePreserved;
}

/**
 * Douglas-Peucker line simplification algorithm
 */
function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;

  // Find point with maximum distance from line between first and last
  let maxDistance = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(
      points[i],
      points[0],
      points[points.length - 1]
    );

    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    // Recursive simplification
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Combine results (remove duplicate point)
    return left.slice(0, -1).concat(right);
  } else {
    // Return just the endpoints
    return [points[0], points[points.length - 1]];
  }
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  if (dx === 0 && dy === 0) {
    // Line start and end are the same
    return Math.sqrt(
      Math.pow(point.lat - lineStart.lat, 2) +
      Math.pow(point.lng - lineStart.lng, 2)
    );
  }

  const t = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) /
            (dx * dx + dy * dy);

  let closestPoint;
  if (t < 0) {
    closestPoint = lineStart;
  } else if (t > 1) {
    closestPoint = lineEnd;
  } else {
    closestPoint = {
      lat: lineStart.lat + t * dy,
      lng: lineStart.lng + t * dx
    };
  }

  return Math.sqrt(
    Math.pow(point.lat - closestPoint.lat, 2) +
    Math.pow(point.lng - closestPoint.lng, 2)
  );
}

/**
 * Detect and preserve right angles in polygon
 */
function preserveRightAngles(points, angleThreshold = 10) {
  if (points.length < 3) return points;

  const result = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];

    // Calculate angle at current vertex
    const angle = calculateAngle(prev, current, next);

    // Check if angle is close to 90° (within threshold)
    if (Math.abs(angle - 90) <= angleThreshold ||
        Math.abs(angle - 270) <= angleThreshold) {
      // Snap to right angle
      const snappedPoint = snapToRightAngle(prev, current, next);
      result.push(snappedPoint);
    } else {
      result.push(current);
    }
  }

  return result;
}

/**
 * Calculate angle between three points
 */
function calculateAngle(p1, p2, p3) {
  const bearing1 = calculateBearing(p2, p1);
  const bearing2 = calculateBearing(p2, p3);

  let angle = bearing2 - bearing1;
  if (angle < 0) angle += 360;

  return angle;
}

/**
 * Calculate bearing between two points
 */
function calculateBearing(from, to) {
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;

  return bearing;
}

/**
 * Snap point to create right angle
 */
function snapToRightAngle(prev, current, next) {
  // Calculate bearings
  const bearing1 = calculateBearing(prev, current);
  const bearing2 = calculateBearing(current, next);

  // Round bearing2 to nearest 90 degrees relative to bearing1
  const targetBearing = Math.round(bearing2 / 90) * 90;

  // Calculate distance to next point
  const distance = calculateDistance(current, next);

  // Calculate new position for current point to create right angle
  return calculateDestination(prev,
    calculateDistance(prev, current),
    Math.round(bearing1 / 90) * 90
  );
}

/**
 * Calculate distance between two points
 */
function calculateDistance(p1, p2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = p1.lat * Math.PI / 180;
  const φ2 = p2.lat * Math.PI / 180;
  const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
  const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

/**
 * Calculate destination point given start, distance, and bearing
 */
function calculateDestination(start, distance, bearing) {
  const R = 6371000; // Earth radius in meters
  const δ = distance / R;
  const θ = bearing * Math.PI / 180;
  const φ1 = start.lat * Math.PI / 180;
  const λ1 = start.lng * Math.PI / 180;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );

  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );

  return {
    lat: φ2 * 180 / Math.PI,
    lng: λ2 * 180 / Math.PI
  };
}

/**
 * Detect building type from polygon characteristics
 */
export function detectBuildingType(polygon) {
  const vertices = polygon.length;
  const area = calculatePolygonArea(polygon);
  const angles = calculateAllAngles(polygon);

  // Count right angles (85-95 degrees)
  const rightAngles = angles.filter(a => Math.abs(a - 90) <= 5).length;
  const rightAngleRatio = rightAngles / angles.length;

  // Detect shape type
  if (vertices === 4 && rightAngleRatio > 0.75) {
    return { type: 'rectangular', confidence: 0.95 };
  } else if (vertices === 6 && rightAngleRatio > 0.5) {
    return { type: 'L-shaped', confidence: 0.85 };
  } else if (vertices === 8 && rightAngleRatio > 0.5) {
    return { type: 'U-shaped', confidence: 0.80 };
  } else if (vertices > 8) {
    return { type: 'complex', confidence: 0.70 };
  } else {
    return { type: 'irregular', confidence: 0.60 };
  }
}

/**
 * Calculate all interior angles of polygon
 */
function calculateAllAngles(polygon) {
  const angles = [];

  for (let i = 0; i < polygon.length - 1; i++) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];

    angles.push(calculateAngle(prev, current, next));
  }

  return angles;
}

/**
 * Calculate polygon area
 */
function calculatePolygonArea(vertices) {
  if (!vertices || vertices.length < 3) return 0;

  const R = 6371000; // Earth radius in meters
  const centerLat = vertices.reduce((sum, v) => sum + v.lat, 0) / vertices.length;

  // Convert to Cartesian coordinates
  const cartesian = vertices.map(v => ({
    x: (v.lng - vertices[0].lng) * Math.PI / 180 * R * Math.cos(centerLat * Math.PI / 180),
    y: (v.lat - vertices[0].lat) * Math.PI / 180 * R
  }));

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < cartesian.length - 1; i++) {
    area += cartesian[i].x * cartesian[i + 1].y;
    area -= cartesian[i + 1].x * cartesian[i].y;
  }
  area = Math.abs(area) / 2;

  return area;
}