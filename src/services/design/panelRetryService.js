/**
 * Panel Retry Service
 *
 * Handles retry logic for failed panel generation.
 */

/**
 * Maximum retries constant
 */
export const MAX_RETRIES = 3;

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: MAX_RETRIES,
  backoffMs: 2000,
  backoffMultiplier: 1.5,
};

// Track retry statistics
let retryStats = {
  totalRetries: 0,
  successfulRetries: 0,
  failedRetries: 0,
  panelRetries: {},
};

/**
 * Execute with retries
 * @param {Function} fn - Async function to execute
 * @param {Object} config - Retry configuration
 * @returns {Promise<any>} Result of successful execution
 */
export async function executeWithRetry(fn, config = {}) {
  const { maxRetries, backoffMs, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError;
  let delay = backoffMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      console.warn(
        `[RetryService] Attempt ${attempt}/${maxRetries} failed:`,
        error.message,
      );

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }
  }

  throw lastError;
}

/**
 * Retry panel generation
 * @param {Function} generateFn - Generation function
 * @param {Object} panelConfig - Panel configuration
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} Generated panel
 */
export async function retryPanelGeneration(
  generateFn,
  panelConfig,
  options = {},
) {
  return executeWithRetry(async (attempt) => {
    const result = await generateFn(panelConfig, { ...options, attempt });
    if (!result || !result.url) {
      throw new Error("Invalid panel result");
    }
    return result;
  }, options.retry || DEFAULT_RETRY_CONFIG);
}

/**
 * Retry a failed panel
 * @param {Object} panel - Failed panel
 * @param {Function} generateFn - Generation function
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} Regenerated panel
 */
export async function retryFailedPanel(panel, generateFn, options = {}) {
  const panelType = panel?.type || "unknown";
  retryStats.totalRetries++;
  retryStats.panelRetries[panelType] =
    (retryStats.panelRetries[panelType] || 0) + 1;

  try {
    const result = await retryPanelGeneration(generateFn, panel, options);
    retryStats.successfulRetries++;
    return result;
  } catch (error) {
    retryStats.failedRetries++;
    throw error;
  }
}

/**
 * Get retry statistics
 * @returns {Object} Retry statistics
 */
export function getRetryStatistics() {
  return { ...retryStats };
}

/**
 * Reset retry statistics
 */
export function resetRetryStatistics() {
  retryStats = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    panelRetries: {},
  };
}

/**
 * Check if error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
export function isRetryableError(error) {
  if (!error) return false;

  const message = error.message?.toLowerCase() || "";

  // Network errors are retryable
  if (message.includes("network") || message.includes("timeout")) {
    return true;
  }

  // Rate limits are retryable
  if (message.includes("rate limit") || message.includes("429")) {
    return true;
  }

  // Server errors are retryable
  if (message.includes("500") || message.includes("503")) {
    return true;
  }

  return false;
}

export default {
  MAX_RETRIES,
  DEFAULT_RETRY_CONFIG,
  executeWithRetry,
  retryPanelGeneration,
  retryFailedPanel,
  getRetryStatistics,
  resetRetryStatistics,
  isRetryableError,
};
