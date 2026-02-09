/**
 * Canonical Geometry Pack Service
 *
 * Bridges BuildingModel + Projections2D into a frozen canonical pack
 * that provides geometry-authority init_images for every panel type.
 *
 * The canonical pack is the single source of truth for building geometry.
 * No panel may generate without receiving its canonical SVG as init_image
 * when the `requireCanonicalPack` feature flag is enabled.
 */

import { createBuildingModel } from "../../geometry/BuildingModel.js";
import {
  projectFloorPlan,
  projectElevation,
  projectSection,
} from "../../geometry/Projections2D.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CanonicalPackError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CanonicalPackError";
    this.code = code;
  }
}

export const ERROR_CODES = {
  MISSING_GEOMETRY: "MISSING_GEOMETRY",
  INVALID_PACK: "INVALID_PACK",
  BUILD_FAILED: "BUILD_FAILED",
  INCOMPLETE_PACK: "INCOMPLETE_PACK",
  HASH_MISMATCH: "HASH_MISMATCH",
};

// ---------------------------------------------------------------------------
// Panel types that receive canonical geometry control
// ---------------------------------------------------------------------------

export const CANONICAL_PANEL_TYPES = [
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "floor_plan_level3",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_a_a",
  "section_b_b",
  "hero_3d",
  "interior_3d",
  "axonometric",
];

// ---------------------------------------------------------------------------
// init_image strength policy per panel type
// ---------------------------------------------------------------------------

const STRENGTH_POLICY = {
  floor_plan_ground: 0.15,
  floor_plan_first: 0.15,
  floor_plan_level2: 0.15,
  floor_plan_level3: 0.15,
  elevation_north: 0.35,
  elevation_south: 0.35,
  elevation_east: 0.35,
  elevation_west: 0.35,
  section_a_a: 0.15,
  section_b_b: 0.15,
  hero_3d: 0.65,
  interior_3d: 0.6,
  axonometric: 0.7,
};

// ---------------------------------------------------------------------------
// SVG → data URL helper
// ---------------------------------------------------------------------------

function svgToDataUrl(svgString) {
  if (!svgString || typeof svgString !== "string") return null;
  try {
    const encoded =
      typeof btoa === "function"
        ? btoa(unescape(encodeURIComponent(svgString)))
        : Buffer.from(svgString, "utf-8").toString("base64");
    return `data:image/svg+xml;base64,${encoded}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build Canonical Pack
// ---------------------------------------------------------------------------

/**
 * Build a canonical geometry pack from a CanonicalDesignState (CDS).
 *
 * 1. Creates a BuildingModel from CDS
 * 2. Generates SVG projections (floor plans, elevations, sections)
 * 3. Converts SVGs to data URLs for use as init_image
 * 4. Computes a geometryHash over all SVG hashes
 * 5. Returns a frozen pack
 *
 * @param {Object} cds - CanonicalDesignState object (from types/ or validation/ builder)
 * @param {Object} [options]
 * @param {number} [options.scale] - SVG scale (default 50 px/m)
 * @param {number} [options.width] - SVG width (default 800)
 * @param {number} [options.height] - SVG height (default 600)
 * @returns {Object} Frozen canonical pack
 */
export function buildCanonicalPack(cds, options = {}) {
  if (!cds) {
    throw new CanonicalPackError(
      "CDS is required to build canonical pack",
      ERROR_CODES.MISSING_GEOMETRY,
    );
  }

  const { scale = 50, width = 800, height = 600 } = options;
  const svgOptions = {
    scale,
    width,
    height,
    showDimensions: true,
    showRoomLabels: true,
  };

  let model;
  try {
    model = createBuildingModel(cds);
  } catch (err) {
    throw new CanonicalPackError(
      `Failed to create BuildingModel: ${err.message}`,
      ERROR_CODES.BUILD_FAILED,
    );
  }

  // Validate model
  const validation = model.validate();
  if (!validation.valid && validation.errors.length > 0) {
    // Log but don't throw — allow partial packs
    console.warn(
      "[CanonicalPack] BuildingModel validation warnings:",
      validation.errors,
    );
  }

  const panels = {};
  const svgHashes = {};

  // --- Floor Plans ---
  const floorCount = model.floors?.length || 1;
  const FLOOR_TYPE_MAP = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "floor_plan_level3",
  ];

  for (let i = 0; i < floorCount && i < FLOOR_TYPE_MAP.length; i++) {
    const panelType = FLOOR_TYPE_MAP[i];
    try {
      const svg = projectFloorPlan(model, i, { ...svgOptions, height: 600 });
      const svgHash = computeCDSHashSync({ svg });
      const dataUrl = svgToDataUrl(svg);
      panels[panelType] = { dataUrl, svgString: svg, svgHash };
      svgHashes[panelType] = svgHash;
    } catch (err) {
      console.warn(
        `[CanonicalPack] Failed to project ${panelType}:`,
        err.message,
      );
    }
  }

  // --- Elevations ---
  const ELEVATION_MAP = {
    N: "elevation_north",
    S: "elevation_south",
    E: "elevation_east",
    W: "elevation_west",
  };
  for (const [orientation, panelType] of Object.entries(ELEVATION_MAP)) {
    try {
      const svg = projectElevation(model, orientation, {
        ...svgOptions,
        height: 500,
      });
      const svgHash = computeCDSHashSync({ svg });
      const dataUrl = svgToDataUrl(svg);
      panels[panelType] = { dataUrl, svgString: svg, svgHash };
      svgHashes[panelType] = svgHash;
    } catch (err) {
      console.warn(
        `[CanonicalPack] Failed to project ${panelType}:`,
        err.message,
      );
    }
  }

  // --- Sections ---
  const SECTION_MAP = {
    longitudinal: "section_a_a",
    transverse: "section_b_b",
  };
  for (const [sectionType, panelType] of Object.entries(SECTION_MAP)) {
    try {
      const svg = projectSection(model, sectionType, {
        ...svgOptions,
        height: 500,
      });
      const svgHash = computeCDSHashSync({ svg });
      const dataUrl = svgToDataUrl(svg);
      panels[panelType] = { dataUrl, svgString: svg, svgHash };
      svgHashes[panelType] = svgHash;
    } catch (err) {
      console.warn(
        `[CanonicalPack] Failed to project ${panelType}:`,
        err.message,
      );
    }
  }

  // --- Massing view (for hero_3d / axonometric) ---
  // Use south elevation as massing proxy for hero_3d since we need
  // a 2D representation. The strength policy (0.65) allows FLUX stylization.
  if (panels.elevation_south) {
    panels.hero_3d = { ...panels.elevation_south };
    svgHashes.hero_3d = svgHashes.elevation_south;
  }
  if (panels.elevation_south) {
    panels.axonometric = { ...panels.elevation_south };
    svgHashes.axonometric = svgHashes.elevation_south;
  }
  // Interior uses ground floor plan as geometry reference
  if (panels.floor_plan_ground) {
    panels.interior_3d = { ...panels.floor_plan_ground };
    svgHashes.interior_3d = svgHashes.floor_plan_ground;
  }

  // Compute overall geometry hash from all SVG hashes
  const geometryHash = computeCDSHashSync(svgHashes);
  const cdsHash = cds.hash || computeCDSHashSync(cds);

  // Dispose model to prevent memory leaks
  if (typeof model.dispose === "function") {
    model.dispose();
  }

  const pack = {
    panels,
    geometryHash,
    cdsHash,
    status: Object.keys(panels).length > 0 ? "COMPLETE" : "EMPTY",
    panelCount: Object.keys(panels).length,
    createdAt: new Date().toISOString(),
  };

  // Freeze the pack — it should never be mutated after construction
  Object.freeze(pack);
  Object.freeze(pack.panels);
  for (const p of Object.values(pack.panels)) {
    Object.freeze(p);
  }

  return pack;
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Get the canonical control data URL for a specific panel type.
 *
 * @param {Object} pack - Canonical pack from buildCanonicalPack()
 * @param {string} panelType - e.g. "floor_plan_ground", "elevation_north"
 * @returns {string|null} data URL or null if not available
 */
export function getControlForPanel(pack, panelType) {
  if (!pack?.panels?.[panelType]) return null;
  return pack.panels[panelType].dataUrl || null;
}

/**
 * Get init_image parameters for a panel, including data URL and strength.
 *
 * @param {Object} pack - Canonical pack
 * @param {string} panelType - Panel type
 * @returns {{ init_image: string, strength: number }|null}
 */
export function getInitImageParams(pack, panelType) {
  const dataUrl = getControlForPanel(pack, panelType);
  if (!dataUrl) return null;
  const strength = STRENGTH_POLICY[panelType] ?? 0.5;
  return { init_image: dataUrl, strength };
}

/**
 * Check whether a canonical pack exists and is complete.
 *
 * @param {Object} data - Object that may contain a canonical pack
 * @returns {boolean}
 */
export function hasCanonicalPack(data) {
  if (!data) return false;
  // Direct pack object
  if (data.status === "COMPLETE" && data.geometryHash && data.panels)
    return true;
  // Nested in data.canonicalPack
  if (data.canonicalPack?.status === "COMPLETE") return true;
  return false;
}

/**
 * Retrieve the canonical pack from various container shapes.
 *
 * @param {Object} data
 * @returns {Object|null}
 */
export function getCanonicalPack(data) {
  if (!data) return null;
  if (data.status === "COMPLETE" && data.geometryHash) return data;
  if (data.canonicalPack?.status === "COMPLETE") return data.canonicalPack;
  return null;
}

/**
 * Validate a canonical pack for completeness.
 *
 * @param {Object} pack
 * @returns {{ valid: boolean, missing: string[], errors: string[] }}
 */
export function validateControlPack(pack) {
  const errors = [];
  const missing = [];

  if (!pack) {
    errors.push("Pack is null");
    return { valid: false, missing, errors };
  }

  if (pack.status !== "COMPLETE") {
    errors.push(`Pack status is '${pack.status}', expected 'COMPLETE'`);
  }

  if (!pack.geometryHash) {
    errors.push("Pack is missing geometryHash");
  }

  // Check for minimum required panels: at least ground floor plan + 2 elevations + 1 section
  const required = [
    "floor_plan_ground",
    "elevation_north",
    "elevation_south",
    "section_a_a",
  ];
  for (const pt of required) {
    if (!pack.panels?.[pt]?.dataUrl) {
      missing.push(pt);
    }
  }

  if (missing.length > 0) {
    errors.push(`Missing required panels: ${missing.join(", ")}`);
  }

  return { valid: errors.length === 0, missing, errors };
}

// ---------------------------------------------------------------------------
// Default export (backward compat)
// ---------------------------------------------------------------------------

const CanonicalGeometryPackServiceExports = {
  CanonicalPackError,
  ERROR_CODES,
  CANONICAL_PANEL_TYPES,
  hasCanonicalPack,
  buildCanonicalPack,
  getCanonicalPack,
  getControlForPanel,
  getInitImageParams,
  validateControlPack,
};
export default CanonicalGeometryPackServiceExports;
