import { planTargetedRegeneration } from "../editing/targetedRegenerationPlanner.js";

function uniqueById(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry?.id || seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

function buildRecoveryRequests(readiness = null, validationReport = null) {
  const requests = [];

  if ((validationReport?.status || "") === "invalid") {
    requests.push({ targetLayer: "room_layout", options: {} });
  }

  [
    ...(readiness?.stalePanels || []),
    ...(readiness?.missingPanels || []),
  ].forEach((panel) => {
    if (panel.id.startsWith("panel:floor-plan:")) {
      requests.push({
        targetLayer: "drawings",
        options: { levelId: panel.id.replace("panel:floor-plan:", "") },
      });
    } else if (panel.id.startsWith("panel:elevation:")) {
      requests.push({
        targetLayer: "drawings",
        options: { side: panel.id.replace("panel:elevation:", "") },
      });
    } else if (panel.id.startsWith("panel:section:")) {
      requests.push({
        targetLayer: "drawings",
        options: { sectionType: panel.id.replace("panel:section:", "") },
      });
    } else if (panel.id.startsWith("panel:visual:")) {
      requests.push({
        targetLayer: "visual_package",
        options: { viewType: panel.id.replace("panel:visual:", "") },
      });
    }
  });

  (readiness?.technicalPanelGate?.blockingPanels || []).forEach((panelId) => {
    if (panelId.startsWith("panel:floor-plan:")) {
      requests.push({
        targetLayer: "drawings",
        options: { levelId: panelId.replace("panel:floor-plan:", "") },
      });
    } else if (panelId.startsWith("panel:elevation:")) {
      requests.push({
        targetLayer: "drawings",
        options: { side: panelId.replace("panel:elevation:", "") },
      });
    } else if (panelId.startsWith("panel:section:")) {
      requests.push({
        targetLayer: "drawings",
        options: { sectionType: panelId.replace("panel:section:", "") },
      });
    }
  });

  if ((readiness?.missingAssets || []).includes("visual_package")) {
    requests.push({ targetLayer: "visual_package", options: {} });
  }
  if ((readiness?.missingAssets || []).includes("facade_package")) {
    requests.push({ targetLayer: "facade_grammar", options: {} });
  }
  if ((readiness?.missingAssets || []).includes("drawings")) {
    requests.push({ targetLayer: "drawings", options: {} });
  }

  const deduped = [];
  const seen = new Set();
  requests.forEach((request) => {
    const key = JSON.stringify([request.targetLayer, request.options || {}]);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(request);
  });
  return deduped;
}

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

  const recoveryRequests = buildRecoveryRequests(readiness, validationReport);
  const targetedRecoveryPlans = recoveryRequests.length
    ? recoveryRequests.map((request) =>
        planTargetedRegeneration({
          targetLayer: request.targetLayer,
          projectGeometry,
          drawings,
          facadeGrammar,
          visualPackage,
          panelCandidates,
          artifactStore,
          validationReport,
          options: request.options,
        }),
      )
    : [
        planTargetedRegeneration({
          targetLayer: "room_layout",
          projectGeometry,
          drawings,
          facadeGrammar,
          visualPackage,
          panelCandidates,
          artifactStore,
          validationReport,
          options: {},
        }),
      ];
  const orderedActions = uniqueById(
    targetedRecoveryPlans.flatMap((plan) => plan.plannedActions || []),
  );

  return {
    version: "phase6-project-recovery-plan-v1",
    composeReady: readiness?.composeReady === true,
    recoverableIssues: [...new Set(recoverableIssues)],
    nonRecoverableIssues: [...new Set(nonRecoverableIssues)],
    recommendedRegenerationOrder: orderedActions,
    minimumStepsToComposeReady: orderedActions,
    targetedRecovery:
      targetedRecoveryPlans.length === 1
        ? targetedRecoveryPlans[0]
        : {
            version: "phase6-project-recovery-bundle-v1",
            plans: targetedRecoveryPlans,
          },
  };
}

export default {
  buildProjectRecoveryPlan,
};
