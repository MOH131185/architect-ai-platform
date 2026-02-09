/**
 * ComposeGate - Central pre-composition validation orchestrator
 *
 * Fail-closed: blocks A1 composition if ANY gate check fails.
 *
 * Validates:
 *  1. All panels carry an identical geometry hash
 *  2. All required technical panels are present (floor_plan_ground, elevation_north,
 *     elevation_south, section_a_a at minimum)
 *  3. Program compliance (checkpoint 3 — pre-compose)
 *  4. Geometry hash matches CDS source of truth
 *  5. dna_hash, geometry_hash, program_hash are available for A1 metadata
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import { computeCDSHashSync } from "./cdsHash.js";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ComposeGateError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "ComposeGateError";
    this.code = code;
    this.details = details;
  }
}

export const COMPOSE_ERROR_CODES = {
  MISSING_PANELS: "MISSING_PANELS",
  GEOMETRY_HASH_MISSING: "GEOMETRY_HASH_MISSING",
  GEOMETRY_HASH_MISMATCH: "GEOMETRY_HASH_MISMATCH",
  CDS_HASH_MISMATCH: "CDS_HASH_MISMATCH",
  PROGRAM_HASH_MISMATCH: "PROGRAM_HASH_MISMATCH",
  METADATA_INCOMPLETE: "METADATA_INCOMPLETE",
};

// Minimum required technical panel types for a valid A1 sheet
const REQUIRED_TECHNICAL_PANELS = [
  "floor_plan_ground",
  "elevation_north",
  "elevation_south",
  "section_a_a",
];

// ---------------------------------------------------------------------------
// Main gate
// ---------------------------------------------------------------------------

/**
 * Validate all panels before allowing A1 composition.
 *
 * @param {Array} panels - Generated panel results [{ type, geometryHash, cdsHash, ... }]
 * @param {Object} cds - Canonical Design State (source of truth)
 * @param {Object} programLock - ProgramSpacesLock
 * @param {Object} canonicalPack - Canonical geometry pack (from CanonicalGeometryPackService)
 * @param {Object} [options]
 * @param {boolean} [options.strict=true] - Throw on failure (fail-closed)
 * @returns {{ valid: boolean, errors: string[], metadata: Object }}
 * @throws {ComposeGateError} in strict mode when validation fails
 */
export function validateBeforeCompose(
  panels,
  cds,
  programLock,
  canonicalPack,
  options = {},
) {
  const { strict = true } = options;
  const errors = [];

  const enforceGeometry = isFeatureEnabled("geometryAuthorityMandatory");

  // ----- 1. Required technical panels present -----
  const presentTypes = new Set(
    (panels || []).map((p) => p.type || p.panelType),
  );
  const missingPanels = REQUIRED_TECHNICAL_PANELS.filter(
    (t) => !presentTypes.has(t),
  );
  if (missingPanels.length > 0) {
    errors.push(
      `Missing required technical panels: ${missingPanels.join(", ")}`,
    );
  }

  // ----- 2. All panels carry geometry hash -----
  if (enforceGeometry) {
    const panelsWithoutHash = (panels || []).filter(
      (p) => !p.geometryHash && !p.meta?.geometryHash,
    );
    if (panelsWithoutHash.length > 0) {
      const names = panelsWithoutHash.map((p) => p.type || p.panelType);
      errors.push(
        `Panels missing geometryHash (geometry authority mandatory): ${names.join(", ")}`,
      );
    }
  }

  // ----- 3. All geometry hashes are identical -----
  const hashes = (panels || [])
    .map((p) => p.geometryHash || p.meta?.geometryHash)
    .filter(Boolean);
  const uniqueHashes = new Set(hashes);
  if (uniqueHashes.size > 1) {
    errors.push(
      `Geometry hash mismatch across panels: ${uniqueHashes.size} distinct hashes found`,
    );
  }

  // ----- 4. Geometry hash matches canonical pack -----
  const referenceGeoHash =
    canonicalPack?.geometryHash || (hashes.length > 0 ? hashes[0] : null);
  if (
    enforceGeometry &&
    canonicalPack?.geometryHash &&
    hashes.length > 0 &&
    hashes[0] !== canonicalPack.geometryHash
  ) {
    errors.push(
      `Panel geometry hash does not match canonical pack geometry hash`,
    );
  }

  // ----- 5. CDS hash consistency -----
  if (cds?.hash) {
    const panelCdsHashes = (panels || []).map((p) => p.cdsHash).filter(Boolean);
    for (const h of panelCdsHashes) {
      if (h !== cds.hash) {
        errors.push(
          `Panel cdsHash differs from active CDS — possible stale panel`,
        );
        break;
      }
    }
  }

  // ----- 6. Program lock hash consistency -----
  const expectedProgramHash =
    programLock?.hash || (programLock ? computeCDSHashSync(programLock) : null);

  // ----- 7. Build compose metadata (always, even if errors) -----
  const metadata = {
    dna_hash: cds?.dnaHash || cds?.program?.dnaHash || null,
    geometry_hash: referenceGeoHash || null,
    program_hash: expectedProgramHash || null,
    panel_count: (panels || []).length,
    timestamp: new Date().toISOString(),
  };

  // ----- Finalize -----
  const valid = errors.length === 0;
  if (!valid && strict) {
    throw new ComposeGateError(
      `ComposeGate FAILED: ${errors.length} error(s)\n` +
        errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n"),
      errors[0]?.includes("Missing required")
        ? COMPOSE_ERROR_CODES.MISSING_PANELS
        : COMPOSE_ERROR_CODES.GEOMETRY_HASH_MISMATCH,
      { errors, metadata },
    );
  }

  return { valid, errors, metadata };
}

const ComposeGateExports = {
  ComposeGateError,
  COMPOSE_ERROR_CODES,
  REQUIRED_TECHNICAL_PANELS,
  validateBeforeCompose,
};
export default ComposeGateExports;
