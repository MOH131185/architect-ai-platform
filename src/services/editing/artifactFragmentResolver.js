function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStoreFragments(fragments = {}, family = "") {
  return Object.values(fragments || {}).map((fragment) => ({
    id: fragment.id,
    family,
    subtype: fragment.subtype || null,
    title: fragment.title || fragment.id,
    sourceArtifacts: fragment.sourceFragments || [],
    geometry_signature: fragment.geometry_signature || null,
    fresh: fragment.fresh === true,
    stale: fragment.stale === true,
    missing: fragment.missing === true,
  }));
}

function normalizeLiveDrawingFragments(drawings = {}) {
  return [
    ...(drawings.plan || []).map((entry, index) => ({
      id: `drawing:plan:${entry.level_id || index}`,
      family: "drawings",
      subtype: "plan",
      title: entry.title || `Plan ${index + 1}`,
      sourceArtifacts: [],
      geometry_signature: entry.geometry_signature || null,
      fresh: Boolean(entry.svg),
      stale: !entry.svg,
      missing: !entry.svg,
    })),
    ...(drawings.elevation || []).map((entry, index) => ({
      id: `drawing:elevation:${entry.orientation || index}`,
      family: "drawings",
      subtype: "elevation",
      title: entry.title || `Elevation ${index + 1}`,
      sourceArtifacts: [],
      geometry_signature: entry.geometry_signature || null,
      fresh: Boolean(entry.svg),
      stale: !entry.svg,
      missing: !entry.svg,
    })),
    ...(drawings.section || []).map((entry, index) => ({
      id: `drawing:section:${entry.section_type || index}`,
      family: "drawings",
      subtype: "section",
      title: entry.title || `Section ${index + 1}`,
      sourceArtifacts: [],
      geometry_signature: entry.geometry_signature || null,
      fresh: Boolean(entry.svg),
      stale: !entry.svg,
      missing: !entry.svg,
    })),
  ];
}

function normalizeLiveFacadeFragments(facadeGrammar = {}) {
  return (
    facadeGrammar?.orientations?.map((entry) => ({
      id: `facade:side:${entry.side}`,
      family: "facade_package",
      subtype: "side",
      title: entry.title || `Facade ${entry.side}`,
      sourceArtifacts: [],
      geometry_signature: null,
      fresh: true,
      stale: false,
      missing: false,
    })) || []
  );
}

function normalizeLiveVisualFragments(visualPackage = null) {
  if (!visualPackage) return [];
  return [
    {
      id: `visual:view:${visualPackage.viewType || "hero_3d"}`,
      family: "visual_package",
      subtype: "view",
      title: `Visual ${visualPackage.viewType || "hero_3d"}`,
      sourceArtifacts: [],
      geometry_signature: visualPackage.geometrySignature || null,
      fresh: visualPackage.validation?.valid !== false,
      stale: visualPackage.validation?.valid === false,
      missing: false,
    },
  ];
}

function normalizeLivePanelFragments(panelCandidates = []) {
  return (panelCandidates || []).map((entry, index) => ({
    id: entry.id || `panel:${index}`,
    family: "compose_candidates",
    subtype: entry.type || "panel",
    title: entry.title || entry.id || `Panel ${index + 1}`,
    sourceArtifacts: entry.sourceArtifacts || [],
    geometry_signature: entry.geometry_signature || null,
    fresh: entry.fresh === true || entry.ready === true,
    stale: entry.stale === true,
    missing: entry.missing === true,
  }));
}

export function resolveArtifactFragments({
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
} = {}) {
  return {
    drawings: drawings
      ? normalizeLiveDrawingFragments(drawings)
      : artifactStore?.artifacts?.drawings
        ? normalizeStoreFragments(
            artifactStore?.artifacts?.drawings?.fragments,
            "drawings",
          )
        : [],
    facadeSides: facadeGrammar
      ? normalizeLiveFacadeFragments(facadeGrammar)
      : artifactStore?.artifacts?.facade_package
        ? normalizeStoreFragments(
            artifactStore?.artifacts?.facade_package?.fragments,
            "facade_package",
          )
        : [],
    visualViews: visualPackage
      ? normalizeLiveVisualFragments(visualPackage)
      : artifactStore?.artifacts?.visual_package
        ? normalizeStoreFragments(
            artifactStore?.artifacts?.visual_package?.fragments,
            "visual_package",
          )
        : [],
    panels: panelCandidates.length
      ? normalizeLivePanelFragments(panelCandidates)
      : artifactStore?.artifacts?.compose_candidates
        ? normalizeStoreFragments(
            artifactStore?.artifacts?.compose_candidates?.fragments,
            "compose_candidates",
          )
        : [],
  };
}

export function resolveFamilyFragmentIds(artifactStore = {}, familyName = "") {
  return Object.keys(
    artifactStore?.artifacts?.[familyName]?.fragments || {},
  ).sort();
}

export function cloneArtifactStore(store = {}) {
  return clone(store);
}

export default {
  resolveArtifactFragments,
  resolveFamilyFragmentIds,
  cloneArtifactStore,
};
