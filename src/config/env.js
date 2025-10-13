/**
 * Environment Configuration and Validation
 * Ensures all required environment variables are present
 */

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  {
    name: 'OPENAI_API_KEY',
    alternates: ['REACT_APP_OPENAI_API_KEY'],
    description: 'OpenAI API key for GPT-4 reasoning',
    pattern: /^sk-[a-zA-Z0-9]{48}$/
  },
  {
    name: 'REPLICATE_API_TOKEN',
    alternates: ['REACT_APP_REPLICATE_API_KEY'],
    description: 'Replicate API token for SDXL image generation',
    pattern: /^r8_[a-zA-Z0-9]{40}$/
  },
  {
    name: 'REACT_APP_GOOGLE_MAPS_API_KEY',
    alternates: [],
    description: 'Google Maps API key for geocoding and mapping',
    pattern: /^[a-zA-Z0-9_-]{39}$/
  },
  {
    name: 'REACT_APP_OPENWEATHER_API_KEY',
    alternates: [],
    description: 'OpenWeather API key for climate data',
    pattern: /^[a-f0-9]{32}$/
  }
];

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_ENV_VARS = {
  PORT: 3001,
  NODE_ENV: 'development',
  PYTHON_SERVICE_URL: 'http://localhost:8000',
  ENABLE_DXF_EXPORT: true,
  ENABLE_CONTROLNET: true,
  ENABLE_VALIDATION: true,
  ENABLE_MODIFY_LOOP: true,
  API_TIMEOUT: 30000,
  IMAGE_GENERATION_TIMEOUT: 120000,
  OPENAI_RATE_LIMIT: 20,
  REPLICATE_RATE_LIMIT: 10,
  LOG_LEVEL: 'info'
};

/**
 * Validates environment variables on startup
 * @returns {Object} Validation result with { valid: boolean, errors: string[], warnings: string[] }
 */
export const validateEnvironment = () => {
  const errors = [];
  const warnings = [];
  const config = {};

  // Check required variables
  REQUIRED_ENV_VARS.forEach(varConfig => {
    let value = process.env[varConfig.name];

    // Check alternates if primary not found
    if (!value && varConfig.alternates.length > 0) {
      for (const alternate of varConfig.alternates) {
        value = process.env[alternate];
        if (value) {
          warnings.push(`Using ${alternate} instead of ${varConfig.name} (legacy support)`);
          break;
        }
      }
    }

    if (!value) {
      errors.push(`Missing required environment variable: ${varConfig.name} - ${varConfig.description}`);
    } else if (varConfig.pattern && !varConfig.pattern.test(value)) {
      warnings.push(`${varConfig.name} format looks incorrect. Expected pattern: ${varConfig.pattern}`);
    }

    config[varConfig.name] = value;
  });

  // Set optional variables with defaults
  Object.keys(OPTIONAL_ENV_VARS).forEach(key => {
    config[key] = process.env[key] || OPTIONAL_ENV_VARS[key];
  });

  // Feature flag validation
  const featureFlags = ['ENABLE_DXF_EXPORT', 'ENABLE_CONTROLNET', 'ENABLE_VALIDATION', 'ENABLE_MODIFY_LOOP'];
  featureFlags.forEach(flag => {
    if (process.env[flag]) {
      config[flag] = process.env[flag] === 'true';
    } else {
      config[flag] = OPTIONAL_ENV_VARS[flag];
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config
  };
};

/**
 * Get environment configuration
 * Throws error if required variables are missing
 */
export const getEnvConfig = () => {
  const validation = validateEnvironment();

  if (!validation.valid) {
    const errorMessage = [
      '🚨 Environment Configuration Error',
      '',
      'Missing required environment variables:',
      ...validation.errors.map(e => `  ❌ ${e}`),
      '',
      'Please create a .env file based on .env.example and add your API keys.',
      'See documentation for details on obtaining API keys.'
    ].join('\n');

    console.error(errorMessage);

    // In development, show warning but continue
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Continuing in development mode with missing env vars...');
    } else {
      // In production, fail fast
      throw new Error('Environment validation failed');
    }
  }

  // Show warnings if any
  if (validation.warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    validation.warnings.forEach(w => console.warn(`  - ${w}`));
  }

  return validation.config;
};

/**
 * Check if a specific feature is enabled
 */
export const isFeatureEnabled = (feature) => {
  const config = getEnvConfig();
  const flagName = `ENABLE_${feature.toUpperCase()}`;
  return config[flagName] === true;
};

/**
 * Get API configuration
 */
export const getAPIConfig = () => {
  const config = getEnvConfig();

  return {
    openai: {
      apiKey: config.OPENAI_API_KEY || config.REACT_APP_OPENAI_API_KEY,
      rateLimit: parseInt(config.OPENAI_RATE_LIMIT) || 20,
      timeout: parseInt(config.API_TIMEOUT) || 30000
    },
    replicate: {
      apiToken: config.REPLICATE_API_TOKEN || config.REACT_APP_REPLICATE_API_KEY,
      rateLimit: parseInt(config.REPLICATE_RATE_LIMIT) || 10,
      timeout: parseInt(config.IMAGE_GENERATION_TIMEOUT) || 120000
    },
    googleMaps: {
      apiKey: config.REACT_APP_GOOGLE_MAPS_API_KEY
    },
    openWeather: {
      apiKey: config.REACT_APP_OPENWEATHER_API_KEY
    },
    pythonService: {
      url: config.PYTHON_SERVICE_URL || 'http://localhost:8000'
    }
  };
};

/**
 * Initialize environment on module load
 */
if (typeof process !== 'undefined' && process.env) {
  const validation = validateEnvironment();

  if (validation.errors.length > 0) {
    console.log('');
    console.log('========================================');
    console.log('🔑 ENVIRONMENT SETUP REQUIRED');
    console.log('========================================');
    console.log('');
    console.log('To run this application, you need to:');
    console.log('');
    console.log('1. Copy .env.example to .env:');
    console.log('   cp .env.example .env');
    console.log('');
    console.log('2. Add your API keys to .env:');
    validation.errors.forEach(error => {
      console.log(`   ${error}`);
    });
    console.log('');
    console.log('3. Restart the application');
    console.log('');
    console.log('For help obtaining API keys, see:');
    console.log('- OpenAI: https://platform.openai.com/api-keys');
    console.log('- Replicate: https://replicate.com/account/api-tokens');
    console.log('- Google Maps: https://console.cloud.google.com/');
    console.log('- OpenWeather: https://openweathermap.org/api');
    console.log('');
    console.log('========================================');
    console.log('');
  } else {
    console.log('✅ Environment configuration validated successfully');
    if (validation.warnings.length > 0) {
      console.log('⚠️ Warnings:');
      validation.warnings.forEach(w => console.log(`   - ${w}`));
    }
  }
}

export default {
  validateEnvironment,
  getEnvConfig,
  isFeatureEnabled,
  getAPIConfig
};