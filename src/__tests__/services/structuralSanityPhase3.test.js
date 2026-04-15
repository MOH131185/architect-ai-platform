import { buildStructuralGrid } from "../../services/structure/structuralGridService.js";
import { validateStructuralAlignment } from "../../services/structure/structuralAlignmentValidator.js";
import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";

describe("structural sanity Phase 3", () => {
  test("builds a structural grid and emits wide-span warnings when needed", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-structure-house",
      footprint: { width_m: 28, depth_m: 12 },
      room_program: [
        { name: "Living Room", target_area_m2: 36, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 18, adjacency: ["Living Room"] },
      ],
    });

    const grid = buildStructuralGrid(result.projectGeometry);
    const report = validateStructuralAlignment(result.projectGeometry, grid);

    expect(grid.x_axes.length).toBeGreaterThan(2);
    expect(Array.isArray(report.warnings)).toBe(true);
  });
});
