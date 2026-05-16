/**
 * Codex merge-audit blocker A.
 *
 * Locks the readiness-label contract: engineering exports (DXF / IFC /
 * DWG / GLB / JSON) carry an `issueGrade:"coordination"` signal so the
 * UI can render them with the amber "COORDINATION" chip + subtitle
 * instead of plain green READY. XLSX uses `quantity_only` when the cost
 * workbook has no rated items; `requires_review` semantics (existing)
 * still win for partial-coverage cases.
 *
 * The PNG / PDF rows stay plain READY because they ARE the
 * release-quality sheet output (PRELIMINARY watermark is on the
 * degradedExport path, not here).
 */

import { buildClientExportManifest } from "../../../services/export/buildClientExportManifest.js";

function compiledFixture(overrides = {}) {
  return {
    geometryHash: "merge-audit-issue-grade-test",
    walls: [{ id: "w1" }, { id: "w2" }],
    levels: [{ id: "L0" }],
    openings: [{ id: "o1" }],
    slabs: [{ id: "s1" }],
    ...overrides,
  };
}

describe("buildClientExportManifest — issueGrade contract", () => {
  test("PNG and PDF rows are not tagged with issueGrade (they ARE the release-quality output)", () => {
    const m = buildClientExportManifest({ compiledProject: compiledFixture() });
    expect(m.exports.png.issueGrade).toBeUndefined();
    expect(m.exports.pdf.issueGrade).toBeUndefined();
  });

  test("DXF / IFC / JSON / GLB rows are tagged issueGrade:'coordination' with COORDINATION label + reason", () => {
    const m = buildClientExportManifest({ compiledProject: compiledFixture() });
    for (const key of ["dxf", "ifc", "json", "glb"]) {
      expect(m.exports[key].issueGrade).toBe("coordination");
      expect(m.exports[key].issueGradeLabel).toBe("COORDINATION");
      expect(typeof m.exports[key].issueGradeReason).toBe("string");
      expect(m.exports[key].issueGradeReason.length).toBeGreaterThan(20);
    }
  });

  test("DWG row gets issueGrade:'coordination' when converter is available", () => {
    const m = buildClientExportManifest({
      compiledProject: compiledFixture(),
      dwgConverterCapabilities: {
        available: true,
        provider: "oda",
        odaPath: "/usr/local/bin/oda",
      },
    });
    expect(m.exports.dwg.available).toBe(true);
    expect(m.exports.dwg.issueGrade).toBe("coordination");
    expect(m.exports.dwg.issueGradeLabel).toBe("COORDINATION");
  });

  test("DWG row does NOT carry issueGrade when blocked (the issueGrade only applies to available rows)", () => {
    const m = buildClientExportManifest({
      compiledProject: compiledFixture(),
      // No dwgConverterCapabilities → blocked
    });
    expect(m.exports.dwg.available).toBe(false);
    expect(m.exports.dwg.issueGrade).toBeUndefined();
  });
});

describe("buildClientExportManifest — XLSX quantity-only path", () => {
  test("clean rated workbook: XLSX is COORDINATION (no quantity-only flag)", () => {
    const m = buildClientExportManifest({
      compiledProject: compiledFixture(),
      projectQuantityTakeoff: {
        items: [{ category: "x", item: "x", unit: "m2", quantity: 1 }],
      },
      costSummary: {
        ratedItemCount: 5,
        costCoveragePercent: 100,
        requiresReview: false,
      },
    });
    expect(m.exports.xlsx.available).toBe(true);
    expect(m.exports.xlsx.requiresReview).toBeFalsy();
    expect(m.exports.xlsx.issueGrade).toBe("coordination");
    expect(m.exports.xlsx.issueGradeLabel).toBe("COORDINATION");
  });

  test("workbook with ZERO rated items: XLSX is 'quantity_only' / 'QUANTITY ONLY'", () => {
    const m = buildClientExportManifest({
      compiledProject: compiledFixture(),
      projectQuantityTakeoff: {
        items: [{ category: "x", item: "x", unit: "m2", quantity: 1 }],
      },
      costSummary: {
        ratedItemCount: 0,
        costCoveragePercent: 0,
        missingRatesWarning: { code: "MISSING_RATES" },
        requiresReview: true,
      },
    });
    expect(m.exports.xlsx.available).toBe(true);
    expect(m.exports.xlsx.issueGrade).toBe("quantity_only");
    expect(m.exports.xlsx.issueGradeLabel).toBe("QUANTITY ONLY");
    expect(m.exports.xlsx.issueGradeReason).toMatch(/no rated items/i);
  });

  test("partial-rate workbook keeps requiresReview semantics + non-quantity-only issueGrade", () => {
    const m = buildClientExportManifest({
      compiledProject: compiledFixture(),
      projectQuantityTakeoff: {
        items: [{ category: "x", item: "x", unit: "m2", quantity: 1 }],
      },
      costSummary: {
        ratedItemCount: 3,
        costCoveragePercent: 60,
        missingRatesWarning: {
          code: "MISSING_RATES",
          items: [
            { description: "Demolition" },
            { description: "Tree removal" },
          ],
        },
        requiresReview: true,
      },
    });
    expect(m.exports.xlsx.available).toBe(true);
    expect(m.exports.xlsx.requiresReview).toBe(true);
    expect(m.exports.xlsx.issueGrade).not.toBe("quantity_only");
  });

  test("rate-card-fallback workbook is COORDINATION-grade requiresReview (proxy rates)", () => {
    const m = buildClientExportManifest({
      compiledProject: compiledFixture(),
      projectQuantityTakeoff: {
        items: [{ category: "x", item: "x", unit: "m2", quantity: 1 }],
      },
      costSummary: {
        ratedItemCount: 5,
        costCoveragePercent: 100,
        rateCardFallbackWarning: { code: "RATE_CARD_FALLBACK" },
        requiresReview: true,
      },
    });
    expect(m.exports.xlsx.requiresReview).toBe(true);
    expect(m.exports.xlsx.issueGrade).not.toBe("quantity_only");
  });
});
