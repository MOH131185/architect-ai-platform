import { runA1TechnicalPanelRegression } from "./a1TechnicalPanelRegressionService.js";
import { runA1TextZoneSanity } from "./a1TextZoneSanityService.js";

export function runA1FinalSheetRegression({
  drawings = {},
  technicalPanelQuality = null,
  sheetSvg = "",
  fontReadiness = null,
  expectedLabels = [],
} = {}) {
  const technicalPanelRegression = runA1TechnicalPanelRegression({
    drawings,
    technicalPanelQuality,
  });
  const textZoneSanity = runA1TextZoneSanity({
    sheetSvg,
    expectedLabels,
    fontReadiness,
  });

  const blockers = [
    ...(technicalPanelRegression.blockers || []),
    ...(textZoneSanity.blockers || []),
  ];
  const warnings = [
    ...(technicalPanelRegression.warnings || []),
    ...(textZoneSanity.warnings || []),
  ];

  return {
    version: "phase9-a1-final-sheet-regression-v1",
    finalSheetRegressionReady: blockers.length === 0,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    technicalPanelRegression,
    textZoneSanity,
    perSideElevationStatus: technicalPanelRegression.perSideElevationStatus,
    sectionCandidateQuality: technicalPanelRegression.sectionCandidateQuality,
    technicalFragmentScores: technicalPanelRegression.technicalFragmentScores,
  };
}

export default {
  runA1FinalSheetRegression,
};
