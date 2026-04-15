import { validateAILayout } from "../../services/aiLayoutValidator.js";

describe("ai layout validator", () => {
  test("reports major and severe area mismatches for weak layouts", () => {
    const result = validateAILayout(
      {
        levels: [
          {
            index: 0,
            rooms: [
              {
                name: "Living Room",
                program: "living",
                x: 0,
                y: 0,
                width: 3,
                depth: 3,
              },
              {
                name: "Kitchen",
                program: "kitchen",
                x: 3.2,
                y: 0,
                width: 2,
                depth: 2,
              },
            ],
          },
        ],
      },
      {
        interiorWidth: 10,
        interiorDepth: 8,
        levelCount: 1,
        programSpaces: [
          {
            name: "Living Room",
            program: "living",
            targetAreaM2: 20,
            levelIndex: 0,
          },
          {
            name: "Kitchen",
            program: "kitchen",
            targetAreaM2: 12,
            levelIndex: 0,
          },
        ],
      },
    );

    expect(result.matchedProgramRoomCount).toBe(2);
    expect(result.majorAreaMismatchCount).toBeGreaterThanOrEqual(2);
    expect(result.severeAreaMismatchCount).toBeGreaterThanOrEqual(1);
    expect(result.warnings.join(" ")).toContain("deviation");
  });
});
