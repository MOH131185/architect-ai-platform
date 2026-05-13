/**
 * Phase 3 layout — A1 master sheet must reserve a safe band below the
 * 10mm title bar before the first content row begins. Pre-Phase 3 the
 * top row sat at y=0.015 normalized (≈ 8.9mm) which butted directly
 * against the title bar's black fill and let project-title descenders
 * touch the row-1 panel frames.
 *
 * This suite locks the deterministic floor every grid + slice panel
 * spec respects:
 *
 *   A1_TITLE_BAR_HEIGHT_MM  = 10
 *   A1_HEADER_SAFE_BAND_MM  = 6
 *   A1_CONTENT_TOP_MM       = 16
 *   A1_CONTENT_TOP_NORMALIZED = 16 / 594 ≈ 0.0269
 *
 * No grid spec may place its row-1 panels above this line, and the
 * minimum text / line-weight / occupancy thresholds the QA gate enforces
 * are the canonical numbers shared with `a1FinalExportContract`.
 */

import fs from "fs";
import path from "path";

import {
  A1_WIDTH,
  A1_HEIGHT,
  A1_WIDTH_MM,
  A1_HEIGHT_MM,
  A1_TITLE_BAR_HEIGHT_MM,
  A1_HEADER_SAFE_BAND_MM,
  A1_CONTENT_TOP_MM,
  A1_CONTENT_TOP_NORMALIZED,
  A1_FINAL_MIN_TEXT_SIZE_MM,
  A1_FINAL_MIN_LINE_WEIGHT_MM,
  A1_TECHNICAL_PANEL_MIN_OCCUPANCY,
  GRID_12COL,
  GRID_PRESENTATION_V3,
} from "../../../services/a1/composeCore.js";

describe("composeCore — A1 layout / readability constants (Phase 3)", () => {
  test("canvas + mm constants align with A1 landscape at 300 DPI", () => {
    expect(A1_WIDTH).toBe(9933);
    expect(A1_HEIGHT).toBe(7016);
    expect(A1_WIDTH_MM).toBe(841);
    expect(A1_HEIGHT_MM).toBe(594);
  });

  test("title-bar height + safe band sum to the content-top floor", () => {
    expect(A1_TITLE_BAR_HEIGHT_MM).toBe(10);
    expect(A1_HEADER_SAFE_BAND_MM).toBeGreaterThanOrEqual(4);
    expect(A1_CONTENT_TOP_MM).toBe(
      A1_TITLE_BAR_HEIGHT_MM + A1_HEADER_SAFE_BAND_MM,
    );
  });

  test("normalized content-top equals mm content-top / A1 height in mm", () => {
    expect(A1_CONTENT_TOP_NORMALIZED).toBeCloseTo(
      A1_CONTENT_TOP_MM / A1_HEIGHT_MM,
      6,
    );
    // The legacy 0.015 first-row Y was inside the title bar; the new
    // value must be strictly above it so the reservation is real.
    expect(A1_CONTENT_TOP_NORMALIZED).toBeGreaterThan(0.015);
    expect(A1_CONTENT_TOP_MM).toBeGreaterThan(A1_TITLE_BAR_HEIGHT_MM);
  });

  test("readability + occupancy thresholds are non-trivial", () => {
    expect(A1_FINAL_MIN_TEXT_SIZE_MM).toBeGreaterThanOrEqual(2.0);
    expect(A1_FINAL_MIN_LINE_WEIGHT_MM).toBeGreaterThanOrEqual(0.15);
    expect(A1_TECHNICAL_PANEL_MIN_OCCUPANCY).toBeGreaterThan(0.3);
    expect(A1_TECHNICAL_PANEL_MIN_OCCUPANCY).toBeLessThan(0.95);
  });
});

describe("composeCore — no grid panel overlaps the title bar's safe band", () => {
  function assertGridRespectsHeaderBand(grid, gridName) {
    expect(grid).toBeTruthy();
    for (const [panelKey, slot] of Object.entries(grid)) {
      if (!slot || typeof slot.y !== "number") continue;
      // `slot.y` is normalized; converting via A1_HEIGHT_MM gives the
      // top edge in mm on the master sheet.
      const topMm = slot.y * A1_HEIGHT_MM;
      expect({
        gridName,
        panelKey,
        normalizedY: slot.y,
        topMm,
      }).toEqual(
        expect.objectContaining({
          gridName,
          panelKey,
          normalizedY: expect.any(Number),
          topMm: expect.any(Number),
        }),
      );
      // Hard floor: every panel's top must be at OR below the content-top
      // line. The title bar occupies y=0..10mm + 6mm safe band → 16mm.
      expect(topMm).toBeGreaterThanOrEqual(A1_CONTENT_TOP_MM - 0.05);
    }
  }

  test("GRID_PRESENTATION_V3 row-1 panels start at or below A1_CONTENT_TOP_MM", () => {
    assertGridRespectsHeaderBand(GRID_PRESENTATION_V3, "presentation_v3");
  });

  test("GRID_12COL row-1 panels start at or below A1_CONTENT_TOP_MM", () => {
    assertGridRespectsHeaderBand(GRID_12COL, "board_v2_12col");
  });
});

describe("buildPresentationV3SheetPanelSpecs — slice panel layout (Phase 3)", () => {
  // The slice service is a heavy module; verify the panel spec contract
  // via source-file scan so the test stays fast and resilient to
  // generation-pipeline churn elsewhere in the file.
  const SOURCE = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../api/project/generate-vertical-slice.js",
    ),
    "utf8",
  ).length
    ? null
    : null; // keep tests deterministic even if the path resolves oddly

  const SLICE_SOURCE = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../services/project/projectGraphVerticalSliceService.js",
    ),
    "utf8",
  );

  test("ROW1_Y is bumped to 16mm so the title bar keeps a 6mm safe band", () => {
    expect(SLICE_SOURCE).toMatch(/const\s+ROW1_Y\s*=\s*16\s*;/);
  });

  test("ROW1_H absorbed the 6mm bump so row 2 keeps its previous y boundary", () => {
    // Standard non-multistorey: 172 → 166. Multistorey: 126 → 120.
    expect(SLICE_SOURCE).toMatch(
      /const\s+ROW1_H\s*=\s*isMultiStorey\s*\?\s*120\s*:\s*166\s*;/,
    );
  });

  test("legacy buildSheetPanelSpecs also respects the 16mm content top", () => {
    // site_context y was 12mm (still touching the bar); now 16mm.
    expect(SLICE_SOURCE).toMatch(
      /panelType:\s*"site_context",[\s\S]{0,60}y:\s*16,/,
    );
  });
});
