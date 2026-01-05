/**
 * Drift Retry Policy
 *
 * Handles retry logic for drift detection and consistency validation.
 */

/**
 * Default retry policy
 */
export const DEFAULT_RETRY_POLICY = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
};

/**
 * Drift retry configuration
 */
export const DRIFT_RETRY_CONFIG = {
  maxRetries: 3,
  driftThreshold: 0.15,
  consistencyThreshold: 0.85,
};

/**
 * Panels eligible for drift retry
 */
export const DRIFT_ELIGIBLE_PANELS = [
  "hero_3d",
  "elevation_n",
  "elevation_s",
  "elevation_e",
  "elevation_w",
  "section_aa",
  "section_bb",
];

/**
 * Check if drift retry is needed
 * @param {Object} panel - Panel data
 * @param {Object} baselinePanel - Baseline panel
 * @returns {boolean}
 */
export function checkDriftRetryNeeded(panel, baselinePanel) {
  console.log("[DriftRetryPolicy] checkDriftRetryNeeded (stub)");
  return false;
}

/**
 * Calculate drift retry parameters
 * @param {Object} panel - Panel data
 * @param {number} attempt - Current attempt
 * @returns {Object} Retry parameters
 */
export function calculateDriftRetryParams(panel, attempt) {
  return {
    strengthIncrease: 0.1 * attempt,
    guidanceIncrease: 0.5 * attempt,
  };
}

/**
 * Generate drift retry summary
 * @param {Object[]} retryResults - Results from retry attempts
 * @returns {Object} Summary
 */
export function generateDriftRetrySummary(retryResults) {
  return {
    totalRetries: retryResults?.length || 0,
    successful: retryResults?.filter((r) => r?.success)?.length || 0,
    failed: retryResults?.filter((r) => !r?.success)?.length || 0,
  };
}

/**
 * Should retry on drift
 * @param {Object} driftResult - Drift detection result
 * @param {number} attempt - Current attempt
 * @returns {boolean} Whether to retry
 */
export function shouldRetryOnDrift(driftResult, attempt) {
  console.log(
    `[DriftRetryPolicy] shouldRetryOnDrift attempt=${attempt} (stub)`,
  );
  return attempt < DEFAULT_RETRY_POLICY.maxRetries;
}

/**
 * Get retry delay
 * @param {number} attempt - Current attempt
 * @returns {number} Delay in milliseconds
 */
export function getRetryDelay(attempt) {
  const delay = Math.min(
    DEFAULT_RETRY_POLICY.initialDelay *
      Math.pow(DEFAULT_RETRY_POLICY.backoffFactor, attempt),
    DEFAULT_RETRY_POLICY.maxDelay,
  );
  return delay;
}

export default {
  DEFAULT_RETRY_POLICY,
  DRIFT_RETRY_CONFIG,
  DRIFT_ELIGIBLE_PANELS,
  checkDriftRetryNeeded,
  calculateDriftRetryParams,
  generateDriftRetrySummary,
  shouldRetryOnDrift,
  getRetryDelay,
};
