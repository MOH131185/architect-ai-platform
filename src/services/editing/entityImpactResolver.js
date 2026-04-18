import { buildEntityDependencyGraph } from "./entityDependencyGraph.js";

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function normalizeSide(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function inferRequestedEntities(
  graph = {},
  targetLayer = "",
  validationReport = null,
  options = {},
) {
  const levelId = options.levelId || options.level_id || null;
  const side = normalizeSide(
    options.side || options.facadeSide || options.orientation || "",
  );
  const sectionType = options.sectionType || options.section_type || null;
  const entities = graph.entities || [];
  const explicitEntityIds = Array.isArray(options.entityIds)
    ? unique(options.entityIds)
    : [];
  const requested = [];

  if (explicitEntityIds.length > 0) {
    return explicitEntityIds.filter((entityId) =>
      entities.some((entity) => entity.id === entityId),
    );
  }

  entities.forEach((entity) => {
    const type = entity.type;
    if (levelId && entity.levelId === levelId) {
      requested.push(entity.id);
      return;
    }

    if (side && entity.side === side) {
      requested.push(entity.id);
      return;
    }

    if (sectionType && entity.sectionType === sectionType) {
      requested.push(entity.id);
      return;
    }

    if (
      targetLayer === "room_layout" &&
      ["room", "wall", "opening", "stair"].includes(type)
    ) {
      if (!levelId || entity.levelId === levelId) {
        requested.push(entity.id);
      }
    } else if (
      targetLayer === "facade_grammar" &&
      ["facade_component", "wall", "opening"].includes(type)
    ) {
      if (!side || entity.side === side) {
        requested.push(entity.id);
      }
    } else if (
      targetLayer === "drawings" &&
      type === "section_cut" &&
      sectionType
    ) {
      requested.push(entity.id);
    }
  });

  const validationText = [
    ...(validationReport?.errors || []),
    ...(validationReport?.warnings || []),
  ]
    .join(" ")
    .toLowerCase();
  if (/stair|core/.test(validationText)) {
    requested.push(
      ...entities
        .filter((entity) => entity.type === "stair")
        .map((entity) => entity.id),
    );
  }

  return unique(requested);
}

export function resolveEntityImpact({
  targetLayer = "",
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  panelCandidates = [],
  artifactStore = null,
  validationReport = null,
  options = {},
} = {}) {
  const graph = buildEntityDependencyGraph({
    projectGeometry,
    drawings,
    facadeGrammar,
    panelCandidates,
    artifactStore,
  });
  const requestedEntityIds = inferRequestedEntities(
    graph,
    targetLayer,
    validationReport,
    options,
  );
  const impactedEdges = (graph.edges || []).filter((edge) =>
    requestedEntityIds.includes(edge.from),
  );

  return {
    version: "phase7-entity-impact-resolver-v1",
    requestedEntityIds,
    impactedEntities: requestedEntityIds
      .map((entityId) =>
        graph.entities.find((entity) => entity.id === entityId),
      )
      .filter(Boolean),
    impactedFragments: unique(
      impactedEdges
        .filter((edge) => edge.kind === "artifact_fragment")
        .map((edge) => edge.to),
    ),
    impactedPanels: unique(
      impactedEdges
        .filter((edge) => edge.kind === "panel_candidate")
        .map((edge) => edge.to),
    ),
    graph,
  };
}

export default {
  resolveEntityImpact,
};
