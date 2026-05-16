/**
 * Phase 3 audit response — buildCostSummary coverage signals.
 *
 * Locks the contract Codex required:
 *   - costSummary surfaces missingRateItems, ratedItemCount,
 *     costCoveragePercent, missingRatesWarning, requiresReview.
 *   - requiresReview is true when ANY of the following hold:
 *       * the rate card is a fallback proxy (RATE_CARD_FALLBACK)
 *       * the rate card doesn't price every takeoff item (MISSING_RATES)
 *   - Clean residential paths flag requiresReview:false.
 *
 * Why this matters: pre-Phase-3 audit, the cost workbook silently
 * excluded unpriced rows from the total. A reviewer could ship a clean-
 * looking £X workbook even though half the takeoff was missing rates.
 */

import {
  buildCostSummary,
  computeCostBreakdown,
} from "../../../services/project/compiledProjectExportService.js";

function compiledProject() {
  return {
    geometryHash: "cost-summary-geom-001",
    metadata: { source: "test-fixture" },
    levels: [{ id: "L0", elevation_m: 0, height_m: 3, name: "Ground" }],
    walls: [
      {
        id: "w1",
        levelId: "L0",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        length_m: 10,
        height_m: 3,
      },
    ],
    rooms: [
      {
        id: "r1",
        levelId: "L0",
        name: "Living",
        actual_area_m2: 50,
        type: "living",
      },
    ],
  };
}

function residentialTakeoff() {
  return {
    schema_version: "project-quantity-takeoff-v1",
    geometryHash: "cost-summary-geom-001",
    summary: { grossFloorAreaM2: 80 },
    items: [
      { category: "areas", item: "Gross Floor Area", unit: "m2", quantity: 80 },
      { category: "areas", item: "Slab Area", unit: "m2", quantity: 80 },
      {
        category: "envelope",
        item: "External Wall Area",
        unit: "m2",
        quantity: 30,
      },
    ],
  };
}

describe("buildCostSummary", () => {
  test("clean residential path → requiresReview:false, no missing-rates warning, 100% coverage", () => {
    const summary = buildCostSummary({
      compiledProject: {
        ...compiledProject(),
        metadata: { source: "test", buildingType: "residential" },
      },
      takeoff: residentialTakeoff(),
    });
    expect(summary.requiresReview).toBe(false);
    expect(summary.missingRatesWarning).toBeNull();
    expect(summary.missingRateItems).toEqual([]);
    expect(summary.costCoveragePercent).toBe(100);
    expect(summary.ratedItemCount).toBe(3);
    expect(summary.totalItemCount).toBe(3);
    expect(summary.totalGbp).toBeGreaterThan(0);
    expect(summary.totalLowGbp).toBeLessThanOrEqual(summary.totalGbp);
    expect(summary.totalHighGbp).toBeGreaterThanOrEqual(summary.totalGbp);
  });

  test("unpriced items → MISSING_RATES warning + coverage % drops + requiresReview:true", () => {
    const takeoff = residentialTakeoff();
    takeoff.items.push({
      category: "abnormals",
      item: "Demolition allowance",
      unit: "m2",
      quantity: 25,
    });
    takeoff.items.push({
      category: "abnormals",
      item: "Tree removal",
      unit: "nr",
      quantity: 2,
    });
    const summary = buildCostSummary({
      compiledProject: {
        ...compiledProject(),
        metadata: { source: "test", buildingType: "residential" },
      },
      takeoff,
    });
    expect(summary.missingRateItems.length).toBe(2);
    expect(summary.ratedItemCount).toBe(3);
    expect(summary.totalItemCount).toBe(5);
    expect(summary.costCoveragePercent).toBe(60);
    expect(summary.missingRatesWarning).not.toBeNull();
    expect(summary.missingRatesWarning.code).toBe("MISSING_RATES");
    expect(summary.missingRatesWarning.items).toHaveLength(2);
    expect(summary.requiresReview).toBe(true);
  });

  test("rate-card fallback flips requiresReview even with 100% coverage", () => {
    const summary = buildCostSummary({
      compiledProject: {
        ...compiledProject(),
        metadata: { source: "test", buildingType: "industrial_plant" },
      },
      takeoff: residentialTakeoff(),
    });
    expect(summary.rateCardFallbackWarning).not.toBeNull();
    expect(summary.rateCardFallbackWarning.code).toBe("RATE_CARD_FALLBACK");
    expect(summary.requiresReview).toBe(true);
    expect(summary.totalGbp).toBeGreaterThan(0);
  });

  // Phase 3 audit cleanup (Codex non-blocker): explicit 0 in the rate
  // card means "intentionally uncosted, surface for reference" — e.g.
  // External Wall Length, which is priced via External Wall Area. These
  // lines must NOT count against coverage % and must NOT trigger the
  // MISSING_RATES warning. Without this fix, every clean residential
  // run flashes amber.
  test("explicit-0 rate card entries surface as informational, NOT missing", () => {
    const takeoff = residentialTakeoff();
    takeoff.items.push({
      // External Wall Length is in the rate card with an explicit 0.
      category: "envelope",
      item: "External Wall Length",
      unit: "m",
      quantity: 40,
    });
    const summary = buildCostSummary({
      compiledProject: {
        ...compiledProject(),
        metadata: { source: "test", buildingType: "residential" },
      },
      takeoff,
    });
    // External Wall Length lands in informationalItems, not missingRateItems.
    const informational = summary.informationalItems || [];
    expect(
      informational.some((i) => i.description === "External Wall Length"),
    ).toBe(true);
    expect(
      summary.missingRateItems.some(
        (m) => m.description === "External Wall Length",
      ),
    ).toBe(false);
    // Coverage stays 100% because informational items are excluded from
    // both numerator and denominator.
    expect(summary.costCoveragePercent).toBe(100);
    // MISSING_RATES is NOT raised — the row is intentional.
    expect(summary.missingRatesWarning).toBeNull();
    // requiresReview stays false on a clean residential run.
    expect(summary.requiresReview).toBe(false);
  });

  test("missing rate keeps MISSING_RATES even when informational items are present", () => {
    const takeoff = residentialTakeoff();
    takeoff.items.push({
      category: "envelope",
      item: "External Wall Length",
      unit: "m",
      quantity: 40,
    });
    takeoff.items.push({
      // Not in any rate card → counts as missing.
      category: "abnormals",
      item: "Underpinning",
      unit: "m",
      quantity: 12,
    });
    const summary = buildCostSummary({
      compiledProject: {
        ...compiledProject(),
        metadata: { source: "test", buildingType: "residential" },
      },
      takeoff,
    });
    expect(summary.informationalItems.length).toBe(1);
    expect(summary.missingRateItems.length).toBe(1);
    expect(summary.missingRatesWarning).not.toBeNull();
    expect(summary.requiresReview).toBe(true);
    // Coverage denominator excludes informational items.
    // 3 rated + 1 missing = 4 costable; rated / costable * 100 = 75%.
    expect(summary.costCoveragePercent).toBe(75);
    expect(summary.missingRatesWarning.message).toMatch(/1 of 4 costable/);
  });

  test("computeCostBreakdown returns the same coverage fields buildCostSummary surfaces", () => {
    const takeoff = residentialTakeoff();
    takeoff.items.push({
      category: "abnormals",
      item: "Demolition allowance",
      unit: "m2",
      quantity: 25,
    });
    const compiled = {
      ...compiledProject(),
      metadata: { source: "test", buildingType: "residential" },
    };
    const breakdown = computeCostBreakdown({
      compiledProject: compiled,
      takeoff,
    });
    const summary = buildCostSummary({
      compiledProject: compiled,
      takeoff,
    });
    expect(summary.missingRateItems).toEqual(breakdown.missingRateItems);
    expect(summary.ratedItemCount).toBe(breakdown.ratedItemCount);
    expect(summary.costCoveragePercent).toBe(breakdown.costCoveragePercent);
    expect(summary.missingRatesWarning).toEqual(breakdown.missingRatesWarning);
    expect(summary.totalGbp).toBe(breakdown.totalEstimatedCost);
  });
});
