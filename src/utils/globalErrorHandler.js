/**
 * Global Error Handler
 *
 * Initializes global error handling for unhandled promise rejections,
 * uncaught exceptions, and React error boundaries.
 *
 * Should be initialized once in index.js or App.js
 */

import logger from './logger';
import errorHandler, {
  APIError,
  NetworkError,
  RateLimitError,
  ValidationError,
  GenerationError,
  ConfigurationError
} from './errors';

class GlobalErrorHandler {
  constructor() {
    this.initialized = false;
    this.errorCount = 0;
    this.errorHistory = [];
    this.maxHistorySize = 50;
  }

  /**
   * Initialize global error handlers
   * Call this once at app startup
   */
  initialize() {
    if (this.initialized) {
      logger.warn('Global error handler already initialized');
      return;
    }

    // Handle unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
      window.addEventListener('error', this.handleUncaughtError.bind(this));
    } else if (typeof process !== 'undefined') {
      // Node.js environment
      process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
      process.on('uncaughtException', this.handleUncaughtException.bind(this));
    }

    this.initialized = true;
    logger.info('Global error handler initialized');
  }

  /**
   * Handle unhandled promise rejections
   */
  handleUnhandledRejection(event) {
    const error = event.reason || event;

    logger.error('Unhandled Promise Rejection', {
      error: error.message || String(error),
      stack: error.stack,
      type: error.name,
      timestamp: new Date().toISOString()
    });

    this.recordError(error, 'unhandled_rejection');

    // Try to extract useful information
    const errorInfo = this.extractErrorInfo(error);

    // Log to external service if configured (e.g., Sentry)
    this.reportToExternalService(error, 'unhandled_rejection', errorInfo);

    // Prevent default browser behavior (showing error in console)
    if (event.preventDefault) {
      event.preventDefault();
    }

    // Show user-friendly message for critical errors
    if (this.isCriticalError(error)) {
      this.showUserErrorNotification(error);
    }
  }

  /**
   * Handle uncaught errors (browser)
   */
  handleUncaughtError(event) {
    const error = event.error || new Error(event.message);

    logger.error('Uncaught Error', {
      error: error.message,
      stack: error.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });

    this.recordError(error, 'uncaught_error');
    this.reportToExternalService(error, 'uncaught_error');

    // Don't prevent default for uncaught errors - let browser handle it
  }

  /**
   * Handle uncaught exceptions (Node.js)
   */
  handleUncaughtException(error) {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });

    this.recordError(error, 'uncaught_exception');
    this.reportToExternalService(error, 'uncaught_exception');

    // In Node.js, uncaught exceptions are fatal - log and exit gracefully
    process.exit(1);
  }

  /**
   * Extract useful information from error
   */
  extractErrorInfo(error) {
    const info = {
      name: error.name || 'Error',
      message: error.message || String(error),
      timestamp: new Date().toISOString()
    };

    // Add custom error properties
    if (error.code) info.code = error.code;
    if (error.statusCode) info.statusCode = error.statusCode;
    if (error.details) info.details = error.details;
    if (error.service) info.service = error.service;
    if (error.endpoint) info.endpoint = error.endpoint;
    if (error.retryAfter) info.retryAfter = error.retryAfter;

    // Categorize error
    info.category = this.categorizeError(error);
    info.severity = this.getErrorSeverity(error);
    info.retryable = this.isRetryableError(error);

    return info;
  }

  /**
   * Categorize error type
   */
  categorizeError(error) {
    if (error instanceof APIError) return 'api';
    if (error instanceof NetworkError) return 'network';
    if (error instanceof RateLimitError) return 'rate_limit';
    if (error instanceof ValidationError) return 'validation';
    if (error instanceof GenerationError) return 'generation';
    if (error instanceof ConfigurationError) return 'configuration';
    if (error.name === 'TypeError') return 'type_error';
    if (error.name === 'ReferenceError') return 'reference_error';
    if (error.name === 'SyntaxError') return 'syntax_error';
    return 'unknown';
  }

  /**
   * Determine error severity
   */
  getErrorSeverity(error) {
    // Critical errors that break the app
    if (error instanceof ConfigurationError) return 'critical';
    if (error.name === 'ReferenceError') return 'critical';
    if (error.name === 'SyntaxError') return 'critical';

    // High severity - major features broken
    if (error instanceof GenerationError) return 'high';
    if (error instanceof APIError && error.statusCode >= 500) return 'high';

    // Medium severity - recoverable issues
    if (error instanceof RateLimitError) return 'medium';
    if (error instanceof NetworkError) return 'medium';
    if (error instanceof ValidationError) return 'medium';

    // Low severity - minor issues
    return 'low';
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    if (error instanceof RateLimitError) return true;
    if (error instanceof NetworkError) return true;
    if (error instanceof APIError && error.statusCode >= 500) return true;
    return false;
  }

  /**
   * Check if error is critical
   */
  isCriticalError(error) {
    return this.getErrorSeverity(error) === 'critical';
  }

  /**
   * Record error in history
   */
  recordError(error, context) {
    this.errorCount++;
    this.errorHistory.push({
      error: this.extractErrorInfo(error),
      context,
      timestamp: new Date().toISOString(),
      errorNumber: this.errorCount
    });

    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // Check for error patterns
    this.detectErrorPatterns();
  }

  /**
   * Detect patterns in recent errors
   */
  detectErrorPatterns() {
    if (this.errorHistory.length < 5) return;

    const recentErrors = this.errorHistory.slice(-10);
    const errorTypes = recentErrors.map(e => e.error.category);

    // Check for repeated errors (same type 3+ times)
    const typeCounts = {};
    errorTypes.forEach(type => {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    Object.entries(typeCounts).forEach(([type, count]) => {
      if (count >= 3) {
        logger.warn(`Error pattern detected: ${count} ${type} errors in last 10`, {
          recentErrorTypes: errorTypes
        });
      }
    });

    // Check for rapid succession (5+ errors in 60 seconds)
    const now = Date.now();
    const recentTime = recentErrors.filter(e => {
      const errorTime = new Date(e.timestamp).getTime();
      return (now - errorTime) < 60000;
    });

    if (recentTime.length >= 5) {
      logger.error('High error rate detected: 5+ errors in 60 seconds', {
        errorCount: recentTime.length,
        types: recentTime.map(e => e.error.category)
      });
    }
  }

  /**
   * Show user-friendly error notification
   */
  showUserErrorNotification(error) {
    const userMessage = errorHandler.getUserFriendlyMessage(error);

    // Try to show toast notification if available
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast(userMessage, 'error');
    } else if (typeof window !== 'undefined') {
      // Fallback to alert (not ideal but works)
      console.error('Critical Error:', userMessage);
    }
  }

  /**
   * Report error to external service (Sentry, LogRocket, etc.)
   */
  reportToExternalService(error, context, errorInfo = null) {
    // Check if Sentry is configured
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          error: errorInfo || this.extractErrorInfo(error),
          handler: { context }
        }
      });
      return;
    }

    // Check if LogRocket is configured
    if (typeof window !== 'undefined' && window.LogRocket) {
      window.LogRocket.captureException(error, {
        tags: {
          context,
          category: errorInfo?.category || 'unknown'
        }
      });
      return;
    }

    // Custom reporting endpoint (if configured)
    const reportingEndpoint = process.env.REACT_APP_ERROR_REPORTING_URL;
    if (reportingEndpoint) {
      fetch(reportingEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: errorInfo || this.extractErrorInfo(error),
          context,
          userAgent: navigator?.userAgent,
          url: window?.location?.href
        })
      }).catch(err => {
        // Silently fail if reporting fails
        logger.debug('Failed to report error to external service', { error: err.message });
      });
    }
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    const categories = {};
    const severities = {};

    this.errorHistory.forEach(entry => {
      const category = entry.error.category;
      const severity = entry.error.severity;

      categories[category] = (categories[category] || 0) + 1;
      severities[severity] = (severities[severity] || 0) + 1;
    });

    return {
      totalErrors: this.errorCount,
      recentErrors: this.errorHistory.length,
      categories,
      severities,
      initialized: this.initialized
    };
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
    logger.info('Error history cleared');
  }

  /**
   * Export error logs
   */
  exportLogs() {
    return {
      statistics: this.getStatistics(),
      history: this.errorHistory,
      exportedAt: new Date().toISOString()
    };
  }
}

// Create singleton instance
const globalErrorHandler = new GlobalErrorHandler();

// Auto-initialize in browser environment
if (typeof window !== 'undefined') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalErrorHandler.initialize();
    });
  } else {
    globalErrorHandler.initialize();
  }
}

export default globalErrorHandler;
export { GlobalErrorHandler };