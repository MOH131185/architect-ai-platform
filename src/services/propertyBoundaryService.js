/**
 * Property Boundary Detection Service
 * Detects real property boundaries using multiple data sources
 * Supports polygons, triangles, irregular shapes, and complex geometries
 */

const API_ENDPOINTS = {
  OVERPASS: 'https://overpass-api.de/api/interpreter',
  NOMINATIM: 'https://nominatim.openstreetmap.org/search'
};

/**
 * Detect property boundary shape from coordinates
 * @param {Object} coordinates - { lat, lng }
 * @param {string} address - Full address string
 * @returns {Promise<Object>} Boundary data with shape type
 */
export async function detectPropertyBoundary(coordinates, address) {
  console.log('🔍 Detecting property boundary for:', address);

  try {
    // Try multiple detection methods in order of accuracy
    const methods = [
      () => detectFromOSMParcel(coordinates),
      () => detectFromOSMBuilding(coordinates),
      () => detectFromGoogleMaps(coordinates, address),
      () => detectFromNearbyFeatures(coordinates),
      () => generateIntelligentFallback(coordinates, address)
    ];

    for (const method of methods) {
      try {
        const result = await method();
        if (result && result.polygon && result.polygon.length >= 3) {
          console.log('✅ Boundary detected:', result.shapeType, 'with', result.polygon.length, 'points');
          return result;
        }
      } catch (error) {
        console.warn('Detection method failed:', error.message);
        continue;
      }
    }

    // If all methods fail, return intelligent fallback
    return generateIntelligentFallback(coordinates, address);
  } catch (error) {
    console.error('❌ Property boundary detection failed:', error);
    return generateIntelligentFallback(coordinates, address);
  }
}

/**
 * Detect boundary from OpenStreetMap land parcel data
 */
async function detectFromOSMParcel(coordinates) {
  const { lat, lng } = coordinates;
  const radius = 50; // meters

  // Query for land parcels, property boundaries, and plots
  const query = `
    [out:json][timeout:25];
    (
      way["landuse"](around:${radius},${lat},${lng});
      way["boundary"="administrative"](around:${radius},${lat},${lng});
      relation["landuse"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const response = await fetch(API_ENDPOINTS.OVERPASS, {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' }
  });

  if (!response.ok) throw new Error('OSM Overpass API failed');

  const data = await response.json();

  if (data.elements && data.elements.length > 0) {
    // Find the closest parcel to the coordinates
    const closestParcel = findClosestElement(data.elements, coordinates);

    if (closestParcel) {
      const polygon = extractPolygonFromElement(closestParcel);
      const shapeType = analyzeShapeType(polygon);

      return {
        polygon,
        shapeType,
        source: 'OSM Parcel',
        confidence: 0.95,
        area: calculatePolygonArea(polygon),
        metadata: {
          landuse: closestParcel.tags?.landuse,
          osmId: closestParcel.id
        }
      };
    }
  }

  return null;
}

/**
 * Detect boundary from OpenStreetMap building footprint
 */
async function detectFromOSMBuilding(coordinates) {
  const { lat, lng } = coordinates;
  const radius = 30; // meters

  const query = `
    [out:json][timeout:25];
    (
      way["building"](around:${radius},${lat},${lng});
      relation["building"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const response = await fetch(API_ENDPOINTS.OVERPASS, {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' }
  });

  if (!response.ok) throw new Error('OSM building query failed');

  const data = await response.json();

  if (data.elements && data.elements.length > 0) {
    const closestBuilding = findClosestElement(data.elements, coordinates);

    if (closestBuilding) {
      const buildingPolygon = extractPolygonFromElement(closestBuilding);

      // Expand building footprint by 15% to estimate property boundary
      const expandedPolygon = expandPolygon(buildingPolygon, 1.15);
      const shapeType = analyzeShapeType(expandedPolygon);

      return {
        polygon: expandedPolygon,
        shapeType,
        source: 'OSM Building (expanded)',
        confidence: 0.75,
        area: calculatePolygonArea(expandedPolygon),
        metadata: {
          buildingType: closestBuilding.tags?.building,
          osmId: closestBuilding.id
        }
      };
    }
  }

  return null;
}

/**
 * Detect boundary from Google Maps (if API available)
 */
async function detectFromGoogleMaps(coordinates, address) {
  // This would use Google Maps Places API or Geocoding API
  // to get property boundary if available
  // For now, return null to try other methods
  return null;
}

/**
 * Detect boundary from nearby features (roads, paths, etc.)
 */
async function detectFromNearbyFeatures(coordinates) {
  const { lat, lng } = coordinates;
  const radius = 40;

  // Query for roads and paths that might define property boundaries
  const query = `
    [out:json][timeout:25];
    (
      way["highway"](around:${radius},${lat},${lng});
      way["barrier"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const response = await fetch(API_ENDPOINTS.OVERPASS, {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' }
  });

  if (!response.ok) throw new Error('Nearby features query failed');

  const data = await response.json();

  if (data.elements && data.elements.length >= 2) {
    // Try to construct a boundary from nearby linear features
    const polygon = constructBoundaryFromFeatures(data.elements, coordinates);

    if (polygon && polygon.length >= 3) {
      const shapeType = analyzeShapeType(polygon);

      return {
        polygon,
        shapeType,
        source: 'Nearby Features',
        confidence: 0.60,
        area: calculatePolygonArea(polygon)
      };
    }
  }

  return null;
}

/**
 * Generate intelligent fallback based on location type
 */
function generateIntelligentFallback(coordinates, address) {
  const { lat, lng } = coordinates;

  // Analyze address to determine likely lot type
  const addressLower = address.toLowerCase();
  const isUrban = addressLower.includes('street') ||
                  addressLower.includes('avenue') ||
                  addressLower.includes('road');
  const isCorner = addressLower.includes('corner') ||
                   addressLower.includes('junction');

  let polygon, shapeType;

  if (isCorner) {
    // Corner lots are often L-shaped or pentagonal
    polygon = generateLShapedLot(coordinates, 25, 20);
    shapeType = 'L-shaped';
  } else if (isUrban) {
    // Urban lots can be rectangular or irregular
    const isNarrow = Math.random() > 0.5; // Could be enhanced with street analysis
    if (isNarrow) {
      polygon = generateRectangularLot(coordinates, 12, 30); // Narrow urban lot
      shapeType = 'rectangular';
    } else {
      polygon = generateIrregularQuad(coordinates, 20, 25);
      shapeType = 'irregular quadrilateral';
    }
  } else {
    // Suburban/rural lots can be larger and more varied
    const shapes = ['rectangular', 'pentagon', 'irregular'];
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];

    if (randomShape === 'pentagon') {
      polygon = generatePentagonLot(coordinates, 30);
      shapeType = 'pentagon';
    } else if (randomShape === 'irregular') {
      polygon = generateIrregularPolygon(coordinates, 6, 25, 35);
      shapeType = 'irregular polygon';
    } else {
      polygon = generateRectangularLot(coordinates, 25, 30);
      shapeType = 'rectangular';
    }
  }

  return {
    polygon,
    shapeType,
    source: 'Intelligent Fallback',
    confidence: 0.40,
    area: calculatePolygonArea(polygon),
    metadata: {
      reason: 'No real boundary data available',
      addressAnalysis: { isUrban, isCorner }
    }
  };
}

/**
 * Find the closest OSM element to coordinates
 */
function findClosestElement(elements, coordinates) {
  let closest = null;
  let minDistance = Infinity;

  for (const element of elements) {
    const centroid = calculateElementCentroid(element);
    const distance = calculateDistance(coordinates, centroid);

    if (distance < minDistance) {
      minDistance = distance;
      closest = element;
    }
  }

  return closest;
}

/**
 * Extract polygon coordinates from OSM element
 */
function extractPolygonFromElement(element) {
  const polygon = [];

  if (element.type === 'way' && element.geometry) {
    for (const node of element.geometry) {
      polygon.push({ lat: node.lat, lng: node.lon });
    }
  } else if (element.type === 'relation' && element.members) {
    // Handle relations (more complex geometries)
    for (const member of element.members) {
      if (member.role === 'outer' && member.geometry) {
        for (const node of member.geometry) {
          polygon.push({ lat: node.lat, lng: node.lon });
        }
      }
    }
  }

  return polygon;
}

/**
 * Analyze polygon shape type
 */
export function analyzeShapeType(polygon) {
  if (!polygon || polygon.length < 3) return 'invalid';

  const vertices = polygon.length;

  if (vertices === 3) return 'triangle';
  if (vertices === 4) {
    // Check if rectangle or irregular quad
    if (isRectangle(polygon)) return 'rectangle';
    return 'irregular quadrilateral';
  }
  if (vertices === 5) return 'pentagon';
  if (vertices === 6) return 'hexagon';
  if (vertices > 6 && vertices <= 8) return 'polygon';

  return 'complex polygon';
}

/**
 * Check if polygon is a rectangle
 */
function isRectangle(polygon) {
  if (polygon.length !== 4) return false;

  // Calculate angles between consecutive sides
  const angles = [];
  for (let i = 0; i < 4; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % 4];
    const p3 = polygon[(i + 2) % 4];

    const angle = calculateAngle(p1, p2, p3);
    angles.push(angle);
  }

  // Check if all angles are approximately 90 degrees
  const tolerance = 10; // degrees
  return angles.every(angle => Math.abs(angle - 90) < tolerance);
}

/**
 * Calculate angle between three points in degrees
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
 * Calculate element centroid
 */
function calculateElementCentroid(element) {
  const polygon = extractPolygonFromElement(element);

  if (polygon.length === 0) return { lat: 0, lng: 0 };

  const sum = polygon.reduce((acc, point) => ({
    lat: acc.lat + point.lat,
    lng: acc.lng + point.lng
  }), { lat: 0, lng: 0 });

  return {
    lat: sum.lat / polygon.length,
    lng: sum.lng / polygon.length
  };
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(coord1, coord2) {
  const R = 6371e3; // Earth radius in meters
  const lat1 = coord1.lat * Math.PI / 180;
  const lat2 = coord2.lat * Math.PI / 180;
  const deltaLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const deltaLng = (coord2.lng - coord1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate polygon area in square meters
 */
export function calculatePolygonArea(polygon) {
  if (polygon.length < 3) return 0;

  let area = 0;
  const R = 6371000; // Earth radius in meters

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    area += (p2.lng - p1.lng) * (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180));
  }

  area = Math.abs(area * R * R / 2);

  return area;
}

/**
 * Expand polygon by a scale factor
 */
function expandPolygon(polygon, scale) {
  const centroid = polygon.reduce((acc, point) => ({
    lat: acc.lat + point.lat / polygon.length,
    lng: acc.lng + point.lng / polygon.length
  }), { lat: 0, lng: 0 });

  return polygon.map(point => ({
    lat: centroid.lat + (point.lat - centroid.lat) * scale,
    lng: centroid.lng + (point.lng - centroid.lng) * scale
  }));
}

/**
 * Construct boundary from linear features
 */
function constructBoundaryFromFeatures(features, centerCoords) {
  // This is a simplified implementation
  // A more sophisticated version would analyze road/path intersections
  // and construct a likely property boundary

  const points = [];

  for (const feature of features) {
    if (feature.geometry && feature.geometry.length > 0) {
      // Find the closest point on this feature to the center
      let closestPoint = feature.geometry[0];
      let minDist = calculateDistance(centerCoords, { lat: closestPoint.lat, lng: closestPoint.lon });

      for (const node of feature.geometry) {
        const dist = calculateDistance(centerCoords, { lat: node.lat, lng: node.lon });
        if (dist < minDist) {
          minDist = dist;
          closestPoint = node;
        }
      }

      points.push({ lat: closestPoint.lat, lng: closestPoint.lon });
    }
  }

  if (points.length < 3) return null;

  // Sort points by angle from center to create a polygon
  return sortPointsByAngle(points, centerCoords);
}

/**
 * Sort points by angle from center
 */
function sortPointsByAngle(points, center) {
  return points.sort((a, b) => {
    const angleA = Math.atan2(a.lat - center.lat, a.lng - center.lng);
    const angleB = Math.atan2(b.lat - center.lat, b.lng - center.lng);
    return angleA - angleB;
  });
}

/**
 * Generate rectangular lot
 */
function generateRectangularLot(center, widthMeters, depthMeters) {
  const { lat, lng } = center;

  // Convert meters to approximate degrees
  const latOffset = (depthMeters / 2) / 111320;
  const lngOffset = (widthMeters / 2) / (111320 * Math.cos(lat * Math.PI / 180));

  return [
    { lat: lat + latOffset, lng: lng - lngOffset }, // Top-left
    { lat: lat + latOffset, lng: lng + lngOffset }, // Top-right
    { lat: lat - latOffset, lng: lng + lngOffset }, // Bottom-right
    { lat: lat - latOffset, lng: lng - lngOffset }  // Bottom-left
  ];
}

/**
 * Generate L-shaped lot
 */
function generateLShapedLot(center, widthMeters, depthMeters) {
  const { lat, lng } = center;

  const latOffset = depthMeters / 111320;
  const lngOffset = widthMeters / (111320 * Math.cos(lat * Math.PI / 180));

  return [
    { lat: lat + latOffset, lng: lng - lngOffset },
    { lat: lat + latOffset, lng: lng + lngOffset * 0.6 },
    { lat: lat + latOffset * 0.4, lng: lng + lngOffset * 0.6 },
    { lat: lat + latOffset * 0.4, lng: lng + lngOffset },
    { lat: lat - latOffset, lng: lng + lngOffset },
    { lat: lat - latOffset, lng: lng - lngOffset }
  ];
}

/**
 * Generate pentagonal lot
 */
function generatePentagonLot(center, radiusMeters) {
  const { lat, lng } = center;
  const polygon = [];

  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI / 5) - (Math.PI / 2); // Start from top
    const latOffset = (radiusMeters * Math.sin(angle)) / 111320;
    const lngOffset = (radiusMeters * Math.cos(angle)) / (111320 * Math.cos(lat * Math.PI / 180));

    polygon.push({
      lat: lat + latOffset,
      lng: lng + lngOffset
    });
  }

  return polygon;
}

/**
 * Generate irregular quadrilateral
 */
function generateIrregularQuad(center, widthMeters, depthMeters) {
  const { lat, lng } = center;

  const latOffset = depthMeters / 111320;
  const lngOffset = widthMeters / (111320 * Math.cos(lat * Math.PI / 180));

  // Add some randomness to make it irregular
  const variance = 0.15;

  return [
    {
      lat: lat + latOffset * (1 + (Math.random() - 0.5) * variance),
      lng: lng - lngOffset * (1 + (Math.random() - 0.5) * variance)
    },
    {
      lat: lat + latOffset * (1 + (Math.random() - 0.5) * variance),
      lng: lng + lngOffset * (1 + (Math.random() - 0.5) * variance)
    },
    {
      lat: lat - latOffset * (1 + (Math.random() - 0.5) * variance),
      lng: lng + lngOffset * (1 + (Math.random() - 0.5) * variance)
    },
    {
      lat: lat - latOffset * (1 + (Math.random() - 0.5) * variance),
      lng: lng - lngOffset * (1 + (Math.random() - 0.5) * variance)
    }
  ];
}

/**
 * Generate irregular polygon
 */
function generateIrregularPolygon(center, sides, minRadiusMeters, maxRadiusMeters) {
  const { lat, lng } = center;
  const polygon = [];

  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI / sides) - (Math.PI / 2);
    const radius = minRadiusMeters + Math.random() * (maxRadiusMeters - minRadiusMeters);

    const latOffset = (radius * Math.sin(angle)) / 111320;
    const lngOffset = (radius * Math.cos(angle)) / (111320 * Math.cos(lat * Math.PI / 180));

    polygon.push({
      lat: lat + latOffset,
      lng: lng + lngOffset
    });
  }

  return polygon;
}

/**
 * Simplify polygon (remove redundant vertices)
 */
export function simplifyPolygon(polygon, tolerance = 0.00001) {
  if (polygon.length <= 3) return polygon;

  const simplified = [polygon[0]];

  for (let i = 1; i < polygon.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const curr = polygon[i];
    const next = polygon[i + 1];

    // Calculate distance from current point to line between prev and next
    const distance = pointToLineDistance(curr, prev, next);

    if (distance > tolerance) {
      simplified.push(curr);
    }
  }

  simplified.push(polygon[polygon.length - 1]);

  return simplified;
}

/**
 * Calculate point-to-line distance
 */
function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point.lat - lineStart.lat;
  const B = point.lng - lineStart.lng;
  const C = lineEnd.lat - lineStart.lat;
  const D = lineEnd.lng - lineStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart.lat;
    yy = lineStart.lng;
  } else if (param > 1) {
    xx = lineEnd.lat;
    yy = lineEnd.lng;
  } else {
    xx = lineStart.lat + param * C;
    yy = lineStart.lng + param * D;
  }

  const dx = point.lat - xx;
  const dy = point.lng - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Validate polygon (check for self-intersections)
 */
export function validatePolygon(polygon) {
  if (!polygon || polygon.length < 3) {
    return { valid: false, error: 'Polygon must have at least 3 vertices' };
  }

  // Check for self-intersections
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    for (let j = i + 2; j < polygon.length; j++) {
      if (j === polygon.length - 1 && i === 0) continue; // Skip adjacent edges

      const p3 = polygon[j];
      const p4 = polygon[(j + 1) % polygon.length];

      if (linesIntersect(p1, p2, p3, p4)) {
        return { valid: false, error: 'Polygon has self-intersections' };
      }
    }
  }

  return { valid: true };
}

/**
 * Check if two line segments intersect
 */
function linesIntersect(p1, p2, p3, p4) {
  const denominator = ((p4.lng - p3.lng) * (p2.lat - p1.lat)) -
                     ((p4.lat - p3.lat) * (p2.lng - p1.lng));

  if (denominator === 0) return false; // Parallel lines

  const ua = (((p4.lat - p3.lat) * (p1.lng - p3.lng)) -
              ((p4.lng - p3.lng) * (p1.lat - p3.lat))) / denominator;

  const ub = (((p2.lat - p1.lat) * (p1.lng - p3.lng)) -
              ((p2.lng - p1.lng) * (p1.lat - p3.lat))) / denominator;

  return (ua > 0 && ua < 1 && ub > 0 && ub < 1);
}

export default {
  detectPropertyBoundary,
  simplifyPolygon,
  validatePolygon,
  calculatePolygonArea,
  analyzeShapeType
};
