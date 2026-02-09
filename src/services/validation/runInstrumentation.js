/**
 * Run Instrumentation - Snapshot & Metrics Logger
 *
 * Captures gate reports, CDS state, program lock, and panel manifests
 * for audit and debugging. In browser, stores to sessionStorage.
 * In Node, writes to debug_runs/ directory.
 */

const RUN_STORAGE_KEY = "archiAI_debug_runs";

/**
 * Save a run snapshot (browser: sessionStorage, Node: fs).
 *
 * @param {string} designId
 * @param {Object} artifacts - { cds, programLock, panelManifest, gateProgram, gateDrift }
 */
export function saveRunSnapshot(designId, artifacts) {
  const snapshot = {
    designId,
    timestamp: new Date().toISOString(),
    ...artifacts,
  };

  // Browser: sessionStorage
  if (typeof sessionStorage !== "undefined") {
    try {
      const runs = JSON.parse(sessionStorage.getItem(RUN_STORAGE_KEY) || "{}");
      runs[designId] = snapshot;
      // Keep last 10 runs max
      const keys = Object.keys(runs);
      if (keys.length > 10) {
        delete runs[keys[0]];
      }
      sessionStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(runs));
    } catch (e) {
      console.warn(
        "[RunInstrumentation] Failed to save to sessionStorage:",
        e.message,
      );
    }
    return;
  }

  // Node: write to debug_runs/ directory
  try {
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(process.cwd(), "debug_runs", designId);
    fs.mkdirSync(dir, { recursive: true });

    if (artifacts.cds) {
      fs.writeFileSync(
        path.join(dir, "cds.json"),
        JSON.stringify(artifacts.cds, null, 2),
      );
    }
    if (artifacts.programLock) {
      fs.writeFileSync(
        path.join(dir, "program_lock.json"),
        JSON.stringify(artifacts.programLock, null, 2),
      );
    }
    if (artifacts.panelManifest) {
      fs.writeFileSync(
        path.join(dir, "panel_manifest.json"),
        JSON.stringify(artifacts.panelManifest, null, 2),
      );
    }
    if (artifacts.gateProgram) {
      fs.writeFileSync(
        path.join(dir, "gate_program.json"),
        JSON.stringify(artifacts.gateProgram, null, 2),
      );
    }
    if (artifacts.gateDrift) {
      fs.writeFileSync(
        path.join(dir, "gate_drift.json"),
        JSON.stringify(artifacts.gateDrift, null, 2),
      );
    }
    if (artifacts.cds?.hash) {
      fs.writeFileSync(path.join(dir, "cds_hash.txt"), artifacts.cds.hash);
    }
  } catch {
    // Non-fatal in both environments
  }
}

/**
 * Build a panel manifest from generated panels.
 *
 * @param {Array} panels - [{ type, seed, imageUrl, meta }]
 * @param {Object} cds - Canonical Design State
 * @returns {Object} manifest
 */
export function buildPanelManifest(panels, cds, programLock) {
  return {
    timestamp: new Date().toISOString(),
    cdsHash: cds?.hash || null,
    programLockHash: programLock?.hash || null,
    panelCount: panels?.length || 0,
    panels: (panels || []).map((p) => ({
      panelType: p.type || p.panelType,
      seed: p.seed,
      controlSource:
        p._controlSource?.type || p.meta?.controlSource || "text-only",
      controlHash: p._controlSource?.imageHash || null,
      designFingerprint: p.meta?.designFingerprint || null,
      hasSVG: !!p.svgPanel,
      hasInitImage: !!p.meta?.hasInitImage,
      cdsHash: p.cdsHash || p.meta?.cdsHash || null,
      programLockHash: p.programLockHash || p.meta?.programLockHash || null,
      geometryHash: p.geometryHash || p.meta?.geometryHash || null,
    })),
  };
}

/**
 * Get metrics summary from a generation run.
 *
 * @param {Object} params
 * @returns {Object} metrics
 */
export function computeRunMetrics({
  programLock,
  gateProgram,
  gateDrift,
  panels,
  cds,
}) {
  return {
    program_violation_count: gateProgram?.violations?.length || 0,
    level_mismatch_count:
      gateProgram?.violations?.filter((v) => v.includes("level"))?.length || 0,
    control_image_coverage_rate: panels
      ? panels.filter((p) => p.meta?.hasInitImage || p._controlSource).length /
        panels.length
      : 0,
    drift_score_max: gateDrift?.driftScore || 0,
    seed_reuse_rate: cds?.seed ? 1.0 : 0,
    program_lock_hash: programLock?.hash || null,
    cds_hash: cds?.hash || null,
  };
}

/**
 * Retrieve a saved run snapshot.
 */
export function getRunSnapshot(designId) {
  if (typeof sessionStorage !== "undefined") {
    try {
      const runs = JSON.parse(sessionStorage.getItem(RUN_STORAGE_KEY) || "{}");
      return runs[designId] || null;
    } catch {
      return null;
    }
  }
  return null;
}

export default {
  saveRunSnapshot,
  buildPanelManifest,
  computeRunMetrics,
  getRunSnapshot,
};
