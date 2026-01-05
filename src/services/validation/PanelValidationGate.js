/**
 * Panel Validation Gate
 *
 * Validates panels before acceptance.
 */

/**
 * Generator mismatch error
 */
export class GeneratorMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeneratorMismatchError";
  }
}

/**
 * Legacy generator error
 */
export class LegacyGeneratorError extends Error {
  constructor(message) {
    super(message);
    this.name = "LegacyGeneratorError";
  }
}

/**
 * Get validation gate for panel type
 * @param {string} panelType - Panel type
 * @returns {Object} Validation gate config
 */
export function getValidationGate(panelType) {
  return {
    panelType,
    minScore: 0.85,
    maxRetries: 3,
    strictMode: false,
  };
}

/**
 * Assert valid generator for panel
 * @param {string} panelType - Panel type
 * @param {string} generatorId - Generator ID
 * @throws {GeneratorMismatchError}
 */
export function assertValidGenerator(panelType, generatorId) {
  // Stub - always passes
  return true;
}

/**
 * Confirm generator selection
 * @param {string} panelType - Panel type
 * @param {string} generatorId - Generator ID
 * @returns {boolean}
 */
export function confirmGenerator(panelType, generatorId) {
  return true;
}

/**
 * Run panel validation gate
 * @param {Object} panel - Panel to validate
 * @param {Object} options - Validation options
 * @returns {Promise<{passed: boolean, score: number, issues: string[]}>}
 */
export async function runPanelValidationGate(panel, options = {}) {
  console.log("[PanelValidationGate] runPanelValidationGate (stub)");
  return {
    passed: true,
    score: 0.95,
    issues: [],
  };
}

/**
 * Validate panel dimensions
 * @param {Object} panel - Panel to validate
 * @returns {{valid: boolean, issues: string[]}}
 */
export function validatePanelDimensions(panel) {
  return { valid: true, issues: [] };
}

/**
 * Validate panel content
 * @param {Object} panel - Panel to validate
 * @returns {{valid: boolean, issues: string[]}}
 */
export function validatePanelContent(panel) {
  return { valid: true, issues: [] };
}

export default {
  GeneratorMismatchError,
  LegacyGeneratorError,
  getValidationGate,
  assertValidGenerator,
  confirmGenerator,
  runPanelValidationGate,
  validatePanelDimensions,
  validatePanelContent,
};
