import { isFeatureEnabled } from "../../config/featureFlags.js";
import { buildA1ArtifactState } from "./a1ArtifactStateService.js";
import { assessA1ComposeReadiness } from "./a1ComposeReadinessService.js";
import { planA1Panels } from "./a1PanelPlanningService.js";
import { buildProjectRecoveryPlan } from "../project/projectRecoveryService.js";

export function assessA1ProjectReadiness({
  projectGeometry = {},
  drawings = null,
  visualPackage = null,
  facadeGrammar = null,
  validationReport = null,
  artifactState = null,
  artifactStore = null,
} = {}) {
  if (isFeatureEnabled("useComposeReadinessPhase5")) {
    const composeReadiness = assessA1ComposeReadiness({
      projectGeometry,
      drawings,
      visualPackage,
      facadeGrammar,
      validationReport,
      artifactStore,
    });
    const recoveryPlan = isFeatureEnabled("useProjectRecoveryFlows")
      ? buildProjectRecoveryPlan({
          projectGeometry,
          drawings,
          facadeGrammar,
          visualPackage,
          panelCandidates: composeReadiness.panelCandidates,
          artifactStore: composeReadiness.artifactStore,
          readiness: composeReadiness,
          validationReport,
        })
      : null;

    return {
      version:
        composeReadiness.finalSheetRegression?.roofTruthState ||
        composeReadiness.finalSheetRegression?.foundationTruthState
          ? "phase17-a1-project-readiness-v1"
          : composeReadiness.finalSheetRegression?.roofTruthQuality ||
              composeReadiness.finalSheetRegression?.foundationTruthQuality
            ? "phase15-a1-project-readiness-v1"
            : composeReadiness.publishability ||
                composeReadiness.technicalCredibility
              ? "phase10-a1-project-readiness-v1"
              : isFeatureEnabled("useProjectRecoveryFlows")
                ? "phase6-a1-project-readiness-v1"
                : "phase5-a1-project-readiness-v1",
      ready: composeReadiness.composeReady,
      composeReady: composeReadiness.composeReady,
      composeBlocked: composeReadiness.composeBlocked,
      status: composeReadiness.status,
      reasons: composeReadiness.blockingReasons,
      blockingReasons: composeReadiness.blockingReasons,
      staleAssets: composeReadiness.staleAssets,
      missingAssets: composeReadiness.missingAssets,
      staleFragments: composeReadiness.staleFragments,
      missingFragments: composeReadiness.missingFragments,
      panelCandidates: composeReadiness.panelCandidates,
      freshPanels: composeReadiness.freshPanels,
      stalePanels: composeReadiness.stalePanels,
      missingPanels: composeReadiness.missingPanels,
      panelSummary: {
        validPanelCount: composeReadiness.panelCandidates.filter(
          (candidate) => candidate.eligible,
        ).length,
        totalPanelCount: composeReadiness.panelCandidates.length,
      },
      artifactFreshness: composeReadiness.artifactFreshness,
      artifactState: composeReadiness.artifactState,
      artifactStore: composeReadiness.artifactStore,
      technicalPanelGate: composeReadiness.technicalPanelGate || null,
      consistencyGuard: composeReadiness.consistencyGuard || null,
      fontReadiness: composeReadiness.fontReadiness || null,
      finalSheetRegression: composeReadiness.finalSheetRegression || null,
      renderedTextZone: composeReadiness.renderedTextZone || null,
      technicalCredibility: composeReadiness.technicalCredibility || null,
      publishability: composeReadiness.publishability || null,
      verificationState: composeReadiness.verificationState || null,
      composeExecutionPlan: composeReadiness.composeExecutionPlan || null,
      recoveryExecutionBridge: composeReadiness.recoveryExecutionBridge || null,
      entityBlockers:
        composeReadiness.recoveryExecutionBridge?.repairPlanner?.repairs
          ?.flatMap((entry) => entry.impactedEntities || [])
          .filter(Boolean) || [],
      recoveryPlan,
      composeReadiness,
    };
  }

  const panelPlan = planA1Panels({
    projectGeometry,
    drawings,
    visualPackage,
  });
  const resolvedArtifactState =
    artifactState ||
    buildA1ArtifactState({
      projectGeometry,
      ...(drawings ? { drawings } : {}),
      ...(facadeGrammar ? { facadeGrammar } : {}),
      ...(visualPackage ? { visualPackage } : {}),
    });
  const previousReadiness = projectGeometry?.metadata?.a1_readiness || null;
  const staleAssets = Object.entries(resolvedArtifactState)
    .filter(
      ([key, value]) =>
        key !== "version" &&
        key !== "geometry_signature" &&
        key !== "a1_composition" &&
        value?.stale === true,
    )
    .map(([key]) => key);
  const reasons = [];

  if (!projectGeometry?.project_id) {
    reasons.push("Project geometry is missing a project_id.");
  }
  if (
    (validationReport?.status || projectGeometry?.metadata?.status) ===
    "invalid"
  ) {
    reasons.push("Project validation is invalid.");
  }
  const resolvedPanelCandidates =
    panelPlan.panelCandidates.length > 0
      ? panelPlan.panelCandidates
      : previousReadiness?.panelCandidates || [];
  const validPanelCount =
    panelPlan.panelCandidates.length > 0
      ? panelPlan.validPanelCount
      : resolvedPanelCandidates.filter((candidate) => candidate.ready).length;
  const totalPanelCount =
    panelPlan.panelCandidates.length > 0
      ? panelPlan.totalPanelCount
      : resolvedPanelCandidates.length;

  if (!validPanelCount) {
    reasons.push(
      "No valid drawing or visual panels are available for A1 composition.",
    );
  }
  if (staleAssets.length) {
    reasons.push(`Stale assets detected: ${staleAssets.join(", ")}.`);
  }

  return {
    version: "phase4-a1-project-readiness-v1",
    ready: reasons.length === 0,
    status: reasons.length ? "stale" : "ready",
    reasons,
    staleAssets,
    panelCandidates: resolvedPanelCandidates,
    panelSummary: {
      validPanelCount,
      totalPanelCount,
    },
    artifactState: resolvedArtifactState,
  };
}

export default {
  assessA1ProjectReadiness,
};
