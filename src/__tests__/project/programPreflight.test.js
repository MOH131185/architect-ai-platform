import { runProgramPreflight } from "../../services/project/programPreflight.js";
import { syncProgramToFloorCount } from "../../services/project/floorCountAuthority.js";

describe("runProgramPreflight", () => {
  test("ok=true when every required level has at least one space", () => {
    const result = runProgramPreflight({
      projectDetails: {
        floorCount: 3,
        area: 200,
        category: "residential",
        subType: "detached-house",
      },
      programSpaces: [
        { name: "Hall", area: 8, count: 1, level: "Ground" },
        { name: "Living", area: 30, count: 1, level: "Ground" },
        { name: "Kitchen", area: 18, count: 1, level: "Ground" },
        { name: "Stair", area: 4, count: 1, level: "Ground" },
        { name: "Bedroom", area: 14, count: 2, level: "First" },
        { name: "Bathroom", area: 6, count: 1, level: "First" },
        { name: "Stair", area: 4, count: 1, level: "First" },
        { name: "Bedroom", area: 12, count: 2, level: "Second" },
        { name: "Bathroom", area: 6, count: 1, level: "Second" },
        { name: "Stair", area: 4, count: 1, level: "Second" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.floorCount).toBe(3);
    expect(result.levels).toHaveLength(3);
    expect(result.levels[2].spaces.length).toBeGreaterThan(0);
  });

  test("error when a required level is empty", () => {
    const result = runProgramPreflight({
      projectDetails: { floorCount: 3, area: 200 },
      programSpaces: [
        { name: "Hall", area: 8, count: 1, level: "Ground" },
        { name: "Living", area: 60, count: 1, level: "Ground" },
        { name: "Bedroom", area: 14, count: 2, level: "First" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes("Second"))).toBe(
      true,
    );
  });

  test("error when no spaces are supplied", () => {
    const result = runProgramPreflight({
      projectDetails: { floorCount: 2, area: 100 },
      programSpaces: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/At least one programme space/);
  });

  test("warning when total area is significantly below target", () => {
    const result = runProgramPreflight({
      projectDetails: { floorCount: 1, area: 200 },
      programSpaces: [{ name: "Studio", area: 80, count: 1, level: "Ground" }],
    });
    expect(result.warnings.some((w) => w.includes("only"))).toBe(true);
  });

  test("error when total area is over the upper tolerance", () => {
    const result = runProgramPreflight({
      projectDetails: { floorCount: 1, area: 100 },
      programSpaces: [
        { name: "Hall", area: 100, count: 1, level: "Ground" },
        { name: "Living", area: 50, count: 1, level: "Ground" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((m) => m.includes("of the target"))).toBe(true);
  });

  test("multi-level project without a stair triggers a warning", () => {
    const result = runProgramPreflight({
      projectDetails: { floorCount: 2, area: 100 },
      programSpaces: [
        { name: "Living", area: 40, count: 1, level: "Ground" },
        { name: "Bedroom", area: 50, count: 1, level: "First" },
      ],
    });
    expect(result.warnings.some((w) => w.toLowerCase().includes("stair"))).toBe(
      true,
    );
  });

  test("syncProgramToFloorCount rescues a preflight failure caused by an empty upper level", () => {
    const programSpaces = [
      { name: "Hall", area: 8, count: 1, level: "Ground" },
      { name: "Living", area: 30, count: 1, level: "Ground" },
      { name: "Kitchen", area: 18, count: 1, level: "Ground" },
      { name: "Bedroom", area: 14, count: 2, level: "First" },
      { name: "Bedroom", area: 12, count: 2, level: "First" },
      { name: "Bathroom", area: 6, count: 1, level: "First" },
    ];
    const before = runProgramPreflight({
      projectDetails: {
        floorCount: 3,
        area: 200,
        category: "residential",
        subType: "detached-house",
      },
      programSpaces,
    });
    expect(before.ok).toBe(false);
    expect(before.errors.some((m) => m.includes("Second"))).toBe(true);

    const synced = syncProgramToFloorCount(programSpaces, 3, {
      buildingType: "detached-house",
    });
    const after = runProgramPreflight({
      projectDetails: {
        floorCount: 3,
        area: 200,
        category: "residential",
        subType: "detached-house",
      },
      programSpaces: synced.spaces,
    });
    expect(after.ok).toBe(true);
  });

  test("explicit floorCount parameter overrides projectDetails.floorCount", () => {
    const result = runProgramPreflight({
      projectDetails: { floorCount: 2, area: 200 },
      floorCount: 3,
      programSpaces: [
        { name: "Hall", area: 8, count: 1, level: "Ground" },
        { name: "Stair", area: 4, count: 1, level: "Ground" },
        { name: "Bed", area: 30, count: 1, level: "First" },
        { name: "Stair", area: 4, count: 1, level: "First" },
        { name: "Bed", area: 30, count: 1, level: "Second" },
        { name: "Stair", area: 4, count: 1, level: "Second" },
      ],
    });
    expect(result.floorCount).toBe(3);
    expect(result.levels).toHaveLength(3);
  });

  test("falls back to authoritative resolution when floorCount param omitted", () => {
    const result = runProgramPreflight({
      projectDetails: {
        floorCountLocked: false,
        floorCount: 2,
        autoDetectedFloorCount: 3,
        area: 200,
      },
      programSpaces: [
        { name: "Hall", area: 8, count: 1, level: "Ground" },
        { name: "Stair", area: 4, count: 1, level: "Ground" },
        { name: "Bed", area: 30, count: 1, level: "First" },
        { name: "Stair", area: 4, count: 1, level: "First" },
        { name: "Bed", area: 30, count: 1, level: "Second" },
        { name: "Stair", area: 4, count: 1, level: "Second" },
      ],
    });
    expect(result.floorCount).toBe(3);
    expect(result.levels).toHaveLength(3);
  });

  test("normalised spaces carry levelIndex + level_index", () => {
    const result = runProgramPreflight({
      projectDetails: { floorCount: 3, area: 200 },
      programSpaces: [
        { name: "Hall", area: 10, count: 1, level: "Ground" },
        { name: "Stair", area: 4, count: 1, level: "Ground" },
        { name: "Bed", area: 60, count: 1, level: "First" },
        { name: "Stair", area: 4, count: 1, level: "First" },
        { name: "Bed", area: 60, count: 1, level: "Second" },
        { name: "Stair", area: 4, count: 1, level: "Second" },
      ],
    });
    expect(
      result.normalizedProgramSpaces.every(
        (space) =>
          Number.isInteger(space.levelIndex) &&
          Number.isInteger(space.level_index),
      ),
    ).toBe(true);
  });
});
