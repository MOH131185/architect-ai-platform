/**
 * Canonical Pack Gate
 *
 * Validates canonical packs before generation.
 */

/**
 * Check if pack is ready for generation
 * @param {Object} pack - Canonical pack
 * @returns {{ready: boolean, errors: string[]}}
 */
export function isReadyForGeneration(pack) {
  const errors = [];

  if (!pack) {
    errors.push("No canonical pack");
    return { ready: false, errors };
  }

  if (!pack.designState) {
    errors.push("Missing design state");
  }

  return {
    ready: errors.length === 0,
    errors,
  };
}

/**
 * Validate pack completeness
 * @param {Object} pack - Canonical pack
 * @param {string[]} requiredPanels - Required panel types
 * @returns {{complete: boolean, missing: string[]}}
 */
export function validatePackCompleteness(pack, requiredPanels = []) {
  const missing = [];

  if (!pack?.renders) {
    return { complete: false, missing: requiredPanels };
  }

  for (const panel of requiredPanels) {
    if (!pack.renders[panel]) {
      missing.push(panel);
    }
  }

  return {
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Gate check for pack quality
 * @param {Object} pack - Canonical pack
 * @returns {boolean}
 */
export function passesQualityGate(pack) {
  if (!pack) return false;
  return true; // Stub - always passes
}

export default {
  isReadyForGeneration,
  validatePackCompleteness,
  passesQualityGate,
};
