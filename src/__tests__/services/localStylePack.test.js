import {
  buildLocalStylePackV2,
  computeBlendWeights,
  computeMaterialPalette,
} from "../../services/style/localStylePack.js";

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
});
