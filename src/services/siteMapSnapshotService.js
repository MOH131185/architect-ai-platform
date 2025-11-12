/**
 * Site Map Snapshot Service
 *
 * Captures Google Maps snapshot with polygon overlay for pixel-exact parity across A1 modifications.
 * Ensures the site map in the A1 sheet doesn't drift when modifications are made.
 *
 * Features:
 * - Google Static Maps API integration with polygon overlay
 * - SHA256 hash for deduplication and validation
 * - Metadata tracking (center, zoom, mapType, size, polygon coords)
 * - Persistent snapshot storage for exact reuse in modifications
 */

import CryptoJS from 'crypto-js';

/**
 * Get site snapshot from Google Static Maps API
 * @param {Object} params - Snapshot parameters
 * @param {Object} params.coordinates - { lat, lng } coordinates
 * @param {Array} params.polygon - Optional array of { lat, lng } points for site boundary overlay
 * @param {number} params.zoom - Zoom level (default 19, used if polygon not provided)
 * @param {Array} params.size - [width, height] in pixels (default [640, 400])
 * @param {string} params.mapType - Map type: 'roadmap' (default), 'satellite', 'hybrid', 'terrain'
 * @returns {Promise<string>} Base64 data URL of the map image
 */
export async function getSiteSnapshot({ 
  coordinates, 
  polygon = null, 
  zoom = 19, 
  size = [640, 400],
  mapType = 'roadmap'
}) {
  if (!coordinates || !coordinates.lat || !coordinates.lng) {
    throw new Error('Coordinates are required (lat, lng)');
  }

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  Google Maps API key not found. Site map snapshot will be skipped.');
    return null;
  }

  const sizeParam = `${size[0]}x${size[1]}`;
  
  // Build polygon path if provided
  let pathParam = '';
  if (polygon && Array.isArray(polygon) && polygon.length > 0) {
    const pathPoints = polygon
      .map(({ lat, lng }) => `${lat},${lng}`)
      .join('|');
    
    // Yellow semi-transparent fill with yellow border
    pathParam = `&path=fillcolor:0xFFFF0033|color:0xffcc00ff|weight:4|${pathPoints}`;
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
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}` +
              (visibleParam ? visibleParam : `&zoom=${zoom}`) +
              `&size=${sizeParam}` +
              `&scale=2` + // High-resolution (2x scale)
              `&format=png` + // PNG format for better quality
              `&maptype=${mapType}` + // Map type (roadmap for plan mode)
              pathParam +
              `&key=${apiKey}`;

  try {
    console.log(`🗺️  Fetching site snapshot from Google Static Maps...`);
    console.log(`   Center: ${coordinates.lat}, ${coordinates.lng}`);
    console.log(`   Map Type: ${mapType}`);
    console.log(`   ${visibleParam ? 'Visible bounds (auto-fit)' : `Zoom: ${zoom}`}`);
    console.log(`   Size: ${size[0]}×${size[1]}px`);
    console.log(`   Polygon overlay: ${polygon ? `${polygon.length} points` : 'none'}`);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Google Static Maps API error: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${errorText.substring(0, 200)}`);
      throw new Error(`Google Static Maps API error: ${response.status}`);
    }

    const blob = await response.blob();

    // Convert blob to base64 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        console.log(`✅ Site snapshot fetched successfully`);
        console.log(`   Data URL length: ${dataUrl.length} chars`);
        resolve(dataUrl);
      };
      reader.onerror = () => {
        console.error('❌ Failed to convert blob to base64');
        reject(new Error('Failed to convert map image to base64'));
      };
      reader.readAsDataURL(blob);
    });

  } catch (error) {
    console.error('❌ Site snapshot fetch failed:', error.message);
    // Return null instead of throwing - allows workflow to continue without site map
    return null;
  }
}

/**
 * Get site snapshot with attribution metadata
 * @param {Object} params - Same as getSiteSnapshot, plus optional mapType (defaults to 'roadmap')
 * @returns {Promise<Object>} { dataUrl, attribution, sourceUrl, hasPolygon }
 */
export async function getSiteSnapshotWithMetadata(params) {
  // Ensure mapType defaults to 'roadmap' for plan mode
  const dataUrl = await getSiteSnapshot({
    ...params,
    mapType: params.mapType || 'roadmap'
  });

  if (!dataUrl) {
    return null;
  }

  return {
    dataUrl,
    attribution: 'Map data © Google',
    sourceUrl: 'google-static-maps',
    hasPolygon: params.polygon && params.polygon.length > 0
  };
}

/**
 * Capture site snapshot with full metadata for persistence (ENHANCED for A1 parity)
 * @param {Object} params - Snapshot parameters
 * @param {Object} params.center - Map center { lat, lng }
 * @param {number} params.zoom - Zoom level (default: 17)
 * @param {string} params.mapType - Map type: 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
 * @param {Object} params.size - Image size { width, height } (default: { width: 400, height: 300 })
 * @param {Array} params.polygon - Polygon coordinates [{ lat, lng }, ...]
 * @param {Object} params.polygonStyle - Polygon style { strokeColor, strokeWeight, fillColor, fillOpacity }
 * @returns {Promise<Object>} Snapshot with { dataUrl, sha256, center, zoom, mapType, size, polygon, polygonStyle, capturedAt }
 */
export async function captureSnapshotForPersistence({
  center = null,
  coordinates = null, // Alias for center
  zoom = 17,
  mapType = 'hybrid',
  size = { width: 400, height: 300 },
  polygon = null,
  polygonStyle = { strokeColor: 'red', strokeWeight: 2, fillColor: 'red', fillOpacity: 0.2 }
}) {
  // Accept both 'center' and 'coordinates' for backward compatibility
  const resolvedCenter = center || coordinates;

  if (!resolvedCenter || !resolvedCenter.lat || !resolvedCenter.lng) {
    console.warn('⚠️ No valid center/coordinates provided for site snapshot');
    return null;
  }

  console.log('📸 Capturing site snapshot for persistence...');
  console.log(`   Center: ${resolvedCenter.lat.toFixed(6)}, ${resolvedCenter.lng.toFixed(6)}`);
  console.log(`   Zoom: ${zoom}, Map type: ${mapType}`);
  console.log(`   Size: ${size.width}×${size.height}px`);
  console.log(`   Polygon: ${polygon ? polygon.length + ' points' : 'none'}`);

  try {
    // Convert size to array format for getSiteSnapshot
    const sizeArray = [size.width || 400, size.height || 300];

    // Capture snapshot using existing function
    const dataUrl = await getSiteSnapshot({
      coordinates: resolvedCenter,
      polygon,
      zoom,
      size: sizeArray,
      mapType
    });

    if (!dataUrl) {
      console.warn('⚠️ Site snapshot capture returned null');
      return null;
    }

    // Compute SHA256 hash for deduplication
    const sha256 = CryptoJS.SHA256(dataUrl).toString();

    console.log('✅ Site snapshot captured with metadata');
    console.log(`   Hash: ${sha256.substring(0, 16)}...`);
    console.log(`   Data URL length: ${dataUrl.length} chars`);

    return {
      dataUrl,
      sha256,
      center: resolvedCenter,
      zoom,
      mapType,
      size: { width: sizeArray[0], height: sizeArray[1] },
      polygon,
      polygonStyle,
      capturedAt: new Date().toISOString(),
      source: 'google-static-maps-api'
    };

  } catch (error) {
    console.error('❌ Failed to capture site snapshot for persistence:', error);
    return null;
  }
}

export default {
  getSiteSnapshot,
  getSiteSnapshotWithMetadata,
  captureSnapshotForPersistence
};

