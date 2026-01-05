/**
 * Canonical Pack Builder
 *
 * Builds complete canonical packs for A1 sheet generation.
 */

// In-memory pack storage
let currentPack = null;

/**
 * Pack status constants
 */
export const PACK_STATUS = {
  EMPTY: "EMPTY",
  PARTIAL: "PARTIAL",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR",
};

/**
 * Build complete canonical pack
 * @param {Object} designState - Design state
 * @param {Object} options - Build options
 * @returns {Promise<Object>} Canonical pack
 */
export async function buildCanonicalPack(designState, options = {}) {
  console.log("[CanonicalPackBuilder] buildCanonicalPack (stub)");
  currentPack = {
    id: `pack_${Date.now()}`,
    timestamp: new Date().toISOString(),
    designState,
    renders: {},
    geometry: {},
    metadata: options,
  };
  return currentPack;
}

/**
 * Check if canonical pack exists
 * @param {Object} state - Optional design state
 * @returns {boolean}
 */
export function hasCanonicalPack(state) {
  return currentPack !== null || !!state?.canonicalPack;
}

/**
 * Get current canonical pack
 * @returns {Object|null}
 */
export function getCanonicalPack() {
  return currentPack;
}

/**
 * Get canonical render for panel
 * @param {Object} pack - Canonical pack
 * @param {string} panelType - Panel type
 * @returns {string|null} Render URL
 */
export function getCanonicalRender(pack, panelType) {
  if (!pack?.renders) return null;
  return pack.renders[panelType] || null;
}

/**
 * Merge canonical packs
 * @param {Object} basePack - Base pack
 * @param {Object} updatePack - Update pack
 * @returns {Object} Merged pack
 */
export function mergeCanonicalPacks(basePack, updatePack) {
  return {
    ...basePack,
    ...updatePack,
    renders: { ...basePack?.renders, ...updatePack?.renders },
    geometry: { ...basePack?.geometry, ...updatePack?.geometry },
  };
}

/**
 * Get pack status
 * @param {Object} pack - Canonical pack
 * @returns {Object} Pack status
 */
export function getPackStatus(pack) {
  if (!pack) {
    return { complete: false, missing: ["pack"] };
  }
  return {
    complete: true,
    missing: [],
    renderCount: Object.keys(pack.renders || {}).length,
  };
}

export default {
  PACK_STATUS,
  buildCanonicalPack,
  hasCanonicalPack,
  getCanonicalPack,
  getCanonicalRender,
  mergeCanonicalPacks,
  getPackStatus,
};
