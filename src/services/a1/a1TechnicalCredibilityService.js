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
  if (finalSheetRegression?.sectionEvidenceQuality === "blocked") {
    blockers.push(
      "Section evidence quality is blocked because direct cut evidence is too weak across the available technical sections.",
    );
  } else if (finalSheetRegression?.sectionEvidenceQuality === "weak") {
    warnings.push(
      "Section evidence remains weaker than preferred because direct cut evidence is thin or heavily contextual.",
    );
  }
  if (finalSheetRegression?.sideFacadeEvidenceQuality === "blocked") {
    blockers.push(
      "Side-facade evidence quality is blocked because the available side schemas remain too thin for credible elevations.",
    );
  } else if (finalSheetRegression?.sideFacadeEvidenceQuality === "weak") {
    warnings.push(
      "Side-facade evidence remains weaker than preferred because side schema support is still thin or envelope-derived.",
    );
  }
  if (finalSheetRegression?.renderedTextEvidenceQuality === "weak") {
    warnings.push(
      "Rendered text verification remains only weakly evidenced; OCR or zone evidence did not fully verify the final board.",
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
    version: "phase12-a1-technical-credibility-v1",
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
      sectionEvidenceQuality:
        finalSheetRegression?.sectionEvidenceQuality || "provisional",
      sideFacadeEvidenceQuality:
        finalSheetRegression?.sideFacadeEvidenceQuality || "provisional",
      renderedTextEvidenceQuality:
        finalSheetRegression?.renderedTextEvidenceQuality || "provisional",
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
