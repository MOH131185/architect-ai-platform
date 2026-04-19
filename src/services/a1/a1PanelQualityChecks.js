import { evaluateTechnicalPanels } from "../drawing/panelTechnicalQualityService.js";

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

  return {
    version: "phase8-a1-panel-quality-checks-v1",
    checks,
    blockingPanels: checks.filter((entry) => entry.quality?.blockers?.length),
    warningPanels: checks.filter(
      (entry) =>
        !entry.quality?.blockers?.length && entry.quality?.warnings?.length,
    ),
    technicalPanels,
  };
}

export default {
  runA1PanelQualityChecks,
};
