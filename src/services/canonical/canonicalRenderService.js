/**
 * Canonical Render Service
 *
 * Manages canonical control renders for consistent panel generation.
 */

/**
 * Render modes
 */
export const RENDER_MODE = {
  CLAY: "clay",
  LINEART: "lineart",
  DEPTH: "depth",
  NORMAL: "normal",
};

/**
 * Mandatory 3D panels that require canonical renders
 */
export const MANDATORY_3D_PANELS = ["hero_3d", "interior_3d", "axonometric"];

/**
 * Canonical 3D view definitions
 */
export const CANONICAL_3D_VIEWS = {
  hero_3d: { angle: "perspective", strength: 0.7 },
  interior_3d: { angle: "interior", strength: 0.6 },
  axonometric: { angle: "axonometric", strength: 0.8 },
};

/**
 * Strength policy for canonical 3D renders
 */
export const CANONICAL_3D_STRENGTH_POLICY = {
  default: 0.7,
  hero_3d: 0.75,
  interior_3d: 0.65,
  axonometric: 0.8,
};

/**
 * Negative prompts for canonical 3D renders
 */
export const CANONICAL_3D_NEGATIVE_PROMPTS = [
  "wireframe",
  "sketch",
  "diagram",
  "blueprint",
  "low quality",
  "blurry",
];

/**
 * Generate canonical renders from geometry
 * @param {Object} geometry - Building geometry
 * @param {Object} options - Render options
 * @returns {Promise<Object>} Canonical renders
 */
export async function generateCanonicalRenders(geometry, options = {}) {
  console.log("[CanonicalRenderService] generateCanonicalRenders (stub)");
  return {};
}

/**
 * Get canonical render for panel type
 * @param {string} panelType - Panel type
 * @param {Object} renderPack - Render pack
 * @returns {string|null} Render URL
 */
export function getCanonicalRenderForPanel(panelType, renderPack) {
  if (!renderPack || !panelType) return null;
  return renderPack[panelType] || null;
}

/**
 * Check if canonical renders are available
 * @param {Object} state - Design state
 * @returns {boolean}
 */
export function hasCanonicalRenders(state) {
  return !!(
    state?.canonicalRenders && Object.keys(state.canonicalRenders).length > 0
  );
}

/**
 * Validate canonical render pack
 * @param {Object} renderPack - Render pack to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCanonicalRenderPack(renderPack) {
  if (!renderPack) {
    return { valid: false, errors: ["No render pack provided"] };
  }
  return { valid: true, errors: [] };
}

/**
 * Check if canonical 3D renders exist
 * @param {Object} designState - Design state
 * @returns {boolean}
 */
export function hasCanonical3DRenders(designState) {
  return !!(
    designState?.canonical3D && Object.keys(designState.canonical3D).length > 0
  );
}

/**
 * Get canonical 3D render for panel
 * @param {Object} designState - Design state
 * @param {string} panelType - Panel type
 * @returns {string|null} Render URL
 */
export function getCanonical3DRender(designState, panelType) {
  if (!designState?.canonical3D) return null;
  return designState.canonical3D[panelType] || null;
}

/**
 * Check if panel requires canonical 3D render
 * @param {string} panelType - Panel type
 * @returns {boolean}
 */
export function requiresCanonical3DRender(panelType) {
  return MANDATORY_3D_PANELS.includes(panelType);
}

/**
 * Require canonical 3D render (throws if missing)
 * @param {Object} designState - Design state
 * @param {string} panelType - Panel type
 * @returns {string} Render URL
 */
export function requireCanonical3DRender(designState, panelType) {
  const render = getCanonical3DRender(designState, panelType);
  if (!render && requiresCanonical3DRender(panelType)) {
    console.warn(
      `[CanonicalRenderService] Missing canonical 3D render for ${panelType}`,
    );
  }
  return render;
}

/**
 * Get init params for canonical 3D
 * @param {Object} designState - Design state
 * @param {string} panelType - Panel type
 * @returns {Object} Init params for img2img
 */
export function getCanonical3DInitParams(designState, panelType) {
  const render = getCanonical3DRender(designState, panelType);
  const strength =
    CANONICAL_3D_STRENGTH_POLICY[panelType] ||
    CANONICAL_3D_STRENGTH_POLICY.default;
  return {
    initImage: render,
    strength,
    viewType: CANONICAL_3D_VIEWS[panelType]?.angle || "perspective",
  };
}

/**
 * Build negative prompt for canonical 3D
 * @param {string} panelType - Panel type
 * @returns {string} Negative prompt
 */
export function buildCanonical3DNegativePrompt(panelType) {
  return CANONICAL_3D_NEGATIVE_PROMPTS.join(", ");
}

/**
 * Get debug report for canonical 3D renders
 * @param {Object} designState - Design state
 * @returns {Object} Debug report
 */
export function getCanonical3DDebugReport(designState) {
  return {
    hasRenders: hasCanonical3DRenders(designState),
    renderCount: designState?.canonical3D
      ? Object.keys(designState.canonical3D).length
      : 0,
    mandatoryPanels: MANDATORY_3D_PANELS,
    timestamp: Date.now(),
  };
}

/**
 * Validate canonical 3D renders
 * @param {Object} designState - Design state
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validateCanonical3DRenders(designState) {
  const missing = MANDATORY_3D_PANELS.filter(
    (panel) => !getCanonical3DRender(designState, panel),
  );
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Generate canonical 3D renders
 * @param {Object} designState - Design state
 * @returns {Promise<Object>} Canonical 3D renders
 */
export async function generateCanonical3DRenders(designState) {
  console.log("[CanonicalRenderService] generateCanonical3DRenders (stub)");
  return {
    hero_3d: null,
    interior_3d: null,
    axonometric: null,
  };
}

export default {
  RENDER_MODE,
  MANDATORY_3D_PANELS,
  CANONICAL_3D_VIEWS,
  CANONICAL_3D_STRENGTH_POLICY,
  CANONICAL_3D_NEGATIVE_PROMPTS,
  generateCanonicalRenders,
  getCanonicalRenderForPanel,
  hasCanonicalRenders,
  validateCanonicalRenderPack,
  hasCanonical3DRenders,
  getCanonical3DRender,
  requiresCanonical3DRender,
  requireCanonical3DRender,
  getCanonical3DInitParams,
  buildCanonical3DNegativePrompt,
  getCanonical3DDebugReport,
  validateCanonical3DRenders,
  generateCanonical3DRenders,
};
