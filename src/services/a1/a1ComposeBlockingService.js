import { isFeatureEnabled } from "../../config/featureFlags.js";

export function buildA1ComposeBlockingState({
  projectGeometry = {},
  validationReport = null,
  freshness = null,
  technicalPanelGate = null,
  consistencyGuard = null,
  fontReadiness = null,
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
  if (
    isFeatureEnabled("useTechnicalPanelComposeBlockingPhase8") &&
    consistencyGuard &&
    !consistencyGuard.consistencyReady
  ) {
    blockingReasons.push(...(consistencyGuard.blockingReasons || []));
    recoverableIssues.push(
      "Hero identity must remain consistent with canonical geometry, roof language, and material palette.",
    );
  }
  if (
    isFeatureEnabled("useA1FontEmbeddingFix") &&
    fontReadiness &&
    fontReadiness.readyForEmbedding === false
  ) {
    blockingReasons.push(
      "Bundled A1 font embedding is unavailable; final sheet text cannot be rasterized safely.",
    );
    recoverableIssues.push(
      "Restore bundled A1 regular font availability before compose.",
    );
  }
  if (
    isFeatureEnabled("useA1FontEmbeddingFix") &&
    fontReadiness &&
    fontReadiness.readyForEmbedding === true &&
    fontReadiness.fullEmbeddingReady === false
  ) {
    recoverableIssues.push(
      "A1 font embedding is degraded because bold coverage is incomplete; text may lose intended weight hierarchy.",
    );
  }
  if (
    fontReadiness &&
    fontReadiness.readyForEmbedding === false &&
    !isFeatureEnabled("useA1FontEmbeddingFix")
  ) {
    recoverableIssues.push(
      "Bundled A1 font embedding is not ready; text rendering may drift in serverless rasterization.",
    );
  }

  return {
    version: "phase8-a1-compose-blocking-v1",
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
