/**
 * Smoke test for the quantity-takeoff wiring inside the ProjectGraph
 * vertical slice. We don't run the full pipeline — that requires OpenAI
 * and many other live providers. Instead, we verify the contract that
 * the takeoff helper consumes the same compiledProject shape the slice
 * exposes via artifacts.compiledProject and that the resulting takeoff
 * carries the items the export manifest gates on.
 */

import { buildProjectQuantityTakeoff } from "../../services/project/projectQuantityTakeoffService.js";
import { buildClientExportManifest } from "../../services/export/buildClientExportManifest.js";

function compiledFixture() {
  return {
    geometryHash: "vs-fixture-geom-hash-001",
    metadata: { source: "test-fixture", buildingType: "residential" },
    site: { area_m2: 200 },
    footprint: {
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
        { x: 0, y: 8 },
      ],
      area_m2: 80,
    },
    levels: [
      { id: "L0", elevation_m: 0, height_m: 3, name: "Ground" },
      { id: "L1", elevation_m: 3, height_m: 3, name: "First" },
    ],
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
      {
        id: "w2",
        levelId: "L0",
        exterior: true,
        start: { x: 10, y: 0 },
        end: { x: 10, y: 8 },
        length_m: 8,
        height_m: 3,
      },
    ],
    slabs: [{ id: "s1", levelId: "L0", area_m2: 80 }],
    rooms: [{ id: "r1", levelId: "L0", actual_area_m2: 80, name: "Studio" }],
    openings: [
      {
        id: "win1",
        levelId: "L0",
        type: "window",
        width_m: 1.2,
        head_height_m: 1.5,
      },
      {
        id: "d1",
        levelId: "L0",
        type: "door",
        width_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [],
  };
}

describe("vertical-slice quantity takeoff", () => {
  test("buildProjectQuantityTakeoff emits items for an Office-Studio-sized compiledProject", () => {
    const takeoff = buildProjectQuantityTakeoff(compiledFixture(), {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });
    expect(takeoff.schema_version).toBe("project-quantity-takeoff-v1");
    expect(takeoff.geometryHash).toBe("vs-fixture-geom-hash-001");
    expect(Array.isArray(takeoff.items)).toBe(true);
    expect(takeoff.items.length).toBeGreaterThan(0);
    expect(takeoff.summary.grossFloorAreaM2).toBeGreaterThan(0);
  });

  test("XLSX becomes READY in the client manifest once the takeoff is attached", () => {
    const compiledProject = compiledFixture();
    const takeoff = buildProjectQuantityTakeoff(compiledProject, {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });

    const beforeManifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: null,
    });
    expect(beforeManifest.exports.xlsx.available).toBe(false);
    expect(beforeManifest.exports.xlsx.blockedReason).toBe(
      "QUANTITY_TAKEOFF_UNAVAILABLE",
    );

    const afterManifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: takeoff,
    });
    expect(afterManifest.exports.xlsx.available).toBe(true);
    expect(afterManifest.exports.xlsx.blockedReason).toBeUndefined();
  });

  // Phase 3 audit response: Codex caught that the takeoff was reading a
  // NESTED `mepModel.electrical.lightingLayout` shape that the real
  // service never produces. The actual mepModelService.js emits the
  // top-level layouts below; the takeoff must consume them or MEP rows
  // silently come back empty.
  test("real mepModelService shape produces MEP takeoff rows", () => {
    const compiledProject = compiledFixture();
    const realMepModel = {
      mepModelId: "mep-test-001",
      mepModelHash: "mep-hash-test-001",
      geometryHash: compiledProject.geometryHash,
      electricalLightingLayout: {
        fixtures: [
          { id: "lt-1", levelId: "L0" },
          { id: "lt-2", levelId: "L0" },
          { id: "lt-3", levelId: "L0" },
        ],
      },
      electricalPowerSocketLayout: {
        outlets: [
          { id: "pwr-1", levelId: "L0" },
          { id: "pwr-2", levelId: "L0" },
        ],
        switches: [{ id: "sw-1", levelId: "L0" }],
        dataPoints: [{ id: "data-1", levelId: "L0" }],
      },
      plumbingSupplyLayout: {
        fixtures: [
          { id: "wtr-1", levelId: "L0" },
          { id: "wtr-2", levelId: "L0" },
        ],
      },
      drainageWasteLayout: {
        fixtures: [{ id: "dr-1", levelId: "L0" }],
      },
      ventilationHvacLayout: {
        extractFans: [{ id: "ef-1", levelId: "L0" }],
      },
    };

    const takeoff = buildProjectQuantityTakeoff(compiledProject, {
      pipelineVersion: "project-graph-vertical-slice-v1",
      mepModel: realMepModel,
    });
    const mepItems = takeoff.items.filter((item) => item.category === "mep");
    // Every layout above is populated, so we should see one row per
    // fixture type with the right quantity.
    const find = (item) => mepItems.find((row) => row.item === item);
    expect(find("Lighting Point")?.quantity).toBe(3);
    expect(find("Power Socket")?.quantity).toBe(2);
    expect(find("Switch")?.quantity).toBe(1);
    expect(find("Data Outlet")?.quantity).toBe(1);
    expect(find("Sanitary Fixture")?.quantity).toBe(2);
    expect(find("Drainage Outlet")?.quantity).toBe(1);
    expect(find("Ventilation Extract")?.quantity).toBe(1);
  });

  test("no mepModel → no MEP takeoff rows (back-compat)", () => {
    const takeoff = buildProjectQuantityTakeoff(compiledFixture(), {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });
    const mepItems = takeoff.items.filter((item) => item.category === "mep");
    expect(mepItems).toEqual([]);
  });

  // Phase 3 audit response: costSummary should downgrade XLSX to amber
  // "requires review" in the client manifest when missing rates or
  // fallback warning are present.
  test("XLSX manifest entry is requiresReview when costSummary flags missing rates", () => {
    const compiledProject = compiledFixture();
    const takeoff = buildProjectQuantityTakeoff(compiledProject, {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });
    const summaryWithMissing = {
      schemaVersion: "cost-summary-v1",
      requiresReview: true,
      missingRateItems: [
        { itemCode: "x-y", description: "Untyped quantity", quantity: 1 },
      ],
      missingRatesWarning: {
        code: "MISSING_RATES",
        message: "1 of 5 items unpriced (80%).",
        items: [],
      },
      costCoveragePercent: 80,
      rateCardFallbackWarning: null,
    };
    const manifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: takeoff,
      costSummary: summaryWithMissing,
    });
    expect(manifest.exports.xlsx.available).toBe(true);
    expect(manifest.exports.xlsx.requiresReview).toBe(true);
    expect(manifest.exports.xlsx.requiresReviewReason).toMatch(/MISSING_RATES/);
  });

  test("XLSX manifest entry is requiresReview when costSummary flags fallback rate card", () => {
    const compiledProject = compiledFixture();
    const takeoff = buildProjectQuantityTakeoff(compiledProject, {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });
    const summaryWithFallback = {
      schemaVersion: "cost-summary-v1",
      requiresReview: true,
      missingRateItems: [],
      missingRatesWarning: null,
      costCoveragePercent: 100,
      rateCardFallbackWarning: {
        code: "RATE_CARD_FALLBACK",
        message:
          "No rate card for buildingType=factory; using uk_residential_v2 as proxy.",
      },
    };
    const manifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: takeoff,
      costSummary: summaryWithFallback,
    });
    expect(manifest.exports.xlsx.requiresReview).toBe(true);
    expect(manifest.exports.xlsx.requiresReviewReason).toMatch(
      /RATE_CARD_FALLBACK/,
    );
  });

  test("XLSX manifest entry is NOT requiresReview when costSummary is clean", () => {
    const compiledProject = compiledFixture();
    const takeoff = buildProjectQuantityTakeoff(compiledProject, {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });
    const cleanSummary = {
      schemaVersion: "cost-summary-v1",
      requiresReview: false,
      missingRateItems: [],
      missingRatesWarning: null,
      costCoveragePercent: 100,
      rateCardFallbackWarning: null,
    };
    const manifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: takeoff,
      costSummary: cleanSummary,
    });
    expect(manifest.exports.xlsx.available).toBe(true);
    expect(manifest.exports.xlsx.requiresReview).toBeUndefined();
  });
});
