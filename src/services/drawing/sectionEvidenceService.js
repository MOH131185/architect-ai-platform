function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
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

function entityRange(entity = {}, axis = "x") {
  const bbox = entity.bbox || {};
  const hasBBoxStart =
    axis === "x"
      ? bbox.min_x !== undefined || bbox.x !== undefined
      : bbox.min_y !== undefined || bbox.y !== undefined;
  const hasBBoxEnd =
    axis === "x"
      ? bbox.max_x !== undefined ||
        (bbox.x !== undefined && bbox.width !== undefined)
      : bbox.max_y !== undefined ||
        (bbox.y !== undefined && bbox.height !== undefined);
  const minimum =
    axis === "x"
      ? hasBBoxStart
        ? (bbox.min_x ?? bbox.x)
        : (entity.start?.x ?? entity.position_m?.x ?? entity.position?.x)
      : hasBBoxStart
        ? (bbox.min_y ?? bbox.y)
        : (entity.start?.y ?? entity.position_m?.y ?? entity.position?.y);
  const maximum =
    axis === "x"
      ? hasBBoxEnd
        ? (bbox.max_x ?? Number(bbox.x || 0) + Number(bbox.width || 0))
        : (entity.end?.x ?? entity.position_m?.x ?? entity.position?.x)
      : hasBBoxEnd
        ? (bbox.max_y ?? Number(bbox.y || 0) + Number(bbox.height || 0))
        : (entity.end?.y ?? entity.position_m?.y ?? entity.position?.y);

  if (Number.isFinite(Number(minimum)) && Number.isFinite(Number(maximum))) {
    return {
      minimum: Math.min(Number(minimum), Number(maximum)),
      maximum: Math.max(Number(minimum), Number(maximum)),
    };
  }

  return null;
}

function entityIntersectsCut(
  entity = {},
  cutCoordinate = 0,
  axis = "x",
  tolerance = 0.18,
) {
  const range = entityRange(entity, axis);
  if (!range) {
    return false;
  }
  return (
    Number(cutCoordinate) >= range.minimum - tolerance &&
    Number(cutCoordinate) <= range.maximum + tolerance
  );
}

function pointNearCut(
  point = {},
  cutCoordinate = 0,
  axis = "x",
  tolerance = 0.9,
) {
  const coordinate =
    axis === "x"
      ? (point.x ?? point.min_x ?? point.position_m?.x ?? point.position?.x)
      : (point.y ?? point.min_y ?? point.position_m?.y ?? point.position?.y);
  if (!Number.isFinite(Number(coordinate))) {
    return false;
  }
  return Math.abs(Number(coordinate) - Number(cutCoordinate)) <= tolerance;
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function roomArea(room = {}) {
  return Number(room.actual_area || room.target_area_m2 || 0);
}

function buildOpeningEvidence(
  openings = [],
  walls = [],
  cutCoordinate = 0,
  axis = "x",
) {
  const wallIds = new Set((walls || []).map((wall) => wall.id).filter(Boolean));
  const direct = [];
  const inferred = [];

  (openings || []).forEach((opening) => {
    if (wallIds.has(opening.wall_id)) {
      direct.push({
        ...opening,
        evidenceType: "direct",
      });
      return;
    }

    if (
      pointNearCut(
        opening.position_m || opening.position || {},
        cutCoordinate,
        axis,
        0.9,
      )
    ) {
      inferred.push({
        ...opening,
        evidenceType: "inferred",
      });
    }
  });

  return {
    direct,
    inferred,
  };
}

function buildLevelDatumEvidence(levelProfiles = []) {
  return {
    levelCount: levelProfiles.length,
    communicatesStack: levelProfiles.length > 1,
    totalHeightM: round(
      levelProfiles.reduce(
        (sum, level) => sum + Number(level.height_m || 3.2),
        0,
      ),
    ),
  };
}

function summarizeFocusHits({
  focusEntityIds = [],
  cutRooms = [],
  cutStairs = [],
  entrances = [],
} = {}) {
  const ids = new Set([
    ...cutRooms.map((room) => `entity:room:${room.id}`),
    ...cutStairs.map((stair) => `entity:stair:${stair.id}`),
    ...entrances.map((entry) => `entity:entrance:${entry.id || "main"}`),
  ]);
  return (focusEntityIds || []).filter((entry) => ids.has(String(entry)));
}

function deriveEvidenceRationale(summary = {}, sectionProfile = {}) {
  const rationale = [];

  if (summary.cutRoomCount > 0) {
    rationale.push(
      `Cut intersects ${summary.cutRoomCount} room volume(s) with ${summary.totalCutRoomAreaM2.toFixed(1)}m2 of named program evidence.`,
    );
  } else {
    rationale.push("Cut does not intersect a named room volume directly.");
  }

  if (summary.cutStairCount > 0) {
    rationale.push(
      `Cut intersects ${summary.cutStairCount} stair/core element(s), which strengthens vertical communication.`,
    );
  } else {
    rationale.push("No stair/core geometry is cut directly.");
  }

  if (summary.cutOpeningCount > 0) {
    rationale.push(
      `Cut resolves ${summary.cutOpeningCount} opening marker(s) against ${summary.cutWallCount} wall segment(s).`,
    );
  } else if (summary.inferredOpeningCount > 0) {
    rationale.push(
      `Opening relationships are only inferred from ${summary.inferredOpeningCount} near-cut opening marker(s), not directly cut.`,
    );
  } else {
    rationale.push(
      "Wall-opening relationships are inferred rather than directly cut.",
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
      inferredEvidenceCount: 0,
      focusHitCount: 0,
      cutRoomCount: 0,
      cutStairCount: 0,
      cutWallCount: 0,
      cutOpeningCount: 0,
      inferredOpeningCount: 0,
      cutDoorCount: 0,
      entranceHitCount: 0,
      circulationHitCount: 0,
      levelCount: 0,
      roofCommunicated: false,
      geometryCommunicable: false,
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

  const cutRooms = (projectGeometry.rooms || []).filter((room) =>
    entityIntersectsCut(room, cutCoordinate, axis, 0.18),
  );
  const cutStairs = (projectGeometry.stairs || []).filter((stair) =>
    entityIntersectsCut(stair, cutCoordinate, axis, 0.18),
  );
  const cutWalls = (projectGeometry.walls || []).filter((wall) =>
    entityIntersectsCut(wall, cutCoordinate, axis, 0.18),
  );
  const cutWindows = buildOpeningEvidence(
    projectGeometry.windows || [],
    cutWalls,
    cutCoordinate,
    axis,
  );
  const cutDoors = buildOpeningEvidence(
    projectGeometry.doors || [],
    cutWalls,
    cutCoordinate,
    axis,
  );
  const directWindows = cutWindows.direct || [];
  const inferredWindows = cutWindows.inferred || [];
  const directDoors = cutDoors.direct || [];
  const inferredDoors = cutDoors.inferred || [];
  const cutOpenings = [...directWindows, ...directDoors];
  const inferredOpenings = [...inferredWindows, ...inferredDoors];
  const entranceHits = (projectGeometry.entrances || []).filter((entry) =>
    pointNearCut(
      entry.position_m || entry.position || {},
      cutCoordinate,
      axis,
      1.1,
    ),
  );
  const circulationHitCount = (projectGeometry.circulation || []).reduce(
    (sum, path) =>
      sum +
      (path.polyline || []).filter((point) =>
        pointNearCut(point, cutCoordinate, axis, 0.85),
      ).length,
    0,
  );
  const focusHits = summarizeFocusHits({
    focusEntityIds: sectionProfile.focusEntityIds || [],
    cutRooms,
    cutStairs,
    entrances: entranceHits,
  });
  const levelDatumEvidence = buildLevelDatumEvidence(levelProfiles);
  const directEvidenceCount =
    cutRooms.length +
    cutStairs.length +
    cutWalls.length +
    cutOpenings.length +
    entranceHits.length;
  const inferredEvidenceCount =
    (levelProfiles.length > 0 ? 1 : 0) +
    (circulationHitCount > 0 ? 1 : 0) +
    (roofLanguage ? 1 : 0) +
    ((sectionProfile.focusEntityIds || []).length > 0 ? 1 : 0) +
    inferredOpenings.length;
  const roomCommunicationScore =
    cutRooms.length > 1 ? 1 : cutRooms.length === 1 ? 0.72 : 0.18;
  const verticalCirculationScore = cutStairs.length
    ? 1
    : (projectGeometry.stairs || []).length
      ? 0.42
      : 0.14;
  const wallOpeningScore =
    cutWalls.length && cutOpenings.length
      ? clamp(0.52 + cutOpenings.length * 0.1, 0, 1)
      : cutWalls.length
        ? 0.36
        : 0.12;
  const focusScore =
    focusHits.length > 0
      ? clamp(0.55 + focusHits.length * 0.12, 0, 1)
      : (sectionProfile.focusEntityIds || []).length
        ? 0.28
        : 0.18;
  const datumScore = levelDatumEvidence.communicatesStack
    ? 1
    : levelProfiles.length
      ? 0.62
      : 0.18;
  const roofScore = roofLanguage
    ? roofLanguage.includes("flat")
      ? 0.58
      : roofLanguage.includes("gable") ||
          roofLanguage.includes("pitch") ||
          roofLanguage.includes("hip")
        ? 0.78
        : 0.5
    : 0.2;
  const circulationScore =
    circulationHitCount > 0
      ? clamp(0.48 + circulationHitCount * 0.06, 0, 1)
      : (projectGeometry.circulation || []).length
        ? 0.28
        : 0.16;
  const directnessScore =
    directEvidenceCount + inferredEvidenceCount > 0
      ? directEvidenceCount / (directEvidenceCount + inferredEvidenceCount)
      : 0;
  const usefulnessScore = round(
    roomCommunicationScore * 0.24 +
      verticalCirculationScore * 0.2 +
      wallOpeningScore * 0.16 +
      datumScore * 0.14 +
      focusScore * 0.1 +
      roofScore * 0.08 +
      circulationScore * 0.08,
  );

  let evidenceQuality = "block";
  if (usefulnessScore >= 0.76 && directEvidenceCount >= 3) {
    evidenceQuality = "pass";
  } else if (usefulnessScore >= 0.56 && directEvidenceCount >= 1) {
    evidenceQuality = "warning";
  }

  const blockers = [];
  const warnings = [];

  if (!levelProfiles.length) {
    blockers.push(
      `Section ${sectionType} cannot communicate levels because no canonical levels were resolved.`,
    );
  }
  if (!cutRooms.length && !cutStairs.length) {
    blockers.push(
      `Section ${sectionType} does not cut a named room or stair/core element, so it lacks direct spatial evidence.`,
    );
  }
  if (cutWalls.length === 0) {
    warnings.push(
      `Section ${sectionType} is not resolving cut wall segments directly; wall emphasis is inferred.`,
    );
  }
  if (cutOpenings.length === 0 && inferredOpenings.length > 0) {
    warnings.push(
      `Section ${sectionType} only has near-cut opening evidence, so facade-depth communication remains inferred rather than explicit.`,
    );
  } else if (cutOpenings.length === 0) {
    warnings.push(
      `Section ${sectionType} does not resolve cut openings directly, so facade-depth communication is weaker.`,
    );
  }
  if (!focusHits.length && (sectionProfile.focusEntityIds || []).length) {
    warnings.push(
      `Section ${sectionType} missed the main focused semantic anchors for the chosen strategy.`,
    );
  }

  const summary = {
    sectionType,
    cutCoordinate: round(cutCoordinate),
    cutAxis: axis,
    evidenceQuality,
    usefulnessScore,
    cutSpecificity: round(directnessScore),
    directEvidenceCount,
    inferredEvidenceCount,
    focusHitCount: focusHits.length,
    cutRoomCount: cutRooms.length,
    cutStairCount: cutStairs.length,
    cutWallCount: cutWalls.length,
    cutOpeningCount: cutOpenings.length,
    inferredOpeningCount: inferredOpenings.length,
    cutDoorCount: directDoors.length,
    entranceHitCount: entranceHits.length,
    circulationHitCount,
    levelCount: levelProfiles.length,
    roofCommunicated: roofScore >= 0.5,
    geometryCommunicable: blockers.length === 0,
    totalCutRoomAreaM2: round(
      cutRooms.reduce((sum, room) => sum + roomArea(room), 0),
    ),
  };

  return {
    version: "phase10-section-evidence-service-v1",
    sectionType,
    cutCoordinate: round(cutCoordinate),
    cutAxis: axis,
    intersections: {
      rooms: cutRooms,
      stairs: cutStairs,
      walls: cutWalls,
      windows: directWindows,
      inferredWindows,
      doors: directDoors,
      inferredDoors,
      openings: cutOpenings,
      inferredOpenings,
      entrances: entranceHits,
    },
    levelProfiles,
    levelDatumEvidence,
    roofLanguage,
    focusHits,
    circulationHitCount,
    blockers: unique(blockers),
    warnings: unique(warnings),
    rationale: deriveEvidenceRationale(summary, sectionProfile),
    summary,
  };
}

export default {
  buildSectionEvidence,
  buildSectionEvidenceSummary,
  resolveSectionCutCoordinate,
  sectionAxis,
};
