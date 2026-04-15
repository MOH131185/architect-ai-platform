import { updateArtifactStoreFamily } from "../project/projectArtifactStore.js";
import { buildArtifactDependencyGraph } from "./artifactDependencyGraph.js";
import {
  buildDrawingFragments,
  buildFacadeFragments,
  buildPanelFragments,
  buildVisualFragments,
  deriveFragmentSeeds,
} from "./dependencyEdgeRegistry.js";

function buildAdjacency(edges = []) {
  return edges.reduce((accumulator, edge) => {
    if (!accumulator.has(edge.from)) {
      accumulator.set(edge.from, []);
    }
    accumulator.get(edge.from).push(edge.to);
    return accumulator;
  }, new Map());
}

function walkDependents(seeds = [], edges = []) {
  const adjacency = buildAdjacency(edges);
  const visited = new Set();
  const queue = [...seeds];

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    (adjacency.get(current) || []).forEach((next) => {
      if (!visited.has(next)) {
        queue.push(next);
      }
    });
  }

  return [...visited];
}

function classifyImpactedFragments(nodeIds = []) {
  const impacted = {
    drawings: [],
    facadeSides: [],
    visualViews: [],
    panels: [],
    compose: [],
  };

  nodeIds.forEach((id) => {
    if (id.startsWith("drawing:")) {
      impacted.drawings.push(id);
    } else if (id.startsWith("facade:side:")) {
      impacted.facadeSides.push(id);
    } else if (id.startsWith("visual:view:")) {
      impacted.visualViews.push(id);
    } else if (id.startsWith("compose:")) {
      impacted.compose.push(id);
    } else if (id.startsWith("panel:")) {
      impacted.panels.push(id);
    }
  });

  return impacted;
}

export function planFragmentInvalidation({
  targetLayer,
  projectGeometry = {},
  drawings = {},
  facadeGrammar = {},
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
  options = {},
} = {}) {
  const graph = buildArtifactDependencyGraph({
    projectGeometry,
    drawings,
    facadeGrammar,
    visualPackage,
    panelCandidates,
    artifactStore:
      artifactStore ||
      projectGeometry?.metadata?.project_artifact_store ||
      null,
  });
  const seeds = deriveFragmentSeeds({
    targetLayer,
    projectGeometry,
    drawings,
    facadeGrammar,
    visualPackage,
    artifactStore:
      artifactStore ||
      projectGeometry?.metadata?.project_artifact_store ||
      null,
    options,
  });
  const impactedNodeIds = walkDependents(seeds, graph.edges).filter(
    (id) => !seeds.includes(id),
  );
  const impactedFragments = classifyImpactedFragments(impactedNodeIds);

  return {
    version: "phase5-fragment-invalidation-v1",
    targetLayer,
    seedFragments: seeds,
    impactedNodeIds,
    impactedFragments,
    impactedArtifacts: {
      drawings: impactedFragments.drawings.length > 0,
      facadePackage: impactedFragments.facadeSides.length > 0,
      visualPackage: impactedFragments.visualViews.length > 0,
      a1Readiness:
        impactedFragments.panels.length > 0 ||
        impactedFragments.compose.length > 0,
    },
    graph,
  };
}

export function invalidateArtifactStoreFragments(
  artifactStore = {},
  invalidationPlan = {},
  signature = null,
) {
  let nextStore = artifactStore;

  if ((invalidationPlan.impactedFragments?.drawings || []).length) {
    nextStore = updateArtifactStoreFamily(
      nextStore,
      "drawings",
      invalidationPlan.impactedFragments.drawings,
      { fresh: false, stale: true, missing: false },
      signature,
    );
  }
  if ((invalidationPlan.impactedFragments?.facadeSides || []).length) {
    nextStore = updateArtifactStoreFamily(
      nextStore,
      "facade_package",
      invalidationPlan.impactedFragments.facadeSides,
      { fresh: false, stale: true, missing: false },
      signature,
    );
  }
  if ((invalidationPlan.impactedFragments?.visualViews || []).length) {
    nextStore = updateArtifactStoreFamily(
      nextStore,
      "visual_package",
      invalidationPlan.impactedFragments.visualViews,
      { fresh: false, stale: true, missing: false },
      signature,
    );
  }
  if ((invalidationPlan.impactedFragments?.panels || []).length) {
    nextStore = updateArtifactStoreFamily(
      nextStore,
      "compose_candidates",
      invalidationPlan.impactedFragments.panels,
      { fresh: false, stale: true, missing: false },
      signature,
    );
  }
  if (
    (invalidationPlan.impactedFragments?.panels || []).length ||
    (invalidationPlan.impactedFragments?.compose || []).length ||
    (invalidationPlan.impactedFragments?.drawings || []).length ||
    (invalidationPlan.impactedFragments?.visualViews || []).length
  ) {
    nextStore = updateArtifactStoreFamily(
      nextStore,
      "a1_readiness",
      ["readiness:default"],
      { fresh: false, stale: true, missing: false },
      signature,
    );
  }

  return nextStore;
}

export default {
  planFragmentInvalidation,
  invalidateArtifactStoreFragments,
};
