import {
  expandTspansToTextElements,
  inspectSvgTextPathStatus,
} from "../../utils/svgTextPathConverter.js";

describe("expandTspansToTextElements (Phase A2 tspan preservation)", () => {
  test("passes through SVG with no tspan children unchanged", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">HELLO</text></svg>';
    const out = expandTspansToTextElements(svg);
    expect(out).toBe(svg);
  });

  test("collapses single-line tspan with no positioning unchanged", () => {
    const svg =
      '<svg><text x="10" y="20"><tspan font-weight="700">HELLO</tspan></text></svg>';
    const out = expandTspansToTextElements(svg);
    // No positioning override in tspan → leave as-is.
    expect(out).toBe(svg);
  });

  test("expands tspans with explicit x/y into N sibling text elements at N anchors", () => {
    const svg =
      '<svg><text font-size="10" fill="#111"><tspan x="10" y="20">A</tspan><tspan x="10" y="40">B</tspan><tspan x="10" y="60">C</tspan></text></svg>';
    const out = expandTspansToTextElements(svg);
    const textElementCount = (out.match(/<text\b/gi) || []).length;
    expect(textElementCount).toBe(3);
    expect(out).toContain('y="20"');
    expect(out).toContain('y="40"');
    expect(out).toContain('y="60"');
    expect(out).toContain(">A<");
    expect(out).toContain(">B<");
    expect(out).toContain(">C<");
    // Parent attrs (font-size, fill) should be carried onto each child text.
    const fontSizeMatches = out.match(/font-size="10"/g) || [];
    expect(fontSizeMatches.length).toBe(3);
  });

  test("expands tspans using only dy into cumulative absolute y anchors", () => {
    // Parent y=20, children dy of 12 each → expected anchors at 32, 44, 56.
    const svg =
      '<svg><text x="10" y="20" font-size="10"><tspan dy="12">A</tspan><tspan dy="12">B</tspan><tspan dy="12">C</tspan></text></svg>';
    const out = expandTspansToTextElements(svg);
    expect(out).toContain('y="32"');
    expect(out).toContain('y="44"');
    expect(out).toContain('y="56"');
  });

  test("mixed: parent has x/y, children mix explicit y and dy", () => {
    const svg =
      '<svg><text x="50" y="100" font-size="9"><tspan>A</tspan><tspan y="120">B</tspan><tspan dy="15">C</tspan></text></svg>';
    const out = expandTspansToTextElements(svg);
    // First child has no positioning override → not foundExplicitPositioning yet,
    // but second has y=120 which triggers expansion. Cursor at start: x=50, y=100.
    // tspan 1: no override → cursor stays (50,100)
    // tspan 2: y=120 → cursor (50,120)
    // tspan 3: dy=15 → cursor (50,135)
    expect(out).toContain('y="100"');
    expect(out).toContain('y="120"');
    expect(out).toContain('y="135"');
  });

  test("does not lose the source attribute order or extra attributes", () => {
    const svg =
      '<svg><text x="0" y="0" font-family="Arial" font-weight="700" fill="#000"><tspan x="10" y="20">A</tspan><tspan x="10" y="40">B</tspan></text></svg>';
    const out = expandTspansToTextElements(svg);
    expect(out).toContain('font-family="Arial"');
    expect(out).toContain('font-weight="700"');
    expect(out).toContain('fill="#000"');
  });
});

describe("inspectSvgTextPathStatus", () => {
  test("reports svg_text mode when there are unconverted text elements", () => {
    const svg = '<svg><text x="10" y="20">HELLO</text></svg>';
    const status = inspectSvgTextPathStatus(svg);
    expect(status.mode).toBe("svg_text");
    expect(status.textElementCount).toBe(1);
  });

  test("reports font_paths mode and pass when raster mode marker is present", () => {
    const svg =
      '<svg data-raster-text-mode="font-paths"><path d="M0 0 L10 0" data-text-path="true" data-text-value="HELLO"/></svg>';
    const status = inspectSvgTextPathStatus(svg);
    expect(status.mode).toBe("font_paths");
    expect(status.status).toBe("pass");
    expect(status.pathTextCount).toBe(1);
  });
});
