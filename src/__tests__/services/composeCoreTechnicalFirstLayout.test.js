import {
  GRID_12COL,
  GRID_PRESENTATION_V3,
  LENIENT_PANELS,
  STRICT_PANELS,
  getDefaultMinSlotOccupancy,
  normalizeLayoutTemplate,
  resolveLayout,
} from "../../services/a1/composeCore.js";
import { PANEL_PRIORITY_ORDER } from "../../services/a1/A1GridSpec12Column.js";

function rectsOverlap(a, b) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
}

function findOverlappingPair(layout) {
  const entries = Object.entries(layout).filter(
    ([, slot]) => slot && slot.width > 0 && slot.height > 0,
  );
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [keyA, rectA] = entries[i];
      const [keyB, rectB] = entries[j];
      if (rectsOverlap(rectA, rectB)) {
        return { keyA, keyB, rectA, rectB };
      }
    }
  }
  return null;
}

describe("composeCore technical-first layout", () => {
  test("plans and sections occupy more board area than the hero", () => {
    const heroArea = GRID_12COL.hero_3d.width * GRID_12COL.hero_3d.height;
    const planArea =
      GRID_12COL.floor_plan_ground.width * GRID_12COL.floor_plan_ground.height;
    const elevationArea =
      GRID_12COL.elevation_north.width * GRID_12COL.elevation_north.height;
    const sectionArea =
      GRID_12COL.section_AA.width * GRID_12COL.section_AA.height;

    expect(planArea).toBeGreaterThan(heroArea);
    expect(elevationArea).toBeGreaterThan(heroArea);
    expect(sectionArea).toBeGreaterThan(heroArea);
    expect(GRID_12COL.floor_plan_ground.height).toBeGreaterThan(
      GRID_12COL.hero_3d.height,
    );
  });

  test("two-floor layouts expand plans across the dominant middle band", () => {
    const { layout } = resolveLayout({
      layoutTemplate: "board-v2",
      floorCount: 2,
    });

    expect(layout.floor_plan_ground).toEqual({
      x: 0.015,
      y: 0.235,
      width: 0.475,
      height: 0.29,
    });
    expect(layout.floor_plan_first).toEqual({
      x: 0.5,
      y: 0.235,
      width: 0.485,
      height: 0.29,
    });
    expect(layout.hero_3d.width * layout.hero_3d.height).toBeLessThan(
      layout.floor_plan_ground.width * layout.floor_plan_ground.height,
    );
  });

  test("sections are treated as core technical panels, not lenient fillers", () => {
    expect(STRICT_PANELS.has("section_AA")).toBe(true);
    expect(STRICT_PANELS.has("section_BB")).toBe(true);
    expect(LENIENT_PANELS.has("section_AA")).toBe(false);
    expect(LENIENT_PANELS.has("section_BB")).toBe(false);
  });

  test("qa metadata prioritizes technical drawings ahead of hero visuals", () => {
    expect(PANEL_PRIORITY_ORDER.indexOf("floor_plan_ground")).toBeLessThan(
      PANEL_PRIORITY_ORDER.indexOf("hero_3d"),
    );
    expect(PANEL_PRIORITY_ORDER.indexOf("section_AA")).toBeLessThan(
      PANEL_PRIORITY_ORDER.indexOf("hero_3d"),
    );
  });

  test("wide floor-plan slots keep occupancy threshold realistic", () => {
    const thresholdWidePlan = getDefaultMinSlotOccupancy(
      "floor_plan_ground",
      2.53,
    );
    const thresholdSquarePlan = getDefaultMinSlotOccupancy(
      "floor_plan_ground",
      1,
    );

    expect(thresholdWidePlan).toBeLessThan(0.5);
    expect(thresholdSquarePlan).toBe(0.58);
  });

  describe("Phase B: presentation-v3 layout", () => {
    test("aliases normalise to presentation-v3", () => {
      expect(normalizeLayoutTemplate("presentation-v3")).toBe(
        "presentation-v3",
      );
      expect(normalizeLayoutTemplate("presentation_v3")).toBe(
        "presentation-v3",
      );
      expect(normalizeLayoutTemplate("residential")).toBe("presentation-v3");
      expect(normalizeLayoutTemplate("residential-presentation")).toBe(
        "presentation-v3",
      );
      // Existing aliases unchanged.
      expect(normalizeLayoutTemplate("uk-riba-standard")).toBe("board-v2");
      expect(normalizeLayoutTemplate("")).toBe("board-v2");
      expect(normalizeLayoutTemplate("legacy")).toBe("legacy");
    });

    test("base spec covers every required canonical panel", () => {
      const required = [
        "site_diagram",
        "floor_plan_ground",
        "floor_plan_first",
        "elevation_north",
        "elevation_south",
        "elevation_east",
        "elevation_west",
        "section_AA",
        "section_BB",
        "axonometric",
        "hero_3d",
        "interior_3d",
        "material_palette",
        "schedules_notes",
        "title_block",
      ];
      for (const key of required) {
        expect(GRID_PRESENTATION_V3[key]).toBeDefined();
        expect(GRID_PRESENTATION_V3[key].width).toBeGreaterThan(0);
        expect(GRID_PRESENTATION_V3[key].height).toBeGreaterThan(0);
      }
    });

    test("1-floor presentation-v3 has no overlapping panels", () => {
      const { layout } = resolveLayout({
        layoutTemplate: "presentation-v3",
        floorCount: 1,
      });
      expect(layout.floor_plan_first).toBeUndefined();
      expect(layout.floor_plan_level2).toBeUndefined();
      expect(findOverlappingPair(layout)).toBeNull();
    });

    test("2-floor presentation-v3 has both ground+first plans, no overlaps", () => {
      const { layout } = resolveLayout({
        layoutTemplate: "presentation-v3",
        floorCount: 2,
      });
      expect(layout.floor_plan_ground).toBeDefined();
      expect(layout.floor_plan_first).toBeDefined();
      expect(layout.floor_plan_level2).toBeUndefined();
      expect(findOverlappingPair(layout)).toBeNull();
    });

    test("3-floor presentation-v3 synthesises floor_plan_level2 in the plan row", () => {
      const { layout } = resolveLayout({
        layoutTemplate: "presentation-v3",
        floorCount: 3,
      });
      expect(layout.floor_plan_ground).toBeDefined();
      expect(layout.floor_plan_first).toBeDefined();
      expect(layout.floor_plan_level2).toBeDefined();
      expect(findOverlappingPair(layout)).toBeNull();
      // All three plans share the same y/height (top row plan band).
      expect(layout.floor_plan_first.y).toBe(layout.floor_plan_ground.y);
      expect(layout.floor_plan_level2.y).toBe(layout.floor_plan_ground.y);
    });

    test("board-v2 floor row remains byte-identical to the previous hardcoded values", () => {
      const { layout } = resolveLayout({
        layoutTemplate: "board-v2",
        floorCount: 2,
      });
      expect(layout.floor_plan_ground).toEqual({
        x: 0.015,
        y: 0.235,
        width: 0.475,
        height: 0.29,
      });
      expect(layout.floor_plan_first).toEqual({
        x: 0.5,
        y: 0.235,
        width: 0.485,
        height: 0.29,
      });
    });

    test("board-v2 1-floor expansion is byte-identical", () => {
      const { layout } = resolveLayout({
        layoutTemplate: "board-v2",
        floorCount: 1,
      });
      expect(layout.floor_plan_ground).toEqual({
        x: 0.015,
        y: 0.235,
        width: 0.97,
        height: 0.29,
      });
    });

    test("layoutTemplate flows through resolveLayout output", () => {
      expect(
        resolveLayout({ layoutTemplate: "residential" }).layoutTemplate,
      ).toBe("presentation-v3");
      expect(
        resolveLayout({ layoutTemplate: "presentation-v3" }).layoutTemplate,
      ).toBe("presentation-v3");
      expect(resolveLayout({ layoutTemplate: "board-v2" }).layoutTemplate).toBe(
        "board-v2",
      );
    });
  });
});
