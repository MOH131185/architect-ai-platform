/**
 * Canonical Render Pack Service
 *
 * Manages render packs for consistent image generation.
 */

// In-memory render pack storage
let currentRenderPack = null;

/**
 * Canonical panel types
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
  "hero_3d",
  "interior_3d",
  "axonometric",
];

/**
 * AI panel to canonical mapping
 */
export const AI_PANEL_TO_CANONICAL = {
  floor_plan_gf: "floor_plan_gf",
  floor_plan_ff: "floor_plan_ff",
  elevation_n: "elevation_n",
  elevation_s: "elevation_s",
  elevation_e: "elevation_e",
  elevation_w: "elevation_w",
  section_aa: "section_aa",
  section_bb: "section_bb",
  hero_3d: "hero_3d",
  interior_3d: "interior_3d",
  axonometric: "axonometric",
};

/**
 * Build render pack from design state
 * @param {Object} designState - Canonical design state
 * @param {Object} options - Build options
 * @returns {Promise<Object>} Render pack
 */
export async function buildRenderPack(designState, options = {}) {
  console.log("[CanonicalRenderPackService] buildRenderPack (stub)");
  currentRenderPack = {
    id: `render_${Date.now()}`,
    timestamp: new Date().toISOString(),
    designState,
    renders: {},
  };
  return currentRenderPack;
}

/**
 * Generate canonical render pack
 * @param {Object} designState - Design state
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Render pack
 */
export async function generateCanonicalRenderPack(designState, options = {}) {
  console.log(
    "[CanonicalRenderPackService] generateCanonicalRenderPack (stub)",
  );
  return buildRenderPack(designState, options);
}

/**
 * Get canonical render for panel
 * @param {Object} renderPack - Render pack
 * @param {string} panelType - Panel type
 * @returns {string|null} Render URL
 */
export function getCanonicalRenderForPanel(renderPack, panelType) {
  if (!renderPack?.renders) return null;
  return renderPack.renders[panelType] || null;
}

/**
 * Get init image parameters for img2img
 * @param {Object} renderPack - Render pack
 * @param {string} panelType - Panel type
 * @returns {Object} Init image params
 */
export function getInitImageParams(renderPack, panelType) {
  const render = getCanonicalRenderForPanel(renderPack, panelType);
  return {
    initImage: render,
    strength: 0.6,
    panelType,
  };
}

/**
 * Save render pack to debug folder
 * @param {Object} renderPack - Render pack
 * @param {string} outputDir - Output directory
 * @returns {Promise<void>}
 */
export async function saveCanonicalRenderPackToFolder(renderPack, outputDir) {
  console.log(
    "[CanonicalRenderPackService] saveCanonicalRenderPackToFolder (stub)",
  );
  // Stub - would save to filesystem in real implementation
}

/**
 * Get render pack debug report
 * @param {Object} renderPack - Render pack
 * @returns {Object} Debug report
 */
export function getCanonicalRenderPackDebugReport(renderPack) {
  return {
    hasRenders: !!(
      renderPack?.renders && Object.keys(renderPack.renders).length > 0
    ),
    renderCount: renderPack?.renders
      ? Object.keys(renderPack.renders).length
      : 0,
    panelTypes: CANONICAL_PANEL_TYPES,
    timestamp: Date.now(),
  };
}

/**
 * Check if render pack is available
 * @param {Object} state - Design state
 * @returns {boolean}
 */
export function hasCanonicalRenderPack(state) {
  return !!(state?.renderPack || state?.canonicalRenders);
}

/**
 * Get render from pack
 * @param {Object} renderPack - Render pack
 * @param {string} panelType - Panel type
 * @returns {string|null} Render URL
 */
export function getRenderFromPack(renderPack, panelType) {
  if (!renderPack || !panelType) return null;
  return renderPack.renders?.[panelType] || renderPack[panelType] || null;
}

/**
 * Validate render pack
 * @param {Object} renderPack - Pack to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateRenderPack(renderPack) {
  if (!renderPack) {
    return { valid: false, errors: ["No render pack"] };
  }
  return { valid: true, errors: [] };
}

/**
 * Merge render packs
 * @param {Object} basePack - Base pack
 * @param {Object} newRenders - New renders to add
 * @returns {Object} Merged pack
 */
export function mergeRenderPacks(basePack, newRenders) {
  return {
    ...basePack,
    renders: { ...basePack?.renders, ...newRenders },
  };
}

export default {
  CANONICAL_PANEL_TYPES,
  AI_PANEL_TO_CANONICAL,
  buildRenderPack,
  generateCanonicalRenderPack,
  getCanonicalRenderForPanel,
  getInitImageParams,
  saveCanonicalRenderPackToFolder,
  getCanonicalRenderPackDebugReport,
  hasCanonicalRenderPack,
  getRenderFromPack,
  validateRenderPack,
  mergeRenderPacks,
};
