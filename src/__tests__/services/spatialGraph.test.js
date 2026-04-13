import {
  flattenSpatialGraphRooms,
  validateSpatialGraph,
} from "../../schemas/spatialGraph.js";

function createGraph(overrides = {}) {
  return {
    building: {
      type: "residential",
      floors: [
        {
          level: 0,
          height_m: 3,
          rooms: [
            {
              id: "living_room",
              type: "living",
              area_m2: 24,
              min_width_m: 4,
              min_length_m: 5,
              adjacencies: ["kitchen", "hallway"],
              orientation: "south",
              natural_light: true,
            },
            {
              id: "kitchen",
              type: "kitchen",
              area_m2: 14,
              min_width_m: 3,
              min_length_m: 3,
              adjacencies: ["living_room", "hallway"],
              orientation: "east",
              natural_light: true,
            },
            {
              id: "hallway",
              type: "hallway",
              area_m2: 10,
              min_width_m: 1.2,
              min_length_m: 3,
              adjacencies: ["living_room", "kitchen", "bedroom_1", "bathroom"],
              orientation: "any",
              natural_light: false,
            },
            {
              id: "bedroom_1",
              type: "bedroom",
              area_m2: 15,
              min_width_m: 3,
              min_length_m: 3,
              adjacencies: ["hallway"],
              orientation: "south",
              natural_light: true,
            },
            {
              id: "bathroom",
              type: "bathroom",
              area_m2: 7,
              min_width_m: 2.2,
              min_length_m: 2.2,
              adjacencies: ["hallway"],
              orientation: "any",
              natural_light: false,
            },
          ],
          circulation: {
            entry_from: "street",
            vertical: [],
            corridors: true,
          },
        },
      ],
      envelope: {
        width_m: 12,
        depth_m: 10,
        style: "modern",
        roof_type: "flat",
      },
    },
    ...overrides,
  };
}

describe("spatialGraph validation", () => {
  test("validates a complete residential graph", () => {
    const graph = createGraph();
    const result = validateSpatialGraph(graph);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(flattenSpatialGraphRooms(graph)).toHaveLength(5);
  });

  test("fails on missing adjacency references", () => {
    const graph = createGraph();
    graph.building.floors[0].rooms[0].adjacencies.push("ghost_room");

    const result = validateSpatialGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("ghost_room");
  });

  test("fails when floor area exceeds envelope area", () => {
    const graph = createGraph();
    graph.building.envelope.width_m = 5;
    graph.building.envelope.depth_m = 5;

    const result = validateSpatialGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("exceeds envelope area");
  });
});
