import {
  buildLocalStylePackV2,
  computeBlendWeights,
  computeMaterialPalette,
} from "../../services/style/localStylePack.js";
import expectedPack from "../fixtures/stylePack/expected-pack-portfolio-textPDF.json" with { type: "json" };

function materialAllowedByPack(material, pack) {
  const tokens = [
    ...pack.materialFamilies.primary,
    ...pack.materialFamilies.secondary,
    ...pack.materialFamilies.accents,
  ].map((entry) => String(entry).toLowerCase());
  const text = String(material || "").toLowerCase();
  return tokens.some((token) => text.includes(token) || token.includes(text));
}

describe("localStylePack ProjectGraph blend controls", () => {
  test("honours explicit portfolio style weight", () => {
    const weights = computeBlendWeights({
      localBlendStrength: 1,
      innovationStrength: 0.5,
      portfolioStyleStrength: 0.5,
    });

    expect(weights.portfolio).toBe(0.5);
    expect(
      weights.local + weights.user + weights.climate + weights.portfolio,
    ).toBeCloseTo(1, 4);
  });

  test("can use 100 percent local material while preserving portfolio style", () => {
    const brief = {
      building_type: "dwelling",
      project_name: "Kensington test house",
      user_intent: {
        style_keywords: ["warm contemporary residential interior"],
        material_preferences: ["dark aluminium window frames"],
        local_material_strength: 1,
        portfolio_material_weight: 0,
        portfolio_style_strength: 0.5,
        local_blend_strength: 1,
        innovation_strength: 0.5,
      },
    };

    const palette = computeMaterialPalette({
      brief,
      site: {},
      climate: { overheating: { risk_level: "medium" } },
    });

    expect(palette.weights.portfolio).toBe(0.5);
    expect(palette.material_weights.local).toBe(1);
    expect(palette.material_weights.portfolio).toBe(0);
    expect(palette.palette).toContain("dark aluminium window frames");

    const pack = buildLocalStylePackV2({
      brief,
      site: {},
      climate: { overheating: { risk_level: "medium" } },
      createStableId: (...parts) => parts.join("-"),
    });

    expect(pack.blend_weights.portfolio).toBe(0.5);
    expect(pack.material_blend_weights.local).toBe(1);
    expect(pack.material_blend_weights.portfolio).toBe(0);
  });

  test("stylePack null preserves no-pack output byte-for-byte at object level", () => {
    const args = {
      brief: {
        building_type: "community",
        project_name: "No Pack Reading Room",
        user_intent: {
          style_keywords: ["warm brick", "timber"],
        },
      },
      site: {},
      climate: { overheating: { risk_level: "medium" } },
      createStableId: (...parts) => parts.join("-"),
    };

    expect(buildLocalStylePackV2({ ...args, stylePack: null })).toEqual(
      buildLocalStylePackV2(args),
    );
  });

  test("stylePack constrains palette and records bounded portfolio evidence", () => {
    const pack = buildLocalStylePackV2({
      brief: {
        building_type: "community",
        project_name: "Packed Reading Room",
        user_intent: {
          style_keywords: ["warm brick", "timber"],
        },
      },
      site: {},
      climate: { overheating: { risk_level: "low" } },
      stylePack: expectedPack,
      createStableId: (...parts) => parts.join("-"),
    });

    expect(pack.portfolio_style_pack_hash).toEqual(expect.any(String));
    expect(pack.material_blend_weights.portfolio).toBeLessThanOrEqual(0.25);
    if (pack.style_provenance.style_pack_warning) {
      expect(pack.style_provenance.style_pack_warning).toBe("palette_disjoint");
    } else {
      expect(
        pack.material_palette.every((material) =>
          materialAllowedByPack(material, expectedPack),
        ),
      ).toBe(true);
    }
  });
});
