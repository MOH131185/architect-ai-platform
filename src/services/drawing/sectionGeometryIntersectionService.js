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

function normalizePoint(point = null) {
  if (!point || typeof point !== "object") {
    return null;
  }
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function getPolygonPoints(entity = {}) {
  const candidates = [
    entity.polygon,
    entity.room_polygon,
    entity.footprint_polygon,
    entity.boundary_polygon,
    entity.outline,
    entity.perimeter,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || !candidate.length) {
      continue;
    }
    const points = candidate.map(normalizePoint).filter(Boolean);
    if (points.length >= 3) {
      return points;
    }
  }
  return null;
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

function rangeFromPoints(points = [], axis = "x") {
  if (!points.length) {
    return null;
  }
  const values = points
    .map((point) => Number(axis === "x" ? point.x : point.y))
    .filter(Number.isFinite);
  if (!values.length) {
    return null;
  }
  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}

function axisRangeFromSegment(entity = {}, axis = "x") {
  const start = normalizePoint(entity.start);
  const end = normalizePoint(entity.end);
  if (start && end) {
    const startCoordinate = axis === "x" ? start.x : start.y;
    const endCoordinate = axis === "x" ? end.x : end.y;
    return {
      minimum: Math.min(startCoordinate, endCoordinate),
      maximum: Math.max(startCoordinate, endCoordinate),
      support: "segment",
    };
  }

  const polygon = getPolygonPoints(entity);
  if (polygon) {
    const range = rangeFromPoints(polygon, axis);
    if (range) {
      return {
        ...range,
        support: "polygon",
      };
    }
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
  return axisRangeFromSegment(entity, axis === "x" ? "y" : "x");
}

function pointInPolygon(point = null, polygon = []) {
  if (!point || !polygon.length) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonIntersections(polygon = [], axis = "x", coordinate = 0) {
  const intersections = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (!start || !end) {
      continue;
    }

    if (axis === "x") {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      if (coordinate < minX || coordinate > maxX) {
        continue;
      }
      if (Math.abs(end.x - start.x) < 1e-6) {
        intersections.push(start.y, end.y);
        continue;
      }
      const ratio = (coordinate - start.x) / (end.x - start.x);
      if (ratio >= 0 && ratio <= 1) {
        intersections.push(start.y + ratio * (end.y - start.y));
      }
      continue;
    }

    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    if (coordinate < minY || coordinate > maxY) {
      continue;
    }
    if (Math.abs(end.y - start.y) < 1e-6) {
      intersections.push(start.x, end.x);
      continue;
    }
    const ratio = (coordinate - start.y) / (end.y - start.y);
    if (ratio >= 0 && ratio <= 1) {
      intersections.push(start.x + ratio * (end.x - start.x));
    }
  }

  return unique(
    intersections.filter(Number.isFinite).map((value) => round(value)),
  ).sort((left, right) => left - right);
}

function classifyAxisDistance(
  range = null,
  coordinate = 0,
  directBand = 0.18,
  nearBand = 0.9,
) {
  if (!range) {
    return {
      classification: "unsupported",
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

function classifyPolygonIntersection(
  entity = {},
  sectionCut = {},
  options = {},
) {
  const polygon = getPolygonPoints(entity);
  if (!polygon) {
    return null;
  }

  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const directBand = Number(options.directBand || 0.18);
  const nearBand = Number(options.nearBand || 0.9);
  const range = rangeFromPoints(polygon, axis);
  const classification = classifyAxisDistance(
    range ? { ...range, support: "polygon" } : null,
    coordinate,
    directBand,
    nearBand,
  );
  const intersections = polygonIntersections(polygon, axis, coordinate);
  const orthAxis = axis === "x" ? "y" : "x";
  const midpoint =
    orthAxis === "y"
      ? {
          x: coordinate,
          y:
            intersections.length >= 2
              ? (Number(intersections[0]) +
                  Number(intersections[intersections.length - 1])) /
                2
              : polygon.reduce((sum, point) => sum + point.y, 0) /
                polygon.length,
        }
      : {
          x:
            intersections.length >= 2
              ? (Number(intersections[0]) +
                  Number(intersections[intersections.length - 1])) /
                2
              : polygon.reduce((sum, point) => sum + point.x, 0) /
                polygon.length,
          y: coordinate,
        };
  const directClip =
    intersections.length >= 2 || pointInPolygon(midpoint, polygon) === true;
  if (directClip) {
    return {
      ...entity,
      evidenceType: "direct",
      evidenceDistanceM: 0,
      overlapDepthM:
        intersections.length >= 2
          ? round(
              Number(intersections[intersections.length - 1]) -
                Number(intersections[0]),
            )
          : null,
      cutSpans: intersections,
      clipPrimitive: "polygon_slice",
      geometrySupport: ["polygon"],
    };
  }

  return {
    ...entity,
    evidenceType: classification.classification,
    evidenceDistanceM: classification.distance,
    overlapDepthM: classification.overlap,
    cutSpans: intersections,
    clipPrimitive: "polygon_bounds",
    geometrySupport: unique(["polygon", classification.support]),
  };
}

function classifyEntityIntersection(
  entity = {},
  sectionCut = {},
  options = {},
) {
  const polygonClassification = classifyPolygonIntersection(
    entity,
    sectionCut,
    options,
  );
  if (polygonClassification) {
    return polygonClassification;
  }

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
  const bboxSpan =
    range && range.support === "bbox"
      ? Math.abs(Number(range.maximum) - Number(range.minimum))
      : null;
  const evidenceType =
    classification.classification === "direct" &&
    range?.support === "bbox" &&
    bboxSpan !== null &&
    bboxSpan <= 0.5
      ? "near"
      : classification.classification;

  return {
    ...entity,
    evidenceType,
    evidenceDistanceM:
      evidenceType === "near" && classification.distance === 0
        ? round(directBand)
        : classification.distance,
    overlapDepthM: evidenceType === "direct" ? classification.overlap : 0,
    cutSpans:
      evidenceType === "direct" && otherSpan
        ? [round(otherSpan.minimum), round(otherSpan.maximum)]
        : [],
    clipPrimitive:
      classification.support === "segment"
        ? "segment_projection"
        : classification.support === "bbox"
          ? "bbox_projection"
          : "unknown",
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
  const wallEvidence = wall?.evidenceType || "unsupported";
  const wallHasResolvedGeometry = Boolean(
    wall &&
    (wall.geometrySupport || []).some(
      (entry) => entry && entry !== "missing_geometry",
    ),
  );

  let evidenceType = "unsupported";
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
    } else if (explicitOpeningDistance !== null) {
      evidenceType = "inferred";
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
    evidenceType = explicitOpeningDistance !== null ? "near" : "inferred";
  } else if (wallEvidence === "inferred") {
    evidenceType =
      explicitOpeningDistance !== null ? "inferred" : "unsupported";
  }

  return {
    ...opening,
    wallEvidenceType: wallEvidence,
    evidenceType,
    evidenceDistanceM:
      explicitOpeningDistance === null
        ? (wall?.evidenceDistanceM ?? null)
        : round(explicitOpeningDistance),
    cutSpans: wall?.cutSpans || [],
    clipPrimitive: wall?.clipPrimitive || "point_projection",
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
      evidenceType: "unsupported",
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

  if (!(geometry.levels || []).length) {
    return [];
  }

  return (geometry.levels || []).map((level, index) => ({
    id: `derived-slab:${level.id || index}`,
    levelId: level.id || null,
    levelName: level.name || `L${level.level_number || index}`,
    evidenceType: withinEnvelope ? "direct" : "unsupported",
    geometrySupport: ["derived_level_profile"],
    clipPrimitive: "derived_level_profile",
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
      clipPrimitive: "derived_roof_profile",
    },
  ];
}

function bucketByEvidence(entries = []) {
  return {
    direct: entries.filter((entry) => entry.evidenceType === "direct"),
    near: entries.filter((entry) => entry.evidenceType === "near"),
    inferred: entries.filter((entry) => entry.evidenceType === "inferred"),
    unsupported: entries.filter(
      (entry) => entry.evidenceType === "unsupported",
    ),
  };
}

function collectSupportSummary(grouped = {}) {
  const allEntries = [
    ...(grouped.direct || []),
    ...(grouped.near || []),
    ...(grouped.inferred || []),
    ...(grouped.unsupported || []),
  ];
  return unique(allEntries.flatMap((entry) => entry.geometrySupport || []));
}

function collectUnsupportedCounts(intersections = {}) {
  return Object.fromEntries(
    Object.entries(intersections).map(([key, grouped]) => [
      key,
      (grouped?.unsupported || []).length,
    ]),
  );
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
    version: "phase12-section-geometry-intersection-v1",
    sectionType,
    cutAxis: axis,
    cutCoordinate: round(coordinate),
    directBandM: Number(options.directBand || 0.18),
    nearBandM: Number(options.nearBand || 0.9),
    intersections,
    unsupportedCounts: collectUnsupportedCounts(intersections),
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
