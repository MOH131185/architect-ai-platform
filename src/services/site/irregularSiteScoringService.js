import { interpretSiteConstraints } from "./siteConstraintInterpreter.js";

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function scoreIrregularSite(site = {}, envelope = null) {
  const interpreted = interpretSiteConstraints(site);
  const bbox = interpreted.boundary_bbox || { width: 0, height: 0 };
  const narrowness =
    Math.min(Number(bbox.width || 0), Number(bbox.height || 0)) /
    Math.max(Number(bbox.width || 1), Number(bbox.height || 1));
  const envelopeRatio =
    envelope?.constraints?.buildable_area_ratio ??
    envelope?.buildable_area_ratio ??
    1;
  const complexityScore = roundMetric(
    clamp(
      interpreted.irregularity_score * 0.45 +
        (1 - interpreted.compactness_score) * 0.25 +
        (1 - narrowness) * 0.2 +
        Math.max(0, 0.75 - envelopeRatio) * 0.1,
      0,
      1,
    ),
  );
  const heuristicConfidence = roundMetric(clamp(1 - complexityScore, 0.18, 1));
  const warnings = [...(interpreted.warnings || [])];

  if (narrowness <= 0.42) {
    warnings.push(
      "Site is narrow relative to its depth; deterministic fallback should prefer corridor-efficient bands or columns.",
    );
  }
  if (complexityScore >= 0.58) {
    warnings.push(
      "Site complexity exceeds heuristic comfort; fallback behavior is deterministic but not equivalent to robust polygon packing.",
    );
  }

  return {
    version: "phase5-irregular-site-score-v1",
    complexityScore,
    heuristicConfidence,
    narrowness: roundMetric(narrowness),
    irregularityScore: interpreted.irregularity_score,
    compactnessScore: interpreted.compactness_score,
    envelopeRatio: roundMetric(envelopeRatio),
    siteClass:
      narrowness <= 0.5
        ? "narrow"
        : interpreted.irregularity_score >= 0.1 ||
            (interpreted.warnings || []).length >= 2
          ? "asymmetric"
          : complexityScore >= 0.4
            ? "awkward"
            : "regular",
    warnings,
  };
}

export default {
  scoreIrregularSite,
};
