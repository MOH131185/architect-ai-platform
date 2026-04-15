import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  summarizeArtifactFreshness,
  resolveArtifactFragment,
} from "../project/artifactFreshnessService.js";
import {
  buildProjectArtifactStore,
  createArtifactStorePatch,
  mergeProjectArtifactStore,
} from "../project/projectArtifactStore.js";

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

function buildPanelCandidatesFromDrawings(drawings = {}) {
  return [
    ...(drawings.plan || []).map((entry, index) => ({
      id: `panel:floor-plan:${entry.level_id || index}`,
      type: "floor_plan",
      title: entry.title || `Floor Plan ${index + 1}`,
      sourceArtifacts: [`drawing:plan:${entry.level_id || index}`],
      ready: Boolean(entry.svg),
    })),
    ...(drawings.elevation || []).map((entry, index) => ({
      id: `panel:elevation:${entry.orientation || index}`,
      type: "elevation",
      title: entry.title || `Elevation ${index + 1}`,
      sourceArtifacts: [`drawing:elevation:${entry.orientation || index}`],
      ready: Boolean(entry.svg),
    })),
    ...(drawings.section || []).map((entry, index) => ({
      id: `panel:section:${entry.section_type || index}`,
      type: "section",
      title: entry.title || `Section ${index + 1}`,
      sourceArtifacts: [`drawing:section:${entry.section_type || index}`],
      ready: Boolean(entry.svg),
    })),
  ];
}

function buildVisualPanelCandidates(visualPackage = null) {
  if (!visualPackage) return [];
  return [
    {
      id: `panel:visual:${visualPackage.viewType || "hero_3d"}`,
      type: "visual",
      title: `Visual Package - ${visualPackage.viewType || "hero_3d"}`,
      sourceArtifacts: [`visual:view:${visualPackage.viewType || "hero_3d"}`],
      ready: visualPackage.validation?.valid !== false,
    },
  ];
}

function buildPanelCandidatesFromArtifactStore(artifactStore = {}) {
  const families = artifactStore.artifacts || {};
  const drawings = Object.values(families.drawings?.fragments || {}).map(
    (fragment) => {
      if (fragment.id.startsWith("drawing:plan:")) {
        return {
          id: fragment.id.replace("drawing:plan:", "panel:floor-plan:"),
          type: "floor_plan",
          title: fragment.title,
          sourceArtifacts: [fragment.id],
          ready: fragment.fresh === true && fragment.missing !== true,
        };
      }
      if (fragment.id.startsWith("drawing:elevation:")) {
        return {
          id: fragment.id.replace("drawing:elevation:", "panel:elevation:"),
          type: "elevation",
          title: fragment.title,
          sourceArtifacts: [fragment.id],
          ready: fragment.fresh === true && fragment.missing !== true,
        };
      }
      return {
        id: fragment.id.replace("drawing:section:", "panel:section:"),
        type: "section",
        title: fragment.title,
        sourceArtifacts: [fragment.id],
        ready: fragment.fresh === true && fragment.missing !== true,
      };
    },
  );
  const visuals = Object.values(families.visual_package?.fragments || {}).map(
    (fragment) => ({
      id: fragment.id.replace("visual:view:", "panel:visual:"),
      type: "visual",
      title: fragment.title,
      sourceArtifacts: [fragment.id],
      ready: fragment.fresh === true && fragment.missing !== true,
    }),
  );
  return [...drawings, ...visuals];
}

function finalizePanelCandidate(candidate = {}, artifactStore = {}) {
  const sourceArtifacts = [...new Set(candidate.sourceArtifacts || [])];
  const resolvedSources = sourceArtifacts.map((fragmentId) => ({
    id: fragmentId,
    entry: resolveArtifactFragment(artifactStore, fragmentId),
  }));
  const missingAssetIds = resolvedSources
    .filter(({ entry }) => !entry || entry.missing === true)
    .map(({ id }) => id);
  const staleAssetIds = resolvedSources
    .filter(({ entry }) => entry?.stale === true)
    .map(({ id }) => id);
  const blockingReasons = [];
  if (missingAssetIds.length) {
    blockingReasons.push(`Missing assets: ${missingAssetIds.join(", ")}.`);
  }
  if (staleAssetIds.length) {
    blockingReasons.push(`Stale assets: ${staleAssetIds.join(", ")}.`);
  }
  if (candidate.ready === false && !blockingReasons.length) {
    blockingReasons.push("Source artifact is present but not ready.");
  }

  return {
    ...candidate,
    sourceArtifacts,
    fresh:
      candidate.ready !== false &&
      !missingAssetIds.length &&
      !staleAssetIds.length,
    stale: staleAssetIds.length > 0,
    missing: missingAssetIds.length > 0,
    eligible:
      candidate.ready !== false &&
      !missingAssetIds.length &&
      !staleAssetIds.length,
    missingAssetIds,
    staleAssetIds,
    blockingReasons,
  };
}

export function planA1PanelArtifacts({
  projectGeometry = {},
  drawings = null,
  visualPackage = null,
  requestedPanels = [],
  artifactStore = null,
} = {}) {
  const baseArtifactStore =
    artifactStore ||
    projectGeometry?.metadata?.project_artifact_store ||
    buildProjectArtifactStore({
      projectGeometry,
      ...(drawings ? { drawings } : {}),
      ...(visualPackage ? { visualPackage } : {}),
    });
  const resolvedArtifactStore =
    drawings || visualPackage
      ? mergeProjectArtifactStore(
          baseArtifactStore,
          createArtifactStorePatch({
            projectGeometry,
            ...(drawings ? { drawings } : {}),
            ...(visualPackage ? { visualPackage } : {}),
          }),
        )
      : baseArtifactStore;

  const baseCandidates =
    drawings || visualPackage
      ? [
          ...buildPanelCandidatesFromDrawings(drawings || {}),
          ...buildVisualPanelCandidates(visualPackage),
        ]
      : buildPanelCandidatesFromArtifactStore(resolvedArtifactStore);

  const requested = new Set(
    Array.isArray(requestedPanels)
      ? requestedPanels.map(normalizeRequestedPanel)
      : [],
  );
  const filtered = requested.size
    ? baseCandidates.filter(
        (candidate) =>
          requested.has(normalizeRequestedPanel(candidate.type)) ||
          requested.has(normalizeRequestedPanel(candidate.id)),
      )
    : baseCandidates;

  const panelCandidates = filtered.map((candidate) =>
    finalizePanelCandidate(candidate, resolvedArtifactStore),
  );
  const freshness = summarizeArtifactFreshness(resolvedArtifactStore);
  const missingAssets = [
    ...new Set(panelCandidates.flatMap((entry) => entry.missingAssetIds)),
  ];
  const staleAssets = [
    ...new Set(panelCandidates.flatMap((entry) => entry.staleAssetIds)),
  ];
  const freshPanels = panelCandidates.filter((entry) => entry.fresh);
  const stalePanels = panelCandidates.filter((entry) => entry.stale);
  const missingPanels = panelCandidates.filter((entry) => entry.missing);

  return {
    version: isFeatureEnabled("useComposeReadinessPhase5")
      ? "phase5-a1-panel-artifact-plan-v1"
      : "phase4-a1-panel-plan-v1",
    project_id: projectGeometry.project_id || null,
    panelCandidates,
    validPanelCount: panelCandidates.filter((candidate) => candidate.eligible)
      .length,
    totalPanelCount: panelCandidates.length,
    freshPanels,
    stalePanels,
    missingPanels,
    missingAssets,
    staleAssets,
    artifactFreshness: freshness,
    artifactStore: resolvedArtifactStore,
  };
}

export default {
  planA1PanelArtifacts,
};
