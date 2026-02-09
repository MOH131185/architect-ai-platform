/**
 * Panel Validation Gate
 *
 * Validates that individual panels meet requirements before and after generation.
 * When `requireCanonicalPack` is enabled, technical panels (floor plans, elevations,
 * sections) MUST have an init_image from the canonical geometry pack.
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class GeneratorMismatchError extends Error {
  constructor(message, panelType, details = {}) {
    super(message);
    this.name = "GeneratorMismatchError";
    this.panelType = panelType;
    this.details = details;
  }
}

export class LegacyGeneratorError extends Error {
  constructor(message) {
    super(message);
    this.name = "LegacyGeneratorError";
  }
}

// Panel types that require geometry control images
const TECHNICAL_PANELS = new Set([
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "floor_plan_level3",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_a_a",
  "section_b_b",
]);

// ---------------------------------------------------------------------------
// Gate functions
// ---------------------------------------------------------------------------

/**
 * Assert that a panel's generator parameters are valid before generation.
 *
 * When `requireCanonicalPack` is enabled, technical panels must have
 * an init_image from the canonical pack.
 *
 * @param {string} panelType - e.g. "floor_plan_ground"
 * @param {Object} generatorParams - Parameters to be sent to the image generator
 * @param {string} [generatorParams.init_image] - Control image URL/data URL
 * @returns {boolean} true if valid
 * @throws {GeneratorMismatchError} if requirements not met
 */
export function assertValidGenerator(panelType, generatorParams = {}) {
  if (!isFeatureEnabled("requireCanonicalPack")) {
    return true;
  }

  if (TECHNICAL_PANELS.has(panelType)) {
    if (!generatorParams.init_image) {
      throw new GeneratorMismatchError(
        `Technical panel "${panelType}" requires init_image from canonical geometry pack, ` +
          `but none was provided. Enable canonicalControlPack or disable requireCanonicalPack.`,
        panelType,
        { hasInitImage: false },
      );
    }
  }

  return true;
}

/**
 * Confirm that a generated panel result is valid after generation.
 *
 * @param {string} panelType - Panel type
 * @param {Object} result - Generation result { url, imageUrls, metadata }
 * @returns {boolean} true if valid
 * @throws {GeneratorMismatchError} if result is invalid
 */
export function confirmGenerator(panelType, result) {
  if (!result) {
    throw new GeneratorMismatchError(
      `Panel "${panelType}" generation returned null/undefined result`,
      panelType,
      { result: null },
    );
  }

  const url = result.url || result.imageUrls?.[0];
  if (!url) {
    throw new GeneratorMismatchError(
      `Panel "${panelType}" generation returned no image URL`,
      panelType,
      { hasUrl: false },
    );
  }

  return true;
}

/**
 * Get a validation gate object with a `validate()` method.
 * Useful for contexts that expect an object-shaped gate.
 *
 * @returns {{ validate: Function }}
 */
export function getValidationGate() {
  return {
    validate: (panelType, params) => {
      try {
        assertValidGenerator(panelType, params);
        return { valid: true, errors: [] };
      } catch (err) {
        return { valid: false, errors: [err.message] };
      }
    },
  };
}

const PanelValidationGateExports = {
  GeneratorMismatchError,
  LegacyGeneratorError,
  assertValidGenerator,
  confirmGenerator,
  getValidationGate,
};
export default PanelValidationGateExports;
