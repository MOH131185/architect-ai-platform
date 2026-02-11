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
  let length =
    Number(dims.length) ||
    Number(dims.length_m) ||
    Number(dims.depth) ||
    Number(dims.depth_m) ||
    0;
  let width =
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

  const requestedUsableRatio = Number(
    process.env.ARCHIAI_PROGRAM_USABLE_RATIO ||
      process.env.REACT_APP_ARCHIAI_PROGRAM_USABLE_RATIO ||
      0.78,
  );
  const usableRatio = Number.isFinite(requestedUsableRatio)
    ? Math.max(0.55, Math.min(0.9, requestedUsableRatio))
    : 0.78;

  const requiredByLevel = new Map();
  for (const space of programLock?.spaces || []) {
    const level = Number(space.lockedLevel) || 0;
    const area = (Number(space.targetAreaM2) || 0) * (Number(space.count) || 1);
    requiredByLevel.set(level, (requiredByLevel.get(level) || 0) + area);
  }

  let totalRequired = 0;
  for (const [, required] of requiredByLevel.entries()) {
    totalRequired += required;
  }

  const levelCount = Math.max(1, Number(programLock?.levelCount) || 1);

  // Auto-correct: if program exceeds envelope, scale DNA dimensions up to fit.
  // This prevents hard failures when the AI generates dimensions too small for
  // the user-specified program.  We scale uniformly (preserving aspect ratio)
  // so the building proportions stay reasonable.
  //
  // NOTE: BuildingModel applies its own internal overhead (~19%) on top of the
  // usableRatio — external wall thickness (300mm each side), internal zone gaps,
  // and strip-packing efficiency losses.  The target fill factor (0.75) accounts
  // for this geometry overhead so that final room areas match programLock targets.
  const maxLevelRequired = Math.max(0, ...requiredByLevel.values());
  const currentUsablePerLevel = length * width * usableRatio;
  const currentTotalUsable = currentUsablePerLevel * levelCount;
  const geometryTargetFill = 0.75; // accounts for BuildingModel wall/zone/packing overhead
  const needsLevelFix = maxLevelRequired > currentUsablePerLevel * 1.02;
  const needsTotalFix = totalRequired > currentTotalUsable * 1.02;

  if (needsLevelFix || needsTotalFix) {
    // Determine the scale factor needed (use the larger of the two gaps)
    const levelScale = needsLevelFix
      ? Math.sqrt(
          maxLevelRequired / (currentUsablePerLevel * geometryTargetFill),
        )
      : 1;
    const totalScale = needsTotalFix
      ? Math.sqrt(totalRequired / (currentTotalUsable * geometryTargetFill))
      : 1;
    const scale = Math.max(levelScale, totalScale);

    // Cap at 1.5× to avoid absurd expansions — beyond that, the user's
    // program genuinely doesn't fit a reasonable envelope.
    if (scale <= 1.5) {
      const newLength = Math.round(length * scale * 10) / 10;
      const newWidth = Math.round(width * scale * 10) / 10;

      warnings.push(
        `Auto-corrected DNA dimensions from ${length}m×${width}m to ${newLength}m×${newWidth}m ` +
          `(×${scale.toFixed(2)}) to fit program (${totalRequired.toFixed(0)}m² required)`,
      );

      // Apply correction to masterDNA in-place so downstream uses the
      // corrected envelope.
      const dimKey = dims.length
        ? "length"
        : dims.length_m
          ? "length_m"
          : dims.depth
            ? "depth"
            : "depth_m";
      const widKey = dims.width
        ? "width"
        : dims.width_m
          ? "width_m"
          : dims.breadth
            ? "breadth"
            : "breadth_m";
      dims[dimKey] = newLength;
      dims[widKey] = newWidth;

      length = newLength;
      width = newWidth;
    } else {
      errors.push(
        `Program requires ${scale.toFixed(2)}× envelope expansion (max 1.5×). ` +
          `Total required ${totalRequired.toFixed(1)}m² far exceeds capacity ` +
          `${currentTotalUsable.toFixed(1)}m² (${length}m × ${width}m × ${levelCount} levels, ` +
          `${(usableRatio * 100).toFixed(0)}% usable). Reduce program area or increase floor count.`,
      );
      return { errors, warnings };
    }
  }

  // Re-check after potential auto-correction — report density warnings
  const usablePerLevelM2 = length * width * usableRatio;
  for (const [level, required] of requiredByLevel.entries()) {
    const fillRatio = usablePerLevelM2 > 0 ? required / usablePerLevelM2 : 0;
    if (fillRatio > 0.9) {
      warnings.push(
        `Program on level ${level} is highly dense (${(fillRatio * 100).toFixed(1)}% of usable footprint) and may degrade room quality`,
      );
    }
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
