import { isFeatureEnabled } from "../../config/featureFlags.js";
import { createStableHash } from "../cad/projectGeometrySchema.js";
import { buildLegacyArtifactStateFromStore } from "../project/artifactFreshnessService.js";
import {
  buildProjectArtifactStore,
  geometrySignature as buildGeometrySignature,
} from "../project/projectArtifactStore.js";
import { invalidateArtifactStoreFragments } from "./fragmentInvalidationService.js";

function geometrySignature(projectGeometry = {}) {
  if (isFeatureEnabled("useArtifactLifecycleStore")) {
    return buildGeometrySignature(projectGeometry);
  }
  return createStableHash(
    JSON.stringify({
      project_id: projectGeometry.project_id,
      levels: projectGeometry.levels,
      rooms: projectGeometry.rooms,
      walls: projectGeometry.walls,
      doors: projectGeometry.doors,
      windows: projectGeometry.windows,
      roof: projectGeometry.roof,
    }),
  );
}

function hasOwn(input = {}, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function buildEntry(currentEntry = {}, signature, overrides = {}) {
  return {
    fresh: currentEntry?.fresh === true,
    stale: currentEntry?.stale !== false,
    geometry_signature: signature,
    ...(currentEntry || {}),
    ...overrides,
    geometry_signature: signature,
  };
}

export function buildArtifactState(input = {}) {
  if (isFeatureEnabled("useArtifactLifecycleStore")) {
    const store =
      input.projectArtifactStore ||
      buildProjectArtifactStore({
        projectGeometry: input.projectGeometry || {},
        ...(hasOwn(input, "drawings") ? { drawings: input.drawings } : {}),
        ...(hasOwn(input, "facadeGrammar")
          ? { facadeGrammar: input.facadeGrammar }
          : {}),
        ...(hasOwn(input, "visualPackage")
          ? { visualPackage: input.visualPackage }
          : {}),
        ...(hasOwn(input, "readiness")
          ? { readinessMetadata: input.readiness }
          : {}),
      });
    return buildLegacyArtifactStateFromStore(store, input.readiness || null);
  }

  const { projectGeometry = {} } = input;
  const currentState = projectGeometry?.metadata?.artifact_state || {};
  const signature = geometrySignature(projectGeometry);
  const hasDrawings = hasOwn(input, "drawings");
  const hasFacadeGrammar = hasOwn(input, "facadeGrammar");
  const hasVisualPackage = hasOwn(input, "visualPackage");
  const hasReadiness = hasOwn(input, "readiness");

  return {
    version: "phase4-artifact-state-v1",
    geometry_signature: signature,
    drawings: buildEntry(
      currentState.drawings,
      signature,
      hasDrawings
        ? {
            fresh: Boolean(input.drawings),
            stale: !input.drawings,
          }
        : {},
    ),
    facade_package: buildEntry(
      currentState.facade_package,
      signature,
      hasFacadeGrammar
        ? {
            fresh: Boolean(input.facadeGrammar),
            stale: !input.facadeGrammar,
          }
        : {},
    ),
    visual_package: buildEntry(
      currentState.visual_package,
      signature,
      hasVisualPackage
        ? {
            fresh: Boolean(input.visualPackage),
            stale: !input.visualPackage,
          }
        : {},
    ),
    a1_composition: buildEntry(
      currentState.a1_composition,
      signature,
      hasReadiness
        ? {
            fresh: Boolean(input.readiness?.ready),
            stale: !input.readiness?.ready,
          }
        : {},
    ),
  };
}

export function invalidateArtifactsForPlan(
  currentState = {},
  regenerationPlan = {},
  projectGeometry = {},
  refreshedArtifacts = {},
) {
  if (
    isFeatureEnabled("useArtifactLifecycleStore") &&
    regenerationPlan?.fragmentPlan &&
    projectGeometry?.metadata?.project_artifact_store
  ) {
    const nextStore = invalidateArtifactStoreFragments(
      projectGeometry.metadata.project_artifact_store,
      regenerationPlan.fragmentPlan,
      geometrySignature(projectGeometry),
    );
    return buildLegacyArtifactStateFromStore(nextStore);
  }

  const signature = geometrySignature(projectGeometry);
  const impactedArtifacts = regenerationPlan.impactedArtifacts || {};

  const resolveEntry = (
    currentEntry = {},
    impacted = false,
    refreshed = null,
  ) => {
    if (typeof refreshed === "boolean") {
      return buildEntry(currentEntry, signature, {
        fresh: refreshed,
        stale: !refreshed,
      });
    }
    if (impacted) {
      return buildEntry(currentEntry, signature, {
        fresh: false,
        stale: true,
      });
    }
    return buildEntry(currentEntry, signature);
  };

  return {
    ...(currentState || {}),
    version: "phase4-artifact-state-v1",
    geometry_signature: signature,
    drawings: resolveEntry(
      currentState.drawings,
      Boolean(impactedArtifacts.drawings),
      refreshedArtifacts.drawings,
    ),
    facade_package: resolveEntry(
      currentState.facade_package,
      Boolean(impactedArtifacts.facadePackage),
      refreshedArtifacts.facadePackage,
    ),
    visual_package: resolveEntry(
      currentState.visual_package,
      Boolean(impactedArtifacts.visualPackage),
      refreshedArtifacts.visualPackage,
    ),
    a1_composition: resolveEntry(
      currentState.a1_composition,
      Boolean(impactedArtifacts.a1Readiness),
      refreshedArtifacts.a1Composition,
    ),
  };
}

export default {
  buildArtifactState,
  invalidateArtifactsForPlan,
};
