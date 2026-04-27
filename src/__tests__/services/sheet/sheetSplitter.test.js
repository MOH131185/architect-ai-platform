import {
  decideSheetSplit,
  SPLIT_THRESHOLDS,
} from "../../../services/sheet/sheetSplitter.js";
import { buildArchitectureProjectVerticalSlice } from "../../../services/project/projectGraphVerticalSliceService.js";

jest.setTimeout(60000);

describe("decideSheetSplit", () => {
  test("emits a single sheet when programme/storey/regulation density is low", () => {
    const decision = decideSheetSplit({
      brief: { target_storeys: 2 },
      programme: { spaces: new Array(8).fill({ space_id: "s" }) },
      regulations: {
        rule_summary: { hard_blocker_count: 0, warning_count: 1 },
      },
    });
    expect(decision.split).toBe(false);
    expect(decision.sheets.length).toBe(1);
    expect(decision.sheets[0].sheet_number).toBe("A1-01");
    expect(decision.sheets[0].panel_types.length).toBeGreaterThan(8);
  });

  test("splits into A1-01/02/03 when storeys > 2", () => {
    const decision = decideSheetSplit({
      brief: { target_storeys: 4 },
      programme: { spaces: new Array(8).fill({}) },
      regulations: {
        rule_summary: { hard_blocker_count: 0, warning_count: 0 },
      },
    });
    expect(decision.split).toBe(true);
    expect(decision.sheets.length).toBe(3);
    expect(decision.sheets.map((s) => s.sheet_number)).toEqual([
      "A1-01",
      "A1-02",
      "A1-03",
    ]);
    // The plan/section sheet (A1-02) carries plans + sections only.
    expect(decision.sheets[1].panel_types).toEqual(
      expect.arrayContaining([
        "floor_plan_ground",
        "floor_plan_first",
        "section_AA",
        "section_BB",
      ]),
    );
  });

  test("splits when programme spaces exceed threshold", () => {
    const decision = decideSheetSplit({
      brief: { target_storeys: 2 },
      programme: {
        spaces: new Array(SPLIT_THRESHOLDS.programmeSpaces + 1).fill({}),
      },
      regulations: { rule_summary: {} },
    });
    expect(decision.split).toBe(true);
    expect(decision.triggers.programmeOverflow).toBe(true);
  });

  test("splits when regulation hotspot count exceeds threshold", () => {
    const decision = decideSheetSplit({
      brief: { target_storeys: 2 },
      programme: { spaces: [] },
      regulations: {
        rule_summary: {
          hard_blocker_count: 2,
          warning_count: 5,
        },
      },
    });
    expect(decision.split).toBe(true);
    expect(decision.triggers.regulationOverflow).toBe(true);
  });

  test("each split sheet's panel_types are non-empty and disjoint with the others on key panels", () => {
    const decision = decideSheetSplit({
      brief: { target_storeys: 4 },
      programme: { spaces: [] },
      regulations: { rule_summary: {} },
    });
    const allPanels = decision.sheets.flatMap((s) => s.panel_types);
    expect(allPanels).toEqual(
      expect.arrayContaining(["site_context", "floor_plan_ground"]),
    );
    // Plans should not appear on the elevation sheet.
    const a1_03 = decision.sheets.find((s) => s.sheet_number === "A1-03");
    expect(a1_03.panel_types).not.toContain("floor_plan_ground");
  });
});

describe("multi-sheet integration", () => {
  beforeEach(() => {
    process.env.MODEL_SOURCE = "base";
    process.env.OPENAI_REASONING_MODEL = "gpt-5.4";
    process.env.OPENAI_FAST_MODEL = "gpt-5.4-mini";
  });

  test("Reading Room fixture stays single-sheet", async () => {
    const result = await buildArchitectureProjectVerticalSlice({
      brief: {
        project_name: "Single Sheet Smoke",
        building_type: "community",
        site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
        target_gia_m2: 320,
        target_storeys: 2,
      },
    });
    expect(result.projectGraph.sheets.split_decision.split).toBe(false);
    expect(result.projectGraph.sheets.sheets.length).toBe(1);
    expect(result.artifacts.sheetSeries.length).toBe(1);
    expect(result.artifacts.sheetSeries[0].sheet_number).toBe("A1-01");
  });

  test("4-storey brief triggers a 3-sheet split with distinct PDFs", async () => {
    const result = await buildArchitectureProjectVerticalSlice({
      brief: {
        project_name: "Multi-Sheet Smoke",
        building_type: "multi_residential",
        site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
        target_gia_m2: 800,
        target_storeys: 4,
      },
    });
    expect(result.projectGraph.sheets.split_decision.split).toBe(true);
    expect(result.projectGraph.sheets.sheets.length).toBe(3);
    expect(result.artifacts.sheetSeries.length).toBe(3);
    const sheetNumbers = result.artifacts.sheetSeries.map(
      (s) => s.sheet_number,
    );
    expect(sheetNumbers).toEqual(["A1-01", "A1-02", "A1-03"]);
    // Each sheet must have its own PDF artifact id, and they must differ.
    const pdfIds = result.artifacts.sheetSeries.map((s) => s.pdf_asset_id);
    expect(new Set(pdfIds).size).toBe(3);
    // Primary export (artifacts.a1Pdf) is the first sheet.
    expect(result.artifacts.a1Pdf.asset_id).toBe(pdfIds[0]);
  });
});
