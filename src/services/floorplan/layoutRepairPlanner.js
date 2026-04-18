import { LAYOUT_REPAIR_STRATEGIES } from "./layoutRepairStrategies.js";
import { scoreLayoutRepairCandidate } from "./layoutRepairScoringService.js";
import { resolveLayoutSearchStrategyPlan } from "./layoutSearchStrategyService.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableSortCandidates(candidates = []) {
  return [...candidates].sort((left, right) => {
    if (right.evaluation.score !== left.evaluation.score) {
      return right.evaluation.score - left.evaluation.score;
    }
    const leftErrors = left.evaluation.validation.errorCount;
    const rightErrors = right.evaluation.validation.errorCount;
    if (leftErrors !== rightErrors) {
      return leftErrors - rightErrors;
    }
    if (left.strategyPath.length !== right.strategyPath.length) {
      return left.strategyPath.length - right.strategyPath.length;
    }
    return String(left.candidateId || "").localeCompare(
      String(right.candidateId || ""),
    );
  });
}

function applyStrategyPath(
  strategyMap,
  projectGeometry = {},
  validationReport = {},
  strategyPath = [],
) {
  let currentGeometry = clone(projectGeometry);
  const explanation = [];

  strategyPath.forEach((strategyId) => {
    const strategy = strategyMap.get(strategyId);
    if (!strategy) {
      return;
    }
    currentGeometry = strategy.apply(currentGeometry, validationReport);
    explanation.push(strategy.description);
  });

  return {
    repairedProjectGeometry: currentGeometry,
    explanation,
  };
}

export function planLayoutRepair(
  projectGeometry = {},
  validationReport = {},
  options = {},
) {
  const strategyMap = new Map(
    LAYOUT_REPAIR_STRATEGIES.map((strategy) => [strategy.id, strategy]),
  );
  const searchPlan = resolveLayoutSearchStrategyPlan(
    projectGeometry,
    validationReport,
    options,
  );
  const candidates = searchPlan.passes
    .slice(0, Math.max(3, Number(options.maxCandidates || 8)))
    .map((pass, index) => {
      const applied = applyStrategyPath(
        strategyMap,
        projectGeometry,
        validationReport,
        pass.strategyPath,
      );
      const evaluation = scoreLayoutRepairCandidate({
        projectGeometry: applied.repairedProjectGeometry,
        baselineProjectGeometry: projectGeometry,
        baselineValidation: validationReport,
        strategyPath: pass.strategyPath,
      });

      return {
        candidateId:
          pass.strategyPath.length > 0
            ? `repair-plan:${pass.strategyPath.join("->")}`
            : "repair-plan:baseline-noop",
        strategyPath: pass.strategyPath,
        repairedProjectGeometry: applied.repairedProjectGeometry,
        evaluation,
        explanation: [
          ...pass.rationale,
          ...applied.explanation,
          `Errors ${evaluation.repairMetrics.baselineErrorCount} -> ${evaluation.validation.errorCount}.`,
          `Warnings ${evaluation.repairMetrics.baselineWarningCount} -> ${evaluation.validation.warningCount}.`,
        ],
        rankHint: index,
      };
    });

  const rankedCandidates = stableSortCandidates(candidates);
  const selectedCandidate = rankedCandidates[0] || null;

  return {
    version: "phase7-layout-repair-planner-v1",
    searchPlan,
    candidates: rankedCandidates,
    selectedCandidate,
    chosenPath: selectedCandidate?.strategyPath || [],
    candidateSummary: rankedCandidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      strategyPath: candidate.strategyPath || [],
      score: candidate.evaluation?.score || 0,
    })),
    rationale: selectedCandidate?.explanation || [
      "No deterministic repair candidate was produced.",
    ],
  };
}

export default {
  planLayoutRepair,
};
