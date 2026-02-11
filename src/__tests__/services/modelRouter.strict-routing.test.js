import modelRouter from "../../services/modelRouter.js";

describe("ModelRouter strict env routing and aliases", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("resolves alias task and applies env override model", () => {
    process.env.AI_MODEL_PROGRAM_SYNTHESIS = "gpt-4o-mini";

    const config = modelRouter.getModelConfig("PROGRAM_SYNTHESIS");

    expect(config.taskType).toBe("PROGRAM_SYNTHESIS");
    expect(config.resolvedTaskType).toBe("DNA_GENERATION");
    expect(config.primary).toBe("gpt-4o-mini");
    expect(config.provider).toBe("openai");
  });

  test("fails fast in strict mode when primary env key is missing", () => {
    process.env.ARCHIAI_STRICT_MODEL_ROUTING = "true";
    delete process.env.AI_MODEL_PROGRAM_SYNTHESIS;

    expect(() => modelRouter.getModelConfig("PROGRAM_SYNTHESIS")).toThrow(
      /AI_MODEL_PROGRAM_SYNTHESIS/,
    );
  });

  test("callLLM uses env-selected primary model for alias task", async () => {
    process.env.AI_MODEL_PROGRAM_SYNTHESIS =
      "meta-llama/Llama-3.3-70B-Instruct-Turbo";

    const togetherSpy = jest
      .spyOn(modelRouter, "callTogetherChat")
      .mockResolvedValue({
        choices: [{ message: { content: '{"ok":true}' } }],
      });
    const openaiSpy = jest
      .spyOn(modelRouter, "callOpenAIChat")
      .mockResolvedValue({
        choices: [{ message: { content: '{"ok":true}' } }],
      });

    const result = await modelRouter.callLLM("PROGRAM_SYNTHESIS", {
      systemPrompt: "system",
      userPrompt: "user",
      schema: true,
      context: {},
    });

    expect(result.success).toBe(true);
    expect(result.metadata.model).toBe(
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    );
    expect(result.metadata.resolvedTaskType).toBe("DNA_GENERATION");
    expect(togetherSpy).toHaveBeenCalledTimes(1);
    expect(openaiSpy).not.toHaveBeenCalled();
  });
});
