/**
 * Image Similarity Service - Stub
 */

export class ControlFidelityGate { }

export const CONTROL_FIDELITY_THRESHOLDS = {
    strict: 0.95,
    high: 0.85,
    medium: 0.75,
    low: 0.60
};

export const imageSimilarityService = {
    compare: () => ({ similarity: 1.0 }),
};

export default {
    ControlFidelityGate,
    imageSimilarityService,
    CONTROL_FIDELITY_THRESHOLDS
};
