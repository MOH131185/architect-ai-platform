import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { renderPlanSvg } from "../../services/drawing/svgPlanRenderer.js";

describe("svgPlanRenderer Phase 2", () => {
  test("renders a deterministic plan svg from canonical geometry", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "svg-phase2",
      level_count: 2,
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 14, level: 1 },
      ],
    });

    const drawing = renderPlanSvg(result.projectGeometry);

    expect(drawing.svg).toContain("<svg");
    expect(drawing.svg).toContain("north-arrow");
    expect(drawing.svg).toContain("Scale placeholder");
    expect(drawing.svg).toContain("Site Boundary");
    expect(drawing.svg).toContain("UP");
    expect(drawing.renderer).toBe("deterministic-plan-svg");
  });
});
