/**
 * /api/admin/provider-health — admin-token gating + no-secrets snapshot.
 *
 * Verifies the admin endpoint refuses unauthenticated requests in production,
 * accepts X-Admin-Token, and surfaces the snapshot from
 * providerHealthService without leaking raw API keys or Authorization
 * headers.
 */

import providerHealthHandler from "../../../api/admin/provider-health.js";

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

const SAVED = {};
const ENV_KEYS = [
  "ADMIN_HEALTH_TOKEN",
  "NODE_ENV",
  "OPENAI_REASONING_API_KEY",
  "OPENAI_IMAGES_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_IMAGE_MODEL",
  "DWG_CONVERTER_URL",
];

beforeEach(() => {
  ENV_KEYS.forEach((k) => {
    SAVED[k] = process.env[k];
    delete process.env[k];
  });
  // Default to a fetch that always returns 200 to keep snapshot calls fast
  global.__originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({
    status: 200,
    headers: { get: () => "req-mock" },
  }));
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  });
  if (global.__originalFetch) global.fetch = global.__originalFetch;
});

describe("/api/admin/provider-health", () => {
  test("local dev (no NODE_ENV=production, no token configured) — allows anonymous", async () => {
    const req = { method: "GET", headers: {}, query: {} };
    const res = createMockResponse();
    await providerHealthHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.authMode).toBe("local_anonymous");
    expect(res.body.status).toBeDefined();
    expect(res.body.checks).toEqual(expect.any(Object));
  });

  test("production without ADMIN_HEALTH_TOKEN — 503 ADMIN_TOKEN_NOT_CONFIGURED", async () => {
    process.env.NODE_ENV = "production";
    const req = { method: "GET", headers: {}, query: {} };
    const res = createMockResponse();
    await providerHealthHandler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("ADMIN_TOKEN_NOT_CONFIGURED");
  });

  test("production with token configured — without header → 401 ADMIN_TOKEN_INVALID", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_HEALTH_TOKEN = "secret-admin-token-xyz";
    const req = { method: "GET", headers: {}, query: {} };
    const res = createMockResponse();
    await providerHealthHandler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("ADMIN_TOKEN_INVALID");
  });

  test("production with token + correct header → 200 with snapshot", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_HEALTH_TOKEN = "secret-admin-token-xyz";
    const req = {
      method: "GET",
      headers: { "x-admin-token": "secret-admin-token-xyz" },
      query: {},
    };
    const res = createMockResponse();
    await providerHealthHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.authMode).toBe("token_authenticated");
    expect(res.body.status).toBeDefined();
  });

  test("response carries no raw keys / Authorization / Bearer / sk- prefix", async () => {
    process.env.OPENAI_REASONING_API_KEY = "sk-reasoning-FULL-SECRET-TEST-KEY";
    process.env.OPENAI_IMAGES_API_KEY = "sk-images-DIFFERENT-SECRET-TEST";
    process.env.OPENAI_IMAGE_MODEL = "gpt-image-2";
    const req = { method: "GET", headers: {}, query: {} };
    const res = createMockResponse();
    await providerHealthHandler(req, res);
    expect(res.statusCode).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("sk-reasoning-FULL-SECRET-TEST-KEY");
    expect(json).not.toContain("sk-images-DIFFERENT-SECRET-TEST");
    expect(json).not.toContain("Bearer ");
    expect(json).not.toContain("Authorization");
    // BUT key last4 is allowed (safe to surface for diagnostics)
    expect(json).toContain("-KEY"); // last4 of OPENAI_REASONING_API_KEY
  });

  test("non-GET method → 405", async () => {
    const req = { method: "POST", headers: {}, query: {} };
    const res = createMockResponse();
    await providerHealthHandler(req, res);
    expect(res.statusCode).toBe(405);
  });

  test("upstream OpenAI 401 propagates as unavailable status without leaking the key", async () => {
    process.env.OPENAI_REASONING_API_KEY = "sk-bad-key-ABCD";
    process.env.OPENAI_IMAGE_MODEL = "gpt-image-2";
    process.env.OPENAI_IMAGES_API_KEY = "sk-bad-key-ABCD";
    global.fetch = jest.fn(async () => ({
      status: 401,
      headers: { get: () => null },
    }));
    const req = { method: "GET", headers: {}, query: {} };
    const res = createMockResponse();
    await providerHealthHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checks.openaiReasoning.status).toBe("unavailable");
    expect(res.body.checks.openaiImages.status).toBe("unavailable");
    expect(JSON.stringify(res.body)).not.toContain("sk-bad-key-ABCD");
  });
});
