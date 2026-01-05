/**
 * Canonical Pack Gate
 *
 * Validates canonical packs before generation.
 */

/**
 * Error class for canonical pack gate failures
 */
export class CanonicalPackGateError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CanonicalPackGateError";
    this.code = code;
  }
}

/**
 * Gate error codes
 */
export const GATE_ERROR_CODES = {
  PACK_NOT_FOUND: "PACK_NOT_FOUND",
  PACK_INCOMPLETE: "PACK_INCOMPLETE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  GATE_DISABLED: "GATE_DISABLED",
};

/**
 * Check if canonical pack gate is enabled
 * @returns {boolean}
 */
export function isCanonicalPackGateEnabled() {
  // Gate is enabled by default for quality assurance
  return true;
}

/**
 * Validate before generation
 * @param {Object} pack - Canonical pack
 * @param {string} panelType - Panel type
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateBeforeGeneration(pack, panelType) {
  if (!isCanonicalPackGateEnabled()) {
    return { valid: true, errors: [] };
  }

  const errors = [];

  if (!pack) {
    errors.push("No canonical pack provided");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

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
  CanonicalPackGateError,
  GATE_ERROR_CODES,
  isCanonicalPackGateEnabled,
  validateBeforeGeneration,
  isReadyForGeneration,
  validatePackCompleteness,
  passesQualityGate,
};
