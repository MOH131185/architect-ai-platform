/**
 * Material Utilities
 *
 * Helper functions for material handling.
 */

/**
 * Normalize materials to string format
 * @param {Object|Array|string} materials - Materials in various formats
 * @returns {string} Normalized materials string
 */
export function normalizeMaterialsString(materials) {
  if (!materials) return "brick and glass";

  if (typeof materials === "string") {
    return materials;
  }

  if (Array.isArray(materials)) {
    return materials.map((m) => m.name || m).join(", ");
  }

  if (materials.primary) {
    return materials.primary;
  }

  return Object.values(materials)
    .filter((m) => typeof m === "string" || m?.name)
    .map((m) => m.name || m)
    .join(", ");
}

/**
 * Get primary material from materials object
 * @param {Object|Array} materials - Materials
 * @returns {string} Primary material name
 */
export function getPrimaryMaterial(materials) {
  if (!materials) return "brick";

  if (typeof materials === "string") return materials;

  if (Array.isArray(materials) && materials.length > 0) {
    return materials[0].name || materials[0];
  }

  return materials.primary || materials.facade || "brick";
}

export default {
  normalizeMaterialsString,
  getPrimaryMaterial,
};
