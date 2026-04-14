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
  const normalized = String(layer || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return LAYER_ALIASES[normalized] || normalized;
}

export function getLayerImpactSet(layer = "") {
  const normalized = normalizeLayerName(layer);

  if (normalized === "room_layout" || normalized === "level") {
    return ["room_layout", "openings"];
  }
  if (normalized === "one_level") {
    return ["room_layout", "openings"];
  }
  if (normalized === "facade_grammar") {
    return ["facade_grammar"];
  }
  if (normalized === "visual_style") {
    return ["visual_style"];
  }
  if (LOCKABLE_LAYERS.includes(normalized)) {
    return [normalized];
  }

  return [];
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
