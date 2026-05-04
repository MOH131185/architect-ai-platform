import {
  rasteriseSheetArtifact,
  isRasterStubModeAllowed,
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
//
// Codex integration finding (this commit): the stub MUST refuse to activate
// in production / Vercel / final-A1 contexts even when A1_TEST_RASTER_MODE=
// stub is set, so a stray env var can never silently substitute a 1×1 PNG
// for a real A1 export.

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
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalVercel = process.env.VERCEL;
  const originalJestWorker = process.env.JEST_WORKER_ID;

  function restoreOriginal(name, original) {
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  }

  afterEach(() => {
    restoreOriginal(A1_TEST_RASTER_MODE_ENV, originalEnv);
    restoreOriginal("NODE_ENV", originalNodeEnv);
    restoreOriginal("VERCEL_ENV", originalVercelEnv);
    restoreOriginal("VERCEL", originalVercel);
    restoreOriginal("JEST_WORKER_ID", originalJestWorker);
  });

  describe("isRasterStubModeAllowed (production-safety gate)", () => {
    test("allows stub mode in jest test runtime", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      // Jest already sets JEST_WORKER_ID; the gate must allow.
      expect(isRasterStubModeAllowed()).toBe(true);
      // isStubRasterModeEnabled is a deprecated alias that delegates here.
      expect(isStubRasterModeEnabled()).toBe(true);
    });

    test("REGRESSION: stub mode is IGNORED with NODE_ENV=production even when A1_TEST_RASTER_MODE=stub", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      process.env.NODE_ENV = "production";
      expect(isRasterStubModeAllowed()).toBe(false);
      expect(isStubRasterModeEnabled()).toBe(false);
    });

    test("REGRESSION: stub mode is IGNORED with VERCEL=1", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      process.env.VERCEL = "1";
      // Even with NODE_ENV unset / test, VERCEL=1 means production runtime.
      expect(isRasterStubModeAllowed()).toBe(false);
    });

    test("REGRESSION: stub mode is IGNORED with VERCEL_ENV=production", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      process.env.VERCEL_ENV = "production";
      expect(isRasterStubModeAllowed()).toBe(false);
    });

    test("REGRESSION: stub mode is IGNORED when caller passes isFinalA1=true", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      // Even in jest, the final-A1 export path must never accept a stub.
      expect(isRasterStubModeAllowed({ isFinalA1: true })).toBe(false);
      expect(isStubRasterModeEnabled({ isFinalA1: true })).toBe(false);
    });

    test("isFinalA1=false (or omitted) does not affect the test-runtime allow", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      expect(isRasterStubModeAllowed({ isFinalA1: false })).toBe(true);
      expect(isRasterStubModeAllowed({})).toBe(true);
    });

    test("test runtime is detected via NODE_ENV=test even without JEST_WORKER_ID", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      delete process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = "test";
      expect(isRasterStubModeAllowed()).toBe(true);
    });

    test("requires both env=stub AND a test runtime", () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      delete process.env.JEST_WORKER_ID;
      delete process.env.VITEST;
      delete process.env.NODE_ENV;
      // No test-runtime signal → refuse even outside production.
      expect(isRasterStubModeAllowed()).toBe(false);
    });

    test("rasteriseSheetArtifact refuses stub when isFinalA1=true (full call)", async () => {
      process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
      const result = await rasteriseSheetArtifact({
        sheetArtifact: SHEET_ARTIFACT,
        densityDpi: 300,
        isFinalA1: true,
      });
      // Real raster path runs; rasteriser tag is NOT the stub version.
      expect(result.metadata.rasteriser).not.toBe(STUB_RASTERISER_VERSION);
      expect(result.metadata.stub).toBeUndefined();
    });
  });

  describe("isStubRasterModeEnabled (legacy alias, still env-gated)", () => {
    test("returns true when env is set to 'stub' in jest", () => {
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
