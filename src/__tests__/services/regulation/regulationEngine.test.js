import {
  resolveJurisdiction,
  getApplicablePartsFor,
  jurisdictionLimitations,
} from "../../../services/regulation/jurisdictionRouter.js";
import {
  APPROVED_DOCUMENTS_ENGLAND,
  findSourceByPart,
} from "../../../services/regulation/sourceRegistry.js";
import {
  runRegulationRules,
  summarizeRuleResults,
} from "../../../services/regulation/runRules.js";
import { buildArchitectureProjectVerticalSlice } from "../../../services/project/projectGraphVerticalSliceService.js";

describe("regulation/sourceRegistry", () => {
  test("includes Approved Documents A through T", () => {
    const parts = APPROVED_DOCUMENTS_ENGLAND.map((doc) => doc.part);
    expect(parts).toEqual(
      expect.arrayContaining([
        "A",
        "B",
        "E",
        "F",
        "G",
        "H",
        "K",
        "L",
        "M",
        "O",
        "Q",
        "R",
        "S",
        "T",
        "Regulation 7",
      ]),
    );
  });

  test("findSourceByPart returns the canonical Part M source", () => {
    const ad = findSourceByPart("M");
    expect(ad).toBeTruthy();
    expect(ad.title).toMatch(/Approved Document M/i);
    expect(ad.source_url).toContain("gov.uk");
  });
});

describe("regulation/jurisdictionRouter", () => {
  test("routes English postcodes to england", () => {
    const j = resolveJurisdiction({
      site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
    });
    expect(j).toBe("england");
  });

  test("routes Scottish postcodes to scotland", () => {
    expect(resolveJurisdiction({ site_input: { postcode: "EH1 1YZ" } })).toBe(
      "scotland",
    );
  });

  test("routes Welsh postcodes to wales", () => {
    expect(resolveJurisdiction({ site_input: { postcode: "CF10 1AA" } })).toBe(
      "wales",
    );
  });

  test("routes BT postcodes to northern_ireland", () => {
    expect(resolveJurisdiction({ site_input: { postcode: "BT1 1AA" } })).toBe(
      "northern_ireland",
    );
  });

  test("returns unknown_uk for non-UK lat/lon with no postcode", () => {
    expect(resolveJurisdiction({ site_input: { lat: 40.7, lon: -74.0 } })).toBe(
      "unknown_uk",
    );
  });

  test("getApplicablePartsFor england+dwelling includes Part O", () => {
    const parts = getApplicablePartsFor("england", "dwelling");
    expect(parts).toEqual(expect.arrayContaining(["L", "M", "O", "K"]));
  });

  test("getApplicablePartsFor scotland is empty (deferred to nation guidance)", () => {
    expect(getApplicablePartsFor("scotland", "dwelling")).toEqual([]);
  });

  test("jurisdictionLimitations names the right nation", () => {
    expect(jurisdictionLimitations("wales")[0]).toMatch(/Wales/i);
    expect(jurisdictionLimitations("scotland")[0]).toMatch(/Scotland/i);
    expect(jurisdictionLimitations("northern_ireland")[0]).toMatch(
      /Northern Ireland/i,
    );
    expect(jurisdictionLimitations("england")).toEqual([]);
  });
});

describe("regulation/runRules", () => {
  test("non-england jurisdiction returns manual_review for every part", () => {
    const out = runRegulationRules({
      brief: { site_input: { postcode: "EH1 1YZ" }, building_type: "dwelling" },
      applicableParts: ["M", "K", "O"],
    });
    expect(out.jurisdiction).toBe("scotland");
    expect(out.results.length).toBe(3);
    for (const result of out.results) {
      expect(result.status).toBe("manual_review");
    }
    expect(out.rule_coverage.every((entry) => !entry.evaluated)).toBe(true);
  });

  test("evaluates Part M door width rules against geometry", () => {
    const out = runRegulationRules({
      brief: {
        site_input: { postcode: "N1 1AA" },
        building_type: "community",
        target_storeys: 1,
      },
      programme: {
        spaces: [
          {
            space_id: "wc-1",
            name: "Accessible WC",
            function: "inclusive WC",
            accessible: true,
          },
        ],
      },
      projectGeometry: {
        doors: [
          { id: "d1", width_m: 0.7, kind: "door" }, // narrow
          { id: "d2", width_m: 1.1, kind: "main_entrance" },
        ],
        stairs: [],
        windows: [],
        walls: [],
      },
      applicableParts: ["M"],
    });
    expect(out.jurisdiction).toBe("england");
    const widthCheck = out.results.find(
      (r) => r.check_id === "ad-M-door-width",
    );
    expect(widthCheck.status).toBe("fail");
    expect(widthCheck.applies_to_element_ids).toContain("d1");
    const wcCheck = out.results.find(
      (r) => r.check_id === "ad-M-accessible-wc",
    );
    expect(wcCheck.status).toBe("pass");
  });

  test("Part O is not_applicable for non-residential", () => {
    const out = runRegulationRules({
      brief: { site_input: { postcode: "N1 1AA" }, building_type: "community" },
      climate: { overheating: { risk_level: "low" } },
      programme: { spaces: [] },
      projectGeometry: { doors: [], windows: [], walls: [], stairs: [] },
      applicableParts: ["O"],
    });
    const applicability = out.results.find(
      (r) => r.check_id === "ad-O-applicability",
    );
    expect(applicability.status).toBe("not_applicable");
  });

  test("Part O fires hard_blocker when overheating risk is high", () => {
    const out = runRegulationRules({
      brief: { site_input: { postcode: "N1 1AA" }, building_type: "dwelling" },
      climate: {
        overheating: { risk_level: "high", tm59_recommended: true },
        sun_path: { summer_solstice: { peak: { altitudeDeg: 62 } } },
      },
      programme: { spaces: [] },
      projectGeometry: { doors: [], windows: [], walls: [], stairs: [] },
      applicableParts: ["O"],
    });
    const riskCheck = out.results.find(
      (r) => r.check_id === "ad-O-overheating-risk",
    );
    expect(riskCheck.severity).toBe("hard_blocker");
    expect(riskCheck.status).toBe("fail");
  });

  test("Part K hard-blocks multi-storey schemes with no stair geometry", () => {
    const out = runRegulationRules({
      brief: {
        site_input: { postcode: "N1 1AA" },
        building_type: "dwelling",
        target_storeys: 2,
      },
      programme: { spaces: [] },
      projectGeometry: { doors: [], windows: [], walls: [], stairs: [] },
      applicableParts: ["K"],
    });
    const stairCheck = out.results.find(
      (r) => r.check_id === "ad-K-stair-presence",
    );
    expect(stairCheck.status).toBe("fail");
    expect(stairCheck.severity).toBe("hard_blocker");
  });

  test("manual_review fallback for parts without rule modules", () => {
    const out = runRegulationRules({
      brief: { site_input: { postcode: "N1 1AA" }, building_type: "dwelling" },
      programme: { spaces: [] },
      projectGeometry: { doors: [], windows: [], walls: [], stairs: [] },
      applicableParts: ["L", "B"],
    });
    expect(out.results.length).toBe(2);
    expect(out.results.every((r) => r.status === "manual_review")).toBe(true);
    for (const result of out.results) {
      expect(result.source_url).toMatch(/gov\.uk/);
    }
  });

  test("summarizeRuleResults aggregates outcomes correctly", () => {
    const summary = summarizeRuleResults([
      { status: "pass", severity: "info" },
      { status: "fail", severity: "hard_blocker" },
      { status: "needs_consultant", severity: "warning" },
      { status: "manual_review", severity: "needs_consultant" },
      { status: "not_applicable", severity: "info" },
    ]);
    expect(summary.total).toBe(5);
    expect(summary.pass).toBe(1);
    expect(summary.fail).toBe(1);
    expect(summary.manual_review).toBe(1);
    expect(summary.hard_blocker_count).toBe(1);
    expect(summary.warning_count).toBe(1);
    expect(summary.needs_consultant_count).toBe(1);
  });
});

describe("regulation engine — integration with vertical slice", () => {
  beforeEach(() => {
    process.env.MODEL_SOURCE = "base";
    process.env.OPENAI_REASONING_MODEL = "gpt-5.4";
    process.env.OPENAI_FAST_MODEL = "gpt-5.4-mini";
  });

  test("Reading Room fixture surfaces concrete Part M and Part K rule outcomes", async () => {
    const result = await buildArchitectureProjectVerticalSlice({
      brief: {
        project_name: "Neighbourhood Reading Room",
        building_type: "community",
        site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
        target_gia_m2: 320,
        target_storeys: 2,
      },
    });
    const regs = result.projectGraph.regulations;
    expect(regs.jurisdiction).toBe("england");
    expect(regs.precheck_results.length).toBeGreaterThan(0);
    const hasPartM = regs.precheck_results.some(
      (r) => r.source_document_id === "ad-M-2015",
    );
    const hasPartK = regs.precheck_results.some(
      (r) => r.source_document_id === "ad-K-2013",
    );
    expect(hasPartM).toBe(true);
    expect(hasPartK).toBe(true);
    expect(regs.rule_summary.hard_blocker_count).toBe(0);
    expect(
      regs.rule_coverage.find((entry) => entry.part === "M")?.evaluated,
    ).toBe(true);
    expect(
      regs.rule_coverage.find((entry) => entry.part === "L")?.evaluated,
    ).toBe(false);
    // Scorecard regulation category should reflect rules evaluated
    expect(
      result.qa.checks.find((c) => c.code === "REGULATION_RULES_EVALUATED")
        ?.status,
    ).toBe("pass");
    expect(
      result.qa.checks.find((c) => c.code === "REGULATION_NO_HARD_BLOCKERS")
        ?.status,
    ).toBe("pass");
  });
});
