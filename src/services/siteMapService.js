/**
 * Site Map Service
 *
 * Fetches static map images using Google Static Maps API
 * for inclusion in A1 architectural sheets
 */

/**
 * Generate static map URL for A1 sheet
 * @param {object} options - Map configuration
 * @param {object} options.location - Location data with coordinates
 * @param {Array} options.sitePolygon - Optional site boundary polygon
 * @param {string} options.size - Map size (default: '640x400')
 * @param {number} options.zoom - Zoom level (default: 17)
 * @param {string} options.mapType - Map type: 'roadmap', 'satellite', 'hybrid', 'terrain' (default: 'hybrid')
 * @param {string} options.scale - '1' or '2' for retina (default: '2')
 * @returns {Promise<object>} Map data {url, attribution, scale}
 */
export async function fetchSiteMap(options = {}) {
  const {
    location,
    sitePolygon = null,
    size = '640x400',
    zoom = 17,
    mapType = 'hybrid',
    scale = '2'
  } = options;

  if (!location || !location.coordinates) {
    console.warn('[SITE_MAP] No location coordinates provided');
    return getFallbackMap();
  }

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('[SITE_MAP] Google Maps API key not configured, using fallback');
    return getFallbackMap();
  }

  try {
    const { lat, lng } = location.coordinates;

    // Build Static Maps URL
    let url = 'https://maps.googleapis.com/maps/api/staticmap?';
    url += `center=${lat},${lng}`;
    url += `&zoom=${zoom}`;
    url += `&size=${size}`;
    url += `&scale=${scale}`;
    url += `&maptype=${mapType}`;

    // Add site marker
    url += `&markers=color:red%7Clabel:S%7C${lat},${lng}`;

    // Add site polygon if provided
    if (sitePolygon && Array.isArray(sitePolygon) && sitePolygon.length > 0) {
      const pathString = sitePolygon
        .map(point => `${point.lat},${point.lng}`)
        .join('|');
      url += `&path=color:0xFF0000FF%7Cweight:2%7Cfillcolor:0xFF000033%7C${pathString}`;
    }

    url += `&key=${apiKey}`;

    console.log('[SITE_MAP] Generated static map URL');

    return {
      url,
      attribution: 'Map data ©2024 Google',
      scale: '1:500 (indicative)',
      disclaimer: 'Not to scale for construction - indicative only',
      coordinates: { lat, lng }
    };
  } catch (error) {
    console.error('[SITE_MAP] Error generating map:', error);
    return getFallbackMap();
  }
}

/**
 * Get fallback map (placeholder) when API is unavailable
 * @private
 * @returns {object} Fallback map data
 */
function getFallbackMap() {
  return {
    url: generateFallbackMapSVG(),
    attribution: 'Map unavailable',
    scale: '1:500 (indicative)',
    disclaimer: 'Not to scale for construction - indicative only',
    isFallback: true
  };
}

/**
 * Generate fallback map SVG
 * @private
 * @returns {string} Data URL with SVG
 */
function generateFallbackMapSVG() {
  const svg = `
    <svg width="640" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .map-bg { fill: #E8E8E8; }
          .map-grid { stroke: #CCCCCC; stroke-width: 1; }
          .map-marker { fill: #FF0000; }
          .map-text { font-family: Arial, sans-serif; font-size: 14px; fill: #666666; }
        </style>
      </defs>

      <!-- Background -->
      <rect width="640" height="400" class="map-bg" />

      <!-- Grid lines -->
      <line x1="0" y1="100" x2="640" y2="100" class="map-grid" />
      <line x1="0" y1="200" x2="640" y2="200" class="map-grid" />
      <line x1="0" y1="300" x2="640" y2="300" class="map-grid" />
      <line x1="160" y1="0" x2="160" y2="400" class="map-grid" />
      <line x1="320" y1="0" x2="320" y2="400" class="map-grid" />
      <line x1="480" y1="0" x2="480" y2="400" class="map-grid" />

      <!-- Site marker -->
      <circle cx="320" cy="200" r="8" class="map-marker" />
      <text x="320" y="225" text-anchor="middle" class="map-text">SITE</text>

      <!-- Message -->
      <text x="320" y="260" text-anchor="middle" class="map-text" font-weight="bold">
        Map data unavailable
      </text>
      <text x="320" y="280" text-anchor="middle" class="map-text" font-size="12">
        Location: See project data
      </text>
    </svg>
  `;

  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Add scale indicator and disclaimer to map
 * @param {string} mapUrl - Original map URL or SVG
 * @param {string} scale - Scale text (e.g., '1:500')
 * @param {string} disclaimer - Disclaimer text
 * @returns {string} Data URL with annotated map
 */
export function addMapAnnotations(mapUrl, scale = '1:500', disclaimer = 'Not to scale for construction') {
  // This would typically be done in the A1 sheet composer
  // by overlaying text on the map image
  return {
    mapUrl,
    annotations: {
      scale: {
        text: scale,
        position: 'bottom-left',
        style: { fontSize: '12px', fontWeight: 'bold', color: '#000000' }
      },
      disclaimer: {
        text: disclaimer,
        position: 'bottom-center',
        style: { fontSize: '10px', fontStyle: 'italic', color: '#666666' }
      }
    }
  };
}

/**
 * Calculate appropriate zoom level based on site size
 * @param {Array} sitePolygon - Site boundary polygon
 * @returns {number} Recommended zoom level (14-20)
 */
export function calculateOptimalZoom(sitePolygon) {
  if (!sitePolygon || sitePolygon.length < 2) {
    return 17; // Default zoom
  }

  // Calculate bounding box
  const lats = sitePolygon.map(p => p.lat);
  const lngs = sitePolygon.map(p => p.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const maxDiff = Math.max(latDiff, lngDiff);

  // Approximate zoom levels based on degree span
  // (these are rough approximations)
  if (maxDiff > 0.05) return 14; // Very large site
  if (maxDiff > 0.01) return 15; // Large site
  if (maxDiff > 0.005) return 16; // Medium site
  if (maxDiff > 0.002) return 17; // Small site
  if (maxDiff > 0.001) return 18; // Very small site
  return 19; // Tiny site
}

/**
 * Generate site context map with multiple markers
 * @param {object} options - Map options
 * @param {object} options.location - Primary location
 * @param {Array} options.nearbyPoints - Array of {lat, lng, label, color}
 * @returns {Promise<object>} Map data
 */
export async function fetchContextMap(options = {}) {
  const {
    location,
    nearbyPoints = [],
    size = '640x400',
    zoom = 15
  } = options;

  if (!location || !location.coordinates) {
    return getFallbackMap();
  }

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return getFallbackMap();
  }

  try {
    const { lat, lng } = location.coordinates;

    let url = 'https://maps.googleapis.com/maps/api/staticmap?';
    url += `center=${lat},${lng}`;
    url += `&zoom=${zoom}`;
    url += `&size=${size}`;
    url += `&scale=2`;
    url += `&maptype=roadmap`;

    // Add primary marker
    url += `&markers=color:red%7Clabel:S%7C${lat},${lng}`;

    // Add nearby points
    nearbyPoints.forEach((point, i) => {
      const color = point.color || 'blue';
      const label = point.label || String(i + 1);
      url += `&markers=color:${color}%7Clabel:${label}%7C${point.lat},${point.lng}`;
    });

    url += `&key=${apiKey}`;

    return {
      url,
      attribution: 'Map data ©2024 Google',
      scale: 'Context map',
      type: 'context'
    };
  } catch (error) {
    console.error('[SITE_MAP] Error generating context map:', error);
    return getFallbackMap();
  }
}

/**
 * Estimate physical dimensions from map coordinates
 * @param {Array} sitePolygon - Site boundary polygon
 * @returns {object} Dimensions {width, height, area} in meters
 */
export function calculateSiteDimensions(sitePolygon) {
  if (!sitePolygon || sitePolygon.length < 3) {
    return { width: 0, height: 0, area: 0 };
  }

  // Calculate bounding box in meters
  const lats = sitePolygon.map(p => p.lat);
  const lngs = sitePolygon.map(p => p.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Approximate conversion (rough - assumes flat earth at small scales)
  // 1 degree latitude ≈ 111 km
  // 1 degree longitude ≈ 111 km * cos(latitude)
  const avgLat = (minLat + maxLat) / 2;

  const height = (maxLat - minLat) * 111000; // meters
  const width = (maxLng - minLng) * 111000 * Math.cos((avgLat * Math.PI) / 180); // meters

  // Estimate area using shoelace formula
  let area = 0;
  for (let i = 0; i < sitePolygon.length; i++) {
    const j = (i + 1) % sitePolygon.length;
    const xi = sitePolygon[i].lng * 111000 * Math.cos((avgLat * Math.PI) / 180);
    const yi = sitePolygon[i].lat * 111000;
    const xj = sitePolygon[j].lng * 111000 * Math.cos((avgLat * Math.PI) / 180);
    const yj = sitePolygon[j].lat * 111000;
    area += xi * yj - xj * yi;
  }
  area = Math.abs(area) / 2;

  return {
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
    area: Math.round(area * 10) / 10
  };
}

export default {
  fetchSiteMap,
  addMapAnnotations,
  calculateOptimalZoom,
  fetchContextMap,
  calculateSiteDimensions
};
