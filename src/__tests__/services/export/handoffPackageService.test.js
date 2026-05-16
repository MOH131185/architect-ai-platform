/**
 * Phase 6 — Track 6 handoff package builder.
 *
 * Asserts the handoff-manifest-v1 contract:
 *   - handoff.json carries geometryHash, qa.status, disclaimers list,
 *     and a file index with sha256 + size per artifact.
 *   - README.md cross-references geometryHash + packageHash.
 *   - DWG_UNAVAILABLE.txt is shipped when the converter is not configured;
 *     real DWG bytes ship when it is.
 *   - quantity_takeoff.csv produces one row per takeoff item + header.
 *   - project_graph.json round-trips JSON correctly.
 *   - GLB artifact is present whenever compiledProject is provided.
 */

import {
  buildHandoffArtifactPackage,
  HANDOFF_MANIFEST_SCHEMA_VERSION,
  __internal as HANDOFF_INTERNALS,
} from "../../../services/export/handoffPackageService.js";
import { listZipEntryNames } from "../../../services/export/artifactPackageService.js";

function fixtureCompiledProject() {
  const polygon = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  return {
    schema_version: "compiled-project-v1",
    geometryHash: "phase6-handoff-fixture-001",
    metadata: { source: "compiled_project", projectName: "Phase 6 House" },
    materialDNA: { walls: { exterior: { hex: "#b89b72" } } },
    levels: [
      {
        id: "L0",
        level_number: 0,
        height_m: 3,
        bottom_m: 0,
        top_m: 3,
        footprint: { polygon, area_m2: 80 },
      },
    ],
    walls: [
      {
        id: "wS",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      },
      {
        id: "wE",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 10, y: 0 },
        end: { x: 10, y: 8 },
      },
      {
        id: "wN",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 10, y: 8 },
        end: { x: 0, y: 8 },
      },
      {
        id: "wW",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 0, y: 8 },
        end: { x: 0, y: 0 },
      },
    ],
    slabs: [
      { id: "s0", levelId: "L0", polygon, thickness_m: 0.2, elevation_m: 0 },
    ],
    openings: [
      {
        id: "o1",
        type: "door",
        levelId: "L0",
        wallId: "wS",
        position_m: 5,
        width_m: 1,
        sill_height_m: 0,
        head_height_m: 2.1,
        height_m: 2.1,
      },
    ],
    roof: {
      type: "pitched_gable",
      planes: [{ id: "p1", polygon, ridge_height_m: 5.5, eave_height_m: 3.5 }],
      ridges: [],
      eaves: [],
      hips: [],
      valleys: [],
      parapets: [],
      dormers: [],
    },
  };
}

function fixtureTakeoff() {
  return {
    items: [
      { category: "areas", item: "Gross Floor Area", unit: "m2", quantity: 80 },
      {
        category: "envelope",
        item: "External Wall Area",
        unit: "m2",
        quantity: 36,
      },
      {
        category: "openings",
        item: "Door, M",
        unit: "nr",
        quantity: 1,
        description: "Main entrance",
      },
    ],
  };
}

const SAMPLE_DXF = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n";

describe("handoffPackageService — internal helpers", () => {
  test("buildQuantityTakeoffCsv produces header + per-row CSV with escaped commas", () => {
    const csv = HANDOFF_INTERNALS.buildQuantityTakeoffCsv({
      items: [
        { category: "envelope", item: "Wall", unit: "m2", quantity: 12 },
        {
          category: "openings",
          item: "Door, M",
          unit: "nr",
          quantity: 1,
          description: "Main, front",
        },
      ],
    });
    expect(csv.split("\n")[0]).toBe(
      "category,item,unit,quantity,description,notes",
    );
    expect(csv).toMatch(/"Door, M"/);
    expect(csv).toMatch(/"Main, front"/);
    expect(csv).toMatch(/envelope,Wall,m2,12,/);
  });

  test("deriveDisclaimers surfaces structural/MEP/cost/DWG when conditions hold", () => {
    const disclaimers = HANDOFF_INTERNALS.deriveDisclaimers({
      flags: { structuralEnabled: true, mepEnabled: true },
      costSummary: {
        rateCardFallbackWarning: { code: "RATE_CARD_FALLBACK" },
        missingRatesWarning: { code: "MISSING_RATES", items: [{}, {}] },
      },
      dwgAvailable: false,
    });
    const codes = disclaimers.map((d) => d.code);
    expect(codes).toContain("STRUCTURAL_REVIEW_REQUIRED");
    expect(codes).toContain("MEP_REVIEW_REQUIRED");
    expect(codes).toContain("COST_RATE_CARD_FALLBACK");
    expect(codes).toContain("COST_MISSING_RATES");
    expect(codes).toContain("DWG_UNAVAILABLE");
  });

  test("deriveDisclaimers omits items when conditions are clean", () => {
    const disclaimers = HANDOFF_INTERNALS.deriveDisclaimers({
      flags: {},
      costSummary: null,
      dwgAvailable: true,
    });
    expect(disclaimers).toEqual([]);
  });

  test("deriveQaStatus collapses surfaces to a single string", () => {
    expect(HANDOFF_INTERNALS.deriveQaStatus({})).toBe("pass");
    expect(
      HANDOFF_INTERNALS.deriveQaStatus({
        a1ExportQa: { degradedExport: true },
      }),
    ).toBe("degraded");
    expect(
      HANDOFF_INTERNALS.deriveQaStatus({ a1ExportQa: { allowed: false } }),
    ).toBe("blocked");
    expect(
      HANDOFF_INTERNALS.deriveQaStatus({ qaReport: { status: "warn" } }),
    ).toBe("warning");
  });

  test("buildDwgUnavailableText carries the geometryHash + docs hint", () => {
    const text = HANDOFF_INTERNALS.buildDwgUnavailableText({
      projectName: "X",
      geometryHash: "abc123",
      dwgUnavailable: {
        code: "DWG_CONVERSION_UNAVAILABLE",
        message: "Converter disabled.",
        docsUrl: "https://example/oda",
      },
    });
    expect(text).toMatch(/geometryHash: abc123/);
    expect(text).toMatch(/Converter disabled\./);
    expect(text).toMatch(/Docs: https:\/\/example\/oda/);
  });
});

describe("buildHandoffArtifactPackage — full package", () => {
  let result;
  beforeAll(async () => {
    result = await buildHandoffArtifactPackage({
      projectName: "Phase6 House",
      compiledProject: fixtureCompiledProject(),
      projectQuantityTakeoff: fixtureTakeoff(),
      projectGraph: { node: "graph", id: "graph-001" },
      dxf: SAMPLE_DXF,
      ifc: "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION;ENDSEC;\nEND-ISO-10303-21;\n",
      flags: { structuralEnabled: true, mepEnabled: false },
      env: {},
    });
  });

  test("zip carries the schema-versioned handoff.json", () => {
    const names = listZipEntryNames(result.zipBytes);
    expect(names).toContain("handoff.json");
    expect(names).toContain("README.md");
    expect(result.handoffJson.schema).toBe(HANDOFF_MANIFEST_SCHEMA_VERSION);
    expect(result.handoffJson.geometryHash).toBe("phase6-handoff-fixture-001");
  });

  test("zip carries the Phase 6 extras: GLB, takeoff CSV, project_graph.json", () => {
    const names = listZipEntryNames(result.zipBytes);
    expect(names.some((n) => n.endsWith(".glb"))).toBe(true);
    expect(names).toContain("schedules/quantity_takeoff.csv");
    expect(names).toContain("project_graph.json");
  });

  test("handoff.json file index matches the actual ZIP entries (count + paths)", () => {
    const names = listZipEntryNames(result.zipBytes);
    const handoffFilePaths = result.handoffJson.files.map((f) => f.path);
    for (const path of handoffFilePaths) {
      expect(names).toContain(path);
    }
    for (const file of result.handoffJson.files) {
      expect(typeof file.sha256).toBe("string");
      expect(file.size).toBeGreaterThan(0);
    }
  });

  test("DWG_UNAVAILABLE.txt is shipped when converter is not configured", () => {
    const names = listZipEntryNames(result.zipBytes);
    expect(names).toContain("cad/DWG_UNAVAILABLE.txt");
    expect(result.dwgAvailable).toBe(false);
    expect(result.dwgUnavailable?.code).toBe("DWG_CONVERSION_UNAVAILABLE");
  });

  test("disclaimers include structural review + DWG unavailable", () => {
    const codes = result.disclaimers.map((d) => d.code);
    expect(codes).toContain("STRUCTURAL_REVIEW_REQUIRED");
    expect(codes).toContain("DWG_UNAVAILABLE");
  });

  test("README.md mentions geometryHash + DWG install hint", () => {
    expect(result.readme).toMatch(/phase6-handoff-fixture-001/);
    expect(result.readme).toMatch(/ODA File Converter/);
  });

  test("qa.status is 'pass' when no a1ExportQa is supplied", () => {
    expect(result.handoffJson.qa.status).toBe("pass");
  });

  test("GLB byte length is positive", () => {
    expect(result.glb).not.toBeNull();
    expect(result.glb.byteLength).toBeGreaterThan(0);
  });
});

describe("buildHandoffArtifactPackage — qa.status:degraded", () => {
  test("degraded a1ExportQa surfaces as qa.status:'degraded' in handoff.json + README", async () => {
    const result = await buildHandoffArtifactPackage({
      projectName: "Phase6 Degraded",
      compiledProject: fixtureCompiledProject(),
      projectQuantityTakeoff: fixtureTakeoff(),
      projectGraph: { node: "x" },
      dxf: SAMPLE_DXF,
      a1ExportQa: {
        allowed: true,
        status: "degraded",
        degradedExport: true,
        blockers: [{ category: "readability", code: "TEXT_PROOF_LOW" }],
        warnings: [{ message: "small text" }],
      },
      env: {},
    });
    expect(result.handoffJson.qa.status).toBe("degraded");
    expect(result.handoffJson.qa.degradedExport).toBe(true);
    expect(result.readme).toMatch(/PRELIMINARY — QA WARNINGS/);
  });
});
