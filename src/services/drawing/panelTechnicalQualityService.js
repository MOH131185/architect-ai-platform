import { assessAnnotationReliability } from "./annotationReliabilityService.js";
import { scoreDrawingReadability } from "./drawingReadabilityScoringService.js";
import { scoreTechnicalPanel } from "./technicalPanelScoringService.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";

function resolveDrawingPanels(drawings = {}) {
  return [
    ...(drawings.plan || []).map((entry, index) => ({
      panelId: `panel:floor-plan:${entry.level_id || index}`,
      sourceArtifact: `drawing:plan:${entry.level_id || index}`,
      drawingType: "plan",
      title: entry.title || `Floor Plan ${index + 1}`,
      drawing: entry,
    })),
    ...(drawings.elevation || []).map((entry, index) => ({
      panelId: `panel:elevation:${entry.orientation || index}`,
      sourceArtifact: `drawing:elevation:${entry.orientation || index}`,
      drawingType: "elevation",
      title: entry.title || `Elevation ${index + 1}`,
      drawing: entry,
    })),
    ...(drawings.section || []).map((entry, index) => ({
      panelId: `panel:section:${entry.section_type || index}`,
      sourceArtifact: `drawing:section:${entry.section_type || index}`,
      drawingType: "section",
      title: entry.title || `Section ${index + 1}`,
      drawing: entry,
    })),
  ];
}

export function evaluateTechnicalPanels({ drawings = {} } = {}) {
  const panels = resolveDrawingPanels(drawings).map((entry) => {
    const readability = scoreDrawingReadability(entry.drawing, {
      drawingType: entry.drawingType,
    });
    const annotation = assessAnnotationReliability(entry.drawing, {
      drawingType: entry.drawingType,
    });
    const annotationPlacement = entry.drawing.annotation_validation || null;
    const enhancedScoringEnabled =
      isFeatureEnabled("useTechnicalPanelScoringPhase8") ||
      isFeatureEnabled("useTechnicalPanelScoringPhase7");
    const scoredPanel = enhancedScoringEnabled
      ? scoreTechnicalPanel({
          drawingType: entry.drawingType,
          drawing: entry.drawing,
          readability,
          annotation,
          annotationPlacement,
        })
      : null;
    const warnings = scoredPanel
      ? [...scoredPanel.warnings]
      : [...readability.warnings, ...annotation.warnings];
    const blockers = scoredPanel
      ? [...scoredPanel.blockers]
      : [...annotation.errors];
    if (!scoredPanel) {
      if (readability.score < 0.55) {
        blockers.push(
          `${entry.title} readability score ${readability.score} is below the Phase 6 technical threshold.`,
        );
      } else if (readability.score < 0.68) {
        warnings.push(
          `${entry.title} readability score ${readability.score} is serviceable but weak for technical composition.`,
        );
      }
    }

    return {
      panelId: entry.panelId,
      sourceArtifact: entry.sourceArtifact,
      drawingType: entry.drawingType,
      title: entry.title,
      readability,
      annotation,
      annotationPlacement,
      score: scoredPanel,
      warnings: [...new Set(warnings)],
      blockers: [...new Set(blockers)],
      technicalReady: blockers.length === 0,
    };
  });

  return {
    version:
      isFeatureEnabled("useTechnicalPanelScoringPhase8") ||
      isFeatureEnabled("useTechnicalPanelScoringPhase7")
        ? "phase8-panel-technical-quality-v1"
        : "phase6-panel-technical-quality-v1",
    panels,
    weakPanels: panels.filter((entry) => entry.warnings.length > 0),
    blockingPanels: panels.filter((entry) => entry.blockers.length > 0),
  };
}

export default {
  evaluateTechnicalPanels,
};
