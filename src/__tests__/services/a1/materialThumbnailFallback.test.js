import {
  buildMaterialPaletteCardsAsync,
  normalizeMaterialPaletteEntries,
} from "../../../services/a1/materialTexturePatterns.js";

const FIXED_MATERIALS = [
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
];

describe("optional AI texture thumbnail fallback", () => {
  test("flag disabled -> no provider call, all cards procedural", async () => {
    const provider = jest.fn();
    const { cardMetadata } = await buildMaterialPaletteCardsAsync({
      materials: FIXED_MATERIALS,
      thumbnailProvider: provider,
      env: { MATERIAL_TEXTURE_THUMBNAILS_ENABLED: "false" },
    });
    expect(provider).not.toHaveBeenCalled();
    cardMetadata.forEach((card) => {
      expect(card.source).toBe("procedural_svg_pattern");
      expect(card.fallbackAvailable).toBe(true);
    });
  });

  test("flag enabled but no provider -> procedural fallback, no calls", async () => {
    const { cardMetadata, cards } = await buildMaterialPaletteCardsAsync({
      materials: FIXED_MATERIALS,
      thumbnailProvider: null,
      env: { MATERIAL_TEXTURE_THUMBNAILS_ENABLED: "true" },
    });
    cardMetadata.forEach((card) =>
      expect(card.source).toBe("procedural_svg_pattern"),
    );
    expect(cards).not.toContain("data-material-thumbnail");
  });

  test("flag enabled, provider throws -> procedural fallback, no rejected promise", async () => {
    const provider = jest.fn(async () => {
      throw new Error("provider down");
    });
    const result = await buildMaterialPaletteCardsAsync({
      materials: FIXED_MATERIALS,
      thumbnailProvider: provider,
      env: { MATERIAL_TEXTURE_THUMBNAILS_ENABLED: "true" },
    });
    expect(provider).toHaveBeenCalled();
    result.cardMetadata.forEach((card) => {
      expect(card.source).toBe("procedural_svg_pattern");
      expect(card.fallbackAvailable).toBe(true);
    });
  });

  test("flag enabled, provider returns null -> procedural fallback", async () => {
    const provider = jest.fn(async () => null);
    const { cardMetadata } = await buildMaterialPaletteCardsAsync({
      materials: FIXED_MATERIALS,
      thumbnailProvider: provider,
      env: { MATERIAL_TEXTURE_THUMBNAILS_ENABLED: "true" },
    });
    cardMetadata.forEach((card) =>
      expect(card.source).toBe("procedural_svg_pattern"),
    );
  });

  test("flag enabled, mocked provider returns {url} -> source ai_texture_thumbnail with image overlay", async () => {
    const provider = jest.fn(async ({ materialSignature }) => ({
      url: `https://example.test/textures/${materialSignature}.png`,
    }));
    const { cards, cardMetadata } = await buildMaterialPaletteCardsAsync({
      materials: FIXED_MATERIALS,
      thumbnailProvider: provider,
      env: { MATERIAL_TEXTURE_THUMBNAILS_ENABLED: "true" },
    });
    expect(provider).toHaveBeenCalledTimes(FIXED_MATERIALS.length);
    cardMetadata.forEach((card) => {
      expect(card.source).toBe("ai_texture_thumbnail");
      expect(card.fallbackAvailable).toBe(true);
      expect(card.materialSignature).toEqual(expect.any(String));
    });
    expect(cards).toContain("data-material-thumbnail");
    expect(cards).toContain("https://example.test/textures/");
    // Procedural <pattern> still present underneath as fallback for raster failures
    expect(cards).toContain('data-material-texture="red_multi_brick"');
  });

  test("provider invoked with deterministic materialSignature payload", async () => {
    const seen = [];
    const provider = jest.fn(async (payload) => {
      seen.push(payload);
      return { url: `https://example.test/${payload.materialSignature}.png` };
    });
    await buildMaterialPaletteCardsAsync({
      materials: FIXED_MATERIALS,
      thumbnailProvider: provider,
      env: { MATERIAL_TEXTURE_THUMBNAILS_ENABLED: "true" },
    });
    seen.forEach((payload) => {
      expect(payload).toEqual(
        expect.objectContaining({
          materialSignature: expect.any(String),
          label: expect.any(String),
          textureKind: expect.any(String),
          hex: expect.any(String),
        }),
      );
    });
  });

  test("canonical fallback materials still respect the thumbnail flag (no provider call when disabled)", async () => {
    const materials = normalizeMaterialPaletteEntries({});
    const provider = jest.fn();
    const { cardMetadata } = await buildMaterialPaletteCardsAsync({
      materials,
      thumbnailProvider: provider,
      env: { MATERIAL_TEXTURE_THUMBNAILS_ENABLED: "false" },
    });
    expect(provider).not.toHaveBeenCalled();
    expect(cardMetadata.length).toBe(8);
    cardMetadata.forEach((card) =>
      expect(card.source).toBe("procedural_svg_pattern"),
    );
  });
});
