import {
  executeProjectGraphReasoningSteps,
  getBlockedOpenAIReasoningCalls,
} from "../../services/openaiReasoningExecutor.js";

const route = {
  stepId: "PROJECT_GRAPH",
  provider: "openai",
  model: "gpt-test",
  apiKeyEnv: "OPENAI_API_KEY",
};

function okFetch({ requestId = "req_123", usage = { total_tokens: 3 } } = {}) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: (name) =>
        ["x-request-id", "openai-request-id"].includes(name) ? requestId : null,
    },
    json: async () => ({
      choices: [
        {
          message: {
            content: '{"status":"ok","stepId":"PROJECT_GRAPH","notes":[]}',
          },
        },
      ],
      usage,
    }),
  });
}

describe("openaiReasoningExecutor", () => {
  test("uses reasoning-key precedence, records request metadata, and redacts secrets", async () => {
    const fetchImpl = okFetch();

    const calls = await executeProjectGraphReasoningSteps({
      modelRoutes: [route],
      env: {
        OPENAI_REASONING_API_KEY: "sk-reasoning-1234",
        OPENAI_API_KEY: "sk-base-5678",
        OPENAI_BASE_URL: "https://api.test/v1",
        PROJECT_GRAPH_OPENAI_REASONING_MODE: "required",
      },
      execution: { fetchImpl },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-reasoning-1234",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(calls[0]).toMatchObject({
      stepId: "PROJECT_GRAPH",
      status: "ok",
      providerUsed: "openai",
      reasoningProviderUsed: "openai",
      openaiUsed: true,
      requestId: "req_123",
      usage: { total_tokens: 3 },
      keySource: "OPENAI_REASONING_API_KEY",
      secretsRedacted: true,
    });
    expect(JSON.stringify(calls)).not.toContain("sk-reasoning-1234");
    expect(JSON.stringify(calls)).not.toContain("sk-base-5678");
  });

  test("blocks required execution when the reasoning key is missing", async () => {
    const fetchImpl = okFetch();

    const calls = await executeProjectGraphReasoningSteps({
      modelRoutes: [route],
      env: {
        NODE_ENV: "production",
        PROJECT_GRAPH_OPENAI_REASONING_MODE: "required",
      },
      execution: { fetchImpl },
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls[0]).toMatchObject({
      status: "blocked",
      providerUsed: "none",
      fallbackReason: "missing_api_key",
      errorCode: "OPENAI_REASONING_API_KEY_MISSING",
      openaiUsed: false,
    });
    expect(getBlockedOpenAIReasoningCalls(calls)).toHaveLength(1);
  });

  test("blocks invalid OpenAI responses", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "req_invalid" },
      json: async () => ({ choices: [], usage: { total_tokens: 1 } }),
    });

    const calls = await executeProjectGraphReasoningSteps({
      modelRoutes: [route],
      env: {
        OPENAI_API_KEY: "sk-base-5678",
        PROJECT_GRAPH_OPENAI_REASONING_MODE: "required",
      },
      execution: { fetchImpl },
    });

    expect(calls[0]).toMatchObject({
      status: "blocked",
      fallbackReason: "invalid_response",
      errorCode: "OPENAI_REASONING_INVALID_RESPONSE",
      requestId: "req_invalid",
      usage: { total_tokens: 1 },
    });
  });

  test("uses explicit deterministic metadata in test mode when no mock is supplied", async () => {
    const fetchImpl = okFetch();

    const calls = await executeProjectGraphReasoningSteps({
      modelRoutes: [route],
      env: {
        NODE_ENV: "test",
        JEST_WORKER_ID: "1",
        OPENAI_API_KEY: "sk-base-5678",
      },
      execution: { fetchImpl },
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls[0]).toMatchObject({
      status: "skipped",
      providerUsed: "deterministic",
      fallbackReason: "test_runtime_provider_mock_not_supplied",
      deterministicReason: "test_runtime_provider_mock_not_supplied",
      openaiUsed: false,
      secretsRedacted: true,
    });
  });
});
