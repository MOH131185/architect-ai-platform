/**
 * Unit Conversion Utilities
 *
 * Standard architectural unit conversion functions.
 * Internal representation uses millimeters for precision;
 * user-facing values are in metres.
 */

/** Millimeters per metre */
export const MM_PER_M = 1000;

/**
 * Convert metres to millimeters (integer).
 * @param {number} metres
 * @returns {number}
 */
export function toMM(metres) {
  return Math.round(metres * MM_PER_M);
}

/**
 * Safe metres-to-mm conversion: clamps non-finite / negative values to 0.
 * @param {number} metres
 * @returns {number}
 */
export function toMSafe(metres) {
  if (typeof metres !== "number" || !isFinite(metres) || metres < 0) return 0;
  return Math.round(metres * MM_PER_M);
}

/**
 * Convert area in m² to area in mm².
 * @param {number} areaM2
 * @returns {number}
 */
export function areaToMM2(areaM2) {
  return areaM2 * MM_PER_M * MM_PER_M;
}

/**
 * Validate that a numeric value is a positive finite number.
 * @param {*} value
 * @param {string} [label]
 * @returns {boolean}
 */
export function validateUnit(value, label = "value") {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    return false;
  }
  return true;
}
