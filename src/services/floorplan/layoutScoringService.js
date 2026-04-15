import { roundMetric } from "../cad/projectGeometrySchema.js";
import { scoreAdjacencySolution } from "./adjacencyGraphBuilder.js";
import { scoreCorridorQuality } from "./corridorQualityService.js";
import { scoreRoomShapeCollection } from "./roomShapeOptimizer.js";

function roomTouchesExterior(room = {}, buildableBbox = {}) {
  const bbox = room.bbox || {};
  return (
    Math.abs(Number(bbox.min_x || 0) - Number(buildableBbox.min_x || 0)) <=
      0.02 ||
    Math.abs(Number(bbox.max_x || 0) - Number(buildableBbox.max_x || 0)) <=
      0.02 ||
    Math.abs(Number(bbox.min_y || 0) - Number(buildableBbox.min_y || 0)) <=
      0.02 ||
    Math.abs(Number(bbox.max_y || 0) - Number(buildableBbox.max_y || 0)) <= 0.02
  );
}

function scoreEnvelopeFit(layout = {}) {
  const buildableBbox = layout.buildable_bbox || {};
  const rooms = (layout.levels || []).flatMap((level) => level.rooms || []);
  if (!rooms.length) return { score: 1, outsideRoomCount: 0 };

  const outsideRoomCount = rooms.filter((room) => {
    const bbox = room.bbox || {};
    return (
      Number(bbox.min_x || 0) < Number(buildableBbox.min_x || 0) - 0.01 ||
      Number(bbox.max_x || 0) > Number(buildableBbox.max_x || 0) + 0.01 ||
      Number(bbox.min_y || 0) < Number(buildableBbox.min_y || 0) - 0.01 ||
      Number(bbox.max_y || 0) > Number(buildableBbox.max_y || 0) + 0.01
    );
  }).length;

  return {
    score: roundMetric(
      Math.max(0, 1 - outsideRoomCount / Math.max(rooms.length, 1)),
    ),
    outsideRoomCount,
  };
}

function scoreDaylightSuitability(layout = {}) {
  const buildableBbox = layout.buildable_bbox || {};
  const rooms = (layout.levels || []).flatMap((level) => level.rooms || []);
  const targetRooms = rooms.filter((room) => room.requires_daylight);
  if (!targetRooms.length) {
    return {
      score: 1,
      suitedRoomCount: 0,
      targetRoomCount: 0,
    };
  }

  const suitedRoomCount = targetRooms.filter((room) =>
    roomTouchesExterior(room, buildableBbox),
  ).length;
  return {
    score: roundMetric(suitedRoomCount / targetRooms.length),
    suitedRoomCount,
    targetRoomCount: targetRooms.length,
  };
}

function centroid(room = {}) {
  return {
    x: Number(room.centroid?.x || 0),
    y: Number(room.centroid?.y || 0),
  };
}

function distance(a = {}, b = {}) {
  return Math.hypot(
    Number(a.x || 0) - Number(b.x || 0),
    Number(a.y || 0) - Number(b.y || 0),
  );
}

function scoreWetZoneStacking(layout = {}) {
  const levels = [...(layout.levels || [])].sort(
    (left, right) =>
      Number(left.level_number || 0) - Number(right.level_number || 0),
  );
  if (levels.length <= 1) {
    return {
      score: 1,
      stackedPairs: 0,
      checkedPairs: 0,
    };
  }

  let checkedPairs = 0;
  let stackedPairs = 0;

  levels.slice(1).forEach((level) => {
    const currentWet = (level.rooms || []).filter((room) => room.wet_zone);
    const below = levels.find(
      (candidate) =>
        Number(candidate.level_number || 0) ===
        Number(level.level_number || 0) - 1,
    );
    const belowWet = (below?.rooms || []).filter((room) => room.wet_zone);

    currentWet.forEach((room) => {
      if (!belowWet.length) return;
      checkedPairs += 1;
      const nearestDistance = belowWet
        .map((candidate) => distance(centroid(room), centroid(candidate)))
        .sort((left, right) => left - right)[0];
      if (nearestDistance <= 4.5) {
        stackedPairs += 1;
      }
    });
  });

  return {
    score: checkedPairs ? roundMetric(stackedPairs / checkedPairs) : 1,
    stackedPairs,
    checkedPairs,
  };
}

export function scoreLayoutCandidate(layout = {}, context = {}) {
  const adjacency = scoreAdjacencySolution(context.adjacencyGraph || {}, {
    rooms: (layout.levels || []).flatMap((level) => level.rooms || []),
  });
  const corridor = scoreCorridorQuality(layout);
  const shape = scoreRoomShapeCollection(
    (layout.levels || [])
      .flatMap((level) => level.rooms || [])
      .filter((room) => room.type !== "stair_core"),
  );
  const fit = scoreEnvelopeFit(layout);
  const daylight = scoreDaylightSuitability(layout);
  const wetStacking = scoreWetZoneStacking(layout);

  const weightedScore = roundMetric(
    adjacency.score * 0.28 +
      corridor.score * 0.18 +
      shape.score * 0.18 +
      fit.score * 0.14 +
      daylight.score * 0.12 +
      wetStacking.score * 0.1,
  );

  return {
    score: weightedScore,
    metrics: {
      adjacency,
      corridor,
      shape,
      fit,
      daylight,
      wetStacking,
    },
  };
}

export default {
  scoreLayoutCandidate,
};
