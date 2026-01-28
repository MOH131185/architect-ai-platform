/**
 * Secure API Client Service
 *
 * SECURITY: All API calls go through server proxy to hide API keys
 * Never expose API keys in client-side code!
 *
 * This service provides a secure interface for all external API calls
 * by routing them through the backend proxy endpoints.
 */

import logger from '../utils/logger.js';
import { APIError, NetworkError, RateLimitError } from '../utils/errors.js';

class SecureApiClient {
  constructor() {
    // Determine base URL based on environment
    this.baseURL = process.env.NODE_ENV === 'production'
      ? '' // In production, use relative URLs (same domain)
      : 'http://localhost:3001'; // In development, use proxy server

    // Environment-aware endpoint paths
    const isDev = process.env.NODE_ENV !== 'production';
    this.endpoints = {
      togetherChat: isDev ? '/api/together/chat' : '/api/together-chat',
      togetherImage: isDev ? '/api/together/image' : '/api/together-image'
    };
  }

  /**
   * Make a secure API request through the proxy
   * @private
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const method = options.method || 'GET';

    logger.api(method, endpoint, {
      hasBody: !!options.body,
      headers: Object.keys(options.headers || {})
    });

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Create appropriate error type
        let error;
        if (response.status === 429) {
          error = new RateLimitError(endpoint, errorData.retryAfter || 60000);
        } else {
          // 🔧 STRINGIFY ERROR: Prevent "[object Object]" by converting non-string errors
          let errorMessage;
          if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          } else if (errorData.message && typeof errorData.message === 'string') {
            errorMessage = errorData.message;
          } else if (errorData.error && typeof errorData.error === 'object') {
            // Convert object errors to readable strings
            errorMessage = JSON.stringify(errorData.error);
          } else {
            errorMessage = `API request failed: ${response.status}`;
          }

          error = new APIError(
            errorMessage,
            response.status,
            { endpoint, method, service: 'SecureAPIClient' }
          );
        }

        logger.error('API request failed', {
          endpoint,
          method,
          status: response.status,
          error: error.message,
          errorData: errorData // Log the actual error data
        });

        throw error;
      }

      const data = await response.json();
      logger.debug('API request successful', {
        endpoint,
        method,
        hasData: !!data
      });

      return data;
    } catch (error) {
      // If not already one of our custom errors, wrap it
      if (!(error instanceof APIError) && !(error instanceof RateLimitError)) {
        const networkError = new NetworkError(
          `Network request failed for ${endpoint}`,
          url,
          error
        );

        logger.error('Network error', {
          endpoint,
          method,
          error: networkError.message,
          originalError: error.message
        });

        throw networkError;
      }

      throw error;
    }
  }

  // ==================== OpenAI API ====================

  /**
   * OpenAI Chat Completion (GPT-4)
   * @param {Object} params - Chat parameters
   * @returns {Promise<Object>} Chat completion response
   */
  async openaiChat(params) {
    return this.makeRequest('/api/openai/chat', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * OpenAI Image Generation (DALL-E)
   * @param {Object} params - Image generation parameters
   * @returns {Promise<Object>} Generated image response
   */
  async openaiImage(params) {
    return this.makeRequest('/api/openai/images', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  // ==================== Together AI API ====================

  /**
   * Together AI Chat Completion
   * @param {Object} params - Chat parameters
   * @returns {Promise<Object>} Chat completion response
   */
  async togetherChat(params) {
    return this.makeRequest(this.endpoints.togetherChat, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Together AI Image Generation (FLUX)
   * @param {Object} params - Image generation parameters
   * @returns {Promise<Object>} Generated image response with proxied URL
   */
  async togetherImage(params) {
    const response = await this.makeRequest(this.endpoints.togetherImage, {
      method: 'POST',
      body: JSON.stringify(params)
    });

    // Wrap URL with proxy to avoid CORS issues
    if (response && response.url) {
      const proxiedUrl = this.wrapImageUrlWithProxy(response.url);
      return {
        ...response,
        url: proxiedUrl,
        originalUrl: response.url // Keep original for reference
      };
    }

    return response;
  }

  /**
   * Wrap a remote image URL with proxy to avoid CORS issues
   * @param {string} imageUrl - Original image URL (e.g., from Together.ai)
   * @returns {string} Proxied URL (same-origin for CORS-free access)
   */
  wrapImageUrlWithProxy(imageUrl) {
    if (!imageUrl) return imageUrl;

    // If already a data URL or proxy URL, return as-is
    if (imageUrl.startsWith('data:') || imageUrl.includes('/api/proxy')) {
      return imageUrl;
    }

    // Use proxy endpoint (same-origin for CORS-free access)
    const proxyPath = '/api/proxy-image';
    const fullProxyUrl = `${this.baseURL}${proxyPath}?url=${encodeURIComponent(imageUrl)}`;

    return fullProxyUrl;
  }

  // ==================== Replicate API ====================

  /**
   * Create Replicate Prediction
   * @param {Object} params - Prediction parameters
   * @returns {Promise<Object>} Prediction response
   */
  async replicatePredict(params) {
    return this.makeRequest('/api/replicate/predictions', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Get Replicate Prediction Status
   * @param {string} id - Prediction ID
   * @returns {Promise<Object>} Prediction status
   */
  async replicateStatus(id) {
    return this.makeRequest(`/api/replicate/predictions/${id}`);
  }

  /**
   * Cancel Replicate Prediction
   * @param {string} id - Prediction ID
   * @returns {Promise<Object>} Cancellation response
   */
  async replicateCancel(id) {
    return this.makeRequest(`/api/replicate/predictions/${id}/cancel`, {
      method: 'POST'
    });
  }

  // ==================== Utility Methods ====================

  /**
   * Check if a specific API is available (server-side check)
   * This should be replaced with a server endpoint that checks API key presence
   * @param {string} api - API name ('openai', 'replicate', 'together')
   * @returns {Promise<boolean>} Whether API is available
   */
  async checkApiAvailability(api) {
    try {
      // In the future, this should call a server endpoint
      // For now, we'll assume all configured APIs are available
      // The server should handle missing API keys gracefully
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get API health status
   * @returns {Promise<Object>} Health status of all APIs
   */
  async getHealthStatus() {
    return this.makeRequest('/api/health');
  }
}

// Export singleton instance
const secureApiClient = new SecureApiClient();
export default secureApiClient;

/**
 * MIGRATION GUIDE:
 *
 * Replace direct API calls in services:
 *
 * OLD (INSECURE):
 * ```javascript
 * const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
 * const response = await fetch('https://api.openai.com/v1/chat/completions', {
 *   headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
 * });
 * ```
 *
 * NEW (SECURE):
 * ```javascript
 * import secureApiClient from './secureApiClient';
 * const response = await secureApiClient.openaiChat({
 *   model: 'gpt-4',
 *   messages: [...]
 * });
 * ```
 */