/**
 * Phase 5D — vector PDF builder.
 *
 * Reads the master A1 sheet SVG, parses it (no DOM, no canvas — pure
 * regex tokeniser), embeds NotoSans Regular + Bold TTF in the PDF,
 * walks the SVG tree and emits pdf-lib draw calls so technical drawings
 * stay vector and text stays selectable. Raster panels (the AI render
 * PNGs and the site snapshot) are embedded as PDF Image XObjects at
 * their original resolution — no re-encoding.
 *
 * Designed as the **additional** export artifact for the Phase 5D
 * rollout. The raster pipeline remains the production default. This
 * builder must NEVER throw — failures are swallowed and reported via
 * the returned `error` field so the orchestrator can fall back to the
 * raster artifact without affecting end-user generation.
 *
 * No external deps beyond `pdf-lib` (already installed). The only
 * runtime requirement is that the caller supplies the TTF font bytes —
 * the existing `prepareFinalSheetSvgForRasterizationWithReport` already
 * embeds NotoSans bytes inside the SVG via `@font-face`, so we extract
 * those when no explicit `fonts` arg is supplied.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseSvg } from "./_lib/lightweightSvgParser.js";
import { walkSvgIntoPdf } from "./_lib/svgToPdfWalker.js";

export const VECTOR_PDF_RENDER_MODE = "vector_textpaths_off";
export const VECTOR_PDF_SCHEMA_VERSION = "vector-pdf-v1";

const A1_WIDTH_MM = 841;
const A1_HEIGHT_MM = 594;
const MM_TO_PT = 72 / 25.4;

const NOTO_REGULAR_RE =
  /url\(\s*data:font\/[^;]*;\s*base64\s*,\s*([^)\s]+)\s*\)\s*format\(['"]?truetype['"]?\)?[^}]*?font-weight:\s*(?:400|normal)/i;
const NOTO_BOLD_RE =
  /url\(\s*data:font\/[^;]*;\s*base64\s*,\s*([^)\s]+)\s*\)\s*format\(['"]?truetype['"]?\)?[^}]*?font-weight:\s*(?:700|bold)/i;

/**
 * Best-effort extraction of NotoSans bytes from the SVG's embedded
 * `@font-face` blocks. Returns `{ regular, bold }` Buffers, either of
 * which may be null when the SVG doesn't carry a matching face.
 */
export function extractEmbeddedFonts(svgString) {
  const out = { regular: null, bold: null };
  if (typeof svgString !== "string") return out;
  const styleBlockMatch = svgString.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const css = styleBlockMatch ? styleBlockMatch[1] : svgString;
  const tryRegular = css.match(NOTO_REGULAR_RE);
  const tryBold = css.match(NOTO_BOLD_RE);
  if (tryRegular) {
    try {
      out.regular = Buffer.from(tryRegular[1], "base64");
    } catch {
      /* ignore */
    }
  }
  if (tryBold) {
    try {
      out.bold = Buffer.from(tryBold[1], "base64");
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * Compute deterministic FNV-1a hash of the PDF buffer for cache /
 * provenance. Not crypto.
 */
function fnv1aHex(buffer) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buffer.length; i++) {
    h = Math.imul(h ^ buffer[i], 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function viewBoxFromRoot(root) {
  if (!root) return null;
  const vb = String(root.attrs?.viewBox || "").trim();
  if (vb) {
    const parts = vb.split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        minX: parts[0],
        minY: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }
  const w = Number(root.attrs?.width);
  const h = Number(root.attrs?.height);
  if (Number.isFinite(w) && Number.isFinite(h)) {
    return { minX: 0, minY: 0, width: w, height: h };
  }
  return null;
}

/**
 * Build a vector PDF from a sheet SVG.
 *
 * @param {object} params
 * @param {string} params.svgString  - the full master A1 sheet SVG text
 * @param {object} [params.fonts]    - { regular: Buffer, bold: Buffer }
 *        TTF bytes; falls back to extraction from the SVG's @font-face.
 * @param {string} [params.title]    - PDF document title metadata
 * @param {string} [params.author]   - PDF document author metadata
 * @param {string} [params.geometryHash] - upstream geometry hash, copied
 *        into the PDF's metadata for provenance.
 * @returns {Promise<{ ok: boolean, pdfBytes: Buffer|null, dataUrl: string|null,
 *   pdfHash: string|null, byteLength: number, pageCount: number,
 *   pageSizeMm: { width: number, height: number },
 *   pdfRenderMode: "vector_textpaths_off",
 *   schemaVersion: string,
 *   summary: { drawCalls: number, skipped: object, warnings: string[] },
 *   error: string|null
 * }>}
 */
export async function buildVectorPdfFromSheetSvg({
  svgString,
  fonts,
  title = "ArchiAI A1 sheet",
  author = "ArchiAI",
  geometryHash = null,
  inspectable = false,
} = {}) {
  const baseResult = {
    ok: false,
    pdfBytes: null,
    dataUrl: null,
    pdfHash: null,
    byteLength: 0,
    pageCount: 0,
    pageSizeMm: { width: A1_WIDTH_MM, height: A1_HEIGHT_MM },
    pdfRenderMode: VECTOR_PDF_RENDER_MODE,
    schemaVersion: VECTOR_PDF_SCHEMA_VERSION,
    summary: { drawCalls: 0, skipped: {}, warnings: [] },
    error: null,
  };
  if (typeof svgString !== "string" || svgString.length === 0) {
    return { ...baseResult, error: "empty_svg_string" };
  }
  let parsed;
  try {
    parsed = parseSvg(svgString);
  } catch (err) {
    return {
      ...baseResult,
      error: `parse_failed:${err?.message || "unknown"}`,
    };
  }
  if (!parsed.root) {
    return { ...baseResult, error: "no_svg_root" };
  }
  const viewBox = viewBoxFromRoot(parsed.root);
  if (!viewBox) {
    return { ...baseResult, error: "no_view_box" };
  }
  const fontBytes = fonts || extractEmbeddedFonts(svgString);

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(title);
    pdfDoc.setAuthor(author);
    pdfDoc.setProducer("ArchiAI/Phase5D");
    pdfDoc.setSubject(VECTOR_PDF_RENDER_MODE);
    if (geometryHash) {
      pdfDoc.setKeywords([
        `geometryHash=${geometryHash}`,
        VECTOR_PDF_SCHEMA_VERSION,
      ]);
    }
  } catch (err) {
    return {
      ...baseResult,
      error: `pdf_doc_create_failed:${err?.message || "unknown"}`,
    };
  }

  const pageWidthPt = A1_WIDTH_MM * MM_TO_PT;
  const pageHeightPt = A1_HEIGHT_MM * MM_TO_PT;
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

  let fontRegular;
  let fontBold = null;
  // pdf-lib instanceof Uint8Array fails in Jest+jsdom unless we copy
  // through the realm-local constructor.
  const toRealmUint8 = (b) =>
    b ? new Uint8Array(b.buffer || b, b.byteOffset || 0, b.byteLength) : null;
  try {
    if (fontBytes?.regular) {
      fontRegular = await pdfDoc.embedFont(toRealmUint8(fontBytes.regular), {
        subset: true,
      });
    } else {
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
    if (fontBytes?.bold) {
      fontBold = await pdfDoc.embedFont(toRealmUint8(fontBytes.bold), {
        subset: true,
      });
    } else {
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
  } catch (err) {
    // Fall back to standard fonts when embedded TTF fails to parse.
    try {
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      baseResult.summary.warnings.push(
        `font_embed_fallback:${(err?.message || "unknown").slice(0, 80)}`,
      );
    } catch (innerErr) {
      return {
        ...baseResult,
        error: `font_embed_failed:${innerErr?.message || "unknown"}`,
      };
    }
  }

  // SVG → PDF coordinate mapping. The master sheet SVG is sized in
  // millimetres but its viewBox uses logical units that match. We
  // uniformly fit the viewBox into the A1 page (preserving aspect)
  // and centre any leftover space.
  const sx = pageWidthPt / viewBox.width;
  const sy = pageHeightPt / viewBox.height;
  const scale = Math.min(sx, sy);
  const offsetX = (pageWidthPt - viewBox.width * scale) / 2;
  const offsetY = (pageHeightPt - viewBox.height * scale) / 2;

  function toPdfXY(svgX, svgY) {
    const localX = (svgX - viewBox.minX) * scale + offsetX;
    // SVG y-down → PDF y-up flip
    const localY = pageHeightPt - ((svgY - viewBox.minY) * scale + offsetY);
    return { x: localX, y: localY };
  }

  let summary;
  try {
    summary = await walkSvgIntoPdf({
      root: parsed.root,
      page,
      pdfDoc,
      fontRegular,
      fontBold,
      toPdfXY,
      scale,
      viewBox,
    });
  } catch (err) {
    return {
      ...baseResult,
      error: `walk_failed:${err?.message || "unknown"}`,
    };
  }

  let pdfBytes;
  try {
    // `inspectable: true` disables object streams so callers (chiefly
    // tests and the manual-smoke script) can introspect the PDF
    // structure with a regex. Production keeps the compact default.
    const out = await pdfDoc.save({ useObjectStreams: !inspectable });
    pdfBytes = Buffer.from(out);
  } catch (err) {
    return {
      ...baseResult,
      error: `pdf_save_failed:${err?.message || "unknown"}`,
    };
  }

  const pdfHash = fnv1aHex(pdfBytes);
  const dataUrl = `data:application/pdf;base64,${pdfBytes.toString("base64")}`;

  return {
    ok: true,
    pdfBytes,
    dataUrl,
    pdfHash,
    byteLength: pdfBytes.length,
    pageCount: 1,
    pageSizeMm: { width: A1_WIDTH_MM, height: A1_HEIGHT_MM },
    pdfRenderMode: VECTOR_PDF_RENDER_MODE,
    schemaVersion: VECTOR_PDF_SCHEMA_VERSION,
    summary: {
      ...summary,
      // Merge any pre-existing warnings (e.g. font fallback)
      warnings: [...(baseResult.summary.warnings || []), ...summary.warnings],
    },
    error: null,
  };
}

export const __testing = Object.freeze({
  extractEmbeddedFonts,
  fnv1aHex,
  viewBoxFromRoot,
  A1_WIDTH_MM,
  A1_HEIGHT_MM,
  MM_TO_PT,
});
