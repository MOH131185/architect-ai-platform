/**
 * Sheet API Endpoint - Vercel Serverless Function
 *
 * Generates A1 master sheet with all architectural views
 * GET /api/sheet?format=svg|pdf&design_id=...
 *
 * @route GET /api/sheet
 */

import crypto from 'crypto';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60 // 60 seconds for sheet generation
};

// A1 dimensions in mm
const A1_WIDTH = 594;
const A1_HEIGHT = 841;
const MARGIN = 10;
const TITLE_BLOCK_HEIGHT = 60;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { format = 'svg', design_id } = req.query;

    // In a real implementation, would load design from database/storage
    // For now, return a template sheet

    console.log(`[Sheet API] Generating ${format.toUpperCase()} sheet`);
    if (design_id) {
      console.log(`[Sheet API] Design ID: ${design_id}`);
    }

    // Create mock design data
    const design = createMockDesign(design_id);

    // Generate sheet
    if (format === 'svg' || !format) {
      const svg = createA1SheetSVG(design);

      // Return SVG
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `attachment; filename="architecture-sheet-${design.id}.svg"`);
      return res.status(200).send(svg);

    } else if (format === 'pdf') {
      // PDF conversion would require puppeteer or similar
      return res.status(501).json({
        error: 'PDF format not implemented',
        message: 'PDF conversion requires additional setup (puppeteer, svg2pdf.js)',
        alternative: 'Use format=svg and convert client-side or with external service'
      });

    } else {
      return res.status(400).json({
        error: 'Invalid format',
        message: 'Format must be "svg" or "pdf"'
      });
    }

  } catch (error) {
    console.error('[Sheet API] Error:', error);
    return res.status(500).json({
      error: 'Sheet generation failed',
      message: error.message
    });
  }
}

/**
 * Create A1 sheet SVG
 */
function createA1SheetSVG(design) {
  // Calculate design hash
  const designHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(design))
    .digest('hex');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${A1_WIDTH}mm" height="${A1_HEIGHT}mm" viewBox="0 0 ${A1_WIDTH} ${A1_HEIGHT}"
     xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

  <!-- Metadata -->
  <metadata>
    <design_id>${design.id}</design_id>
    <seed>${design.seed}</seed>
    <sha256>${designHash}</sha256>
    <generated>${new Date().toISOString()}</generated>
    <generator>Architect AI Platform - Geometry-First</generator>
  </metadata>

  <!-- Background -->
  <rect width="${A1_WIDTH}" height="${A1_HEIGHT}" fill="white"/>

  <!-- Title Block -->
  ${createTitleBlock(design, designHash)}

  <!-- View Grid -->
  ${createViewGrid(design)}

  <!-- Materials Legend -->
  ${createMaterialsLegend(design.dna.materials)}

  <!-- Metrics -->
  ${createMetrics(design)}

  <!-- Border -->
  <rect x="${MARGIN}" y="${MARGIN}" width="${A1_WIDTH - MARGIN * 2}" height="${A1_HEIGHT - MARGIN * 2}"
        fill="none" stroke="black" stroke-width="2"/>

</svg>`;
}

/**
 * Create title block
 */
function createTitleBlock(design, hash) {
  const y = A1_HEIGHT - TITLE_BLOCK_HEIGHT - MARGIN;

  return `
  <g id="title-block">
    <rect x="${MARGIN + 5}" y="${y}" width="${A1_WIDTH - MARGIN * 2 - 10}" height="${TITLE_BLOCK_HEIGHT - 5}"
          fill="#f8f9fa" stroke="black" stroke-width="1"/>

    <!-- Project Title -->
    <text x="${MARGIN + 15}" y="${y + 20}" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
      ${design.site.address || 'Architectural Project'}
    </text>

    <!-- Project Info -->
    <text x="${MARGIN + 15}" y="${y + 35}" font-family="Arial, sans-serif" font-size="10">
      ${design.dna.architecturalStyle} | ${design.dna.dimensions.floorCount} Floors | ${Math.round(design.dna.dimensions.length * design.dna.dimensions.width * design.dna.dimensions.floorCount)}m²
    </text>

    <!-- IDs -->
    <text x="${A1_WIDTH - MARGIN - 180}" y="${y + 12}" font-family="Monaco, Courier, monospace" font-size="7">
      Design ID: ${design.id}
    </text>
    <text x="${A1_WIDTH - MARGIN - 180}" y="${y + 22}" font-family="Monaco, Courier, monospace" font-size="7">
      Seed: ${design.seed}
    </text>
    <text x="${A1_WIDTH - MARGIN - 180}" y="${y + 32}" font-family="Monaco, Courier, monospace" font-size="6">
      SHA256: ${hash.substring(0, 20)}...
    </text>

    <!-- Date & Generator -->
    <text x="${A1_WIDTH - MARGIN - 15}" y="${y + 48}" font-family="Arial, sans-serif" font-size="8" text-anchor="end">
      Generated: ${new Date().toLocaleDateString()} | Geometry-First Pipeline
    </text>
  </g>`;
}

/**
 * Create view grid
 */
function createViewGrid(design) {
  const contentWidth = A1_WIDTH - MARGIN * 2 - 10;
  const contentHeight = A1_HEIGHT - TITLE_BLOCK_HEIGHT - MARGIN * 3 - 120; // Leave space for legends

  // Grid layout
  const views = [
    { name: 'Ground Floor Plan', x: MARGIN + 15, y: MARGIN + 20, w: contentWidth / 2 - 10, h: 140 },
    { name: 'Upper Floor Plan', x: MARGIN + contentWidth / 2 + 15, y: MARGIN + 20, w: contentWidth / 2 - 10, h: 140 },

    { name: 'North Elevation', x: MARGIN + 15, y: MARGIN + 170, w: contentWidth / 4 - 5, h: 100 },
    { name: 'South Elevation', x: MARGIN + contentWidth / 4 + 15, y: MARGIN + 170, w: contentWidth / 4 - 5, h: 100 },
    { name: 'East Elevation', x: MARGIN + contentWidth / 2 + 15, y: MARGIN + 170, w: contentWidth / 4 - 5, h: 100 },
    { name: 'West Elevation', x: MARGIN + 3 * contentWidth / 4 + 15, y: MARGIN + 170, w: contentWidth / 4 - 5, h: 100 },

    { name: 'Longitudinal Section', x: MARGIN + 15, y: MARGIN + 280, w: contentWidth / 2 - 10, h: 120 },
    { name: 'Axonometric View', x: MARGIN + contentWidth / 2 + 15, y: MARGIN + 280, w: contentWidth / 2 - 10, h: 120 },

    { name: 'Perspective View', x: MARGIN + 15, y: MARGIN + 410, w: contentWidth, h: 150 }
  ];

  let svg = '<g id="view-grid">';

  views.forEach(view => {
    svg += `
    <g id="${view.name.toLowerCase().replace(/\s+/g, '-')}">
      <rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}"
            fill="#f5f5f5" stroke="#333" stroke-width="0.5"/>
      <text x="${view.x + view.w / 2}" y="${view.y + view.h / 2}"
            text-anchor="middle" dominant-baseline="middle"
            font-family="Arial, sans-serif" font-size="9" fill="#999">
        ${view.name.toUpperCase()}
      </text>
      <text x="${view.x + 3}" y="${view.y + 10}"
            font-family="Arial, sans-serif" font-size="7" font-weight="bold">
        ${view.name}
      </text>
    </g>`;
  });

  svg += '</g>';
  return svg;
}

/**
 * Create materials legend
 */
function createMaterialsLegend(materials) {
  const x = MARGIN + 15;
  const y = A1_HEIGHT - TITLE_BLOCK_HEIGHT - 110;

  let svg = `
  <g id="materials-legend">
    <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="10" font-weight="bold">
      Materials
    </text>`;

  materials.forEach((material, index) => {
    const itemY = y + 15 + index * 14;
    svg += `
    <rect x="${x}" y="${itemY - 9}" width="12" height="12" fill="${material.hexColor}" stroke="black" stroke-width="0.3"/>
    <text x="${x + 18}" y="${itemY}" font-family="Arial, sans-serif" font-size="8">
      ${material.name} - ${material.application}
    </text>`;
  });

  svg += '</g>';
  return svg;
}

/**
 * Create metrics
 */
function createMetrics(design) {
  const x = A1_WIDTH / 2 + 20;
  const y = A1_HEIGHT - TITLE_BLOCK_HEIGHT - 110;

  const dim = design.dna.dimensions;
  const metrics = [
    ['Building Dimensions', `${dim.length}m × ${dim.width}m × ${dim.totalHeight}m`],
    ['Floor Count', `${dim.floorCount} floors`],
    ['Total Floor Area', `${Math.round(dim.length * dim.width * dim.floorCount)}m²`],
    ['Floor Heights', dim.floorHeights.join('m, ') + 'm'],
    ['Roof Type', `${design.dna.roof.type} (${design.dna.roof.pitch}°)`],
    ['Architectural Style', design.dna.architecturalStyle]
  ];

  let svg = `
  <g id="metrics">
    <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="10" font-weight="bold">
      Project Metrics
    </text>`;

  metrics.forEach((metric, index) => {
    const itemY = y + 15 + index * 12;
    svg += `
    <text x="${x}" y="${itemY}" font-family="Arial, sans-serif" font-size="8" font-weight="600">
      ${metric[0]}:
    </text>
    <text x="${x + 130}" y="${itemY}" font-family="Arial, sans-serif" font-size="8">
      ${metric[1]}
    </text>`;
  });

  svg += '</g>';
  return svg;
}

/**
 * Create mock design (would load from DB in production)
 */
function createMockDesign(design_id) {
  return {
    id: design_id || `design-${Date.now()}`,
    seed: Math.floor(Math.random() * 1000000),
    version: '1.0.0',
    site: {
      address: '123 Architecture Lane, Design City',
      coordinates: { lat: 40.7128, lng: -74.0060 }
    },
    dna: {
      dimensions: {
        length: 12.5,
        width: 8.5,
        totalHeight: 7.0,
        floorCount: 2,
        floorHeights: [3.5, 3.5]
      },
      materials: [
        { name: 'Red Brick', hexColor: '#B8604E', application: 'exterior walls' },
        { name: 'Clay Tiles', hexColor: '#8B4513', application: 'roof' },
        { name: 'Glass', hexColor: '#87CEEB', application: 'windows' }
      ],
      roof: {
        type: 'gable',
        pitch: 35,
        material: 'Clay Tiles',
        color: '#8B4513',
        overhang: 0.6
      },
      architecturalStyle: 'Contemporary Residential',
      styleKeywords: ['modern', 'functional', 'sustainable']
    }
  };
}
