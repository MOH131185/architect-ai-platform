/**
 * Generation Preflight - Stub
 *
 * Validates generation parameters before starting panel generation.
 */

export class GenerationPreflight {
  static validate(masterDNA, programSchedule) {
    return { valid: true, warnings: [] };
  }

  static async validateAsync(masterDNA, programSchedule) {
    return { valid: true, warnings: [] };
  }
}

// Export as object with validate method for backwards compatibility
export const generationPreflight = {
  validate(masterDNA, programSchedule) {
    return { valid: true, warnings: [] };
  },
  async validateAsync(masterDNA, programSchedule) {
    return { valid: true, warnings: [] };
  },
};

export default {
  GenerationPreflight,
  generationPreflight,
};
