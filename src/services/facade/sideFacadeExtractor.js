import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { normalizeFacadeFeatures } from "./facadeFeatureNormalizer.js";
import { assembleFacadeSideSemantics } from "./facadeSemanticAssembler.js";
import { buildSideFacadeSchema } from "./facadeSchemaBuilder.js";
import {
  normalizeFacadeOrientation,
  orientationToSide,
  projectFacadeGeometry,
  resolveEntitySide,
} from "./facadeProjectionService.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function findFacadeOrientation(
  geometry = {},
  facadeGrammar = null,
  side = "south",
) {
  const grammar =
    facadeGrammar ||
    geometry.metadata?.facade_grammar ||
    geometry.metadata?.facadeGrammar ||
    {};
  const orientationEntries = Array.isArray(grammar?.orientations)
    ? grammar.orientations
    : grammar?.orientations && typeof grammar.orientations === "object"
      ? Object.values(grammar.orientations)
      : [];
  const matches = orientationEntries.filter(
    (entry) =>
      normalizeFacadeOrientation(entry?.side || entry?.orientation) === side,
  );
  if (!matches.length) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }

  const mergedComponents = matches.reduce((components, entry) => {
    Object.entries(entry?.components || {}).forEach(([family, values]) => {
      const existing = components[family] || [];
      const normalizedValues = Array.isArray(values)
        ? values
        : values && typeof values === "object"
          ? [values]
          : [];
      components[family] = [...existing, ...normalizedValues];
    });
    return components;
  }, {});

  return matches.reduce(
    (merged, entry) => ({
      ...merged,
      ...entry,
      side: merged.side || entry.side || null,
      orientation: merged.orientation || entry.orientation || null,
      orientationAliases: [
        ...(merged.orientationAliases || []),
        ...(entry.orientation || entry.side
          ? [entry.orientation || entry.side]
          : []),
      ],
      features: [...(merged.features || []), ...(entry.features || [])],
      material_zones: [
        ...(merged.material_zones || []),
        ...(entry.material_zones || []),
      ],
      components: mergedComponents,
    }),
    {
      side,
      orientation: null,
      orientationAliases: [],
      features: [],
      material_zones: [],
      components: {},
    },
  );
}

function collectGrammarComponentFeatures(
  facadeOrientation = {},
  side = "south",
) {
  const components = facadeOrientation?.components || {};
  const featureSeeds = [];
  const keywordMap = {
    balconies: "balcony",
    balcony: "balcony",
    dormers: "dormer",
    dormer: "dormer",
    chimneys: "chimney",
    chimney: "chimney",
    porches: "porch",
    porch: "porch",
    canopies: "porch",
    canopy: "porch",
    parapets: "parapet",
    parapet: "parapet",
    feature_frames: "feature-frame",
    featureFrame: "feature-frame",
    frames: "feature-frame",
    sills: "sill",
    sill: "sill",
    lintels: "lintel",
    lintel: "lintel",
    projections: "projection",
    projection: "projection",
    recesses: "recess",
    recess: "recess",
  };

  Object.entries(components).forEach(([family, entries]) => {
    const normalizedFamily = String(family || "")
      .trim()
      .toLowerCase();
    const featureType = keywordMap[family] || keywordMap[normalizedFamily];
    if (!featureType) {
      return;
    }

    const values = Array.isArray(entries)
      ? entries
      : entries && typeof entries === "object"
        ? [entries]
        : [];
    values.forEach((entry) => {
      featureSeeds.push({
        ...(typeof entry === "object" && entry ? entry : {}),
        type:
          (typeof entry === "object" && entry?.type) ||
          (typeof entry === "object" && entry?.name) ||
          featureType,
        componentFamily: family,
        side,
      });
    });
  });

  return featureSeeds;
}

function collectFeatureSeeds(
  geometry = {},
  facadeOrientation = {},
  side = "south",
) {
  const collectSideMetadataEntries = (featureCollection = null) => {
    if (Array.isArray(featureCollection)) {
      return featureCollection.filter(
        (entry) =>
          orientationToSide(entry?.side || entry?.orientation) === side,
      );
    }

    if (!featureCollection || typeof featureCollection !== "object") {
      return [];
    }

    return Object.entries(featureCollection)
      .filter(([entrySide]) => orientationToSide(entrySide) === side)
      .flatMap(([, entries]) =>
        Array.isArray(entries)
          ? entries
          : entries && typeof entries === "object"
            ? [entries]
            : [],
      );
  };

  const sideWallFeatures = (geometry.walls || [])
    .filter((wall) => wall.exterior && resolveEntitySide(wall) === side)
    .flatMap((wall) =>
      normalizeFacadeFeatures(wall.metadata?.features || [], {
        side,
        levelId: wall.level_id,
        source: "wall_metadata",
      }),
    );

  const geometryFeatureMap = [
    ...collectSideMetadataEntries(geometry.metadata?.facade_features),
    ...collectSideMetadataEntries(geometry.metadata?.facadeFeatures),
  ];
  const geometryFeatures = normalizeFacadeFeatures(geometryFeatureMap, {
    side,
    source: "geometry_metadata",
  });

  const grammarFeatures = normalizeFacadeFeatures(
    [
      ...(facadeOrientation?.features || []),
      ...collectGrammarComponentFeatures(facadeOrientation, side),
      ...(facadeOrientation &&
      String(facadeOrientation?.parapet_mode || "").toLowerCase() !== "none" &&
      String(facadeOrientation?.parapet_mode || "").trim()
        ? [{ type: "parapet" }]
        : []),
    ],
    {
      side,
      source: "facade_grammar",
    },
  );

  return [...sideWallFeatures, ...geometryFeatures, ...grammarFeatures];
}

function collectOrientationAliases(
  side = "south",
  facadeOrientation = {},
  projection = {},
) {
  return [
    side,
    side.toUpperCase(),
    side.slice(0, 1).toUpperCase(),
    `${side}_elevation`,
    `${side.toUpperCase()}_ELEVATION`,
    facadeOrientation?.orientation || null,
    facadeOrientation?.side || null,
    ...(facadeOrientation?.orientationAliases || []),
    projection?.side || null,
  ]
    .filter(Boolean)
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index);
}

function normalizeRoofLanguage(
  styleDNA = {},
  facadeOrientation = {},
  geometry = {},
) {
  return String(
    facadeOrientation?.roofline_language ||
      styleDNA?.roof_language ||
      geometry?.roof?.type ||
      "pitched gable",
  ).toLowerCase();
}

export function extractSideFacade(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const side = orientationToSide(
    options.orientation || options.side || "south",
  );
  const facadeOrientation = findFacadeOrientation(
    geometry,
    options.facadeGrammar,
    side,
  );
  const projection = projectFacadeGeometry(geometry, side);
  const totalHeightM = projection.levelProfiles.reduce(
    (sum, level) => sum + Number(level.height_m || 3.2),
    0,
  );
  const features = collectFeatureSeeds(geometry, facadeOrientation || {}, side);
  const facadeSemantics = isFeatureEnabled("useSideFacadeSemanticsPhase10")
    ? assembleFacadeSideSemantics({
        side,
        projection,
        facadeOrientation: facadeOrientation || {},
        roofLanguage: normalizeRoofLanguage(
          styleDNA,
          facadeOrientation || {},
          geometry,
        ),
        features,
      })
    : null;
  const useSideFacadeSchema =
    isFeatureEnabled("useSideFacadeSchemaPhase12") ||
    isFeatureEnabled("useSideFacadeSchemaPhase11");
  const sideFacadeSchema = useSideFacadeSchema
    ? buildSideFacadeSchema({
        side,
        projection,
        facadeOrientation: facadeOrientation || {},
        facadeSemantics,
        features,
        roofLanguage: normalizeRoofLanguage(
          styleDNA,
          facadeOrientation || {},
          geometry,
        ),
      })
    : null;
  const explicitGeometrySignal = projection.sideWalls.length > 0 ? 0.34 : 0.12;
  const openingSignal = projection.openingCount > 0 ? 0.24 : 0;
  const rhythmSignal = facadeOrientation?.components?.bays?.length
    ? Math.min(0.14, facadeOrientation.components.bays.length * 0.04)
    : 0;
  const materialSignal = facadeOrientation?.material_zones?.length
    ? Math.min(0.14, facadeOrientation.material_zones.length * 0.05)
    : 0;
  const featureSignal = features.length
    ? Math.min(0.18, features.length * 0.05)
    : 0;
  const semanticSignal = facadeSemantics
    ? Math.min(
        0.2,
        Number(facadeSemantics.summary?.semanticConfidence || 0) * 0.12 +
          (Number(facadeSemantics.summary?.openingGroupCount || 0) > 0
            ? 0.03
            : 0) +
          (Number(facadeSemantics.summary?.wallZoneCount || 0) > 1 ? 0.03 : 0) +
          (Number(facadeSemantics.summary?.featureFamilyCount || 0) > 0
            ? 0.02
            : 0) +
          (Number(facadeSemantics.summary?.roofEdgeCount || 0) > 0 ? 0.02 : 0),
      )
    : 0;
  const schemaSignal = sideFacadeSchema
    ? Math.min(
        0.18,
        Number(sideFacadeSchema.evidenceSummary?.schemaCredibilityScore || 0) *
          0.16,
      )
    : 0;
  const coverageSignal =
    projection.explicitCoverageRatio > 0
      ? Math.min(0.16, projection.explicitCoverageRatio * 0.16)
      : 0;
  const richnessScore = round(
    explicitGeometrySignal +
      openingSignal +
      rhythmSignal +
      materialSignal +
      featureSignal +
      semanticSignal +
      schemaSignal +
      coverageSignal,
  );

  const warnings = [];
  const blockingReasons = [];

  if (!projection.levelProfiles.length) {
    blockingReasons.push(
      `Elevation ${side} cannot be rendered because no canonical levels were resolved.`,
    );
  }
  if (projection.geometrySource === "envelope_derived") {
    warnings.push(
      `Elevation ${side} is envelope-derived because no explicit side-wall fragments were resolved.`,
    );
  }
  if (facadeSemantics?.summary?.semanticStatus === "warning") {
    warnings.push(
      `Elevation ${side} side-facade semantics remain weaker than preferred because canonical articulation evidence is thin.`,
    );
  }
  if (
    sideFacadeSchema?.evidenceSummary?.schemaCredibilityQuality === "warning"
  ) {
    warnings.push(
      `Elevation ${side} side-facade schema remains usable but still thinner than preferred for a final technical board.`,
    );
  }
  if (
    projection.geometrySource === "envelope_derived" &&
    projection.openingCount === 0 &&
    !facadeOrientation?.components?.bays?.length &&
    !facadeOrientation?.material_zones?.length &&
    !features.length
  ) {
    blockingReasons.push(
      `Elevation ${side} lacks enough canonical facade data because explicit side geometry and facade articulation are missing, so the panel would be too sparse to present credibly.`,
    );
  }
  if (
    (facadeSemantics?.summary?.semanticStatus === "block" ||
      sideFacadeSchema?.evidenceSummary?.schemaCredibilityQuality ===
        "block") &&
    richnessScore < 0.64 &&
    projection.openingCount === 0
  ) {
    blockingReasons.push(
      `Elevation ${side} side-facade semantics are too weak to support a credible technical elevation without richer canonical facade evidence.`,
    );
  }

  return {
    version: sideFacadeSchema
      ? "phase12-side-facade-extractor-v1"
      : facadeSemantics
        ? "phase10-side-facade-extractor-v1"
        : "phase9-side-facade-extractor-v1",
    side,
    orientationAliases: collectOrientationAliases(
      side,
      facadeOrientation || {},
      projection,
    ),
    metrics: {
      width_m: projection.sideWidthM,
      total_height_m: totalHeightM || 3.2,
      level_count: Math.max(1, projection.levelProfiles.length),
    },
    geometrySource: projection.geometrySource,
    explicitCoverageRatio: projection.explicitCoverageRatio,
    levelProfiles: projection.levelProfiles,
    facadeOrientation,
    roofLanguage: normalizeRoofLanguage(
      styleDNA,
      facadeOrientation || {},
      geometry,
    ),
    materialZones: facadeOrientation?.material_zones || [],
    rhythmCount: facadeOrientation?.components?.bays?.length || 0,
    projectedOpenings: [
      ...projection.projectedWindows,
      ...projection.projectedDoors,
    ].sort((left, right) => left.center_m - right.center_m),
    projectedWindows: projection.projectedWindows,
    projectedDoors: projection.projectedDoors,
    features,
    openingGroups: facadeSemantics?.openingGroups || [],
    wallZones: facadeSemantics?.wallZones || [],
    roofEdges: facadeSemantics?.roofEdges || [],
    featureFamilies: facadeSemantics?.featureFamilies || [],
    sideSummary: facadeSemantics?.summary || null,
    facadeSemantics,
    sideFacadeSchema,
    sideFacadeEvidence: sideFacadeSchema?.evidenceSummary || null,
    richnessScore,
    warnings,
    blockingReasons,
    status: blockingReasons.length
      ? "block"
      : warnings.length
        ? "warning"
        : "pass",
  };
}

export function extractSideFacadeGeometry(geometryInput = {}, options = {}) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  return projectFacadeGeometry(
    geometry,
    orientationToSide(options.orientation || options.side || "south"),
  );
}

export default {
  extractSideFacade,
  extractSideFacadeGeometry,
};
