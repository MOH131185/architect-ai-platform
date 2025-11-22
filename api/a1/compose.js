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
 *   composedSheetUrl: string (base64 data URL),
 *   coordinates: object,
 *   metadata: object,
 *   missingPanels?: string[]
 * }
 */

import fetch from 'node-fetch';

// Import shared constants from service layer
// Note: In Vercel, we need to use dynamic import for ES modules from src/
let layoutConstants = null;

async function getLayoutConstants() {
  if (layoutConstants) return layoutConstants;

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
    material_palette: { x: 0.88, y: 0.02, width: 0.10, height: 0.10 },
    climate_card: { x: 0.88, y: 0.13, width: 0.10, height: 0.11 },
    // Row 2 (y: 0.26 to 0.48)
    floor_plan_ground: { x: 0.02, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_first: { x: 0.36, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_level2: { x: 0.70, y: 0.26, width: 0.28, height: 0.22 },
    // Row 3 (y: 0.50 to 0.68)
    elevation_north: { x: 0.02, y: 0.50, width: 0.23, height: 0.18 },
    elevation_south: { x: 0.27, y: 0.50, width: 0.23, height: 0.18 },
    elevation_east: { x: 0.52, y: 0.50, width: 0.23, height: 0.18 },
    elevation_west: { x: 0.77, y: 0.50, width: 0.21, height: 0.18 },
    // Row 4 (y: 0.70 to 0.96)
    section_AA: { x: 0.02, y: 0.70, width: 0.32, height: 0.26 },
    section_BB: { x: 0.36, y: 0.70, width: 0.32, height: 0.26 },
    title_block: { x: 0.70, y: 0.70, width: 0.28, height: 0.26 }
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
    title_block: 'PROJECT INFO',
    material_palette: 'MATERIAL PALETTE',
    climate_card: 'CLIMATE ANALYSIS',
    materials: 'MATERIALS'
  };

  const REQUIRED_PANELS = [
    'hero_3d', 'interior_3d', 'site_diagram',
    'floor_plan_ground', 'floor_plan_first', 'floor_plan_level2',
    'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
    'section_AA', 'section_BB',
    'material_palette', 'climate_card'
  ];

  const COVER_FIT_PANELS = ['hero_3d', 'interior_3d', 'site_diagram'];

  return {
    WORKING_WIDTH,
    WORKING_HEIGHT,
    LABEL_HEIGHT,
    LABEL_PADDING,
    FRAME_STROKE_COLOR,
    FRAME_RADIUS,
    GRID_SPEC,
    PANEL_LABELS,
    REQUIRED_PANELS,
    COVER_FIT_PANELS,
    toPixelRect: (layoutEntry, width, height) => ({
      x: Math.round(layoutEntry.x * width),
      y: Math.round(layoutEntry.y * height),
      width: Math.round(layoutEntry.width * width),
      height: Math.round(layoutEntry.height * height)
    }),
    getPanelFitMode: (panelType) => COVER_FIT_PANELS.includes(panelType) ? 'cover' : 'contain',
    validatePanelLayout: (panels) => {
      const providedTypes = new Set(panels.map((p) => p.type));
      const missingPanels = REQUIRED_PANELS.filter((type) => !providedTypes.has(type));
      return {
        valid: missingPanels.length === 0,
        errors: missingPanels.length > 0 ? [`Missing panels: ${missingPanels.join(', ')}`] : [],
        warnings: [],
        panelCount: panels.length,
        missingPanels
      };
    }
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
  const { PANEL_LABELS, LABEL_HEIGHT, FRAME_STROKE_COLOR, FRAME_RADIUS } = constants;
  let frames = '';
  let labels = '';

  for (const [id, coord] of Object.entries(coordinates)) {
    const labelText = PANEL_LABELS[id] || (id || '').toUpperCase();
    const labelY = coord.y + coord.height - Math.round(LABEL_HEIGHT / 2) + 4;
    const labelTop = coord.y + coord.height - LABEL_HEIGHT;

    frames += `<rect x="${coord.x}" y="${coord.y}" width="${coord.width}" height="${coord.height}"
      fill="none" stroke="${FRAME_STROKE_COLOR}" stroke-width="3" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />`;

    labels += `<rect x="${coord.x}" y="${labelTop}" width="${coord.width}" height="${LABEL_HEIGHT}"
      fill="#ffffff" fill-opacity="0.9" />`;
    labels += `<text x="${coord.x + coord.width / 2}" y="${labelY}"
      font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111"
      dominant-baseline="middle" text-anchor="middle">${labelText}</text>`;
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${frames}
    ${labels}
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get shared constants (with fallback)
    const constants = await getLayoutConstants();
    const {
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
      validatePanelLayout
    } = constants;

    const { designId, panels = [], siteOverlay = null, layoutConfig = 'uk-riba-standard', titleBlock = null } = req.body;

    if (!panels || panels.length === 0) {
      return res.status(400).json({ error: 'No panels provided' });
    }

    console.log(`[A1 Compose] Composing ${panels.length} panels for design ${designId}`);

    // Validate panel layout BEFORE proceeding
    const validation = validatePanelLayout(panels);

    if (!validation.valid) {
      console.warn(`[A1 Compose] Missing required panels: ${validation.missingPanels.join(', ')}`);
      // Return error instead of proceeding with incomplete sheet
      return res.status(400).json({
        error: 'Missing required panels',
        missingPanels: validation.missingPanels,
        message: `Cannot compose A1 sheet - missing: ${validation.missingPanels.join(', ')}. Please regenerate missing panels first.`
      });
    }

    // Dynamic import of sharp (server-side only)
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (e) {
      console.error('[A1 Compose] sharp not available:', e.message);
      return res.status(500).json({
        error: 'Server-side composition not available',
        message: 'sharp module not installed'
      });
    }

    const layout = GRID_SPEC;
    const width = WORKING_WIDTH;
    const height = WORKING_HEIGHT;

    // Create white background
    const background = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
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
        const titleBuffer = await buildTitleBlockBuffer(sharp, slotRect.width, slotRect.height - LABEL_HEIGHT - LABEL_PADDING, titleBlock, constants);
        composites.push({ input: titleBuffer, left: slotRect.x, top: slotRect.y });
        continue;
      }

      if (panel?.imageUrl || panel?.buffer) {
        try {
          const buffer = panel.buffer || await fetchImageBuffer(panel.imageUrl);
          const resized = await placePanelImage({
            sharp,
            imageBuffer: buffer,
            slotRect,
            mode,
            constants
          });
          composites.push({ input: resized, left: slotRect.x, top: slotRect.y });
          continue;
        } catch (err) {
          console.error(`[A1 Compose] Failed to process panel ${type}:`, err.message);
        }
      }

      // Build placeholder for missing panel
      const placeholder = await buildPlaceholder(sharp, slotRect.width, slotRect.height - LABEL_HEIGHT - LABEL_PADDING, type, constants);
      composites.push({ input: placeholder, left: slotRect.x, top: slotRect.y });
    }

    // Add site overlay if provided
    if (siteOverlay?.imageUrl) {
      const siteLayout = layout.site_diagram || GRID_SPEC.site_diagram;
      const slotRect = toPixelRect(siteLayout, width, height);

      try {
        const overlayBuffer = await fetchImageBuffer(siteOverlay.imageUrl);
        const resizedOverlay = await sharp(overlayBuffer)
          .resize(slotRect.width, slotRect.height - LABEL_HEIGHT - LABEL_PADDING, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();

        composites.push({
          input: resizedOverlay,
          left: slotRect.x,
          top: slotRect.y
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
      top: 0
    });

    // Compose all panels onto background
    const composedBuffer = await background
      .composite(composites)
      .png()
      .toBuffer();

    // Convert to base64 data URL
    const base64Image = composedBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    console.log(`[A1 Compose] Sheet composed: ${composites.length} elements, ${width}x${height}px`);

    // Return the composition result
    return res.status(200).json({
      composedSheetUrl: dataUrl,
      coordinates,
      metadata: {
        width,
        height,
        panelCount: panels.length,
        composedAt: new Date().toISOString(),
        layoutConfig,
        designId
      }
    });

  } catch (error) {
    console.error('[A1 Compose] Error:', error);
    return res.status(500).json({
      error: 'Composition failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function placePanelImage({ sharp, imageBuffer, slotRect, mode, constants }) {
  const { LABEL_HEIGHT, LABEL_PADDING } = constants;
  const targetHeight = Math.max(10, slotRect.height - LABEL_HEIGHT - LABEL_PADDING);

  // Create white canvas for the slot
  const canvas = sharp({
    create: {
      width: slotRect.width,
      height: targetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  });

  // Resize image with proper fit mode
  const resizedImage = await sharp(imageBuffer)
    .resize(slotRect.width, targetHeight, {
      fit: mode === 'cover' ? 'cover' : 'contain',
      position: 'centre',
      background: { r: 255, g: 255, b: 255 }
    })
    .png()
    .toBuffer();

  // Composite image onto white canvas
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
  return sharp(Buffer.from(svg)).png().resize(width, height, { fit: 'contain', background: { r: 245, g: 245, b: 245 } }).toBuffer();
}

async function buildTitleBlockBuffer(sharp, width, height, titleBlock = {}, constants) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants;
  const {
    projectName = 'Architect AI',
    buildingTypeLabel = 'A1 PRESENTATION BOARD',
    locationDesc = 'Location TBD',
    scale = 'Scale 1:100 @ A1',
    date = new Date().toISOString().split('T')[0]
  } = titleBlock || {};

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <text x="16" y="36" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0f172a">${projectName}</text>
      <text x="16" y="66" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#1f2937">${buildingTypeLabel}</text>
      <text x="16" y="96" font-family="Arial, sans-serif" font-size="14" fill="#374151">${locationDesc}</text>
      <text x="16" y="126" font-family="Arial, sans-serif" font-size="14" fill="#374151">${scale}</text>
      <text x="16" y="${height - 16}" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">Date: ${date}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255 } }).toBuffer();
}
