import { orientationToSide } from "./facadeProjectionService.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeMaterialZones(facadeOrientation = {}) {
  const source =
    facadeOrientation?.material_zones ?? facadeOrientation?.materialZones ?? [];
  return Array.isArray(source)
    ? source
    : source && typeof source === "object"
      ? [source]
      : [];
}

function buildOrientationAliases(
  normalizedSide = "south",
  facadeOrientation = {},
) {
  const explicitOrientation = String(
    facadeOrientation?.orientation || facadeOrientation?.side || "",
  ).trim();
  return unique([
    normalizedSide,
    normalizedSide.toUpperCase(),
    normalizedSide.slice(0, 1).toUpperCase(),
    `${normalizedSide}_elevation`,
    `${normalizedSide.toUpperCase()}_ELEVATION`,
    explicitOrientation || null,
    explicitOrientation ? explicitOrientation.toUpperCase() : null,
  ]);
}

function summarizeEvidenceSources(
  features = [],
  wallZones = [],
  materialZones = [],
) {
  return unique([
    ...(features || []).map((feature) => feature.source),
    ...(wallZones || []).map((zone) =>
      zone.explicit ? "explicit_side_walls" : "derived_zone",
    ),
    ...(materialZones || []).map(() => "material_zone"),
  ]);
}

function groupFeaturesByFamily(features = []) {
  const buckets = new Map();

  (features || []).forEach((feature) => {
    const normalizedType = String(feature?.type || "feature").toLowerCase();
    let family = "misc";
    if (
      normalizedType.includes("balcony") ||
      normalizedType.includes("porch")
    ) {
      family = "projection-family";
    } else if (
      normalizedType.includes("recess") ||
      normalizedType.includes("frame")
    ) {
      family = "recess-family";
    } else if (
      normalizedType.includes("dormer") ||
      normalizedType.includes("chimney") ||
      normalizedType.includes("parapet")
    ) {
      family = "roof-family";
    }

    const existing = buckets.get(family) || [];
    existing.push(feature);
    buckets.set(family, existing);
  });

  return [...buckets.entries()].map(([family, members]) => ({
    family,
    count: members.length,
    types: unique(
      members.map((entry) => String(entry.type || "").toLowerCase()),
    ),
    members,
  }));
}

function buildProjectionRecessSummary(features = []) {
  const projections = [];
  const recesses = [];

  (features || []).forEach((feature) => {
    const type = String(feature?.type || "").toLowerCase();
    if (
      type.includes("balcony") ||
      type.includes("porch") ||
      type.includes("projection")
    ) {
      projections.push(feature);
    }
    if (type.includes("recess") || type.includes("frame")) {
      recesses.push(feature);
    }
  });

  return {
    projections,
    recesses,
  };
}

function classifySchemaCredibility({
  explicitCoverageRatio = 0,
  openingGroups = [],
  wallZones = [],
  featureFamilies = [],
  roofEdges = [],
  geometrySource = "envelope_derived",
} = {}) {
  const score = round(
    Math.min(
      1,
      (geometrySource === "explicit_side_walls" ? 0.28 : 0.1) +
        Math.min(0.2, Number(explicitCoverageRatio || 0) * 0.24) +
        Math.min(0.18, (openingGroups.length || 0) * 0.06) +
        Math.min(0.16, (wallZones.length || 0) * 0.05) +
        Math.min(0.14, (featureFamilies.length || 0) * 0.04) +
        Math.min(0.1, (roofEdges.length || 0) * 0.05),
    ),
  );

  return {
    score,
    quality: score >= 0.7 ? "pass" : score >= 0.48 ? "warning" : "block",
  };
}

function countRoofEdgeKinds(roofEdges = [], kind = "") {
  const normalizedKind = String(kind || "").toLowerCase();
  return (roofEdges || []).filter(
    (entry) => String(entry.kind || "").toLowerCase() === normalizedKind,
  ).length;
}

export function buildSideFacadeSchema({
  side = "south",
  projection = {},
  facadeOrientation = {},
  facadeSemantics = null,
  features = [],
  roofLanguage = "pitched gable",
} = {}) {
  const normalizedSide = orientationToSide(side);
  const featureFamilies =
    facadeSemantics?.featureFamilies?.length > 0
      ? facadeSemantics.featureFamilies
      : groupFeaturesByFamily(features);
  const projectionsAndRecesses = buildProjectionRecessSummary(features);
  const openingGroups = facadeSemantics?.openingGroups || [];
  const wallZones = facadeSemantics?.wallZones || [];
  const roofEdges = facadeSemantics?.roofEdges || [];
  const materialZones = normalizeMaterialZones(facadeOrientation);
  const credibility = classifySchemaCredibility({
    explicitCoverageRatio: projection.explicitCoverageRatio,
    openingGroups,
    wallZones,
    featureFamilies,
    roofEdges,
    geometrySource: projection.geometrySource,
  });
  const hipCount = countRoofEdgeKinds(roofEdges, "hip");
  const valleyCount = countRoofEdgeKinds(roofEdges, "valley");

  return {
    version:
      hipCount > 0 || valleyCount > 0
        ? "phase17-side-facade-schema-builder-v1"
        : "phase12-side-facade-schema-builder-v1",
    side: normalizedSide,
    orientationAliases: buildOrientationAliases(
      normalizedSide,
      facadeOrientation,
    ),
    geometrySource: projection.geometrySource || "envelope_derived",
    explicitCoverageRatio: Number(projection.explicitCoverageRatio || 0),
    openingGroups,
    wallZones,
    roofEdges,
    roofLanguage,
    materialZones,
    featureFamilies,
    featureGroupings: {
      projections: projectionsAndRecesses.projections,
      recesses: projectionsAndRecesses.recesses,
      porchAndChimneyGroups: (features || []).filter((feature) =>
        ["porch", "chimney", "dormer"].some((entry) =>
          String(feature?.type || "")
            .toLowerCase()
            .includes(entry),
        ),
      ),
    },
    evidenceSummary: {
      openingGroupCount: openingGroups.length,
      wallZoneCount: wallZones.length,
      explicitWallZoneCount: (wallZones || []).filter((zone) => zone.explicit)
        .length,
      materialZoneCount: materialZones.length,
      roofEdgeCount: roofEdges.length,
      roofPrimitiveCount: Number(projection.roofPrimitiveCount || 0),
      roofHipCount:
        Number(projection.roofHipCount || 0) || Number(hipCount || 0),
      roofValleyCount:
        Number(projection.roofValleyCount || 0) || Number(valleyCount || 0),
      roofSupportMode: projection.roofSupportMode || "unknown",
      featureFamilyCount: featureFamilies.length,
      projectionCount: projectionsAndRecesses.projections.length,
      recessCount: projectionsAndRecesses.recesses.length,
      evidenceSources: summarizeEvidenceSources(
        features,
        wallZones,
        materialZones,
      ),
      schemaCredibilityScore: credibility.score,
      schemaCredibilityQuality: credibility.quality,
    },
  };
}

export default {
  buildSideFacadeSchema,
};
