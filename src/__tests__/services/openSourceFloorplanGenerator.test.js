import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";

describe("floorplanGenerator", () => {
  test("generates deterministic structured layouts from a room program", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "test-house",
      level_count: 2,
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        {
          id: "living",
          name: "Living Room",
          target_area_m2: 24,
          zone: "public",
          adjacency: ["kitchen"],
        },
        {
          id: "kitchen",
          name: "Kitchen",
          target_area_m2: 16,
          zone: "public",
          adjacency: ["living"],
        },
        {
          id: "bed-1",
          name: "Bedroom 1",
          target_area_m2: 15,
          zone: "private",
          level: 1,
        },
        {
          id: "bath-1",
          name: "Bathroom",
          target_area_m2: 8,
          zone: "private",
          level: 1,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.layout.levels).toHaveLength(2);
    expect(result.layout.adjacency_graph.nodes.length).toBeGreaterThan(0);
    expect(result.layout.levels[0].core).toBeDefined();
    expect(result.layout.levels[1].stairs).toHaveLength(1);
  });
});
