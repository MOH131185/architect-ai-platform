/**
 * Phase 1 export-fix — client wiring for exportService → /api/a1/export.
 *
 * Verifies:
 *   - Request body uses compact references only (no `imageUrl` key, no
 *     value starting with `data:` when the sheet exposes a file-transport
 *     artifact path).
 *   - File-transport sheets produce bodies < 1 KB; inline data URL fallback
 *     stays within the 256 KB budget; oversized inline data URLs throw at
 *     the client before any fetch.
 *   - Never POSTs `/api/sheet`.
 *   - Browser-safe basenameFromPath handles POSIX, Windows, and query suffixes.
 *   - Magic-byte validators reject masquerading payloads per format.
 *   - BOM-prefixed SVG passes magic-byte check.
 *   - 5xx server errors surface message intact.
 */

import exportService, {
  basenameFromPath,
  isSafeArtifactBasename,
  resolveExportArtifactPath,
  resolveExportArtifactRef,
  validatePngMagicBytes,
  validatePdfMagicBytes,
  validateSvgMagicBytes,
  EXPORT_REQUEST_INLINE_BUDGET_BYTES,
} from "../../services/exportService.js";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_CREATE_URL = URL.createObjectURL;
const ORIGINAL_REVOKE_URL = URL.revokeObjectURL;
const ORIGINAL_ANCHOR_CLICK = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  URL.createObjectURL = jest.fn(() => "blob:fake");
  URL.revokeObjectURL = jest.fn();
  HTMLAnchorElement.prototype.click = jest.fn();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  URL.createObjectURL = ORIGINAL_CREATE_URL;
  URL.revokeObjectURL = ORIGINAL_REVOKE_URL;
  HTMLAnchorElement.prototype.click = ORIGINAL_ANCHOR_CLICK;
  jest.restoreAllMocks();
});

function headerBag(headers = {}) {
  return {
    get(name) {
      const key = Object.keys(headers).find(
        (h) => h.toLowerCase() === String(name).toLowerCase(),
      );
      return key ? headers[key] : null;
    },
  };
}

function pngResponse(headers = {}) {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00,
  ]);
  return {
    ok: true,
    status: 200,
    headers: headerBag({
      "Content-Type": "image/png",
      "Content-Disposition":
        'attachment; filename="design_ARCH_base_2025-01-01.png"',
      ...headers,
    }),
    blob: () => Promise.resolve(new Blob([bytes], { type: "image/png" })),
  };
}

function pdfResponse(headers = {}) {
  const bytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
  ]);
  return {
    ok: true,
    status: 200,
    headers: headerBag({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="design_ARCH_base_2025-01-01.pdf"',
      "X-A1-Export-Builder": "vector_pdf",
      ...headers,
    }),
    blob: () => Promise.resolve(new Blob([bytes], { type: "application/pdf" })),
  };
}

function fileTransportSheet({ extras = {} } = {}) {
  return {
    metadata: {
      designId: "design-x",
      sheetType: "ARCH",
      versionId: "base",
      svgOutputFile:
        "C:/abs/qa_results/a1_compose_outputs/a1-design-x-1-aaaaaaaa.svg",
    },
    artifacts: {
      a1Sheet: {
        svgOutputFile:
          "/abs/qa_results/a1_compose_outputs/a1-design-x-1-aaaaaaaa.svg",
        svgUrl: "/api/a1/compose-output/a1-design-x-1-aaaaaaaa.svg",
      },
    },
    geometryHash: "geom-hash-123",
    ...extras,
  };
}

function inlineDataUrlSheet(svgString) {
  return {
    metadata: { designId: "design-y", sheetType: "ARCH", versionId: "base" },
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`,
    geometryHash: "geom-y",
  };
}

describe("basenameFromPath (browser-safe)", () => {
  test("strips POSIX directory prefix", () => {
    expect(basenameFromPath("/abs/path/to/a1-x.svg")).toBe("a1-x.svg");
  });

  test("strips Windows backslash prefix", () => {
    expect(basenameFromPath("C:\\abs\\path\\a1-x.svg")).toBe("a1-x.svg");
  });

  test("strips both kinds of separators in mixed input", () => {
    expect(basenameFromPath("/a/b\\c/d-e.png")).toBe("d-e.png");
  });

  test("strips query and hash suffixes", () => {
    expect(basenameFromPath("/api/a1/compose-output/a1-x.svg?v=1")).toBe(
      "a1-x.svg",
    );
    expect(basenameFromPath("/api/a1/compose-output/a1-x.svg#cache")).toBe(
      "a1-x.svg",
    );
  });

  test("returns empty string for empty / non-string input", () => {
    expect(basenameFromPath("")).toBe("");
    expect(basenameFromPath(null)).toBe("");
    expect(basenameFromPath(undefined)).toBe("");
  });
});

describe("isSafeArtifactBasename", () => {
  test("accepts compose-output style names", () => {
    expect(isSafeArtifactBasename("a1-foo-1234-aabbccdd.svg")).toBe(true);
    expect(isSafeArtifactBasename("a1.pdf")).toBe(true);
    expect(isSafeArtifactBasename("a_b-c.png")).toBe(true);
  });

  test("rejects path traversal and non-allowed extensions", () => {
    expect(isSafeArtifactBasename("../etc/passwd")).toBe(false);
    expect(isSafeArtifactBasename("a1.exe")).toBe(false);
    expect(isSafeArtifactBasename("a1.svg.exe")).toBe(false);
  });
});

describe("resolveExportArtifactPath priority", () => {
  test("prefers metadata.svgOutputFile basename when available", () => {
    expect(resolveExportArtifactPath(fileTransportSheet())).toBe(
      "/api/a1/compose-output/a1-design-x-1-aaaaaaaa.svg",
    );
  });

  test("falls back to artifacts.a1Sheet.svgOutputFile when metadata is absent", () => {
    const sheet = {
      metadata: { designId: "x" },
      artifacts: {
        a1Sheet: {
          svgOutputFile:
            "/abs/qa_results/a1_compose_outputs/a1-y-2-bbbbbbbb.svg",
        },
      },
    };
    expect(resolveExportArtifactPath(sheet)).toBe(
      "/api/a1/compose-output/a1-y-2-bbbbbbbb.svg",
    );
  });

  test("falls back to legacy PNG file-transport metadata.outputFile", () => {
    const sheet = {
      metadata: {
        designId: "x",
        transport: "file",
        outputFile:
          "/abs/qa_results/a1_compose_outputs/a1-design-png-3-cccccccc.png",
      },
    };
    expect(resolveExportArtifactPath(sheet)).toBe(
      "/api/a1/compose-output/a1-design-png-3-cccccccc.png",
    );
  });

  test("returns inline data URL when small and no file-transport reference", () => {
    const sheet = inlineDataUrlSheet("<svg></svg>");
    expect(resolveExportArtifactPath(sheet)).toMatch(/^data:image\/svg\+xml/);
  });

  test("returns null when only oversized data URL is available", () => {
    const big =
      "<svg>" + "a".repeat(EXPORT_REQUEST_INLINE_BUDGET_BYTES) + "</svg>";
    const sheet = {
      metadata: { designId: "x" },
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(big)}`,
    };
    expect(resolveExportArtifactPath(sheet)).toBeNull();
  });

  test("returns compose-output path when sheet.url is /api/a1/compose-output/...", () => {
    // V2 multi-panel pipeline can surface the sheet via a direct
    // compose-output URL; the resolver must prefer it over inline data URLs.
    const sheet = {
      metadata: { designId: "x" },
      url: "/api/a1/compose-output/a1-cs-1-abcdef01.png",
    };
    expect(resolveExportArtifactPath(sheet)).toBe(
      "/api/a1/compose-output/a1-cs-1-abcdef01.png",
    );
  });

  test("rejects compose-output URLs with unsafe basenames", () => {
    const sheet = {
      metadata: { designId: "x" },
      url: "/api/a1/compose-output/../etc/passwd",
    };
    // Falls through to inline data URL fallback (which is absent here) →
    // null. The point is we never echo a traversal-style basename back.
    expect(resolveExportArtifactPath(sheet)).toBeNull();
  });
});

describe("exportSheetServerSide → /api/a1/export", () => {
  test("never POSTs /api/sheet and never sends an imageUrl key", async () => {
    global.fetch = jest.fn().mockResolvedValue(pngResponse());

    const result = await exportService.exportSheetServerSide({
      sheet: fileTransportSheet(),
      format: "PNG",
      env: null,
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe("PNG");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [calledUrl, init] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe("/api/a1/export");
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty("imageUrl");
    expect(typeof body.artifactPath).toBe("string");
    expect(body.artifactPath.startsWith("data:")).toBe(false);
    expect(body.artifactPath).toBe(
      "/api/a1/compose-output/a1-design-x-1-aaaaaaaa.svg",
    );
    expect(body.designId).toBe("design-x");
    expect(body.format).toBe("png");
    expect(body.sheetHash).toBe("geom-hash-123");
  });

  test("file-transport request body stays under 1 KB", async () => {
    global.fetch = jest.fn().mockResolvedValue(pngResponse());

    await exportService.exportSheetServerSide({
      sheet: fileTransportSheet(),
      format: "PNG",
      env: null,
    });

    const [, init] = global.fetch.mock.calls[0];
    expect(init.body.length).toBeLessThan(1024);
  });

  test("inline data URL fallback stays within the 256 KB budget", async () => {
    global.fetch = jest.fn().mockResolvedValue(pngResponse());

    const sheet = inlineDataUrlSheet("<svg/>"); // tiny SVG
    await exportService.exportSheetServerSide({
      sheet,
      format: "PNG",
      env: null,
    });

    const [, init] = global.fetch.mock.calls[0];
    expect(init.body.length).toBeLessThanOrEqual(256 * 1024);
    const body = JSON.parse(init.body);
    expect(body.artifactPath).toMatch(/^data:image\/svg\+xml/);
  });

  test("oversized inline SVG with no file-transport throws before fetch", async () => {
    global.fetch = jest.fn();

    const big =
      "<svg>" + "a".repeat(EXPORT_REQUEST_INLINE_BUDGET_BYTES) + "</svg>";
    const sheet = {
      metadata: { designId: "x" },
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(big)}`,
    };

    await expect(
      exportService.exportSheetServerSide({ sheet, format: "PNG", env: null }),
    ).rejects.toThrow(/unavailable for export/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("PDF format passes pdfArtifactPath when available", async () => {
    global.fetch = jest.fn().mockResolvedValue(pdfResponse());

    const sheet = {
      ...fileTransportSheet(),
      metadata: {
        ...fileTransportSheet().metadata,
        pdfOutputFile:
          "/abs/qa_results/a1_compose_outputs/a1-design-x-1-aaaaaaaa.pdf",
      },
    };

    await exportService.exportSheetServerSide({
      sheet,
      format: "PDF",
      env: null,
    });

    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.format).toBe("pdf");
    expect(body.pdfArtifactPath).toBe(
      "/api/a1/compose-output/a1-design-x-1-aaaaaaaa.pdf",
    );
  });

  test("server 5xx surfaces error message verbatim", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: headerBag({ "Content-Type": "application/json" }),
      json: () =>
        Promise.resolve({
          success: false,
          error: {
            code: "FINAL_A1_RASTER_TOO_SMALL",
            message: "Raster too small for final A1.",
          },
        }),
    });

    await expect(
      exportService.exportSheetServerSide({
        sheet: fileTransportSheet(),
        format: "PDF",
        env: null,
      }),
    ).rejects.toThrow(/Raster too small for final A1/);
  });

  test("binary response is validated by magic bytes and downloaded", async () => {
    global.fetch = jest.fn().mockResolvedValue(pngResponse());

    const result = await exportService.exportSheetServerSide({
      sheet: fileTransportSheet(),
      format: "PNG",
      env: null,
    });

    expect(result.success).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(result.builderPath).toBeNull();
  });

  test("Content-Disposition filename is used; X-A1-Export-Builder is surfaced", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      pngResponse({
        "Content-Disposition": 'attachment; filename="customName.png"',
        "X-A1-Export-Builder": "sharp_svg_to_png",
      }),
    );

    const result = await exportService.exportSheetServerSide({
      sheet: fileTransportSheet(),
      format: "PNG",
      env: null,
    });

    expect(result.filename).toBe("customName.png");
    expect(result.builderPath).toBe("sharp_svg_to_png");
  });
});

describe("magic-byte validators", () => {
  test("validatePngMagicBytes rejects blob whose bytes start with <svg", async () => {
    const blob = new Blob(["<svg/>"], { type: "image/png" });
    await expect(validatePngMagicBytes(blob)).rejects.toThrow(/PNG signature/);
  });

  test("validatePdfMagicBytes rejects blob starting with <html>", async () => {
    const blob = new Blob(["<html>err</html>"], { type: "application/pdf" });
    await expect(validatePdfMagicBytes(blob)).rejects.toThrow(/%PDF/);
  });

  test("validateSvgMagicBytes accepts blob starting with <svg", async () => {
    const blob = new Blob(["<svg></svg>"], { type: "image/svg+xml" });
    await expect(validateSvgMagicBytes(blob)).resolves.toBeUndefined();
  });

  test("validateSvgMagicBytes accepts blob starting with <?xml after BOM", async () => {
    // Hand-rolled bytes — TextEncoder is not available in CRA's jsdom runtime.
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf, // UTF-8 BOM
      0x3c,
      0x3f,
      0x78,
      0x6d,
      0x6c, // "<?xml"
      0x20,
      0x2f,
      0x3e, // " />"
    ]);
    const blob = new Blob([bytes], { type: "image/svg+xml" });
    await expect(validateSvgMagicBytes(blob)).resolves.toBeUndefined();
  });

  test("all validators reject empty blobs", async () => {
    const empty = new Blob([], { type: "image/png" });
    await expect(validatePngMagicBytes(empty)).rejects.toThrow(/empty/);
    await expect(validatePdfMagicBytes(empty)).rejects.toThrow(/empty/);
    await expect(validateSvgMagicBytes(empty)).rejects.toThrow(/empty/);
  });
});

// Phase 1 export-fix: durable artifactRef takes priority over filesystem
// reference, so production exports survive Vercel cold-start without a
// large data URL fallback. The request body must include `artifactRef`
// (and omit `artifactPath` when artifactRef is available).
describe("resolveExportArtifactRef + body priority", () => {
  test("returns null when no svgArtifactRef present", () => {
    expect(resolveExportArtifactRef({ artifacts: { a1Sheet: {} } })).toBeNull();
  });

  test("returns null when svgArtifactRef.available === false", () => {
    expect(
      resolveExportArtifactRef({
        artifacts: {
          a1Sheet: {
            svgArtifactRef: {
              packageId: "p",
              kind: "a1-sheet-svg",
              available: false,
            },
          },
        },
      }),
    ).toBeNull();
  });

  test("returns compact {packageId, kind} when ref is available", () => {
    expect(
      resolveExportArtifactRef({
        artifacts: {
          a1Sheet: {
            svgArtifactRef: {
              packageId: "pkg-1",
              kind: "a1-sheet-svg",
              adapter: "memory",
              available: true,
            },
          },
        },
      }),
    ).toEqual({ packageId: "pkg-1", kind: "a1-sheet-svg" });
  });

  test("exportSheetServerSide prefers artifactRef over artifactPath when both are available", async () => {
    global.fetch = jest.fn().mockResolvedValue(pngResponse());

    const sheet = {
      ...fileTransportSheet(),
      artifacts: {
        a1Sheet: {
          // Filesystem path is also present, but the durable ref must win.
          svgOutputFile: "/abs/qa_results/a1_compose_outputs/a1-x.svg",
          svgArtifactRef: {
            packageId: "pkg-priority",
            kind: "a1-sheet-svg",
            adapter: "s3",
            available: true,
          },
        },
      },
    };

    await exportService.exportSheetServerSide({
      sheet,
      format: "PNG",
      env: null,
    });

    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.artifactRef).toEqual({
      packageId: "pkg-priority",
      kind: "a1-sheet-svg",
    });
    expect(body).not.toHaveProperty("artifactPath");
    expect(body).not.toHaveProperty("imageUrl");
  });

  test("falls back to artifactPath when artifactRef is unavailable", async () => {
    global.fetch = jest.fn().mockResolvedValue(pngResponse());

    await exportService.exportSheetServerSide({
      sheet: fileTransportSheet(),
      format: "PNG",
      env: null,
    });

    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty("artifactRef");
    expect(body.artifactPath).toMatch(/^\/api\/a1\/compose-output\//);
  });
});
