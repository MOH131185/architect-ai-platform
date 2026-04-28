import {
  A1_PHYSICAL_SHEET_SIZE_MM,
  FINAL_A1_PNG_DIMENSIONS,
  buildA1SheetSetPlan,
  buildSheetTextContract,
  detectA1GlyphIntegrity,
  detectA1RasterGlyphIntegrity,
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

  describe("detectA1RasterGlyphIntegrity (Phase A)", () => {
    function makeFakeSharp({
      width = 200,
      height = 80,
      pattern = "text",
    } = {}) {
      // Build a synthetic single-channel grayscale buffer that simulates either
      // real text (many narrow vertical strokes per row) or tofu boxes (a few
      // wide solid rectangles per row).
      function buildBuffer(w, h, mode) {
        const out = new Uint8Array(w * h);
        out.fill(255);
        if (mode === "text") {
          // 8 narrow vertical strokes per row, each 2px wide, gap 12px.
          for (let y = 10; y < h - 10; y++) {
            for (let i = 0; i < 8; i++) {
              const x0 = 8 + i * 18;
              if (x0 + 2 < w) {
                out[y * w + x0] = 20;
                out[y * w + x0 + 1] = 20;
              }
            }
          }
        } else if (mode === "tofu") {
          // 2 wide solid filled rectangles per row, each 60px wide.
          for (let y = 10; y < h - 10; y++) {
            for (let x = 8; x < 68; x++) out[y * w + x] = 20;
            for (let x = 90; x < 150; x++) out[y * w + x] = 20;
          }
        } else if (mode === "blank") {
          // pure white background
        }
        return out;
      }
      const fullBuffer = buildBuffer(width, height, pattern);
      function sharpFn(/* buffer */) {
        let extractRect = { left: 0, top: 0, width, height };
        const api = {
          metadata: async () => ({ width, height }),
          extract: (rect) => {
            extractRect = { ...rect };
            return api;
          },
          greyscale: () => api,
          raw: () => api,
          toBuffer: async ({ resolveWithObject } = {}) => {
            const w = extractRect.width;
            const h = extractRect.height;
            const out = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) {
              const srcY = extractRect.top + y;
              for (let x = 0; x < w; x++) {
                const srcX = extractRect.left + x;
                out[y * w + x] = fullBuffer[srcY * width + srcX] ?? 255;
              }
            }
            const data = Buffer.from(out);
            return resolveWithObject
              ? { data, info: { width: w, height: h, channels: 1 } }
              : data;
          },
        };
        return api;
      }
      return sharpFn;
    }

    test("passes on a real-text pixel pattern", async () => {
      const sharp = makeFakeSharp({ width: 200, height: 80, pattern: "text" });
      const result = await detectA1RasterGlyphIntegrity({
        pngBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        sharp,
        panelLabelCoordinates: {
          floor_plan_ground: {
            x: 0,
            y: 0,
            width: 200,
            height: 80,
            labelHeight: 32,
          },
        },
      });
      expect(result.status).toBe("pass");
      expect(result.suspectZones).toHaveLength(0);
      expect(result.realTextZoneCount).toBeGreaterThan(0);
    });

    test("blocks when pixel pattern matches tofu signature", async () => {
      const sharp = makeFakeSharp({ width: 200, height: 80, pattern: "tofu" });
      const result = await detectA1RasterGlyphIntegrity({
        pngBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        sharp,
        panelLabelCoordinates: {
          floor_plan_ground: {
            x: 0,
            y: 0,
            width: 200,
            height: 80,
            labelHeight: 32,
          },
        },
      });
      expect(result.status).toBe("blocked");
      expect(result.suspectZones.length).toBeGreaterThan(0);
      expect(result.blockers.join(" ")).toMatch(/tofu/i);
    });

    test("warns (not blocks) when sampled bands have neither text nor tofu (blank panels)", async () => {
      const sharp = makeFakeSharp({ width: 200, height: 80, pattern: "blank" });
      const result = await detectA1RasterGlyphIntegrity({
        pngBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        sharp,
        panelLabelCoordinates: {
          floor_plan_ground: {
            x: 0,
            y: 0,
            width: 200,
            height: 80,
            labelHeight: 32,
          },
        },
      });
      // Blank panels are legitimate (e.g. test fixtures with synthetic SVGs
      // that have no caption). Only the tofu signature should hard-block.
      expect(result.status).toBe("warning");
      expect(result.warnings.join(" ")).toMatch(/blank|featureless/i);
      expect(result.blockers).toEqual([]);
    });

    test("returns not_run when pngBuffer is empty", async () => {
      const result = await detectA1RasterGlyphIntegrity({
        pngBuffer: Buffer.alloc(0),
        sharp: () => ({}),
        panelLabelCoordinates: {},
      });
      expect(result.status).toBe("not_run");
      expect(result.passed).toBe(false);
    });

    test("returns not_run when no panel label zones are provided", async () => {
      const sharp = makeFakeSharp({ pattern: "text" });
      const result = await detectA1RasterGlyphIntegrity({
        pngBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        sharp,
        panelLabelCoordinates: {},
      });
      expect(result.status).toBe("not_run");
    });
  });
});
