/**
 * Canonical Geometry Pack Service
 *
 * Manages geometry packs for consistent technical drawing generation.
 */

/**
 * Error class for canonical pack errors
 */
export class CanonicalPackError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CanonicalPackError";
    this.code = code;
  }
}

/**
 * Error codes
 */
export const ERROR_CODES = {
  PACK_NOT_FOUND: "PACK_NOT_FOUND",
  INVALID_PACK: "INVALID_PACK",
  BUILD_FAILED: "BUILD_FAILED",
};

/**
 * Canonical panel types that require geometry
 */
export const CANONICAL_PANEL_TYPES = [
  "floor_plan_gf",
  "floor_plan_ff",
  "elevation_n",
  "elevation_s",
  "elevation_e",
  "elevation_w",
  "section_aa",
  "section_bb",
];

// In-memory pack storage
let currentPack = null;

/**
 * Build canonical pack (geometry pack)
 * @param {Object} designState - Canonical design state
 * @returns {Promise<Object>} Geometry pack
 */
export async function buildCanonicalPack(designState) {
  console.log("[CanonicalGeometryPackService] buildCanonicalPack (stub)");
  currentPack = {
    id: `geom_${Date.now()}`,
    timestamp: new Date().toISOString(),
    geometry: designState?.geometry || {},
    levels: designState?.program?.levels || [],
    controls: {},
  };
  return currentPack;
}

/**
 * Alias for buildCanonicalPack
 */
export async function buildGeometryPack(designState) {
  return buildCanonicalPack(designState);
}

/**
 * Get current canonical pack
 * @returns {Object|null} Current pack
 */
export function getCanonicalPack() {
  return currentPack;
}

/**
 * Check if canonical pack exists
 * @param {Object} state - Design state (optional)
 * @returns {boolean}
 */
export function hasCanonicalPack(state) {
  return currentPack !== null || !!state?.geometryPack;
}

/**
 * Get control image for panel
 * @param {Object} pack - Geometry pack
 * @param {string} panelType - Panel type
 * @returns {string|null} Control image URL
 */
export function getControlForPanel(pack, panelType) {
  if (!pack?.controls) return null;
  return pack.controls[panelType] || null;
}

/**
 * Get init image parameters for img2img
 * @param {Object} pack - Geometry pack
 * @param {string} panelType - Panel type
 * @returns {Object} Init image params
 */
export function getInitImageParams(pack, panelType) {
  const controlImage = getControlForPanel(pack, panelType);
  return {
    initImage: controlImage,
    strength: 0.6,
    panelType,
  };
}

/**
 * Validate pack before generation
 * @param {Object} pack - Geometry pack
 * @param {string} panelType - Panel type
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateBeforeGeneration(pack, panelType) {
  if (!pack) {
    return { valid: false, errors: ["No geometry pack"] };
  }
  return { valid: true, errors: [] };
}

/**
 * Get geometry for floor plan
 * @param {Object} geometryPack - Geometry pack
 * @param {string} level - Floor level
 * @returns {Object|null} Floor geometry
 */
export function getFloorGeometry(geometryPack, level) {
  if (!geometryPack) return null;
  return geometryPack.geometry?.[level] || null;
}

/**
 * Get geometry for elevation
 * @param {Object} geometryPack - Geometry pack
 * @param {string} direction - Compass direction
 * @returns {Object|null} Elevation geometry
 */
export function getElevationGeometry(geometryPack, direction) {
  if (!geometryPack) return null;
  return geometryPack.geometry?.elevations?.[direction] || null;
}

/**
 * Validate geometry pack
 * @param {Object} geometryPack - Pack to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateGeometryPack(geometryPack) {
  if (!geometryPack) {
    return { valid: false, errors: ["No geometry pack"] };
  }
  return { valid: true, errors: [] };
}

export default {
  CanonicalPackError,
  ERROR_CODES,
  CANONICAL_PANEL_TYPES,
  buildCanonicalPack,
  buildGeometryPack,
  getCanonicalPack,
  hasCanonicalPack,
  getControlForPanel,
  getInitImageParams,
  validateBeforeGeneration,
  getFloorGeometry,
  getElevationGeometry,
  validateGeometryPack,
};
