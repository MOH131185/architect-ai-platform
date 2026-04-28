import {
  resolveAuthoritativeFloorCount,
  syncProgramToFloorCount,
} from "../../services/project/floorCountAuthority.js";

describe("resolveAuthoritativeFloorCount", () => {
  test("locked floorCount wins outright", () => {
    expect(
      resolveAuthoritativeFloorCount({
        floorCountLocked: true,
        floorCount: 3,
        autoDetectedFloorCount: 5,
      }),
    ).toMatchObject({ floorCount: 3, source: "locked" });
  });

  test("unlocked: autoDetectedFloorCount beats raw floorCount", () => {
    expect(
      resolveAuthoritativeFloorCount({
        floorCountLocked: false,
        floorCount: 2,
        autoDetectedFloorCount: 3,
      }),
    ).toMatchObject({ floorCount: 3, source: "auto" });
  });

  test("unlocked + no autoDetected: floorCount becomes manual source", () => {
    expect(
      resolveAuthoritativeFloorCount({
        floorCountLocked: false,
        floorCount: 3,
        autoDetectedFloorCount: null,
      }),
    ).toMatchObject({ floorCount: 3, source: "manual" });
  });

  test("nothing supplied: fallback applies", () => {
    expect(resolveAuthoritativeFloorCount({}, { fallback: 4 })).toMatchObject({
      floorCount: 4,
      source: "fallback",
    });
  });

  test("maxFloors clamps the user value and reports clampedFromUser", () => {
    expect(
      resolveAuthoritativeFloorCount(
        { floorCountLocked: true, floorCount: 5 },
        { maxFloors: 3 },
      ),
    ).toMatchObject({
      floorCount: 3,
      requested: 5,
      clampedFromUser: true,
    });
  });

  test("maxFloors omitted leaves the user value alone", () => {
    expect(
      resolveAuthoritativeFloorCount({
        floorCountLocked: true,
        floorCount: 5,
      }),
    ).toMatchObject({ floorCount: 5, clampedFromUser: false });
  });
});

describe("syncProgramToFloorCount", () => {
  const detachedHouseSpaces = () => [
    {
      id: "1",
      name: "Living Room",
      area: 30,
      count: 1,
      level: "Ground",
      levelIndex: 0,
    },
    {
      id: "2",
      name: "Kitchen",
      area: 18,
      count: 1,
      level: "Ground",
      levelIndex: 0,
    },
    {
      id: "3",
      name: "Hall",
      area: 8,
      count: 1,
      level: "Ground",
      levelIndex: 0,
    },
    { id: "4", name: "WC", area: 4, count: 1, level: "Ground", levelIndex: 0 },
    {
      id: "5",
      name: "Bedroom 1",
      area: 14,
      count: 1,
      level: "First",
      levelIndex: 1,
    },
    {
      id: "6",
      name: "Bedroom 2",
      area: 12,
      count: 1,
      level: "First",
      levelIndex: 1,
    },
    {
      id: "7",
      name: "Bedroom 3",
      area: 12,
      count: 1,
      level: "First",
      levelIndex: 1,
    },
    {
      id: "8",
      name: "Bedroom 4",
      area: 10,
      count: 1,
      level: "First",
      levelIndex: 1,
    },
    {
      id: "9",
      name: "Bathroom",
      area: 6,
      count: 1,
      level: "First",
      levelIndex: 1,
    },
  ];

  test("3 floors with rooms only on Ground/First: redistributes upper rooms onto Second", () => {
    const result = syncProgramToFloorCount(detachedHouseSpaces(), 3, {
      buildingType: "detached-house",
    });
    const onSecond = result.spaces.filter(
      (space) => Number(space.levelIndex) === 2,
    );
    expect(onSecond.length).toBeGreaterThan(0);
    expect(result.changed).toBe(true);
  });

  test("ensures every level has a stair when floorCount > 1", () => {
    const result = syncProgramToFloorCount(detachedHouseSpaces(), 3, {
      buildingType: "detached-house",
    });
    for (let level = 0; level < 3; level += 1) {
      const stairs = result.spaces.filter((space) => {
        if (Number(space.levelIndex) !== level) return false;
        const haystack =
          `${space.name || ""} ${space.spaceType || ""}`.toLowerCase();
        return (
          haystack.includes("stair") ||
          haystack.includes("circulation") ||
          haystack.includes("vertical-circ")
        );
      });
      expect(stairs.length).toBeGreaterThan(0);
    }
  });

  test("clamps a Third row to Second when floorCount === 3", () => {
    const result = syncProgramToFloorCount(
      [
        {
          id: "x",
          name: "Roof Terrace",
          area: 12,
          count: 1,
          level: "Third",
          levelIndex: 3,
        },
      ],
      3,
      { buildingType: "mixed-use" },
    );
    expect(result.spaces.every((space) => Number(space.levelIndex) <= 2)).toBe(
      true,
    );
  });

  test("no change when floorCount=1 and all rooms are already Ground", () => {
    const input = [
      {
        id: "1",
        name: "Studio",
        area: 50,
        count: 1,
        level: "Ground",
        levelIndex: 0,
      },
    ];
    const result = syncProgramToFloorCount(input, 1, {
      buildingType: "studio",
    });
    expect(result.spaces).toHaveLength(1);
    expect(Number(result.spaces[0].levelIndex)).toBe(0);
    expect(result.spaces._calculatedFloorCount).toBe(1);
  });

  test("re-stamps _calculatedFloorCount and _floorMetrics", () => {
    const result = syncProgramToFloorCount(detachedHouseSpaces(), 3, {
      buildingType: "detached-house",
      projectDetails: { floorMetrics: { siteCoveragePercent: 35 } },
    });
    expect(result.spaces._calculatedFloorCount).toBe(3);
    expect(result.spaces._floorMetrics).toEqual({ siteCoveragePercent: 35 });
  });

  test("empty input returns empty array with metadata stamped", () => {
    const result = syncProgramToFloorCount([], 2);
    expect(Array.isArray(result.spaces)).toBe(true);
    expect(result.spaces).toHaveLength(0);
    expect(result.spaces._calculatedFloorCount).toBe(2);
    expect(result.changed).toBe(false);
  });
});
