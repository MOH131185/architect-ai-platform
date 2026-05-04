import {
  validateProgrammeAdjacency,
  resolveRulePack,
} from "../../../services/validation/programmeAdjacencyValidator.js";

/**
 * Build a minimal compiled project with rooms + walls. Rooms are positioned in
 * a row; walls connect each adjacent pair. Each room input is
 * `{ id, name, type, levelId? }`. `adjacency` is an explicit list of
 * `[roomIdA, roomIdB]` pairs that should share a wall in the fixture.
 */
function buildFixture({ rooms, adjacency = [], levels = ["L0"] }) {
  const compiledRooms = rooms.map((r) => ({
    id: r.id,
    name: r.name || r.id,
    type: r.type,
    levelId: r.levelId || "L0",
    polygon: r.polygon || [],
    bbox: r.bbox || { minX: 0, minY: 0, width: 4, height: 4 },
    actual_area_m2: r.area ?? 12,
    wet_zone: r.wetZone === true,
  }));
  const walls = adjacency.map(([a, b], i) => ({
    id: `wall-${i}`,
    room_ids: [a, b],
  }));
  return {
    rooms: compiledRooms,
    walls,
    levels: levels.map((id) => ({ id })),
  };
}

describe("validateProgrammeAdjacency — rule pack resolution", () => {
  test("dwelling resolves to residential pack", () => {
    const pack = resolveRulePack("dwelling");
    expect(pack.packId).toBe("residential-v1");
    expect(pack.rules.length).toBeGreaterThan(0);
  });

  test("multi_residential resolves to residential pack", () => {
    const pack = resolveRulePack("multi_residential");
    expect(pack.packId).toBe("residential-v1");
  });

  test("unknown type falls back to empty default", () => {
    const pack = resolveRulePack("office_studio");
    expect(pack.packId).toBe("default-empty");
    expect(pack.rules.length).toBe(0);
  });
});

describe("validateProgrammeAdjacency — happy path", () => {
  test("compliant residential layout scores >= 85 and is pass", () => {
    const compiledProject = buildFixture({
      rooms: [
        { id: "hall", type: "entrance_hall" },
        { id: "living", type: "living_room" },
        { id: "kitchen", type: "kitchen" },
        { id: "dining", type: "dining" },
        { id: "wc", type: "wc" },
        { id: "stair-g", type: "stair" },
        { id: "stair-1", type: "stair", levelId: "L1" },
        { id: "circ-g", type: "circulation" },
        { id: "circ-1", type: "circulation", levelId: "L1" },
        { id: "primary", type: "bedroom_primary", levelId: "L1" },
        { id: "bath", type: "bathroom", levelId: "L1" },
        { id: "bed2", type: "bedroom", levelId: "L1" },
      ],
      adjacency: [
        ["hall", "living"],
        ["hall", "circ-g"],
        ["circ-g", "stair-g"],
        ["circ-g", "wc"],
        ["living", "dining"],
        ["kitchen", "dining"],
        ["circ-1", "stair-1"],
        ["circ-1", "primary"],
        ["circ-1", "bed2"],
        ["primary", "bath"],
      ],
      levels: ["L0", "L1"],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "dwelling",
    });
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.status).toBe("pass");
    expect(result.packId).toBe("residential-v1");
    expect(Array.isArray(result.checks)).toBe(true);
    expect(
      result.checks.every((c) => c.category === "programme_adjacency"),
    ).toBe(true);
  });
});

describe("validateProgrammeAdjacency — must_adjoin failures", () => {
  test("kitchen with no dining/living neighbour fails kitchen-near-dining", () => {
    const compiledProject = buildFixture({
      rooms: [
        { id: "kitchen", type: "kitchen" },
        { id: "wc", type: "wc" },
        { id: "circ", type: "circulation" },
      ],
      adjacency: [
        ["kitchen", "circ"],
        ["circ", "wc"],
      ],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "dwelling",
    });
    const kitchenRule = result.checks.find(
      (c) => c.code === "PROGRAMME_ADJACENCY_KITCHEN_NEAR_DINING",
    );
    expect(kitchenRule).toBeDefined();
    expect(kitchenRule.status).toBe("fail");
    expect(result.issues.some((i) => i.code === kitchenRule.code)).toBe(true);
  });
});

describe("validateProgrammeAdjacency — must_not_adjoin failures", () => {
  test("bedroom adjacent to kitchen triggers must-not-adjoin failure", () => {
    const compiledProject = buildFixture({
      rooms: [
        { id: "kitchen", type: "kitchen" },
        { id: "bed1", type: "bedroom" },
        { id: "dining", type: "dining" },
      ],
      adjacency: [
        ["kitchen", "dining"],
        ["kitchen", "bed1"],
      ],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "dwelling",
    });
    const violation = result.checks.find(
      (c) => c.code === "PROGRAMME_ADJACENCY_BEDROOM_NOT_DIRECT_FROM_KITCHEN",
    );
    expect(violation).toBeDefined();
    expect(violation.status).toBe("fail");
  });
});

describe("validateProgrammeAdjacency — min_per_level", () => {
  test("two-level dwelling without stair on L1 fails stair rule", () => {
    const compiledProject = buildFixture({
      rooms: [
        { id: "stair-g", type: "stair", levelId: "L0" },
        { id: "primary", type: "bedroom_primary", levelId: "L1" },
        { id: "bath", type: "bathroom", levelId: "L1" },
      ],
      adjacency: [["primary", "bath"]],
      levels: ["L0", "L1"],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "dwelling",
    });
    const stairRule = result.checks.find(
      (c) => c.code === "PROGRAMME_ADJACENCY_STAIR_ON_EVERY_MULTI_LEVEL",
    );
    expect(stairRule).toBeDefined();
    expect(stairRule.status).toBe("fail");
  });

  test("single-level dwelling skips stair-on-every-multi-level rule", () => {
    const compiledProject = buildFixture({
      rooms: [
        { id: "kitchen", type: "kitchen" },
        { id: "dining", type: "dining" },
        { id: "primary", type: "bedroom_primary" },
        { id: "bath", type: "bathroom" },
      ],
      adjacency: [
        ["kitchen", "dining"],
        ["primary", "bath"],
      ],
      levels: ["L0"],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "dwelling",
    });
    const stairRule = result.checks.find(
      (c) => c.code === "PROGRAMME_ADJACENCY_STAIR_ON_EVERY_MULTI_LEVEL",
    );
    // Rule should be skipped (not present in checks) since levelCount < 2.
    expect(stairRule).toBeUndefined();
  });
});

describe("validateProgrammeAdjacency — min_count", () => {
  test("missing primary bedroom fails primary-bedroom-count", () => {
    const compiledProject = buildFixture({
      rooms: [
        { id: "kitchen", type: "kitchen" },
        { id: "dining", type: "dining" },
        { id: "bed1", type: "bedroom" },
        { id: "bath", type: "bathroom" },
      ],
      adjacency: [["kitchen", "dining"]],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "dwelling",
    });
    const rule = result.checks.find(
      (c) => c.code === "PROGRAMME_ADJACENCY_PRIMARY_BEDROOM_COUNT",
    );
    expect(rule).toBeDefined();
    expect(rule.status).toBe("fail");
    expect(rule.details.observed).toBe(0);
  });
});

describe("validateProgrammeAdjacency — empty inputs", () => {
  test("no compiled project returns pass with score 100", () => {
    const result = validateProgrammeAdjacency({
      compiledProject: null,
      canonicalProjectType: "dwelling",
    });
    expect(result.status).toBe("pass");
    expect(result.score).toBe(100);
    expect(result.checks).toEqual([]);
  });

  test("unknown project type returns pass (default empty rule pack)", () => {
    const compiledProject = buildFixture({
      rooms: [{ id: "room1", type: "office" }],
      adjacency: [],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "office_studio",
    });
    expect(result.status).toBe("pass");
    expect(result.score).toBe(100);
    expect(result.ruleCount).toBe(0);
  });
});

describe("validateProgrammeAdjacency — output shape", () => {
  test("each check carries code/status/category/weight", () => {
    const compiledProject = buildFixture({
      rooms: [
        { id: "kitchen", type: "kitchen" },
        { id: "dining", type: "dining" },
        { id: "primary", type: "bedroom_primary" },
        { id: "bath", type: "bathroom" },
      ],
      adjacency: [
        ["kitchen", "dining"],
        ["primary", "bath"],
      ],
    });
    const result = validateProgrammeAdjacency({
      compiledProject,
      canonicalProjectType: "dwelling",
    });
    for (const check of result.checks) {
      expect(typeof check.code).toBe("string");
      expect(["pass", "fail"]).toContain(check.status);
      expect(check.category).toBe("programme_adjacency");
      expect(typeof check.weight).toBe("number");
    }
  });
});
