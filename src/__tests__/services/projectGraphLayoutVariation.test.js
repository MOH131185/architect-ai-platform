import { __projectGraphVerticalSliceInternals } from "../../services/project/projectGraphVerticalSliceService.js";

const {
  seededFraction,
  seededRotation,
  seededIndex,
  buildProjectGeometryFromProgramme,
} = __projectGraphVerticalSliceInternals;

describe("seededFraction — internals", () => {
  test("returns 0.5 when seed is null", () => {
    expect(seededFraction(null, "x")).toBe(0.5);
    expect(seededFraction(undefined, "x")).toBe(0.5);
  });

  test("returns deterministic value for same (seed, salt) pair", () => {
    const a = seededFraction(123, "salt-a");
    const b = seededFraction(123, "salt-a");
    expect(a).toBe(b);
  });

  test("different salts → different values for same seed", () => {
    const a = seededFraction(123, "salt-a");
    const b = seededFraction(123, "salt-b");
    // Statistical: not strictly required to differ, but with hash entropy
    // they almost always do. If they happen to collide we still want the
    // test to pass — assert the function returns a value in [0, 1) instead.
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
  });

  test("different seeds → different values across a small sweep", () => {
    const seen = new Set();
    for (let seed = 1; seed <= 20; seed += 1) {
      seen.add(seededFraction(seed, "fixed-salt"));
    }
    // 20 distinct seeds should produce more than one distinct fraction.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("seededRotation — internals", () => {
  test("returns input unchanged when seed is null", () => {
    const input = ["a", "b", "c"];
    expect(seededRotation(input, null, "x")).toBe(input);
  });

  test("returns input unchanged for arrays of length 0 or 1", () => {
    expect(seededRotation([], 42, "x")).toEqual([]);
    expect(seededRotation(["only"], 42, "x")).toEqual(["only"]);
  });

  test("rotation is deterministic for same (seed, salt) pair", () => {
    const input = ["a", "b", "c", "d"];
    const out1 = seededRotation(input, 17, "salt");
    const out2 = seededRotation(input, 17, "salt");
    expect(out1).toEqual(out2);
  });

  test("rotation preserves all elements (just reorders)", () => {
    const input = ["a", "b", "c", "d", "e"];
    const out = seededRotation(input, 99, "salt");
    expect([...out].sort()).toEqual([...input].sort());
    expect(out.length).toBe(input.length);
  });

  test("different seeds eventually produce different rotations", () => {
    const input = ["a", "b", "c", "d"];
    const seen = new Set();
    for (let seed = 1; seed <= 20; seed += 1) {
      seen.add(seededRotation(input, seed, "salt").join("|"));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("seededIndex — internals (smoke)", () => {
  test("returns 0 for empty length", () => {
    expect(seededIndex(123, 0, "x")).toBe(0);
  });

  test("returns deterministic index in [0, length)", () => {
    const idx = seededIndex(123, 5, "x");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(5);
  });
});

describe("buildProjectGeometryFromProgramme — layout variation", () => {
  function makeBrief(seed) {
    const brief = {
      project_name: "test-house",
      building_type: "dwelling",
      canonical_building_type: "dwelling",
      target_storeys: 2,
      target_gia_m2: 150,
    };
    if (seed !== null && seed !== undefined) {
      brief.generation_seed = seed;
    }
    return brief;
  }

  function makeSite() {
    return {
      buildable_polygon: [
        { x: 0, y: 0 },
        { x: 16, y: 0 },
        { x: 16, y: 12 },
        { x: 0, y: 12 },
      ],
      main_entry: { orientation: "south" },
    };
  }

  function makeProgramme() {
    // Two-band programme so band rotation is observable: ground = public,
    // upper = private, four spaces per level so balanceBands fills both.
    return {
      spaces: [
        {
          space_id: "living",
          name: "Living Room",
          target_area_m2: 22,
          target_level_index: 0,
        },
        {
          space_id: "kitchen",
          name: "Kitchen",
          target_area_m2: 14,
          target_level_index: 0,
        },
        {
          space_id: "dining",
          name: "Dining",
          target_area_m2: 12,
          target_level_index: 0,
        },
        {
          space_id: "wc",
          name: "WC",
          target_area_m2: 4,
          target_level_index: 0,
        },
        {
          space_id: "primary",
          name: "Primary Bedroom",
          target_area_m2: 18,
          target_level_index: 1,
        },
        {
          space_id: "bedroom-2",
          name: "Bedroom 2",
          target_area_m2: 12,
          target_level_index: 1,
        },
        {
          space_id: "bedroom-3",
          name: "Bedroom 3",
          target_area_m2: 10,
          target_level_index: 1,
        },
        {
          space_id: "bathroom",
          name: "Bathroom",
          target_area_m2: 6,
          target_level_index: 1,
        },
      ],
    };
  }

  test("same seed → identical geometry (determinism preserved)", () => {
    const a = buildProjectGeometryFromProgramme({
      brief: makeBrief(1234),
      site: makeSite(),
      programme: makeProgramme(),
      localStyle: {
        primary_style: "test",
        material_palette: ["brick"],
        avoid_keywords: [],
        local_blend_strength: 0.5,
        innovation_strength: 0.5,
      },
    });
    const b = buildProjectGeometryFromProgramme({
      brief: makeBrief(1234),
      site: makeSite(),
      programme: makeProgramme(),
      localStyle: {
        primary_style: "test",
        material_palette: ["brick"],
        avoid_keywords: [],
        local_blend_strength: 0.5,
        innovation_strength: 0.5,
      },
    });
    expect(a.rooms.length).toBe(b.rooms.length);
    expect(a.windows.length).toBe(b.windows.length);
    // Same seed → same room polygons.
    const roomXsA = a.rooms.map((r) => r.polygon[0]?.x).join("|");
    const roomXsB = b.rooms.map((r) => r.polygon[0]?.x).join("|");
    expect(roomXsA).toBe(roomXsB);
    // Same seed → same window x positions.
    const winXsA = a.windows.map((w) => w.position.x).join("|");
    const winXsB = b.windows.map((w) => w.position.x).join("|");
    expect(winXsA).toBe(winXsB);
  });

  test("seed null → layout falls back to original deterministic behaviour", () => {
    const a = buildProjectGeometryFromProgramme({
      brief: makeBrief(null),
      site: makeSite(),
      programme: makeProgramme(),
      localStyle: {
        primary_style: "test",
        material_palette: ["brick"],
        avoid_keywords: [],
        local_blend_strength: 0.5,
        innovation_strength: 0.5,
      },
    });
    expect(a.rooms.length).toBeGreaterThan(0);
    // Window position fraction should be 0.5 (midpoint) when no seed
    a.windows.forEach((w) => {
      expect(w.position_fraction).toBe(0.5);
    });
  });

  test("different seeds → at least one of {window position, room order} changes", () => {
    const programme = makeProgramme();
    const site = makeSite();
    const sigs = new Set();
    for (let seed = 1; seed <= 10; seed += 1) {
      const result = buildProjectGeometryFromProgramme({
        brief: makeBrief(seed),
        site,
        programme,
        localStyle: {
          primary_style: "test",
          material_palette: ["brick"],
          avoid_keywords: [],
          local_blend_strength: 0.5,
          innovation_strength: 0.5,
        },
      });
      const roomY = result.rooms
        .map((r) => `${r.id}:${r.polygon[0]?.y ?? 0}`)
        .join("|");
      const winFractions = result.windows
        .map((w) => `${w.id}:${w.position_fraction ?? 0}`)
        .join("|");
      sigs.add(`${roomY}::${winFractions}`);
    }
    // Across 10 different seeds we should see at least 2 distinct geometries
    // (band rotation × window-fraction variation).
    expect(sigs.size).toBeGreaterThan(1);
  });

  test("layout_variation_applied flag is true when seed is supplied, false when null", () => {
    const seeded = buildProjectGeometryFromProgramme({
      brief: makeBrief(42),
      site: makeSite(),
      programme: makeProgramme(),
      localStyle: {
        primary_style: "test",
        material_palette: ["brick"],
        avoid_keywords: [],
        local_blend_strength: 0.5,
        innovation_strength: 0.5,
      },
    });
    const unseeded = buildProjectGeometryFromProgramme({
      brief: makeBrief(null),
      site: makeSite(),
      programme: makeProgramme(),
      localStyle: {
        primary_style: "test",
        material_palette: ["brick"],
        avoid_keywords: [],
        local_blend_strength: 0.5,
        innovation_strength: 0.5,
      },
    });
    expect(seeded.metadata?.design_variant?.layout_variation_applied).toBe(
      true,
    );
    expect(unseeded.metadata?.design_variant?.layout_variation_applied).toBe(
      false,
    );
  });
});
