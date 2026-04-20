import { runA1FinalSheetRegression } from "./a1FinalSheetRegressionService.js";
import { verifyRenderedTextZones } from "./a1RenderedTextVerificationService.js";
import { evaluateA1TechnicalCredibility } from "./a1TechnicalCredibilityService.js";
import { classifyA1Publishability } from "./a1PublishabilityService.js";
import { buildA1VerificationStateBundle } from "./a1VerificationStateSerializer.js";

export async function runA1PostComposeVerification({
  drawings = {},
  technicalPanelQuality = null,
  sheetSvg = "",
  renderedBuffer = null,
  fontReadiness = null,
  expectedLabels = [],
  coordinates = {},
  panelLabelMap = {},
  width = null,
  height = null,
  ocrAdapter = null,
} = {}) {
  const renderedTextZone = await verifyRenderedTextZones({
    sheetSvg,
    renderedBuffer,
    expectedLabels,
    coordinates,
    panelLabelMap,
    width,
    height,
    ocrAdapter,
  });
  const finalSheetRegression = runA1FinalSheetRegression({
    drawings,
    technicalPanelQuality,
    sheetSvg,
    fontReadiness,
    expectedLabels,
    coordinates,
    panelLabelMap,
    width,
    height,
    renderedTextZone,
    verificationPhase: "post_compose",
  });
  const technicalCredibility = evaluateA1TechnicalCredibility({
    drawings,
    finalSheetRegression,
    verificationPhase: "post_compose",
  });
  const publishability = classifyA1Publishability({
    finalSheetRegression,
    technicalCredibility,
    verificationPhase: "post_compose",
  });
  const verificationState = buildA1VerificationStateBundle({
    renderedTextZone,
    finalSheetRegression,
    technicalCredibility,
    publishability,
  });

  return {
    version: "phase11-a1-post-compose-verification-v1",
    status: publishability.status,
    postComposeVerified: true,
    renderedTextZone,
    finalSheetRegression,
    technicalCredibility,
    publishability,
    verificationBundle: verificationState,
    verificationState,
    blockers: [
      ...new Set([
        ...(renderedTextZone.blockers || []),
        ...(finalSheetRegression.blockers || []),
        ...(technicalCredibility.blockers || []),
        ...(publishability.blockers || []),
      ]),
    ],
    warnings: [
      ...new Set([
        ...(renderedTextZone.warnings || []),
        ...(finalSheetRegression.warnings || []),
        ...(technicalCredibility.warnings || []),
        ...(publishability.warnings || []),
      ]),
    ],
  };
}

export default {
  runA1PostComposeVerification,
};
