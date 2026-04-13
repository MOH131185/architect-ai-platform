import {
  getRecommendedModel,
  getAvailableModelsByCategory,
  getModelStatus,
  resolveModelAdapter,
  validateModelConfig,
} from "../../services/models/openSourceModelRouter.js";

describe("openSourceModelRouter Phase 1", () => {
  test("validates the Phase 1 model registry", () => {
    const validation = validateModelConfig();

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  test("lists available floorplan models with local fallback first", () => {
    const available = getAvailableModelsByCategory("floorplan_generation");

    expect(available.length).toBeGreaterThan(0);
    expect(available[0].category).toBe("floorplan_generation");
    expect(
      available.some((entry) => entry.adapter_key === "constraint-solver"),
    ).toBe(true);
  });

  test("recommends the deterministic technical drawing adapter", () => {
    const recommendation = getRecommendedModel("technical_drawings", {
      preferLocal: true,
    });

    expect(recommendation.selectedModel.adapter_key).toBe("svg-vector-engine");
  });

  test("resolves a category entry down to a family adapter", () => {
    const resolved = resolveModelAdapter("technical_drawings");

    expect(resolved.family).toBe("technicalDrawing");
    expect(resolved.resolvedAdapterId).toBe("svg-vector-engine");
  });

  test("reports router status by category", () => {
    const status = getModelStatus();

    expect(status.categories.floorplan_generation).toBeDefined();
    expect(status.categories.technical_drawings.recommended.adapter_key).toBe(
      "svg-vector-engine",
    );
  });
});
