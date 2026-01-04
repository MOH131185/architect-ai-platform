/**
 * Pipeline Mode Configuration
 *
 * Defines pipeline modes and panel categories for generation flow.
 */

import { isFeatureEnabled } from "./featureFlags.js";

/**
 * Pipeline modes
 */
export const PIPELINE_MODE = {
  OPTION_1: "option1", // DNA-only workflow
  OPTION_2: "option2", // Geometry-first workflow
  HYBRID: "hybrid", // Mixed workflow
};

/**
 * Technical panels (generated from geometry)
 */
export const TECHNICAL_PANELS = [
  "floor_plan_gf",
  "floor_plan_ff",
  "floor_plan_sf",
  "floor_plan_tf",
  "elevation_n",
  "elevation_s",
  "elevation_e",
  "elevation_w",
  "section_aa",
  "section_bb",
  "site_plan",
];

/**
 * Styled 3D panels (AI-generated)
 */
export const STYLED_3D_PANELS = ["hero_3d", "interior_3d", "aerial_3d"];

/**
 * Get current pipeline mode based on feature flags
 * @returns {string} Pipeline mode
 */
export function getCurrentPipelineMode() {
  if (isFeatureEnabled("geometryFirst")) {
    return PIPELINE_MODE.OPTION_2;
  }
  if (isFeatureEnabled("hybridMode")) {
    return PIPELINE_MODE.HYBRID;
  }
  return PIPELINE_MODE.OPTION_1;
}

/**
 * Check if Option 2 (geometry-first) mode is active
 * @returns {boolean}
 */
export function isOption2Mode() {
  return getCurrentPipelineMode() === PIPELINE_MODE.OPTION_2;
}

/**
 * Log current pipeline configuration
 */
export function logPipelineConfig() {
  const mode = getCurrentPipelineMode();
  console.log(`[Pipeline] Current mode: ${mode}`);
  console.log(`[Pipeline] Technical panels: ${TECHNICAL_PANELS.length}`);
  console.log(`[Pipeline] Styled 3D panels: ${STYLED_3D_PANELS.length}`);
}
