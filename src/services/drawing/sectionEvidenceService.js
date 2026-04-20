import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  buildSectionIntersections,
  resolveSectionCutCoordinate,
  sectionAxis,
} from "./sectionGeometryIntersectionService.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
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

function getLevelProfiles(geometry = {}) {
  let offset = 0;
  return (geometry.levels || [])
    .slice()
    .sort(
      (left, right) =>
        Number(left.level_number || 0) - Number(right.level_number || 0),
    )
    .map((level) => {
      const height = Number(level.height_m || 3.2);
      const profile = {
        ...level,
        bottom_m: offset,
        top_m: offset + height,
      };
      offset += height;
      return profile;
    });
}

function summarizeFocusHits(
  sectionProfile = {},
  directRooms = [],
  directStairs = [],
  directEntrances = [],
) {
  const ids = new Set([
    ...directRooms.map((room) => `entity:room:${room.id}`),
    ...directStairs.map((stair) => `entity:stair:${stair.id}`),
    ...directEntrances.map((entry) => `entity:entrance:${entry.id || "main"}`),
  ]);
  return (sectionProfile.focusEntityIds || []).filter((entry) =>
    ids.has(String(entry)),
  );
}

function flattenIntersections(grouped = {}) {
  return [
    ...(grouped.direct || []),
    ...(grouped.near || []),
    ...(grouped.inferred || []),
  ];
}

function countEvidence(grouped = {}, evidenceType = "direct") {
  return (grouped[evidenceType] || []).length;
}

function roomArea(room = {}) {
  return Number(room.actual_area || room.target_area_m2 || 0);
}

function classifyEvidenceQuality({
  usefulnessScore = 0,
  directEvidenceCount = 0,
  nearEvidenceCount = 0,
  cutRoomCount = 0,
  cutStairCount = 0,
  directSlabCount = 0,
} = {}) {
  if (usefulnessScore >= 0.8 && directEvidenceCount >= 4) {
    return "pass";
  }
  if (
    usefulnessScore >= 0.72 &&
    directEvidenceCount >= 5 &&
    cutRoomCount > 0 &&
    cutStairCount > 0 &&
    directSlabCount > 0
  ) {
    return "pass";
  }
  if (
    usefulnessScore >= 0.58 &&
    directEvidenceCount >= 1 &&
    nearEvidenceCount >= 1
  ) {
    return "warning";
  }
  if (usefulnessScore >= 0.64 && directEvidenceCount >= 2) {
    return "warning";
  }
  return "block";
}

function deriveEvidenceRationale(summary = {}, sectionProfile = {}) {
  const rationale = [];

  if (summary.cutRoomCount > 0) {
    rationale.push(
      `Cut directly intersects ${summary.cutRoomCount} room volume(s) with ${summary.totalCutRoomAreaM2.toFixed(1)}m2 of program evidence.`,
    );
  } else if (summary.nearRoomCount > 0) {
    rationale.push(
      `Section is only context-adjacent to ${summary.nearRoomCount} room volume(s); room evidence is not directly cut.`,
    );
  } else {
    rationale.push("Cut does not intersect a named room volume directly.");
  }

  if (summary.cutStairCount > 0) {
    rationale.push(
      `Cut directly intersects ${summary.cutStairCount} stair/core element(s), strengthening vertical communication.`,
    );
  } else if (summary.nearStairCount > 0) {
    rationale.push(
      `Stair/core evidence is near-cut only (${summary.nearStairCount} element(s)); circulation remains contextual.`,
    );
  } else {
    rationale.push("No stair/core geometry is cut directly.");
  }

  if (summary.cutOpeningCount > 0) {
    rationale.push(
      `Cut resolves ${summary.cutOpeningCount} direct opening marker(s) against ${summary.cutWallCount} cut wall segment(s).`,
    );
  } else if (summary.nearOpeningCount > 0) {
    rationale.push(
      `Opening relationships are near-cut/contextual (${summary.nearOpeningCount} marker(s)), not direct cut evidence.`,
    );
  } else if (summary.inferredOpeningCount > 0) {
    rationale.push(
      `Opening relationships are only inferred from ${summary.inferredOpeningCount} opening marker(s).`,
    );
  } else {
    rationale.push("Wall-opening relationships are absent or inferred only.");
  }

  if (summary.directSlabCount > 0) {
    rationale.push(
      `Section includes ${summary.directSlabCount} direct slab/floor datum reference(s).`,
    );
  }

  if (summary.focusHitCount > 0) {
    rationale.push(
      `Cut hits ${summary.focusHitCount} focused semantic anchor(s) from the selected section strategy.`,
    );
  }

  if (summary.levelCount > 1) {
    rationale.push(
      "Multiple levels are available, so datums and floor-to-floor communication are explicit.",
    );
  }

  if (summary.roofCommunicated) {
    rationale.push(
      "Roof profile logic is present and can be communicated in the section.",
    );
  }

  if (summary.geometrySupportLimited) {
    rationale.push(
      "Some section evidence still relies on bbox/derived geometry because canonical primitives are incomplete.",
    );
  }

  if (summary.evidenceQuality === "block") {
    rationale.push(
      "Direct cut evidence is too weak for a credible final technical section without regeneration or a different cut strategy.",
    );
  } else if (summary.evidenceQuality === "warning") {
    rationale.push(
      "Section evidence is usable, but still thinner than preferred for a final presentation board.",
    );
  } else {
    rationale.push(
      "Section evidence is strong enough to communicate the cut as a credible technical panel.",
    );
  }

  if (sectionProfile?.strategyName) {
    rationale.push(
      `${sectionProfile.strategyName} remains the deterministic strategy anchor for this section.`,
    );
  }

  return rationale;
}

export function buildSectionEvidenceSummary(evidence = {}) {
  return (
    evidence.summary || {
      evidenceQuality: "block",
      usefulnessScore: 0,
      cutSpecificity: 0,
      directEvidenceCount: 0,
      nearEvidenceCount: 0,
      inferredEvidenceCount: 0,
      focusHitCount: 0,
      cutRoomCount: 0,
      nearRoomCount: 0,
      cutStairCount: 0,
      nearStairCount: 0,
      cutWallCount: 0,
      cutOpeningCount: 0,
      nearOpeningCount: 0,
      inferredOpeningCount: 0,
      cutDoorCount: 0,
      entranceHitCount: 0,
      directSlabCount: 0,
      levelCount: 0,
      roofCommunicated: false,
      geometryCommunicable: false,
      geometrySupportLimited: true,
      totalCutRoomAreaM2: 0,
    }
  );
}

export function buildSectionEvidence(
  projectGeometry = {},
  sectionProfile = {},
) {
  const sectionType = String(
    sectionProfile.sectionType || "longitudinal",
  ).toLowerCase();
  const axis = sectionAxis(sectionType);
  const cutCoordinate = resolveSectionCutCoordinate(
    projectGeometry,
    sectionProfile,
    sectionType,
  );
  const levelProfiles = getLevelProfiles(projectGeometry);
  const roofLanguage = String(
    sectionProfile.roofLanguage ||
      projectGeometry?.roof?.type ||
      projectGeometry?.metadata?.style_dna?.roof_language ||
      "pitched gable",
  ).toLowerCase();
  const useTrueEvidence = isFeatureEnabled("useTrueSectionEvidencePhase11");
  const intersectionBundle = buildSectionIntersections(
    projectGeometry,
    sectionProfile,
    useTrueEvidence ? { directBand: 0.16, nearBand: 0.9 } : undefined,
  );
  const rooms = intersectionBundle.intersections.rooms || {};
  const stairs = intersectionBundle.intersections.stairs || {};
  const walls = intersectionBundle.intersections.walls || {};
  const windows = intersectionBundle.intersections.windows || {};
  const doors = intersectionBundle.intersections.doors || {};
  const entrances = intersectionBundle.intersections.entrances || {};
  const slabs = intersectionBundle.intersections.slabs || {};
  const roofElements = intersectionBundle.intersections.roofElements || {};

  const directRooms = rooms.direct || [];
  const nearRooms = rooms.near || [];
  const directStairs = stairs.direct || [];
  const nearStairs = stairs.near || [];
  const directWalls = walls.direct || [];
  const directWindows = windows.direct || [];
  const nearWindows = windows.near || [];
  const inferredWindows = windows.inferred || [];
  const directDoors = doors.direct || [];
  const nearDoors = doors.near || [];
  const inferredDoors = doors.inferred || [];
  const directOpenings = [...directWindows, ...directDoors];
  const nearOpenings = [...nearWindows, ...nearDoors];
  const inferredOpenings = [...inferredWindows, ...inferredDoors];
  const directEntrances = entrances.direct || [];
  const nearEntrances = entrances.near || [];
  const directSlabs = slabs.direct || [];
  const nearSlabs = slabs.near || [];
  const directRoof = roofElements.direct || [];
  const nearRoof = roofElements.near || [];
  const focusHits = summarizeFocusHits(
    sectionProfile,
    directRooms,
    directStairs,
    directEntrances,
  );
  const circulationHitCount = Number(projectGeometry.circulation?.length || 0);
  const directEvidenceCount =
    directRooms.length +
    directStairs.length +
    directWalls.length +
    directOpenings.length +
    directEntrances.length +
    directSlabs.length;
  const nearEvidenceCount =
    nearRooms.length +
    nearStairs.length +
    nearOpenings.length +
    nearEntrances.length +
    nearSlabs.length +
    nearRoof.length;
  const inferredEvidenceCount =
    inferredOpenings.length +
    (levelProfiles.length > 0 ? 1 : 0) +
    (roofLanguage ? 1 : 0) +
    (sectionProfile.focusEntityIds || []).length +
    directRoof.length;

  const roomCommunicationScore =
    directRooms.length > 1
      ? 1
      : directRooms.length === 1
        ? 0.78
        : nearRooms.length > 0
          ? 0.46
          : 0.16;
  const verticalCirculationScore = directStairs.length
    ? 1
    : nearStairs.length
      ? 0.58
      : (projectGeometry.stairs || []).length
        ? 0.34
        : 0.12;
  const wallOpeningScore =
    directWalls.length && directOpenings.length
      ? clamp(0.56 + directOpenings.length * 0.08, 0, 1)
      : directWalls.length && nearOpenings.length
        ? 0.48
        : directWalls.length
          ? 0.32
          : 0.1;
  const slabDatumScore = directSlabs.length
    ? 0.86
    : nearSlabs.length
      ? 0.62
      : levelProfiles.length
        ? 0.48
        : 0.15;
  const focusScore =
    focusHits.length > 0
      ? clamp(0.56 + focusHits.length * 0.12, 0, 1)
      : (sectionProfile.focusEntityIds || []).length
        ? 0.26
        : 0.16;
  const roofScore =
    directRoof.length > 0
      ? 0.82
      : nearRoof.length > 0
        ? 0.62
        : roofLanguage
          ? 0.48
          : 0.18;
  const cutSpecificity =
    directEvidenceCount + nearEvidenceCount + inferredEvidenceCount > 0
      ? directEvidenceCount /
        (directEvidenceCount +
          nearEvidenceCount * 0.6 +
          inferredEvidenceCount * 0.35)
      : 0;
  const usefulnessScore = round(
    roomCommunicationScore * 0.22 +
      verticalCirculationScore * 0.2 +
      wallOpeningScore * 0.17 +
      slabDatumScore * 0.13 +
      focusScore * 0.1 +
      roofScore * 0.08 +
      clamp(cutSpecificity, 0, 1) * 0.1,
  );

  const evidenceQuality = classifyEvidenceQuality({
    usefulnessScore,
    directEvidenceCount,
    nearEvidenceCount,
    cutRoomCount: directRooms.length,
    cutStairCount: directStairs.length,
    directSlabCount: directSlabs.length,
  });
  const blockers = [];
  const warnings = [];

  if (!levelProfiles.length) {
    blockers.push(
      `Section ${sectionType} cannot communicate levels because no canonical levels were resolved.`,
    );
  }
  if (!directRooms.length && !directStairs.length) {
    blockers.push(
      `Section ${sectionType} does not cut a named room or stair/core element, so it lacks direct spatial evidence.`,
    );
  }
  if (directWalls.length === 0) {
    warnings.push(
      `Section ${sectionType} is not resolving cut wall segments directly; wall emphasis is inferred.`,
    );
  }
  if (directOpenings.length === 0 && nearOpenings.length > 0) {
    warnings.push(
      `Section ${sectionType} only has near-cut opening evidence, so facade-depth communication remains contextual rather than explicit.`,
    );
  } else if (directOpenings.length === 0 && inferredOpenings.length > 0) {
    warnings.push(
      `Section ${sectionType} only has inferred opening evidence, with no near-cut opening evidence to support explicit facade-depth communication.`,
    );
  }
  if (!focusHits.length && (sectionProfile.focusEntityIds || []).length) {
    warnings.push(
      `Section ${sectionType} missed the main focused semantic anchors for the chosen strategy.`,
    );
  }

  const geometrySupportLimited = Object.values(
    intersectionBundle.geometrySupport || {},
  ).some((supports) =>
    (supports || []).some((entry) =>
      ["bbox", "derived_level_profile", "derived_roof_profile"].includes(entry),
    ),
  );

  const summary = {
    sectionType,
    cutCoordinate: round(cutCoordinate),
    cutAxis: axis,
    evidenceQuality,
    usefulnessScore,
    cutSpecificity: round(cutSpecificity),
    directEvidenceCount,
    nearEvidenceCount,
    inferredEvidenceCount,
    focusHitCount: focusHits.length,
    cutRoomCount: directRooms.length,
    nearRoomCount: nearRooms.length,
    cutStairCount: directStairs.length,
    nearStairCount: nearStairs.length,
    cutWallCount: directWalls.length,
    cutOpeningCount: directOpenings.length,
    nearOpeningCount: nearOpenings.length,
    inferredOpeningCount: inferredOpenings.length,
    cutDoorCount: directDoors.length,
    entranceHitCount: directEntrances.length,
    circulationHitCount,
    directSlabCount: directSlabs.length,
    levelCount: levelProfiles.length,
    roofCommunicated: directRoof.length > 0 || nearRoof.length > 0,
    geometryCommunicable: blockers.length === 0,
    geometrySupportLimited,
    totalCutRoomAreaM2: round(
      directRooms.reduce((sum, room) => sum + roomArea(room), 0),
    ),
  };

  return {
    version: useTrueEvidence
      ? "phase11-section-evidence-service-v1"
      : "phase10-section-evidence-service-v1",
    sectionType,
    cutCoordinate: round(cutCoordinate),
    cutAxis: axis,
    sectionIntersections: intersectionBundle,
    intersections: {
      rooms: directRooms,
      nearRooms,
      inferredRooms: rooms.inferred || [],
      stairs: directStairs,
      nearStairs,
      inferredStairs: stairs.inferred || [],
      walls: directWalls,
      nearWalls: walls.near || [],
      inferredWalls: walls.inferred || [],
      windows: directWindows,
      nearWindows,
      inferredWindows,
      doors: directDoors,
      nearDoors,
      inferredDoors,
      openings: directOpenings,
      nearOpenings,
      inferredOpenings,
      entrances: directEntrances,
      nearEntrances,
      inferredEntrances: entrances.inferred || [],
      slabs: directSlabs,
      nearSlabs,
      inferredSlabs: slabs.inferred || [],
      roofElements: directRoof,
      nearRoofElements: nearRoof,
      inferredRoofElements: roofElements.inferred || [],
    },
    levelProfiles,
    roofLanguage,
    focusHits,
    circulationHitCount,
    blockers: unique(blockers),
    warnings: unique(warnings),
    rationale: deriveEvidenceRationale(summary, sectionProfile),
    summary,
  };
}

export { resolveSectionCutCoordinate, sectionAxis };

export default {
  buildSectionEvidence,
  buildSectionEvidenceSummary,
  resolveSectionCutCoordinate,
  sectionAxis,
};
