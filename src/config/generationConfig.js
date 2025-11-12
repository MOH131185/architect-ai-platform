/**
 * Global Generation Configuration
 *
 * Controls AI generation behavior, consistency enforcement, and A1 sheet production
 */

export const GENERATION_CONFIG = {
  /**
   * Enable A1 Master Sheet generation
   * When true, generates complete 7016×9933px professional sheet
   * @type {boolean}
   * @default true
   */
  a1SheetEnabled: true,

  /**
   * Auto-derive site/climate data with fallback
   * When true, attempts to fetch real data from APIs; falls back to sensible defaults on failure
   * @type {boolean}
   * @default true
   */
  autoDeriveWithFallback: true,

  /**
   * Enforce consistent seed across all views
   * When true, uses single seed for entire generation batch (critical for cross-view consistency)
   * @type {boolean}
   * @default true
   */
  enforceConsistentSeed: true,

  /**
   * DNA strict mode
   * When true, applies stricter validation and auto-correction to DNA before prompt generation
   * @type {boolean}
   * @default true
   */
  dnaStrictMode: true,

  /**
   * Generate all 13 views (including interior and site)
   * When false, generates only essential views (plans, elevations, 1 exterior)
   * @type {boolean}
   * @default true
   */
  generateCompleteSet: true,

  /**
   * A1 sheet resolution (pixels)
   * Standard A1 Portrait at 300 DPI: 7016 × 9933 px (594 × 841 mm)
   * @type {object}
   */
  a1Resolution: {
    width: 7016,
    height: 9933,
    dpi: 300,
    orientation: 'portrait'
  },

  /**
   * View generation configuration
   * Defines all 13 architectural views with scales and priorities
   * @type {object}
   */
  views: {
    plans: [
      { id: 'ground', name: 'Ground Floor Plan', scale: '1:100', priority: 1 },
      { id: 'first', name: 'First Floor Plan', scale: '1:100', priority: 2 },
      { id: 'roof', name: 'Roof Plan', scale: '1:200', priority: 3 }
    ],
    elevations: [
      { id: 'south', name: 'South Elevation', orientation: 'S', scale: '1:100', priority: 4 },
      { id: 'north', name: 'North Elevation', orientation: 'N', scale: '1:100', priority: 5 },
      { id: 'east', name: 'East Elevation', orientation: 'E', scale: '1:100', priority: 6 },
      { id: 'west', name: 'West Elevation', orientation: 'W', scale: '1:100', priority: 7 }
    ],
    sections: [
      { id: 'section-aa', name: 'Section A-A', scale: '1:100', priority: 8 }
    ],
    threeD: [
      { id: 'exterior', name: '3D Exterior', viewAngle: 'front-left', priority: 9 },
      { id: 'interior', name: '3D Interior', room: 'living-dining', priority: 10 },
      { id: 'axonometric', name: 'Axonometric Exploded', priority: 11 },
      { id: 'site', name: 'Site Context', scale: '1:500', priority: 12 }
    ]
  },

  /**
   * Rate limiting configuration
   * @type {object}
   */
  rateLimiting: {
    delayBetweenViews: 6000, // 6 seconds between API calls (Together.ai requirement)
    maxRetries: 3,
    retryDelay: 10000 // 10 seconds before retry
  },

  /**
   * Consistency validation rules
   * @type {object}
   */
  consistencyRules: {
    enforceOrientationUnification: true, // Normalize N/S/E/W naming
    enforceFflLevelMatch: true, // Finished Floor Levels must match across views
    enforceGlazingConsistency: true, // Glazing ratio must be consistent
    enforceMaterialPalette: true, // Materials/colors must match DNA
    enforceRoomProgram: true, // Room count and names must match
    enforceWindowCounts: true, // Window counts per facade must match
    enforceRoofSlope: true, // Roof pitch must be consistent
    minConsistencyScore: 0.95 // Minimum acceptable consistency (95%)
  },

  /**
   * Default climate data (fallback when APIs fail)
   * @type {object}
   */
  defaultClimate: {
    avgTemp: 15,
    avgRainfall: 800,
    climateZone: 'Temperate',
    prevailingWind: 'SW'
  },

  /**
   * Default sun angles (fallback)
   * @type {object}
   */
  defaultSunAngles: {
    summer: { azimuth: 180, altitude: 65 },
    winter: { azimuth: 180, altitude: 25 }
  },

  /**
   * Performance defaults
   * @type {object}
   */
  defaultPerformance: {
    pvCapacity: 6.0, // kW
    pvAnnualOutput: 5400, // kWh/year
    glazingRatio: 0.25, // 25%
    uValueWall: 0.18, // W/m²K
    uValueRoof: 0.13, // W/m²K
    uValueFloor: 0.15, // W/m²K
    uValueGlazing: 1.2, // W/m²K
    airTightness: 3.0, // m³/h/m² @ 50Pa
    thermalMass: 'Medium'
  },

  /**
   * Map configuration
   * @type {object}
   */
  mapConfig: {
    scale: '1:500',
    zoom: 17,
    size: '640x400',
    mapType: 'hybrid', // satellite with labels
    disclaimer: 'Not to scale for construction - indicative only'
  }
};

/**
 * Get configuration value
 * @param {string} key - Config key (dot notation supported, e.g., 'a1Resolution.width')
 * @returns {*} Configuration value
 */
export function getConfig(key) {
  const keys = key.split('.');
  let value = GENERATION_CONFIG;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      console.warn(`[CONFIG] Key not found: ${key}`);
      return undefined;
    }
  }

  return value;
}

/**
 * Set configuration value (for testing/admin)
 * @param {string} key - Config key (dot notation supported)
 * @param {*} value - New value
 */
export function setConfig(key, value) {
  const keys = key.split('.');
  const lastKey = keys.pop();
  let target = GENERATION_CONFIG;

  for (const k of keys) {
    if (!(k in target)) {
      target[k] = {};
    }
    target = target[k];
  }

  const oldValue = target[lastKey];
  target[lastKey] = value;

  console.log(`[CONFIG] Updated ${key}:`, { from: oldValue, to: value });
}

/**
 * Get all views in priority order
 * @returns {Array} All views sorted by priority
 */
export function getAllViews() {
  const { plans, elevations, sections, threeD } = GENERATION_CONFIG.views;
  return [...plans, ...elevations, ...sections, ...threeD]
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Get view configuration by ID
 * @param {string} viewId - View identifier
 * @returns {object|null} View configuration or null
 */
export function getViewConfig(viewId) {
  const allViews = getAllViews();
  return allViews.find(v => v.id === viewId) || null;
}

/**
 * Check if A1 sheet generation is enabled
 * @returns {boolean}
 */
export function isA1SheetEnabled() {
  return GENERATION_CONFIG.a1SheetEnabled === true;
}

/**
 * Get consistency validation rules
 * @returns {object} Consistency rules
 */
export function getConsistencyRules() {
  return { ...GENERATION_CONFIG.consistencyRules };
}

/**
 * Log current configuration (development helper)
 */
export function logConfiguration() {
  console.group('[CONFIG] Generation Configuration');
  console.log('A1 Sheet Enabled:', GENERATION_CONFIG.a1SheetEnabled);
  console.log('Auto-derive with Fallback:', GENERATION_CONFIG.autoDeriveWithFallback);
  console.log('Enforce Consistent Seed:', GENERATION_CONFIG.enforceConsistentSeed);
  console.log('DNA Strict Mode:', GENERATION_CONFIG.dnaStrictMode);
  console.log('Complete Set (13 views):', GENERATION_CONFIG.generateCompleteSet);
  console.log('Min Consistency Score:', GENERATION_CONFIG.consistencyRules.minConsistencyScore);
  console.groupEnd();
}

// Log in development
if (process.env.NODE_ENV === 'development') {
  console.log('[CONFIG] Generation configuration loaded');
  console.log('   A1 Sheet:', GENERATION_CONFIG.a1SheetEnabled);
  console.log('   Consistent Seed:', GENERATION_CONFIG.enforceConsistentSeed);
}

export default GENERATION_CONFIG;
