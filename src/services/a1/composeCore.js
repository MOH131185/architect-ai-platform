/**
 * A1 Compose Core
 *
 * Shared composition logic for both local dev (server.js) and
 * Vercel serverless (api/a1/compose.js).
 *
 * Single source of truth for:
 *  - Layout template normalization (uk-riba-standard -> board-v2)
 *  - Grid spec resolution
 *  - Panel key canonicalization (plan_ground -> floor_plan_ground)
 *  - Pixel coordinate conversion
 *  - Fit mode + panel annotation helpers
 *
 * @module services/a1/composeCore
 */

// ---------------------------------------------------------------------------
// Grid constants (inline to avoid ESM/CJS import issues in server.js)
// ---------------------------------------------------------------------------

/** A1 landscape at 300 DPI */
export const A1_WIDTH = 9933;
export const A1_HEIGHT = 7016;

/** Working (preview) resolution */
export const WORKING_WIDTH = 1792;
export const WORKING_HEIGHT = 1269;

/** Label band height (pixels at working res) */
export const LABEL_HEIGHT = 26;
export const LABEL_PADDING = 6;
export const FRAME_STROKE_WIDTH = 3;
export const FRAME_STROKE_COLOR = "#d1d5db";

// ---------------------------------------------------------------------------
// 12-Column Board Grid (competition aesthetic – SSOT for board-v2)
// Normalised 0-1 coordinates on an A1 landscape sheet.
// ---------------------------------------------------------------------------

export const GRID_12COL = {
  // Row 1 – Competition aesthetic
  site_diagram: { x: 0.015, y: 0.015, width: 0.22, height: 0.265 },
  hero_3d: { x: 0.245, y: 0.015, width: 0.42, height: 0.265 },
  interior_3d: { x: 0.675, y: 0.015, width: 0.185, height: 0.125 },
  axonometric: { x: 0.675, y: 0.15, width: 0.185, height: 0.13 },
  material_palette: { x: 0.87, y: 0.015, width: 0.12, height: 0.18 },
  climate_card: { x: 0.87, y: 0.205, width: 0.12, height: 0.175 },

  // Row 2 – Floor plans
  floor_plan_ground: { x: 0.015, y: 0.295, width: 0.32, height: 0.225 },
  floor_plan_first: { x: 0.345, y: 0.295, width: 0.32, height: 0.225 },
  floor_plan_level2: { x: 0.675, y: 0.295, width: 0.31, height: 0.225 },

  // Row 3 – Elevations
  elevation_north: { x: 0.015, y: 0.535, width: 0.235, height: 0.205 },
  elevation_south: { x: 0.26, y: 0.535, width: 0.235, height: 0.205 },
  elevation_east: { x: 0.505, y: 0.535, width: 0.235, height: 0.205 },
  elevation_west: { x: 0.75, y: 0.535, width: 0.235, height: 0.205 },

  // Row 4 – Sections + info
  section_AA: { x: 0.015, y: 0.755, width: 0.32, height: 0.23 },
  section_BB: { x: 0.345, y: 0.755, width: 0.32, height: 0.23 },
  schedules_notes: { x: 0.675, y: 0.755, width: 0.155, height: 0.23 },
  title_block: { x: 0.84, y: 0.755, width: 0.145, height: 0.23 },
};

// Legacy 4-row grid (kept for backward-compat via layoutTemplate="legacy")
export const GRID_SPEC = {
  site_diagram: { x: 0.02, y: 0.02, width: 0.22, height: 0.22 },
  hero_3d: { x: 0.26, y: 0.02, width: 0.34, height: 0.22 },
  interior_3d: { x: 0.62, y: 0.02, width: 0.24, height: 0.11 },
  axonometric: { x: 0.62, y: 0.13, width: 0.24, height: 0.11 },
  material_palette: { x: 0.88, y: 0.02, width: 0.1, height: 0.1 },
  climate_card: { x: 0.88, y: 0.13, width: 0.1, height: 0.11 },
  floor_plan_ground: { x: 0.02, y: 0.26, width: 0.32, height: 0.22 },
  floor_plan_first: { x: 0.36, y: 0.26, width: 0.32, height: 0.22 },
  floor_plan_level2: { x: 0.7, y: 0.26, width: 0.28, height: 0.22 },
  elevation_north: { x: 0.02, y: 0.5, width: 0.23, height: 0.18 },
  elevation_south: { x: 0.27, y: 0.5, width: 0.23, height: 0.18 },
  elevation_east: { x: 0.52, y: 0.5, width: 0.23, height: 0.18 },
  elevation_west: { x: 0.77, y: 0.5, width: 0.21, height: 0.18 },
  section_AA: { x: 0.02, y: 0.7, width: 0.32, height: 0.26 },
  section_BB: { x: 0.36, y: 0.7, width: 0.32, height: 0.26 },
  schedules_notes: { x: 0.7, y: 0.7, width: 0.14, height: 0.26 },
  title_block: { x: 0.85, y: 0.7, width: 0.13, height: 0.26 },
};

// ---------------------------------------------------------------------------
// Panel labels / drawing numbers / scales (RIBA-style)
// ---------------------------------------------------------------------------

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
};

export const DRAWING_NUMBERS = {
  hero_3d: "3D-01",
  interior_3d: "3D-02",
  axonometric: "3D-03",
  site_diagram: "SP-01",
  floor_plan_ground: "GA-00-01",
  floor_plan_first: "GA-01-01",
  floor_plan_level2: "GA-02-01",
  elevation_north: "EL-N-01",
  elevation_south: "EL-S-01",
  elevation_east: "EL-E-01",
  elevation_west: "EL-W-01",
  section_AA: "SC-AA-01",
  section_BB: "SC-BB-01",
  schedules_notes: "SC-01",
  material_palette: "MP-01",
  climate_card: "AN-01",
  title_block: "A1-001",
};

export const PANEL_SCALES = {
  hero_3d: "NTS",
  interior_3d: "NTS",
  axonometric: "NTS",
  site_diagram: "1:500",
  floor_plan_ground: "1:100",
  floor_plan_first: "1:100",
  floor_plan_level2: "1:100",
  elevation_north: "1:100",
  elevation_south: "1:100",
  elevation_east: "1:100",
  elevation_west: "1:100",
  section_AA: "1:50",
  section_BB: "1:50",
  schedules_notes: "N/A",
  material_palette: "N/A",
  climate_card: "N/A",
  title_block: "N/A",
};

// ---------------------------------------------------------------------------
// Unified per-panel fit policy (SSOT – replaces COVER_FIT_PANELS + SCALE_TO_FILL_CONFIG)
// "cover"   = aspect-crop to fill slot (photorealistic panels)
// "contain" = letterbox inside slot, white margins (technical/data panels)
// ---------------------------------------------------------------------------

export const PANEL_FIT_POLICY = {
  hero_3d: "cover",
  interior_3d: "cover",
  site_diagram: "cover",
  axonometric: "contain",
  material_palette: "contain",
  climate_card: "contain",
  floor_plan_ground: "contain",
  floor_plan_first: "contain",
  floor_plan_level2: "contain",
  elevation_north: "contain",
  elevation_south: "contain",
  elevation_east: "contain",
  elevation_west: "contain",
  section_AA: "contain",
  section_BB: "contain",
  schedules_notes: "contain",
  title_block: "contain",
};

// Legacy alias (consumed by existing code that references COVER_FIT_PANELS)
export const COVER_FIT_PANELS = Object.entries(PANEL_FIT_POLICY)
  .filter(([, mode]) => mode === "cover")
  .map(([key]) => key);

// ---------------------------------------------------------------------------
// Slot-derived generation dimensions
// ---------------------------------------------------------------------------

/**
 * Round dimension to nearest multiple of `step` (model-safe rounding).
 * FLUX models work best with dimensions divisible by 64.
 * @param {number} value
 * @param {number} step – alignment quantum (default 64)
 * @returns {number}
 */
function roundTo(value, step = 64) {
  return Math.round(value / step) * step;
}

/**
 * Compute generation target width/height for a panel from its GRID_12COL slot.
 *
 * Uses the slot aspect ratio at a base generation resolution (long edge = `baseEdge`),
 * clamped to FLUX model-safe multiples of 64 and within Together.ai limits [256, 1440].
 *
 * @param {string} panelType – canonical panel key
 * @param {Object}  [opts]
 * @param {number}  [opts.baseEdge=1408] – target long-edge pixel size (must be ≤1408 and divisible by 64)
 * @param {string}  [opts.layoutTemplate="board-v2"]
 * @returns {{ width: number, height: number, aspect: number }}
 */
export function getSlotDimensions(panelType, opts = {}) {
  const { baseEdge = 1408, layoutTemplate = "board-v2" } = opts;
  const grid = layoutTemplate === "legacy" ? GRID_SPEC : GRID_12COL;
  const slot = grid[panelType];

  if (!slot) {
    // Unknown panel – return safe square
    return { width: 1024, height: 1024, aspect: 1 };
  }

  const aspect = slot.width / slot.height; // >1 landscape, <1 portrait

  let w, h;
  if (aspect >= 1) {
    w = baseEdge;
    h = Math.round(baseEdge / aspect);
  } else {
    h = baseEdge;
    w = Math.round(baseEdge * aspect);
  }

  // Model-safe rounding: multiples of 64, within Together.ai range [256, 1408].
  // 1408 = 22 * 64 is the largest multiple of 64 that fits within the 1440 API limit.
  const MAX_EDGE = 1408; // 22 * 64
  const MIN_EDGE = 256; //  4 * 64
  w = Math.max(MIN_EDGE, Math.min(MAX_EDGE, roundTo(w, 64)));
  h = Math.max(MIN_EDGE, Math.min(MAX_EDGE, roundTo(h, 64)));

  return { width: w, height: h, aspect };
}

// ---------------------------------------------------------------------------
// Canonical panel key normalisation
// Maps any alias/short-key to the canonical key used by GRID_SPEC / GRID_12COL.
// ---------------------------------------------------------------------------

const CANONICAL_KEY_MAP = {
  // Short keys from panelOrchestrator
  plan_ground: "floor_plan_ground",
  plan_upper: "floor_plan_first",
  plan_first: "floor_plan_first",
  plan_level2: "floor_plan_level2",
  elev_north: "elevation_north",
  elev_south: "elevation_south",
  elev_east: "elevation_east",
  elev_west: "elevation_west",
  sect_long: "section_AA",
  sect_trans: "section_BB",
  v_exterior: "hero_3d",
  v_interior: "interior_3d",
  v_axon: "axonometric",
  site: "site_diagram",

  // Other common aliases
  ground_floor: "floor_plan_ground",
  first_floor: "floor_plan_first",
  second_floor: "floor_plan_level2",
  site_plan: "site_diagram",
  materials: "material_palette",
  climate: "climate_card",
  schedules: "schedules_notes",
  notes: "schedules_notes",

  // Legacy image-generation types used by panelOrchestrator PANEL_DEFINITIONS
  exterior_front_3d: "hero_3d",
  floor_plan_upper: "floor_plan_first",
};

/**
 * Normalise any panel key/type to its canonical GRID_SPEC key.
 *
 * @param {string} key – raw panel key/type
 * @returns {string} canonical key (unchanged if already canonical or unknown)
 */
export function normalizeKey(key) {
  if (!key) return key;
  const lower = String(key).trim().toLowerCase();
  // Already canonical?
  if (GRID_12COL[lower] || GRID_SPEC[lower]) return lower;
  // Handle section_AA / section_BB casing
  if (lower === "section_aa") return "section_AA";
  if (lower === "section_bb") return "section_BB";
  return CANONICAL_KEY_MAP[lower] || CANONICAL_KEY_MAP[key] || key;
}

// ---------------------------------------------------------------------------
// Layout template normalization
// ---------------------------------------------------------------------------

const LAYOUT_ALIASES = {
  "uk-riba-standard": "board-v2",
  "uk-riba": "board-v2",
  riba: "board-v2",
  board_v2: "board-v2",
  default: "board-v2",
  "": "board-v2",
};

/**
 * Normalise a layout template identifier to a supported value.
 *
 * @param {string} raw – layoutTemplate or layoutConfig value
 * @returns {string} – one of "board-v2", "legacy", or the raw value lowered
 */
export function normalizeLayoutTemplate(raw) {
  const trimmed = String(raw || "")
    .trim()
    .toLowerCase();
  if (LAYOUT_ALIASES[trimmed] !== undefined) return LAYOUT_ALIASES[trimmed];
  if (
    trimmed === "grid-spec" ||
    trimmed === "grid_spec" ||
    trimmed === "v1" ||
    trimmed === "legacy"
  ) {
    return "legacy";
  }
  return trimmed || "board-v2";
}

// ---------------------------------------------------------------------------
// Grid-spec resolution (combines template + floor count)
// ---------------------------------------------------------------------------

/**
 * Resolve the normalised grid spec for composition.
 *
 * @param {Object}  opts
 * @param {string}  [opts.layoutTemplate] – raw template name (will be normalised)
 * @param {string}  [opts.layoutConfig]   – alias accepted by server.js
 * @param {number}  [opts.floorCount=2]   – number of floors
 * @param {boolean} [opts.highRes=false]  – use print resolution
 * @returns {{ layout: Object, width: number, height: number, layoutTemplate: string }}
 */
export function resolveLayout(opts = {}) {
  const raw = opts.layoutTemplate || opts.layoutConfig || "board-v2";
  const layoutTemplate = normalizeLayoutTemplate(raw);
  const floorCount = Number.isFinite(opts.floorCount) ? opts.floorCount : 1;
  const highRes = opts.highRes === true;

  const base =
    layoutTemplate === "legacy" ? { ...GRID_SPEC } : { ...GRID_12COL };

  // Remove optional floor-plan slots
  if (floorCount < 2) delete base.floor_plan_first;
  if (floorCount < 3) delete base.floor_plan_level2;

  return {
    layout: base,
    width: highRes ? A1_WIDTH : WORKING_WIDTH,
    height: highRes ? A1_HEIGHT : WORKING_HEIGHT,
    layoutTemplate,
  };
}

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------

/**
 * Convert normalised {x,y,width,height} to pixel coordinates.
 */
export function toPixelRect(entry, sheetWidth, sheetHeight) {
  return {
    x: Math.round(entry.x * sheetWidth),
    y: Math.round(entry.y * sheetHeight),
    width: Math.round(entry.width * sheetWidth),
    height: Math.round(entry.height * sheetHeight),
  };
}

/**
 * Determine fit mode for a panel type (reads from PANEL_FIT_POLICY SSOT).
 * @returns {"cover"|"contain"}
 */
export function getPanelFitMode(panelType) {
  return PANEL_FIT_POLICY[panelType] || "contain";
}

/**
 * Get RIBA-style annotation for a panel.
 */
export function getPanelAnnotation(panelType) {
  const label =
    PANEL_LABELS[panelType] || String(panelType || "").toUpperCase();
  const drawingNumber = DRAWING_NUMBERS[panelType] || "";
  const scale = PANEL_SCALES[panelType] || "NTS";
  return {
    label,
    drawingNumber,
    scale,
    fullAnnotation: drawingNumber
      ? `${drawingNumber}  ${label}  SCALE: ${scale}`
      : `${label}  SCALE: ${scale}`,
  };
}

// ---------------------------------------------------------------------------
// Tiered failure policy
// ---------------------------------------------------------------------------

/** Panels that MUST succeed for composition to proceed. */
export const STRICT_PANELS = new Set([
  "hero_3d",
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
]);

/** Panels that may be replaced with placeholders. */
export const LENIENT_PANELS = new Set([
  "interior_3d",
  "axonometric",
  "site_diagram",
  "section_AA",
  "section_BB",
  "schedules_notes",
  "material_palette",
  "climate_card",
  "title_block",
]);

/**
 * Check whether a panel failure should block composition.
 *
 * @param {string} panelType – canonical panel key
 * @returns {boolean} true if failure should be fatal
 */
export function isStrictPanel(panelType) {
  return STRICT_PANELS.has(normalizeKey(panelType));
}

// ---------------------------------------------------------------------------
// Convenience re-export bundle (default export)
// ---------------------------------------------------------------------------

export default {
  // Dimensions
  A1_WIDTH,
  A1_HEIGHT,
  WORKING_WIDTH,
  WORKING_HEIGHT,
  LABEL_HEIGHT,
  LABEL_PADDING,
  FRAME_STROKE_WIDTH,
  FRAME_STROKE_COLOR,
  // Grids
  GRID_12COL,
  GRID_SPEC,
  // Labels / annotations
  PANEL_LABELS,
  DRAWING_NUMBERS,
  PANEL_SCALES,
  COVER_FIT_PANELS,
  PANEL_FIT_POLICY,
  // Functions
  normalizeKey,
  normalizeLayoutTemplate,
  resolveLayout,
  toPixelRect,
  getPanelFitMode,
  getPanelAnnotation,
  getSlotDimensions,
  isStrictPanel,
  STRICT_PANELS,
  LENIENT_PANELS,
};
