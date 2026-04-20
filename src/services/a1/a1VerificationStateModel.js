function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function normalizeVerificationPhase(phase = "pre_compose") {
  return String(phase || "").toLowerCase() === "post_compose"
    ? "post_compose"
    : "pre_compose";
}

function normalizeVerificationStatus(status = "warning") {
  const normalized = String(status || "warning").toLowerCase();
  if (["blocked", "block", "fail"].includes(normalized)) return "block";
  if (["publishable", "pass", "ok"].includes(normalized)) return "pass";
  if (["reviewable", "warning", "degraded"].includes(normalized)) {
    return "warning";
  }
  return "warning";
}

function deriveEvidenceStrength({
  normalizedStatus = "warning",
  confidence = null,
  verified = false,
  blockers = [],
  warnings = [],
} = {}) {
  if (normalizedStatus === "block" || (blockers || []).length) {
    return "weak";
  }
  if (
    verified &&
    normalizedStatus === "pass" &&
    Number(confidence) >= 0.74 &&
    !(warnings || []).length
  ) {
    return "strong";
  }
  if (normalizedStatus === "pass" || Number(confidence) >= 0.52) {
    return verified ? "strong" : "moderate";
  }
  return "weak";
}

function decisionFromStatus(normalizedStatus = "warning") {
  if (normalizedStatus === "block") {
    return "blocked";
  }
  if (normalizedStatus === "pass") {
    return "publishable";
  }
  return "reviewable";
}

export function buildVerificationState({
  phase = "pre_compose",
  status = "warning",
  blockers = [],
  warnings = [],
  confidence = null,
  label = null,
  evidenceSource = null,
} = {}) {
  const normalizedPhase = normalizeVerificationPhase(phase);
  const normalizedStatus = normalizeVerificationStatus(status);
  const verified = normalizedPhase === "post_compose";
  const resolvedBlockers = unique(blockers);
  const resolvedWarnings = unique(warnings);

  return {
    phase: normalizedPhase,
    verified,
    provisional: !verified,
    decisive: verified,
    normalizedStatus,
    originalStatus: String(status || "warning"),
    passed: normalizedStatus === "pass",
    reviewable: normalizedStatus === "warning",
    blocked: normalizedStatus === "block",
    decisionStatus: verified
      ? decisionFromStatus(normalizedStatus)
      : "provisional",
    confidence:
      confidence === null || confidence === undefined
        ? null
        : round(confidence),
    evidenceStrength: deriveEvidenceStrength({
      normalizedStatus,
      confidence,
      verified,
      blockers: resolvedBlockers,
      warnings: resolvedWarnings,
    }),
    evidenceSource:
      evidenceSource || (verified ? "rendered_output" : "metadata"),
    label: label || "verification",
    blockers: resolvedBlockers,
    warnings: resolvedWarnings,
  };
}

export default {
  normalizeVerificationPhase,
  buildVerificationState,
};
