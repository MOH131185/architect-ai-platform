import {
  rasteriseSheetArtifact,
  isStubRasterModeEnabled,
  STUB_RASTERISER_VERSION,
  A1_TEST_RASTER_MODE_ENV,
  A1_TEST_RASTER_STUB_VALUE,
  __internal,
} from "../../../services/render/svgRasteriser.js";

// PR-D follow-up: the stub raster must keep the projectGraphVerticalSlice
// suite under jest's per-suite budget by replacing the 300-DPI A1 PNG
// rasterisation with a 1×1 PNG that REPORTS realistic metadata. These
// tests verify the contract: env gating, dimension reporting, and that
// downstream gates can rely on the metadata shape unchanged.

const SHEET_ARTIFACT = Object.freeze({
  svgString: `<svg xmlns="http://www.w3.org/2000/svg" width="841mm" height="594mm"><rect width="841" height="594" fill="#f3efe5"/></svg>`,
  svgHash: "fakehash-svg",
  source_model_hash: "fakehash-model",
  drawing_number: "A1-01",
  sheet_label: "test-sheet",
  asset_id: "asset-test",
  sheet_size_mm: { width: 841, height: 594 },
});

describe("svgRasteriser stub mode (PR-D follow-up)", () => {
  const originalEnv = process.env[A1_TEST_RASTER_MODE_ENV];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[A1_TEST_RASTER_MODE_ENV];
    } else {
      process.env[A1_TEST_RASTER_MODE_ENV] = originalEnv;
    }
  });

  describe("isStubRasterModeEnabled", () => {
    test("returns true when env is set to 'stub'", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      expect(isStubRasterModeEnabled()).toBe(true);
    });

    test("returns false when env is unset", () => {
      delete process.env[A1_TEST_RASTER_MODE_ENV];
      expect(isStubRasterModeEnabled()).toBe(false);
    });

    test("returns false for any value other than 'stub'", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = "preview";
      expect(isStubRasterModeEnabled()).toBe(false);
      process.env[A1_TEST_RASTER_MODE_ENV] = "true";
      expect(isStubRasterModeEnabled()).toBe(false);
      process.env[A1_TEST_RASTER_MODE_ENV] = "1";
      expect(isStubRasterModeEnabled()).toBe(false);
    });
  });

  describe("rasteriseSheetArtifact in stub mode", () => {
    beforeEach(() => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
    });

    test("returns metadata claiming 300-DPI A1 dimensions even though PNG is tiny", async () => {
      const result = await rasteriseSheetArtifact({
        sheetArtifact: SHEET_ARTIFACT,
        densityDpi: 300,
      });

      // The PNG itself is the cached 1×1 stub.
      expect(Buffer.isBuffer(result.pngBuffer)).toBe(true);
      expect(result.pngBuffer.length).toBeGreaterThan(0);
      expect(result.pngBuffer.length).toBeLessThan(200);

      // But metadata reports the real dimensions a 300-DPI render would
      // have produced, so the FINAL_A1 dimension gate sees realistic values.
      expect(result.metadata.width_px).toBe(9933);
      expect(result.metadata.height_px).toBe(7016);
      expect(result.metadata.density_dpi).toBe(300);
      expect(result.metadata.rasteriser).toBe(STUB_RASTERISER_VERSION);
      expect(result.metadata.stub).toBe(true);
    });

    test("scales reported dimensions for the preview 144 DPI path", async () => {
      const result = await rasteriseSheetArtifact({
        sheetArtifact: SHEET_ARTIFACT,
        densityDpi: 144,
      });
      expect(result.metadata.width_px).toBe(4768);
      expect(result.metadata.height_px).toBe(3368);
      expect(result.metadata.density_dpi).toBe(144);
    });

    test("threads sheetArtifact provenance into the metadata", async () => {
      const result = await rasteriseSheetArtifact({
        sheetArtifact: SHEET_ARTIFACT,
        densityDpi: 300,
      });
      expect(result.metadata.provenance.source).toBe("stub_test_rasteriser");
      expect(result.metadata.provenance.source_svg_hash).toBe("fakehash-svg");
      expect(result.metadata.provenance.drawing_number).toBe("A1-01");
      expect(result.metadata.provenance.asset_id).toBe("asset-test");
    });

    test("rejects sheetArtifact without svgString (same contract as production)", async () => {
      await expect(
        rasteriseSheetArtifact({ sheetArtifact: {}, densityDpi: 300 }),
      ).rejects.toThrow(/requires sheetArtifact\.svgString/);
    });

    test("buildStubSheetRaster respects custom sheet_size_mm", async () => {
      // A2 landscape (594 × 420 mm).
      const result = await __internal.buildStubSheetRaster({
        sheetArtifact: {
          ...SHEET_ARTIFACT,
          sheet_size_mm: { width: 594, height: 420 },
        },
        densityDpi: 300,
      });
      expect(result.metadata.width_px).toBe(7016);
      expect(result.metadata.height_px).toBe(4961);
    });

    test("getStubPngBuffer caches the buffer between calls", async () => {
      const a = await __internal.getStubPngBuffer();
      const b = await __internal.getStubPngBuffer();
      expect(a).toBe(b);
    });
  });
});
