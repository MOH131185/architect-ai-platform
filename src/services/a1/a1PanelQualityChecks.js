import { evaluateTechnicalPanels } from "../drawing/panelTechnicalQualityService.js";
import { runA1TechnicalPanelRegression } from "./a1TechnicalPanelRegressionService.js";

export function runA1PanelQualityChecks({
  drawings = {},
  panelCandidates = [],
  technicalPanelQuality = null,
} = {}) {
  const technicalPanels =
    technicalPanelQuality || evaluateTechnicalPanels({ drawings });
  const byPanelId = new Map(
    technicalPanels.panels.map((panel) => [panel.panelId, panel]),
  );

  const checks = (panelCandidates || [])
    .filter((candidate) =>
      ["floor_plan", "elevation", "section"].includes(candidate.type),
    )
    .map((candidate) => ({
      panelId: candidate.id,
      title: candidate.title,
      quality: byPanelId.get(candidate.id) || {
        score: {
          verdict: "block",
          score: 0,
        },
        warnings: [],
        blockers: [
          "No technical drawing quality evaluation is available for this panel.",
        ],
      },
    }));
  const technicalPanelRegression = runA1TechnicalPanelRegression({
    drawings,
    technicalPanelQuality: technicalPanels,
  });

  const phase21Active =
    technicalPanelRegression.sectionFaceBundleVersion ||
    (technicalPanelRegression.sectionFaceCredibilityQuality &&
      technicalPanelRegression.sectionFaceCredibilityQuality !==
        "provisional") ||
    Number(technicalPanelRegression.sectionCutFaceTruthCount || 0) > 0 ||
    Number(technicalPanelRegression.sectionCutProfileTruthCount || 0) > 0;

  return {
    version: phase21Active
      ? "phase21-a1-panel-quality-checks-v1"
      : technicalPanelRegression.roofTruthState ||
          technicalPanelRegression.foundationTruthState
        ? "phase17-a1-panel-quality-checks-v1"
        : "phase13-a1-panel-quality-checks-v1",
    checks,
    blockingPanels: checks.filter((entry) => entry.quality?.blockers?.length),
    warningPanels: checks.filter(
      (entry) =>
        !entry.quality?.blockers?.length && entry.quality?.warnings?.length,
    ),
    technicalPanels,
    technicalPanelRegression,
    technicalFragmentScores: technicalPanelRegression.technicalFragmentScores,
    perSideElevationStatus: technicalPanelRegression.perSideElevationStatus,
    sectionCandidateQuality: technicalPanelRegression.sectionCandidateQuality,
    sectionDirectEvidenceQuality:
      technicalPanelRegression.sectionDirectEvidenceQuality || "provisional",
    sectionInferredEvidenceQuality:
      technicalPanelRegression.sectionInferredEvidenceQuality || "provisional",
    sectionConstructionTruthQuality:
      technicalPanelRegression.sectionConstructionTruthQuality || "provisional",
    slabTruthQuality:
      technicalPanelRegression.slabTruthQuality || "provisional",
    roofTruthQuality:
      technicalPanelRegression.roofTruthQuality || "provisional",
    roofTruthMode: technicalPanelRegression.roofTruthMode || "missing",
    roofTruthState: technicalPanelRegression.roofTruthState || "unsupported",
    foundationTruthQuality:
      technicalPanelRegression.foundationTruthQuality || "provisional",
    foundationTruthMode:
      technicalPanelRegression.foundationTruthMode || "missing",
    foundationTruthState:
      technicalPanelRegression.foundationTruthState || "unsupported",
    sectionFaceCredibilityQuality:
      technicalPanelRegression.sectionFaceCredibilityQuality || "provisional",
    sectionFaceCredibilityScore: Number(
      technicalPanelRegression.sectionFaceCredibilityScore || 0,
    ),
    sectionCutFaceTruthCount: Number(
      technicalPanelRegression.sectionCutFaceTruthCount || 0,
    ),
    sectionCutProfileTruthCount: Number(
      technicalPanelRegression.sectionCutProfileTruthCount || 0,
    ),
    sectionAverageProfileContinuity: Number(
      technicalPanelRegression.sectionAverageProfileContinuity || 0,
    ),
    sectionFaceBundleVersion:
      technicalPanelRegression.sectionFaceBundleVersion || null,
    sectionStrategyRationale:
      technicalPanelRegression.sectionCandidateQuality.map((entry) => ({
        sectionType: entry.sectionType,
        strategyId: entry.strategyId || null,
        strategyName: entry.strategyName || null,
        rationale: entry.rationale || [],
      })),
  };
}

export default {
  runA1PanelQualityChecks,
};
