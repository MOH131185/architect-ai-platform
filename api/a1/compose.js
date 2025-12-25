/**
 * A1 Sheet Compose API Endpoint
 *
 * Composes individual panel images into a complete A1 architectural sheet.
 * Uses sharp for server-side image composition.
 *
 * POST /api/a1/compose
 * Body: {
 *   designId: string,
 *   panels: [{ type, imageUrl, buffer?, label }],
 *   siteOverlay?: { imageUrl },
 *   layoutConfig?: string,
 *   titleBlock?: { projectName, buildingTypeLabel, locationDesc, scale, date }
 * }
 * Returns: {
 *   sheetUrl: string (base64 data URL),
 *   composedSheetUrl: string (alias for backwards compat),
 *   coordinates: object,
 *   metadata: object,
 *   missingPanels?: string[]
 * }
 */

import path from 'path';

import fetch from 'node-fetch';

import a1ComposePayload from '../../server/utils/a1ComposePayload.cjs';

// CRITICAL: Force Node.js runtime for Sharp image processing
// Without this, Vercel uses Edge runtime which doesn't support Sharp
export const runtime = 'nodejs';
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const { buildComposeSheetUrl } = a1ComposePayload;
const DEFAULT_MAX_DATAURL_BYTES = 4.5 * 1024 * 1024;
const DEFAULT_PUBLIC_URL_BASE = '/api/a1/compose-output';

function resolveComposeOutputDir() {
  if (process.env.A1_COMPOSE_OUTPUT_DIR) {
    return process.env.A1_COMPOSE_OUTPUT_DIR;
  }

  if (process.env.VERCEL || process.env.AWS_REGION) {
    const baseDir = process.platform === 'win32' ? process.cwd() : '/tmp';
    return path.join(baseDir, 'a1_compose_outputs');
  }

  return path.join(process.cwd(), 'qa_results', 'a1_compose_outputs');
}

// PANEL_REGISTRY: Single Source of Truth for all panel types
// This import provides canonical panel types and validation
let panelRegistry = null;

// Import shared constants from service layer
// Note: In Vercel, we need to use dynamic import for ES modules from src/
let layoutConstants = null;
let crossViewImageValidator = null;

let didLogRuntime = false;
function logRuntimeOnce() {
  if (didLogRuntime) {return;}
  didLogRuntime = true;

  const info = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    env: {
      NODE_ENV: process.env.NODE_ENV || null,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME || null,
      VERCEL: process.env.VERCEL || null,
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      VERCEL_REGION: process.env.VERCEL_REGION || null,
      AWS_REGION: process.env.AWS_REGION || null,
    },
  };

  console.log(`[A1 Compose][Runtime] ${JSON.stringify(info)}`);
}

/**
 * Get PANEL_REGISTRY (lazy-loaded for Vercel compatibility)
 */
async function getPanelRegistry() {
  if (panelRegistry) {
    return panelRegistry;
  }

  try {
    panelRegistry = await import('../../src/config/panelRegistry.js');
    return panelRegistry;
  } catch (e) {
    console.warn('[A1 Compose] Could not import panelRegistry:', e.message);
    return null;
  }
}

/**
 * Get cross-view image validator (real image comparison module)
 * Uses SSIM, pHash, pixelmatch for actual pixel-level comparison
 */
async function getCrossViewImageValidator() {
  if (crossViewImageValidator) {
    return crossViewImageValidator;
  }

  try {
    // NEW: Use real image comparison module instead of heuristic validator
    crossViewImageValidator = await import(
      '../../src/services/validation/crossViewImageValidator.js'
    );
    return crossViewImageValidator;
  } catch (e) {
    console.warn('[A1 Compose] Could not import crossViewImageValidator:', e.message);
    return null;
  }
}

async function getLayoutConstants() {
  if (layoutConstants) {
    return layoutConstants;
  }

  // Try dynamic import of shared constants
  try {
    layoutConstants = await import('../../src/services/a1/a1LayoutConstants.js');
    return layoutConstants;
  } catch (e) {
    console.warn('[A1 Compose] Could not import shared constants, using fallback:', e.message);
    // Fallback inline constants (should match a1LayoutConstants.js)
    return getFallbackConstants();
  }
}

function getFallbackConstants() {
  // A1 sheet dimensions at 300 DPI (landscape orientation) - PRINT MASTER
  const A1_WIDTH = 9933;
  const A1_HEIGHT = 7016;
  // Working resolution (for faster composition, upscale on export)
  const WORKING_WIDTH = 1792;
  const WORKING_HEIGHT = 1269;
  const LABEL_HEIGHT = 26;
  const LABEL_PADDING = 6;
  const FRAME_STROKE_COLOR = '#d1d5db';
  const FRAME_RADIUS = 4;

  const GRID_SPEC = {
    // Row 1 (y: 0.02 to 0.24)
    site_diagram: { x: 0.02, y: 0.02, width: 0.22, height: 0.22 },
    hero_3d: { x: 0.26, y: 0.02, width: 0.34, height: 0.22 },
    interior_3d: { x: 0.62, y: 0.02, width: 0.24, height: 0.22 },
    material_palette: { x: 0.88, y: 0.02, width: 0.1, height: 0.1 },
    climate_card: { x: 0.88, y: 0.13, width: 0.1, height: 0.11 },
    // Row 2 (y: 0.26 to 0.48)
    floor_plan_ground: { x: 0.02, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_first: { x: 0.36, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_level2: { x: 0.7, y: 0.26, width: 0.28, height: 0.22 },
    // Row 3 (y: 0.50 to 0.68)
    elevation_north: { x: 0.02, y: 0.5, width: 0.23, height: 0.18 },
    elevation_south: { x: 0.27, y: 0.5, width: 0.23, height: 0.18 },
    elevation_east: { x: 0.52, y: 0.5, width: 0.23, height: 0.18 },
    elevation_west: { x: 0.77, y: 0.5, width: 0.21, height: 0.18 },
    // Row 4 (y: 0.70 to 0.96)
    section_AA: { x: 0.02, y: 0.7, width: 0.32, height: 0.26 },
    section_BB: { x: 0.36, y: 0.7, width: 0.32, height: 0.26 },
    schedules_notes: { x: 0.7, y: 0.7, width: 0.14, height: 0.26 },
    title_block: { x: 0.85, y: 0.7, width: 0.13, height: 0.26 },
  };

  // TARGET BOARD LAYOUT - Phase 2: Professional presentation board style
  // Features: Large hero, centered floor plans, compact elevation grid
  const TARGET_BOARD_GRID_SPEC = {
    // Row 1: Hero + Interior + Right Sidebar (y: 0.02 to 0.28)
    hero_3d: { x: 0.02, y: 0.02, width: 0.36, height: 0.26 },
    interior_3d: { x: 0.4, y: 0.02, width: 0.3, height: 0.26 },
    axonometric: { x: 0.72, y: 0.02, width: 0.14, height: 0.12 },
    site_diagram: { x: 0.72, y: 0.15, width: 0.14, height: 0.13 },
    material_palette: { x: 0.88, y: 0.02, width: 0.1, height: 0.12 },
    climate_card: { x: 0.88, y: 0.15, width: 0.1, height: 0.13 },
    // Row 2: Floor Plans - Larger (y: 0.30 to 0.55)
    floor_plan_ground: { x: 0.02, y: 0.3, width: 0.34, height: 0.25 },
    floor_plan_first: { x: 0.38, y: 0.3, width: 0.34, height: 0.25 },
    floor_plan_level2: { x: 0.74, y: 0.3, width: 0.24, height: 0.25 },
    // Row 3: Elevations - Compact 4-grid (y: 0.57 to 0.72)
    elevation_north: { x: 0.02, y: 0.57, width: 0.235, height: 0.15 },
    elevation_south: { x: 0.265, y: 0.57, width: 0.235, height: 0.15 },
    elevation_east: { x: 0.51, y: 0.57, width: 0.235, height: 0.15 },
    elevation_west: { x: 0.755, y: 0.57, width: 0.235, height: 0.15 },
    // Row 4: Sections + Title Block (y: 0.74 to 0.98)
    section_AA: { x: 0.02, y: 0.74, width: 0.38, height: 0.24 },
    section_BB: { x: 0.42, y: 0.74, width: 0.38, height: 0.24 },
    title_block: { x: 0.82, y: 0.74, width: 0.16, height: 0.24 },
  };

  const PANEL_LABELS = {
    hero_3d: 'HERO 3D VIEW',
    interior_3d: 'INTERIOR 3D VIEW',
    site_diagram: 'SITE DIAGRAM',
    floor_plan_ground: 'GROUND FLOOR PLAN',
    floor_plan_first: 'FIRST FLOOR PLAN',
    floor_plan_level2: 'SECOND FLOOR PLAN',
    elevation_north: 'NORTH ELEVATION',
    elevation_south: 'SOUTH ELEVATION',
    elevation_east: 'EAST ELEVATION',
    elevation_west: 'WEST ELEVATION',
    section_AA: 'SECTION A-A',
    section_BB: 'SECTION B-B',
    schedules_notes: 'SCHEDULES & NOTES',
    title_block: 'PROJECT INFO',
    material_palette: 'MATERIAL PALETTE',
    climate_card: 'CLIMATE ANALYSIS',
    materials: 'MATERIALS',
  };

  // Professional drawing numbers (RIBA standard format)
  const DRAWING_NUMBERS = {
    hero_3d: '3D-01',
    interior_3d: '3D-02',
    site_diagram: 'SP-01',
    floor_plan_ground: 'GA-00-01',
    floor_plan_first: 'GA-01-01',
    floor_plan_level2: 'GA-02-01',
    elevation_north: 'EL-N-01',
    elevation_south: 'EL-S-01',
    elevation_east: 'EL-E-01',
    elevation_west: 'EL-W-01',
    section_AA: 'SC-AA-01',
    section_BB: 'SC-BB-01',
    schedules_notes: 'SC-01',
    material_palette: 'MP-01',
    climate_card: 'AN-01',
  };

  // Professional scales per view type
  const PANEL_SCALES = {
    hero_3d: 'NTS',
    interior_3d: 'NTS',
    site_diagram: '1:500',
    floor_plan_ground: '1:100',
    floor_plan_first: '1:100',
    floor_plan_level2: '1:100',
    elevation_north: '1:100',
    elevation_south: '1:100',
    elevation_east: '1:100',
    elevation_west: '1:100',
    section_AA: '1:50',
    section_BB: '1:50',
    schedules_notes: 'N/A',
    material_palette: 'N/A',
    climate_card: 'N/A',
  };

  const REQUIRED_PANELS = [
    'hero_3d',
    'interior_3d',
    'site_diagram',
    'floor_plan_ground',
    'floor_plan_first',
    'floor_plan_level2',
    'elevation_north',
    'elevation_south',
    'elevation_east',
    'elevation_west',
    'section_AA',
    'section_BB',
    'material_palette',
    'climate_card',
  ];

  const COVER_FIT_PANELS = ['hero_3d', 'interior_3d', 'site_diagram'];

  // RIBA-compliant title block template
  const TITLE_BLOCK_TEMPLATE = {
    projectName: '',
    projectNumber: '',
    clientName: '',
    siteAddress: '',
    drawingTitle: 'A1 DESIGN SHEET',
    sheetNumber: 'A1-001',
    revision: 'P01',
    status: 'PRELIMINARY',
    scale: 'AS NOTED',
    date: '',
    drawnBy: 'AI ARCHITECT',
    checkedBy: '',
    practiceName: 'ArchiAI Solutions',
    practiceAddress: '',
    arbNumber: '',
    ribaStage: 'STAGE 2',
    standardsRef: 'BS EN ISO 7200',
    copyrightNote: '© 2024 ArchiAI Solutions',
    designId: '',
    seedValue: '',
    consistencyScore: 0,
    generationTimestamp: '',
  };

  // Helper functions
  const getPanelAnnotation = (panelType) => {
    const label = PANEL_LABELS[panelType] || panelType.toUpperCase();
    const drawingNumber = DRAWING_NUMBERS[panelType] || '';
    const scale = PANEL_SCALES[panelType] || 'NTS';
    return {
      label,
      drawingNumber,
      scale,
      fullAnnotation: `${drawingNumber}  ${label}  SCALE: ${scale}`,
    };
  };

  const buildTitleBlockData = (context = {}) => {
    const now = new Date();
    return {
      ...TITLE_BLOCK_TEMPLATE,
      projectName: context.projectName || 'Untitled Project',
      projectNumber:
        context.projectNumber ||
        `P${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      clientName: context.clientName || '',
      siteAddress: context.address || context.siteAddress || '',
      drawingTitle: context.buildingType
        ? `${context.buildingType.toUpperCase()} - A1 DESIGN SHEET`
        : 'A1 DESIGN SHEET',
      date: now
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase(),
      ribaStage: context.ribaStage || 'STAGE 2',
      designId: context.designId || '',
      seedValue: context.seed ? String(context.seed) : '',
      consistencyScore: context.consistencyScore || 0,
      generationTimestamp: now.toISOString(),
    };
  };

  return {
    // Print master resolution (300 DPI)
    A1_WIDTH,
    A1_HEIGHT,
    // Working resolution (preview)
    WORKING_WIDTH,
    WORKING_HEIGHT,
    LABEL_HEIGHT,
    LABEL_PADDING,
    FRAME_STROKE_COLOR,
    FRAME_RADIUS,
    GRID_SPEC,
    TARGET_BOARD_GRID_SPEC, // Phase 2: Professional presentation layout
    PANEL_LABELS,
    DRAWING_NUMBERS,
    PANEL_SCALES,
    REQUIRED_PANELS,
    COVER_FIT_PANELS,
    TITLE_BLOCK_TEMPLATE,
    toPixelRect: (layoutEntry, width, height) => ({
      x: Math.round(layoutEntry.x * width),
      y: Math.round(layoutEntry.y * height),
      width: Math.round(layoutEntry.width * width),
      height: Math.round(layoutEntry.height * height),
    }),
    getPanelFitMode: (panelType) => (COVER_FIT_PANELS.includes(panelType) ? 'cover' : 'contain'),
    getPanelAnnotation,
    buildTitleBlockData,
    // Phase 2: Resilient validation - allow missing panels with placeholder
    validatePanelLayout: (panels, options = {}) => {
      const providedTypes = new Set(panels.map((p) => p.type));
      const floorCount = options.floorCount || 2;

      // Adjust required panels based on floor count
      const adjustedRequired = REQUIRED_PANELS.filter((type) => {
        if (type === 'floor_plan_level2' && floorCount < 3) {return false;}
        return true;
      });

      const missingPanels = adjustedRequired.filter((type) => !providedTypes.has(type));

      // CORRECTION E: Be resilient to missing panels - warn but don't block
      // Missing panels will be shown as placeholders
      return {
        valid: true, // Always valid - missing panels get placeholders
        errors: [],
        warnings:
          missingPanels.length > 0
            ? [`Missing panels (will use placeholders): ${missingPanels.join(', ')}`]
            : [],
        panelCount: panels.length,
        missingPanels,
        hasPlaceholders: missingPanels.length > 0,
      };
    },
  };
}

/**
 * Fetch image from URL and return buffer
 */
async function fetchImageBuffer(url) {
  if (!url) {
    throw new Error('Image URL is required');
  }

  // Handle data URLs
  if (url.startsWith('data:')) {
    const base64Data = url.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  }

  // Fetch from URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function generateOverlaySvg(coordinates, width, height, constants) {
  const { LABEL_HEIGHT, FRAME_STROKE_COLOR, FRAME_RADIUS, getPanelAnnotation } = constants;
  let frames = '';
  let labels = '';

  for (const [id, coord] of Object.entries(coordinates)) {
    const annotation = getPanelAnnotation(id);
    const labelY = coord.y + coord.height - Math.round(LABEL_HEIGHT / 2) + 4;
    const labelTop = coord.y + coord.height - LABEL_HEIGHT;

    // Panel frame
    frames += `<rect x="${coord.x}" y="${coord.y}" width="${coord.width}" height="${coord.height}"
      fill="none" stroke="${FRAME_STROKE_COLOR}" stroke-width="3" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />`;

    // Label background band
    labels += `<rect x="${coord.x}" y="${labelTop}" width="${coord.width}" height="${LABEL_HEIGHT}"
      fill="#f8fafc" fill-opacity="0.95" />`;

    // Drawing number (left-aligned)
    if (annotation.drawingNumber) {
      labels += `<text x="${coord.x + 6}" y="${labelY}"
        font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#475569"
        dominant-baseline="middle" text-anchor="start">${annotation.drawingNumber}</text>`;
    }

    // Panel label (centered)
    labels += `<text x="${coord.x + coord.width / 2}" y="${labelY}"
      font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0f172a"
      dominant-baseline="middle" text-anchor="middle">${annotation.label}</text>`;

    // Scale (right-aligned) - only for scaled drawings
    if (annotation.scale && annotation.scale !== 'N/A') {
      labels += `<text x="${coord.x + coord.width - 6}" y="${labelY}"
        font-family="Arial, sans-serif" font-size="9" fill="#64748b"
        dominant-baseline="middle" text-anchor="end">${annotation.scale}</text>`;
    }
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${frames}
    ${labels}
  </svg>`;
}

/**
 * Generate build stamp SVG for bottom-right corner
 * Deliverable #4: Build stamp printed onto the A1
 *
 * @param {Object} params
 * @param {number} params.width - Sheet width
 * @param {number} params.height - Sheet height
 * @param {string} params.designId - Short design ID hash
 * @param {string} params.timestamp - Build timestamp
 * @param {string} params.layoutTemplate - Layout template name
 * @param {number} params.panelCount - Number of panels composed
 * @returns {string} SVG string
 */
function generateBuildStampSvg({ width, height, designId, timestamp, layoutTemplate, panelCount }) {
  // Position: bottom-right corner, small and unobtrusive
  const stampWidth = 180;
  const stampHeight = 48;
  const x = width - stampWidth - 8;
  const y = height - stampHeight - 8;

  // Format timestamp to be more compact
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
  const timeStr = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- Build Stamp Background -->
    <rect x="${x}" y="${y}" width="${stampWidth}" height="${stampHeight}"
      fill="#f8fafc" fill-opacity="0.95" stroke="#e2e8f0" stroke-width="1" rx="4" ry="4" />

    <!-- ArchiAI Logo/Brand -->
    <text x="${x + 8}" y="${y + 14}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#0f172a">
      ARCHI.AI
    </text>

    <!-- Build Hash -->
    <text x="${x + stampWidth - 8}" y="${y + 14}" font-family="monospace" font-size="7" fill="#64748b" text-anchor="end">
      #${designId}
    </text>

    <!-- Build Date/Time -->
    <text x="${x + 8}" y="${y + 28}" font-family="Arial, sans-serif" font-size="7" fill="#475569">
      Built: ${dateStr} ${timeStr}
    </text>

    <!-- Layout Template & Panel Count -->
    <text x="${x + 8}" y="${y + 40}" font-family="Arial, sans-serif" font-size="6" fill="#94a3b8">
      Layout: ${layoutTemplate} | Panels: ${panelCount}
    </text>

    <!-- Verification Badge -->
    <circle cx="${x + stampWidth - 16}" cy="${y + 34}" r="8" fill="#22c55e" />
    <text x="${x + stampWidth - 16}" y="${y + 37}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="white" text-anchor="middle">
      ✓
    </text>
  </svg>`;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  try {
    // Runtime proof (Node vs Edge/other)
    logRuntimeOnce();

    // Get shared constants (with fallback)
    const constants = await getLayoutConstants();
    const {
      // Print master resolution (300 DPI)
      A1_WIDTH,
      A1_HEIGHT,
      // Working resolution (preview)
      WORKING_WIDTH,
      WORKING_HEIGHT,
      LABEL_HEIGHT,
      LABEL_PADDING,
      FRAME_STROKE_COLOR,
      FRAME_RADIUS,
      GRID_SPEC,
      REQUIRED_PANELS,
      toPixelRect,
      getPanelFitMode,
      validatePanelLayout,
    } = constants;

    const {
      designId,
      siteOverlay = null,
      layoutConfig = 'uk-riba-standard',
      titleBlock = null,
    } = req.body;
    let panels = Array.isArray(req.body?.panels) ? req.body.panels : [];

    if (!panels || panels.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'NO_PANELS', message: 'No panels provided' });
    }

    console.log(`[A1 Compose] Composing ${panels.length} panels for design ${designId}`);

    // ====================================================================
    // CRITICAL: DESIGN FINGERPRINT VALIDATION
    // ====================================================================
    // Ensure all panels belong to the same design run.
    // This prevents mixing panels from different concurrent generations.
    const expectedFingerprint = req.body.designFingerprint || designId;
    const fingerprintMismatches = [];

    for (const panel of panels) {
      const panelFingerprint = panel.designFingerprint || panel.meta?.designFingerprint;
      if (panelFingerprint && panelFingerprint !== expectedFingerprint) {
        fingerprintMismatches.push({
          panelType: panel.type,
          expectedFingerprint,
          actualFingerprint: panelFingerprint,
        });
      }
    }

    if (fingerprintMismatches.length > 0) {
      console.error(`[A1 Compose] ❌ DESIGN FINGERPRINT MISMATCH DETECTED!`);
      console.error(`   Expected: ${expectedFingerprint}`);
      console.error(`   Mismatches: ${JSON.stringify(fingerprintMismatches)}`);

      return res.status(400).json({
        success: false,
        error: 'FINGERPRINT_MISMATCH',
        message: `Panels from different design runs cannot be composed together. Expected fingerprint: ${expectedFingerprint}`,
        details: {
          mismatches: fingerprintMismatches,
          recommendation:
            'This indicates a race condition in concurrent generation. Please regenerate all panels together.',
        },
      });
    }

    console.log(`[A1 Compose] ✅ Fingerprint validation passed: ${expectedFingerprint}`);

    // ====================================================================
    // CRITICAL: PANEL_REGISTRY VALIDATION (Runtime Assertion)
    // ====================================================================
    // Uses SSOT from panelRegistry.js to normalize panel types and enforce required panels.
    // Unknown panel types are ignored with warnings to avoid blocking composition on legacy extras.
    const registry = await getPanelRegistry();
    const unknownPanelTypes = [];

    if (registry) {
      const normalizedPanels = panels
        .map((panel) => {
          const canonical = registry.normalizeToCanonical(panel.type);
          if (!canonical) {
            unknownPanelTypes.push(panel.type);
            return null;
          }
          return { ...panel, type: canonical };
        })
        .filter(Boolean);

      if (unknownPanelTypes.length > 0) {
        console.warn(`[A1 Compose] Ignoring unknown panel types: ${unknownPanelTypes.join(', ')}`);
      }

      panels = normalizedPanels;
    } else {
      console.warn('[A1 Compose] PANEL_REGISTRY not available, using raw panel types');
    }

    if (!panels || panels.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_PANELS',
        message: 'No valid panels provided after normalization',
        details: {
          unknownPanelTypes,
        },
      });
    }

    const explicitFloorCount = Number(req.body.floorCount);
    const derivedFloorCount =
      panels.filter((p) => String(p.type || '').startsWith('floor_plan_')).length || 2;
    const floorCount =
      Number.isFinite(explicitFloorCount) && explicitFloorCount > 0
        ? explicitFloorCount
        : derivedFloorCount;

    if (registry) {
      const requiredPanels =
        typeof registry.getAIGeneratedPanels === 'function'
          ? registry.getAIGeneratedPanels(floorCount)
          : registry.getRequiredPanels(floorCount);
      const providedTypes = new Set(panels.map((p) => p.type));
      const missingPanels = requiredPanels.filter((type) => !providedTypes.has(type));

      if (missingPanels.length > 0) {
        console.warn(`[A1 Compose] Missing required panels: ${missingPanels.join(', ')}`);
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_PANELS',
          message: `Cannot compose A1 sheet - missing: ${missingPanels.join(', ')}. Please regenerate missing panels first.`,
          details: {
            missingPanels,
            unknownPanelTypes,
          },
        });
      }
    }

    panels = panels.map((panel) => {
      if (!panel) {return panel;}
      if (!panel.imageUrl && panel.url) {
        return { ...panel, imageUrl: panel.url };
      }
      return panel;
    });

    // Validate panel layout BEFORE proceeding (legacy validation as backup)
    const validation = validatePanelLayout(panels, { floorCount });

    if (!validation.valid) {
      const missingPanels = validation.missingPanels || [];
      const nonMissingErrors = validation.errors.filter(
        (err) => !err.startsWith('Missing panels:')
      );
      const blockingMissing = registry
        ? missingPanels.filter((type) => {
            const entry = registry.getRegistryEntry ? registry.getRegistryEntry(type) : null;
            return entry ? entry.generator !== 'data' : true;
          })
        : missingPanels;

      if (blockingMissing.length > 0 || nonMissingErrors.length > 0) {
        console.warn(`[A1 Compose] Layout validation failed: ${validation.errors.join('; ')}`);
        return res.status(400).json({
          success: false,
          error: 'PANEL_VALIDATION_FAILED',
          message: validation.errors.join('; '),
          details: {
            missingPanels: blockingMissing,
            unknownPanelTypes,
          },
        });
      }

      if (missingPanels.length > 0) {
        console.warn(`[A1 Compose] Optional panels missing: ${missingPanels.join(', ')}`);
      }
    }

    // ====================================================================
    // PRE-COMPOSE GATE: FLOOR PLAN ROOM COUNT VALIDATION (BLOCKING)
    // ====================================================================
    // Ensures no floor plan has 0 rooms (which would result in empty borders)
    const DEBUG_RUNS = process.env.DEBUG_RUNS === '1';

    if (DEBUG_RUNS) {
      console.log('[DEBUG_RUNS] [A1 Compose] Starting pre-compose validation...');
    }

    const emptyFloorPlans = [];
    const floorPlanPanels = panels.filter((p) => p.type?.includes('floor_plan'));

    for (const panel of floorPlanPanels) {
      const roomCount = panel.meta?.roomCount || panel.roomCount || 0;
      const wallCount = panel.meta?.wallCount || panel.wallCount || 0;

      if (DEBUG_RUNS) {
        console.log(`[DEBUG_RUNS] [A1 Compose] Floor plan ${panel.type}:`, {
          roomCount,
          wallCount,
          hasBuffer: !!panel.buffer,
          hasImageUrl: !!panel.imageUrl,
          runId: panel.meta?.runId || panel.runId,
        });
      }

      // Check for empty floor plan (0 rooms indicates geometry failure)
      if (roomCount === 0) {
        emptyFloorPlans.push({
          panelType: panel.type,
          roomCount,
          wallCount,
          runId: panel.meta?.runId || panel.runId,
        });
      }
    }

    if (emptyFloorPlans.length > 0) {
      console.error(`[A1 Compose] ❌ EMPTY FLOOR PLANS DETECTED!`);
      console.error(`   Empty plans: ${emptyFloorPlans.map((p) => p.panelType).join(', ')}`);

      return res.status(400).json({
        success: false,
        error: 'EMPTY_FLOOR_PLANS',
        message:
          'Cannot compose A1 sheet - one or more floor plans have 0 rooms, which indicates a room assignment failure.',
        details: {
          emptyFloorPlans,
          recommendation:
            'This typically means rooms were not distributed to upper floors. Check the program configuration and ensure rooms are assigned to all requested floors.',
        },
      });
    }

    console.log(
      `[A1 Compose] ✅ Floor plan room validation passed (${floorPlanPanels.length} plans checked)`
    );

    // ====================================================================
    // PRE-COMPOSE GATE: GEOMETRY PACK CONSISTENCY (BLOCKING)
    // ====================================================================
    // Ensures hero_3d and elevations share the same geometry runId
    const hero3dPanel = panels.find((p) => p.type === 'hero_3d');
    const elevationPanels = panels.filter((p) => p.type?.includes('elevation_'));

    if (hero3dPanel && elevationPanels.length > 0) {
      const hero3dRunId = hero3dPanel.meta?.runId || hero3dPanel.runId;
      const elevationRunIds = elevationPanels.map((p) => p.meta?.runId || p.runId).filter(Boolean);

      if (DEBUG_RUNS) {
        console.log(`[DEBUG_RUNS] [A1 Compose] Geometry pack consistency check:`, {
          hero3dRunId,
          elevationRunIds,
        });
      }

      if (hero3dRunId && elevationRunIds.length > 0) {
        const mismatches = elevationRunIds.filter((id) => id !== hero3dRunId);

        if (mismatches.length > 0) {
          console.error(`[A1 Compose] ❌ GEOMETRY PACK MISMATCH DETECTED!`);
          console.error(`   hero_3d runId: ${hero3dRunId}`);
          console.error(`   Mismatched elevation runIds: ${[...new Set(mismatches)].join(', ')}`);

          return res.status(400).json({
            success: false,
            error: 'GEOMETRY_PACK_MISMATCH',
            message:
              'Cannot compose A1 sheet - hero_3d and elevations were generated from different geometry packs.',
            details: {
              hero3dRunId,
              elevationRunIds: [...new Set(elevationRunIds)],
              recommendation:
                'Ensure all panels are generated from the same canonical geometry in a single run.',
            },
          });
        }

        console.log(`[A1 Compose] ✅ Geometry pack consistency passed (runId: ${hero3dRunId})`);
      }
    }

    // ====================================================================
    // CROSS-VIEW CONSISTENCY GATE (BLOCKING)
    // ====================================================================
    // Panels must show the SAME building - reject if cross-view fails
    // Uses real image comparison: SSIM, pHash, pixelmatch
    const imageValidator = await getCrossViewImageValidator();
    if (imageValidator) {
      console.log(
        '[A1 Compose] Running real image cross-view consistency validation (SSIM/pHash/pixelmatch)...'
      );

      // Build panel map from request panels
      const panelMap = {};
      for (const panel of panels) {
        if (panel.type && (panel.imageUrl || panel.buffer)) {
          panelMap[panel.type] = {
            url: panel.imageUrl,
            buffer: panel.buffer,
          };
        }
      }

      try {
        // NEW: Use real image comparison instead of heuristic validation
        const crossViewResult = await imageValidator.validateAllPanels(panelMap);

        if (!crossViewResult.pass) {
          console.error(`[A1 Compose] Cross-view validation FAILED`);
          console.error(`   Overall Score: ${(crossViewResult.overallScore * 100).toFixed(1)}%`);
          console.error(
            `   Failed Panels: ${crossViewResult.failedPanels.map((fp) => fp.panelType).join(', ')}`
          );

          // Generate structured error report
          const errorReport = imageValidator.generateErrorReport(crossViewResult);

          return res.status(400).json(errorReport);
        }

        console.log(
          `[A1 Compose] Cross-view validation PASSED (score: ${(crossViewResult.overallScore * 100).toFixed(1)}%)`
        );
      } catch (crossViewError) {
        console.error('[A1 Compose] Cross-view validation error:', crossViewError.message);
        // Fail closed on validation errors (conservative approach)
        return res.status(500).json({
          success: false,
          error: 'CROSS_VIEW_VALIDATION_ERROR',
          message: crossViewError.message,
          details: {
            recommendation: 'Validation system error. Please retry.',
          },
        });
      }
    } else {
      // FAIL-CLOSED: If validator module can't be loaded, reject the composition
      // This prevents A1 sheets from being exported without cross-view verification
      console.error('[A1 Compose] Cross-view image validator not available - BLOCKING');
      return res.status(500).json({
        success: false,
        error: 'CROSS_VIEW_VALIDATOR_UNAVAILABLE',
        message:
          'Cannot compose A1 sheet without cross-view consistency validation. Validator module failed to load.',
        details: {
          recommendation:
            'Check server deployment - ensure crossViewImageValidator.js is bundled correctly with sharp and pixelmatch.',
        },
      });
    }

    // Dynamic import of sharp (server-side only)
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (e) {
      console.error('[A1 Compose] sharp not available:', e.message);
      return res.status(500).json({
        success: false,
        error: 'SHARP_UNAVAILABLE',
        message: 'Server-side composition not available - sharp module not installed',
        details: {
          originalError: e.message,
          recommendation:
            'Ensure api/a1/compose.js has runtime = "nodejs" and sharp is in dependencies.',
        },
      });
    }

    // LAYOUT TEMPLATE SELECTION - Phase 2: Support multiple A1 layouts
    // NEW DEFAULT: 'target-board' (professional presentation) - mandatory correction E
    // Options: 'target-board' (default) or 'uk-riba-standard' (legacy)
    const layoutTemplate = req.body.layoutTemplate || 'target-board';

    // Get TARGET_BOARD_GRID_SPEC from constants or fallback
    const TARGET_BOARD_GRID_SPEC =
      constants.TARGET_BOARD_GRID_SPEC || getFallbackConstants().TARGET_BOARD_GRID_SPEC;
    const layout = layoutTemplate === 'uk-riba-standard' ? GRID_SPEC : TARGET_BOARD_GRID_SPEC;

    console.log(`[A1 Compose] Using ${layoutTemplate.toUpperCase()} layout`);
    if (layoutTemplate === 'target-board') {
      console.log(
        '[A1 Compose] TARGET BOARD features: Large hero, centered plans, compact 4-grid elevations'
      );
    }

    // FIX: Support high-resolution A1 print master (300 DPI: 9933×7016px)
    // When highRes: true is passed, use full A1 dimensions instead of working preview
    const useHighRes = req.body.highRes === true || req.body.printMaster === true;
    const width = useHighRes ? A1_WIDTH : WORKING_WIDTH;
    const height = useHighRes ? A1_HEIGHT : WORKING_HEIGHT;

    if (useHighRes) {
      console.log(
        `[A1 Compose] HIGH-RES MODE: Using print master resolution ${A1_WIDTH}×${A1_HEIGHT}px (300 DPI)`
      );
    }

    // Create white background
    const background = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png();

    // Prepare composite operations
    const composites = [];
    const coordinates = {};

    const panelMap = new Map(panels.map((p) => [p.type, p]));

    // Process each panel
    for (const [type, slot] of Object.entries(layout)) {
      const slotRect = toPixelRect(slot, width, height);
      coordinates[type] = { ...slotRect, labelHeight: LABEL_HEIGHT };

      const mode = getPanelFitMode(type);
      const panel = panelMap.get(type);

      if (type === 'title_block') {
        const titleBuffer = await buildTitleBlockBuffer(
          sharp,
          slotRect.width,
          slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
          titleBlock,
          constants
        );
        composites.push({ input: titleBuffer, left: slotRect.x, top: slotRect.y });
        continue;
      }

      if (panel?.imageUrl || panel?.buffer) {
        try {
          const buffer = panel.buffer || (await fetchImageBuffer(panel.imageUrl));
          const resized = await placePanelImage({
            sharp,
            imageBuffer: buffer,
            slotRect,
            mode,
            constants,
            panelType: type, // Pass panel type for debug logging
          });
          composites.push({ input: resized, left: slotRect.x, top: slotRect.y });
          continue;
        } catch (err) {
          console.error(`[A1 Compose] Failed to process panel ${type}:`, err.message);
        }
      }

      // Build placeholder for missing panel
      const placeholder = await buildPlaceholder(
        sharp,
        slotRect.width,
        slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
        type,
        constants
      );
      composites.push({ input: placeholder, left: slotRect.x, top: slotRect.y });
    }

    // Add site overlay if provided
    if (siteOverlay?.imageUrl) {
      const siteLayout = layout.site_diagram || GRID_SPEC.site_diagram;
      const slotRect = toPixelRect(siteLayout, width, height);
      const targetHeight = slotRect.height - LABEL_HEIGHT - LABEL_PADDING;

      try {
        const overlayBuffer = await fetchImageBuffer(siteOverlay.imageUrl);

        // Debug logging for site overlay
        if (DEBUG_RUNS) {
          const metadata = await sharp(overlayBuffer).metadata();
          console.log(`[A1 Compose] Site overlay resize:`, {
            input: { width: metadata.width, height: metadata.height },
            output: { width: slotRect.width, height: targetHeight },
            fit: 'contain',
          });
        }

        // CRITICAL: Use fit:'contain' to prevent cropping site overlays
        const resizedOverlay = await sharp(overlayBuffer)
          .resize(slotRect.width, targetHeight, {
            fit: 'contain', // ALWAYS contain - never crop
            position: 'centre', // Center within slot
            background: { r: 255, g: 255, b: 255, alpha: 1 }, // White letterbox padding
          })
          .png()
          .toBuffer();

        composites.push({
          input: resizedOverlay,
          left: slotRect.x,
          top: slotRect.y,
        });

        coordinates.site_overlay = { ...slotRect, labelHeight: LABEL_HEIGHT };
        console.log(`[A1 Compose] Added site overlay at (${slotRect.x}, ${slotRect.y})`);
      } catch (err) {
        console.error('[A1 Compose] Failed to add site overlay:', err.message);
      }
    }

    // Draw panel borders and labels
    const borderSvg = generateOverlaySvg(coordinates, width, height, constants);
    composites.push({
      input: Buffer.from(borderSvg),
      left: 0,
      top: 0,
    });

    // BUILD STAMP: Add small stamp in bottom-right corner with build info
    // Deliverable #4: Build stamp printed onto the A1
    const buildTimestamp = new Date().toISOString();
    const shortHash = designId ? designId.substring(0, 8) : 'N/A';
    const buildStampSvg = generateBuildStampSvg({
      width,
      height,
      designId: shortHash,
      timestamp: buildTimestamp,
      layoutTemplate,
      panelCount: panels.length,
    });
    composites.push({
      input: Buffer.from(buildStampSvg),
      left: 0,
      top: 0,
    });

    // Compose all panels onto background
    const composedBuffer = await background.composite(composites).png().toBuffer();

    const maxDataUrlBytes =
      parseInt(process.env.A1_COMPOSE_MAX_DATAURL_BYTES || '', 10) || DEFAULT_MAX_DATAURL_BYTES;
    const outputDir = resolveComposeOutputDir();
    const publicUrlBase = process.env.A1_COMPOSE_PUBLIC_URL_BASE || DEFAULT_PUBLIC_URL_BASE;

    const composePayload = buildComposeSheetUrl({
      pngBuffer: composedBuffer,
      maxDataUrlBytes,
      outputDir,
      publicUrlBase,
      designId,
    });

    if (!composePayload.sheetUrl) {
      return res.status(413).json({
        success: false,
        error: composePayload.error || 'PAYLOAD_TOO_LARGE',
        message:
          composePayload.message ||
          'Composed sheet is too large to return as a base64 data URL. Configure external storage for composed PNGs.',
        details: {
          ...composePayload,
          maxDataUrlBytes,
        },
      });
    }

    const { sheetUrl, transport, pngBytes, estimatedDataUrlBytes, sheetUrlBytes, outputFile } =
      composePayload;

    console.log(
      `[A1 Compose] Sheet composed: ${composites.length} elements, ${width}x${height}px (${transport})`
    );

    // ====================================================================
    // CACHE-BUSTING: Prevent browser/Vercel caching collisions
    // ====================================================================
    // These headers ensure:
    // - Browser doesn't cache the response (no-store)
    // - Vercel edge doesn't cache the response (CDN-Cache-Control)
    // - Each request gets fresh composition (no stale panels)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Add design fingerprint header for debugging
    res.setHeader('X-Design-Fingerprint', expectedFingerprint || 'unknown');
    res.setHeader('X-Composition-Timestamp', new Date().toISOString());

    console.log(`[A1 Compose] Response headers set: Cache-Control: no-store`);

    // Return the composition result
    // STANDARD CONTRACT: { success, sheetUrl, composedSheetUrl (alias), coordinates, metadata }
    return res.status(200).json({
      success: true,
      sheetUrl,
      composedSheetUrl: sheetUrl, // backwards compat alias
      url: sheetUrl, // additional alias for client normalizer
      coordinates,
      metadata: {
        width,
        height,
        panelCount: panels.length,
        composedAt: new Date().toISOString(),
        layoutConfig,
        designId,
        designFingerprint: expectedFingerprint,
        transport,
        pngBytes,
        estimatedDataUrlBytes,
        sheetUrlBytes,
        outputFile,
      },
    });
  } catch (error) {
    console.error('[A1 Compose] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'COMPOSITION_FAILED',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined,
    });
  }
}

/**
 * Place panel image into slot with aspect-ratio-preserving resize
 *
 * SHARP OPTIONS USED:
 * - fit: 'contain' - Preserves aspect ratio, letterboxes with padding (NO CROPPING)
 * - position: 'centre' - Centers the image within the slot
 * - background: { r: 255, g: 255, b: 255, alpha: 1 } - White padding for letterbox areas
 *
 * @param {Object} params - Parameters
 * @param {Function} params.sharp - Sharp module
 * @param {Buffer} params.imageBuffer - Input image buffer
 * @param {Object} params.slotRect - Target slot rectangle {x, y, width, height}
 * @param {string} params.mode - Fit mode (ignored - always uses 'contain')
 * @param {Object} params.constants - Layout constants
 * @param {string} [params.panelType] - Panel type for debug logging
 * @returns {Promise<Buffer>} Resized image buffer
 */
async function placePanelImage({
  sharp,
  imageBuffer,
  slotRect,
  mode,
  constants,
  panelType = 'unknown',
}) {
  const { LABEL_HEIGHT, LABEL_PADDING } = constants;
  const targetWidth = slotRect.width;
  const targetHeight = Math.max(10, slotRect.height - LABEL_HEIGHT - LABEL_PADDING);
  const DEBUG_RUNS = process.env.DEBUG_RUNS === '1' || process.env.ARCHIAI_DEBUG === '1';

  // Get input image dimensions for debug logging
  let inputWidth = 0;
  let inputHeight = 0;
  try {
    const metadata = await sharp(imageBuffer).metadata();
    inputWidth = metadata.width || 0;
    inputHeight = metadata.height || 0;

    if (DEBUG_RUNS) {
      console.log(`[A1 Compose] Panel ${panelType} resize:`, {
        input: { width: inputWidth, height: inputHeight },
        output: { width: targetWidth, height: targetHeight },
        inputAspect: inputWidth && inputHeight ? (inputWidth / inputHeight).toFixed(3) : 'N/A',
        outputAspect: (targetWidth / targetHeight).toFixed(3),
        fit: 'contain',
        willLetterbox:
          inputWidth && inputHeight
            ? Math.abs(inputWidth / inputHeight - targetWidth / targetHeight) > 0.01
            : false,
      });
    }
  } catch (metaError) {
    if (DEBUG_RUNS) {
      console.warn(`[A1 Compose] Could not read metadata for ${panelType}:`, metaError.message);
    }
  }

  // AUTO-CROP: Trim white margins before resize (Phase 1 of Meshy+Blender pipeline)
  // MANDATORY CORRECTION B: Use lineArt:true for technical drawings, toBuffer({resolveWithObject:true})
  // This removes excessive whitespace from panels, producing cleaner compositions
  let processedBuffer = imageBuffer;

  // Determine if this is a technical drawing (uses lineArt mode for better edge detection)
  const isTechnicalDrawing = [
    'floor_plan_ground',
    'floor_plan_first',
    'floor_plan_level2',
    'floor_plan_upper',
    'elevation_north',
    'elevation_south',
    'elevation_east',
    'elevation_west',
    'section_AA',
    'section_BB',
    'axonometric',
    'site_plan',
    'site_diagram',
  ].includes(panelType);

  // Panel-specific padding after trim
  const TRIM_PADDING = {
    floor_plan_ground: 12,
    floor_plan_first: 12,
    floor_plan_level2: 12,
    floor_plan_upper: 12,
    elevation_north: 10,
    elevation_south: 10,
    elevation_east: 10,
    elevation_west: 10,
    section_AA: 10,
    section_BB: 10,
    axonometric: 8,
    site_plan: 12,
    site_diagram: 12,
    hero_3d: 4,
    interior_3d: 4,
    material_palette: 6,
    climate_card: 6,
    title_block: 2,
  };
  const padding = TRIM_PADDING[panelType] || 8;

  try {
    // Build trim options - MANDATORY CORRECTION B
    const trimOptions = {
      threshold: 10,
      background: '#ffffff',
    };

    // Add lineArt option for technical drawings (better edge detection)
    if (isTechnicalDrawing) {
      trimOptions.lineArt = true;
    }

    // Use toBuffer({ resolveWithObject: true }) to avoid double metadata decode
    const trimResult = await sharp(imageBuffer)
      .trim(trimOptions)
      .toBuffer({ resolveWithObject: true });

    const trimmedBuffer = trimResult.data;
    const trimmedInfo = trimResult.info;

    // Only use trimmed if result is valid (not too small)
    if (trimmedInfo.width > 50 && trimmedInfo.height > 50) {
      // Add small padding after trim for clean presentation
      if (padding > 0) {
        const paddedResult = await sharp(trimmedBuffer)
          .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: '#ffffff',
          })
          .toBuffer({ resolveWithObject: true });

        processedBuffer = paddedResult.data;

        if (DEBUG_RUNS) {
          console.log(`[A1 Compose] Panel ${panelType} auto-cropped:`, {
            original: { width: inputWidth, height: inputHeight },
            trimmed: { width: trimmedInfo.width, height: trimmedInfo.height },
            padded: { width: paddedResult.info.width, height: paddedResult.info.height },
            padding,
            lineArt: isTechnicalDrawing,
          });
        }

        // Update input dimensions for aspect ratio calculations
        inputWidth = paddedResult.info.width;
        inputHeight = paddedResult.info.height;
      } else {
        processedBuffer = trimmedBuffer;
        inputWidth = trimmedInfo.width;
        inputHeight = trimmedInfo.height;

        if (DEBUG_RUNS) {
          console.log(`[A1 Compose] Panel ${panelType} auto-cropped (no padding):`, {
            original: { width: inputWidth, height: inputHeight },
            trimmed: { width: trimmedInfo.width, height: trimmedInfo.height },
            lineArt: isTechnicalDrawing,
          });
        }
      }
    }
  } catch (trimError) {
    // If trim fails, continue with original buffer (non-blocking)
    if (DEBUG_RUNS) {
      console.warn(`[A1 Compose] Auto-crop failed for ${panelType}:`, trimError.message);
    }
  }

  // Create white canvas for the slot
  const canvas = sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // CRITICAL: Always use fit:'contain' to prevent cropping
  // This letterboxes the image with white padding instead of cropping
  // NOTE: Using processedBuffer (auto-cropped) instead of raw imageBuffer
  const resizedImage = await sharp(processedBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'contain', // ALWAYS contain - never crop
      position: 'centre', // Center within slot
      background: { r: 255, g: 255, b: 255, alpha: 1 }, // White letterbox padding
    })
    .png()
    .toBuffer();

  // Composite image onto white canvas (ensures any transparent areas are white)
  return canvas
    .composite([{ input: resizedImage, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function buildPlaceholder(sharp, width, height, type, constants) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f5f5f5" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <text x="${width / 2}" y="${height / 2 - 4}" font-size="18" font-family="Arial, sans-serif" font-weight="700"
        text-anchor="middle" fill="#9ca3af">PANEL MISSING – REGENERATE</text>
      <text x="${width / 2}" y="${height / 2 + 18}" font-size="14" font-family="Arial, sans-serif"
        text-anchor="middle" fill="#b91c1c">${(type || '').toUpperCase()}</text>
    </svg>
  `;
  return sharp(Buffer.from(svg))
    .png()
    .resize(width, height, { fit: 'contain', background: { r: 245, g: 245, b: 245 } })
    .toBuffer();
}

async function buildTitleBlockBuffer(sharp, width, height, titleBlockInput = {}, constants) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS, buildTitleBlockData } = constants;

  // Merge input with comprehensive RIBA template
  const tb = buildTitleBlockData(titleBlockInput || {});
  const leftMargin = 12;
  const rightMargin = width - 12;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />

      <!-- Practice Logo Area -->
      <rect x="8" y="8" width="${width - 16}" height="40" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="34" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#0f172a"
        text-anchor="middle">${tb.practiceName}</text>

      <!-- Project Information Section -->
      <line x1="8" y1="56" x2="${width - 8}" y2="56" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="74" font-family="Arial, sans-serif" font-size="8" fill="#64748b">PROJECT</text>
      <text x="${leftMargin}" y="90" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#0f172a">${tb.projectName}</text>
      <text x="${leftMargin}" y="106" font-family="Arial, sans-serif" font-size="9" fill="#475569">${tb.projectNumber}</text>

      <!-- Site Address -->
      <line x1="8" y1="114" x2="${width - 8}" y2="114" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="130" font-family="Arial, sans-serif" font-size="8" fill="#64748b">SITE ADDRESS</text>
      <text x="${leftMargin}" y="146" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${tb.siteAddress || 'TBD'}</text>

      <!-- Drawing Information -->
      <line x1="8" y1="158" x2="${width - 8}" y2="158" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="174" font-family="Arial, sans-serif" font-size="8" fill="#64748b">DRAWING TITLE</text>
      <text x="${leftMargin}" y="190" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#0f172a">${tb.drawingTitle}</text>

      <!-- Sheet / Revision Row -->
      <rect x="8" y="200" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${leftMargin + 4}" y="214" font-family="Arial, sans-serif" font-size="7" fill="#64748b">SHEET NO.</text>
      <text x="${leftMargin + 4}" y="226" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${tb.sheetNumber}</text>

      <rect x="${width / 2 + 4}" y="200" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${width / 2 + 8}" y="214" font-family="Arial, sans-serif" font-size="7" fill="#64748b">REVISION</text>
      <text x="${width / 2 + 8}" y="226" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${tb.revision}</text>

      <!-- Scale / Date Row -->
      <rect x="8" y="236" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${leftMargin + 4}" y="250" font-family="Arial, sans-serif" font-size="7" fill="#64748b">SCALE</text>
      <text x="${leftMargin + 4}" y="262" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${tb.scale}</text>

      <rect x="${width / 2 + 4}" y="236" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${width / 2 + 8}" y="250" font-family="Arial, sans-serif" font-size="7" fill="#64748b">DATE</text>
      <text x="${width / 2 + 8}" y="262" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${tb.date}</text>

      <!-- RIBA Stage / Status -->
      <line x1="8" y1="276" x2="${width - 8}" y2="276" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="292" font-family="Arial, sans-serif" font-size="8" fill="#64748b">RIBA STAGE</text>
      <text x="${rightMargin}" y="292" font-family="Arial, sans-serif" font-size="9" font-weight="500" fill="#0f172a"
        text-anchor="end">${tb.ribaStage}</text>
      <text x="${leftMargin}" y="306" font-family="Arial, sans-serif" font-size="8" fill="#64748b">STATUS</text>
      <text x="${rightMargin}" y="306" font-family="Arial, sans-serif" font-size="9" font-weight="500" fill="#0891b2"
        text-anchor="end">${tb.status}</text>

      <!-- AI Generation Metadata -->
      ${
        tb.designId
          ? `
      <line x1="8" y1="${height - 44}" x2="${width - 8}" y2="${height - 44}" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="${height - 28}" font-family="Arial, sans-serif" font-size="7" fill="#94a3b8">DESIGN ID: ${tb.designId}</text>
      <text x="${leftMargin}" y="${height - 16}" font-family="Arial, sans-serif" font-size="7" fill="#94a3b8">SEED: ${tb.seedValue || 'N/A'}</text>
      `
          : ''
      }

      <!-- Copyright -->
      <text x="${width / 2}" y="${height - 6}" font-family="Arial, sans-serif" font-size="6" fill="#94a3b8"
        text-anchor="middle">${tb.copyrightNote}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
}
