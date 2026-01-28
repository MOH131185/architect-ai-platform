/**
 * Canonical Geometry Pack Service - Stub
 */

export class CanonicalPackError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export const ERROR_CODES = {
  MISSING_GEOMETRY: "MISSING_GEOMETRY",
  INVALID_PACK: "INVALID_PACK",
};

// Panel types that use canonical geometry
export const CANONICAL_PANEL_TYPES = [];

export function hasCanonicalPack(data) {
  return false;
}

export function buildCanonicalPack(dna) {
  return {};
}

export function getCanonicalPack(data) {
  return null;
}

export function getControlForPanel(pack, panelType) {
  return null;
}

export function getInitImageParams(pack, panelType) {
  return null;
}

export function validateBeforeGeneration(pack) {
  return { valid: true };
}

export default {
  CanonicalPackError,
  ERROR_CODES,
  CANONICAL_PANEL_TYPES,
  hasCanonicalPack,
  buildCanonicalPack,
  getCanonicalPack,
  getControlForPanel,
  getInitImageParams,
  validateBeforeGeneration,
};
