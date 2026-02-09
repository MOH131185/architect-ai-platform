/**
 * Canonical Pack Builder
 *
 * Delegates to CanonicalGeometryPackService — the single source of truth
 * for canonical geometry pack construction. This module re-exports the
 * real implementation to preserve backward-compatible import paths.
 *
 * NO STUB BEHAVIOR: Every function calls the real implementation.
 */

import {
  buildCanonicalPack as _buildCanonicalPack,
  hasCanonicalPack as _hasCanonicalPack,
  getCanonicalPack as _getCanonicalPack,
  getControlForPanel as _getCanonicalRender,
} from "./CanonicalGeometryPackService.js";

export const PACK_STATUS = {
  EMPTY: "EMPTY",
  PARTIAL: "PARTIAL",
  COMPLETE: "COMPLETE",
};

export function buildCanonicalPack(data) {
  return _buildCanonicalPack(data);
}

export function hasCanonicalPack(data) {
  return _hasCanonicalPack(data);
}

export function getCanonicalPack(data) {
  return _getCanonicalPack(data);
}

export function getCanonicalRender(pack, view) {
  return _getCanonicalRender(pack, view);
}

const CanonicalPackBuilderExports = {
  PACK_STATUS,
  buildCanonicalPack,
  hasCanonicalPack,
  getCanonicalPack,
  getCanonicalRender,
};
export default CanonicalPackBuilderExports;
