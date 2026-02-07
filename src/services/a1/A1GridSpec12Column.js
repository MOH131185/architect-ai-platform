/**
 * A1 Grid Specification - 12-Column System (QA metadata layer)
 *
 * Grid coordinates are RE-EXPORTED from composeCore.js (SSOT).
 * This module adds QA-only metadata: minimum sizes, text sizes,
 * style zones, priority order, and validation helpers.
 *
 * DO NOT define independent grid coordinates here – they must match composeCore.
 *
 * @module services/a1/A1GridSpec12Column
 */

// Re-export authoritative grid from composeCore (SSOT)
import { GRID_12COL as _GRID_12COL } from "./composeCore.js";

// =============================================================================
// SHEET DIMENSIONS (300 DPI A1 Landscape)
// =============================================================================

export const SHEET = {
  width: 9933, // 841mm at 300 DPI
  height: 7016, // 594mm at 300 DPI
  margin: 150, // 12.7mm outer margin
  gutter: 50, // 4.2mm between columns
  columns: 12,
  rows: 4,
};

// Computed column width: (9933 - 2*150 - 11*50) / 12 = 757px
export const COLUMN_WIDTH = Math.floor(
  (SHEET.width - 2 * SHEET.margin - (SHEET.columns - 1) * SHEET.gutter) /
    SHEET.columns,
);

// Row height percentages (priority zones)
export const ROW_HEIGHTS = {
  hero: 0.28, // Row 1: Competition board aesthetics (28%)
  plans: 0.24, // Row 2: Floor plans (24%)
  elevations: 0.22, // Row 3: Elevations/sections (22%)
  schedules: 0.26, // Row 4: Technical/schedules (26%)
};

// =============================================================================
// MINIMUM PANEL SIZES (at 300 DPI print resolution)
// =============================================================================

export const MINIMUM_SIZES = {
  // 3D/Photorealistic panels (competition aesthetic)
  hero_3d: { width: 2500, height: 1500 },
  interior_3d: { width: 1500, height: 1000 },
  axonometric: { width: 1500, height: 1000 },

  // Floor plans (technical precision)
  floor_plan_ground: { width: 2000, height: 1400 },
  floor_plan_first: { width: 2000, height: 1400 },
  floor_plan_level2: { width: 1800, height: 1200 },

  // Elevations (technical precision)
  elevation_north: { width: 1800, height: 1200 },
  elevation_south: { width: 1800, height: 1200 },
  elevation_east: { width: 1800, height: 1200 },
  elevation_west: { width: 1800, height: 1200 },

  // Sections (technical precision)
  section_AA: { width: 2000, height: 1200 },
  section_BB: { width: 2000, height: 1200 },

  // Site and context
  site_diagram: { width: 1200, height: 1000 },

  // Data/info panels (enlarged for legibility)
  material_palette: { width: 1000, height: 1200 },
  climate_card: { width: 1000, height: 1200 },
  schedules_notes: { width: 1000, height: 800 },
  title_block: { width: 800, height: 1000 },
};

// =============================================================================
// TEXT SIZE REQUIREMENTS (at 300 DPI)
// =============================================================================

export const TEXT_SIZES = {
  minTitlePt: 14, // Minimum 14pt for panel titles
  minLabelPt: 10, // Minimum 10pt for room/feature labels
  minDimensionPt: 8, // Minimum 8pt for dimension text
  minPixels: 20, // Minimum 20px text height for legibility
  minTitleBlockPt: 12, // Minimum 12pt for title block entries
};

// =============================================================================
// PANEL PRIORITY ORDER (generation sequence)
// =============================================================================

/**
 * Fixed priority order for panel generation.
 * hero_3d MUST be generated first to establish design fingerprint.
 */
export const PANEL_PRIORITY_ORDER = [
  "hero_3d", // 1. Hero exterior - establishes fingerprint
  "floor_plan_ground", // 2. Ground floor plan
  "floor_plan_first", // 3. First floor plan
  "elevation_north", // 4. North elevation
  "elevation_south", // 5. South elevation
  "elevation_east", // 6. East elevation
  "elevation_west", // 7. West elevation
  "section_AA", // 8. Longitudinal section
  "section_BB", // 9. Cross section
  "interior_3d", // 10. Interior 3D
  "axonometric", // 11. Axonometric view
  "site_diagram", // 12. Site plan
  "material_palette", // 13. Materials
  "climate_card", // 14. Climate data
  "schedules_notes", // 15. Schedules/notes
  "title_block", // 16. Title block
];

// =============================================================================
// STYLE ZONES (Hybrid aesthetic)
// =============================================================================

/**
 * Style zones define which panels get which aesthetic treatment:
 * - competition: Bold visuals, photorealistic, artistic presentation
 * - technical: RIBA planning set, orthographic, consistent lineweights
 * - data: Clear typography, tabular layouts, readable info
 */
export const STYLE_ZONES = {
  competition: ["hero_3d", "interior_3d", "axonometric"],
  technical: [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "site_diagram",
  ],
  data: ["material_palette", "climate_card", "schedules_notes", "title_block"],
};

/**
 * Get the style zone for a panel type
 * @param {string} panelType - Panel type identifier
 * @returns {'competition' | 'technical' | 'data'} Style zone
 */
export function getStyleZone(panelType) {
  for (const [zone, panels] of Object.entries(STYLE_ZONES)) {
    if (panels.includes(panelType)) {
      return zone;
    }
  }
  return "technical"; // Default to technical
}

// =============================================================================
// 12-COLUMN GRID LAYOUT (Normalized 0-1 coordinates)
// =============================================================================

/**
 * 12-Column grid layout with exact panel positions.
 * All coordinates are normalized (0-1) for resolution independence.
 *
 * Layout structure:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Row 1 (28%): site_diagram | hero_3d         | interior_3d | mats   │
 * │              (cols 1-3)   | (cols 4-8)      | (cols 9-11) | (12)   │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ Row 2 (24%): floor_plan_ground | floor_plan_first | floor_plan_2   │
 * │              (cols 1-4)        | (cols 5-8)       | (cols 9-12)    │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ Row 3 (22%): elev_N     | elev_S     | elev_E     | elev_W        │
 * │              (cols 1-3) | (cols 4-6) | (cols 7-9) | (cols 10-12)  │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ Row 4 (26%): section_AA | section_BB | schedules | title_block    │
 * │              (cols 1-4) | (cols 5-8) | (cols 9-10)| (cols 11-12)  │
 * └─────────────────────────────────────────────────────────────────────┘
 */
// Re-exported from composeCore.js – DO NOT redefine here.
export const GRID_12COL = _GRID_12COL;

// =============================================================================
// FRAME AND CAPTION STYLING
// =============================================================================

export const FRAME_STYLE = {
  stroke: "#1a1a1a",
  strokeWidth: 2,
  radius: 4,
  padding: 8, // Padding inside frame
};

export const CAPTION_STYLE = {
  height: 32, // Caption bar height in pixels
  background: "#f8fafc",
  font: "Arial, Helvetica, sans-serif",
  fontSize: 12,
  fontWeight: 600,
  color: "#0f172a",
  drawingNumberPosition: "left",
  scalePosition: "right",
};

// =============================================================================
// QA THRESHOLDS
// =============================================================================

export const QA_THRESHOLDS = {
  // Minimum edge contrast for legibility (MTF proxy)
  minContrast: 0.15,

  // pHash distance threshold for duplicate detection
  pHashDuplicateThreshold: 8, // Hamming distance (lower = more similar)

  // Minimum percentage of sheet area for text panels
  minTextPanelAreaPercent: 2.0,

  // Maximum scale factor for scale-to-fill
  maxScaleFactor: 1.2,
  minScaleFactor: 0.8,

  // SSIM threshold for visual similarity
  ssimSimilarityThreshold: 0.92,
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert normalized layout coordinates to pixel values
 *
 * @param {Object} layoutEntry - Normalized {x, y, width, height} (0-1)
 * @param {number} sheetWidth - Target sheet width in pixels
 * @param {number} sheetHeight - Target sheet height in pixels
 * @returns {Object} Pixel coordinates {x, y, width, height}
 */
export function toPixelRect(
  layoutEntry,
  sheetWidth = SHEET.width,
  sheetHeight = SHEET.height,
) {
  return {
    x: Math.round(layoutEntry.x * sheetWidth),
    y: Math.round(layoutEntry.y * sheetHeight),
    width: Math.round(layoutEntry.width * sheetWidth),
    height: Math.round(layoutEntry.height * sheetHeight),
  };
}

/**
 * Get the column span for a panel based on its width
 *
 * @param {Object} layoutEntry - Panel layout entry from GRID_12COL
 * @returns {number} Number of columns the panel spans
 */
export function getColumnSpan(layoutEntry) {
  const normalizedColumnWidth = 1 / SHEET.columns;
  return Math.round(layoutEntry.width / normalizedColumnWidth);
}

/**
 * Get the minimum size for a panel type
 *
 * @param {string} panelType - Panel type identifier
 * @returns {Object} Minimum {width, height} in pixels
 */
export function getMinimumSize(panelType) {
  // Try exact match first
  if (MINIMUM_SIZES[panelType]) {
    return MINIMUM_SIZES[panelType];
  }

  // Fall back to category defaults
  if (panelType.startsWith("floor_plan")) {
    return MINIMUM_SIZES.floor_plan_ground;
  }
  if (panelType.startsWith("elevation")) {
    return MINIMUM_SIZES.elevation_north;
  }
  if (panelType.startsWith("section")) {
    return MINIMUM_SIZES.section_AA;
  }

  // Default minimum
  return { width: 800, height: 600 };
}

/**
 * Validate that a panel meets minimum size requirements
 *
 * @param {string} panelType - Panel type identifier
 * @param {number} width - Panel width in pixels
 * @param {number} height - Panel height in pixels
 * @returns {Object} { valid: boolean, minimumRequired: Object, actual: Object }
 */
export function validatePanelSize(panelType, width, height) {
  const minSize = getMinimumSize(panelType);
  const valid = width >= minSize.width && height >= minSize.height;

  return {
    valid,
    minimumRequired: minSize,
    actual: { width, height },
    message: valid
      ? null
      : `Panel ${panelType} below minimum size: ${width}x${height} < ${minSize.width}x${minSize.height}`,
  };
}

/**
 * Calculate scale-to-fill dimensions while respecting bounds
 *
 * @param {Object} sourceSize - Source {width, height}
 * @param {Object} targetSize - Target container {width, height}
 * @returns {Object} { scale, width, height, offsetX, offsetY }
 */
export function calculateScaleToFill(sourceSize, targetSize) {
  const scaleX = targetSize.width / sourceSize.width;
  const scaleY = targetSize.height / sourceSize.height;

  // Use larger scale to fill, but clamp to bounds
  let scale = Math.max(scaleX, scaleY);
  scale = Math.min(scale, QA_THRESHOLDS.maxScaleFactor);
  scale = Math.max(scale, QA_THRESHOLDS.minScaleFactor);

  const scaledWidth = Math.round(sourceSize.width * scale);
  const scaledHeight = Math.round(sourceSize.height * scale);

  // Center within target
  const offsetX = Math.round((targetSize.width - scaledWidth) / 2);
  const offsetY = Math.round((targetSize.height - scaledHeight) / 2);

  return {
    scale,
    width: scaledWidth,
    height: scaledHeight,
    offsetX,
    offsetY,
  };
}

/**
 * Get all panels in priority order with their grid positions
 *
 * @returns {Array} Array of { type, position, styleZone, minSize }
 */
export function getPanelsInPriorityOrder() {
  return PANEL_PRIORITY_ORDER.map((panelType) => ({
    type: panelType,
    position: GRID_12COL[panelType] || null,
    styleZone: getStyleZone(panelType),
    minSize: getMinimumSize(panelType),
    columnSpan: GRID_12COL[panelType]
      ? getColumnSpan(GRID_12COL[panelType])
      : 0,
  }));
}

/**
 * Check if all panels in the grid have valid (non-overlapping) positions
 *
 * @returns {Object} { valid: boolean, overlaps: Array }
 */
export function validateGridLayout() {
  const errors = [];
  const panels = Object.entries(GRID_12COL);

  for (let i = 0; i < panels.length; i++) {
    const [typeA, posA] = panels[i];

    // Check bounds
    if (
      posA.x < 0 ||
      posA.y < 0 ||
      posA.x + posA.width > 1 ||
      posA.y + posA.height > 1
    ) {
      errors.push(`Panel ${typeA} exceeds sheet bounds`);
    }

    // Check overlaps with other panels
    for (let j = i + 1; j < panels.length; j++) {
      const [typeB, posB] = panels[j];

      const overlaps = !(
        posA.x + posA.width <= posB.x ||
        posB.x + posB.width <= posA.x ||
        posA.y + posA.height <= posB.y ||
        posB.y + posB.height <= posA.y
      );

      if (overlaps) {
        errors.push(`Panels ${typeA} and ${typeB} overlap`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  SHEET,
  COLUMN_WIDTH,
  ROW_HEIGHTS,
  MINIMUM_SIZES,
  TEXT_SIZES,
  PANEL_PRIORITY_ORDER,
  STYLE_ZONES,
  GRID_12COL,
  FRAME_STYLE,
  CAPTION_STYLE,
  QA_THRESHOLDS,
  getStyleZone,
  toPixelRect,
  getColumnSpan,
  getMinimumSize,
  validatePanelSize,
  calculateScaleToFill,
  getPanelsInPriorityOrder,
  validateGridLayout,
};
