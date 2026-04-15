const TARGET_LAYER_ALIASES = {
  level: "room_layout",
  one_level: "room_layout",
  facade: "facade_grammar",
  facade_only: "facade_grammar",
  roof_language: "facade_grammar",
  window_language: "facade_grammar",
  visuals: "visual_package",
};

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeFragmentTargetLayer(layer = "") {
  const normalized = normalizeText(layer);
  return TARGET_LAYER_ALIASES[normalized] || normalized;
}

export function buildDrawingFragments(drawings = {}) {
  return [
    ...(drawings.plan || []).map((entry, index) => ({
      id: `drawing:plan:${entry.level_id || index}`,
      family: "drawings",
      subtype: "plan",
      levelId: entry.level_id || null,
      title: entry.title || `Plan ${index + 1}`,
    })),
    ...(drawings.elevation || []).map((entry, index) => ({
      id: `drawing:elevation:${entry.orientation || index}`,
      family: "drawings",
      subtype: "elevation",
      side: entry.orientation || null,
      title: entry.title || `Elevation ${index + 1}`,
    })),
    ...(drawings.section || []).map((entry, index) => ({
      id: `drawing:section:${entry.section_type || index}`,
      family: "drawings",
      subtype: "section",
      sectionType: entry.section_type || null,
      title: entry.title || `Section ${index + 1}`,
    })),
  ];
}

export function buildFacadeFragments(facadeGrammar = {}) {
  const sides =
    facadeGrammar?.orientations?.map((entry) => entry.side).filter(Boolean) ||
    [];
  return sides.map((side) => ({
    id: `facade:side:${side}`,
    family: "facade_package",
    subtype: "side",
    side,
    title: `Facade ${side}`,
  }));
}

export function buildVisualFragments(visualPackage = null) {
  if (!visualPackage) return [];
  return [
    {
      id: `visual:view:${visualPackage.viewType || "hero_3d"}`,
      family: "visual_package",
      subtype: "view",
      viewType: visualPackage.viewType || "hero_3d",
      title: `Visual ${visualPackage.viewType || "hero_3d"}`,
    },
  ];
}

export function buildPanelFragments(panelCandidates = []) {
  return (panelCandidates || []).map((candidate, index) => ({
    id: candidate.id || `panel:${index}`,
    family: "compose_candidates",
    subtype: candidate.type || "panel",
    title: candidate.title || candidate.id || `Panel ${index + 1}`,
    sourceArtifacts: candidate.sourceArtifacts || [],
  }));
}

export function deriveFragmentSeeds({
  targetLayer,
  projectGeometry = {},
  drawings = {},
  facadeGrammar = {},
  visualPackage = null,
  artifactStore = null,
  options = {},
} = {}) {
  const normalizedLayer = normalizeFragmentTargetLayer(targetLayer);
  const requestedLevelId = options.levelId || options.level_id || null;
  const requestedSide =
    normalizeText(
      options.side || options.facadeSide || options.orientation || "",
    ) || null;
  const requestedView = options.viewType || options.view_type || null;
  const requestedSectionType =
    normalizeText(options.sectionType || options.section_type || "") || null;

  switch (normalizedLayer) {
    case "room_layout":
      if (requestedLevelId) {
        return [`geometry:level:${requestedLevelId}`];
      }
      return (projectGeometry.levels || []).map(
        (level) => `geometry:level:${level.id}`,
      );
    case "site":
    case "massing":
    case "levels":
      return ["geometry:canonical"];
    case "facade_grammar":
      if (requestedSide) {
        return [`facade:side:${requestedSide}`];
      }
      return (
        buildFacadeFragments(facadeGrammar).map((entry) => entry.id) || []
      ).length
        ? buildFacadeFragments(facadeGrammar).map((entry) => entry.id)
        : Object.keys(
            artifactStore?.artifacts?.facade_package?.fragments || {},
          );
    case "drawings": {
      if (requestedLevelId) return [`drawing:plan:${requestedLevelId}`];
      if (requestedSide) return [`drawing:elevation:${requestedSide}`];
      if (requestedSectionType) {
        return [`drawing:section:${requestedSectionType}`];
      }
      return buildDrawingFragments(drawings).length
        ? buildDrawingFragments(drawings).map((entry) => entry.id)
        : Object.keys(artifactStore?.artifacts?.drawings?.fragments || {});
    }
    case "visual_style":
    case "visual_package":
      if (requestedView) {
        return [`visual:view:${requestedView}`];
      }
      return buildVisualFragments(visualPackage).length
        ? buildVisualFragments(visualPackage).map((entry) => entry.id)
        : Object.keys(
            artifactStore?.artifacts?.visual_package?.fragments || {},
          );
    default:
      return ["geometry:canonical"];
  }
}

export default {
  normalizeFragmentTargetLayer,
  buildDrawingFragments,
  buildFacadeFragments,
  buildVisualFragments,
  buildPanelFragments,
  deriveFragmentSeeds,
};
