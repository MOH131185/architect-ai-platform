import {
  isLegacyModelRouteEnabled,
  LEGACY_MODEL_ROUTE_ISSUE_CODE,
  createLegacyModelRouteError,
} from "../../services/legacyProviderGuard.js";
import openaiEnv from "../../../server/utils/openaiEnv.cjs";
import fs from "fs";
import path from "path";

const {
  resolveOpenAIReasoningApiKey,
  resolveOpenAIImageApiKey,
  resolveOpenAIReasoningApiKeyInfo,
  resolveOpenAIImageApiKeyInfo,
} = openaiEnv;

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
    ).toBe("");

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
    expect(
      resolveOpenAIImageApiKey({
        OPENAI_REASONING_API_KEY: "reasoning-image-fallback",
      }),
    ).toBe("reasoning-image-fallback");
    expect(
      resolveOpenAIImageApiKey({
        REACT_APP_OPENAI_API_KEY: "legacy-browser-key",
      }),
    ).toBe("");
  });

  test("server-side OpenAI env diagnostics expose key source without secrets", () => {
    expect(
      resolveOpenAIImageApiKeyInfo({
        OPENAI_IMAGES_API_KEY: "sk-image-1234",
        OPENAI_API_KEY: "sk-base-5678",
      }),
    ).toMatchObject({
      hasKey: true,
      keySource: "OPENAI_IMAGES_API_KEY",
      keyLast4: "1234",
      apiKey: "sk-image-1234",
    });

    expect(
      resolveOpenAIReasoningApiKeyInfo({
        NODE_ENV: "development",
        OPENAI_ALLOW_REACT_APP_SERVER_KEY: "true",
        REACT_APP_OPENAI_API_KEY: "sk-dev-9999",
      }),
    ).toMatchObject({
      hasKey: true,
      keySource: "REACT_APP_OPENAI_API_KEY",
      keyLast4: "9999",
      usedReactAppServerFallback: true,
    });

    expect(
      resolveOpenAIReasoningApiKeyInfo({
        NODE_ENV: "production",
        OPENAI_ALLOW_REACT_APP_SERVER_KEY: "true",
        REACT_APP_OPENAI_API_KEY: "sk-prod-9999",
      }),
    ).toMatchObject({
      hasKey: false,
      keySource: null,
    });
  });

  test("OpenAI resolver surfaces diagnostic warnings when REACT_APP key is unsafe", () => {
    const ignoredWithoutFlag = resolveOpenAIReasoningApiKeyInfo({
      NODE_ENV: "development",
      REACT_APP_OPENAI_API_KEY: "sk-browser-only",
    });
    expect(ignoredWithoutFlag.hasKey).toBe(false);
    expect(ignoredWithoutFlag.usedReactAppServerFallback).toBe(false);
    expect(ignoredWithoutFlag.warning).toMatch(/REACT_APP_OPENAI_API_KEY/);
    expect(ignoredWithoutFlag.warning).toMatch(
      /OPENAI_ALLOW_REACT_APP_SERVER_KEY/,
    );

    const acceptedInDev = resolveOpenAIImageApiKeyInfo({
      NODE_ENV: "development",
      OPENAI_ALLOW_REACT_APP_SERVER_KEY: "true",
      REACT_APP_OPENAI_API_KEY: "sk-browser-1234",
    });
    expect(acceptedInDev.hasKey).toBe(true);
    expect(acceptedInDev.usedReactAppServerFallback).toBe(true);
    expect(acceptedInDev.warning).toMatch(/REACT_APP_OPENAI_API_KEY/);

    const rejectedInProd = resolveOpenAIImageApiKeyInfo({
      NODE_ENV: "production",
      OPENAI_ALLOW_REACT_APP_SERVER_KEY: "true",
      REACT_APP_OPENAI_API_KEY: "sk-browser-1234",
    });
    expect(rejectedInProd.hasKey).toBe(false);
    expect(rejectedInProd.warning).toMatch(/REACT_APP_OPENAI_API_KEY/);

    const noKeysAtAll = resolveOpenAIReasoningApiKeyInfo({});
    expect(noKeysAtAll.hasKey).toBe(false);
    expect(noKeysAtAll.warning).toBeNull();
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

  test("Vercel packages bundled A1 fonts with a schema-valid function include glob", () => {
    const root = process.cwd();
    const config = JSON.parse(
      fs.readFileSync(path.join(root, "vercel.json"), "utf8"),
    );
    const apiFunctionConfig = config.functions?.["api/**/*.js"];
    const includeFiles = apiFunctionConfig?.includeFiles;

    expect(typeof includeFiles).toBe("string");
    expect(includeFiles).toContain("src/utils/*.js");
    expect(includeFiles).toContain("src/services/**/*.js");
    expect(includeFiles).toContain("src/services/**/*.cjs");
    expect(includeFiles).toContain("public/fonts/**/*");
    expect(includeFiles).not.toBe(
      "server/**/*.{js,cjs},src/services/**/*.js,src/config/*.js,src/utils/*.js,public/fonts/**/*",
    );
  });
});
