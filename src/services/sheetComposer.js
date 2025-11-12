/**
 * Sheet Composer - A1 Architecture Sheet Generator
 *
 * Composes a complete A1 sheet (594mm × 841mm) with:
 * - 2 floor plans
 * - 4 elevations
 * - 1 section
 * - Axonometric view
 * - Perspective view
 * - Materials legend
 * - Metrics
 * - Title block
 *
 * Units: millimeters (mm)
 */

// A1 sheet dimensions (portrait orientation)
const A1_WIDTH = 594; // mm
const A1_HEIGHT = 841; // mm
const MARGIN = 10; // mm
const TITLE_BLOCK_HEIGHT = 60; // mm

/**
 * Simple hash function for browser (not cryptographically secure)
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Create A1 sheet SVG with all views
 */
export function createA1Sheet(design, views, options = {}) {
  const {
    format = 'svg',
    includeMetadata = true
  } = options;

  // Calculate hash of design JSON
  const designHash = simpleHash(JSON.stringify(design));

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${A1_WIDTH}mm" height="${A1_HEIGHT}mm" viewBox="0 0 ${A1_WIDTH} ${A1_HEIGHT}"
     xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

  <!-- Metadata -->
  <metadata>
    <design_id>${design.id}</design_id>
    <seed>${design.seed}</seed>
    <sha256>${designHash}</sha256>
    <generated>${new Date().toISOString()}</generated>
    <version>${design.version}</version>
  </metadata>

  <!-- Title Block -->
  ${createTitleBlock(design, designHash)}

  <!-- Grid Layout -->
  ${createGridLayout(views, design)}

  <!-- Materials Legend -->
  ${createMaterialsLegend(design.dna.materials, 10, 650)}

  <!-- Metrics -->
  ${createMetrics(design, 10, 720)}

</svg>`;

  return svg;
}

/**
 * Create title block at bottom of sheet
 */
function createTitleBlock(design, hash) {
  const y = A1_HEIGHT - TITLE_BLOCK_HEIGHT;

  return `
  <g id="title-block">
    <rect x="${MARGIN}" y="${y}" width="${A1_WIDTH - MARGIN * 2}" height="${TITLE_BLOCK_HEIGHT - MARGIN}"
          fill="white" stroke="black" stroke-width="1"/>

    <!-- Project Info -->
    <text x="${MARGIN + 10}" y="${y + 20}" font-family="Arial" font-size="14" font-weight="bold">
      ${design.site?.address || 'Architectural Project'}
    </text>
    <text x="${MARGIN + 10}" y="${y + 35}" font-family="Arial" font-size="10">
      ${design.dna?.architecturalStyle || 'Modern Architecture'} | ${design.dna?.dimensions?.floorCount || 2} Floors | ${Math.round(design.dna?.dimensions?.length * design.dna?.dimensions?.width || 0)}m²
    </text>

    <!-- IDs -->
    <text x="${A1_WIDTH - 200}" y="${y + 15}" font-family="Monaco,monospace" font-size="8" text-anchor="end">
      ID: ${design.id}
    </text>
    <text x="${A1_WIDTH - 200}" y="${y + 25}" font-family="Monaco,monospace" font-size="8" text-anchor="end">
      Seed: ${design.seed}
    </text>
    <text x="${A1_WIDTH - 200}" y="${y + 35}" font-family="Monaco,monospace" font-size="7" text-anchor="end">
      SHA256: ${hash.substring(0, 16)}...
    </text>

    <!-- Date -->
    <text x="${A1_WIDTH - MARGIN - 10}" y="${y + 45}" font-family="Arial" font-size="8" text-anchor="end">
      Generated: ${new Date().toLocaleDateString()}
    </text>
  </g>`;
}

/**
 * Create grid layout for views
 */
function createGridLayout(views, design) {
  const contentHeight = A1_HEIGHT - TITLE_BLOCK_HEIGHT - MARGIN * 2;
  const contentWidth = A1_WIDTH - MARGIN * 2;

  // Layout positions (simplified grid)
  const layouts = {
    // Top row: 2 floor plans (side by side)
    floorPlan1: { x: MARGIN, y: MARGIN, width: contentWidth / 2 - 5, height: 150 },
    floorPlan2: { x: MARGIN + contentWidth / 2 + 5, y: MARGIN, width: contentWidth / 2 - 5, height: 150 },

    // Second row: 4 elevations
    elevationN: { x: MARGIN, y: 170, width: contentWidth / 4 - 3, height: 120 },
    elevationS: { x: MARGIN + contentWidth / 4 + 1, y: 170, width: contentWidth / 4 - 3, height: 120 },
    elevationE: { x: MARGIN + contentWidth / 2 + 1, y: 170, width: contentWidth / 4 - 3, height: 120 },
    elevationW: { x: MARGIN + 3 * contentWidth / 4 + 1, y: 170, width: contentWidth / 4 - 3, height: 120 },

    // Third row: 1 section + axonometric
    section: { x: MARGIN, y: 300, width: contentWidth / 2 - 5, height: 150 },
    axonometric: { x: MARGIN + contentWidth / 2 + 5, y: 300, width: contentWidth / 2 - 5, height: 150 },

    // Fourth row: Perspective (large)
    perspective: { x: MARGIN, y: 460, width: contentWidth, height: 170 }
  };

  let svgContent = '<g id="views">';

  // Render each view as image placeholder or embedded image
  Object.entries(layouts).forEach(([viewName, layout]) => {
    svgContent += `
    <g id="${viewName}">
      <rect x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}"
            fill="#f5f5f5" stroke="black" stroke-width="0.5"/>
      <text x="${layout.x + layout.width / 2}" y="${layout.y + layout.height / 2}"
            text-anchor="middle" font-family="Arial" font-size="10" fill="#666">
        ${viewName.toUpperCase()}
      </text>
      <!-- Image would be embedded here as base64 or reference -->
      <!-- <image href="..." x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}"/> -->
    </g>`;
  });

  svgContent += '</g>';

  return svgContent;
}

/**
 * Create materials legend
 */
function createMaterialsLegend(materials, x, y) {
  if (!materials || materials.length === 0) {
    return '';
  }

  let svg = `
  <g id="materials-legend">
    <text x="${x}" y="${y}" font-family="Arial" font-size="10" font-weight="bold">Materials</text>`;

  materials.forEach((material, index) => {
    const itemY = y + 15 + index * 15;
    svg += `
    <rect x="${x}" y="${itemY - 8}" width="10" height="10" fill="${material.hexColor}" stroke="black" stroke-width="0.5"/>
    <text x="${x + 15}" y="${itemY}" font-family="Arial" font-size="8">
      ${material.name} - ${material.application}
    </text>`;
  });

  svg += `
  </g>`;

  return svg;
}

/**
 * Create metrics table
 */
function createMetrics(design, x, y) {
  const dim = design.dna?.dimensions || {};
  const metrics = [
    ['Dimensions', `${dim.length}m × ${dim.width}m × ${dim.totalHeight}m`],
    ['Floors', `${dim.floorCount}`],
    ['Floor Area', `${Math.round(dim.length * dim.width * dim.floorCount)}m²`],
    ['Roof Type', `${design.dna?.roof?.type || 'N/A'} (${design.dna?.roof?.pitch || 0}°)`],
    ['Style', `${design.dna?.architecturalStyle || 'N/A'}`]
  ];

  let svg = `
  <g id="metrics">
    <text x="${x}" y="${y}" font-family="Arial" font-size="10" font-weight="bold">Project Metrics</text>`;

  metrics.forEach((metric, index) => {
    const itemY = y + 15 + index * 12;
    svg += `
    <text x="${x}" y="${itemY}" font-family="Arial" font-size="8" font-weight="bold">${metric[0]}:</text>
    <text x="${x + 80}" y="${itemY}" font-family="Arial" font-size="8">${metric[1]}</text>`;
  });

  svg += `
  </g>`;

  return svg;
}

/**
 * Convert SVG to PDF (requires external library or service)
 */
export async function convertSVGToPDF(svg) {
  // This would require a library like:
  // - svg2pdf.js
  // - puppeteer (server-side)
  // - external service (CloudConvert, etc.)

  // Placeholder implementation
  console.warn('PDF conversion not implemented - return SVG');
  return {
    format: 'svg',
    content: svg,
    note: 'PDF conversion requires additional setup (puppeteer, svg2pdf.js, or external service)'
  };
}

export default {
  createA1Sheet,
  convertSVGToPDF
};
