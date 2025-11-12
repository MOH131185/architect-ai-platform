/**
 * Storage Manager with Quota Handling
 *
 * Manages localStorage with automatic cleanup when quota is exceeded.
 * Prevents app crashes from storage quota errors.
 */

import logger from './logger.js';

class StorageManager {
  constructor(maxItems = 50, maxSizeMB = 5) {
    this.maxItems = maxItems;
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
    this.storagePrefix = 'archiAI_';
  }

  /**
   * Set item with automatic cleanup on quota exceeded
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be JSON serialized)
   * @param {Object} options - Storage options
   * @param {boolean} options.addTimestamp - Add timestamp to value (default: true)
   * @returns {boolean} Success status
   */
  setItem(key, value, options = { addTimestamp: true }) {
    try {
      const prefixedKey = this.storagePrefix + key;

      // Add timestamp for cleanup tracking
      // IMPORTANT: Don't spread arrays (converts to objects with numeric keys)
      let dataToStore;
      if (options.addTimestamp) {
        if (Array.isArray(value)) {
          // For arrays, wrap in an object to preserve array structure
          dataToStore = { _data: value, _timestamp: Date.now() };
        } else if (value && typeof value === 'object') {
          // For objects, use spread
          dataToStore = { ...value, _timestamp: Date.now() };
        } else {
          // For primitives, wrap in object
          dataToStore = { _data: value, _timestamp: Date.now() };
        }
      } else {
        dataToStore = value;
      }

      const serialized = JSON.stringify(dataToStore);

      // Check size before storing
      const sizeBytes = new Blob([serialized]).size;
      if (sizeBytes > this.maxSize) {
        logger.warn(`Item ${key} exceeds max size`, {
          sizeMB: (sizeBytes / 1024 / 1024).toFixed(2),
          maxMB: (this.maxSize / 1024 / 1024).toFixed(2)
        });
        this.cleanup(prefixedKey);
      }

      try {
        localStorage.setItem(prefixedKey, serialized);
        logger.debug(`Successfully stored ${key}`, {
          sizeKB: (sizeBytes / 1024).toFixed(2)
        }, '💾');
        return true;
      } catch (innerError) {
        logger.error(`Failed to store ${key}`, {
          errorName: innerError.name,
          errorMessage: innerError.message,
          sizeKB: (sizeBytes / 1024).toFixed(2),
          storageUsage: this.getStorageUsage(),
          prefixedKey: prefixedKey,
          isLocalStorageAvailable: typeof localStorage !== 'undefined',
          storageLength: typeof localStorage !== 'undefined' ? localStorage.length : 'N/A',
          fullError: innerError
        });
        throw innerError; // Re-throw to be caught by outer catch
      }

    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        logger.warn('Storage quota exceeded, performing cleanup', {
          currentUsage: `${this.getStorageUsage()}%`,
          key
        }, '💾');
        this.cleanup(this.storagePrefix + key);

        try {
          // Retry after cleanup
          const serialized = JSON.stringify(value);
          const retrySize = new Blob([serialized]).size;
          localStorage.setItem(this.storagePrefix + key, serialized);
          logger.success(`Successfully stored ${key} after cleanup`, {
            sizeKB: (retrySize / 1024).toFixed(2),
            newUsage: `${this.getStorageUsage()}%`
          });
          return true;
        } catch (retryError) {
          logger.error(`Failed to store ${key} even after cleanup`, {
            error: retryError.name,
            message: retryError.message,
            usageAfterCleanup: `${this.getStorageUsage()}%`,
            attemptedSizeKB: (new Blob([JSON.stringify(value)]).size / 1024).toFixed(2)
          });
          return false;
        }
      } else {
        logger.error(`Storage error for ${key}`, {
          errorName: error.name,
          errorMessage: error.message,
          errorType: typeof error,
          isSecurityError: error.name === 'SecurityError',
          isDOMException: error instanceof DOMException,
          code: error.code || 'N/A',
          stack: error.stack
        });

        // Provide specific guidance based on error type
        if (error.name === 'SecurityError') {
          logger.error('SecurityError detected: Check if cookies/storage are enabled, try regular browsing mode (not incognito), check if site is in restricted mode', null, '🔒');
        } else if (error.name === 'InvalidStateError') {
          logger.error('InvalidStateError detected: Storage may be corrupted, try clearing browser cache and cookies');
        }

        return false;
      }
    }
  }

  /**
   * Get item from storage
   * @param {string} key - Storage key
   * @param {any} defaultValue - Default value if not found
   * @returns {any} Stored value or default
   */
  getItem(key, defaultValue = null) {
    try {
      const prefixedKey = this.storagePrefix + key;
      const item = localStorage.getItem(prefixedKey);

      if (item === null) {
        return defaultValue;
      }

      const parsed = JSON.parse(item);

      // Handle timestamp wrapper
      if (parsed && typeof parsed === 'object' && '_timestamp' in parsed) {
        // If _data exists, this was an array or primitive wrapped for timestamp
        if ('_data' in parsed) {
          return parsed._data;
        }

        // Otherwise, it's an object - remove timestamp
        const { _timestamp, ...data } = parsed;
        return data;
      }

      return parsed;
    } catch (error) {
      logger.error(`Error reading ${key}`, error);
      return defaultValue;
    }
  }

  /**
   * Remove item from storage
   * @param {string} key - Storage key
   */
  removeItem(key) {
    try {
      localStorage.removeItem(this.storagePrefix + key);
    } catch (error) {
      logger.error(`Error removing ${key}`, error);
    }
  }

  /**
   * Cleanup old items to free space
   * @param {string} preserveKey - Key to preserve during cleanup
   * @param {number} removePercentage - Percentage of items to remove (default: 20%)
   */
  cleanup(preserveKey, removePercentage = 0.2) {
    try {
      logger.info('Starting storage cleanup', null, '🧹');

      // Get all keys with our prefix
      const keys = Object.keys(localStorage).filter(k =>
        k.startsWith(this.storagePrefix) && k !== preserveKey
      );

      if (keys.length === 0) {
        logger.warn('No items to clean up');
        return;
      }

      // Sort by timestamp (oldest first)
      const sorted = keys.sort((a, b) => {
        try {
          const aData = JSON.parse(localStorage[a]);
          const bData = JSON.parse(localStorage[b]);
          const aTime = aData?._timestamp || 0;
          const bTime = bData?._timestamp || 0;
          return aTime - bTime;
        } catch {
          return 0;
        }
      });

      // Remove oldest items
      const toRemove = Math.max(1, Math.floor(sorted.length * removePercentage));
      const removed = sorted.slice(0, toRemove);

      removed.forEach(key => {
        localStorage.removeItem(key);
      });

      logger.success(`Cleaned up ${removed.length} old items`, {
        storageUsage: `${this.getStorageUsage()}%`
      });
    } catch (error) {
      logger.error('Cleanup error', error);
    }
  }

  /**
   * Get approximate storage usage percentage
   * @returns {number} Usage percentage (0-100)
   */
  getStorageUsage() {
    try {
      let total = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key) && key.startsWith(this.storagePrefix)) {
          total += localStorage[key].length + key.length;
        }
      }

      // Approximate: most browsers have 5-10MB limit
      const estimatedLimit = 5 * 1024 * 1024; // 5MB
      return Math.round((total / estimatedLimit) * 100);
    } catch {
      return 0;
    }
  }

  /**
   * Clear all items with our prefix
   */
  clearAll() {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(this.storagePrefix));
      keys.forEach(key => localStorage.removeItem(key));
      logger.info(`Cleared ${keys.length} items`, null, '🗑️');
    } catch (error) {
      logger.error('Clear all error', error);
    }
  }

  /**
   * Get all keys (without prefix)
   * @returns {string[]} Array of keys
   */
  getAllKeys() {
    try {
      return Object.keys(localStorage)
        .filter(k => k.startsWith(this.storagePrefix))
        .map(k => k.replace(this.storagePrefix, ''));
    } catch {
      return [];
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage stats
   */
  getStats() {
    try {
      const keys = this.getAllKeys();
      let totalSize = 0;

      keys.forEach(key => {
        const item = localStorage.getItem(this.storagePrefix + key);
        if (item) {
          totalSize += item.length;
        }
      });

      return {
        itemCount: keys.length,
        totalSizeKB: (totalSize / 1024).toFixed(2),
        usagePercent: this.getStorageUsage(),
        oldestItem: this.getOldestItem(),
        newestItem: this.getNewestItem()
      };
    } catch {
      return null;
    }
  }

  /**
   * Debug utility: Print detailed storage information
   * Useful for diagnosing storage issues in browser console
   */
  debugStorage() {
    console.log('🔍 ========================================');
    console.log('🔍 STORAGE DEBUG INFORMATION');
    console.log('🔍 ========================================\n');

    const stats = this.getStats();
    if (stats) {
      console.log(`📊 Total Items: ${stats.itemCount}`);
      console.log(`📦 Total Size: ${stats.totalSizeKB} KB`);
      console.log(`💾 Usage: ${stats.usagePercent}%`);
      console.log(`🕐 Oldest Item: ${stats.oldestItem ? new Date(stats.oldestItem).toISOString() : 'N/A'}`);
      console.log(`🕑 Newest Item: ${stats.newestItem ? new Date(stats.newestItem).toISOString() : 'N/A'}`);
    }

    console.log('\n📋 Keys by Size:');
    const keys = this.getAllKeys();
    const keysSizes = keys.map(key => {
      const item = localStorage.getItem(this.storagePrefix + key);
      return {
        key,
        sizeKB: item ? (item.length / 1024).toFixed(2) : 0
      };
    }).sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));

    keysSizes.slice(0, 10).forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.key}: ${item.sizeKB} KB`);
    });

    console.log('\n🔍 ========================================\n');

    return stats;
  }

  /**
   * Test storage write capability
   * @returns {Object} Test results
   */
  testStorage() {
    const testKey = 'storage_test';
    const testData = { test: 'data', timestamp: Date.now() };

    logger.info('Testing storage write capability', null, '🧪');

    try {
      const success = this.setItem(testKey, testData);

      if (!success) {
        logger.error('Storage write failed');
        return { success: false, error: 'Write failed' };
      }

      const retrieved = this.getItem(testKey);

      if (JSON.stringify(retrieved) !== JSON.stringify(testData)) {
        logger.error('Storage read mismatch');
        return { success: false, error: 'Read mismatch' };
      }

      this.removeItem(testKey);
      logger.success('Storage test passed');

      return { success: true };
    } catch (error) {
      logger.error('Storage test error', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get oldest item timestamp
   * @returns {number|null} Timestamp or null
   */
  getOldestItem() {
    try {
      const keys = this.getAllKeys();
      let oldest = Date.now();

      keys.forEach(key => {
        const item = this.getItem(key);
        if (item && item._timestamp && item._timestamp < oldest) {
          oldest = item._timestamp;
        }
      });

      return oldest === Date.now() ? null : oldest;
    } catch {
      return null;
    }
  }

  /**
   * Get newest item timestamp
   * @returns {number|null} Timestamp or null
   */
  getNewestItem() {
    try {
      const keys = this.getAllKeys();
      let newest = 0;

      keys.forEach(key => {
        const item = this.getItem(key);
        if (item && item._timestamp && item._timestamp > newest) {
          newest = item._timestamp;
        }
      });

      return newest === 0 ? null : newest;
    } catch {
      return null;
    }
  }
}

// Export singleton instance
const storageManager = new StorageManager();

export default storageManager;
export { StorageManager };
