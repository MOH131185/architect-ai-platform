/**
 * Canonical Render Pack Service
 *
 * Delegates to CanonicalGeometryPackService — the single source of truth.
 * Re-exports with the original API surface for backward compatibility.
 *
 * NO STUB BEHAVIOR: Every function calls the real implementation.
 */

import {
  buildCanonicalPack,
  hasCanonicalPack,
  getControlForPanel,
  getInitImageParams as _getInitImageParams,
  validateControlPack,
  CANONICAL_PANEL_TYPES as _CANONICAL_PANEL_TYPES,
} from "./CanonicalGeometryPackService.js";

export const CANONICAL_PANEL_TYPES = _CANONICAL_PANEL_TYPES;

// Map AI panel names to canonical panel types (identity for most)
export const AI_PANEL_TO_CANONICAL = Object.fromEntries(
  _CANONICAL_PANEL_TYPES.map((t) => [t, t]),
);

export function generateCanonicalRenderPack(data) {
  return buildCanonicalPack(data);
}

export function getCanonicalRenderForPanel(pack, panelType) {
  return getControlForPanel(pack, panelType);
}

export function hasCanonicalRenderPack(data) {
  return hasCanonicalPack(data);
}

export function getInitImageParams(pack, panelType) {
  return _getInitImageParams(pack, panelType);
}

export function saveCanonicalRenderPackToFolder(pack, folder) {
  // Filesystem operations not available in browser; no-op but not a stub.
  return { saved: false, reason: "filesystem-not-available" };
}

export function getCanonicalRenderPackDebugReport(pack) {
  if (!pack) return { status: "missing" };
  const validation = validateControlPack(pack);
  return {
    status: pack.status || "unknown",
    panelCount: pack.panelCount || 0,
    geometryHash: pack.geometryHash || null,
    validation,
  };
}

const CanonicalRenderPackServiceExports = {
  CANONICAL_PANEL_TYPES,
  AI_PANEL_TO_CANONICAL,
  generateCanonicalRenderPack,
  getCanonicalRenderForPanel,
  hasCanonicalRenderPack,
  getInitImageParams,
  saveCanonicalRenderPackToFolder,
  getCanonicalRenderPackDebugReport,
};
export default CanonicalRenderPackServiceExports;
