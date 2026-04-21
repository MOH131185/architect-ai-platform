import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  normalizeBaseConditionSupportMode,
  normalizeFoundationSupportMode,
  normalizeRoofPrimitiveSupportMode,
  truthBucketFromMode,
} from "./constructionTruthModel.js";

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

export function buildSectionCutBandGeometry(sectionCut = {}, options = {}) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const directBandWidth = Number(options.directBand || 0.14);
  const directHalfBand = directBandWidth / 2;
  const contextualHalfBand = Number(options.nearBand || 0.9);
  return {
    axis,
    orthAxis: axis === "x" ? "y" : "x",
    coordinate: round(coordinate),
    direct: {
      minimum: round(coordinate - directHalfBand),
      maximum: round(coordinate + directHalfBand),
      width: round(directBandWidth),
    },
    contextual: {
      minimum: round(coordinate - contextualHalfBand),
      maximum: round(coordinate + contextualHalfBand),
      width: round(contextualHalfBand * 2),
    },
  };
}

function rangeBandRelationship(range = null, cutBand = null) {
  if (!range || !cutBand) {
    return {
      touchesDirect: false,
      touchesContextual: false,
      directOverlap: 0,
      contextualOverlap: 0,
      distanceToDirect: null,
    };
  }

  const directOverlap = Math.max(
    0,
    Math.min(Number(range.maximum), Number(cutBand.direct.maximum)) -
      Math.max(Number(range.minimum), Number(cutBand.direct.minimum)),
  );
  const contextualOverlap = Math.max(
    0,
    Math.min(Number(range.maximum), Number(cutBand.contextual.maximum)) -
      Math.max(Number(range.minimum), Number(cutBand.contextual.minimum)),
  );
  const touchesDirect =
    directOverlap > 0 ||
    (Number(range.minimum) >= Number(cutBand.direct.minimum) &&
      Number(range.maximum) <= Number(cutBand.direct.maximum));
  const touchesContextual =
    contextualOverlap > 0 ||
    (Number(range.minimum) >= Number(cutBand.contextual.minimum) &&
      Number(range.maximum) <= Number(cutBand.contextual.maximum));

  let distanceToDirect = 0;
  if (!touchesDirect) {
    distanceToDirect = Math.min(
      Math.abs(Number(range.minimum) - Number(cutBand.direct.maximum)),
      Math.abs(Number(range.maximum) - Number(cutBand.direct.minimum)),
    );
  }

  return {
    touchesDirect,
    touchesContextual,
    directOverlap: round(directOverlap),
    contextualOverlap: round(contextualOverlap),
    distanceToDirect: round(distanceToDirect),
  };
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

function resolveConstructionSupportMode(entity = {}, kind = "generic") {
  switch (String(kind || "generic")) {
    case "roof":
      return normalizeRoofPrimitiveSupportMode(entity);
    case "foundation":
      return normalizeFoundationSupportMode(entity);
    case "baseCondition":
      return normalizeBaseConditionSupportMode(entity);
    case "wall":
      return "exact_cut_relationship";
    case "opening":
      return "opening_cut_relationship";
    case "stair":
      return "stair_cut_relationship";
    case "slab":
      return "slab_cut_relationship";
    case "room":
      return "space_boundary_relationship";
    default:
      return "generic_cut_relationship";
  }
}

export function classifyClippedConstructionTruth({
  entity = {},
  kind = "generic",
  evidenceType = "unsupported",
  exactClip = false,
} = {}) {
  const supportMode = resolveConstructionSupportMode(entity, kind);
  const truthBucket = truthBucketFromMode(supportMode);

  if (["roof", "foundation", "baseCondition"].includes(String(kind || ""))) {
    if (evidenceType === "unsupported") {
      return {
        supportMode,
        constructionTruthState: "unsupported",
      };
    }
    if (evidenceType === "inferred") {
      return {
        supportMode,
        constructionTruthState:
          truthBucket === "unsupported" ? "unsupported" : "derived",
      };
    }
    if (evidenceType === "near") {
      return {
        supportMode,
        constructionTruthState:
          truthBucket === "unsupported"
            ? "unsupported"
            : truthBucket === "derived"
              ? "derived"
              : "contextual",
      };
    }
    return {
      supportMode,
      constructionTruthState:
        truthBucket === "direct"
          ? exactClip
            ? "direct"
            : "contextual"
          : truthBucket === "contextual"
            ? "contextual"
            : truthBucket === "derived"
              ? "derived"
              : "unsupported",
    };
  }

  if (evidenceType === "direct") {
    return { supportMode, constructionTruthState: "direct" };
  }
  if (evidenceType === "near") {
    return { supportMode, constructionTruthState: "contextual" };
  }
  if (evidenceType === "inferred") {
    return { supportMode, constructionTruthState: "derived" };
  }
  return { supportMode, constructionTruthState: "unsupported" };
}

function appendConstructionTruth(
  entity = {},
  entry = {},
  { kind = "generic", sectionCut = {}, options = {} } = {},
) {
  const classification = classifyClippedConstructionTruth({
    entity,
    kind,
    evidenceType: entry.evidenceType,
    exactClip: entry.exactClip,
  });
  return {
    ...entry,
    truthSupportMode: classification.supportMode,
    constructionTruthState: classification.constructionTruthState,
    cutBand: buildSectionCutBandGeometry(sectionCut, options),
  };
}

function collectPolygonBandSlice(polygon = [], cutBand = null) {
  if (!Array.isArray(polygon) || polygon.length < 3 || !cutBand) {
    return {
      slicePoints: [],
      sectionRange: null,
      directBandHit: false,
    };
  }

  const sampleCoordinates = unique([
    cutBand.direct.minimum,
    cutBand.coordinate,
    cutBand.direct.maximum,
  ]).sort((left, right) => left - right);
  const slicePoints = unique(
    sampleCoordinates.flatMap((coordinate) =>
      polygonIntersections(polygon, cutBand.axis, coordinate),
    ),
  ).sort((left, right) => left - right);
  const orthRange = axisRangeFromPoints(polygon, cutBand.orthAxis, "polygon");
  const midpoint =
    orthRange &&
    (cutBand.axis === "x"
      ? {
          x: cutBand.coordinate,
          y: round((Number(orthRange.minimum) + Number(orthRange.maximum)) / 2),
        }
      : {
          x: round((Number(orthRange.minimum) + Number(orthRange.maximum)) / 2),
          y: cutBand.coordinate,
        });
  const directBandHit =
    sampleCoordinates.some(
      (coordinate) =>
        polygonIntersections(polygon, cutBand.axis, coordinate).length >= 2,
    ) || pointInPolygon(midpoint, polygon);
  const sectionRange =
    slicePoints.length >= 2
      ? {
          start: Number(slicePoints[0]),
          end: Number(slicePoints[slicePoints.length - 1]),
        }
      : orthRange
        ? {
            start: Number(orthRange.minimum),
            end: Number(orthRange.maximum),
          }
        : null;

  return {
    slicePoints,
    sectionRange,
    directBandHit,
  };
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

function createUnsupportedEntry(
  entity = {},
  support = [],
  { kind = "generic", sectionCut = {}, options = {} } = {},
) {
  return appendConstructionTruth(
    entity,
    {
      ...entity,
      evidenceType: "unsupported",
      evidenceDistanceM: null,
      cutSpans: [],
      exactClip: false,
      clipPrimitive: "missing_geometry",
      clipGeometry: null,
      geometrySupport: unique(support.length ? support : ["missing_geometry"]),
    },
    { kind, sectionCut, options },
  );
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
  { kind = "generic", sectionCut = {}, options = {} } = {},
) {
  return appendConstructionTruth(
    entity,
    {
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
    },
    { kind, sectionCut, options },
  );
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

function clipSegmentEntity(
  entity = {},
  sectionCut = {},
  options = {},
  kind = "generic",
) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const cutBand = buildSectionCutBandGeometry(sectionCut, options);
  const axisRange = axisRangeFromEntity(entity, axis, {
    allowSegment: true,
    allowPolygon: false,
    allowBbox: false,
  });
  if (!axisRange) {
    return createUnsupportedEntry(entity, [], { kind, sectionCut, options });
  }

  const orthAxis = axis === "x" ? "y" : "x";
  const orthRange = axisRangeFromEntity(entity, orthAxis, {
    allowSegment: true,
    allowPolygon: false,
    allowBbox: false,
  });
  const bandRelationship = rangeBandRelationship(axisRange, cutBand);
  const alignedToCut =
    Math.abs(Number(axisRange.minimum) - coordinate) <=
      Number(options.directBand || 0.14) &&
    Math.abs(Number(axisRange.maximum) - coordinate) <=
      Number(options.directBand || 0.14);
  if (alignedToCut && orthRange) {
    return createEntry(
      entity,
      {
        evidenceType: "direct",
        distance: 0,
        cutSpans: [orthRange.minimum, orthRange.maximum],
        exactClip: true,
        clipPrimitive: "segment_aligned_to_cut_band",
        clipGeometry: {
          type: "segment_aligned_to_cut_band",
          cutCoordinate: round(coordinate),
          clipDepthM: Math.max(
            bandRelationship.directOverlap,
            Number(cutBand.direct.width || 0),
          ),
          cutBand,
          projectionRange: projectionRange(entity, axis),
          sectionRange: {
            start: round(orthRange.minimum),
            end: round(orthRange.maximum),
          },
        },
        geometrySupport: ["segment"],
      },
      { kind, sectionCut, options },
    );
  }

  const crossingPoint = cutPointFromSegment(entity, sectionCut);
  if (crossingPoint !== null) {
    return createEntry(
      entity,
      {
        evidenceType: "direct",
        distance: 0,
        cutSpans: [crossingPoint],
        exactClip: true,
        clipPrimitive: "segment_crossing_cut",
        clipGeometry: {
          type: "segment_crossing_cut",
          cutCoordinate: round(coordinate),
          cutPoint: crossingPoint,
          clipDepthM: Math.max(
            bandRelationship.directOverlap,
            Number(cutBand.direct.width || 0),
          ),
          cutBand,
          projectionRange: projectionRange(entity, axis),
          sectionRange: {
            start: crossingPoint,
            end: crossingPoint,
          },
        },
        geometrySupport: ["segment"],
      },
      { kind, sectionCut, options },
    );
  }

  const classification = bandRelationship.touchesContextual
    ? {
        evidenceType: "near",
        distance: bandRelationship.distanceToDirect,
        support: axisRange.support,
      }
    : classifyDistance(axisRange, coordinate, Number(options.nearBand || 0.9));
  return createEntry(
    entity,
    {
      evidenceType: classification.evidenceType,
      distance: classification.distance,
      cutSpans: [],
      exactClip: false,
      clipPrimitive: "segment_offset_from_cut",
      clipGeometry: {
        type: "segment_offset_from_cut",
        cutCoordinate: round(coordinate),
        clipDepthM: bandRelationship.contextualOverlap || 0,
        cutBand,
        projectionRange: projectionRange(entity, axis),
        sectionRange: orthRange
          ? {
              start: round(orthRange.minimum),
              end: round(orthRange.maximum),
            }
          : null,
      },
      geometrySupport: ["segment"],
    },
    { kind, sectionCut, options },
  );
}

function clipPolygonEntity(
  entity = {},
  sectionCut = {},
  options = {},
  kind = "generic",
) {
  const polygon = getPolygonPoints(entity);
  if (!polygon) {
    return createUnsupportedEntry(entity, [], { kind, sectionCut, options });
  }
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const cutBand = buildSectionCutBandGeometry(sectionCut, options);
  const axisRange = axisRangeFromPoints(polygon, axis, "polygon");
  const projection = projectionRange(entity, axis);
  const bandRelationship = rangeBandRelationship(axisRange, cutBand);
  const slice = collectPolygonBandSlice(polygon, cutBand);

  if (bandRelationship.touchesDirect && slice.directBandHit) {
    return createEntry(
      entity,
      {
        evidenceType: "direct",
        distance: 0,
        cutSpans: slice.slicePoints.length
          ? slice.slicePoints
          : slice.sectionRange
            ? [slice.sectionRange.start, slice.sectionRange.end]
            : [],
        exactClip: true,
        clipPrimitive: "polygon_band_slice",
        clipGeometry: {
          type: "polygon_band_slice",
          cutCoordinate: round(coordinate),
          clipDepthM: Math.max(
            bandRelationship.directOverlap,
            Number(cutBand.direct.width || 0),
          ),
          cutBand,
          projectionRange: projection,
          sectionRange: slice.sectionRange
            ? {
                start: round(slice.sectionRange.start),
                end: round(slice.sectionRange.end),
              }
            : null,
          slicePoints: slice.slicePoints,
        },
        geometrySupport: ["polygon"],
      },
      { kind, sectionCut, options },
    );
  }

  const classification = bandRelationship.touchesContextual
    ? {
        evidenceType: "near",
        distance: bandRelationship.distanceToDirect,
        support: axisRange.support,
      }
    : classifyDistance(axisRange, coordinate, Number(options.nearBand || 0.9));
  return createEntry(
    entity,
    {
      evidenceType: classification.evidenceType,
      distance: classification.distance,
      cutSpans: slice.slicePoints,
      exactClip: false,
      clipPrimitive: bandRelationship.touchesContextual
        ? "polygon_contextual_band"
        : "polygon_offset_from_cut",
      clipGeometry: {
        type: bandRelationship.touchesContextual
          ? "polygon_contextual_band"
          : "polygon_offset_from_cut",
        cutCoordinate: round(coordinate),
        clipDepthM: bandRelationship.contextualOverlap || 0,
        cutBand,
        projectionRange: projection,
        sectionRange: slice.sectionRange
          ? {
              start: round(slice.sectionRange.start),
              end: round(slice.sectionRange.end),
            }
          : null,
        slicePoints: slice.slicePoints,
      },
      geometrySupport: ["polygon"],
    },
    { kind, sectionCut, options },
  );
}

function clipBboxApproximation(
  entity = {},
  sectionCut = {},
  options = {},
  kind = "generic",
) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const cutBand = buildSectionCutBandGeometry(sectionCut, options);
  const axisRange = axisRangeFromEntity(entity, axis, {
    allowSegment: false,
    allowPolygon: false,
    allowBbox: true,
  });
  if (!axisRange) {
    return createUnsupportedEntry(entity, [], { kind, sectionCut, options });
  }
  const orthAxis = axis === "x" ? "y" : "x";
  const orthRange = axisRangeFromEntity(entity, orthAxis, {
    allowSegment: false,
    allowPolygon: false,
    allowBbox: true,
  });
  const bandRelationship = rangeBandRelationship(axisRange, cutBand);
  const classification = bandRelationship.touchesContextual
    ? {
        evidenceType: "near",
        distance: bandRelationship.distanceToDirect,
        support: axisRange.support,
      }
    : classifyDistance(axisRange, coordinate, Number(options.nearBand || 0.9), {
        insideAsNear: true,
      });
  return createEntry(
    entity,
    {
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
        cutBand,
        projectionRange: projectionRange(entity, axis),
        sectionRange: orthRange
          ? {
              start: round(orthRange.minimum),
              end: round(orthRange.maximum),
            }
          : null,
      },
      geometrySupport: ["bbox"],
    },
    { kind, sectionCut, options },
  );
}

export function clipRoomToSection(entity = {}, sectionCut = {}, options = {}) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(entity, sectionCut, options, "room")
    : clipBboxApproximation(entity, sectionCut, options, "room");
}

export function clipStairToSection(entity = {}, sectionCut = {}, options = {}) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(entity, sectionCut, options, "stair")
    : clipBboxApproximation(entity, sectionCut, options, "stair");
}

export function clipSlabToSection(entity = {}, sectionCut = {}, options = {}) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(entity, sectionCut, options, "slab")
    : clipBboxApproximation(entity, sectionCut, options, "slab");
}

export function clipRoofElementToSection(
  entity = {},
  sectionCut = {},
  options = {},
) {
  const enableDeeperClipping = isFeatureEnabled(
    "useDeeperRoofFoundationClippingPhase17",
  );
  return getPolygonPoints(entity)
    ? clipPolygonEntity(
        entity,
        sectionCut,
        {
          ...options,
          nearBand: Number(options.nearBand || 1.1),
        },
        "roof",
      )
    : enableDeeperClipping &&
        normalizePoint(entity.start) &&
        normalizePoint(entity.end)
      ? clipSegmentEntity(
          entity,
          sectionCut,
          {
            ...options,
            nearBand: Number(options.nearBand || 1.1),
          },
          "roof",
        )
      : clipBboxApproximation(
          entity,
          sectionCut,
          {
            ...options,
            nearBand: Number(options.nearBand || 1.1),
          },
          "roof",
        );
}

export function clipFoundationToSection(
  entity = {},
  sectionCut = {},
  options = {},
) {
  return getPolygonPoints(entity)
    ? clipPolygonEntity(
        entity,
        sectionCut,
        {
          ...options,
          nearBand: Number(options.nearBand || 1),
        },
        entity.condition_type ? "baseCondition" : "foundation",
      )
    : normalizePoint(entity.start) && normalizePoint(entity.end)
      ? clipSegmentEntity(
          entity,
          sectionCut,
          {
            ...options,
            nearBand: Number(options.nearBand || 1),
          },
          entity.condition_type ? "baseCondition" : "foundation",
        )
      : clipBboxApproximation(
          entity,
          sectionCut,
          {
            ...options,
            nearBand: Number(options.nearBand || 1),
          },
          entity.condition_type ? "baseCondition" : "foundation",
        );
}

export function clipWallToSection(entity = {}, sectionCut = {}, options = {}) {
  if (normalizePoint(entity.start) && normalizePoint(entity.end)) {
    return clipSegmentEntity(entity, sectionCut, options, "wall");
  }
  if (getPolygonPoints(entity)) {
    return clipPolygonEntity(entity, sectionCut, options, "wall");
  }
  return clipBboxApproximation(entity, sectionCut, options, "wall");
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
  const cutBand = buildSectionCutBandGeometry(sectionCut, options);
  const point =
    normalizePoint(opening.position_m) ||
    normalizePoint(opening.position) ||
    normalizePoint({ x: opening.x, y: opening.y });
  const nearBand = Number(options.nearBand || 0.9);
  const distance = pointDistanceToCut(point, sectionCut);
  const sectionPosition = pointAlongSection(point, sectionCut);
  const width = Number(opening.width_m || 0);
  const openingDirect =
    point &&
    ((sectionCut.axis || "x") === "x"
      ? point.x >= cutBand.direct.minimum && point.x <= cutBand.direct.maximum
      : point.y >= cutBand.direct.minimum && point.y <= cutBand.direct.maximum);
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
    return createEntry(
      opening,
      {
        evidenceType: "direct",
        distance: 0,
        cutSpans: wallClip?.cutSpans || [],
        exactClip: true,
        clipPrimitive: "opening_on_cut_wall",
        clipGeometry: {
          type: "opening_on_cut_wall",
          cutCoordinate:
            wallClip?.clipGeometry?.cutCoordinate ??
            round(sectionCut.coordinate),
          cutBand,
          sectionRange: wallClip?.clipGeometry?.sectionRange || null,
          sectionPositionM:
            sectionPosition === null ? null : round(sectionPosition),
          widthM: round(width),
          sillHeightM: round(opening.sill_height_m || 0),
          headHeightM: round(opening.head_height_m || 2.1),
        },
        geometrySupport: unique([
          "point",
          ...(wallClip?.geometrySupport || []),
        ]),
      },
      { kind: "opening", sectionCut, options },
    );
  }

  if (wallContextual && openingNear) {
    return createEntry(
      opening,
      {
        evidenceType: "near",
        distance,
        cutSpans: wallClip?.cutSpans || [],
        exactClip: false,
        clipPrimitive: "opening_near_cut",
        clipGeometry: {
          type: "opening_near_cut",
          cutCoordinate:
            wallClip?.clipGeometry?.cutCoordinate ??
            round(sectionCut.coordinate),
          cutBand,
          sectionRange: wallClip?.clipGeometry?.sectionRange || null,
          sectionPositionM:
            sectionPosition === null ? null : round(sectionPosition),
          widthM: round(width),
          sillHeightM: round(opening.sill_height_m || 0),
          headHeightM: round(opening.head_height_m || 2.1),
        },
        geometrySupport: unique([
          "point",
          ...(wallClip?.geometrySupport || []),
        ]),
      },
      { kind: "opening", sectionCut, options },
    );
  }

  if (distance !== null || wallClip) {
    return createEntry(
      opening,
      {
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
            wallClip?.clipGeometry?.cutCoordinate ??
            round(sectionCut.coordinate),
          cutBand,
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
      },
      { kind: "opening", sectionCut, options },
    );
  }

  return createUnsupportedEntry(opening, [], {
    kind: "opening",
    sectionCut,
    options,
  });
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

export function summarizeSectionConstructionTruth(entries = []) {
  const direct = (entries || []).filter(
    (entry) => entry.constructionTruthState === "direct",
  );
  const contextual = (entries || []).filter(
    (entry) => entry.constructionTruthState === "contextual",
  );
  const derived = (entries || []).filter(
    (entry) => entry.constructionTruthState === "derived",
  );
  const unsupported = (entries || []).filter(
    (entry) => entry.constructionTruthState === "unsupported",
  );
  return {
    totalCount: (entries || []).length,
    directCount: direct.length,
    contextualCount: contextual.length,
    derivedCount: derived.length,
    unsupportedCount: unsupported.length,
    exactClipCount: (entries || []).filter((entry) => entry.exactClip === true)
      .length,
    supportModes: unique(
      (entries || []).map((entry) => entry.truthSupportMode),
    ),
    primitiveFamilies: unique(
      (entries || []).map(
        (entry) =>
          entry.primitive_family ||
          entry.foundation_type ||
          entry.condition_type ||
          entry.type ||
          null,
      ),
    ),
  };
}

export function clipConstructionPrimitivesToSection(
  entries = [],
  clipper = (entry) => entry,
  sectionCut = {},
  options = {},
) {
  const clippedEntries = (entries || []).map((entry) =>
    clipper(entry, sectionCut, options),
  );
  return {
    entries: clippedEntries,
    summary: summarizeSectionConstructionTruth(clippedEntries),
  };
}

export default {
  normalizePoint,
  getBbox,
  getPolygonPoints,
  axisRangeFromEntity,
  axisRangeFromPoints,
  buildSectionCutBandGeometry,
  pointInPolygon,
  polygonIntersections,
  classifyClippedConstructionTruth,
  clipRoomToSection,
  clipStairToSection,
  clipSlabToSection,
  clipRoofElementToSection,
  clipFoundationToSection,
  clipWallToSection,
  clipOpeningToSection,
  clipConstructionPrimitivesToSection,
  bucketByEvidence,
  collectSupportSummary,
  countExactClips,
  summarizeSectionConstructionTruth,
};
