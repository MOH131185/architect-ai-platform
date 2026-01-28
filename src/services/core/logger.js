/**
 * Core Logger Service
 * Provides centralized logging for the application
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor(context = "App") {
    this.context = context;
    this.level = LOG_LEVELS.INFO;
  }

  setLevel(level) {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  }

  debug(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.log(`[${this.context}] DEBUG:`, ...args);
    }
  }

  info(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.log(`[${this.context}] INFO:`, ...args);
    }
  }

  warn(...args) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn(`[${this.context}] WARN:`, ...args);
    }
  }

  error(...args) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error(`[${this.context}] ERROR:`, ...args);
    }
  }
}

// Create default logger instance
const logger = new Logger();

export default logger;
export { Logger, LOG_LEVELS };
