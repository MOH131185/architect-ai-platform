/* global globalThis */
/**
 * Generation Job Service
 *
 * Wraps a long-running generation worker (typically the ProjectGraph
 * vertical-slice + artifact prebake chain) in an async job lifecycle so the
 * client can fire-and-poll instead of holding a 2-minute synchronous request
 * open. Provider-ready: in-memory queue today; the same `startJob / getJob /
 * cancelJob / listJobs` surface can be re-implemented over Redis/BullMQ/
 * Upstash later without touching callers.
 *
 * Worker injection (no global registry, no per-instance state on the service)
 * keeps the job lifecycle code pure and unit-testable. The API handler passes
 * the real `buildArchitectureProjectVerticalSlice` + prebake pipeline as the
 * worker; tests pass a small fake.
 *
 * Job snapshots returned by getJob/listJobs are scrubbed of all internal
 * fields (worker function, AbortController, etc.) so HTTP responses can never
 * leak callbacks, secrets, or env. The snapshot shape is the public contract.
 */

const STATE_KEY = "__archiaiGenerationJobs";

function getState() {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = {
      jobs: new Map(),
      cancellation: new Map(),
    };
  }
  return globalThis[STATE_KEY];
}

export const JOB_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

export const JOB_STAGES = Object.freeze({
  QUEUED: "queued",
  GENERATING: "generating_vertical_slice",
  PREBAKING: "prebaking_artifact_package",
  COMPLETE: "complete",
});

export const JOB_ERROR_CODES = Object.freeze({
  GENERATION_FAILED: "GENERATION_FAILED",
  STRICT_IMAGE2_FAIL_CLOSED: "STRICT_IMAGE2_FAIL_CLOSED",
  WORKER_ERROR: "WORKER_ERROR",
  JOB_CANCELLED: "JOB_CANCELLED",
  WORKER_NOT_REGISTERED: "WORKER_NOT_REGISTERED",
});

function nowIso() {
  return new Date().toISOString();
}

function generateJobId() {
  return `gen-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// FNV-1a 32-bit. Deterministic across runs for the same payload. No crypto
// dep needed (this code runs in both Node serverless and CRA test env).
function computeInputHash(payload) {
  const json =
    typeof payload === "string" ? payload : JSON.stringify(payload || {});
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  "worker",
  "abort",
  "signal",
  "rawResult",
  "zipBytes",
  "rawBytes",
  "secret",
  "env",
  "token",
  "apiKey",
  "openaiApiKey",
]);

function snapshotJob(job) {
  if (!job || typeof job !== "object") return null;
  const out = {};
  for (const [key, value] of Object.entries(job)) {
    if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) continue;
    if (typeof value === "function") continue;
    out[key] = value;
  }
  return out;
}

export function clearJobs() {
  const state = getState();
  state.jobs.clear();
  state.cancellation.clear();
}

/**
 * Start a generation job. Returns the snapshot immediately; the worker runs
 * in the background.
 *
 * @param {Object} args
 * @param {Object} args.payload - input forwarded to the worker
 * @param {string|null} args.userId
 * @param {string|null} args.projectId
 * @param {Function} args.worker - async (payload, { signal, onProgress }) => result
 * @returns {Object} job snapshot
 */
export function startJob({
  payload = {},
  userId = null,
  projectId = null,
  worker,
} = {}) {
  if (typeof worker !== "function") {
    throw new Error("generationJobService.startJob requires a worker function");
  }
  const state = getState();
  const jobId = generateJobId();
  const job = {
    jobId,
    userId: userId || null,
    projectId: projectId || null,
    status: JOB_STATUS.QUEUED,
    progress: 0,
    stage: JOB_STAGES.QUEUED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    inputHash: computeInputHash(payload),
    geometryHash: null,
    visualManifestHash: null,
    styleBlendManifestHash: null,
    packageId: null,
    errorCode: null,
    errorMessage: null,
    artifactManifest: null,
  };
  state.jobs.set(jobId, job);

  // Capture the QUEUED snapshot BEFORE kicking off the worker. Async
  // functions execute synchronously up to the first await, so the worker's
  // initial `setStatus(RUNNING, ...)` would otherwise mutate `job` before
  // we returned — making startJob's contract "always queued at return time"
  // race-prone. Snapshot is a shallow clone, safe for the caller to keep.
  const initialSnapshot = snapshotJob(job);
  void runJobAsync(jobId, payload, worker);
  return initialSnapshot;
}

function setStatus(jobId, status, stage, progress, extra = {}) {
  const state = getState();
  const job = state.jobs.get(jobId);
  if (!job) return;
  Object.assign(job, {
    status,
    stage,
    progress,
    updatedAt: nowIso(),
    ...extra,
  });
}

function isCancelled(jobId) {
  const state = getState();
  const ctrl = state.cancellation.get(jobId);
  return Boolean(ctrl?.signal?.aborted);
}

async function runJobAsync(jobId, payload, worker) {
  const state = getState();
  const ctrl =
    typeof globalThis.AbortController === "function"
      ? new globalThis.AbortController()
      : {
          signal: { aborted: false },
          abort() {
            this.signal.aborted = true;
          },
        };
  state.cancellation.set(jobId, ctrl);

  try {
    if (isCancelled(jobId)) {
      setStatus(jobId, JOB_STATUS.CANCELLED, JOB_STAGES.QUEUED, 0, {
        errorCode: JOB_ERROR_CODES.JOB_CANCELLED,
      });
      return;
    }
    setStatus(jobId, JOB_STATUS.RUNNING, JOB_STAGES.GENERATING, 10);

    const onProgress = (progress, stage) => {
      const job = state.jobs.get(jobId);
      if (!job || job.status !== JOB_STATUS.RUNNING) return;
      setStatus(
        jobId,
        JOB_STATUS.RUNNING,
        stage || job.stage,
        Math.max(job.progress, Math.min(99, Number(progress) || 0)),
      );
    };

    const result = await worker(payload, { signal: ctrl.signal, onProgress });

    if (isCancelled(jobId)) {
      setStatus(jobId, JOB_STATUS.CANCELLED, JOB_STAGES.QUEUED, 0, {
        errorCode: JOB_ERROR_CODES.JOB_CANCELLED,
      });
      return;
    }

    if (!result || result.success === false) {
      setStatus(jobId, JOB_STATUS.FAILED, JOB_STAGES.GENERATING, 0, {
        errorCode: result?.errorCode || JOB_ERROR_CODES.GENERATION_FAILED,
        errorMessage:
          result?.error ||
          result?.errorMessage ||
          "Generation failed without a specific error",
      });
      return;
    }

    setStatus(jobId, JOB_STATUS.SUCCEEDED, JOB_STAGES.COMPLETE, 100, {
      geometryHash: result.geometryHash || null,
      visualManifestHash:
        result.visualManifestHash ||
        result.metadata?.visualManifestHash ||
        null,
      styleBlendManifestHash:
        result.styleBlendManifestHash ||
        result.metadata?.styleBlendManifestHash ||
        null,
      packageId: result.package?.packageId || null,
      artifactManifest: summariseArtifactManifest(result),
    });
  } catch (err) {
    if (isCancelled(jobId)) {
      setStatus(jobId, JOB_STATUS.CANCELLED, JOB_STAGES.QUEUED, 0, {
        errorCode: JOB_ERROR_CODES.JOB_CANCELLED,
      });
      return;
    }
    setStatus(jobId, JOB_STATUS.FAILED, JOB_STAGES.GENERATING, 0, {
      errorCode: err?.code || JOB_ERROR_CODES.WORKER_ERROR,
      errorMessage: err?.message || String(err),
    });
  } finally {
    state.cancellation.delete(jobId);
  }
}

function summariseArtifactManifest(result) {
  if (!result) return null;
  const manifest = result.package
    ? {
        packageId: result.package.packageId || null,
        packageHash: result.package.packageHash || null,
        byteLength: result.package.byteLength || null,
        downloadRoute: result.package.downloadRoute || null,
        signedUrlAvailable: result.package.signedUrlAvailable === true,
        artifactCount: Array.isArray(result.artifacts)
          ? result.artifacts.length
          : null,
      }
    : null;
  return manifest;
}

export function getJob(jobId) {
  if (!jobId || typeof jobId !== "string") return null;
  return snapshotJob(getState().jobs.get(jobId));
}

export function listJobs({
  projectId = null,
  userId = null,
  status = null,
} = {}) {
  return [...getState().jobs.values()]
    .filter((j) => (projectId ? j.projectId === projectId : true))
    .filter((j) => (userId ? j.userId === userId : true))
    .filter((j) => (status ? j.status === status : true))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .map(snapshotJob);
}

export function cancelJob(jobId) {
  const state = getState();
  const job = state.jobs.get(jobId);
  if (!job) {
    return { cancelled: false, reason: "JOB_NOT_FOUND" };
  }
  if (job.status !== JOB_STATUS.RUNNING && job.status !== JOB_STATUS.QUEUED) {
    return {
      cancelled: false,
      reason: "JOB_NOT_CANCELLABLE",
      currentStatus: job.status,
    };
  }
  const ctrl = state.cancellation.get(jobId);
  if (ctrl?.abort) ctrl.abort();
  job.status = JOB_STATUS.CANCELLED;
  job.errorCode = JOB_ERROR_CODES.JOB_CANCELLED;
  job.updatedAt = nowIso();
  state.cancellation.delete(jobId);
  return { cancelled: true, snapshot: snapshotJob(job) };
}

// Exposed for tests that want to introspect the raw store without going
// through the public surface. Safe for tests only — never call from API code.
export function __getRawJobsForTests() {
  return getState().jobs;
}
