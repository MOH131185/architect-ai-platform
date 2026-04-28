import {
  resolveLevelIndex,
  normalizeInputProgramSpaces,
} from "../../services/project/projectGraphVerticalSliceService.js";

describe("resolveLevelIndex", () => {
  test("manual string override: 'First' resolves to index 1", () => {
    expect(resolveLevelIndex({ level: "First" }, 5)).toBe(1);
    expect(resolveLevelIndex({ level: "first" }, 5)).toBe(1);
    expect(resolveLevelIndex({ level: "FIRST FLOOR" }, 5)).toBe(1);
  });

  test("manual string override: 'Second' resolves to index 2", () => {
    expect(resolveLevelIndex({ level: "Second" }, 5)).toBe(2);
    expect(resolveLevelIndex({ level: "Second Floor" }, 5)).toBe(2);
  });

  test("numeric levelIndex takes precedence over string", () => {
    expect(resolveLevelIndex({ levelIndex: 2, level: "First" }, 5)).toBe(2);
    expect(resolveLevelIndex({ level_index: 3, level: "Ground" }, 5)).toBe(3);
  });

  test("clamps to maxLevelIndex (no silent overflow above)", () => {
    expect(resolveLevelIndex({ level: "Fifth" }, 2)).toBe(2);
    expect(resolveLevelIndex({ levelIndex: 99 }, 2)).toBe(2);
  });

  test("clamps below zero to ground", () => {
    expect(resolveLevelIndex({ level: "Basement" }, 3)).toBe(0);
    expect(resolveLevelIndex({ levelIndex: -5 }, 3)).toBe(0);
  });

  test("'roof' clamps to the top level", () => {
    expect(resolveLevelIndex({ level: "roof" }, 3)).toBe(3);
    expect(resolveLevelIndex({ level: "rooftop" }, 5)).toBe(5);
  });

  test("unknown string falls back to ground (index 0)", () => {
    expect(resolveLevelIndex({ level: "garage" }, 5)).toBe(0);
    expect(resolveLevelIndex({ level: "" }, 5)).toBe(0);
    expect(resolveLevelIndex({}, 5)).toBe(0);
    expect(resolveLevelIndex({ level: null }, 5)).toBe(0);
  });

  test("numeric strings work via the lookup table", () => {
    expect(resolveLevelIndex({ level: "0" }, 5)).toBe(0);
    expect(resolveLevelIndex({ level: "1" }, 5)).toBe(1);
    expect(resolveLevelIndex({ level: "2" }, 5)).toBe(2);
  });
});

describe("normalizeInputProgramSpaces — manual level dropdown round-trip", () => {
  test("19-space mixed-level schedule (user's reported scenario) all land on declared floors", () => {
    // Mirrors the user's screenshot: 300 m², 3 floors, 19 spaces, mix of
    // Ground / First / Second. Pre-fix bug: every space defaulted to Ground.
    const programSpaces = [
      { name: "Entrance Hall", area: 19.82, level: "Ground" },
      { name: "Living Room", area: 50.66, level: "Ground" },
      { name: "Kitchen", area: 33.06, level: "Ground" },
      { name: "Dining Area", area: 28.32, level: "Ground" },
      { name: "Study", area: 19.82, level: "Ground" },
      { name: "WC", area: 7.83, level: "Ground" },
      { name: "Utility", area: 10.16, level: "Ground" },
      { name: "Stair", area: 4, level: "Ground" },
      { name: "Stair", area: 4, level: "First" },
      { name: "Stair", area: 4, level: "Second" },
      { name: "Primary Bedroom", area: 38.65, level: "First" },
      { name: "Landing", area: 10.05, level: "First" },
      { name: "Bedroom 1", area: 9.77, level: "Second" },
      { name: "Bedroom 2", area: 9.77, level: "Second" },
      { name: "Bedroom 3", area: 9.77, level: "Second" },
      { name: "Bedroom 2", area: 9.77, level: "First" },
      { name: "Bathroom 1", area: 7.83, level: "Second" },
      { name: "Bathroom 1", area: 7.83, level: "First" },
      { name: "Storage", area: 5.66, level: "Second" },
    ];
    const brief = { target_storeys: 3, target_gia_m2: 300 };

    const result = normalizeInputProgramSpaces(programSpaces, brief);

    expect(result).toHaveLength(19);
    const groundCount = result.filter((s) => s.target_level_index === 0).length;
    const firstCount = result.filter((s) => s.target_level_index === 1).length;
    const secondCount = result.filter((s) => s.target_level_index === 2).length;

    // Counts from the user's schedule: 8 ground, 5 first, 6 second.
    expect(groundCount).toBe(8);
    expect(firstCount).toBe(5);
    expect(secondCount).toBe(6);

    // No silent collapse to ground.
    expect(groundCount + firstCount + secondCount).toBe(19);

    // target_level string matches declared dropdown choice.
    expect(result.find((s) => s.name === "Primary Bedroom").target_level).toBe(
      "First",
    );
    expect(result.find((s) => s.name === "Storage").target_level).toBe(
      "Second",
    );
    expect(result.find((s) => s.name === "Kitchen").target_level).toBe(
      "Ground",
    );
  });

  test("auto-detect path: numeric levelIndex pre-assigned by autoLevelAssignmentService is preserved", () => {
    const programSpaces = [
      { name: "Lobby", area: 30, levelIndex: 0, level: "Ground" },
      { name: "Hall", area: 80, levelIndex: 0, level: "Ground" },
      { name: "Office", area: 50, levelIndex: 1, level: "First" },
      { name: "Roof terrace", area: 40, levelIndex: 2, level: "Second" },
    ];
    const brief = { target_storeys: 3, target_gia_m2: 200 };

    const result = normalizeInputProgramSpaces(programSpaces, brief);

    expect(result.map((s) => s.target_level_index)).toEqual([0, 0, 1, 2]);
    expect(result.map((s) => s.target_level)).toEqual([
      "Ground",
      "Ground",
      "First",
      "Second",
    ]);
  });

  test("locked 3-storey flow: target_storeys=3 honoured, no truncation to 2", () => {
    // Memory rule: backend `Math.min(4, …)` previously silently truncated.
    // Verify the fix has not regressed: a programme requesting Second floor
    // with target_storeys=3 must NOT collapse to First or Ground.
    const programSpaces = [
      { name: "Foyer", area: 50, level: "Ground" },
      { name: "Bed 1", area: 25, level: "Second" },
      { name: "Bed 2", area: 25, level: "Second" },
    ];
    const brief = { target_storeys: 3, target_gia_m2: 100 };

    const result = normalizeInputProgramSpaces(programSpaces, brief);

    expect(result[0].target_level_index).toBe(0);
    expect(result[0].actual_level_id).toBe("level-0");
    expect(result[1].target_level_index).toBe(2);
    expect(result[1].actual_level_id).toBe("level-2");
    expect(result[2].target_level_index).toBe(2);
  });

  test("over-storey requests are clamped, not silently dropped", () => {
    // If user asks for "Fifth" but the brief allows only 3 storeys,
    // clamp to the top storey rather than fall back to ground.
    const programSpaces = [{ name: "Penthouse", area: 80, level: "Fifth" }];
    const brief = { target_storeys: 3, target_gia_m2: 80 };

    const result = normalizeInputProgramSpaces(programSpaces, brief);

    // target_storeys=3 → maxLevelIndex=2 → clamp to 2 (Second).
    expect(result[0].target_level_index).toBe(2);
  });
});
