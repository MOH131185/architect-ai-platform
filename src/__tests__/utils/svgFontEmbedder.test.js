import {
  embedFontInSVG,
  ensureFontsLoaded,
} from "../../utils/svgFontEmbedder.js";

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
  '<text x="10" y="25" font-family="Arial, sans-serif">Hello</text>' +
  "</svg>";

describe("svgFontEmbedder", () => {
  test("ensureFontsLoaded resolves with at least a regular face (bundled @fontsource)", async () => {
    const fonts = await ensureFontsLoaded();
    expect(fonts).toBeDefined();
    expect(fonts.regular).not.toBeNull();
    expect(fonts.regular.base64).toBeTruthy();
    expect(fonts.regular.mime).toMatch(/^font\/(ttf|woff2?|otf)$/);
  });

  test("embedFontInSVG injects an @font-face rule with base64 data", async () => {
    const out = await embedFontInSVG(SAMPLE_SVG);
    expect(out).toContain("@font-face");
    expect(out).toContain("EmbeddedSans");
    expect(out).toMatch(/base64,[A-Za-z0-9+/=]{100,}/);
  });

  test("embedFontInSVG rewrites literal Arial font-family to EmbeddedSans fallback", async () => {
    const out = await embedFontInSVG(SAMPLE_SVG);
    expect(out).toContain("EmbeddedSans");
    // The original Arial-only attribute should have been normalised.
    expect(out).not.toMatch(/font-family="Arial, sans-serif"/);
  });

  test("embedFontInSVG leaves EmbeddedSans-prefixed font-family attributes untouched", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="EmbeddedSans, Arial">x</text></svg>';
    const out = await embedFontInSVG(svg);
    expect(out).toContain('font-family="EmbeddedSans, Arial"');
  });

  test("embedFontInSVG tolerates empty or non-string input", async () => {
    await expect(embedFontInSVG("")).resolves.toBe("");
    await expect(embedFontInSVG(null)).resolves.toBe(null);
    await expect(embedFontInSVG(undefined)).resolves.toBe(undefined);
  });
});
