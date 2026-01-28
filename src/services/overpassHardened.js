/**
 * Hardened Overpass API Service
 *
 * Provides robust access to OpenStreetMap Overpass API with:
 * - Caching (memory + sessionStorage)
 * - Exponential backoff retry
 * - Query optimization (smaller/lighter queries)
 * - Deterministic fallback when API unavailable
 * - 504 timeout handling
 *
 * Overpass API often returns 504 when overloaded.
 * Reference: https://wiki.openstreetmap.org/wiki/Overpass_API
 */

import logger from "../utils/logger.js";

/**
 * Configuration
 */
const CONFIG = {
  // Primary Overpass endpoint
  PRIMARY_ENDPOINT: "https://overpass-api.de/api/interpreter",

  // Fallback endpoints (round-robin if primary fails)
  FALLBACK_ENDPOINTS: [
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ],

  // Cache settings
  CACHE_TTL_MS: 15 * 60 * 1000, // 15 minutes
  MAX_CACHE_ENTRIES: 100,

  // Retry settings
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 2000,
  MAX_RETRY_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2,

  // Timeout settings
  REQUEST_TIMEOUT_MS: 30000,

  // Query limits
  MAX_QUERY_AREA_KM2: 1, // Limit query area to 1 km²
  DEFAULT_SEARCH_RADIUS_M: 200,
};

/**
 * In-memory cache
 */
const memoryCache = new Map();

/**
 * Request queue for rate limiting
 */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1000;

/**
 * Hash a string for cache key
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Generate cache key from query and coordinates
 */
function getCacheKey(query, lat, lng) {
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLng = Math.round(lng * 10000) / 10000;
  return `overpass_${hashString(query)}_${roundedLat}_${roundedLng}`;
}

/**
 * Get from cache (memory first, then sessionStorage)
 */
function getFromCache(key) {
  // Check memory cache
  const memEntry = memoryCache.get(key);
  if (memEntry && Date.now() - memEntry.timestamp < CONFIG.CACHE_TTL_MS) {
    logger.debug(`[Overpass] Cache hit (memory): ${key}`);
    return memEntry.data;
  }

  // Check sessionStorage
  if (typeof sessionStorage !== "undefined") {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const entry = JSON.parse(stored);
        if (Date.now() - entry.timestamp < CONFIG.CACHE_TTL_MS) {
          logger.debug(`[Overpass] Cache hit (storage): ${key}`);
          // Promote to memory cache
          memoryCache.set(key, entry);
          return entry.data;
        } else {
          // Expired, remove
          sessionStorage.removeItem(key);
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  return null;
}

/**
 * Store in cache (both memory and sessionStorage)
 */
function storeInCache(key, data) {
  const entry = { data, timestamp: Date.now() };

  // Memory cache (with size limit)
  if (memoryCache.size >= CONFIG.MAX_CACHE_ENTRIES) {
    // Remove oldest entry
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, entry);

  // SessionStorage
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch (e) {
      // Storage full or unavailable, ignore
    }
  }
}

/**
 * Wait for rate limit
 */
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    logger.debug(`[Overpass] Rate limit wait: ${waitTime}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Execute Overpass query with retries and fallback endpoints
 */
async function executeQuery(query, options = {}) {
  const {
    maxRetries = CONFIG.MAX_RETRIES,
    timeout = CONFIG.REQUEST_TIMEOUT_MS,
  } = options;

  const endpoints = [CONFIG.PRIMARY_ENDPOINT, ...CONFIG.FALLBACK_ENDPOINTS];
  let lastError = null;

  for (
    let endpointIndex = 0;
    endpointIndex < endpoints.length;
    endpointIndex++
  ) {
    const endpoint = endpoints[endpointIndex];
    let retryDelay = CONFIG.INITIAL_RETRY_DELAY_MS;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await waitForRateLimit();

        logger.debug(
          `[Overpass] Query attempt ${attempt}/${maxRetries} to ${endpoint.split("/")[2]}`,
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle 504 Gateway Timeout
        if (response.status === 504) {
          logger.warn(
            `[Overpass] 504 Gateway Timeout from ${endpoint.split("/")[2]}`,
          );
          throw new Error("504 Gateway Timeout");
        }

        // Handle 429 Too Many Requests
        if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers.get("retry-after") || "30",
            10,
          );
          logger.warn(
            `[Overpass] 429 Rate Limited, retry after ${retryAfter}s`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000),
          );
          continue;
        }

        if (!response.ok) {
          throw new Error(`Overpass API error: ${response.status}`);
        }

        const data = await response.json();
        logger.debug(
          `[Overpass] Query success: ${data.elements?.length || 0} elements`,
        );
        return data;
      } catch (error) {
        lastError = error;

        // Check if aborted due to timeout
        if (error.name === "AbortError") {
          logger.warn(`[Overpass] Request timeout (${timeout}ms)`);
        } else {
          logger.warn(`[Overpass] Attempt ${attempt} failed: ${error.message}`);
        }

        // Don't retry on last attempt
        if (attempt < maxRetries) {
          logger.debug(`[Overpass] Waiting ${retryDelay}ms before retry`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          retryDelay = Math.min(
            retryDelay * CONFIG.BACKOFF_MULTIPLIER,
            CONFIG.MAX_RETRY_DELAY_MS,
          );
        }
      }
    }

    // Move to next endpoint
    logger.warn(`[Overpass] Switching to fallback endpoint`);
  }

  // All endpoints and retries exhausted
  logger.error(`[Overpass] All attempts failed: ${lastError?.message}`);
  throw lastError || new Error("Overpass query failed");
}

/**
 * Build optimized building query (lighter than full boundary query)
 */
function buildBuildingQuery(
  lat,
  lng,
  radiusM = CONFIG.DEFAULT_SEARCH_RADIUS_M,
) {
  // Limit radius to prevent oversized queries
  const effectiveRadius = Math.min(radiusM, 500);

  return `
    [out:json][timeout:25];
    (
      way["building"](around:${effectiveRadius},${lat},${lng});
    );
    out geom;
  `.trim();
}

/**
 * Build optimized land parcel query
 */
function buildParcelQuery(lat, lng, radiusM = CONFIG.DEFAULT_SEARCH_RADIUS_M) {
  const effectiveRadius = Math.min(radiusM, 300);

  return `
    [out:json][timeout:25];
    (
      way["landuse"="residential"](around:${effectiveRadius},${lat},${lng});
      way["boundary"="lot"](around:${effectiveRadius},${lat},${lng});
      relation["boundary"="lot"](around:${effectiveRadius},${lat},${lng});
    );
    out geom;
  `.trim();
}

/**
 * Query for buildings near a location
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusM - Search radius in meters
 * @returns {Promise<Object>} Query result
 */
export async function queryBuildingsNear(
  lat,
  lng,
  radiusM = CONFIG.DEFAULT_SEARCH_RADIUS_M,
) {
  const query = buildBuildingQuery(lat, lng, radiusM);
  const cacheKey = getCacheKey(query, lat, lng);

  // Check cache
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const result = await executeQuery(query);
    storeInCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.warn(`[Overpass] Building query failed, using fallback`);
    return generateFallbackBoundary(lat, lng, radiusM);
  }
}

/**
 * Query for land parcels/lots near a location
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusM - Search radius in meters
 * @returns {Promise<Object>} Query result
 */
export async function queryParcelsNear(
  lat,
  lng,
  radiusM = CONFIG.DEFAULT_SEARCH_RADIUS_M,
) {
  const query = buildParcelQuery(lat, lng, radiusM);
  const cacheKey = getCacheKey(query, lat, lng);

  // Check cache
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const result = await executeQuery(query);
    storeInCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.warn(`[Overpass] Parcel query failed, using fallback`);
    return generateFallbackBoundary(lat, lng, radiusM);
  }
}

/**
 * Generate deterministic fallback boundary when Overpass is unavailable
 *
 * Creates a rectangular parcel based on typical residential lot dimensions
 * centered on the given coordinates. Uses deterministic sizing based on
 * coordinate hash to provide consistent results.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusM - Approximate radius (used for scaling)
 * @returns {Object} Fallback boundary data in Overpass format
 */
export function generateFallbackBoundary(
  lat,
  lng,
  radiusM = CONFIG.DEFAULT_SEARCH_RADIUS_M,
) {
  logger.info(
    `[Overpass] Generating deterministic fallback boundary at ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
  );

  // Deterministic hash for consistent sizing
  const hashInput = `${Math.round(lat * 100000)}_${Math.round(lng * 100000)}`;
  const hash = hashString(hashInput);
  const hashNum = parseInt(hash.substring(0, 4), 16);

  // Typical residential lot dimensions (20-40m × 30-50m)
  const baseWidth = 25 + (hashNum % 15); // 25-40m
  const baseLength = 35 + ((hashNum >> 4) % 15); // 35-50m

  // Scale based on radius hint
  const scale = Math.min(radiusM / CONFIG.DEFAULT_SEARCH_RADIUS_M, 2);
  const width = baseWidth * scale;
  const length = baseLength * scale;

  // Convert meters to degrees (approximate)
  const metersToDegLat = 1 / 111320;
  const metersToDegLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));

  const halfWidthDeg = (width / 2) * metersToDegLng;
  const halfLengthDeg = (length / 2) * metersToDegLat;

  // Create rectangular boundary
  const boundary = [
    { lat: lat - halfLengthDeg, lon: lng - halfWidthDeg },
    { lat: lat - halfLengthDeg, lon: lng + halfWidthDeg },
    { lat: lat + halfLengthDeg, lon: lng + halfWidthDeg },
    { lat: lat + halfLengthDeg, lon: lng - halfWidthDeg },
    { lat: lat - halfLengthDeg, lon: lng - halfWidthDeg }, // Close polygon
  ];

  return {
    version: 0.6,
    generator: "OverpassHardened_Fallback",
    elements: [
      {
        type: "way",
        id: -1, // Negative ID indicates fallback
        tags: {
          landuse: "residential",
          source: "fallback",
          fallback: "true",
        },
        bounds: {
          minlat: lat - halfLengthDeg,
          minlon: lng - halfWidthDeg,
          maxlat: lat + halfLengthDeg,
          maxlon: lng + halfWidthDeg,
        },
        geometry: boundary,
      },
    ],
    _fallback: true,
    _dimensions: { width, length },
    _center: { lat, lng },
  };
}

/**
 * Get site boundary with hardened Overpass query and fallback
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} options - Options
 * @param {number} options.radiusM - Search radius
 * @param {boolean} options.preferParcel - Prefer parcel over building
 * @returns {Promise<Object>} Boundary result
 */
export async function getSiteBoundary(lat, lng, options = {}) {
  const { radiusM = CONFIG.DEFAULT_SEARCH_RADIUS_M, preferParcel = true } =
    options;

  try {
    // Try parcel query first if preferred
    if (preferParcel) {
      const parcels = await queryParcelsNear(lat, lng, radiusM);
      if (parcels.elements && parcels.elements.length > 0) {
        logger.debug(`[Overpass] Found ${parcels.elements.length} parcel(s)`);
        return {
          success: true,
          source: "overpass_parcel",
          data: parcels,
        };
      }
    }

    // Try building query
    const buildings = await queryBuildingsNear(lat, lng, radiusM);
    if (buildings.elements && buildings.elements.length > 0) {
      logger.debug(`[Overpass] Found ${buildings.elements.length} building(s)`);
      return {
        success: true,
        source: "overpass_building",
        data: buildings,
      };
    }

    // No results, use fallback
    logger.info(`[Overpass] No OSM data found, using fallback boundary`);
    return {
      success: true,
      source: "fallback",
      data: generateFallbackBoundary(lat, lng, radiusM),
    };
  } catch (error) {
    logger.error(`[Overpass] Query failed: ${error.message}`);

    // Return fallback on error
    return {
      success: true,
      source: "fallback",
      data: generateFallbackBoundary(lat, lng, radiusM),
      error: error.message,
    };
  }
}

/**
 * Clear cache (for testing)
 */
export function clearCache() {
  memoryCache.clear();

  if (typeof sessionStorage !== "undefined") {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("overpass_")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  }

  logger.debug("[Overpass] Cache cleared");
}

/**
 * Get cache stats
 */
export function getCacheStats() {
  let storageCount = 0;

  if (typeof sessionStorage !== "undefined") {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("overpass_")) {
        storageCount++;
      }
    }
  }

  return {
    memoryCacheSize: memoryCache.size,
    storageCacheSize: storageCount,
    maxEntries: CONFIG.MAX_CACHE_ENTRIES,
    ttlMs: CONFIG.CACHE_TTL_MS,
  };
}

export default {
  queryBuildingsNear,
  queryParcelsNear,
  getSiteBoundary,
  generateFallbackBoundary,
  clearCache,
  getCacheStats,
  CONFIG,
};
