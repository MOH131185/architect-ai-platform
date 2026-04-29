import {
  CANONICAL_TEXTURE_KINDS,
  buildMaterialPaletteCards,
  buildMaterialTexturePattern,
  inferMaterialApplication,
  inferMaterialHex,
  materialSignature,
  materialTextureKind,
  normalizeMaterialPaletteEntries,
} from "../../../services/a1/materialTexturePatterns.js";

const KEYWORD_CASES = [
  { name: "Red Multi Brick", expected: "red_multi_brick" },
  { name: "Multi-brick facade", expected: "red_multi_brick" },
  { name: "Vertical Timber Cladding", expected: "vertical_timber_cladding" },
  { name: "Cedar boarding", expected: "vertical_timber_cladding" },
  { name: "Dark Grey Roof Tile", expected: "dark_grey_roof_tile" },
  { name: "Slate roofing", expected: "dark_grey_roof_tile" },
  { name: "Anthracite Aluminium Frame", expected: "anthracite_aluminium_frame" },
  { name: "Aluminium window frames", expected: "anthracite_aluminium_frame" },
  { name: "Timber Front Door", expected: "timber_front_door" },
  { name: "Front entrance door", expected: "timber_front_door" },
  { name: "Dark Metal Rainwater Goods", expected: "dark_metal_rainwater_goods" },
  { name: "Metal rainwater downpipe", expected: "dark_metal_rainwater_goods" },
  { name: "Light Render", expected: "light_render" },
  { name: "Lime stucco render", expected: "light_render" },
  { name: "Natural Stone Paving", expected: "natural_stone_paving" },
  { name: "Flagstone landscape", expected: "natural_stone_paving" },
];

describe("materialTexturePatterns", () => {
  describe("materialTextureKind keyword map", () => {
    test("covers all 8 canonical material kinds", () => {
      const seen = new Set(KEYWORD_CASES.map((c) => c.expected));
      CANONICAL_TEXTURE_KINDS.forEach((kind) => {
        expect(seen.has(kind)).toBe(true);
      });
    });

    test.each(KEYWORD_CASES)("$name -> $expected", ({ name, expected }) => {
      expect(materialTextureKind(name)).toBe(expected);
    });

    test("door takes priority over timber/wood (so 'timber front door' is a door, not cladding)", () => {
      expect(materialTextureKind("Timber front door")).toBe("timber_front_door");
      expect(materialTextureKind("Wooden front door")).toBe("timber_front_door");
    });

    test("rainwater takes priority over metal/aluminium (so 'metal rainwater downpipe' is rainwater goods)", () => {
      expect(materialTextureKind("Metal rainwater downpipe")).toBe(
        "dark_metal_rainwater_goods",
      );
      expect(materialTextureKind("Aluminium gutter")).toBe(
        "dark_metal_rainwater_goods",
      );
    });

    test("falls back to light_render (never invents a new kind)", () => {
      expect(materialTextureKind("completely unknown finish")).toBe("light_render");
      expect(CANONICAL_TEXTURE_KINDS).toContain(materialTextureKind(""));
    });

    test("application context can disambiguate", () => {
      expect(materialTextureKind("oak", "front door")).toBe("timber_front_door");
    });
  });

  describe("materialSignature stability", () => {
    test("identical input produces identical signature", () => {
      const a = materialSignature({
        name: "Red Multi Brick",
        application: "external wall",
        hexColor: "#b6634a",
      });
      const b = materialSignature({
        name: "Red Multi Brick",
        application: "external wall",
        hexColor: "#b6634a",
      });
      expect(a).toBe(b);
      expect(typeof a).toBe("string");
      expect(a.length).toBeGreaterThanOrEqual(8);
    });

    test("different name produces different signature", () => {
      const a = materialSignature({ name: "Red Multi Brick" });
      const b = materialSignature({ name: "Vertical Timber Cladding" });
      expect(a).not.toBe(b);
    });

    test("different application or hex changes signature", () => {
      const base = materialSignature({
        name: "Red Multi Brick",
        application: "external wall",
        hexColor: "#b6634a",
      });
      expect(
        materialSignature({
          name: "Red Multi Brick",
          application: "facade accent",
          hexColor: "#b6634a",
        }),
      ).not.toBe(base);
      expect(
        materialSignature({
          name: "Red Multi Brick",
          application: "external wall",
          hexColor: "#cc0000",
        }),
      ).not.toBe(base);
    });

    test("ASCII-only output (no tofu glyphs in pattern IDs)", () => {
      const sig = materialSignature({ name: "Red Multi Brick — Tudor Style" });
      // eslint-disable-next-line no-control-regex
      expect(/^[\x20-\x7E]+$/.test(sig)).toBe(true);
    });
  });

  describe("buildMaterialTexturePattern", () => {
    test("emits a valid <pattern> with 72x72 unit cell and data attributes", () => {
      const result = buildMaterialTexturePattern({
        name: "Red Multi Brick",
        hexColor: "#b6634a",
        application: "external wall",
      });
      expect(result.kind).toBe("red_multi_brick");
      expect(result.id).toMatch(/^mat-tex-[0-9a-f]+$/);
      expect(result.svg).toContain("<pattern");
      expect(result.svg).toContain('width="72"');
      expect(result.svg).toContain('height="72"');
      expect(result.svg).toContain('patternUnits="userSpaceOnUse"');
      expect(result.svg).toContain('data-material-texture="red_multi_brick"');
      expect(result.svg).toContain(`data-material-signature="${result.signature}"`);
      expect(result.svg).toContain('fill="#b6634a"');
    });

    test("different materials produce different pattern IDs", () => {
      const a = buildMaterialTexturePattern({ name: "Red Multi Brick" });
      const b = buildMaterialTexturePattern({ name: "Light Render" });
      expect(a.id).not.toBe(b.id);
      expect(a.signature).not.toBe(b.signature);
    });

    test("signature-driven IDs are stable across calls", () => {
      const m = { name: "Vertical Timber Cladding", application: "facade accent" };
      expect(buildMaterialTexturePattern(m).id).toBe(
        buildMaterialTexturePattern(m).id,
      );
    });

    test("each canonical kind has a working overlay", () => {
      CANONICAL_TEXTURE_KINDS.forEach((kind) => {
        // A material whose name unambiguously maps to `kind` (use the kind label
        // itself, with underscores -> spaces, which all keyword rules match).
        const seedName = kind.replace(/_/g, " ");
        const result = buildMaterialTexturePattern({ name: seedName });
        expect(result.svg.length).toBeGreaterThan(80);
        expect(result.svg).toContain("<pattern");
      });
    });
  });

  describe("inferMaterialHex / inferMaterialApplication", () => {
    test("returns a hex string for known names", () => {
      expect(inferMaterialHex("Red Multi Brick")).toMatch(/^#[0-9a-f]{6}$/i);
      expect(inferMaterialHex("Vertical Timber Cladding")).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
    });

    test("returns a meaningful application for known names", () => {
      expect(inferMaterialApplication("Red Multi Brick")).toBe("external wall");
      expect(inferMaterialApplication("Dark Grey Roof Tile")).toBe("roof finish");
      expect(inferMaterialApplication("Anthracite Aluminium Frame")).toBe(
        "openings",
      );
      expect(inferMaterialApplication("Timber Front Door")).toBe("entrance door");
      expect(inferMaterialApplication("Dark Metal Rainwater Goods")).toBe(
        "rainwater goods",
      );
    });

    test("respects an explicit application override", () => {
      expect(inferMaterialApplication("Brick", "feature wall")).toBe(
        "feature wall",
      );
    });
  });

  describe("normalizeMaterialPaletteEntries", () => {
    test("dedupes by lowercase name and caps at 8", () => {
      const result = normalizeMaterialPaletteEntries({
        materials: [
          { name: "Red Multi Brick" },
          { name: "red multi brick", application: "feature" },
          { name: "Vertical Timber Cladding" },
          { name: "Dark Grey Roof Tile" },
          { name: "Anthracite Aluminium Frame" },
          { name: "Timber Front Door" },
          { name: "Dark Metal Rainwater Goods" },
          { name: "Light Render" },
          { name: "Natural Stone Paving" },
          { name: "Extra Material 1" },
        ],
      });
      expect(result.length).toBeLessThanOrEqual(8);
      const names = result.map((m) => m.name.toLowerCase());
      expect(names.filter((n) => n === "red multi brick").length).toBe(1);
    });

    test("falls back to the canonical 8 when no inputs are usable", () => {
      const result = normalizeMaterialPaletteEntries({});
      expect(result.length).toBe(8);
      result.forEach((m) => {
        expect(m.source).toBe("deterministic_fallback");
        expect(m.hexColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(m.application).toEqual(expect.any(String));
      });
    });

    test("accepts masterDNA shape with materials array", () => {
      const result = normalizeMaterialPaletteEntries({
        masterDNA: {
          materials: [
            { name: "Red Multi Brick", hexColor: "#b6634a" },
            { name: "Light Render", hexColor: "#d7d2c8" },
          ],
        },
      });
      expect(result.length).toBe(2);
      expect(result.map((m) => m.name)).toEqual([
        "Red Multi Brick",
        "Light Render",
      ]);
    });
  });

  describe("buildMaterialPaletteCards (sync, procedural)", () => {
    test("emits a <pattern> def per material and ASCII-only labels", () => {
      const materials = normalizeMaterialPaletteEntries({});
      const { defs, cards, cardMetadata } = buildMaterialPaletteCards({
        materials,
      });
      expect(cardMetadata.length).toBe(8);
      expect(defs.match(/<pattern /g)?.length).toBe(8);
      expect(cards.match(/data-material-texture=/g)?.length).toBe(8);
      cardMetadata.forEach((card) => {
        expect(card.source).toBe("procedural_svg_pattern");
        expect(card.fallbackAvailable).toBe(true);
        expect(card.materialSignature).toEqual(expect.any(String));
        expect(card.label.length).toBeGreaterThan(0);
        // eslint-disable-next-line no-control-regex
        expect(/^[\x20-\x7E ]+$/.test(card.label)).toBe(true);
      });
    });

    test("respects layout.max", () => {
      const materials = normalizeMaterialPaletteEntries({});
      const { cardMetadata } = buildMaterialPaletteCards({
        materials,
        layout: { cols: 2, rows: 2, max: 4 },
      });
      expect(cardMetadata.length).toBe(4);
    });
  });
});
