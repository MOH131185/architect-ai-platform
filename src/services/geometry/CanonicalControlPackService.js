/**
 * Canonical Control Pack Service
 *
 * Manages control packs for consistent panel generation.
 */

/**
 * Control pack view types
 */
export const CONTROL_PACK_VIEWS = [
  "floor_plan_gf",
  "floor_plan_ff",
  "elevation_n",
  "elevation_s",
  "elevation_e",
  "elevation_w",
  "section_aa",
  "section_bb",
];

/**
 * Panel to control mapping
 */
export const PANEL_TO_CONTROL_MAP = {
  floor_plan_gf: "floor_plan_gf",
  floor_plan_ff: "floor_plan_ff",
  elevation_n: "elevation_n",
  elevation_s: "elevation_s",
  elevation_e: "elevation_e",
  elevation_w: "elevation_w",
  section_aa: "section_aa",
  section_bb: "section_bb",
  hero_3d: null,
  interior_3d: null,
  axonometric: null,
};

// In-memory control pack storage
let currentControlPack = null;

/**
 * Generate control pack from design state
 * @param {Object} designState - Design state
 * @returns {Promise<Object>} Control pack
 */
export async function generateControlPack(designState) {
  console.log("[CanonicalControlPackService] generateControlPack (stub)");
  currentControlPack = {
    id: `ctrl_${Date.now()}`,
    timestamp: new Date().toISOString(),
    designState,
    controls: {},
  };
  return currentControlPack;
}

/**
 * Build control pack from design state (alias)
 * @param {Object} designState - Design state
 * @returns {Promise<Object>} Control pack
 */
export async function buildControlPack(designState) {
  return generateControlPack(designState);
}

/**
 * Check if control pack exists
 * @param {Object} state - Design state (optional)
 * @returns {boolean}
 */
export function hasControlPack(state) {
  return currentControlPack !== null || !!state?.controlPack;
}

/**
 * Get control image for panel
 * @param {Object} controlPack - Control pack
 * @param {string} panelType - Panel type
 * @returns {string|null} Control image URL
 */
export function getControlForPanel(controlPack, panelType) {
  if (!controlPack || !panelType) return null;
  return controlPack.controls?.[panelType] || null;
}

/**
 * Save control pack to debug folder
 * @param {Object} controlPack - Control pack
 * @param {string} outputDir - Output directory
 * @returns {Promise<void>}
 */
export async function saveControlPackToDebugFolder(controlPack, outputDir) {
  console.log(
    "[CanonicalControlPackService] saveControlPackToDebugFolder (stub)",
  );
  // Stub - would save to filesystem in real implementation
}

/**
 * Get control pack debug report
 * @param {Object} controlPack - Control pack
 * @returns {Object} Debug report
 */
export function getControlPackDebugReport(controlPack) {
  return {
    hasControls: !!(
      controlPack?.controls && Object.keys(controlPack.controls).length > 0
    ),
    controlCount: controlPack?.controls
      ? Object.keys(controlPack.controls).length
      : 0,
    views: CONTROL_PACK_VIEWS,
    timestamp: Date.now(),
  };
}

/**
 * Validate control pack
 * @param {Object} controlPack - Pack to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateControlPack(controlPack) {
  if (!controlPack) {
    return { valid: false, errors: ["No control pack"] };
  }
  return { valid: true, errors: [] };
}

export default {
  CONTROL_PACK_VIEWS,
  PANEL_TO_CONTROL_MAP,
  generateControlPack,
  buildControlPack,
  hasControlPack,
  getControlForPanel,
  saveControlPackToDebugFolder,
  getControlPackDebugReport,
  validateControlPack,
};
