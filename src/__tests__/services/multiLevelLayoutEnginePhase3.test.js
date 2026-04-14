import { assignRoomsToLevels } from "../../services/floorplan/multiLevelLayoutEngine.js";

describe("multiLevelLayoutEngine Phase 3", () => {
  test("assigns public rooms lower and private rooms upper with deterministic stacking", () => {
    const result = assignRoomsToLevels(
      [
        {
          id: "living",
          name: "Living Room",
          type: "living_room",
          zone: "public",
          privacy_level: 0,
          target_area: 24,
          wet_zone: false,
          requires_daylight: true,
        },
        {
          id: "kitchen",
          name: "Kitchen",
          type: "kitchen",
          zone: "service",
          privacy_level: 1,
          target_area: 14,
          wet_zone: true,
          requires_daylight: true,
        },
        {
          id: "bed-1",
          name: "Bedroom 1",
          type: "bedroom",
          zone: "private",
          privacy_level: 2,
          target_area: 16,
          wet_zone: false,
          requires_daylight: true,
        },
      ],
      { levelCount: 2 },
    );

    expect(result.level_count).toBe(2);
    expect(result.levels[0].rooms.some((room) => room.id === "living")).toBe(
      true,
    );
    expect(result.levels[1].rooms.some((room) => room.id === "bed-1")).toBe(
      true,
    );
    expect(result.stackingPlan.stacks.length).toBeGreaterThan(0);
  });

  test("distributes wet zones across available levels while keeping private rooms upstairs", () => {
    const result = assignRoomsToLevels(
      [
        {
          id: "living",
          name: "Living Room",
          type: "living_room",
          zone: "public",
          privacy_level: 0,
          target_area: 28,
          wet_zone: false,
          requires_daylight: true,
        },
        {
          id: "kitchen",
          name: "Kitchen",
          type: "kitchen",
          zone: "service",
          privacy_level: 1,
          target_area: 16,
          wet_zone: true,
          requires_daylight: true,
        },
        {
          id: "bath-ground",
          name: "Bathroom Ground",
          type: "bathroom",
          zone: "service",
          privacy_level: 1,
          target_area: 8,
          wet_zone: true,
          requires_daylight: false,
        },
        {
          id: "bath-upper",
          name: "Bathroom Upper",
          type: "bathroom",
          zone: "service",
          privacy_level: 1,
          target_area: 8,
          wet_zone: true,
          requires_daylight: false,
        },
        {
          id: "bed-1",
          name: "Bedroom 1",
          type: "bedroom",
          zone: "private",
          privacy_level: 2,
          target_area: 16,
          wet_zone: false,
          requires_daylight: true,
        },
        {
          id: "bed-2",
          name: "Bedroom 2",
          type: "bedroom",
          zone: "private",
          privacy_level: 2,
          target_area: 14,
          wet_zone: false,
          requires_daylight: true,
        },
      ],
      { levelCount: 3 },
    );

    const wetLevels = new Set(
      result.levels.flatMap((level) =>
        level.rooms
          .filter((room) => room.wet_zone)
          .map(() => level.level_number),
      ),
    );

    expect(wetLevels.size).toBeGreaterThan(1);
    expect(result.levels[0].rooms.some((room) => room.id === "living")).toBe(
      true,
    );
    expect(
      result.levels
        .slice(1)
        .some((level) =>
          level.rooms.some(
            (room) => room.id === "bed-1" || room.id === "bed-2",
          ),
        ),
    ).toBe(true);
  });
});
