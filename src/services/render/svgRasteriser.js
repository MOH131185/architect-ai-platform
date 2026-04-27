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
 */

const RASTERISER_VERSION = "svg-rasteriser-v1";

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

  const png = await pipeline.png({ compressionLevel: 9 }).toBuffer({
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
 */
export async function rasteriseSheetArtifact({
  sheetArtifact,
  densityDpi = 150,
}) {
  if (!sheetArtifact?.svgString) {
    throw new Error(
      "rasteriseSheetArtifact requires sheetArtifact.svgString (no fallback)",
    );
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

export const __internal = { RASTERISER_VERSION };
export default { rasteriseSvgToPng, rasteriseSheetArtifact };
