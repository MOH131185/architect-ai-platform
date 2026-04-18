import { isFeatureEnabled } from "../../config/featureFlags.js";
import { planA1PanelRepairs } from "./a1PanelRepairPlanner.js";

function resolveBlockedPanelIds({
  freshness = null,
  technicalPanelGate = null,
} = {}) {
  return [
    ...(freshness?.stalePanels || []).map((panel) => panel.id),
    ...(freshness?.missingPanels || []).map((panel) => panel.id),
    ...(technicalPanelGate?.blockingPanels || []),
  ].filter(Boolean);
}

export function buildA1RecoveryExecutionBridge({
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
  technicalPanelGate = null,
  freshness = null,
} = {}) {
  const blockedPanelIds = resolveBlockedPanelIds({
    freshness,
    technicalPanelGate,
  });
  const repairPlanner = planA1PanelRepairs({
    projectGeometry,
    drawings,
    facadeGrammar,
    visualPackage,
    panelCandidates,
    artifactStore,
    blockedPanels: [...new Set(blockedPanelIds)],
  });

  return {
    version: "phase7-a1-recovery-execution-bridge-v1",
    blockedPanelIds: [...new Set(blockedPanelIds)].sort(),
    repairPlanner,
    executable: isFeatureEnabled("useTargetedRegenerationExecution"),
  };
}

export async function executeA1RecoveryExecutionBridge({
  styleDNA = {},
  ...input
} = {}) {
  const bridge = buildA1RecoveryExecutionBridge(input);
  if (!isFeatureEnabled("useTargetedRegenerationExecution")) {
    return {
      ...bridge,
      executed: [],
    };
  }

  const executed = [];
  const { executeTargetedRegeneration } =
    await import("../editing/targetedRegenerationExecutor.js");
  for (const repair of bridge.repairPlanner.repairs) {
    // Execution is opt-in and still runs one minimum-safe plan at a time.
    // This keeps the bridge deterministic and inspectable.
    // eslint-disable-next-line no-await-in-loop
    executed.push(
      await executeTargetedRegeneration({
        approvedPlan: repair.plan,
        projectGeometry: input.projectGeometry,
        drawings: input.drawings,
        facadeGrammar: input.facadeGrammar,
        visualPackage: input.visualPackage,
        styleDNA,
        artifactStore: input.artifactStore,
      }),
    );
  }

  return {
    ...bridge,
    executed,
  };
}

export default {
  buildA1RecoveryExecutionBridge,
  executeA1RecoveryExecutionBridge,
};
