import {
  buildBoundingBoxFromRect,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function scoreRoomProportion(room = {}) {
  const width = Number(room.width_m || room.width || room.bbox?.width || 0);
  const depth = Number(room.depth_m || room.height || room.bbox?.height || 0);
  const longSide = Math.max(width, depth, 0.001);
  const shortSide = Math.max(Math.min(width, depth), 0.001);
  const aspectRatio = longSide / shortSide;

  if (aspectRatio <= 1.8) return 1;
  if (aspectRatio <= 2.4) return roundMetric(0.9 - (aspectRatio - 1.8) * 0.2);
  if (aspectRatio <= 3.2) return roundMetric(0.78 - (aspectRatio - 2.4) * 0.2);
  return 0.45;
}

function desiredPrimaryDimension(room = {}, crossDimension = 0, options = {}) {
  const minRatio = options.minAspectRatio || 0.7;
  const maxRatio = options.maxAspectRatio || 2.8;
  const base =
    Number(room.target_area || room.target_area_m2 || 12) /
    Math.max(crossDimension, 1);
  const areaMinPrimary =
    Number(room.min_area || room.min_area_m2 || 0) /
    Math.max(crossDimension, 1);
  const areaMaxPrimary =
    Number(room.max_area || room.max_area_m2 || room.target_area || 12) /
    Math.max(crossDimension, 1);
  const minPrimary = Math.max(2.2, crossDimension * minRatio, areaMinPrimary);
  const maxPrimary = Math.max(
    minPrimary,
    crossDimension * maxRatio,
    areaMaxPrimary,
  );
  const daylightBias =
    options.daylightPriority && room.requires_daylight ? 1.06 : 1;
  const wetBias = options.wetZonePriority && room.wet_zone ? 1.04 : 1;
  return clamp(
    roundMetric(base * daylightBias * wetBias),
    minPrimary,
    maxPrimary,
  );
}

function normalizeSequenceSizes(sizes = [], available = 0) {
  const total = sizes.reduce((sum, size) => sum + size, 0) || 1;
  const scaleFactor = total > available ? available / total : 1;
  return sizes.map((size) => roundMetric(size * scaleFactor));
}

function placeAcrossSegments(
  rooms = [],
  sizes = [],
  container = {},
  axis = "x",
  segments = [],
) {
  const usableSegments = segments.length
    ? segments.map((segment) => ({
        ...segment,
        cursor:
          axis === "x"
            ? Number(segment.min_x)
            : Number(container.min_y ?? container.y ?? 0),
      }))
    : [
        {
          min_x: Number(container.x ?? container.min_x ?? 0),
          max_x:
            Number(container.x ?? container.min_x ?? 0) +
            Number(container.width || 0),
          cursor:
            axis === "x"
              ? Number(container.x ?? container.min_x ?? 0)
              : Number(container.y ?? container.min_y ?? 0),
        },
      ];
  let segmentIndex = 0;

  return rooms.map((room, index) => {
    const primary = Number(sizes[index] || 0);
    while (
      axis === "x" &&
      segmentIndex < usableSegments.length - 1 &&
      usableSegments[segmentIndex].cursor + primary >
        Number(usableSegments[segmentIndex].max_x)
    ) {
      segmentIndex += 1;
    }

    const segment = usableSegments[segmentIndex];
    const crossStart =
      axis === "x"
        ? Number(container.y ?? container.min_y ?? 0)
        : Number(segment.min_x ?? container.x ?? container.min_x ?? 0);
    const primaryStart = Number(segment.cursor);
    const width = axis === "x" ? primary : Number(container.width || 0);
    const depth =
      axis === "x" ? Number(container.depth || container.height || 0) : primary;
    const x = axis === "x" ? primaryStart : crossStart;
    const y = axis === "x" ? crossStart : primaryStart;
    segment.cursor = roundMetric(primaryStart + primary);

    return {
      ...room,
      actual_area: roundMetric(width * depth),
      bbox: buildBoundingBoxFromRect(x, y, width, depth),
      polygon: rectangleToPolygon(x, y, width, depth),
      centroid: {
        x: roundMetric(x + width / 2),
        y: roundMetric(y + depth / 2),
      },
      x,
      y,
      width,
      height: depth,
      width_m: roundMetric(width),
      depth_m: roundMetric(depth),
    };
  });
}

export function optimizeLinearRoomShapes(
  rooms = [],
  container = {},
  options = {},
) {
  if (!rooms.length) return [];

  const axis = options.axis || "x";
  const crossDimension =
    axis === "x"
      ? Number(container.depth || container.height || 0)
      : Number(container.width || 0);
  const availablePrimary =
    axis === "x"
      ? Number(container.width || 0)
      : Number(container.depth || container.height || 0);
  const desiredSizes = rooms.map((room) =>
    desiredPrimaryDimension(room, crossDimension, options),
  );
  const normalizedSizes = normalizeSequenceSizes(
    desiredSizes,
    availablePrimary,
  );

  return placeAcrossSegments(
    rooms,
    normalizedSizes,
    container,
    axis,
    options.segments || [],
  );
}

export function scoreRoomShapeCollection(rooms = []) {
  if (!rooms.length) {
    return {
      score: 1,
      average: 1,
      rooms: [],
    };
  }

  const roomScores = rooms.map((room) => ({
    room_id: room.id,
    score: scoreRoomProportion(room),
  }));
  const average =
    roomScores.reduce((sum, room) => sum + room.score, 0) / roomScores.length;

  return {
    score: roundMetric(average),
    average: roundMetric(average),
    rooms: roomScores,
  };
}

export default {
  optimizeLinearRoomShapes,
  scoreRoomProportion,
  scoreRoomShapeCollection,
};
