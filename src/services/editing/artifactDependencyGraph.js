import {
  buildDrawingFragments,
  buildFacadeFragments,
  buildPanelFragments,
  buildVisualFragments,
} from "./dependencyEdgeRegistry.js";

function uniqueById(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry?.id || seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

function createNode(id, kind, metadata = {}) {
  return {
    id,
    kind,
    ...metadata,
  };
}

export function buildArtifactDependencyGraph({
  projectGeometry = {},
  drawings = {},
  facadeGrammar = {},
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
} = {}) {
  const levelNodes = (projectGeometry.levels || []).map((level) =>
    createNode(`geometry:level:${level.id}`, "geometry", {
      levelId: level.id,
      title: level.name || level.id,
    }),
  );
  const storedDrawingFragments = Object.values(
    artifactStore?.artifacts?.drawings?.fragments || {},
  ).map((fragment) => ({
    id: fragment.id,
    family: "drawings",
    subtype: fragment.id.includes("elevation")
      ? "elevation"
      : fragment.id.includes("section")
        ? "section"
        : "plan",
    levelId: fragment.id.startsWith("drawing:plan:")
      ? fragment.id.split(":").slice(-1)[0]
      : null,
    side: fragment.id.startsWith("drawing:elevation:")
      ? fragment.id.split(":").slice(-1)[0]
      : null,
    sectionType: fragment.id.startsWith("drawing:section:")
      ? fragment.id.split(":").slice(-1)[0]
      : null,
    title: fragment.title,
  }));
  const storedFacadeFragments = Object.values(
    artifactStore?.artifacts?.facade_package?.fragments || {},
  ).map((fragment) => ({
    id: fragment.id,
    family: "facade_package",
    subtype: "side",
    side: fragment.id.split(":").slice(-1)[0],
    title: fragment.title,
  }));
  const storedVisualFragments = Object.values(
    artifactStore?.artifacts?.visual_package?.fragments || {},
  ).map((fragment) => ({
    id: fragment.id,
    family: "visual_package",
    subtype: "view",
    viewType: fragment.id.split(":").slice(-1)[0],
    title: fragment.title,
  }));
  const storedPanelFragments = Object.values(
    artifactStore?.artifacts?.compose_candidates?.fragments || {},
  ).map((fragment) => ({
    id: fragment.id,
    family: "compose_candidates",
    subtype: "panel",
    title: fragment.title,
    sourceArtifacts: fragment.sourceFragments || [],
  }));

  const drawingNodes = (
    buildDrawingFragments(drawings).length
      ? buildDrawingFragments(drawings)
      : storedDrawingFragments
  ).map((entry) => createNode(entry.id, "artifact", entry));
  const facadeNodes = (
    buildFacadeFragments(facadeGrammar).length
      ? buildFacadeFragments(facadeGrammar)
      : storedFacadeFragments
  ).map((entry) => createNode(entry.id, "artifact", entry));
  const visualNodes = (
    buildVisualFragments(visualPackage).length
      ? buildVisualFragments(visualPackage)
      : storedVisualFragments
  ).map((entry) => createNode(entry.id, "artifact", entry));
  const panelNodes = (
    buildPanelFragments(panelCandidates).length
      ? buildPanelFragments(panelCandidates)
      : storedPanelFragments
  ).map((entry) => createNode(entry.id, "panel", entry));

  const nodes = uniqueById([
    createNode("geometry:canonical", "geometry", {
      title: "Canonical Geometry",
    }),
    ...levelNodes,
    ...drawingNodes,
    ...facadeNodes,
    ...visualNodes,
    ...panelNodes,
    createNode("compose:default", "compose", {
      title: "A1 Compose State",
    }),
  ]);

  const edges = [];

  levelNodes.forEach((levelNode) => {
    drawingNodes
      .filter(
        (entry) =>
          entry.subtype === "plan" && entry.levelId === levelNode.levelId,
      )
      .forEach((drawingNode) => {
        edges.push({ from: levelNode.id, to: drawingNode.id });
      });
    drawingNodes
      .filter((entry) => entry.subtype === "section")
      .forEach((drawingNode) => {
        edges.push({ from: levelNode.id, to: drawingNode.id });
      });
    visualNodes.forEach((visualNode) => {
      edges.push({ from: levelNode.id, to: visualNode.id });
    });
  });

  facadeNodes.forEach((facadeNode) => {
    drawingNodes
      .filter(
        (entry) =>
          entry.subtype === "elevation" && entry.side === facadeNode.side,
      )
      .forEach((drawingNode) => {
        edges.push({ from: facadeNode.id, to: drawingNode.id });
      });
    visualNodes.forEach((visualNode) => {
      edges.push({ from: facadeNode.id, to: visualNode.id });
    });
  });

  drawingNodes.forEach((drawingNode) => {
    panelNodes
      .filter((panelNode) =>
        (panelNode.sourceArtifacts || []).includes(drawingNode.id),
      )
      .forEach((panelNode) => {
        edges.push({ from: drawingNode.id, to: panelNode.id });
      });
  });

  visualNodes.forEach((visualNode) => {
    panelNodes
      .filter((panelNode) =>
        (panelNode.sourceArtifacts || []).includes(visualNode.id),
      )
      .forEach((panelNode) => {
        edges.push({ from: visualNode.id, to: panelNode.id });
      });
  });

  panelNodes.forEach((panelNode) => {
    edges.push({ from: panelNode.id, to: "compose:default" });
  });

  if (!levelNodes.length) {
    drawingNodes
      .filter((entry) => entry.subtype === "section")
      .forEach((drawingNode) => {
        edges.push({ from: "geometry:canonical", to: drawingNode.id });
      });
    visualNodes.forEach((visualNode) => {
      edges.push({ from: "geometry:canonical", to: visualNode.id });
    });
  }

  return {
    version: "phase5-artifact-dependency-graph-v1",
    nodes,
    edges,
  };
}

export default {
  buildArtifactDependencyGraph,
};
