import {
  computeBlendWeights,
  computeMaterialPalette,
  buildLocalStylePackV2,
} from "../../../services/style/localStylePack.js";

describe("computeBlendWeights", () => {
  test("default sliders sum to 1.0 and are close to plan §6.5 defaults", () => {
    const w = computeBlendWeights({
      localBlendStrength: 0.5,
      innovationStrength: 0.5,
    });
    const sum = w.local + w.user + w.climate + w.portfolio;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
    expect(w.local).toBeCloseTo(0.4, 2);
    expect(w.portfolio).toBeCloseTo(0.15, 2);
  });

  test("max local_blend_strength pushes local share to 0.6", () => {
    const w = computeBlendWeights({
      localBlendStrength: 1,
      innovationStrength: 0,
    });
    expect(w.local).toBeCloseTo(0.6, 3);
    expect(w.portfolio).toBeCloseTo(0.05, 3);
  });

  test("max innovation_strength pushes portfolio share to 0.25", () => {
    const w = computeBlendWeights({
      localBlendStrength: 0,
      innovationStrength: 1,
    });
    expect(w.portfolio).toBeCloseTo(0.25, 3);
    expect(w.local).toBeCloseTo(0.2, 3);
  });

  test("non-finite slider values fall back to plan defaults", () => {
    const w = computeBlendWeights({
      localBlendStrength: "nan",
      innovationStrength: undefined,
    });
    const sum = w.local + w.user + w.climate + w.portfolio;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
  });

  test("user and climate weights stay positive across slider extremes", () => {
    const wMaxLocal = computeBlendWeights({
      localBlendStrength: 1,
      innovationStrength: 1,
    });
    expect(wMaxLocal.user).toBeGreaterThan(0);
    expect(wMaxLocal.climate).toBeGreaterThan(0);
    const wMinLocal = computeBlendWeights({
      localBlendStrength: 0,
      innovationStrength: 0,
    });
    expect(wMinLocal.user).toBeGreaterThan(0);
    expect(wMinLocal.climate).toBeGreaterThan(0);
  });
});

describe("computeMaterialPalette", () => {
  test("ranks materials by weighted source overlap", () => {
    const out = computeMaterialPalette({
      brief: {
        project_name: "Test",
        building_type: "community",
        user_intent: {
          style_keywords: ["warm brick", "RIBA portfolio"],
          material_preferences: ["warm stock brick", "low-energy windows"],
          local_blend_strength: 0.7,
          innovation_strength: 0.3,
          portfolio_mood: "riba_stage2",
        },
      },
      site: { data_quality: [], heritage_flags: [] },
      climate: { overheating: { risk_level: "medium" } },
    });
    expect(out.palette.length).toBeGreaterThanOrEqual(3);
    expect(out.weights.local).toBeGreaterThan(out.weights.portfolio);
    // The user-supplied "warm stock brick" appears in both local and user palettes,
    // so it should rank highly.
    const stockBrick = out.palette_with_provenance.find((entry) =>
      /warm stock brick/i.test(entry.material),
    );
    expect(stockBrick).toBeTruthy();
    expect(stockBrick.sources.length).toBeGreaterThan(1);
  });

  test("conservation-area site adds heritage materials to local palette", () => {
    const out = computeMaterialPalette({
      brief: {
        project_name: "Heritage Site",
        building_type: "dwelling",
        user_intent: {
          local_blend_strength: 0.5,
          innovation_strength: 0.5,
          style_keywords: [],
          material_preferences: [],
        },
      },
      site: {
        data_quality: [],
        heritage_flags: [{ type: "conservation_area" }],
      },
      climate: { overheating: { risk_level: "low" } },
    });
    expect(out.source_palettes.local).toEqual(
      expect.arrayContaining(["lime mortar", "natural slate"]),
    );
  });

  test("higher overheating risk shifts climate palette toward shading materials", () => {
    const high = computeMaterialPalette({
      brief: {
        project_name: "Hot",
        building_type: "dwelling",
        user_intent: {
          local_blend_strength: 0.5,
          innovation_strength: 0.5,
          style_keywords: [],
          material_preferences: [],
        },
      },
      site: { data_quality: [], heritage_flags: [] },
      climate: { overheating: { risk_level: "high" } },
    });
    expect(high.source_palettes.climate.join(",")).toMatch(
      /brise-soleil|perforated/i,
    );
  });
});

describe("buildLocalStylePackV2 — full pack output", () => {
  test("emits palette, weights, blend rationale, and provenance", () => {
    const pack = buildLocalStylePackV2({
      brief: {
        project_name: "Reading Room",
        building_type: "community",
        user_intent: {
          style_keywords: ["warm brick", "RIBA portfolio"],
          material_preferences: ["warm stock brick"],
          local_blend_strength: 0.7,
          innovation_strength: 0.3,
          portfolio_mood: "riba_stage2",
          avoid_keywords: ["highly reflective glazing"],
        },
      },
      site: {
        data_quality: [{ code: "SITE_BOUNDARY_PROVIDED" }],
        heritage_flags: [],
      },
      climate: {
        overheating: { risk_level: "medium" },
        material_weathering_notes: ["UK temperate"],
      },
      createStableId: (...args) => args.join("-"),
    });
    expect(pack.material_palette.length).toBeGreaterThan(2);
    expect(pack.blend_weights.local).toBeGreaterThan(
      pack.blend_weights.portfolio,
    );
    expect(pack.blend_rationale.length).toBe(4);
    expect(pack.avoid_keywords).toContain("highly reflective glazing");
    expect(
      pack.material_palette_with_provenance[0].sources.length,
    ).toBeGreaterThan(0);
  });
});
