/**
 * GeometryMath.js
 * 
 * Robust geometric calculations for polygon editing on Google Maps
 * Handles coordinate transformations, distance calculations, and bearing computations
 * 
 * @module GeometryMath
 */

const EARTH_RADIUS_METERS = 6371000; // Earth's radius in meters

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
export function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param {number} radians - Angle in radians
 * @returns {number} Angle in degrees
 */
export function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

/**
 * Calculate distance between two lat/lng points using Haversine formula
 * @param {{lat: number, lng: number}} point1 - First coordinate
 * @param {{lat: number, lng: number}} point2 - Second coordinate
 * @returns {number} Distance in meters
 */
export function getDistance(point1, point2) {
  const lat1 = toRadians(point1.lat);
  const lat2 = toRadians(point2.lat);
  const deltaLat = toRadians(point2.lat - point1.lat);
  const deltaLng = toRadians(point2.lng - point1.lng);

  const a = 
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculate bearing from point1 to point2
 * @param {{lat: number, lng: number}} point1 - Start coordinate
 * @param {{lat: number, lng: number}} point2 - End coordinate
 * @returns {number} Bearing in degrees (0-360)
 */
export function getBearing(point1, point2) {
  const lat1 = toRadians(point1.lat);
  const lat2 = toRadians(point2.lat);
  const deltaLng = toRadians(point2.lng - point1.lng);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  
  const bearing = toDegrees(Math.atan2(y, x));
  
  return (bearing + 360) % 360;
}

/**
 * Move a point by a distance and bearing
 * @param {{lat: number, lng: number}} point - Starting coordinate
 * @param {number} distance - Distance in meters
 * @param {number} bearing - Bearing in degrees
 * @returns {{lat: number, lng: number}} New coordinate
 */
export function movePointByDistanceAndBearing(point, distance, bearing) {
  const lat1 = toRadians(point.lat);
  const lng1 = toRadians(point.lng);
  const bearingRad = toRadians(bearing);
  const angularDistance = distance / EARTH_RADIUS_METERS;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2)
  };
}

/**
 * Calculate the angle between three points (vertex at point2)
 * @param {{lat: number, lng: number}} point1 - First point
 * @param {{lat: number, lng: number}} point2 - Vertex point
 * @param {{lat: number, lng: number}} point3 - Third point
 * @returns {number} Interior angle in degrees (0-360)
 */
export function getAngleBetweenPoints(point1, point2, point3) {
  const bearing1 = getBearing(point2, point1);
  const bearing2 = getBearing(point2, point3);
  
  let angle = bearing2 - bearing1;
  
  if (angle < 0) {
    angle += 360;
  }
  
  return angle;
}

/**
 * Calculate polygon area using spherical excess formula
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {number} Area in square meters
 */
export function getPolygonArea(polygon) {
  if (polygon.length < 3) return 0;

  let area = 0;
  const points = [...polygon];
  
  // Ensure polygon is closed
  if (points[0].lat !== points[points.length - 1].lat || 
      points[0].lng !== points[points.length - 1].lng) {
    points.push(points[0]);
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    area += toRadians(p2.lng - p1.lng) * 
            (2 + Math.sin(toRadians(p1.lat)) + Math.sin(toRadians(p2.lat)));
  }

  area = Math.abs(area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS / 2);
  
  return area;
}

/**
 * Calculate polygon perimeter
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {number} Perimeter in meters
 */
export function getPolygonPerimeter(polygon) {
  if (polygon.length < 2) return 0;

  let perimeter = 0;
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    perimeter += getDistance(p1, p2);
  }
  
  return perimeter;
}

/**
 * Calculate polygon centroid
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {{lat: number, lng: number}} Centroid coordinate
 */
export function getPolygonCentroid(polygon) {
  if (polygon.length === 0) return { lat: 0, lng: 0 };
  
  let latSum = 0;
  let lngSum = 0;
  
  polygon.forEach(point => {
    latSum += point.lat;
    lngSum += point.lng;
  });
  
  return {
    lat: latSum / polygon.length,
    lng: lngSum / polygon.length
  };
}

/**
 * Calculate segment lengths for all edges
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {Array<number>} Array of segment lengths in meters
 */
export function getSegmentLengths(polygon) {
  if (polygon.length < 2) return [];
  
  const lengths = [];
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    lengths.push(getDistance(p1, p2));
  }
  
  return lengths;
}

/**
 * Calculate interior angles at each vertex
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {Array<number>} Array of angles in degrees
 */
export function getSegmentAngles(polygon) {
  if (polygon.length < 3) return [];
  
  const angles = [];
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[(i - 1 + polygon.length) % polygon.length];
    const p2 = polygon[i];
    const p3 = polygon[(i + 1) % polygon.length];
    
    angles.push(getAngleBetweenPoints(p1, p2, p3));
  }
  
  return angles;
}

/**
 * Adjust polygon segment length while maintaining other vertices
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @param {number} segmentIndex - Index of segment to adjust
 * @param {number} newLength - New length in meters
 * @returns {Array<{lat: number, lng: number}>} Adjusted polygon
 */
export function adjustSegmentLength(polygon, segmentIndex, newLength) {
  if (segmentIndex < 0 || segmentIndex >= polygon.length) return polygon;
  
  const newPolygon = [...polygon];
  const p1 = polygon[segmentIndex];
  const p2 = polygon[(segmentIndex + 1) % polygon.length];
  
  const currentBearing = getBearing(p1, p2);
  const newP2 = movePointByDistanceAndBearing(p1, newLength, currentBearing);
  
  newPolygon[(segmentIndex + 1) % polygon.length] = newP2;
  
  return newPolygon;
}

/**
 * Adjust polygon vertex angle while maintaining segment lengths
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @param {number} vertexIndex - Index of vertex to adjust
 * @param {number} newAngle - New interior angle in degrees
 * @returns {Array<{lat: number, lng: number}>} Adjusted polygon
 */
export function adjustVertexAngle(polygon, vertexIndex, newAngle) {
  if (vertexIndex < 0 || vertexIndex >= polygon.length || polygon.length < 3) {
    return polygon;
  }
  
  const newPolygon = [...polygon];
  
  const prevIndex = (vertexIndex - 1 + polygon.length) % polygon.length;
  const nextIndex = (vertexIndex + 1) % polygon.length;
  
  const p1 = polygon[prevIndex];
  const p2 = polygon[vertexIndex];
  const p3 = polygon[nextIndex];
  
  const currentAngle = getAngleBetweenPoints(p1, p2, p3);
  const angleDelta = newAngle - currentAngle;
  
  const bearingToNext = getBearing(p2, p3);
  const newBearing = (bearingToNext + angleDelta + 360) % 360;
  
  const distanceToNext = getDistance(p2, p3);
  const newP3 = movePointByDistanceAndBearing(p2, distanceToNext, newBearing);
  
  newPolygon[nextIndex] = newP3;
  
  return newPolygon;
}

/**
 * Check if polygon is self-intersecting
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {boolean} True if polygon self-intersects
 */
export function isPolygonSelfIntersecting(polygon) {
  if (polygon.length < 4) return false;
  
  for (let i = 0; i < polygon.length; i++) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % polygon.length];
    
    for (let j = i + 2; j < polygon.length; j++) {
      if (j === (i + polygon.length - 1) % polygon.length) continue;
      
      const b1 = polygon[j];
      const b2 = polygon[(j + 1) % polygon.length];
      
      if (doSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if two line segments intersect
 * @param {{lat: number, lng: number}} p1 - First point of segment 1
 * @param {{lat: number, lng: number}} p2 - Second point of segment 1
 * @param {{lat: number, lng: number}} p3 - First point of segment 2
 * @param {{lat: number, lng: number}} p4 - Second point of segment 2
 * @returns {boolean} True if segments intersect
 */
function doSegmentsIntersect(p1, p2, p3, p4) {
  const ccw = (a, b, c) => {
    return (c.lng - a.lng) * (b.lat - a.lat) > (b.lng - a.lng) * (c.lat - a.lat);
  };
  
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/**
 * Snap polygon closure (ensure first and last points match)
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {Array<{lat: number, lng: number}>} Closed polygon
 */
export function snapPolygonClosure(polygon) {
  if (polygon.length < 2) return polygon;
  
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  
  const distance = getDistance(first, last);
  
  // If last point is very close to first (within 1 meter), snap it
  if (distance < 1) {
    return [...polygon.slice(0, -1), { ...first }];
  }
  
  return polygon;
}

/**
 * Convert polygon to GeoJSON format
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @returns {Object} GeoJSON Polygon object
 */
export function polygonToGeoJSON(polygon) {
  const coordinates = polygon.map(p => [p.lng, p.lat]);
  
  // Ensure closure
  if (coordinates.length > 0 && 
      (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
       coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
    coordinates.push([...coordinates[0]]);
  }
  
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates]
    },
    properties: {
      area: getPolygonArea(polygon),
      perimeter: getPolygonPerimeter(polygon)
    }
  };
}

/**
 * Convert GeoJSON to polygon format
 * @param {Object} geojson - GeoJSON Polygon object
 * @returns {Array<{lat: number, lng: number}>} Array of coordinates
 */
export function geoJSONToPolygon(geojson) {
  if (!geojson || !geojson.geometry || geojson.geometry.type !== 'Polygon') {
    return [];
  }
  
  const coordinates = geojson.geometry.coordinates[0];
  
  return coordinates.slice(0, -1).map(coord => ({
    lat: coord[1],
    lng: coord[0]
  }));
}

/**
 * Simplify polygon using Douglas-Peucker algorithm
 * @param {Array<{lat: number, lng: number}>} polygon - Array of coordinates
 * @param {number} tolerance - Tolerance in meters
 * @returns {Array<{lat: number, lng: number}>} Simplified polygon
 */
export function simplifyPolygon(polygon, tolerance = 1) {
  if (polygon.length < 3) return polygon;
  
  const perpendicularDistance = (point, lineStart, lineEnd) => {
    const x = point.lng;
    const y = point.lat;
    const x1 = lineStart.lng;
    const y1 = lineStart.lat;
    const x2 = lineEnd.lng;
    const y2 = lineEnd.lat;
    
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    
    let xx, yy;
    
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    
    return getDistance(point, { lat: yy, lng: xx });
  };
  
  const douglasPeucker = (points, epsilon) => {
    if (points.length < 3) return points;
    
    let maxDistance = 0;
    let index = 0;
    
    for (let i = 1; i < points.length - 1; i++) {
      const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    
    if (maxDistance > epsilon) {
      const left = douglasPeucker(points.slice(0, index + 1), epsilon);
      const right = douglasPeucker(points.slice(index), epsilon);
      
      return [...left.slice(0, -1), ...right];
    }
    
    return [points[0], points[points.length - 1]];
  };
  
  return douglasPeucker(polygon, tolerance);
}

