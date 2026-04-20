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

function deriveEvidenceQualityFromState(state = null) {
  if (!state) {
    return "provisional";
  }
  if (state.blocked) {
    return "blocked";
  }
  if (state.verified && state.passed) {
    return "verified";
  }
  if (state.passed) {
    return "provisional";
  }
  return "weak";
}

function hasStrongRequiredRenderedProof(renderedTextZone = null) {
  const zones = renderedTextZone?.zones || [];
  const requiredZones = zones.filter((zone) => zone.required === true);
  if (!requiredZones.length) {
    return false;
  }
  return (
    requiredZones.every(
      (zone) => zone.status === "pass" && zone.evidenceState !== "blocked",
    ) &&
    requiredZones.every((zone) =>
      ["verified", "weak"].includes(zone.evidenceState),
    ) &&
    Number(renderedTextZone?.confidence || 0) >= 0.48
  );
}

function resolveRenderedTextEvidenceQuality(
  renderedTextZone = null,
  state = null,
) {
  if (
    renderedTextZone?.ocr?.available &&
    renderedTextZone?.ocrEvidenceQuality &&
    renderedTextZone.ocrEvidenceQuality !== "provisional"
  ) {
    return renderedTextZone.ocrEvidenceQuality;
  }
  if (
    renderedTextZone?.verificationPhase === "post_compose" &&
    hasStrongRequiredRenderedProof(renderedTextZone)
  ) {
    return "verified";
  }
  if (
    renderedTextZone?.verificationPhase === "post_compose" &&
    Number(renderedTextZone?.confidence || 0) >= 0.64 &&
    (renderedTextZone?.methodsUsed || []).includes("raster_variance")
  ) {
    return "verified";
  }
  return deriveEvidenceQualityFromState(state);
}

function canonicalDecision(overall = "reviewable", decisive = false) {
  return decisive ? overall : "provisional";
}

export function buildA1VerificationBundle({
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
        evidenceSource:
          renderedTextZone.renderedBuffer || renderedTextZone.ocr?.available
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
          publishability.verificationPhase === "post_compose"
            ? "rendered_output"
            : "metadata",
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
  const renderedTextEvidenceQuality = resolveRenderedTextEvidenceQuality(
    renderedTextZone,
    renderedTextState,
  );
  const sectionEvidenceQuality =
    finalSheetRegression?.sectionEvidenceQuality ||
    technicalCredibility?.summary?.sectionEvidenceQuality ||
    "provisional";
  const sectionDirectEvidenceQuality =
    finalSheetRegression?.sectionDirectEvidenceQuality ||
    technicalCredibility?.summary?.sectionDirectEvidenceQuality ||
    "provisional";
  const sectionInferredEvidenceQuality =
    finalSheetRegression?.sectionInferredEvidenceQuality ||
    technicalCredibility?.summary?.sectionInferredEvidenceQuality ||
    "provisional";
  const sideFacadeEvidenceQuality =
    finalSheetRegression?.sideFacadeEvidenceQuality ||
    technicalCredibility?.summary?.sideFacadeEvidenceQuality ||
    "provisional";
  const publishabilityDecision =
    publishability?.finalDecision ||
    publishability?.decision ||
    canonicalDecision(publishability?.status || overall, decisive);

  const canonicalVerification = {
    version: "phase13-a1-verification-v1",
    phase,
    postComposeVerified: decisive,
    provisional: !decisive,
    decisive,
    overallStatus: overall,
    overallDecision: canonicalDecision(overall, decisive),
    publishabilityDecision,
    renderedTextEvidenceQuality,
    sectionEvidenceQuality,
    sectionDirectEvidenceQuality,
    sectionInferredEvidenceQuality,
    sideFacadeEvidenceQuality,
    ocrEvidenceQuality: renderedTextZone?.ocrEvidenceQuality || "provisional",
    components: {
      renderedTextZone: renderedTextState,
      finalSheetRegression: regressionState,
      technicalCredibility: credibilityState,
      publishability: publishabilityState,
    },
  };

  return {
    ...canonicalVerification,
    renderedTextZone: renderedTextState,
    finalSheetRegression: regressionState,
    technicalCredibility: credibilityState,
    publishability: publishabilityState,
    verification: canonicalVerification,
  };
}

export default {
  buildA1VerificationBundle,
};
