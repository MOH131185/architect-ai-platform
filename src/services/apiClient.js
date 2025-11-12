/**
 * Unified API Client
 *
 * Provides a consistent interface for making API calls with:
 * - Automatic dev/prod routing
 * - Timeout handling
 * - Retry logic with exponential backoff
 * - Standardized error handling
 * - Request/response logging
 *
 * Version: 1.0.0
 * Last Updated: 2025-10-25
 *
 * @module services/apiClient
 */

import { getApiUrl, IS_DEV } from '../config/appConfig.js';
import { createError } from '../domain/dna.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  timeout: 120000, // 2 minutes default timeout
  retries: 2, // Number of retry attempts
  retryDelay: 1000, // Initial retry delay in ms (exponential backoff)
  retryableStatusCodes: [408, 429, 500, 502, 503, 504], // HTTP status codes to retry
  logRequests: IS_DEV // Log requests in development
};

/**
 * HTTP methods
 */
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE'
};

/**
 * API request options
 *
 * @typedef {Object} ApiRequestOptions
 * @property {string} method - HTTP method
 * @property {Object} [headers] - Request headers
 * @property {*} [body] - Request body (will be JSON stringified)
 * @property {number} [timeout] - Request timeout in ms
 * @property {number} [retries] - Number of retry attempts
 * @property {number} [retryDelay] - Initial retry delay in ms
 * @property {number[]} [retryableStatusCodes] - Status codes to retry on
 * @property {boolean} [logRequests] - Whether to log requests
 * @property {AbortSignal} [signal] - AbortSignal for cancellation
 */

/**
 * API response wrapper
 *
 * @typedef {Object} ApiResponse
 * @property {boolean} ok - Whether request was successful
 * @property {number} status - HTTP status code
 * @property {string} statusText - HTTP status text
 * @property {*} data - Response data (parsed JSON or text)
 * @property {Headers} headers - Response headers
 * @property {string} url - Request URL
 * @property {number} latencyMs - Request latency in milliseconds
 */

/**
 * Sleep for a specified duration
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an AbortController with timeout
 *
 * @param {number} timeout - Timeout in milliseconds
 * @param {AbortSignal} [existingSignal] - Existing signal to combine with
 * @returns {AbortController} Abort controller
 */
function createTimeoutController(timeout, existingSignal) {
  const controller = new AbortController();

  // Set timeout
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeout}ms`));
  }, timeout);

  // If there's an existing signal, listen to it
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort(existingSignal.reason);
    });
  }

  // Clean up timeout on abort
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
  });

  return controller;
}

/**
 * Check if a response status code is retryable
 *
 * @param {number} status - HTTP status code
 * @param {number[]} retryableStatusCodes - List of retryable status codes
 * @returns {boolean}
 */
function isRetryableStatus(status, retryableStatusCodes) {
  return retryableStatusCodes.includes(status);
}

/**
 * Parse response based on content type
 *
 * @param {Response} response - Fetch response
 * @returns {Promise<*>} Parsed response data
 */
async function parseResponse(response) {
  const contentType = response.headers.get('content-type');

  if (contentType && contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (error) {
      console.warn('Failed to parse JSON response:', error);
      return await response.text();
    }
  } else {
    return await response.text();
  }
}

/**
 * Make an HTTP request with retry logic and timeout handling
 *
 * @param {string} url - Request URL
 * @param {ApiRequestOptions} options - Request options
 * @returns {Promise<ApiResponse>} API response
 * @throws {Error} If request fails after all retries
 */
async function makeRequest(url, options = {}) {
  const {
    method = HttpMethod.GET,
    headers = {},
    body,
    timeout = DEFAULT_CONFIG.timeout,
    retries = DEFAULT_CONFIG.retries,
    retryDelay = DEFAULT_CONFIG.retryDelay,
    retryableStatusCodes = DEFAULT_CONFIG.retryableStatusCodes,
    logRequests = DEFAULT_CONFIG.logRequests,
    signal
  } = options;

  const startTime = Date.now();
  let lastError = null;

  // Prepare request headers
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  // Prepare request body
  const requestBody =
    body && typeof body === 'object' ? JSON.stringify(body) : body;

  // Log request in dev mode
  if (logRequests) {
    console.log(`🌐 API Request: ${method} ${url}`);
    if (body) {
      console.log(`   Body: ${JSON.stringify(body, null, 2).substring(0, 200)}...`);
    }
  }

  // Retry loop
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create timeout controller
      const controller = createTimeoutController(timeout, signal);

      // Make fetch request
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        signal: controller.signal
      });

      const latencyMs = Date.now() - startTime;

      // Parse response
      const data = await parseResponse(response);

      // Log response in dev mode
      if (logRequests) {
        console.log(`   ✅ Response: ${response.status} ${response.statusText} (${latencyMs}ms)`);
      }

      // Check if we should retry based on status code
      if (!response.ok && isRetryableStatus(response.status, retryableStatusCodes)) {
        lastError = new Error(
          `Request failed with status ${response.status}: ${response.statusText}`
        );
        lastError.status = response.status;
        lastError.response = data;

        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
          if (logRequests) {
            console.warn(`   ⚠️  Retrying in ${delay}ms (attempt ${attempt + 1}/${retries})...`);
          }
          await sleep(delay);
          continue; // Retry
        }
      }

      // Return response wrapper
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        headers: response.headers,
        url: response.url,
        latencyMs
      };
    } catch (error) {
      lastError = error;

      // Check if error is retryable (network errors, timeouts)
      const isNetworkError =
        error.name === 'TypeError' ||
        error.name === 'AbortError' ||
        error.message.includes('timeout') ||
        error.message.includes('network');

      if (isNetworkError && attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        if (logRequests) {
          console.warn(
            `   ⚠️  Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries}): ${error.message}`
          );
        }
        await sleep(delay);
        continue; // Retry
      }

      // No more retries, throw error
      break;
    }
  }

  // All retries exhausted, throw last error
  const latencyMs = Date.now() - startTime;

  if (logRequests) {
    console.error(`   ❌ Request failed after ${retries} retries (${latencyMs}ms):`, lastError);
  }

  throw lastError;
}

/**
 * Make a GET request
 *
 * @param {string} service - Service name (e.g., 'openai', 'replicate')
 * @param {string} endpoint - Endpoint path
 * @param {Object} [options] - Additional options
 * @returns {Promise<ApiResponse>}
 */
export async function get(service, endpoint, options = {}) {
  const url = getApiUrl(service, endpoint);
  return makeRequest(url, { ...options, method: HttpMethod.GET });
}

/**
 * Make a POST request
 *
 * @param {string} service - Service name
 * @param {string} endpoint - Endpoint path
 * @param {*} body - Request body
 * @param {Object} [options] - Additional options
 * @returns {Promise<ApiResponse>}
 */
export async function post(service, endpoint, body, options = {}) {
  const url = getApiUrl(service, endpoint);
  return makeRequest(url, { ...options, method: HttpMethod.POST, body });
}

/**
 * Make a PUT request
 *
 * @param {string} service - Service name
 * @param {string} endpoint - Endpoint path
 * @param {*} body - Request body
 * @param {Object} [options] - Additional options
 * @returns {Promise<ApiResponse>}
 */
export async function put(service, endpoint, body, options = {}) {
  const url = getApiUrl(service, endpoint);
  return makeRequest(url, { ...options, method: HttpMethod.PUT, body });
}

/**
 * Make a PATCH request
 *
 * @param {string} service - Service name
 * @param {string} endpoint - Endpoint path
 * @param {*} body - Request body
 * @param {Object} [options] - Additional options
 * @returns {Promise<ApiResponse>}
 */
export async function patch(service, endpoint, body, options = {}) {
  const url = getApiUrl(service, endpoint);
  return makeRequest(url, { ...options, method: HttpMethod.PATCH, body });
}

/**
 * Make a DELETE request
 *
 * @param {string} service - Service name
 * @param {string} endpoint - Endpoint path
 * @param {Object} [options] - Additional options
 * @returns {Promise<ApiResponse>}
 */
export async function del(service, endpoint, options = {}) {
  const url = getApiUrl(service, endpoint);
  return makeRequest(url, { ...options, method: HttpMethod.DELETE });
}

/**
 * Make a direct request to a full URL (bypassing service routing)
 *
 * @param {string} url - Full URL
 * @param {ApiRequestOptions} options - Request options
 * @returns {Promise<ApiResponse>}
 */
export async function requestDirect(url, options = {}) {
  return makeRequest(url, options);
}

/**
 * Create a standardized API error from a response
 *
 * @param {ApiResponse} response - API response
 * @param {string} source - Service source
 * @returns {import('../domain/dna.js').ErrorResult}
 */
export function createApiError(response, source) {
  const code = `HTTP_${response.status}`;
  const message =
    typeof response.data === 'object' && response.data.error
      ? response.data.error.message || response.statusText
      : response.statusText;

  return createError(code, message, source, false, {
    status: response.status,
    url: response.url,
    data: response.data
  });
}

/**
 * Handle API response and throw on error
 *
 * @param {ApiResponse} response - API response
 * @param {string} source - Service source
 * @returns {*} Response data
 * @throws {Error} If response is not ok
 */
export function handleResponse(response, source) {
  if (!response.ok) {
    const apiError = createApiError(response, source);
    const error = new Error(apiError.message);
    error.code = apiError.code;
    error.source = apiError.source;
    error.details = apiError.details;
    throw error;
  }

  return response.data;
}

/* ============================================================================
 * EXPORTS
 * ========================================================================== */

export default {
  // HTTP methods
  HttpMethod,

  // Request methods
  get,
  post,
  put,
  patch,
  del: del,
  requestDirect,

  // Error handling
  createApiError,
  handleResponse
};
