import { scoreIrregularSite } from "./irregularSiteScoringService.js";

export function resolveIrregularSiteFallback(site = {}, envelope = null) {
  const score = scoreIrregularSite(site, envelope);
  let searchStrategies = [
    "baseline-horizontal",
    "daylight-horizontal",
    "wet-stack-horizontal",
    "vertical-columns",
  ];
  const warnings = [...score.warnings];

  if (score.siteClass === "narrow") {
    searchStrategies = [
      "vertical-columns",
      "daylight-horizontal",
      "baseline-horizontal",
      "wet-stack-horizontal",
    ];
    warnings.push(
      "Narrow-site fallback prefers vertical columns first to preserve circulation width.",
    );
  } else if (score.siteClass === "asymmetric") {
    searchStrategies = [
      "daylight-horizontal",
      "baseline-horizontal",
      "wet-stack-horizontal",
      "vertical-columns",
    ];
    warnings.push(
      "Asymmetric-site fallback biases daylight-first horizontal bands before tighter column packing.",
    );
  } else if (score.siteClass === "awkward") {
    searchStrategies = [
      "wet-stack-horizontal",
      "daylight-horizontal",
      "baseline-horizontal",
      "vertical-columns",
    ];
    warnings.push(
      "Awkward-site fallback preserves deterministic fit-first heuristics and surfaces low-confidence warnings.",
    );
  }

  return {
    version: "phase5-site-fallback-strategy-v1",
    siteScore: score,
    searchStrategies,
    heuristicConfidence: score.heuristicConfidence,
    warnings,
  };
}

export default {
  resolveIrregularSiteFallback,
};
