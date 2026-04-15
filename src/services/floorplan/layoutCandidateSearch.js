import { scoreLayoutCandidate } from "./layoutScoringService.js";
import { LAYOUT_REPAIR_STRATEGIES } from "./layoutRepairStrategies.js";
import { runCrossLevelConsistencyChecks } from "../validation/crossLevelConsistencyChecks.js";
import { runGeometryConsistencyChecks } from "../validation/geometryConsistencyChecks.js";

function buildLayoutFromGeometry(projectGeometry = {}) {
  return {
    buildable_bbox: projectGeometry.site?.buildable_bbox || null,
    levels: (projectGeometry.levels || []).map((level) => ({
      ...level,
      rooms: (projectGeometry.rooms || []).filter(
        (room) => room.level_id === level.id,
      ),
    })),
  };
}

function summarizeValidation(projectGeometry = {}) {
  const geometryChecks = runGeometryConsistencyChecks({
    projectGeometry,
    adjacencyGraph: projectGeometry?.metadata?.adjacency_graph || null,
  });
  const crossLevelChecks = runCrossLevelConsistencyChecks(projectGeometry);
  const errors = [
    ...(geometryChecks.errors || []),
    ...(crossLevelChecks.errors || []),
  ];
  const warnings = [
    ...(geometryChecks.warnings || []),
    ...(crossLevelChecks.warnings || []),
  ];
  return {
    geometryChecks,
    crossLevelChecks,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
  };
}

export function scoreRepairCandidate(projectGeometry = {}, options = {}) {
  const layoutScore = scoreLayoutCandidate(
    buildLayoutFromGeometry(projectGeometry),
    {
      adjacencyGraph: projectGeometry?.metadata?.adjacency_graph || null,
    },
  );
  const validationSummary = summarizeValidation(projectGeometry);
  const penalty = Math.min(
    0.65,
    validationSummary.errorCount * 0.09 +
      validationSummary.warningCount * 0.025,
  );
  return {
    score: Math.max(0, Number((layoutScore.score - penalty).toFixed(3))),
    metrics: layoutScore.metrics,
    validation: validationSummary,
  };
}

export function generateRepairCandidates(
  projectGeometry = {},
  validationReport = null,
  options = {},
) {
  const baselineSummary = summarizeValidation(projectGeometry);
  const baselineCandidate = {
    candidateId: "repair:baseline-noop",
    repairedProjectGeometry: projectGeometry,
    evaluation: scoreRepairCandidate(projectGeometry, options),
    explanation: [
      "Keep the current canonical geometry when repair candidates do not improve the state deterministically.",
      `Errors ${baselineSummary.errorCount} -> ${baselineSummary.errorCount}.`,
      `Warnings ${baselineSummary.warningCount} -> ${baselineSummary.warningCount}.`,
    ],
  };
  const requestedStrategies =
    Array.isArray(options.strategies) && options.strategies.length
      ? LAYOUT_REPAIR_STRATEGIES.filter((strategy) =>
          options.strategies.includes(strategy.id),
        )
      : LAYOUT_REPAIR_STRATEGIES;

  return [
    baselineCandidate,
    ...requestedStrategies.map((strategy) => {
      const repairedGeometry = strategy.apply(
        projectGeometry,
        validationReport,
      );
      const evaluation = scoreRepairCandidate(repairedGeometry, options);
      return {
        candidateId: strategy.id,
        repairedProjectGeometry: repairedGeometry,
        evaluation,
        explanation: [
          strategy.description,
          `Errors ${baselineSummary.errorCount} -> ${evaluation.validation.errorCount}.`,
          `Warnings ${baselineSummary.warningCount} -> ${evaluation.validation.warningCount}.`,
        ],
      };
    }),
  ];
}

export default {
  scoreRepairCandidate,
  generateRepairCandidates,
};
