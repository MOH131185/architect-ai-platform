import logger from '../utils/logger.js';

/**
 * DNA Cache Utility - Caches generated DNA for reuse
 * Prevents regeneration of identical DNA specifications
 */

class DNACache {
  constructor() {
    this.cache = new Map();
    this.maxAge = 3600000; // 1 hour default
    this.maxEntries = 50; // Maximum cache entries
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Generate cache key from project context
   */
  generateKey(projectContext) {
    // Create a stable key from critical project parameters
    const keyData = {
      building_program: projectContext.building_program || projectContext.buildingProgram,
      floors: projectContext.floors || projectContext.specifications?.floors,
      floor_area: projectContext.floor_area || projectContext.area,
      location: projectContext.location?.address,
      style: projectContext.style || projectContext.architecturalStyle,
      materials: projectContext.materials,
      seed: projectContext.projectSeed
    };

    // Sort keys for consistency
    const sortedKeyData = Object.keys(keyData)
      .sort()
      .reduce((obj, key) => {
        obj[key] = keyData[key];
        return obj;
      }, {});

    return JSON.stringify(sortedKeyData);
  }

  /**
   * Retrieve cached DNA if available and not expired
   */
  get(projectContext) {
    const key = this.generateKey(projectContext);
    const cached = this.cache.get(key);

    if (cached) {
      const age = Date.now() - cached.timestamp;

      if (age < this.maxAge) {
        this.hitCount++;
        const ageInSeconds = Math.round(age / 1000);
        logger.info(`🎯 DNA Cache HIT (age: ${ageInSeconds}s, hit rate: ${this.getHitRate()}%)`);

        // Update last accessed time
        cached.lastAccessed = Date.now();

        // Return deep clone to prevent mutations
        return JSON.parse(JSON.stringify(cached.dna));
      } else {
        // Expired entry
        logger.info('⏰ DNA Cache expired, removing entry');
        this.cache.delete(key);
        this.missCount++;
      }
    } else {
      this.missCount++;
      logger.info(`💭 DNA Cache MISS (hit rate: ${this.getHitRate()}%)`);
    }

    return null;
  }

  /**
   * Store DNA in cache
   */
  set(projectContext, dna) {
    // Check cache size limit
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    const key = this.generateKey(projectContext);
    const entry = {
      dna: JSON.parse(JSON.stringify(dna)), // Store deep clone
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      projectInfo: {
        type: projectContext.building_program || projectContext.buildingProgram,
        location: projectContext.location?.address?.substring(0, 50)
      }
    };

    this.cache.set(key, entry);
    logger.info(`💾 DNA cached (total entries: ${this.cache.size})`);
  }

  /**
   * Evict oldest entry when cache is full
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      logger.info(`🗑️ Evicting oldest DNA cache entry (${entry.projectInfo.type})`);
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    logger.info(`🗑️ DNA cache cleared (removed ${size} entries)`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.getHitRate(),
      totalRequests: totalRequests,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Calculate hit rate percentage
   */
  getHitRate() {
    const total = this.hitCount + this.missCount;
    if (total === 0) return 0;
    return Math.round((this.hitCount / total) * 100);
  }

  /**
   * Estimate memory usage
   */
  estimateMemoryUsage() {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry).length;
    }
    return `${Math.round(totalSize / 1024)}KB`;
  }

  /**
   * Set cache configuration
   */
  configure(options = {}) {
    if (options.maxAge) this.maxAge = options.maxAge;
    if (options.maxEntries) this.maxEntries = options.maxEntries;
    logger.info('⚙️ DNA Cache configured:', {
      maxAge: `${this.maxAge / 1000}s`,
      maxEntries: this.maxEntries
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(projectContext) {
    const key = this.generateKey(projectContext);
    if (this.cache.has(key)) {
      this.cache.delete(key);
      logger.info('❌ DNA cache entry invalidated');
      return true;
    }
    return false;
  }

  /**
   * Prefetch/warm cache with DNA
   */
  warmCache(projectContexts, dnaGenerator) {
    logger.info(`🔥 Warming DNA cache with ${projectContexts.length} entries...`);

    projectContexts.forEach(async (context) => {
      if (!this.get(context)) {
        try {
          const dna = await dnaGenerator(context);
          this.set(context, dna);
        } catch (error) {
          logger.error('Failed to warm cache entry:', error);
        }
      }
    });
  }

  /**
   * Export cache for debugging
   */
  exportCache() {
    const entries = [];
    for (const [key, value] of this.cache.entries()) {
      entries.push({
        key: key.substring(0, 50) + '...',
        age: Math.round((Date.now() - value.timestamp) / 1000) + 's',
        type: value.projectInfo.type,
        location: value.projectInfo.location
      });
    }
    return entries;
  }
}

// Create singleton instance
const dnaCache = new DNACache();

// Export both the class and singleton instance
export { DNACache };
export default dnaCache;