import { normalizeProgram } from "../../services/floorplan/programNormalizer.js";

describe("programNormalizer Phase 2", () => {
  test("normalizes room program fields and resolves adjacency targets to stable ids", () => {
    const result = normalizeProgram(
      [
        {
          name: "Living Room",
          target_area_m2: 28,
          adjacency: ["Kitchen"],
        },
        {
          name: "Kitchen",
          target_area_m2: 16,
          wet_zone: true,
        },
      ],
      {
        project_id: "phase2-program",
      },
    );

    expect(result.rooms).toHaveLength(2);
    expect(result.rooms[0].adjacency_preferences[0].target).toBe(
      result.rooms[1].id,
    );
    expect(result.rooms[1].wet_zone).toBe(true);
    expect(result.stats.total_target_area).toBe(44);
  });
});
