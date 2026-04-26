import {
  resolveArchitectureModelRegistry,
  resolveArchitectureStepModel,
} from "../../services/modelStepResolver.js";

describe("modelStepResolver", () => {
  test("uses base env models in hybrid mode when fine-tuned IDs are absent", () => {
    const config = resolveArchitectureStepModel("brief", {
      env: {
        MODEL_SOURCE: "hybrid",
        STEP_01_BRIEF_MODEL: "gpt-5.4-mini",
      },
    });

    expect(config.model).toBe("gpt-5.4-mini");
    expect(config.selectionSource).toBe("base");
    expect(config.fineTunedFallbackUsed).toBe(true);
    expect(config.provider).toBe("openai");
  });

  test("prefers filled fine-tuned model IDs in hybrid mode", () => {
    const config = resolveArchitectureStepModel("programme", {
      env: {
        MODEL_SOURCE: "hybrid",
        STEP_05_PROGRAMME_MODEL: "gpt-5.4",
        STEP_05_PROGRAMME_FT_MODEL: "ft:gpt-4.1-programme-v001",
      },
    });

    expect(config.model).toBe("ft:gpt-4.1-programme-v001");
    expect(config.baseModel).toBe("gpt-5.4");
    expect(config.selectionSource).toBe("fine_tuned");
    expect(config.provider).toBe("openai");
  });

  test("fails closed when fine_tuned mode lacks a step model", () => {
    expect(() =>
      resolveArchitectureStepModel("qa", {
        env: {
          MODEL_SOURCE: "fine_tuned",
          STEP_13_QA_MODEL: "gpt-5.4",
        },
      }),
    ).toThrow(/fine-tuned model is required/);
  });

  test("resolves the vertical-slice registry aliases", () => {
    const registry = resolveArchitectureModelRegistry({
      env: {
        MODEL_SOURCE: "base",
        OPENAI_REASONING_MODEL: "gpt-5.4",
        OPENAI_FAST_MODEL: "gpt-5.4-mini",
      },
      steps: ["brief_intake", "2d_projection", "3d_projection", "a1"],
    });

    expect(registry.BRIEF.model).toBe("gpt-5.4-mini");
    expect(registry.DRAWING_2D.deterministicGeometry).toBe(true);
    expect(registry.MODEL_3D.deterministicGeometry).toBe(true);
    expect(registry.A1_SHEET.model).toBe("gpt-5.4");
  });
});
