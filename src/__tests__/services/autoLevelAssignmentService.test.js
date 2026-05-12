import autoLevelAssignmentService from "../../services/autoLevelAssignmentService.js";

describe("autoLevelAssignmentService.calculateOptimalLevels — proportion-based auto-detect", () => {
  test("returns null shape when site area is missing or non-positive", () => {
    const zero = autoLevelAssignmentService.calculateOptimalLevels(200, 0, {
      subType: "detached-house",
    });
    expect(zero.optimalFloors).toBeNull();
    expect(zero.fallbackReason).toBe("no-site-area");
    expect(zero.programToSiteRatio).toBeNull();
    expect(zero.effectiveCoverage).toBeNull();
    expect(zero.exceedsSubtypeCap).toBe(false);

    const negative = autoLevelAssignmentService.calculateOptimalLevels(
      200,
      -10,
      { subType: "detached-house" },
    );
    expect(negative.optimalFloors).toBeNull();
    expect(negative.fallbackReason).toBe("no-site-area");

    const missing = autoLevelAssignmentService.calculateOptimalLevels(
      200,
      undefined,
      { subType: "detached-house" },
    );
    expect(missing.optimalFloors).toBeNull();
    expect(missing.fallbackReason).toBe("no-site-area");
  });

  test("detached 200m² on 500m² site → 2 storeys with subtype setback 0.75", () => {
    const result = autoLevelAssignmentService.calculateOptimalLevels(200, 500, {
      buildingType: "house",
      subType: "detached-house",
    });
    expect(result.optimalFloors).toBe(2);
    expect(result.programToSiteRatio).toBeCloseTo(0.4, 2);
    expect(result.setbackReduction).toBeCloseTo(0.75, 2);
    expect(result.coverageRatio).toBeCloseTo(0.35, 2);
    expect(result.effectiveCoverage).toBeCloseTo(0.2625, 3);
    expect(result.exceedsSubtypeCap).toBe(false);
    expect(result.subtypeMaxFloors).toBe(3);
    expect(result.reasoning).toMatch(/ratio 0\.40/);
  });

  test("terraced 300m² on 100m² site → demand exceeds subtype cap (4), exceedsSubtypeCap=true", () => {
    const result = autoLevelAssignmentService.calculateOptimalLevels(300, 100, {
      buildingType: "house",
      subType: "terraced-house",
    });
    expect(result.demandFloors).toBeGreaterThan(4);
    expect(result.optimalFloors).toBe(4);
    expect(result.exceedsSubtypeCap).toBe(true);
    expect(result.subtypeMaxFloors).toBe(4);
    expect(result.programToSiteRatio).toBeCloseTo(3.0, 2);
    expect(result.setbackReduction).toBeCloseTo(0.95, 2);
    expect(result.reasoning).toMatch(/terraced-house cap 4/);
  });

  test("apartment 600m² on 200m² site → 7 storeys under cap 8, exceedsSubtypeCap=false", () => {
    const result = autoLevelAssignmentService.calculateOptimalLevels(600, 200, {
      buildingType: "apartment",
      subType: "apartment-building",
    });
    expect(result.optimalFloors).toBe(7);
    expect(result.exceedsSubtypeCap).toBe(false);
    expect(result.subtypeMaxFloors).toBe(8);
    expect(result.programToSiteRatio).toBeCloseTo(3.0, 2);
    expect(result.setbackReduction).toBeCloseTo(0.85, 2);
  });

  test("warehouse 1000m² on 800m² site → cap at 2 with exceedsSubtypeCap=true", () => {
    const result = autoLevelAssignmentService.calculateOptimalLevels(
      1000,
      800,
      { buildingType: "industrial", subType: "warehouse" },
    );
    expect(result.demandFloors).toBeGreaterThan(2);
    expect(result.optimalFloors).toBe(2);
    expect(result.exceedsSubtypeCap).toBe(true);
    expect(result.subtypeMaxFloors).toBe(2);
    expect(result.setbackReduction).toBeCloseTo(0.95, 2);
    expect(result.coverageRatio).toBeCloseTo(0.7, 2);
  });

  test("office 1200m² on 400m² site → 8 storeys, fits within cap 10", () => {
    const result = autoLevelAssignmentService.calculateOptimalLevels(
      1200,
      400,
      { buildingType: "commercial", subType: "office" },
    );
    expect(result.optimalFloors).toBe(8);
    expect(result.exceedsSubtypeCap).toBe(false);
    expect(result.subtypeMaxFloors).toBe(10);
    expect(result.programToSiteRatio).toBeCloseTo(3.0, 2);
    expect(result.coverageRatio).toBeCloseTo(0.55, 2);
    expect(result.setbackReduction).toBeCloseTo(0.85, 2);
  });

  test("unknown subtype falls back to default setback (0.85) and keyword coverage", () => {
    const result = autoLevelAssignmentService.calculateOptimalLevels(200, 500, {
      buildingType: "commercial",
      subType: "some-niche-unknown-subtype",
    });
    expect(result.setbackReduction).toBeCloseTo(0.85, 2);
    expect(result.coverageRatio).toBeCloseTo(0.7, 2);
    expect(result.subtypeMaxFloors).toBeNull();
  });

  test("autoAssignComplete returns success=false when site area missing", () => {
    const result = autoLevelAssignmentService.autoAssignComplete(
      [{ name: "Living Room", area: 30, count: 1 }],
      0,
      "detached-house",
    );
    expect(result.success).toBe(false);
    expect(result.floorCount).toBeNull();
    expect(result.fallbackReason).toBe("no-site-area");
    expect(result.floorMetrics.optimalFloors).toBeNull();
  });
});

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
