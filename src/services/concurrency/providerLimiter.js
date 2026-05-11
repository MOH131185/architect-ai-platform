/* global globalThis */
/**
 * Provider concurrency limiter.
 *
 * Per-provider semaphore that caps the number of in-flight requests we hold
 * open against a given upstream (typically OpenAI image edit / OpenAI
 * reasoning). Independent of the request-rate limiter that gates inbound
 * traffic — this gates OUTBOUND fan-out so a burst of accepted requests
 * doesn't trigger 429 storms downstream.
 *
 * The limiter is a thin Promise-queue. No new runtime deps. State lives on
 * `globalThis.__archiaiProviderLimiters` so the same limit applies across
 * every importer in the same process (the dynamic-API loader caches modules,
 * so without globalThis the per-call import would defeat the limit).
 *
 * Usage:
 *   const release = await acquireProviderSlot("openai-reasoning");
 *   try { await callUpstream(...); } finally { release(); }
 *
 * Limits resolved from env at first use, with sane defaults. Tests can
 * override via setProviderLimit() and reset via clearProviderLimiters().
 */

const STATE_KEY = "__archiaiProviderLimiters";

const ENV_KEYS = Object.freeze({
  "openai-image": "OPENAI_IMAGE_CONCURRENCY",
  "openai-reasoning": "OPENAI_REASONING_CONCURRENCY",
  "generation-worker": "GENERATION_WORKER_CONCURRENCY",
});

const DEFAULT_LIMITS = Object.freeze({
  "openai-image": 4,
  "openai-reasoning": 8,
  "generation-worker": 4,
});

function getState() {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = {
      limiters: new Map(), // providerKey -> { limit, inFlight, queue: [] }
      env: null,
    };
  }
  return globalThis[STATE_KEY];
}

function resolveLimit(providerKey) {
  const envKey = ENV_KEYS[providerKey];
  const fromEnv = envKey ? Number(globalThis.process?.env?.[envKey]) : null;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  return DEFAULT_LIMITS[providerKey] ?? 4;
}

function getLimiter(providerKey) {
  if (!providerKey || typeof providerKey !== "string") {
    throw new Error(
      "providerKey is required (e.g. 'openai-image', 'openai-reasoning')",
    );
  }
  const state = getState();
  let limiter = state.limiters.get(providerKey);
  if (!limiter) {
    limiter = {
      limit: resolveLimit(providerKey),
      inFlight: 0,
      queue: [],
    };
    state.limiters.set(providerKey, limiter);
  }
  return limiter;
}

/**
 * Acquire a slot. Returns a release function that MUST be called (use
 * try/finally). If the limiter is full, resolves when a slot opens.
 */
export function acquireProviderSlot(providerKey) {
  const limiter = getLimiter(providerKey);
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (limiter.inFlight < limiter.limit) {
        limiter.inFlight += 1;
        let released = false;
        const release = () => {
          if (released) return; // idempotent guard against double-release
          released = true;
          limiter.inFlight = Math.max(0, limiter.inFlight - 1);
          // Wake the next waiter without unbounded recursion
          const next = limiter.queue.shift();
          if (next) {
            // Schedule on a microtask so the releaser's try/finally completes
            // before the next acquire grabs its slot.
            Promise.resolve().then(next);
          }
        };
        resolve(release);
        return;
      }
      // Full — enqueue ourselves; the releaser will pop and re-run.
      limiter.queue.push(tryAcquire);
    };
    tryAcquire();
  });
}

/**
 * Wrap an async function with provider-slot acquire/release. The result
 * shape mirrors the wrapped function exactly. Throws are propagated.
 */
export async function withProviderSlot(providerKey, fn) {
  const release = await acquireProviderSlot(providerKey);
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Snapshot of current limiter state. Safe for diagnostics; carries no
 * upstream payloads.
 */
export function getProviderLimiterSnapshot() {
  const state = getState();
  const out = {};
  for (const [key, limiter] of state.limiters.entries()) {
    out[key] = {
      limit: limiter.limit,
      inFlight: limiter.inFlight,
      waiting: limiter.queue.length,
    };
  }
  return out;
}

/** Test helper. Sets a known limit and resets in-flight count. */
export function setProviderLimit(providerKey, limit) {
  const limiter = getLimiter(providerKey);
  limiter.limit = Math.max(1, Number(limit) || 1);
  // Drain any waiters that fit under the new limit.
  while (limiter.queue.length > 0 && limiter.inFlight < limiter.limit) {
    const next = limiter.queue.shift();
    if (next) Promise.resolve().then(next);
  }
}

/** Test helper. Wipes all limiters. */
export function clearProviderLimiters() {
  const state = getState();
  state.limiters.clear();
}

export const __PROVIDER_LIMITER_DEFAULTS = DEFAULT_LIMITS;
export const __PROVIDER_LIMITER_ENV_KEYS = ENV_KEYS;
