/**
 * Generation Preflight
 *
 * Pre-generation validation checks.
 */

/**
 * GenerationPreflight class for stateful preflight checks
 */
export class GenerationPreflight {
  constructor(designState) {
    this.designState = designState;
    this.checks = [];
    this.issues = [];
  }

  addCheck(name, fn) {
    this.checks.push({ name, fn });
    return this;
  }

  async run() {
    this.issues = [];
    for (const check of this.checks) {
      try {
        const result = await check.fn(this.designState);
        if (!result.passed) {
          this.issues.push(...(result.issues || [check.name]));
        }
      } catch (error) {
        this.issues.push(`${check.name}: ${error.message}`);
      }
    }
    return {
      ready: this.issues.length === 0,
      issues: this.issues,
    };
  }
}

/**
 * Run preflight checks (function version)
 * @param {Object} designState - Design state
 * @returns {Promise<{ready: boolean, issues: string[]}>}
 */
export async function generationPreflight(designState) {
  console.log("[GenerationPreflight] generationPreflight (stub)");
  return {
    ready: true,
    issues: [],
  };
}

/**
 * Run preflight checks (alias)
 * @param {Object} designState - Design state
 * @returns {Promise<{ready: boolean, issues: string[]}>}
 */
export async function runPreflightChecks(designState) {
  return generationPreflight(designState);
}

/**
 * Check if design is ready for generation
 * @param {Object} designState - Design state
 * @returns {boolean}
 */
export function isReadyForGeneration(designState) {
  return !!(designState && designState.program && designState.style);
}

/**
 * Get missing requirements
 * @param {Object} designState - Design state
 * @returns {string[]}
 */
export function getMissingRequirements(designState) {
  const missing = [];
  if (!designState?.program) missing.push("program");
  if (!designState?.style) missing.push("style");
  return missing;
}

export default {
  GenerationPreflight,
  generationPreflight,
  runPreflightChecks,
  isReadyForGeneration,
  getMissingRequirements,
};
