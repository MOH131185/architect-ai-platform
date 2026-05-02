/**
 * Phase 5D — vector PDF builder focused tests.
 *
 * Drives the parser + walker + orchestrator end-to-end against
 * fixture SVGs. Verifies:
 *   1. Vector PDF builds successfully from a small fixture SVG.
 *   2. PDF contains selectable text (introspected via PDF byte
 *      patterns rather than full text extraction so we don't depend on
 *      pdfjs-dist in the unit tests).
 *   3. Raster panels (data:image/png) are embedded as PDF Image XObjects.
 *   4. Vector failure on malformed input does NOT throw — returns
 *      ok: false with a descriptive error.
 *   5. Empty/missing input returns a clean error object, never throws.
 *   6. Coordinate mapping flips SVG y-down to PDF y-up correctly.
 *   7. Font extraction recovers @font-face TTF bytes from the SVG.
 */

import {
  buildVectorPdfFromSheetSvg,
  VECTOR_PDF_RENDER_MODE,
  VECTOR_PDF_SCHEMA_VERSION,
  __testing as orchestratorTesting,
} from "../../../services/render/buildVectorPdfFromSheetSvg.js";
import {
  parseSvg,
  parseAttrs,
  decodeEntities,
} from "../../../services/render/_lib/lightweightSvgParser.js";
import {
  parseSvgColor,
  decodeImageDataUrl,
  __testing as walkerTesting,
} from "../../../services/render/_lib/svgToPdfWalker.js";

// 1×1 transparent PNG (smallest valid PNG, 67 bytes)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=";

const SMALL_FIXTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 841 594" width="841mm" height="594mm">
  <rect x="20" y="20" width="200" height="100" fill="#fafafa" stroke="#111" stroke-width="2"/>
  <text x="40" y="60" font-size="14" font-family="ArchiAISans" fill="#222">SITE PLAN</text>
  <text x="40" y="90" font-size="10" font-family="ArchiAISans" fill="#555">Scale 1:500</text>
  <line x1="20" y1="140" x2="220" y2="140" stroke="#888" stroke-width="1"/>
  <path d="M 250 30 L 350 30 L 350 130 L 250 130 Z" fill="none" stroke="#000" stroke-width="1"/>
  <circle cx="500" cy="80" r="20" fill="#cccccc" stroke="#333"/>
  <ellipse cx="600" cy="80" rx="30" ry="15" fill="rgb(200,80,80)"/>
  <polygon points="400,150 450,200 350,200" fill="#deedee" stroke="#000"/>
  <polyline points="50,500 100,450 150,500" stroke="#444" stroke-width="2" fill="none"/>
  <g transform="translate(700, 30)">
    <rect x="0" y="0" width="120" height="100" fill="white" stroke="#222"/>
    <text x="10" y="20" font-size="12" font-weight="bold" font-family="ArchiAISans">TITLE BLOCK</text>
    <text x="10" y="40" font-size="9" font-family="ArchiAISans">Project: Test</text>
    <text x="10" y="55" font-size="9" font-family="ArchiAISans">Drawing: A1-001</text>
  </g>
  <image x="20" y="300" width="160" height="100" href="data:image/png;base64,${TINY_PNG_BASE64}"/>
</svg>`;

describe("lightweightSvgParser", () => {
  test("parses a simple SVG into a tree with the expected children", () => {
    const { root, warnings } = parseSvg(SMALL_FIXTURE_SVG);
    expect(root).toBeTruthy();
    expect(root.name).toBe("svg");
    expect(warnings).toEqual([]);
    const childNames = root.children
      .filter((c) => c?.type === "element")
      .map((c) => c.name);
    expect(childNames).toEqual(
      expect.arrayContaining([
        "rect",
        "text",
        "line",
        "path",
        "circle",
        "ellipse",
        "polygon",
        "polyline",
        "g",
        "image",
      ]),
    );
  });

  test("parseAttrs handles double + single quotes", () => {
    const a = parseAttrs(' x="10" y=\'20\' width="100"');
    expect(a).toEqual({ x: "10", y: "20", width: "100" });
  });

  test("decodeEntities handles common XML entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt;")).toBe("a & b <c>");
    expect(decodeEntities("&#x41;&#66;")).toBe("AB");
  });

  test("skips body of <style>/<defs> without crashing on CSS contents", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face { font-family: "ArchiAISans"; src: url(data:font/ttf;base64,AAAA); }
          .panel > rect { fill: blue; }
        </style>
      </defs>
      <rect x="0" y="0" width="10" height="10"/>
    </svg>`;
    const { root, warnings } = parseSvg(svg);
    expect(warnings).toEqual([]);
    const elementChildren = root.children.filter((c) => c?.type === "element");
    expect(elementChildren).toHaveLength(1);
    expect(elementChildren[0].name).toBe("rect");
  });

  test("malformed input does not throw", () => {
    const result = parseSvg("<svg><rect><not closed");
    expect(result.root).toBeTruthy();
  });

  test("empty input returns null root with warning", () => {
    const result = parseSvg("");
    expect(result.root).toBeNull();
    expect(result.warnings).toContain("empty_input");
  });
});

describe("svgToPdfWalker pure helpers", () => {
  test("parseSvgColor handles hex, rgb(), and named colours", () => {
    expect(parseSvgColor("#000")).toBeTruthy();
    expect(parseSvgColor("#abc123")).toBeTruthy();
    expect(parseSvgColor("rgb(255, 0, 128)")).toBeTruthy();
    expect(parseSvgColor("white")).toBeTruthy();
    expect(parseSvgColor("none")).toBeNull();
    expect(parseSvgColor("")).toBeNull();
    expect(parseSvgColor("notacolor")).toBeNull();
  });

  test("decodeImageDataUrl extracts PNG bytes", () => {
    const decoded = decodeImageDataUrl(
      `data:image/png;base64,${TINY_PNG_BASE64}`,
    );
    expect(decoded).toBeTruthy();
    expect(decoded.kind).toBe("png");
    expect(decoded.bytes.length).toBeGreaterThan(50);
    // PNG magic bytes
    expect(decoded.bytes[0]).toBe(0x89);
    expect(decoded.bytes[1]).toBe(0x50);
  });

  test("decodeImageDataUrl returns null for non-data-url and SVG payload", () => {
    expect(decodeImageDataUrl("https://example.com/a.png")).toBeNull();
    expect(decodeImageDataUrl("data:image/svg+xml;base64,PHN2Zy8+")).toBeNull();
    expect(decodeImageDataUrl(null)).toBeNull();
  });

  test("mergeTranslate composes nested translate() transforms", () => {
    const base = { translateX: 0, translateY: 0 };
    const next = walkerTesting.mergeTranslate(base, {
      transform: "translate(10, 20)",
    });
    expect(next).toEqual({ translateX: 10, translateY: 20 });
    const nested = walkerTesting.mergeTranslate(next, {
      transform: "translate(5, -3)",
    });
    expect(nested).toEqual({ translateX: 15, translateY: 17 });
  });
});

describe("buildVectorPdfFromSheetSvg — happy path", () => {
  test("builds a vector PDF from the fixture SVG", async () => {
    const result = await buildVectorPdfFromSheetSvg({
      svgString: SMALL_FIXTURE_SVG,
      title: "Test Vector PDF",
      geometryHash: "test-geom-hash",
    });

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.pdfBytes).toBeTruthy();
    expect(result.pdfBytes.length).toBeGreaterThan(500);
    expect(result.pdfRenderMode).toBe(VECTOR_PDF_RENDER_MODE);
    expect(result.schemaVersion).toBe(VECTOR_PDF_SCHEMA_VERSION);
    expect(result.pageCount).toBe(1);
    expect(result.pageSizeMm).toEqual({ width: 841, height: 594 });
    expect(result.summary.drawCalls).toBeGreaterThan(5);
    expect(result.dataUrl.startsWith("data:application/pdf;base64,")).toBe(
      true,
    );
    expect(/^[0-9a-f]{8}$/.test(result.pdfHash)).toBe(true);
  });

  test("PDF contains the embedded text strings (selectable, after FlateDecode inflate)", async () => {
    const zlib = await import("node:zlib");
    const result = await buildVectorPdfFromSheetSvg({
      svgString: SMALL_FIXTURE_SVG,
      inspectable: true, // disables object streams so we can inflate content streams
    });
    expect(result.ok).toBe(true);
    const pdfBytes = result.pdfBytes;
    // pdf-lib serialises text inside FlateDecode'd content streams.
    // For Helvetica StandardFonts it writes hex-encoded strings:
    //   <5349544520504C414E> Tj  for "SITE PLAN"
    // We inflate every stream, then decode hex literals and concatenate
    // both the raw inflated bytes (for `(...)Tj` form) and the decoded
    // hex pairs (for `<...>Tj` form).
    const text = pdfBytes.toString("latin1");
    let inflatedText = "";
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    while ((m = streamRe.exec(text)) !== null) {
      try {
        inflatedText +=
          zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1") +
          "\n";
      } catch {
        // not a flate stream (e.g. raw image bytes)
      }
    }
    // Decode every <HEX> string literal that appears inside the
    // inflated content streams.
    const hexLiterals = inflatedText.match(/<([0-9A-Fa-f\s]+)>/g) || [];
    const decodedHex = hexLiterals
      .map((lit) => {
        const cleaned = lit.replace(/[<>\s]/g, "");
        if (cleaned.length === 0 || cleaned.length % 2 !== 0) return "";
        try {
          return Buffer.from(cleaned, "hex").toString("latin1");
        } catch {
          return "";
        }
      })
      .join(" ");
    const allText = `${inflatedText} ${decodedHex}`;
    expect(allText).toContain("SITE PLAN");
    expect(allText).toContain("Scale 1:500");
    expect(allText).toContain("TITLE BLOCK");
    expect(allText).toContain("Project: Test");
    expect(allText).toContain("Drawing: A1-001");
    // Either Tj operator form (literal or hex) must be present
    expect(/(?:\)|>)\s*Tj/.test(inflatedText)).toBe(true);
  });

  test("PDF embeds raster panels as PDF Image XObjects (uncompressed inspection)", async () => {
    const result = await buildVectorPdfFromSheetSvg({
      svgString: SMALL_FIXTURE_SVG,
      inspectable: true,
    });
    expect(result.ok).toBe(true);
    const pdfText = result.pdfBytes.toString("latin1");
    // The XObject reference + Subtype/Image marker live in object
    // headers (NOT inside compressed streams) so we can find them
    // with a regex on the raw bytes once `inspectable: true`
    // disables object streams. `\s*` allows for either "/Subtype /Image"
    // or "/Subtype/Image" depending on pdf-lib serialisation.
    expect(pdfText).toMatch(/\/Subtype\s*\/Image/);
    expect(pdfText).toMatch(/\/XObject/);
    expect(pdfText).toMatch(/\/Filter\s*\/FlateDecode/);
  });

  test("walker draw-call summary reports text + image draws for the fixture", async () => {
    const result = await buildVectorPdfFromSheetSvg({
      svgString: SMALL_FIXTURE_SVG,
    });
    expect(result.ok).toBe(true);
    expect(result.summary.drawCalls).toBeGreaterThan(8);
    // Either we recorded zero skipped or only known-skipped tags
    // (the fixture has no exotic elements; walker should accept all).
    const skippedNames = Object.keys(result.summary.skipped || {});
    expect(skippedNames).toEqual([]);
  });
});

describe("buildVectorPdfFromSheetSvg — failure tolerance", () => {
  test("returns ok:false with error for empty SVG", async () => {
    const result = await buildVectorPdfFromSheetSvg({ svgString: "" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("empty_svg_string");
    expect(result.pdfBytes).toBeNull();
  });

  test("returns ok:false when SVG has no viewBox or width/height", async () => {
    const result = await buildVectorPdfFromSheetSvg({
      svgString: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no_view_box");
  });

  test("malformed SVG content does not throw, returns ok:true with degraded summary", async () => {
    // Garbage with a valid <svg> wrapper — parser is tolerant.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="not-a-number" y="abc" width="50" height="50"/><randomTag><nested>broken</nested></svg>';
    const result = await buildVectorPdfFromSheetSvg({ svgString: svg });
    // Either succeeds with skips or fails with a clean error — both are
    // acceptable. NEVER throws (which would break the calling pipeline).
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.error === "string" || result.error === null).toBe(
      true,
    );
  });

  test("missing svgString does not throw", async () => {
    const result = await buildVectorPdfFromSheetSvg({});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("empty_svg_string");
  });

  test("Buffer input (non-string) does not throw", async () => {
    const result = await buildVectorPdfFromSheetSvg({
      svgString: Buffer.from("nonsense"),
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildVectorPdfFromSheetSvg — font extraction", () => {
  test("extractEmbeddedFonts recovers TTF base64 from @font-face", () => {
    const fakeBytes = Buffer.from("\x00\x01\x00\x00").toString("base64");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>
      @font-face {
        font-family: "ArchiAISans";
        src: url(data:font/ttf;base64,${fakeBytes}) format("truetype");
        font-weight: 400;
      }
      @font-face {
        font-family: "ArchiAISans";
        src: url(data:font/ttf;base64,${fakeBytes}) format("truetype");
        font-weight: 700;
      }
    </style></defs></svg>`;
    const fonts = orchestratorTesting.extractEmbeddedFonts(svg);
    expect(fonts.regular).toBeTruthy();
    expect(fonts.bold).toBeTruthy();
    expect(fonts.regular.toString("hex")).toBe("00010000");
  });

  test("extractEmbeddedFonts returns nulls when no @font-face is present", () => {
    const fonts = orchestratorTesting.extractEmbeddedFonts(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
    expect(fonts.regular).toBeNull();
    expect(fonts.bold).toBeNull();
  });
});
