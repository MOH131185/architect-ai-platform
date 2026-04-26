import autoLevelAssignmentService from "../../services/autoLevelAssignmentService.js";

describe("autoLevelAssignmentService", () => {
  test("keeps levelIndex aligned with assigned level names", () => {
    const spaces = [
      { name: "Living Room", area: 30, count: 1 },
      { name: "Kitchen", area: 12, count: 1 },
      { name: "Bedroom 1", area: 14, count: 1 },
      { name: "Bedroom 2", area: 13, count: 1 },
      { name: "Bathroom", area: 7, count: 1 },
      { name: "Study", area: 9, count: 1 },
    ];

    const assigned = autoLevelAssignmentService.autoAssignSpacesToLevels(
      spaces,
      2,
      "detached-house",
    );

    const expectedLevelIndex = {
      Ground: 0,
      First: 1,
      Second: 2,
      Third: 3,
    };

    expect(assigned.length).toBeGreaterThanOrEqual(spaces.length);
    assigned.forEach((space) => {
      expect(Number.isFinite(Number(space.levelIndex))).toBe(true);
      expect(space.levelIndex).toBe(expectedLevelIndex[space.level]);
    });
    expect(assigned.some((space) => space.levelIndex === 1)).toBe(true);
  });

  test("uses every upper level when assigning residential spaces to three floors", () => {
    const spaces = [
      { name: "Living Room", area: 26, count: 1 },
      { name: "Kitchen", area: 12, count: 1 },
      { name: "Bedroom 1", area: 14, count: 1 },
      { name: "Bedroom 2", area: 13, count: 1 },
      { name: "Bedroom 3", area: 12, count: 1 },
      { name: "Bathroom", area: 7, count: 1 },
    ];

    const assigned = autoLevelAssignmentService.autoAssignSpacesToLevels(
      spaces,
      3,
      "detached-house",
    );

    const occupiedLevels = new Set(assigned.map((space) => space.levelIndex));
    expect(occupiedLevels.has(0)).toBe(true);
    expect(occupiedLevels.has(1)).toBe(true);
    expect(occupiedLevels.has(2)).toBe(true);
    expect(
      assigned.some(
        (space) =>
          String(space.name).includes("Bedroom") && space.levelIndex === 1,
      ),
    ).toBe(true);
  });
});
