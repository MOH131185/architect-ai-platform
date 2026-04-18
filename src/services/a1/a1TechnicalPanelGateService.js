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
  const staleFragments = new Set(artifactFreshness?.staleFragments || []);
  const missingFragments = new Set(artifactFreshness?.missingFragments || []);
  const panelCandidateMap = new Map(
    (panelCandidates || []).map((candidate) => [candidate.id, candidate]),
  );

  const blockingReasons = [];
  const warnings = [];
  const blockingPanels = new Set(
    checks.blockingPanels.map((entry) => entry.panelId),
  );

  checks.checks.forEach((entry) => {
    const candidate = panelCandidateMap.get(entry.panelId);
    const sourceArtifacts = candidate?.sourceArtifacts || [];
    const staleSourceArtifacts = sourceArtifacts.filter((id) =>
      staleFragments.has(id),
    );
    const missingSourceArtifacts = sourceArtifacts.filter((id) =>
      missingFragments.has(id),
    );

    if (staleSourceArtifacts.length) {
      blockingPanels.add(entry.panelId);
      blockingReasons.push(
        `${entry.panelId} is stale relative to current geometry (${staleSourceArtifacts.join(", ")}).`,
      );
    }
    if (missingSourceArtifacts.length) {
      blockingPanels.add(entry.panelId);
      blockingReasons.push(
        `${entry.panelId} is missing required drawing fragments (${missingSourceArtifacts.join(", ")}).`,
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
    version: "phase7-a1-technical-panel-gate-v1",
    technicalReady: blockingReasons.length === 0,
    blockingPanels: [...blockingPanels].sort(),
    blockingReasons: [...new Set(blockingReasons)],
    warnings: [...new Set(warnings)],
    panelChecks: checks.checks,
  };
}

export default {
  evaluateA1TechnicalPanelGate,
};
