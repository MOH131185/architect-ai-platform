import { planTargetedRegeneration } from "../editing/targetedRegenerationPlanner.js";

export function buildProjectRecoveryPlan({
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
  readiness = null,
  validationReport = null,
} = {}) {
  const blockingReasons =
    readiness?.blockingReasons || readiness?.reasons || [];
  const recoverableIssues = [];
  const nonRecoverableIssues = [];

  blockingReasons.forEach((reason) => {
    if (/missing a project_id/i.test(reason)) {
      nonRecoverableIssues.push(reason);
    } else {
      recoverableIssues.push(reason);
    }
  });

  const targetedRecovery = planTargetedRegeneration({
    targetLayer:
      (readiness?.technicalPanelGate?.blockingPanels || []).length ||
      (readiness?.stalePanels || []).length
        ? "drawings"
        : "room_layout",
    projectGeometry,
    drawings,
    facadeGrammar,
    visualPackage,
    panelCandidates,
    artifactStore,
    validationReport,
    options: {},
  });

  return {
    version: "phase6-project-recovery-plan-v1",
    composeReady: readiness?.composeReady === true,
    recoverableIssues: [...new Set(recoverableIssues)],
    nonRecoverableIssues: [...new Set(nonRecoverableIssues)],
    recommendedRegenerationOrder: targetedRecovery.plannedActions || [],
    minimumStepsToComposeReady: targetedRecovery.plannedActions || [],
    targetedRecovery,
  };
}

export default {
  buildProjectRecoveryPlan,
};
