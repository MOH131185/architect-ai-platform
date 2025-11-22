/**
 * Entrance Orientation Detection
 * 
 * Automatically infer the optimal entrance direction based on site geometry,
 * road access, and solar orientation.
 */

import { computeSiteMetrics, calculateEdgeLengths, computeOrientation } from './geometry.js';

/**
 * Cardinal directions with degree ranges
 */
const DIRECTIONS = {
  N: { label: 'North', min: 337.5, max: 22.5, bearing: 0 },
  NE: { label: 'Northeast', min: 22.5, max: 67.5, bearing: 45 },
  E: { label: 'East', min: 67.5, max: 112.5, bearing: 90 },
  SE: { label: 'Southeast', min: 112.5, max: 157.5, bearing: 135 },
  S: { label: 'South', min: 157.5, max: 202.5, bearing: 180 },
  SW: { label: 'Southwest', min: 202.5, max: 247.5, bearing: 225 },
  W: { label: 'West', min: 247.5, max: 292.5, bearing: 270 },
  NW: { label: 'Northwest', min: 292.5, max: 337.5, bearing: 315 }
};

/**
 * Convert bearing to cardinal direction
 * @param {number} bearing - Bearing in degrees (0-360)
 * @returns {string} Cardinal direction code
 */
function bearingToDirection(bearing) {
  // Normalize bearing
  const normalized = ((bearing % 360) + 360) % 360;

  for (const [code, dir] of Object.entries(DIRECTIONS)) {
    if (dir.min > dir.max) {
      // Handle wrap-around (North)
      if (normalized >= dir.min || normalized < dir.max) {
        return code;
      }
    } else {
      if (normalized >= dir.min && normalized < dir.max) {
        return code;
      }
    }
  }

  return 'N'; // Default
}

/**
 * Calculate bearing between two points
 * @param {{lat: number, lng: number}} point1 - Start point
 * @param {{lat: number, lng: number}} point2 - End point
 * @returns {number} Bearing in degrees
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
 * Find longest edge of polygon (likely street-facing)
 * @param {Array<{lat: number, lng: number}>} sitePolygon - Site boundary
 * @returns {Object|null} Longest edge with bearing
 */
function findLongestEdge(sitePolygon) {
  if (!sitePolygon || sitePolygon.length < 3) return null;

  const edges = calculateEdgeLengths(sitePolygon);
  if (edges.length === 0) return null;

  // Find longest edge
  let longestEdge = edges[0];
  for (const edge of edges) {
    if (edge.length > longestEdge.length) {
      longestEdge = edge;
    }
  }

  // Calculate perpendicular bearing (inward-facing)
  const edgeBearing = calculateBearing(longestEdge.start, longestEdge.end);
  const perpendicularBearing = (edgeBearing + 90) % 360;

  return {
    edge: longestEdge,
    edgeBearing,
    perpendicularBearing,
    length: longestEdge.length
  };
}

/**
 * Calculate solar gain score for direction
 * @param {string} direction - Cardinal direction
 * @param {Object} sunPath - Sun path data
 * @returns {number} Solar gain score (0-1)
 */
function calculateSolarScore(direction, sunPath) {
  // South-facing is optimal in Northern Hemisphere
  // Adjust based on hemisphere if needed
  const optimalBearing = 180; // South

  const dir = DIRECTIONS[direction];
  if (!dir) return 0.5;

  const bearingDiff = Math.abs(dir.bearing - optimalBearing);
  const normalizedDiff = Math.min(bearingDiff, 360 - bearingDiff);

  // Score decreases as we move away from south
  return 1 - (normalizedDiff / 180);
}

/**
 * Infer optimal entrance direction
 * @param {Object} params - Detection parameters
 * @param {Array<{lat: number, lng: number}>} params.sitePolygon - Site boundary polygon
 * @param {Array<Object>} params.roadSegments - Nearby road segments (optional)
 * @param {Object} params.sunPath - Sun path data (optional)
 * @returns {Object} Inference result
 */
export function inferEntranceDirection({ sitePolygon, roadSegments = null, sunPath = null }) {
  const rationale = [];
  let direction = 'N';
  let confidence = 0.5;
  let bearing = 0;

  // Strategy 1: Use longest edge (likely street-facing)
  if (sitePolygon && sitePolygon.length >= 3) {
    const longestEdge = findLongestEdge(sitePolygon);
    
    if (longestEdge) {
      direction = bearingToDirection(longestEdge.perpendicularBearing);
      bearing = longestEdge.perpendicularBearing;
      confidence = 0.7;
      
      rationale.push({
        strategy: 'longest_edge',
        weight: 0.7,
        message: `Longest site edge (${longestEdge.length.toFixed(1)}m) suggests ${DIRECTIONS[direction]?.label} entrance`
      });
    }
  }

  // Strategy 2: Road proximity (if provided)
  if (roadSegments && roadSegments.length > 0) {
    // Find nearest road
    const metrics = computeSiteMetrics(sitePolygon);
    const centroid = metrics.centroid;

    // Calculate bearings to roads
    const roadBearings = roadSegments.map(road => {
      const roadCenter = road.midpoint || road.center || { lat: road.lat, lng: road.lng };
      return calculateBearing(centroid, roadCenter);
    });

    if (roadBearings.length > 0) {
      const avgRoadBearing = roadBearings.reduce((sum, b) => sum + b, 0) / roadBearings.length;
      const roadDirection = bearingToDirection(avgRoadBearing);
      
      confidence = Math.max(confidence, 0.85);
      direction = roadDirection;
      bearing = avgRoadBearing;

      rationale.push({
        strategy: 'road_proximity',
        weight: 0.85,
        message: `Nearest road access from ${DIRECTIONS[roadDirection]?.label}`
      });
    }
  }

  // Strategy 3: Solar orientation
  if (sunPath) {
    const solarScore = calculateSolarScore(direction, sunPath);
    
    if (solarScore > 0.7) {
      rationale.push({
        strategy: 'solar_gain',
        weight: 0.3,
        message: `${DIRECTIONS[direction]?.label} provides good solar exposure`
      });
      confidence = Math.min(confidence + 0.05, 0.95);
    }
  }

  // Default fallback
  if (rationale.length === 0) {
    rationale.push({
      strategy: 'default',
      weight: 0.5,
      message: 'Using default North entrance (no clear indicators found)'
    });
    direction = 'N';
    bearing = 0;
    confidence = 0.5;
  }

  return {
    direction,
    bearing,
    confidence,
    rationale,
    label: DIRECTIONS[direction]?.label || 'North',
    metadata: {
      strategies: rationale.map(r => r.strategy),
      dominantStrategy: rationale[0]?.strategy || 'default'
    }
  };
}

/**
 * Get opposite direction
 * @param {string} direction - Cardinal direction
 * @returns {string} Opposite direction
 */
export function getOppositeDirection(direction) {
  const opposites = {
    'N': 'S', 'S': 'N',
    'E': 'W', 'W': 'E',
    'NE': 'SW', 'SW': 'NE',
    'NW': 'SE', 'SE': 'NW'
  };
  return opposites[direction] || direction;
}

/**
 * Get all cardinal directions
 * @returns {Array<Object>} Array of direction objects
 */
export function getAllDirections() {
  return Object.entries(DIRECTIONS).map(([code, data]) => ({
    code,
    label: data.label,
    bearing: data.bearing
  }));
}

export default {
  inferEntranceDirection,
  bearingToDirection,
  getOppositeDirection,
  getAllDirections,
  DIRECTIONS
};

