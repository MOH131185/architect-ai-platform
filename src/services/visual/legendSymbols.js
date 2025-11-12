/**
 * Legend Symbols and Visual Elements
 *
 * Generates SVG symbols for architectural drawings:
 * - North arrow
 * - Scale bars
 * - Material symbols
 * - Section cut arrows
 * - Level markers
 */

/**
 * Generate North Arrow SVG
 * @param {object} options - Configuration options
 * @param {number} options.size - Arrow size in pixels (default: 60)
 * @param {string} options.color - Arrow color (default: #000000)
 * @returns {string} SVG markup
 */
export function generateNorthArrow(options = {}) {
  const { size = 60, color = '#000000' } = options;
  const half = size / 2;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .north-arrow-fill { fill: ${color}; }
          .north-arrow-stroke { stroke: ${color}; stroke-width: 1.5; fill: none; }
          .north-arrow-text { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; fill: ${color}; }
        </style>
      </defs>

      <!-- Circle -->
      <circle cx="${half}" cy="${half}" r="${half - 2}" class="north-arrow-stroke" />

      <!-- North pointer (filled) -->
      <path d="M ${half} 5 L ${half + 8} ${half - 5} L ${half} ${half - 10} Z" class="north-arrow-fill" />

      <!-- South pointer (outline) -->
      <path d="M ${half} ${size - 5} L ${half + 8} ${half + 5} L ${half} ${half + 10} Z" class="north-arrow-stroke" />

      <!-- Center vertical line -->
      <line x1="${half}" y1="8" x2="${half}" y2="${size - 8}" class="north-arrow-stroke" />

      <!-- N label -->
      <text x="${half}" y="18" text-anchor="middle" class="north-arrow-text">N</text>
    </svg>
  `.trim();
}

/**
 * Generate Scale Bar SVG
 * @param {object} options - Configuration options
 * @param {string} options.scale - Scale text (e.g., '1:100')
 * @param {number} options.length - Bar length in pixels (default: 200)
 * @param {number} options.segments - Number of segments (default: 5)
 * @param {string} options.unit - Unit label (default: 'm')
 * @returns {string} SVG markup
 */
export function generateScaleBar(options = {}) {
  const {
    scale = '1:100',
    length = 200,
    segments = 5,
    unit = 'm'
  } = options;

  const segmentWidth = length / segments;
  const height = 20;
  const labelY = height + 15;

  // Calculate actual distance represented (scale 1:100 means 200px = 10m at 1:100)
  const scaleRatio = parseInt(scale.split(':')[1]) || 100;
  const actualDistance = (length / 100) * (scaleRatio / 100); // Rough approximation

  let segments_svg = '';
  for (let i = 0; i < segments; i++) {
    const x = i * segmentWidth;
    const fillColor = i % 2 === 0 ? '#000000' : '#FFFFFF';
    segments_svg += `<rect x="${x}" y="0" width="${segmentWidth}" height="${height}" fill="${fillColor}" stroke="#000000" stroke-width="1"/>`;
  }

  return `
    <svg width="${length + 40}" height="${height + 25}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .scale-text { font-family: Arial, sans-serif; font-size: 10px; fill: #000000; }
        </style>
      </defs>

      ${segments_svg}

      <!-- Labels -->
      <text x="0" y="${labelY}" class="scale-text">0</text>
      <text x="${length / 2}" y="${labelY}" text-anchor="middle" class="scale-text">${actualDistance / 2}${unit}</text>
      <text x="${length}" y="${labelY}" text-anchor="end" class="scale-text">${actualDistance}${unit}</text>

      <!-- Scale ratio -->
      <text x="${length + 10}" y="${height / 2 + 4}" class="scale-text" font-weight="bold">${scale}</text>
    </svg>
  `.trim();
}

/**
 * Generate Section Cut Arrow SVG
 * @param {object} options - Configuration options
 * @param {string} options.label - Section label (e.g., 'A')
 * @param {string} options.direction - 'left' or 'right'
 * @param {number} options.length - Arrow length (default: 80)
 * @returns {string} SVG markup
 */
export function generateSectionArrow(options = {}) {
  const { label = 'A', direction = 'right', length = 80 } = options;
  const height = 30;
  const arrowHeadSize = 10;

  const isRight = direction === 'right';
  const arrowPath = isRight
    ? `M 0 ${height / 2} L ${length - arrowHeadSize} ${height / 2} L ${length - arrowHeadSize} ${height / 2 - 5} L ${length} ${height / 2} L ${length - arrowHeadSize} ${height / 2 + 5} L ${length - arrowHeadSize} ${height / 2} Z`
    : `M ${length} ${height / 2} L ${arrowHeadSize} ${height / 2} L ${arrowHeadSize} ${height / 2 - 5} L 0 ${height / 2} L ${arrowHeadSize} ${height / 2 + 5} L ${arrowHeadSize} ${height / 2} Z`;

  const circleCx = isRight ? 10 : length - 10;

  return `
    <svg width="${length + 20}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .section-arrow { fill: none; stroke: #000000; stroke-width: 2; }
          .section-circle { fill: #FFFFFF; stroke: #000000; stroke-width: 2; }
          .section-text { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #000000; }
        </style>
      </defs>

      <!-- Arrow line and head -->
      <path d="${arrowPath}" class="section-arrow" fill="#000000" />

      <!-- Circle with label -->
      <circle cx="${circleCx}" cy="${height / 2}" r="8" class="section-circle" />
      <text x="${circleCx}" y="${height / 2 + 5}" text-anchor="middle" class="section-text">${label}</text>
    </svg>
  `.trim();
}

/**
 * Generate Material Symbol SVG
 * @param {object} options - Configuration options
 * @param {string} options.type - Material type ('brick', 'concrete', 'wood', 'insulation', 'glass')
 * @param {string} options.color - Material color hex code
 * @param {number} options.size - Symbol size (default: 40)
 * @returns {string} SVG markup
 */
export function generateMaterialSymbol(options = {}) {
  const { type = 'brick', color = '#B8604E', size = 40 } = options;

  const patterns = {
    brick: `
      <pattern id="brick-${color}" x="0" y="0" width="10" height="5" patternUnits="userSpaceOnUse">
        <rect width="10" height="5" fill="${color}" />
        <line x1="0" y1="0" x2="10" y2="0" stroke="#FFFFFF" stroke-width="0.5" />
        <line x1="0" y1="2.5" x2="10" y2="2.5" stroke="#FFFFFF" stroke-width="0.5" />
        <line x1="5" y1="0" x2="5" y2="2.5" stroke="#FFFFFF" stroke-width="0.5" />
      </pattern>
    `,
    concrete: `
      <pattern id="concrete-${color}" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="${color}" />
        <circle cx="1" cy="1" r="0.5" fill="#666666" opacity="0.3" />
        <circle cx="3" cy="3" r="0.5" fill="#666666" opacity="0.3" />
      </pattern>
    `,
    wood: `
      <pattern id="wood-${color}" x="0" y="0" width="20" height="4" patternUnits="userSpaceOnUse">
        <rect width="20" height="4" fill="${color}" />
        <line x1="0" y1="2" x2="20" y2="2" stroke="#8B4513" stroke-width="0.5" opacity="0.5" />
      </pattern>
    `,
    insulation: `
      <pattern id="insulation-${color}" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="${color}" />
        <path d="M 0 4 Q 2 2, 4 4 T 8 4" stroke="#FF6B6B" stroke-width="1" fill="none" />
      </pattern>
    `,
    glass: `
      <pattern id="glass-${color}" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="${color}" opacity="0.3" />
        <line x1="0" y1="0" x2="10" y2="10" stroke="#87CEEB" stroke-width="0.5" opacity="0.5" />
      </pattern>
    `
  };

  const pattern = patterns[type] || patterns.brick;

  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${pattern}
      </defs>
      <rect width="${size}" height="${size}" fill="url(#${type}-${color})" stroke="#000000" stroke-width="1" />
    </svg>
  `.trim();
}

/**
 * Generate Level Marker SVG
 * @param {object} options - Configuration options
 * @param {string} options.label - Level label (e.g., 'FFL +0.00m')
 * @param {number} options.width - Marker width (default: 80)
 * @returns {string} SVG markup
 */
export function generateLevelMarker(options = {}) {
  const { label = 'FFL +0.00m', width = 80 } = options;
  const height = 20;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .level-line { stroke: #000000; stroke-width: 1.5; }
          .level-text { font-family: Arial, sans-serif; font-size: 10px; fill: #000000; }
        </style>
      </defs>

      <!-- Horizontal line -->
      <line x1="0" y1="${height / 2}" x2="${width - 15}" y2="${height / 2}" class="level-line" />

      <!-- Triangle marker -->
      <path d="M ${width - 15} ${height / 2 - 5} L ${width - 10} ${height / 2} L ${width - 15} ${height / 2 + 5} Z" fill="#000000" />

      <!-- Label -->
      <text x="5" y="${height / 2 - 5}" class="level-text">${label}</text>
    </svg>
  `.trim();
}

/**
 * Generate Wind Rose SVG
 * @param {object} options - Configuration options
 * @param {string} options.prevailingWind - Direction (e.g., 'SW', 'N', 'E')
 * @param {number} options.size - Rose size (default: 60)
 * @returns {string} SVG markup
 */
export function generateWindRose(options = {}) {
  const { prevailingWind = 'SW', size = 60 } = options;
  const center = size / 2;
  const radius = size / 2 - 5;

  // Direction angles (0° = North, 90° = East, 180° = South, 270° = West)
  const directionAngles = {
    'N': 0, 'NE': 45, 'E': 90, 'SE': 135,
    'S': 180, 'SW': 225, 'W': 270, 'NW': 315
  };

  const angle = directionAngles[prevailingWind] || 0;
  const radians = (angle - 90) * (Math.PI / 180); // -90 to start from top

  const arrowLength = radius * 0.7;
  const arrowEndX = center + Math.cos(radians) * arrowLength;
  const arrowEndY = center + Math.sin(radians) * arrowLength;

  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .wind-circle { fill: none; stroke: #4A90E2; stroke-width: 2; }
          .wind-arrow { stroke: #4A90E2; stroke-width: 2; fill: none; }
          .wind-head { fill: #4A90E2; }
          .wind-text { font-family: Arial, sans-serif; font-size: 10px; fill: #4A90E2; font-weight: bold; }
        </style>
      </defs>

      <!-- Circle -->
      <circle cx="${center}" cy="${center}" r="${radius}" class="wind-circle" />

      <!-- Arrow line -->
      <line x1="${center}" y1="${center}" x2="${arrowEndX}" y2="${arrowEndY}" class="wind-arrow" />

      <!-- Arrow head -->
      <polygon points="${arrowEndX},${arrowEndY} ${arrowEndX - 5 * Math.cos(radians - 0.3)},${arrowEndY - 5 * Math.sin(radians - 0.3)} ${arrowEndX - 5 * Math.cos(radians + 0.3)},${arrowEndY - 5 * Math.sin(radians + 0.3)}" class="wind-head" />

      <!-- Direction label -->
      <text x="${center}" y="${size - 5}" text-anchor="middle" class="wind-text">${prevailingWind}</text>
    </svg>
  `.trim();
}

/**
 * Generate complete legend with multiple symbols
 * @param {object} options - Configuration options
 * @param {Array} options.materials - Array of {name, type, color}
 * @param {boolean} options.includeScale - Include scale bar
 * @param {boolean} options.includeNorth - Include north arrow
 * @returns {string} SVG markup
 */
export function generateLegend(options = {}) {
  const {
    materials = [],
    includeScale = true,
    includeNorth = true
  } = options;

  const symbolSize = 30;
  const rowHeight = 40;
  const totalHeight = materials.length * rowHeight + (includeNorth ? 80 : 0) + (includeScale ? 60 : 0);
  const width = 250;

  let yOffset = 20;
  let content = '<g class="legend-title"><text x="10" y="15" font-family="Arial" font-size="14" font-weight="bold">LEGEND</text></g>';

  // Materials
  materials.forEach((material, i) => {
    const symbolSvg = generateMaterialSymbol({
      type: material.type || 'brick',
      color: material.color || '#999999',
      size: symbolSize
    });

    content += `
      <g transform="translate(10, ${yOffset})">
        <foreignObject width="${symbolSize}" height="${symbolSize}">
          ${symbolSvg}
        </foreignObject>
        <text x="${symbolSize + 10}" y="${symbolSize / 2 + 4}" font-family="Arial" font-size="11">${material.name}</text>
      </g>
    `;

    yOffset += rowHeight;
  });

  // North arrow
  if (includeNorth) {
    yOffset += 20;
    const northSvg = generateNorthArrow({ size: 50 });
    content += `
      <g transform="translate(20, ${yOffset})">
        <foreignObject width="50" height="50">
          ${northSvg}
        </foreignObject>
      </g>
    `;
    yOffset += 70;
  }

  // Scale bar
  if (includeScale) {
    const scaleSvg = generateScaleBar({ scale: '1:100', length: 150 });
    content += `
      <g transform="translate(10, ${yOffset})">
        <foreignObject width="200" height="50">
          ${scaleSvg}
        </foreignObject>
      </g>
    `;
  }

  return `
    <svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${totalHeight}" fill="#FFFFFF" stroke="#000000" stroke-width="1" />
      ${content}
    </svg>
  `.trim();
}

export default {
  generateNorthArrow,
  generateScaleBar,
  generateSectionArrow,
  generateMaterialSymbol,
  generateLevelMarker,
  generateWindRose,
  generateLegend
};
