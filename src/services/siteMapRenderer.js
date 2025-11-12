/**
 * Site Map Renderer
 * 
 * Generates high-resolution site location map images using Google Static Maps API
 * with polygon overlay for UK A1 sheet inclusion
 */

/**
 * Generate site location map image URL
 * @param {Object} params - Map parameters
 * @param {Object} params.coordinates - {lat, lng} center coordinates
 * @param {Array} params.sitePolygon - Array of {lat, lng} points for site boundary
 * @param {string} params.apiKey - Google Maps API key
 * @param {number} params.width - Image width in pixels (default 400)
 * @param {number} params.height - Image height in pixels (default 400)
 * @param {number} params.zoom - Map zoom level (default 16)
 * @param {string} params.mapType - Map type: 'satellite', 'hybrid', or 'roadmap' (default 'hybrid')
 * @returns {string} Google Static Maps API URL
 */
export function generateSiteMapURL({
  coordinates,
  sitePolygon = null,
  apiKey,
  width = 400,
  height = 400,
  zoom = 16,
  mapType = 'hybrid'
}) {
  if (!coordinates || !apiKey) {
    console.warn('⚠️ Site map requires coordinates and API key');
    return null;
  }

  const { lat, lng } = coordinates;
  
  // Base URL for Google Static Maps API
  const baseURL = 'https://maps.googleapis.com/maps/api/staticmap';
  
  // Build parameters
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: zoom.toString(),
    size: `${width}x${height}`,
    maptype: mapType,
    key: apiKey
  });

  // Add markers for site center
  params.append('markers', `color:red|label:S|${lat},${lng}`);

  // Add path for site polygon if provided
  if (sitePolygon && Array.isArray(sitePolygon) && sitePolygon.length > 0) {
    // Convert polygon points to path string
    const pathPoints = sitePolygon
      .map(point => {
        // Handle both {lat, lng} and [lat, lng] formats
        const pLat = point.lat !== undefined ? point.lat : point[0];
        const pLng = point.lng !== undefined ? point.lng : point[1];
        return `${pLat},${pLng}`;
      })
      .join('|');
    
    // Add path with style (red fill, black border)
    params.append('path', `fillcolor:0xff000080|color:0x000000|weight:2|${pathPoints}`);
  }

  // Add north arrow marker (small, decorative)
  // Note: This is approximate - actual north arrow rendering should be done in SVG overlay
  
  const url = `${baseURL}?${params.toString()}`;
  console.log('🗺️ Generated site map URL:', url.substring(0, 100) + '...');
  
  return url;
}

/**
 * Generate site map as data URL (requires fetching image)
 * Note: This requires CORS to be enabled on Google Static Maps API
 * @param {Object} params - Same as generateSiteMapURL
 * @returns {Promise<string>} Data URL of the map image
 */
export async function generateSiteMapDataURL(params) {
  const url = generateSiteMapURL(params);
  
  if (!url) {
    return null;
  }

  try {
    // Fetch image via proxy to avoid CORS issues
    const proxyUrl = process.env.NODE_ENV === 'production' 
      ? `/api/site-map?url=${encodeURIComponent(url)}`
      : `http://localhost:3001/api/site-map?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch site map: ${response.statusText}`);
    }

    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('❌ Failed to generate site map data URL:', error);
    // Return placeholder if fetch fails
    return generatePlaceholderSiteMap(params.width || 400, params.height || 400);
  }
}

/**
 * Generate placeholder site map (fallback)
 */
function generatePlaceholderSiteMap(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, width, height);
  
  // Grid pattern
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  for (let i = 0; i < height; i += 20) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
  
  // Center marker
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Label
  ctx.fillStyle = '#333333';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Site Location', width / 2, height / 2 + 25);
  
  return canvas.toDataURL('image/png');
}

/**
 * Generate site map with north arrow overlay (SVG)
 * Returns SVG element that can be embedded in A1 sheet
 */
export function generateSiteMapSVG({
  mapImageURL,
  width = 400,
  height = 400,
  showNorthArrow = true,
  northArrowSize = 40
}) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background map image -->
      ${mapImageURL ? `<image href="${mapImageURL}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>` : ''}
      
      <!-- North arrow overlay -->
      ${showNorthArrow ? generateNorthArrowSVG(width - northArrowSize - 10, 10, northArrowSize) : ''}
    </svg>
  `;
  
  return svg;
}

/**
 * Generate north arrow SVG element
 */
function generateNorthArrowSVG(x, y, size) {
  const arrowSize = size * 0.6;
  const poleHeight = size * 0.8;
  
  return `
    <g transform="translate(${x}, ${y})">
      <!-- Arrow shaft -->
      <line x1="${size / 2}" y1="${size - poleHeight}" 
            x2="${size / 2}" y2="${size}" 
            stroke="#000" stroke-width="2"/>
      
      <!-- Arrow head (N) -->
      <polygon points="${size / 2},${size - poleHeight} 
                      ${size / 2 - arrowSize / 2},${size - poleHeight + arrowSize / 2} 
                      ${size / 2 + arrowSize / 2},${size - poleHeight + arrowSize / 2}"
               fill="#000"/>
      
      <!-- N label -->
      <text x="${size / 2}" y="${size - poleHeight - 5}" 
            text-anchor="middle" 
            font-family="Arial, sans-serif" 
            font-size="12" 
            font-weight="bold" 
            fill="#000">N</text>
    </g>
  `;
}

/**
 * Generate SVG site plan with building footprint and site boundary
 * Used as fallback when Google Maps API is unavailable
 *
 * @param {Object} params - Site plan parameters
 * @param {Array} params.sitePolygon - Array of {lat, lng} points
 * @param {Object} params.coordinates - Center coordinates {lat, lng}
 * @param {number} params.width - SVG width in pixels
 * @param {number} params.height - SVG height in pixels
 * @returns {string} SVG string
 */
export function generateSVGSitePlan({
  sitePolygon = null,
  coordinates = null,
  buildingFootprint = null,
  width = 400,
  height = 400
}) {
  console.log('🗺️ Generating SVG site plan fallback...');

  const margin = 40;
  const drawWidth = width - margin * 2;
  const drawHeight = height - margin * 2;

  // Convert lat/lng to SVG coordinates
  const toSVGCoords = (points) => {
    if (!points || points.length === 0) return [];

    // Find bounds
    const lats = points.map(p => p.lat || p.y || 0);
    const lngs = points.map(p => p.lng || p.x || 0);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;

    // Map to SVG coordinates (flip Y axis for SVG)
    return points.map(p => {
      const lat = p.lat || p.y || 0;
      const lng = p.lng || p.x || 0;
      const x = margin + ((lng - minLng) / lngRange) * drawWidth;
      const y = margin + ((maxLat - lat) / latRange) * drawHeight; // Flip Y
      return { x, y };
    });
  };

  // Generate site polygon path
  let sitePath = '';
  if (sitePolygon && sitePolygon.length > 0) {
    const svgPoints = toSVGCoords(sitePolygon);
    sitePath = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
  } else {
    // Default rectangle if no polygon
    sitePath = `M ${margin},${margin} L ${width - margin},${margin} L ${width - margin},${height - margin} L ${margin},${height - margin} Z`;
  }

  // Generate building footprint (smaller rectangle centered in site)
  let buildingPath = '';
  if (buildingFootprint && buildingFootprint.length > 0) {
    const svgPoints = toSVGCoords(buildingFootprint);
    buildingPath = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
  } else {
    // Default building footprint (60% of site, centered)
    const bMargin = margin + drawWidth * 0.2;
    const bWidth = drawWidth * 0.6;
    const bHeight = drawHeight * 0.6;
    buildingPath = `M ${bMargin},${margin + drawHeight * 0.2} L ${bMargin + bWidth},${margin + drawHeight * 0.2} L ${bMargin + bWidth},${margin + drawHeight * 0.2 + bHeight} L ${bMargin},${margin + drawHeight * 0.2 + bHeight} Z`;
  }

  // Coordinates text
  const coordText = coordinates
    ? `${coordinates.lat.toFixed(4)}°N, ${Math.abs(coordinates.lng).toFixed(4)}°${coordinates.lng < 0 ? 'W' : 'E'}`
    : 'Location TBD';

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>
        </pattern>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#f5f5f5"/>
      <rect width="${width}" height="${height}" fill="url(#gridPattern)"/>

      <!-- Site boundary -->
      <path d="${sitePath}"
            fill="rgba(200, 230, 200, 0.3)"
            stroke="#4CAF50"
            stroke-width="2"
            stroke-dasharray="5,5"/>

      <!-- Building footprint -->
      <path d="${buildingPath}"
            fill="rgba(255, 100, 100, 0.5)"
            stroke="#D32F2F"
            stroke-width="2"/>

      <!-- North arrow -->
      <g transform="translate(${width - 50}, 30)">
        <line x1="20" y1="5" x2="20" y2="30" stroke="#000" stroke-width="2"/>
        <polygon points="20,5 15,15 25,15" fill="#000"/>
        <text x="20" y="45" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#000">N</text>
      </g>

      <!-- Scale bar -->
      <g transform="translate(${margin}, ${height - 30})">
        <line x1="0" y1="0" x2="100" y2="0" stroke="#000" stroke-width="2"/>
        <line x1="0" y1="-5" x2="0" y2="5" stroke="#000" stroke-width="2"/>
        <line x1="100" y1="-5" x2="100" y2="5" stroke="#000" stroke-width="2"/>
        <text x="50" y="15" text-anchor="middle" font-family="Arial" font-size="10" fill="#000">0   20m</text>
      </g>

      <!-- Labels -->
      <text x="${width / 2}" y="20" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#333">SITE LOCATION PLAN</text>
      <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-family="Arial" font-size="10" fill="#666">${coordText}</text>

      <!-- Legend -->
      <g transform="translate(${margin}, ${margin + 10})">
        <rect x="0" y="0" width="15" height="15" fill="rgba(200, 230, 200, 0.3)" stroke="#4CAF50" stroke-width="1"/>
        <text x="20" y="12" font-family="Arial" font-size="9" fill="#333">Site Boundary</text>

        <rect x="0" y="20" width="15" height="15" fill="rgba(255, 100, 100, 0.5)" stroke="#D32F2F" stroke-width="1"/>
        <text x="20" y="32" font-family="Arial" font-size="9" fill="#333">Building</text>
      </g>

      <!-- Scale indicator -->
      <text x="${margin}" y="${height - 45}" font-family="Arial" font-size="9" fill="#666">Scale: 1:500 (approx)</text>
    </svg>
  `;

  return svg.trim();
}

export default {
  generateSiteMapURL,
  generateSiteMapDataURL,
  generateSiteMapSVG,
  generateSVGSitePlan
};

