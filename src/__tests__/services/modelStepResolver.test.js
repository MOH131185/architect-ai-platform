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

  test("resolves production step env variables with provenance metadata only", () => {
    const env = {
      MODEL_SOURCE: "hybrid",
      OPENAI_REASONING_MODEL: "fallback-reasoning-model",
      OPENAI_FAST_MODEL: "fallback-fast-model",
      STEP_00_ROUTER_MODEL: "router-model",
      STEP_07_PROJECT_GRAPH_MODEL: "project-graph-model",
      STEP_08_2D_LABEL_MODEL: "drawing-label-model",
      STEP_09_3D_QA_MODEL: "model-3d-qa",
      STEP_12_A1_SHEET_MODEL: "a1-model",
      STEP_13_QA_MODEL: "qa-model",
      STEP_13_QA_API_KEY_ENV: "OPENAI_REASONING_API_KEY",
      OPENAI_API_KEY: "sk-do-not-leak",
      OPENAI_REASONING_API_KEY: "sk-reasoning-do-not-leak",
    };

    const registry = resolveArchitectureModelRegistry({
      env,
      steps: [
        "ROUTER",
        "PROJECT_GRAPH",
        "DRAWING_2D",
        "MODEL_3D",
        "A1_SHEET",
        "QA",
      ],
    });

    expect(registry.ROUTER.model).toBe("router-model");
    expect(registry.PROJECT_GRAPH.model).toBe("project-graph-model");
    expect(registry.DRAWING_2D.model).toBe("drawing-label-model");
    expect(registry.MODEL_3D.model).toBe("model-3d-qa");
    expect(registry.A1_SHEET.model).toBe("a1-model");
    expect(registry.QA.model).toBe("qa-model");
    expect(registry.QA).toEqual(
      expect.objectContaining({
        stepId: "QA",
        apiKeyEnv: "OPENAI_REASONING_API_KEY",
        modelSource: "hybrid",
        fallbackUsed: true,
        fineTunedModelUsed: null,
      }),
    );
    expect(JSON.stringify(registry)).not.toContain("sk-do-not-leak");
    expect(JSON.stringify(registry)).not.toContain("sk-reasoning-do-not-leak");
  });
});
