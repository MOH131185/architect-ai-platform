/**
 * Engine Router
 *
 * Phase 3 - Futuristic Layer: Config-Based Engine Routing
 *
 * Routes requests to MVP or neural engines based on configuration.
 * Allows hot-swapping between engines without code changes.
 *
 * @module services/pipeline/engineRouter
 */

// Default configuration (MVP engines)
const DEFAULT_CONFIG = {
  programReasoner: {
    active: 'mvp',
    engines: {
      mvp: 'programReasoningEngine',
      neural: 'neuralProgramReasoner',
    },
  },
  floorPlanGenerator: {
    active: 'mvp',
    engines: {
      mvp: 'floorPlanGeometryEngine',
      neural: 'neuralFloorPlanEngine',
    },
  },
  styleEngine: {
    active: 'mvp',
    engines: {
      mvp: 'styleProfileGenerator',
      neural: 'neuralStyleEngine',
    },
  },
};

// In-memory config (loaded from file or set programmatically)
let currentConfig = { ...DEFAULT_CONFIG };

/**
 * Load models configuration
 *
 * @param {string} [configPath] - Path to models.json (optional)
 * @returns {Object} Configuration object
 */
export function loadModelsConfig(configPath) {
  // Try to load from config file
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('archiAI_models_config');
      if (stored) {
        currentConfig = JSON.parse(stored);
        return currentConfig;
      }
    } catch (error) {
      console.warn('[EngineRouter] Failed to load config from storage:', error.message);
    }
  }

  return currentConfig;
}

/**
 * Save models configuration
 *
 * @param {Object} config - Configuration to save
 */
export function saveModelsConfig(config) {
  currentConfig = { ...DEFAULT_CONFIG, ...config };

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('archiAI_models_config', JSON.stringify(currentConfig));
    } catch (error) {
      console.warn('[EngineRouter] Failed to save config:', error.message);
    }
  }
}

/**
 * Get the active engine for a given type
 *
 * @param {string} engineType - Engine type ('programReasoner' | 'floorPlanGenerator' | 'styleEngine')
 * @returns {Promise<Object>} Engine instance
 *
 * @example
 * const reasoner = await getEngine('programReasoner');
 * const program = await reasoner.generateProgram(constraints);
 */
export async function getEngine(engineType) {
  const config = loadModelsConfig();
  const engineConfig = config[engineType];

  if (!engineConfig) {
    throw new Error(`Unknown engine type: ${engineType}`);
  }

  const activeEngine = engineConfig.active;
  const engineName = engineConfig.engines[activeEngine];

  console.log(`[EngineRouter] Loading ${engineType}: ${engineName} (${activeEngine})`);

  // Dynamic import based on engine name
  try {
    switch (engineName) {
      // MVP Engines
      case 'programReasoningEngine':
        const { default: programEngine } = await import('../program/programReasoningEngine.js');
        return programEngine;

      case 'floorPlanGeometryEngine':
        const { MVPFloorPlanGenerator } = await import('../geometry/floorPlanGeometryEngine.js');
        return new MVPFloorPlanGenerator();

      case 'styleProfileGenerator':
        const { default: styleGenerator } = await import('../style/styleProfileGenerator.js');
        return styleGenerator;

      // Neural Engines (stubs)
      case 'neuralProgramReasoner':
        const { NeuralProgramReasoner } = await import('../neural/neuralProgramReasoner.js');
        return new NeuralProgramReasoner();

      case 'neuralFloorPlanEngine':
        const { NeuralFloorPlanEngine } = await import('../neural/neuralFloorPlanEngine.js');
        return new NeuralFloorPlanEngine();

      case 'neuralStyleEngine':
        // Future: Neural style engine
        throw new Error('Neural style engine not yet implemented');

      default:
        throw new Error(`Unknown engine: ${engineName}`);
    }
  } catch (error) {
    console.error(`[EngineRouter] Failed to load engine ${engineName}:`, error.message);

    // Fallback to MVP engine
    if (activeEngine === 'neural') {
      console.warn(`[EngineRouter] Falling back to MVP engine for ${engineType}`);
      const mvpEngineName = engineConfig.engines.mvp;
      return getEngineByName(mvpEngineName);
    }

    throw error;
  }
}

/**
 * Get engine by name (internal helper)
 *
 * @param {string} engineName - Engine name
 * @returns {Promise<Object>} Engine instance
 */
async function getEngineByName(engineName) {
  switch (engineName) {
    case 'programReasoningEngine':
      const { default: programEngine } = await import('../program/programReasoningEngine.js');
      return programEngine;

    case 'floorPlanGeometryEngine':
      const { MVPFloorPlanGenerator } = await import('../geometry/floorPlanGeometryEngine.js');
      return new MVPFloorPlanGenerator();

    case 'styleProfileGenerator':
      const { default: styleGenerator } = await import('../style/styleProfileGenerator.js');
      return styleGenerator;

    default:
      throw new Error(`Unknown engine: ${engineName}`);
  }
}

/**
 * Set active engine for a type
 *
 * @param {string} engineType - Engine type
 * @param {string} engineMode - Engine mode ('mvp' | 'neural')
 */
export function setActiveEngine(engineType, engineMode) {
  const config = loadModelsConfig();

  if (!config[engineType]) {
    throw new Error(`Unknown engine type: ${engineType}`);
  }

  if (!config[engineType].engines[engineMode]) {
    throw new Error(`Unknown engine mode: ${engineMode}`);
  }

  config[engineType].active = engineMode;
  saveModelsConfig(config);

  console.log(`[EngineRouter] Set ${engineType} to ${engineMode}`);
}

/**
 * Get current engine status
 *
 * @returns {Object} Status of all engines
 */
export function getEngineStatus() {
  const config = loadModelsConfig();

  return {
    programReasoner: {
      active: config.programReasoner.active,
      engine: config.programReasoner.engines[config.programReasoner.active],
      available: ['mvp', 'neural'],
    },
    floorPlanGenerator: {
      active: config.floorPlanGenerator.active,
      engine: config.floorPlanGenerator.engines[config.floorPlanGenerator.active],
      available: ['mvp', 'neural'],
    },
    styleEngine: {
      active: config.styleEngine.active,
      engine: config.styleEngine.engines[config.styleEngine.active],
      available: ['mvp'],
    },
  };
}

/**
 * Reset to default configuration
 */
export function resetToDefaults() {
  currentConfig = { ...DEFAULT_CONFIG };

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('archiAI_models_config');
    } catch (error) {
      // Ignore
    }
  }

  console.log('[EngineRouter] Reset to default configuration');
}

/**
 * Try neural engine with automatic fallback
 *
 * @param {string} engineType - Engine type
 * @param {string} method - Method to call
 * @param {Array} args - Method arguments
 * @returns {Promise<*>} Result from engine (neural or MVP fallback)
 */
export async function tryNeuralWithFallback(engineType, method, args = []) {
  const config = loadModelsConfig();
  const neuralEngineName = config[engineType]?.engines?.neural;

  if (!neuralEngineName) {
    // No neural engine configured, use MVP directly
    const mvpEngine = await getEngine(engineType);
    return mvpEngine[method](...args);
  }

  try {
    // Try neural engine
    const originalActive = config[engineType].active;
    config[engineType].active = 'neural';

    const neuralEngine = await getEngine(engineType);
    const result = await neuralEngine[method](...args);

    config[engineType].active = originalActive;
    return result;
  } catch (error) {
    if (error.message === 'NEURAL_NOT_IMPLEMENTED') {
      console.log(`[EngineRouter] Neural ${engineType}.${method} not implemented, using MVP`);
    } else {
      console.warn(`[EngineRouter] Neural ${engineType}.${method} failed:`, error.message);
    }

    // Fallback to MVP
    const mvpEngine = await getEngine(engineType);
    return mvpEngine[method](...args);
  }
}

const engineRouter = {
  loadModelsConfig,
  saveModelsConfig,
  getEngine,
  setActiveEngine,
  getEngineStatus,
  resetToDefaults,
  tryNeuralWithFallback,
};

export default engineRouter;
