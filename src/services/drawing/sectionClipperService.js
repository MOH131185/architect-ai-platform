function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

export function normalizePoint(point = null) {
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

export function getBbox(entity = {}) {
  if (!entity?.bbox || typeof entity.bbox !== "object") {
    return null;
  }
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
  return null;
}

export function getPolygonPoints(entity = {}) {
  const candidates = [
    entity.polygon,
    entity.room_polygon,
    entity.footprint_polygon,
    entity.boundary_polygon,
    entity.outline,
    entity.perimeter,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length < 3) {
      continue;
    }
    const points = candidate.map(normalizePoint).filter(Boolean);
    if (points.length >= 3) {
      return points;
    }
  }
  return null;
}

export function axisRangeFromPoints(points = [], axis = "x", support = null) {
  const values = (points || [])
    .map((point) => Number(axis === "x" ? point?.x : point?.y))
    .filter(Number.isFinite);
  if (!values.length) {
    return null;
  }
  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    support,
  };
}

export function axisRangeFromEntity(
  entity = {},
  axis = "x",
  { allowSegment = true, allowPolygon = true, allowBbox = true } = {},
) {
  if (allowSegment) {
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
  }

  if (allowPolygon) {
    const polygon = getPolygonPoints(entity);
    if (polygon) {
      return axisRangeFromPoints(polygon, axis, "polygon");
    }
  }

  if (allowBbox) {
    const bbox = getBbox(entity);
    if (bbox) {
      return {
        minimum: axis === "x" ? bbox.min_x : bbox.min_y,
        maximum: axis === "x" ? bbox.max_x : bbox.max_y,
        support: "bbox",
      };
    }
  }

  return null;
}

export function pointInPolygon(point = null, polygon = []) {
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

export function polygonIntersections(polygon = [], axis = "x", coordinate = 0) {
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

function classifyDistance(
  range = null,
  coordinate = 0,
  nearBand = 0.9,
  { insideAsNear = false } = {},
) {
  if (!range) {
    return {
      evidenceType: "unsupported",
      distance: null,
      support: "missing_geometry",
    };
  }

  const inside = coordinate >= range.minimum && coordinate <= range.maximum;
  if (inside && insideAsNear) {
    return {
      evidenceType: "near",
      distance: 0,
      support: range.support,
    };
  }

  if (inside) {
    return {
      evidenceType: "direct",
      distance: 0,
      support: range.support,
    };
  }

  const distance = Math.min(
    Math.abs(Number(coordinate) - Number(range.minimum)),
    Math.abs(Number(coordinate) - Number(range.maximum)),
  );
  if (distance <= nearBand) {
    return {
      evidenceType: "near",
      distance: round(distance),
      support: range.support,
    };
  }

  return {
    evidenceType: "inferred",
    distance: round(distance),
    support: range.support,
  };
}

function projectionRange(entity = {}, axis = "x") {
  const range = axisRangeFromEntity(entity, axis);
  if (!range) {
    return null;
  }
  return {
    start: round(range.minimum),
    end: round(range.maximum),
    support: range.support,
  };
}

function createUnsupportedEntry(entity = {}, support = []) {
  return {
    ...entity,
    evidenceType: "unsupported",
    evidenceDistanceM: null,
    cutSpans: [],
    exactClip: false,
    clipPrimitive: "missing_geometry",
    clipGeometry: null,
    geometrySupport: unique(support.length ? support : ["missing_geometry"]),
  };
}

function createEntry(
  entity = {},
  {
    evidenceType = "unsupported",
    distance = null,
    cutSpans = [],
    exactClip = false,
    clipPrimitive = "missing_geometry",
    clipGeometry = null,
    geometrySupport = [],
  } = {},
) {
  return {
    ...entity,
    evidenceType,
    evidenceDistanceM: distance === null ? null : round(distance),
    cutSpans: (cutSpans || []).map((value) => round(value)),
    exactClip,
    clipPrimitive,
    clipGeometry,
    geometrySupport: unique(
      geometrySupport.length ? geometrySupport : [clipPrimitive],
    ),
  };
}

function midpoint(range = null) {
  if (!range) {
    return null;
  }
  return round((Number(range.minimum) + Number(range.maximum)) / 2);
}

function cutPointFromSegment(entity = {}, sectionCut = {}) {
  const start = normalizePoint(entity.start);
  const end = normalizePoint(entity.end);
  if (!(start && end)) {
    return null;
  }
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const startAxis = axis === "x" ? start.x : start.y;
  const endAxis = axis === "x" ? end.x : end.y;
  if (Math.abs(endAxis - startAxis) < 1e-6) {
    return null;
  }
  const ratio = (coordinate - startAxis) / (endAxis - startAxis);
  if (ratio < 0 || ratio > 1) {
    return null;
  }
  return round(
    axis === "x"
      ? start.y + ratio * (end.y - start.y)
      : start.x + ratio * (end.x - start.x),
  );
}

function clipSegmentEntity(entity = {}, sectionCut = {}, options = {}) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const directBand = Number(options.directBand || 0.14);
  const nearBand = Number(options.nearBand || 0.9);
  const axisRange = axisRangeFromEntity(entity, axis, {
    allowSegment: true,
    allowPolygon: false,
    allowBbox: false,
  });
  if (!axisRange) {
    return createUnsupportedEntry(entity);
  }

  const orthAxis = axis === "x" ? "y" : "x";
  const orthRange = axisRangeFromEntity(entity, orthAxis, {
    allowSegment: true,
    allowPolygon: false,
    allowBbox: false,
  });
  const alignedToCut =
    Math.abs(Number(axisRange.minimum) - coordinate) <= directBand &&
    Math.abs(Number(axisRange.maximum) - coordinate) <= directBand;
  if (alignedToCut && orthRange) {
    return createEntry(entity, {
      evidenceType: "direct",
      distance: 0,
      cutSpans: [orthRange.minimum, orthRange.maximum],
      exactClip: true,
      clipPrimitive: "segment_aligned_to_cut",
      clipGeometry: {
        type: "segment_aligned_to_cut",
        cutCoordinate: round(coordinate),
        projectionRange: projectionRange(entity, axis),
        sectionRange: {
          start: round(orthRange.minimum),
          end: round(orthRange.maximum),
        },
      },
      geometrySupport: ["segment"],
    });
  }

  const crossingPoint = cutPointFromSegment(entity, sectionCut);
  if (crossingPoint !== null) {
    return createEntry(entity, {
      evidenceType: "direct",
      distance: 0,
      cutSpans: [crossingPoint],
      exactClip: true,
      clipPrimitive: "segment_crossing_cut",
      clipGeometry: {
        type: "segment_crossing_cut",
        cutCoordinate: round(coordinate),
        cutPoint: crossingPoint,
        projectionRange: projectionRange(entity, axis),
        sectionRange: {
          start: crossingPoint,
          end: crossingPoint,
        },
      },
      geometrySupport: ["segment"],
    });
  }

  const classification = classifyDistance(axisRange, coordinate, nearBand);
  return createEntry(entity, {
    evidenceType: classification.evidenceType,
    distance: classification.distance,
    cutSpans: [],
    exactClip: false,
    clipPrimitive: "segment_offset_from_cut",
    clipGeometry: {
      type: "segment_offset_from_cut",
      cutCoordinate: round(coordinate),
      projectionRange: projectionRange(entity, axis),
      sectionRange: orthRange
        ? {
            start: round(orthRange.minimum),
            end: round(orthRange.maximum),
          }
        : null,
    },
    geometrySupport: ["segment"],
  });
}

function clipPolygonEntity(entity = {}, sectionCut = {}, options = {}) {
  const polygon = getPolygonPoints(entity);
  if (!polygon) {
    return createUnsupportedEntry(entity);
  }
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const nearBand = Number(options.nearBand || 0.9);
  const axisRange = axisRangeFromPoints(polygon, axis, "polygon");
  const orthAxis = axis === "x" ? "y" : "x";
  const projection = projectionRange(entity, axis);
  const intersections = polygonIntersections(polygon, axis, coordinate);
  const polygonMidpoint =
    orthAxis === "y"
      ? {
          x: coordinate,
          y: midpoint(axisRangeFromPoints(polygon, orthAxis, "polygon")),
        }
      : {
          x: midpoint(axisRangeFromPoints(polygon, orthAxis, "polygon")),
          y: coordinate,
        };

  if (intersections.length >= 2 || pointInPolygon(polygonMidpoint, polygon)) {
    const sectionRange =
      intersections.length >= 2
        ? {
            start: Number(intersections[0]),
            end: Number(intersections[intersections.length - 1]),
          }
        : axisRangeFromPoints(polygon, orthAxis, "polygon");
    return createEntry(entity, {
      evidenceType: "direct",
      distance: 0,
      cutSpans: intersections.length
        ? intersections
        : [sectionRange.start, sectionRange.end],
      exactClip: true,
      clipPrimitive: "polygon_slice",
      clipGeometry: {
        type: "polygon_slice",
        cutCoordinate: round(coordinate),
        projectionRange: projection,
        sectionRange: sectionRange
          ? {
              start: round(sectionRange.start),
              end: round(sectionRange.end),
            }
          : null,
        slicePoints: intersections,
      },
      geometrySupport: ["polygon"],
    });
  }

  const classification = classifyDistance(axisRange, coordinate, nearBand);
  return createEntry(entity, {
    evidenceType: classification.evidenceType,
    distance: classification.distance,
    cutSpans: intersections,
    exactClip: false,
    clipPrimitive: "polygon_offset_from_cut",
    clipGeometry: {
      type: "polygon_offset_from_cut",
      cutCoordinate: round(coordinate),
      projectionRange: projection,
      slicePoints: intersections,
    },
    geometrySupport: ["polygon"],
  });
}

function clipBboxApproximation(entity = {}, sectionCut = {}, options = {}) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const nearBand = Number(options.nearBand || 0.9);
  const axisRange = axisRangeFromEntity(entity, axis, {
    allowSegment: false,
    allowPolygon: false,
    allowBbox: true,
  });
  if (!axisRange) {
    return createUnsupportedEntry(entity);
  }
  const orthAxis = axis === "x" ? "y" : "x";
  const orthRange = axisRangeFromEntity(entity, orthAxis, {
    allowSegment: false,
    allowPolygon: false,
    allowBbox: true,
  });
  const classification = classifyDistance(axisRange, coordinate, nearBand, {
    insideAsNear: true,
  });
  return createEntry(entity, {
    evidenceType: classification.evidenceType,
    distance:
      classification.evidenceType === "near" && classification.distance === 0
        ? round(Number(options.directBand || 0.14))
        : classification.distance,
    cutSpans: [],
    exactClip: false,
    clipPrimitive: "bbox_approximation",
    clipGeometry: {
      type: "bbox_approximation",
      cutCoordinate: round(coordinate),
      projectionRange: projectionRange(entity, axis),
      sectionRange: orthRange
        ? {
            start: round(orthRange.minimum),
            end: round(orthRange.maximum),
          }
        : null,
    },
    geometrySupport: ["bbox"],
  });
}

export function clipRoomToSection(entity = {}, sectionCut = {}, options = {}) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(entity, sectionCut, options)
    : clipBboxApproximation(entity, sectionCut, options);
}

export function clipStairToSection(entity = {}, sectionCut = {}, options = {}) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(entity, sectionCut, options)
    : clipBboxApproximation(entity, sectionCut, options);
}

export function clipSlabToSection(entity = {}, sectionCut = {}, options = {}) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(entity, sectionCut, options)
    : clipBboxApproximation(entity, sectionCut, options);
}

export function clipRoofElementToSection(
  entity = {},
  sectionCut = {},
  options = {},
) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(entity, sectionCut, {
        ...options,
        nearBand: Number(options.nearBand || 1.1),
      })
    : clipBboxApproximation(entity, sectionCut, {
        ...options,
        nearBand: Number(options.nearBand || 1.1),
      });
}

export function clipWallToSection(entity = {}, sectionCut = {}, options = {}) {
  if (normalizePoint(entity.start) && normalizePoint(entity.end)) {
    return clipSegmentEntity(entity, sectionCut, options);
  }
  if (getPolygonPoints(entity)) {
    return clipPolygonEntity(entity, sectionCut, options);
  }
  return clipBboxApproximation(entity, sectionCut, options);
}

function pointDistanceToCut(point = null, sectionCut = {}) {
  if (!point) {
    return null;
  }
  const coordinate = Number(sectionCut.coordinate || 0);
  const axis = sectionCut.axis || "x";
  const value = axis === "x" ? point.x : point.y;
  if (!Number.isFinite(Number(value))) {
    return null;
  }
  return Math.abs(Number(value) - coordinate);
}

function pointAlongSection(point = null, sectionCut = {}) {
  if (!point) {
    return null;
  }
  const axis = sectionCut.axis || "x";
  const value = axis === "x" ? point.y : point.x;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function clipOpeningToSection(
  opening = {},
  wallClip = null,
  sectionCut = {},
  options = {},
) {
  const point =
    normalizePoint(opening.position_m) ||
    normalizePoint(opening.position) ||
    normalizePoint({ x: opening.x, y: opening.y });
  const directBand = Number(options.directBand || 0.14);
  const nearBand = Number(options.nearBand || 0.9);
  const distance = pointDistanceToCut(point, sectionCut);
  const sectionPosition = pointAlongSection(point, sectionCut);
  const width = Number(opening.width_m || 0);
  const openingDirect = distance !== null && distance <= directBand;
  const openingNear = distance !== null && distance <= nearBand;
  const wallExact = wallClip?.exactClip === true;
  const wallSupported = Boolean(
    wallClip && String(wallClip.evidenceType || "") !== "unsupported",
  );
  const wallContextual =
    wallExact ||
    (wallSupported &&
      ["direct", "near"].includes(String(wallClip?.evidenceType || "")));

  if (wallExact && openingDirect) {
    return createEntry(opening, {
      evidenceType: "direct",
      distance: 0,
      cutSpans: wallClip?.cutSpans || [],
      exactClip: true,
      clipPrimitive: "opening_on_cut_wall",
      clipGeometry: {
        type: "opening_on_cut_wall",
        cutCoordinate:
          wallClip?.clipGeometry?.cutCoordinate ?? round(sectionCut.coordinate),
        sectionRange: wallClip?.clipGeometry?.sectionRange || null,
        sectionPositionM:
          sectionPosition === null ? null : round(sectionPosition),
        widthM: round(width),
        sillHeightM: round(opening.sill_height_m || 0),
        headHeightM: round(opening.head_height_m || 2.1),
      },
      geometrySupport: unique(["point", ...(wallClip?.geometrySupport || [])]),
    });
  }

  if (wallContextual && openingNear) {
    return createEntry(opening, {
      evidenceType: "near",
      distance,
      cutSpans: wallClip?.cutSpans || [],
      exactClip: false,
      clipPrimitive: "opening_near_cut",
      clipGeometry: {
        type: "opening_near_cut",
        cutCoordinate:
          wallClip?.clipGeometry?.cutCoordinate ?? round(sectionCut.coordinate),
        sectionRange: wallClip?.clipGeometry?.sectionRange || null,
        sectionPositionM:
          sectionPosition === null ? null : round(sectionPosition),
        widthM: round(width),
        sillHeightM: round(opening.sill_height_m || 0),
        headHeightM: round(opening.head_height_m || 2.1),
      },
      geometrySupport: unique(["point", ...(wallClip?.geometrySupport || [])]),
    });
  }

  if (distance !== null || wallClip) {
    return createEntry(opening, {
      evidenceType:
        distance === null
          ? "unsupported"
          : wallContextual || sectionPosition !== null
            ? "inferred"
            : "unsupported",
      distance,
      cutSpans: wallClip?.cutSpans || [],
      exactClip: false,
      clipPrimitive:
        distance === null ? "opening_without_position" : "opening_inferred",
      clipGeometry: {
        type:
          distance === null ? "opening_without_position" : "opening_inferred",
        cutCoordinate:
          wallClip?.clipGeometry?.cutCoordinate ?? round(sectionCut.coordinate),
        sectionRange: wallClip?.clipGeometry?.sectionRange || null,
        sectionPositionM:
          sectionPosition === null ? null : round(sectionPosition),
        widthM: round(width),
        sillHeightM: round(opening.sill_height_m || 0),
        headHeightM: round(opening.head_height_m || 2.1),
      },
      geometrySupport: unique([
        Number.isFinite(Number(distance)) ? "point" : null,
        ...(wallClip?.geometrySupport || []),
      ]),
    });
  }

  return createUnsupportedEntry(opening);
}

export function bucketByEvidence(entries = []) {
  return {
    direct: entries.filter((entry) => entry.evidenceType === "direct"),
    near: entries.filter((entry) => entry.evidenceType === "near"),
    inferred: entries.filter((entry) => entry.evidenceType === "inferred"),
    unsupported: entries.filter(
      (entry) => entry.evidenceType === "unsupported",
    ),
  };
}

export function collectSupportSummary(grouped = {}) {
  const entries = [
    ...(grouped.direct || []),
    ...(grouped.near || []),
    ...(grouped.inferred || []),
    ...(grouped.unsupported || []),
  ];
  return unique(entries.flatMap((entry) => entry.geometrySupport || []));
}

export function countExactClips(grouped = {}) {
  return (grouped.direct || []).filter((entry) => entry.exactClip === true)
    .length;
}

export default {
  normalizePoint,
  getBbox,
  getPolygonPoints,
  axisRangeFromEntity,
  axisRangeFromPoints,
  pointInPolygon,
  polygonIntersections,
  clipRoomToSection,
  clipStairToSection,
  clipSlabToSection,
  clipRoofElementToSection,
  clipWallToSection,
  clipOpeningToSection,
  bucketByEvidence,
  collectSupportSummary,
  countExactClips,
};
