import {
  buildVerificationState,
  normalizeVerificationPhase,
} from "./a1VerificationStateModel.js";

function resolvedState(existing = null, fallback = {}) {
  if (existing && existing.phase) {
    return existing;
  }
  return buildVerificationState(fallback);
}

function overallStatus(states = []) {
  const resolved = (states || []).filter(Boolean);
  if (!resolved.length) {
    return "reviewable";
  }
  if (resolved.some((state) => state.blocked)) {
    return "blocked";
  }
  if (resolved.some((state) => state.reviewable)) {
    return "reviewable";
  }
  return "publishable";
}

export function buildA1VerificationStateBundle({
  renderedTextZone = null,
  finalSheetRegression = null,
  technicalCredibility = null,
  publishability = null,
} = {}) {
  const renderedTextState = renderedTextZone
    ? resolvedState(renderedTextZone.verificationState, {
        phase: renderedTextZone.verificationPhase || "pre_compose",
        status: renderedTextZone.status || "warning",
        blockers: renderedTextZone.blockers || [],
        warnings: renderedTextZone.warnings || [],
        confidence: renderedTextZone.confidence ?? null,
        label: "renderedTextZone",
        evidenceSource: renderedTextZone.renderedBuffer
          ? "rendered_output"
          : "svg_text",
      })
    : null;
  const regressionState = finalSheetRegression
    ? resolvedState(finalSheetRegression.verificationState, {
        phase: finalSheetRegression.verificationPhase || "pre_compose",
        status: finalSheetRegression.status || "warning",
        blockers: finalSheetRegression.blockers || [],
        warnings: finalSheetRegression.warnings || [],
        label: "finalSheetRegression",
        confidence:
          finalSheetRegression.renderedTextZone?.confidence ??
          renderedTextState?.confidence ??
          null,
      })
    : null;
  const credibilityState = technicalCredibility
    ? resolvedState(technicalCredibility.verificationState, {
        phase:
          technicalCredibility.verificationPhase ||
          regressionState?.phase ||
          "pre_compose",
        status: technicalCredibility.status || "warning",
        blockers: technicalCredibility.blockers || [],
        warnings: technicalCredibility.warnings || [],
        label: "technicalCredibility",
      })
    : null;
  const publishabilityState = publishability
    ? resolvedState(publishability.verificationState, {
        phase:
          publishability.verificationPhase ||
          credibilityState?.phase ||
          "pre_compose",
        status:
          publishability.status === "publishable"
            ? "pass"
            : publishability.status === "blocked"
              ? "block"
              : "warning",
        blockers: publishability.blockers || [],
        warnings: publishability.warnings || [],
        label: "publishability",
        evidenceSource:
          publishability.status === "publishable"
            ? "verification_rollup"
            : "verification_rollup",
      })
    : null;

  const phase = normalizeVerificationPhase(
    publishabilityState?.phase ||
      credibilityState?.phase ||
      regressionState?.phase ||
      renderedTextState?.phase ||
      "pre_compose",
  );
  const states = [
    renderedTextState,
    regressionState,
    credibilityState,
    publishabilityState,
  ].filter(Boolean);
  const overall = overallStatus(states);
  const decisive = phase === "post_compose";

  return {
    version: "phase10-a1-verification-state-v1",
    phase,
    postComposeVerified: phase === "post_compose",
    provisional: phase !== "post_compose",
    decisive,
    overallStatus: overall,
    overallDecision: decisive ? overall : "provisional",
    renderedTextZone: renderedTextState,
    finalSheetRegression: regressionState,
    technicalCredibility: credibilityState,
    publishability: publishabilityState,
  };
}

export default {
  buildA1VerificationStateBundle,
};
