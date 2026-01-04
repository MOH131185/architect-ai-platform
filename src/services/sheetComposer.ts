/**
 * Sheet Composer
 * 
 * Unified A1 sheet composition service
 * Generates professional A1 SVG sheets with all architectural views embedded
 * Handles both vector (SVG) and raster (PNG) outputs
 * Ensures site maps are properly embedded in all export formats
 */

import crypto from 'crypto';
import { getLayout, A1_DIMENSIONS, LAYOUT_CONSTANTS, PanelConfig, SheetArtifact, PanelType } from './sheetLayoutConfig.js';

/**
 * Compose A1 sheet as SVG
 * 
 * @param designData - Complete design data including DNA, views, metrics, cost
 * @param options - Composition options
 * @returns SheetArtifact with SVG content
 */
export async function composeA1SheetSVG(designData: any, options: any = {}): Promise<SheetArtifact> {
  const {
    masterDNA,
    locationProfile,
    siteMetrics,
    views = {},
    metrics = null,
    costReport = null,
    siteMapImage = null,
    sitePolygon = null,
    orientation = 'landscape',
    includeCostTable = false
  } = designData;

  const {
    designId = `design-${Date.now()}`,
    seed = Math.floor(Math.random() * 1000000),
    version = '1.0.0'
  } = options;

  console.log(`📐 Composing A1 ${orientation} sheet as SVG...`);

  // Get layout configuration
  const layout = getLayout(orientation);
  const { width, height } = layout;

  // Calculate design hash for traceability
  const designHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ masterDNA, seed, designId }))
    .digest('hex');

  // Build SVG content
  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"
     xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  
  <!-- Metadata -->
  <metadata>
    <design_id>${designId}</design_id>
    <seed>${seed}</seed>
    <sha256>${designHash}</sha256>
    <orientation>${orientation}</orientation>
    <generated>${new Date().toISOString()}</generated>
    <generator>Architect AI Platform - Unified Pipeline</generator>
    <version>${version}</version>
    ${siteMapImage ? '<has_real_site_map>true</has_real_site_map>' : ''}
  </metadata>

  <!-- Styles -->
  <defs>
    <style>
      .panel-border { fill: white; stroke: #333; stroke-width: ${LAYOUT_CONSTANTS.PANEL_BORDER_WIDTH_MM}; }
      .panel-label { font-family: Arial, sans-serif; font-size: 8px; font-weight: bold; fill: #000; }
      .scale-text { font-family: Arial, sans-serif; font-size: 6px; fill: #666; }
      .title-text { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #000; }
      .info-text { font-family: Arial, sans-serif; font-size: 10px; fill: #333; }
      .small-text { font-family: Arial, sans-serif; font-size: 8px; fill: #555; }
      .tiny-text { font-family: Monaco, Courier, monospace; font-size: 7px; fill: #666; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="white"/>

  <!-- Border -->
  <rect x="${LAYOUT_CONSTANTS.MARGIN_MM}" y="${LAYOUT_CONSTANTS.MARGIN_MM}" 
        width="${width - LAYOUT_CONSTANTS.MARGIN_MM * 2}" 
        height="${height - LAYOUT_CONSTANTS.MARGIN_MM * 2}"
        fill="none" stroke="black" stroke-width="2"/>
`;

  // Add panels
  svgContent += await renderPanels(layout, views, masterDNA, siteMapImage, sitePolygon, locationProfile);

  // Add materials legend
  svgContent += renderMaterialsLegend(layout, masterDNA);

  // Add environmental panel
  svgContent += renderEnvironmentalPanel(layout, locationProfile, metrics);

  // Add cost summary if requested
  if (includeCostTable && costReport) {
    svgContent += renderCostSummary(layout, costReport);
    console.log('   💰 Cost table included');
  }

  // Add title block
  svgContent += renderTitleBlock(layout, {
    designId,
    seed,
    designHash,
    masterDNA,
    locationProfile,
    projectName: options.projectName
  });

  svgContent += '\n</svg>';

  console.log(`✅ A1 SVG sheet composed (${svgContent.length} bytes)`);

  return {
    type: 'svg',
    svgContent,
    metadata: {
      designId,
      seed,
      sha256: designHash,
      orientation,
      width: orientation === 'landscape' ? A1_DIMENSIONS.LANDSCAPE_WIDTH_PX_300DPI : A1_DIMENSIONS.WIDTH_PX_300DPI,
      height: orientation === 'landscape' ? A1_DIMENSIONS.LANDSCAPE_HEIGHT_PX_300DPI : A1_DIMENSIONS.HEIGHT_PX_300DPI,
      dpi: 300,
      geometryFirst: options.geometryFirst || false,
      insetSources: {
        hasRealSiteMap: !!siteMapImage,
        siteMapProvider: siteMapImage ? 'Google Maps' : undefined,
        siteMapAttribution: siteMapImage ? 'Map data ©Google' : undefined
      },
      generatedAt: new Date().toISOString(),
      version
    },
    sources: {
      dna: masterDNA,
      views,
      metrics,
      cost: costReport
    }
  };
}

/**
 * Render all panels with views
 */
async function renderPanels(
  layout: any,
  views: Record<string, any>,
  masterDNA: any,
  siteMapImage: string | null,
  sitePolygon: any[] | null,
  locationProfile: any
): Promise<string> {
  let svg = '\n  <!-- Panels -->\n';

  const panelMap: Record<string, PanelType> = {
    sitePlan: 'sitePlan',
    groundFloorPlan: 'groundFloorPlan',
    upperFloorPlan: 'upperFloorPlan',
    elevationNorth: 'elevationNorth',
    elevationSouth: 'elevationSouth',
    elevationEast: 'elevationEast',
    elevationWest: 'elevationWest',
    sectionLongitudinal: 'sectionLongitudinal',
    sectionCross: 'sectionCross',
    exterior3D: 'exterior3D',
    axonometric3D: 'axonometric3D',
    interior3D: 'interior3D'
  };

  for (const [panelKey, panelType] of Object.entries(panelMap)) {
    const panel = layout.panels[panelKey];
    if (!panel) continue;

    svg += renderPanel(panel, views[panelType], masterDNA, panelKey === 'sitePlan' ? { siteMapImage, sitePolygon, locationProfile } : null);
  }

  return svg;
}

/**
 * Render individual panel
 */
function renderPanel(
  panel: PanelConfig,
  viewData: any,
  masterDNA: any,
  siteContext: any = null
): string {
  const { x, y, width, height, label, scale } = panel;

  let content = `
  <g id="${label.toLowerCase().replace(/\s+/g, '-')}">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel-border"/>
    <text x="${x + 3}" y="${y + 10}" class="panel-label">${label}</text>
    ${scale ? `<text x="${x + width - 3}" y="${y + height - 3}" text-anchor="end" class="scale-text">${scale}</text>` : ''}
`;

  // Render view content
  if (siteContext && siteContext.siteMapImage) {
    // Embed site map image
    const padding = 5;
    content += `    <image href="${siteContext.siteMapImage}" 
           x="${x + padding}" y="${y + 15}" 
           width="${width - padding * 2}" height="${height - padding - 18}"
           preserveAspectRatio="xMidYMid meet"/>
`;
    
    // Overlay site polygon if available
    if (siteContext.sitePolygon && siteContext.sitePolygon.length > 0) {
      // Simplified polygon overlay (would need proper coordinate transformation)
      content += `    <text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" class="small-text" fill="#ff0000">Site Boundary</text>\n`;
    }
  } else if (viewData && viewData.url) {
    // Embed raster view
    const padding = 5;
    content += `    <image href="${viewData.url}" 
           x="${x + padding}" y="${y + 15}" 
           width="${width - padding * 2}" height="${height - padding - 18}"
           preserveAspectRatio="xMidYMid meet"/>
`;
  } else if (viewData && viewData.svg) {
    // Embed vector view
    content += `    <g transform="translate(${x + 5}, ${y + 15})">\n      ${viewData.svg}\n    </g>\n`;
  } else {
    // Placeholder
    content += `    <text x="${x + width / 2}" y="${y + height / 2}" 
           text-anchor="middle" dominant-baseline="middle" 
           class="small-text" fill="#999">
      ${label}
    </text>
`;
  }

  content += `  </g>\n`;
  return content;
}

/**
 * Render materials legend
 */
function renderMaterialsLegend(layout: any, masterDNA: any): string {
  const panel = layout.panels.materialsLegend || layout.materialsLegend;
  if (!panel) return '';

  const { x, y, width, height } = panel;
  const materials = Array.isArray(masterDNA?.materials) ? masterDNA.materials : [];

  let svg = `
  <g id="materials-legend">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel-border"/>
    <text x="${x + 3}" y="${y + 10}" class="panel-label">MATERIALS</text>
`;

  materials.slice(0, 6).forEach((material: any, index: number) => {
    const itemY = y + 20 + index * 14;
    const swatchSize = 10;
    const color = material.hexColor || material.color || '#CCCCCC';
    const name = material.name || `Material ${index + 1}`;
    const application = material.application || '';

    svg += `    <rect x="${x + 5}" y="${itemY}" width="${swatchSize}" height="${swatchSize}" 
           fill="${color}" stroke="black" stroke-width="0.3"/>
    <text x="${x + 5 + swatchSize + 3}" y="${itemY + 8}" class="small-text">
      ${name}${application ? ` - ${application}` : ''}
    </text>
`;
  });

  svg += `  </g>\n`;
  return svg;
}

/**
 * Render environmental panel
 */
function renderEnvironmentalPanel(layout: any, locationProfile: any, metrics: any): string {
  const panel = layout.panels.environmentalPanel || layout.environmentalPanel;
  if (!panel) return '';

  const { x, y, width, height } = panel;
  const climate = locationProfile?.climate?.type || 'Temperate';
  const wwr = metrics?.fenestration?.wwr ? (metrics.fenestration.wwr * 100).toFixed(1) + '%' : 'N/A';
  const gia = metrics?.areas?.gia_m2 ? metrics.areas.gia_m2.toFixed(0) + 'm²' : 'N/A';

  return `
  <g id="environmental-panel">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel-border"/>
    <text x="${x + 3}" y="${y + 10}" class="panel-label">ENVIRONMENTAL</text>
    <text x="${x + 5}" y="${y + 25}" class="small-text">Climate: ${climate}</text>
    <text x="${x + 5}" y="${y + 37}" class="small-text">WWR: ${wwr}</text>
    <text x="${x + 5}" y="${y + 49}" class="small-text">GIA: ${gia}</text>
    <text x="${x + 5}" y="${y + 61}" class="small-text">Energy: TBD</text>
  </g>
`;
}

/**
 * Render cost summary panel
 */
function renderCostSummary(layout: any, costReport: any): string {
  const panel = layout.panels.costSummary;
  if (!panel) return '';

  const { x, y, width, height } = panel;
  const total = costReport?.totalCost || costReport?.total || 0;
  const currency = costReport?.currency || 'GBP';

  return `
  <g id="cost-summary">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel-border"/>
    <text x="${x + 3}" y="${y + 10}" class="panel-label">COST ESTIMATE</text>
    <text x="${x + 5}" y="${y + 30}" class="info-text">Total: ${currency} ${total.toLocaleString()}</text>
  </g>
`;
}

/**
 * Render title block
 */
function renderTitleBlock(layout: any, data: any): string {
  const { x, y, width, height } = layout.titleBlock;
  const {
    designId,
    seed,
    designHash,
    masterDNA,
    locationProfile,
    projectName
  } = data;

  const address = locationProfile?.address || 'Architectural Project';
  const style = masterDNA?.architecturalStyle || 'Contemporary';
  const floors = masterDNA?.dimensions?.floorCount || 2;
  const area = masterDNA?.dimensions?.length && masterDNA?.dimensions?.width
    ? Math.round(masterDNA.dimensions.length * masterDNA.dimensions.width * floors)
    : 'N/A';

  return `
  <g id="title-block">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" 
          fill="#f8f9fa" stroke="black" stroke-width="1"/>
    
    <!-- Project Title -->
    <text x="${x + 10}" y="${y + 20}" class="title-text">
      ${projectName || address}
    </text>
    
    <!-- Project Info -->
    <text x="${x + 10}" y="${y + 35}" class="info-text">
      ${style} | ${floors} Floors | ${area}m²
    </text>
    
    <!-- Design IDs (right side) -->
    <text x="${width - 180}" y="${y + 12}" class="tiny-text">Design ID: ${designId}</text>
    <text x="${width - 180}" y="${y + 22}" class="tiny-text">Seed: ${seed}</text>
    <text x="${width - 180}" y="${y + 32}" class="tiny-text">SHA256: ${designHash.substring(0, 16)}...</text>
    
    <!-- Date & Generator -->
    <text x="${width - 15}" y="${y + 45}" text-anchor="end" class="small-text">
      Generated: ${new Date().toLocaleDateString()} | ArchiAI Solution Ltd
    </text>
  </g>
`;
}

/**
 * Compose A1 sheet from FLUX bitmap with site map overlay
 * 
 * @param fluxImageUrl - URL of FLUX-generated A1 sheet
 * @param siteMapImage - Site map image to overlay
 * @param designData - Design data for metadata
 * @returns SheetArtifact with composited PNG
 */
export async function composeA1SheetBitmap(
  fluxImageUrl: string,
  siteMapImage: string | null,
  designData: any,
  options: any = {}
): Promise<SheetArtifact> {
  console.log('📐 Composing A1 bitmap with site map overlay...');

  const {
    designId = `design-${Date.now()}`,
    seed = Math.floor(Math.random() * 1000000),
    orientation = 'landscape'
  } = options;

  let finalUrl = fluxImageUrl;

  // Apply site map overlay if provided
  if (siteMapImage) {
    try {
      const { overlaySiteMapOnA1Sheet } = await import('./a1SheetOverlay.js');
      finalUrl = await overlaySiteMapOnA1Sheet(fluxImageUrl, siteMapImage, { orientation });
      console.log('✅ Site map overlaid on A1 sheet');
    } catch (error) {
      console.warn('⚠️  Site map overlay failed:', error);
      // Continue with original image
    }
  }

  // Calculate hash
  const designHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ designId, seed, url: fluxImageUrl }))
    .digest('hex');

  return {
    type: 'png',
    url: finalUrl,
    metadata: {
      designId,
      seed,
      sha256: designHash,
      orientation,
      width: orientation === 'landscape' ? A1_DIMENSIONS.GENERATION_WIDTH_PX : A1_DIMENSIONS.PORTRAIT_GENERATION_WIDTH_PX,
      height: orientation === 'landscape' ? A1_DIMENSIONS.GENERATION_HEIGHT_PX : A1_DIMENSIONS.PORTRAIT_GENERATION_HEIGHT_PX,
      dpi: 150, // Approximate for generation resolution
      geometryFirst: false,
      insetSources: {
        hasRealSiteMap: !!siteMapImage,
        siteMapProvider: 'Google Maps',
        siteMapAttribution: 'Map data ©Google'
      },
      generatedAt: new Date().toISOString(),
      version: '1.0.0'
    },
    sources: {
      dna: designData.masterDNA
    }
  };
}

/**
 * Export SheetArtifact to file
 * 
 * @param artifact - SheetArtifact to export
 * @param format - Export format (svg, png, pdf)
 * @returns Blob or data URL
 */
export async function exportSheetArtifact(artifact: SheetArtifact, format: 'svg' | 'png' | 'pdf'): Promise<Blob | string> {
  console.log(`📤 Exporting sheet as ${format.toUpperCase()}...`);

  if (format === 'svg') {
    if (!artifact.svgContent) {
      throw new Error('SVG content not available in artifact');
    }
    return new Blob([artifact.svgContent], { type: 'image/svg+xml' });
  }

  if (format === 'png') {
    if (!artifact.url) {
      throw new Error('PNG URL not available in artifact');
    }
    
    // Fetch and return as blob
    const response = await fetch(artifact.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PNG: ${response.status}`);
    }
    return await response.blob();
  }

  if (format === 'pdf') {
    // PDF export would require server-side rendering (puppeteer, etc.)
    throw new Error('PDF export not yet implemented. Use SVG and convert externally.');
  }

  throw new Error(`Unsupported export format: ${format}`);
}

export default {
  composeA1SheetSVG,
  composeA1SheetBitmap,
  exportSheetArtifact
};

