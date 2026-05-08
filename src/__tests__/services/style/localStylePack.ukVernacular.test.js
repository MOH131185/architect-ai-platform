import {
  buildLocalStylePackV2,
  computeMaterialPalette,
} from "../../../services/style/localStylePack.js";
import { loadJurisdictionPack } from "../../../services/jurisdiction/jurisdictionPackService.js";
import { resolveUKVernacular } from "../../../services/style/ukVernacularPacks.js";

const baseBrief = {
  project_name: "test-project",
  building_type: "dwelling",
  user_intent: {
    style_keywords: ["restrained", "contemporary"],
    local_blend_strength: 0.5,
    innovation_strength: 0.5,
    portfolio_mood: "riba_stage2",
  },
};

const baseClimate = { overheating: { risk_level: "low" } };

describe("localStylePack — UK vernacular pack integration", () => {
  test("site without vernacular pack falls back to building-type default", () => {
    const site = {};
    const blend = computeMaterialPalette({
      brief: baseBrief,
      site,
      climate: baseClimate,
    });
    expect(Array.isArray(blend.palette)).toBe(true);
    expect(blend.palette.length).toBeGreaterThan(0);
    // The dwelling default palette includes "warm stock brick" and "render with detailed reveals"
    expect(blend.palette.join(",")).toMatch(/brick|render|timber/i);
  });

  test("London stucco terrace pack injects stucco materials into the local source palette", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const site = { uk_vernacular_pack: pack };
    const blend = computeMaterialPalette({
      brief: baseBrief,
      site,
      climate: baseClimate,
      paletteSize: 12,
    });
    // Vernacular materials must appear in the local source palette and rank
    // somewhere in the top-12 final palette (their score is local-weight × 1
    // unless they overlap another source).
    expect(blend.source_palettes.local.join(",")).toMatch(
      /white stucco render/i,
    );
    const stucco = blend.palette_with_provenance.find((entry) =>
      /white stucco render/i.test(entry.material),
    );
    expect(stucco).toBeDefined();
    expect(stucco.sources).toContain("local");
  });

  test("Edinburgh tenement pack injects sandstone-ashlar materials into the local source palette", () => {
    const pack = resolveUKVernacular({ postcode: "EH8 9YL" });
    const site = { uk_vernacular_pack: pack };
    const blend = computeMaterialPalette({
      brief: baseBrief,
      site,
      climate: baseClimate,
      paletteSize: 12,
    });
    expect(blend.source_palettes.local.join(",")).toMatch(/sandstone/i);
  });

  test("buildLocalStylePackV2 stamps style_provenance when vernacular pack present", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const site = { uk_vernacular_pack: pack };
    const stylePack = buildLocalStylePackV2({
      brief: baseBrief,
      site,
      climate: baseClimate,
      jurisdictionPack: loadJurisdictionPack("uk"),
    });
    expect(stylePack.style_provenance).toEqual(
      expect.objectContaining({
        ukVernacularPackId: "london-stucco-terrace",
        packLabel: "London stucco terrace",
        descriptive_narrative: expect.any(String),
        historical_period: expect.any(String),
        resolution_source: "postcode",
        source: "ukVernacularPacks",
      }),
    );
    expect(
      stylePack.style_provenance.descriptive_narrative.length,
    ).toBeGreaterThan(50);
  });

  // Phase A regression — the propagated provenance must carry every field
  // downstream consumers read (elevation parapet override, Material Palette
  // pack-prepend, photoreal prompt builder vernacular block, archetype
  // dispatcher). Earlier shape stripped these and silently broke PR #92's
  // elevation hints + Material Palette pack-driven swatches at production
  // runtime even though the tests passed with synthetic full-pack fixtures.
  test("style_provenance carries every field consumed downstream (parapet, materials, archetype, etc.)", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const site = { uk_vernacular_pack: pack };
    const stylePack = buildLocalStylePackV2({
      brief: baseBrief,
      site,
      climate: baseClimate,
    });
    const prov = stylePack.style_provenance;
    expect(prov.parapet_default).toBe(true);
    expect(prov.semi_basement_default).toBe(true);
    expect(prov.layout_archetype).toBe("linear_side_hall");
    expect(prov.facade_language).toEqual(expect.any(String));
    expect(prov.facade_language).toMatch(/parapet|stucco/i);
    expect(prov.roof_language).toEqual(expect.any(String));
    expect(prov.window_language).toEqual(expect.any(String));
    expect(prov.window_language).toMatch(/sash/i);
    expect(prov.fenestration_rhythm).toEqual(expect.any(String));
    expect(typeof prov.modernity_default).toBe("number");
    expect(Array.isArray(prov.materials)).toBe(true);
    expect(prov.materials.length).toBeGreaterThan(2);
    expect(prov.materials.join(", ")).toMatch(/stucco|sash|slate/i);
    // Mirror packId / label too so consumers that gate on either still work.
    expect(prov.packId).toBe("london-stucco-terrace");
    expect(prov.label).toBe("London stucco terrace");
  });

  test("buildLocalStylePackV2 stamps buildingTypeDefault when no vernacular pack", () => {
    const stylePack = buildLocalStylePackV2({
      brief: baseBrief,
      site: {},
      climate: baseClimate,
    });
    expect(stylePack.style_provenance).toEqual({
      ukVernacularPackId: null,
      packId: null,
      packLabel: null,
      label: null,
      region: null,
      descriptive_narrative: null,
      historical_period: null,
      resolution_source: null,
      source: "buildingTypeDefault",
      materials: [],
      facade_language: null,
      roof_language: null,
      window_language: null,
      fenestration_rhythm: null,
      modernity_default: null,
      parapet_default: false,
      semi_basement_default: false,
      layout_archetype: null,
      conservation_typical: false,
    });
  });

  test("blend_rationale includes the vernacular pack narrative line", () => {
    const pack = resolveUKVernacular({ postcode: "M14 5SH" });
    const site = { uk_vernacular_pack: pack };
    const stylePack = buildLocalStylePackV2({
      brief: baseBrief,
      site,
      climate: baseClimate,
    });
    const rationaleText = stylePack.blend_rationale.join(" | ");
    expect(rationaleText).toMatch(/UK vernacular pack:/);
    expect(rationaleText).toMatch(/Manchester|back-to-back/i);
  });
});
