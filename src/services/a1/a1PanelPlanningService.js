import { isFeatureEnabled } from "../../config/featureFlags.js";
import { planA1PanelArtifacts } from "./a1PanelArtifactPlanner.js";
import { evaluateA1TechnicalPanelGate } from "./a1TechnicalPanelGateService.js";

const PANEL_TYPE_ALIASES = {
  plan: "floor_plan",
  floorplan: "floor_plan",
  floorplans: "floor_plan",
  elevations: "elevation",
  sections: "section",
  visuals: "visual",
};

function normalizeRequestedPanel(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return PANEL_TYPE_ALIASES[normalized] || normalized;
}

export function planA1Panels({
  projectGeometry = {},
  drawings = null,
  visualPackage = null,
  requestedPanels = [],
  artifactStore = null,
  facadeGrammar = null,
} = {}) {
  if (isFeatureEnabled("useComposeReadinessPhase5")) {
    const panelPlan = planA1PanelArtifacts({
      projectGeometry,
      drawings,
      visualPackage,
      requestedPanels,
      artifactStore,
    });
    if (!isFeatureEnabled("useA1TechnicalPanelGating")) {
      return panelPlan;
    }

    const technicalPanelGate = evaluateA1TechnicalPanelGate({
      drawings: drawings || {},
      panelCandidates: panelPlan.panelCandidates,
      artifactFreshness: panelPlan.artifactFreshness,
      technicalPanelQuality:
        drawings?.technicalPanelQuality ||
        projectGeometry?.metadata?.technical_panel_quality ||
        null,
      facadeGrammar,
    });

    return {
      ...panelPlan,
      technicalPanelGate,
      technicalQualityBlockers: technicalPanelGate.blockingReasons || [],
      composeBlockingReasons: technicalPanelGate.blockingReasons || [],
    };
  }

  const requested = new Set(
    Array.isArray(requestedPanels)
      ? requestedPanels.map(normalizeRequestedPanel)
      : [],
  );
  const panelCandidates = [];

  (drawings?.plan || []).forEach((entry, index) => {
    panelCandidates.push({
      id: `floor-plan-${index}`,
      type: "floor_plan",
      title: entry.title || `Floor Plan ${index + 1}`,
      ready: Boolean(entry.svg),
    });
  });
  (drawings?.elevation || []).forEach((entry, index) => {
    panelCandidates.push({
      id: `elevation-${index}`,
      type: "elevation",
      title: entry.title || `Elevation ${index + 1}`,
      ready: Boolean(entry.svg),
    });
  });
  (drawings?.section || []).forEach((entry, index) => {
    panelCandidates.push({
      id: `section-${index}`,
      type: "section",
      title: entry.title || `Section ${index + 1}`,
      ready: Boolean(entry.svg),
    });
  });
  if (visualPackage) {
    panelCandidates.push({
      id: "hero-visual",
      type: "visual",
      title: `Visual Package - ${visualPackage.viewType || "hero_3d"}`,
      ready: visualPackage.validation?.valid !== false,
    });
  }

  const fallbackCandidates =
    !panelCandidates.length &&
    Array.isArray(projectGeometry?.metadata?.a1_readiness?.panelCandidates)
      ? projectGeometry.metadata.a1_readiness.panelCandidates
      : [];
  const sourceCandidates = panelCandidates.length
    ? panelCandidates
    : fallbackCandidates;

  const filteredCandidates = requested.size
    ? sourceCandidates.filter(
        (candidate) =>
          requested.has(normalizeRequestedPanel(candidate.type)) ||
          requested.has(normalizeRequestedPanel(candidate.id)),
      )
    : sourceCandidates;

  return {
    version: "phase4-a1-panel-plan-v1",
    project_id: projectGeometry.project_id || null,
    panelCandidates: filteredCandidates,
    validPanelCount: filteredCandidates.filter((candidate) => candidate.ready)
      .length,
    totalPanelCount: filteredCandidates.length,
  };
}

export default {
  planA1Panels,
};
