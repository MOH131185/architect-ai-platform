import { isFeatureEnabled } from "../../config/featureFlags.js";
import { planFragmentInvalidation } from "./fragmentInvalidationService.js";
import {
  normalizeDependencyLayer,
  resolveDependentLayers,
} from "./projectDependencyGraph.js";

function impactedArtifactsForLayers(layers = []) {
  return {
    drawings:
      layers.includes("drawings") ||
      layers.includes("room_layout") ||
      layers.includes("openings"),
    facadePackage:
      layers.includes("facade_grammar") || layers.includes("openings"),
    visualPackage:
      layers.includes("visual_style") ||
      layers.includes("visual_package") ||
      layers.includes("facade_grammar") ||
      layers.includes("drawings"),
    a1Readiness: true,
  };
}

export function planRegeneration(targetLayer = "", options = {}) {
  const normalizedTargetLayer = normalizeDependencyLayer(targetLayer);
  const impactedLayers = resolveDependentLayers(normalizedTargetLayer);
  const fragmentPlan = isFeatureEnabled("useFragmentDependencyInvalidation")
    ? planFragmentInvalidation({
        targetLayer: normalizedTargetLayer,
        projectGeometry: options.projectGeometry || {},
        drawings: options.drawings || {},
        facadeGrammar: options.facadeGrammar || {},
        visualPackage: options.visualPackage || null,
        panelCandidates: options.panelCandidates || [],
        options,
      })
    : null;
  const hasFragmentContext = Boolean(
    options.projectGeometry?.project_id ||
    options.projectGeometry?.metadata?.project_artifact_store ||
    options.artifactStore,
  );
  const resolvedImpactedArtifacts =
    fragmentPlan && hasFragmentContext
      ? fragmentPlan.impactedArtifacts
      : impactedArtifactsForLayers(impactedLayers);

  return {
    version: fragmentPlan
      ? "phase5-regeneration-plan-v1"
      : "phase4-regeneration-plan-v1",
    targetLayer: normalizedTargetLayer,
    impactedLayers,
    impactedArtifacts: resolvedImpactedArtifacts,
    impactedFragments:
      fragmentPlan && hasFragmentContext
        ? fragmentPlan.impactedFragments
        : null,
    fragmentPlan: fragmentPlan && hasFragmentContext ? fragmentPlan : null,
    levelScoped:
      targetLayer === "level" ||
      targetLayer === "one_level" ||
      options.levelId ||
      options.level_id,
  };
}

export default {
  planRegeneration,
};
