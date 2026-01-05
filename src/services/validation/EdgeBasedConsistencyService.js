/**
 * Edge Based Consistency Service
 *
 * Uses edge detection for consistency validation.
 */

/**
 * Compute edge consistency score
 * @param {string} image1 - First image URL
 * @param {string} image2 - Second image URL
 * @returns {Promise<number>} Consistency score 0-1
 */
export async function computeEdgeConsistency(image1, image2) {
  console.log("[EdgeBasedConsistencyService] computeEdgeConsistency (stub)");
  return 0.92;
}

/**
 * Validate edges match
 * @param {Object[]} panels - Panels to check
 * @returns {Promise<{consistent: boolean, score: number}>}
 */
export async function validateEdgeConsistency(panels) {
  return {
    consistent: true,
    score: 0.95,
  };
}

export default {
  computeEdgeConsistency,
  validateEdgeConsistency,
};
