function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function getSectionLineweights({
  constructionTruthQuality = "weak",
  draftingEvidenceScore = 0,
  profileComplexityScore = 0,
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

  return {
    cutPoche: round(
      clamp(3.4 * confidenceMultiplier + draftingBoost, 2.6, 3.75),
    ),
    cutOutline: round(
      clamp(2.05 * confidenceMultiplier + draftingBoost * 0.55, 1.4, 2.28),
    ),
    primary: round(
      clamp(1.45 * confidenceMultiplier + draftingBoost * 0.34, 1.1, 1.68),
    ),
    secondary: round(
      clamp(1.05 * confidenceMultiplier + draftingBoost * 0.26, 0.82, 1.24),
    ),
    tertiary: round(
      clamp(0.78 * confidenceMultiplier + draftingBoost * 0.18, 0.58, 0.94),
    ),
    hatch: round(clamp(0.7 * confidenceMultiplier, 0.5, 0.8)),
    datum: round(clamp(1.1 * confidenceMultiplier, 0.88, 1.2)),
    guide: round(clamp(0.72 * confidenceMultiplier, 0.55, 0.82)),
  };
}

export default {
  getSectionLineweights,
};
