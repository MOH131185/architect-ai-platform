import {
  resolveAuthoritativeFloorCount,
  syncProgramToFloorCount,
} from "../../services/project/floorCountAuthority.js";
import {
  generateResidentialProgramBrief,
  normalizeResidentialProgramSpaces,
} from "../../services/project/residentialProgramEngine.js";
import { applyProgramRowChangeForFloorAuthority } from "../../components/steps/SpecsStep.jsx";
import { buildProgramLevelOptions } from "../../components/specs/BuildingProgramTable.jsx";

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

  // Regression for the row-edit clamp: handleProgramRowChange in
  // SpecsStep.jsx used to consult programSpaces._calculatedFloorCount as an
  // authority. The resolver itself never reads that metadata, but this test
  // documents the contract that ONLY projectDetails fields contribute, so a
  // stale _calculatedFloorCount on the programme array can never override
  // the live authority.
  test("authority is derived from projectDetails only, not from stale programme metadata", () => {
    const result = resolveAuthoritativeFloorCount({
      floorCountLocked: true,
      floorCount: 3,
      autoDetectedFloorCount: 2,
      _calculatedFloorCount: 2,
    });
    expect(result).toMatchObject({ floorCount: 3, source: "locked" });
  });

  test("auto recommendation propagates when unlocked even if floorCount is stale", () => {
    const result = resolveAuthoritativeFloorCount({
      floorCountLocked: false,
      floorCount: 2,
      autoDetectedFloorCount: 3,
    });
    expect(result).toMatchObject({ floorCount: 3, source: "auto" });
  });

  test("unlocked detached family-house at 250 sqm defaults to two storeys", () => {
    const result = resolveAuthoritativeFloorCount({
      floorCountLocked: false,
      floorCount: 1,
      autoDetectedFloorCount: 1,
      category: "residential",
      subType: "detached-house",
      area: 250,
    });

    expect(result).toMatchObject({
      floorCount: 2,
      requested: 1,
      source: "policy",
      policyAdjusted: true,
      policyReason: "two_storey_family_house_default",
    });
  });

  test("locked one-storey detached family-house is preserved", () => {
    const result = resolveAuthoritativeFloorCount({
      floorCountLocked: true,
      floorCount: 1,
      autoDetectedFloorCount: 1,
      category: "residential",
      subType: "detached-house",
      area: 250,
    });

    expect(result).toMatchObject({
      floorCount: 1,
      source: "locked",
      policyAdjusted: false,
    });
  });
});

describe("programme UI floor authority", () => {
  test("row edits use projectDetails authority instead of stale programme metadata", () => {
    const programSpaces = [
      {
        id: "bed-1",
        name: "Bedroom",
        label: "Bedroom",
        area: 12,
        count: 1,
        level: "First",
        levelIndex: 1,
        level_index: 1,
      },
    ];
    programSpaces._calculatedFloorCount = 2;

    const updated = applyProgramRowChangeForFloorAuthority({
      programSpaces,
      index: 0,
      field: "level",
      value: "Second",
      floorCount: 3,
    });

    expect(updated[0]).toMatchObject({
      level: "Second",
      levelIndex: 2,
      level_index: 2,
    });
    expect(updated._calculatedFloorCount).toBe(3);
  });

  test("table options include Second when authoritative floorCount is 3", () => {
    expect(buildProgramLevelOptions(3, [])).toEqual(
      expect.arrayContaining(["Ground", "First", "Second"]),
    );
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

  test("residential compiler applies the two-storey family-house policy when site-fit says one", () => {
    const programBrief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 250,
      siteAreaM2: 2084,
    });

    expect(programBrief).toMatchObject({
      levelCount: 2,
      levelCountSource: "site-fit-policy",
    });
    expect(
      programBrief.spaces.some((space) => Number(space.levelIndex) === 1),
    ).toBe(true);
  });

  test("auto recommendation compile path produces three populated levels from stale floorCount", () => {
    const projectDetails = {
      floorCountLocked: false,
      floorCount: 2,
      autoDetectedFloorCount: 3,
      category: "residential",
      subType: "detached-house",
    };
    const auth = resolveAuthoritativeFloorCount(projectDetails, {
      fallback: 2,
    });
    const programBrief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 180,
      siteAreaM2: 120,
      levelCountOverride: auth.floorCount,
    });
    const synced = syncProgramToFloorCount(
      normalizeResidentialProgramSpaces(programBrief.spaces),
      auth.floorCount,
      {
        buildingType: "detached-house",
        projectDetails,
      },
    );

    expect(auth).toMatchObject({ floorCount: 3, source: "auto" });
    expect(synced.spaces._calculatedFloorCount).toBe(3);
    expect(
      Array.from(new Set(synced.spaces.map((space) => space.levelIndex))).sort(
        (a, b) => a - b,
      ),
    ).toEqual([0, 1, 2]);
  });

  test("locked manual compile path preserves three populated levels", () => {
    const projectDetails = {
      floorCountLocked: true,
      floorCount: 3,
      autoDetectedFloorCount: 2,
      category: "residential",
      subType: "detached-house",
    };
    const auth = resolveAuthoritativeFloorCount(projectDetails, {
      fallback: 2,
    });
    const programBrief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 180,
      siteAreaM2: 120,
      levelCountOverride: auth.floorCount,
    });
    const synced = syncProgramToFloorCount(
      normalizeResidentialProgramSpaces(programBrief.spaces),
      auth.floorCount,
      {
        buildingType: "detached-house",
        projectDetails,
      },
    );

    expect(auth).toMatchObject({ floorCount: 3, source: "locked" });
    expect(synced.spaces._calculatedFloorCount).toBe(3);
    expect(
      Array.from(new Set(synced.spaces.map((space) => space.levelIndex))).sort(
        (a, b) => a - b,
      ),
    ).toEqual([0, 1, 2]);
  });
});
