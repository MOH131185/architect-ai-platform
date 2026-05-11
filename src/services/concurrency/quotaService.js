/* global globalThis */
/**
 * Generation quota service.
 *
 * Enforces per-user and global active-job caps so a single user (or runaway
 * client) cannot saturate generation capacity. Independent of the rate
 * limiters in server.cjs (which gate inbound HTTP requests by IP/window) and
 * the providerLimiter (which gates outbound upstream calls). Quotas are the
 * "is this user allowed to start ANOTHER job right now?" gate.
 *
 * Counters live on `globalThis.__archiaiActiveJobs` to survive serverless
 * cold-share inside the same process (mirrors the existing pattern used by
 * artifactStorageService and generationJobService). Reset via
 * `clearQuotaCounters()` in tests.
 *
 * Errors thrown have stable codes the API layer maps to HTTP responses:
 *   USER_QUOTA_EXCEEDED   — caller's userId already at MAX_ACTIVE_JOBS_PER_USER
 *   TOO_MANY_ACTIVE_JOBS  — alias for USER_QUOTA_EXCEEDED (per spec)
 *   GLOBAL_CAPACITY_FULL  — total active jobs at MAX_GLOBAL_ACTIVE_JOBS
 */

const STATE_KEY = "__archiaiActiveJobs";

const DEFAULT_LIMITS = Object.freeze({
  perUser: 3,
  global: 50,
});

const ENV_KEYS = Object.freeze({
  perUser: "MAX_ACTIVE_JOBS_PER_USER",
  global: "MAX_GLOBAL_ACTIVE_JOBS",
});

export const QUOTA_ERROR_CODES = Object.freeze({
  USER_QUOTA_EXCEEDED: "USER_QUOTA_EXCEEDED",
  TOO_MANY_ACTIVE_JOBS: "TOO_MANY_ACTIVE_JOBS",
  GLOBAL_CAPACITY_FULL: "GLOBAL_CAPACITY_FULL",
});

function getState() {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = {
      perUser: new Map(), // userId -> count
      globalCount: 0,
    };
  }
  return globalThis[STATE_KEY];
}

function resolvePositiveInt(envKey, fallback) {
  const raw = globalThis.process?.env?.[envKey];
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallback;
}

export function getQuotaLimits() {
  return {
    perUser: resolvePositiveInt(ENV_KEYS.perUser, DEFAULT_LIMITS.perUser),
    global: resolvePositiveInt(ENV_KEYS.global, DEFAULT_LIMITS.global),
  };
}

/**
 * Reserve a quota slot for a job. Throws with one of QUOTA_ERROR_CODES if
 * limits are exceeded. Returns a release function that MUST be called when
 * the job terminates (succeeded / failed / cancelled).
 *
 * Anonymous (no userId) callers count toward the global cap but bypass the
 * per-user check — same posture as the rest of the artifact stack which
 * tolerates anonymous local-dev usage.
 */
export function reserveJobQuota({ userId = null } = {}) {
  const limits = getQuotaLimits();
  const state = getState();

  if (state.globalCount >= limits.global) {
    const err = new Error(
      `Global capacity full (${state.globalCount}/${limits.global} active jobs). Try again shortly.`,
    );
    err.code = QUOTA_ERROR_CODES.GLOBAL_CAPACITY_FULL;
    err.limits = limits;
    err.active = {
      user: userId ? state.perUser.get(userId) || 0 : 0,
      global: state.globalCount,
    };
    throw err;
  }

  if (userId) {
    const userCount = state.perUser.get(userId) || 0;
    if (userCount >= limits.perUser) {
      const err = new Error(
        `User has too many active jobs (${userCount}/${limits.perUser}). Wait for one to finish before starting another.`,
      );
      err.code = QUOTA_ERROR_CODES.USER_QUOTA_EXCEEDED;
      err.limits = limits;
      err.active = { user: userCount, global: state.globalCount };
      throw err;
    }
    state.perUser.set(userId, userCount + 1);
  }
  state.globalCount += 1;

  let released = false;
  return function release() {
    if (released) return;
    released = true;
    state.globalCount = Math.max(0, state.globalCount - 1);
    if (userId) {
      const next = (state.perUser.get(userId) || 0) - 1;
      if (next <= 0) state.perUser.delete(userId);
      else state.perUser.set(userId, next);
    }
  };
}

export function getActiveJobCounts() {
  const state = getState();
  return {
    global: state.globalCount,
    byUser: Object.fromEntries(state.perUser.entries()),
  };
}

export function clearQuotaCounters() {
  const state = getState();
  state.perUser.clear();
  state.globalCount = 0;
}

export const __QUOTA_DEFAULTS = DEFAULT_LIMITS;
export const __QUOTA_ENV_KEYS = ENV_KEYS;
