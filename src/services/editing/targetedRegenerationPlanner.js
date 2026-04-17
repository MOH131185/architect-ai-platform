import { resolveRegenerationScope } from "./regenerationScopeResolver.js";
import { buildRecoveryActions } from "./recoveryActionPlanner.js";

export function planTargetedRegeneration(input = {}) {
  const scope = resolveRegenerationScope(input);
  const recoveryActions = buildRecoveryActions(scope);
  const minimumSafeScope = scope.minimumSafeScope || {};

  return {
    version: "phase6-targeted-regeneration-plan-v1",
    targetLayer: scope.targetLayer,
    minimumSafeScope,
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
    warnings: scope.warnings || [],
  };
}

export default {
  planTargetedRegeneration,
};
