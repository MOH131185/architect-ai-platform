import { generateRepairCandidates } from "./layoutCandidateSearch.js";

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
    const leftId = String(left.candidateId || "");
    const rightId = String(right.candidateId || "");
    if (leftId < rightId) return -1;
    if (leftId > rightId) return 1;
    return 0;
  });
}

export function explainRepairDecision(candidate = null, baselineReport = null) {
  if (!candidate) {
    return ["No deterministic repair candidate was produced."];
  }

  return [
    `Selected ${candidate.candidateId} with score ${candidate.evaluation.score}.`,
    ...(candidate.explanation || []),
    ...(baselineReport?.status === "invalid"
      ? [
          "Repair kept stable IDs and geometry-first semantics, but it does not claim perfect optimization.",
        ]
      : []),
  ];
}

export function repairLayout(
  projectGeometry = {},
  validationReport = null,
  options = {},
) {
  const preserveStableIds = options.preserveStableIds !== false;
  const candidates = stableSortCandidates(
    generateRepairCandidates(projectGeometry, validationReport, options),
  ).slice(
    0,
    Math.max(1, Number(options.maxCandidates || Number.MAX_SAFE_INTEGER)),
  );
  const selectedCandidate = candidates[0] || null;
  const repairedProjectGeometry = selectedCandidate
    ? clone(selectedCandidate.repairedProjectGeometry)
    : clone(projectGeometry);

  if (preserveStableIds && selectedCandidate) {
    const roomOrder = new Map(
      (projectGeometry.rooms || []).map((room, index) => [room.id, index]),
    );
    repairedProjectGeometry.rooms = (repairedProjectGeometry.rooms || [])
      .map((room) => ({
        ...room,
        id: room.id,
        level_id: room.level_id,
      }))
      .sort(
        (left, right) =>
          (roomOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (roomOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
  }

  repairedProjectGeometry.metadata = {
    ...(repairedProjectGeometry.metadata || {}),
    repair: {
      version: "phase5-layout-repair-v1",
      selected_candidate: selectedCandidate?.candidateId || null,
      candidate_scores: candidates.map((candidate) => ({
        candidate_id: candidate.candidateId,
        score: candidate.evaluation.score,
        error_count: candidate.evaluation.validation.errorCount,
        warning_count: candidate.evaluation.validation.warningCount,
      })),
      explanations: explainRepairDecision(selectedCandidate, validationReport),
    },
  };

  return {
    version: "phase5-layout-repair-v1",
    selectedCandidate,
    repairedProjectGeometry,
    candidates,
    explanations: explainRepairDecision(selectedCandidate, validationReport),
  };
}

export default {
  repairLayout,
  generateRepairCandidates,
  explainRepairDecision,
};
