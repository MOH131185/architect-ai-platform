import {
  buildLegacyArtifactStateFromStore,
  summarizeArtifactFreshness,
} from "../project/artifactFreshnessService.js";
import {
  buildProjectArtifactStore,
  mergeProjectArtifactStore,
  createArtifactStorePatch,
} from "../project/projectArtifactStore.js";
import { planA1PanelArtifacts } from "./a1PanelArtifactPlanner.js";

export function assessA1ComposeReadiness({
  projectGeometry = {},
  drawings = null,
  visualPackage = null,
  facadeGrammar = null,
  validationReport = null,
  artifactStore = null,
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

  const blockingReasons = [];

  if (!projectGeometry?.project_id) {
    blockingReasons.push("Project geometry is missing a project_id.");
  }
  if (
    (validationReport?.status || projectGeometry?.metadata?.status) ===
    "invalid"
  ) {
    blockingReasons.push("Project validation is invalid.");
  }
  if (!panelPlan.panelCandidates.length) {
    blockingReasons.push("No eligible panel candidates were found.");
  }
  if (panelPlan.missingAssets.length) {
    blockingReasons.push(
      `Missing compose assets: ${panelPlan.missingAssets.join(", ")}.`,
    );
  }
  if (panelPlan.stalePanels.length) {
    blockingReasons.push(
      `Stale compose panels: ${panelPlan.stalePanels
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  const composeReady = blockingReasons.length === 0;
  const patchedStore = mergeProjectArtifactStore(
    finalStore,
    createArtifactStorePatch({
      projectGeometry,
      readinessMetadata: {
        ready: composeReady,
        status: composeReady ? "ready" : "blocked",
      },
      composeCandidates: panelPlan.panelCandidates.map((candidate) => ({
        ...candidate,
        fresh: candidate.fresh,
        stale: candidate.stale,
        missing: candidate.missing,
      })),
    }),
  );
  const freshness = summarizeArtifactFreshness(patchedStore);

  return {
    version: "phase5-a1-compose-readiness-v1",
    composeReady,
    composeBlocked: !composeReady,
    ready: composeReady,
    status: composeReady ? "ready" : "blocked",
    blockingReasons,
    panelCandidates: panelPlan.panelCandidates,
    freshPanels: panelPlan.freshPanels,
    stalePanels: panelPlan.stalePanels,
    missingPanels: panelPlan.missingPanels,
    missingAssets: freshness.missingFamilies,
    staleAssets: freshness.staleFamilies,
    missingFragments: freshness.missingFragments,
    staleFragments: freshness.staleFragments,
    artifactFreshness: freshness,
    artifactStore: patchedStore,
    artifactState: buildLegacyArtifactStateFromStore(patchedStore, {
      ready: composeReady,
    }),
  };
}

export default {
  assessA1ComposeReadiness,
};
