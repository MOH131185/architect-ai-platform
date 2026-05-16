/**
 * buildCostWorkbook — six-sheet deterministic Excel estimate.
 *
 * Asserts the six required sheets exist, residential rate cards produce
 * cost columns, non-residential building types degrade gracefully to a
 * quantity-only workbook with `rate card missing` cells, and the workbook
 * is byte-deterministic for the same input.
 */

import * as XLSX from "xlsx";
import { buildCostWorkbook } from "../../services/project/compiledProjectExportService.js";

function compiledFixture(overrides = {}) {
  return {
    geometryHash: "wb-fixture-geom-hash-001",
    metadata: { source: "test-fixture" },
    site: { area_m2: 200 },
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
        material: "brick_red_uk_traditional",
      },
      {
        id: "w2",
        levelId: "L0",
        exterior: false,
        start: { x: 0, y: 0 },
        end: { x: 0, y: 5 },
        length_m: 5,
        height_m: 3,
        material: "plaster_painted",
      },
    ],
    slabs: [{ id: "s1", levelId: "L0", area_m2: 80, material: "concrete_c30" }],
    rooms: [
      {
        id: "r1",
        levelId: "L0",
        name: "Office",
        actual_area_m2: 50,
        type: "office",
      },
      {
        id: "r2",
        levelId: "L0",
        name: "Lobby",
        actual_area_m2: 30,
        type: "circulation",
      },
    ],
    openings: [],
    stairs: [],
    roof: { planes: [], material: "slate" },
    ...overrides,
  };
}

const residentialTakeoff = {
  schema_version: "project-quantity-takeoff-v1",
  geometryHash: "wb-fixture-geom-hash-001",
  pipelineVersion: "project-graph-vertical-slice-v1",
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
    { category: "envelope", item: "Glazing Area", unit: "m2", quantity: 6 },
  ],
};

function readSheet(workbook, name) {
  const sheet = workbook.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

describe("buildCostWorkbook", () => {
  test("produces the seven required sheets in order", () => {
    // Phase 3 (Track 5): the workbook now emits a "Risk & Contingency"
    // sheet between "Cost Estimate" and "Spaces & Areas". Sheet count
    // went 6 → 7. The previous 6-sheet contract is documented in the
    // git history; this test is the new authoritative order.
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Residential Fixture",
      qualityTier: "mid",
      region: "uk-average",
    });
    expect(result.workbook.SheetNames).toEqual([
      "Summary",
      "Quantity Takeoff",
      "Cost Estimate",
      "Risk & Contingency",
      "Spaces & Areas",
      "Materials",
      "Assumptions & Exclusions",
    ]);
  });

  test("residential rate card produces non-null cost subtotals and total", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Residential",
    });
    expect(result.rateCardMissing).toBe(false);
    expect(result.totalGbp).toBeGreaterThan(0);
    const costRows = readSheet(result.workbook, "Cost Estimate");
    const hasNumericSubtotal = costRows.some(
      (row) =>
        typeof row["Subtotal (GBP)"] === "number" && row["Subtotal (GBP)"] > 0,
    );
    expect(hasNumericSubtotal).toBe(true);
  });

  // Phase 3 (Track 5): the prior "non-residential → quantity-only" test
  // is replaced by the new fallback contract. selectRateCard maps any
  // unrecognised type to uk_residential_v2 + RATE_CARD_FALLBACK warning;
  // cost columns still render with residential rates as a proxy. Truly
  // matched typologies (office_studio → commercial) get their own
  // direct rate card with NO fallback warning.
  test("office building type matches uk_commercial_v1 without a fallback warning", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "office_studio" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Office Studio",
    });
    expect(result.rateCardMissing).toBe(false);
    expect(result.rateCard?.id).toBe("uk_commercial_v1");
    expect(result.rateCardFallbackWarning).toBeNull();
    expect(result.totalGbp).toBeGreaterThan(0);
  });

  test("unrecognised building type falls back to residential with RATE_CARD_FALLBACK warning", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "industrial_plant" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Industrial Plant",
    });
    expect(result.rateCardMissing).toBe(false);
    expect(result.rateCard?.id).toBe("uk_residential_v2");
    expect(result.rateCardFallbackWarning).not.toBeNull();
    expect(result.rateCardFallbackWarning.code).toBe("RATE_CARD_FALLBACK");
    expect(result.totalGbp).toBeGreaterThan(0);
    // Risk & Contingency sheet should surface the fallback warning at the top.
    const riskRows = readSheet(result.workbook, "Risk & Contingency");
    expect(riskRows[0]["Risk Category"]).toBe("RATE_CARD_FALLBACK");
  });

  test("deterministic — identical input produces identical workbook bytes", () => {
    const a = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Deterministic",
    });
    const b = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Deterministic",
    });
    expect(
      Buffer.from(a.workbookArray).equals(Buffer.from(b.workbookArray)),
    ).toBe(true);
  });

  test("Spaces sheet includes one row per room", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Spaces",
    });
    const spaces = readSheet(result.workbook, "Spaces & Areas");
    expect(spaces.length).toBe(2);
    expect(spaces.map((row) => row["Space ID"]).sort()).toEqual(["r1", "r2"]);
  });

  test("Materials sheet has at least one row when walls/slabs have materials", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Materials",
    });
    const materials = readSheet(result.workbook, "Materials");
    expect(materials.length).toBeGreaterThan(0);
    expect(materials.some((row) => row.Material)).toBe(true);
  });

  test("Summary sheet includes geometry hash and rate-card label", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Summary",
    });
    // Summary sheet is AOA — read raw values.
    const sheet = result.workbook.Sheets.Summary;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const flat = rows.flat().filter(Boolean).map(String);
    expect(flat.some((cell) => cell.includes("wb-fixture-geom-hash-001"))).toBe(
      true,
    );
    expect(
      flat.some((cell) => cell.toLowerCase().includes("preliminary")),
    ).toBe(true);
  });

  test("throws when compiledProject lacks geometryHash", () => {
    expect(() =>
      buildCostWorkbook({
        compiledProject: { walls: [], levels: [] },
        takeoff: residentialTakeoff,
      }),
    ).toThrow(/Compiled project and quantity takeoff/);
  });

  test("throws when takeoff is missing or empty", () => {
    expect(() =>
      buildCostWorkbook({
        compiledProject: compiledFixture(),
        takeoff: { items: [] },
      }),
    ).toThrow(/Compiled project and quantity takeoff/);
  });

  // Phase 3 (Track 5): confidence-range columns and contingency rollup.
  test("Cost Estimate sheet carries Rate Low/High + Subtotal Low/High columns with the right ordering", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Confidence",
    });
    const rows = readSheet(result.workbook, "Cost Estimate");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty("Rate Low (GBP)");
      expect(row).toHaveProperty("Rate High (GBP)");
      expect(row).toHaveProperty("Subtotal Low (GBP)");
      expect(row).toHaveProperty("Subtotal High (GBP)");
      // Low ≤ adjusted ≤ High when all three are numeric.
      if (
        typeof row["Rate (GBP)"] === "number" &&
        typeof row["Rate Low (GBP)"] === "number" &&
        typeof row["Rate High (GBP)"] === "number"
      ) {
        expect(row["Rate Low (GBP)"]).toBeLessThanOrEqual(row["Rate (GBP)"]);
        expect(row["Rate High (GBP)"]).toBeGreaterThanOrEqual(
          row["Rate (GBP)"],
        );
      }
    }
  });

  test("totalLowGbp / totalHighGbp bracket totalGbp on the result object", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
    });
    expect(result.totalGbp).toBeGreaterThan(0);
    expect(result.totalLowGbp).toBeLessThanOrEqual(result.totalGbp);
    expect(result.totalHighGbp).toBeGreaterThanOrEqual(result.totalGbp);
  });

  test("Risk & Contingency sheet carries a design contingency line tied to the rate-card policy", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Contingency",
    });
    const rows = readSheet(result.workbook, "Risk & Contingency");
    expect(rows.length).toBeGreaterThan(0);
    const contingencyRow = rows.find(
      (row) => row["Risk Category"] === "Design Contingency",
    );
    expect(contingencyRow).toBeTruthy();
    expect(typeof contingencyRow["Allowance (GBP)"]).toBe("number");
    expect(contingencyRow["Allowance (GBP)"]).toBeGreaterThan(0);
    expect(typeof contingencyRow["% of Subtotal"]).toBe("number");
    // Residential default is 10% per the rate-card JSON.
    expect(contingencyRow["% of Subtotal"]).toBe(10);
    // Contingent subtotal row sits at the foot.
    const contingentRow = rows.find(
      (row) => row["Risk Category"] === "Contingent Subtotal (GBP)",
    );
    expect(contingentRow).toBeTruthy();
    expect(contingentRow["Allowance (GBP)"]).toBeGreaterThan(result.totalGbp);
  });

  test("result exposes a costSummary object the CostSummaryPanel can render", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "residential" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Summary Object",
    });
    expect(result.costSummary).toBeTruthy();
    expect(result.costSummary.schemaVersion).toBe("cost-summary-v1");
    expect(result.costSummary.totalGbp).toBe(result.totalGbp);
    expect(result.costSummary.totalLowGbp).toBe(result.totalLowGbp);
    expect(result.costSummary.totalHighGbp).toBe(result.totalHighGbp);
    expect(result.costSummary.gia).toBe(80);
    expect(typeof result.costSummary.costPerSqm).toBe("number");
    expect(Array.isArray(result.costSummary.topDrivers)).toBe(true);
    expect(result.costSummary.topDrivers.length).toBeGreaterThan(0);
    expect(result.costSummary.topDrivers.length).toBeLessThanOrEqual(5);
  });
});
