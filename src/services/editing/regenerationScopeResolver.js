import { normalizeFragmentTargetLayer } from "./dependencyEdgeRegistry.js";
import { buildDependencyFragmentRegistry } from "./dependencyFragmentRegistry.js";

function unique(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}

function matchPanelsBySource(panels = [], fragmentIds = []) {
  const fragments = new Set(fragmentIds);
  return panels
    .filter((panel) =>
      (panel.sourceArtifacts || []).some((sourceId) => fragments.has(sourceId)),
    )
    .map((panel) => panel.id);
}

function resolveSectionIds(drawings = []) {
  return drawings
    .filter((fragment) =>
      String(fragment.id || "").startsWith("drawing:section:"),
    )
    .map((fragment) => fragment.id);
}

export function resolveRegenerationScope({
  targetLayer = "",
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
  validationReport = null,
  options = {},
} = {}) {
  const normalizedLayer = normalizeFragmentTargetLayer(targetLayer);
  const registry = buildDependencyFragmentRegistry({
    projectGeometry,
    drawings,
    facadeGrammar,
    visualPackage,
    panelCandidates,
    artifactStore,
  });
  const requestedLevelId = options.levelId || options.level_id || null;
  const requestedSide =
    options.side || options.facadeSide || options.orientation || null;
  const requestedView = options.viewType || options.view_type || null;
  const requestedSectionType =
    options.sectionType || options.section_type || null;
  const warnings = [];

  let drawingFragments = [];
  let facadeFragments = [];
  let visualFragments = [];
  let panelFragments = [];
  let geometryFragments = [];

  switch (normalizedLayer) {
    case "room_layout":
      geometryFragments = requestedLevelId
        ? [`geometry:level:${requestedLevelId}`]
        : registry.canonical
            .filter((entry) => entry.subtype === "level")
            .map((entry) => entry.id);
      drawingFragments = unique([
        ...(requestedLevelId
          ? [`drawing:plan:${requestedLevelId}`]
          : registry.drawings
              .filter((entry) => entry.id.startsWith("drawing:plan:"))
              .map((entry) => entry.id)),
        ...resolveSectionIds(registry.drawings),
      ]);
      panelFragments = matchPanelsBySource(registry.panels, drawingFragments);
      warnings.push(
        "Room-layout recovery keeps regeneration level-scoped when possible, but sections still refresh because vertical coordination can drift.",
      );
      break;
    case "facade_grammar":
      facadeFragments = requestedSide
        ? [`facade:side:${String(requestedSide).toLowerCase()}`]
        : registry.facadeSides.map((entry) => entry.id);
      drawingFragments = registry.drawings
        .filter(
          (entry) =>
            entry.id.startsWith("drawing:elevation:") &&
            (!requestedSide ||
              entry.id.endsWith(`:${String(requestedSide).toLowerCase()}`)),
        )
        .map((entry) => entry.id);
      visualFragments = registry.visualViews.map((entry) => entry.id);
      panelFragments = matchPanelsBySource(registry.panels, [
        ...drawingFragments,
        ...visualFragments,
      ]);
      break;
    case "drawings":
      if (requestedLevelId) {
        drawingFragments = [`drawing:plan:${requestedLevelId}`];
      } else if (requestedSide) {
        drawingFragments = [
          `drawing:elevation:${String(requestedSide).toLowerCase()}`,
        ];
      } else if (requestedSectionType) {
        drawingFragments = [
          `drawing:section:${String(requestedSectionType).toLowerCase()}`,
        ];
      } else {
        drawingFragments = registry.drawings.map((entry) => entry.id);
      }
      panelFragments = matchPanelsBySource(registry.panels, drawingFragments);
      break;
    case "visual_style":
    case "visual_package":
      visualFragments = requestedView
        ? [`visual:view:${requestedView}`]
        : registry.visualViews.map((entry) => entry.id);
      panelFragments = matchPanelsBySource(registry.panels, visualFragments);
      break;
    case "site":
    case "massing":
    case "levels":
      geometryFragments = ["geometry:canonical"];
      drawingFragments = registry.drawings.map((entry) => entry.id);
      facadeFragments = registry.facadeSides.map((entry) => entry.id);
      visualFragments = registry.visualViews.map((entry) => entry.id);
      panelFragments = registry.panels.map((entry) => entry.id);
      break;
    default:
      geometryFragments = ["geometry:canonical"];
      drawingFragments = registry.drawings.map((entry) => entry.id);
      panelFragments = matchPanelsBySource(registry.panels, drawingFragments);
      break;
  }

  if (validationReport?.errors?.some((entry) => /stair|core/i.test(entry))) {
    geometryFragments = unique([
      ...geometryFragments,
      ...registry.canonical
        .filter((entry) => entry.subtype === "stair_core")
        .map((entry) => entry.id),
    ]);
  }

  return {
    version: "phase6-regeneration-scope-resolver-v1",
    targetLayer: normalizedLayer,
    registry,
    minimumSafeScope: {
      geometryFragments: unique(geometryFragments),
      drawingFragments: unique(drawingFragments),
      facadeFragments: unique(facadeFragments),
      visualFragments: unique(visualFragments),
      panelFragments: unique(panelFragments),
      readinessFragments: ["readiness:default"],
    },
    warnings,
  };
}

export default {
  resolveRegenerationScope,
};
