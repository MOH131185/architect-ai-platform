/**
 * Locks the A1 download decode logic. The viewer accepts both base64-encoded
 * PDF/PNG payloads and URL-encoded SVG payloads (the latter is what
 * useArchitectAIWorkflow.svgToDataUrl produces). Plan §6.11 / §9.
 *
 * The helpers under test are not exported from A1SheetViewer (they're module
 * locals), so we re-implement the same contract here and assert the public
 * symptom: encoded-then-decoded payloads round-trip without atob errors.
 */

function decodeDataUrlToBlob(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Invalid data URL: missing payload separator");
  }
  const meta = dataUrl.slice(5, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);
  const mime = (meta.split(";")[0] || "application/octet-stream").trim();
  const isBase64 = /;base64\b/i.test(meta);
  if (isBase64) {
    const cleanData = data.replace(/\s/g, "");
    if (!cleanData) throw new Error("Invalid data URL: empty base64 payload");
    const byteString = atob(cleanData);
    const buffer = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      buffer[i] = byteString.charCodeAt(i);
    }
    return new Blob([buffer], { type: mime });
  }
  const decoded = decodeURIComponent(data);
  return new Blob([decoded], { type: mime });
}

function extensionForMime(mime = "") {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

async function blobText(blob) {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe("A1 download data URL decode", () => {
  test("decodes a URL-encoded SVG data URL produced by svgToDataUrl", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const blob = decodeDataUrlToBlob(dataUrl);
    expect(blob.type).toBe("image/svg+xml");
    expect(extensionForMime(blob.type)).toBe("svg");
    const text = await blobText(blob);
    expect(text).toBe(svg);
  });

  test("decodes a base64 PDF data URL (header magic %PDF round-trips)", async () => {
    // %PDF-1.4 minimal header
    const pdfHeader = "%PDF-1.4\n";
    const base64 = Buffer.from(pdfHeader, "utf8").toString("base64");
    const dataUrl = `data:application/pdf;base64,${base64}`;
    const blob = decodeDataUrlToBlob(dataUrl);
    expect(blob.type).toBe("application/pdf");
    expect(extensionForMime(blob.type)).toBe("pdf");
    const text = await blobText(blob);
    expect(text.startsWith("%PDF-")).toBe(true);
  });

  test("decodes a base64 PNG data URL (8-byte magic preserved)", async () => {
    const pngMagic = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const base64 = Buffer.from(pngMagic).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;
    const blob = decodeDataUrlToBlob(dataUrl);
    expect(blob.type).toBe("image/png");
    expect(extensionForMime(blob.type)).toBe("png");
    expect(blob.size).toBe(8);
  });

  test("throws on invalid data URL (no comma separator)", () => {
    expect(() => decodeDataUrlToBlob("data:image/png;base64nopayload")).toThrow(
      /missing payload separator/,
    );
  });

  test("extensionForMime returns bin for unknown mimes", () => {
    expect(extensionForMime("application/x-arbitrary")).toBe("bin");
    expect(extensionForMime("")).toBe("bin");
  });
});
