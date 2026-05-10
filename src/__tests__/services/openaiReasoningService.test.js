/**
 * Tests for src/services/openaiReasoningService.js
 *
 * Verifies the wizard's program-spaces compile path can route through the
 * server-side OpenAI Reasoning proxy without exposing an API key client-side
 * and without depending on the disabled legacy Together AI route.
 */

import {
  OpenAIReasoningService,
  openaiReasoningService,
} from "../../services/openaiReasoningService.js";

const ORIGINAL_FETCH = global.fetch;

function mockFetchOk(body) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockFetchError(status, body) {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
    json: jest.fn().mockResolvedValue(body),
  });
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe("openaiReasoningService", () => {
  test("singleton default export is initialised", () => {
    expect(openaiReasoningService).toBeInstanceOf(OpenAIReasoningService);
    expect(typeof openaiReasoningService.chatCompletion).toBe("function");
  });

  test("POSTs /api/openai-reasoning with default body shape", async () => {
    global.fetch = mockFetchOk({
      ok: true,
      content: "[]",
      raw: "[]",
      model: "gpt-test",
      usage: {},
    });

    const service = new OpenAIReasoningService();
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    await service.chatCompletion(messages);

    expect(global.fetch).toHaveBeenCalled();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain("/api/openai-reasoning");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual(messages);
    expect(body.max_tokens).toBe(900);
    expect(body.temperature).toBe(0.3);
    expect(body.task_type).toBe("reasoning");
    expect(body.model).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  test("returns parsed JSON body on 200", async () => {
    const payload = {
      ok: true,
      content: '[{"name":"Office","area":40,"count":1,"level":"Ground"}]',
      raw: "[]",
      model: "gpt-test",
      usage: { total_tokens: 42 },
    };
    global.fetch = mockFetchOk(payload);

    const service = new OpenAIReasoningService();
    const result = await service.chatCompletion([
      { role: "user", content: "x" },
    ]);
    expect(result).toEqual(payload);
  });

  test("honours options.model, max_tokens, temperature, response_format, task_type overrides", async () => {
    global.fetch = mockFetchOk({ ok: true, content: "" });

    const service = new OpenAIReasoningService();
    await service.chatCompletion([{ role: "user", content: "x" }], {
      model: "gpt-5.4-preview",
      max_tokens: 1234,
      temperature: 0.55,
      task_type: "wizard-program-compile",
      response_format: { type: "json_object" },
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-5.4-preview");
    expect(body.max_tokens).toBe(1234);
    expect(body.temperature).toBe(0.55);
    expect(body.task_type).toBe("wizard-program-compile");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  test("throws with status + details on non-OK response (and does not retry on non-fallbackable)", async () => {
    global.fetch = mockFetchError(500, {
      ok: false,
      error: "OPENAI_API_ERROR",
      details: "rate limit hit",
      requestId: "req_test_123",
    });

    const service = new OpenAIReasoningService();
    await expect(
      service.chatCompletion([{ role: "user", content: "x" }]),
    ).rejects.toThrow(/OpenAI Reasoning error: 500 - rate limit hit/);
    // 500 is not fallbackable; only one fetch even with multiple endpoints
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("propagates network error from fetch reject when only one endpoint", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // Force a single-endpoint instance by stubbing the endpoints list
    const service = new OpenAIReasoningService();
    service.endpoints = ["/api/openai-reasoning"];

    await expect(
      service.chatCompletion([{ role: "user", content: "x" }]),
    ).rejects.toThrow(/Failed to fetch/);
  });

  test("falls back to next endpoint on 404, then succeeds", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: jest.fn().mockResolvedValue({ error: "missing" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ ok: true, content: "[]" }),
      });

    const service = new OpenAIReasoningService();
    // Ensure two endpoints to exercise the fallback chain
    service.endpoints = [
      "/api/openai-reasoning",
      "http://example/api/openai-reasoning",
    ];

    const result = await service.chatCompletion([
      { role: "user", content: "x" },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe("[]");
  });

  test("rejects when messages is missing or empty", async () => {
    global.fetch = jest.fn();
    const service = new OpenAIReasoningService();
    await expect(service.chatCompletion()).rejects.toThrow(
      /messages array is required/,
    );
    await expect(service.chatCompletion([])).rejects.toThrow(
      /messages array is required/,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("never references an OpenAI API key in client code", () => {
    // Defence-in-depth: the service must not read OPENAI_* env vars or
    // attach Authorization headers from the browser. The proxy holds the key.
    const source = require("fs").readFileSync(
      require("path").join(
        __dirname,
        "../../services/openaiReasoningService.js",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/OPENAI_API_KEY/);
    expect(source).not.toMatch(/REACT_APP_OPENAI_API_KEY/);
    expect(source).not.toMatch(/Authorization:/);
    expect(source).not.toMatch(/Bearer /);
  });
});
