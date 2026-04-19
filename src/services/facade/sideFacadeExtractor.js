import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { normalizeFacadeFeatures } from "./facadeFeatureNormalizer.js";
import {
  orientationToSide,
  projectFacadeGeometry,
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
  return (
    grammar?.orientations?.find(
      (entry) => String(entry.side || "").toLowerCase() === side,
    ) || null
  );
}

function collectFeatureSeeds(
  geometry = {},
  facadeOrientation = {},
  side = "south",
) {
  const sideWallFeatures = (geometry.walls || [])
    .filter(
      (wall) =>
        wall.exterior &&
        String(wall.metadata?.side || "").toLowerCase() === side,
    )
    .flatMap((wall) =>
      normalizeFacadeFeatures(wall.metadata?.features || [], {
        side,
        levelId: wall.level_id,
        source: "wall_metadata",
      }),
    );

  const geometryFeatureMap = [
    ...(geometry.metadata?.facade_features?.[side] || []),
    ...(geometry.metadata?.facadeFeatures?.[side] || []),
  ];
  const geometryFeatures = normalizeFacadeFeatures(geometryFeatureMap, {
    side,
    source: "geometry_metadata",
  });

  const grammarFeatures = normalizeFacadeFeatures(
    [
      ...(facadeOrientation?.components?.balconies || []).map((entry) => ({
        ...entry,
        type: "balcony",
      })),
      ...(facadeOrientation?.components?.feature_frames || []).map((entry) => ({
        ...entry,
        type: "feature-frame",
      })),
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

  return {
    version: "phase9-side-facade-extractor-v1",
    side,
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

export default {
  extractSideFacade,
};
