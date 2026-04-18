import {
  buildLegacyArtifactStateFromStore,
  summarizeArtifactFreshness,
} from "../project/artifactFreshnessService.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  buildProjectArtifactStore,
  mergeProjectArtifactStore,
  createArtifactStorePatch,
} from "../project/projectArtifactStore.js";
import { planA1PanelArtifacts } from "./a1PanelArtifactPlanner.js";
import { resolveA1Freshness } from "./a1FreshnessResolver.js";
import { evaluateA1TechnicalPanelGate } from "./a1TechnicalPanelGateService.js";
import { buildA1ComposeBlockingState } from "./a1ComposeBlockingService.js";
import { planA1ComposeExecution } from "./a1ComposeExecutionPlanner.js";
import { buildA1RecoveryExecutionBridge } from "./a1RecoveryExecutionBridge.js";

export function assessA1ComposeReadiness({
  projectGeometry = {},
  drawings = null,
  visualPackage = null,
  facadeGrammar = null,
  validationReport = null,
  artifactStore = null,
  styleDNA = {},
} = {}) {
  const baseStore =
    drawings || facadeGrammar || visualPackage
      ? mergeProjectArtifactStore(
          artifactStore ||
            projectGeometry?.metadata?.project_artifact_store ||
            buildProjectArtifactStore({
              projectGeometry,
            }),
          createArtifactStorePatch({
            projectGeometry,
            ...(drawings ? { drawings } : {}),
            ...(facadeGrammar ? { facadeGrammar } : {}),
            ...(visualPackage ? { visualPackage } : {}),
          }),
        )
      : artifactStore ||
        projectGeometry?.metadata?.project_artifact_store ||
        buildProjectArtifactStore({
          projectGeometry,
          ...(drawings ? { drawings } : {}),
          ...(facadeGrammar ? { facadeGrammar } : {}),
          ...(visualPackage ? { visualPackage } : {}),
        });

  const panelPlan = planA1PanelArtifacts({
    projectGeometry,
    drawings,
    visualPackage,
    artifactStore: baseStore,
  });
  const storeWithPanels = mergeProjectArtifactStore(
    baseStore,
    createArtifactStorePatch({
      projectGeometry,
      composeCandidates: panelPlan.panelCandidates,
    }),
  );
  const finalStore = mergeProjectArtifactStore(
    storeWithPanels,
    createArtifactStorePatch({
      projectGeometry,
      readinessMetadata: {
        ready: false,
        status: "stale",
      },
    }),
  );
  const panelFreshness = resolveA1Freshness({
    panelCandidates: panelPlan.panelCandidates,
    artifactFreshness: summarizeArtifactFreshness(finalStore),
  });
  const technicalPanelGate =
    isFeatureEnabled("useA1TechnicalPanelGating") &&
    isFeatureEnabled("useTechnicalPanelReadabilityChecks")
      ? evaluateA1TechnicalPanelGate({
          drawings: drawings || projectGeometry?.metadata?.drawings || {},
          panelCandidates: panelPlan.panelCandidates,
          artifactFreshness: summarizeArtifactFreshness(finalStore),
          technicalPanelQuality:
            drawings?.technicalPanelQuality ||
            projectGeometry?.metadata?.technical_panel_quality ||
            null,
        })
      : {
          technicalReady: true,
          blockingReasons: [],
          warnings: [],
          panelChecks: [],
        };
  const blockingState = buildA1ComposeBlockingState({
    projectGeometry,
    validationReport,
    freshness: panelFreshness,
    technicalPanelGate,
  });
  const executionPlan = isFeatureEnabled("useComposeExecutionPlanning")
    ? planA1ComposeExecution({
        projectGeometry,
        drawings,
        facadeGrammar,
        visualPackage,
        panelCandidates: panelPlan.panelCandidates,
        artifactStore: finalStore,
        freshness: panelFreshness,
        technicalPanelGate,
      })
    : null;
  const recoveryExecutionBridge = isFeatureEnabled(
    "useA1RecoveryExecutionBridge",
  )
    ? buildA1RecoveryExecutionBridge({
        projectGeometry,
        drawings,
        facadeGrammar,
        visualPackage,
        panelCandidates: panelPlan.panelCandidates,
        artifactStore: finalStore,
        technicalPanelGate,
        freshness: panelFreshness,
        styleDNA,
      })
    : null;

  const blockingReasons = [...(blockingState.blockingReasons || [])];
  if (!panelPlan.panelCandidates.length) {
    blockingReasons.unshift("No eligible panel candidates were found.");
  }

  const composeReady =
    blockingState.composeReady && panelPlan.panelCandidates.length > 0;
  const patchedStore = mergeProjectArtifactStore(
    finalStore,
    createArtifactStorePatch({
      projectGeometry,
      readinessMetadata: {
        ready: composeReady,
        status: composeReady ? "ready" : "blocked",
        composeReady,
      },
      composeCandidates: panelPlan.panelCandidates.map((candidate) => ({
        ...candidate,
        fresh: candidate.fresh,
        stale: candidate.stale,
        missing: candidate.missing,
      })),
    }),
  );
  const artifactFreshness = summarizeArtifactFreshness(patchedStore);

  return {
    version: isFeatureEnabled("useComposeExecutionPlanning")
      ? "phase6-a1-compose-readiness-v1"
      : "phase5-a1-compose-readiness-v1",
    composeReady,
    composeBlocked: !composeReady,
    ready: composeReady,
    status: composeReady ? "ready" : "blocked",
    blockingReasons,
    recoverableIssues: blockingState.recoverableIssues || [],
    nonRecoverableIssues: blockingState.nonRecoverableIssues || [],
    panelCandidates: panelPlan.panelCandidates,
    freshPanels: panelFreshness.freshPanels,
    stalePanels: panelFreshness.stalePanels,
    missingPanels: panelFreshness.missingPanels,
    missingAssets: artifactFreshness.missingFamilies,
    staleAssets: artifactFreshness.staleFamilies,
    missingFragments: artifactFreshness.missingFragments,
    staleFragments: artifactFreshness.staleFragments,
    artifactFreshness,
    artifactStore: patchedStore,
    artifactState: buildLegacyArtifactStateFromStore(patchedStore, {
      ready: composeReady,
    }),
    technicalPanelGate,
    composeExecutionPlan: executionPlan,
    recoveryExecutionBridge,
  };
}

export default {
  assessA1ComposeReadiness,
};
