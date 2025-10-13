/**
 * Logger utility for development and production environments
 * Automatically disables console logs in production unless explicitly enabled
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isDebugEnabled = process.env.REACT_APP_DEBUG === 'true';

const logger = {
  log: (...args) => {
    if (isDevelopment || isDebugEnabled) {
      console.log(...args);
    }
  },

  error: (...args) => {
    // Always log errors
    console.error(...args);
  },

  warn: (...args) => {
    if (isDevelopment || isDebugEnabled) {
      console.warn(...args);
    }
  },

  info: (...args) => {
    if (isDevelopment || isDebugEnabled) {
      console.info(...args);
    }
  },

  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },

  group: (label) => {
    if (isDevelopment || isDebugEnabled) {
      console.group(label);
    }
  },

  groupEnd: () => {
    if (isDevelopment || isDebugEnabled) {
      console.groupEnd();
    }
  },

  table: (data) => {
    if (isDevelopment || isDebugEnabled) {
      console.table(data);
    }
  },

  time: (label) => {
    if (isDevelopment || isDebugEnabled) {
      console.time(label);
    }
  },

  timeEnd: (label) => {
    if (isDevelopment || isDebugEnabled) {
      console.timeEnd(label);
    }
  }
};

export default logger;