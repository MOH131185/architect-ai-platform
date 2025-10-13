/**
 * Production-Safe Logger Utility
 *
 * This utility provides environment-aware logging that:
 * - Shows detailed logs in development
 * - Minimizes console output in production
 * - Maintains error tracking for production debugging
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

// Set log level based on environment
const getLogLevel = () => {
  if (isProduction) return LOG_LEVELS.ERROR;
  if (isTest) return LOG_LEVELS.WARN;
  return LOG_LEVELS.VERBOSE; // Development shows everything
};

const currentLogLevel = getLogLevel();

class ProductionLogger {
  /**
   * Error logging - always shown
   */
  error(...args) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  }

  /**
   * Warning logging - shown in development and test
   */
  warn(...args) {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  }

  /**
   * Info logging - shown in development
   */
  info(...args) {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.info('[INFO]', ...args);
    }
  }

  /**
   * Debug logging - shown in development
   */
  debug(...args) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  /**
   * Verbose logging - shown only in development
   */
  verbose(...args) {
    if (currentLogLevel >= LOG_LEVELS.VERBOSE) {
      console.log(...args);
    }
  }

  /**
   * Performance timing - shown in development
   */
  time(label) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.timeEnd(label);
    }
  }

  /**
   * Group logging - shown in development
   */
  group(...args) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.group(...args);
    }
  }

  groupEnd() {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.groupEnd();
    }
  }

  /**
   * Table logging - shown in development
   */
  table(data) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.table(data);
    }
  }

  /**
   * Clear console - only in development
   */
  clear() {
    if (isDevelopment) {
      console.clear();
    }
  }

  /**
   * Special method for performance metrics
   * Always logged but formatted differently in production
   */
  performance(metric, value, unit = 'ms') {
    if (isProduction) {
      // In production, only log as structured data for monitoring
      console.info(JSON.stringify({
        type: 'PERFORMANCE',
        metric,
        value,
        unit,
        timestamp: new Date().toISOString()
      }));
    } else {
      // In development, show friendly format
      console.log(`⚡ Performance: ${metric} = ${value}${unit}`);
    }
  }

  /**
   * Special method for API errors
   * Always logged with appropriate detail level
   */
  apiError(service, error, details = {}) {
    const errorData = {
      service,
      error: error.message || error,
      timestamp: new Date().toISOString(),
      ...details
    };

    if (isProduction) {
      // In production, log structured data
      console.error(JSON.stringify({
        type: 'API_ERROR',
        ...errorData
      }));
    } else {
      // In development, show detailed error
      console.error(`❌ API Error [${service}]:`, error);
      if (Object.keys(details).length > 0) {
        console.error('Details:', details);
      }
    }
  }

  /**
   * Success logging with emoji (development only)
   */
  success(...args) {
    if (isDevelopment) {
      console.log('✅', ...args);
    }
  }

  /**
   * Step logging for workflows (development only)
   */
  step(stepNumber, stepName, ...args) {
    if (isDevelopment) {
      console.log(`🔸 Step ${stepNumber}: ${stepName}`, ...args);
    }
  }
}

// Create singleton instance
const logger = new ProductionLogger();

// Export both the class and the instance
export { ProductionLogger, logger as default };

/**
 * Usage Examples:
 *
 * import logger from './utils/productionLogger';
 *
 * // These show in development only:
 * logger.debug('Debug information');
 * logger.verbose('Detailed logging');
 * logger.success('Operation completed');
 * logger.step(1, 'Initializing', { data });
 *
 * // These show in development and test:
 * logger.warn('Warning message');
 *
 * // These always show:
 * logger.error('Error occurred', error);
 * logger.apiError('OpenAI', error, { endpoint: '/chat' });
 * logger.performance('floorPlansGeneration', 42.3, 's');
 *
 * // Performance timing (development only):
 * logger.time('operation');
 * // ... do work ...
 * logger.timeEnd('operation');
 */