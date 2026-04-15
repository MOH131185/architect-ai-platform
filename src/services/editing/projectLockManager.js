import {
  normalizeDependencyLayer,
  resolveDependentLayers,
} from "./projectDependencyGraph.js";

const LOCKABLE_LAYERS = [
  "site",
  "massing",
  "levels",
  "room_layout",
  "structural_grid",
  "facade_grammar",
  "openings",
  "drawings",
  "visual_style",
];

const LAYER_ALIASES = {
  facade: "facade_grammar",
  facade_only: "facade_grammar",
  roof_language: "facade_grammar",
  window_language: "facade_grammar",
  visuals: "visual_style",
};

function normalizeLayerName(layer = "") {
  const normalized = normalizeDependencyLayer(layer);
  return LAYER_ALIASES[normalized] || normalized;
}

export function getLayerImpactSet(layer = "") {
  const normalized = normalizeLayerName(layer);
  return resolveDependentLayers(normalized).filter(
    (entry) => LOCKABLE_LAYERS.includes(entry) || entry === normalized,
  );
}

export function normalizeProjectLocks(locks = {}) {
  const lockedLayers = new Set(
    [
      ...(Array.isArray(locks.lockedLayers) ? locks.lockedLayers : []),
      ...Object.entries(locks)
        .filter(([, value]) => value === true)
        .map(([key]) => key),
    ]
      .map(normalizeLayerName)
      .filter((entry) => LOCKABLE_LAYERS.includes(entry)),
  );

  return {
    lockedLayers: [...lockedLayers],
    lockVersion: "phase3-locks-v1",
  };
}

export function isLayerLocked(locks = {}, layer = "") {
  const normalized = normalizeProjectLocks(locks);
  const impactedLayers = getLayerImpactSet(layer);
  return impactedLayers.some((entry) =>
    normalized.lockedLayers.includes(entry),
  );
}

export function applyProjectLocks(projectGeometry = {}, locks = {}) {
  const normalized = normalizeProjectLocks(locks);
  return {
    ...projectGeometry,
    metadata: {
      ...(projectGeometry.metadata || {}),
      locks: normalized,
    },
  };
}

export default {
  LOCKABLE_LAYERS,
  getLayerImpactSet,
  normalizeProjectLocks,
  isLayerLocked,
  applyProjectLocks,
};
