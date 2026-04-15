import {
  buildAdjacencyGraph,
  scoreAdjacencySolution,
} from "../../services/floorplan/adjacencyGraphBuilder.js";

describe("adjacencyGraphBuilder Phase 2", () => {
  test("creates weighted adjacency edges and scores a matching layout", () => {
    const rooms = [
      {
        id: "living",
        name: "Living Room",
        adjacency_preferences: [{ target: "kitchen", weight: 1 }],
      },
      {
        id: "kitchen",
        name: "Kitchen",
        adjacency_preferences: [{ target: "living", weight: 1 }],
      },
    ];
    const graph = buildAdjacencyGraph(rooms);
    const score = scoreAdjacencySolution(graph, {
      rooms: [
        {
          id: "living",
          bbox: { min_x: 0, min_y: 0, max_x: 5, max_y: 4 },
          centroid: { x: 2.5, y: 2 },
        },
        {
          id: "kitchen",
          bbox: { min_x: 5, min_y: 0, max_x: 9, max_y: 4 },
          centroid: { x: 7, y: 2 },
        },
      ],
    });

    expect(graph.edges).toHaveLength(1);
    expect(score.score).toBe(1);
    expect(score.satisfied_edge_count).toBe(1);
  });
});
