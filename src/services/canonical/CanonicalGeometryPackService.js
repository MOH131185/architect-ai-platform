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
// In-memory pack cache (keyed by design fingerprint/design id)
// ---------------------------------------------------------------------------

const canonicalPackStore = new Map();

function normalizeLookupKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 ? key : null;
}

function getLookupKeys(value) {
  const key = normalizeLookupKey(value);
  if (!key) return [];
  const lower = key.toLowerCase();
  return lower === key ? [key] : [key, lower];
}

function cachePack(pack, ...keys) {
  if (!pack) return;
  const candidates = [];
  for (const key of keys) {
    candidates.push(...getLookupKeys(key));
  }
  for (const key of candidates) {
    canonicalPackStore.set(key, pack);
  }
}

function normalizeBuildOptions(options = {}, legacyOptions = undefined) {
  const legacy =
    legacyOptions && typeof legacyOptions === "object" ? legacyOptions : {};

  // Backward compatibility:
  // buildCanonicalPack(cds, "designFingerprint", legacyThirdArgIgnored)
  if (typeof options === "string") {
    return { ...legacy, designFingerprint: options };
  }
  if (!options || typeof options !== "object") {
    return { ...legacy };
  }
  return { ...legacy, ...options };
}

// ---------------------------------------------------------------------------
// Panel type normalization (resolves section naming drift)
// ---------------------------------------------------------------------------

const PANEL_TYPE_ALIASES = {
  section_a_a: "section_AA",
  section_aa: "section_AA",
  section_a: "section_AA",
  section_b_b: "section_BB",
  section_bb: "section_BB",
  section_b: "section_BB",
};

function normalizePanelType(panelType) {
  if (!panelType) return panelType;
  return PANEL_TYPE_ALIASES[panelType] || panelType;
}

function getPanelLookupCandidates(panelType) {
  const normalized = normalizePanelType(panelType);
  if (normalized === "section_AA") {
    return ["section_AA", "section_a_a", "section_aa"];
  }
  if (normalized === "section_BB") {
    return ["section_BB", "section_b_b", "section_bb"];
  }
  return [normalized];
}

export function clearCanonicalPackCache(key) {
  if (!key) {
    canonicalPackStore.clear();
    return;
  }
  for (const lookupKey of getLookupKeys(key)) {
    canonicalPackStore.delete(lookupKey);
  }
}

export function registerCanonicalPack(pack, key) {
  if (!pack) return null;
  cachePack(pack, key, pack.designFingerprint, pack.designId);
  return pack;
}

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
  "section_AA",
  "section_BB",
  "hero_3d",
  "interior_3d",
  "axonometric",
];

// ---------------------------------------------------------------------------
// init_image strength policy per panel type
// ---------------------------------------------------------------------------

const STRENGTH_POLICY = {
  // TIER 1: Deterministic SVG (these values are only used as fallback
  // when threeTierPanelConsistency is disabled and panels go to FLUX)
  floor_plan_ground: 0.15,
  floor_plan_first: 0.15,
  floor_plan_level2: 0.15,
  floor_plan_level3: 0.15,
  elevation_north: 0.35,
  elevation_south: 0.35,
  elevation_east: 0.35,
  elevation_west: 0.35,
  section_AA: 0.15,
  section_BB: 0.15,
  // TIER 2: Geometry-locked FLUX (high strength → FLUX adds materials/lighting
  // but CANNOT change building shape). Together.ai inverts: imageStrength = 1.0 - strength
  hero_3d: 0.8, // FLUX gets 20% creative freedom (was 35% at 0.65)
  axonometric: 0.85, // FLUX gets 15% creative freedom (was 30% at 0.70)
  // TIER 3: Style-guided FLUX (moderate control — creative freedom for interiors)
  interior_3d: 0.6,
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
 * @param {number} [options.scale] - SVG scale (default 80 px/m)
 * @param {number} [options.width] - SVG width (default 1200)
 * @param {number} [options.height] - SVG height (default 900)
 * @returns {Object} Frozen canonical pack
 */
export function buildCanonicalPack(
  cds,
  options = {},
  legacyOptions = undefined,
) {
  if (!cds) {
    throw new CanonicalPackError(
      "CDS is required to build canonical pack",
      ERROR_CODES.MISSING_GEOMETRY,
    );
  }

  const normalizedOptions = normalizeBuildOptions(options, legacyOptions);
  const { scale = 80, width = 1200, height = 900 } = normalizedOptions;
  const designFingerprint =
    normalizeLookupKey(normalizedOptions.designFingerprint) ||
    normalizeLookupKey(cds.designFingerprint) ||
    normalizeLookupKey(cds.designId) ||
    normalizeLookupKey(cds.meta?.designFingerprint) ||
    null;

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
    longitudinal: "section_AA",
    transverse: "section_BB",
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
    designFingerprint,
    designId: normalizeLookupKey(cds.designId) || null,
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

  cachePack(
    pack,
    designFingerprint,
    cds.designId,
    cds.designFingerprint,
    normalizedOptions.designFingerprint,
  );

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
  if (!pack?.panels) return null;
  const candidates = getPanelLookupCandidates(panelType);
  for (const candidate of candidates) {
    const control = pack.panels[candidate]?.dataUrl;
    if (control) return control;
  }
  return null;
}

/**
 * Get init_image parameters for a panel, including data URL and strength.
 *
 * @param {Object} pack - Canonical pack
 * @param {string} panelType - Panel type
 * @returns {{ init_image: string, strength: number }|null}
 */
export function getInitImageParams(pack, panelType) {
  const normalizedType = normalizePanelType(panelType);
  const dataUrl = getControlForPanel(pack, normalizedType);
  if (!dataUrl) return null;
  const strength = STRENGTH_POLICY[normalizedType] ?? 0.5;
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
  if (typeof data === "string") {
    return !!getCanonicalPack(data);
  }
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
  if (typeof data === "string") {
    for (const key of getLookupKeys(data)) {
      const cachedPack = canonicalPackStore.get(key);
      if (cachedPack) return cachedPack;
    }
    return null;
  }
  if (data.status === "COMPLETE" && data.geometryHash) return data;
  if (data.canonicalPack?.status === "COMPLETE") return data.canonicalPack;
  if (data.designFingerprint) {
    for (const key of getLookupKeys(data.designFingerprint)) {
      const cachedPack = canonicalPackStore.get(key);
      if (cachedPack) return cachedPack;
    }
  }
  if (data.designId) {
    for (const key of getLookupKeys(data.designId)) {
      const cachedPack = canonicalPackStore.get(key);
      if (cachedPack) return cachedPack;
    }
  }
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
    "section_AA",
  ];
  for (const pt of required) {
    if (!getControlForPanel(pack, pt)) {
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
  registerCanonicalPack,
  clearCanonicalPackCache,
};
export default CanonicalGeometryPackServiceExports;
