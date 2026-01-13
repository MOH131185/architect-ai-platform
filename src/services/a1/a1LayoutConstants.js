/**
 * A1 Layout Constants
 *
 * Shared constants for A1 sheet composition.
 * Used by both a1LayoutComposer.js (service) and api/a1/compose.js (endpoint).
 *
 * @module services/a1/a1LayoutConstants
 */

// A1 sheet dimensions at 300 DPI (landscape orientation)
export const A1_WIDTH = 9933;
export const A1_HEIGHT = 7016;

// Working resolution (for faster composition, upscale on export)
export const WORKING_WIDTH = 1792;
export const WORKING_HEIGHT = 1269;

// Label band styling
export const LABEL_HEIGHT = 26;
export const LABEL_PADDING = 6;
export const FRAME_STROKE_WIDTH = 3;
export const FRAME_STROKE_COLOR = "#d1d5db";
export const FRAME_RADIUS = 4;

/**
 * GRAPHICS STANDARDS - Consistent styling across all panels
 * Ensures professional A1 presentation quality
 */
export const GRAPHICS_STANDARDS = {
  font: {
    family: "Arial, Helvetica, sans-serif",
    titleSize: 14,
    labelSize: 10,
    dimensionSize: 8,
    weight: {
      title: "bold",
      label: "normal",
      dimension: "normal",
    },
  },
  lineweights: {
    outline: 2, // Panel borders, building outline
    major: 1, // Primary walls, major features
    minor: 0.5, // Interior walls, secondary features
    dimension: 0.25, // Dimension lines, annotations
    grid: 0.1, // Background grid (if used)
  },
  colors: {
    background: "#FFFFFF",
    outline: "#1a1a1a",
    grid: "#e5e5e5",
    dimension: "#666666",
    accent: "#2563eb",
    error: "#dc2626",
  },
  margins: {
    outer: 0.02, // 2% margin from sheet edge
    inner: 0.01, // 1% between panels
    panel: 0.005, // 0.5% padding inside panel frames
  },
};

/**
 * RIBA-style fixed grid (0-1 normalized coordinates)
 * All panels fit within a 841mm x 594mm A1 landscape sheet
 * Layout: 4 rows with no overlaps
 *   Row 1 (y=0.02-0.24): site, hero, interior, axonometric, material/climate stack
 *   Row 2 (y=0.26-0.48): floor plans
 *   Row 3 (y=0.50-0.68): elevations
 *   Row 4 (y=0.70-0.96): sections + title block
 */
export const GRID_SPEC = {
  // Row 1: site, hero, interior, axonometric, stacked material/climate (y: 0.02 to 0.24)
  site_diagram: { x: 0.02, y: 0.02, width: 0.22, height: 0.22 },
  hero_3d: { x: 0.26, y: 0.02, width: 0.34, height: 0.22 },
  interior_3d: { x: 0.62, y: 0.02, width: 0.24, height: 0.11 },
  axonometric: { x: 0.62, y: 0.13, width: 0.24, height: 0.11 },
  material_palette: { x: 0.88, y: 0.02, width: 0.1, height: 0.1 },
  climate_card: { x: 0.88, y: 0.13, width: 0.1, height: 0.11 },

  // Row 2: floor plans (y: 0.26 to 0.48)
  floor_plan_ground: { x: 0.02, y: 0.26, width: 0.32, height: 0.22 },
  floor_plan_first: { x: 0.36, y: 0.26, width: 0.32, height: 0.22 },
  floor_plan_level2: { x: 0.7, y: 0.26, width: 0.28, height: 0.22 },

  // Row 3: elevations (y: 0.50 to 0.68)
  elevation_north: { x: 0.02, y: 0.5, width: 0.23, height: 0.18 },
  elevation_south: { x: 0.27, y: 0.5, width: 0.23, height: 0.18 },
  elevation_east: { x: 0.52, y: 0.5, width: 0.23, height: 0.18 },
  elevation_west: { x: 0.77, y: 0.5, width: 0.21, height: 0.18 },

  // Row 4: sections + notes + title block (y: 0.70 to 0.96)
  section_AA: { x: 0.02, y: 0.7, width: 0.32, height: 0.26 },
  section_BB: { x: 0.36, y: 0.7, width: 0.32, height: 0.26 },
  schedules_notes: { x: 0.7, y: 0.7, width: 0.14, height: 0.26 },
  title_block: { x: 0.85, y: 0.7, width: 0.13, height: 0.26 },
};

/**
 * Required panels for a complete A1 sheet (15 panels max)
 * Note: floor_plan_level2 only required for 3+ story buildings
 */
export const REQUIRED_PANELS = [
  "hero_3d",
  "interior_3d",
  "axonometric",
  "site_diagram",
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
  "schedules_notes",
  "material_palette",
  "climate_card",
];

/**
 * Valid panel types (derived from GRID_SPEC keys)
 * Export for convenience and type checking
 */
export const PANEL_TYPES = Object.keys(GRID_SPEC);

/**
 * Get required panels based on floor count
 * @param {number} floorCount - Number of floors (default 2)
 * @returns {string[]} Required panel types
 */
export function getRequiredPanels(floorCount = 2) {
  const base = [
    "hero_3d",
    "interior_3d",
    "axonometric",
    "site_diagram",
    "floor_plan_ground",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "schedules_notes",
    "material_palette",
    "climate_card",
  ];

  // Add floor plans based on floor count
  if (floorCount >= 2) {
    base.push("floor_plan_first");
  }
  if (floorCount >= 3) {
    base.push("floor_plan_level2");
  }

  return base;
}

/**
 * Panel display labels for UI and sheet annotations
 */
export const PANEL_LABELS = {
  hero_3d: "HERO 3D VIEW",
  interior_3d: "INTERIOR 3D VIEW",
  axonometric: "AXONOMETRIC VIEW",
  site_diagram: "SITE DIAGRAM",
  floor_plan_ground: "GROUND FLOOR PLAN",
  floor_plan_first: "FIRST FLOOR PLAN",
  floor_plan_level2: "SECOND FLOOR PLAN",
  elevation_north: "NORTH ELEVATION",
  elevation_south: "SOUTH ELEVATION",
  elevation_east: "EAST ELEVATION",
  elevation_west: "WEST ELEVATION",
  section_AA: "SECTION A-A",
  section_BB: "SECTION B-B",
  schedules_notes: "SCHEDULES & NOTES",
  title_block: "PROJECT INFO",
  material_palette: "MATERIAL PALETTE",
  climate_card: "CLIMATE ANALYSIS",
  materials: "MATERIALS", // Legacy alias
};

/**
 * Panels that use 'cover' fit mode (photorealistic renders)
 * All others use 'contain' (technical drawings)
 */
export const COVER_FIT_PANELS = ["hero_3d", "interior_3d", "site_diagram"];

/**
 * Convert normalized layout coordinates to pixel values
 *
 * @param {Object} layoutEntry - Normalized {x, y, width, height} (0-1)
 * @param {number} sheetWidth - Target sheet width in pixels
 * @param {number} sheetHeight - Target sheet height in pixels
 * @returns {Object} Pixel coordinates {x, y, width, height}
 */
export function toPixelRect(layoutEntry, sheetWidth, sheetHeight) {
  return {
    x: Math.round(layoutEntry.x * sheetWidth),
    y: Math.round(layoutEntry.y * sheetHeight),
    width: Math.round(layoutEntry.width * sheetWidth),
    height: Math.round(layoutEntry.height * sheetHeight),
  };
}

/**
 * Validate that all panels fit within sheet bounds and don't overlap
 *
 * @param {Array} panels - Array of {type, ...} panel objects
 * @param {Object} options - Validation options
 * @param {Object} options.layoutSpec - Layout specification (defaults to GRID_SPEC)
 * @param {number} options.floorCount - Number of floors (defaults to 2)
 * @returns {Object} {valid: boolean, errors: string[], warnings: string[], missingPanels: string[]}
 */
export function validatePanelLayout(panels, options = {}) {
  const {
    layoutSpec = GRID_SPEC,
    floorCount = 2,
    allowUnknownTypes = false,
  } = options;
  const errors = [];
  const warnings = [];

  // Check for required panels based on floor count
  const requiredPanels = getRequiredPanels(floorCount);
  const providedTypes = new Set(panels.map((p) => p.type));
  const missingPanels = requiredPanels.filter(
    (type) => !providedTypes.has(type),
  );

  if (missingPanels.length > 0) {
    errors.push(`Missing panels: ${missingPanels.join(", ")}`);
  }

  // Build coordinate list for overlap/bounds checking
  const coordinates = [];
  for (const panel of panels) {
    const layout = layoutSpec[panel.type];
    if (!layout) {
      const msg = `Unknown panel type: ${panel.type}`;
      if (allowUnknownTypes) {
        warnings.push(msg);
        continue;
      }
      errors.push(msg);
      continue;
    }

    coordinates.push({
      type: panel.type,
      x1: layout.x,
      y1: layout.y,
      x2: layout.x + layout.width,
      y2: layout.y + layout.height,
    });
  }

  // Check for overlaps between panels
  for (let i = 0; i < coordinates.length; i++) {
    for (let j = i + 1; j < coordinates.length; j++) {
      const a = coordinates[i];
      const b = coordinates[j];

      // Check if rectangles overlap
      const overlaps = !(
        a.x2 <= b.x1 || // a is left of b
        a.x1 >= b.x2 || // a is right of b
        a.y2 <= b.y1 || // a is above b
        a.y1 >= b.y2 // a is below b
      );

      if (overlaps) {
        errors.push(`Panels overlap: ${a.type} and ${b.type}`);
      }
    }
  }

  // Check if all panels are within sheet bounds (0-1 normalized)
  for (const coord of coordinates) {
    if (coord.x1 < 0 || coord.y1 < 0 || coord.x2 > 1 || coord.y2 > 1) {
      errors.push(`Panel ${coord.type} exceeds sheet bounds`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    panelCount: panels.length,
    missingPanels,
  };
}

/**
 * Get fit mode for a panel type
 *
 * @param {string} panelType - Panel type identifier
 * @returns {'cover' | 'contain'} Fit mode
 */
export function getPanelFitMode(panelType) {
  return COVER_FIT_PANELS.includes(panelType) ? "cover" : "contain";
}

export default {
  A1_WIDTH,
  A1_HEIGHT,
  WORKING_WIDTH,
  WORKING_HEIGHT,
  LABEL_HEIGHT,
  LABEL_PADDING,
  FRAME_STROKE_WIDTH,
  FRAME_STROKE_COLOR,
  FRAME_RADIUS,
  GRAPHICS_STANDARDS,
  GRID_SPEC,
  REQUIRED_PANELS,
  PANEL_LABELS,
  COVER_FIT_PANELS,
  toPixelRect,
  validatePanelLayout,
  getPanelFitMode,
};

export const TITLE_BLOCK_TEMPLATE = {
  projectName: "",
  projectNumber: "",
  clientName: "",
  siteAddress: "",
  drawingTitle: "A1 DESIGN SHEET",
  sheetNumber: "A1-001",
  revision: "P01",
  status: "PRELIMINARY",
  scale: "AS NOTED",
  date: "",
  drawnBy: "AI ARCHITECT",
  checkedBy: "",
  practiceName: "ArchiAI Solutions",
  practiceAddress: "",
  arbNumber: "",
  ribaStage: "STAGE 2",
  standardsRef: "BS EN ISO 7200",
  copyrightNote: "© 2024 ArchiAI Solutions",
  designId: "",
  seedValue: "",
  consistencyScore: 0,
  generationTimestamp: "",
};

export function buildTitleBlockData(context = {}) {
  const now = new Date();
  return {
    ...TITLE_BLOCK_TEMPLATE,
    projectName: context.projectName || TITLE_BLOCK_TEMPLATE.projectName,
    projectNumber:
      context.projectNumber ||
      `P${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    clientName: context.clientName || TITLE_BLOCK_TEMPLATE.clientName,
    siteAddress:
      context.address ||
      context.siteAddress ||
      TITLE_BLOCK_TEMPLATE.siteAddress,
    drawingTitle: context.buildingType
      ? `${String(context.buildingType).toUpperCase()} - A1 DESIGN SHEET`
      : TITLE_BLOCK_TEMPLATE.drawingTitle,
    sheetNumber: context.sheetNumber || TITLE_BLOCK_TEMPLATE.sheetNumber,
    revision: context.revision || TITLE_BLOCK_TEMPLATE.revision,
    status: context.status || TITLE_BLOCK_TEMPLATE.status,
    scale: context.scale || TITLE_BLOCK_TEMPLATE.scale,
    date:
      context.date ||
      now
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .toUpperCase(),
    ribaStage: context.ribaStage || TITLE_BLOCK_TEMPLATE.ribaStage,
    designId: context.designId || TITLE_BLOCK_TEMPLATE.designId,
    seedValue: context.seed
      ? String(context.seed)
      : context.seedValue || TITLE_BLOCK_TEMPLATE.seedValue,
    consistencyScore:
      context.consistencyScore || TITLE_BLOCK_TEMPLATE.consistencyScore,
    generationTimestamp: now.toISOString(),
  };
}

// =============================================================================
// RUNTIME ASSERTIONS - Prevent panel type drift
// =============================================================================

/**
 * Validate that all panel types have corresponding GRID_SPEC slots
 * This runs at module load to catch configuration drift early
 */
(function validatePanelTypeConsistency() {
  const gridTypes = new Set(Object.keys(GRID_SPEC));
  const errors = [];

  // Check REQUIRED_PANELS
  for (const panelType of REQUIRED_PANELS) {
    if (!gridTypes.has(panelType)) {
      errors.push(
        `REQUIRED_PANELS includes "${panelType}" but GRID_SPEC has no slot for it`,
      );
    }
  }

  // Check PANEL_LABELS
  for (const panelType of Object.keys(PANEL_LABELS)) {
    if (panelType === "materials") continue; // Legacy alias, skip
    if (!gridTypes.has(panelType) && panelType !== "title_block") {
      errors.push(
        `PANEL_LABELS includes "${panelType}" but GRID_SPEC has no slot for it`,
      );
    }
  }

  if (errors.length > 0) {
    const errorMsg = [
      "❌ Panel type configuration drift detected in a1LayoutConstants.js:",
      ...errors.map((e) => `   - ${e}`),
      "",
      "Fix: Add missing slots to GRID_SPEC or remove from REQUIRED_PANELS/PANEL_LABELS",
    ].join("\n");

    throw new Error(errorMsg);
  }
})();
