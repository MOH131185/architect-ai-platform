import {
  isLegacyModelRouteEnabled,
  LEGACY_MODEL_ROUTE_ISSUE_CODE,
  createLegacyModelRouteError,
} from "../../services/legacyProviderGuard.js";
import openaiEnv from "../../../server/utils/openaiEnv.cjs";
import fs from "fs";
import path from "path";

const { resolveOpenAIReasoningApiKey, resolveOpenAIImageApiKey } = openaiEnv;

describe("env-driven provider guards", () => {
  test("legacy model routes require explicit opt-in", () => {
    expect(
      isLegacyModelRouteEnabled({
        env: {
          PIPELINE_MODE: "project_graph",
          REACT_APP_USE_TOGETHER: "false",
        },
      }),
    ).toBe(false);

    expect(
      isLegacyModelRouteEnabled({
        env: { PIPELINE_MODE: "multi_panel" },
      }),
    ).toBe(true);

    expect(
      isLegacyModelRouteEnabled({
        env: { REACT_APP_USE_TOGETHER: "true" },
      }),
    ).toBe(true);

    const error = createLegacyModelRouteError("modelRouter.callLLM");
    expect(error.code).toBe(LEGACY_MODEL_ROUTE_ISSUE_CODE);
    expect(error.message).toContain("PIPELINE_MODE=multi_panel");
  });

  test("OpenAI key precedence matches serverless and local Express", () => {
    expect(
      resolveOpenAIReasoningApiKey({
        OPENAI_REASONING_API_KEY: "reasoning",
        OPENAI_API_KEY: "base",
        REACT_APP_OPENAI_API_KEY: "legacy",
      }),
    ).toBe("reasoning");
    expect(
      resolveOpenAIReasoningApiKey({
        OPENAI_API_KEY: "base",
        REACT_APP_OPENAI_API_KEY: "legacy",
      }),
    ).toBe("base");
    expect(
      resolveOpenAIReasoningApiKey({
        REACT_APP_OPENAI_API_KEY: "legacy",
      }),
    ).toBe("legacy");

    expect(
      resolveOpenAIImageApiKey({
        OPENAI_IMAGES_API_KEY: "images",
        OPENAI_API_KEY: "base",
        REACT_APP_OPENAI_API_KEY: "legacy",
      }),
    ).toBe("images");
    expect(
      resolveOpenAIImageApiKey({
        OPENAI_API_KEY: "base",
        OPENAI_REASONING_API_KEY: "reasoning-not-image-fallback",
      }),
    ).toBe("base");
  });

  test("ProjectGraph production path does not reference legacy model routes", () => {
    const root = process.cwd();
    const activeFiles = [
      "src/services/project/projectGraphVerticalSliceService.js",
      "api/project/generate-vertical-slice.js",
      "src/hooks/useArchitectAIWorkflow.js",
      "src/config/pipelineMode.js",
    ];
    const legacyPattern =
      /(meta-llama|black-forest-labs\/FLUX|gpt-4o|\/api\/together)/i;

    for (const file of activeFiles) {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      expect(text).not.toMatch(legacyPattern);
    }
  });
});
