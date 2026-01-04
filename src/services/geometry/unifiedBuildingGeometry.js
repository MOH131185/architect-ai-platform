/**
 * Unified Building Geometry
 *
 * Central geometry representation for building models.
 */

/**
 * Create unified geometry from design state
 * @param {Object} designState - Design state
 * @returns {Object} Unified geometry
 */
export function createUnifiedGeometry(designState) {
  return {
    id: `geom_${Date.now()}`,
    envelope: designState?.geometry?.envelope || {},
    levels: designState?.program?.levels || [],
    openings: [],
    materials: designState?.style?.materials || [],
  };
}

/**
 * Get floor geometry
 * @param {Object} geometry - Unified geometry
 * @param {number} level - Level index
 * @returns {Object|null} Floor geometry
 */
export function getFloorGeometry(geometry, level) {
  if (!geometry?.levels) return null;
  return geometry.levels[level] || null;
}

/**
 * Validate unified geometry
 * @param {Object} geometry - Geometry to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateUnifiedGeometry(geometry) {
  if (!geometry) {
    return { valid: false, errors: ["No geometry"] };
  }
  return { valid: true, errors: [] };
}

export default {
  createUnifiedGeometry,
  getFloorGeometry,
  validateUnifiedGeometry,
};
