import { retryWithBackoff } from "./retryWithBackoff.js";
import { withProviderSlot } from "./providerLimiter.js";

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function parseRetryAfterMs(headers) {
  const raw = headers?.get?.("retry-after");
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return 0;
}

function retryableResponseError(providerKey, response) {
  const error = new Error(
    `${providerKey} upstream returned retryable status ${response.status}`,
  );
  error.status = response.status;
  error.retryAfterMs = parseRetryAfterMs(response.headers);
  error.response = response;
  return error;
}

export async function fetchWithProviderControls(
  providerKey,
  url,
  fetchOptions,
  retryOptions = {},
) {
  const {
    maxAttempts = 4,
    baseDelayMs,
    maxDelayMs,
    sleep,
    onRetry,
  } = retryOptions;

  return withProviderSlot(providerKey, async () => {
    try {
      return await retryWithBackoff(
        async () => {
          const response = await fetch(url, fetchOptions);
          if (RETRYABLE_STATUS.has(Number(response.status))) {
            throw retryableResponseError(providerKey, response);
          }
          return response;
        },
        {
          maxAttempts,
          baseDelayMs,
          maxDelayMs,
          sleep,
          onRetry,
        },
      );
    } catch (error) {
      if (error?.response) return error.response;
      throw error;
    }
  });
}

export const __PROVIDER_FETCH_RETRYABLE_STATUS = [...RETRYABLE_STATUS];
