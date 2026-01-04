/**
 * Baseline Render Service
 *
 * Manages baseline control images for consistent panel generation.
 */

/**
 * View types that support baseline control
 */
export const BASELINE_VIEW_TYPES = {
  FLOOR_PLAN: "floor_plan",
  ELEVATION: "elevation",
  SECTION: "section",
  PERSPECTIVE: "perspective",
};

/**
 * Get baseline render for a panel type
 * @param {string} panelType - Panel type
 * @param {Object} baselineStore - Stored baselines
 * @returns {string|null} Baseline image URL or null
 */
export function getBaselineForPanel(panelType, baselineStore) {
  if (!baselineStore || !panelType) return null;

  // Normalize panel type for lookup
  const key = panelType.toLowerCase().replace(/-/g, "_");

  // Check for direct match
  if (baselineStore[key]) {
    return baselineStore[key].url || baselineStore[key];
  }

  // Check for partial match (e.g., 'elevation' matches 'elevation_n')
  for (const [storeKey, value] of Object.entries(baselineStore)) {
    if (key.includes(storeKey) || storeKey.includes(key)) {
      return value?.url || value;
    }
  }

  return null;
}

/**
 * Check if panel type requires baseline control
 * @param {string} panelType - Panel type
 * @returns {boolean}
 */
export function requiresBaselineControl(panelType) {
  if (!panelType) return false;

  const type = panelType.toLowerCase();

  // Technical drawings require baseline control for consistency
  return (
    type.includes("floor_plan") ||
    type.includes("elevation") ||
    type.includes("section")
  );
}

/**
 * Apply baseline control to generation parameters
 * @param {Object} params - Generation parameters
 * @param {string} baselineUrl - Baseline image URL
 * @param {number} strength - Control strength (0-1)
 * @returns {Object} Modified parameters
 */
export function applyBaselineControl(params, baselineUrl, strength = 0.7) {
  if (!baselineUrl) return params;

  return {
    ...params,
    init_image: baselineUrl,
    control_image: baselineUrl,
    strength: strength,
    control_strength: strength,
  };
}

/**
 * Generate baseline renders from geometry
 * @param {Object} geometry - Building geometry
 * @param {Object} options - Render options
 * @returns {Promise<Object>} Baseline renders
 */
export async function generateBaselineRenders(geometry, options = {}) {
  // Placeholder - returns empty baselines
  console.log("[BaselineRenderService] generateBaselineRenders called (stub)");
  return {};
}

export default {
  getBaselineForPanel,
  requiresBaselineControl,
  applyBaselineControl,
  generateBaselineRenders,
  BASELINE_VIEW_TYPES,
};
