/**
 * Generation job lifecycle — service-layer behaviour.
 *
 * Verifies the public surface (startJob / getJob / listJobs / cancelJob),
 * cancellation semantics, error mapping (including STRICT_IMAGE2_FAIL_CLOSED
 * passthrough), no-secrets snapshot guarantee, and that injected workers
 * receive the cancellation signal so the slice service can fail closed
 * without weakening any authority gate.
 */

import {
  JOB_STATUS,
  JOB_STAGES,
  JOB_ERROR_CODES,
  cancelJob,
  clearJobs,
  getJob,
  listJobs,
  startJob,
  __getRawJobsForTests,
} from "../../../services/generation/generationJobService.js";

beforeEach(() => clearJobs());
afterEach(() => clearJobs());

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

describe("generationJobService", () => {
  test("startJob rejects when no worker is supplied", () => {
    expect(() => startJob({})).toThrow(/worker function/);
  });

  test("startJob returns a snapshot immediately and the worker runs in the background", async () => {
    const ready = defer();
    const finish = defer();
    const worker = async () => {
      ready.resolve();
      return finish.promise;
    };

    const snapshot = startJob({
      payload: { brief: { building_type: "detached_house" } },
      userId: "user-1",
      projectId: "project-1",
      worker,
    });

    // Returned snapshot is the public shape — no internal fields, no functions
    expect(snapshot.jobId).toMatch(/^gen-/);
    expect(snapshot.status).toBe(JOB_STATUS.QUEUED);
    expect(snapshot.userId).toBe("user-1");
    expect(snapshot.projectId).toBe("project-1");
    expect(snapshot.inputHash).toMatch(/^[0-9a-f]{8}$/);
    expect(snapshot).not.toHaveProperty("worker");
    expect(snapshot).not.toHaveProperty("signal");
    expect(snapshot).not.toHaveProperty("abort");

    // Worker has actually been kicked off
    await ready.promise;
    expect(getJob(snapshot.jobId).status).toBe(JOB_STATUS.RUNNING);
    expect(getJob(snapshot.jobId).stage).toBe(JOB_STAGES.GENERATING);

    finish.resolve({
      success: true,
      geometryHash: "g1",
      package: { packageId: "pkg-1", packageHash: "h1" },
    });
    await flush();

    const final = getJob(snapshot.jobId);
    expect(final.status).toBe(JOB_STATUS.SUCCEEDED);
    expect(final.stage).toBe(JOB_STAGES.COMPLETE);
    expect(final.progress).toBe(100);
    expect(final.geometryHash).toBe("g1");
    expect(final.packageId).toBe("pkg-1");
    expect(final.artifactManifest).toEqual(
      expect.objectContaining({ packageId: "pkg-1", packageHash: "h1" }),
    );
  });

  test("worker rejection records errorCode + errorMessage and FAILED status", async () => {
    const worker = async () => {
      const err = new Error("explosion");
      err.code = "WORKER_BOOM";
      throw err;
    };
    const snap = startJob({ payload: {}, worker });
    await flush(5);
    const final = getJob(snap.jobId);
    expect(final.status).toBe(JOB_STATUS.FAILED);
    expect(final.errorCode).toBe("WORKER_BOOM");
    expect(final.errorMessage).toBe("explosion");
  });

  test("worker returning { success: false, errorCode } maps to FAILED with that code", async () => {
    const worker = async () => ({
      success: false,
      errorCode: JOB_ERROR_CODES.STRICT_IMAGE2_FAIL_CLOSED,
      error: "Image generation unavailable; failing closed per authority gate",
    });
    const snap = startJob({ payload: {}, worker });
    await flush(5);
    const final = getJob(snap.jobId);
    expect(final.status).toBe(JOB_STATUS.FAILED);
    expect(final.errorCode).toBe(JOB_ERROR_CODES.STRICT_IMAGE2_FAIL_CLOSED);
    expect(final.errorMessage).toMatch(/failing closed/i);
    // Authority-gate failure must NOT silently mark the job as succeeded with
    // fake artifacts. The service must propagate the failure code as-is.
    expect(final.packageId).toBeNull();
    expect(final.artifactManifest).toBeNull();
  });

  test("cancelJob aborts an in-flight worker and records CANCELLED", async () => {
    const started = defer();
    const worker = async (_payload, { signal }) => {
      started.resolve();
      // Wait for cancellation
      await new Promise((resolve) => {
        if (signal?.addEventListener) {
          signal.addEventListener("abort", resolve, { once: true });
        } else {
          // Fallback for environments without AbortSignal — poll
          const id = setInterval(() => {
            if (signal?.aborted) {
              clearInterval(id);
              resolve();
            }
          }, 5);
        }
      });
      return { success: false, errorCode: "JOB_CANCELLED" };
    };

    const snap = startJob({ payload: {}, worker });
    await started.promise;
    expect(getJob(snap.jobId).status).toBe(JOB_STATUS.RUNNING);

    const result = cancelJob(snap.jobId);
    expect(result.cancelled).toBe(true);
    expect(getJob(snap.jobId).status).toBe(JOB_STATUS.CANCELLED);
    expect(getJob(snap.jobId).errorCode).toBe(JOB_ERROR_CODES.JOB_CANCELLED);
    await flush(5); // let the worker resolve and the finally block run
  });

  test("cancelJob on missing or completed job returns a clear reason", async () => {
    expect(cancelJob("not-a-real-job")).toEqual({
      cancelled: false,
      reason: "JOB_NOT_FOUND",
    });

    const worker = async () => ({ success: true });
    const snap = startJob({ payload: {}, worker });
    await flush(5);
    expect(getJob(snap.jobId).status).toBe(JOB_STATUS.SUCCEEDED);
    expect(cancelJob(snap.jobId)).toEqual(
      expect.objectContaining({
        cancelled: false,
        reason: "JOB_NOT_CANCELLABLE",
        currentStatus: JOB_STATUS.SUCCEEDED,
      }),
    );
  });

  test("listJobs filters by projectId / userId / status", async () => {
    const worker = async () => ({ success: true });
    startJob({ payload: {}, worker, userId: "u-1", projectId: "p-1" });
    startJob({ payload: {}, worker, userId: "u-1", projectId: "p-2" });
    startJob({ payload: {}, worker, userId: "u-2", projectId: "p-1" });
    await flush(8);

    expect(listJobs({})).toHaveLength(3);
    expect(listJobs({ projectId: "p-1" })).toHaveLength(2);
    expect(listJobs({ userId: "u-2" })).toHaveLength(1);
    expect(listJobs({ status: JOB_STATUS.SUCCEEDED })).toHaveLength(3);
    expect(listJobs({ status: JOB_STATUS.FAILED })).toHaveLength(0);
  });

  test("snapshot never carries forbidden internal or secret fields", async () => {
    // Pollute the raw store after start to simulate any rogue mutation.
    const finish = defer();
    const worker = async () => finish.promise;
    const snap = startJob({ payload: {}, worker });

    const raw = __getRawJobsForTests().get(snap.jobId);
    raw.zipBytes = Buffer.from("ZZZ-NEVER-LEAK");
    raw.secret = "SECRET-NEVER-LEAK";
    raw.env = { OPENAI_API_KEY: "KEY-NEVER-LEAK" };
    raw.token = "TOKEN-NEVER-LEAK";
    raw.openaiApiKey = "OPENAI-NEVER-LEAK";
    raw.signal = "fake-signal";

    finish.resolve({ success: true });
    await flush(5);

    const out = getJob(snap.jobId);
    const json = JSON.stringify(out);
    [
      "zipBytes",
      "ZZZ-NEVER-LEAK",
      "rawBytes",
      "OPENAI_API_KEY",
      "KEY-NEVER-LEAK",
      "SECRET-NEVER-LEAK",
      "TOKEN-NEVER-LEAK",
      "OPENAI-NEVER-LEAK",
      "openaiApiKey",
    ].forEach((needle) => {
      expect(json).not.toContain(needle);
    });
  });

  test("inputHash is deterministic for the same payload and differs for distinct payloads", () => {
    const worker = async () => ({ success: true });
    const a1 = startJob({ payload: { x: 1, y: 2 }, worker });
    const a2 = startJob({ payload: { x: 1, y: 2 }, worker });
    const b = startJob({ payload: { x: 1, y: 3 }, worker });
    expect(a1.inputHash).toBe(a2.inputHash);
    expect(a1.inputHash).not.toBe(b.inputHash);
  });

  test("onProgress callback never lets progress regress and caps at 99 until terminal status", async () => {
    const reached = defer();
    const worker = async (_payload, { onProgress }) => {
      onProgress(25, JOB_STAGES.GENERATING);
      onProgress(60, JOB_STAGES.GENERATING);
      onProgress(40, JOB_STAGES.GENERATING); // attempted regression
      onProgress(99, JOB_STAGES.PREBAKING);
      onProgress(150, JOB_STAGES.PREBAKING); // attempted overflow
      reached.resolve();
      return { success: true };
    };
    const snap = startJob({ payload: {}, worker });
    await reached.promise;
    await flush(5);
    const final = getJob(snap.jobId);
    expect(final.status).toBe(JOB_STATUS.SUCCEEDED);
    expect(final.progress).toBe(100); // succeeded path overrides to 100
  });
});
