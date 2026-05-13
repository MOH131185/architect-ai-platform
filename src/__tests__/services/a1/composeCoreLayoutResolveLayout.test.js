/**
 * Phase 3 layout — executable regression gate for resolveLayout.
 *
 * The Phase 3 fix moved `GRID_PRESENTATION_V3` row-1 panels to
 * `A1_CONTENT_TOP_NORMALIZED`, but `resolveLayout()` later calls
 * `applyFloorRow()`, which re-tiles the floor-plan slots from
 * `FLOOR_ROW_DESCRIPTORS["presentation-v3"]`. If that descriptor still
 * carries the legacy `y: 0.015, height: 0.305`, every floor-plan slot
 * (`floor_plan_ground` / `_first` / `_level2`) is overwritten back into
 * the title-bar overlap zone for floorCount 1/2/3 and the structural-
 * source check in `composeCoreLayoutConstants.test.js` cannot catch it.
 *
 * This suite uses the real `resolveLayout` output (not a source-string
 * scan) for floorCount 1, 2, and 3 and asserts every resolved
 * `floor_plan_*` slot honours the safe band, and that row 2 still
 * starts at y=0.335 (i.e. the safe-band bump did NOT eat into the row-2
 * boundary).
 */

import {
  A1_CONTENT_TOP_MM,
  A1_CONTENT_TOP_NORMALIZED,
  A1_HEIGHT_MM,
  resolveLayout,
} from "../../../services/a1/composeCore.js";

const TOLERANCE_NORMALIZED = 1e-6;
const TOLERANCE_MM = A1_HEIGHT_MM * TOLERANCE_NORMALIZED + 0.05;
const PRESENTATION_V3_ROW2_Y = 0.335;

function planSlotsFromLayout(layout) {
  return Object.entries(layout).filter(
    ([key, slot]) =>
      typeof key === "string" &&
      key.startsWith("floor_plan_") &&
      slot &&
      typeof slot.y === "number",
  );
}

function assertFloorPlanRespectsSafeBand(slot, key) {
  const topMm = slot.y * A1_HEIGHT_MM;
  expect({
    key,
    y: slot.y,
    topMm,
  }).toEqual(
    expect.objectContaining({
      key,
      y: expect.any(Number),
      topMm: expect.any(Number),
    }),
  );
  expect(slot.y).toBeGreaterThanOrEqual(
    A1_CONTENT_TOP_NORMALIZED - TOLERANCE_NORMALIZED,
  );
  expect(topMm).toBeGreaterThanOrEqual(A1_CONTENT_TOP_MM - TOLERANCE_MM);
}

describe("resolveLayout(presentation-v3) — floor plans respect the title-bar safe band", () => {
  for (const floorCount of [1, 2, 3]) {
    test(`floorCount=${floorCount}: every floor_plan_* slot starts at or below the safe-band line`, () => {
      const { layout } = resolveLayout({
        layoutTemplate: "presentation-v3",
        floorCount,
      });
      const planSlots = planSlotsFromLayout(layout);
      // Sanity: the expected number of plan slots are present.
      const expectedKeys = {
        1: ["floor_plan_ground"],
        2: ["floor_plan_ground", "floor_plan_first"],
        3: ["floor_plan_ground", "floor_plan_first", "floor_plan_level2"],
      };
      expect(planSlots.map(([k]) => k).sort()).toEqual(
        expectedKeys[floorCount].sort(),
      );
      for (const [key, slot] of planSlots) {
        assertFloorPlanRespectsSafeBand(slot, key);
      }
    });

    test(`floorCount=${floorCount}: row 2 still starts at y=0.335 (safe band did not push it down)`, () => {
      const { layout } = resolveLayout({
        layoutTemplate: "presentation-v3",
        floorCount,
      });
      // Row 2 in presentation-v3 = section_AA / section_BB / axonometric
      // / E-W elevations. The safe-band bump only affected row 1; row 2
      // y must stay pinned to 0.335 so downstream panels (and the QA
      // occupancy heuristics that key on row geometry) do not shift.
      expect(layout.section_AA?.y).toBeCloseTo(PRESENTATION_V3_ROW2_Y, 4);
      expect(layout.section_BB?.y).toBeCloseTo(PRESENTATION_V3_ROW2_Y, 4);
      expect(layout.axonometric?.y).toBeCloseTo(PRESENTATION_V3_ROW2_Y, 4);
      expect(layout.elevation_east?.y).toBeCloseTo(PRESENTATION_V3_ROW2_Y, 4);
    });

    test(`floorCount=${floorCount}: floor plans + sibling row-1 panels share the same top edge`, () => {
      // The applyFloorRow re-tile must align floor plans with the rest
      // of row 1 (site_diagram, elevations N/S). Pre-fix, the FLOOR_ROW
      // descriptor's stale 0.015 caused a vertical step.
      const { layout } = resolveLayout({
        layoutTemplate: "presentation-v3",
        floorCount,
      });
      const expectedY = A1_CONTENT_TOP_NORMALIZED;
      expect(layout.site_diagram?.y).toBeCloseTo(expectedY, 4);
      expect(layout.elevation_north?.y).toBeCloseTo(expectedY, 4);
      for (const [, slot] of planSlotsFromLayout(layout)) {
        expect(slot.y).toBeCloseTo(expectedY, 4);
      }
    });
  }

  test("descriptor row height keeps row-2 boundary intact (height ≤ 0.335 − A1_CONTENT_TOP_NORMALIZED)", () => {
    const { layout } = resolveLayout({
      layoutTemplate: "presentation-v3",
      floorCount: 2,
    });
    // floor_plan_ground.y + height must NOT push past row 2's 0.335.
    const bottom = layout.floor_plan_ground.y + layout.floor_plan_ground.height;
    expect(bottom).toBeLessThanOrEqual(PRESENTATION_V3_ROW2_Y + 1e-3);
  });
});

describe("resolveLayout(board-v2) — floor plans unaffected (row 2 already below safe band)", () => {
  for (const floorCount of [1, 2, 3]) {
    test(`floorCount=${floorCount}: board-v2 floor plans still start at y=0.235`, () => {
      const { layout } = resolveLayout({
        layoutTemplate: "board-v2",
        floorCount,
      });
      for (const [, slot] of planSlotsFromLayout(layout)) {
        expect(slot.y).toBeCloseTo(0.235, 4);
        // Still well below the safe-band line.
        expect(slot.y).toBeGreaterThan(A1_CONTENT_TOP_NORMALIZED);
      }
    });
  }
});
