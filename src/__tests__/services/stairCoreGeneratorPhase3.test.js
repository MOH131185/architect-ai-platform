import { resolveStairCorePlan } from "../../services/floorplan/stairCoreGenerator.js";
import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { validateVerticalCirculation } from "../../services/floorplan/verticalCirculationValidator.js";

describe("stairCoreGenerator Phase 3", () => {
  test("builds a continuous stair core plan across levels", () => {
    const plan = resolveStairCorePlan({
      buildableBbox: {
        min_x: 0,
        min_y: 0,
        max_x: 16,
        max_y: 12,
        width: 16,
        height: 12,
      },
      levelCount: 3,
      constraints: {},
    });

    expect(plan.required).toBe(true);
    expect(plan.levels).toHaveLength(3);
    expect(plan.levels[0].core_bbox).toEqual(plan.levels[1].core_bbox);
  });

  test("validates vertical circulation on generated multi-level geometry", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-stair-house",
      level_count: 3,
      footprint: { width_m: 16, depth_m: 12 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 15, level: 1 },
        { name: "Bedroom 2", target_area_m2: 15, level: 2 },
      ],
    });

    const report = validateVerticalCirculation(result.projectGeometry);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });
});
