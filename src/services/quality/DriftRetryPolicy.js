/**
 * Drift Retry Policy
 *
 * Governs controlled retries when a generated panel drifts from its reference.
 */

export const DRIFT_ELIGIBLE_PANELS = ["interior_3d"];

export const DRIFT_RETRY_CONFIG = {
  maxRetries: 2,
  failThreshold: 0.78,
};

function readSimilarityScore(similarityResult) {
  if (!similarityResult) return 0;
  if (typeof similarityResult.similarityScore === "number") {
    return similarityResult.similarityScore;
  }
  if (typeof similarityResult.similarity === "number") {
    return similarityResult.similarity;
  }
  if (typeof similarityResult.score === "number") {
    return similarityResult.score;
  }
  return 0;
}

export function checkDriftRetryNeeded(
  panelType,
  similarityResult,
  currentAttempt = 0,
) {
  const currentScore = readSimilarityScore(similarityResult);
  const failThreshold = DRIFT_RETRY_CONFIG.failThreshold;
  const failedMetric = currentScore < failThreshold ? "similarityScore" : null;

  return {
    panelType,
    currentAttempt,
    currentScore,
    failThreshold,
    failedMetric,
    needsRetry:
      Boolean(failedMetric) && currentAttempt < DRIFT_RETRY_CONFIG.maxRetries,
  };
}

export function calculateDriftRetryParams(nextAttempt = 1) {
  const attempt = Math.max(1, Number(nextAttempt) || 1);
  const strength = Math.min(0.95, 0.65 + attempt * 0.1);
  const guidance = Math.min(11, 6 + attempt * 1.5);

  return {
    attempt,
    strength,
    guidance,
    promptConstraint:
      "STRICT CONSISTENCY LOCK: Match massing, opening rhythm, material palette, and proportion system from the reference image. ",
  };
}

export function generateDriftRetrySummary(panelType, driftCheck, retryParams) {
  return {
    panelType,
    needsRetry: !!driftCheck?.needsRetry,
    currentScore: driftCheck?.currentScore ?? null,
    failThreshold:
      driftCheck?.failThreshold ?? DRIFT_RETRY_CONFIG.failThreshold,
    failedMetric: driftCheck?.failedMetric || null,
    retryAttempt: retryParams?.attempt ?? null,
    retryStrength: retryParams?.strength ?? null,
    retryGuidance: retryParams?.guidance ?? null,
  };
}

export default {
  DRIFT_ELIGIBLE_PANELS,
  DRIFT_RETRY_CONFIG,
  checkDriftRetryNeeded,
  calculateDriftRetryParams,
  generateDriftRetrySummary,
};
