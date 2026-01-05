/**
 * Geometry First Gate
 *
 * Validates geometry-first pipeline requirements.
 */

/**
 * Enforce geometry first gate
 * @param {Object} designState - Design state
 * @returns {Promise<{passed: boolean, issues: string[]}>}
 */
export async function enforceGeometryFirstGate(designState) {
  console.log("[GeometryFirstGate] enforceGeometryFirstGate (stub)");
  return {
    passed: true,
    issues: [],
  };
}

/**
 * Extract geometry stats
 * @param {Object} designState - Design state
 * @returns {Object} Geometry statistics
 */
export function extractGeometryStats(designState) {
  return {
    totalArea: 0,
    floorCount: 0,
    roomCount: 0,
    hasValidGeometry: true,
  };
}

export default {
  enforceGeometryFirstGate,
  extractGeometryStats,
};
