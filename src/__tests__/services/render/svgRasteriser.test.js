import {
  rasteriseSvgToPng,
  rasteriseSheetArtifact,
  __internal,
} from "../../../services/render/svgRasteriser.js";

const SIMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="#fff"/>
  <rect x="10" y="10" width="80" height="40" fill="#142033"/>
  <text x="50" y="80" font-size="14" fill="#142033">Hello</text>
</svg>`;

function isPngBuffer(buf) {
  if (!buf || buf.length < 8) return false;
  return (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

describe("rasteriseSvgToPng", () => {
  test("rejects empty input", async () => {
    await expect(rasteriseSvgToPng({})).rejects.toThrow(/svg input/);
  });

  test("rejects non-string/non-buffer input", async () => {
    await expect(rasteriseSvgToPng({ svg: 42 })).rejects.toThrow(
      /string, Buffer/,
    );
  });

  test("converts a simple SVG to a valid PNG buffer", async () => {
    const out = await rasteriseSvgToPng({ svg: SIMPLE_SVG });
    expect(isPngBuffer(out.pngBuffer)).toBe(true);
    expect(out.metadata.width_px).toBeGreaterThan(100);
    expect(out.metadata.height_px).toBeGreaterThan(50);
    expect(out.metadata.size_bytes).toBe(out.pngBuffer.length);
    expect(out.metadata.rasteriser).toBe(__internal.RASTERISER_VERSION);
  });

  test("respects fixed widthPx by scaling within fit:inside", async () => {
    const out = await rasteriseSvgToPng({ svg: SIMPLE_SVG, widthPx: 400 });
    expect(out.metadata.width_px).toBeLessThanOrEqual(400);
    expect(isPngBuffer(out.pngBuffer)).toBe(true);
  });

  test("attaches provenance into metadata.provenance", async () => {
    const out = await rasteriseSvgToPng({
      svg: SIMPLE_SVG,
      provenance: {
        source: "test",
        source_model_hash: "abc",
      },
    });
    expect(out.metadata.provenance.source).toBe("test");
    expect(out.metadata.provenance.source_model_hash).toBe("abc");
    expect(out.metadata.provenance.rasteriser_version).toBe(
      __internal.RASTERISER_VERSION,
    );
  });
});

describe("rasteriseSheetArtifact", () => {
  test("throws when sheetArtifact lacks svgString", async () => {
    await expect(rasteriseSheetArtifact({ sheetArtifact: {} })).rejects.toThrow(
      /svgString/,
    );
  });

  test("rasterises and propagates source_svg_hash + source_model_hash", async () => {
    const sheetArtifact = {
      asset_id: "asset-test",
      svgString: SIMPLE_SVG,
      svgHash: "svg-hash-1",
      source_model_hash: "model-hash-1",
      drawing_number: "A1-01",
      sheet_label: "Test Sheet",
    };
    const out = await rasteriseSheetArtifact({ sheetArtifact });
    expect(isPngBuffer(out.pngBuffer)).toBe(true);
    expect(out.metadata.provenance.source_svg_hash).toBe("svg-hash-1");
    expect(out.metadata.provenance.source_model_hash).toBe("model-hash-1");
    expect(out.metadata.provenance.drawing_number).toBe("A1-01");
  });
});
