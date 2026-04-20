import {
  orientationToSide,
  projectFacadeGeometry,
} from "./facadeProjectionService.js";
import { normalizeFacadeFeatures } from "./facadeFeatureNormalizer.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function uniqueStrings(values = []) {
  return [
    ...new Set((values || []).filter(Boolean).map((value) => String(value))),
  ];
}

function toOpeningGroups(openings = []) {
  const groups = new Map();
  [...(openings || [])]
    .sort(
      (left, right) => Number(left.center_m || 0) - Number(right.center_m || 0),
    )
    .forEach((opening) => {
      const key = [
        opening.levelId || "unknown-level",
        opening.kind || "opening",
      ].join(":");
      if (!groups.has(key)) {
        groups.set(key, {
          id: `opening-group:${key}`,
          levelId: opening.levelId || null,
          kind: opening.kind || "opening",
          openingIds: [],
          count: 0,
          averageWidthM: 0,
          spanStartM: null,
          spanEndM: null,
        });
      }
      const group = groups.get(key);
      const width = Number(opening.width_m || 0);
      const start = Number(opening.center_m || 0) - width / 2;
      const end = Number(opening.center_m || 0) + width / 2;
      group.openingIds.push(opening.id || `${key}:${group.count}`);
      group.count += 1;
      group.averageWidthM += width;
      group.spanStartM =
        group.spanStartM === null ? start : Math.min(group.spanStartM, start);
      group.spanEndM =
        group.spanEndM === null ? end : Math.max(group.spanEndM, end);
    });

  return [...groups.values()].map((group) => ({
    ...group,
    averageWidthM: round(
      group.count > 0 ? group.averageWidthM / group.count : 0,
    ),
    spanStartM: round(group.spanStartM),
    spanEndM: round(group.spanEndM),
  }));
}

function toWallZones(projection = {}, facadeOrientation = {}) {
  const wallZones = (projection.sideWalls || []).map((wall, index) => {
    const start = Number(
      projection.side === "east" || projection.side === "west"
        ? wall.start?.y || 0
        : wall.start?.x || 0,
    );
    const end = Number(
      projection.side === "east" || projection.side === "west"
        ? wall.end?.y || 0
        : wall.end?.x || 0,
    );

    return {
      id: wall.id || `wall-zone:${projection.side}:${index}`,
      kind: "wall-zone",
      wallId: wall.id || null,
      side: projection.side,
      levelId: wall.level_id || wall.levelId || null,
      startM: round(Math.min(start, end)),
      endM: round(Math.max(start, end)),
      explicit: true,
      materialHint:
        wall.metadata?.material ||
        facadeOrientation?.material_zones?.[0]?.material ||
        null,
    };
  });

  const materialZones = (facadeOrientation?.material_zones || []).map(
    (zone, index) => ({
      id: zone.id || `material-zone:${projection.side}:${index}`,
      kind: "material-zone",
      side: projection.side,
      startM: round(Number(zone.start_m ?? zone.start ?? zone.offset_m ?? 0)),
      endM: round(
        Number(
          zone.end_m ??
            zone.end ??
            zone.span_end_m ??
            projection.sideWidthM ??
            0,
        ),
      ),
      explicit: false,
      materialHint: zone.material || zone.name || null,
    }),
  );

  if (wallZones.length || materialZones.length) {
    return [...wallZones, ...materialZones];
  }

  return [
    {
      id: `envelope-zone:${projection.side}`,
      kind: "envelope-zone",
      side: projection.side,
      startM: 0,
      endM: round(projection.sideWidthM || 0),
      explicit: false,
      materialHint: null,
    },
  ];
}

function toRoofEdges(
  side = "south",
  roofLanguage = "",
  facadeOrientation = {},
) {
  const roof = String(roofLanguage || "").toLowerCase();
  const parapetMode = String(
    facadeOrientation?.parapet_mode || "",
  ).toLowerCase();
  const flat = roof.includes("flat") || parapetMode === "full";
  const pitched =
    roof.includes("pitch") || roof.includes("gable") || roof.includes("hip");

  return [
    {
      id: `roof-edge:${side}`,
      side,
      kind: flat
        ? "parapet-transition"
        : pitched
          ? "ridge-eave-transition"
          : "roof-edge",
      roofLanguage: roof || "unknown",
      parapetMode: parapetMode || "none",
    },
  ];
}

export function deriveFacadeFeatureGroups(features = []) {
  const grouped = new Map();
  const normalizedFeatures = normalizeFacadeFeatures(features);
  normalizedFeatures.forEach((feature) => {
    const key = feature.family || feature.type || "feature";
    if (!grouped.has(key)) {
      grouped.set(key, {
        family: key,
        count: 0,
        types: new Set(),
        sides: new Set(),
        levelIds: new Set(),
        sources: new Set(),
      });
    }
    const group = grouped.get(key);
    group.count += 1;
    group.types.add(feature.type || "feature");
    if (feature.side) group.sides.add(feature.side);
    if (feature.levelId) group.levelIds.add(feature.levelId);
    if (feature.source) group.sources.add(feature.source);
  });

  return [...grouped.values()].map((group) => ({
    family: group.family,
    count: group.count,
    types: [...group.types].sort(),
    sides: [...group.sides].sort(),
    levelIds: [...group.levelIds].sort(),
    sources: [...group.sources].sort(),
    componentFamilies: uniqueStrings(
      normalizedFeatures
        .filter(
          (feature) =>
            (feature.family || feature.type || "feature") === group.family,
        )
        .map((feature) => feature.componentFamily),
    ),
    semanticWeight: round(
      normalizedFeatures
        .filter(
          (feature) =>
            (feature.family || feature.type || "feature") === group.family,
        )
        .reduce(
          (sum, feature) => sum + Number(feature.semanticWeight || 1),
          0,
        ) / Math.max(group.count, 1),
    ),
  }));
}

export function buildFacadeSideSummary({
  side = "south",
  projection = {},
  openingGroups = [],
  wallZones = [],
  roofEdges = [],
  featureFamilies = [],
} = {}) {
  const explicitWallZoneCount = (wallZones || []).filter(
    (zone) => zone.explicit === true,
  ).length;
  const totalOpenings = (openingGroups || []).reduce(
    (sum, group) => sum + Number(group.count || 0),
    0,
  );
  const dominantMaterials = uniqueStrings(
    wallZones.map((zone) => zone.materialHint).filter(Boolean),
  ).slice(0, 3);
  const sideWidthM = Math.max(Number(projection.sideWidthM || 0), 1);
  const openingDensity = totalOpenings / sideWidthM;
  const openingRhythmStrength = clamp(
    openingGroups.length > 0
      ? openingDensity * 0.45 + openingGroups.length * 0.12
      : 0,
    0,
    1,
  );
  const materialArticulationScore = clamp(
    dominantMaterials.length * 0.24 +
      explicitWallZoneCount * 0.08 +
      wallZones.filter((zone) => zone.kind === "material-zone").length * 0.1,
    0,
    1,
  );
  const featureRichnessScore = clamp(
    featureFamilies.reduce(
      (sum, family) =>
        sum +
        Number(family.count || 0) * Number(family.semanticWeight || 1) * 0.08,
      0,
    ),
    0,
    1,
  );
  const roofCommunicationScore = clamp(
    roofEdges.length
      ? 0.52 +
          (roofEdges.some((edge) => edge.kind === "ridge-eave-transition")
            ? 0.24
            : 0.12) +
          (roofEdges.some((edge) => edge.kind === "parapet-transition")
            ? 0.08
            : 0)
      : 0,
    0,
    1,
  );
  const semanticConfidence = clamp(
    Number(projection.explicitCoverageRatio || 0) * 0.35 +
      openingRhythmStrength * 0.2 +
      materialArticulationScore * 0.18 +
      featureRichnessScore * 0.15 +
      roofCommunicationScore * 0.12,
    0,
    1,
  );
  const semanticStatus =
    semanticConfidence >= 0.72
      ? "pass"
      : semanticConfidence >= 0.52
        ? "warning"
        : "block";

  return {
    side,
    geometrySource: projection.geometrySource || "unknown",
    explicitCoverageRatio: round(projection.explicitCoverageRatio),
    openingCoverageRatio: round(projection.openingCoverageRatio),
    openingGroupCount: openingGroups.length,
    openingCount: totalOpenings,
    wallZoneCount: wallZones.length,
    explicitWallZoneCount,
    roofEdgeCount: roofEdges.length,
    featureFamilyCount: featureFamilies.length,
    dominantFeatureFamilies: featureFamilies
      .slice()
      .sort((left, right) => Number(right.count || 0) - Number(left.count || 0))
      .slice(0, 3)
      .map((entry) => entry.family),
    dominantMaterials,
    openingDensity: round(openingDensity),
    openingRhythmStrength: round(openingRhythmStrength),
    materialArticulationScore: round(materialArticulationScore),
    featureRichnessScore: round(featureRichnessScore),
    roofCommunicationScore: round(roofCommunicationScore),
    semanticConfidence: round(semanticConfidence),
    semanticStatus,
  };
}

export function assembleFacadeSideSemantics({
  side = "south",
  projection = {},
  facadeOrientation = {},
  roofLanguage = "",
  features = [],
} = {}) {
  const openingGroups = toOpeningGroups(
    projection.projectedOpenings || [
      ...(projection.projectedWindows || []),
      ...(projection.projectedDoors || []),
    ],
  );
  const wallZones = toWallZones(projection, facadeOrientation);
  const roofEdges =
    projection.roofEdgeSeeds?.length > 0
      ? projection.roofEdgeSeeds.map((entry) => ({
          ...entry,
          kind: entry.kind || entry.primitiveFamily || "roof-edge",
        }))
      : toRoofEdges(side, roofLanguage, facadeOrientation);
  const featureFamilies = deriveFacadeFeatureGroups(features);
  const summary = buildFacadeSideSummary({
    side,
    projection,
    openingGroups,
    wallZones,
    roofEdges,
    featureFamilies,
  });

  return {
    version:
      projection.roofEdgeSeeds?.length > 1
        ? "phase16-facade-side-semantics-v1"
        : "phase10-facade-side-semantics-v1",
    side,
    openingGroups,
    wallZones,
    roofEdges,
    featureFamilies,
    summary,
  };
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
      (entry) => orientationToSide(entry.side || entry.orientation) === side,
    ) || null
  );
}

export function assembleSideFacadeSemantics(
  projectGeometry = {},
  styleDNA = {},
  options = {},
) {
  const sides = ["north", "east", "south", "west"];
  const selectedSides = options.side
    ? [orientationToSide(options.side)]
    : options.sides?.length
      ? options.sides.map((side) => orientationToSide(side))
      : sides;

  const semantics = Object.fromEntries(
    selectedSides.map((side) => {
      const projection =
        options.projection && options.side === side
          ? options.projection
          : projectFacadeGeometry(projectGeometry, side);
      const facadeOrientation =
        options.facadeOrientation && options.side === side
          ? options.facadeOrientation
          : findFacadeOrientation(projectGeometry, options.facadeGrammar, side);
      const features =
        options.features && options.side === side
          ? options.features
          : normalizeFacadeFeatures(
              [
                ...(projectGeometry.metadata?.facade_features?.[side] || []),
                ...(projectGeometry.metadata?.facadeFeatures?.[side] || []),
              ],
              { side },
            );
      return [
        side,
        assembleFacadeSideSemantics({
          side,
          projection,
          facadeOrientation,
          roofLanguage:
            facadeOrientation?.roofline_language ||
            styleDNA?.roof_language ||
            projectGeometry?.roof?.type ||
            "pitched gable",
          features,
        }),
      ];
    }),
  );

  return {
    version: "phase10-facade-semantics-ssot-v1",
    sides: semantics,
  };
}

export default {
  assembleFacadeSideSemantics,
  assembleSideFacadeSemantics,
  buildFacadeSideSummary,
  deriveFacadeFeatureGroups,
};
