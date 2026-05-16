import fs from "fs";
import path from "path";
import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";

export const runtime = "nodejs";
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

const REQUEST_BODY_MAX_BYTES = 256 * 1024;
const A1_PNG_WIDTH = 9933;
const A1_PNG_HEIGHT = 7016;
const FINAL_A1_PDF_DPI = 300;
const PUBLIC_URL_BASE_DEFAULT = "/api/a1/compose-output";
const SAFE_NAME = /^[a-zA-Z0-9._-]+\.(png|pdf|svg)$/;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PDF_SIGNATURE = Buffer.from("%PDF");
const UTF8_BOM = "﻿";

// Inline-SVG denylist. Reject-only (no stripping). All matches case-insensitive.
const INLINE_SVG_DENY_TOKENS = [
  "<script",
  "<foreignobject",
  'href="http://',
  "href='http://",
  "href=http://",
  'href="https://',
  "href='https://",
  "href=https://",
  'href="file://',
  "href='file://",
  "href=file://",
  'xlink:href="http://',
  "xlink:href='http://",
  "xlink:href=http://",
  'xlink:href="https://',
  "xlink:href='https://",
  "xlink:href=https://",
  'xlink:href="file://',
  "xlink:href='file://",
  "xlink:href=file://",
  "url(http://",
  "url('http://",
  'url("http://',
  "url(https://",
  "url('https://",
  'url("https://',
  "url(file://",
  "url('file://",
  'url("file://',
];

let _composeRuntimePromise = null;
async function loadComposeRuntime() {
  if (!_composeRuntimePromise) {
    _composeRuntimePromise = import(
      /* webpackChunkName: "a1-compose-runtime" */ "../../src/services/a1/composeRuntime.js"
    );
  }
  return _composeRuntimePromise;
}

let _artifactStoragePromise = null;
async function loadArtifactStorage() {
  if (!_artifactStoragePromise) {
    _artifactStoragePromise = import(
      /* webpackChunkName: "artifact-storage" */ "../../src/services/export/artifactStorageService.js"
    );
  }
  return _artifactStoragePromise;
}

let _vectorPdfBuilderPromise = null;
async function loadVectorPdfBuilder() {
  if (!_vectorPdfBuilderPromise) {
    _vectorPdfBuilderPromise = import(
      /* webpackChunkName: "vector-pdf-builder" */ "../../src/services/render/buildVectorPdfFromSheetSvg.js"
    );
  }
  return _vectorPdfBuilderPromise;
}

let _sharpPromise = null;
async function loadSharp() {
  if (!_sharpPromise) {
    _sharpPromise = import("sharp").then((m) => m.default || m);
  }
  return _sharpPromise;
}

function jsonError(res, status, code, message, extras = {}) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({
    success: false,
    error: { code, message, ...extras },
  });
}

function safeFilename(designId, projectName, format) {
  const base =
    String(projectName || designId || "a1_sheet")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "a1_sheet";
  const stamp = new Date().toISOString().slice(0, 10);
  const ext = format === "pdf" ? "pdf" : format === "svg" ? "svg" : "png";
  return `${base}_ARCH_${stamp}.${ext}`;
}

function classifyArtifactKind(buf) {
  if (!buf || buf.length === 0) return "unknown";
  if (
    buf.length >= PNG_SIGNATURE.length &&
    buf.slice(0, 8).equals(PNG_SIGNATURE)
  ) {
    return "png";
  }
  if (buf.length >= 4 && buf.slice(0, 4).equals(PDF_SIGNATURE)) {
    return "pdf";
  }
  // Quick SVG detection (utf-8): strip BOM and whitespace, look for <svg or <?xml.
  const head = buf
    .slice(0, Math.min(buf.length, 512))
    .toString("utf8")
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) {
    return "svg";
  }
  return "unknown";
}

function looksLikeSvgString(str) {
  if (typeof str !== "string" || str.length === 0) return false;
  const head = str.replace(/^﻿/, "").trimStart().toLowerCase();
  return head.startsWith("<svg") || head.startsWith("<?xml");
}

function sanitizeInlineSvg(svgString) {
  const lower = String(svgString || "").toLowerCase();
  for (const token of INLINE_SVG_DENY_TOKENS) {
    if (lower.includes(token)) {
      return { ok: false, blockedToken: token };
    }
  }
  return { ok: true };
}

function resolveOutputDirSafe(composeRuntime) {
  try {
    const dir = composeRuntime.resolveComposeOutputDir();
    return path.resolve(dir);
  } catch {
    return path.resolve(process.cwd(), "qa_results", "a1_compose_outputs");
  }
}

function resolveLocalArtifactPath(artifactPath, outputDir) {
  const prefix = "/api/a1/compose-output/";
  if (!artifactPath.startsWith(prefix)) {
    return { ok: false, code: "UNSUPPORTED_ARTIFACT_PATH" };
  }
  const name = artifactPath.slice(prefix.length);
  if (!SAFE_NAME.test(name)) {
    return { ok: false, code: "INVALID_ARTIFACT_NAME" };
  }
  const resolved = path.resolve(outputDir, name);
  const rel = path.relative(outputDir, resolved);
  if (
    !rel ||
    rel.startsWith("..") ||
    path.isAbsolute(rel) ||
    rel.includes(path.sep)
  ) {
    return { ok: false, code: "ARTIFACT_PATH_TRAVERSAL" };
  }
  return { ok: true, absolutePath: resolved, filename: name };
}

/**
 * Read artifact bytes from a compact reference.
 *
 * Returns `{ ok, source, kind, buffer, svgString?, error }`:
 *  - `kind` is `"png" | "pdf" | "svg" | "unknown"` derived from magic bytes.
 *  - `source` is `"file" | "inline"` so the caller knows whether to run
 *    the inline SVG denylist sanitiser.
 *  - For SVG sources, `svgString` is the utf-8 decoded text alongside `buffer`.
 */
function readArtifactBytes(artifactPath, outputDir) {
  if (typeof artifactPath !== "string" || artifactPath.length === 0) {
    return { ok: false, error: { code: "ARTIFACT_PATH_REQUIRED" } };
  }

  // 1) Compose-output file reference
  if (artifactPath.startsWith("/api/a1/compose-output/")) {
    const resolved = resolveLocalArtifactPath(artifactPath, outputDir);
    if (!resolved.ok) {
      return { ok: false, error: { code: resolved.code } };
    }
    let buffer;
    try {
      buffer = fs.readFileSync(resolved.absolutePath);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return { ok: false, error: { code: "ARTIFACT_NOT_FOUND" } };
      }
      return {
        ok: false,
        error: { code: "ARTIFACT_READ_FAILED", details: err.message },
      };
    }
    const kind = classifyArtifactKind(buffer);
    return {
      ok: true,
      source: "file",
      kind,
      buffer,
      svgString: kind === "svg" ? buffer.toString("utf8") : null,
      filename: resolved.filename,
    };
  }

  // 2) data:application/pdf;base64 — decode then classify by actual magic
  //    bytes. Matches the symmetry of the PNG/SVG data URL branches so
  //    `resolvePdfArtifactPath()` on the client can pass a small base64 PDF
  //    inline (e.g. when the slice emits `a1Pdf.dataUrl`) without hitting
  //    400 UNSUPPORTED_ARTIFACT_PATH. Anything beyond the 256 KB body cap is
  //    rejected at the EXPORT_BODY_TOO_LARGE guard above.
  if (/^data:application\/pdf[;,]/i.test(artifactPath)) {
    const idx = artifactPath.indexOf(",");
    if (idx < 0 || idx === artifactPath.length - 1) {
      return { ok: false, error: { code: "DATA_URL_EMPTY_PAYLOAD" } };
    }
    const meta = artifactPath.slice(0, idx).toLowerCase();
    const payload = artifactPath.slice(idx + 1);
    if (!meta.includes(";base64")) {
      return { ok: false, error: { code: "DATA_URL_UNSUPPORTED_ENCODING" } };
    }
    let buffer;
    try {
      buffer = Buffer.from(payload, "base64");
    } catch (err) {
      return {
        ok: false,
        error: { code: "DATA_URL_DECODE_FAILED", details: err.message },
      };
    }
    const kind = classifyArtifactKind(buffer);
    return {
      ok: true,
      source: "inline",
      kind,
      buffer,
      svgString: kind === "svg" ? buffer.toString("utf8") : null,
    };
  }

  // 3) data:image/png;base64 — decode then classify by actual magic bytes.
  //    The MIME prefix is advisory only; a caller (or attacker) could put SVG
  //    or HTML bytes behind a `data:image/png` label. classifyArtifactKind on
  //    the decoded buffer is the source of truth.
  if (/^data:image\/png[;,]/i.test(artifactPath)) {
    const idx = artifactPath.indexOf(",");
    if (idx < 0 || idx === artifactPath.length - 1) {
      return { ok: false, error: { code: "DATA_URL_EMPTY_PAYLOAD" } };
    }
    const meta = artifactPath.slice(0, idx).toLowerCase();
    const payload = artifactPath.slice(idx + 1);
    if (!meta.includes(";base64")) {
      return { ok: false, error: { code: "DATA_URL_UNSUPPORTED_ENCODING" } };
    }
    let buffer;
    try {
      buffer = Buffer.from(payload, "base64");
    } catch (err) {
      return {
        ok: false,
        error: { code: "DATA_URL_DECODE_FAILED", details: err.message },
      };
    }
    const kind = classifyArtifactKind(buffer);
    return {
      ok: true,
      source: "inline",
      kind,
      buffer,
      svgString: kind === "svg" ? buffer.toString("utf8") : null,
    };
  }

  // 4) data:image/svg+xml;{base64|utf8|charset=utf-8|<none>}
  //    Two-stage classification:
  //      (a) for ;base64, classify the RAW decoded bytes first. A PNG or PDF
  //          smuggled inside a `data:image/svg+xml;base64,…` label is caught
  //          before any utf-8 round-trip corrupts it.
  //      (b) for the text-encoded variants, classify the decoded utf-8 string.
  //    Either way, kind comes from the actual bytes, never the MIME label.
  if (/^data:image\/svg\+xml[;,]/i.test(artifactPath)) {
    const idx = artifactPath.indexOf(",");
    if (idx < 0 || idx === artifactPath.length - 1) {
      return { ok: false, error: { code: "DATA_URL_EMPTY_PAYLOAD" } };
    }
    const meta = artifactPath.slice(0, idx).toLowerCase();
    const payload = artifactPath.slice(idx + 1);

    if (meta.includes(";base64")) {
      let rawBuffer;
      try {
        rawBuffer = Buffer.from(payload, "base64");
      } catch (err) {
        return {
          ok: false,
          error: { code: "DATA_URL_DECODE_FAILED", details: err.message },
        };
      }
      // Classify raw bytes — PNG/PDF labelled as svg+xml is caught here.
      const rawKind = classifyArtifactKind(rawBuffer);
      if (rawKind === "svg") {
        return {
          ok: true,
          source: "inline",
          kind: "svg",
          buffer: rawBuffer,
          svgString: rawBuffer.toString("utf8"),
        };
      }
      return {
        ok: true,
        source: "inline",
        kind: rawKind,
        buffer: rawBuffer,
        svgString: null,
      };
    }

    let svgString;
    try {
      if (
        meta.includes(";utf8") ||
        meta.includes(";utf-8") ||
        meta.includes("charset=utf-8")
      ) {
        // utf8/charset=utf-8 may still be URL-encoded (browsers commonly
        // percent-encode angle brackets etc.). decodeURIComponent is a no-op
        // for plain text but recovers `<svg…>` from `%3Csvg%E2%80%A6%3E`.
        try {
          svgString = decodeURIComponent(payload);
        } catch {
          svgString = payload;
        }
      } else {
        // "data:image/svg+xml," (no params) → assume URL-encoded payload.
        try {
          svgString = decodeURIComponent(payload);
        } catch {
          svgString = payload;
        }
      }
    } catch (err) {
      return {
        ok: false,
        error: { code: "DATA_URL_DECODE_FAILED", details: err.message },
      };
    }
    const buffer = Buffer.from(svgString, "utf8");
    const kind = classifyArtifactKind(buffer);
    return {
      ok: true,
      source: "inline",
      kind,
      buffer,
      svgString: kind === "svg" ? svgString : null,
    };
  }

  // 5) Raw "<svg" or "<?xml" string — classify by bytes to keep the contract
  //    consistent across resolver branches.
  const trimmedHead = artifactPath.replace(/^﻿/, "").trimStart();
  if (trimmedHead.startsWith("<svg") || trimmedHead.startsWith("<?xml")) {
    const buffer = Buffer.from(artifactPath, "utf8");
    const kind = classifyArtifactKind(buffer);
    return {
      ok: true,
      source: "inline",
      kind,
      buffer,
      svgString: kind === "svg" ? artifactPath : null,
    };
  }

  return { ok: false, error: { code: "UNSUPPORTED_ARTIFACT_PATH" } };
}

// Resolve a durable artifact reference via the storage adapter. Used when
// the client sends `artifactRef: { packageId, kind: "a1-sheet-svg" }` instead
// of a filesystem path. Survives Vercel cold-start / cross-instance reads as
// long as the adapter is durable (filesystem/S3); the in-memory adapter is
// fine for dev/tests but won't outlive a process boundary.
async function readArtifactBytesFromRef(artifactRef) {
  if (!artifactRef || typeof artifactRef !== "object") {
    return { ok: false, error: { code: "INVALID_ARTIFACT_REF" } };
  }
  const packageId = String(artifactRef.packageId || "").trim();
  const refKind = String(artifactRef.kind || "").trim();
  if (!packageId || !refKind) {
    return { ok: false, error: { code: "INVALID_ARTIFACT_REF" } };
  }
  const { getDefaultArtifactStorageAdapter } = await loadArtifactStorage();
  const adapter = getDefaultArtifactStorageAdapter();
  if (typeof adapter?.getBlobArtifact !== "function") {
    return {
      ok: false,
      error: {
        code: "ARTIFACT_REF_ADAPTER_UNSUPPORTED",
        details: "Default storage adapter does not implement getBlobArtifact.",
      },
    };
  }
  const result = await adapter.getBlobArtifact({ packageId, kind: refKind });
  if (!result?.found) {
    return { ok: false, error: { code: "ARTIFACT_NOT_FOUND" } };
  }
  const buffer = Buffer.isBuffer(result.bytes)
    ? result.bytes
    : Buffer.from(result.bytes);
  // Classify by magic bytes only. The adapter's declared `contentType` is
  // advisory and untrusted: a stored object labelled `image/png` that
  // actually contains HTML/SVG bytes must be flagged as `unknown`, not
  // coerced into the labelled kind. Per-format dispatch then returns a
  // clean 400 instead of silently rasterising HTML or shipping SVG-as-PNG.
  const kind = classifyArtifactKind(buffer);
  return {
    ok: true,
    source: "blob",
    kind,
    buffer,
    svgString: kind === "svg" ? buffer.toString("utf8") : null,
    contentType: result.contentType || null,
    storageKey: result.storageKey || null,
    adapter: result.adapter || null,
  };
}

async function rasterizeSvgToPng(svgString) {
  const sharp = await loadSharp();
  const buf = Buffer.from(svgString, "utf8");
  // White-background flatten removes any alpha that survives the SVG render
  // (e.g. translucent panel fills) so the resulting A1 PNG matches the
  // print-ready white-paper expectation before pdf-lib embeds it.
  return sharp(buf, { density: FINAL_A1_PDF_DPI })
    .resize(A1_PNG_WIDTH, A1_PNG_HEIGHT, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function buildVectorPdf(svgString, geometryHash) {
  const { buildVectorPdfFromSheetSvg } = await loadVectorPdfBuilder();
  return buildVectorPdfFromSheetSvg({ svgString, geometryHash });
}

/**
 * Read the actual pixel dimensions of a PNG via sharp metadata. Used to feed
 * `buildPrintReadyPdfFromPng` real (widthPx, heightPx) so the final-A1
 * density gate (FINAL_A1_PDF_MIN_RATIO * FINAL_A1_PDF_MIN_DPI) refuses
 * preview-density rasters rather than passing them through under a hardcoded
 * 9933x7016 label.
 */
async function readPngDimensions(pngBuffer) {
  const sharp = await loadSharp();
  const meta = await sharp(pngBuffer).metadata();
  const widthPx = Number(meta?.width);
  const heightPx = Number(meta?.height);
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    throw new Error("Could not read PNG dimensions for final-A1 density gate.");
  }
  return { widthPx, heightPx };
}

/**
 * Build a print-ready A1 PDF from a PNG that already exists on disk / from a
 * caller-supplied buffer. The dimensions are derived from the PNG metadata
 * itself, NOT from the route's A1 target size — a 1024×768 preview PNG must
 * surface as 422 FINAL_A1_RASTER_TOO_SMALL, not get re-labelled as 9933×7016.
 */
async function buildPrintReadyPdfFromPngBuffer(pngBuffer) {
  const composeRuntime = await loadComposeRuntime();
  const { widthPx, heightPx } = await readPngDimensions(pngBuffer);
  return composeRuntime.buildPrintReadyPdfFromPng(pngBuffer, {
    widthPx,
    heightPx,
    dpi: FINAL_A1_PDF_DPI,
    textRenderMode: "font_paths",
    rasterIntegrityStatus: "not_run",
    isFinalA1: true,
  });
}

/**
 * Variant used only by the SVG → raster PDF fallback path. The route has just
 * rasterised the source SVG to A1_PNG_WIDTH×A1_PNG_HEIGHT at 300 DPI, so we
 * KNOW the dimensions — we don't need to ask sharp again. Kept as a separate
 * function to make the contract obvious to reviewers: ONLY this path passes
 * the hardcoded A1 dimensions, because we are the ones who produced them.
 */
async function buildPrintReadyPdfFromOwnRasteredPng(pngBuffer) {
  const composeRuntime = await loadComposeRuntime();
  return composeRuntime.buildPrintReadyPdfFromPng(pngBuffer, {
    widthPx: A1_PNG_WIDTH,
    heightPx: A1_PNG_HEIGHT,
    dpi: FINAL_A1_PDF_DPI,
    textRenderMode: "font_paths",
    rasterIntegrityStatus: "not_run",
    isFinalA1: true,
  });
}

function setBinaryHeaders(
  res,
  { mimeType, filename, bytesLength, builderPath },
) {
  const encoded = encodeURIComponent(filename);
  res.setHeader("Content-Type", mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
  );
  res.setHeader("Content-Length", String(bytesLength));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-A1-Export-Builder", builderPath);
}

function logSuccess(entry) {
  try {
    console.log("[a1/export]", JSON.stringify(entry));
  } catch {
    /* never throw from logging */
  }
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return jsonError(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");
  }

  const startedAt = Date.now();
  let body = req.body;
  if (body && typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return jsonError(res, 400, "BODY_NOT_JSON", "Request body is not JSON.");
    }
  }
  body = body && typeof body === "object" ? body : {};

  // Handler-level size guard so behaviour is identical in dev (Express's
  // 50mb json limit) and on Vercel.
  let bodyBytes;
  try {
    bodyBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    bodyBytes = REQUEST_BODY_MAX_BYTES + 1;
  }
  if (bodyBytes > REQUEST_BODY_MAX_BYTES) {
    return jsonError(
      res,
      413,
      "EXPORT_BODY_TOO_LARGE",
      "Request body exceeds 256 KB. Use a file-transport artifactPath instead of an inline data URL.",
      { bodyBytes, maxBytes: REQUEST_BODY_MAX_BYTES },
    );
  }

  const designId = typeof body.designId === "string" ? body.designId : "";
  const formatRaw =
    typeof body.format === "string" ? body.format.toLowerCase() : "";
  const sheetHash = typeof body.sheetHash === "string" ? body.sheetHash : null;
  const projectName =
    typeof body.projectName === "string" ? body.projectName : "";
  const artifactPath =
    typeof body.artifactPath === "string" ? body.artifactPath : "";
  const pdfArtifactPath =
    typeof body.pdfArtifactPath === "string" ? body.pdfArtifactPath : "";
  const artifactRef =
    body && typeof body.artifactRef === "object" && body.artifactRef
      ? body.artifactRef
      : null;
  // Codex audit response: server-side degraded enforcement mirrors the
  // exportService refusal so a programmatic caller cannot bypass the
  // client-side gate. When the request flags `degradedExport: true`:
  //   - PNG/SVG refuse outright (no watermarked variants on this branch).
  //   - PDF requires a pre-built stamped PDF (pdfArtifactPath); fallback
  //     paths that build a PDF from SVG/PNG are disallowed because they
  //     would emit unstamped output.
  const degradedExport = body && body.degradedExport === true;

  if (!designId) {
    return jsonError(res, 400, "DESIGN_ID_REQUIRED", "Missing designId.");
  }
  if (formatRaw !== "png" && formatRaw !== "pdf" && formatRaw !== "svg") {
    return jsonError(
      res,
      400,
      "UNSUPPORTED_FORMAT",
      "format must be one of: png, pdf, svg.",
    );
  }
  if (degradedExport && (formatRaw === "png" || formatRaw === "svg")) {
    return jsonError(
      res,
      400,
      "DEGRADED_SHEET_NO_STAMPED_VARIANT",
      `A1 export degraded — ${formatRaw.toUpperCase()} cannot ship without a watermarked variant. ` +
        "Request the PDF export (carries the PRELIMINARY stamp) or fix the " +
        "readability/graphic blockers and re-run.",
    );
  }
  if (degradedExport && formatRaw === "pdf" && !pdfArtifactPath) {
    return jsonError(
      res,
      400,
      "DEGRADED_PDF_REQUIRES_STAMPED_ARTIFACT",
      "A1 export degraded — pdfArtifactPath (pre-built stamped PDF) is required. " +
        "Unstamped SVG-derived or PNG-derived fallback PDFs are not permitted in degraded mode.",
    );
  }
  if (!artifactPath && !pdfArtifactPath && !artifactRef) {
    return jsonError(
      res,
      400,
      "ARTIFACT_PATH_REQUIRED",
      "Provide artifactPath, pdfArtifactPath or artifactRef.",
    );
  }

  const composeRuntime = await loadComposeRuntime();
  const outputDir = resolveOutputDirSafe(composeRuntime);

  // For PDF output, prefer pdfArtifactPath (a pre-built print-ready PDF on
  // disk) over rasterising on the fly. Falls through to artifactPath when
  // unset or unresolvable — UNLESS the request is degraded, in which case
  // the stamped pre-built PDF is the ONLY permitted path (Codex audit
  // response: unstamped fallback PDFs would leak past the watermark).
  if (formatRaw === "pdf" && pdfArtifactPath) {
    const pdfRead = readArtifactBytes(pdfArtifactPath, outputDir);
    if (pdfRead.ok && pdfRead.kind === "pdf") {
      const filename = safeFilename(designId, projectName, "pdf");
      setBinaryHeaders(res, {
        mimeType: "application/pdf",
        filename,
        bytesLength: pdfRead.buffer.length,
        builderPath: "passthrough",
      });
      res.end(pdfRead.buffer);
      logSuccess({
        route: "a1/export",
        designId,
        format: "pdf",
        sourceKind: "pdf",
        builderPath: "passthrough",
        sheetHash,
        bytesOut: pdfRead.buffer.length,
        durationMs: Date.now() - startedAt,
      });
      return;
    }
    if (degradedExport) {
      const detail =
        pdfRead.error?.details ||
        pdfRead.error?.code ||
        "pdfArtifactPath did not resolve to a readable PDF.";
      return jsonError(
        res,
        400,
        "DEGRADED_PDF_REQUIRES_STAMPED_ARTIFACT",
        `A1 export degraded — pre-built stamped PDF was unreadable (${detail}). ` +
          "Unstamped fallback PDFs (SVG→PDF / PNG→PDF) are not permitted in degraded mode.",
      );
    }
    // Fall through to artifactPath logic.
  }

  let read;
  if (artifactRef) {
    read = await readArtifactBytesFromRef(artifactRef);
  } else {
    read = readArtifactBytes(artifactPath, outputDir);
  }
  if (!read.ok) {
    const code = read.error?.code || "ARTIFACT_READ_FAILED";
    const status =
      code === "ARTIFACT_NOT_FOUND"
        ? 404
        : code === "UNSUPPORTED_ARTIFACT_PATH" ||
            code === "INVALID_ARTIFACT_NAME" ||
            code === "ARTIFACT_PATH_TRAVERSAL" ||
            code === "ARTIFACT_PATH_REQUIRED" ||
            code === "INVALID_ARTIFACT_REF" ||
            code === "ARTIFACT_REF_ADAPTER_UNSUPPORTED" ||
            code === "DATA_URL_EMPTY_PAYLOAD" ||
            code === "DATA_URL_UNSUPPORTED_ENCODING" ||
            code === "DATA_URL_DECODE_FAILED"
          ? 400
          : 500;
    return jsonError(res, status, code, read.error?.details || code);
  }

  // SVG sanitisation runs on every SVG source — inline, file-transport, OR
  // adapter-backed durable blob. File-transport / blob SVGs were generated by
  // our own pipeline, but defense-in-depth keeps a compromised upstream from
  // routing dangerous SVG content (e.g. `<script>`, external `xlink:href`)
  // back through the export route. The error code distinguishes the two
  // paths so reviewers / dashboards can tell a malicious upload (inline)
  // from a corrupted stored artifact (file / blob).
  if (read.kind === "svg") {
    const sanitised = sanitizeInlineSvg(read.svgString);
    if (!sanitised.ok) {
      const code =
        read.source === "inline" ? "INLINE_SVG_BLOCKED" : "STORED_SVG_BLOCKED";
      const where = read.source === "inline" ? "Inline" : "Stored";
      return jsonError(
        res,
        400,
        code,
        `${where} SVG rejected: contains "${sanitised.blockedToken}".`,
      );
    }
  }

  if (read.kind === "unknown") {
    return jsonError(
      res,
      400,
      "UNRECOGNISED_ARTIFACT_FORMAT",
      "Could not classify artifact bytes as png, pdf or svg.",
    );
  }

  try {
    if (formatRaw === "png") {
      if (read.kind === "png") {
        const filename = safeFilename(designId, projectName, "png");
        setBinaryHeaders(res, {
          mimeType: "image/png",
          filename,
          bytesLength: read.buffer.length,
          builderPath: "passthrough",
        });
        res.end(read.buffer);
        logSuccess({
          route: "a1/export",
          designId,
          format: "png",
          sourceKind: "png",
          builderPath: "passthrough",
          sheetHash,
          bytesOut: read.buffer.length,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      if (read.kind === "svg") {
        const pngBuffer = await rasterizeSvgToPng(read.svgString);
        const filename = safeFilename(designId, projectName, "png");
        setBinaryHeaders(res, {
          mimeType: "image/png",
          filename,
          bytesLength: pngBuffer.length,
          builderPath: "sharp_svg_to_png",
        });
        res.end(pngBuffer);
        logSuccess({
          route: "a1/export",
          designId,
          format: "png",
          sourceKind: "svg",
          builderPath: "sharp_svg_to_png",
          sheetHash,
          bytesOut: pngBuffer.length,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      return jsonError(
        res,
        400,
        "INVALID_INPUT",
        "Cannot produce PNG from a PDF source.",
      );
    }

    if (formatRaw === "svg") {
      if (read.kind !== "svg") {
        return jsonError(
          res,
          400,
          "INVALID_INPUT",
          "Cannot produce SVG from a raster source.",
        );
      }
      const svgBytes = Buffer.from(read.svgString, "utf8");
      const filename = safeFilename(designId, projectName, "svg");
      setBinaryHeaders(res, {
        mimeType: "image/svg+xml; charset=utf-8",
        filename,
        bytesLength: svgBytes.length,
        builderPath: "passthrough",
      });
      res.end(svgBytes);
      logSuccess({
        route: "a1/export",
        designId,
        format: "svg",
        sourceKind: "svg",
        builderPath: "passthrough",
        sheetHash,
        bytesOut: svgBytes.length,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    if (formatRaw === "pdf") {
      if (read.kind === "pdf") {
        const filename = safeFilename(designId, projectName, "pdf");
        setBinaryHeaders(res, {
          mimeType: "application/pdf",
          filename,
          bytesLength: read.buffer.length,
          builderPath: "passthrough",
        });
        res.end(read.buffer);
        logSuccess({
          route: "a1/export",
          designId,
          format: "pdf",
          sourceKind: "pdf",
          builderPath: "passthrough",
          sheetHash,
          bytesOut: read.buffer.length,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      if (read.kind === "svg") {
        const vector = await buildVectorPdf(read.svgString, sheetHash);
        if (vector && vector.ok && Buffer.isBuffer(vector.pdfBytes)) {
          const filename = safeFilename(designId, projectName, "pdf");
          setBinaryHeaders(res, {
            mimeType: "application/pdf",
            filename,
            bytesLength: vector.pdfBytes.length,
            builderPath: "vector_pdf",
          });
          res.end(vector.pdfBytes);
          logSuccess({
            route: "a1/export",
            designId,
            format: "pdf",
            sourceKind: "svg",
            builderPath: "vector_pdf",
            sheetHash,
            bytesOut: vector.pdfBytes.length,
            durationMs: Date.now() - startedAt,
          });
          return;
        }
        // Vector builder soft-failed; fall back to raster PDF. Honour
        // buildPrintReadyPdfFromPng's final-A1 density rules — a too-small
        // raster must surface 422 rather than fabricate a fake "final" PDF.
        let pngBuffer;
        try {
          pngBuffer = await rasterizeSvgToPng(read.svgString);
        } catch (err) {
          return jsonError(
            res,
            500,
            "SVG_RASTERIZE_FAILED",
            err?.message || "Could not rasterise SVG for PDF fallback.",
            { vectorError: vector?.error || null },
          );
        }
        try {
          // SVG raster fallback: we just produced this PNG at the A1
          // dimensions, so we may pass them as-is. PNG-source callers below
          // must read dimensions from the buffer itself.
          const { pdfBuffer } =
            await buildPrintReadyPdfFromOwnRasteredPng(pngBuffer);
          const filename = safeFilename(designId, projectName, "pdf");
          setBinaryHeaders(res, {
            mimeType: "application/pdf",
            filename,
            bytesLength: pdfBuffer.length,
            builderPath: "raster_pdf_fallback",
          });
          res.end(pdfBuffer);
          logSuccess({
            route: "a1/export",
            designId,
            format: "pdf",
            sourceKind: "svg",
            builderPath: "raster_pdf_fallback",
            vectorError: vector?.error || null,
            sheetHash,
            bytesOut: pdfBuffer.length,
            durationMs: Date.now() - startedAt,
          });
          return;
        } catch (err) {
          return jsonError(
            res,
            422,
            "FINAL_A1_RASTER_TOO_SMALL",
            err?.message ||
              "Raster fallback refused — source is below the final-A1 density gate.",
            { vectorError: vector?.error || null },
          );
        }
      }
      if (read.kind === "png") {
        try {
          // PNG-source path reads (widthPx, heightPx) from sharp metadata so
          // a preview-density input gets 422'd, not silently re-labelled as
          // a 300 DPI A1 raster.
          const { pdfBuffer } = await buildPrintReadyPdfFromPngBuffer(
            read.buffer,
          );
          const filename = safeFilename(designId, projectName, "pdf");
          setBinaryHeaders(res, {
            mimeType: "application/pdf",
            filename,
            bytesLength: pdfBuffer.length,
            builderPath: "raster_pdf_from_png",
          });
          res.end(pdfBuffer);
          logSuccess({
            route: "a1/export",
            designId,
            format: "pdf",
            sourceKind: "png",
            builderPath: "raster_pdf_from_png",
            sheetHash,
            bytesOut: pdfBuffer.length,
            durationMs: Date.now() - startedAt,
          });
          return;
        } catch (err) {
          return jsonError(
            res,
            422,
            "FINAL_A1_RASTER_TOO_SMALL",
            err?.message || "PNG source rejected by final-A1 density gate.",
          );
        }
      }
      return jsonError(
        res,
        400,
        "INVALID_INPUT",
        "Could not derive PDF from artifact source.",
      );
    }

    // Defensive fallthrough — should be unreachable due to earlier validation.
    return jsonError(res, 500, "INTERNAL_ERROR", "Unhandled export branch.");
  } catch (err) {
    return jsonError(
      res,
      500,
      "EXPORT_INTERNAL_ERROR",
      err?.message || "Export failed.",
    );
  }
}

export const __testing = Object.freeze({
  REQUEST_BODY_MAX_BYTES,
  SAFE_NAME,
  PUBLIC_URL_BASE_DEFAULT,
  classifyArtifactKind,
  sanitizeInlineSvg,
  readArtifactBytes,
  readArtifactBytesFromRef,
  resolveLocalArtifactPath,
  safeFilename,
  looksLikeSvgString,
  PUBLIC_URL_BASE: PUBLIC_URL_BASE_DEFAULT,
  PNG_SIGNATURE,
  PDF_SIGNATURE,
  UTF8_BOM,
  INLINE_SVG_DENY_TOKENS,
});
