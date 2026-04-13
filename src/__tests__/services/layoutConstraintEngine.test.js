import {
  applyLayoutConstraints,
  buildAdjacencyGraph,
  validateProgram,
} from "../../services/floorplan/layoutConstraintEngine.js";

describe("layoutConstraintEngine", () => {
  test("validates and normalizes a simple room program", () => {
    const validation = validateProgram([
      {
        id: "living",
        name: "Living Room",
        target_area_m2: 24,
        adjacency: ["kitchen"],
      },
      {
        id: "kitchen",
        name: "Kitchen",
        target_area_m2: 16,
        adjacency: ["living"],
      },
    ]);

    expect(validation.isValid).toBe(true);
    expect(validation.normalizedProgram[0].zone).toBe("public");
  });

  test("builds a deduplicated adjacency graph", () => {
    const graph = buildAdjacencyGraph([
      {
        id: "living",
        name: "Living",
        zone: "public",
        level: 0,
        adjacency: ["kitchen"],
      },
      {
        id: "kitchen",
        name: "Kitchen",
        zone: "public",
        level: 0,
        adjacency: ["living"],
      },
    ]);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  test("applies placeholder layout constraints and reports warnings", () => {
    const constrained = applyLayoutConstraints(
      {
        level_count: 1,
        target_area_m2: 40,
        levels: [
          {
            rooms: [{ area_m2: 18 }, { area_m2: 16 }],
          },
        ],
      },
      {
        target_area_m2: 80,
      },
    );

    expect(constrained.constraint_report.applied).toContain("target_area");
    expect(constrained.constraint_report.warnings.length).toBeGreaterThan(0);
  });
});
