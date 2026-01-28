/**
 * Drift Retry Policy - Stub
 */

export const DRIFT_ELIGIBLE_PANELS = ['floor_plan', 'elevation'];

export const DRIFT_RETRY_CONFIG = {
    maxRetries: 3,
    threshold: 0.8,
};

export function checkDriftRetryNeeded(panel, baseline) {
    return false;
}

export function calculateDriftRetryParams(panel) {
    return {};
}

export function generateDriftRetrySummary(results) {
    return {};
}

export default {
    DRIFT_ELIGIBLE_PANELS,
    DRIFT_RETRY_CONFIG,
    checkDriftRetryNeeded,
    calculateDriftRetryParams,
    generateDriftRetrySummary,
};
