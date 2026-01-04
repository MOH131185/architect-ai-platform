/**
 * Geometry Control Validator
 *
 * Validates geometry renders for consistency.
 */

/**
 * Validate geometry renders
 * @param {Object} renders - Geometry renders object
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateGeometryRenders(renders) {
  const errors = [];

  if (!renders) {
    errors.push("No renders provided");
    return { valid: false, errors };
  }

  // Basic validation - check for required views
  const requiredViews = ["floor_plan_gf", "elevation_n"];
  for (const view of requiredViews) {
    if (!renders[view]) {
      errors.push(`Missing required view: ${view}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if geometry renders are sufficient for generation
 * @param {Object} renders - Geometry renders
 * @returns {boolean}
 */
export function hasValidGeometryRenders(renders) {
  return validateGeometryRenders(renders).valid;
}

export default {
  validateGeometryRenders,
  hasValidGeometryRenders,
};
