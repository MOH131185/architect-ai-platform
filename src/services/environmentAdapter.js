/**
 * Environment Adapter
 * 
 * Abstracts environment differences (browser vs Node, dev vs prod, Vercel vs local Express).
 * Provides unified APIs for:
 * - API base URLs and keys
 * - Feature flag access (with pluggable storage: memory, IndexedDB, server-backed)
 * - Optional persistent wizard/design state
 * 
 * No direct `window` or `process.env` references in consumer services;
 * they receive an `env` object created by this adapter.
 */

import runtimeEnv from '../utils/runtimeEnv.js';

// In-memory feature flag store (fallback)
const memoryFeatureFlags = new Map();

/**
 * Detect current environment
 * @returns {Object} Environment info
 */
function detectEnvironment() {
  const isBrowser = runtimeEnv.isBrowser;
  const isNode = !isBrowser;
  
  // Detect if running in Vercel (production)
  const isVercel = isBrowser 
    ? window.location.hostname.includes('vercel.app') || window.location.hostname === 'www.archiaisolution.pro'
    : process.env.VERCEL === '1';
  
  // Detect dev vs prod
  const isDev = isBrowser
    ? window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    : process.env.NODE_ENV === 'development';
  
  return {
    isBrowser,
    isNode,
    isVercel,
    isDev,
    isProd: !isDev
  };
}

/**
 * Get API base URLs based on environment
 * @param {Object} envInfo - Environment info from detectEnvironment()
 * @returns {Object} API URLs
 */
function getApiUrls(envInfo) {
  if (envInfo.isVercel || envInfo.isProd) {
    // Production: Use Vercel serverless functions
    return {
      baseUrl: '',
      togetherChat: '/api/together-chat',
      togetherImage: '/api/together-image',
      sheet: '/api/sheet',
      overlay: '/api/overlay',
      render: '/api/render',
      plan: '/api/plan'
    };
  }
  
  // Development: Use local Express proxy
  const proxyUrl = process.env.REACT_APP_API_PROXY_URL || 'http://localhost:3001';
  return {
    baseUrl: proxyUrl,
    togetherChat: `${proxyUrl}/api/together/chat`,
    togetherImage: `${proxyUrl}/api/together/image`,
    sheet: `${proxyUrl}/api/sheet`,
    overlay: `${proxyUrl}/api/overlay`,
    render: `${proxyUrl}/api/render`,
    plan: `${proxyUrl}/api/plan`
  };
}

/**
 * Get API keys (server-side only)
 * Client-side code should never access keys directly
 * @returns {Object} API keys (empty object in browser)
 */
function getApiKeys() {
  // Browser: No keys exposed
  if (runtimeEnv.isBrowser) {
    return {};
  }
  
  // Server: Read from environment
  return {
    togetherApiKey: process.env.TOGETHER_API_KEY || '',
    openaiApiKey: process.env.OPENAI_REASONING_API_KEY || '',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
    openWeatherApiKey: process.env.REACT_APP_OPENWEATHER_API_KEY || ''
  };
}

/**
 * Feature flag storage backend interface
 */
class FeatureFlagBackend {
  async get(key) {
    throw new Error('Not implemented');
  }
  
  async set(key, value) {
    throw new Error('Not implemented');
  }
  
  async getAll() {
    throw new Error('Not implemented');
  }
}

/**
 * Memory-based feature flag backend (fallback)
 */
class MemoryFeatureFlagBackend extends FeatureFlagBackend {
  async get(key) {
    return memoryFeatureFlags.get(key);
  }
  
  async set(key, value) {
    memoryFeatureFlags.set(key, value);
  }
  
  async getAll() {
    return Object.fromEntries(memoryFeatureFlags);
  }
}

/**
 * SessionStorage-based feature flag backend (browser only)
 */
class SessionStorageFeatureFlagBackend extends FeatureFlagBackend {
  constructor() {
    super();
    this.storageKey = 'featureFlags';
  }
  
  async get(key) {
    try {
      const session = runtimeEnv.getSession();
      if (!session) return undefined;
      
      const all = JSON.parse(session.getItem(this.storageKey) || '{}');
      return all[key];
    } catch {
      return undefined;
    }
  }
  
  async set(key, value) {
    try {
      const session = runtimeEnv.getSession();
      if (!session) return;
      
      const all = JSON.parse(session.getItem(this.storageKey) || '{}');
      all[key] = value;
      session.setItem(this.storageKey, JSON.stringify(all));
    } catch (error) {
      console.warn('Failed to set feature flag in sessionStorage:', error);
    }
  }
  
  async getAll() {
    try {
      const session = runtimeEnv.getSession();
      if (!session) return {};
      
      return JSON.parse(session.getItem(this.storageKey) || '{}');
    } catch {
      return {};
    }
  }
}

/**
 * IndexedDB-based feature flag backend (browser only, future)
 */
class IndexedDBFeatureFlagBackend extends FeatureFlagBackend {
  // TODO: Implement IndexedDB backend for persistent flags
  // For now, fallback to sessionStorage
  constructor() {
    super();
    this.fallback = new SessionStorageFeatureFlagBackend();
  }
  
  async get(key) {
    return this.fallback.get(key);
  }
  
  async set(key, value) {
    return this.fallback.set(key, value);
  }
  
  async getAll() {
    return this.fallback.getAll();
  }
}

/**
 * Create feature flag backend based on environment
 * @param {string} type - Backend type: 'memory', 'sessionStorage', 'indexedDB'
 * @returns {FeatureFlagBackend} Backend instance
 */
function createFeatureFlagBackend(type = 'sessionStorage') {
  if (!runtimeEnv.isBrowser) {
    // Server: Always use memory
    return new MemoryFeatureFlagBackend();
  }
  
  switch (type) {
    case 'indexedDB':
      return new IndexedDBFeatureFlagBackend();
    case 'sessionStorage':
      return new SessionStorageFeatureFlagBackend();
    case 'memory':
    default:
      return new MemoryFeatureFlagBackend();
  }
}

/**
 * Create environment adapter
 * @param {Object} options - Configuration options
 * @param {string} options.featureFlagBackend - Backend type for feature flags
 * @returns {Object} Environment adapter
 */
export function createEnvironmentAdapter(options = {}) {
  const envInfo = detectEnvironment();
  const apiUrls = getApiUrls(envInfo);
  const apiKeys = getApiKeys();
  const flagBackend = createFeatureFlagBackend(options.featureFlagBackend || 'sessionStorage');
  
  return {
    // Environment info
    env: envInfo,
    
    // API configuration
    api: {
      urls: apiUrls,
      keys: apiKeys
    },
    
    // Feature flags
    flags: {
      async get(key, defaultValue) {
        const value = await flagBackend.get(key);
        return value !== undefined ? value : defaultValue;
      },
      
      async set(key, value) {
        await flagBackend.set(key, value);
      },
      
      async getAll() {
        return flagBackend.getAll();
      }
    },
    
    // Storage (for wizard state, etc.)
    storage: {
      get(key) {
        if (!runtimeEnv.isBrowser) return null;
        try {
          const session = runtimeEnv.getSession();
          if (!session) return null;
          return session.getItem(key);
        } catch {
          return null;
        }
      },
      
      set(key, value) {
        if (!runtimeEnv.isBrowser) return;
        try {
          const session = runtimeEnv.getSession();
          if (!session) return;
          session.setItem(key, value);
        } catch (error) {
          console.warn('Failed to set storage item:', error);
        }
      },
      
      remove(key) {
        if (!runtimeEnv.isBrowser) return;
        try {
          const session = runtimeEnv.getSession();
          if (!session) return;
          session.removeItem(key);
        } catch (error) {
          console.warn('Failed to remove storage item:', error);
        }
      }
    }
  };
}

/**
 * Create browser environment adapter
 * @returns {Object} Browser environment adapter
 */
export function createBrowserEnv() {
  return createEnvironmentAdapter({
    featureFlagBackend: 'sessionStorage'
  });
}

/**
 * Create server environment adapter
 * @returns {Object} Server environment adapter
 */
export function createServerEnv() {
  return createEnvironmentAdapter({
    featureFlagBackend: 'memory'
  });
}

// Export default adapter (auto-detects environment)
export default createEnvironmentAdapter();

