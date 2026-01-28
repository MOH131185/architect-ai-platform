/**
 * Canonical Pack Gate - Stub
 */

export class CanonicalPackGateError extends Error {}

export const GATE_ERROR_CODES = {
  MISSING_PACK: "MISSING_PACK",
  INVALID_PACK: "INVALID_PACK",
  INCOMPLETE_PACK: "INCOMPLETE_PACK",
};

export function isCanonicalPackGateEnabled() {
  return false;
}

export function validateBeforeGeneration(data) {
  return { valid: true };
}

export default {
  CanonicalPackGateError,
  GATE_ERROR_CODES,
  isCanonicalPackGateEnabled,
  validateBeforeGeneration,
};
