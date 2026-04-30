import {
  A1_PHYSICAL_SHEET_SIZE_MM,
  FINAL_A1_PNG_DIMENSIONS,
  PHASE_F_EXPORT_GATE_VERSION,
  buildA1SheetSetPlan,
  buildSheetTextContract,
  detectA1GlyphIntegrity,
  detectA1RasterGlyphIntegrity,
  evaluateFinalA1ExportGate,
  resolveA1RenderContract,
} from "../../services/a1/a1FinalExportContract.js";

// Phase F changed the gate success vocabulary from "allowed" to
// "pass" | "warning" | "blocked". The stable contract for downstream callers
// is `gate.allowed` (true for pass+warning, false for blocked) — `status` is
// for richer UI messaging. Tests that previously asserted status === "allowed"
// now assert allowed === true plus the new status string.

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

    // Phase F: legacy minimal inputs (no PDF metadata, no panels, no manifest,
    // no material palette, no openai provider) → gate degrades to "warning"
    // because evidence is absent; `allowed` stays true (no hard blocker).
    expect(gate.allowed).toBe(true);
    expect(gate.status).toBe("warning");
    expect(gate.blockers).toEqual([]);
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

    // Phase F: legacy success vocabulary updated; stable contract is `allowed`.
    expect(gate.allowed).toBe(true);
    expect(["pass", "warning"]).toContain(gate.status);
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

    // Phase F: with companion sheet generated the split-status evidence is
    // pass; absent Phase F evidence keeps overall status at warning. Stable
    // contract is allowed===true with no blockers.
    expect(gate.allowed).toBe(true);
    expect(gate.blockers).toEqual([]);
    expect(gate.evidence.sheetSplitStatus.status).toBe("pass");
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

  // -------------------------------------------------------------------------
  // Phase F gate cases
  //
  // Each case constructs the smallest set of inputs required to exercise one
  // policy decision. Optional evidence that is absent is intentionally left
  // out — the gate must degrade to warning, not block, when evidence simply
  // wasn't supplied.
  // -------------------------------------------------------------------------
  describe("Phase F export gate", () => {
    const baseRenderContract = () =>
      resolveA1RenderContract({ renderIntent: "final_a1" });

    const okPostCompose = () => ({
      publishability: { status: "publishable", blockers: [] },
      renderedTextZone: {
        status: "pass",
        blockers: [],
        ocr: { available: true },
        ocrEvidenceQuality: "verified",
      },
    });

    const okFinalSheetRegression = () => ({
      finalSheetRegressionReady: true,
      blockers: [],
    });

    const HEALTHY_PDF_METADATA = Object.freeze({
      pdfRenderMode: "raster_textpaths_300dpi",
      dpi: 300,
      textRenderMode: "font_paths",
      isFinalA1: true,
      rasterIntegrityStatus: "pass",
    });

    const HEALTHY_RASTER_INTEGRITY = Object.freeze({
      status: "pass",
      passed: true,
      suspectZones: [],
      blockers: [],
      warnings: [],
    });

    const HEALTHY_PANEL_REGISTRY = Object.freeze([
      "hero_3d",
      "interior_3d",
      "axonometric",
      "site_diagram",
      "floor_plan_ground",
      "floor_plan_first",
      "elevation_north",
      "elevation_south",
      "elevation_east",
      "elevation_west",
      "section_AA",
      "section_BB",
      "schedules_notes",
      "material_palette",
      "climate_card",
    ]);

    const buildHealthyPanels = () =>
      HEALTHY_PANEL_REGISTRY.map((type) => ({
        type,
        status: "ready",
        hasSvg: true,
      }));

    const HEALTHY_VISUAL_MANIFEST = Object.freeze({
      version: "visual-manifest-v1",
      manifestId: "visual-manifest-test-001",
      manifestHash: "manifest-hash-OK",
      storeyCount: 2,
    });

    const buildHealthyVisualPanels = () =>
      ["hero_3d", "interior_3d", "axonometric"].map((type) => ({
        type,
        visualManifestHash: "manifest-hash-OK",
        visualIdentityLocked: true,
      }));

    const buildHealthyMaterialPalette = () => ({
      cards: [
        {
          materialSignature: "sig-brick",
          textureKind: "red_multi_brick",
          source: "procedural_svg_pattern",
          fallbackAvailable: true,
          label: "Red Multi Brick",
        },
        {
          materialSignature: "sig-tile",
          textureKind: "dark_grey_roof_tile",
          source: "procedural_svg_pattern",
          fallbackAvailable: true,
          label: "Dark Grey Roof Tile",
        },
      ],
    });

    const HEALTHY_OPENAI_PROVIDER = Object.freeze({
      openaiConfigured: true,
      openaiReasoningUsed: true,
      openaiImageUsed: true,
      openaiRequestIds: ["req_abc123"],
      providerFallbacks: [],
    });

    test("valid final A1 passes", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        strictPhotoreal: false,
        imageGenEnabled: true,
      });

      expect(gate.version).toBe(PHASE_F_EXPORT_GATE_VERSION);
      expect(gate.status).toBe("pass");
      expect(gate.allowed).toBe(true);
      expect(gate.demotedToPreview).toBe(false);
      expect(gate.blockers).toEqual([]);
      expect(gate.warnings).toEqual([]);
      expect(gate.evidence.requiredPanelStatus.status).toBe("pass");
      expect(gate.evidence.visualManifestStatus.status).toBe("pass");
      expect(gate.evidence.materialPaletteStatus.status).toBe("pass");
      expect(gate.evidence.openaiProviderStatus.status).toBe("pass");
    });

    test("tofu/raster integrity blocks", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: {
          status: "blocked",
          passed: false,
          suspectZones: [{ panelType: "floor_plan_ground" }],
          blockers: [
            "Rendered PNG has 1 panel label band(s) matching the tofu signature.",
          ],
          warnings: [],
        },
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.status).toBe("blocked");
      expect(gate.allowed).toBe(false);
      expect(gate.evidence.rasterGlyphIntegrity.status).toBe("blocked");
      expect(gate.blockers.join(" ")).toMatch(/tofu/i);
    });

    test("preview DPI in final mode blocks and demotes", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: {
          pdfRenderMode: "raster_textpaths_preview_144dpi",
          dpi: 144,
          textRenderMode: "font_paths",
          isFinalA1: true,
          rasterIntegrityStatus: "pass",
        },
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.status).toBe("blocked");
      expect(gate.demotedToPreview).toBe(true);
      expect(gate.evidence.pdfMetadata.status).toBe("blocked");
      expect(gate.blockers.join(" ")).toMatch(/300 DPI|preview/i);
    });

    test("missing floor_plan_level2 for 3 storeys blocks", () => {
      const panels = buildHealthyPanels(); // contains level0 + first, no level2
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels,
        panelRegistry: [...HEALTHY_PANEL_REGISTRY, "floor_plan_level2"],
        targetStoreys: 3,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.status).toBe("blocked");
      expect(gate.evidence.requiredPanelStatus.level2Required).toBe(true);
      expect(gate.evidence.requiredPanelStatus.level2Present).toBe(false);
      expect(gate.evidence.requiredPanelStatus.missing).toContain(
        "floor_plan_level2",
      );
      expect(gate.blockers.join(" ")).toMatch(/floor_plan_level2/);
    });

    test("deterministic visual fallback warns but does not block (default)", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: {
          openaiConfigured: true,
          openaiReasoningUsed: true,
          openaiImageUsed: false,
          openaiRequestIds: ["req_abc123"],
          providerFallbacks: [
            { stepId: "exterior_render", providerUsed: "deterministic" },
          ],
        },
        strictPhotoreal: false,
        imageGenEnabled: false,
      });

      expect(gate.status).toBe("warning");
      expect(gate.allowed).toBe(true);
      expect(gate.evidence.openaiProviderStatus.status).toBe("warning");
      expect(gate.warnings.join(" ")).toMatch(/deterministic/i);
    });

    test("strict photoreal mode blocks when fallback occurs", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: {
          openaiConfigured: true,
          openaiReasoningUsed: true,
          openaiImageUsed: false,
          openaiRequestIds: ["req_abc123"],
          providerFallbacks: [
            { stepId: "exterior_render", providerUsed: "deterministic" },
          ],
        },
        strictPhotoreal: true,
        imageGenEnabled: true,
      });

      expect(gate.status).toBe("blocked");
      expect(gate.evidence.openaiProviderStatus.status).toBe("blocked");
      expect(gate.blockers.join(" ")).toMatch(/strict photoreal/i);
    });

    test("visualManifestHash mismatch blocks", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: [
          {
            type: "hero_3d",
            visualManifestHash: "manifest-hash-OK",
            visualIdentityLocked: true,
          },
          {
            type: "interior_3d",
            visualManifestHash: "manifest-hash-DIFFERENT",
            visualIdentityLocked: true,
          },
        ],
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.status).toBe("blocked");
      expect(gate.evidence.visualManifestStatus.mismatched).toContain(
        "interior_3d",
      );
      expect(gate.blockers.join(" ")).toMatch(/visualManifestHash|manifest/);
    });

    test("missing material provenance warns", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: {
          cards: [
            {
              // missing materialSignature, textureKind, source
              label: "Mystery Material",
            },
            {
              materialSignature: "sig-tile",
              textureKind: "dark_grey_roof_tile",
              source: "procedural_svg_pattern",
              label: "Dark Grey Roof Tile",
            },
          ],
        },
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.status).toBe("warning");
      expect(gate.allowed).toBe(true);
      expect(gate.evidence.materialPaletteStatus.status).toBe("warning");
      expect(
        gate.evidence.materialPaletteStatus.cardsWithoutProvenance,
      ).toContain("Mystery Material");
    });

    test("procedural_svg_pattern material cards pass", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: { required: false },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.evidence.materialPaletteStatus.status).toBe("pass");
      expect(gate.evidence.materialPaletteStatus.proceduralCount).toBe(2);
      expect(gate.evidence.materialPaletteStatus.aiThumbnailCount).toBe(0);
      expect(
        gate.evidence.materialPaletteStatus.cardsWithoutProvenance,
      ).toEqual([]);
    });

    test("split-required missing companion blocks (evidence shape)", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        pdfUrl: "/api/a1/compose-output/a1.pdf",
        finalSheetRegression: okFinalSheetRegression(),
        postComposeVerification: okPostCompose(),
        glyphIntegrity: { status: "pass", blockers: [] },
        sheetSetPlan: {
          required: true,
          generated: false,
          reason: "A1-01 overflow requires an A1-02 companion sheet artifact.",
        },
        pdfMetadata: HEALTHY_PDF_METADATA,
        rasterGlyphIntegrity: HEALTHY_RASTER_INTEGRITY,
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.status).toBe("blocked");
      expect(gate.evidence.sheetSplitStatus.status).toBe("blocked");
      expect(gate.evidence.sheetSplitStatus.required).toBe(true);
      expect(gate.evidence.sheetSplitStatus.generated).toBe(false);
    });

    test("upstream_partial scope does not block on absent PDF", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: baseRenderContract(),
        // no pdfUrl, no PDF metadata, no post-compose verification —
        // upstream gate runs before the PDF is built
        scope: "upstream_partial",
        panels: buildHealthyPanels(),
        panelRegistry: HEALTHY_PANEL_REGISTRY,
        targetStoreys: 2,
        visualManifest: HEALTHY_VISUAL_MANIFEST,
        visualPanels: buildHealthyVisualPanels(),
        materialPalette: buildHealthyMaterialPalette(),
        openaiProvider: HEALTHY_OPENAI_PROVIDER,
        imageGenEnabled: true,
      });

      expect(gate.scope).toBe("upstream_partial");
      expect(gate.allowed).toBe(true);
      // No hard blockers from absent PDF/regression/post-compose at upstream
      // scope — those are the compose route's responsibility.
      expect(gate.blockers.filter((b) => /print-ready PDF/.test(b))).toEqual(
        [],
      );
    });

    test("preview render contract returns not_applicable", () => {
      const gate = evaluateFinalA1ExportGate({
        renderContract: resolveA1RenderContract({}),
      });
      expect(gate.status).toBe("not_applicable");
      expect(gate.allowed).toBe(true);
      expect(gate.demotedToPreview).toBe(false);
    });
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
