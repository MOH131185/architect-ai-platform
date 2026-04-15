const GRAPH = {
  site: [
    "massing",
    "levels",
    "room_layout",
    "structural_grid",
    "facade_grammar",
    "openings",
    "drawings",
    "visual_style",
    "visual_package",
    "a1_readiness",
  ],
  massing: [
    "levels",
    "room_layout",
    "structural_grid",
    "facade_grammar",
    "openings",
    "drawings",
    "visual_style",
    "visual_package",
    "a1_readiness",
  ],
  levels: [
    "room_layout",
    "structural_grid",
    "openings",
    "drawings",
    "visual_style",
    "visual_package",
    "a1_readiness",
  ],
  room_layout: [
    "openings",
    "structural_grid",
    "facade_grammar",
    "drawings",
    "visual_style",
    "visual_package",
    "a1_readiness",
  ],
  structural_grid: ["drawings", "a1_readiness"],
  facade_grammar: [
    "drawings",
    "visual_style",
    "visual_package",
    "a1_readiness",
  ],
  openings: [
    "facade_grammar",
    "drawings",
    "visual_style",
    "visual_package",
    "a1_readiness",
  ],
  drawings: ["a1_readiness"],
  visual_style: ["visual_package", "a1_readiness"],
  visual_package: ["a1_readiness"],
  a1_readiness: [],
};

const LAYER_ALIASES = {
  level: "room_layout",
  one_level: "room_layout",
  facade: "facade_grammar",
  facade_only: "facade_grammar",
  roof_language: "facade_grammar",
  window_language: "facade_grammar",
  visuals: "visual_style",
};

export function normalizeDependencyLayer(layer = "") {
  const normalized = String(layer || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return LAYER_ALIASES[normalized] || normalized;
}

export function resolveDependentLayers(layer = "") {
  const root = normalizeDependencyLayer(layer);
  const visited = new Set();
  const queue = [root];

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    (GRAPH[current] || []).forEach((dependency) => {
      if (!visited.has(dependency)) {
        queue.push(dependency);
      }
    });
  }

  return [...visited];
}

export function getProjectDependencyGraph() {
  return {
    version: "phase4-project-dependency-graph-v1",
    nodes: Object.keys(GRAPH),
    edges: Object.entries(GRAPH).flatMap(([from, tos]) =>
      tos.map((to) => ({ from, to })),
    ),
  };
}

export default {
  normalizeDependencyLayer,
  resolveDependentLayers,
  getProjectDependencyGraph,
};
