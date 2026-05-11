/**
 * Generation jobs HTTP handlers — start / get / list / cancel.
 *
 * Tests use the real handlers but inject a fake worker via the service so we
 * don't spin up the slice service. Confirms response shape, no-secrets, and
 * status codes for missing / not-cancellable cases.
 */

import startHandler from "../../../api/generation-jobs/start.js";
import getHandler from "../../../api/generation-jobs/[jobId].js";
import listHandler from "../../../api/generation-jobs/index.js";
import cancelHandler from "../../../api/generation-jobs/[jobId]/cancel.js";
import {
  clearJobs,
  startJob,
  JOB_STATUS,
  JOB_ERROR_CODES,
} from "../../services/generation/generationJobService.js";

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

async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

beforeEach(() => clearJobs());
afterEach(() => clearJobs());

describe("/api/generation-jobs handlers", () => {
  test("GET /api/generation-jobs/:jobId returns 404 for unknown id", async () => {
    const req = { method: "GET", headers: {}, query: { jobId: "missing" } };
    const res = createMockResponse();
    await getHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual(
      expect.objectContaining({ code: "JOB_NOT_FOUND", jobId: "missing" }),
    );
  });

  test("GET /api/generation-jobs lists all jobs and filters by query", async () => {
    const worker = async () => ({ success: true });
    startJob({ payload: {}, userId: "u-A", projectId: "p-A", worker });
    startJob({ payload: {}, userId: "u-A", projectId: "p-B", worker });
    startJob({ payload: {}, userId: "u-B", projectId: "p-A", worker });
    await flush();

    const allRes = createMockResponse();
    await listHandler({ method: "GET", headers: {}, query: {} }, allRes);
    expect(allRes.statusCode).toBe(200);
    expect(allRes.body.count).toBe(3);
    expect(allRes.body.jobs).toHaveLength(3);

    const filteredRes = createMockResponse();
    await listHandler(
      { method: "GET", headers: {}, query: { projectId: "p-A" } },
      filteredRes,
    );
    expect(filteredRes.body.count).toBe(2);
  });

  test("GET /api/generation-jobs/:jobId returns the snapshot with no secrets", async () => {
    const worker = async () => ({
      success: true,
      geometryHash: "g-1",
      visualManifestHash: "v-1",
      package: { packageId: "pkg-z", packageHash: "h-z" },
    });
    const created = startJob({ payload: {}, userId: "u-1", worker });
    await flush();

    const req = { method: "GET", headers: {}, query: { jobId: created.jobId } };
    const res = createMockResponse();
    await getHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.jobId).toBe(created.jobId);
    expect(res.body.status).toBe(JOB_STATUS.SUCCEEDED);
    expect(res.body.packageId).toBe("pkg-z");
    expect(res.body.geometryHash).toBe("g-1");
    expect(res.body.artifactManifest).toEqual(
      expect.objectContaining({ packageId: "pkg-z", packageHash: "h-z" }),
    );

    const json = JSON.stringify(res.body);
    [
      "zipBytes",
      "rawBytes",
      "OPENAI_API_KEY",
      "OPENAI_REASONING_API_KEY",
      "Bearer ",
      "sk-",
      "secret",
    ].forEach((needle) => {
      expect(json).not.toContain(needle);
    });
  });

  test("POST /api/generation-jobs/:jobId/cancel returns 200 then 409 on second call", async () => {
    let resolveWorker;
    const worker = async (_p, { signal }) => {
      await new Promise((resolve) => {
        signal?.addEventListener?.("abort", resolve, { once: true });
        resolveWorker = resolve;
      });
      return { success: false, errorCode: JOB_ERROR_CODES.JOB_CANCELLED };
    };
    const created = startJob({ payload: {}, worker });
    await flush(2);

    const req = {
      method: "POST",
      headers: {},
      query: { jobId: created.jobId },
    };
    const res = createMockResponse();
    await cancelHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ jobId: created.jobId, cancelled: true }),
    );

    if (resolveWorker) resolveWorker();
    await flush(5);

    // Second cancel on already-cancelled job → 409
    const res2 = createMockResponse();
    await cancelHandler(req, res2);
    expect(res2.statusCode).toBe(409);
    expect(res2.body).toEqual(
      expect.objectContaining({ code: "JOB_NOT_CANCELLABLE" }),
    );
  });

  test("POST /api/generation-jobs/:jobId/cancel returns 404 for missing job", async () => {
    const res = createMockResponse();
    await cancelHandler(
      { method: "POST", headers: {}, query: { jobId: "missing" } },
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  test("POST /api/generation-jobs/:jobId/cancel returns 400 without jobId", async () => {
    const res = createMockResponse();
    await cancelHandler({ method: "POST", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({ code: "JOB_ID_REQUIRED" }),
    );
  });
});
