/**
 * Site Polygon Utilities
 * 
 * Helper functions for polygon angle/length calculations and auto-fix logic
 */

import { calculateDistance, calculateEdgeLengths } from './geometry.js';

/**
 * Calculate angle at vertex (interior angle)
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @param {number} index - Vertex index
 * @returns {number} Angle in degrees (0-360)
 */
export function calculateVertexAngle(polygon, index) {
  if (!polygon || polygon.length < 3) return 0;
  
  const n = polygon.length;
  const prev = polygon[(index - 1 + n) % n];
  const curr = polygon[index];
  const next = polygon[(index + 1) % n];
  
  // Vectors from current vertex
  const v1 = { x: prev.lng - curr.lng, y: prev.lat - curr.lat };
  const v2 = { x: next.lng - curr.lng, y: next.lat - curr.lat };
  
  // Calculate angle between vectors
  const dot = v1.x * v2.x + v1.y * v2.y;
  const det = v1.x * v2.y - v1.y * v2.x;
  let angle = Math.atan2(det, dot) * 180 / Math.PI;
  
  // Normalize to 0-360
  if (angle < 0) angle += 360;
  
  return angle;
}

/**
 * Calculate all vertex angles
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @returns {Array<number>} Array of angles in degrees
 */
export function calculateAllAngles(polygon) {
  if (!polygon || polygon.length < 3) return [];
  
  return polygon.map((_, index) => calculateVertexAngle(polygon, index));
}

/**
 * Adjust segment length while maintaining angle
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @param {number} segmentIndex - Segment index (from vertex index to next)
 * @param {number} newLength - New length in meters
 * @returns {Array<{lat: number, lng: number}>} Updated polygon
 */
export function adjustSegmentLength(polygon, segmentIndex, newLength) {
  if (!polygon || polygon.length < 3) return polygon;
  
  const n = polygon.length;
  const startVertex = polygon[segmentIndex];
  const endVertex = polygon[(segmentIndex + 1) % n];
  
  // Calculate current bearing
  const bearing = calculateBearing(startVertex, endVertex);
  
  // Calculate new end point at newLength distance
  const newEndVertex = calculateDestinationPoint(startVertex, bearing, newLength);
  
  // Create updated polygon
  const updated = [...polygon];
  updated[(segmentIndex + 1) % n] = newEndVertex;
  
  return updated;
}

/**
 * Adjust angle at vertex while maintaining segment lengths
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @param {number} vertexIndex - Vertex index
 * @param {number} newAngle - New interior angle in degrees
 * @returns {Array<{lat: number, lng: number}>} Updated polygon
 */
export function adjustVertexAngle(polygon, vertexIndex, newAngle) {
  if (!polygon || polygon.length < 3) return polygon;
  
  const n = polygon.length;
  const curr = polygon[vertexIndex];
  const prev = polygon[(vertexIndex - 1 + n) % n];
  const next = polygon[(vertexIndex + 1) % n];
  
  // Calculate current bearing from prev to curr
  const bearingToCurr = calculateBearing(prev, curr);
  
  // Calculate distance from curr to next
  const distanceToNext = calculateDistance(curr.lat, curr.lng, next.lat, next.lng);
  
  // Calculate new bearing from curr to next
  // Interior angle relates to turn angle
  const turnAngle = 180 - newAngle;
  const newBearing = (bearingToCurr + turnAngle + 360) % 360;
  
  // Calculate new next vertex position
  const newNext = calculateDestinationPoint(curr, newBearing, distanceToNext);
  
  // Create updated polygon
  const updated = [...polygon];
  updated[(vertexIndex + 1) % n] = newNext;
  
  return updated;
}

/**
 * Calculate bearing between two points
 * @param {{lat: number, lng: number}} point1 - Start point
 * @param {{lat: number, lng: number}} point2 - End point
 * @returns {number} Bearing in degrees (0-360)
 */
function calculateBearing(point1, point2) {
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  
  return bearing;
}

/**
 * Calculate destination point given start, bearing, and distance
 * @param {{lat: number, lng: number}} start - Start point
 * @param {number} bearing - Bearing in degrees
 * @param {number} distance - Distance in meters
 * @returns {{lat: number, lng: number}} Destination point
 */
function calculateDestinationPoint(start, bearing, distance) {
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
    lng: λ2 * 180 / Math.PI,
  };
}

/**
 * Validate polygon angles (detect invalid/degenerate cases)
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @returns {Object} Validation result
 */
export function validatePolygonAngles(polygon) {
  if (!polygon || polygon.length < 3) {
    return { isValid: false, errors: ['Polygon must have at least 3 vertices'], invalidIndices: [] };
  }
  
  const angles = calculateAllAngles(polygon);
  const errors = [];
  const invalidIndices = [];
  
  angles.forEach((angle, index) => {
    // Check for near-zero or near-360 angles (degenerate)
    if (angle < 5 || angle > 355) {
      errors.push(`Vertex ${index + 1}: Angle ${angle.toFixed(1)}° is too acute/obtuse (degenerate)`);
      invalidIndices.push(index);
    }
    
    // Check for near-180 angles (collinear)
    if (Math.abs(angle - 180) < 2) {
      errors.push(`Vertex ${index + 1}: Angle ${angle.toFixed(1)}° is nearly collinear`);
      invalidIndices.push(index);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    invalidIndices,
    angles,
  };
}

/**
 * Auto-fix invalid polygon angles
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @returns {Array<{lat: number, lng: number}>} Fixed polygon
 */
export function autoFixPolygonAngles(polygon) {
  if (!polygon || polygon.length < 3) return polygon;
  
  const validation = validatePolygonAngles(polygon);
  if (validation.isValid) return polygon;
  
  let fixed = [...polygon];
  
  // Remove nearly collinear vertices
  validation.invalidIndices.forEach((index) => {
    const angle = validation.angles[index];
    
    // If nearly collinear (180°), remove this vertex
    if (Math.abs(angle - 180) < 2 && fixed.length > 3) {
      fixed = fixed.filter((_, i) => i !== index);
    }
    // If too acute (<5°) or too obtuse (>355°), adjust slightly
    else if (angle < 5 || angle > 355) {
      // Nudge the vertex slightly to create a valid angle
      const targetAngle = angle < 5 ? 15 : 345;
      fixed = adjustVertexAngle(fixed, index, targetAngle);
    }
  });
  
  return fixed;
}

/**
 * Calculate segment data for UI display
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @returns {Array<Object>} Segment data with length, angle, bearing
 */
export function calculateSegmentData(polygon) {
  if (!polygon || polygon.length < 3) return [];
  
  const edges = calculateEdgeLengths(polygon);
  const angles = calculateAllAngles(polygon);
  
  return edges.map((edge, index) => ({
    index,
    start: edge.start,
    end: edge.end,
    length: edge.length,
    midpoint: edge.midpoint,
    angle: angles[index],
    bearing: calculateBearing(edge.start, edge.end),
  }));
}

/**
 * Format angle for display
 * @param {number} angle - Angle in degrees
 * @returns {string} Formatted angle
 */
export function formatAngle(angle) {
  return `${angle.toFixed(1)}°`;
}

/**
 * Format length for display
 * @param {number} length - Length in meters
 * @returns {Object} Formatted lengths in multiple units
 */
export function formatLength(length) {
  return {
    meters: `${length.toFixed(2)}m`,
    feet: `${(length * 3.28084).toFixed(1)}ft`,
    value: length,
  };
}

/**
 * Check if polygon is self-intersecting
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon vertices
 * @returns {boolean} True if self-intersecting
 */
export function isSelfIntersecting(polygon) {
  if (!polygon || polygon.length < 4) return false;
  
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const seg1Start = polygon[i];
    const seg1End = polygon[(i + 1) % n];
    
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent segments
      if (j === (i + n - 1) % n) continue;
      
      const seg2Start = polygon[j];
      const seg2End = polygon[(j + 1) % n];
      
      if (segmentsIntersect(seg1Start, seg1End, seg2Start, seg2End)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if two line segments intersect
 * @private
 */
function segmentsIntersect(p1, p2, p3, p4) {
  const ccw = (A, B, C) => {
    return (C.lat - A.lat) * (B.lng - A.lng) > (B.lat - A.lat) * (C.lng - A.lng);
  };
  
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

export default {
  calculateVertexAngle,
  calculateAllAngles,
  adjustSegmentLength,
  adjustVertexAngle,
  validatePolygonAngles,
  autoFixPolygonAngles,
  calculateSegmentData,
  formatAngle,
  formatLength,
  isSelfIntersecting,
};

