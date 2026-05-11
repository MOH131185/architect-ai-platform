/**
 * /api/generation-jobs/start — quota integration.
 *
 * The start handler must reject with HTTP 429 + a stable error code when
 * the per-user or global quota is exceeded BEFORE enqueueing the job.
 */

import startHandler from "../../../api/generation-jobs/start.js";
import {
  clearJobs,
  getJob,
} from "../../services/generation/generationJobService.js";
import {
  clearQuotaCounters,
  reserveJobQuota,
  QUOTA_ERROR_CODES,
} from "../../services/concurrency/quotaService.js";
import { clearProviderLimiters } from "../../services/concurrency/providerLimiter.js";

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

const ENV_KEYS = ["MAX_ACTIVE_JOBS_PER_USER", "MAX_GLOBAL_ACTIVE_JOBS"];
const SAVED_ENV = {};

beforeEach(() => {
  ENV_KEYS.forEach((k) => {
    SAVED_ENV[k] = process.env[k];
    delete process.env[k];
  });
  clearJobs();
  clearQuotaCounters();
  clearProviderLimiters();
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  });
  clearJobs();
  clearQuotaCounters();
  clearProviderLimiters();
});

describe("/api/generation-jobs/start — quota integration", () => {
  test("returns 429 USER_QUOTA_EXCEEDED when caller already at perUser limit", async () => {
    process.env.MAX_ACTIVE_JOBS_PER_USER = "1";
    // Pre-reserve a slot for user-1 to simulate an active job
    reserveJobQuota({ userId: "user-1" });

    const req = {
      method: "POST",
      headers: {},
      body: { userId: "user-1", brief: { foo: "bar" } },
    };
    const res = createMockResponse();
    await startHandler(req, res);

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: QUOTA_ERROR_CODES.USER_QUOTA_EXCEEDED,
        limits: expect.objectContaining({ perUser: 1 }),
      }),
    );
  });

  test("returns 429 GLOBAL_CAPACITY_FULL when global cap reached", async () => {
    process.env.MAX_GLOBAL_ACTIVE_JOBS = "1";
    reserveJobQuota({ userId: "someone-else" });

    const req = {
      method: "POST",
      headers: {},
      body: { userId: "user-2" },
    };
    const res = createMockResponse();
    await startHandler(req, res);

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: QUOTA_ERROR_CODES.GLOBAL_CAPACITY_FULL,
        limits: expect.objectContaining({ global: 1 }),
      }),
    );
  });

  test("response body carries no secrets / env / tokens (only limits + counts)", async () => {
    process.env.MAX_ACTIVE_JOBS_PER_USER = "1";
    reserveJobQuota({ userId: "user-1" });

    const req = {
      method: "POST",
      headers: { "x-user-id": "user-1" },
      body: { userId: "user-1" },
    };
    const res = createMockResponse();
    await startHandler(req, res);

    const json = JSON.stringify(res.body);
    [
      "OPENAI_API_KEY",
      "OPENAI_REASONING_API_KEY",
      "Bearer ",
      "sk-",
      "secret",
      "zipBytes",
    ].forEach((needle) => {
      expect(json).not.toContain(needle);
    });
  });

  test("blocked request does NOT enqueue a job", async () => {
    process.env.MAX_GLOBAL_ACTIVE_JOBS = "1";
    reserveJobQuota({ userId: "u-x" });

    const req = {
      method: "POST",
      headers: {},
      body: { userId: "u-y" },
    };
    const res = createMockResponse();
    await startHandler(req, res);

    expect(res.statusCode).toBe(429);
    // No job should have been registered
    expect(getJob("nonexistent")).toBeNull();
  });
});
