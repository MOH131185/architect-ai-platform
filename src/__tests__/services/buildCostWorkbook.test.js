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
  test("produces the six required sheets in order", () => {
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

  test("non-residential building type falls back to quantity-only mode with rate-card-missing markers", () => {
    const result = buildCostWorkbook({
      compiledProject: compiledFixture({
        metadata: { source: "test-fixture", buildingType: "office_studio" },
      }),
      takeoff: residentialTakeoff,
      projectName: "Office Studio",
    });
    expect(result.rateCardMissing).toBe(true);
    expect(result.totalGbp).toBeNull();
    const costRows = readSheet(result.workbook, "Cost Estimate");
    expect(costRows.length).toBe(residentialTakeoff.items.length);
    for (const row of costRows) {
      expect(row["Rate (GBP)"]).toBe("—");
      expect(row["Subtotal (GBP)"]).toBe("—");
      expect(row["Rate Source"]).toBe("rate card missing");
    }
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
});
