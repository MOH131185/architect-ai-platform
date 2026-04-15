import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { validateStackedSupports } from "../../services/structure/stackedSupportValidator.js";

describe("structural semantics Phase 4", () => {
  test("warns when exterior support paths drift across levels", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase4-structural-drift",
      level_count: 2,
      footprint: { width_m: 16, depth_m: 12 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 15, level: 1 },
      ],
    });

    const mutated = JSON.parse(JSON.stringify(result.projectGeometry));
    const upperWall = mutated.walls.find(
      (wall) => wall.level_id === "level-1" && wall.exterior,
    );
    upperWall.start.x += 3;
    upperWall.end.x += 3;

    const report = validateStackedSupports(mutated);

    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings.some((entry) => entry.includes("offset"))).toBe(
      true,
    );
  });
});
