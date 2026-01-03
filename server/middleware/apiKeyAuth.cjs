/**
 * API Key Authentication Middleware
 *
 * Provides Bearer token or x-api-key header authentication for protected endpoints.
 * Supports separate keys for genarch and geometry pipelines.
 *
 * Environment variables:
 * - GENARCH_API_KEY: Required for /api/genarch/* endpoints
 * - GEOMETRY_API_KEY: Optional for /api/render-geometry/* endpoints (falls back to GENARCH_API_KEY)
 * - API_KEY_AUTH_ENABLED: Set to 'false' to disable auth in development (default: true in production)
 */

/**
 * Extract API key from request headers
 * Supports: Authorization: Bearer <key> or x-api-key: <key>
 */
function extractApiKey(req) {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Check x-api-key header
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) {
    return xApiKey.trim();
  }

  return null;
}

/**
 * Create API key auth middleware for a specific key
 * @param {string} envKeyName - Environment variable name (e.g., 'GENARCH_API_KEY')
 * @param {string} routeName - Route name for error messages (e.g., 'genarch')
 * @param {Object} options - Additional options
 * @param {string} options.fallbackEnvKey - Fallback env key if primary not set
 * @param {boolean} options.allowMissingKey - If true, skip auth when key not configured (dev mode)
 */
function createApiKeyAuth(envKeyName, routeName, options = {}) {
  const { fallbackEnvKey = null, allowMissingKey = false } = options;

  return (req, res, next) => {
    // Check if auth is explicitly disabled
    const authEnabled = process.env.API_KEY_AUTH_ENABLED !== 'false';
    const isDevelopment = process.env.NODE_ENV !== 'production';

    // Get the expected API key from environment
    let expectedKey = process.env[envKeyName];
    if (!expectedKey && fallbackEnvKey) {
      expectedKey = process.env[fallbackEnvKey];
    }

    // If no key configured
    if (!expectedKey) {
      if (allowMissingKey && isDevelopment) {
        // Dev mode: warn but allow
        console.warn(`⚠️  [Auth] ${envKeyName} not set - ${routeName} endpoints unprotected (dev mode)`);
        return next();
      }

      if (!authEnabled) {
        // Auth explicitly disabled
        console.warn(`⚠️  [Auth] API key auth disabled - ${routeName} endpoints unprotected`);
        return next();
      }

      // Production without key configured - this is a misconfiguration
      console.error(`❌ [Auth] ${envKeyName} not configured - blocking ${routeName} requests`);
      return res.status(503).json({
        error: 'Service unavailable',
        message: `${routeName} API is not properly configured`,
        code: 'AUTH_NOT_CONFIGURED',
      });
    }

    // Auth is required - extract and validate key
    const providedKey = extractApiKey(req);

    if (!providedKey) {
      console.warn(`❌ [Auth] Missing API key for ${routeName} request from ${req.ip}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required. Provide via Authorization: Bearer <key> or x-api-key header.',
        code: 'MISSING_API_KEY',
      });
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(providedKey, expectedKey)) {
      console.warn(`❌ [Auth] Invalid API key for ${routeName} request from ${req.ip}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid API key',
        code: 'INVALID_API_KEY',
      });
    }

    // Valid key - proceed
    next();
  };
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Use crypto.timingSafeEqual if available (Node.js)
  try {
    const crypto = require('crypto');
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    // If lengths differ, still do comparison but will fail
    if (bufA.length !== bufB.length) {
      // Compare against self to maintain constant time
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  } catch (e) {
    // Fallback: simple comparison (less secure but functional)
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

// Pre-configured middleware for common routes
const genarchAuth = createApiKeyAuth('GENARCH_API_KEY', 'genarch', {
  allowMissingKey: true, // Allow dev mode without key
});

const geometryAuth = createApiKeyAuth('GEOMETRY_API_KEY', 'geometry', {
  fallbackEnvKey: 'GENARCH_API_KEY', // Use genarch key if geometry key not set
  allowMissingKey: true,
});

module.exports = {
  extractApiKey,
  createApiKeyAuth,
  timingSafeEqual,
  genarchAuth,
  geometryAuth,
};
