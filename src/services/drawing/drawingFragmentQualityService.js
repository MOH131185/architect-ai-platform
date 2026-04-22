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
    roofTruthMode:
      panel.drawing?.technical_quality_metadata?.roof_truth_mode || null,
    foundationTruthQuality:
      panel.drawing?.technical_quality_metadata?.foundation_truth_quality ||
      null,
    foundationTruthMode:
      panel.drawing?.technical_quality_metadata?.foundation_truth_mode || null,
    sectionFaceCredibilityQuality:
      panel.drawing?.technical_quality_metadata
        ?.section_face_credibility_quality || null,
    sectionFaceCredibilityScore: Number(
      panel.drawing?.technical_quality_metadata
        ?.section_face_credibility_score || 0,
    ),
    sectionCutFaceTruthCount: Number(
      panel.drawing?.technical_quality_metadata
        ?.section_cut_face_construction_truth_count ||
        panel.drawing?.technical_quality_metadata
          ?.section_face_cut_face_count ||
        0,
    ),
    sectionCutProfileTruthCount: Number(
      panel.drawing?.technical_quality_metadata
        ?.section_cut_profile_construction_truth_count ||
        panel.drawing?.technical_quality_metadata
          ?.section_face_cut_profile_count ||
        0,
    ),
    sectionAverageProfileContinuity: Number(
      panel.drawing?.technical_quality_metadata
        ?.section_average_construction_profile_continuity || 0,
    ),
    sectionFaceBundleVersion:
      panel.drawing?.technical_quality_metadata?.section_face_bundle_version ||
      null,
    emptyGeometryLikely:
      panel.score?.categoryScores?.geometryCompleteness === 0 ||
      (panel.blockers || []).some((entry) =>
        String(entry).toLowerCase().includes("geometry"),
      ),
  }));

  const hasPhase21Signal = fragmentScores.some(
    (entry) =>
      entry.sectionFaceCredibilityQuality != null ||
      entry.sectionFaceBundleVersion != null ||
      entry.sectionCutFaceTruthCount > 0 ||
      entry.sectionCutProfileTruthCount > 0,
  );

  return {
    version: hasPhase21Signal
      ? "phase21-drawing-fragment-quality-v1"
      : "phase10-drawing-fragment-quality-v1",
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
