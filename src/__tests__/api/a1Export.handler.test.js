/**
 * Phase 1 export-fix — /api/a1/export handler.
 *
 * Covers:
 *   - Per-format dispatch (png, pdf, svg) with each source kind.
 *   - Path-traversal + safe-name guard.
 *   - 256 KB request-body cap (returns 413 EXPORT_BODY_TOO_LARGE).
 *   - Inline-SVG denylist (script, foreignObject, external href, url(http…)).
 *   - Vector PDF preferred; raster fallback when vector errors.
 *   - 422 FINAL_A1_RASTER_TOO_SMALL when the raster fallback / png source
 *     fails the final-A1 density gate.
 *   - Binary response contract: never `application/json` on success;
 *     Content-Disposition + Content-Length set; X-A1-Export-Builder reflects
 *     the path taken.
 *
 * Sharp/pdf-lib/composeRuntime are mocked at module load so the suite stays
 * deterministic and avoids the ~70M pixel A1 rasterisation cost.
 */

import fs from "fs";
import path from "path";
import os from "os";

// Stateful sharp mock. Tests can override `mockSharpToBuffer` to change the
// returned PNG bytes; the factory always rebuilds a fresh chainable so the
// .resize().png().toBuffer() chain works regardless of test order.
let mockSharpToBuffer = jest.fn();
let mockSharpFactory = jest.fn();

jest.mock("sharp", () => ({
  __esModule: true,
  default: (...args) => mockSharpFactory(...args),
}));

let mockBuildVectorPdf = jest.fn();
jest.mock(
  "../../services/render/buildVectorPdfFromSheetSvg.js",
  () => ({
    __esModule: true,
    buildVectorPdfFromSheetSvg: (...args) => mockBuildVectorPdf(...args),
  }),
  { virtual: false },
);

let mockBuildPrintReadyPdf = jest.fn();
let mockResolveComposeOutputDir = jest.fn();
jest.mock(
  "../../services/a1/composeRuntime.js",
  () => ({
    __esModule: true,
    buildPrintReadyPdfFromPng: (...args) => mockBuildPrintReadyPdf(...args),
    resolveComposeOutputDir: () => mockResolveComposeOutputDir(),
  }),
  { virtual: false },
);

let mockGetBlobArtifact = jest.fn();
let mockGetDefaultArtifactStorageAdapter = jest.fn();
jest.mock(
  "../../services/export/artifactStorageService.js",
  () => ({
    __esModule: true,
    getDefaultArtifactStorageAdapter: () =>
      mockGetDefaultArtifactStorageAdapter(),
    BLOB_KIND_A1_SHEET_SVG: "a1-sheet-svg",
  }),
  { virtual: false },
);

import handler, { __testing } from "../../../api/a1/export.js";

const VALID_SVG_STRING =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10' fill='white'/></svg>";
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x12, 0x34,
]);
const VALID_PDF_BYTES = Buffer.from("%PDF-1.7\nbody\n%%EOF\n", "utf8");

function captureResponse() {
  const headers = {};
  const out = {
    statusCode: 200,
    headers,
    body: null,
    rawBody: null,
    ended: false,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.rawBody = Buffer.from(JSON.stringify(payload));
      this.ended = true;
      return this;
    },
    end(buf) {
      if (buf !== undefined) {
        this.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
      }
      this.ended = true;
      return this;
    },
  };
  return out;
}

function makeRequest(body, { method = "POST", origin } = {}) {
  return {
    method,
    body,
    headers: origin ? { origin } : {},
  };
}

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-export-test-"));
  mockResolveComposeOutputDir.mockReturnValue(tmpDir);
  mockBuildVectorPdf.mockReset().mockResolvedValue({
    ok: true,
    pdfBytes: VALID_PDF_BYTES,
    error: null,
  });
  mockBuildPrintReadyPdf.mockReset().mockResolvedValue({
    pdfBuffer: VALID_PDF_BYTES,
    pdfMetadata: {},
  });
  mockSharpToBuffer.mockReset().mockResolvedValue(VALID_PNG_BYTES);
  // Reinstall the chainable factory each test so mockReset+test-suite isolation
  // (which would otherwise drop the implementation set at module load time)
  // never strands the chainable in an `undefined` state.
  mockSharpFactory.mockReset().mockImplementation(() => {
    const chainable = {
      resize: jest.fn(() => chainable),
      png: jest.fn(() => chainable),
      toBuffer: () => mockSharpToBuffer(),
    };
    return chainable;
  });
  mockGetBlobArtifact.mockReset();
  mockGetDefaultArtifactStorageAdapter.mockReset().mockReturnValue({
    adapterCapabilities: { adapter: "memory" },
    getBlobArtifact: (args) => mockGetBlobArtifact(args),
  });
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  jest.clearAllMocks();
});

function writeArtifact(name, bytes) {
  const abs = path.join(tmpDir, name);
  fs.writeFileSync(abs, bytes);
  return `/api/a1/compose-output/${name}`;
}

describe("/api/a1/export — helper unit tests", () => {
  test("classifyArtifactKind detects PNG signature", () => {
    expect(__testing.classifyArtifactKind(VALID_PNG_BYTES)).toBe("png");
  });

  test("classifyArtifactKind detects PDF magic", () => {
    expect(__testing.classifyArtifactKind(VALID_PDF_BYTES)).toBe("pdf");
  });

  test("classifyArtifactKind detects SVG by leading <svg or <?xml", () => {
    expect(__testing.classifyArtifactKind(Buffer.from("<svg></svg>"))).toBe(
      "svg",
    );
    expect(
      __testing.classifyArtifactKind(
        Buffer.from("<?xml version='1.0'?><svg/>"),
      ),
    ).toBe("svg");
    expect(__testing.classifyArtifactKind(Buffer.from("\n  <svg></svg>"))).toBe(
      "svg",
    );
  });

  test("classifyArtifactKind tolerates UTF-8 BOM before <svg", () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("<svg></svg>"),
    ]);
    expect(__testing.classifyArtifactKind(bytes)).toBe("svg");
  });

  test("sanitizeInlineSvg rejects <script>", () => {
    expect(
      __testing.sanitizeInlineSvg("<svg><script>alert(1)</script></svg>"),
    ).toEqual({ ok: false, blockedToken: "<script" });
  });

  test("sanitizeInlineSvg rejects <foreignObject>", () => {
    expect(
      __testing.sanitizeInlineSvg("<svg><foreignObject></foreignObject></svg>"),
    ).toEqual({ ok: false, blockedToken: "<foreignobject" });
  });

  test("sanitizeInlineSvg rejects external xlink:href", () => {
    expect(
      __testing.sanitizeInlineSvg(
        '<svg><image xlink:href="https://evil.example"/></svg>',
      ),
    ).toMatchObject({ ok: false });
  });

  test("sanitizeInlineSvg rejects url(http://…) in styles", () => {
    expect(
      __testing.sanitizeInlineSvg('<svg style="fill:url(http://e.x/a)"/>'),
    ).toMatchObject({ ok: false });
  });

  test("sanitizeInlineSvg accepts benign markup", () => {
    expect(__testing.sanitizeInlineSvg(VALID_SVG_STRING)).toEqual({ ok: true });
  });

  test("readArtifactBytes accepts data:image/svg+xml;charset=utf-8 with percent encoding", () => {
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(VALID_SVG_STRING)}`;
    const result = __testing.readArtifactBytes(encoded, tmpDir);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("svg");
    expect(result.svgString).toBe(VALID_SVG_STRING);
  });

  test("readArtifactBytes accepts data:image/svg+xml;utf8 with raw payload", () => {
    const raw = `data:image/svg+xml;utf8,${VALID_SVG_STRING}`;
    const result = __testing.readArtifactBytes(raw, tmpDir);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("svg");
    expect(result.svgString).toBe(VALID_SVG_STRING);
  });

  test("readArtifactBytes accepts data:image/svg+xml;base64", () => {
    const b64 = Buffer.from(VALID_SVG_STRING, "utf8").toString("base64");
    const result = __testing.readArtifactBytes(
      `data:image/svg+xml;base64,${b64}`,
      tmpDir,
    );
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("svg");
    expect(result.svgString).toBe(VALID_SVG_STRING);
  });

  test("readArtifactBytes accepts raw <svg…> string", () => {
    const result = __testing.readArtifactBytes(VALID_SVG_STRING, tmpDir);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("svg");
    expect(result.svgString).toBe(VALID_SVG_STRING);
  });

  test("readArtifactBytes accepts data:image/png;base64", () => {
    const b64 = VALID_PNG_BYTES.toString("base64");
    const result = __testing.readArtifactBytes(
      `data:image/png;base64,${b64}`,
      tmpDir,
    );
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("png");
    expect(result.buffer.equals(VALID_PNG_BYTES)).toBe(true);
  });

  test("readArtifactBytes rejects unknown URL scheme", () => {
    expect(
      __testing.readArtifactBytes("https://example.com/x.svg", tmpDir),
    ).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_ARTIFACT_PATH" },
    });
  });

  test("readArtifactBytes rejects path traversal", () => {
    expect(
      __testing.readArtifactBytes(
        "/api/a1/compose-output/../../../etc/passwd",
        tmpDir,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.objectContaining({
        code: expect.stringMatching(/INVALID_ARTIFACT_NAME|ARTIFACT_PATH/),
      }),
    });
  });

  test("readArtifactBytes returns ARTIFACT_NOT_FOUND for missing file", () => {
    expect(
      __testing.readArtifactBytes(
        "/api/a1/compose-output/does-not-exist.svg",
        tmpDir,
      ),
    ).toMatchObject({ ok: false, error: { code: "ARTIFACT_NOT_FOUND" } });
  });

  test("readArtifactBytes reads compose-output PNG file", () => {
    const ref = writeArtifact("a1-test-1-aaaaaaaa.png", VALID_PNG_BYTES);
    const result = __testing.readArtifactBytes(ref, tmpDir);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("png");
    expect(result.source).toBe("file");
    expect(result.buffer.equals(VALID_PNG_BYTES)).toBe(true);
  });
});

describe("/api/a1/export — handler", () => {
  test("rejects non-POST with 405", async () => {
    const req = makeRequest({}, { method: "GET" });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  test("handles OPTIONS preflight with 200 + CORS headers", async () => {
    const req = makeRequest(
      {},
      { method: "OPTIONS", origin: "http://localhost:3000" },
    );
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeDefined();
  });

  test("returns 413 EXPORT_BODY_TOO_LARGE when JSON body exceeds 256 KB", async () => {
    const padding = "a".repeat(300 * 1024);
    const req = makeRequest({
      designId: "x",
      format: "svg",
      artifactPath: `data:image/svg+xml;utf8,<svg data-padding='${padding}'/>`,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(413);
    expect(res.body.error.code).toBe("EXPORT_BODY_TOO_LARGE");
  });

  test("rejects missing designId / format / artifactPath", async () => {
    const r1 = captureResponse();
    await handler(makeRequest({ format: "png", artifactPath: "x" }), r1);
    expect(r1.statusCode).toBe(400);
    expect(r1.body.error.code).toBe("DESIGN_ID_REQUIRED");

    const r2 = captureResponse();
    await handler(makeRequest({ designId: "x", artifactPath: "y" }), r2);
    expect(r2.statusCode).toBe(400);
    expect(r2.body.error.code).toBe("UNSUPPORTED_FORMAT");

    const r3 = captureResponse();
    await handler(makeRequest({ designId: "x", format: "png" }), r3);
    expect(r3.statusCode).toBe(400);
    expect(r3.body.error.code).toBe("ARTIFACT_PATH_REQUIRED");
  });

  test("format=png, source=png file → passthrough binary", async () => {
    const ref = writeArtifact("a1-pf-1.png", VALID_PNG_BYTES);
    const req = makeRequest({
      designId: "pf",
      format: "png",
      artifactPath: ref,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/png");
    expect(res.headers["X-A1-Export-Builder"]).toBe("passthrough");
    expect(res.rawBody.slice(0, 8).equals(VALID_PNG_BYTES.slice(0, 8))).toBe(
      true,
    );
    expect(res.headers["Content-Length"]).toBe(String(VALID_PNG_BYTES.length));
    expect(res.headers["Content-Disposition"]).toMatch(/attachment; filename=/);
  });

  test("format=png, source=svg charset=utf-8 → sharp rasterisation", async () => {
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(VALID_SVG_STRING)}`;
    const req = makeRequest({
      designId: "raster",
      format: "png",
      artifactPath: dataUrl,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/png");
    expect(res.headers["X-A1-Export-Builder"]).toBe("sharp_svg_to_png");
    expect(mockSharpFactory).toHaveBeenCalled();
  });

  test("format=png, source=raw <svg…> → sharp rasterisation", async () => {
    const req = makeRequest({
      designId: "raw",
      format: "png",
      artifactPath: VALID_SVG_STRING,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-A1-Export-Builder"]).toBe("sharp_svg_to_png");
  });

  test("format=svg passthrough sets image/svg+xml; charset=utf-8", async () => {
    const dataUrl = `data:image/svg+xml;utf8,${VALID_SVG_STRING}`;
    const req = makeRequest({
      designId: "svg",
      format: "svg",
      artifactPath: dataUrl,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/svg+xml; charset=utf-8");
    const decoded = res.rawBody.toString("utf8");
    expect(decoded).toBe(VALID_SVG_STRING);
  });

  test("format=pdf, source=svg, vector_pdf path", async () => {
    const req = makeRequest({
      designId: "vec",
      format: "pdf",
      artifactPath: VALID_SVG_STRING,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/pdf");
    expect(res.headers["X-A1-Export-Builder"]).toBe("vector_pdf");
    expect(res.rawBody.slice(0, 4).toString("utf8")).toBe("%PDF");
    expect(mockBuildVectorPdf).toHaveBeenCalled();
    expect(mockBuildPrintReadyPdf).not.toHaveBeenCalled();
  });

  test("format=pdf, source=svg, vector fails → raster fallback", async () => {
    mockBuildVectorPdf.mockResolvedValueOnce({
      ok: false,
      pdfBytes: null,
      error: "parse_failed",
    });
    const req = makeRequest({
      designId: "vec_fail",
      format: "pdf",
      artifactPath: VALID_SVG_STRING,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-A1-Export-Builder"]).toBe("raster_pdf_fallback");
    expect(mockBuildVectorPdf).toHaveBeenCalled();
    expect(mockBuildPrintReadyPdf).toHaveBeenCalled();
  });

  test("format=pdf, source=svg, vector fails + raster too small → 422", async () => {
    mockBuildVectorPdf.mockResolvedValueOnce({
      ok: false,
      pdfBytes: null,
      error: "parse_failed",
    });
    mockBuildPrintReadyPdf.mockRejectedValueOnce(
      new Error(
        "buildPrintReadyPdfFromPng refused: isFinalA1=true but raster is preview density.",
      ),
    );
    const req = makeRequest({
      designId: "small",
      format: "pdf",
      artifactPath: VALID_SVG_STRING,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe("FINAL_A1_RASTER_TOO_SMALL");
  });

  test("format=pdf, source=png at full density → raster_pdf_from_png", async () => {
    const ref = writeArtifact("a1-pdf-1.png", VALID_PNG_BYTES);
    const req = makeRequest({
      designId: "pdfpng",
      format: "pdf",
      artifactPath: ref,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-A1-Export-Builder"]).toBe("raster_pdf_from_png");
    expect(res.rawBody.slice(0, 4).toString("utf8")).toBe("%PDF");
  });

  test("format=pdf, source=png too small → 422", async () => {
    mockBuildPrintReadyPdf.mockRejectedValueOnce(
      new Error("buildPrintReadyPdfFromPng refused: preview density"),
    );
    const ref = writeArtifact("a1-tiny.png", VALID_PNG_BYTES);
    const req = makeRequest({
      designId: "tiny",
      format: "pdf",
      artifactPath: ref,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe("FINAL_A1_RASTER_TOO_SMALL");
  });

  test("format=pdf, pdfArtifactPath → passthrough", async () => {
    const ref = writeArtifact("a1-pre.pdf", VALID_PDF_BYTES);
    const req = makeRequest({
      designId: "pre",
      format: "pdf",
      artifactPath: ref,
      pdfArtifactPath: ref,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-A1-Export-Builder"]).toBe("passthrough");
    expect(res.rawBody.slice(0, 4).toString("utf8")).toBe("%PDF");
  });

  test("format=png, source=pdf → 400 INVALID_INPUT", async () => {
    const ref = writeArtifact("a1-bad.pdf", VALID_PDF_BYTES);
    const req = makeRequest({
      designId: "bad",
      format: "png",
      artifactPath: ref,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  test("format=svg, source=png → 400 INVALID_INPUT", async () => {
    const ref = writeArtifact("a1-bad.png", VALID_PNG_BYTES);
    const req = makeRequest({
      designId: "bad",
      format: "svg",
      artifactPath: ref,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  test("inline SVG with <script> → 400 INLINE_SVG_BLOCKED, sharp NOT called", async () => {
    const evil = "<svg><script>alert(1)</script></svg>";
    const req = makeRequest({
      designId: "evil",
      format: "png",
      artifactPath: evil,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("INLINE_SVG_BLOCKED");
    expect(mockSharpFactory).not.toHaveBeenCalled();
  });

  test("path traversal returns 400 and never touches fs", async () => {
    const req = makeRequest({
      designId: "trav",
      format: "png",
      artifactPath: "/api/a1/compose-output/../../etc/passwd",
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toMatch(/INVALID_ARTIFACT_NAME|ARTIFACT_PATH/);
  });

  test("unknown filename in compose-output → 404", async () => {
    const req = makeRequest({
      designId: "missing",
      format: "png",
      artifactPath: "/api/a1/compose-output/a1-not-real.png",
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe("ARTIFACT_NOT_FOUND");
  });

  test("https:// artifactPath → 400 UNSUPPORTED_ARTIFACT_PATH", async () => {
    const req = makeRequest({
      designId: "ext",
      format: "png",
      artifactPath: "https://evil.example/a.svg",
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_ARTIFACT_PATH");
  });

  test("success responses never use Content-Type: application/json", async () => {
    const ref = writeArtifact("a1-ct.png", VALID_PNG_BYTES);
    const req = makeRequest({
      designId: "ct",
      format: "png",
      artifactPath: ref,
    });
    const res = captureResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).not.toMatch(/application\/json/i);
  });
});

// Phase 1 export-fix amendments: durable `artifactRef` path and universal
// SVG denylist (including stored bytes coming from the storage adapter).
describe("/api/a1/export — artifactRef (durable storage)", () => {
  test("format=svg, artifactRef → reads bytes from blob adapter and passes through", async () => {
    const svgString =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'/>";
    mockGetBlobArtifact.mockResolvedValueOnce({
      found: true,
      packageId: "pkg-123",
      kind: "a1-sheet-svg",
      contentType: "image/svg+xml; charset=utf-8",
      bytes: Buffer.from(svgString, "utf8"),
      byteLength: Buffer.byteLength(svgString, "utf8"),
    });
    const res = captureResponse();
    await handler(
      makeRequest({
        designId: "blob-svg",
        format: "svg",
        artifactRef: { packageId: "pkg-123", kind: "a1-sheet-svg" },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/svg+xml; charset=utf-8");
    expect(res.rawBody.toString("utf8")).toBe(svgString);
    expect(mockGetBlobArtifact).toHaveBeenCalledWith({
      packageId: "pkg-123",
      kind: "a1-sheet-svg",
    });
  });

  test("format=png, artifactRef returns SVG → sharp rasterisation kicks in", async () => {
    const svgString =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'/>";
    mockGetBlobArtifact.mockResolvedValueOnce({
      found: true,
      packageId: "pkg-png",
      kind: "a1-sheet-svg",
      contentType: "image/svg+xml; charset=utf-8",
      bytes: Buffer.from(svgString, "utf8"),
      byteLength: Buffer.byteLength(svgString, "utf8"),
    });
    const res = captureResponse();
    await handler(
      makeRequest({
        designId: "blob-png",
        format: "png",
        artifactRef: { packageId: "pkg-png", kind: "a1-sheet-svg" },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-A1-Export-Builder"]).toBe("sharp_svg_to_png");
  });

  test("artifactRef with missing fields → 400 INVALID_ARTIFACT_REF", async () => {
    const res = captureResponse();
    await handler(
      makeRequest({
        designId: "x",
        format: "svg",
        artifactRef: { packageId: "" },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ARTIFACT_REF");
  });

  test("artifactRef not found → 404 ARTIFACT_NOT_FOUND", async () => {
    mockGetBlobArtifact.mockResolvedValueOnce({
      found: false,
      code: "ARTIFACT_STORAGE_NOT_FOUND",
    });
    const res = captureResponse();
    await handler(
      makeRequest({
        designId: "x",
        format: "svg",
        artifactRef: { packageId: "missing", kind: "a1-sheet-svg" },
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe("ARTIFACT_NOT_FOUND");
  });

  test("adapter without getBlobArtifact → 400 ARTIFACT_REF_ADAPTER_UNSUPPORTED", async () => {
    mockGetDefaultArtifactStorageAdapter.mockReturnValueOnce({
      adapterCapabilities: { adapter: "stub" },
    });
    const res = captureResponse();
    await handler(
      makeRequest({
        designId: "x",
        format: "svg",
        artifactRef: { packageId: "pkg", kind: "a1-sheet-svg" },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("ARTIFACT_REF_ADAPTER_UNSUPPORTED");
  });

  test("adapter SVG containing <script> → rejected by universal denylist", async () => {
    const evil = "<svg><script>alert(1)</script></svg>";
    mockGetBlobArtifact.mockResolvedValueOnce({
      found: true,
      packageId: "pkg-evil",
      kind: "a1-sheet-svg",
      contentType: "image/svg+xml; charset=utf-8",
      bytes: Buffer.from(evil, "utf8"),
      byteLength: Buffer.byteLength(evil, "utf8"),
    });
    const res = captureResponse();
    await handler(
      makeRequest({
        designId: "pkg-evil",
        format: "png",
        artifactRef: { packageId: "pkg-evil", kind: "a1-sheet-svg" },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("INLINE_SVG_BLOCKED");
    expect(mockSharpFactory).not.toHaveBeenCalled();
  });

  test("file-transport SVG containing <script> → rejected by universal denylist", async () => {
    // The original handler only sanitised inline sources; this asserts the
    // defense-in-depth that also rejects stored files (compose-output dir).
    const ref = writeArtifact(
      "a1-evil.svg",
      Buffer.from("<svg><foreignObject></foreignObject></svg>", "utf8"),
    );
    const res = captureResponse();
    await handler(
      makeRequest({
        designId: "evil-stored",
        format: "png",
        artifactPath: ref,
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("INLINE_SVG_BLOCKED");
    expect(mockSharpFactory).not.toHaveBeenCalled();
  });
});
