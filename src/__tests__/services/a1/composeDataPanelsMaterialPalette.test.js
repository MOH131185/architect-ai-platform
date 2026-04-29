import {
  buildMaterialPaletteBuffer,
  buildMaterialPaletteSvg,
} from "../../../services/a1/composeDataPanels.js";

const SAMPLE_MASTER_DNA = {
  materials: [
    { name: "Red Multi Brick", hexColor: "#b6634a", application: "external wall" },
    {
      name: "Vertical Timber Cladding",
      hexColor: "#b08455",
      application: "facade accent",
    },
    {
      name: "Dark Grey Roof Tile",
      hexColor: "#343a40",
      application: "roof finish",
    },
    {
      name: "Anthracite Aluminium Frame",
      hexColor: "#4a4f55",
      application: "openings",
    },
    {
      name: "Timber Front Door",
      hexColor: "#6f4a2a",
      application: "entrance door",
    },
    {
      name: "Dark Metal Rainwater Goods",
      hexColor: "#2a2e33",
      application: "rainwater goods",
    },
    { name: "Light Render", hexColor: "#d7d2c8", application: "external wall" },
    {
      name: "Natural Stone Paving",
      hexColor: "#c1b8aa",
      application: "landscape",
    },
  ],
};

describe("composeDataPanels material palette (texture cards)", () => {
  test("buildMaterialPaletteSvg emits <pattern> defs and per-card metadata", () => {
    const { svgString, cardMetadata } = buildMaterialPaletteSvg(
      900,
      400,
      SAMPLE_MASTER_DNA,
      { FRAME_STROKE_COLOR: "#cbd5e1", FRAME_RADIUS: 4 },
    );

    expect(svgString).toContain("<pattern");
    expect(svgString).toContain("data-material-texture");
    expect(svgString).toContain("MATERIAL PALETTE");
    expect(cardMetadata.length).toBeLessThanOrEqual(8);
    expect(cardMetadata.length).toBeGreaterThan(0);

    cardMetadata.forEach((card) => {
      expect(card).toEqual(
        expect.objectContaining({
          materialSignature: expect.any(String),
          label: expect.any(String),
          textureKind: expect.any(String),
          source: "procedural_svg_pattern",
          fallbackAvailable: true,
        }),
      );
      expect(card.label.length).toBeGreaterThan(0);
      // ASCII-only label (no tofu glyphs)
      // eslint-disable-next-line no-control-regex
      expect(/^[\x20-\x7E]+$/.test(card.label)).toBe(true);
    });
  });

  test("falls back to canonical 8 materials when masterDNA has no materials", () => {
    const { svgString, cardMetadata } = buildMaterialPaletteSvg(
      900,
      400,
      {},
      { FRAME_STROKE_COLOR: "#cbd5e1", FRAME_RADIUS: 4 },
    );
    expect(svgString).toContain("<pattern");
    expect(cardMetadata.length).toBe(8);
    cardMetadata.forEach((card) => {
      expect(card.source).toBe("procedural_svg_pattern");
    });
  });

  test("compact mode (small panel) reduces card count without crashing", () => {
    const { cardMetadata, svgString } = buildMaterialPaletteSvg(
      220,
      220,
      SAMPLE_MASTER_DNA,
      {},
    );
    expect(cardMetadata.length).toBeLessThanOrEqual(4);
    expect(svgString).toContain("<pattern");
  });

  test("emits multiple distinct texture kinds for the canonical 8 fallback", () => {
    const { cardMetadata } = buildMaterialPaletteSvg(900, 400, {}, {});
    const kinds = new Set(cardMetadata.map((c) => c.textureKind));
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });

  test("buildMaterialPaletteBuffer returns a non-empty PNG buffer (raster smoke)", async () => {
    const sharp = (await import("sharp")).default;
    const buffer = await buildMaterialPaletteBuffer(
      sharp,
      900,
      400,
      SAMPLE_MASTER_DNA,
      { FRAME_STROKE_COLOR: "#cbd5e1", FRAME_RADIUS: 4 },
    );
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  }, 20000);
});
