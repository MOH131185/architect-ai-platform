// PR2 of the A1 defect remediation plan. Asserts:
//   1. dwellingProgrammeTemplate is parametric on targetBedrooms (1..5)
//      with descending ratios; default 3 preserves pre-PR2 behaviour.
//   2. "WC and utility" template row was split into separate WC + Utility
//      rooms, both pinned to ground floor.
//   3. brief.target_bedrooms flows through buildTemplateProgramSpaces
//      into the generated spaces list.
//   4. layoutRoomsForLevel throws ProgrammeNDSSViolationError when a
//      dwelling brief would produce rooms below NDSS minima (e.g. a tiny
//      target_gia_m2 with 5 bedrooms).
//   5. The svgPlanRenderer stair-label dedup rule suppresses labels for
//      rooms named "Stair"/"Stair Core" unless room.type === "stair".

import { __projectGraphVerticalSliceInternals } from "../../services/project/projectGraphVerticalSliceService.js";
import { ProgrammeNDSSViolationError } from "../../services/project/ndssValidator.js";
import { isStairLikeName } from "../../services/drawing/svgPlanRenderer.js";

const {
  dwellingProgrammeTemplate,
  buildTemplateProgramSpaces,
  layoutRoomsForLevel,
} = __projectGraphVerticalSliceInternals;

function bedroomNames(template) {
  return template
    .map(([name]) => name)
    .filter((name) => /^(Principal\s+)?[Bb]edroom\b/.test(name));
}

function findRow(template, name) {
  return template.find(([n]) => n === name);
}

describe("PR2 — dwellingProgrammeTemplate parametric on targetBedrooms", () => {
  test("default (no argument) → 3 bedrooms (Principal + 2 + 3)", () => {
    const template = dwellingProgrammeTemplate(1);
    expect(bedroomNames(template)).toEqual([
      "Principal bedroom",
      "Bedroom 2",
      "Bedroom 3",
    ]);
  });

  test("targetBedrooms = 1 → only Principal bedroom on upper level", () => {
    const template = dwellingProgrammeTemplate(1, 1);
    expect(bedroomNames(template)).toEqual(["Principal bedroom"]);
  });

  test("targetBedrooms = 4 → Principal + Bedroom 2..4", () => {
    const template = dwellingProgrammeTemplate(1, 4);
    expect(bedroomNames(template)).toEqual([
      "Principal bedroom",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
    ]);
  });

  test("targetBedrooms = 5 → Principal + Bedroom 2..5", () => {
    const template = dwellingProgrammeTemplate(1, 5);
    expect(bedroomNames(template)).toEqual([
      "Principal bedroom",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Bedroom 5",
    ]);
  });

  test("targetBedrooms = 6 (out of range) clamps to 5", () => {
    const template = dwellingProgrammeTemplate(1, 6);
    expect(bedroomNames(template)).toHaveLength(5);
  });

  test("targetBedrooms = 0 (out of range) clamps to 1", () => {
    const template = dwellingProgrammeTemplate(1, 0);
    expect(bedroomNames(template)).toEqual(["Principal bedroom"]);
  });

  test("ratios across the whole template sum to ~1.0 for every N", () => {
    for (let n = 1; n <= 5; n += 1) {
      const total = dwellingProgrammeTemplate(1, n).reduce(
        (sum, [, , , ratio]) => sum + ratio,
        0,
      );
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  test("Principal bedroom always has the largest bedroom ratio", () => {
    for (let n = 2; n <= 5; n += 1) {
      const template = dwellingProgrammeTemplate(1, n);
      const principal = findRow(template, "Principal bedroom");
      const secondaryRatios = template
        .filter(([name]) => /^Bedroom\b/.test(name))
        .map(([, , , ratio]) => ratio);
      expect(principal[3]).toBeGreaterThanOrEqual(Math.max(...secondaryRatios));
    }
  });
});

describe("PR2 — WC and Utility are separate template rows on level 0", () => {
  test("Template contains WC and Utility as distinct rows", () => {
    const template = dwellingProgrammeTemplate(1, 3);
    const wc = findRow(template, "WC");
    const utility = findRow(template, "Utility");
    expect(wc).toBeDefined();
    expect(utility).toBeDefined();
    // No more combined "WC and utility" row
    expect(findRow(template, "WC and utility")).toBeUndefined();
  });

  test("Both WC and Utility are tagged as service zone on level 0", () => {
    const template = dwellingProgrammeTemplate(1, 3);
    const wc = findRow(template, "WC");
    const utility = findRow(template, "Utility");
    expect(wc[2]).toBe("service");
    expect(wc[4]).toBe(0);
    expect(utility[2]).toBe("service");
    expect(utility[4]).toBe(0);
  });

  test("Combined WC+Utility ratio matches the previous 0.05 cell", () => {
    const template = dwellingProgrammeTemplate(1, 3);
    const wc = findRow(template, "WC");
    const utility = findRow(template, "Utility");
    expect(wc[3] + utility[3]).toBeCloseTo(0.05, 5);
  });
});

describe("PR2 — buildTemplateProgramSpaces threads brief.target_bedrooms", () => {
  function dwellingBrief(extras = {}) {
    return {
      project_name: "PR2 Test Dwelling",
      building_type: "dwelling",
      target_gia_m2: 180,
      target_storeys: 2,
      ...extras,
    };
  }

  function bedroomSpaces(spaces) {
    return spaces.filter((s) => /^(Principal|Bedroom)/.test(s.name));
  }

  test("brief.target_bedrooms = 4 produces 4 bedroom spaces", () => {
    const { spaces } = buildTemplateProgramSpaces(
      dwellingBrief({ target_bedrooms: 4 }),
    );
    const beds = bedroomSpaces(spaces);
    expect(beds).toHaveLength(4);
    expect(beds.map((b) => b.name)).toEqual([
      "Principal bedroom",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
    ]);
  });

  test("brief.target_bedrooms = 1 produces 1 bedroom space", () => {
    const { spaces } = buildTemplateProgramSpaces(
      dwellingBrief({ target_bedrooms: 1 }),
    );
    expect(bedroomSpaces(spaces)).toHaveLength(1);
  });

  test("brief without target_bedrooms defaults to 3", () => {
    const { spaces } = buildTemplateProgramSpaces(dwellingBrief());
    expect(bedroomSpaces(spaces)).toHaveLength(3);
  });

  test("WC and Utility are both placed on ground floor (target_level_index === 0)", () => {
    const { spaces } = buildTemplateProgramSpaces(dwellingBrief());
    const wc = spaces.find((s) => s.name === "WC");
    const utility = spaces.find((s) => s.name === "Utility");
    expect(wc).toBeDefined();
    expect(utility).toBeDefined();
    expect(wc.target_level_index).toBe(0);
    expect(utility.target_level_index).toBe(0);
  });

  test("WC and Utility stay on ground floor even for a 3-storey brief (level pinning)", () => {
    const { spaces } = buildTemplateProgramSpaces(
      dwellingBrief({ target_storeys: 3 }),
    );
    const wc = spaces.find((s) => s.name === "WC");
    const utility = spaces.find((s) => s.name === "Utility");
    expect(wc.target_level_index).toBe(0);
    expect(utility.target_level_index).toBe(0);
  });
});

describe("PR2 — layoutRoomsForLevel enforces NDSS for dwelling", () => {
  function tinyDwellingSpaces() {
    // Deliberately tiny target areas — Bedroom 1 would be ~ 1.5 m².
    // The dwelling validator should reject this.
    return [
      {
        space_id: "space-living",
        name: "Living room",
        function: "family living space",
        zone: "public",
        target_area_m2: 6,
        target_level_index: 0,
        required_daylight: "high",
      },
      {
        space_id: "space-bedroom-1",
        name: "Bedroom 1",
        function: "secondary bedroom",
        zone: "private",
        target_area_m2: 1.5,
        target_level_index: 0,
        required_daylight: "medium",
      },
    ];
  }

  const footprint = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 1.25 },
    { x: 0, y: 1.25 },
  ];
  const footprintBbox = {
    min_x: 0,
    min_y: 0,
    max_x: 6,
    max_y: 1.25,
    width: 6,
    height: 1.25,
  };

  test("throws ProgrammeNDSSViolationError for dwelling brief with enforceNDSS = true", () => {
    expect(() =>
      layoutRoomsForLevel({
        spaces: tinyDwellingSpaces(),
        levelIndex: 0,
        footprint,
        footprintBbox,
        walls: [],
        doors: [],
        windows: [],
        buildingType: "dwelling",
        enforceNDSS: true,
      }),
    ).toThrow(ProgrammeNDSSViolationError);
  });

  test("error mentions the offending room and rule", () => {
    try {
      layoutRoomsForLevel({
        spaces: tinyDwellingSpaces(),
        levelIndex: 0,
        footprint,
        footprintBbox,
        walls: [],
        doors: [],
        windows: [],
        buildingType: "dwelling",
        enforceNDSS: true,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProgrammeNDSSViolationError);
      expect(err.message).toMatch(/Bedroom 1/);
      const ruleKeys = err.violations.map((v) => v.ruleKey);
      // Either area, width, or aspect ratio violations should appear.
      expect(
        ruleKeys.some((k) =>
          ["bedroom_double", "bedroom_single", "aspect_ratio"].includes(k),
        ),
      ).toBe(true);
    }
  });

  test("does NOT throw when buildingType is non-dwelling (NDSS gated)", () => {
    // Same tiny spaces, but community building type — NDSS does not apply.
    expect(() =>
      layoutRoomsForLevel({
        spaces: tinyDwellingSpaces(),
        levelIndex: 0,
        footprint,
        footprintBbox,
        walls: [],
        doors: [],
        windows: [],
        buildingType: "community",
        enforceNDSS: true,
      }),
    ).not.toThrow();
  });

  test("does NOT throw when buildingType omitted (defaults to non-dwelling behaviour)", () => {
    expect(() =>
      layoutRoomsForLevel({
        spaces: tinyDwellingSpaces(),
        levelIndex: 0,
        footprint,
        footprintBbox,
        walls: [],
        doors: [],
        windows: [],
        enforceNDSS: true,
      }),
    ).not.toThrow();
  });

  test("default (enforceNDSS omitted) warns but does not throw — opt-in until existing fixtures migrate", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        layoutRoomsForLevel({
          spaces: tinyDwellingSpaces(),
          levelIndex: 0,
          footprint,
          footprintBbox,
          walls: [],
          doors: [],
          windows: [],
          buildingType: "dwelling",
        }),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
      const warnMessage = warnSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(warnMessage).toMatch(/ndssValidator/);
      expect(warnMessage).toMatch(/Bedroom 1/);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("PR2 — STAIR label dedup rule (isStairLikeName)", () => {
  test.each([
    ["Stair", true],
    ["stair", true],
    ["STAIR", true],
    ["Stair Core", true],
    ["stair core", true],
    ["Stair-Core", true],
    ["Stair 1", true],
    ["Living room", false],
    ["Stairs to roof", false], // plural — not the canonical naming we suppress
    ["Bedroom 2", false],
    ["Kitchen", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isStairLikeName(%p) → %s", (input, expected) => {
    expect(isStairLikeName(input)).toBe(expected);
  });
});
