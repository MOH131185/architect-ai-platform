/**
 * Pre-UI-smoke fix #2 — board-v2 panel specs respect the 16mm A1 safe band.
 *
 * Codex audit caught `floorPlansBlockY = 12` and `elevationsBlockY = 12`
 * in `buildSheetPanelSpecs` — the board-v2 layout used for non-residential
 * and ≥4-storey designs. `A1_CONTENT_TOP_MM` in composeCore.js is 16, so a
 * row-1 panel at y=12 overlapped the 10mm title bar + 6mm safe band.
 *
 * presentation-v3 (residential ≤3 storeys) was already compliant — its
 * `ROW1_Y = 16` constant is covered by `composeCoreLayoutConstants.test.js`.
 * This test covers the board-v2 path directly and walks every storey count
 * that can be produced by the pipeline.
 */

import { A1_CONTENT_TOP_MM } from "../../services/a1/composeCore.js";
import {
  buildPresentationV3SheetPanelSpecs,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";

const { buildSheetPanelSpecs } = __projectGraphVerticalSliceInternals;

describe("buildSheetPanelSpecs (board-v2) — A1 safe band", () => {
  test("safe band constant is 16mm (10mm title + 6mm band)", () => {
    expect(A1_CONTENT_TOP_MM).toBe(16);
  });

  describe.each([1, 2, 3, 4, 6, 8])("storeyCount = %i", (storeyCount) => {
    let specs;
    beforeAll(() => {
      specs = buildSheetPanelSpecs(storeyCount);
    });

    test("every floor-plan panel sits at or below the safe band", () => {
      const floorPlans = specs.filter((s) =>
        String(s.panelType).startsWith("floor_plan_"),
      );
      expect(floorPlans.length).toBeGreaterThan(0);
      floorPlans.forEach((panel) => {
        expect(panel.y).toBeGreaterThanOrEqual(A1_CONTENT_TOP_MM);
      });
    });

    test("every elevation panel sits at or below the safe band", () => {
      const elevations = specs.filter((s) =>
        String(s.panelType).startsWith("elevation_"),
      );
      expect(elevations.length).toBeGreaterThan(0);
      elevations.forEach((panel) => {
        expect(panel.y).toBeGreaterThanOrEqual(A1_CONTENT_TOP_MM);
      });
    });

    test("no row-1 panel (y < 200) intrudes into the title-bar zone", () => {
      const rowOne = specs.filter((s) => s.y < 200);
      expect(rowOne.length).toBeGreaterThan(0);
      rowOne.forEach((panel) => {
        expect(panel.y).toBeGreaterThanOrEqual(A1_CONTENT_TOP_MM);
      });
    });

    test("floor-plan block does not overlap the section row (y=196)", () => {
      const floorPlans = specs.filter((s) =>
        String(s.panelType).startsWith("floor_plan_"),
      );
      const floorPlanBottoms = floorPlans.map((p) => p.y + p.height);
      const maxBottom = Math.max(...floorPlanBottoms);
      // Section row anchor is y=196 in buildSheetPanelSpecs. 10mm headroom
      // is what the post-fix 16mm safe band leaves.
      expect(maxBottom).toBeLessThanOrEqual(196);
    });
  });
});

describe("buildPresentationV3SheetPanelSpecs — A1 safe band (regression guard)", () => {
  describe.each([1, 2, 3])("storeyCount = %i", (storeyCount) => {
    test("row-1 panels respect the 16mm safe band", () => {
      const specs = buildPresentationV3SheetPanelSpecs(storeyCount);
      const rowOne = specs.filter((s) => s.y < 200);
      expect(rowOne.length).toBeGreaterThan(0);
      rowOne.forEach((panel) => {
        expect(panel.y).toBeGreaterThanOrEqual(A1_CONTENT_TOP_MM);
      });
    });
  });
});
