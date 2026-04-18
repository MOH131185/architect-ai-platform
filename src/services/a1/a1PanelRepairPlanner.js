import { planTargetedRegeneration } from "../editing/targetedRegenerationPlanner.js";
import { resolveEntityImpact } from "../editing/entityImpactResolver.js";

function inferRequestFromPanel(panel = {}) {
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

export function planA1PanelRepairs({
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
  blockedPanels = [],
} = {}) {
  const targetPanels = (panelCandidates || []).filter((candidate) =>
    (blockedPanels || []).includes(candidate.id),
  );

  const repairs = targetPanels.map((panel) => {
    const request = inferRequestFromPanel(panel);
    const plan = planTargetedRegeneration({
      targetLayer: request.targetLayer,
      projectGeometry,
      drawings,
      facadeGrammar,
      visualPackage,
      panelCandidates,
      artifactStore,
      options: request.options,
    });
    const entityImpact = resolveEntityImpact({
      targetLayer: request.targetLayer,
      projectGeometry,
      drawings,
      facadeGrammar,
      panelCandidates,
      artifactStore,
      options: request.options,
    });
    return {
      panelId: panel.id,
      targetLayer: request.targetLayer,
      options: request.options,
      plan,
      impactedEntities: entityImpact.impactedEntities,
      impactedPanels: entityImpact.impactedPanels,
    };
  });

  return {
    version: "phase7-a1-panel-repair-planner-v1",
    repairs,
  };
}

export default {
  planA1PanelRepairs,
};
