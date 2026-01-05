/**
 * Canonical Control Render Generator
 *
 * Generates control renders from canonical design state.
 */

/**
 * Check if control renders are available
 * @param {Object} designState - Design state
 * @returns {boolean}
 */
export function hasControlRenders(designState) {
  return !!(
    designState?.controlRenders &&
    Object.keys(designState.controlRenders).length > 0
  );
}

/**
 * Get control image debug report
 * @param {Object} designState - Design state
 * @returns {Object} Debug report
 */
export function getControlImageDebugReport(designState) {
  return {
    hasRenders: hasControlRenders(designState),
    renderCount: designState?.controlRenders
      ? Object.keys(designState.controlRenders).length
      : 0,
    timestamp: Date.now(),
  };
}

/**
 * Generate canonical control renders
 * @param {Object} designState - Canonical design state
 * @returns {Promise<Object>} Control render pack
 */
export async function generateCanonicalControlRenders(designState) {
  console.log(
    "[CanonicalControlRenderGenerator] generateCanonicalControlRenders (stub)",
  );
  return {
    id: `ctrl_render_${Date.now()}`,
    renders: {},
  };
}

/**
 * Generate control renders for all views (alias)
 * @param {Object} designState - Canonical design state
 * @returns {Promise<Object>} Control render pack
 */
export async function generateControlRenders(designState) {
  return generateCanonicalControlRenders(designState);
}

/**
 * Get control image for a specific panel
 * @param {Object} designState - Design state
 * @param {string} panelType - Panel type
 * @returns {string|null} Control image URL
 */
export function getControlImageForPanel(designState, panelType) {
  if (!designState?.controlRenders) return null;
  return designState.controlRenders[panelType] || null;
}

/**
 * Check if control image is required for panel
 * @param {string} panelType - Panel type
 * @returns {boolean}
 */
export function requireControlImageForPanel(panelType) {
  // Technical panels require control images
  const technicalPanels = [
    "floor_plan_gf",
    "floor_plan_ff",
    "elevation_n",
    "elevation_s",
    "elevation_e",
    "elevation_w",
    "section_aa",
    "section_bb",
  ];
  return technicalPanels.includes(panelType);
}

/**
 * Generate control render for specific view
 * @param {Object} designState - Design state
 * @param {string} viewType - View type
 * @returns {Promise<string|null>} Control image URL
 */
export async function generateControlForView(designState, viewType) {
  console.log(
    `[CanonicalControlRenderGenerator] generateControlForView: ${viewType} (stub)`,
  );
  return null;
}

export default {
  hasControlRenders,
  getControlImageDebugReport,
  generateCanonicalControlRenders,
  generateControlRenders,
  getControlImageForPanel,
  requireControlImageForPanel,
  generateControlForView,
};
