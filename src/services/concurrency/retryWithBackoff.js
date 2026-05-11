/**
 * Retry-with-backoff helper for upstream provider calls.
 *
 * Designed for OpenAI-style 429 / 503 / network failures. Honours
 * `Retry-After` header (seconds or HTTP-date) when the caller surfaces it
 * via the thrown error's `retryAfterMs` / `retryAfter` field.
 *
 * Caller convention: pass an async `attempt()` function. If it throws an
 * error with `error.status` in {429, 502, 503, 504} OR a network-class error
 * (TypeError, fetch failure), we retry with exponential backoff bounded by
 * `maxAttempts`. Other errors (4xx other than 429) bubble immediately so
 * authority-gate failures (e.g. STRICT_IMAGE2_FAIL_CLOSED) still propagate.
 *
 * Tests can inject `now()` and `sleep()` to make timing deterministic.
 */

const DEFAULT_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8000;

function isNetworkError(err) {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  const msg = String(err.message || "").toLowerCase();
  return /fetch|network|econnreset|econnrefused|etimedout|abort/.test(msg);
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

/**
 * @param {Function} attempt - async () => result
 * @param {Object} [options]
 * @param {number} [options.maxAttempts=4]
 * @param {number} [options.baseDelayMs=500]
 * @param {number} [options.maxDelayMs=8000]
 * @param {Set<number>} [options.retryableStatus]
 * @param {Function} [options.sleep] - test injection
 * @param {Function} [options.onRetry] - (attemptNumber, delayMs, err) => void
 * @returns {Promise<any>} attempt result
 */
export async function retryWithBackoff(attempt, options = {}) {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    retryableStatus = DEFAULT_RETRYABLE_STATUS,
    sleep = defaultSleep,
    onRetry = null,
  } = options;

  let lastError = null;
  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await attempt();
    } catch (err) {
      lastError = err;
      const status = Number(err?.status);
      const retryable = retryableStatus.has(status) || isNetworkError(err);
      if (!retryable || i === maxAttempts) {
        throw err;
      }
      // Retry-After honours the upstream's hint when present.
      const retryAfterMs =
        Number(err?.retryAfterMs) ||
        (Number(err?.retryAfter) > 0 ? Number(err.retryAfter) * 1000 : 0);
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (i - 1));
      const delay = Math.max(retryAfterMs, exp);
      if (typeof onRetry === "function") {
        try {
          onRetry(i, delay, err);
        } catch (_) {
          // onRetry failures must never mask the original error
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastError;
}

export const __RETRY_DEFAULTS = Object.freeze({
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_RETRYABLE_STATUS: [...DEFAULT_RETRYABLE_STATUS],
});
