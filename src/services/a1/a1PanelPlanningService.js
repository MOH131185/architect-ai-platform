import { isFeatureEnabled } from "../../config/featureFlags.js";
import { planA1PanelArtifacts } from "./a1PanelArtifactPlanner.js";
import { evaluateA1TechnicalPanelGate } from "./a1TechnicalPanelGateService.js";
import { evaluateA1ConsistencyGuards } from "./a1ConsistencyGuardService.js";
import { buildA1RecoveryExecutionBridge } from "./a1RecoveryExecutionBridge.js";
import { getFontEmbeddingReadinessSync } from "../../utils/svgFontEmbedder.js";

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

function applyPanelPriorityPhase8(panelCandidates = []) {
  const technicalFirst = isFeatureEnabled("useTechnicalFirstA1LayoutPhase8");
  return (panelCandidates || [])
    .map((candidate) => {
      const isTechnical = ["floor_plan", "elevation", "section"].includes(
        candidate.type,
      );
      const boardWeight = technicalFirst
        ? isTechnical
          ? 3
          : 1
        : candidate.type === "visual"
          ? 3
          : 2;
      return {
        ...candidate,
        boardWeight,
        compositionRole:
          technicalFirst && candidate.type === "visual"
            ? "supporting_visual"
            : isTechnical
              ? "technical_truth"
              : "hero_support",
      };
    })
    .sort((left, right) => {
      if (right.boardWeight !== left.boardWeight) {
        return right.boardWeight - left.boardWeight;
      }
      return String(left.id).localeCompare(String(right.id));
    });
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
    const fontReadiness = getFontEmbeddingReadinessSync();
    if (
      !isFeatureEnabled("useA1TechnicalPanelGating") ||
      !isFeatureEnabled("useTechnicalPanelReadabilityChecks")
    ) {
      return {
        ...panelPlan,
        fontReadiness,
      };
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
    const consistencyGuard = evaluateA1ConsistencyGuards({
      projectGeometry,
      visualPackage,
      facadeGrammar,
    });
    const recoveryExecutionBridge = isFeatureEnabled(
      "useA1RecoveryExecutionBridge",
    )
      ? buildA1RecoveryExecutionBridge({
          projectGeometry,
          drawings,
          visualPackage,
          facadeGrammar,
          panelCandidates: panelPlan.panelCandidates,
          artifactStore: panelPlan.artifactStore,
          freshness: {
            stalePanels: panelPlan.stalePanels,
            missingPanels: panelPlan.missingPanels,
          },
          technicalPanelGate,
        })
      : null;

    return {
      ...panelPlan,
      panelCandidates: applyPanelPriorityPhase8(panelPlan.panelCandidates),
      technicalPanelGate,
      consistencyGuard,
      fontReadiness,
      technicalQualityBlockers: technicalPanelGate.blockingReasons || [],
      composeBlockingReasons: [
        ...new Set([
          ...(technicalPanelGate.blockingReasons || []),
          ...(consistencyGuard.blockingReasons || []),
          ...(fontReadiness?.readyForEmbedding === false
            ? [
                "Bundled A1 font embedding is unavailable; final sheet text cannot be rasterized safely.",
              ]
            : []),
        ]),
      ],
      recoveryExecutionBridge,
      technicalPanelScores: (technicalPanelGate.panelChecks || []).map(
        (entry) => ({
          panelId: entry.panelId,
          score: entry.quality?.score?.score ?? null,
          thresholds: entry.quality?.score?.thresholds ?? null,
          blockers: entry.quality?.blockers || [],
          warnings: entry.quality?.warnings || [],
        }),
      ),
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
    panelCandidates: applyPanelPriorityPhase8(filteredCandidates),
    validPanelCount: filteredCandidates.filter((candidate) => candidate.ready)
      .length,
    totalPanelCount: filteredCandidates.length,
    fontReadiness: getFontEmbeddingReadinessSync(),
  };
}

export default {
  planA1Panels,
};
