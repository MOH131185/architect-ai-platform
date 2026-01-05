/**
 * Centralized Error Handling Utilities
 *
 * Provides consistent error types and handling across the application.
 * Includes specialized error types for API, validation, and generation failures.
 */

import logger from "./logger.js";

// Base error class with additional context
class BaseError extends Error {
  constructor(message, code, statusCode, details) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

// API-related errors
export class APIError extends BaseError {
  constructor(message, statusCode = 500, details = {}) {
    super(message, "API_ERROR", statusCode, details);
    this.service = details.service || "unknown";
    this.endpoint = details.endpoint || "unknown";
  }
}

// Validation errors
export class ValidationError extends BaseError {
  constructor(message, field, value) {
    super(message, "VALIDATION_ERROR", 400, { field, value });
    this.field = field;
    this.value = value;
  }
}

// Rate limiting errors
export class RateLimitError extends BaseError {
  constructor(service, retryAfter = 6000) {
    const message = `Rate limit exceeded for ${service}. Retry after ${retryAfter}ms`;
    super(message, "RATE_LIMIT_ERROR", 429, { service, retryAfter });
    this.retryAfter = retryAfter;
  }
}

// Generation failures
export class GenerationError extends BaseError {
  constructor(message, step, details = {}) {
    super(message, "GENERATION_ERROR", 500, { step, ...details });
    this.step = step;
  }
}

// Configuration errors
export class ConfigurationError extends BaseError {
  constructor(message, missingConfig) {
    super(message, "CONFIGURATION_ERROR", 500, { missingConfig });
    this.missingConfig = missingConfig;
  }
}

// Network errors
export class NetworkError extends BaseError {
  constructor(message, url, originalError) {
    super(message, "NETWORK_ERROR", 0, {
      url,
      originalError: originalError?.message,
    });
    this.url = url;
    this.originalError = originalError;
  }
}

// Timeout errors
export class TimeoutError extends BaseError {
  constructor(operation, timeoutMs) {
    const message = `Operation '${operation}' timed out after ${timeoutMs}ms`;
    super(message, "TIMEOUT_ERROR", 408, { operation, timeoutMs });
  }
}

// DNA validation errors
export class DNAValidationError extends ValidationError {
  constructor(message, violations) {
    super(message, "dna", violations);
    this.violations = violations;
  }
}

// Preflight check errors
export class PreflightError extends BaseError {
  constructor(message, issues = []) {
    super(message, "PREFLIGHT_ERROR", 400, { issues });
    this.issues = issues;
  }
}

// Error handler utility
class ErrorHandler {
  constructor() {
    this.fallbackHandlers = new Map();
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
    };
  }

  // Register fallback handler for specific error types
  registerFallback(errorType, handler) {
    this.fallbackHandlers.set(errorType, handler);
  }

  // Handle error with appropriate fallback
  async handle(error, context = {}) {
    // Log the error
    logger.error(`Error in ${context.operation || "unknown operation"}`, {
      error: error.message,
      code: error.code,
      details: error.details,
      stack: error.stack,
    });

    // Check for registered fallback handler
    const fallbackHandler = this.fallbackHandlers.get(error.constructor);
    if (fallbackHandler) {
      try {
        return await fallbackHandler(error, context);
      } catch (fallbackError) {
        logger.error("Fallback handler failed", {
          originalError: error.message,
          fallbackError: fallbackError.message,
        });
      }
    }

    // Default handling based on error type
    if (error instanceof RateLimitError) {
      return this.handleRateLimit(error, context);
    }

    if (error instanceof NetworkError) {
      return this.handleNetworkError(error, context);
    }

    if (error instanceof ValidationError) {
      return this.handleValidationError(error, context);
    }

    // Generic error response
    return {
      success: false,
      error: error.toJSON
        ? error.toJSON()
        : {
            message: error.message,
            code: "UNKNOWN_ERROR",
          },
    };
  }

  // Handle rate limit errors with exponential backoff
  async handleRateLimit(error, context) {
    const { retryCount = 0 } = context;

    if (retryCount >= this.retryConfig.maxRetries) {
      throw new Error(
        `Max retries (${this.retryConfig.maxRetries}) exceeded for rate-limited operation`,
      );
    }

    const delay = Math.min(
      this.retryConfig.baseDelay *
        Math.pow(this.retryConfig.backoffMultiplier, retryCount),
      this.retryConfig.maxDelay,
    );

    logger.warn(
      `Rate limit hit, retrying after ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    // Return retry instruction
    return {
      shouldRetry: true,
      retryAfter: delay,
      retryCount: retryCount + 1,
    };
  }

  // Handle network errors
  async handleNetworkError(error, context) {
    const { retryCount = 0 } = context;

    if (retryCount >= 2) {
      // Less retries for network errors
      return {
        success: false,
        error: error.toJSON(),
        fallback: true,
      };
    }

    const delay = 2000 * (retryCount + 1);
    logger.warn(`Network error, retrying after ${delay}ms`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    return {
      shouldRetry: true,
      retryAfter: delay,
      retryCount: retryCount + 1,
    };
  }

  // Handle validation errors
  handleValidationError(error, context) {
    return {
      success: false,
      error: {
        ...error.toJSON(),
        userMessage: this.getUserFriendlyMessage(error),
      },
      showToUser: true,
    };
  }

  // Get user-friendly error messages
  getUserFriendlyMessage(error) {
    const messages = {
      API_ERROR: "Service temporarily unavailable. Please try again.",
      VALIDATION_ERROR: `Invalid input: ${error.message}`,
      RATE_LIMIT_ERROR: "Too many requests. Please wait a moment.",
      GENERATION_ERROR: "Failed to generate design. Please try again.",
      CONFIGURATION_ERROR:
        "System configuration error. Please contact support.",
      NETWORK_ERROR: "Connection failed. Please check your internet.",
      TIMEOUT_ERROR: "Request took too long. Please try again.",
      DNA_VALIDATION_ERROR: "Design validation failed. Adjusting parameters.",
    };

    return (
      messages[error.code] || "An unexpected error occurred. Please try again."
    );
  }

  // Wrap async functions with error handling
  wrap(asyncFn, context = {}) {
    return async (...args) => {
      try {
        return await asyncFn(...args);
      } catch (error) {
        return this.handle(error, { ...context, args });
      }
    };
  }

  // Create error from API response
  fromAPIResponse(response, service) {
    if (!response.ok) {
      const details = {
        service,
        endpoint: response.url,
        status: response.status,
        statusText: response.statusText,
      };

      if (response.status === 429) {
        return new RateLimitError(service);
      }

      if (response.status >= 500) {
        return new APIError(
          `${service} service error: ${response.statusText}`,
          response.status,
          details,
        );
      }

      if (response.status === 404) {
        return new APIError(`${service} endpoint not found`, 404, details);
      }

      if (response.status === 401 || response.status === 403) {
        return new ConfigurationError(
          `${service} authentication failed`,
          `${service}_API_KEY`,
        );
      }

      return new APIError(
        `${service} request failed`,
        response.status,
        details,
      );
    }
    return null;
  }
}

// Create singleton error handler
const errorHandler = new ErrorHandler();

// Utility function to safely execute with timeout
export async function withTimeout(promise, timeoutMs, operation = "Operation") {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new TimeoutError(operation, timeoutMs)), timeoutMs),
  );

  return Promise.race([promise, timeoutPromise]);
}

// Utility function for safe JSON parsing
export function safeJSONParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (error) {
    logger.warn("JSON parse failed", { text: text?.substring(0, 100) });
    return fallback;
  }
}

// Export everything
export default errorHandler;
export { BaseError, errorHandler, ErrorHandler };
