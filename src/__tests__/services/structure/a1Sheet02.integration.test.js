/**
 * Phase 2 (Track 3) — A1-S1 technical companion sheet panel-spec contract.
 *
 * When STRUCTURAL_DRAWINGS_ENABLED and MEP_DRAWINGS_ENABLED are both on,
 * the slice service appends a new sheet plan (A1-S1 — Structural & MEP)
 * to splitDecision.sheets. This regression locks the panel layout (3×3
 * grid + full-width title block) and the flag-driven gating so a future
 * refactor of the splitter doesn't silently strip the technical sheet.
 *
 * The panel-spec builder is unit-tested directly here; the full sheet-
 * append behaviour is covered by the higher-level slice e2e test in
 * Phase 6's handoff-package.e2e.test.js (per the implementation plan).
 */

import { __projectGraphVerticalSliceInternals } from "../../../services/project/projectGraphVerticalSliceService.js";

const {
  buildA1Sheet02PanelSpecs,
  structuralDrawingsEnabled,
  mepDrawingsEnabled,
} = __projectGraphVerticalSliceInternals;

describe("buildA1Sheet02PanelSpecs — A1-S1 technical companion layout", () => {
  test("returns a 3×3 grid of structural+MEP panels with a full-width title block", () => {
    const specs = buildA1Sheet02PanelSpecs(1);
    expect(Array.isArray(specs)).toBe(true);

    const panelTypes = specs.map((s) => s.panelType);
    // Structural panels.
    expect(panelTypes).toContain("foundation_plan");
    expect(panelTypes).toContain("structural_ground_floor");
    expect(panelTypes).toContain("structural_section");
    expect(panelTypes).toContain("roof_framing_plan");
    // MEP panels.
    expect(panelTypes).toContain("mep_lighting_plan");
    expect(panelTypes).toContain("mep_power_plan");
    expect(panelTypes).toContain("mep_plumbing_plan");
    expect(panelTypes).toContain("mep_drainage_plan");
    expect(panelTypes).toContain("mep_ventilation_plan");
    // Title block.
    expect(panelTypes).toContain("title_block");
  });

  test("technical panels are optional (required:false) so missing artifacts degrade gracefully", () => {
    const specs = buildA1Sheet02PanelSpecs(1);
    const titleBlock = specs.find((s) => s.panelType === "title_block");
    const technicalPanels = specs.filter((s) => s.panelType !== "title_block");
    // Title block is the only required slot — it carries the PRELIMINARY
    // disclaimer and the sheet identifier.
    expect(titleBlock.required).toBe(true);
    // Technical panels are non-required so a partial set (e.g. MEP off,
    // structural on) doesn't break the placement loop in
    // buildPanelPlacements.
    technicalPanels.forEach((spec) => {
      expect(spec.required).toBe(false);
    });
  });

  test("every panel sits inside the A1 landscape body (10mm side margins, 16mm safe band)", () => {
    const SHEET_W = 841;
    const SHEET_H = 594;
    const CONTENT_TOP = 16;
    const MARGIN_X = 10;
    const specs = buildA1Sheet02PanelSpecs(1);
    for (const spec of specs) {
      expect(spec.x).toBeGreaterThanOrEqual(MARGIN_X);
      expect(spec.y).toBeGreaterThanOrEqual(
        // Title block sits at the foot; technical rows respect the
        // safe-band rule used by composeCore.js (CONTENT_TOP=16mm). Both
        // must clear the 0..16mm title-bar reserve.
        spec.panelType === "title_block" ? 0 : CONTENT_TOP,
      );
      expect(spec.x + spec.width).toBeLessThanOrEqual(SHEET_W - MARGIN_X + 0.5);
      expect(spec.y + spec.height).toBeLessThanOrEqual(SHEET_H + 0.5);
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.height).toBeGreaterThan(0);
    }
  });

  test("no panels overlap (technical grid + title block don't collide)", () => {
    const specs = buildA1Sheet02PanelSpecs(1);
    const rects = specs.map((s) => ({
      panelType: s.panelType,
      x1: s.x,
      y1: s.y,
      x2: s.x + s.width,
      y2: s.y + s.height,
    }));
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        const overlapX = a.x1 < b.x2 - 0.001 && b.x1 < a.x2 - 0.001;
        const overlapY = a.y1 < b.y2 - 0.001 && b.y1 < a.y2 - 0.001;
        if (overlapX && overlapY) {
          throw new Error(
            `Panels overlap: ${a.panelType} (${a.x1}-${a.x2},${a.y1}-${a.y2}) ↔ ` +
              `${b.panelType} (${b.x1}-${b.x2},${b.y1}-${b.y2})`,
          );
        }
      }
    }
  });
});

describe("structuralDrawingsEnabled / mepDrawingsEnabled flag helpers", () => {
  const origStructural = process.env.STRUCTURAL_DRAWINGS_ENABLED;
  const origMep = process.env.MEP_DRAWINGS_ENABLED;
  afterEach(() => {
    if (origStructural === undefined)
      delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
    else process.env.STRUCTURAL_DRAWINGS_ENABLED = origStructural;
    if (origMep === undefined) delete process.env.MEP_DRAWINGS_ENABLED;
    else process.env.MEP_DRAWINGS_ENABLED = origMep;
  });

  test("flags read true from env and from explicit options", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    process.env.MEP_DRAWINGS_ENABLED = "true";
    expect(structuralDrawingsEnabled({})).toBe(true);
    expect(mepDrawingsEnabled({})).toBe(true);

    delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
    delete process.env.MEP_DRAWINGS_ENABLED;
    expect(structuralDrawingsEnabled({ structuralDrawingsEnabled: true })).toBe(
      true,
    );
    expect(mepDrawingsEnabled({ mepDrawingsEnabled: true })).toBe(true);
  });

  test("flags default false when neither env nor options set", () => {
    delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
    delete process.env.MEP_DRAWINGS_ENABLED;
    expect(structuralDrawingsEnabled({})).toBe(false);
    expect(mepDrawingsEnabled({})).toBe(false);
  });

  test("env false explicitly disables even if option omitted", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "false";
    process.env.MEP_DRAWINGS_ENABLED = "false";
    expect(structuralDrawingsEnabled({})).toBe(false);
    expect(mepDrawingsEnabled({})).toBe(false);
  });
});
