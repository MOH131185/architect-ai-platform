import { planTargetedRegeneration } from "../editing/targetedRegenerationPlanner.js";

function inferRegenerationRequestFromPanel(panel = {}) {
  if (panel.id.startsWith("panel:floor-plan:")) {
    return {
      targetLayer: "drawings",
      options: { levelId: panel.id.replace("panel:floor-plan:", "") },
    };
  }
  if (panel.id.startsWith("panel:elevation:")) {
    return {
      targetLayer: "drawings",
      options: { side: panel.id.replace("panel:elevation:", "") },
    };
  }
  if (panel.id.startsWith("panel:section:")) {
    return {
      targetLayer: "drawings",
      options: { sectionType: panel.id.replace("panel:section:", "") },
    };
  }
  if (panel.id.startsWith("panel:visual:")) {
    return {
      targetLayer: "visual_package",
      options: { viewType: panel.id.replace("panel:visual:", "") },
    };
  }
  return {
    targetLayer: "drawings",
    options: {},
  };
}

export function planA1ComposeExecution({
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
  freshness = null,
  technicalPanelGate = null,
} = {}) {
  const candidatePanels = [
    ...(freshness?.stalePanels || []),
    ...(freshness?.missingPanels || []),
    ...(technicalPanelGate?.blockingPanels || [])
      .map((panelId) =>
        (panelCandidates || []).find((candidate) => candidate.id === panelId),
      )
      .filter(Boolean),
  ].filter(
    (panel, index, array) =>
      array.findIndex((entry) => entry.id === panel.id) === index,
  );
  const recoveryPlans = candidatePanels.map((panel) => {
    const request = inferRegenerationRequestFromPanel(panel);
    return planTargetedRegeneration({
      targetLayer: request.targetLayer,
      projectGeometry,
      drawings,
      facadeGrammar,
      visualPackage,
      panelCandidates,
      artifactStore,
      options: request.options,
    });
  });

  const steps = [
    ...recoveryPlans.flatMap((plan) => plan.plannedActions || []),
    ...(technicalPanelGate?.technicalReady
      ? []
      : [
          {
            id: "quality:technical-panels",
            kind: "recheck_technical_panels",
            target: "technical_panels",
            title: "Re-run technical panel quality gate",
          },
        ]),
    {
      id: "compose:readiness",
      kind: "recompute_compose_readiness",
      target: "readiness:default",
      title: "Recompute compose readiness",
    },
  ];

  const uniqueSteps = [];
  const seen = new Set();
  steps.forEach((step) => {
    if (!step?.id || seen.has(step.id)) return;
    seen.add(step.id);
    uniqueSteps.push(step);
  });

  return {
    version: "phase6-a1-compose-execution-plan-v1",
    recoveryPlans,
    minimumRecoveryPlan: uniqueSteps,
  };
}

export default {
  planA1ComposeExecution,
};
