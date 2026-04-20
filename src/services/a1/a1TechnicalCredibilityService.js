import { buildVerificationState } from "./a1VerificationStateModel.js";

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

export function evaluateA1TechnicalCredibility({
  drawings = {},
  finalSheetRegression = null,
  verificationPhase = null,
} = {}) {
  const blockers = [];
  const warnings = [];
  const technicalDrawingCount =
    (drawings.plan || []).length +
    (drawings.elevation || []).length +
    (drawings.section || []).length;
  const perSideElevationStatus =
    finalSheetRegression?.perSideElevationStatus || {};
  const weakSides = Object.entries(perSideElevationStatus)
    .filter(([, entry]) => entry?.status === "warning")
    .map(([side]) => side);
  const blockedSides = Object.entries(perSideElevationStatus)
    .filter(([, entry]) => entry?.status === "block")
    .map(([side]) => side);
  const weakSections = (
    finalSheetRegression?.sectionCandidateQuality || []
  ).filter((entry) => entry.status === "warning");
  const blockedSections = (
    finalSheetRegression?.sectionCandidateQuality || []
  ).filter((entry) => entry.status === "block");

  if (technicalDrawingCount < 3) {
    blockers.push(
      `Only ${technicalDrawingCount} technical drawing panel(s) are available; a credible A1 board requires at least 3.`,
    );
  }
  if (blockedSides.length) {
    blockers.push(
      `Side elevation credibility failed for ${blockedSides.join(", ")}.`,
    );
  }
  if (blockedSections.length) {
    blockers.push(
      `Section strategy usefulness failed for ${blockedSections
        .map((entry) => entry.sectionType)
        .join(", ")}.`,
    );
  }
  if (weakSides.length) {
    warnings.push(
      `Side elevations remain weaker than preferred for ${weakSides.join(", ")}.`,
    );
  }
  if (weakSections.length) {
    warnings.push(
      `Section communication is still thin for ${weakSections
        .map((entry) => entry.sectionType)
        .join(", ")}.`,
    );
  }
  warnings.push(...(finalSheetRegression?.warnings || []));
  blockers.push(...(finalSheetRegression?.blockers || []));

  const status = blockers.length
    ? "block"
    : warnings.length
      ? "degraded"
      : "pass";

  return {
    version: "phase10-a1-technical-credibility-v1",
    verificationPhase:
      verificationPhase ||
      finalSheetRegression?.verificationPhase ||
      "pre_compose",
    status,
    technicallyCredible: blockers.length === 0,
    blockers: unique(blockers),
    warnings: unique(warnings),
    summary: {
      technicalDrawingCount,
      blockedSides,
      weakSides,
      blockedSections: blockedSections.map((entry) => entry.sectionType),
      weakSections: weakSections.map((entry) => entry.sectionType),
    },
    verificationState: buildVerificationState({
      phase:
        verificationPhase ||
        finalSheetRegression?.verificationPhase ||
        "pre_compose",
      status,
      blockers,
      warnings,
      label: "technicalCredibility",
      evidenceSource:
        (verificationPhase || finalSheetRegression?.verificationPhase) ===
        "post_compose"
          ? "rendered_output"
          : "metadata",
    }),
  };
}

export default {
  evaluateA1TechnicalCredibility,
};
