/**
 * Canonical Pack Gate
 *
 * Hard gate that blocks panel generation unless a complete canonical
 * geometry pack is available. When `requireCanonicalPack` is enabled,
 * no panel may proceed to FLUX without canonical geometry control.
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CanonicalPackGateError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "CanonicalPackGateError";
    this.code = code;
    this.details = details;
  }
}

export const GATE_ERROR_CODES = {
  MISSING_PACK: "MISSING_PACK",
  INVALID_PACK: "INVALID_PACK",
  INCOMPLETE_PACK: "INCOMPLETE_PACK",
  HASH_MISMATCH: "HASH_MISMATCH",
  MISSING_PANELS: "MISSING_PANELS",
};

// ---------------------------------------------------------------------------
// Gate check
// ---------------------------------------------------------------------------

/**
 * Whether the canonical pack gate is enabled.
 * Requires both `canonicalControlPack` AND `requireCanonicalPack` flags.
 *
 * @returns {boolean}
 */
export function isCanonicalPackGateEnabled() {
  return (
    isFeatureEnabled("canonicalControlPack") &&
    isFeatureEnabled("requireCanonicalPack")
  );
}

/**
 * Validate canonical pack before panel generation may proceed.
 *
 * @param {Object} pack - Canonical pack from buildCanonicalPack()
 * @param {Object} cds - CanonicalDesignState
 * @param {Object} programLock - ProgramSpacesLock
 * @param {Object} [options]
 * @param {boolean} [options.strict=true] - Throw on failure
 * @returns {{ valid: boolean, missing: string[], errors: string[] }}
 * @throws {CanonicalPackGateError} in strict mode when validation fails
 */
export function validateBeforeGeneration(pack, cds, programLock, options = {}) {
  const { strict = true } = options;
  const errors = [];
  const missing = [];

  // 1. Pack must exist
  if (!pack) {
    errors.push("Canonical pack is missing");
    return finish(errors, missing, strict, GATE_ERROR_CODES.MISSING_PACK);
  }

  // 2. Pack must be COMPLETE
  if (pack.status !== "COMPLETE") {
    errors.push(`Pack status is '${pack.status}', expected 'COMPLETE'`);
    return finish(errors, missing, strict, GATE_ERROR_CODES.INVALID_PACK);
  }

  // 3. geometryHash must be present
  if (!pack.geometryHash) {
    errors.push("Pack is missing geometryHash");
  }

  // 4. geometryHash must match CDS geometry (if CDS provided)
  if (pack.geometryHash && cds) {
    const expectedCdsHash = cds.hash || computeCDSHashSync(cds);
    if (pack.cdsHash && pack.cdsHash !== expectedCdsHash) {
      errors.push(
        `Pack cdsHash (${pack.cdsHash.substring(0, 8)}...) does not match ` +
          `CDS hash (${expectedCdsHash.substring(0, 8)}...) — CDS may have changed since pack was built`,
      );
    }
  }

  // 5. Required panel types based on program
  const levelCount = programLock?.levelCount ?? cds?.program?.levelCount ?? 1;
  const FLOOR_TYPES = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "floor_plan_level3",
  ];
  const requiredPanels = [];

  // Floor plans for each level
  for (let i = 0; i < levelCount && i < FLOOR_TYPES.length; i++) {
    requiredPanels.push(FLOOR_TYPES[i]);
  }

  // Always require at least north + south elevations and section_a_a
  requiredPanels.push("elevation_north", "elevation_south", "section_a_a");

  for (const pt of requiredPanels) {
    if (!pack.panels?.[pt]?.dataUrl) {
      missing.push(pt);
    }
  }

  if (missing.length > 0) {
    errors.push(`Pack is missing required panels: ${missing.join(", ")}`);
  }

  return finish(errors, missing, strict, GATE_ERROR_CODES.INCOMPLETE_PACK);
}

/**
 * Finalize gate result. Throws in strict mode if errors found.
 */
function finish(errors, missing, strict, code) {
  const valid = errors.length === 0;
  if (!valid && strict) {
    throw new CanonicalPackGateError(
      `CanonicalPackGate FAILED: ${errors.length} error(s)\n` +
        errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n"),
      code,
      { errors, missing },
    );
  }
  return { valid, missing, errors };
}

const CanonicalPackGateExports = {
  CanonicalPackGateError,
  GATE_ERROR_CODES,
  isCanonicalPackGateEnabled,
  validateBeforeGeneration,
};
export default CanonicalPackGateExports;
