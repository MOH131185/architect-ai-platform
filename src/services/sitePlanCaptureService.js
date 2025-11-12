/**
 * Site Plan Capture Service
 *
 * Captures Google Maps site plan image for embedding in A1 sheet.
 * Generates Google Static Maps URL with polygon overlay and returns base64 image.
 *
 * This service is specifically designed for A1 sheet generation where the site plan
 * must be embedded within the AI-generated sheet (not overlaid in UI).
 *
 * Features:
 * - Capture site plan with user-defined polygon overlay
 * - Auto-fit view to polygon bounds or manual zoom/center
 * - Polygon simplification for large/complex boundaries
 * - Placeholder generation when capture fails
 * - Base64 data URL output for direct attachment to A1 prompts
 *
 * LOGGING: Uses centralized logger (Opus 4.1 compliant)
 */

import logger from '../utils/logger';

/**
 * Generate Google Static Maps URL with polygon overlay
 * @param {Object} params - Capture parameters
 * @param {Object} params.center - Map center { lat, lng }
 * @param {number} params.zoom - Zoom level (default: 17)
 * @param {Array} params.polygon - Polygon coordinates [{ lat, lng }, ...]
 * @param {Object} params.size - Image size { width, height } (default: { width: 1280, height: 1280 })
 * @param {string} params.mapType - Map type: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' (default: 'hybrid')
 * @returns {Promise<Object>} { dataUrl, metadata }
 */
export async function captureSitePlanForA1({
  center,
  zoom = 17,
  polygon = null,
  size = { width: 1280, height: 1280 },
  mapType = 'hybrid'
}) {
  if (!center || !center.lat || !center.lng) {
    throw new Error('Center coordinates are required (lat, lng)');
  }

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    logger.warn('Google Maps API key not found. Site plan capture will be skipped.');
    return null;
  }

  const sizeParam = `${size.width}x${size.height}`;
  
  // Build polygon path if provided
  let pathParam = '';
  if (polygon && Array.isArray(polygon) && polygon.length > 0) {
    const pathPoints = polygon
      .map(({ lat, lng }) => `${lat},${lng}`)
      .join('|');
    
    // Red semi-transparent fill with red border for site boundary
    pathParam = `&path=fillcolor:0xFF000033|color:0xff0000ff|weight:4|${pathPoints}`;
  }

  // Build visible parameter if polygon provided (auto-fit view to polygon)
  let visibleParam = '';
  if (polygon && Array.isArray(polygon) && polygon.length > 0) {
    // Use visible parameter to auto-fit map to polygon bounds
    const visiblePoints = polygon
      .map(({ lat, lng }) => `${lat},${lng}`)
      .join('|');
    visibleParam = `&visible=${visiblePoints}`;
  }

  // Build Google Static Maps URL
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}` +
              (visibleParam ? visibleParam : `&zoom=${zoom}`) +
              `&size=${sizeParam}` +
              `&scale=2` + // High-resolution (2x scale)
              `&format=png` + // PNG format for better quality
              `&maptype=${mapType}` + // Map type (hybrid for satellite + labels)
              pathParam +
              `&key=${apiKey}`;

  try {
    logger.info('Capturing site plan for A1 sheet', {
      center: `${center.lat}, ${center.lng}`,
      mapType,
      zoom: visibleParam ? 'auto-fit' : zoom,
      size: `${size.width}×${size.height}px`,
      polygonPoints: polygon ? polygon.length : 0
    }, '🗺️');

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Google Static Maps API error', {
        status: response.status,
        statusText: response.statusText,
        response: errorText.substring(0, 200)
      });
      throw new Error(`Google Static Maps API error: ${response.status}`);
    }

    const blob = await response.blob();
    const sizeKB = (blob.size / 1024).toFixed(1);

    // Convert blob to base64 data URL
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        logger.success('Site plan captured successfully', {
          dataUrlLength: result.length,
          sizeKB: `${sizeKB}KB`
        });
        resolve(result);
      };
      reader.onerror = () => {
        logger.error('Failed to convert blob to base64');
        reject(new Error('Failed to convert map image to base64'));
      };
      reader.readAsDataURL(blob);
    });

    return {
      dataUrl,
      metadata: {
        center,
        zoom: visibleParam ? 'auto-fit' : zoom,
        mapType,
        size,
        hasPolygon: !!polygon,
        polygonPointCount: polygon ? polygon.length : 0,
        capturedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error('Site plan capture failed', error);
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Simplify polygon by reducing number of vertices
 * Useful when polygon is too complex for Static Maps URL length limits
 *
 * @param {Array} polygon - Original polygon [{ lat, lng }, ...]
 * @param {number} maxVertices - Maximum vertices to keep (default: 20)
 * @returns {Array} Simplified polygon
 */
export function simplifyPolygon(polygon, maxVertices = 20) {
  if (!polygon || polygon.length <= maxVertices) {
    return polygon;
  }

  logger.info('Simplifying polygon', {
    originalVertices: polygon.length,
    targetVertices: maxVertices
  }, '🔧');

  // Simple decimation: keep every nth vertex
  const step = Math.ceil(polygon.length / maxVertices);
  const simplified = [];

  for (let i = 0; i < polygon.length; i += step) {
    simplified.push(polygon[i]);
  }

  // Always include last vertex if not already included
  const lastOriginal = polygon[polygon.length - 1];
  const lastSimplified = simplified[simplified.length - 1];

  if (lastSimplified.lat !== lastOriginal.lat || lastSimplified.lng !== lastOriginal.lng) {
    simplified.push(lastOriginal);
  }

  logger.success('Polygon simplified', {
    from: polygon.length,
    to: simplified.length,
    reduction: `${(((polygon.length - simplified.length) / polygon.length) * 100).toFixed(0)}%`
  });

  return simplified;
}

/**
 * Generate placeholder site plan when capture fails or is unavailable
 * Creates a simple canvas with "SITE PLAN" text and north arrow
 *
 * @param {Object} location - Location data (optional)
 * @returns {Promise<Object>} { dataUrl, metadata }
 */
export async function generatePlaceholder(location = null) {
  logger.info('Generating site plan placeholder', null, '📋');

  try {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 1280;

    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SITE PLAN', canvas.width / 2, canvas.height / 2 - 100);

    // Subtitle
    ctx.font = '48px Arial, sans-serif';
    ctx.fillText('Site plan to be inserted', canvas.width / 2, canvas.height / 2 + 20);

    // Location if provided
    if (location?.address) {
      ctx.font = '36px Arial, sans-serif';
      const addressLines = location.address.split(',');
      addressLines.forEach((line, idx) => {
        ctx.fillText(line.trim(), canvas.width / 2, canvas.height / 2 + 100 + (idx * 50));
      });
    }

    // North arrow (top center)
    ctx.font = 'bold 80px Arial, sans-serif';
    ctx.fillText('↑', canvas.width / 2, 150);
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText('N', canvas.width / 2, 250);

    // Scale label (bottom)
    ctx.font = '32px Arial, sans-serif';
    ctx.fillText('Scale to be determined', canvas.width / 2, canvas.height - 100);

    const dataUrl = canvas.toDataURL('image/png');

    logger.success('Placeholder generated successfully');

    return {
      dataUrl,
      metadata: {
        center: location?.coordinates || { lat: 0, lng: 0 },
        zoom: 'placeholder',
        mapType: 'placeholder',
        size: { width: 1280, height: 1280 },
        hasPolygon: false,
        polygonPointCount: 0,
        isPlaceholder: true,
        capturedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error('Failed to generate placeholder', error);
    throw error;
  }
}

/**
 * Capture site plan from current map state
 * @param {Object} mapState - Current map state from Google Maps
 * @param {Object} mapState.center - Map center { lat, lng }
 * @param {number} mapState.zoom - Current zoom level
 * @param {Array} mapState.polygon - Site polygon coordinates [{ lat, lng }, ...]
 * @returns {Promise<Object>} { dataUrl, metadata }
 */
export async function captureFromMapState(mapState) {
  if (!mapState || !mapState.center) {
    throw new Error('Map state with center is required');
  }

  return captureSitePlanForA1({
    center: mapState.center,
    zoom: mapState.zoom || 17,
    polygon: mapState.polygon || null,
    size: { width: 1280, height: 1280 },
    mapType: 'hybrid' // Hybrid for satellite + labels
  });
}

export default {
  captureSitePlanForA1,
  captureFromMapState,
  simplifyPolygon,
  generatePlaceholder
};

