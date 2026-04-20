import { runA1TechnicalPanelRegression } from "./a1TechnicalPanelRegressionService.js";
import { runA1TextZoneSanity } from "./a1TextZoneSanityService.js";
import { resolveA1RegressionFixture } from "./a1RegressionFixtureService.js";
import { compareRenderedSheetAgainstFixture } from "./a1RenderedSheetComparator.js";
import { buildVerificationState } from "./a1VerificationStateModel.js";

export function runA1FinalSheetRegression({
  drawings = {},
  technicalPanelQuality = null,
  sheetSvg = "",
  fontReadiness = null,
  expectedLabels = [],
  coordinates = {},
  panelLabelMap = {},
  width = null,
  height = null,
  fixtureId = null,
  renderedTextZone = null,
  verificationPhase = "pre_compose",
} = {}) {
  const technicalPanelRegression = runA1TechnicalPanelRegression({
    drawings,
    technicalPanelQuality,
  });
  const textZoneSanity = runA1TextZoneSanity({
    sheetSvg,
    expectedLabels,
    fontReadiness,
    coordinates,
    panelLabelMap,
    width,
    height,
    renderedTextZone,
  });
  const fixture = resolveA1RegressionFixture({
    fixtureId,
    drawings,
  });
  const fixtureComparison = compareRenderedSheetAgainstFixture({
    fixture,
    renderedTextZone: textZoneSanity.renderedTextZone,
    technicalPanelRegression,
    coordinates,
    sheetSvg,
  });

  const blockers = [
    ...(technicalPanelRegression.blockers || []),
    ...(textZoneSanity.blockers || []),
    ...(fixtureComparison.blockers || []),
  ];
  const warnings = [
    ...(technicalPanelRegression.warnings || []),
    ...(textZoneSanity.warnings || []),
    ...(fixtureComparison.warnings || []),
  ];

  return {
    version:
      technicalPanelRegression.sectionDirectEvidenceQuality ||
      technicalPanelRegression.sectionInferredEvidenceQuality ||
      textZoneSanity.renderedTextEvidenceQuality ||
      technicalPanelRegression.sectionEvidenceQuality ||
      technicalPanelRegression.sideFacadeEvidenceQuality
        ? "phase13-a1-final-sheet-regression-v1"
        : textZoneSanity.renderedTextEvidenceQuality ||
            technicalPanelRegression.sectionEvidenceQuality ||
            technicalPanelRegression.sideFacadeEvidenceQuality
          ? "phase12-a1-final-sheet-regression-v1"
          : "phase10-a1-final-sheet-regression-v1",
    verificationPhase,
    finalSheetRegressionReady: blockers.length === 0,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    technicalPanelRegression,
    textZoneSanity,
    renderedTextZoneStatus: textZoneSanity.renderedTextZoneStatus || "warning",
    renderedTextZone: textZoneSanity.renderedTextZone || null,
    fixtureComparison,
    perSideElevationStatus: technicalPanelRegression.perSideElevationStatus,
    sectionCandidateQuality: technicalPanelRegression.sectionCandidateQuality,
    sectionEvidenceQuality:
      technicalPanelRegression.sectionEvidenceQuality || "provisional",
    sectionDirectEvidenceQuality:
      technicalPanelRegression.sectionDirectEvidenceQuality || "provisional",
    sectionInferredEvidenceQuality:
      technicalPanelRegression.sectionInferredEvidenceQuality || "provisional",
    sideFacadeEvidenceQuality:
      technicalPanelRegression.sideFacadeEvidenceQuality || "provisional",
    renderedTextEvidenceQuality:
      textZoneSanity.renderedTextEvidenceQuality || "provisional",
    technicalFragmentScores: technicalPanelRegression.technicalFragmentScores,
    verificationState: buildVerificationState({
      phase: verificationPhase,
      status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
      blockers,
      warnings,
      confidence: textZoneSanity.renderedTextZone?.confidence ?? null,
      label: "finalSheetRegression",
      evidenceSource:
        verificationPhase === "post_compose" ? "rendered_output" : "metadata",
    }),
  };
}

export default {
  runA1FinalSheetRegression,
};
