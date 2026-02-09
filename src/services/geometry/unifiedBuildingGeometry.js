/**
 * Unified Building Geometry
 *
 * Delegates to CanonicalGeometryPackService — the single source of truth.
 * Provides control images and FLUX img2img parameters from canonical pack.
 *
 * NO STUB BEHAVIOR: Every function calls the real implementation.
 */

import {
  buildCanonicalPack,
  getControlForPanel,
  getInitImageParams,
} from "../canonical/CanonicalGeometryPackService.js";

/**
 * Generate a control image for a given panel type from DNA/CDS.
 *
 * @param {Object} dna - DNA or CDS object
 * @param {string} viewType - Panel type (e.g. "floor_plan_ground")
 * @returns {string|null} data URL of the control image
 */
export function generateControlImage(dna, viewType) {
  try {
    const pack = buildCanonicalPack(dna);
    return getControlForPanel(pack, viewType);
  } catch {
    return null;
  }
}

/**
 * Get FLUX img2img parameters for a control image.
 *
 * @param {Object} dna - DNA or CDS object
 * @param {string} viewType - Panel type
 * @returns {{ init_image: string, strength: number }|{}} Parameters or empty object
 */
export function getFluxImg2ImgParams(dna, viewType) {
  try {
    const pack = buildCanonicalPack(dna);
    return getInitImageParams(pack, viewType) || {};
  } catch {
    return {};
  }
}

const unifiedBuildingGeometryExports = {
  generateControlImage,
  getFluxImg2ImgParams,
};
export default unifiedBuildingGeometryExports;
