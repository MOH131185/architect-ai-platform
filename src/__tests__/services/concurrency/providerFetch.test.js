import { fetchWithProviderControls } from "../../../services/concurrency/providerFetch.js";
import {
  clearProviderLimiters,
  getProviderLimiterSnapshot,
  setProviderLimit,
} from "../../../services/concurrency/providerLimiter.js";

function jsonResponse(status, body = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: jest.fn((name) => headers[String(name).toLowerCase()] || null),
    },
    json: jest.fn(async () => body),
  };
}

describe("fetchWithProviderControls", () => {
  beforeEach(() => {
    clearProviderLimiters();
    setProviderLimit("openai-image", 1);
    global.fetch = jest.fn();
  });

  test("retries retryable upstream failures and honours Retry-After", async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse(503, { error: "busy" }, { "retry-after": "2" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const sleep = jest.fn(async () => {});

    const response = await fetchWithProviderControls(
      "openai-image",
      "https://api.openai.com/v1/images/generations",
      { method: "POST" },
      { sleep, baseDelayMs: 10 },
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(getProviderLimiterSnapshot()["openai-image"].inFlight).toBe(0);
  });

  test("does not retry non-retryable authority failures", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(422, { error: "MISSING_GEOMETRY_CONTROL_IMAGE" }),
    );
    const sleep = jest.fn(async () => {});

    const response = await fetchWithProviderControls(
      "openai-image",
      "https://api.openai.com/v1/images/edits",
      { method: "POST" },
      { sleep, baseDelayMs: 10 },
    );

    expect(response.status).toBe(422);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
