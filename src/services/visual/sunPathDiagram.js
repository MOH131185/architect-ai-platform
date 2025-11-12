/**
 * Sun Path Diagram Generator
 *
 * Generates SVG diagrams showing summer and winter sun paths
 * with azimuth and altitude angles for architectural solar analysis
 */

/**
 * Generate Sun Path Diagram SVG
 * @param {object} options - Configuration options
 * @param {object} options.summer - Summer sun data {azimuth, altitude}
 * @param {object} options.winter - Winter sun data {azimuth, altitude}
 * @param {string} options.facadeOrientation - Main facade orientation (default: 'S')
 * @param {number} options.width - Diagram width (default: 400)
 * @param {number} options.height - Diagram height (default: 300)
 * @returns {string} SVG markup
 */
export function generateSunPathDiagram(options = {}) {
  const {
    summer = { azimuth: 180, altitude: 65 },
    winter = { azimuth: 180, altitude: 25 },
    facadeOrientation = 'S',
    width = 400,
    height = 300
  } = options;

  const centerX = width / 2;
  const centerY = height - 40;
  const radius = Math.min(width, height) / 2 - 60;

  // Convert angles to SVG coordinates
  const summerPath = calculateSunPath(summer, centerX, centerY, radius);
  const winterPath = calculateSunPath(winter, centerX, centerY, radius);

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .sun-path-bg { fill: #F0F8FF; }
          .sun-path-ground { fill: #8B7355; }
          .sun-path-horizon { stroke: #000000; stroke-width: 2; fill: none; }
          .sun-path-summer { stroke: #FF6B35; stroke-width: 3; fill: none; stroke-dasharray: 5,5; }
          .sun-path-winter { stroke: #4A90E2; stroke-width: 3; fill: none; stroke-dasharray: 5,5; }
          .sun-circle { fill: #FFD700; stroke: #FF8C00; stroke-width: 2; }
          .sun-text { font-family: Arial, sans-serif; font-size: 11px; fill: #000000; }
          .sun-label { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; }
          .facade-line { stroke: #000000; stroke-width: 2; }
          .angle-arc { stroke: #666666; stroke-width: 1; fill: none; stroke-dasharray: 2,2; }
        </style>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" class="sun-path-bg" />

      <!-- Ground -->
      <rect x="0" y="${centerY}" width="${width}" height="${height - centerY}" class="sun-path-ground" />

      <!-- Horizon line -->
      <line x1="0" y1="${centerY}" x2="${width}" y2="${centerY}" class="sun-path-horizon" />

      <!-- Facade orientation indicator -->
      ${generateFacadeIndicator(facadeOrientation, centerX, centerY, radius)}

      <!-- Summer sun path -->
      ${generateSunArc(summerPath, 'summer')}

      <!-- Winter sun path -->
      ${generateSunArc(winterPath, 'winter')}

      <!-- Summer sun position -->
      <circle cx="${summerPath.x}" cy="${summerPath.y}" r="12" class="sun-circle" />
      <text x="${summerPath.x + 20}" y="${summerPath.y - 10}" class="sun-text">
        Summer
      </text>
      <text x="${summerPath.x + 20}" y="${summerPath.y + 5}" class="sun-text">
        Alt: ${summer.altitude}°
      </text>
      <text x="${summerPath.x + 20}" y="${summerPath.y + 18}" class="sun-text">
        Az: ${summer.azimuth}°
      </text>

      <!-- Winter sun position -->
      <circle cx="${winterPath.x}" cy="${winterPath.y}" r="10" class="sun-circle" opacity="0.7" />
      <text x="${winterPath.x + 20}" y="${winterPath.y - 10}" class="sun-text">
        Winter
      </text>
      <text x="${winterPath.x + 20}" y="${winterPath.y + 5}" class="sun-text">
        Alt: ${winter.altitude}°
      </text>
      <text x="${winterPath.x + 20}" y="${winterPath.y + 18}" class="sun-text">
        Az: ${winter.azimuth}°
      </text>

      <!-- Title -->
      <text x="${width / 2}" y="20" text-anchor="middle" class="sun-label">
        Sun Path Diagram - ${facadeOrientation} Facade
      </text>

      <!-- Legend -->
      <g transform="translate(10, 30)">
        <line x1="0" y1="0" x2="30" y2="0" class="sun-path-summer" />
        <text x="35" y="4" class="sun-text">Summer solstice</text>

        <line x1="0" y1="15" x2="30" y2="15" class="sun-path-winter" />
        <text x="35" y="19" class="sun-text">Winter solstice</text>
      </g>

      <!-- Compass directions -->
      ${generateCompassLabels(centerX, centerY, radius + 20)}
    </svg>
  `.trim();
}

/**
 * Calculate sun position in SVG coordinates
 * @private
 */
function calculateSunPath(sunData, centerX, centerY, radius) {
  const { azimuth, altitude } = sunData;

  // Convert azimuth to radians (0° = North, 90° = East, 180° = South, 270° = West)
  // Rotate by -90° so that 0° is at top
  const azimuthRad = ((azimuth - 90) * Math.PI) / 180;

  // Scale altitude (0° at horizon, 90° at zenith)
  const altitudeScale = (90 - altitude) / 90;
  const distance = radius * altitudeScale;

  const x = centerX + Math.cos(azimuthRad) * distance;
  const y = centerY - Math.sin(azimuthRad) * distance * 0.6; // Compress vertically for perspective

  return { x, y, azimuth, altitude };
}

/**
 * Generate sun arc path
 * @private
 */
function generateSunArc(sunPath, season) {
  const { x, y } = sunPath;
  const className = season === 'summer' ? 'sun-path-summer' : 'sun-path-winter';

  // Create arc from horizon to sun position
  return `<path d="M ${x - 100} ${sunPath.y + 60} Q ${x - 50} ${y - 20}, ${x} ${y}" class="${className}" />`;
}

/**
 * Generate facade orientation indicator
 * @private
 */
function generateFacadeIndicator(orientation, centerX, centerY, radius) {
  // Draw building silhouette
  const buildingWidth = 60;
  const buildingHeight = 80;
  const buildingX = centerX - buildingWidth / 2;
  const buildingY = centerY - buildingHeight;

  return `
    <g class="facade-indicator">
      <!-- Building silhouette -->
      <rect x="${buildingX}" y="${buildingY}" width="${buildingWidth}" height="${buildingHeight}"
            fill="#333333" stroke="#000000" stroke-width="1" />

      <!-- Facade orientation line -->
      <line x1="${centerX}" y1="${buildingY}" x2="${centerX}" y2="${buildingY - 30}"
            class="facade-line" marker-end="url(#arrowhead)" />

      <!-- Facade label -->
      <text x="${centerX}" y="${buildingY - 35}" text-anchor="middle" class="sun-label">
        ${orientation}
      </text>
    </g>

    <!-- Arrow marker -->
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
        <polygon points="0 0, 10 5, 0 10" fill="#000000" />
      </marker>
    </defs>
  `;
}

/**
 * Generate compass direction labels
 * @private
 */
function generateCompassLabels(centerX, centerY, radius) {
  const directions = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 }
  ];

  return directions.map(({ label, angle }) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = centerX + Math.cos(rad) * radius;
    const y = centerY + Math.sin(rad) * radius * 0.3; // Compress vertically

    return `<text x="${x}" y="${y + 5}" text-anchor="middle" class="sun-label">${label}</text>`;
  }).join('\n');
}

/**
 * Generate simplified sun path indicator (for smaller displays)
 * @param {object} options - Configuration options
 * @param {object} options.summer - Summer sun data
 * @param {object} options.winter - Winter sun data
 * @param {number} options.size - Diagram size (default: 150)
 * @returns {string} SVG markup
 */
export function generateCompactSunPath(options = {}) {
  const {
    summer = { azimuth: 180, altitude: 65 },
    winter = { azimuth: 180, altitude: 25 },
    size = 150
  } = options;

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 3;

  const summerAngle = ((summer.azimuth - 90) * Math.PI) / 180;
  const winterAngle = ((winter.azimuth - 90) * Math.PI) / 180;

  const summerDist = radius * (1 - summer.altitude / 90);
  const winterDist = radius * (1 - winter.altitude / 90);

  const summerX = centerX + Math.cos(summerAngle) * summerDist;
  const summerY = centerY + Math.sin(summerAngle) * summerDist;
  const winterX = centerX + Math.cos(winterAngle) * winterDist;
  const winterY = centerY + Math.sin(winterAngle) * winterDist;

  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="#F0F8FF" stroke="#000000" stroke-width="1" />

      <!-- Summer sun -->
      <circle cx="${summerX}" cy="${summerY}" r="8" fill="#FF6B35" />
      <text x="${summerX}" y="${summerY - 12}" text-anchor="middle" font-size="9" fill="#FF6B35">S</text>

      <!-- Winter sun -->
      <circle cx="${winterX}" cy="${winterY}" r="6" fill="#4A90E2" />
      <text x="${winterX}" y="${winterY - 10}" text-anchor="middle" font-size="9" fill="#4A90E2">W</text>

      <!-- Center building -->
      <rect x="${centerX - 8}" y="${centerY - 8}" width="16" height="16" fill="#333333" />
    </svg>
  `.trim();
}

/**
 * Calculate optimal facade orientation based on sun path
 * @param {object} location - Location data with sunPath
 * @returns {string} Optimal orientation (N, S, E, W, NE, SE, SW, NW)
 */
export function calculateOptimalOrientation(location) {
  if (!location || !location.sunPath) {
    return 'S'; // Default to south
  }

  const { summer, winter } = location.sunPath;

  // In Northern Hemisphere, south-facing is typically optimal for passive solar
  // In Southern Hemisphere, north-facing is optimal
  const avgAzimuth = (summer.azimuth + winter.azimuth) / 2;

  if (avgAzimuth >= 337.5 || avgAzimuth < 22.5) return 'N';
  if (avgAzimuth >= 22.5 && avgAzimuth < 67.5) return 'NE';
  if (avgAzimuth >= 67.5 && avgAzimuth < 112.5) return 'E';
  if (avgAzimuth >= 112.5 && avgAzimuth < 157.5) return 'SE';
  if (avgAzimuth >= 157.5 && avgAzimuth < 202.5) return 'S';
  if (avgAzimuth >= 202.5 && avgAzimuth < 247.5) return 'SW';
  if (avgAzimuth >= 247.5 && avgAzimuth < 292.5) return 'W';
  if (avgAzimuth >= 292.5 && avgAzimuth < 337.5) return 'NW';

  return 'S';
}

/**
 * Calculate solar gain for facade orientation
 * @param {object} sunData - Sun path data
 * @param {string} facadeOrientation - Facade direction
 * @returns {object} Solar gain metrics
 */
export function calculateSolarGain(sunData, facadeOrientation) {
  const { summer, winter } = sunData;

  // Simple calculation based on altitude and azimuth alignment
  const orientationAngles = {
    'N': 0, 'NE': 45, 'E': 90, 'SE': 135,
    'S': 180, 'SW': 225, 'W': 270, 'NW': 315
  };

  const facadeAngle = orientationAngles[facadeOrientation] || 180;

  const summerAlignment = Math.abs(summer.azimuth - facadeAngle);
  const winterAlignment = Math.abs(winter.azimuth - facadeAngle);

  const summerGain = Math.max(0, (90 - summerAlignment) / 90) * (summer.altitude / 90);
  const winterGain = Math.max(0, (90 - winterAlignment) / 90) * (winter.altitude / 90);

  return {
    summer: Math.round(summerGain * 100),
    winter: Math.round(winterGain * 100),
    annual: Math.round(((summerGain + winterGain) / 2) * 100),
    optimal: winterGain > 0.5 // Good for passive heating
  };
}

export default {
  generateSunPathDiagram,
  generateCompactSunPath,
  calculateOptimalOrientation,
  calculateSolarGain
};
