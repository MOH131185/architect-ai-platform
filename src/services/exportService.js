/**
 * Export Service
 *
 * Centralizes all export-related logic:
 * - A1 sheet export (PNG, PDF, SVG)
 * - CAD/BIM export (DWG, RVT, IFC)
 * - PDF documentation
 * - File download triggering
 *
 * Server-aware: Can call serverless functions or perform client-side export.
 */

import logger from "../utils/logger.js";

// Browser-safe basename helper. Do NOT import Node's `path` here — this module
// is bundled into the wizard React app and runs in the browser. Handles both
// POSIX and Windows-shaped strings (compose-output filenames may surface as
// either depending on host OS) plus optional query/hash suffixes.
export function basenameFromPath(p) {
  if (typeof p !== "string" || p.length === 0) return "";
  const lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  const name = lastSlash >= 0 ? p.slice(lastSlash + 1) : p;
  return name.split(/[?#]/)[0];
}

const SAFE_BASENAME = /^[a-zA-Z0-9._-]+\.(png|pdf|svg)$/;
export function isSafeArtifactBasename(name) {
  return typeof name === "string" && SAFE_BASENAME.test(name);
}

// Hard ceiling for the request body to `/api/a1/export`. The server enforces
// the same cap; the client refuses early so we never round-trip a multi-MB
// data URL across JSON.
export const EXPORT_REQUEST_INLINE_BUDGET_BYTES = 220 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46];

async function readBlobHeader(blob, n) {
  // jsdom older builds don't fully implement Blob.prototype.slice().arrayBuffer();
  // fall back to reading the whole blob and slicing the resulting Uint8Array.
  // For real browser blobs the cost is identical because both paths just hit
  // the underlying byte storage.
  let buffer;
  if (typeof blob.arrayBuffer === "function") {
    buffer = await blob.arrayBuffer();
  } else {
    // Final fallback for environments missing both .slice().arrayBuffer() and
    // top-level .arrayBuffer() — wrap via Response which jsdom supports.
    buffer = await new Response(blob).arrayBuffer();
  }
  return new Uint8Array(buffer).slice(0, n);
}

export async function validatePngMagicBytes(blob) {
  if (!blob || typeof blob.size !== "number") {
    throw new Error("PNG export aborted: no response blob.");
  }
  if (blob.size === 0) {
    throw new Error("PNG export aborted: empty response body.");
  }
  const head = await readBlobHeader(blob, PNG_SIGNATURE.length);
  if (!PNG_SIGNATURE.every((b, i) => head[i] === b)) {
    throw new Error(
      "PNG export aborted: payload does not start with PNG signature (89 50 4E 47 0D 0A 1A 0A).",
    );
  }
}

export async function validatePdfMagicBytes(blob) {
  if (!blob || typeof blob.size !== "number") {
    throw new Error("PDF export aborted: no response blob.");
  }
  if (blob.size === 0) {
    throw new Error("PDF export aborted: empty response body.");
  }
  const head = await readBlobHeader(blob, PDF_SIGNATURE.length);
  if (!PDF_SIGNATURE.every((b, i) => head[i] === b)) {
    throw new Error("PDF export aborted: payload does not start with %PDF.");
  }
}

// Byte-level prefix match. All target prefixes ("<svg", "<?xml") and the
// UTF-8 BOM are ASCII / fixed byte sequences, so we don't need TextDecoder
// (which is absent under CRA's older jsdom test runtime).
const SVG_PREFIX_BYTES = [0x3c, 0x73, 0x76, 0x67]; // "<svg"
const XML_PREFIX_BYTES = [0x3c, 0x3f, 0x78, 0x6d, 0x6c]; // "<?xml"
const UTF8_BOM_BYTES = [0xef, 0xbb, 0xbf];

function bytesStartWith(bytes, prefix, offset = 0) {
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function skipUtf8Whitespace(bytes, start) {
  let i = start;
  // Skip ASCII whitespace: space (0x20), tab (0x09), LF (0x0a), CR (0x0d).
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 ||
      bytes[i] === 0x09 ||
      bytes[i] === 0x0a ||
      bytes[i] === 0x0d)
  ) {
    i++;
  }
  return i;
}

export async function validateSvgMagicBytes(blob) {
  if (!blob || typeof blob.size !== "number") {
    throw new Error("SVG export aborted: no response blob.");
  }
  if (blob.size === 0) {
    throw new Error("SVG export aborted: empty response body.");
  }
  const headBuf = await readBlobHeader(blob, 512);
  let cursor = bytesStartWith(headBuf, UTF8_BOM_BYTES)
    ? UTF8_BOM_BYTES.length
    : 0;
  cursor = skipUtf8Whitespace(headBuf, cursor);
  if (
    !bytesStartWith(headBuf, SVG_PREFIX_BYTES, cursor) &&
    !bytesStartWith(headBuf, XML_PREFIX_BYTES, cursor)
  ) {
    throw new Error(
      "SVG export aborted: payload does not begin with <svg or <?xml.",
    );
  }
}

function magicByteValidatorFor(format) {
  switch (String(format || "").toLowerCase()) {
    case "png":
      return validatePngMagicBytes;
    case "pdf":
      return validatePdfMagicBytes;
    case "svg":
      return validateSvgMagicBytes;
    default:
      throw new Error(
        `Unsupported export format for magic-byte check: ${format}`,
      );
  }
}

/**
 * Resolve a compact durable reference the new /api/a1/export route can
 * consume — preferred over `artifactPath` because it survives Vercel cold-
 * start / cross-instance reads. Returns `null` when the slice did not file
 * a durable blob (caller falls back to `resolveExportArtifactPath`).
 */
export function resolveExportArtifactRef(sheet) {
  const a1Sheet = sheet?.artifacts?.a1Sheet || sheet?.a1Sheet || {};
  const ref = a1Sheet?.svgArtifactRef;
  if (!ref || typeof ref !== "object") return null;
  if (ref.available === false) return null;
  if (typeof ref.packageId !== "string" || ref.packageId.length === 0) {
    return null;
  }
  if (typeof ref.kind !== "string" || ref.kind.length === 0) {
    return null;
  }
  return {
    packageId: ref.packageId,
    kind: ref.kind,
  };
}

/**
 * Resolve a compact artifactPath the new /api/a1/export route can consume.
 *
 * Priority:
 *   1. metadata.svgOutputFile (preferred for SVG-master sheets persisted by
 *      api/project/generate-vertical-slice).
 *   2. artifacts.a1Sheet.svgOutputFile / svgUrl (slice service surface).
 *   3. metadata.outputFile with transport === "file" (legacy compose PNG).
 *   4. sheet.url when it is a `data:` URL under EXPORT_REQUEST_INLINE_BUDGET_BYTES.
 *   5. null — caller throws a clear error so we never POST a multi-MB body.
 */
export function resolveExportArtifactPath(sheet, { format } = {}) {
  const meta = sheet?.metadata || {};
  const a1Sheet = sheet?.artifacts?.a1Sheet || sheet?.a1Sheet || {};

  // Prefer SVG file-transport when present (most reliable post Phase 1).
  if (typeof meta.svgOutputFile === "string" && meta.svgOutputFile) {
    const name = basenameFromPath(meta.svgOutputFile);
    if (isSafeArtifactBasename(name)) {
      return `/api/a1/compose-output/${name}`;
    }
  }
  if (typeof a1Sheet.svgOutputFile === "string" && a1Sheet.svgOutputFile) {
    const name = basenameFromPath(a1Sheet.svgOutputFile);
    if (isSafeArtifactBasename(name)) {
      return `/api/a1/compose-output/${name}`;
    }
  }
  if (
    typeof a1Sheet.svgUrl === "string" &&
    a1Sheet.svgUrl.startsWith("/api/a1/compose-output/")
  ) {
    const name = basenameFromPath(a1Sheet.svgUrl);
    if (isSafeArtifactBasename(name)) {
      return `/api/a1/compose-output/${name}`;
    }
  }

  // Legacy PNG file-transport (V2 multi-panel pipeline).
  if (
    meta.transport === "file" &&
    typeof meta.outputFile === "string" &&
    meta.outputFile
  ) {
    const name = basenameFromPath(meta.outputFile);
    if (isSafeArtifactBasename(name)) {
      return `/api/a1/compose-output/${name}`;
    }
  }

  // Pre-built PDF reference, used only by exportAsPDF passthrough.
  if (
    format === "pdf" &&
    typeof meta.pdfOutputFile === "string" &&
    meta.pdfOutputFile
  ) {
    const name = basenameFromPath(meta.pdfOutputFile);
    if (isSafeArtifactBasename(name)) {
      return `/api/a1/compose-output/${name}`;
    }
  }

  // Direct compose-output reference exposed as `sheet.url`. This happens when
  // the V2 multi-panel pipeline writes the PNG to disk and surfaces the path
  // as the viewer URL (not as `metadata.outputFile`). Goes BEFORE the data
  // URL fallback so a same-instance file reference is always preferred over
  // re-uploading bytes.
  if (
    typeof sheet?.url === "string" &&
    sheet.url.startsWith("/api/a1/compose-output/")
  ) {
    const name = basenameFromPath(sheet.url);
    if (isSafeArtifactBasename(name)) {
      return `/api/a1/compose-output/${name}`;
    }
  }

  // Inline data URL fallback — only when small enough to fit the request cap.
  if (typeof sheet?.url === "string" && sheet.url.startsWith("data:")) {
    if (sheet.url.length <= EXPORT_REQUEST_INLINE_BUDGET_BYTES) {
      return sheet.url;
    }
  }

  return null;
}

export function resolvePdfArtifactPath(sheet) {
  const meta = sheet?.metadata || {};
  if (typeof meta.pdfOutputFile === "string" && meta.pdfOutputFile) {
    const name = basenameFromPath(meta.pdfOutputFile);
    if (isSafeArtifactBasename(name)) {
      return `/api/a1/compose-output/${name}`;
    }
  }
  if (typeof sheet?.pdfUrl === "string") {
    if (sheet.pdfUrl.startsWith("/api/a1/compose-output/")) {
      const name = basenameFromPath(sheet.pdfUrl);
      if (isSafeArtifactBasename(name)) {
        return `/api/a1/compose-output/${name}`;
      }
    }
    if (
      sheet.pdfUrl.startsWith("data:application/pdf") &&
      sheet.pdfUrl.length <= EXPORT_REQUEST_INLINE_BUDGET_BYTES
    ) {
      return sheet.pdfUrl;
    }
  }
  return null;
}

/**
 * Export Service
 */
class ExportService {
  constructor(env = null) {
    this.env = env;
  }

  resolveCompiledProject(sheet = {}) {
    return (
      sheet?.compiledProject ||
      sheet?.a1Sheet?.compiledProject ||
      sheet?.metadata?.compiledProject ||
      null
    );
  }

  // Phase 2 audit response (Codex blocker 2): infer structural/MEP
  // discipline flags from a generated sheet so /api/project/export/dxf
  // and /api/project/export/ifc honour the same discipline intent the
  // sheet was generated with. Without this, the server falls back to
  // env defaults — a generation that asked for arch-only still gets
  // S-/E-/P-/M- layers and IfcColumn/IfcBeam when env is the production
  // default true. Returns explicit `true` / `false` only when we have a
  // signal; `null` lets the route fall through to its own (env-driven)
  // default, preserving back-compat for pre-Phase-2 history records.
  resolveDrawingDisciplineFlags(sheet = {}) {
    const compiled = this.resolveCompiledProject(sheet) || {};
    const meta = sheet?.metadata || {};
    const fromAny = (...candidates) => {
      for (const value of candidates) {
        if (value === true || value === false) return value;
      }
      return null;
    };
    const drawingTypes = new Set();
    const drawingSet =
      sheet?.drawingSet ||
      sheet?.artifacts?.drawingSet ||
      meta?.drawingSet ||
      compiled?.drawingSet ||
      null;
    for (const drawing of drawingSet?.drawings || []) {
      if (typeof drawing?.type === "string") drawingTypes.add(drawing.type);
    }
    const structural = fromAny(
      sheet?.structuralDrawingsEnabled,
      meta?.structuralDrawingsEnabled,
      compiled?.structuralDrawingsEnabled,
      drawingTypes.has("structural") ? true : null,
      compiled?.structuralModel ? true : null,
    );
    const mep = fromAny(
      sheet?.mepDrawingsEnabled,
      meta?.mepDrawingsEnabled,
      compiled?.mepDrawingsEnabled,
      drawingTypes.has("mep") ? true : null,
      compiled?.mepModel ? true : null,
    );
    return { structural, mep };
  }

  resolveProjectQuantityTakeoff(sheet = {}) {
    return (
      sheet?.projectQuantityTakeoff ||
      sheet?.a1Sheet?.projectQuantityTakeoff ||
      sheet?.metadata?.projectQuantityTakeoff ||
      null
    );
  }

  resolveSheetArtifactManifest(sheet = {}) {
    return (
      sheet?.sheetArtifactManifest ||
      sheet?.a1Sheet?.sheetArtifactManifest ||
      sheet?.metadata?.sheetArtifactManifest ||
      null
    );
  }

  resolveDesignMetadata(sheet = {}) {
    const metadata = sheet?.metadata || {};
    return {
      projectId:
        sheet?.projectId || sheet?.project_id || metadata?.projectId || null,
      projectGraphId:
        sheet?.projectGraphId ||
        sheet?.projectGraph?.project_id ||
        metadata?.projectGraphId ||
        null,
      visualManifestHash:
        sheet?.visualManifestHash ||
        sheet?.artifacts?.visualManifestHash ||
        metadata?.visualManifestHash ||
        null,
      styleBlendManifestHash:
        sheet?.styleBlendManifestHash ||
        sheet?.artifacts?.styleBlendManifestHash ||
        metadata?.styleBlendManifestHash ||
        null,
      jurisdictionPack:
        metadata?.jurisdictionPack ||
        sheet?.jurisdictionPack ||
        sheet?.artifacts?.jurisdictionPack ||
        null,
      jurisdictionPackResolution:
        metadata?.jurisdictionPackResolution ||
        sheet?.jurisdictionPackResolution ||
        null,
      countryCode:
        sheet?.countryCode ||
        metadata?.countryCode ||
        sheet?.jurisdictionPack?.countryCode ||
        null,
      region:
        sheet?.region ||
        metadata?.region ||
        sheet?.jurisdictionPack?.region ||
        null,
      exportManifest:
        sheet?.exportManifest ||
        metadata?.exportManifest ||
        sheet?.sheetArtifactManifest?.exportManifest ||
        null,
    };
  }

  resolveQaSummary(sheet = {}) {
    return (
      sheet?.qa || sheet?.metadata?.qa || sheet?.artifacts?.qaReport || null
    );
  }

  resolveProjectName(sheet = {}) {
    return (
      sheet?.projectName ||
      sheet?.brief?.project_name ||
      sheet?.projectGraph?.brief?.project_name ||
      sheet?.metadata?.projectName ||
      sheet?.dna?.projectType ||
      "ArchiAI_Project"
    );
  }

  safeProjectName(value, fallback = "ArchiAI_Project") {
    const cleaned = String(value || fallback)
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return cleaned || fallback;
  }

  filenameFromContentDisposition(headerValue, fallback) {
    const header = String(headerValue || "");
    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
      try {
        return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ""));
      } catch (_error) {
        return utf8Match[1].replace(/^"|"$/g, "") || fallback;
      }
    }
    const filenameMatch = header.match(/filename="?([^";]+)"?/i);
    return filenameMatch?.[1] || fallback;
  }

  async downloadResponseBlob(response, filename) {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return url;
  }

  async readJsonError(response, fallbackMessage) {
    const errorData = await response.json().catch(() => ({}));
    return (
      errorData?.error?.message ||
      errorData?.error ||
      errorData?.message ||
      fallbackMessage
    );
  }

  hasDeliverableArtifacts(sheet = {}) {
    const artifacts = sheet?.artifacts || {};
    const compiledProject = this.resolveCompiledProject(sheet);
    const sheetUrlIsData =
      typeof sheet?.url === "string" && sheet.url.startsWith("data:");
    const sheetPdfUrlIsData =
      typeof sheet?.pdfUrl === "string" && sheet.pdfUrl.startsWith("data:");
    return Boolean(
      compiledProject?.geometryHash ||
      artifacts?.a1Sheet?.svgString ||
      artifacts?.a1Sheet?.svg ||
      artifacts?.a1Pdf?.dataUrl ||
      artifacts?.a1Pdf?.pdfDataUrl ||
      artifacts?.a1Png?.dataUrl ||
      artifacts?.renderedProof?.dataUrl ||
      artifacts?.dxf ||
      artifacts?.drawings ||
      artifacts?.qaReport ||
      sheet?.a1Sheet?.svgString ||
      sheet?.a1Sheet?.svg ||
      sheet?.a1Pdf?.dataUrl ||
      sheet?.a1Pdf?.pdfDataUrl ||
      sheetUrlIsData ||
      sheetPdfUrlIsData,
    );
  }

  buildArtifactPackagePayload(sheet = {}) {
    const artifacts = sheet?.artifacts || {};
    const compiledProject = this.resolveCompiledProject(sheet);
    const sheetUrlPng =
      typeof sheet?.url === "string" && sheet.url.startsWith("data:")
        ? { dataUrl: sheet.url }
        : null;
    const sheetPdfUrl =
      typeof sheet?.pdfUrl === "string" && sheet.pdfUrl.startsWith("data:")
        ? { dataUrl: sheet.pdfUrl }
        : null;
    const flags = {
      structuralEnabled: Boolean(
        sheet?.flags?.structuralEnabled ||
        artifacts?.structuralArtifacts?.length ||
        compiledProject?.structuralModel,
      ),
      mepEnabled: Boolean(
        sheet?.flags?.mepEnabled ||
        artifacts?.mepArtifacts?.length ||
        compiledProject?.mepModel,
      ),
      detailsEnabled: Boolean(
        sheet?.flags?.detailsEnabled ||
        artifacts?.detailArtifacts?.length ||
        compiledProject?.constructionDetailLibrary ||
        compiledProject?.detailLibrary,
      ),
      dwgEnabled: Boolean(sheet?.flags?.dwgEnabled),
      ifcEnabled: Boolean(sheet?.flags?.ifcEnabled),
    };

    return {
      projectName: this.resolveProjectName(sheet),
      projectId:
        sheet?.projectId ||
        sheet?.project_id ||
        sheet?.designId ||
        sheet?.metadata?.projectId ||
        null,
      projectGraphId:
        sheet?.projectGraphId ||
        sheet?.projectGraph?.projectGraphId ||
        sheet?.projectGraph?.project_id ||
        artifacts?.projectGraphId ||
        null,
      userId: sheet?.userId || sheet?.metadata?.userId || null,
      projectGraph: sheet?.projectGraph || null,
      compiledProject,
      geometryHash:
        sheet?.geometryHash ||
        artifacts?.geometryHash ||
        compiledProject?.geometryHash ||
        null,
      visualManifestHash:
        sheet?.visualManifestHash ||
        artifacts?.visualManifestHash ||
        sheet?.visualManifest?.manifestHash ||
        null,
      styleBlendManifestHash:
        sheet?.styleBlendManifestHash ||
        artifacts?.styleBlendManifestHash ||
        sheet?.styleBlendManifest?.manifestHash ||
        null,
      jurisdictionId:
        sheet?.jurisdictionId ||
        sheet?.jurisdictionPack?.jurisdictionId ||
        sheet?.metadata?.jurisdictionId ||
        compiledProject?.jurisdictionId ||
        null,
      countryCode:
        sheet?.countryCode ||
        sheet?.jurisdictionPack?.countryCode ||
        sheet?.metadata?.countryCode ||
        compiledProject?.countryCode ||
        null,
      flags,
      a1Sheet: artifacts?.a1Sheet || sheet?.a1Sheet || null,
      a1Pdf: artifacts?.a1Pdf || sheet?.a1Pdf || sheetPdfUrl,
      a1Png:
        artifacts?.a1Png ||
        artifacts?.renderedProof ||
        sheet?.a1Png ||
        sheetUrlPng,
      dxfArtifact: artifacts?.dxf || sheet?.dxfArtifact || null,
      dwgArtifact: artifacts?.dwg || sheet?.dwgArtifact || null,
      ifcArtifact: artifacts?.ifc || sheet?.ifcArtifact || null,
      technicalDrawings:
        artifacts?.drawings || sheet?.technicalDrawings || null,
      existingArtifacts:
        artifacts?.existingArtifacts || sheet?.existingArtifacts || [],
      structuralArtifacts:
        artifacts?.structuralArtifacts || sheet?.structuralArtifacts || null,
      mepArtifacts: artifacts?.mepArtifacts || sheet?.mepArtifacts || null,
      detailArtifacts:
        artifacts?.detailArtifacts || sheet?.detailArtifacts || null,
      schedulesWorkbook:
        artifacts?.schedulesWorkbook || sheet?.schedulesWorkbook || null,
      qaReport: artifacts?.qaReport || sheet?.qaReport || sheet?.qa || null,
      // Phase 6 — Codex audit blocker #3. Carry the full A1 export QA
      // surface so the handoff orchestrator can collapse it into
      // handoff.json.qa.status and the README's "QA Status" section.
      // Previously the payload dropped it, so "degraded" exports could
      // not propagate through the API → handoff.json was always
      // qa.status:"pass" regardless of reality.
      a1ExportQa:
        sheet?.a1ExportQa ||
        sheet?.metadata?.a1ExportQa ||
        artifacts?.a1ExportQa ||
        null,
      // Phase 3 — also carry costSummary so the handoff disclaimers can
      // surface RATE_CARD_FALLBACK / MISSING_RATES without re-deriving.
      costSummary:
        sheet?.costSummary ||
        sheet?.metadata?.costSummary ||
        artifacts?.costSummary ||
        null,
      // Phase 6 follow-up — pre-resolved DWG capabilities snapshot from
      // the slice. When present, the handoff endpoint can decide DWG vs.
      // DWG_UNAVAILABLE.txt without re-resolving from env on the server.
      dwgConverterCapabilities:
        sheet?.dwgConverterCapabilities ||
        artifacts?.dwgConverterCapabilities ||
        null,
      visualManifest:
        artifacts?.visualManifest || sheet?.visualManifest || null,
      styleBlendManifest:
        artifacts?.styleBlendManifest || sheet?.styleBlendManifest || null,
      jurisdictionPack:
        artifacts?.jurisdictionPack || sheet?.jurisdictionPack || null,
      sourceGaps: sheet?.sourceGaps || [],
      producerVersions: sheet?.producerVersions || {},
    };
  }

  async exportDeliverablesPackage({ sheet }) {
    if (!this.hasDeliverableArtifacts(sheet)) {
      throw new Error("Generate a design before downloading deliverables.");
    }

    // Prefer the pre-baked package the generation request stored on the
    // result. When present, hit the existing GET download endpoint via
    // downloadStoredDeliverablesPackage — no multi-MB POST body, no
    // re-upload of compiledProject / projectGraph / a1Png / a1Pdf.
    const pkg = sheet?.package || sheet?.metadata?.package || null;
    if (pkg?.packageId && (pkg.signedUrl || pkg.downloadRoute)) {
      try {
        return await this.downloadStoredDeliverablesPackage({
          packageRecord: {
            ...pkg,
            projectId:
              pkg.projectId ||
              sheet?.projectId ||
              sheet?.metadata?.projectId ||
              null,
            projectName: this.resolveProjectName(sheet),
          },
        });
      } catch (error) {
        // Surface 404/410 from the prebake route verbatim — the package
        // expired or was evicted and the caller should re-generate.
        // Do NOT silently re-upload the full payload behind the user's
        // back; that would mask the storage drift and burn body limits.
        throw new Error(
          error?.message ||
            "Stored deliverables package unavailable — re-generate the design.",
        );
      }
    }

    // Legacy fallback: no prebake on this sheet (older cached result or
    // a code path that didn't store one). POST the full payload to the
    // direct ZIP route. Server's body limits may reject very large
    // payloads — surface that clearly.
    const payload = this.buildArtifactPackagePayload(sheet);
    const safeName = this.safeProjectName(payload.projectName);
    const fallbackFilename = `${safeName}-deliverables.zip`;
    const response = await fetch("/api/project/export/artifact-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Deliverables ZIP export failed: ${response.status}`,
      );
      throw new Error(message);
    }

    const filename = this.filenameFromContentDisposition(
      response.headers?.get?.("content-disposition"),
      fallbackFilename,
    );
    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Deliverables ZIP export complete", { filename });
    return { success: true, url, filename, format: "ZIP" };
  }

  /**
   * Phase 6 — Track 6 handoff ZIP.
   *
   * Hits the same /api/project/export/artifact-package endpoint as
   * exportDeliverablesPackage but adds `{ handoff: true }` to the body
   * so the handler routes through buildHandoffArtifactPackage. The
   * resulting ZIP includes GLB + DWG (or DWG_UNAVAILABLE.txt) +
   * quantity_takeoff.csv + project_graph.json + handoff.json + README.md
   * on top of the deterministic deliverables.
   *
   * QA gate: refuses to issue the handoff when the A1 export QA is
   * blocked (authority/geometry category). Degraded exports are allowed
   * — the README + handoff.json both surface qa.status:"degraded" so
   * the reviewer is warned but not blocked. This mirrors the policy
   * documented in CLAUDE.md / Phase 1 plan.
   */
  async exportHandoffPackage({ sheet }) {
    if (!this.hasDeliverableArtifacts(sheet)) {
      throw new Error(
        "Generate a design before downloading the handoff package.",
      );
    }
    const a1ExportQa = sheet?.a1ExportQa || sheet?.metadata?.a1ExportQa || null;
    // Phase 6 — Codex audit blocker #2 response. The gate is now:
    //   (a) Any blocker whose category is in the HARD list
    //       (authority / geometry / unknown) → refuse.
    //   (b) `allowed:false` on its own → refuse, even when the blocker
    //       list is empty (legacy unsoftenable hard veto with no
    //       categorised blockers attached).
    //   (c) Readability / graphic categories DO NOT refuse — degraded
    //       exports ship with qa.status:"degraded" + PRELIMINARY stamp.
    if (a1ExportQa) {
      const HANDOFF_HARD_BLOCK_CATEGORIES = new Set([
        "authority",
        "geometry",
        "unknown",
      ]);
      const blockers = Array.isArray(a1ExportQa.blockers)
        ? a1ExportQa.blockers
        : [];
      const hardBlockers = blockers.filter((blocker) =>
        HANDOFF_HARD_BLOCK_CATEGORIES.has(
          String(blocker?.category || "unknown").toLowerCase(),
        ),
      );
      if (hardBlockers.length > 0) {
        const codes = hardBlockers
          .map((b) => `${b.category}/${b.code || "blocker"}`)
          .join(", ");
        throw new Error(
          `Handoff package blocked by hard QA failure(s) [authority/geometry/unknown]: ${codes}.`,
        );
      }
      if (a1ExportQa.allowed === false) {
        throw new Error(
          `Handoff package blocked: A1 export QA reports allowed:false. ${
            blockers.length
              ? `Soft-category blockers: ${blockers
                  .map((b) => `${b.category}/${b.code || "blocker"}`)
                  .join(", ")}.`
              : "No categorised blockers attached; treat as unsoftenable hard veto."
          }`,
        );
      }
    }
    const payload = {
      ...this.buildArtifactPackagePayload(sheet),
      handoff: true,
    };
    const safeName = this.safeProjectName(payload.projectName);
    const fallbackFilename = `${safeName}-handoff.zip`;
    const response = await fetch("/api/project/export/artifact-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Handoff ZIP export failed: ${response.status}`,
      );
      throw new Error(message);
    }
    const filename = this.filenameFromContentDisposition(
      response.headers?.get?.("content-disposition"),
      fallbackFilename,
    );
    const url = await this.downloadResponseBlob(response, filename);
    const qaStatus =
      response.headers?.get?.("x-handoff-qa-status") || "unknown";
    const dwgAvailable =
      response.headers?.get?.("x-handoff-dwg-available") === "true";
    logger.success("Handoff ZIP export complete", {
      filename,
      qaStatus,
      dwgAvailable,
    });
    return {
      success: true,
      url,
      filename,
      format: "HANDOFF",
      qaStatus,
      dwgAvailable,
    };
  }

  buildArtifactPackageReference(sheet = {}) {
    const pkg = sheet?.package || sheet?.metadata?.package || null;
    if (!pkg || !pkg.packageId) return null;
    return {
      packageId: pkg.packageId,
      projectId:
        sheet?.projectId ||
        sheet?.project_id ||
        sheet?.designId ||
        sheet?.metadata?.projectId ||
        null,
      projectName: this.resolveProjectName(sheet),
      userId: sheet?.userId || sheet?.metadata?.userId || null,
    };
  }

  async storeDeliverablesPackage({ sheet, expiresInSeconds } = {}) {
    if (!this.hasDeliverableArtifacts(sheet)) {
      throw new Error("Generate a design before saving deliverables.");
    }

    // Prefer the compact-ref Save when generation pre-baked the package.
    // The client never re-uploads tens of MB of artifact bytes; the server
    // looks up the existing storage entry and records history. Falls back to
    // the legacy full-payload Save if no pre-baked package is on the sheet.
    const ref = this.buildArtifactPackageReference(sheet);
    const body = ref
      ? { ...ref, ...(expiresInSeconds ? { expiresInSeconds } : {}) }
      : (() => {
          const payload = this.buildArtifactPackagePayload(sheet);
          return {
            ...payload,
            ...(expiresInSeconds ? { expiresInSeconds } : {}),
          };
        })();
    const response = await fetch("/api/project/export/artifact-package/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Deliverables package storage failed: ${response.status}`,
      );
      throw new Error(message);
    }

    const result = await response.json();
    logger.success("Deliverables package stored", {
      packageId: result.packageId,
      packageHash: result.packageHash,
    });
    return {
      success: true,
      format: "ZIP",
      ...result,
    };
  }

  async listDeliverablesPackageHistory({ projectId, userId, sheet } = {}) {
    const payload = sheet ? this.buildArtifactPackagePayload(sheet) : {};
    const params = new URLSearchParams();
    const resolvedProjectId = projectId || payload.projectId;
    const resolvedUserId = userId || payload.userId;
    if (resolvedProjectId) params.set("projectId", resolvedProjectId);
    if (resolvedUserId) params.set("userId", resolvedUserId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(
      `/api/project/export/artifact-package/history${suffix}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      // Attach status + structured access code so the UI can distinguish
      // "anonymous user — sign in to view history" (403
      // ARTIFACT_ACCESS_USER_REQUIRED) from a real error (5xx, network).
      // The artifactAccessPolicyService at api/.../history.js returns:
      //   { error: "Artifact package is not accessible", code: "ARTIFACT_ACCESS_*" }
      // readJsonError flattens the message; preserve the code separately so
      // ArtifactHistoryPanel can render a neutral info message instead of a
      // red alert when access is gated by sign-in.
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData?.error?.message ||
        (typeof errorData?.error === "string" ? errorData.error : null) ||
        errorData?.message ||
        `Deliverables package history failed: ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.code = errorData?.code || null;
      throw err;
    }

    return response.json();
  }

  async downloadStoredDeliverablesPackage({ packageRecord }) {
    const downloadUrl =
      packageRecord?.signedUrl ||
      packageRecord?.downloadUrl ||
      packageRecord?.downloadRoute;
    if (!downloadUrl) {
      throw new Error("Stored deliverables package has no download URL.");
    }
    const response = await fetch(downloadUrl, { method: "GET" });
    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Stored deliverables download failed: ${response.status}`,
      );
      throw new Error(message);
    }
    const fallbackFilename = `${this.safeProjectName(
      packageRecord?.projectId || packageRecord?.packageId,
    )}-deliverables.zip`;
    const filename = this.filenameFromContentDisposition(
      response.headers?.get?.("content-disposition"),
      fallbackFilename,
    );
    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Stored deliverables ZIP download complete", { filename });
    return { success: true, url, filename, format: "ZIP" };
  }

  /**
   * Export sheet
   * @param {Object} params - Export parameters
   * @param {SheetResult} params.sheet - Sheet result
   * @param {string} params.format - Format (PNG, PDF, SVG)
   * @param {Object} params.env - Environment adapter
   * @returns {Promise<Object>} Export result { url, filename, format }
   */
  async exportSheet({ sheet, format = "PNG", env = null }) {
    const effectiveEnv = env || this.env;
    const fmt = format.toUpperCase();

    logger.info(
      `Exporting sheet as ${fmt}`,
      { sheetId: sheet.metadata?.sheetId },
      "�x",
    );

    // Phase 3 export-fix: refuse to ship a sheet export when the
    // final-A1 export QA gate flagged the print master as blocked. The
    // UI gate in ExportPanel disables the buttons, but this is the
    // service-layer defence in depth: programmatic callers (and the
    // Save-Package flow during regenerate races) must hit the same
    // error rather than producing a corrupt print artifact. Engineering
    // formats run their own readiness checks and are not gated here.
    //
    // Post-UI-smoke QA-wiring fix: also refuse when `allowed === false`.
    // The slice's buildA1ExportQaFromGate enforces status==="blocked" any
    // time allowed===false, but this predicate stays defensive so any
    // older history record or external caller that constructs a1ExportQa
    // with allowed:false but a non-"blocked" status still hits the gate.
    const SHEET_FORMATS = new Set(["PNG", "PDF", "SVG"]);
    const qa = sheet?.a1ExportQa;
    // Codex audit response: three QA states drive this gate.
    //   - hard-block   : allowed:false OR legacy status:"blocked" without
    //                    degradedExport:true. Sheet exports refuse outright.
    //   - degraded     : degradedExport:true OR status:"degraded". The
    //                    pre-built stamped PDF is the ONLY permitted sheet
    //                    artifact. PNG/SVG refuse (no watermarked variants
    //                    exist on this branch) and PDF refuses if no
    //                    stamped pre-built file is available — defence in
    //                    depth against the server falling back to
    //                    unstamped SVG/PNG-derived PDFs.
    //   - pass/warning : sheet exports proceed normally.
    const sheetExportBlocked =
      qa &&
      (qa.allowed === false ||
        (qa.status === "blocked" && qa.degradedExport !== true));
    const sheetExportDegraded =
      qa &&
      !sheetExportBlocked &&
      (qa.degradedExport === true || qa.status === "degraded");
    if (SHEET_FORMATS.has(fmt) && sheetExportBlocked) {
      const blockerCount = Array.isArray(qa.blockers) ? qa.blockers.length : 0;
      const detail = blockerCount
        ? ` (${blockerCount} blocker${blockerCount === 1 ? "" : "s"})`
        : "";
      throw new Error(
        `A1 export blocked — sheet failed final layout/readability QA${detail}.`,
      );
    }
    if (SHEET_FORMATS.has(fmt) && sheetExportDegraded) {
      if (fmt === "PNG" || fmt === "SVG") {
        throw new Error(
          `A1 export degraded — ${fmt} cannot ship without a watermarked variant. ` +
            "Use the PDF export (carries the PRELIMINARY stamp) or fix the " +
            "readability/graphic blockers and re-run.",
        );
      }
      if (fmt === "PDF") {
        const stampedPdfPath = resolvePdfArtifactPath(sheet);
        if (!stampedPdfPath) {
          throw new Error(
            "A1 export degraded — stamped PDF artifact not available. " +
              "Regenerate the design to produce a watermarked PDF; unstamped " +
              "fallback PDFs are not permitted in degraded mode.",
          );
        }
        // Falls through to the server-side route; the request body below
        // forwards `degradedExport:true` so the API mirrors this refusal
        // even if a malicious caller skips the client-side gate.
      }
    }

    // Route DXF to CAD export path
    if (fmt === "DXF") {
      return this.exportCAD({ sheet, format: "DXF", env: effectiveEnv });
    }

    if (fmt === "JSON") {
      return this.exportJSON({ sheet });
    }

    if (fmt === "IFC" || fmt === "RVT") {
      return this.exportBIM({ sheet, format: fmt, env: effectiveEnv });
    }

    if (fmt === "XLSX" || fmt === "EXCEL") {
      return this.exportWorkbook({ sheet, env: effectiveEnv });
    }

    if (fmt === "GLB") {
      return this.exportGLB({ sheet });
    }

    if (fmt === "ZIP" || fmt === "DELIVERABLES" || fmt === "ARTIFACT_PACKAGE") {
      return this.exportDeliverablesPackage({ sheet, env: effectiveEnv });
    }

    // Phase 6 — Track 6. The handoff ZIP is a superset of the
    // deliverables ZIP: same base artifacts (DXF, IFC, A1 sheets, cost
    // workbook) PLUS GLB, DWG (or DWG_UNAVAILABLE.txt), takeoff CSV,
    // project_graph.json, handoff.json, README.md.
    if (fmt === "HANDOFF" || fmt === "HANDOFF_PACKAGE") {
      return this.exportHandoffPackage({ sheet, env: effectiveEnv });
    }

    // Determine export method based on environment
    const useServerExport =
      effectiveEnv?.env?.isProd || fmt === "PDF" || fmt === "SVG";

    if (useServerExport) {
      return this.exportSheetServerSide({ sheet, format, env: effectiveEnv });
    } else {
      return this.exportSheetClientSide({ sheet, format });
    }
  }

  /**
   * Resolve compact request body for POST /api/a1/export.
   *
   * Transport preference:
   *   1. `artifactRef` — durable adapter reference (survives Vercel cold-
   *      start, same shape as the prebaked artifact-package).
   *   2. `artifactPath` — filesystem compose-output reference (same-instance).
   *   3. Inline `data:` URL when small enough.
   *
   * Throws when none of the above are usable so the UI surfaces a real
   * failure rather than silently downloading SVG bytes saved as `.png`.
   */
  buildA1ExportRequestBody(sheet, format) {
    const fmt = String(format || "").toLowerCase();
    const designId =
      sheet?.metadata?.designId ||
      sheet?.designId ||
      sheet?.projectId ||
      "unknown";
    const sheetHash =
      sheet?.geometryHash ||
      sheet?.metadata?.geometryHash ||
      sheet?.sheetArtifactManifest?.geometryHash ||
      null;
    const projectName = this.resolveProjectName(sheet);

    const artifactRef = resolveExportArtifactRef(sheet);
    const artifactPath = artifactRef
      ? null
      : resolveExportArtifactPath(sheet, { format: fmt });

    if (!artifactRef && !artifactPath) {
      throw new Error(
        "Sheet artifact unavailable for export. Regenerate the design to produce a durable artifact reference, or wait for Phase 2 ephemeral storage.",
      );
    }

    const body = {
      designId,
      format: fmt,
      sheetHash,
      projectName,
    };
    if (artifactRef) {
      body.artifactRef = artifactRef;
    } else {
      body.artifactPath = artifactPath;
    }
    if (fmt === "pdf") {
      const pdfArtifactPath = resolvePdfArtifactPath(sheet);
      if (pdfArtifactPath) {
        body.pdfArtifactPath = pdfArtifactPath;
      }
    }
    // Codex audit response: forward the degraded flag to the server so the
    // /api/a1/export handler can mirror the client refusal — defence in
    // depth in case a programmatic caller bypasses exportService.
    const qa = sheet?.a1ExportQa;
    if (
      qa &&
      (qa.degradedExport === true || qa.status === "degraded") &&
      qa.allowed !== false
    ) {
      body.degradedExport = true;
    }
    return body;
  }

  /**
   * Export sheet server-side via the compact-reference /api/a1/export route.
   * Replaces the legacy /api/sheet POST (which round-tripped multi-MB data
   * URLs through JSON and frequently 413'd in serverless). Validates magic
   * bytes per-format before triggering the browser download.
   *
   * @private
   */
  async exportSheetServerSide({ sheet, format, env }) {
    const fmt = String(format || "").toLowerCase();
    const apiUrl = env?.api?.urls?.a1Export || "/api/a1/export";

    logger.debug("Using compact-reference export", { apiUrl, format: fmt });

    const body = this.buildA1ExportRequestBody(sheet, fmt);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `A1 export failed: HTTP ${response.status}`,
      );
      throw new Error(message);
    }

    const blob = await response.blob();
    const validator = magicByteValidatorFor(fmt);
    await validator(blob);

    const fallbackFilename = this.generateFilename(sheet, fmt);
    const filename = this.filenameFromContentDisposition(
      response.headers?.get?.("Content-Disposition") ||
        response.headers?.get?.("content-disposition"),
      fallbackFilename,
    );
    const builderPath =
      response.headers?.get?.("X-A1-Export-Builder") ||
      response.headers?.get?.("x-a1-export-builder") ||
      null;
    const url = this.triggerBlobDownload(blob, filename);

    logger.success("A1 export complete", {
      url,
      filename,
      format: fmt,
      builderPath,
    });

    return {
      success: true,
      url,
      filename,
      format: format.toUpperCase ? format.toUpperCase() : fmt.toUpperCase(),
      builderPath,
    };
  }

  /**
   * Export sheet client-side
   * @private
   */
  async exportSheetClientSide({ sheet, format }) {
    logger.debug("Using client-side export", { format });

    try {
      if (format === "PNG" || format === "png") {
        return this.exportAsPNG(sheet);
      } else if (format === "PDF" || format === "pdf") {
        // Try server-side first, then fail with helpful message
        throw new Error(
          "PDF export requires server-side processing. Please ensure the Express server is running (npm run server).",
        );
      } else if (format === "SVG" || format === "svg") {
        throw new Error(
          "SVG export is not supported for AI-generated raster images. Use PNG format instead.",
        );
      } else {
        throw new Error(
          `Unsupported format: ${format}. Supported formats: PNG, PDF (server-side only)`,
        );
      }
    } catch (error) {
      logger.error("Client-side export failed", error);
      throw error;
    }
  }

  /**
   * Validate that a Blob obtained for PNG export really is an image.
   * Guards against the silent-corrupt-PNG case where a server error
   * (HTML body, 0-byte response, JSON error envelope) is saved as .png.
   * Throws with a clear message on any failure.
   * @private
   */
  validatePngBlob(blob, contentType) {
    if (!blob || typeof blob.size !== "number") {
      throw new Error("PNG export produced no response body.");
    }
    if (blob.size === 0) {
      throw new Error("PNG export response was empty (0 bytes).");
    }
    const mime = String(contentType || blob.type || "").toLowerCase();
    if (mime && !mime.startsWith("image/")) {
      throw new Error(
        `PNG export response is not an image (Content-Type: ${mime}).`,
      );
    }
  }

  /**
   * Trigger a browser download for a validated Blob. Uses an object URL
   * and revokes it on the next microtask to keep the click handler
   * synchronous. Returns the object URL for callers that need it.
   * @private
   */
  triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return url;
  }

  /**
   * Export as PNG
   *
   * Phase 1 tightening: data URL gate now requires `data:image/png` exactly
   * (was `data:image/*`, which silently let SVG payloads through). Decoded
   * bytes are checked against the PNG magic signature before download so
   * a `data:image/png;base64,<svg…>` masquerade is rejected at the source.
   *
   * @private
   */
  async exportAsPNG(sheet) {
    const filename = this.generateFilename(sheet, "png");

    if (!sheet?.url || typeof sheet.url !== "string") {
      throw new Error("No valid image URL for PNG export");
    }

    if (sheet.url.startsWith("data:")) {
      if (!/^data:image\/png(?:;|,)/i.test(sheet.url)) {
        throw new Error(
          "PNG export requires a data:image/png URL — refusing to save non-PNG bytes as .png.",
        );
      }
      const payloadSeparator = sheet.url.indexOf(",");
      if (payloadSeparator < 0 || payloadSeparator === sheet.url.length - 1) {
        throw new Error("PNG export data URL has no payload.");
      }
      const blob = await this.dataURLToBlob(sheet.url);
      this.validatePngBlob(blob, blob.type);
      await validatePngMagicBytes(blob);
      const url = this.triggerBlobDownload(blob, filename);
      return { success: true, url, filename, format: "PNG" };
    }

    // HTTP(S) URL path: fetch it, verify ok + image content-type + size,
    // then download as a validated blob. Never use a raw <a download>
    // on the source URL — that path silently saves whatever the server
    // returns, including error HTML.
    const response = await fetch(sheet.url, { method: "GET" });
    if (!response.ok) {
      throw new Error(
        `PNG export failed: HTTP ${response.status} ${response.statusText || ""}`.trim(),
      );
    }
    const contentType = (
      response.headers?.get?.("content-type") ||
      response.headers?.get?.("Content-Type") ||
      ""
    ).toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      throw new Error(
        `PNG export response is not an image (Content-Type: ${contentType}).`,
      );
    }
    const blob = await response.blob();
    this.validatePngBlob(blob, contentType || blob.type);
    await validatePngMagicBytes(blob);
    const url = this.triggerBlobDownload(blob, filename);
    return { success: true, url, filename, format: "PNG" };
  }

  /**
   * Export as PDF via the compact-reference /api/a1/export route.
   *
   * @private
   */
  async exportAsPDF(sheet) {
    logger.info("Requesting compact-reference PDF export");

    try {
      return await this.exportSheetServerSide({
        sheet,
        format: "pdf",
        env: this.env,
      });
    } catch (error) {
      logger.error("PDF export failed", error);
      throw new Error(`PDF export failed: ${error.message}`);
    }
  }

  /**
   * Generate deterministic filename
   * @private
   */
  generateFilename(sheet, extension) {
    const designId = sheet.metadata?.designId || "design";
    const sheetType = sheet.metadata?.sheetType || "ARCH";
    const versionId = sheet.metadata?.versionId || "base";
    const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    return `${designId}_${sheetType}_${versionId}_${timestamp}.${extension}`;
  }

  /**
   * Convert data URL to blob
   * @private
   */
  async dataURLToBlob(dataURL) {
    const response = await fetch(dataURL);
    return response.blob();
  }

  /**
   * Export CAD file (DXF via server API, or fallback DWG stub)
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Export result
   */
  async exportCAD({ sheet, format = "DXF", env = null }) {
    logger.info(`Exporting CAD as ${format}`, null, "📐");

    if (format === "DXF" || format === "dxf") {
      return this.exportDXF(sheet);
    }

    if (format === "DWG" || format === "dwg") {
      return this.exportDWG(sheet);
    }

    throw new Error(
      `${format} export requires a configured DWG conversion provider. DXF is the guaranteed CAD output.`,
    );
  }

  /**
   * Phase 5 — DWG export. Posts to /api/project/export/dwg which spawns the
   * ODA File Converter on the server. On 503 (env not configured) we
   * surface a clear "Install ODA File Converter" message with the docs
   * link instead of a generic failure, matching the api/project/export/
   * dwg.js handler contract.
   */
  async exportDWG(sheet) {
    const compiledProject = this.resolveCompiledProject(sheet);
    if (!compiledProject?.geometryHash) {
      throw new Error(
        "A compiled project is required for DWG export. Generate a design first.",
      );
    }
    const filename = this.generateFilename(sheet, "dwg");
    const { structural, mep } = this.resolveDrawingDisciplineFlags(sheet);
    const requestBody = {
      compiledProject,
      projectName: this.resolveProjectName(sheet),
    };
    if (structural !== null) requestBody.structuralDrawingsEnabled = structural;
    if (mep !== null) requestBody.mepDrawingsEnabled = mep;
    const response = await fetch("/api/project/export/dwg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const reason =
        err.code === "DWG_CONVERSION_UNAVAILABLE"
          ? `${err.error} See ${err.docsUrl}.`
          : err.error || `DWG export failed: ${response.status}`;
      const exportError = new Error(reason);
      exportError.code = err.code || null;
      exportError.docsUrl = err.docsUrl || null;
      exportError.statusCode = response.status;
      throw exportError;
    }
    const url = await this.downloadResponseBlob(response, filename);
    logger.success("DWG export complete", { filename });
    return { success: true, url, filename, format: "DWG" };
  }

  /**
   * Export DXF via the /api/export/dxf endpoint
   * @private
   */
  async exportDXF(sheet) {
    const compiledProject = this.resolveCompiledProject(sheet);
    if (compiledProject?.geometryHash) {
      const filename = this.generateFilename(sheet, "dxf");
      // Phase 2 audit response: thread the same discipline flags the
      // sheet was generated with into the DXF request so the artifact
      // matches the IFC + A1 sheets. `null` defers to server env.
      const { structural, mep } = this.resolveDrawingDisciplineFlags(sheet);
      const requestBody = {
        compiledProject,
        projectName: this.resolveProjectName(sheet),
      };
      if (structural !== null)
        requestBody.structuralDrawingsEnabled = structural;
      if (mep !== null) requestBody.mepDrawingsEnabled = mep;
      const response = await fetch("/api/project/export/dxf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `DXF export failed: ${response.status}`);
      }

      const url = await this.downloadResponseBlob(response, filename);
      logger.success("Compiled-project DXF export complete", { filename });
      return { success: true, url, filename, format: "DXF" };
    }

    const dna = sheet.dna || {};
    const spatialGraph =
      dna.spatialGraph || dna._structured?.program?.spatialGraph || null;

    if (!spatialGraph?.building) {
      throw new Error(
        "No spatial graph available for DXF export. Generate a design first.",
      );
    }

    const response = await fetch("/api/export/dxf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spatialGraph,
        roomPositions: dna.roomPositions || null,
        projectName: dna.projectType || "ArchiAI_FloorPlan",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `DXF export failed: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const filename = this.generateFilename(sheet, "dxf");

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    logger.success("DXF export complete", { filename });
    return { success: true, url, filename, format: "DXF" };
  }

  async exportJSON({ sheet }) {
    const compiledProject = this.resolveCompiledProject(sheet);
    if (!compiledProject?.geometryHash) {
      throw new Error(
        "A compiled project is required for JSON authority export.",
      );
    }

    const filename = this.generateFilename(sheet, "json");
    const response = await fetch("/api/project/export/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiledProject,
        projectQuantityTakeoff: this.resolveProjectQuantityTakeoff(sheet),
        sheetArtifactManifest: this.resolveSheetArtifactManifest(sheet),
        designMetadata: this.resolveDesignMetadata(sheet),
        qaSummary: this.resolveQaSummary(sheet),
        projectName: this.resolveProjectName(sheet),
        pipelineVersion:
          sheet?.pipelineVersion || sheet?.metadata?.pipelineVersion || null,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `JSON export failed: ${response.status}`);
    }

    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Compiled-project JSON export complete", { filename });
    return { success: true, url, filename, format: "JSON" };
  }

  /**
   * Export BIM file (IFC). RVT is unsupported. IFC requires a real
   * compiled project with geometryHash — there is no fake-IFC fallback.
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Export result
   */
  async exportBIM({ sheet, format = "IFC", env = null }) {
    void env;

    logger.info(`Exporting BIM as ${format}`, null, "🏗️");

    if (String(format).toUpperCase() === "RVT") {
      throw new Error(
        "RVT export is experimental/off in UK Residential V2. Use IFC for BIM export.",
      );
    }

    const compiledProject = this.resolveCompiledProject(sheet);
    if (!compiledProject?.geometryHash) {
      throw new Error(
        "IFC export requires a compiled project with geometryHash.",
      );
    }

    const filename = this.generateFilename(sheet, "ifc");
    // Phase 2 audit response: thread the discipline flags through so the
    // IFC honours the same intent as the DXF + A1 sheets. `null` defers
    // to server env-defaults.
    const { structural, mep } = this.resolveDrawingDisciplineFlags(sheet);
    const ifcRequestBody = {
      compiledProject,
      projectName: this.resolveProjectName(sheet),
    };
    if (structural !== null)
      ifcRequestBody.structuralDrawingsEnabled = structural;
    if (mep !== null) ifcRequestBody.mepDrawingsEnabled = mep;
    const response = await fetch("/api/project/export/ifc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ifcRequestBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `IFC export failed: ${response.status}`);
    }

    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Compiled-project BIM export complete", {
      filename,
      format: "IFC",
    });
    return { success: true, url, filename, format: "IFC" };
  }

  async exportWorkbook({ sheet }) {
    const compiledProject = this.resolveCompiledProject(sheet);
    const projectQuantityTakeoff = this.resolveProjectQuantityTakeoff(sheet);
    if (
      !compiledProject?.geometryHash ||
      !projectQuantityTakeoff?.items?.length
    ) {
      throw new Error(
        "A compiled project and quantity takeoff are required for Excel export.",
      );
    }

    const filename = this.generateFilename(sheet, "xlsx");
    const response = await fetch("/api/project/export/xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiledProject,
        projectQuantityTakeoff,
        projectName: this.resolveProjectName(sheet),
        projectAddress:
          sheet?.brief?.site_address ||
          sheet?.projectGraph?.brief?.site_address ||
          sheet?.metadata?.projectAddress ||
          null,
        qualityTier: sheet?.programBrief?.qualityTier || "mid",
        region: "uk-average",
        pipelineVersion:
          sheet?.pipelineVersion || sheet?.metadata?.pipelineVersion || null,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Excel export failed: ${response.status}`);
    }

    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Cost workbook export complete", { filename });
    return { success: true, url, filename, format: "XLSX" };
  }

  async exportGLB({ sheet }) {
    const filename = this.generateFilename(sheet, "glb");
    const compiledProject = this.resolveCompiledProject(sheet);

    // Phase 5 — when the sheet already carries a pre-baked GLB URL (legacy
    // path / Meshy3D), download it directly. Otherwise, build the GLB on
    // demand via the server endpoint so the deterministic compiledProject
    // path produces an artifact even when no pre-rendered model exists.
    const modelUrl =
      sheet?.compiledProject?.artifacts?.glbUrl ||
      sheet?.compiledProject?.artifacts?.modelUrl ||
      sheet?.meshy3D?.modelUrl ||
      sheet?.masterDNA?.meshy3D?.modelUrl ||
      null;

    if (modelUrl) {
      const link = document.createElement("a");
      link.href = modelUrl;
      link.download = filename;
      link.click();
      logger.success("GLB export complete (pre-baked)", { filename });
      return { success: true, url: modelUrl, filename, format: "GLB" };
    }

    if (!compiledProject?.geometryHash) {
      throw new Error(
        "A compiled project is required for GLB export. Generate a design first.",
      );
    }

    const requestBody = {
      compiledProject,
      projectName: this.resolveProjectName(sheet),
    };
    const response = await fetch("/api/project/export/glb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `GLB export failed: ${response.status}`);
    }
    const url = await this.downloadResponseBlob(response, filename);
    logger.success("GLB export complete (compiled-project)", { filename });
    return { success: true, url, filename, format: "GLB" };
  }
}

// Export singleton instance
const exportService = new ExportService();
export default exportService;
export { ExportService };
