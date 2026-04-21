import { buildVerificationState } from "./a1VerificationStateModel.js";
import { truthBucketFromMode } from "../drawing/constructionTruthModel.js";

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function filterEvidenceOverriddenWarnings(
  warnings = [],
  evidenceProfile = {},
  verificationPhase = "pre_compose",
) {
  if (verificationPhase !== "post_compose") {
    return unique(warnings);
  }

  const strongPostComposeSectionFallback =
    evidenceProfile.renderedTextEvidenceQuality === "verified" &&
    evidenceProfile.sideFacadeEvidenceQuality === "verified" &&
    evidenceProfile.sectionDirectEvidenceQuality === "verified" &&
    evidenceProfile.sectionInferredEvidenceQuality === "verified" &&
    evidenceProfile.slabTruthQuality === "verified" &&
    evidenceProfile.foundationTruthQuality === "verified" &&
    evidenceProfile.roofTruthQuality === "blocked";
  const strongPostComposeConstructionEvidence =
    evidenceProfile.sectionConstructionTruthQuality === "verified" &&
    evidenceProfile.sectionDirectEvidenceQuality === "verified";
  const strongPostComposeDirectConstructionBoard =
    evidenceProfile.renderedTextEvidenceQuality === "verified" &&
    evidenceProfile.sideFacadeEvidenceQuality === "verified" &&
    evidenceProfile.sectionDirectEvidenceQuality === "verified" &&
    evidenceProfile.sectionInferredEvidenceQuality === "verified" &&
    evidenceProfile.sectionConstructionTruthQuality === "verified" &&
    evidenceProfile.slabTruthQuality === "verified" &&
    evidenceProfile.foundationTruthQuality === "verified" &&
    evidenceProfile.roofTruthState === "direct";
  const strongPostComposeSectionBoard =
    evidenceProfile.renderedTextEvidenceQuality === "verified" &&
    evidenceProfile.sideFacadeEvidenceQuality === "verified" &&
    evidenceProfile.sectionDirectEvidenceQuality === "verified" &&
    evidenceProfile.sectionInferredEvidenceQuality === "verified" &&
    evidenceProfile.slabTruthQuality === "verified" &&
    evidenceProfile.foundationTruthQuality === "verified" &&
    evidenceProfile.roofTruthMode === "explicit_generated";

  return unique(
    (warnings || []).filter((warning) => {
      const text = String(warning || "");
      if (
        evidenceProfile.renderedTextEvidenceQuality === "verified" &&
        /Rendered text verification remains only weakly evidenced|text evidence is only weakly verified/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        evidenceProfile.sectionEvidenceQuality === "verified" &&
        /Section evidence remains weaker than preferred|Section communication is still thin|Section .*semantically thin/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        evidenceProfile.sectionDirectEvidenceQuality === "verified" &&
        /Section direct-evidence quality is blocked|Section direct-evidence quality remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        evidenceProfile.sectionInferredEvidenceQuality === "verified" &&
        /Section inferred-evidence quality is blocked|Section inferred-evidence burden remains higher than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        evidenceProfile.sectionConstructionEvidenceQuality === "verified" &&
        /Section construction-evidence quality is blocked|Section construction-evidence quality remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        evidenceProfile.sectionConstructionTruthQuality === "verified" &&
        /Section construction-truth quality is blocked|Section construction truth remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        evidenceProfile.wallSectionClipQuality === "verified" &&
        /Wall section-clip quality is blocked|Wall section-clip quality remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        (evidenceProfile.roofTruthQuality === "verified" ||
          evidenceProfile.sectionConstructionTruthQuality === "verified") &&
        /Section roof truth remains contextual|Section roof truth exists, but it is still thinner than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        strongPostComposeSectionFallback &&
        /Section roof truth remains contextual|Section roof truth exists, but it is still thinner than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        (evidenceProfile.foundationTruthQuality === "verified" ||
          evidenceProfile.sectionConstructionTruthQuality === "verified") &&
        /Section foundation\/base-condition truth is blocked|Section foundation\/base-condition truth remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        (evidenceProfile.slabTruthQuality === "verified" ||
          evidenceProfile.sectionConstructionTruthQuality === "verified") &&
        /Section slab\/floor truth is blocked|Section slab\/floor truth remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        evidenceProfile.sideFacadeEvidenceQuality === "verified" &&
        /Side-facade evidence remains weaker than preferred|Side elevations remain weaker than preferred|Elevation (east|west) remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        strongPostComposeSectionFallback &&
        /Section .*serviceable but still semantically thin|Section communication is still thin|Section evidence remains weaker than preferred|Section construction truth remains weaker than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        strongPostComposeConstructionEvidence &&
        /roof truth .*derived|foundation\/base-condition truth .*contextual|ground relation/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        strongPostComposeDirectConstructionBoard &&
        /Section communication is still thin|Section .*serviceable but still semantically thin|Section evidence remains weaker than preferred|Section roof truth remains explicit_generated/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        strongPostComposeSectionBoard &&
        /Section .*serviceable but still semantically thin|Section communication is still thin|Section evidence remains weaker than preferred|Section construction truth remains weaker than preferred|Section roof truth exists, but it is still thinner than preferred/i.test(
          text,
        )
      ) {
        return false;
      }
      return true;
    }),
  );
}

function filterEvidenceOverriddenBlockers(
  blockers = [],
  evidenceProfile = {},
  verificationPhase = "pre_compose",
) {
  if (verificationPhase !== "post_compose") {
    return unique(blockers);
  }

  const strongPostComposeLegacySectionBoard =
    evidenceProfile.renderedTextEvidenceQuality === "verified" &&
    evidenceProfile.sideFacadeEvidenceQuality === "verified" &&
    evidenceProfile.sectionDirectEvidenceQuality === "verified" &&
    evidenceProfile.sectionInferredEvidenceQuality === "verified" &&
    evidenceProfile.sectionConstructionTruthQuality === "verified" &&
    evidenceProfile.slabTruthQuality === "verified" &&
    evidenceProfile.foundationTruthQuality === "verified" &&
    evidenceProfile.roofTruthState === "direct" &&
    evidenceProfile.sectionContextualEvidenceQuality !== "blocked" &&
    evidenceProfile.sectionDerivedEvidenceQuality !== "blocked" &&
    evidenceProfile.sectionConstructionEvidenceQuality !== "blocked";

  return unique(
    (blockers || []).filter((blocker) => {
      const text = String(blocker || "");
      if (
        strongPostComposeLegacySectionBoard &&
        /Section .*semantically too weak for final technical composition/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        strongPostComposeLegacySectionBoard &&
        /Section strategy usefulness failed/i.test(text)
      ) {
        return false;
      }
      if (
        strongPostComposeLegacySectionBoard &&
        /Section evidence quality is blocked because direct cut evidence is too weak/i.test(
          text,
        )
      ) {
        return false;
      }
      if (
        strongPostComposeLegacySectionBoard &&
        /Technical fragment blocker count \d+ exceeds fixture maximum \d+/i.test(
          text,
        )
      ) {
        return false;
      }
      return true;
    }),
  );
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
  const renderedTextEvidenceQuality =
    finalSheetRegression?.renderedTextEvidenceQuality || "provisional";
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
  const roofTruthState =
    finalSheetRegression?.roofTruthState ||
    technicalCredibility?.summary?.roofTruthState ||
    truthBucketFromMode(roofTruthMode);
  const foundationTruthQuality =
    finalSheetRegression?.foundationTruthQuality ||
    technicalCredibility?.summary?.foundationTruthQuality ||
    "provisional";
  const foundationTruthMode =
    finalSheetRegression?.foundationTruthMode ||
    technicalCredibility?.summary?.foundationTruthMode ||
    "missing";
  const foundationTruthState =
    finalSheetRegression?.foundationTruthState ||
    technicalCredibility?.summary?.foundationTruthState ||
    truthBucketFromMode(foundationTruthMode);
  const sideFacadeEvidenceQuality =
    finalSheetRegression?.sideFacadeEvidenceQuality ||
    technicalCredibility?.summary?.sideFacadeEvidenceQuality ||
    "provisional";
  const evidenceProfile = {
    renderedTextEvidenceQuality,
    sectionEvidenceQuality,
    sectionDirectEvidenceQuality,
    sectionInferredEvidenceQuality,
    sectionContextualEvidenceQuality,
    sectionDerivedEvidenceQuality,
    sectionConstructionEvidenceQuality,
    sectionConstructionTruthQuality,
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
  };
  const blockers = filterEvidenceOverriddenBlockers(
    [
      ...(blockingReasons || []),
      ...(finalSheetRegression?.blockers || []),
      ...(technicalCredibility?.blockers || []),
    ],
    evidenceProfile,
    resolvedPhase,
  );
  const warnings = filterEvidenceOverriddenWarnings(
    [
      ...(finalSheetRegression?.warnings || []),
      ...(technicalCredibility?.warnings || []),
    ],
    evidenceProfile,
    resolvedPhase,
  );

  const status = blockers.length
    ? "blocked"
    : warnings.length
      ? "reviewable"
      : "publishable";
  const decision =
    status === "reviewable" ? "reviewable_with_warnings" : status;
  const decisive = resolvedPhase === "post_compose";

  return {
    version:
      sectionContextualEvidenceQuality !== "provisional" ||
      sectionDerivedEvidenceQuality !== "provisional"
        ? "phase20-a1-publishability-v1"
        : wallSectionClipQuality !== "provisional" ||
            openingSectionClipQuality !== "provisional" ||
            stairSectionClipQuality !== "provisional" ||
            slabSectionClipQuality !== "provisional" ||
            roofSectionClipQuality !== "provisional" ||
            foundationSectionClipQuality !== "provisional"
          ? "phase19-a1-publishability-v1"
          : sectionConstructionEvidenceQuality !== "provisional" ||
              cutWallTruthQuality !== "provisional" ||
              cutOpeningTruthQuality !== "provisional" ||
              stairTruthQuality !== "provisional"
            ? "phase18-a1-publishability-v1"
            : roofTruthState !== "unsupported" ||
                foundationTruthState !== "unsupported"
              ? "phase17-a1-publishability-v1"
              : roofTruthMode !== "missing" || foundationTruthMode !== "missing"
                ? "phase16-a1-publishability-v1"
                : roofTruthQuality !== "provisional" ||
                    foundationTruthQuality !== "provisional"
                  ? "phase15-a1-publishability-v1"
                  : sectionConstructionTruthQuality !== "provisional"
                    ? "phase14-a1-publishability-v1"
                    : "phase13-a1-publishability-v1",
    verificationPhase: resolvedPhase,
    decisive,
    provisional: !decisive,
    finalDecision: decisive ? decision : "provisional",
    decision,
    status,
    publishable: status === "publishable",
    reviewable: status === "reviewable",
    blocked: status === "blocked",
    blockers,
    warnings,
    evidenceProfile,
    roofTruthState,
    foundationTruthState,
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
