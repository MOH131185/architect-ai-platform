import { roundMetric } from "../cad/projectGeometrySchema.js";

function edgeKey(from, to) {
  return [from, to].sort().join("::");
}

function roomBbox(room = {}) {
  return (
    room.bbox || {
      min_x: room.x_m || 0,
      min_y: room.y_m || 0,
      max_x: (room.x_m || 0) + (room.width_m || 0),
      max_y: (room.y_m || 0) + (room.depth_m || 0),
      width: room.width_m || 0,
      height: room.depth_m || 0,
    }
  );
}

function sharedBoundaryLength(a = {}, b = {}) {
  const boxA = roomBbox(a);
  const boxB = roomBbox(b);
  const epsilon = 0.01;
  const overlapY =
    Math.min(boxA.max_y, boxB.max_y) - Math.max(boxA.min_y, boxB.min_y);
  const overlapX =
    Math.min(boxA.max_x, boxB.max_x) - Math.max(boxA.min_x, boxB.min_x);

  if (
    Math.abs(boxA.max_x - boxB.min_x) <= epsilon ||
    Math.abs(boxB.max_x - boxA.min_x) <= epsilon
  ) {
    return Math.max(0, overlapY);
  }

  if (
    Math.abs(boxA.max_y - boxB.min_y) <= epsilon ||
    Math.abs(boxB.max_y - boxA.min_y) <= epsilon
  ) {
    return Math.max(0, overlapX);
  }

  return 0;
}

function centroidDistance(a = {}, b = {}) {
  const centerA = a.centroid || {
    x: (roomBbox(a).min_x + roomBbox(a).max_x) / 2,
    y: (roomBbox(a).min_y + roomBbox(a).max_y) / 2,
  };
  const centerB = b.centroid || {
    x: (roomBbox(b).min_x + roomBbox(b).max_x) / 2,
    y: (roomBbox(b).min_y + roomBbox(b).max_y) / 2,
  };

  return Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
}

export function buildAdjacencyGraph(program = []) {
  const nodes = program.map((room) => ({
    id: room.id,
    name: room.name,
    type: room.type,
    privacy_level: room.privacy_level,
    wet_zone: room.wet_zone === true,
  }));
  const edgeMap = new Map();

  program.forEach((room) => {
    (room.adjacency_preferences || []).forEach((preference) => {
      if (!preference?.target) return;
      const key = edgeKey(room.id, preference.target);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          id: key,
          from: room.id,
          to: preference.target,
          weight: Number(preference.weight || 1),
          type: preference.type || "preferred",
        });
      } else {
        edgeMap.get(key).weight = Math.max(
          edgeMap.get(key).weight,
          Number(preference.weight || 1),
        );
      }
    });
  });

  return {
    nodes,
    edges: [...edgeMap.values()],
    stats: {
      node_count: nodes.length,
      edge_count: edgeMap.size,
    },
  };
}

export function scoreAdjacencySolution(graph = {}, layout = {}) {
  const rooms = Array.isArray(layout.rooms)
    ? layout.rooms
    : Array.isArray(layout.projectGeometry?.rooms)
      ? layout.projectGeometry.rooms
      : [];
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  const scoredEdges = edges.map((edge) => {
    const fromRoom = roomMap.get(edge.from);
    const toRoom = roomMap.get(edge.to);
    const sharedLength =
      fromRoom && toRoom ? sharedBoundaryLength(fromRoom, toRoom) : 0;
    const distance =
      fromRoom && toRoom
        ? centroidDistance(fromRoom, toRoom)
        : Number.POSITIVE_INFINITY;
    const satisfied = sharedLength > 0.05;
    return {
      ...edge,
      satisfied,
      shared_boundary_m: roundMetric(sharedLength),
      centroid_distance_m: roundMetric(
        Number.isFinite(distance) ? distance : 0,
      ),
    };
  });

  const totalWeight = scoredEdges.reduce((sum, edge) => sum + edge.weight, 0);
  const satisfiedWeight = scoredEdges
    .filter((edge) => edge.satisfied)
    .reduce((sum, edge) => sum + edge.weight, 0);

  return {
    score: totalWeight > 0 ? roundMetric(satisfiedWeight / totalWeight) : 1,
    satisfied_edge_count: scoredEdges.filter((edge) => edge.satisfied).length,
    unsatisfied_edge_count: scoredEdges.filter((edge) => !edge.satisfied)
      .length,
    edges: scoredEdges,
  };
}

export function explainAdjacencyConflicts(graph = {}, layout = {}) {
  const scoring = scoreAdjacencySolution(graph, layout);
  return scoring.edges
    .filter((edge) => !edge.satisfied)
    .map((edge) => ({
      edge_id: edge.id,
      from: edge.from,
      to: edge.to,
      severity: edge.weight >= 1 ? "high" : "medium",
      explanation: `Rooms "${edge.from}" and "${edge.to}" do not share a boundary in the current layout.`,
      suggested_repair:
        "Repack rooms so the pair shares a wall or move them closer within the same zone band.",
      centroid_distance_m: edge.centroid_distance_m,
    }));
}

export default {
  buildAdjacencyGraph,
  scoreAdjacencySolution,
  explainAdjacencyConflicts,
};
