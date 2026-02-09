/**
 * Canonical Control Pack Service - Re-export from CanonicalGeometryPackService
 *
 * This file delegates to the canonical implementation while preserving
 * the original export signatures for backward compatibility.
 */

import {
  buildCanonicalPack,
  hasCanonicalPack,
  getControlForPanel,
  validateControlPack,
} from "../canonical/CanonicalGeometryPackService.js";

export const CONTROL_PACK_VIEWS = ["hero_3d", "interior_3d", "axonometric"];

export function generateControlPack(dna) {
  // Legacy shim: attempt to build canonical pack from raw DNA
  // The new service expects CDS but this provides best-effort compat
  try {
    return buildCanonicalPack(dna);
  } catch {
    return {
      views: {},
      metadata: { timestamp: Date.now() },
    };
  }
}

export { hasCanonicalPack as hasControlPack };
export { getControlForPanel };

export function getControlPackDebugReport(pack) {
  if (!pack) return { status: "stub" };
  const validation = validateControlPack(pack);
  return {
    status: pack.status || "unknown",
    panelCount: pack.panelCount || 0,
    geometryHash: pack.geometryHash || null,
    validation,
  };
}

export { validateControlPack };

// Map panels to their canonical control views
export const PANEL_TO_CONTROL_MAP = {
  hero_3d: "hero_3d",
  interior_3d: "interior_3d",
  axonometric: "axonometric",
};

export function saveControlPackToDebugFolder(pack, folder) {
  return null;
}

const CanonicalControlPackServiceExports = {
  CONTROL_PACK_VIEWS,
  PANEL_TO_CONTROL_MAP,
  generateControlPack,
  hasControlPack: hasCanonicalPack,
  getControlForPanel,
  getControlPackDebugReport,
  validateControlPack,
  saveControlPackToDebugFolder,
};
export default CanonicalControlPackServiceExports;
