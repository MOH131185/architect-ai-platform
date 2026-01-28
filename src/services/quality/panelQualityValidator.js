/**
 * Panel Quality Validator - Stub
 */

export const QUALITY_THRESHOLDS = {
    MIN_SIMILARITY: 0.7,
    MIN_RESOLUTION: 512,
};

export function validatePanel(panel) {
    return { valid: true };
}

export function validatePanelBatch(panels) {
    return { valid: true };
}

export function getPanelsForRegeneration(panels) {
    return [];
}

export default {
    QUALITY_THRESHOLDS,
    validatePanel,
    validatePanelBatch,
    getPanelsForRegeneration,
};
