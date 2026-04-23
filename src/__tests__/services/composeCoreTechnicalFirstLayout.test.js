import {
  GRID_12COL,
  LENIENT_PANELS,
  STRICT_PANELS,
  getDefaultMinSlotOccupancy,
  resolveLayout,
} from "../../services/a1/composeCore.js";
import { PANEL_PRIORITY_ORDER } from "../../services/a1/A1GridSpec12Column.js";

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
});
