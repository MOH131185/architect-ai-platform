/**
 * Building Footprint Detection Service
 *
 * Uses Google's Geocoding API with extra_computations=BUILDING_AND_ENTRANCES
 * to automatically detect building outlines from addresses.
 *
 * Features:
 * - Fetch building footprints from Google Geocoding API
 * - Convert GeoJSON coordinates to Google Maps format
 * - Classify detected shapes (rectangle, L-shape, etc.)
 * - Validate and clean polygon data
 */

import axios from 'axios';
import logger from '../utils/logger.js';


/**
 * Fetch building footprint from Google Geocoding API
 *
 * @param {string} placeId - Google Place ID from geocoding result
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<Object>} Footprint data with coordinates and metadata
 */
export async function fetchBuildingFootprint(placeId, apiKey) {
  logger.info('🏢 Fetching building footprint for place_id:', placeId);

  if (!apiKey) {
    throw new Error('Google Maps API key is required');
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        place_id: placeId,
        extra_computations: 'BUILDING_AND_ENTRANCES',
        key: apiKey
      }
    });

    if (response.data.status !== 'OK') {
      logger.warn(`Building footprint fetch failed: ${response.data.status}`);
      return null;
    }

    const result = response.data.results[0];

    // Extract building outline from response
    const buildings = result.buildings;
    if (!buildings || buildings.length === 0) {
      logger.warn('No building data in API response');
      return null;
    }

    const buildingData = buildings[0];
    const outlines = buildingData.building_outlines;

    if (!outlines || outlines.length === 0) {
      logger.warn('No building outlines found');
      return null;
    }

    const outline = outlines[0];
    const displayPolygon = outline.display_polygon;

    if (!displayPolygon || !displayPolygon.coordinates || displayPolygon.coordinates.length === 0) {
      logger.warn('Invalid display_polygon structure');
      return null;
    }

    // GeoJSON polygon format: coordinates[0] is outer ring as [lng, lat] pairs
    const geoJsonCoords = displayPolygon.coordinates[0];

    logger.success(` Building footprint detected: ${geoJsonCoords.length} vertices`);

    return {
      geoJsonCoordinates: geoJsonCoords,
      entrances: buildingData.entrances || [],
      metadata: {
        placeId,
        vertexCount: geoJsonCoords.length,
        source: 'google_maps_api'
      }
    };

  } catch (error) {
    logger.error('❌ Failed to fetch building footprint:', error);

    // Check if error is due to API not supporting extra_computations
    if (error.response?.data?.error_message) {
      logger.warn('API Message:', error.response.data.error_message);
    }

    return null;
  }
}

/**
 * Convert GeoJSON coordinates to Google Maps polygon format
 *
 * @param {Array<Array<number>>} geoJsonCoords - Array of [lng, lat] pairs
 * @returns {Array<Object>} Array of {lat, lng} objects
 */
export function convertGeoJsonToMapCoords(geoJsonCoords) {
  if (!Array.isArray(geoJsonCoords) || geoJsonCoords.length === 0) {
    return [];
  }

  // Convert [lng, lat] to {lat, lng}
  const coords = geoJsonCoords.map(([lng, lat]) => ({ lat, lng }));

  // Ensure polygon is closed (first point === last point)
  const first = coords[0];
  const last = coords[coords.length - 1];

  if (first.lat !== last.lat || first.lng !== last.lng) {
    coords.push({ ...first }); // Close the polygon
    logger.info('  Closed polygon (added duplicate of first vertex)');
  }

  return coords;
}

/**
 * Classify polygon shape using basic geometry analysis
 * Falls back to simple heuristics if Shapeit is not available
 *
 * @param {Array<Object>} coords - Array of {lat, lng} objects
 * @returns {Object} Shape classification result
 */
export function classifyPolygonShape(coords) {
  if (!coords || coords.length < 4) {
    return {
      name: 'invalid',
      description: 'Insufficient vertices',
      vertexCount: coords?.length || 0
    };
  }

  const vertexCount = coords.length - 1; // Subtract 1 for closed polygon

  // Simple shape classification based on vertex count and angles
  if (vertexCount === 4) {
    const angles = calculateInternalAngles(coords);
    const avgAngle = angles.reduce((sum, a) => sum + a, 0) / angles.length;

    if (Math.abs(avgAngle - 90) < 10) {
      return {
        name: 'rectangle',
        description: 'Rectangular footprint',
        vertexCount,
        angles,
        isConvex: true
      };
    }
  } else if (vertexCount === 6) {
    const isLShaped = detectLShape(coords);
    if (isLShaped) {
      return {
        name: 'L-shape',
        description: 'L-shaped footprint',
        vertexCount,
        isConvex: false
      };
    }
  } else if (vertexCount === 8) {
    const isUShaped = detectUShape(coords);
    if (isUShaped) {
      return {
        name: 'U-shape',
        description: 'U-shaped footprint',
        vertexCount,
        isConvex: false
      };
    }
  }

  // Check for convexity
  const isConvex = isPolygonConvex(coords);

  return {
    name: isConvex ? 'convex-polygon' : 'concave-polygon',
    description: `${isConvex ? 'Convex' : 'Concave'} ${vertexCount}-sided polygon`,
    vertexCount,
    isConvex
  };
}

/**
 * Calculate internal angles of polygon
 *
 * @param {Array<Object>} coords - Array of {lat, lng} objects
 * @returns {Array<number>} Internal angles in degrees
 */
function calculateInternalAngles(coords) {
  const angles = [];
  const n = coords.length - 1; // Exclude duplicate last point

  for (let i = 0; i < n; i++) {
    const prev = coords[(i - 1 + n) % n];
    const curr = coords[i];
    const next = coords[(i + 1) % n];

    const angle = calculateAngle(prev, curr, next);
    angles.push(angle);
  }

  return angles;
}

/**
 * Calculate angle between three points
 *
 * @param {Object} p1 - First point {lat, lng}
 * @param {Object} p2 - Vertex point {lat, lng}
 * @param {Object} p3 - Third point {lat, lng}
 * @returns {number} Angle in degrees
 */
function calculateAngle(p1, p2, p3) {
  const v1 = { x: p1.lng - p2.lng, y: p1.lat - p2.lat };
  const v2 = { x: p3.lng - p2.lng, y: p3.lat - p2.lat };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  const cosAngle = dot / (mag1 * mag2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

  return angleRad * (180 / Math.PI);
}

/**
 * Check if polygon is convex
 *
 * @param {Array<Object>} coords - Array of {lat, lng} objects
 * @returns {boolean} True if convex
 */
function isPolygonConvex(coords) {
  const n = coords.length - 1;
  if (n < 4) return true; // Triangles are always convex

  let sign = null;

  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    const p3 = coords[(i + 2) % n];

    const crossProduct =
      (p2.lng - p1.lng) * (p3.lat - p2.lat) -
      (p2.lat - p1.lat) * (p3.lng - p2.lng);

    if (crossProduct !== 0) {
      const currentSign = Math.sign(crossProduct);
      if (sign === null) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false; // Non-convex
      }
    }
  }

  return true;
}

/**
 * Detect L-shaped polygon (6 vertices with specific pattern)
 *
 * @param {Array<Object>} coords - Array of {lat, lng} objects
 * @returns {boolean} True if L-shaped
 */
function detectLShape(coords) {
  if (coords.length - 1 !== 6) return false;

  const angles = calculateInternalAngles(coords);

  // L-shape typically has 4 right angles (90°) and 2 reflex angles (270°)
  const rightAngles = angles.filter(a => Math.abs(a - 90) < 15).length;
  const reflexAngles = angles.filter(a => Math.abs(a - 270) < 15).length;

  return rightAngles >= 4 && reflexAngles >= 2;
}

/**
 * Detect U-shaped polygon (8 vertices with specific pattern)
 *
 * @param {Array<Object>} coords - Array of {lat, lng} objects
 * @returns {boolean} True if U-shaped
 */
function detectUShape(coords) {
  if (coords.length - 1 !== 8) return false;

  const angles = calculateInternalAngles(coords);

  // U-shape typically has 6 right angles (90°) and 2 reflex angles (270°)
  const rightAngles = angles.filter(a => Math.abs(a - 90) < 15).length;
  const reflexAngles = angles.filter(a => Math.abs(a - 270) < 15).length;

  return rightAngles >= 6 && reflexAngles >= 2;
}

/**
 * Calculate area of polygon (in square meters, approximately)
 * Uses spherical excess formula for lat/lng coordinates
 *
 * @param {Array<Object>} coords - Array of {lat, lng} objects
 * @returns {number} Area in square meters
 */
export function calculatePolygonArea(coords) {
  if (!coords || coords.length < 3) return 0;

  const R = 6371000; // Earth radius in meters
  let area = 0;

  const n = coords.length - 1; // Exclude duplicate last point

  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];

    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const lng1 = p1.lng * Math.PI / 180;
    const lng2 = p2.lng * Math.PI / 180;

    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs(area * R * R / 2);

  return area;
}

/**
 * Complete address-to-shape detection workflow
 *
 * @param {string} address - Address string to analyze
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<Object>} Complete footprint data with classification
 */
export async function detectAddressShape(address, apiKey) {
  logger.info('🔍 Starting address-to-shape detection for:', address);

  try {
    // Step 1: Geocode address to get place_id
    const geocodeResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: apiKey }
    });

    if (geocodeResponse.data.status !== 'OK') {
      throw new Error(`Geocoding failed: ${geocodeResponse.data.status}`);
    }

    const locationResult = geocodeResponse.data.results[0];
    const placeId = locationResult.place_id;
    const center = locationResult.geometry.location;

    logger.info('  Geocoded to place_id:', placeId);

    // Step 2: Fetch building footprint
    const footprint = await fetchBuildingFootprint(placeId, apiKey);

    if (!footprint) {
      logger.warn('⚠️  No building footprint available for this address');
      return {
        success: false,
        center,
        placeId,
        message: 'Building footprint not available from Google Maps API'
      };
    }

    // Step 3: Convert to map coordinates
    const polygonCoords = convertGeoJsonToMapCoords(footprint.geoJsonCoordinates);

    // Step 4: Classify shape
    const shapeClassification = classifyPolygonShape(polygonCoords);

    // Step 5: Calculate area
    const areaM2 = calculatePolygonArea(polygonCoords);

    logger.info('✅ Address-to-shape detection complete:', {
      shape: shapeClassification.name,
      vertices: shapeClassification.vertexCount,
      area: `${areaM2.toFixed(1)} m²`
    });

    return {
      success: true,
      center,
      placeId,
      polygon: polygonCoords,
      shape: shapeClassification,
      area: areaM2,
      entrances: footprint.entrances,
      metadata: {
        ...footprint.metadata,
        detectedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error('❌ Address-to-shape detection failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  fetchBuildingFootprint,
  convertGeoJsonToMapCoords,
  classifyPolygonShape,
  calculatePolygonArea,
  detectAddressShape
};
