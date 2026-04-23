import {
  buildVerificationState,
  normalizeVerificationPhase,
} from "./a1VerificationStateModel.js";
import { truthBucketFromMode } from "../drawing/constructionTruthModel.js";

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
  const sectionContextualEvidenceQuality =
    finalSheetRegression?.sectionContextualEvidenceQuality ||
    technicalCredibility?.summary?.sectionContextualEvidenceQuality ||
    "provisional";
  const sectionDerivedEvidenceQuality =
    finalSheetRegression?.sectionDerivedEvidenceQuality ||
    technicalCredibility?.summary?.sectionDerivedEvidenceQuality ||
    "provisional";
  const sectionConstructionEvidenceQuality =
    finalSheetRegression?.sectionConstructionEvidenceQuality ||
    technicalCredibility?.summary?.sectionConstructionEvidenceQuality ||
    "provisional";
  const sectionConstructionTruthQuality =
    finalSheetRegression?.sectionConstructionTruthQuality ||
    technicalCredibility?.summary?.sectionConstructionTruthQuality ||
    "provisional";
  const wallSectionClipQuality =
    finalSheetRegression?.wallSectionClipQuality ||
    technicalCredibility?.summary?.wallSectionClipQuality ||
    "provisional";
  const openingSectionClipQuality =
    finalSheetRegression?.openingSectionClipQuality ||
    technicalCredibility?.summary?.openingSectionClipQuality ||
    "provisional";
  const stairSectionClipQuality =
    finalSheetRegression?.stairSectionClipQuality ||
    technicalCredibility?.summary?.stairSectionClipQuality ||
    "provisional";
  const slabSectionClipQuality =
    finalSheetRegression?.slabSectionClipQuality ||
    technicalCredibility?.summary?.slabSectionClipQuality ||
    "provisional";
  const roofSectionClipQuality =
    finalSheetRegression?.roofSectionClipQuality ||
    technicalCredibility?.summary?.roofSectionClipQuality ||
    "provisional";
  const foundationSectionClipQuality =
    finalSheetRegression?.foundationSectionClipQuality ||
    technicalCredibility?.summary?.foundationSectionClipQuality ||
    "provisional";
  const cutWallTruthQuality =
    finalSheetRegression?.cutWallTruthQuality ||
    technicalCredibility?.summary?.cutWallTruthQuality ||
    "provisional";
  const cutOpeningTruthQuality =
    finalSheetRegression?.cutOpeningTruthQuality ||
    technicalCredibility?.summary?.cutOpeningTruthQuality ||
    "provisional";
  const stairTruthQuality =
    finalSheetRegression?.stairTruthQuality ||
    technicalCredibility?.summary?.stairTruthQuality ||
    "provisional";
  const slabTruthQuality =
    finalSheetRegression?.slabTruthQuality ||
    technicalCredibility?.summary?.slabTruthQuality ||
    "provisional";
  const roofTruthQuality =
    finalSheetRegression?.roofTruthQuality ||
    technicalCredibility?.summary?.roofTruthQuality ||
    "provisional";
  const roofTruthMode =
    finalSheetRegression?.roofTruthMode ||
    technicalCredibility?.summary?.roofTruthMode ||
    "missing";
  const foundationTruthQuality =
    finalSheetRegression?.foundationTruthQuality ||
    technicalCredibility?.summary?.foundationTruthQuality ||
    "provisional";
  const foundationTruthMode =
    finalSheetRegression?.foundationTruthMode ||
    technicalCredibility?.summary?.foundationTruthMode ||
    "missing";
  const roofTruthState = truthBucketFromMode(roofTruthMode);
  const foundationTruthState = truthBucketFromMode(foundationTruthMode);
  const sideFacadeEvidenceQuality =
    finalSheetRegression?.sideFacadeEvidenceQuality ||
    technicalCredibility?.summary?.sideFacadeEvidenceQuality ||
    "provisional";
  const sectionTruthModelVersion =
    finalSheetRegression?.sectionTruthModelVersion ||
    technicalCredibility?.summary?.sectionTruthModelVersion ||
    null;
  const sectionFaceCredibilityQuality =
    finalSheetRegression?.sectionFaceCredibilityQuality ||
    technicalCredibility?.summary?.sectionFaceCredibilityQuality ||
    "provisional";
  const sectionFaceCredibilityScore = Number(
    finalSheetRegression?.sectionFaceCredibilityScore ||
      technicalCredibility?.summary?.sectionFaceCredibilityScore ||
      0,
  );
  const sectionCutFaceTruthCount = Number(
    finalSheetRegression?.sectionCutFaceTruthCount ||
      technicalCredibility?.summary?.sectionCutFaceTruthCount ||
      0,
  );
  const sectionCutProfileTruthCount = Number(
    finalSheetRegression?.sectionCutProfileTruthCount ||
      technicalCredibility?.summary?.sectionCutProfileTruthCount ||
      0,
  );
  const sectionAverageProfileContinuity = Number(
    finalSheetRegression?.sectionAverageProfileContinuity ||
      technicalCredibility?.summary?.sectionAverageProfileContinuity ||
      0,
  );
  const sectionFaceBundleVersion =
    finalSheetRegression?.sectionFaceBundleVersion ||
    technicalCredibility?.summary?.sectionFaceBundleVersion ||
    null;
  const sectionChosenRationale =
    finalSheetRegression?.chosenSectionRationale ||
    finalSheetRegression?.sectionCandidateQuality?.find(
      (entry) => entry.selectedForBoard,
    )?.rationale?.[0] ||
    finalSheetRegression?.sectionCandidateQuality?.[0]?.rationale?.[0] ||
    null;
  const publishabilityDecision =
    publishability?.finalDecision ||
    publishability?.decision ||
    canonicalDecision(publishability?.status || overall, decisive);
  const canonicalOverall =
    decisive && publishability?.status ? publishability.status : overall;
  const canonicalOverallDecision =
    decisive && publishabilityState
      ? publishabilityDecision
      : canonicalDecision(overall, decisive);

  const canonicalVerification = {
    version:
      sectionFaceBundleVersion ||
      sectionFaceCredibilityQuality !== "provisional" ||
      sectionCutFaceTruthCount > 0 ||
      sectionCutProfileTruthCount > 0
        ? "phase21-a1-verification-v1"
        : sectionTruthModelVersion
          ? "phase20-a1-verification-v1"
          : wallSectionClipQuality !== "provisional" ||
              openingSectionClipQuality !== "provisional" ||
              stairSectionClipQuality !== "provisional" ||
              slabSectionClipQuality !== "provisional" ||
              roofSectionClipQuality !== "provisional" ||
              foundationSectionClipQuality !== "provisional"
            ? "phase19-a1-verification-v1"
            : sectionConstructionEvidenceQuality !== "provisional" ||
                cutWallTruthQuality !== "provisional" ||
                cutOpeningTruthQuality !== "provisional" ||
                stairTruthQuality !== "provisional"
              ? "phase18-a1-verification-v1"
              : roofTruthState !== "unsupported" ||
                  foundationTruthState !== "unsupported"
                ? "phase17-a1-verification-v1"
                : roofTruthMode !== "missing" ||
                    foundationTruthMode !== "missing"
                  ? "phase16-a1-verification-v1"
                  : roofTruthQuality !== "provisional" ||
                      foundationTruthQuality !== "provisional"
                    ? "phase15-a1-verification-v1"
                    : sectionConstructionTruthQuality !== "provisional"
                      ? "phase14-a1-verification-v1"
                      : "phase13-a1-verification-v1",
    phase,
    postComposeVerified: decisive,
    provisional: !decisive,
    decisive,
    overallStatus: canonicalOverall,
    overallDecision: canonicalOverallDecision,
    publishabilityDecision,
    renderedTextEvidenceQuality,
    sectionEvidenceQuality,
    sectionDirectEvidenceQuality,
    sectionInferredEvidenceQuality,
    sectionContextualEvidenceQuality,
    sectionDerivedEvidenceQuality,
    sectionConstructionEvidenceQuality,
    sectionConstructionTruthQuality,
    sectionTruthModelVersion,
    wallSectionClipQuality,
    openingSectionClipQuality,
    stairSectionClipQuality,
    slabSectionClipQuality,
    roofSectionClipQuality,
    foundationSectionClipQuality,
    cutWallTruthQuality,
    cutOpeningTruthQuality,
    stairTruthQuality,
    slabTruthQuality,
    roofTruthQuality,
    roofTruthMode,
    roofTruthState,
    foundationTruthQuality,
    foundationTruthMode,
    foundationTruthState,
    sideFacadeEvidenceQuality,
    sectionChosenRationale,
    sectionFaceCredibilityQuality,
    sectionFaceCredibilityScore,
    sectionCutFaceTruthCount,
    sectionCutProfileTruthCount,
    sectionAverageProfileContinuity,
    sectionFaceBundleVersion,
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
