/**
 * Site Map Capture Service
 * Captures true-overhead (orthographic) site map from Google Maps DOM
 * Includes polygon overlay and scale bar
 */

import html2canvas from 'html2canvas';

/**
 * Capture site using Google Static Maps API
 * @param {Object} params - { center: {lat, lng}, polygon: [{lat, lng},...], zoom: 19 }
 * @returns {Promise<string>} Data URL of captured map
 */
export async function captureStaticMap({ center, polygon = [], zoom = 19 }) {
  const googleMapsApiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    throw new Error('Google Maps API key not configured');
  }

  console.log('🗺️ Using Google Static Maps for accurate capture...');

  // Build Static Maps URL
  const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
  const params = new URLSearchParams({
    center: `${center.lat},${center.lng}`,
    zoom: zoom.toString(),
    size: '1024x768',
    scale: '2',
    maptype: 'satellite',
    key: googleMapsApiKey
  });

  // Add polygon overlay
  if (polygon.length > 0) {
    const polygonPath = polygon.map(p => `${p.lat},${p.lng}`).join('|');
    params.append('path', `color:0xff0000ff|weight:3|fillcolor:0xff000033|${polygonPath}`);
  }

  // Add center marker
  params.append('markers', `color:red|${center.lat},${center.lng}`);

  const url = `${baseUrl}?${params.toString()}`;

  // Fetch image
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Static Maps API returned ${response.status}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Capture overhead site map from map container
 * Forces overhead view (heading=0, tilt=0) and captures with polygon + scale bar
 */
export async function captureOverheadMap(containerEl, options = {}) {
  const {
    polygon = null,
    zoom = 18,
    center = null,
    mapInstance = null
  } = options;

  // Prefer static map capture when possible (exact coordinates, no placeholder math)
  if (!mapInstance && center && polygon) {
    try {
      console.log('🗺️ Using Google Static Maps for accurate capture...');
      return await captureStaticMap({ center, polygon, zoom });
    } catch (error) {
      console.warn('Static Maps failed, falling back to html2canvas...', error);
    }
  }

  if (!containerEl) {
    throw new Error('Container element is required');
  }

  console.log('📸 Capturing overhead site map with html2canvas...');

  try {
    // Step 1: Ensure map is in overhead (orthographic) view
    if (mapInstance) {
      await ensureOverheadMapState(mapInstance, { zoom, center });
    } else {
      console.log('ℹ️ Map instance not provided - capturing current view as-is');
    }

    // Step 2: Wait for map to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Render polygon overlay if provided
    let polygonOverlayEl = null;
    if (polygon && Array.isArray(polygon) && polygon.length > 0) {
      polygonOverlayEl = await renderPolygonOverlay(containerEl, polygon, mapInstance);
    }

    // Step 4: Render scale bar
    const scaleBarEl = await renderScaleBar(containerEl, center, zoom);

    // Step 5: Capture the map container with html2canvas
    const canvas = await html2canvas(containerEl, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: 1,
      logging: false,
      width: containerEl.offsetWidth,
      height: containerEl.offsetHeight
    });

    // Step 6: Convert to data URL
    const dataURL = canvas.toDataURL('image/png');

    // Step 7: Cleanup overlay elements
    if (polygonOverlayEl) {
      polygonOverlayEl.remove();
    }
    if (scaleBarEl) {
      scaleBarEl.remove();
    }

    console.log('✅ Site map captured successfully');
    return dataURL;

  } catch (error) {
    console.error('❌ Failed to capture site map:', error);
    throw error;
  }
}

/**
 * Ensure map is in overhead (orthographic) state
 * heading=0, tilt=0, zoom adjusted
 */
async function ensureOverheadMapState(mapInstance, { zoom, center }) {
  if (!mapInstance) {
    return;
  }

  try {
    // Set map to overhead view
    mapInstance.setHeading(0);
    mapInstance.setTilt(0);
    
    if (zoom) {
      mapInstance.setZoom(zoom);
    }

    if (center && center.lat && center.lng) {
      mapInstance.setCenter(center);
    }

    // Wait for map to update
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error) {
    console.warn('⚠️ Could not set map to overhead state:', error);
  }
}

/**
 * Render polygon overlay on map container
 */
async function renderPolygonOverlay(containerEl, polygon, mapInstance) {
  if (!polygon || !Array.isArray(polygon) || polygon.length === 0) {
    return null;
  }

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '1000';

  // Create SVG for polygon
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';

  // Convert lat/lng to pixel coordinates using proper projection
  let points;

  if (mapInstance && mapInstance.getProjection && window.google && window.google.maps) {
    // Use Google Maps projection if available
    const projection = mapInstance.getProjection();
    const bounds = mapInstance.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    points = polygon.map(point => {
      const latLng = new window.google.maps.LatLng(point.lat, point.lng);
      const worldPoint = projection.fromLatLngToPoint(latLng);
      const topLeftWorldPoint = projection.fromLatLngToPoint(ne);
      const bottomRightWorldPoint = projection.fromLatLngToPoint(sw);

      // Scale to container dimensions
      const scale = Math.pow(2, mapInstance.getZoom());
      const x = (worldPoint.x - topLeftWorldPoint.x) * scale;
      const y = (worldPoint.y - topLeftWorldPoint.y) * scale;

      return `${x},${y}`;
    }).join(' ');
  } else {
    // Fallback: Calculate relative positions based on polygon bounds
    const lats = polygon.map(p => p.lat);
    const lngs = polygon.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Add padding
    const latPadding = (maxLat - minLat) * 0.1;
    const lngPadding = (maxLng - minLng) * 0.1;

    const containerWidth = containerEl.offsetWidth;
    const containerHeight = containerEl.offsetHeight;

    points = polygon.map(point => {
      // Normalize coordinates to 0-1 range with padding
      const normalizedX = (point.lng - (minLng - lngPadding)) / ((maxLng + lngPadding) - (minLng - lngPadding));
      const normalizedY = 1 - ((point.lat - (minLat - latPadding)) / ((maxLat + latPadding) - (minLat - latPadding)));

      // Scale to container dimensions with margin
      const margin = 0.05; // 5% margin on each side
      const x = (margin + normalizedX * (1 - 2 * margin)) * containerWidth;
      const y = (margin + normalizedY * (1 - 2 * margin)) * containerHeight;

      return `${x},${y}`;
    }).join(' ');
  }

  const polygonEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygonEl.setAttribute('points', points);
  polygonEl.setAttribute('fill', 'rgba(255, 0, 0, 0.2)');
  polygonEl.setAttribute('stroke', '#ff0000');
  polygonEl.setAttribute('stroke-width', '3');
  polygonEl.setAttribute('stroke-dasharray', '5,2');

  svg.appendChild(polygonEl);
  overlay.appendChild(svg);

  // Append to container
  containerEl.appendChild(overlay);

  return overlay;
}

/**
 * Render scale bar on map
 */
async function renderScaleBar(containerEl, center, zoom) {
  if (!containerEl) {
    return null;
  }

  // Calculate scale based on zoom level and latitude
  const scaleMeters = calculateScaleMeters(zoom, center?.lat || 52.5); // Default to UK latitude

  // Create scale bar element
  const scaleBar = document.createElement('div');
  scaleBar.style.position = 'absolute';
  scaleBar.style.bottom = '20px';
  scaleBar.style.left = '20px';
  scaleBar.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  scaleBar.style.padding = '8px 12px';
  scaleBar.style.borderRadius = '4px';
  scaleBar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  scaleBar.style.fontFamily = 'Arial, sans-serif';
  scaleBar.style.fontSize = '12px';
  scaleBar.style.fontWeight = 'bold';
  scaleBar.style.color = '#333';
  scaleBar.style.zIndex = '1001';
  scaleBar.style.border = '2px solid #000';

  // Create scale bar visual
  const scaleBarVisual = document.createElement('div');
  scaleBarVisual.style.width = '100px';
  scaleBarVisual.style.height = '4px';
  scaleBarVisual.style.backgroundColor = '#000';
  scaleBarVisual.style.marginBottom = '4px';

  scaleBar.appendChild(scaleBarVisual);

  // Add scale text
  const scaleText = document.createElement('div');
  scaleText.textContent = `${scaleMeters}m`;
  scaleBar.appendChild(scaleText);

  // Add compass rose (simplified)
  const compassRose = document.createElement('div');
  compassRose.style.position = 'absolute';
  compassRose.style.top = '20px';
  compassRose.style.right = '20px';
  compassRose.style.width = '60px';
  compassRose.style.height = '60px';
  compassRose.style.border = '2px solid #000';
  compassRose.style.borderRadius = '50%';
  compassRose.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  compassRose.style.display = 'flex';
  compassRose.style.alignItems = 'center';
  compassRose.style.justifyContent = 'center';
  compassRose.style.fontSize = '24px';
  compassRose.style.fontWeight = 'bold';
  compassRose.textContent = 'N';
  compassRose.style.zIndex = '1001';

  containerEl.appendChild(scaleBar);
  containerEl.appendChild(compassRose);

  return { scaleBar, compassRose };
}

/**
 * Calculate scale bar distance in meters based on zoom level
 */
function calculateScaleMeters(zoom, latitude) {
  // Approximate meters per pixel at given zoom and latitude
  // Formula: metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / (2^zoom)
  const metersPerPixel = (156543.03392 * Math.cos(latitude * Math.PI / 180)) / Math.pow(2, zoom);
  
  // Scale bar width in pixels (100px) * meters per pixel
  const scaleMeters = 100 * metersPerPixel;
  
  // Round to nearest nice number
  if (scaleMeters < 10) {
    return Math.round(scaleMeters);
  } else if (scaleMeters < 100) {
    return Math.round(scaleMeters / 5) * 5;
  } else if (scaleMeters < 1000) {
    return Math.round(scaleMeters / 50) * 50;
  } else {
    return Math.round(scaleMeters / 500) * 500;
  }
}

export default {
  captureOverheadMap,
  captureStaticMap
};

