import {
  A1_PHYSICAL_SHEET_SIZE_MM,
  FINAL_A1_PNG_DIMENSIONS,
  buildA1SheetSetPlan,
  buildSheetTextContract,
  detectA1GlyphIntegrity,
  evaluateFinalA1ExportGate,
  resolveA1RenderContract,
} from "../../services/a1/a1FinalExportContract.js";

describe("a1FinalExportContract", () => {
  test("resolves explicit final A1 exports to print-master dimensions and gates", () => {
    const contract = resolveA1RenderContract({
      renderIntent: "final_a1",
      skipPdf: true,
    });

    expect(contract).toMatchObject({
      renderIntent: "final_a1",
      isFinalA1: true,
      highRes: true,
      printMaster: true,
      enforcePreComposeVerification: true,
      enforcePostComposeVerification: true,
      enforceRenderedText: true,
      includePdf: true,
      physicalSheetSizeMm: A1_PHYSICAL_SHEET_SIZE_MM,
      pngDimensions: FINAL_A1_PNG_DIMENSIONS,
    });
  });

  test("keeps normal compose requests in preview mode", () => {
    const contract = resolveA1RenderContract({});

    expect(contract.renderIntent).toBe("preview");
    expect(contract.isFinalA1).toBe(false);
    expect(contract.highRes).toBe(false);
    expect(contract.includePdf).toBe(false);
  });

  test("builds a sheet text contract from panel captions and project metadata", () => {
    const contract = buildSheetTextContract({
      panels: [
        { type: "floor_plan_ground", label: "GROUND FLOOR PLAN" },
        { type: "hero_3d", label: "HERO 3D VIEW" },
      ],
      titleBlock: {
        projectName: "Courtyard House",
        scale: "1:100",
      },
      masterDNA: {
        rooms: [{ name: "Kitchen" }, { name: "Studio" }],
      },
      renderIntent: "final_a1",
    });

    expect(contract.requiredLabels).toEqual(
      expect.arrayContaining([
        "GROUND FLOOR PLAN",
        "HERO 3D VIEW",
        "Courtyard House",
        "Kitchen",
        "MATERIAL PALETTE",
      ]),
    );
    expect(contract.minPhysicalTextMm).toBeGreaterThanOrEqual(2.2);
  });

  test("detects literal tofu and square replacement glyphs", () => {
    const glyphIntegrity = detectA1GlyphIntegrity({
      sheetSvg: '<svg><text x="10" y="20">GROUND FLOOR □□□</text></svg>',
      sheetTextContract: { requiredLabelCount: 1 },
    });

    expect(glyphIntegrity.status).toBe("blocked");
    expect(glyphIntegrity.tofuGlyphCount).toBe(3);
    expect(glyphIntegrity.repeatedTofuRunCount).toBe(1);
  });

  test("blocks final export when OCR evidence is missing", () => {
    const gate = evaluateFinalA1ExportGate({
      renderContract: resolveA1RenderContract({ renderIntent: "final_a1" }),
      pdfUrl: "/api/a1/compose-output/a1.pdf",
      finalSheetRegression: {
        finalSheetRegressionReady: true,
        blockers: [],
      },
      postComposeVerification: {
        publishability: { status: "publishable", blockers: [] },
        renderedTextZone: {
          status: "pass",
          blockers: [],
          ocr: { available: false },
          ocrEvidenceQuality: "provisional",
        },
      },
      glyphIntegrity: { status: "pass", blockers: [] },
      sheetSetPlan: { required: false },
    });

    expect(gate.status).toBe("blocked");
    expect(gate.blockers).toContain(
      "Final A1 export requires OCR evidence; OCR was unavailable for the rendered PNG.",
    );
  });

  test("allows final export only when PDF, OCR, glyph, and sheet-density gates pass", () => {
    const gate = evaluateFinalA1ExportGate({
      renderContract: resolveA1RenderContract({ renderIntent: "final_a1" }),
      pdfUrl: "/api/a1/compose-output/a1.pdf",
      finalSheetRegression: {
        finalSheetRegressionReady: true,
        blockers: [],
      },
      postComposeVerification: {
        publishability: { status: "publishable", blockers: [] },
        renderedTextZone: {
          status: "pass",
          blockers: [],
          ocr: { available: true },
          ocrEvidenceQuality: "verified",
        },
      },
      glyphIntegrity: { status: "pass", blockers: [] },
      sheetSetPlan: { required: false },
    });

    expect(gate.status).toBe("allowed");
  });

  test("defers pre-compose rendered-text blockers to post-compose evidence", () => {
    const gate = evaluateFinalA1ExportGate({
      renderContract: resolveA1RenderContract({ renderIntent: "final_a1" }),
      pdfUrl: "/api/a1/compose-output/a1.pdf",
      finalSheetRegression: {
        finalSheetRegressionReady: false,
        blockers: [
          "Rendered text zone panel-header:floor_plan_ground lacks enough evidence for reliable final-sheet labelling.",
          "Only 0 panel header zone(s) passed rendered verification; fixture minimum is 6.",
        ],
        technicalPanelRegression: { blockers: [] },
        textZoneSanity: {
          blockers: [
            "Rendered text zone panel-header:floor_plan_ground lacks enough evidence for reliable final-sheet labelling.",
          ],
        },
        fixtureComparison: {
          blockers: [
            "Only 0 panel header zone(s) passed rendered verification; fixture minimum is 6.",
          ],
        },
      },
      postComposeVerification: {
        publishability: { status: "publishable", blockers: [] },
        renderedTextZone: {
          status: "pass",
          blockers: [],
          ocr: { available: true },
          ocrEvidenceQuality: "verified",
        },
      },
      glyphIntegrity: { status: "pass", blockers: [] },
      sheetSetPlan: { required: false },
    });

    expect(gate.status).toBe("allowed");
    expect(gate.preComposeRegressionPolicy.status).toBe(
      "deferred_to_post_compose",
    );
  });

  test("keeps technical pre-compose blockers fail-closed", () => {
    const gate = evaluateFinalA1ExportGate({
      renderContract: resolveA1RenderContract({ renderIntent: "final_a1" }),
      pdfUrl: "/api/a1/compose-output/a1.pdf",
      finalSheetRegression: {
        finalSheetRegressionReady: false,
        blockers: ["Elevation east is missing canonical drawing evidence."],
        technicalPanelRegression: {
          blockers: ["Elevation east is missing canonical drawing evidence."],
        },
        textZoneSanity: { blockers: [] },
        fixtureComparison: { blockers: [] },
      },
      postComposeVerification: {
        publishability: { status: "publishable", blockers: [] },
        renderedTextZone: {
          status: "pass",
          blockers: [],
          ocr: { available: true },
          ocrEvidenceQuality: "verified",
        },
      },
      glyphIntegrity: { status: "pass", blockers: [] },
      sheetSetPlan: { required: false },
    });

    expect(gate.status).toBe("blocked");
    expect(gate.blockers).toContain(
      "Elevation east is missing canonical drawing evidence.",
    );
  });

  test("allows dense final exports when A1-02 companion artifacts are generated", () => {
    const gate = evaluateFinalA1ExportGate({
      renderContract: resolveA1RenderContract({ renderIntent: "final_a1" }),
      pdfUrl: "/api/a1/compose-output/a1.pdf",
      finalSheetRegression: {
        finalSheetRegressionReady: true,
        blockers: [],
      },
      postComposeVerification: {
        publishability: { status: "publishable", blockers: [] },
        renderedTextZone: {
          status: "pass",
          blockers: [],
          ocr: { available: true },
          ocrEvidenceQuality: "verified",
        },
      },
      glyphIntegrity: { status: "pass", blockers: [] },
      sheetSetPlan: {
        required: true,
        generated: true,
        artifacts: {
          generated: true,
          pngUrl: "/api/a1/compose-output/a1-02.png",
          pdfUrl: "/api/a1/compose-output/a1-02.pdf",
        },
      },
    });

    expect(gate.status).toBe("allowed");
  });

  test("marks extreme text density for A1-02 overflow planning", () => {
    const sheetSetPlan = buildA1SheetSetPlan({
      panels: new Array(4).fill(null).map((_, index) => ({
        type: `panel_${index}`,
      })),
      sheetTextContract: {
        requiredLabelCount: 64,
      },
    });

    expect(sheetSetPlan.required).toBe(true);
    expect(sheetSetPlan.sheets.map((sheet) => sheet.id)).toEqual([
      "A1-01",
      "A1-02",
    ]);
  });
});
