function toArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function toType(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");

  if (!normalized) return "feature";
  if (normalized.includes("balcony")) return "balcony";
  if (normalized.includes("dormer")) return "dormer";
  if (normalized.includes("chimney")) return "chimney";
  if (normalized.includes("porch")) return "porch";
  if (normalized.includes("parapet")) return "parapet";
  if (normalized.includes("frame")) return "feature-frame";
  if (normalized.includes("lintel")) return "lintel";
  if (normalized.includes("sill")) return "sill";
  return normalized;
}

export function normalizeFacadeFeature(feature = null, fallback = {}) {
  if (!feature) {
    return null;
  }

  const sourceObject =
    typeof feature === "string" ? { type: feature } : { ...feature };
  const type = toType(
    sourceObject.type ||
      sourceObject.kind ||
      sourceObject.name ||
      sourceObject.label ||
      sourceObject.component,
  );

  return {
    type,
    label:
      sourceObject.label ||
      sourceObject.name ||
      type
        .split("-")
        .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
        .join(" "),
    side:
      sourceObject.side ||
      sourceObject.orientation ||
      fallback.side ||
      fallback.orientation ||
      null,
    levelId:
      sourceObject.levelId ||
      sourceObject.level_id ||
      fallback.levelId ||
      fallback.level_id ||
      null,
    source: sourceObject.source || fallback.source || "canonical_geometry",
    presenceScore: Number.isFinite(Number(sourceObject.presenceScore))
      ? Number(sourceObject.presenceScore)
      : 1,
    metadata: {
      ...(fallback.metadata || {}),
      ...(sourceObject.metadata || {}),
    },
  };
}

export function normalizeFacadeFeatures(features = [], fallback = {}) {
  const normalized = toArray(features)
    .map((feature) => normalizeFacadeFeature(feature, fallback))
    .filter(Boolean);

  const seen = new Set();
  return normalized.filter((feature) => {
    const key = [
      feature.type,
      feature.side || "any",
      feature.levelId || "all-levels",
      feature.source || "unknown",
    ].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export default {
  normalizeFacadeFeature,
  normalizeFacadeFeatures,
};
