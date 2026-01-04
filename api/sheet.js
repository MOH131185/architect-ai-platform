/**
 * Sheet API Endpoint - Vercel Serverless Function (REFACTORED)
 *
 * REFACTORED: Multi-format export with overlay composition support.
 * Accepts SheetResult + overlays, returns exported sheet with checksum.
 * 
 * POST /api/sheet
 * Body: { designId, sheetType, versionId, sheetMetadata, overlays, format, imageUrl }
 *
 * @route POST /api/sheet
 */

import crypto from 'crypto';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60
};

// Import sheet composer (will be transpiled for serverless)
// For now, inline the composition logic to avoid TS compilation issues

const A1_WIDTH = 841; // mm (landscape)
const A1_HEIGHT = 594; // mm (landscape)
const MARGIN = 10;
const TITLE_BLOCK_HEIGHT = 60;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed. Use POST.',
        details: null
      }
    });
  }

  try {
    const {
      designId,
      sheetType = 'ARCH',
      versionId = 'base',
      sheetMetadata = {},
      overlays = [],
      format = 'png',
      imageUrl
    } = req.body;

    if (!designId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'designId is required',
          details: null
        }
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'imageUrl is required',
          details: null
        }
      });
    }

    console.log(`[Sheet API] Exporting ${format.toUpperCase()} sheet for ${designId} (${sheetType})`);

    // For PNG/JPG: Return the image URL directly (with optional overlay composition)
    if (format === 'png' || format === 'jpg' || format === 'jpeg') {
      let finalUrl = imageUrl;
      
      // If overlays provided, compose them (call overlay API)
      if (overlays.length > 0) {
        console.log(`[Sheet API] Composing ${overlays.length} overlays...`);
        
        try {
          // Call overlay composition endpoint
          const overlayResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/overlay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseImageUrl: imageUrl,
              overlays,
              format: 'png'
            })
          });
          
          if (overlayResponse.ok) {
            const overlayData = await overlayResponse.json();
            finalUrl = overlayData.url;
            console.log('[Sheet API] Overlays composed successfully');
          } else {
            console.warn('[Sheet API] Overlay composition failed, using base image');
          }
        } catch (overlayError) {
          console.warn('[Sheet API] Overlay composition error:', overlayError.message);
        }
      }
      
      // Generate checksum
      const checksum = crypto
        .createHash('sha256')
        .update(finalUrl + designId + versionId)
        .digest('hex');
      
      const filename = `${designId}_${sheetType}_${versionId}_${new Date().toISOString().split('T')[0]}.${format}`;
      
      return res.status(200).json({
        url: finalUrl,
        filename,
        format,
        checksum,
        overlaysApplied: overlays.length,
        sheetType,
        designId,
        versionId
      });

    } else if (format === 'svg') {
      // SVG export (legacy support)
      const svg = createA1SheetSVG({
        designId,
        seed: sheetMetadata.seed || Date.now(),
        masterDNA: sheetMetadata.dna || {},
        locationProfile: { address: sheetMetadata.location || 'N/A' },
        views: {},
        siteMapImage: overlays.find(o => o.type === 'site-plan')?.dataUrl || null
      });

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${designId}_${sheetType}_${versionId}.svg"`);
      return res.status(200).send(svg);

    } else if (format === 'pdf') {
      return res.status(501).json({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'PDF format not yet implemented',
          details: { alternative: 'Use format=png or format=svg' }
        }
      });

    } else {
      return res.status(400).json({
        error: {
          code: 'INVALID_FORMAT',
          message: `Invalid format: ${format}`,
          details: { supportedFormats: ['png', 'jpg', 'svg', 'pdf'] }
        }
      });
    }

  } catch (error) {
    console.error('[Sheet API] Error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        details: null
      }
    });
  }
}

/**
 * Create A1 sheet SVG with real design data
 */
function createA1SheetSVG(designData) {
  const {
    masterDNA = {},
    locationProfile = {},
    siteMapImage = null,
    views = {},
    metrics = null,
    costReport = null,
    designId = `design-${Date.now()}`,
    seed = Math.floor(Math.random() * 1000000)
  } = designData;

  // Calculate design hash
  const designHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ masterDNA, seed, designId }))
    .digest('hex');

  const dimensions = masterDNA.dimensions || {};
  const materials = Array.isArray(masterDNA.materials) ? masterDNA.materials : [];
  const style = masterDNA.architecturalStyle || 'Contemporary';
  const address = locationProfile.address || 'Architectural Project';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${A1_WIDTH}mm" height="${A1_HEIGHT}mm" viewBox="0 0 ${A1_WIDTH} ${A1_HEIGHT}"
     xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

  <!-- Metadata -->
  <metadata>
    <design_id>${designId}</design_id>
    <seed>${seed}</seed>
    <sha256>${designHash}</sha256>
    <generated>${new Date().toISOString()}</generated>
    <generator>Architect AI Platform - Unified Pipeline</generator>
    ${siteMapImage ? '<has_real_site_map>true</has_real_site_map>' : ''}
  </metadata>

  <!-- Styles -->
  <defs>
    <style>
      .panel-border { fill: white; stroke: #333; stroke-width: 0.5; }
      .panel-label { font-family: Arial, sans-serif; font-size: 8px; font-weight: bold; }
      .scale-text { font-family: Arial, sans-serif; font-size: 6px; fill: #666; }
      .title-text { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; }
      .info-text { font-family: Arial, sans-serif; font-size: 10px; }
      .small-text { font-family: Arial, sans-serif; font-size: 8px; }
      .tiny-text { font-family: Monaco, Courier, monospace; font-size: 7px; fill: #666; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${A1_WIDTH}" height="${A1_HEIGHT}" fill="white"/>

  <!-- Border -->
  <rect x="${MARGIN}" y="${MARGIN}" width="${A1_WIDTH - MARGIN * 2}" height="${A1_HEIGHT - MARGIN * 2}"
        fill="none" stroke="black" stroke-width="2"/>

  <!-- Panels -->
  ${renderPanelsGrid(views, siteMapImage)}

  <!-- Materials Legend -->
  ${renderMaterialsLegend(materials)}

  <!-- Environmental Panel -->
  ${renderEnvironmentalPanel(locationProfile, metrics)}

  <!-- Title Block -->
  ${renderTitleBlock(designId, seed, designHash, address, style, dimensions)}

</svg>`;
}

/**
 * Render panels grid
 */
function renderPanelsGrid(views, siteMapImage) {
  const panels = [
    { key: 'sitePlan', x: 15, y: 20, w: 200, h: 140, label: 'SITE PLAN', scale: '1:1250' },
    { key: 'groundFloorPlan', x: 225, y: 20, w: 200, h: 140, label: 'GROUND FLOOR PLAN', scale: '1:100' },
    { key: 'upperFloorPlan', x: 435, y: 20, w: 200, h: 140, label: 'FIRST FLOOR PLAN', scale: '1:100' },
    { key: 'elevationNorth', x: 15, y: 170, w: 200, h: 120, label: 'NORTH ELEVATION', scale: '1:100' },
    { key: 'elevationSouth', x: 225, y: 170, w: 200, h: 120, label: 'SOUTH ELEVATION', scale: '1:100' },
    { key: 'elevationEast', x: 435, y: 170, w: 200, h: 120, label: 'EAST ELEVATION', scale: '1:100' },
    { key: 'elevationWest', x: 645, y: 170, w: 180, h: 120, label: 'WEST ELEVATION', scale: '1:100' },
    { key: 'sectionLongitudinal', x: 15, y: 300, w: 305, h: 110, label: 'SECTION A-A', scale: '1:100' },
    { key: 'sectionCross', x: 330, y: 300, w: 250, h: 110, label: 'SECTION B-B', scale: '1:100' },
    { key: 'exterior3D', x: 15, y: 420, w: 250, h: 140, label: '3D EXTERIOR', scale: null },
    { key: 'axonometric3D', x: 275, y: 420, w: 200, h: 140, label: 'AXONOMETRIC', scale: null },
    { key: 'interior3D', x: 485, y: 420, w: 200, h: 140, label: 'INTERIOR', scale: null }
  ];

  let svg = '';

  panels.forEach(panel => {
    const viewData = views[panel.key];
    const isSitePlan = panel.key === 'sitePlan';
    const imageUrl = isSitePlan && siteMapImage ? siteMapImage : viewData?.url;

    svg += `
  <g id="${panel.key}">
    <rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" class="panel-border"/>
    <text x="${panel.x + 3}" y="${panel.y + 10}" class="panel-label">${panel.label}</text>
    ${panel.scale ? `<text x="${panel.x + panel.w - 3}" y="${panel.y + panel.h - 3}" text-anchor="end" class="scale-text">${panel.scale}</text>` : ''}
    ${imageUrl ? `<image href="${imageUrl}" x="${panel.x + 5}" y="${panel.y + 15}" width="${panel.w - 10}" height="${panel.h - 18}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${panel.x + panel.w / 2}" y="${panel.y + panel.h / 2}" text-anchor="middle" class="small-text" fill="#999">${panel.label}</text>`}
  </g>`;
  });

  return svg;
}

/**
 * Render materials legend
 */
function renderMaterialsLegend(materials) {
  const x = 695;
  const y = 300;
  const width = 130;
  const height = 120;

  let svg = `
  <g id="materials-legend">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel-border"/>
    <text x="${x + 3}" y="${y + 10}" class="panel-label">MATERIALS</text>
`;

  materials.slice(0, 6).forEach((material, index) => {
    const itemY = y + 20 + index * 14;
    const color = material.hexColor || material.color || '#CCCCCC';
    const name = material.name || `Material ${index + 1}`;
    const application = material.application || '';

    svg += `    <rect x="${x + 5}" y="${itemY}" width="10" height="10" fill="${color}" stroke="black" stroke-width="0.3"/>
    <text x="${x + 20}" y="${itemY + 8}" class="small-text">${name}${application ? ` - ${application}` : ''}</text>
`;
  });

  svg += `  </g>\n`;
  return svg;
}

/**
 * Render environmental panel
 */
function renderEnvironmentalPanel(locationProfile, metrics) {
  const x = 695;
  const y = 430;
  const width = 130;
  const height = 90;

  const climate = locationProfile?.climate?.type || 'Temperate';
  const wwr = metrics?.fenestration?.wwr ? (metrics.fenestration.wwr * 100).toFixed(1) + '%' : 'N/A';

  return `
  <g id="environmental-panel">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel-border"/>
    <text x="${x + 3}" y="${y + 10}" class="panel-label">ENVIRONMENTAL</text>
    <text x="${x + 5}" y="${y + 25}" class="small-text">Climate: ${climate}</text>
    <text x="${x + 5}" y="${y + 37}" class="small-text">WWR: ${wwr}</text>
    <text x="${x + 5}" y="${y + 49}" class="small-text">Sustainability: TBD</text>
  </g>
`;
}

/**
 * Render title block
 */
function renderTitleBlock(designId, seed, hash, address, style, dimensions) {
  const y = A1_HEIGHT - TITLE_BLOCK_HEIGHT - MARGIN;
  const floors = dimensions.floorCount || dimensions.floors || 2;
  const area = dimensions.length && dimensions.width
    ? Math.round(dimensions.length * dimensions.width * floors)
    : 'N/A';

  return `
  <g id="title-block">
    <rect x="${MARGIN + 5}" y="${y}" width="${A1_WIDTH - MARGIN * 2 - 10}" height="${TITLE_BLOCK_HEIGHT - 5}"
          fill="#f8f9fa" stroke="black" stroke-width="1"/>
    
    <text x="${MARGIN + 15}" y="${y + 20}" class="title-text">${address}</text>
    <text x="${MARGIN + 15}" y="${y + 35}" class="info-text">${style} | ${floors} Floors | ${area}m²</text>
    
    <text x="${A1_WIDTH - 180}" y="${y + 12}" class="tiny-text">Design ID: ${designId}</text>
    <text x="${A1_WIDTH - 180}" y="${y + 22}" class="tiny-text">Seed: ${seed}</text>
    <text x="${A1_WIDTH - 180}" y="${y + 32}" class="tiny-text">SHA256: ${hash.substring(0, 16)}...</text>
    
    <text x="${A1_WIDTH - 15}" y="${y + 48}" text-anchor="end" class="small-text">
      Generated: ${new Date().toLocaleDateString()} | ArchiAI Solution Ltd
    </text>
  </g>
`;
}

/**
 * Create mock design (fallback when no real data provided)
 */
function createMockDesign() {
  return {
    designId: `design-${Date.now()}`,
    seed: Math.floor(Math.random() * 1000000),
    masterDNA: {
      dimensions: {
        length: 15,
        width: 10,
        totalHeight: 7,
        floorCount: 2,
        floors: 2
      },
      materials: [
        { name: 'Red Brick', hexColor: '#B8604E', application: 'exterior walls' },
        { name: 'Clay Tiles', hexColor: '#8B4513', application: 'roof' },
        { name: 'UPVC Windows', hexColor: '#FFFFFF', application: 'windows' }
      ],
      architecturalStyle: 'Contemporary Residential'
    },
    locationProfile: {
      address: '123 Architecture Lane, Design City',
      climate: { type: 'Temperate' }
    },
    views: {},
    metrics: null,
    costReport: null,
    siteMapImage: null
  };
}