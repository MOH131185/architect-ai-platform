/**
 * ControlNet Conditioning Service
 *
 * Central orchestration service that selects optimal Blender render passes
 * per panel type and produces composite control images for ControlNet.
 *
 * Pass selection is based on architectural drawing conventions:
 * - 3D views (hero, axon, interior): Depth primary + lineart overlay
 * - Elevations: Canny edges (facade accuracy)
 * - Floor plans: Lineart primary + AO overlay (wall thickness cues)
 * - Sections: Lineart only (clean structural lines)
 *
 * @module services/controlnet/ControlNetConditioningService
 */

import logger from "../../utils/logger.js";
import {
  compositeControlImage,
  normalizeToGrayscale,
} from "./ControlNetCompositor.js";

// ---------------------------------------------------------------------------
// Pass selection policy per panel type
// ---------------------------------------------------------------------------

/**
 * Defines which Blender passes to use for each panel type, composite weights,
 * the target ControlNet model, and conditioning strength.
 *
 * Together.ai inverts strength: imageStrength = 1.0 - strength
 * So strength 0.65 => imageStrength 0.35 => 35% from generated, 65% from control.
 */
const CONTROLNET_PASS_POLICY = {
  // 3D views: depth map as primary (massing), lineart as overlay (edges)
  hero_3d: {
    primary: "depth",
    secondary: "lineart",
    compositeWeights: [0.7, 0.3],
    controlnetModel: "controlnet-depth",
    strength: 0.65,
  },
  interior_3d: {
    primary: "depth",
    secondary: "ao",
    compositeWeights: [0.75, 0.25],
    controlnetModel: "controlnet-depth",
    strength: 0.6,
  },
  axonometric: {
    primary: "depth",
    secondary: "lineart",
    compositeWeights: [0.65, 0.35],
    controlnetModel: "controlnet-depth",
    strength: 0.55,
  },

  // Elevations: canny edges drive facade accuracy
  elevation_north: {
    primary: "canny",
    secondary: null,
    compositeWeights: [1.0],
    controlnetModel: "controlnet-canny",
    strength: 0.75,
  },
  elevation_south: {
    primary: "canny",
    secondary: null,
    compositeWeights: [1.0],
    controlnetModel: "controlnet-canny",
    strength: 0.75,
  },
  elevation_east: {
    primary: "canny",
    secondary: null,
    compositeWeights: [1.0],
    controlnetModel: "controlnet-canny",
    strength: 0.75,
  },
  elevation_west: {
    primary: "canny",
    secondary: null,
    compositeWeights: [1.0],
    controlnetModel: "controlnet-canny",
    strength: 0.75,
  },

  // Sections: lineart only (structural lines)
  section_AA: {
    primary: "lineart",
    secondary: null,
    compositeWeights: [1.0],
    controlnetModel: "controlnet-canny",
    strength: 0.7,
  },
  section_BB: {
    primary: "lineart",
    secondary: null,
    compositeWeights: [1.0],
    controlnetModel: "controlnet-canny",
    strength: 0.7,
  },

  // Floor plans: lineart (room boundaries) + AO (depth cues for wall thickness)
  floor_plan_ground: {
    primary: "lineart",
    secondary: "ao",
    compositeWeights: [0.8, 0.2],
    controlnetModel: "controlnet-canny",
    strength: 0.5,
  },
  floor_plan_first: {
    primary: "lineart",
    secondary: "ao",
    compositeWeights: [0.8, 0.2],
    controlnetModel: "controlnet-canny",
    strength: 0.5,
  },
  floor_plan_level2: {
    primary: "lineart",
    secondary: "ao",
    compositeWeights: [0.8, 0.2],
    controlnetModel: "controlnet-canny",
    strength: 0.5,
  },
};

/**
 * Get the pass policy for a panel type.
 * Supports wildcard matching for panel families (elevation_*, section_*, floor_plan_*).
 *
 * @param {string} panelType
 * @returns {Object|null} Policy entry or null if no policy defined
 */
export function getPassPolicy(panelType) {
  // Direct match
  if (CONTROLNET_PASS_POLICY[panelType]) {
    return CONTROLNET_PASS_POLICY[panelType];
  }

  // Wildcard match for families
  if (panelType.startsWith("elevation_")) {
    return CONTROLNET_PASS_POLICY.elevation_north; // Same policy for all elevations
  }
  if (panelType.startsWith("section_")) {
    return CONTROLNET_PASS_POLICY.section_AA;
  }
  if (panelType.startsWith("floor_plan_")) {
    return CONTROLNET_PASS_POLICY.floor_plan_ground;
  }

  return null;
}

/**
 * Extract a pass data URL from Blender pass outputs.
 *
 * Handles multiple output formats from the Blender Phase 2 API:
 * - Direct data URL string
 * - Object with dataUrl or base64 field
 *
 * @param {Object} blenderPasses - Pass data for a panel type
 * @param {string} passName - Pass name (depth, lineart, canny, ao, etc.)
 * @returns {string|null} PNG data URL or null
 */
function extractPassDataUrl(blenderPasses, passName) {
  if (!blenderPasses || !passName) return null;

  const passData = blenderPasses[passName];
  if (!passData) return null;

  // Direct data URL string
  if (typeof passData === "string" && passData.startsWith("data:")) {
    return passData;
  }

  // Object with dataUrl
  if (passData.dataUrl) return passData.dataUrl;

  // Object with base64
  if (passData.base64) {
    return `data:image/png;base64,${passData.base64}`;
  }

  return null;
}

/**
 * Generate a composite control image from Blender passes for a panel type.
 *
 * Combines primary + secondary passes according to CONTROLNET_PASS_POLICY
 * into a single grayscale PNG optimized for ControlNet conditioning.
 *
 * @param {string} panelType - Panel type (e.g., 'hero_3d', 'elevation_north')
 * @param {Object} blenderPasses - Blender pass data { depth, lineart, canny, ao, normal, clay }
 * @param {Object} [options]
 * @param {number} [options.width=1024] - Output width
 * @param {number} [options.height=1024] - Output height
 * @returns {Promise<string|null>} Composite PNG data URL, or null if no passes available
 */
export async function getCompositeControlImage(
  panelType,
  blenderPasses,
  options = {},
) {
  const policy = getPassPolicy(panelType);
  if (!policy) {
    logger.warn(`[ControlNet] No pass policy for panel type: ${panelType}`);
    return null;
  }

  const primaryUrl = extractPassDataUrl(blenderPasses, policy.primary);
  if (!primaryUrl) {
    logger.warn(
      `[ControlNet] Missing primary pass '${policy.primary}' for ${panelType}`,
    );
    return null;
  }

  const secondaryUrl = policy.secondary
    ? extractPassDataUrl(blenderPasses, policy.secondary)
    : null;

  if (secondaryUrl) {
    // Composite primary + secondary
    const overlayOpacity = policy.compositeWeights[1] || 0.3;
    logger.info(
      `[ControlNet] Compositing ${policy.primary}+${policy.secondary} for ${panelType} (weights: ${policy.compositeWeights.join("/")})`,
    );
    return compositeControlImage(
      primaryUrl,
      secondaryUrl,
      overlayOpacity,
      "multiply",
      options,
    );
  }

  // Single pass only -- normalize to grayscale
  logger.info(
    `[ControlNet] Using single pass '${policy.primary}' for ${panelType}`,
  );
  return normalizeToGrayscale(primaryUrl, options);
}

/**
 * Get the raw single-pass image for true ControlNet conditioning.
 *
 * When routing to Replicate ControlNet (Canny or Depth model),
 * the model expects a specific pass type, not a composite.
 *
 * @param {string} panelType
 * @param {Object} blenderPasses
 * @returns {string|null} Raw pass PNG data URL
 */
export function getControlNetInput(panelType, blenderPasses) {
  const policy = getPassPolicy(panelType);
  if (!policy) return null;

  return extractPassDataUrl(blenderPasses, policy.primary);
}

/**
 * Check if Blender passes contain sufficient data for ControlNet conditioning
 * for a given panel type.
 *
 * @param {string} panelType
 * @param {Object} blenderPasses
 * @returns {{ available: boolean, primary: boolean, secondary: boolean }}
 */
export function hasControlNetPasses(panelType, blenderPasses) {
  const policy = getPassPolicy(panelType);
  if (!policy) return { available: false, primary: false, secondary: false };

  const hasPrimary = !!extractPassDataUrl(blenderPasses, policy.primary);
  const hasSecondary = policy.secondary
    ? !!extractPassDataUrl(blenderPasses, policy.secondary)
    : true; // No secondary required

  return {
    available: hasPrimary,
    primary: hasPrimary,
    secondary: hasSecondary,
  };
}

export { CONTROLNET_PASS_POLICY };

export default {
  getPassPolicy,
  getCompositeControlImage,
  getControlNetInput,
  hasControlNetPasses,
  CONTROLNET_PASS_POLICY,
};
