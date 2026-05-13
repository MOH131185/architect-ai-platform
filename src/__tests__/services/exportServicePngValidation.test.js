/**
 * PNG export validation guard for exportService.exportAsPNG.
 *
 * Asserts that the export path never silently saves a non-image as .png:
 *   - data:image/png;base64,<payload> succeeds
 *   - data:text/html,<payload> is rejected before any download attempt
 *   - bare data:image/png;base64, with no payload is rejected
 *   - URL response with Content-Type: text/html is rejected
 *   - URL response with empty body (blob.size === 0) is rejected
 *   - URL response with Content-Type: image/png succeeds and downloads
 *     via a validated blob URL — never via a raw <a> href to the source
 */

import exportService from "../../services/exportService.js";

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
        (h) => h.toLowerCase() === name.toLowerCase(),
      );
      return key ? headers[key] : null;
    },
  };
}

function baseSheet() {
  return {
    metadata: {
      designId: "design-x",
      sheetId: "sheet-x",
      sheetType: "ARCH",
      versionId: "base",
    },
  };
}

describe("exportService.exportAsPNG — non-image guard", () => {
  test("rejects data:text/html with a clear error and no download", async () => {
    // Phase 1 export-fix tightened the gate from `data:image/*` to
    // `data:image/png` — `data:text/html,...` still throws, with a more
    // specific message.
    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: "data:text/html,<h1>not a png</h1>",
      }),
    ).rejects.toThrow(/data:image\/png/i);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("rejects an empty data:image/png URL with no payload", async () => {
    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: "data:image/png;base64,",
      }),
    ).rejects.toThrow(/payload|empty/i);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("accepts a valid data:image/png URL and triggers a blob download", async () => {
    // Smallest possible PNG header (8-byte signature + IHDR start).
    // jsdom's fetch(dataURL) returns a Blob with this content.
    const pngBytes = Uint8Array.of(
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    );
    const b64 = Buffer.from(pngBytes).toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;

    // jsdom does not always implement fetch(data:...) reliably — stub
    // the conversion path explicitly to exercise the validation branch.
    const blob = new Blob([pngBytes], { type: "image/png" });
    jest.spyOn(exportService, "dataURLToBlob").mockResolvedValue(blob);

    const result = await exportService.exportAsPNG({
      ...baseSheet(),
      url: dataUrl,
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe("PNG");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  test("rejects URL response with Content-Type: text/html", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: headerBag({ "Content-Type": "text/html" }),
      blob: jest
        .fn()
        .mockResolvedValue(new Blob(["<html></html>"], { type: "text/html" })),
    });

    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: "https://example.test/oops",
      }),
    ).rejects.toThrow(/not an image/i);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("rejects URL response with empty body (blob.size === 0)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: headerBag({ "Content-Type": "image/png" }),
      blob: jest.fn().mockResolvedValue(new Blob([], { type: "image/png" })),
    });

    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: "https://example.test/empty.png",
      }),
    ).rejects.toThrow(/empty|0 bytes/i);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("rejects URL response with non-OK HTTP status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: headerBag({}),
      blob: jest.fn().mockResolvedValue(new Blob([])),
    });

    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: "https://example.test/boom.png",
      }),
    ).rejects.toThrow(/500/);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("accepts URL response with image/png and downloads via blob URL (not source URL)", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const okBlob = new Blob([pngBytes], { type: "image/png" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: headerBag({ "Content-Type": "image/png" }),
      blob: jest.fn().mockResolvedValue(okBlob),
    });

    const result = await exportService.exportAsPNG({
      ...baseSheet(),
      url: "https://example.test/good.png",
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe("PNG");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(okBlob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  test("rejects when sheet.url is missing", async () => {
    await expect(exportService.exportAsPNG({ ...baseSheet() })).rejects.toThrow(
      /No valid image URL/i,
    );
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  // --- Phase 1 export-fix amendments ------------------------------------
  // The previous data URL gate was `^data:image\//i`, which let
  // `data:image/svg+xml,...` payloads through. After the magic-byte
  // tightening, only `data:image/png` is accepted on this path, and the
  // decoded bytes must start with the 8-byte PNG signature. These guards
  // prevent the historical bug where a `.png` file on disk was actually
  // SVG content and image viewers rejected it as corrupt.

  test("rejects data:image/svg+xml even when caller mislabels it as PNG", async () => {
    // A bad caller could try to smuggle SVG bytes through `exportAsPNG` by
    // passing `data:image/svg+xml;...`. After Phase 1, this fails at the
    // data URL gate, not silently downloaded as `.png`.
    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: "data:image/svg+xml;charset=utf-8,%3Csvg/%3E",
      }),
    ).rejects.toThrow(/data:image\/png/i);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("rejects data:image/png whose decoded bytes are actually <svg> markup", async () => {
    // MIME prefix says PNG but the bytes are SVG — exactly the masquerade
    // the original report describes. Magic-byte validation rejects it.
    const svgBytes = new TextEncoderShim().encode("<svg></svg>");
    const masquerade = `data:image/png;base64,${Buffer.from(svgBytes).toString("base64")}`;

    const blob = new Blob([svgBytes], { type: "image/png" });
    jest.spyOn(exportService, "dataURLToBlob").mockResolvedValue(blob);

    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: masquerade,
      }),
    ).rejects.toThrow(/PNG signature/i);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("rejects HTTP response with image/png CT but non-PNG bytes", async () => {
    const htmlBlob = new Blob(["<html>err</html>"], { type: "image/png" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: headerBag({ "Content-Type": "image/png" }),
      blob: jest.fn().mockResolvedValue(htmlBlob),
    });

    await expect(
      exportService.exportAsPNG({
        ...baseSheet(),
        url: "https://example.test/lies.png",
      }),
    ).rejects.toThrow(/PNG signature/i);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
});

// jsdom in CRA's test runtime ships without TextEncoder; provide a tiny
// ASCII-only encoder for the magic-byte masquerade fixtures above.
class TextEncoderShim {
  encode(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }
}
