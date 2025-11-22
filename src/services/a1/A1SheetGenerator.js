/**
 * A1 Sheet Generator Service
 *
 * Consolidated A1 sheet composition and assembly service.
 * Merges functionality from:
 * - a1Compositor.js (Canvas-based composition)
 * - a1SheetCompositor.js (Site plan overlay)
 * - a1SheetComposer.js (HTML assembly)
 * - unifiedSheetGenerator.js (Unified generation)
 *
 * Provides unified API for creating professional A1 architectural sheets.
 *
 * @module services/a1/A1SheetGenerator
 */

import logger from '../../utils/logger.js';
import { GENERATION_CONFIG } from '../../config/generationConfig.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const A1_DIMENSIONS = {
  width: 7016,
  height: 9933,
  dpi: 300,
  aspectRatio: 1.414
};

const SITE_PLAN_POSITION = {
  x: 0.02, // 2% from left
  y: 0.02, // 2% from top
  width: 0.25, // 25% of sheet width
  height: 0.20 // 20% of sheet height
};

// ============================================================================
// MAIN COMPOSITION API
// ============================================================================

/**
 * Compose complete A1 sheet from project data
 *
 * @param {Object} data - Complete project data
 * @param {Object} data.location - Location with coordinates, climate, sunPath
 * @param {Object} data.dna - Master Design DNA
 * @param {Object} data.visualizations - All 13 generated views
 * @param {Object} data.siteMap - Static map data
 * @param {Object} data.performance - Environmental performance data
 * @param {Object} data.metadata - AI generation metadata
 * @returns {Object} { html, css, exportHelpers }
 */
export function composeA1Sheet(data) {
  logger.info('🎨 Composing A1 architectural sheet...');

  const {
    location = {},
    dna = {},
    visualizations = {},
    siteMap = {},
    performance = {},
    metadata = {}
  } = data;

  // Extract resolution
  const { width, height, dpi } = GENERATION_CONFIG?.a1Resolution || A1_DIMENSIONS;

  // Build HTML content
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>A1 Master Sheet - ${metadata.projectName || 'Architectural Design'}</title>
      <style>${getA1StyleSheet()}</style>
    </head>
    <body>
      <div class="a1-sheet" style="width: ${width}px; height: ${height}px;">
        <!-- Title Bar -->
        ${renderTitleBar(data)}

        <!-- Top Zone: Context & 3D Views -->
        <div class="top-zone">
          ${renderSiteContext(location, siteMap)}
          ${renderClimateContext(location, performance)}
          ${render3DViews(visualizations)}
        </div>

        <!-- Middle Zone: Plans & Elevations -->
        <div class="middle-zone">
          <div class="plans-column">
            ${renderFloorPlans(visualizations, dna)}
          </div>
          <div class="elevations-column">
            ${renderElevations(visualizations, dna)}
            ${renderSection(visualizations, dna)}
          </div>
        </div>

        <!-- Bottom Zone: Data & Legend -->
        <div class="bottom-zone">
          ${renderPerformanceData(performance, dna)}
          ${renderProjectSummary(location, dna, metadata)}
          ${renderUKCompliance(metadata)}
          ${renderLegend(dna)}
          ${renderAIMetadata(metadata)}
        </div>
      </div>
    </body>
    </html>
  `.trim();

  logger.success('✅ A1 sheet HTML composed successfully');

  return {
    html,
    css: getA1StyleSheet(),
    dimensions: { width, height, dpi },
    exportHelpers: {
      toPNG: () => exportToPNG(html, width, height),
      toPDF: () => exportToPDF(html, width, height),
      toSVG: () => exportToSVG(html)
    }
  };
}

/**
 * Compose A1 sheet with Canvas (panel-based composition)
 *
 * @param {Array} panels - Array of panel objects with { name, x, y, width, height, imageUrl }
 * @param {Object} metadata - Sheet metadata
 * @returns {Promise<string>} Data URL of composed sheet
 */
export async function composeWithCanvas(panels, metadata = {}) {
  logger.info('🖼️ Composing A1 sheet with Canvas...');

  try {
    // Create canvas
    const canvas = createCanvas(A1_DIMENSIONS.width, A1_DIMENSIONS.height);
    const ctx = canvas.getContext('2d');

    // Fill white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, A1_DIMENSIONS.width, A1_DIMENSIONS.height);

    // Draw each panel
    for (const panel of panels) {
      await drawPanel(ctx, panel);
    }

    // Draw title block
    drawTitleBlock(ctx, metadata);

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png');

    logger.success('✅ Canvas composition complete');
    return dataUrl;

  } catch (error) {
    logger.error('❌ Canvas composition failed:', error);
    throw error;
  }
}

/**
 * Composite site plan onto existing A1 sheet
 *
 * @param {string} sheetUrl - URL or data URL of the generated A1 sheet
 * @param {string} sitePlanDataUrl - Data URL of the captured site plan
 * @param {Object} options - Compositing options
 * @returns {Promise<string>} Data URL of composited sheet
 */
export async function compositeSitePlan(sheetUrl, sitePlanDataUrl, options = {}) {
  if (!sheetUrl || !sitePlanDataUrl) {
    logger.warn('⚠️ Missing sheet or site plan for compositing');
    return sheetUrl; // Return original if no site plan
  }

  logger.info('🗺️ Compositing site plan onto A1 sheet...');

  try {
    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Load A1 sheet
    const sheetImg = await loadImage(sheetUrl);
    canvas.width = sheetImg.width;
    canvas.height = sheetImg.height;

    // Draw A1 sheet as base
    ctx.drawImage(sheetImg, 0, 0);

    // Load site plan
    const sitePlanImg = await loadImage(sitePlanDataUrl);

    // Calculate position and size for site plan
    const position = options.position || SITE_PLAN_POSITION;
    const sitePlanX = Math.floor(canvas.width * position.x);
    const sitePlanY = Math.floor(canvas.height * position.y);
    const sitePlanWidth = Math.floor(canvas.width * position.width);
    const sitePlanHeight = Math.floor(canvas.height * position.height);

    // Draw white background for site plan area (in case of transparency)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(sitePlanX, sitePlanY, sitePlanWidth, sitePlanHeight);

    // Draw site plan with border
    ctx.drawImage(
      sitePlanImg,
      sitePlanX,
      sitePlanY,
      sitePlanWidth,
      sitePlanHeight
    );

    // Add border around site plan
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(sitePlanX, sitePlanY, sitePlanWidth, sitePlanHeight);

    // Add "SITE PLAN" label
    const labelHeight = 30;
    ctx.fillStyle = '#000000';
    ctx.fillRect(sitePlanX, sitePlanY, sitePlanWidth, labelHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SITE PLAN', sitePlanX + sitePlanWidth / 2, sitePlanY + labelHeight / 2);

    // Add north arrow
    drawNorthArrow(ctx, sitePlanX + sitePlanWidth - 40, sitePlanY + 40);

    // Convert to data URL
    const compositedDataUrl = canvas.toDataURL('image/png');

    logger.success('✅ Site plan composited successfully');
    return compositedDataUrl;

  } catch (error) {
    logger.error('❌ Site plan compositing failed:', error);
    throw error;
  }
}

// ============================================================================
// RENDERING HELPERS
// ============================================================================

/**
 * Render title bar section
 * @private
 */
function renderTitleBar(data) {
  const { metadata = {}, location = {} } = data;
  const projectName = metadata.projectName || 'Architectural Design';
  const address = location.address || 'Site Address';
  const date = new Date().toLocaleDateString('en-GB');

  return `
    <div class="title-bar">
      <div class="title-content">
        <h1>${projectName}</h1>
        <p class="subtitle">${address}</p>
      </div>
      <div class="project-info">
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Sheet:</strong> A1-001</p>
        <p><strong>Scale:</strong> As indicated</p>
      </div>
    </div>
  `;
}

/**
 * Render site context section
 * @private
 */
function renderSiteContext(location, siteMap) {
  const { coordinates = {}, address = 'N/A' } = location;
  const { lat = 0, lng = 0 } = coordinates;

  return `
    <div class="site-context panel">
      <h3 class="panel-title">SITE PLAN & CONTEXT</h3>
      <div class="site-map">
        ${siteMap.url ? `<img src="${siteMap.url}" alt="Site Map" />` : '<div class="placeholder">Site map unavailable</div>'}
      </div>
      <div class="site-info">
        <p><strong>Location:</strong> ${address}</p>
        <p><strong>Coordinates:</strong> ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°W</p>
      </div>
    </div>
  `;
}

/**
 * Render climate context section
 * @private
 */
function renderClimateContext(location, performance) {
  const { climate = {}, sunPath = {} } = location;
  const climateType = climate.type || 'Temperate Oceanic';
  const orientation = sunPath.optimalOrientation || 'South-facing';

  return `
    <div class="climate-context panel">
      <h3 class="panel-title">CLIMATE & ORIENTATION</h3>
      <div class="climate-data">
        <p><strong>Climate:</strong> ${climateType}</p>
        <p><strong>Optimal Orientation:</strong> ${orientation}</p>
        ${performance.energyRating ? `<p><strong>EPC Rating:</strong> ${performance.energyRating}</p>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render 3D views section
 * @private
 */
function render3DViews(visualizations) {
  const { threeD = [] } = visualizations;

  return `
    <div class="threed-views panel">
      <h3 class="panel-title">3D VISUALIZATIONS</h3>
      <div class="threed-grid">
        ${threeD.slice(0, 2).map((view, idx) => `
          <div class="threed-view">
            <img src="${view.url}" alt="${view.type}" />
            <p class="view-label">${view.type.toUpperCase()}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render floor plans section
 * @private
 */
function renderFloorPlans(visualizations, dna) {
  const { floorPlans = [] } = visualizations;
  const { dimensions = {} } = dna;
  const floorCount = dimensions.floorHeights?.length || 2;

  return `
    <div class="floor-plans">
      <h3 class="section-title">FLOOR PLANS</h3>
      ${floorPlans.slice(0, floorCount).map((plan, idx) => `
        <div class="floor-plan panel">
          <h4 class="panel-title">${plan.type.toUpperCase()}</h4>
          <img src="${plan.url}" alt="${plan.type}" />
          <p class="scale-note">Scale: 1:100 @ A1</p>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render elevations section
 * @private
 */
function renderElevations(visualizations, dna) {
  const { technicalDrawings = [] } = visualizations;
  const elevations = technicalDrawings.filter(d => d.type === 'elevation');

  return `
    <div class="elevations">
      <h3 class="section-title">ELEVATIONS</h3>
      <div class="elevation-grid">
        ${elevations.map(elevation => `
          <div class="elevation panel">
            <h4 class="panel-title">${elevation.orientation.toUpperCase()} ELEVATION</h4>
            <img src="${elevation.url}" alt="${elevation.orientation} elevation" />
            <p class="scale-note">Scale: 1:100 @ A1</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render section drawing
 * @private
 */
function renderSection(visualizations, dna) {
  const { technicalDrawings = [] } = visualizations;
  const sections = technicalDrawings.filter(d => d.type === 'section');

  if (sections.length === 0) return '';

  return `
    <div class="sections">
      <h3 class="section-title">BUILDING SECTIONS</h3>
      ${sections.map(section => `
        <div class="section panel">
          <h4 class="panel-title">SECTION ${section.id || 'A-A'}</h4>
          <img src="${section.url}" alt="Section" />
          <p class="scale-note">Scale: 1:100 @ A1</p>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render performance data section
 * @private
 */
function renderPerformanceData(performance, dna) {
  const { energyRating = 'B', u_values = {}, embodiedCarbon = 'N/A' } = performance;

  return `
    <div class="performance-data panel">
      <h3 class="panel-title">PERFORMANCE DATA</h3>
      <table class="data-table">
        <tr><td>EPC Rating</td><td>${energyRating}</td></tr>
        <tr><td>Wall U-Value</td><td>${u_values.wall || '0.18'} W/m²K</td></tr>
        <tr><td>Roof U-Value</td><td>${u_values.roof || '0.15'} W/m²K</td></tr>
        <tr><td>Embodied Carbon</td><td>${embodiedCarbon}</td></tr>
      </table>
    </div>
  `;
}

/**
 * Render project summary section
 * @private
 */
function renderProjectSummary(location, dna, metadata) {
  const { dimensions = {}, materials = [] } = dna;
  const { length = 15, width = 12, height = 7 } = dimensions;
  const floorCount = dimensions.floorHeights?.length || 2;
  const totalArea = Math.round(length * width * floorCount);

  return `
    <div class="project-summary panel">
      <h3 class="panel-title">PROJECT SUMMARY</h3>
      <table class="data-table">
        <tr><td>Building Dimensions</td><td>${length}m × ${width}m × ${height}m</td></tr>
        <tr><td>Floors</td><td>${floorCount}</td></tr>
        <tr><td>Total Floor Area</td><td>${totalArea} m²</td></tr>
        <tr><td>Primary Materials</td><td>${materials.slice(0, 2).map(m => m.name).join(', ')}</td></tr>
      </table>
    </div>
  `;
}

/**
 * Render UK compliance information
 * @private
 */
function renderUKCompliance(metadata) {
  const arbNumber = metadata.arbNumber || 'ARB-123456';
  const ribaStage = metadata.ribaStage || 'Stage 2 - Concept Design';

  return `
    <div class="uk-compliance panel">
      <h3 class="panel-title">UK COMPLIANCE</h3>
      <p><strong>ARB Number:</strong> ${arbNumber}</p>
      <p><strong>RIBA Stage:</strong> ${ribaStage}</p>
      <p><strong>Building Regulations:</strong> Part L1A 2021</p>
      <p><strong>Planning Status:</strong> Pre-application</p>
    </div>
  `;
}

/**
 * Render materials legend
 * @private
 */
function renderLegend(dna) {
  const { materials = [] } = dna;

  return `
    <div class="legend panel">
      <h3 class="panel-title">MATERIAL PALETTE</h3>
      <div class="material-swatches">
        ${materials.map(material => `
          <div class="material-swatch">
            <div class="swatch-color" style="background-color: ${material.hexColor || '#CCCCCC'}"></div>
            <div class="swatch-info">
              <p class="material-name">${material.name}</p>
              <p class="material-spec">${material.specification || 'As specified'}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render AI metadata section
 * @private
 */
function renderAIMetadata(metadata) {
  const { designId = 'N/A', seed = 'N/A', model = 'FLUX.1-dev' } = metadata;
  const timestamp = new Date().toISOString();

  return `
    <div class="ai-metadata panel">
      <h3 class="panel-title">AI GENERATION METADATA</h3>
      <p><small>Design ID: ${designId}</small></p>
      <p><small>Model: ${model}</small></p>
      <p><small>Seed: ${seed}</small></p>
      <p><small>Generated: ${timestamp}</small></p>
    </div>
  `;
}

// ============================================================================
// CANVAS HELPERS
// ============================================================================

/**
 * Create canvas element
 * @private
 */
function createCanvas(width, height) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  } else {
    throw new Error('Canvas creation requires browser environment');
  }
}

/**
 * Load image from URL with retry
 * @private
 */
function loadImage(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attemptLoad = (remainingRetries) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        logger.success(`✅ Image loaded: ${url.substring(0, 50)}...`);
        resolve(img);
      };

      img.onerror = (error) => {
        logger.warn(`⚠️ Image load failed (${remainingRetries} retries left)`);

        if (remainingRetries > 0) {
          setTimeout(() => attemptLoad(remainingRetries - 1), 1000);
        } else {
          reject(new Error(`Failed to load image after ${retries} attempts`));
        }
      };

      img.src = url;
    };

    attemptLoad(retries);
  });
}

/**
 * Draw panel on canvas
 * @private
 */
async function drawPanel(ctx, panel) {
  const { name, x, y, width, height, imageUrl } = panel;

  // Draw panel background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(x, y, width, height);

  // Draw panel border
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Load and draw image
  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl);
      ctx.drawImage(img, x, y + 30, width, height - 30); // Leave space for label
    } catch (error) {
      logger.warn(`⚠️ Failed to load panel image: ${name}`);
    }
  }

  // Draw label
  const labelHeight = 30;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(x, y, width, labelHeight);

  ctx.fillStyle = '#333333';
  ctx.font = '14px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + width / 2, y + labelHeight / 2);
}

/**
 * Draw title block on canvas
 * @private
 */
function drawTitleBlock(ctx, metadata) {
  const x = A1_DIMENSIONS.width - 600;
  const y = A1_DIMENSIONS.height - 300;
  const width = 580;
  const height = 280;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, width, height);

  // Border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  // Title
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(metadata.projectName || 'Architectural Design', x + 20, y + 40);

  // Metadata
  ctx.font = '14px Arial';
  const metadataY = y + 80;
  ctx.fillText(`Date: ${new Date().toLocaleDateString('en-GB')}`, x + 20, metadataY);
  ctx.fillText(`Sheet: A1-001`, x + 20, metadataY + 30);
  ctx.fillText(`Scale: As indicated`, x + 20, metadataY + 60);
  ctx.fillText(`ARB: ${metadata.arbNumber || 'ARB-123456'}`, x + 20, metadataY + 90);
}

/**
 * Draw north arrow on canvas
 * @private
 */
function drawNorthArrow(ctx, x, y) {
  const size = 30;

  // Arrow shaft
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x - 8, y - size + 15);
  ctx.lineTo(x + 8, y - size + 15);
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.fill();

  // 'N' label
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('N', x, y - size - 10);
}

// ============================================================================
// STYLESHEET
// ============================================================================

/**
 * Get A1 stylesheet
 * @private
 */
function getA1StyleSheet() {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Arial', 'Helvetica', sans-serif;
      background: #FFFFFF;
    }

    .a1-sheet {
      background: #FFFFFF;
      position: relative;
      border: 2px solid #000000;
    }

    /* Title Bar */
    .title-bar {
      width: 100%;
      height: 150px;
      background: linear-gradient(to right, #2C3E50, #34495E);
      color: #FFFFFF;
      padding: 30px 60px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 4px solid #000000;
    }

    .title-bar h1 {
      font-size: 72px;
      font-weight: bold;
      letter-spacing: 2px;
    }

    .title-bar .project-info {
      text-align: right;
      font-size: 24px;
    }

    /* Panels */
    .panel {
      background: #FFFFFF;
      border: 2px solid #333333;
      padding: 15px;
      margin: 10px;
    }

    .panel-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 2px solid #333333;
    }

    .section-title {
      font-size: 24px;
      font-weight: bold;
      margin: 20px 0 10px 10px;
    }

    /* Layout zones */
    .top-zone {
      display: grid;
      grid-template-columns: 1fr 1fr 2fr;
      gap: 15px;
      padding: 15px;
    }

    .middle-zone {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      padding: 15px;
    }

    .bottom-zone {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 15px;
      padding: 15px;
      margin-top: 20px;
    }

    /* Images */
    img {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    .data-table td {
      padding: 8px;
      border-bottom: 1px solid #DDDDDD;
    }

    .data-table td:first-child {
      font-weight: bold;
      width: 50%;
    }

    /* Material swatches */
    .material-swatches {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .material-swatch {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .swatch-color {
      width: 40px;
      height: 40px;
      border: 1px solid #333333;
      border-radius: 4px;
    }

    .material-name {
      font-weight: bold;
      font-size: 14px;
    }

    .material-spec {
      font-size: 12px;
      color: #666666;
    }

    /* Scale notes */
    .scale-note {
      font-size: 12px;
      color: #666666;
      margin-top: 5px;
      text-align: center;
    }

    /* View labels */
    .view-label {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      margin-top: 5px;
    }

    /* Grids */
    .threed-grid, .elevation-grid {
      display: grid;
      gap: 10px;
    }

    .threed-grid {
      grid-template-columns: 1fr 1fr;
    }

    .elevation-grid {
      grid-template-columns: 1fr 1fr;
    }

    @media print {
      .a1-sheet {
        border: none;
      }
    }
  `;
}

// ============================================================================
// PANEL-BASED A1 COMPOSITION (for multi-panel workflows)
// ============================================================================

/**
 * Composite A1 sheet from individual panels
 * Used for hybrid workflows with pre-generated panel images
 *
 * @param {Object} options - Composition options
 * @param {Array} options.panels - Array of panel objects { id, url, failed }
 * @param {Object} options.layout - Layout definition with panel positions
 * @param {Object} options.masterDNA - Master DNA for consistency
 * @param {Object} options.locationData - Location data
 * @param {Object} options.projectContext - Project context
 * @param {string} options.format - Output format ('canvas' or 'html')
 * @param {boolean} options.includeAnnotations - Include annotations
 * @param {boolean} options.includeTitleBlock - Include title block
 * @param {string} options.resolution - Resolution level ('print', 'high', 'medium', 'low', 'working')
 * @returns {Promise<Object>} { dataUrl, width, height, format }
 */
export async function compositeA1Sheet(options = {}) {
  logger.info('🎨 Starting A1 sheet compositing...');

  const {
    panels = [],
    layout = {},
    masterDNA = {},
    locationData = {},
    projectContext = {},
    format = 'canvas',
    includeAnnotations = true,
    includeTitleBlock = true,
    resolution = 'working'
  } = options;

  try {
    // Get sheet dimensions based on resolution
    const resolutionMap = {
      print: { width: 9933, height: 7016 },   // 300 DPI
      high: { width: 7016, height: 4961 },    // High resolution
      medium: { width: 3508, height: 2480 },  // Medium resolution
      low: { width: 1754, height: 1240 },     // Low resolution
      working: { width: 1792, height: 1269 }  // Working resolution
    };

    const sheetDimensions = resolutionMap[resolution] || resolutionMap.working;
    const { width, height } = sheetDimensions;

    logger.info(`📐 Creating canvas: ${width}×${height}px`);

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Set background (light beige architectural paper color)
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, width, height);

    // Draw each panel
    logger.info(`🖼️ Compositing ${panels.length} panels...`);

    const layoutPanels = layout.panels || [];

    for (const panelData of panels) {
      if (!panelData || panelData.failed) {
        // Draw placeholder for failed panels
        const panelConfig = layoutPanels.find(p => p.id === panelData?.id);
        if (panelConfig) {
          logger.info(`⚠️ Drawing placeholder for failed panel: ${panelData?.id}`);
          drawPlaceholderPanel(ctx, panelConfig);
        }
        continue;
      }

      // Find panel layout info
      const panelLayout = layoutPanels.find(p => p.id === panelData.id);
      if (!panelLayout) {
        logger.warn(`⚠️ Panel layout not found for: ${panelData.id}`);
        continue;
      }

      try {
        // Load panel image
        logger.info(`📥 Loading panel: ${panelData.id}`);
        const img = await loadImage(panelData.url);

        // Draw panel border and label
        drawPanelBorder(ctx, panelLayout);

        // Calculate scaling to fit panel area
        const labelHeight = 30;
        const panelContentY = panelLayout.y + labelHeight;
        const panelContentHeight = panelLayout.height - labelHeight;

        const scaleX = panelLayout.width / img.width;
        const scaleY = panelContentHeight / img.height;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Center image in panel
        const offsetX = panelLayout.x + (panelLayout.width - scaledWidth) / 2;
        const offsetY = panelContentY + (panelContentHeight - scaledHeight) / 2;

        // Draw panel image
        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

        logger.success(`✅ Panel ${panelData.id} composited`);

      } catch (error) {
        logger.error(`❌ Failed to load panel ${panelData.id}:`, error);
        drawPlaceholderPanel(ctx, panelLayout);
      }
    }

    // Add title block if requested
    if (includeTitleBlock) {
      logger.info('📋 Adding title block...');
      drawTitleBlock(ctx, {
        projectName: projectContext.projectName || 'Architectural Design',
        location: locationData.address || 'Site Location',
        arbNumber: masterDNA.arbNumber || 'ARB-123456'
      });
    }

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png');

    logger.success('✅ A1 sheet composition complete');

    return {
      dataUrl,
      width,
      height,
      format: 'png',
      panelCount: panels.length
    };

  } catch (error) {
    logger.error('❌ A1 sheet compositing failed:', error);
    throw error;
  }
}

/**
 * Draw placeholder for failed panel
 * @private
 */
function drawPlaceholderPanel(ctx, panelLayout) {
  if (!panelLayout) return;

  const { x, y, width, height, name } = panelLayout;

  // Draw placeholder background
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x, y, width, height);

  // Draw border
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Draw X pattern
  ctx.strokeStyle = '#dddddd';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y + height);
  ctx.moveTo(x + width, y);
  ctx.lineTo(x, y + height);
  ctx.stroke();

  // Draw label
  ctx.fillStyle = '#999999';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name || 'Panel', x + width / 2, y + height / 2);
}

/**
 * Draw panel border and label
 * @private
 */
function drawPanelBorder(ctx, panelLayout) {
  if (!panelLayout) return;

  const { x, y, width, height, name } = panelLayout;
  const labelHeight = 30;

  // Draw label background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(x, y, width, labelHeight);

  // Draw label text
  ctx.fillStyle = '#333333';
  ctx.font = '14px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name || '', x + width / 2, y + labelHeight / 2);

  // Draw border
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
}

// ============================================================================
// EXPORT HELPERS (Stub implementations - will be completed in A1ValidationService)
// ============================================================================

function exportToPNG(html, width, height) {
  logger.info('📸 PNG export triggered (implementation in A1ValidationService)');
  return { html, width, height, format: 'png' };
}

function exportToPDF(html, width, height) {
  logger.info('📄 PDF export triggered (implementation in A1ValidationService)');
  return { html, width, height, format: 'pdf' };
}

function exportToSVG(html) {
  logger.info('🖼️ SVG export triggered (implementation in A1ValidationService)');
  return { html, format: 'svg' };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  composeA1Sheet,
  composeWithCanvas,
  compositeSitePlan,
  compositeA1Sheet,
  A1_DIMENSIONS,
  SITE_PLAN_POSITION
};
