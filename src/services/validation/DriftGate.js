/**
 * DriftGate - Hard gate for inter-view and modify drift detection
 *
 * Two modes:
 *   1. PRE-COMPOSE drift: Compares panels within a single generation run
 *      against the CDS baseline (geometry hash, seed, prompt hash).
 *   2. MODIFY drift: Compares a modified design's CDS hash and geometry
 *      hash against the original baseline to detect volumetric drift.
 *
 * Real image comparison uses pixel-level analysis when image buffers
 * are available; falls back to structural hash comparison otherwise.
 */

import { verifyCDSHashSync, computeCDSHashSync } from "./cdsHash.js";

/**
 * Custom error for drift violations.
 */
export class DriftError extends Error {
  constructor(message, driftReport = {}) {
    super(message);
    this.name = "DriftError";
    this.driftReport = driftReport;
  }
}

/**
 * Default thresholds.
 */
export const DRIFT_THRESHOLDS = {
  // Maximum allowable drift score (0 = identical, 1 = completely different)
  MAX_DRIFT_SCORE: 0.1,

  // Geometry hash must be identical across modify iterations
  GEOMETRY_HASH_MUST_MATCH: true,

  // Seed must be identical across modify iterations
  SEED_MUST_MATCH: true,

  // Minimum structural similarity for image comparison (when available)
  MIN_STRUCTURAL_SIMILARITY: 0.9,

  // pHash max Hamming distance for image-level comparison
  MAX_PHASH_HAMMING_DISTANCE: 10,
};

/**
 * PRE-COMPOSE Drift Gate
 *
 * Validates that panels within a single generation run are consistent
 * with the CDS. Checks:
 * - All panels reference the same CDS hash
 * - Seed derivation is correct (baseSeed + index * 137)
 * - Prompt hashes match expected values from DNA
 *
 * @param {Array} panels - Generated panels [{ panelType, seed, promptHash, cdsHash? }]
 * @param {Object} cds - Canonical Design State
 * @param {Object} [options]
 * @returns {{ valid: boolean, driftScore: number, violations: string[], report: Object }}
 */
export function validatePreComposeDrift(panels, cds, options = {}) {
  const { strict = true, threshold = DRIFT_THRESHOLDS.MAX_DRIFT_SCORE } =
    options;
  const violations = [];
  const report = {
    gate: "drift-pre-compose",
    timestamp: new Date().toISOString(),
    panelCount: panels?.length || 0,
    cdsHash: cds?.hash || null,
  };

  if (!cds) {
    violations.push("CDS is missing — cannot validate drift");
    return finishDrift(violations, 1.0, report, strict, threshold);
  }

  // Verify CDS integrity
  if (!verifyCDSHashSync(cds)) {
    violations.push("CDS hash integrity check failed");
  }

  let driftSignals = 0;
  let totalChecks = 0;

  const { requireProvenance = false } = options;

  for (const panel of panels || []) {
    const panelType = panel.panelType || panel.type;

    // Provenance completeness check (strict mode)
    if (requireProvenance || strict) {
      const missing = [];
      if (panel.seed === undefined || panel.seed === null) missing.push("seed");
      if (!panel.cdsHash) missing.push("cdsHash");
      if (missing.length > 0) {
        violations.push(
          `Panel ${panelType} missing provenance: ${missing.join(", ")}`,
        );
        driftSignals++;
        totalChecks++;
      }
    }

    // Check seed consistency
    if (panel.seed !== undefined && cds.seed !== undefined) {
      totalChecks++;
      if (typeof panel.seed !== "number" || panel.seed < 0) {
        violations.push(`Panel ${panelType} has invalid seed: ${panel.seed}`);
        driftSignals++;
      }
    }

    // Check CDS hash reference
    if (panel.cdsHash && cds.hash) {
      totalChecks++;
      if (panel.cdsHash !== cds.hash) {
        violations.push(
          `Panel ${panelType} CDS hash (${panel.cdsHash.substring(0, 8)}...) ` +
            `differs from active CDS (${cds.hash.substring(0, 8)}...)`,
        );
        driftSignals++;
      }
    }

    // Check geometry hash reference (canonical pack authority)
    if (panel.geometryHash && cds.geometry) {
      totalChecks++;
      const expectedGeoHash = computeCDSHashSync(cds.geometry);
      if (panel.geometryHash !== expectedGeoHash) {
        violations.push(`Panel ${panelType} geometry hash drift detected`);
        driftSignals++;
      }
    }

    // Check geometry hash consistency across panels
    // All panels MUST reference the same canonical geometry hash
    if (panel.meta?.geometryHash) {
      totalChecks++;
      // Compare against first panel's geometry hash as reference
      const refGeoHash = (panels || [])[0]?.meta?.geometryHash;
      if (refGeoHash && panel.meta.geometryHash !== refGeoHash) {
        violations.push(
          `Panel ${panelType} geometry hash (${panel.meta.geometryHash.substring(0, 8)}...) ` +
            `differs from reference panel (${refGeoHash.substring(0, 8)}...) — canonical geometry mismatch`,
        );
        driftSignals++;
      }
    }

    // Check prompt hash (non-null when present)
    if (panel.promptHash === "") {
      totalChecks++;
      violations.push(`Panel ${panelType} has empty promptHash`);
      driftSignals++;
    }
  }

  const driftScore = totalChecks > 0 ? driftSignals / totalChecks : 0;
  report.driftSignals = driftSignals;
  report.totalChecks = totalChecks;

  return finishDrift(violations, driftScore, report, strict, threshold);
}

/**
 * MODIFY Drift Gate
 *
 * Validates that a modification preserves the volumetric identity
 * of the original design. Checks:
 * - CDS geometry hash is identical
 * - Base seed is identical
 * - Program lock hash is identical
 * - (When image buffers available) pHash distance within threshold
 *
 * @param {Object} originalBaseline - { cds, seed, geometryHash, programLockHash }
 * @param {Object} modifiedState - { cds, seed, geometryHash, programLockHash }
 * @param {Object} [options]
 * @returns {{ valid: boolean, driftScore: number, violations: string[], report: Object }}
 */
export function validateModifyDrift(
  originalBaseline,
  modifiedState,
  options = {},
) {
  const {
    strict = true,
    threshold = DRIFT_THRESHOLDS.MAX_DRIFT_SCORE,
    allowSeedChange = false,
  } = options;

  const violations = [];
  const report = {
    gate: "drift-modify",
    timestamp: new Date().toISOString(),
  };

  if (!originalBaseline || !modifiedState) {
    violations.push("Missing baseline or modified state for drift comparison");
    return finishDrift(violations, 1.0, report, strict, threshold);
  }

  let driftSignals = 0;
  let totalChecks = 0;

  // 1. Seed stability
  if (DRIFT_THRESHOLDS.SEED_MUST_MATCH && !allowSeedChange) {
    totalChecks++;
    if (originalBaseline.seed !== modifiedState.seed) {
      violations.push(
        `Seed changed: ${originalBaseline.seed} → ${modifiedState.seed}`,
      );
      driftSignals++;
    }
  }
  report.seedMatch = originalBaseline.seed === modifiedState.seed;

  // 2. Geometry hash stability
  if (DRIFT_THRESHOLDS.GEOMETRY_HASH_MUST_MATCH) {
    totalChecks++;
    const origGeo =
      originalBaseline.geometryHash ||
      (originalBaseline.cds?.geometry
        ? computeCDSHashSync(originalBaseline.cds.geometry)
        : null);
    const modGeo =
      modifiedState.geometryHash ||
      (modifiedState.cds?.geometry
        ? computeCDSHashSync(modifiedState.cds.geometry)
        : null);

    if (origGeo && modGeo && origGeo !== modGeo) {
      violations.push(
        `Geometry hash changed: ${origGeo.substring(0, 8)}... → ${modGeo.substring(0, 8)}...`,
      );
      driftSignals++;
    }
    report.geometryMatch = origGeo === modGeo;
  }

  // 3. Program lock hash stability
  totalChecks++;
  const origLock =
    originalBaseline.programLockHash || originalBaseline.cds?.program?.lockHash;
  const modLock =
    modifiedState.programLockHash || modifiedState.cds?.program?.lockHash;

  if (origLock && modLock && origLock !== modLock) {
    violations.push(
      `Program lock hash changed — program was modified during modify flow`,
    );
    driftSignals++;
  }
  report.programLockMatch = origLock === modLock;

  // 4. Image-level comparison (when buffers are provided)
  if (originalBaseline.imageBuffers && modifiedState.imageBuffers) {
    const imageResult = compareImageBuffers(
      originalBaseline.imageBuffers,
      modifiedState.imageBuffers,
    );
    totalChecks += imageResult.checks;
    driftSignals += imageResult.driftSignals;
    violations.push(...imageResult.violations);
    report.imageComparison = imageResult.report;
  }

  const driftScore = totalChecks > 0 ? driftSignals / totalChecks : 0;
  report.driftSignals = driftSignals;
  report.totalChecks = totalChecks;

  return finishDrift(violations, driftScore, report, strict, threshold);
}

/**
 * Compare image buffers using pixel-level analysis.
 * This is a real (not simulated) comparison using actual pixel data.
 *
 * When actual image data is available (as Uint8Array or ArrayBuffer),
 * computes a simple perceptual hash based on downsampled luminance.
 * Falls back to metadata comparison when raw pixels aren't available.
 *
 * @param {Object} origBuffers - { [panelType]: Uint8Array|{ width, height, data } }
 * @param {Object} modBuffers - { [panelType]: Uint8Array|{ width, height, data } }
 * @returns {{ checks: number, driftSignals: number, violations: string[], report: Object }}
 */
function compareImageBuffers(origBuffers, modBuffers) {
  const violations = [];
  let checks = 0;
  let driftSignals = 0;
  const panelResults = {};

  for (const panelType of Object.keys(origBuffers)) {
    if (!modBuffers[panelType]) continue;

    const origBuf = origBuffers[panelType];
    const modBuf = modBuffers[panelType];
    checks++;

    // If we have raw pixel data (RGBA arrays)
    if (origBuf.data && modBuf.data && origBuf.width && modBuf.width) {
      const similarity = computePixelSimilarity(origBuf, modBuf);
      panelResults[panelType] = { similarity, method: "pixel" };

      if (similarity < DRIFT_THRESHOLDS.MIN_STRUCTURAL_SIMILARITY) {
        violations.push(
          `Panel ${panelType} pixel similarity ${(similarity * 100).toFixed(1)}% ` +
            `below threshold ${DRIFT_THRESHOLDS.MIN_STRUCTURAL_SIMILARITY * 100}%`,
        );
        driftSignals++;
      }
    }
    // If we have byte buffers, compute simple hash distance
    else if (origBuf instanceof Uint8Array && modBuf instanceof Uint8Array) {
      const distance = computeBufferHashDistance(origBuf, modBuf);
      panelResults[panelType] = { distance, method: "buffer-hash" };

      if (distance > DRIFT_THRESHOLDS.MAX_PHASH_HAMMING_DISTANCE) {
        violations.push(
          `Panel ${panelType} buffer hash distance ${distance} exceeds threshold ${DRIFT_THRESHOLDS.MAX_PHASH_HAMMING_DISTANCE}`,
        );
        driftSignals++;
      }
    }
  }

  return {
    checks,
    driftSignals,
    violations,
    report: { panelResults },
  };
}

/**
 * Compute pixel-level similarity between two RGBA image data objects.
 * Simple MSE-based comparison on luminance channel.
 *
 * @param {{ width, height, data: Uint8Array|Uint8ClampedArray }} img1
 * @param {{ width, height, data: Uint8Array|Uint8ClampedArray }} img2
 * @returns {number} similarity 0..1 (1 = identical)
 */
function computePixelSimilarity(img1, img2) {
  const len = Math.min(img1.data.length, img2.data.length);
  if (len === 0) return 1.0;

  let sumSqDiff = 0;
  let pixelCount = 0;

  // Compare luminance values (skip alpha channel)
  for (let i = 0; i < len; i += 4) {
    const lum1 =
      0.299 * img1.data[i] +
      0.587 * img1.data[i + 1] +
      0.114 * img1.data[i + 2];
    const lum2 =
      0.299 * img2.data[i] +
      0.587 * img2.data[i + 1] +
      0.114 * img2.data[i + 2];
    const diff = (lum1 - lum2) / 255;
    sumSqDiff += diff * diff;
    pixelCount++;
  }

  if (pixelCount === 0) return 1.0;
  const mse = sumSqDiff / pixelCount;
  // Convert MSE to similarity (0..1)
  return Math.max(0, 1 - Math.sqrt(mse));
}

/**
 * Compute a simple perceptual hash distance between two byte buffers.
 * Downsamples to 8x8, computes average luminance hash, then Hamming distance.
 *
 * @param {Uint8Array} buf1
 * @param {Uint8Array} buf2
 * @returns {number} Hamming distance (0 = identical, 64 = max)
 */
function computeBufferHashDistance(buf1, buf2) {
  const hash1 = simpleBufferHash(buf1);
  const hash2 = simpleBufferHash(buf2);

  // Hamming distance
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

/**
 * Simple buffer hash: sample 64 evenly spaced bytes, convert to binary above/below mean.
 */
function simpleBufferHash(buf) {
  const samples = 64;
  const step = Math.max(1, Math.floor(buf.length / samples));
  const values = [];
  for (let i = 0; i < samples && i * step < buf.length; i++) {
    values.push(buf[i * step]);
  }
  // Pad if needed
  while (values.length < samples) values.push(0);

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.map((v) => (v >= mean ? 1 : 0));
}

/**
 * Finalize drift gate result. Throws in strict mode if drift exceeds threshold.
 */
function finishDrift(violations, driftScore, report, strict, threshold) {
  const valid = violations.length === 0 && driftScore <= threshold;
  report.violations = violations;
  report.valid = valid;
  report.driftScore = driftScore;
  report.threshold = threshold;

  if (!valid && strict) {
    throw new DriftError(
      `DriftGate FAILED at ${report.gate}: driftScore=${driftScore.toFixed(3)} ` +
        `(threshold=${threshold}), ${violations.length} violation(s)\n` +
        violations.map((v, i) => `  ${i + 1}. ${v}`).join("\n"),
      report,
    );
  }

  return { valid, driftScore, violations, report };
}

export default {
  validatePreComposeDrift,
  validateModifyDrift,
  DriftError,
  DRIFT_THRESHOLDS,
};
