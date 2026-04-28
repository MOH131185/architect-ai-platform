import { normalizeInputProgramSpaces } from "../../services/project/projectGraphVerticalSliceService.js";
import { buildProjectGraphVerticalSliceRequest } from "../../hooks/useArchitectAIWorkflow.js";

describe("ProjectGraph normalizeInputProgramSpaces - level authority", () => {
  test("user-supplied Second floor space resolves to level-2 in a 3-floor brief", () => {
    const result = normalizeInputProgramSpaces(
      [{ name: "Master Bedroom", area: 18, level: "Second" }],
      { target_storeys: 3, target_gia_m2: 200 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].target_level).toBe("Second");
    expect(result[0].target_level_index).toBe(2);
    expect(result[0].actual_level_id).toBe("level-2");
  });

  test("Ground/First/Second distribution is preserved with target_storeys=3", () => {
    const result = normalizeInputProgramSpaces(
      [
        { name: "Hall", area: 10, level: "Ground" },
        { name: "Bedroom", area: 18, level: "First" },
        { name: "Study", area: 12, level: "Second" },
      ],
      { target_storeys: 3, target_gia_m2: 120 },
    );
    expect(result.map((s) => s.target_level_index)).toEqual([0, 1, 2]);
    expect(result.map((s) => s.actual_level_id)).toEqual([
      "level-0",
      "level-1",
      "level-2",
    ]);
  });

  test("target_storeys=2 clamps Second down to First (no out-of-range level)", () => {
    const result = normalizeInputProgramSpaces(
      [
        { name: "Hall", area: 10, level: "Ground" },
        { name: "Bed", area: 18, level: "Second" },
      ],
      { target_storeys: 2, target_gia_m2: 120 },
    );
    expect(result[0].target_level_index).toBe(0);
    expect(result[1].target_level_index).toBe(1);
    expect(result[1].target_level).toBe("First");
  });

  test("no input programme returns empty array (template path takes over)", () => {
    expect(
      normalizeInputProgramSpaces([], {
        target_storeys: 3,
        target_gia_m2: 120,
      }),
    ).toEqual([]);
  });

  test("stale _calculatedFloorCount metadata does NOT override projectDetails.floorCount in the request payload", () => {
    // Regression: a programSpaces array carrying _calculatedFloorCount: 2
    // (left over from a previous 2-floor compile) used to bias the dropdown
    // and downstream payload to 2 floors even when the user had locked 3.
    const programSpaces = [
      { name: "Hall", area: 10, level: "Ground" },
      { name: "Bed", area: 18, level: "First" },
      { name: "Study", area: 12, level: "Second" },
    ];
    programSpaces._calculatedFloorCount = 2;
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 200,
        floorCount: 3,
        floorCountLocked: true,
        programSpaces,
      },
    });
    expect(request.projectDetails.floorCount).toBe(3);
    expect(request.brief.target_storeys).toBe(3);
    expect(
      request.programSpaces.map((space) => space.levelIndex).sort(),
    ).toEqual([0, 1, 2]);
  });

  test("missing levelIndex but valid string label still routes to correct floor", () => {
    const result = normalizeInputProgramSpaces(
      [
        { name: "Foyer", area: 12, level: "Ground" },
        { name: "Bed", area: 18, level: "First" },
        { name: "Study", area: 12, level: "Second" },
      ],
      { target_storeys: 3, target_gia_m2: 120 },
    );
    // Forensic regression guard: no silent collapse to Ground.
    const onGround = result.filter((s) => s.target_level_index === 0).length;
    expect(onGround).toBe(1);
    expect(result.some((s) => s.target_level_index === 1)).toBe(true);
    expect(result.some((s) => s.target_level_index === 2)).toBe(true);
  });
});
