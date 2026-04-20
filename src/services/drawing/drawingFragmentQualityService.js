import { evaluateTechnicalPanels } from "./panelTechnicalQualityService.js";

export function evaluateDrawingFragmentQuality({
  drawings = {},
  technicalPanelQuality = null,
} = {}) {
  const resolvedQuality =
    technicalPanelQuality || evaluateTechnicalPanels({ drawings });
  const fragmentScores = (resolvedQuality.panels || []).map((panel) => ({
    fragmentId: panel.sourceArtifact,
    panelId: panel.panelId,
    drawingType: panel.drawingType,
    title: panel.title,
    score: panel.score?.score ?? 0,
    verdict:
      panel.score?.verdict ||
      (panel.blockers?.length
        ? "block"
        : panel.warnings?.length
          ? "warning"
          : "pass"),
    blockers: panel.blockers || [],
    warnings: panel.warnings || [],
    thresholds: panel.score?.thresholds || null,
    categoryScores: panel.score?.categoryScores || null,
    sectionConstructionTruthQuality:
      panel.drawing?.technical_quality_metadata
        ?.section_construction_truth_quality || null,
    roofTruthQuality:
      panel.drawing?.technical_quality_metadata?.roof_truth_quality || null,
    foundationTruthQuality:
      panel.drawing?.technical_quality_metadata?.foundation_truth_quality ||
      null,
    emptyGeometryLikely:
      panel.score?.categoryScores?.geometryCompleteness === 0 ||
      (panel.blockers || []).some((entry) =>
        String(entry).toLowerCase().includes("geometry"),
      ),
  }));

  return {
    version: "phase10-drawing-fragment-quality-v1",
    fragmentScores,
    blockingFragments: fragmentScores.filter(
      (entry) => entry.verdict === "block",
    ),
    warningFragments: fragmentScores.filter(
      (entry) => entry.verdict === "warning",
    ),
  };
}

export default {
  evaluateDrawingFragmentQuality,
};
