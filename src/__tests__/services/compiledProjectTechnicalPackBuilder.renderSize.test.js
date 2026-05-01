import { getTechnicalPanelRenderSize } from "../../services/canonical/compiledProjectTechnicalPackBuilder.js";
import {
  WORKING_HEIGHT,
  WORKING_WIDTH,
  resolveLayout,
  toPixelRect,
} from "../../services/a1/composeCore.js";

// Per-panel readability minimums applied inside getTechnicalPanelRenderSize.
const PLAN_MIN_WIDTH = 760;
const PLAN_MIN_HEIGHT = 420;
const SECTION_MIN_WIDTH = 720;
const SECTION_MIN_HEIGHT = 400;
const ELEVATION_MIN_WIDTH = 560;
const ELEVATION_MIN_HEIGHT = 320;

// roundEven rounds to even integers, so aspect ratios drift by a few tenths
// of a percent. 2.5 % is comfortable headroom.
const ASPECT_TOLERANCE = 0.025;

function slotPixelAspect(panelType, floorCount, layoutTemplate) {
  const { layout } = resolveLayout({ layoutTemplate, floorCount });
  const slot = layout?.[panelType];
  if (!slot) return null;
  const slotRect = toPixelRect(slot, WORKING_WIDTH, WORKING_HEIGHT);
  if (!(slotRect.width > 0 && slotRect.height > 0)) return null;
  return slotRect.width / slotRect.height;
}

describe("getTechnicalPanelRenderSize — aspect preservation", () => {
  describe("presentation-v3", () => {
    test("floor_plan_ground (2-storey) keeps slot-like aspect ratio", () => {
      const size = getTechnicalPanelRenderSize(
        "floor_plan_ground",
        2,
        "presentation-v3",
      );
      const slotAspect = slotPixelAspect(
        "floor_plan_ground",
        2,
        "presentation-v3",
      );
      const svgAspect = size.width / size.height;
      expect(slotAspect).not.toBeNull();
      expect(Math.abs(svgAspect - slotAspect)).toBeLessThan(ASPECT_TOLERANCE);
      expect(size.width).toBeGreaterThanOrEqual(PLAN_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(PLAN_MIN_HEIGHT);
    });

    test("floor_plan_first (2-storey) keeps slot-like aspect ratio", () => {
      const size = getTechnicalPanelRenderSize(
        "floor_plan_first",
        2,
        "presentation-v3",
      );
      const slotAspect = slotPixelAspect(
        "floor_plan_first",
        2,
        "presentation-v3",
      );
      const svgAspect = size.width / size.height;
      expect(slotAspect).not.toBeNull();
      expect(Math.abs(svgAspect - slotAspect)).toBeLessThan(ASPECT_TOLERANCE);
      expect(size.width).toBeGreaterThanOrEqual(PLAN_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(PLAN_MIN_HEIGHT);
    });

    test("section_AA preserves slot aspect", () => {
      const size = getTechnicalPanelRenderSize(
        "section_AA",
        2,
        "presentation-v3",
      );
      const slotAspect = slotPixelAspect("section_AA", 2, "presentation-v3");
      const svgAspect = size.width / size.height;
      expect(Math.abs(svgAspect - slotAspect)).toBeLessThan(ASPECT_TOLERANCE);
      expect(size.width).toBeGreaterThanOrEqual(SECTION_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(SECTION_MIN_HEIGHT);
    });

    test("section_BB preserves slot aspect", () => {
      const size = getTechnicalPanelRenderSize(
        "section_BB",
        2,
        "presentation-v3",
      );
      const slotAspect = slotPixelAspect("section_BB", 2, "presentation-v3");
      const svgAspect = size.width / size.height;
      expect(Math.abs(svgAspect - slotAspect)).toBeLessThan(ASPECT_TOLERANCE);
      expect(size.width).toBeGreaterThanOrEqual(SECTION_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(SECTION_MIN_HEIGHT);
    });

    test.each([
      "elevation_north",
      "elevation_south",
      "elevation_east",
      "elevation_west",
    ])("%s preserves slot aspect", (panelType) => {
      const size = getTechnicalPanelRenderSize(panelType, 2, "presentation-v3");
      const slotAspect = slotPixelAspect(panelType, 2, "presentation-v3");
      const svgAspect = size.width / size.height;
      expect(Math.abs(svgAspect - slotAspect)).toBeLessThan(ASPECT_TOLERANCE);
      expect(size.width).toBeGreaterThanOrEqual(ELEVATION_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(ELEVATION_MIN_HEIGHT);
    });

    test("floor_plan_ground (1-storey) still preserves slot aspect after applyFloorRow re-tile", () => {
      const size = getTechnicalPanelRenderSize(
        "floor_plan_ground",
        1,
        "presentation-v3",
      );
      const slotAspect = slotPixelAspect(
        "floor_plan_ground",
        1,
        "presentation-v3",
      );
      const svgAspect = size.width / size.height;
      expect(Math.abs(svgAspect - slotAspect)).toBeLessThan(ASPECT_TOLERANCE);
      expect(size.width).toBeGreaterThanOrEqual(PLAN_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(PLAN_MIN_HEIGHT);
    });
  });

  describe("board-v2 — must remain stable", () => {
    test.each([
      ["floor_plan_ground", 1],
      ["floor_plan_ground", 2],
      ["floor_plan_first", 2],
      ["section_AA", 2],
      ["section_BB", 2],
      ["elevation_north", 2],
      ["elevation_south", 2],
      ["elevation_east", 2],
      ["elevation_west", 2],
    ])("%s (floors=%i) preserves slot aspect on board-v2", (panelType, fc) => {
      const size = getTechnicalPanelRenderSize(panelType, fc, "board-v2");
      const slotAspect = slotPixelAspect(panelType, fc, "board-v2");
      const svgAspect = size.width / size.height;
      expect(slotAspect).not.toBeNull();
      expect(Math.abs(svgAspect - slotAspect)).toBeLessThan(ASPECT_TOLERANCE);
    });

    test("plan render size meets the readability minimum without independently distorting axes", () => {
      const size = getTechnicalPanelRenderSize("floor_plan_ground", 1);
      expect(size.width).toBeGreaterThanOrEqual(PLAN_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(PLAN_MIN_HEIGHT);
      // The previous (broken) behaviour clamped width to 760 while leaving
      // height at the unscaled 542. Aspect at that point was ~1.40 (landscape)
      // but the slot is square-ish. After the fix, the SVG aspect must follow
      // the slot rather than the minimum-width clamp.
      const slotAspect = slotPixelAspect("floor_plan_ground", 1, "board-v2");
      expect(Math.abs(size.width / size.height - slotAspect)).toBeLessThan(
        ASPECT_TOLERANCE,
      );
    });

    test("section render size similarly preserves slot aspect", () => {
      const size = getTechnicalPanelRenderSize("section_AA", 2);
      expect(size.width).toBeGreaterThanOrEqual(SECTION_MIN_WIDTH);
      expect(size.height).toBeGreaterThanOrEqual(SECTION_MIN_HEIGHT);
      const slotAspect = slotPixelAspect("section_AA", 2, "board-v2");
      expect(Math.abs(size.width / size.height - slotAspect)).toBeLessThan(
        ASPECT_TOLERANCE,
      );
    });
  });

  describe("default behaviour", () => {
    test("layoutTemplate defaults to board-v2", () => {
      const fromDefault = getTechnicalPanelRenderSize("floor_plan_ground", 2);
      const fromExplicit = getTechnicalPanelRenderSize(
        "floor_plan_ground",
        2,
        "board-v2",
      );
      expect(fromDefault).toEqual(fromExplicit);
    });

    test("returns the documented fallback when the slot is absent", () => {
      const size = getTechnicalPanelRenderSize(
        "panel_that_does_not_exist",
        1,
        "board-v2",
      );
      expect(size).toEqual({ width: 1200, height: 760 });
    });
  });

  describe("presentation-v3 vs board-v2 differ where it matters", () => {
    // Verifies the wiring activates the aspect-fit fix on residential briefs:
    // board-v2 floor_plan_ground (2-storey, wide slot) and presentation-v3
    // floor_plan_ground (2-storey, square slot) produce DIFFERENT dimensions.
    // If they were identical, the layoutTemplate plumbing would be a no-op.
    test("floor_plan_ground (2-storey) differs between board-v2 and presentation-v3", () => {
      const boardV2 = getTechnicalPanelRenderSize(
        "floor_plan_ground",
        2,
        "board-v2",
      );
      const presV3 = getTechnicalPanelRenderSize(
        "floor_plan_ground",
        2,
        "presentation-v3",
      );
      const boardAspect = boardV2.width / boardV2.height;
      const presAspect = presV3.width / presV3.height;
      // board-v2 floor row is wide (~2:1 or wider after applyFloorRow);
      // presentation-v3 is closer to 1:1.
      expect(boardAspect).toBeGreaterThan(1.5);
      expect(presAspect).toBeLessThan(1.5);
      expect(boardV2).not.toEqual(presV3);
    });

    test("section_AA differs between board-v2 and presentation-v3", () => {
      const boardV2 = getTechnicalPanelRenderSize("section_AA", 2, "board-v2");
      const presV3 = getTechnicalPanelRenderSize(
        "section_AA",
        2,
        "presentation-v3",
      );
      expect(boardV2).not.toEqual(presV3);
    });

    test("storey routing intact: 1-storey omits floor_plan_first slot in both templates", () => {
      // For 1-storey, floor_plan_first should not exist in the layout
      // (returns the documented fallback). For 2-storey, it has a real slot.
      const v3OneStorey = getTechnicalPanelRenderSize(
        "floor_plan_first",
        1,
        "presentation-v3",
      );
      const v3TwoStorey = getTechnicalPanelRenderSize(
        "floor_plan_first",
        2,
        "presentation-v3",
      );
      // 1-storey returns the absent-slot fallback {1200, 760}; 2-storey returns a real slot dim.
      expect(v3OneStorey).toEqual({ width: 1200, height: 760 });
      expect(v3TwoStorey).not.toEqual(v3OneStorey);
    });
  });
});
