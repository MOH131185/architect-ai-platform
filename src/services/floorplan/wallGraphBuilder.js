import {
  buildBoundingBoxFromRect,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { createWallGeometry } from "../cad/geometryFactory.js";

const EPSILON = 0.01;

function getRoomBbox(room = {}) {
  return (
    room.bbox || {
      min_x: roundMetric(room.x || room.x_m || 0),
      min_y: roundMetric(room.y || room.y_m || 0),
      max_x: roundMetric(
        (room.x || room.x_m || 0) + (room.width || room.width_m || 0),
      ),
      max_y: roundMetric(
        (room.y || room.y_m || 0) + (room.height || room.depth_m || 0),
      ),
      width: roundMetric(room.width || room.width_m || 0),
      height: roundMetric(room.height || room.depth_m || 0),
    }
  );
}

function isSameCoordinate(a, b) {
  return Math.abs(Number(a) - Number(b)) <= EPSILON;
}

function buildSegment(start, end) {
  const orientation = isSameCoordinate(start.x, end.x)
    ? "vertical"
    : "horizontal";
  const length = isSameCoordinate(start.x, end.x)
    ? Math.abs(end.y - start.y)
    : Math.abs(end.x - start.x);

  return {
    start: {
      x: roundMetric(start.x),
      y: roundMetric(start.y),
    },
    end: {
      x: roundMetric(end.x),
      y: roundMetric(end.y),
    },
    orientation,
    length_m: roundMetric(length),
    bbox: buildBoundingBoxFromRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.max(EPSILON, Math.abs(end.x - start.x)),
      Math.max(EPSILON, Math.abs(end.y - start.y)),
    ),
  };
}

function overlap1d(minA, maxA, minB, maxB) {
  return {
    min: Math.max(minA, minB),
    max: Math.min(maxA, maxB),
  };
}

function buildInteriorWallCandidate(roomA, roomB) {
  const bboxA = getRoomBbox(roomA);
  const bboxB = getRoomBbox(roomB);

  if (
    isSameCoordinate(bboxA.max_x, bboxB.min_x) ||
    isSameCoordinate(bboxB.max_x, bboxA.min_x)
  ) {
    const overlap = overlap1d(
      bboxA.min_y,
      bboxA.max_y,
      bboxB.min_y,
      bboxB.max_y,
    );
    if (overlap.max - overlap.min > EPSILON) {
      const x = isSameCoordinate(bboxA.max_x, bboxB.min_x)
        ? bboxA.max_x
        : bboxB.max_x;
      return buildSegment({ x, y: overlap.min }, { x, y: overlap.max });
    }
  }

  if (
    isSameCoordinate(bboxA.max_y, bboxB.min_y) ||
    isSameCoordinate(bboxB.max_y, bboxA.min_y)
  ) {
    const overlap = overlap1d(
      bboxA.min_x,
      bboxA.max_x,
      bboxB.min_x,
      bboxB.max_x,
    );
    if (overlap.max - overlap.min > EPSILON) {
      const y = isSameCoordinate(bboxA.max_y, bboxB.min_y)
        ? bboxA.max_y
        : bboxB.max_y;
      return buildSegment({ x: overlap.min, y }, { x: overlap.max, y });
    }
  }

  return null;
}

function buildExteriorSegmentsForRoom(room, footprintBbox = {}) {
  const bbox = getRoomBbox(room);
  const segments = [];

  if (isSameCoordinate(bbox.min_x, footprintBbox.min_x)) {
    segments.push({
      side: "west",
      ...buildSegment(
        { x: bbox.min_x, y: bbox.min_y },
        { x: bbox.min_x, y: bbox.max_y },
      ),
    });
  }
  if (isSameCoordinate(bbox.max_x, footprintBbox.max_x)) {
    segments.push({
      side: "east",
      ...buildSegment(
        { x: bbox.max_x, y: bbox.min_y },
        { x: bbox.max_x, y: bbox.max_y },
      ),
    });
  }
  if (isSameCoordinate(bbox.min_y, footprintBbox.min_y)) {
    segments.push({
      side: "north",
      ...buildSegment(
        { x: bbox.min_x, y: bbox.min_y },
        { x: bbox.max_x, y: bbox.min_y },
      ),
    });
  }
  if (isSameCoordinate(bbox.max_y, footprintBbox.max_y)) {
    segments.push({
      side: "south",
      ...buildSegment(
        { x: bbox.min_x, y: bbox.max_y },
        { x: bbox.max_x, y: bbox.max_y },
      ),
    });
  }

  return segments;
}

export function buildWallGraph(level = {}, options = {}) {
  const rooms = Array.isArray(level.rooms) ? level.rooms : [];
  const projectId = options.projectId || level.project_id || "phase2-project";
  const levelId =
    options.levelId || level.id || `level-${level.level_number || 0}`;
  const footprintBbox = level.buildable_bbox ||
    level.footprint_bbox ||
    options.buildableBBox || {
      min_x: 0,
      min_y: 0,
      max_x: 0,
      max_y: 0,
    };

  const walls = [];

  for (let leftIndex = 0; leftIndex < rooms.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rooms.length;
      rightIndex += 1
    ) {
      const segment = buildInteriorWallCandidate(
        rooms[leftIndex],
        rooms[rightIndex],
      );
      if (!segment || segment.length_m <= 0.2) {
        continue;
      }

      walls.push(
        createWallGeometry(projectId, levelId, {
          ...segment,
          room_ids: [rooms[leftIndex].id, rooms[rightIndex].id],
          exterior: false,
          kind: "interior",
          source: "wall-graph-builder",
        }),
      );
    }
  }

  rooms.forEach((room, index) => {
    buildExteriorSegmentsForRoom(room, footprintBbox).forEach(
      (segment, segmentIndex) => {
        walls.push(
          createWallGeometry(projectId, levelId, {
            ...segment,
            room_ids: [room.id],
            exterior: true,
            kind: "exterior",
            side: segment.side,
            source: "wall-graph-builder",
            id: `${room.id}-ext-wall-${segment.side}-${segmentIndex}-${index}`,
          }),
        );
      },
    );
  });

  return {
    walls,
    stats: {
      wall_count: walls.length,
      interior_wall_count: walls.filter((wall) => !wall.exterior).length,
      exterior_wall_count: walls.filter((wall) => wall.exterior).length,
    },
  };
}

export default {
  buildWallGraph,
};
