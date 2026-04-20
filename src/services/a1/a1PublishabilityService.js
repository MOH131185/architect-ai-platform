import { buildVerificationState } from "./a1VerificationStateModel.js";

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

export function classifyA1Publishability({
  finalSheetRegression = null,
  technicalCredibility = null,
  blockingReasons = [],
  verificationPhase = null,
} = {}) {
  const resolvedPhase =
    verificationPhase ||
    technicalCredibility?.verificationPhase ||
    finalSheetRegression?.verificationPhase ||
    "pre_compose";
  const blockers = unique([
    ...(blockingReasons || []),
    ...(finalSheetRegression?.blockers || []),
    ...(technicalCredibility?.blockers || []),
  ]);
  const warnings = unique([
    ...(finalSheetRegression?.warnings || []),
    ...(technicalCredibility?.warnings || []),
  ]);

  const status = blockers.length
    ? "blocked"
    : warnings.length
      ? "reviewable"
      : "publishable";
  const decisive = resolvedPhase === "post_compose";

  return {
    version: "phase10-a1-publishability-v1",
    verificationPhase: resolvedPhase,
    decisive,
    provisional: !decisive,
    finalDecision: decisive ? status : "provisional",
    status,
    publishable: status === "publishable",
    reviewable: status === "reviewable",
    blocked: status === "blocked",
    blockers,
    warnings,
    verificationState: buildVerificationState({
      phase: resolvedPhase,
      status:
        status === "publishable"
          ? "pass"
          : status === "blocked"
            ? "block"
            : "warning",
      blockers,
      warnings,
      label: "publishability",
      evidenceSource:
        resolvedPhase === "post_compose" ? "rendered_output" : "metadata",
    }),
  };
}

export default {
  classifyA1Publishability,
};
