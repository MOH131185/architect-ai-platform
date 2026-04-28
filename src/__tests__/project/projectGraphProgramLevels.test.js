import { normalizeInputProgramSpaces } from "../../services/project/projectGraphVerticalSliceService.js";

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
