import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  bucketByEvidence,
  clipFoundationToSection,
  clipOpeningToSection,
  clipRoofElementToSection,
  clipRoomToSection,
  clipSlabToSection,
  clipStairToSection,
  clipWallToSection,
  collectSupportSummary,
  countExactClips,
} from "./sectionClipperService.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

export function sectionAxis(sectionType = "longitudinal") {
  return String(sectionType || "longitudinal").toLowerCase() === "transverse"
    ? "y"
    : "x";
}

function getBuildableBounds(geometry = {}) {
  return (
    geometry.site?.buildable_bbox ||
    geometry.site?.boundary_bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 12,
      max_y: 10,
      width: 12,
      height: 10,
    }
  );
}

export function resolveSectionCutCoordinate(
  geometry = {},
  sectionProfile = {},
  sectionType = "longitudinal",
) {
  const bounds = getBuildableBounds(geometry);
  const axis = sectionAxis(sectionType);
  const point =
    axis === "x"
      ? (sectionProfile?.cutLine?.from?.x ?? sectionProfile?.cutLine?.to?.x)
      : (sectionProfile?.cutLine?.from?.y ?? sectionProfile?.cutLine?.to?.y);

  if (Number.isFinite(Number(point))) {
    return Number(point);
  }

  return axis === "x"
    ? Number(bounds.min_x || 0) + Number(bounds.width || 12) / 2
    : Number(bounds.min_y || 0) + Number(bounds.height || 10) / 2;
}

function buildDerivedSlabIntersections(geometry = {}, sectionCut = {}) {
  const bounds = getBuildableBounds(geometry);
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const withinEnvelope =
    axis === "x"
      ? coordinate >= Number(bounds.min_x || 0) &&
        coordinate <=
          Number(
            bounds.max_x ||
              Number(bounds.min_x || 0) + Number(bounds.width || 12),
          )
      : coordinate >= Number(bounds.min_y || 0) &&
        coordinate <=
          Number(
            bounds.max_y ||
              Number(bounds.min_y || 0) + Number(bounds.height || 10),
          );

  if (!(geometry.levels || []).length) {
    return [];
  }

  return (geometry.levels || []).map((level, index) => ({
    id: `derived-slab:${level.id || index}`,
    levelId: level.id || null,
    levelName: level.name || `L${level.level_number || index}`,
    evidenceType: withinEnvelope ? "near" : "inferred",
    exactClip: false,
    clipPrimitive: "derived_level_profile",
    clipGeometry: {
      type: "derived_level_profile",
      cutCoordinate: round(coordinate),
      sectionRange: null,
      projectionRange: null,
    },
    geometrySupport: ["derived_level_profile"],
  }));
}

function buildRoofIntersections(geometry = {}, sectionCut = {}, options = {}) {
  const roofEntities = geometry.roof_primitives?.length
    ? geometry.roof_primitives
    : geometry.roofElements?.length
      ? geometry.roofElements
      : geometry.roof?.polygon || geometry.roof?.bbox
        ? [{ ...geometry.roof, id: geometry.roof.id || "roof:main" }]
        : [];

  if (roofEntities.length) {
    return roofEntities.map((entry) =>
      clipRoofElementToSection(entry, sectionCut, options),
    );
  }

  const bounds = getBuildableBounds(geometry);
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const withinEnvelope =
    axis === "x"
      ? coordinate >= Number(bounds.min_x || 0) &&
        coordinate <=
          Number(
            bounds.max_x ||
              Number(bounds.min_x || 0) + Number(bounds.width || 12),
          )
      : coordinate >= Number(bounds.min_y || 0) &&
        coordinate <=
          Number(
            bounds.max_y ||
              Number(bounds.min_y || 0) + Number(bounds.height || 10),
          );

  if (!geometry.roof?.type) {
    return [];
  }

  return [
    {
      id: `roof:${geometry.roof.type}`,
      primitive_family: "derived_roof_profile",
      type: geometry.roof.type,
      evidenceType: withinEnvelope ? "near" : "inferred",
      exactClip: false,
      clipPrimitive: "derived_roof_profile",
      clipGeometry: {
        type: "derived_roof_profile",
        cutCoordinate: round(coordinate),
        sectionRange: null,
        projectionRange: null,
      },
      geometrySupport: ["derived_roof_profile"],
    },
  ];
}

function buildFoundationIntersections(
  geometry = {},
  sectionCut = {},
  options = {},
) {
  const foundationEntities = geometry.foundations || [];
  return foundationEntities.map((entry) =>
    clipFoundationToSection(entry, sectionCut, {
      ...options,
      nearBand: Number(options.nearBand || 1),
    }),
  );
}

function buildBaseConditionIntersections(
  geometry = {},
  sectionCut = {},
  options = {},
) {
  const baseConditions = geometry.base_conditions || [];
  return baseConditions.map((entry) =>
    clipFoundationToSection(entry, sectionCut, {
      ...options,
      nearBand: Number(options.nearBand || 1.2),
    }),
  );
}

function collectUnsupportedCounts(intersections = {}) {
  return Object.fromEntries(
    Object.entries(intersections).map(([key, grouped]) => [
      key,
      (grouped?.unsupported || []).length,
    ]),
  );
}

function collectClipSummary(intersections = {}) {
  const exactClipCounts = Object.fromEntries(
    Object.entries(intersections).map(([key, grouped]) => [
      key,
      countExactClips(grouped),
    ]),
  );
  const approximateCounts = Object.fromEntries(
    Object.entries(intersections).map(([key, grouped]) => [
      key,
      [
        ...(grouped.near || []),
        ...(grouped.inferred || []),
        ...(grouped.unsupported || []),
      ].filter((entry) =>
        (entry.geometrySupport || []).some((support) =>
          [
            "bbox",
            "derived_level_profile",
            "derived_roof_profile",
            "missing_geometry",
          ].includes(String(support)),
        ),
      ).length,
    ]),
  );

  return {
    exactClipCounts,
    approximateCounts,
    directClipCount: Object.values(exactClipCounts).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    ),
    approximateEvidenceCount: Object.values(approximateCounts).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    ),
  };
}

export function buildSectionIntersections(
  projectGeometry = {},
  sectionProfile = {},
  options = {},
) {
  const sectionType = String(
    sectionProfile.sectionType || "longitudinal",
  ).toLowerCase();
  const axis = sectionAxis(sectionType);
  const coordinate = resolveSectionCutCoordinate(
    projectGeometry,
    sectionProfile,
    sectionType,
  );
  const clippingEnabled = isFeatureEnabled("useTrueSectionClippingPhase13");
  const sectionCut = {
    sectionType,
    axis,
    coordinate,
  };
  const clipOptions = {
    directBand: Number(options.directBand || (clippingEnabled ? 0.14 : 0.16)),
    nearBand: Number(options.nearBand || 0.9),
  };

  const wallEntries = (projectGeometry.walls || []).map((entry) =>
    clipWallToSection(entry, sectionCut, clipOptions),
  );
  const wallMap = new Map(wallEntries.map((entry) => [entry.id, entry]));
  const slabEntries = (projectGeometry.slabs || []).length
    ? (projectGeometry.slabs || []).map((entry) =>
        clipSlabToSection(entry, sectionCut, clipOptions),
      )
    : buildDerivedSlabIntersections(projectGeometry, sectionCut);

  const intersections = {
    rooms: bucketByEvidence(
      (projectGeometry.rooms || []).map((entry) =>
        clipRoomToSection(entry, sectionCut, clipOptions),
      ),
    ),
    stairs: bucketByEvidence(
      (projectGeometry.stairs || []).map((entry) =>
        clipStairToSection(entry, sectionCut, clipOptions),
      ),
    ),
    walls: bucketByEvidence(wallEntries),
    windows: bucketByEvidence(
      (projectGeometry.windows || []).map((entry) =>
        clipOpeningToSection(
          entry,
          wallMap.get(entry.wall_id) || null,
          sectionCut,
          clipOptions,
        ),
      ),
    ),
    doors: bucketByEvidence(
      (projectGeometry.doors || []).map((entry) =>
        clipOpeningToSection(
          entry,
          wallMap.get(entry.wall_id) || null,
          sectionCut,
          clipOptions,
        ),
      ),
    ),
    entrances: bucketByEvidence(
      (projectGeometry.entrances || []).map((entry) =>
        clipOpeningToSection(entry, null, sectionCut, clipOptions),
      ),
    ),
    slabs: bucketByEvidence(slabEntries),
    roofElements: bucketByEvidence(
      buildRoofIntersections(projectGeometry, sectionCut, clipOptions),
    ),
    foundations: bucketByEvidence(
      buildFoundationIntersections(projectGeometry, sectionCut, clipOptions),
    ),
    baseConditions: bucketByEvidence(
      buildBaseConditionIntersections(projectGeometry, sectionCut, clipOptions),
    ),
  };

  const clipSummary = collectClipSummary(intersections);
  const explicitRoofPrimitiveCount = Number(
    projectGeometry.roof_primitives?.length || 0,
  );
  const explicitFoundationCount = Number(
    projectGeometry.foundations?.length || 0,
  );
  const explicitBaseConditionCount = Number(
    projectGeometry.base_conditions?.length || 0,
  );
  const phase15Enabled =
    explicitRoofPrimitiveCount > 0 ||
    explicitFoundationCount > 0 ||
    explicitBaseConditionCount > 0;

  return {
    version: phase15Enabled
      ? "phase15-section-geometry-intersection-v1"
      : clippingEnabled
        ? "phase13-section-geometry-intersection-v1"
        : "phase12-section-geometry-intersection-v1",
    sectionType,
    cutAxis: axis,
    cutCoordinate: round(coordinate),
    directBandM: clipOptions.directBand,
    nearBandM: clipOptions.nearBand,
    clippingEnabled,
    intersections,
    unsupportedCounts: collectUnsupportedCounts(intersections),
    clipSummary,
    geometrySupport: {
      rooms: collectSupportSummary(intersections.rooms),
      stairs: collectSupportSummary(intersections.stairs),
      walls: collectSupportSummary(intersections.walls),
      windows: collectSupportSummary(intersections.windows),
      doors: collectSupportSummary(intersections.doors),
      entrances: collectSupportSummary(intersections.entrances),
      slabs: collectSupportSummary(intersections.slabs),
      roofElements: collectSupportSummary(intersections.roofElements),
      foundations: collectSupportSummary(intersections.foundations),
      baseConditions: collectSupportSummary(intersections.baseConditions),
      all: unique(
        Object.values(intersections).flatMap((grouped) =>
          collectSupportSummary(grouped),
        ),
      ),
    },
    explicitRoofPrimitiveCount,
    explicitFoundationCount,
    explicitBaseConditionCount,
  };
}

export default {
  buildSectionIntersections,
  resolveSectionCutCoordinate,
  sectionAxis,
};
