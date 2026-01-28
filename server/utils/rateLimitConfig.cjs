/**
 * Rate Limit Configuration Utility
 * 
 * Resolves rate limit values based on environment (dev/test/prod)
 */

/**
 * Resolve AI API rate limiter max requests
 * Higher limits in dev/test to avoid false 429s during QA
 * 
 * @param {Object} params
 * @param {string} params.nodeEnv - NODE_ENV value
 * @param {Object} params.env - process.env object
 * @returns {number} Max requests per window
 */
function resolveAiApiLimiterMax({ nodeEnv, env }) {
    // Check for explicit override
    if (env.AI_API_RATE_LIMIT_MAX) {
        const parsed = parseInt(env.AI_API_RATE_LIMIT_MAX, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }

    // Environment-based defaults
    switch (nodeEnv) {
        case 'production':
            return 30; // Conservative for production
        case 'test':
            return 500; // High for testing
        case 'development':
        default:
            return 200; // Generous for development
    }
}

/**
 * Resolve image generation rate limiter max requests
 * Higher limits in dev/test to support matrix runs
 * 
 * @param {Object} params
 * @param {string} params.nodeEnv - NODE_ENV value
 * @param {Object} params.env - process.env object
 * @returns {number} Max requests per window
 */
function resolveImageGenerationLimiterMax({ nodeEnv, env }) {
    // Check for explicit override
    if (env.IMAGE_GEN_RATE_LIMIT_MAX) {
        const parsed = parseInt(env.IMAGE_GEN_RATE_LIMIT_MAX, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }

    // Environment-based defaults
    switch (nodeEnv) {
        case 'production':
            return 20; // Conservative for production
        case 'test':
            return 300; // High for testing (matrix runs)
        case 'development':
        default:
            return 100; // Generous for development
    }
}

module.exports = {
    resolveAiApiLimiterMax,
    resolveImageGenerationLimiterMax,
};
