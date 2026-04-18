import { buildDrawingFragmentDependencies } from "./drawingFragmentDependencyService.js";

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function normalizeSide(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function collectFacadeEntities(facadeGrammar = {}) {
  return (facadeGrammar?.orientations || []).flatMap((orientation) => {
    const side = normalizeSide(orientation.side);
    const sideEntities = [];
    const components = orientation.components || {};

    Object.entries(components).forEach(([family, entries]) => {
      if (Array.isArray(entries)) {
        entries.forEach((entry, index) => {
          sideEntities.push({
            id: `entity:facade-component:${side}:${family}:${entry.id || index}`,
            type: "facade_component",
            side,
            family,
            title: entry.title || entry.group_id || `${family} ${index + 1}`,
          });
        });
      } else if (entries && typeof entries === "object") {
        sideEntities.push({
          id: `entity:facade-component:${side}:${family}`,
          type: "facade_component",
          side,
          family,
          title: entries.title || family,
        });
      }
    });

    return sideEntities;
  });
}

function collectSectionEntities(drawings = {}, artifactStore = null) {
  const liveSections = (drawings?.section || []).map((entry, index) => ({
    id: `entity:section-cut:${entry.section_type || index}`,
    type: "section_cut",
    sectionType: entry.section_type || index,
    title: entry.title || `Section ${index + 1}`,
  }));
  if (liveSections.length) {
    return liveSections;
  }

  return Object.keys(artifactStore?.artifacts?.drawings?.fragments || {})
    .filter((entry) => entry.startsWith("drawing:section:"))
    .map((entry) => ({
      id: `entity:section-cut:${entry.replace("drawing:section:", "")}`,
      type: "section_cut",
      sectionType: entry.replace("drawing:section:", ""),
      title: entry.replace("drawing:section:", ""),
    }));
}

function collectPanelEntities(panelCandidates = []) {
  return (panelCandidates || []).map((panel) => ({
    id: `entity:panel:${panel.id}`,
    type: "panel_candidate",
    panelId: panel.id,
    panelType: panel.type,
    title: panel.title || panel.id,
    sourceArtifacts: panel.sourceArtifacts || [],
  }));
}

function collectGeometryEntities(projectGeometry = {}) {
  const rooms = (projectGeometry.rooms || []).map((room) => ({
    id: `entity:room:${room.id}`,
    type: "room",
    roomId: room.id,
    levelId: room.level_id || null,
    bbox: room.bbox || null,
    centroid: room.centroid || null,
    title: room.name || room.id,
  }));
  const walls = (projectGeometry.walls || []).map((wall) => ({
    id: `entity:wall:${wall.id}`,
    type: "wall",
    wallId: wall.id,
    levelId: wall.level_id || null,
    side: wall.metadata?.side || null,
    roomIds: wall.room_ids || [],
    start: wall.start || null,
    end: wall.end || null,
    title: wall.name || wall.id,
  }));
  const openings = [
    ...(projectGeometry.doors || []).map((door) => ({
      id: `entity:opening:${door.id}`,
      type: "opening",
      openingType: "door",
      openingId: door.id,
      wallId: door.wall_id || null,
      levelId: door.level_id || null,
      side: null,
      position: door.position_m || null,
      title: door.name || door.id,
    })),
    ...(projectGeometry.windows || []).map((windowElement) => {
      const wall = (projectGeometry.walls || []).find(
        (entry) => entry.id === windowElement.wall_id,
      );
      return {
        id: `entity:opening:${windowElement.id}`,
        type: "opening",
        openingType: "window",
        openingId: windowElement.id,
        wallId: windowElement.wall_id || null,
        levelId: windowElement.level_id || wall?.level_id || null,
        side: wall?.metadata?.side || null,
        position: windowElement.position_m || null,
        title: windowElement.name || windowElement.id,
      };
    }),
  ];
  const stairs = (projectGeometry.stairs || []).map((stair, index) => ({
    id: `entity:stair:${stair.id || index}`,
    type: "stair",
    stairId: stair.id || `stair-${index}`,
    levelId: stair.level_id || null,
    bbox: stair.bbox || null,
    title: stair.name || stair.id || `Stair ${index + 1}`,
  }));

  return [...rooms, ...walls, ...openings, ...stairs].sort((left, right) =>
    String(left.id).localeCompare(String(right.id)),
  );
}

export function buildEntityDependencyGraph({
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  panelCandidates = [],
  artifactStore = null,
} = {}) {
  const entities = [
    ...collectGeometryEntities(projectGeometry),
    ...collectFacadeEntities(facadeGrammar),
    ...collectSectionEntities(drawings, artifactStore),
    ...collectPanelEntities(panelCandidates),
  ].sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const dependencies = buildDrawingFragmentDependencies({
    entities,
    projectGeometry,
    drawings,
    artifactStore,
    panelCandidates,
  });
  const edges = dependencies.flatMap((dependency) => [
    ...dependency.fragmentIds.map((fragmentId) => ({
      from: dependency.entityId,
      to: fragmentId,
      kind: "artifact_fragment",
    })),
    ...dependency.panelIds.map((panelId) => ({
      from: dependency.entityId,
      to: panelId,
      kind: "panel_candidate",
    })),
  ]);

  return {
    version: "phase7-entity-dependency-graph-v1",
    entities,
    edges: edges.sort((left, right) => {
      const fromComparison = String(left.from).localeCompare(
        String(right.from),
      );
      if (fromComparison !== 0) return fromComparison;
      const toComparison = String(left.to).localeCompare(String(right.to));
      if (toComparison !== 0) return toComparison;
      return String(left.kind).localeCompare(String(right.kind));
    }),
    fragmentIds: unique(
      edges
        .filter((edge) => edge.kind === "artifact_fragment")
        .map((edge) => edge.to),
    ),
    panelIds: unique(
      edges
        .filter((edge) => edge.kind === "panel_candidate")
        .map((edge) => edge.to),
    ),
  };
}

export default {
  buildEntityDependencyGraph,
};
