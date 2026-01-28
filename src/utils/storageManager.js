/**
 * Storage Manager with Quota Handling
 *
 * Manages storage with pluggable backends (localStorage, IndexedDB).
 * Prevents app crashes from storage quota errors.
 * 
 * REFACTORED: Now supports multiple backend types via factory pattern.
 */

import logger from './logger.js';

/**
 * Storage Backend Interface
 */
class StorageBackend {
  async setItem(key, value) {
    throw new Error('Not implemented');
  }

  async getItem(key) {
    throw new Error('Not implemented');
  }

  async removeItem(key) {
    throw new Error('Not implemented');
  }

  async getAllKeys() {
    throw new Error('Not implemented');
  }

  async clear() {
    throw new Error('Not implemented');
  }
}

/**
 * LocalStorage Backend
 */
class LocalStorageBackend extends StorageBackend {
  constructor(prefix = 'archiAI_') {
    super();
    this.prefix = prefix;
  }

  async setItem(key, value) {
    const prefixedKey = this.prefix + key;
    localStorage.setItem(prefixedKey, value);
  }

  async getItem(key) {
    const prefixedKey = this.prefix + key;
    return localStorage.getItem(prefixedKey);
  }

  async removeItem(key) {
    const prefixedKey = this.prefix + key;
    localStorage.removeItem(prefixedKey);
  }

  async getAllKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.replace(this.prefix, ''));
      }
    }
    return keys;
  }

  async clear() {
    const keys = await this.getAllKeys();
    for (const key of keys) {
      await this.removeItem(key);
    }
  }
}

/**
 * IndexedDB Backend (future implementation)
 */
class IndexedDBBackend extends StorageBackend {
  constructor(dbName = 'archiAI', storeName = 'storage', prefix = 'archiAI_') {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.prefix = prefix;
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });

    return this.initPromise;
  }

  async setItem(key, value) {
    await this.init();
    const prefixedKey = this.prefix + key;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, prefixedKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getItem(key) {
    await this.init();
    const prefixedKey = this.prefix + key;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(prefixedKey);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async removeItem(key) {
    await this.init();
    const prefixedKey = this.prefix + key;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(prefixedKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllKeys() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const keys = request.result
          .filter(k => k.startsWith(this.prefix))
          .map(k => k.replace(this.prefix, ''));
        resolve(keys);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clear() {
    await this.init();
    const keys = await this.getAllKeys();

    for (const key of keys) {
      await this.removeItem(key);
    }
  }
}

/**
 * Create storage backend
 * @param {string} kind - Backend type: 'localStorage' or 'indexedDB'
 * @param {Object} options - Backend options
 * @returns {StorageBackend} Backend instance
 */
export function createStorageBackend(kind = 'localStorage', options = {}) {
  const prefix = options.prefix || 'archiAI_';

  switch (kind) {
    case 'indexedDB':
      return new IndexedDBBackend(
        options.dbName || 'archiAI',
        options.storeName || 'storage',
        prefix
      );
    case 'localStorage':
    default:
      return new LocalStorageBackend(prefix);
  }
}

class StorageManager {
  constructor(maxItems = 50, maxSizeMB = 5, backend = null) {
    this.maxItems = maxItems;
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
    this.storagePrefix = 'archiAI_';
    this.backend = backend || new LocalStorageBackend(this.storagePrefix);
  }

  /**
   * Set item with automatic cleanup on quota exceeded
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be JSON serialized)
   * @param {Object} options - Storage options
   * @param {boolean} options.addTimestamp - Add timestamp to value (default: true)
   * @returns {Promise<boolean>} Success status
   */
  async setItem(key, value, options = { addTimestamp: true }) {
    // Declare outside try block so it's accessible in catch
    let dataToStore;

    try {
      // Add timestamp for cleanup tracking
      // IMPORTANT: Don't spread arrays (converts to objects with numeric keys)
      if (options.addTimestamp) {
        if (Array.isArray(value)) {
          // For arrays, wrap in an object to preserve array structure
          dataToStore = { _data: value, _timestamp: Date.now(), _schemaVersion: 2 };
        } else if (value && typeof value === 'object') {
          // For objects, use spread
          dataToStore = { ...value, _timestamp: Date.now(), _schemaVersion: 2 };
        } else {
          // For primitives, wrap in object
          dataToStore = { _data: value, _timestamp: Date.now(), _schemaVersion: 2 };
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
        await this.cleanup(key);
      }

      try {
        await this.backend.setItem(key, serialized);
        logger.debug(`Successfully stored ${key}`, {
          sizeKB: (sizeBytes / 1024).toFixed(2)
        }, '💾');
        return true;
      } catch (innerError) {
        logger.error(`Failed to store ${key}`, {
          errorName: innerError.name,
          errorMessage: innerError.message,
          sizeKB: (sizeBytes / 1024).toFixed(2),
          storageUsage: await this.getStorageUsage()
        });
        throw innerError; // Re-throw to be caught by outer catch
      }

    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        logger.warn('Storage quota exceeded, performing cleanup', {
          currentUsage: `${await this.getStorageUsage()}%`,
          key
        }, '💾');
        await this.cleanup(key);

        try {
          // Retry after cleanup
          const serialized = JSON.stringify(dataToStore);
          const retrySize = new Blob([serialized]).size;
          await this.backend.setItem(key, serialized);
          logger.success(`Successfully stored ${key} after cleanup`, {
            sizeKB: (retrySize / 1024).toFixed(2),
            newUsage: `${await this.getStorageUsage()}%`
          });
          return true;
        } catch (retryError) {
          // Last resort: if cleanup couldn't remove anything else, drop the existing value for
          // this key and retry once. This can recover from older oversized values that can't be
          // overwritten due to temporary quota allocation behavior in some browsers.
          try {
            const keysAfterCleanup = await this.backend.getAllKeys();
            const otherKeys = keysAfterCleanup.filter(k => k !== key);

            if (otherKeys.length === 0) {
              const existingValue = await this.backend.getItem(key);
              const serialized = JSON.stringify(dataToStore);

              if (existingValue && existingValue.length > serialized.length) {
                const retrySize = new Blob([serialized]).size;
                logger.warn(`Only ${key} remains in storage; dropping previous value and retrying`, {
                  existingSizeKB: (existingValue.length / 1024).toFixed(2),
                  attemptedSizeKB: (retrySize / 1024).toFixed(2)
                });

                await this.backend.removeItem(key);
                await this.backend.setItem(key, serialized);

                logger.success(`Successfully stored ${key} after dropping previous value`, {
                  sizeKB: (retrySize / 1024).toFixed(2),
                  newUsage: `${await this.getStorageUsage()}%`
                });
                return true;
              }
            }
          } catch (finalAttemptError) {
            logger.warn('Final storage recovery attempt failed', {
              key,
              errorName: finalAttemptError?.name,
              errorMessage: finalAttemptError?.message
            });
          }

          logger.error(`Failed to store ${key} even after cleanup`, {
            error: retryError.name,
            message: retryError.message,
            usageAfterCleanup: `${await this.getStorageUsage()}%`,
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
          code: error.code || 'N/A'
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
   * @returns {Promise<any>} Stored value or default
   */
  async getItem(key, defaultValue = null) {
    try {
      const item = await this.backend.getItem(key);

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

        // Otherwise, it's an object - remove timestamp and schema version
        const { _timestamp, _schemaVersion, ...data } = parsed;
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
   * @returns {Promise<void>}
   */
  async removeItem(key) {
    try {
      await this.backend.removeItem(key);
    } catch (error) {
      logger.error(`Error removing ${key}`, error);
    }
  }

  /**
   * Cleanup old items to free space
   * @param {string} preserveKey - Key to preserve during cleanup
   * @param {number} removePercentage - Percentage of items to remove (default: 50%)
   * @returns {Promise<void>}
   */
  async cleanup(preserveKey, removePercentage = 0.8) {
    try {
      logger.info('Starting storage cleanup', null, '🧹');

      // Get all keys
      const allKeys = await this.backend.getAllKeys();
      const keys = allKeys.filter(k => k !== preserveKey);

      if (keys.length === 0) {
        logger.warn('No items to clean up');
        return;
      }

      // Sort by timestamp (oldest first)
      const keysWithTimestamps = await Promise.all(
        keys.map(async (key) => {
          try {
            const item = await this.backend.getItem(key);
            const data = JSON.parse(item);
            return { key, timestamp: data?._timestamp || 0 };
          } catch {
            return { key, timestamp: 0 };
          }
        })
      );

      const sorted = keysWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);

      // Remove oldest items - very aggressive (80% instead of 50%) to ensure space
      const toRemove = Math.max(1, Math.floor(sorted.length * removePercentage));
      const removed = sorted.slice(0, toRemove);

      for (const item of removed) {
        await this.backend.removeItem(item.key);
      }

      logger.success(`Cleaned up ${removed.length} old items`, {
        storageUsage: `${await this.getStorageUsage()}%`
      });
    } catch (error) {
      logger.error('Cleanup error', error);
    }
  }

  /**
   * Get approximate storage usage percentage
   * @returns {Promise<number>} Usage percentage (0-100)
   */
  async getStorageUsage() {
    try {
      const keys = await this.backend.getAllKeys();
      let total = 0;

      for (const key of keys) {
        const item = await this.backend.getItem(key);
        if (item) {
          total += item.length + key.length;
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
   * @returns {Promise<void>}
   */
  async clearAll() {
    try {
      await this.backend.clear();
      const keys = await this.backend.getAllKeys();
      logger.info(`Cleared ${keys.length} items`, null, '🗑️');
    } catch (error) {
      logger.error('Clear all error', error);
    }
  }

  /**
   * Get all keys (without prefix)
   * @returns {Promise<string[]>} Array of keys
   */
  async getAllKeys() {
    try {
      return await this.backend.getAllKeys();
    } catch {
      return [];
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage stats
   */
  async getStats() {
    try {
      const keys = await this.getAllKeys();
      let totalSize = 0;

      for (const key of keys) {
        const item = await this.backend.getItem(key);
        if (item) {
          totalSize += item.length;
        }
      }

      return {
        itemCount: keys.length,
        totalSizeKB: (totalSize / 1024).toFixed(2),
        usagePercent: await this.getStorageUsage(),
        oldestItem: await this.getOldestItem(),
        newestItem: await this.getNewestItem()
      };
    } catch {
      return null;
    }
  }

  /**
   * Debug utility: Print detailed storage information
   * Useful for diagnosing storage issues in browser console
   * @returns {Promise<Object>} Storage stats
   */
  async debugStorage() {
    logger.info('🔍 ========================================');
    logger.info('🔍 STORAGE DEBUG INFORMATION');
    logger.info('🔍 ========================================\n');

    const stats = await this.getStats();
    if (stats) {
      logger.info(`📊 Total Items: ${stats.itemCount}`);
      logger.info(`📦 Total Size: ${stats.totalSizeKB} KB`);
      logger.info(`💾 Usage: ${stats.usagePercent}%`);
      logger.info(`🕐 Oldest Item: ${stats.oldestItem ? new Date(stats.oldestItem).toISOString() : 'N/A'}`);
      logger.info(`🕑 Newest Item: ${stats.newestItem ? new Date(stats.newestItem).toISOString() : 'N/A'}`);
    }

    logger.info('\n📋 Keys by Size:');
    const keys = await this.getAllKeys();
    const keysSizes = await Promise.all(
      keys.map(async (key) => {
        const item = await this.backend.getItem(key);
        return {
          key,
          sizeKB: item ? (item.length / 1024).toFixed(2) : 0
        };
      })
    );

    keysSizes.sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));

    keysSizes.slice(0, 10).forEach((item, index) => {
      logger.info(`   ${index + 1}. ${item.key}: ${item.sizeKB} KB`);
    });

    logger.info('\n🔍 ========================================\n');

    return stats;
  }

  /**
   * Test storage write capability
   * @returns {Promise<Object>} Test results
   */
  async testStorage() {
    const testKey = 'storage_test';
    const testData = { test: 'data', timestamp: Date.now() };

    logger.info('Testing storage write capability', null, '🧪');

    try {
      const success = await this.setItem(testKey, testData);

      if (!success) {
        logger.error('Storage write failed');
        return { success: false, error: 'Write failed' };
      }

      const retrieved = await this.getItem(testKey);

      if (JSON.stringify(retrieved) !== JSON.stringify(testData)) {
        logger.error('Storage read mismatch');
        return { success: false, error: 'Read mismatch' };
      }

      await this.removeItem(testKey);
      logger.success('Storage test passed');

      return { success: true };
    } catch (error) {
      logger.error('Storage test error', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get oldest item timestamp
   * @returns {Promise<number|null>} Timestamp or null
   */
  async getOldestItem() {
    try {
      const keys = await this.getAllKeys();
      let oldest = Date.now();

      for (const key of keys) {
        const item = await this.getItem(key);
        if (item && item._timestamp && item._timestamp < oldest) {
          oldest = item._timestamp;
        }
      }

      return oldest === Date.now() ? null : oldest;
    } catch {
      return null;
    }
  }

  /**
   * Get newest item timestamp
   * @returns {Promise<number|null>} Timestamp or null
   */
  async getNewestItem() {
    try {
      const keys = await this.getAllKeys();
      let newest = 0;

      for (const key of keys) {
        const item = await this.getItem(key);
        if (item && item._timestamp && item._timestamp > newest) {
          newest = item._timestamp;
        }
      }

      return newest === 0 ? null : newest;
    } catch {
      return null;
    }
  }
}

// Export singleton instance with localStorage backend (default)
const storageManager = new StorageManager();

export default storageManager;
export { StorageManager, StorageBackend, LocalStorageBackend, IndexedDBBackend };
