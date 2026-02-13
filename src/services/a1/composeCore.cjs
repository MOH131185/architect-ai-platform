/**
 * A1 Compose Core – CommonJS wrapper
 *
 * Mirrors the ESM composeCore.js for use in server.js (which is CommonJS).
 * If you change composeCore.js, keep this file in sync.
 *
 * @module services/a1/composeCore (CJS)
 */

"use strict";

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
  site_diagram:      { x: 0.015, y: 0.015, width: 0.22,  height: 0.265 },
  hero_3d:           { x: 0.245, y: 0.015, width: 0.42,  height: 0.265 },
  interior_3d:       { x: 0.675, y: 0.015, width: 0.185, height: 0.125 },
  axonometric:       { x: 0.675, y: 0.15,  width: 0.185, height: 0.13  },
  material_palette:  { x: 0.87,  y: 0.015, width: 0.12,  height: 0.18  },
  climate_card:      { x: 0.87,  y: 0.205, width: 0.12,  height: 0.175 },
  floor_plan_ground: { x: 0.015, y: 0.295, width: 0.32,  height: 0.225 },
  floor_plan_first:  { x: 0.345, y: 0.295, width: 0.32,  height: 0.225 },
  floor_plan_level2: { x: 0.675, y: 0.295, width: 0.31,  height: 0.225 },
  elevation_north:   { x: 0.015, y: 0.535, width: 0.235, height: 0.205 },
  elevation_south:   { x: 0.26,  y: 0.535, width: 0.235, height: 0.205 },
  elevation_east:    { x: 0.505, y: 0.535, width: 0.235, height: 0.205 },
  elevation_west:    { x: 0.75,  y: 0.535, width: 0.235, height: 0.205 },
  section_AA:        { x: 0.015, y: 0.755, width: 0.32,  height: 0.23  },
  section_BB:        { x: 0.345, y: 0.755, width: 0.32,  height: 0.23  },
  schedules_notes:   { x: 0.675, y: 0.755, width: 0.155, height: 0.23  },
  title_block:       { x: 0.84,  y: 0.755, width: 0.145, height: 0.23  },
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

const COVER_FIT_PANELS = ["hero_3d", "interior_3d", "site_diagram"];

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
  return COVER_FIT_PANELS.includes(panelType) ? "cover" : "contain";
}

function getPanelAnnotation(panelType) {
  const label = PANEL_LABELS[panelType] || String(panelType || "").toUpperCase();
  return { label };
}

// ---------------------------------------------------------------------------
// Tiered failure policy
// ---------------------------------------------------------------------------

const STRICT_PANELS = new Set([
  "hero_3d", "floor_plan_ground", "floor_plan_first", "floor_plan_level2",
  "elevation_north", "elevation_south", "elevation_east", "elevation_west",
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
  GRID_12COL, GRID_SPEC, PANEL_LABELS, COVER_FIT_PANELS,
  normalizeKey, normalizeLayoutTemplate, resolveLayout,
  toPixelRect, getPanelFitMode, getPanelAnnotation,
  isStrictPanel, STRICT_PANELS,
};
