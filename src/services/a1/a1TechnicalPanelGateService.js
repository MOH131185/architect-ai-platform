import { runA1PanelQualityChecks } from "./a1PanelQualityChecks.js";

export function evaluateA1TechnicalPanelGate({
  drawings = {},
  panelCandidates = [],
  artifactFreshness = null,
  technicalPanelQuality = null,
} = {}) {
  const checks = runA1PanelQualityChecks({
    drawings,
    panelCandidates,
    technicalPanelQuality,
  });
  const freshnessById = new Map(
    (artifactFreshness?.families || []).flatMap((family) =>
      (family.fragmentIds || []).map((fragmentId) => [
        fragmentId
          .replace("drawing:plan:", "panel:floor-plan:")
          .replace("drawing:elevation:", "panel:elevation:")
          .replace("drawing:section:", "panel:section:"),
        family,
      ]),
    ),
  );

  const blockingReasons = [];
  const warnings = [];
  const blockingPanels = checks.blockingPanels.map((entry) => entry.panelId);

  checks.checks.forEach((entry) => {
    const freshness = freshnessById.get(entry.panelId);
    if (freshness?.staleFragmentIds?.length) {
      blockingReasons.push(
        `${entry.panelId} is stale relative to current geometry.`,
      );
    }
    if (freshness?.missingFragmentIds?.length) {
      blockingReasons.push(
        `${entry.panelId} is missing required drawing fragments.`,
      );
    }
  });

  checks.warningPanels.forEach((entry) => {
    warnings.push(
      ...(entry.quality?.warnings || []).map(
        (warning) => `${entry.panelId}: ${warning}`,
      ),
    );
  });
  checks.blockingPanels.forEach((entry) => {
    blockingReasons.push(
      ...(entry.quality?.blockers || []).map(
        (blocker) => `${entry.panelId}: ${blocker}`,
      ),
    );
  });

  return {
    version: "phase6-a1-technical-panel-gate-v1",
    technicalReady: blockingReasons.length === 0,
    blockingPanels,
    blockingReasons: [...new Set(blockingReasons)],
    warnings: [...new Set(warnings)],
    panelChecks: checks.checks,
  };
}

export default {
  evaluateA1TechnicalPanelGate,
};
