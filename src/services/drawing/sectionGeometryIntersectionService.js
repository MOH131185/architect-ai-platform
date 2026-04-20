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

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function getBbox(entity = {}) {
  if (entity.bbox) {
    const bbox = entity.bbox;
    if (
      bbox.min_x !== undefined &&
      bbox.max_x !== undefined &&
      bbox.min_y !== undefined &&
      bbox.max_y !== undefined
    ) {
      return {
        min_x: Number(bbox.min_x),
        max_x: Number(bbox.max_x),
        min_y: Number(bbox.min_y),
        max_y: Number(bbox.max_y),
      };
    }
    if (
      bbox.x !== undefined &&
      bbox.y !== undefined &&
      bbox.width !== undefined &&
      bbox.height !== undefined
    ) {
      return {
        min_x: Number(bbox.x),
        max_x: Number(bbox.x) + Number(bbox.width),
        min_y: Number(bbox.y),
        max_y: Number(bbox.y) + Number(bbox.height),
      };
    }
  }
  return null;
}

function axisRangeFromSegment(entity = {}, axis = "x") {
  const start = entity.start || {};
  const end = entity.end || {};
  const startCoordinate =
    axis === "x"
      ? (start.x ?? entity.position_m?.x ?? entity.position?.x)
      : (start.y ?? entity.position_m?.y ?? entity.position?.y);
  const endCoordinate =
    axis === "x"
      ? (end.x ?? entity.position_m?.x ?? entity.position?.x)
      : (end.y ?? entity.position_m?.y ?? entity.position?.y);

  if (
    Number.isFinite(Number(startCoordinate)) &&
    Number.isFinite(Number(endCoordinate))
  ) {
    return {
      minimum: Math.min(Number(startCoordinate), Number(endCoordinate)),
      maximum: Math.max(Number(startCoordinate), Number(endCoordinate)),
      support: "segment",
    };
  }

  const bbox = getBbox(entity);
  if (bbox) {
    return {
      minimum: axis === "x" ? bbox.min_x : bbox.min_y,
      maximum: axis === "x" ? bbox.max_x : bbox.max_y,
      support: "bbox",
    };
  }

  return null;
}

function orthogonalSpan(entity = {}, axis = "x") {
  const otherAxis = axis === "x" ? "y" : "x";
  return axisRangeFromSegment(entity, otherAxis);
}

function classifyAxisDistance(
  range = null,
  coordinate = 0,
  directBand = 0.18,
  nearBand = 0.9,
) {
  if (!range) {
    return {
      classification: "inferred",
      distance: null,
      overlap: 0,
      support: "missing_geometry",
    };
  }

  const overlap =
    Math.min(range.maximum, coordinate + directBand) -
    Math.max(range.minimum, coordinate - directBand);
  if (overlap >= 0) {
    return {
      classification: "direct",
      distance: 0,
      overlap: round(overlap),
      support: range.support,
    };
  }

  const distance = Math.min(
    Math.abs(Number(coordinate) - Number(range.minimum)),
    Math.abs(Number(coordinate) - Number(range.maximum)),
  );
  if (distance <= nearBand) {
    return {
      classification: "near",
      distance: round(distance),
      overlap: 0,
      support: range.support,
    };
  }

  return {
    classification: "inferred",
    distance: round(distance),
    overlap: 0,
    support: range.support,
  };
}

function classifyEntityIntersection(
  entity = {},
  sectionCut = {},
  options = {},
) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const directBand = Number(options.directBand || 0.18);
  const nearBand = Number(options.nearBand || 0.9);
  const range = axisRangeFromSegment(entity, axis);
  const otherSpan = orthogonalSpan(entity, axis);
  const classification = classifyAxisDistance(
    range,
    coordinate,
    directBand,
    nearBand,
  );

  return {
    ...entity,
    evidenceType: classification.classification,
    evidenceDistanceM: classification.distance,
    overlapDepthM: classification.overlap,
    geometrySupport: unique([classification.support, otherSpan?.support]),
  };
}

function classifyOpening(
  opening = {},
  wallMap = new Map(),
  sectionCut = {},
  options = {},
) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const directBand = Number(options.directBand || 0.18);
  const nearBand = Number(options.nearBand || 0.9);
  const wall = wallMap.get(opening.wall_id) || null;
  const openingCoordinate =
    axis === "x"
      ? (opening.position_m?.x ?? opening.position?.x)
      : (opening.position_m?.y ?? opening.position?.y);
  const explicitOpeningDistance = Number.isFinite(Number(openingCoordinate))
    ? Math.abs(Number(openingCoordinate) - coordinate)
    : null;
  const wallEvidence = wall?.evidenceType || "inferred";
  const wallHasResolvedGeometry = Boolean(
    wall &&
    (wall.geometrySupport || []).some((entry) => entry !== "missing_geometry"),
  );

  let evidenceType = "inferred";
  if (!wallHasResolvedGeometry) {
    if (
      explicitOpeningDistance !== null &&
      explicitOpeningDistance <= directBand
    ) {
      evidenceType = "direct";
    } else if (
      explicitOpeningDistance !== null &&
      explicitOpeningDistance <= nearBand
    ) {
      evidenceType = "near";
    }
  } else if (
    wallEvidence === "direct" &&
    explicitOpeningDistance !== null &&
    explicitOpeningDistance <= directBand
  ) {
    evidenceType = "direct";
  } else if (wallEvidence === "direct") {
    evidenceType =
      explicitOpeningDistance !== null && explicitOpeningDistance > nearBand
        ? "near"
        : "direct";
  } else if (wallEvidence === "near") {
    evidenceType = "near";
  }

  return {
    ...opening,
    wallEvidenceType: wallEvidence,
    evidenceType,
    evidenceDistanceM:
      explicitOpeningDistance === null
        ? (wall?.evidenceDistanceM ?? null)
        : round(explicitOpeningDistance),
    geometrySupport: unique([
      Number.isFinite(Number(openingCoordinate)) ? "point" : null,
      ...(wall?.geometrySupport || []),
    ]),
  };
}

function classifyPointEntity(entity = {}, sectionCut = {}, options = {}) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const directBand = Number(options.directBand || 0.18);
  const nearBand = Number(options.nearBand || 0.9);
  const value =
    axis === "x"
      ? (entity.position_m?.x ?? entity.position?.x ?? entity.x)
      : (entity.position_m?.y ?? entity.position?.y ?? entity.y);

  if (!Number.isFinite(Number(value))) {
    return {
      ...entity,
      evidenceType: "inferred",
      evidenceDistanceM: null,
      geometrySupport: ["missing_geometry"],
    };
  }

  const distance = Math.abs(Number(value) - coordinate);
  return {
    ...entity,
    evidenceType:
      distance <= directBand
        ? "direct"
        : distance <= nearBand
          ? "near"
          : "inferred",
    evidenceDistanceM: round(distance),
    geometrySupport: ["point"],
  };
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

  if (!withinEnvelope) {
    return [];
  }

  return (geometry.levels || []).map((level, index) => ({
    id: `derived-slab:${level.id || index}`,
    levelId: level.id || null,
    levelName: level.name || `L${level.level_number || index}`,
    evidenceType: "direct",
    geometrySupport: ["derived_level_profile"],
  }));
}

function buildRoofIntersections(geometry = {}, sectionCut = {}) {
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
      type: geometry.roof.type,
      evidenceType: withinEnvelope ? "near" : "inferred",
      geometrySupport: ["derived_roof_profile"],
    },
  ];
}

function bucketByEvidence(entries = []) {
  return {
    direct: entries.filter((entry) => entry.evidenceType === "direct"),
    near: entries.filter((entry) => entry.evidenceType === "near"),
    inferred: entries.filter((entry) => entry.evidenceType === "inferred"),
  };
}

function collectSupportSummary(grouped = {}) {
  const allEntries = [
    ...(grouped.direct || []),
    ...(grouped.near || []),
    ...(grouped.inferred || []),
  ];
  return unique(allEntries.flatMap((entry) => entry.geometrySupport || []));
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
  const sectionCut = {
    sectionType,
    axis,
    coordinate,
  };
  const classify = (entity) =>
    classifyEntityIntersection(entity, sectionCut, options);
  const wallEntries = (projectGeometry.walls || []).map(classify);
  const wallMap = new Map(wallEntries.map((entry) => [entry.id, entry]));

  const intersections = {
    rooms: bucketByEvidence((projectGeometry.rooms || []).map(classify)),
    stairs: bucketByEvidence((projectGeometry.stairs || []).map(classify)),
    walls: bucketByEvidence(wallEntries),
    windows: bucketByEvidence(
      (projectGeometry.windows || []).map((opening) =>
        classifyOpening(opening, wallMap, sectionCut, options),
      ),
    ),
    doors: bucketByEvidence(
      (projectGeometry.doors || []).map((opening) =>
        classifyOpening(opening, wallMap, sectionCut, options),
      ),
    ),
    entrances: bucketByEvidence(
      (projectGeometry.entrances || []).map((entry) =>
        classifyPointEntity(entry, sectionCut, options),
      ),
    ),
    slabs: bucketByEvidence(
      buildDerivedSlabIntersections(projectGeometry, sectionCut),
    ),
    roofElements: bucketByEvidence(
      buildRoofIntersections(projectGeometry, sectionCut),
    ),
  };

  return {
    version: "phase11-section-geometry-intersection-v1",
    sectionType,
    cutAxis: axis,
    cutCoordinate: round(coordinate),
    directBandM: Number(options.directBand || 0.18),
    nearBandM: Number(options.nearBand || 0.9),
    intersections,
    geometrySupport: {
      rooms: collectSupportSummary(intersections.rooms),
      stairs: collectSupportSummary(intersections.stairs),
      walls: collectSupportSummary(intersections.walls),
      windows: collectSupportSummary(intersections.windows),
      doors: collectSupportSummary(intersections.doors),
      entrances: collectSupportSummary(intersections.entrances),
      slabs: collectSupportSummary(intersections.slabs),
      roofElements: collectSupportSummary(intersections.roofElements),
    },
  };
}

export default {
  buildSectionIntersections,
  resolveSectionCutCoordinate,
  sectionAxis,
};
