import { scoreLayoutCandidate } from "./layoutScoringService.js";
import { runCrossLevelConsistencyChecks } from "../validation/crossLevelConsistencyChecks.js";
import { runGeometryConsistencyChecks } from "../validation/geometryConsistencyChecks.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

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

function summarizeBaseline(
  validationReport = null,
  baselineProjectGeometry = {},
) {
  if (
    validationReport &&
    Array.isArray(validationReport.errors) &&
    Array.isArray(validationReport.warnings)
  ) {
    return {
      errorCount: validationReport.errors.length,
      warningCount: validationReport.warnings.length,
      errors: validationReport.errors,
      warnings: validationReport.warnings,
    };
  }

  return summarizeValidation(baselineProjectGeometry);
}

function calculateStableIdScore(
  baselineProjectGeometry = {},
  candidateProjectGeometry = {},
) {
  const baselineRooms = baselineProjectGeometry.rooms || [];
  const candidateRooms = candidateProjectGeometry.rooms || [];
  if (!baselineRooms.length || !candidateRooms.length) {
    return 1;
  }

  const baselineIds = baselineRooms.map((room) => room.id).filter(Boolean);
  const candidateIds = candidateRooms.map((room) => room.id).filter(Boolean);
  const sharedIds = baselineIds.filter((id) => candidateIds.includes(id));
  const sharedRatio = sharedIds.length / Math.max(baselineIds.length, 1);
  const orderedRatio =
    sharedIds.filter((id, index) => candidateIds[index] === id).length /
    Math.max(sharedIds.length, 1);

  return roundMetric(sharedRatio * 0.65 + orderedRatio * 0.35);
}

export function scoreLayoutRepairCandidate({
  projectGeometry = {},
  baselineProjectGeometry = {},
  baselineValidation = null,
  strategyPath = [],
} = {}) {
  const layoutScore = scoreLayoutCandidate(
    buildLayoutFromGeometry(projectGeometry),
    {
      adjacencyGraph: projectGeometry?.metadata?.adjacency_graph || null,
    },
  );
  const validationSummary = summarizeValidation(projectGeometry);
  const baselineSummary = summarizeBaseline(
    baselineValidation,
    baselineProjectGeometry,
  );
  const stableIdScore = calculateStableIdScore(
    baselineProjectGeometry,
    projectGeometry,
  );
  const errorImprovement =
    baselineSummary.errorCount - validationSummary.errorCount;
  const warningImprovement =
    baselineSummary.warningCount - validationSummary.warningCount;
  const improvementScore = clamp(
    errorImprovement * 0.11 + warningImprovement * 0.03,
    -0.35,
    0.4,
  );
  const pathPenalty = strategyPath.length * 0.015;
  const rawScore =
    layoutScore.score * 0.7 +
    stableIdScore * 0.15 +
    0.15 +
    improvementScore -
    pathPenalty;

  return {
    score: roundMetric(clamp(rawScore, 0, 1)),
    metrics: layoutScore.metrics,
    validation: validationSummary,
    repairMetrics: {
      baselineErrorCount: baselineSummary.errorCount,
      baselineWarningCount: baselineSummary.warningCount,
      errorImprovement,
      warningImprovement,
      stableIdScore,
      pathDepth: strategyPath.length,
      pathPenalty: roundMetric(pathPenalty),
    },
  };
}

export default {
  scoreLayoutRepairCandidate,
};
