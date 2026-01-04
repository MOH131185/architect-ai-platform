/**
 * mapUtils.js
 * 
 * Utility functions for map operations and boundary detection
 * Includes auto-boundary detection and API integration helpers
 * 
 * @module mapUtils
 */

import { getPolygonCentroid } from './GeometryMath.js';

/**
 * Fetch auto-detected boundary from address
 * Currently returns a mock rectangular boundary
 * TODO: Integrate with real boundary detection API (e.g., Overpass API, Google Places)
 * 
 * @param {string} address - Site address
 * @param {{lat: number, lng: number}} center - Center coordinates
 * @returns {Promise<Array<{lat: number, lng: number}>>} Boundary polygon
 */
export async function fetchAutoBoundary(address, center) {
  // Mock implementation - returns a rectangular boundary
  // In production, this would call a boundary detection API
  
  return new Promise((resolve) => {
    setTimeout(() => {
      // Create a ~30m x 20m rectangular boundary around center
      const latOffset = 0.00015; // ~15-20m
      const lngOffset = 0.0002;  // ~15-20m
      
      const boundary = [
        { lat: center.lat + latOffset, lng: center.lng - lngOffset },
        { lat: center.lat + latOffset, lng: center.lng + lngOffset },
        { lat: center.lat - latOffset, lng: center.lng + lngOffset },
        { lat: center.lat - latOffset, lng: center.lng - lngOffset }
      ];
      
      resolve(boundary);
    }, 500);
  });
}

/**
 * Fetch boundary from Overpass API (OpenStreetMap)
 * @param {{lat: number, lng: number}} center - Center coordinates
 * @param {number} radius - Search radius in meters
 * @returns {Promise<Array<{lat: number, lng: number}>>} Boundary polygon
 */
export async function fetchBoundaryFromOverpass(center, radius = 50) {
  const overpassUrl = 'https://overpass-api.de/api/interpreter';
  
  const query = `
    [out:json];
    (
      way["building"](around:${radius},${center.lat},${center.lng});
      relation["building"](around:${radius},${center.lat},${center.lng});
    );
    out geom;
  `;
  
  try {
    const response = await fetch(overpassUrl, {
      method: 'POST',
      body: query
    });
    
    if (!response.ok) {
      throw new Error('Overpass API request failed');
    }
    
    const data = await response.json();
    
    if (data.elements && data.elements.length > 0) {
      // Get the first building
      const building = data.elements[0];
      
      if (building.geometry) {
        return building.geometry.map(node => ({
          lat: node.lat,
          lng: node.lon
        }));
      }
    }
    
    // Fallback to mock boundary
    return fetchAutoBoundary(null, center);
    
  } catch (error) {
    console.error('Error fetching boundary from Overpass:', error);
    return fetchAutoBoundary(null, center);
  }
}

/**
 * Calculate optimal map bounds for polygon
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon coordinates
 * @param {number} padding - Padding factor (default 0.2 = 20%)
 * @returns {{north: number, south: number, east: number, west: number}} Bounds
 */
export function calculateBounds(polygon, padding = 0.2) {
  if (!polygon || polygon.length === 0) {
    return null;
  }
  
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  
  polygon.forEach(point => {
    north = Math.max(north, point.lat);
    south = Math.min(south, point.lat);
    east = Math.max(east, point.lng);
    west = Math.min(west, point.lng);
  });
  
  const latPadding = (north - south) * padding;
  const lngPadding = (east - west) * padding;
  
  return {
    north: north + latPadding,
    south: south - latPadding,
    east: east + lngPadding,
    west: west - lngPadding
  };
}

/**
 * Convert bounds to Google Maps LatLngBounds
 * @param {{north: number, south: number, east: number, west: number}} bounds - Bounds object
 * @param {Object} google - Google Maps API object
 * @returns {google.maps.LatLngBounds} Google Maps bounds
 */
export function boundsToGoogleBounds(bounds, google) {
  if (!bounds || !google) return null;
  
  return new google.maps.LatLngBounds(
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east }
  );
}

/**
 * Find nearest point on polygon edge to a given point
 * @param {{lat: number, lng: number}} point - Point to check
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon coordinates
 * @returns {{point: {lat: number, lng: number}, segmentIndex: number, distance: number}} Nearest point info
 */
export function findNearestPointOnPolygon(point, polygon) {
  let minDistance = Infinity;
  let nearestPoint = null;
  let segmentIndex = -1;
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    
    const nearest = nearestPointOnSegment(point, p1, p2);
    const distance = distanceBetweenPoints(point, nearest);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = nearest;
      segmentIndex = i;
    }
  }
  
  return { point: nearestPoint, segmentIndex, distance: minDistance };
}

/**
 * Find nearest point on line segment
 * @param {{lat: number, lng: number}} point - Point to check
 * @param {{lat: number, lng: number}} segmentStart - Segment start
 * @param {{lat: number, lng: number}} segmentEnd - Segment end
 * @returns {{lat: number, lng: number}} Nearest point on segment
 */
function nearestPointOnSegment(point, segmentStart, segmentEnd) {
  const x = point.lng;
  const y = point.lat;
  const x1 = segmentStart.lng;
  const y1 = segmentStart.lat;
  const x2 = segmentEnd.lng;
  const y2 = segmentEnd.lat;
  
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }
  
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
  
  return { lat: yy, lng: xx };
}

/**
 * Calculate simple distance between two points (not geodesic)
 * @param {{lat: number, lng: number}} p1 - First point
 * @param {{lat: number, lng: number}} p2 - Second point
 * @returns {number} Distance
 */
function distanceBetweenPoints(p1, p2) {
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if point is inside polygon
 * @param {{lat: number, lng: number}} point - Point to check
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon coordinates
 * @returns {boolean} True if point is inside polygon
 */
export function isPointInPolygon(point, polygon) {
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Generate map snapshot URL
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon coordinates
 * @param {string} apiKey - Google Maps API key
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} Static map URL
 */
export function generateMapSnapshotURL(polygon, apiKey, width = 640, height = 480) {
  if (!polygon || polygon.length === 0) return null;
  
  const centroid = getPolygonCentroid(polygon);
  const pathString = polygon.map(p => `${p.lat},${p.lng}`).join('|');
  
  return `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${centroid.lat},${centroid.lng}&` +
    `zoom=18&` +
    `size=${width}x${height}&` +
    `maptype=hybrid&` +
    `path=color:0xff0000ff|weight:2|fillcolor:0xff000033|${pathString}&` +
    `key=${apiKey}`;
}

/**
 * Export polygon as base64 encoded image
 * @param {HTMLCanvasElement} canvas - Canvas element with map rendering
 * @returns {string} Base64 encoded image
 */
export function exportPolygonAsBase64(canvas) {
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}

/**
 * Create vertex marker options
 * @param {number} index - Vertex index
 * @param {boolean} isHovered - Whether vertex is hovered
 * @param {boolean} isDragging - Whether vertex is being dragged
 * @returns {Object} Marker options
 */
export function createVertexMarkerOptions(index, isHovered = false, isDragging = false) {
  let scale = 1;
  let fillColor = '#3B82F6';
  let strokeColor = '#FFFFFF';
  
  if (isDragging) {
    scale = 1.5;
    fillColor = '#EF4444';
  } else if (isHovered) {
    scale = 1.3;
    fillColor = '#10B981';
  }
  
  return {
    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
    scale: 8 * scale,
    fillColor,
    fillOpacity: 1,
    strokeColor,
    strokeWeight: 2,
    anchor: { x: 0, y: 0 },
    draggable: true,
    cursor: 'move',
    zIndex: 1000 + index
  };
}

/**
 * Create midpoint marker options
 * @param {boolean} isHovered - Whether midpoint is hovered
 * @returns {Object} Marker options
 */
export function createMidpointMarkerOptions(isHovered = false) {
  return {
    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
    scale: isHovered ? 6 : 5,
    fillColor: isHovered ? '#10B981' : '#94A3B8',
    fillOpacity: isHovered ? 1 : 0.7,
    strokeColor: '#FFFFFF',
    strokeWeight: 1,
    cursor: 'pointer',
    zIndex: 500
  };
}

/**
 * Create polygon style options
 * @param {boolean} isEditing - Whether polygon is in edit mode
 * @param {boolean} isValid - Whether polygon is valid
 * @returns {Object} Polygon options
 */
export function createPolygonStyleOptions(isEditing = false, isValid = true) {
  let strokeColor = '#3B82F6';
  let fillColor = '#3B82F6';
  
  if (!isValid) {
    strokeColor = '#EF4444';
    fillColor = '#EF4444';
  } else if (isEditing) {
    strokeColor = '#10B981';
    fillColor = '#10B981';
  }
  
  return {
    strokeColor,
    strokeOpacity: 1,
    strokeWeight: 2,
    fillColor,
    fillOpacity: 0.2,
    clickable: isEditing,
    draggable: false,
    editable: false,
    geodesic: true
  };
}

/**
 * Format coordinate for display
 * @param {{lat: number, lng: number}} coord - Coordinate
 * @param {number} precision - Decimal places
 * @returns {string} Formatted coordinate
 */
export function formatCoordinate(coord, precision = 6) {
  return `${coord.lat.toFixed(precision)}, ${coord.lng.toFixed(precision)}`;
}

/**
 * Parse coordinate string
 * @param {string} coordString - Coordinate string (e.g., "37.7749, -122.4194")
 * @returns {{lat: number, lng: number}|null} Parsed coordinate
 */
export function parseCoordinate(coordString) {
  const parts = coordString.split(',').map(s => s.trim());
  
  if (parts.length !== 2) return null;
  
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  
  return { lat, lng };
}

/**
 * Debounce function for performance optimization
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for performance optimization
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

