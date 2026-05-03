/**
 * SVG-to-PNG rasteriser. Plan §13.1.
 *
 * Production renderers (Blender, headless three.js, FAL) are out of scope for
 * this MVP. The rasteriser converts the deterministic A1 SVG output (or any
 * panel SVG) to a PNG bitmap using sharp (already a dependency) so that the
 * pipeline can emit a render asset with full provenance — same source_model_hash,
 * same render dimensions, no LLM or generative drift.
 *
 * A real atmospheric exterior render (texture, lighting, sky dome) is tracked
 * as Tier 4 follow-up.
 *
 * Test-mode stub (PR-D follow-up):
 * Setting `A1_TEST_RASTER_MODE=stub` in the environment short-circuits the
 * heavy 300-DPI A1 rasterisation. The stub returns a 1×1 valid PNG with
 * metadata that REPORTS the dimensions a full render would have produced, so
 * downstream gates (300-DPI dimension check, density checks, layout sanity)
 * still run against realistic numbers. Visual verification is not exercised
 * in this mode — tests using it should assert metadata / layout / geometry
 * contracts only. See `analyseRenderedSheetPng` in
 * `projectGraphVerticalSliceService.js` for the matching ink-metric stub.
 */

export const RASTERISER_VERSION = "svg-rasteriser-v1";
export const STUB_RASTERISER_VERSION = "stub-svg-rasteriser-v1";
export const A1_TEST_RASTER_MODE_ENV = "A1_TEST_RASTER_MODE";
export const A1_TEST_RASTER_STUB_VALUE = "stub";

/**
 * Hard production safety gate for the raster stub.
 *
 * Codex integration finding: A1_TEST_RASTER_MODE=stub alone is too easy to
 * leak into a production runtime — once set, final A1 PDFs would emit a
 * 1×1 stub PNG with synthetic healthy ink metrics and pass the 300-DPI gate
 * with fabricated dimensions. Tighten the predicate so stub mode can only
 * activate inside a test runtime AND never inside a production / Vercel /
 * final-A1 context, regardless of what the env flag says.
 *
 * Stub mode runs only when ALL of the following hold:
 *   - process.env.A1_TEST_RASTER_MODE === "stub"
 *   - one of: NODE_ENV === "test" / JEST_WORKER_ID set / VITEST set
 *   - none of: NODE_ENV === "production" / VERCEL_ENV === "production"
 *               / VERCEL === "1" / options.isFinalA1 === true
 *
 * Callers that have a final-A1 context (e.g. the projectGraph A1 PDF path)
 * should pass `{ isFinalA1: true }` so the gate refuses regardless of how
 * the test env was set.
 *
 * @param {{ isFinalA1?: boolean }} [options]
 * @returns {boolean}
 */
export function isRasterStubModeAllowed(options = {}) {
  const requested =
    process.env[A1_TEST_RASTER_MODE_ENV] === A1_TEST_RASTER_STUB_VALUE;
  if (!requested) return false;

  const isTestRuntime =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.JEST_WORKER_ID) ||
    Boolean(process.env.VITEST);

  const isProductionRuntime =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL === "1" ||
    options.isFinalA1 === true;

  return isTestRuntime && !isProductionRuntime;
}

/**
 * @deprecated since the production-safety gate landed. Kept as a thin alias
 * so external callers do not break; new code should use
 * isRasterStubModeAllowed(options) and pass an `isFinalA1` hint when known.
 */
export function isStubRasterModeEnabled(options = {}) {
  return isRasterStubModeAllowed(options);
}

let sharpModule = null;
async function loadSharp() {
  if (sharpModule) return sharpModule;
  try {
    const mod = await import("sharp");
    sharpModule = mod.default || mod;
    return sharpModule;
  } catch (error) {
    throw new Error(
      `sharp module unavailable in this environment: ${error?.message || "unknown"}. SVG-to-PNG rasterisation requires sharp.`,
    );
  }
}

// Cached 1×1 valid PNG used in stub mode. Generated once by sharp.create
// (no SVG parsing) so the cost is negligible and it survives across tests.
let cachedStubPngBuffer = null;
async function getStubPngBuffer() {
  if (cachedStubPngBuffer) return cachedStubPngBuffer;
  const sharp = await loadSharp();
  cachedStubPngBuffer = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 243, g: 239, b: 229, alpha: 1 },
    },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
  return cachedStubPngBuffer;
}

function ensureBuffer(svgInput) {
  if (typeof svgInput === "string") {
    return Buffer.from(svgInput, "utf8");
  }
  if (svgInput instanceof Uint8Array) return Buffer.from(svgInput);
  if (Buffer.isBuffer && Buffer.isBuffer(svgInput)) return svgInput;
  throw new Error("svgInput must be a string, Buffer, or Uint8Array.");
}

/**
 * @param {object} input
 * @param {string|Buffer} input.svg            - SVG body or document.
 * @param {number}        [input.densityDpi=150] - DPI for raster density.
 * @param {number}        [input.widthPx]      - Optional fixed output width.
 * @param {number}        [input.heightPx]     - Optional fixed output height.
 * @param {string}        [input.background="#ffffff"] - Background fill.
 * @param {object}        [input.provenance]   - Provenance to attach.
 * @returns {Promise<{ pngBuffer: Buffer, metadata: object }>}
 */
export async function rasteriseSvgToPng({
  svg,
  densityDpi = 150,
  widthPx,
  heightPx,
  background = "#ffffff",
  provenance = {},
} = {}) {
  if (!svg) {
    throw new Error("rasteriseSvgToPng requires svg input");
  }
  const sharp = await loadSharp();
  const buffer = ensureBuffer(svg);

  let pipeline = sharp(buffer, { density: densityDpi }).flatten({ background });

  if (Number.isFinite(widthPx) || Number.isFinite(heightPx)) {
    pipeline = pipeline.resize({
      width: Number.isFinite(widthPx) ? widthPx : null,
      height: Number.isFinite(heightPx) ? heightPx : null,
      fit: "inside",
      withoutEnlargement: false,
    });
  }

  // Phase A close-out: compressionLevel 9 with adaptive filtering is ~2-3x
  // slower than libpng's default level 6 on 70M-pixel A1-at-300DPI buffers.
  // Level 6 produces ~5-15% larger PNGs but the file size is acceptable for
  // a server-side intermediate (it gets re-embedded into a PDF anyway).
  const png = await pipeline
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer({
      resolveWithObject: true,
    });

  return {
    pngBuffer: png.data,
    metadata: {
      asset_type: "render_png",
      rasteriser: RASTERISER_VERSION,
      width_px: png.info?.width || null,
      height_px: png.info?.height || null,
      channels: png.info?.channels || null,
      size_bytes: png.data.length,
      density_dpi: densityDpi,
      background,
      provenance: {
        ...provenance,
        rasteriser_version: RASTERISER_VERSION,
      },
    },
  };
}

/**
 * Convenience: render the A1 sheet SVG produced by buildA1Sheet into a
 * deterministic PNG render asset for download / preview. No 3D lighting.
 *
 * In stub mode (A1_TEST_RASTER_MODE=stub, ONLY in a test runtime) returns
 * a 1×1 PNG with metadata REPORTING the dimensions a full render would have
 * produced. Suitable for tests that validate metadata / layout / geometry
 * contracts but not the raster pixels themselves. Callers that already know
 * they are inside a final-A1 export path should pass `{ isFinalA1: true }`
 * so the safety gate refuses stub mode regardless of test-env detection.
 */
export async function rasteriseSheetArtifact({
  sheetArtifact,
  densityDpi = 150,
  isFinalA1 = false,
}) {
  if (!sheetArtifact?.svgString) {
    throw new Error(
      "rasteriseSheetArtifact requires sheetArtifact.svgString (no fallback)",
    );
  }
  if (isRasterStubModeAllowed({ isFinalA1 })) {
    return buildStubSheetRaster({ sheetArtifact, densityDpi });
  }
  return rasteriseSvgToPng({
    svg: sheetArtifact.svgString,
    densityDpi,
    background: "#f3efe5",
    provenance: {
      source: "compiled_project_sheet_artifact",
      source_svg_hash: sheetArtifact.svgHash,
      source_model_hash: sheetArtifact.source_model_hash,
      drawing_number: sheetArtifact.drawing_number,
      sheet_label: sheetArtifact.sheet_label,
      asset_id: sheetArtifact.asset_id,
    },
  });
}

async function buildStubSheetRaster({ sheetArtifact, densityDpi }) {
  // Default to A1 landscape sheet dimensions. The stub claims the dimensions
  // the real rasteriser would have produced at the requested DPI so the
  // 300-DPI gate at api/a1/compose.js + projectGraphVerticalSliceService
  // sees realistic numbers — even though the actual PNG is 1×1.
  const widthMm = Number(sheetArtifact?.sheet_size_mm?.width) || 841;
  const heightMm = Number(sheetArtifact?.sheet_size_mm?.height) || 594;
  const widthPx = Math.round((widthMm / 25.4) * densityDpi);
  const heightPx = Math.round((heightMm / 25.4) * densityDpi);
  const pngBuffer = await getStubPngBuffer();
  return {
    pngBuffer,
    metadata: {
      asset_type: "render_png",
      rasteriser: STUB_RASTERISER_VERSION,
      width_px: widthPx,
      height_px: heightPx,
      channels: 4,
      size_bytes: pngBuffer.length,
      density_dpi: densityDpi,
      background: "#f3efe5",
      stub: true,
      provenance: {
        source: "stub_test_rasteriser",
        source_svg_hash: sheetArtifact.svgHash,
        source_model_hash: sheetArtifact.source_model_hash,
        drawing_number: sheetArtifact.drawing_number,
        sheet_label: sheetArtifact.sheet_label,
        asset_id: sheetArtifact.asset_id,
        rasteriser_version: STUB_RASTERISER_VERSION,
      },
    },
  };
}

export const __internal = {
  RASTERISER_VERSION,
  STUB_RASTERISER_VERSION,
  buildStubSheetRaster,
  getStubPngBuffer,
};
export default { rasteriseSvgToPng, rasteriseSheetArtifact };
