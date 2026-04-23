/**
 * A1 Compose Core – CommonJS compatibility mirror
 *
 * `composeCore.js` is the canonical public module used by the live compose
 * route and ESM callers. This file exists only for CommonJS-only tooling and
 * tests that still need synchronous access to the compose-core surface.
 *
 * Keep the exported behavior compatible with composeCore.js, but do not treat
 * this file as an independent source of truth.
 *
 * @module services/a1/composeCore (CJS)
 */

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------

const A1_WIDTH = 9933;
const A1_HEIGHT = 7016;
const WORKING_WIDTH = 1792;
const WORKING_HEIGHT = 1269;

const LABEL_HEIGHT = 26;
const LABEL_PADDING = 6;
const FRAME_STROKE_WIDTH = 3;
const FRAME_STROKE_COLOR = "#d1d5db";

// ---------------------------------------------------------------------------
// 12-Column Board Grid (board-v2 – SSOT)
// ---------------------------------------------------------------------------

const GRID_12COL = {
  // Row 1 – Supporting visuals and data; hero is evidence, not the board anchor
  site_diagram:      { x: 0.015, y: 0.015, width: 0.16,  height: 0.205 },
  hero_3d:           { x: 0.185, y: 0.015, width: 0.22,  height: 0.205 },
  interior_3d:       { x: 0.415, y: 0.015, width: 0.14,  height: 0.097 },
  axonometric:       { x: 0.415, y: 0.123, width: 0.14,  height: 0.097 },
  material_palette:  { x: 0.565, y: 0.015, width: 0.205, height: 0.205 },
  climate_card:      { x: 0.78,  y: 0.015, width: 0.205, height: 0.205 },
  // Row 2 – Floor plans (primary board evidence)
  floor_plan_ground: { x: 0.015, y: 0.235, width: 0.32,  height: 0.29  },
  floor_plan_first:  { x: 0.345, y: 0.235, width: 0.32,  height: 0.29  },
  floor_plan_level2: { x: 0.675, y: 0.235, width: 0.31,  height: 0.29  },
  // Row 3 – Elevations (secondary evidence band)
  elevation_north:   { x: 0.015, y: 0.54,  width: 0.235, height: 0.205 },
  elevation_south:   { x: 0.26,  y: 0.54,  width: 0.235, height: 0.205 },
  elevation_east:    { x: 0.505, y: 0.54,  width: 0.235, height: 0.205 },
  elevation_west:    { x: 0.75,  y: 0.54,  width: 0.235, height: 0.205 },
  // Row 4 – Sections + schedules/title strip
  section_AA:        { x: 0.015, y: 0.76,  width: 0.305, height: 0.225 },
  section_BB:        { x: 0.33,  y: 0.76,  width: 0.305, height: 0.225 },
  schedules_notes:   { x: 0.675, y: 0.76,  width: 0.155, height: 0.225 },
  title_block:       { x: 0.84,  y: 0.76,  width: 0.145, height: 0.225 },
};

// Legacy grid
const GRID_SPEC = {
  site_diagram:      { x: 0.02, y: 0.02, width: 0.22, height: 0.22 },
  hero_3d:           { x: 0.26, y: 0.02, width: 0.34, height: 0.22 },
  interior_3d:       { x: 0.62, y: 0.02, width: 0.24, height: 0.11 },
  axonometric:       { x: 0.62, y: 0.13, width: 0.24, height: 0.11 },
  material_palette:  { x: 0.88, y: 0.02, width: 0.1,  height: 0.1  },
  climate_card:      { x: 0.88, y: 0.13, width: 0.1,  height: 0.11 },
  floor_plan_ground: { x: 0.02, y: 0.26, width: 0.32, height: 0.22 },
  floor_plan_first:  { x: 0.36, y: 0.26, width: 0.32, height: 0.22 },
  floor_plan_level2: { x: 0.7,  y: 0.26, width: 0.28, height: 0.22 },
  elevation_north:   { x: 0.02, y: 0.5,  width: 0.23, height: 0.18 },
  elevation_south:   { x: 0.27, y: 0.5,  width: 0.23, height: 0.18 },
  elevation_east:    { x: 0.52, y: 0.5,  width: 0.23, height: 0.18 },
  elevation_west:    { x: 0.77, y: 0.5,  width: 0.21, height: 0.18 },
  section_AA:        { x: 0.02, y: 0.7,  width: 0.32, height: 0.26 },
  section_BB:        { x: 0.36, y: 0.7,  width: 0.32, height: 0.26 },
  schedules_notes:   { x: 0.7,  y: 0.7,  width: 0.14, height: 0.26 },
  title_block:       { x: 0.85, y: 0.7,  width: 0.13, height: 0.26 },
};

// ---------------------------------------------------------------------------
// Labels / annotations
// ---------------------------------------------------------------------------

const PANEL_LABELS = {
  hero_3d: "HERO 3D VIEW", interior_3d: "INTERIOR 3D VIEW",
  axonometric: "AXONOMETRIC VIEW", site_diagram: "SITE DIAGRAM",
  floor_plan_ground: "GROUND FLOOR PLAN", floor_plan_first: "FIRST FLOOR PLAN",
  floor_plan_level2: "SECOND FLOOR PLAN",
  elevation_north: "NORTH ELEVATION", elevation_south: "SOUTH ELEVATION",
  elevation_east: "EAST ELEVATION", elevation_west: "WEST ELEVATION",
  section_AA: "SECTION A-A", section_BB: "SECTION B-B",
  schedules_notes: "SCHEDULES & NOTES", title_block: "PROJECT INFO",
  material_palette: "MATERIAL PALETTE", climate_card: "CLIMATE ANALYSIS",
};

const DRAWING_NUMBERS = {
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

const PANEL_SCALES = {
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

const PANEL_FIT_POLICY = {
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

const COVER_FIT_PANELS = Object.entries(PANEL_FIT_POLICY)
  .filter(([, mode]) => mode === "cover")
  .map(([key]) => key);

function roundTo(value, step) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 64;
  return Math.round(value / safeStep) * safeStep;
}

function getSlotDimensions(panelType, opts) {
  opts = opts || {};
  const baseEdge = opts.baseEdge || 1408;
  const layoutTemplate = opts.layoutTemplate || "board-v2";
  const grid = layoutTemplate === "legacy" ? GRID_SPEC : GRID_12COL;
  const slot = grid[panelType];

  if (!slot) {
    return { width: 1024, height: 1024, aspect: 1 };
  }

  const aspect = slot.width / slot.height;
  let width;
  let height;

  if (aspect >= 1) {
    width = roundTo(Math.min(baseEdge, 1408), 64);
    height = roundTo(width / aspect, 64);
  } else {
    height = roundTo(Math.min(baseEdge, 1408), 64);
    width = roundTo(height * aspect, 64);
  }

  width = Math.max(256, Math.min(1440, width));
  height = Math.max(256, Math.min(1440, height));

  return { width, height, aspect };
}

// ---------------------------------------------------------------------------
// Canonical key normalisation
// ---------------------------------------------------------------------------

const CANONICAL_KEY_MAP = {
  plan_ground: "floor_plan_ground", plan_upper: "floor_plan_first",
  plan_first: "floor_plan_first", plan_level2: "floor_plan_level2",
  elev_north: "elevation_north", elev_south: "elevation_south",
  elev_east: "elevation_east", elev_west: "elevation_west",
  sect_long: "section_AA", sect_trans: "section_BB",
  v_exterior: "hero_3d", v_interior: "interior_3d", v_axon: "axonometric",
  site: "site_diagram", ground_floor: "floor_plan_ground",
  first_floor: "floor_plan_first", second_floor: "floor_plan_level2",
  site_plan: "site_diagram", materials: "material_palette",
  climate: "climate_card", schedules: "schedules_notes", notes: "schedules_notes",
  exterior_front_3d: "hero_3d", floor_plan_upper: "floor_plan_first",
};

function normalizeKey(key) {
  if (!key) return key;
  const lower = String(key).trim().toLowerCase();
  if (GRID_12COL[lower] || GRID_SPEC[lower]) return lower;
  if (lower === "section_aa") return "section_AA";
  if (lower === "section_bb") return "section_BB";
  return CANONICAL_KEY_MAP[lower] || CANONICAL_KEY_MAP[key] || key;
}

// ---------------------------------------------------------------------------
// Layout template normalisation
// ---------------------------------------------------------------------------

const LAYOUT_ALIASES = {
  "uk-riba-standard": "board-v2", "uk-riba": "board-v2",
  "riba": "board-v2", "board_v2": "board-v2", "default": "board-v2", "": "board-v2",
};

function normalizeLayoutTemplate(raw) {
  const trimmed = String(raw || "").trim().toLowerCase();
  if (LAYOUT_ALIASES[trimmed] !== undefined) return LAYOUT_ALIASES[trimmed];
  if (["grid-spec", "grid_spec", "v1", "legacy"].includes(trimmed)) return "legacy";
  return trimmed || "board-v2";
}

// ---------------------------------------------------------------------------
// Grid resolution
// ---------------------------------------------------------------------------

function resolveLayout(opts) {
  opts = opts || {};
  const raw = opts.layoutTemplate || opts.layoutConfig || "board-v2";
  const layoutTemplate = normalizeLayoutTemplate(raw);
  const floorCount = Number.isFinite(opts.floorCount) ? opts.floorCount : 1;
  const highRes = opts.highRes === true;

  const base = layoutTemplate === "legacy"
    ? Object.assign({}, GRID_SPEC)
    : Object.assign({}, GRID_12COL);

  if (floorCount < 2) delete base.floor_plan_first;
  if (floorCount < 3) delete base.floor_plan_level2;

  // Expand remaining floor plan(s) to fill the row
  if (floorCount === 1 && base.floor_plan_ground) {
    base.floor_plan_ground = { x: 0.015, y: 0.235, width: 0.97, height: 0.29 };
  } else if (floorCount === 2 && base.floor_plan_ground && base.floor_plan_first) {
    base.floor_plan_ground = { x: 0.015, y: 0.235, width: 0.475, height: 0.29 };
    base.floor_plan_first  = { x: 0.50,  y: 0.235, width: 0.485, height: 0.29 };
  }

  return {
    layout: base,
    width:  highRes ? A1_WIDTH  : WORKING_WIDTH,
    height: highRes ? A1_HEIGHT : WORKING_HEIGHT,
    layoutTemplate: layoutTemplate,
  };
}

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------

function toPixelRect(entry, sheetWidth, sheetHeight) {
  return {
    x:      Math.round(entry.x      * sheetWidth),
    y:      Math.round(entry.y      * sheetHeight),
    width:  Math.round(entry.width  * sheetWidth),
    height: Math.round(entry.height * sheetHeight),
  };
}

function getPanelFitMode(panelType) {
  return PANEL_FIT_POLICY[panelType] || "contain";
}

function getDefaultMinSlotOccupancy(panelType, slotAspect) {
  const normalizedAspect =
    Number.isFinite(slotAspect) && slotAspect > 0
      ? Math.max(slotAspect, 1 / slotAspect)
      : 1;

  if (panelType.startsWith("floor_plan_")) {
    return Math.max(0.22, Math.min(0.58, 1.32 / normalizedAspect));
  }
  if (panelType.startsWith("section_")) {
    return 0.5;
  }
  if (panelType.startsWith("elevation_")) {
    return 0.46;
  }
  return 0.4;
}

function getPanelAnnotation(panelType) {
  const label = PANEL_LABELS[panelType] || String(panelType || "").toUpperCase();
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

const STRICT_PANELS = new Set([
  "hero_3d", "floor_plan_ground", "floor_plan_first", "floor_plan_level2",
  "elevation_north", "elevation_south", "elevation_east", "elevation_west",
  "section_AA", "section_BB",
]);

const LENIENT_PANELS = new Set([
  "interior_3d",
  "axonometric",
  "site_diagram",
  "schedules_notes",
  "material_palette",
  "climate_card",
  "title_block",
]);

function isStrictPanel(panelType) {
  return STRICT_PANELS.has(normalizeKey(panelType));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  A1_WIDTH, A1_HEIGHT, WORKING_WIDTH, WORKING_HEIGHT,
  LABEL_HEIGHT, LABEL_PADDING, FRAME_STROKE_WIDTH, FRAME_STROKE_COLOR,
  GRID_12COL, GRID_SPEC, PANEL_LABELS, DRAWING_NUMBERS, PANEL_SCALES,
  PANEL_FIT_POLICY, COVER_FIT_PANELS,
  normalizeKey, normalizeLayoutTemplate, resolveLayout,
  toPixelRect, getPanelFitMode, getDefaultMinSlotOccupancy, getPanelAnnotation,
  getSlotDimensions, isStrictPanel, STRICT_PANELS, LENIENT_PANELS,
};
