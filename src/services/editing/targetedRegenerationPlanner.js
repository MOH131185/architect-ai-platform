import { resolveRegenerationScope } from "./regenerationScopeResolver.js";
import { buildRecoveryActions } from "./recoveryActionPlanner.js";
import { geometrySignature } from "../project/projectArtifactStore.js";

export function planTargetedRegeneration(input = {}) {
  const scope = resolveRegenerationScope(input);
  const recoveryActions = buildRecoveryActions(scope);
  const minimumSafeScope = scope.minimumSafeScope || {};

  return {
    version: scope.impactedEntities?.length
      ? "phase7-targeted-regeneration-plan-v1"
      : "phase6-targeted-regeneration-plan-v1",
    targetLayer: scope.targetLayer,
    geometrySignature: geometrySignature(input.projectGeometry || {}),
    minimumSafeScope,
    impactedEntities: scope.impactedEntities || [],
    impactedFragments: {
      geometry: minimumSafeScope.geometryFragments || [],
      drawings: minimumSafeScope.drawingFragments || [],
      facadeSides: minimumSafeScope.facadeFragments || [],
      visualViews: minimumSafeScope.visualFragments || [],
      panels: minimumSafeScope.panelFragments || [],
      readiness: minimumSafeScope.readinessFragments || [],
    },
    impactedArtifacts: {
      drawings: (minimumSafeScope.drawingFragments || []).length > 0,
      facadePackage: (minimumSafeScope.facadeFragments || []).length > 0,
      visualPackage: (minimumSafeScope.visualFragments || []).length > 0,
      a1Readiness: true,
    },
    plannedActions: recoveryActions.actions,
    executable: true,
    warnings: scope.warnings || [],
  };
}

export default {
  planTargetedRegeneration,
};
