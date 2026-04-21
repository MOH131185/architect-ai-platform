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
  const roofTruthMode = finalSheetRegression?.roofTruthMode || "missing";
  const foundationTruthMode =
    finalSheetRegression?.foundationTruthMode || "missing";
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
  if (finalSheetRegression?.sectionDirectEvidenceQuality === "blocked") {
    blockers.push(
      "Section direct-evidence quality is blocked because exact cut proof is too weak across the available technical sections.",
    );
  } else if (finalSheetRegression?.sectionDirectEvidenceQuality === "weak") {
    warnings.push(
      "Section direct-evidence quality remains weaker than preferred because exact clipped geometry is still thin.",
    );
  }
  if (finalSheetRegression?.sectionInferredEvidenceQuality === "blocked") {
    blockers.push(
      "Section inferred-evidence quality is blocked because too much section meaning still depends on inferred or approximate evidence.",
    );
  } else if (finalSheetRegression?.sectionInferredEvidenceQuality === "weak") {
    warnings.push(
      "Section inferred-evidence burden remains higher than preferred for final technical credibility.",
    );
  }
  if (finalSheetRegression?.sectionConstructionEvidenceQuality === "blocked") {
    blockers.push(
      "Section construction-evidence quality is blocked because exact cut-construction proof remains too thin across the available technical sections.",
    );
  } else if (
    finalSheetRegression?.sectionConstructionEvidenceQuality === "weak"
  ) {
    warnings.push(
      "Section construction-evidence quality remains weaker than preferred because exact cut-construction proof is still limited or too contextual.",
    );
  }
  if (finalSheetRegression?.sectionConstructionTruthQuality === "blocked") {
    blockers.push(
      "Section construction-truth quality is blocked because cut wall/opening/stair/slab/roof/foundation evidence is too weak for drafting-grade section credibility.",
    );
  } else if (finalSheetRegression?.sectionConstructionTruthQuality === "weak") {
    warnings.push(
      "Section construction truth remains weaker than preferred for drafting-grade final technical credibility.",
    );
  }
  if (finalSheetRegression?.wallSectionClipQuality === "blocked") {
    blockers.push(
      "Wall section-clip quality is blocked because the chosen sections do not expose enough exact clipped wall profile truth.",
    );
  } else if (finalSheetRegression?.wallSectionClipQuality === "weak") {
    warnings.push(
      "Wall section-clip quality remains weaker than preferred for drafting-grade section communication.",
    );
  }
  if (finalSheetRegression?.openingSectionClipQuality === "blocked") {
    warnings.push(
      "Opening section-clip quality remains too thin to communicate cut opening depth cleanly.",
    );
  }
  if (finalSheetRegression?.stairSectionClipQuality === "blocked") {
    warnings.push(
      "Stair section-clip quality remains too thin for a strong circulation communication section.",
    );
  }
  if (finalSheetRegression?.roofSectionClipQuality === "weak") {
    warnings.push(
      "Roof section-clip quality remains more contextual than preferred for final technical credibility.",
    );
  }
  if (finalSheetRegression?.foundationSectionClipQuality === "blocked") {
    warnings.push(
      "Foundation/base-condition section-clip quality remains too thin for strong substructure communication.",
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
  if (finalSheetRegression?.roofTruthQuality === "blocked") {
    warnings.push(
      `Section roof truth remains ${roofTruthMode} across the available technical sections.`,
    );
  } else if (finalSheetRegression?.roofTruthQuality === "weak") {
    warnings.push(
      "Section roof truth exists, but it is still thinner than preferred for final technical credibility.",
    );
  }
  if (finalSheetRegression?.foundationTruthQuality === "blocked") {
    blockers.push(
      `Section foundation/base-condition truth is blocked because support remains ${foundationTruthMode} and explicit substructure evidence is too thin across the available technical sections.`,
    );
  } else if (finalSheetRegression?.foundationTruthQuality === "weak") {
    warnings.push(
      "Section foundation/base-condition truth remains weaker than preferred for final technical credibility.",
    );
  }
  if (finalSheetRegression?.slabTruthQuality === "blocked") {
    blockers.push(
      "Section slab/floor truth is blocked because explicit floor-construction evidence is too thin across the available technical sections.",
    );
  } else if (finalSheetRegression?.slabTruthQuality === "weak") {
    warnings.push(
      "Section slab/floor truth remains weaker than preferred for final technical credibility.",
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
    version:
      finalSheetRegression?.wallSectionClipQuality &&
      finalSheetRegression?.wallSectionClipQuality !== "provisional"
        ? "phase19-a1-technical-credibility-v1"
        : finalSheetRegression?.sectionConstructionEvidenceQuality &&
            finalSheetRegression?.sectionConstructionEvidenceQuality !==
              "provisional"
          ? "phase18-a1-technical-credibility-v1"
          : finalSheetRegression?.roofTruthState ||
              finalSheetRegression?.foundationTruthState
            ? "phase17-a1-technical-credibility-v1"
            : finalSheetRegression?.roofTruthQuality &&
                finalSheetRegression?.roofTruthQuality !== "provisional"
              ? "phase15-a1-technical-credibility-v1"
              : finalSheetRegression?.sectionConstructionTruthQuality &&
                  finalSheetRegression?.sectionConstructionTruthQuality !==
                    "provisional"
                ? "phase14-a1-technical-credibility-v1"
                : "phase13-a1-technical-credibility-v1",
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
      sectionDirectEvidenceQuality:
        finalSheetRegression?.sectionDirectEvidenceQuality || "provisional",
      sectionInferredEvidenceQuality:
        finalSheetRegression?.sectionInferredEvidenceQuality || "provisional",
      sectionContextualEvidenceQuality:
        finalSheetRegression?.sectionContextualEvidenceQuality || "provisional",
      sectionDerivedEvidenceQuality:
        finalSheetRegression?.sectionDerivedEvidenceQuality || "provisional",
      sectionConstructionEvidenceQuality:
        finalSheetRegression?.sectionConstructionEvidenceQuality ||
        "provisional",
      sectionConstructionTruthQuality:
        finalSheetRegression?.sectionConstructionTruthQuality || "provisional",
      sectionTruthModelVersion:
        finalSheetRegression?.sectionTruthModelVersion || null,
      wallSectionClipQuality:
        finalSheetRegression?.wallSectionClipQuality || "provisional",
      openingSectionClipQuality:
        finalSheetRegression?.openingSectionClipQuality || "provisional",
      stairSectionClipQuality:
        finalSheetRegression?.stairSectionClipQuality || "provisional",
      slabSectionClipQuality:
        finalSheetRegression?.slabSectionClipQuality || "provisional",
      roofSectionClipQuality:
        finalSheetRegression?.roofSectionClipQuality || "provisional",
      foundationSectionClipQuality:
        finalSheetRegression?.foundationSectionClipQuality || "provisional",
      cutWallTruthQuality:
        finalSheetRegression?.cutWallTruthQuality || "provisional",
      cutOpeningTruthQuality:
        finalSheetRegression?.cutOpeningTruthQuality || "provisional",
      stairTruthQuality:
        finalSheetRegression?.stairTruthQuality || "provisional",
      slabTruthQuality: finalSheetRegression?.slabTruthQuality || "provisional",
      roofTruthQuality: finalSheetRegression?.roofTruthQuality || "provisional",
      roofTruthMode,
      roofTruthState: finalSheetRegression?.roofTruthState || "unsupported",
      foundationTruthQuality:
        finalSheetRegression?.foundationTruthQuality || "provisional",
      foundationTruthMode,
      foundationTruthState:
        finalSheetRegression?.foundationTruthState || "unsupported",
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
