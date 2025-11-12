/**
 * Centralized Logger Utility
 *
 * Provides consistent logging across the application with:
 * - Environment-aware logging (can be disabled in production)
 * - Categorized log levels (debug, info, warn, error)
 * - Emoji prefixes for visual scanning
 * - Structured error logging
 *
 * Usage:
 * ```js
 * import logger from './utils/logger';
 *
 * logger.info('User logged in', { userId: 123 });
 * logger.warn('API rate limit approaching', { remaining: 10 });
 * logger.error('Failed to generate design', error);
 * logger.debug('State update', { before, after });
 * ```
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

/**
 * Log levels with priorities
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

/**
 * Current log level (can be configured via environment variable)
 * Default: DEBUG in development, INFO in production, NONE in test
 */
const CURRENT_LOG_LEVEL = IS_TEST
  ? LogLevel.NONE
  : IS_PRODUCTION
  ? LogLevel.INFO
  : LogLevel.DEBUG;

/**
 * Emoji prefixes for each log level
 */
const EMOJI_PREFIX = {
  [LogLevel.DEBUG]: '🐛',
  [LogLevel.INFO]: 'ℹ️',
  [LogLevel.WARN]: '⚠️',
  [LogLevel.ERROR]: '❌'
};

/**
 * Format log message with timestamp and emoji
 */
function formatMessage(level, message, emoji) {
  const timestamp = new Date().toISOString();
  const prefix = emoji || EMOJI_PREFIX[level] || '';
  return `[${timestamp}] ${prefix} ${message}`;
}

/**
 * Check if log level should be output
 */
function shouldLog(level) {
  return level >= CURRENT_LOG_LEVEL;
}

/**
 * Logger class
 */
class Logger {
  /**
   * Debug-level logging (only in development)
   * Use for detailed debugging information
   */
  debug(message, data = null, emoji = '🐛') {
    if (!shouldLog(LogLevel.DEBUG)) return;

    if (data) {
      console.debug(formatMessage(LogLevel.DEBUG, message, emoji), data);
    } else {
      console.debug(formatMessage(LogLevel.DEBUG, message, emoji));
    }
  }

  /**
   * Info-level logging
   * Use for general informational messages
   */
  info(message, data = null, emoji = 'ℹ️') {
    if (!shouldLog(LogLevel.INFO)) return;

    if (data) {
      console.log(formatMessage(LogLevel.INFO, message, emoji), data);
    } else {
      console.log(formatMessage(LogLevel.INFO, message, emoji));
    }
  }

  /**
   * Warning-level logging
   * Use for potentially problematic situations
   */
  warn(message, data = null, emoji = '⚠️') {
    if (!shouldLog(LogLevel.WARN)) return;

    if (data) {
      console.warn(formatMessage(LogLevel.WARN, message, emoji), data);
    } else {
      console.warn(formatMessage(LogLevel.WARN, message, emoji));
    }
  }

  /**
   * Error-level logging
   * Use for error conditions
   */
  error(message, error = null, emoji = '❌') {
    if (!shouldLog(LogLevel.ERROR)) return;

    if (error instanceof Error) {
      console.error(formatMessage(LogLevel.ERROR, message, emoji), {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    } else if (error) {
      console.error(formatMessage(LogLevel.ERROR, message, emoji), error);
    } else {
      console.error(formatMessage(LogLevel.ERROR, message, emoji));
    }
  }

  /**
   * Success logging (info level with ✅ emoji)
   */
  success(message, data = null) {
    this.info(message, data, '✅');
  }

  /**
   * Loading/progress logging (info level with hourglass emoji)
   */
  loading(message, data = null) {
    this.info(message, data, '⏳');
  }

  /**
   * API call logging (info level with network emoji)
   */
  api(message, data = null) {
    this.info(message, data, '🌐');
  }

  /**
   * Performance logging (debug level with stopwatch emoji)
   */
  performance(message, data = null) {
    this.debug(message, data, '⏱️');
  }

  /**
   * Security/auth logging (info level with shield emoji)
   */
  security(message, data = null) {
    this.info(message, data, '🔒');
  }

  /**
   * File operation logging (debug level with file emoji)
   */
  file(message, data = null) {
    this.debug(message, data, '📁');
  }

  /**
   * AI/generation logging (info level with brain emoji)
   */
  ai(message, data = null) {
    this.info(message, data, '🧠');
  }

  /**
   * Group-start for nested logging
   */
  group(label, emoji = '📦') {
    if (!shouldLog(LogLevel.INFO)) return;
    console.group(formatMessage(LogLevel.INFO, label, emoji));
  }

  /**
   * Group-end for nested logging
   */
  groupEnd() {
    if (!shouldLog(LogLevel.INFO)) return;
    console.groupEnd();
  }

  /**
   * Table logging for structured data
   */
  table(data, label = null) {
    if (!shouldLog(LogLevel.DEBUG)) return;
    if (label) {
      console.log(formatMessage(LogLevel.DEBUG, label, '📊'));
    }
    console.table(data);
  }

  /**
   * Timer start
   */
  time(label) {
    if (!shouldLog(LogLevel.DEBUG)) return;
    console.time(label);
  }

  /**
   * Timer end
   */
  timeEnd(label) {
    if (!shouldLog(LogLevel.DEBUG)) return;
    console.timeEnd(label);
  }
}

// Export singleton instance
const logger = new Logger();

export default logger;

// Also export LogLevel for advanced usage
export { LogLevel };
