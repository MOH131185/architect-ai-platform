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
  if (normalized.includes("recess")) return "recess";
  if (normalized.includes("projection")) return "projection";
  if (normalized.includes("frame")) return "feature-frame";
  if (normalized.includes("lintel")) return "lintel";
  if (normalized.includes("sill")) return "sill";
  return normalized;
}

function toFamily(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (["balcony", "porch", "projection", "recess"].includes(normalized)) {
    return "projection-family";
  }
  if (["dormer", "chimney", "parapet"].includes(normalized)) {
    return "roof-family";
  }
  if (["lintel", "sill", "feature-frame"].includes(normalized)) {
    return "opening-trim-family";
  }
  return "general-feature-family";
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
    family:
      sourceObject.family ||
      sourceObject.featureFamily ||
      fallback.family ||
      toFamily(type),
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
    componentFamily:
      sourceObject.componentFamily ||
      sourceObject.component_family ||
      fallback.componentFamily ||
      fallback.component_family ||
      null,
    componentId:
      sourceObject.componentId ||
      sourceObject.component_id ||
      sourceObject.id ||
      null,
    presenceScore: Number.isFinite(Number(sourceObject.presenceScore))
      ? Number(sourceObject.presenceScore)
      : 1,
    semanticWeight: Number.isFinite(Number(sourceObject.semanticWeight))
      ? Number(sourceObject.semanticWeight)
      : Number.isFinite(Number(fallback.semanticWeight))
        ? Number(fallback.semanticWeight)
        : 1,
    metadata: {
      ...(fallback.metadata || {}),
      ...(sourceObject.metadata || {}),
    },
  };
}

export function normalizeFacadeFeatures(features = [], fallback = {}) {
  const normalized = toArray(features)
    .map((feature, index) =>
      normalizeFacadeFeature(feature, {
        ...fallback,
        metadata: {
          ...(fallback.metadata || {}),
          sourceIndex: index,
        },
      }),
    )
    .filter(Boolean);

  const seen = new Set();
  return normalized.filter((feature) => {
    const key = [
      feature.type,
      feature.side || "any",
      feature.levelId || "all-levels",
      feature.source || "unknown",
      feature.componentFamily || "any-family",
      feature.componentId ||
        feature.label ||
        feature.metadata?.sourceIndex ||
        "no-id",
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
