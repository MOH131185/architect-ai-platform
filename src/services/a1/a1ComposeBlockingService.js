import { isFeatureEnabled } from "../../config/featureFlags.js";

export function buildA1ComposeBlockingState({
  projectGeometry = {},
  validationReport = null,
  freshness = null,
  technicalPanelGate = null,
  consistencyGuard = null,
  fontReadiness = null,
  finalSheetRegression = null,
  technicalCredibility = null,
  publishability = null,
  verificationState = null,
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
  if (
    (isFeatureEnabled("useA1PreComposeVerificationPhase9") ||
      isFeatureEnabled("useFinalSheetRegressionProtectionPhase10")) &&
    finalSheetRegression &&
    finalSheetRegression.finalSheetRegressionReady === false
  ) {
    blockingReasons.push(...(finalSheetRegression.blockers || []));
    recoverableIssues.push(
      "Phase 9 final-sheet regression checks must pass before technical composition is considered credible.",
    );
  } else if (
    isFeatureEnabled("useA1FinalSheetRegressionChecksPhase9") &&
    finalSheetRegression &&
    finalSheetRegression.status === "warning"
  ) {
    recoverableIssues.push(
      "Phase 9 final-sheet regression checks reported warnings; composition may proceed but technical credibility is still weaker than preferred.",
    );
  }
  if (
    isFeatureEnabled("useFinalTechnicalCredibilityChecksPhase10") &&
    technicalCredibility &&
    technicalCredibility.status === "block"
  ) {
    blockingReasons.push(...(technicalCredibility.blockers || []));
    recoverableIssues.push(
      "Phase 10 technical credibility checks must pass before the board can be treated as publishable.",
    );
  } else if (
    isFeatureEnabled("useFinalTechnicalCredibilityChecksPhase10") &&
    technicalCredibility &&
    technicalCredibility.status === "degraded"
  ) {
    recoverableIssues.push(
      "Phase 10 technical credibility checks marked the board as degraded; review or regeneration is recommended before publish.",
    );
  }
  if (
    (isFeatureEnabled("useA1PublishabilityGatePhase10") ||
      isFeatureEnabled("useFinalPublishabilityGatePhase10")) &&
    publishability?.status === "blocked" &&
    (publishability?.verificationState?.verified === true ||
      verificationState?.publishability?.verified === true ||
      publishability?.verificationPhase === "post_compose")
  ) {
    blockingReasons.push(...(publishability.blockers || []));
    recoverableIssues.push(
      "Phase 10 publishability classification blocked the board based on final-sheet credibility evidence.",
    );
  } else if (
    (isFeatureEnabled("useA1PublishabilityGatePhase10") ||
      isFeatureEnabled("useFinalPublishabilityGatePhase10")) &&
    publishability?.status === "blocked"
  ) {
    recoverableIssues.push(
      "Phase 10 publishability is currently provisional because only pre-compose evidence is available.",
    );
  }

  return {
    version:
      isFeatureEnabled("useA1PublishabilityGatePhase10") ||
      isFeatureEnabled("useFinalPublishabilityGatePhase10") ||
      isFeatureEnabled("useFinalTechnicalCredibilityChecksPhase10")
        ? "phase10-a1-compose-blocking-v1"
        : isFeatureEnabled("useA1PreComposeVerificationPhase9") ||
            isFeatureEnabled("useA1FinalSheetRegressionChecksPhase9")
          ? "phase9-a1-compose-blocking-v1"
          : "phase8-a1-compose-blocking-v1",
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
