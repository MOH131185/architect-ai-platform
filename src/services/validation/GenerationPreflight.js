/**
 * Generation Preflight - Real validation gate
 *
 * Validates generation parameters before starting panel generation.
 * Replaces the previous stub that always returned valid.
 *
 * Checks:
 * - masterDNA exists and has required fields
 * - programSchedule / programLock consistency
 * - Seed is a valid number
 * - CDS is present when required
 * - Floor count is realistic
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";

/**
 * Custom error for preflight failures.
 */
export class PreflightError extends Error {
  constructor(message, errors = [], warnings = []) {
    super(message);
    this.name = "PreflightError";
    this.errors = errors;
    this.warnings = warnings;
  }
}

export class GenerationPreflight {
  /**
   * Synchronous validation.
   *
   * @param {Object} masterDNA
   * @param {Object} programSchedule - programSpaces or programLock
   * @param {Object} [options] - { cds, seed, strict }
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  static validate(masterDNA, programSchedule, options = {}) {
    const {
      cds,
      seed,
      strict = isFeatureEnabled("strictPreflightGate"),
    } = options;
    const errors = [];
    const warnings = [];

    // 1. masterDNA must exist
    if (!masterDNA) {
      errors.push("masterDNA is missing");
      return result(errors, warnings, strict);
    }

    // 2. Dimensions
    const dims = masterDNA.dimensions || {};
    if (!dims.length && !dims.width) {
      errors.push("masterDNA.dimensions missing length and width");
    }
    if (dims.length && (dims.length < 3 || dims.length > 200)) {
      warnings.push(`Unusual building length: ${dims.length}m`);
    }
    if (dims.width && (dims.width < 3 || dims.width > 200)) {
      warnings.push(`Unusual building width: ${dims.width}m`);
    }

    // 3. Floor count
    const floors = dims.floors || dims.floorCount || masterDNA.floors || 0;
    if (floors < 1) {
      errors.push("Floor count must be >= 1");
    }
    if (floors > 10) {
      warnings.push(
        `High floor count: ${floors} — may affect generation quality`,
      );
    }

    // 4. Materials
    const materials = masterDNA.materials || [];
    if (!Array.isArray(materials) || materials.length === 0) {
      warnings.push("No materials specified in DNA");
    }

    // 5. Rooms
    const rooms = masterDNA.rooms || masterDNA.program?.rooms || [];
    if (!Array.isArray(rooms) || rooms.length === 0) {
      warnings.push("No rooms defined in DNA");
    }

    // 6. Program schedule consistency
    if (programSchedule) {
      if (Array.isArray(programSchedule) && programSchedule.length === 0) {
        warnings.push("programSchedule is an empty array");
      }

      // If it's a ProgramLock, validate hash integrity
      if (programSchedule.hash && programSchedule.spaces) {
        if (programSchedule.levelCount !== floors && floors > 0) {
          errors.push(
            `ProgramLock levelCount (${programSchedule.levelCount}) ` +
              `does not match DNA floor count (${floors})`,
          );
        }

        const fitCheck = validateProgramFitToEnvelope(
          masterDNA,
          programSchedule,
        );
        errors.push(...fitCheck.errors);
        warnings.push(...fitCheck.warnings);
      }
    }

    // 7. Seed validation
    if (seed !== undefined) {
      if (typeof seed !== "number" || seed < 0 || !Number.isFinite(seed)) {
        errors.push(
          `Invalid seed: ${seed} (must be a non-negative finite number)`,
        );
      }
    }

    // 8. CDS validation (when required)
    if (isFeatureEnabled("cdsRequired") && !cds) {
      errors.push("CDS (Canonical Design State) is required but missing");
    }
    if (cds && !cds.hash) {
      errors.push(
        "CDS is present but missing hash — integrity cannot be verified",
      );
    }

    // 9. ProgramLock validation (when required)
    if (isFeatureEnabled("programLockRequired")) {
      const lock = programSchedule;
      if (!lock || !lock.spaces || !lock.hash) {
        errors.push(
          "ProgramSpacesLock is required but missing or incomplete " +
            "(ARCHIAI_PROGRAM_LOCK_REQUIRED=true)",
        );
      }
    }

    return result(errors, warnings, strict);
  }

  static async validateAsync(masterDNA, programSchedule, options = {}) {
    return GenerationPreflight.validate(masterDNA, programSchedule, options);
  }
}

function result(errors, warnings, strict) {
  const valid = errors.length === 0;
  if (!valid && strict) {
    throw new PreflightError(
      `GenerationPreflight FAILED: ${errors.length} error(s)\n` +
        errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n"),
      errors,
      warnings,
    );
  }
  return { valid, errors, warnings };
}

function validateProgramFitToEnvelope(masterDNA, programLock) {
  const errors = [];
  const warnings = [];

  const dims = masterDNA?.dimensions || {};
  const length =
    Number(dims.length) ||
    Number(dims.length_m) ||
    Number(dims.depth) ||
    Number(dims.depth_m) ||
    0;
  const width =
    Number(dims.width) ||
    Number(dims.width_m) ||
    Number(dims.breadth) ||
    Number(dims.breadth_m) ||
    0;

  if (length <= 0 || width <= 0) {
    warnings.push(
      "Cannot evaluate program fit to envelope (missing DNA length/width dimensions)",
    );
    return { errors, warnings };
  }

  const footprintM2 = length * width;
  const requestedUsableRatio = Number(
    process.env.ARCHIAI_PROGRAM_USABLE_RATIO ||
      process.env.REACT_APP_ARCHIAI_PROGRAM_USABLE_RATIO ||
      0.78,
  );
  const usableRatio = Number.isFinite(requestedUsableRatio)
    ? Math.max(0.55, Math.min(0.9, requestedUsableRatio))
    : 0.78;
  const usablePerLevelM2 = footprintM2 * usableRatio;

  const requiredByLevel = new Map();
  for (const space of programLock?.spaces || []) {
    const level = Number(space.lockedLevel) || 0;
    const area = (Number(space.targetAreaM2) || 0) * (Number(space.count) || 1);
    requiredByLevel.set(level, (requiredByLevel.get(level) || 0) + area);
  }

  let totalRequired = 0;
  for (const [level, required] of requiredByLevel.entries()) {
    totalRequired += required;
    const fillRatio = usablePerLevelM2 > 0 ? required / usablePerLevelM2 : 0;
    if (required > usablePerLevelM2 * 1.02) {
      errors.push(
        `Program for level ${level} is infeasible: required ${required.toFixed(1)}m² exceeds usable envelope ${usablePerLevelM2.toFixed(1)}m² (length ${length}m × width ${width}m, usable ratio ${(usableRatio * 100).toFixed(0)}%)`,
      );
    } else if (fillRatio > 0.9) {
      warnings.push(
        `Program on level ${level} is highly dense (${(fillRatio * 100).toFixed(1)}% of usable footprint) and may degrade room quality`,
      );
    }
  }

  const levelCount = Math.max(1, Number(programLock?.levelCount) || 1);
  const totalUsable = usablePerLevelM2 * levelCount;
  if (totalRequired > totalUsable * 1.02) {
    errors.push(
      `Program total area ${totalRequired.toFixed(1)}m² exceeds estimated usable building capacity ${totalUsable.toFixed(1)}m²`,
    );
  }

  return { errors, warnings };
}

// Backwards-compatible singleton export
export const generationPreflight = {
  validate(masterDNA, programSchedule, options) {
    return GenerationPreflight.validate(masterDNA, programSchedule, options);
  },
  async validateAsync(masterDNA, programSchedule, options) {
    return GenerationPreflight.validate(masterDNA, programSchedule, options);
  },
};

export default {
  GenerationPreflight,
  generationPreflight,
  PreflightError,
};
