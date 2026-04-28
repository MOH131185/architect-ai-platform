/**
 * A1 Compose Core
 *
 * Canonical public compose-core module used by the live A1 compose route and
 * by browser/runtime ESM consumers. The CommonJS sibling `composeCore.cjs`
 * exists only as a compatibility mirror for CJS-only tooling and tests.
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
// Grid constants (inline to avoid ESM/CJS import issues in server.cjs)
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
// 12-Column Board Grid (technical-first SSOT for board-v2)
// Normalised 0-1 coordinates on an A1 landscape sheet.
// ---------------------------------------------------------------------------

export const GRID_12COL = {
  // Row 1 – Supporting visuals and data; hero is evidence, not the board anchor
  site_diagram: { x: 0.015, y: 0.015, width: 0.16, height: 0.205 },
  hero_3d: { x: 0.185, y: 0.015, width: 0.22, height: 0.205 },
  interior_3d: { x: 0.415, y: 0.015, width: 0.14, height: 0.097 },
  axonometric: { x: 0.415, y: 0.123, width: 0.14, height: 0.097 },
  material_palette: { x: 0.565, y: 0.015, width: 0.205, height: 0.205 },
  climate_card: { x: 0.78, y: 0.015, width: 0.205, height: 0.205 },

  // Row 2 – Floor plans (primary board evidence)
  floor_plan_ground: { x: 0.015, y: 0.235, width: 0.32, height: 0.29 },
  floor_plan_first: { x: 0.345, y: 0.235, width: 0.32, height: 0.29 },
  floor_plan_level2: { x: 0.675, y: 0.235, width: 0.31, height: 0.29 },

  // Row 3 – Elevations (secondary evidence band)
  elevation_north: { x: 0.015, y: 0.54, width: 0.235, height: 0.205 },
  elevation_south: { x: 0.26, y: 0.54, width: 0.235, height: 0.205 },
  elevation_east: { x: 0.505, y: 0.54, width: 0.235, height: 0.205 },
  elevation_west: { x: 0.75, y: 0.54, width: 0.235, height: 0.205 },

  // Row 4 – Sections + schedules/title strip
  section_AA: { x: 0.015, y: 0.76, width: 0.305, height: 0.225 },
  section_BB: { x: 0.33, y: 0.76, width: 0.305, height: 0.225 },
  schedules_notes: { x: 0.675, y: 0.76, width: 0.155, height: 0.225 },
  title_block: { x: 0.84, y: 0.76, width: 0.145, height: 0.225 },
};

// ---------------------------------------------------------------------------
// Presentation v3 (residential default, Phase B)
// 3-row presentation board:
//   Row 1 (top):    site plan | ground floor | first floor | N/S elevations stacked
//   Row 2 (middle): section A-A | section B-B | axonometric | E/W elevations stacked
//   Row 3 (bottom): exterior persp | interior persp | material palette | key notes | title block
// ---------------------------------------------------------------------------

export const GRID_PRESENTATION_V3 = {
  // Row 1 — site + plans + N/S elevations
  site_diagram: { x: 0.015, y: 0.015, width: 0.21, height: 0.305 },
  floor_plan_ground: { x: 0.235, y: 0.015, width: 0.21, height: 0.305 },
  floor_plan_first: { x: 0.455, y: 0.015, width: 0.21, height: 0.305 },
  elevation_north: { x: 0.675, y: 0.015, width: 0.31, height: 0.145 },
  elevation_south: { x: 0.675, y: 0.175, width: 0.31, height: 0.145 },

  // Row 2 — sections + axonometric + E/W elevations
  section_AA: { x: 0.015, y: 0.335, width: 0.21, height: 0.305 },
  section_BB: { x: 0.235, y: 0.335, width: 0.21, height: 0.305 },
  axonometric: { x: 0.455, y: 0.335, width: 0.21, height: 0.305 },
  elevation_east: { x: 0.675, y: 0.335, width: 0.31, height: 0.145 },
  elevation_west: { x: 0.675, y: 0.495, width: 0.31, height: 0.145 },

  // Row 3 — perspectives + material palette + key notes + title block
  hero_3d: { x: 0.015, y: 0.655, width: 0.215, height: 0.33 },
  interior_3d: { x: 0.245, y: 0.655, width: 0.215, height: 0.33 },
  material_palette: { x: 0.475, y: 0.655, width: 0.18, height: 0.33 },
  schedules_notes: { x: 0.665, y: 0.655, width: 0.13, height: 0.33 },
  title_block: { x: 0.805, y: 0.655, width: 0.18, height: 0.33 },

  // floor_plan_level2 is intentionally omitted from the base spec; it is
  // synthesised by resolveLayout's applyFloorRow only when target_storeys===3.
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

  const effectiveWidth = slot.width * WORKING_WIDTH;
  const effectiveHeight = Math.max(
    10,
    slot.height * WORKING_HEIGHT - LABEL_HEIGHT - LABEL_PADDING,
  );
  const aspect = effectiveWidth / effectiveHeight; // >1 landscape, <1 portrait

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
  // Phase B: presentation-v3 is the residential default.
  presentation_v3: "presentation-v3",
  "presentation-v3": "presentation-v3",
  "presentation-board": "presentation-v3",
  presentation: "presentation-v3",
  residential: "presentation-v3",
  "residential-presentation": "presentation-v3",
};

/**
 * Normalise a layout template identifier to a supported value.
 *
 * @param {string} raw – layoutTemplate or layoutConfig value
 * @returns {string} – one of "board-v2", "presentation-v3", "legacy", or the
 *                     raw value lowered
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
//
// FLOOR_ROW_DESCRIPTORS owns the per-template floor-row geometry so
// resolveLayout can re-tile floor plans for 1/2/3 storeys without
// hardcoding board-v2 coordinates. board-v2's descriptor mirrors the
// previous inline values exactly so its golden output stays identical.
// ---------------------------------------------------------------------------

const FLOOR_ROW_DESCRIPTORS = {
  "board-v2": {
    y: 0.235,
    height: 0.29,
    one: { x: 0.015, width: 0.97 },
    two: [
      { x: 0.015, width: 0.475 },
      { x: 0.5, width: 0.485 },
    ],
    // 3-floor row uses GRID_12COL's existing per-floor slots; no override.
  },
  "presentation-v3": {
    y: 0.015,
    height: 0.305,
    one: { x: 0.235, width: 0.43 },
    two: [
      { x: 0.235, width: 0.21 },
      { x: 0.455, width: 0.21 },
    ],
    three: [
      { x: 0.235, width: 0.14 },
      { x: 0.385, width: 0.14 },
      { x: 0.535, width: 0.14 },
    ],
  },
};

function applyFloorRow(base, descriptor, floorCount) {
  if (!descriptor) return;
  const apply = (key, slot, { create = false } = {}) => {
    if (!slot) return;
    if (!base[key] && !create) return;
    base[key] = {
      x: slot.x,
      y: descriptor.y,
      width: slot.width,
      height: descriptor.height,
    };
  };
  if (floorCount === 1 && descriptor.one) {
    apply("floor_plan_ground", descriptor.one);
  } else if (floorCount === 2 && descriptor.two) {
    apply("floor_plan_ground", descriptor.two[0]);
    apply("floor_plan_first", descriptor.two[1]);
  } else if (floorCount === 3 && descriptor.three) {
    apply("floor_plan_ground", descriptor.three[0]);
    apply("floor_plan_first", descriptor.three[1]);
    // presentation-v3 omits floor_plan_level2 from the base spec; synthesise it.
    apply("floor_plan_level2", descriptor.three[2], { create: true });
  }
}

/**
 * Resolve the normalised grid spec for composition.
 *
 * @param {Object}  opts
 * @param {string}  [opts.layoutTemplate] – raw template name (will be normalised)
 * @param {string}  [opts.layoutConfig]   – alias accepted by server.cjs
 * @param {number}  [opts.floorCount=2]   – number of floors
 * @param {boolean} [opts.highRes=false]  – use print resolution
 * @returns {{ layout: Object, width: number, height: number, layoutTemplate: string }}
 */
export function resolveLayout(opts = {}) {
  const raw = opts.layoutTemplate || opts.layoutConfig || "board-v2";
  const layoutTemplate = normalizeLayoutTemplate(raw);
  const floorCount = Number.isFinite(opts.floorCount) ? opts.floorCount : 1;
  const highRes = opts.highRes === true;

  let base;
  if (layoutTemplate === "legacy") {
    base = { ...GRID_SPEC };
  } else if (layoutTemplate === "presentation-v3") {
    base = { ...GRID_PRESENTATION_V3 };
  } else {
    base = { ...GRID_12COL };
  }

  // Remove optional floor-plan slots before re-tiling.
  if (floorCount < 2) delete base.floor_plan_first;
  if (floorCount < 3) delete base.floor_plan_level2;

  // Re-tile remaining floor plan(s) per the active template's floor-row
  // descriptor. board-v2 keeps its previous coordinates byte-identically.
  applyFloorRow(base, FLOOR_ROW_DESCRIPTORS[layoutTemplate], floorCount);

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
 * Default minimum slot occupancy for QA gates.
 * Floor-plan slots become progressively wider when 1- and 2-floor boards
 * expand to fill removed plan columns, so the occupancy floor needs to scale
 * with slot aspect to avoid impossible contain-fit failures.
 */
export function getDefaultMinSlotOccupancy(panelType, slotAspect = 1) {
  const normalizedAspect =
    Number.isFinite(slotAspect) && slotAspect > 0
      ? Math.max(slotAspect, 1 / slotAspect)
      : 1;

  if (panelType.startsWith("floor_plan_")) {
    return Math.max(0.16, Math.min(0.52, 0.95 / normalizedAspect));
  }
  if (panelType.startsWith("section_")) {
    return 0.5;
  }
  if (panelType.startsWith("elevation_")) {
    return 0.46;
  }
  return 0.4;
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
  "section_AA",
  "section_BB",
]);

/** Panels that may be replaced with placeholders. */
export const LENIENT_PANELS = new Set([
  "interior_3d",
  "axonometric",
  "site_diagram",
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
