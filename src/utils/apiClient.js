/**
 * Centralized API Client
 *
 * Provides a standardized interface for all API calls with:
 * - Automatic error handling
 * - Performance monitoring
 * - Logging
 * - Retry logic
 * - Request/response interceptors
 */

import logger from './logger';
import errorHandler, { APIError, RateLimitError, NetworkError, TimeoutError, withTimeout } from './errors';
import performanceMonitor from './performance';

class APIClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL || process.env.REACT_APP_API_PROXY_URL || 'http://localhost:3001';
    this.defaultHeaders = {
      'Content-Type': 'application/json'
    };
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.defaultTimeout = 30000; // 30 seconds
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      retryOn: [408, 429, 500, 502, 503, 504],
      backoffMultiplier: 2
    };

    // Rate limiting configuration per service
    this.rateLimits = new Map([
      ['together', { minDelay: 6000, lastCall: 0 }],
      ['openai', { minDelay: 1000, lastCall: 0 }],
      ['replicate', { minDelay: 2000, lastCall: 0 }]
    ]);
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Apply request interceptors
   */
  async applyRequestInterceptors(config) {
    let modifiedConfig = { ...config };
    for (const interceptor of this.requestInterceptors) {
      modifiedConfig = await interceptor(modifiedConfig);
    }
    return modifiedConfig;
  }

  /**
   * Apply response interceptors
   */
  async applyResponseInterceptors(response) {
    let modifiedResponse = response;
    for (const interceptor of this.responseInterceptors) {
      modifiedResponse = await interceptor(modifiedResponse);
    }
    return modifiedResponse;
  }

  /**
   * Check and enforce rate limiting
   */
  async enforceRateLimit(service) {
    const rateLimit = this.rateLimits.get(service);
    if (!rateLimit) return;

    const now = Date.now();
    const timeSinceLastCall = now - rateLimit.lastCall;

    if (timeSinceLastCall < rateLimit.minDelay) {
      const waitTime = rateLimit.minDelay - timeSinceLastCall;
      logger.debug(`Rate limiting: waiting ${waitTime}ms for ${service}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    rateLimit.lastCall = Date.now();
  }

  /**
   * Build full URL
   */
  buildURL(endpoint) {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    return `${this.baseURL}${endpoint}`;
  }

  /**
   * Make HTTP request with retries and error handling
   */
  async request(config) {
    const {
      method = 'GET',
      endpoint,
      data = null,
      headers = {},
      timeout = this.defaultTimeout,
      retries = this.retryConfig.maxRetries,
      service = 'api',
      skipRateLimit = false
    } = config;

    // Apply rate limiting
    if (!skipRateLimit) {
      await this.enforceRateLimit(service);
    }

    // Start performance timer
    const perfTimer = performanceMonitor.timeAPI(endpoint, method);

    // Apply request interceptors
    const interceptedConfig = await this.applyRequestInterceptors({
      method,
      endpoint,
      data,
      headers: { ...this.defaultHeaders, ...headers },
      timeout,
      service
    });

    const url = this.buildURL(interceptedConfig.endpoint);

    // Log request
    logger.api(method, url, { service, hasData: !!data });

    // Prepare fetch options
    const fetchOptions = {
      method: interceptedConfig.method,
      headers: interceptedConfig.headers
    };

    if (data && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(data);
    }

    // Make request with timeout
    let attempt = 0;
    let lastError = null;

    while (attempt <= retries) {
      try {
        const fetchPromise = fetch(url, fetchOptions);
        const response = await withTimeout(
          fetchPromise,
          timeout,
          `${service} ${method} ${endpoint}`
        );

        // Check if response is ok
        if (!response.ok) {
          // Handle specific error codes
          if (response.status === 429) {
            throw new RateLimitError(service, this.rateLimits.get(service)?.minDelay);
          }

          throw new APIError(
            `${service} request failed`,
            response.status,
            {
              service,
              endpoint,
              status: response.status,
              statusText: response.statusText
            }
          );
        }

        // Parse response
        let responseData;
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          responseData = await response.json();
        } else if (contentType?.includes('text/')) {
          responseData = await response.text();
        } else {
          responseData = await response.blob();
        }

        // Apply response interceptors
        const interceptedResponse = await this.applyResponseInterceptors({
          data: responseData,
          status: response.status,
          headers: response.headers,
          config: interceptedConfig
        });

        // End performance timer
        const perfMetric = performanceMonitor.endTimer(perfTimer);

        // Log successful response
        logger.debug(`API response from ${service}`, {
          status: response.status,
          duration: perfMetric?.duration
        });

        return interceptedResponse.data || interceptedResponse;

      } catch (error) {
        lastError = error;

        // End performance timer on error
        performanceMonitor.endTimer(perfTimer);

        // Log error
        logger.error(`API request failed (attempt ${attempt + 1}/${retries + 1})`, {
          service,
          endpoint,
          error: error.message
        });

        // Determine if we should retry
        const shouldRetry = this.shouldRetry(error, attempt, retries);

        if (!shouldRetry) {
          break;
        }

        // Calculate retry delay
        const baseDelay = this.retryConfig.retryDelay;
        const multiplier = Math.pow(this.retryConfig.backoffMultiplier, attempt);
        const retryDelay = Math.min(baseDelay * multiplier, 30000);

        logger.info(`Retrying after ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        attempt++;
      }
    }

    // All retries exhausted, handle final error
    const errorResponse = await errorHandler.handle(lastError, { service, endpoint });

    if (errorResponse.fallback) {
      logger.warn(`Using fallback for ${service}`);
      return errorResponse.fallbackData;
    }

    throw lastError;
  }

  /**
   * Determine if request should be retried
   */
  shouldRetry(error, attempt, maxRetries) {
    if (attempt >= maxRetries) return false;

    if (error instanceof TimeoutError) return true;
    if (error instanceof NetworkError) return true;
    if (error instanceof RateLimitError) return true;

    if (error instanceof APIError) {
      return this.retryConfig.retryOn.includes(error.statusCode);
    }

    return false;
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    return this.request({
      method: 'GET',
      endpoint,
      ...options
    });
  }

  /**
   * POST request
   */
  async post(endpoint, data, options = {}) {
    return this.request({
      method: 'POST',
      endpoint,
      data,
      ...options
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data, options = {}) {
    return this.request({
      method: 'PUT',
      endpoint,
      data,
      ...options
    });
  }

  /**
   * PATCH request
   */
  async patch(endpoint, data, options = {}) {
    return this.request({
      method: 'PATCH',
      endpoint,
      data,
      ...options
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.request({
      method: 'DELETE',
      endpoint,
      ...options
    });
  }

  /**
   * Upload file
   */
  async uploadFile(endpoint, file, additionalData = {}, options = {}) {
    const formData = new FormData();
    formData.append('file', file);

    // Add additional data to form
    for (const [key, value] of Object.entries(additionalData)) {
      formData.append(key, value);
    }

    // Don't set Content-Type for FormData (browser sets it with boundary)
    const headers = { ...options.headers };
    delete headers['Content-Type'];

    return this.request({
      method: 'POST',
      endpoint,
      data: formData,
      headers,
      ...options
    });
  }

  /**
   * Batch requests
   */
  async batch(requests, options = {}) {
    const { parallel = true, stopOnError = false } = options;

    if (parallel) {
      // Execute all requests in parallel
      const promises = requests.map(req =>
        this.request(req).catch(error => {
          if (stopOnError) throw error;
          return { error: error.message, request: req };
        })
      );

      return Promise.all(promises);
    } else {
      // Execute requests sequentially
      const results = [];

      for (const req of requests) {
        try {
          const result = await this.request(req);
          results.push(result);
        } catch (error) {
          if (stopOnError) throw error;
          results.push({ error: error.message, request: req });
        }
      }

      return results;
    }
  }
}

// Create service-specific clients
class TogetherAIClient extends APIClient {
  constructor() {
    super();
    this.service = 'together';
  }

  async generateImage(prompt, options = {}) {
    return this.post('/api/together/image', {
      prompt,
      ...options
    }, {
      service: this.service,
      timeout: 60000 // 60 seconds for image generation
    });
  }

  async generateReasoning(messages, options = {}) {
    return this.post('/api/together/chat', {
      messages,
      ...options
    }, {
      service: this.service,
      timeout: 30000
    });
  }
}

class OpenAIClient extends APIClient {
  constructor() {
    super();
    this.service = 'openai';
  }

  async chat(messages, options = {}) {
    return this.post('/api/openai/chat', {
      messages,
      ...options
    }, {
      service: this.service
    });
  }

  async generateImage(prompt, options = {}) {
    return this.post('/api/openai/images', {
      prompt,
      ...options
    }, {
      service: this.service,
      timeout: 45000
    });
  }
}

class ReplicateClient extends APIClient {
  constructor() {
    super();
    this.service = 'replicate';
  }

  async createPrediction(input, options = {}) {
    return this.post('/api/replicate/predictions', {
      input,
      ...options
    }, {
      service: this.service
    });
  }

  async getPrediction(id) {
    return this.get(`/api/replicate/predictions/${id}`, {
      service: this.service
    });
  }
}

// Create singleton instances
const apiClient = new APIClient();
const togetherClient = new TogetherAIClient();
const openaiClient = new OpenAIClient();
const replicateClient = new ReplicateClient();

// Export clients
export default apiClient;
export {
  APIClient,
  TogetherAIClient,
  OpenAIClient,
  ReplicateClient,
  togetherClient,
  openaiClient,
  replicateClient
};