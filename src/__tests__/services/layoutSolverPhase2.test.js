import { solveDeterministicLayout } from "../../services/floorplan/layoutSolver.js";

describe("layoutSolver Phase 2", () => {
  test("produces deterministic room placement inside the buildable envelope", () => {
    const request = {
      project_id: "layout-phase2",
      site: {
        boundary_polygon: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 14 },
          { x: 0, y: 14 },
        ],
        setbacks: { all: 1 },
      },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 14, level: 1 },
      ],
      levels: 2,
    };

    const first = solveDeterministicLayout(request);
    const second = solveDeterministicLayout(request);

    expect(first).toEqual(second);
    expect(first.levels).toHaveLength(2);
    expect(first.buildable_bbox.width).toBe(18);
    expect(first.levels[0].rooms[0].bbox.min_x).toBeGreaterThanOrEqual(1);
  });
});
