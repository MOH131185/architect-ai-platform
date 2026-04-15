import { scoreLayoutCandidate } from "./layoutScoringService.js";

export const DEFAULT_LAYOUT_STRATEGIES = [
  {
    id: "baseline-horizontal",
    orientation: "horizontal",
  },
  {
    id: "daylight-horizontal",
    orientation: "horizontal",
    daylightPriority: true,
  },
  {
    id: "wet-stack-horizontal",
    orientation: "horizontal",
    wetZonePriority: true,
  },
  {
    id: "vertical-columns",
    orientation: "vertical",
  },
];

export function searchDeterministicLayouts(context = {}, options = {}) {
  const candidateBuilder =
    options.candidateBuilder ||
    (() => {
      throw new Error("layout search requires a candidateBuilder callback.");
    });
  const strategies =
    Array.isArray(options.strategies) && options.strategies.length
      ? options.strategies
      : DEFAULT_LAYOUT_STRATEGIES;

  const candidates = strategies
    .map((strategy) => candidateBuilder(strategy))
    .filter(Boolean)
    .map((candidate) => ({
      ...candidate,
      evaluation: scoreLayoutCandidate(candidate, context),
    }))
    .sort((left, right) => {
      if (right.evaluation.score !== left.evaluation.score) {
        return right.evaluation.score - left.evaluation.score;
      }
      return String(left.candidate_id || left.strategy || "").localeCompare(
        String(right.candidate_id || right.strategy || ""),
      );
    });

  const selected = candidates[0];
  if (!selected) {
    throw new Error("No deterministic layout candidates were produced.");
  }

  return {
    ...selected,
    selected_candidate:
      selected.candidate_id || selected.strategy || "baseline",
    candidate_evaluations: candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id || candidate.strategy,
      score: candidate.evaluation.score,
      metrics: candidate.evaluation.metrics,
    })),
    solver_notes: [
      ...(selected.solver_notes || []),
      `Phase 4 layout search evaluated ${candidates.length} deterministic candidate layouts.`,
    ],
  };
}

export default {
  DEFAULT_LAYOUT_STRATEGIES,
  searchDeterministicLayouts,
};
