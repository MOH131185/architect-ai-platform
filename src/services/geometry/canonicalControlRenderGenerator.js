/**
 * Canonical Control Render Generator - Re-export from CanonicalGeometryPackService
 *
 * Delegates to the canonical implementation while preserving
 * the original export signatures for backward compatibility.
 */

import {
  buildCanonicalPack,
  hasCanonicalPack,
  getControlForPanel as canonicalGetControlForPanel,
} from "../canonical/CanonicalGeometryPackService.js";

export function hasControlRenders(data) {
  return hasCanonicalPack(data);
}

export function getControlImageForPanel(data, panelType) {
  const pack = data?.canonicalPack || data;
  return canonicalGetControlForPanel(pack, panelType);
}

export function getControlImageDebugReport(data) {
  if (!data) return {};
  const pack = data?.canonicalPack || data;
  return {
    status: pack?.status || "unknown",
    panelCount: pack?.panelCount || 0,
    geometryHash: pack?.geometryHash || null,
  };
}

export function generateCanonicalControlRenders(dna) {
  try {
    const pack = buildCanonicalPack(dna);
    return {
      renders: pack.panels || {},
      timestamp: Date.now(),
      geometryHash: pack.geometryHash,
    };
  } catch {
    return {
      renders: {},
      timestamp: Date.now(),
    };
  }
}

export function requireControlImageForPanel(data, panelType) {
  return getControlImageForPanel(data, panelType);
}

const canonicalControlRenderGeneratorExports = {
  hasControlRenders,
  getControlImageForPanel,
  getControlImageDebugReport,
  generateCanonicalControlRenders,
  requireControlImageForPanel,
};
export default canonicalControlRenderGeneratorExports;
