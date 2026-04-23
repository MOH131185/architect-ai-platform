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
});
