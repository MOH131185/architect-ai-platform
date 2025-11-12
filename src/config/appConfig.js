/**
 * Application Configuration
 *
 * Centralizes environment variable reading, validation, and access.
 * Provides clear error messages and respects dev/prod differences.
 *
 * Version: 1.0.0
 * Last Updated: 2025-10-25
 *
 * @module config/appConfig
 */

/**
 * Environment type
 * @type {'development' | 'production' | 'test'}
 */
const ENV = process.env.NODE_ENV || 'development';

/**
 * Whether running in development mode
 * @type {boolean}
 */
export const IS_DEV = ENV === 'development';

/**
 * Whether running in production mode
 * @type {boolean}
 */
export const IS_PROD = ENV === 'production';

/**
 * Whether running in test mode
 * @type {boolean}
 */
export const IS_TEST = ENV === 'test';

/* ============================================================================
 * API KEYS (Server-side and Client-side)
 * ========================================================================== */

/**
 * Service name enum for type safety
 */
export const ServiceName = {
  GOOGLE_MAPS: 'google-maps',
  OPENWEATHER: 'openweather',
  OPENAI_REASONING: 'openai-reasoning',
  OPENAI_IMAGES: 'openai-images',
  OPENAI_LEGACY: 'openai-legacy',
  REPLICATE: 'replicate',
  TOGETHER_AI: 'together-ai',
  MIDJOURNEY: 'midjourney'
};

/**
 * API key configuration with environment variable mappings
 * Maps service name → environment variable names (array for fallbacks)
 */
const API_KEY_CONFIG = {
  // Client-side keys (bundled into browser)
  [ServiceName.GOOGLE_MAPS]: {
    envVars: ['REACT_APP_GOOGLE_MAPS_API_KEY'],
    required: true,
    clientSide: true,
    description: 'Google Maps API for geocoding and 3D maps'
  },
  [ServiceName.OPENWEATHER]: {
    envVars: ['REACT_APP_OPENWEATHER_API_KEY'],
    required: true,
    clientSide: true,
    description: 'OpenWeather API for climate data'
  },

  // Server-side keys (never exposed to browser)
  [ServiceName.OPENAI_REASONING]: {
    envVars: IS_PROD
      ? ['OPENAI_API_KEY', 'OPENAI_REASONING_API_KEY', 'REACT_APP_OPENAI_API_KEY']
      : ['OPENAI_REASONING_API_KEY', 'REACT_APP_OPENAI_API_KEY'],
    required: true,
    clientSide: false,
    description: 'OpenAI API for GPT-4 design reasoning'
  },
  [ServiceName.OPENAI_IMAGES]: {
    envVars: IS_PROD
      ? ['OPENAI_API_KEY', 'OPENAI_IMAGES_API_KEY']
      : ['OPENAI_IMAGES_API_KEY', 'REACT_APP_OPENAI_API_KEY'],
    required: false, // Optional since Together AI can be used
    clientSide: false,
    description: 'OpenAI API for DALL·E 3 image generation'
  },
  [ServiceName.OPENAI_LEGACY]: {
    envVars: ['REACT_APP_OPENAI_API_KEY'],
    required: false, // Legacy fallback
    clientSide: true,
    description: 'Legacy OpenAI API key (deprecated)'
  },
  [ServiceName.REPLICATE]: {
    envVars: IS_PROD
      ? ['REPLICATE_API_TOKEN', 'REACT_APP_REPLICATE_API_KEY']
      : ['REACT_APP_REPLICATE_API_KEY'],
    required: false, // Fallback image generation
    clientSide: false,
    description: 'Replicate API for SDXL image generation'
  },
  [ServiceName.TOGETHER_AI]: {
    envVars: ['TOGETHER_API_KEY'],
    required: false, // Optional alternative to OpenAI/Replicate
    clientSide: false,
    description: 'Together AI for FLUX.1 and Llama 70B'
  },
  [ServiceName.MIDJOURNEY]: {
    envVars: ['MIDJOURNEY_API_KEY'],
    required: false, // Optional
    clientSide: false,
    description: 'Midjourney API via Maginary.ai'
  }
};

/**
 * Feature flag configuration
 */
const FEATURE_FLAG_CONFIG = {
  USE_CONTROLNET_WORKFLOW: {
    envVar: 'REACT_APP_USE_CONTROLNET_WORKFLOW',
    defaultValue: false,
    description: 'Enable ControlNet-based multi-view generation'
  },
  USE_TOGETHER: {
    envVar: 'REACT_APP_USE_TOGETHER',
    defaultValue: false,
    description: 'Use Together AI instead of OpenAI/Replicate'
  }
};

/**
 * Cached API keys (loaded once at startup)
 */
let apiKeysCache = null;

/**
 * Cached feature flags (loaded once at startup)
 */
let featureFlagsCache = null;

/**
 * Validation errors collected during initialization
 */
let validationErrors = [];

/**
 * Validation warnings collected during initialization
 */
let validationWarnings = [];

/* ============================================================================
 * INITIALIZATION
 * ========================================================================== */

/**
 * Read an environment variable with fallback support
 *
 * @param {string[]} envVarNames - Array of env var names to try (in order)
 * @returns {string | null} Environment variable value or null if not found
 */
function readEnvWithFallback(envVarNames) {
  for (const varName of envVarNames) {
    const value = process.env[varName];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Load and validate API keys from environment variables
 *
 * @returns {Object.<string, string>} Map of service name → API key
 */
function loadApiKeys() {
  const keys = {};

  for (const [serviceName, config] of Object.entries(API_KEY_CONFIG)) {
    const apiKey = readEnvWithFallback(config.envVars);

    if (apiKey) {
      keys[serviceName] = apiKey;
    } else if (config.required) {
      const envVarList = config.envVars.join(' or ');
      validationErrors.push(
        `Missing required API key for ${serviceName}: Set ${envVarList} environment variable (${config.description})`
      );
    } else {
      validationWarnings.push(
        `Optional API key for ${serviceName} not set: ${config.envVars[0]} (${config.description})`
      );
    }
  }

  return keys;
}

/**
 * Load and validate feature flags from environment variables
 *
 * @returns {Object.<string, boolean>} Map of feature flag name → boolean value
 */
function loadFeatureFlags() {
  const flags = {};

  for (const [flagName, config] of Object.entries(FEATURE_FLAG_CONFIG)) {
    const envValue = process.env[config.envVar];

    if (envValue === undefined || envValue === null || envValue.trim() === '') {
      flags[flagName] = config.defaultValue;
    } else {
      // Parse boolean from string ('true', 'false', '1', '0', 'yes', 'no')
      const normalized = envValue.toLowerCase().trim();
      flags[flagName] =
        normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
  }

  return flags;
}

/**
 * Initialize configuration (load and validate all env vars)
 * Called automatically on first access
 */
function initializeConfig() {
  if (apiKeysCache !== null && featureFlagsCache !== null) {
    return; // Already initialized
  }

  // Reset validation arrays
  validationErrors = [];
  validationWarnings = [];

  // Load API keys
  apiKeysCache = loadApiKeys();

  // Load feature flags
  featureFlagsCache = loadFeatureFlags();

  // Log warnings
  if (validationWarnings.length > 0 && IS_DEV) {
    console.warn('⚠️  Configuration Warnings:');
    validationWarnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  // Throw on errors (in production and development)
  if (validationErrors.length > 0) {
    console.error('❌ Configuration Errors:');
    validationErrors.forEach((error) => console.error(`  - ${error}`));

    if (IS_PROD || IS_DEV) {
      throw new Error(
        `Configuration validation failed with ${validationErrors.length} error(s). See console for details.`
      );
    }
  }

  // Log successful initialization in dev mode
  if (IS_DEV) {
    console.log('✅ Application configuration initialized successfully');
    console.log(`   Environment: ${ENV}`);
    console.log(`   API Keys loaded: ${Object.keys(apiKeysCache).length}`);
    console.log(`   Feature Flags: ${JSON.stringify(featureFlagsCache, null, 2)}`);
  }
}

/* ============================================================================
 * PUBLIC API
 * ========================================================================== */

/**
 * Get API key for a specific service
 *
 * @param {string} serviceName - Service name from ServiceName enum
 * @param {Object} [options] - Options
 * @param {boolean} [options.required] - Throw error if key is missing (default: true)
 * @returns {string | null} API key or null if not found (when required=false)
 * @throws {Error} If key is missing and required=true
 */
export function getApiKey(serviceName, options = {}) {
  const { required = true } = options;

  // Lazy initialization
  if (apiKeysCache === null) {
    initializeConfig();
  }

  const apiKey = apiKeysCache[serviceName];

  if (!apiKey && required) {
    const config = API_KEY_CONFIG[serviceName];
    const envVarList = config ? config.envVars.join(' or ') : 'unknown';
    throw new Error(
      `API key for ${serviceName} is required but not configured. Set ${envVarList} environment variable.`
    );
  }

  return apiKey || null;
}

/**
 * Check if an API key is configured for a service
 *
 * @param {string} serviceName - Service name from ServiceName enum
 * @returns {boolean} True if API key is configured
 */
export function hasApiKey(serviceName) {
  if (apiKeysCache === null) {
    initializeConfig();
  }

  return !!apiKeysCache[serviceName];
}

/**
 * Get feature flag value
 *
 * @param {string} flagName - Feature flag name
 * @param {boolean} [defaultValue] - Default value if flag not found
 * @returns {boolean} Feature flag value
 */
export function getFeatureFlag(flagName, defaultValue = false) {
  if (featureFlagsCache === null) {
    initializeConfig();
  }

  return featureFlagsCache[flagName] !== undefined
    ? featureFlagsCache[flagName]
    : defaultValue;
}

/**
 * Get all configured API keys (for debugging)
 *
 * @returns {string[]} Array of service names with configured API keys
 */
export function getConfiguredServices() {
  if (apiKeysCache === null) {
    initializeConfig();
  }

  return Object.keys(apiKeysCache);
}

/**
 * Get all feature flags (for debugging)
 *
 * @returns {Object.<string, boolean>} Map of feature flag name → value
 */
export function getAllFeatureFlags() {
  if (featureFlagsCache === null) {
    initializeConfig();
  }

  return { ...featureFlagsCache };
}

/**
 * Get validation errors (if any)
 *
 * @returns {string[]} Array of validation error messages
 */
export function getValidationErrors() {
  if (apiKeysCache === null) {
    initializeConfig();
  }

  return [...validationErrors];
}

/**
 * Get validation warnings (if any)
 *
 * @returns {string[]} Array of validation warning messages
 */
export function getValidationWarnings() {
  if (apiKeysCache === null) {
    initializeConfig();
  }

  return [...validationWarnings];
}

/* ============================================================================
 * API URL CONFIGURATION
 * ========================================================================== */

/**
 * Get API base URL for a service (respects dev/prod environment)
 *
 * @param {string} service - Service name ('openai', 'replicate', 'together-ai')
 * @returns {string} Base URL for API calls
 */
export function getApiBaseUrl(service) {
  const DEV_PROXY_BASE = 'http://localhost:3001/api';
  const PROD_SERVERLESS_BASE = '/api';

  const baseUrl = IS_PROD ? PROD_SERVERLESS_BASE : DEV_PROXY_BASE;

  switch (service) {
    case 'openai':
      return `${baseUrl}/openai`;
    case 'openai-images':
      return `${baseUrl}/openai/images`;
    case 'replicate':
      return `${baseUrl}/replicate`;
    case 'together-ai':
      return `${baseUrl}/together`;
    case 'midjourney':
      return `${baseUrl}/maginary`;
    case 'enhanced-image':
      return `${baseUrl}/enhanced-image`;
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

/**
 * Get full API URL for a specific endpoint
 *
 * @param {string} service - Service name
 * @param {string} endpoint - Endpoint path (e.g., '/chat', '/predictions')
 * @returns {string} Full API URL
 */
export function getApiUrl(service, endpoint) {
  const baseUrl = getApiBaseUrl(service);
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${cleanEndpoint}`;
}

/* ============================================================================
 * EXPORTS
 * ========================================================================== */

const appConfig = {
  // Environment info
  ENV,
  IS_DEV,
  IS_PROD,
  IS_TEST,

  // Service names
  ServiceName,

  // API key access
  getApiKey,
  hasApiKey,
  getConfiguredServices,

  // Feature flags
  getFeatureFlag,
  getAllFeatureFlags,

  // Validation info
  getValidationErrors,
  getValidationWarnings,

  // API URLs
  getApiBaseUrl,
  getApiUrl
};

export default appConfig;
