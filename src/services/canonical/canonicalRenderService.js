/**
 * Canonical Render Service - Stub
 *
 * Provides canonical 3D render generation for panel consistency.
 */

// Constants
export const MANDATORY_3D_PANELS = ["hero_3d", "interior_3d", "axonometric"];
export const CANONICAL_3D_VIEWS = ["exterior", "interior", "aerial"];
export const CANONICAL_3D_STRENGTH_POLICY = {
  hero_3d: 0.65,
  interior_3d: 0.65,
  axonometric: 0.55,
};
export const CANONICAL_3D_NEGATIVE_PROMPTS = {
  hero_3d: "blurry, distorted, low quality, watermark",
  interior_3d: "blurry, distorted, low quality, watermark, empty room",
  axonometric:
    "blurry, distorted, low quality, watermark, perspective distortion",
};

// Functions
export function generateCanonical3DRenders(params) {
  return null;
}

export function getCanonical3DRender(renders, panelType) {
  return null;
}

export function requireCanonical3DRender(renders, panelType) {
  return null;
}

export function requiresCanonical3DRender(panelType) {
  return false;
}

export function getCanonical3DInitParams(data, panelType) {
  return null;
}

export function buildCanonical3DNegativePrompt(params) {
  return CANONICAL_3D_NEGATIVE_PROMPTS[params?.panelType] || "";
}

export function hasCanonical3DRenders(data) {
  return false;
}

export function getCanonical3DDebugReport(renders) {
  return {};
}

export function validateCanonical3DRenders(renders) {
  return { valid: true, errors: [] };
}

export default {
  MANDATORY_3D_PANELS,
  CANONICAL_3D_VIEWS,
  CANONICAL_3D_STRENGTH_POLICY,
  CANONICAL_3D_NEGATIVE_PROMPTS,
  generateCanonical3DRenders,
  getCanonical3DRender,
  requireCanonical3DRender,
  requiresCanonical3DRender,
  getCanonical3DInitParams,
  buildCanonical3DNegativePrompt,
  hasCanonical3DRenders,
  getCanonical3DDebugReport,
  validateCanonical3DRenders,
};
