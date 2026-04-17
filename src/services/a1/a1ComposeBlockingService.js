export function buildA1ComposeBlockingState({
  projectGeometry = {},
  validationReport = null,
  freshness = null,
  technicalPanelGate = null,
} = {}) {
  const blockingReasons = [];
  const recoverableIssues = [];
  const nonRecoverableIssues = [];

  if (!projectGeometry?.project_id) {
    nonRecoverableIssues.push("Project geometry is missing a project_id.");
  }
  if ((validationReport?.status || "") === "invalid") {
    blockingReasons.push("Project validation is invalid.");
    recoverableIssues.push("Canonical geometry needs repair before compose.");
  }
  if ((freshness?.missingAssets || []).length) {
    blockingReasons.push(
      `Missing assets: ${(freshness.missingAssets || []).join(", ")}.`,
    );
    recoverableIssues.push("Generate missing artifacts before compose.");
  }
  if ((freshness?.stalePanels || []).length) {
    blockingReasons.push(
      `Stale panels: ${freshness.stalePanels.map((entry) => entry.id).join(", ")}.`,
    );
    recoverableIssues.push("Regenerate stale panel sources before compose.");
  }
  if (technicalPanelGate && !technicalPanelGate.technicalReady) {
    blockingReasons.push(...(technicalPanelGate.blockingReasons || []));
    recoverableIssues.push(
      "Technical drawing quality must reach the minimum readability and annotation threshold.",
    );
  }

  return {
    version: "phase6-a1-compose-blocking-v1",
    composeReady:
      blockingReasons.length === 0 && nonRecoverableIssues.length === 0,
    composeBlocked:
      blockingReasons.length > 0 || nonRecoverableIssues.length > 0,
    blockingReasons: [
      ...new Set([...blockingReasons, ...nonRecoverableIssues]),
    ],
    recoverableIssues: [...new Set(recoverableIssues)],
    nonRecoverableIssues,
  };
}

export default {
  buildA1ComposeBlockingState,
};
