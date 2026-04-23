import { isFeatureEnabled } from "../../config/featureFlags.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function phase21GraphicsEnabled() {
  return (
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase21") ||
    isFeatureEnabled("useTrueGeometricSectioningPhase21")
  );
}

export function getSectionLineweights({
  constructionTruthQuality = "weak",
  draftingEvidenceScore = 0,
  profileComplexityScore = 0,
  faceCredibilityScore = 0,
  faceCredibilityQuality = "blocked",
  cutFaceCount = 0,
  cutProfileCount = 0,
} = {}) {
  const normalized = String(constructionTruthQuality || "weak").toLowerCase();
  const confidenceMultiplier =
    normalized === "verified" ? 1 : normalized === "blocked" ? 0.88 : 0.94;
  const draftingBoost = clamp(
    Number(draftingEvidenceScore || 0) * 0.08 +
      Number(profileComplexityScore || 0) * 0.05,
    0,
    0.12,
  );
  const phase21 = phase21GraphicsEnabled();
  const faceBoost = phase21
    ? clamp(
        Number(faceCredibilityScore || 0) * 0.1 +
          Math.min(0.08, Number(cutFaceCount || 0) * 0.025) +
          Math.min(0.04, Number(cutProfileCount || 0) * 0.012),
        0,
        0.16,
      )
    : 0;
  const faceQualityNormalized = String(
    faceCredibilityQuality || "blocked",
  ).toLowerCase();
  const faceQualityMultiplier =
    !phase21 || faceQualityNormalized === "blocked"
      ? 1
      : faceQualityNormalized === "verified"
        ? 1.04
        : 1.02;

  return {
    cutPoche: round(
      clamp(
        3.72 * confidenceMultiplier * faceQualityMultiplier +
          draftingBoost +
          faceBoost,
        2.85,
        4.25,
      ),
    ),
    cutOutline: round(
      clamp(
        2.2 * confidenceMultiplier * faceQualityMultiplier +
          draftingBoost * 0.55 +
          faceBoost * 0.7,
        1.55,
        2.6,
      ),
    ),
    primary: round(
      clamp(
        1.52 * confidenceMultiplier + draftingBoost * 0.34 + faceBoost * 0.32,
        1.18,
        1.84,
      ),
    ),
    secondary: round(
      clamp(
        1.12 * confidenceMultiplier + draftingBoost * 0.26 + faceBoost * 0.24,
        0.88,
        1.36,
      ),
    ),
    tertiary: round(
      clamp(
        0.84 * confidenceMultiplier + draftingBoost * 0.18 + faceBoost * 0.16,
        0.62,
        1.06,
      ),
    ),
    hatch: round(
      clamp(0.7 * confidenceMultiplier + faceBoost * 0.12, 0.5, 0.84),
    ),
    datum: round(clamp(1.18 * confidenceMultiplier, 0.94, 1.28)),
    guide: round(clamp(0.72 * confidenceMultiplier, 0.55, 0.82)),
    phase21,
  };
}

export default {
  getSectionLineweights,
};
