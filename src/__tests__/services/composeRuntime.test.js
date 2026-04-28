import {
  collectTechnicalPanelGeometryHashes,
  findPanelsWithDisallowedTechnicalAuthority,
  findTechnicalPanelsMissingAuthorityMetadata,
  findTechnicalPanelsMissingGeometryHash,
  getOpusSheetCritic,
  planPrintReadyPdfBuild,
} from "../../services/a1/composeRuntime.js";
import { A1_HEIGHT, A1_WIDTH } from "../../services/a1/composeCore.js";

describe("composeRuntime", () => {
  test("getOpusSheetCritic returns a usable critic export", async () => {
    const criticExport = await getOpusSheetCritic();
    expect(criticExport).toBeTruthy();

    const critic =
      typeof criticExport === "function" ? new criticExport() : criticExport;

    expect(typeof critic.critiqueSheet).toBe("function");
  });

  test("tracks technical panel geometry hashes separately from visual panels", () => {
    const panels = [
      {
        type: "hero_3d",
        geometryHash: "geom-visual",
      },
      {
        type: "floor_plan_ground",
        meta: { geometryHash: "geom-tech" },
      },
      {
        type: "section_AA",
      },
      {
        type: "elevation_north",
        geometryHash: "geom-tech",
      },
    ];

    expect(collectTechnicalPanelGeometryHashes(panels)).toEqual(["geom-tech"]);
    expect(findTechnicalPanelsMissingGeometryHash(panels)).toEqual([
      "section_AA",
    ]);
  });

  test("flags missing technical authority metadata separately from geometry hash", () => {
    const panels = [
      {
        type: "floor_plan_ground",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "compiled_project_canonical_pack",
          authoritySource: "compiled_project",
          compiledProjectSchemaVersion: "compiled-project-v1",
        },
      },
      {
        type: "section_AA",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "compiled_project_canonical_pack",
        },
      },
    ];

    expect(findTechnicalPanelsMissingAuthorityMetadata(panels)).toEqual([
      {
        panelType: "section_AA",
        missing: ["compiledProjectSchemaVersion"],
      },
    ]);
  });

  test("rejects prompt-only authority for deterministic technical drawings", () => {
    const panels = [
      {
        type: "floor_plan_ground",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "prompt_only",
          authoritySource: "prompt_only",
          generatorUsed: "flux",
        },
      },
      {
        type: "site_diagram",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "deterministic_svg",
          authoritySource: "site_evidence",
        },
      },
    ];

    expect(findPanelsWithDisallowedTechnicalAuthority(panels)).toEqual([
      {
        panelType: "floor_plan_ground",
        authorityUsed: "prompt_only",
        authoritySource: "prompt_only",
        generatorUsed: "flux",
        panelAuthorityReason: null,
      },
    ]);
  });

  describe("planPrintReadyPdfBuild (Phase A close-out)", () => {
    test("final_a1 with 300 DPI A1 dimensions tags raster_textpaths_300dpi", () => {
      const plan = planPrintReadyPdfBuild({
        widthPx: A1_WIDTH,
        heightPx: A1_HEIGHT,
        dpi: 300,
        textRenderMode: "font_paths",
        rasterIntegrityStatus: "pass",
        isFinalA1: true,
      });
      expect(plan.pdfMetadata.pdfRenderMode).toBe("raster_textpaths_300dpi");
      expect(plan.pdfMetadata.isFinalA1).toBe(true);
      expect(plan.pdfMetadata.isRasterPdf).toBe(true);
      expect(plan.pdfMetadata.isVectorPdf).toBe(false);
      expect(plan.pdfMetadata.dpi).toBe(300);
      expect(plan.pdfMetadata.widthPx).toBe(A1_WIDTH);
      expect(plan.pdfMetadata.heightPx).toBe(A1_HEIGHT);
      expect(plan.pdfMetadata.textRenderMode).toBe("font_paths");
      expect(plan.pdfMetadata.rasterIntegrityStatus).toBe("pass");
      expect(plan.pdfMetadata.hybridVectorPdfFollowUp).toBe(true);
    });

    test("preview path is tagged raster_textpaths_preview_144dpi and isFinalA1=false", () => {
      const plan = planPrintReadyPdfBuild({
        widthPx: 1792,
        heightPx: 1269,
        dpi: 144,
        textRenderMode: "font_paths",
        rasterIntegrityStatus: "pass",
        isFinalA1: false,
      });
      expect(plan.pdfMetadata.pdfRenderMode).toBe(
        "raster_textpaths_preview_144dpi",
      );
      expect(plan.pdfMetadata.isFinalA1).toBe(false);
      expect(plan.pdfMetadata.dpi).toBe(144);
      expect(plan.pdfMetadata.widthPx).toBe(1792);
      expect(plan.pdfMetadata.heightPx).toBe(1269);
    });

    test("refuses isFinalA1 when raster width is preview density", () => {
      // 4768x3368 is exactly A1 at 144 DPI — the pre-fix production output
      // that the user reported. Even with dpi:300 declared, the raster size
      // is preview density and must be rejected.
      expect(() =>
        planPrintReadyPdfBuild({
          widthPx: 4768,
          heightPx: 3368,
          dpi: 300,
          textRenderMode: "font_paths",
          rasterIntegrityStatus: "pass",
          isFinalA1: true,
        }),
      ).toThrow(/preview density/);
    });

    test("refuses isFinalA1 when dpi is below the 300 DPI threshold", () => {
      expect(() =>
        planPrintReadyPdfBuild({
          widthPx: A1_WIDTH,
          heightPx: A1_HEIGHT,
          dpi: 144,
          textRenderMode: "font_paths",
          rasterIntegrityStatus: "pass",
          isFinalA1: true,
        }),
      ).toThrow(/preview density/);
    });

    test("refuses any caller when raster integrity is blocked", () => {
      expect(() =>
        planPrintReadyPdfBuild({
          widthPx: A1_WIDTH,
          heightPx: A1_HEIGHT,
          dpi: 300,
          textRenderMode: "font_paths",
          rasterIntegrityStatus: "blocked",
          isFinalA1: true,
        }),
      ).toThrow(/rasterIntegrityStatus is blocked/);
    });

    test("refuses font_face_only as a defensive Phase A regression guard", () => {
      expect(() =>
        planPrintReadyPdfBuild({
          widthPx: A1_WIDTH,
          heightPx: A1_HEIGHT,
          dpi: 300,
          textRenderMode: "font_face_only",
          isFinalA1: true,
        }),
      ).toThrow(/font_face_only/);
    });

    test("page-size points match widthPx/heightPx and declared DPI", () => {
      const plan = planPrintReadyPdfBuild({
        widthPx: A1_WIDTH,
        heightPx: A1_HEIGHT,
        dpi: 300,
        textRenderMode: "font_paths",
        isFinalA1: true,
      });
      const expectedWidthPt = (A1_WIDTH / 300) * 72;
      const expectedHeightPt = (A1_HEIGHT / 300) * 72;
      expect(plan.pdfMetadata.widthPt).toBeCloseTo(expectedWidthPt, 3);
      expect(plan.pdfMetadata.heightPt).toBeCloseTo(expectedHeightPt, 3);
    });

    test("preview pdf at 1792x1269 / 144 DPI yields ~12.4-inch page", () => {
      const plan = planPrintReadyPdfBuild({
        widthPx: 1792,
        heightPx: 1269,
        dpi: 144,
        textRenderMode: "font_paths",
        isFinalA1: false,
      });
      // 1792 px / 144 DPI = 12.444 inches; 12.444 * 72 = 896 pt.
      expect(plan.pdfMetadata.widthPt).toBeCloseTo(896, 0);
    });
  });
});
