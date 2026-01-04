/**
 * Seed Derivation Utility
 * 
 * Provides deterministic seed derivation for panel-based generation.
 * Ensures consistent seeds across reruns for the same base seed + panel key.
 * 
 * Uses djb2 hash algorithm for stability.
 */

import logger from '../utils/logger.js';

/**
 * Derive a deterministic seed for a specific panel from base seed
 * 
 * NOTE: For multi-panel generation, use derivePanelSeeds() instead for stable ordering.
 * This function uses hash-based derivation and is kept for backwards compatibility.
 * 
 * @param {number|string} baseSeed - Base seed from initial generation
 * @param {string} panelKey - Panel identifier (e.g., 'site', 'plan_ground', 'elev_north')
 * @returns {number} Derived seed (0-999999, Together.ai seed space)
 * 
 * @example
 * derivePanelSeed(12345, 'plan_ground') // Returns deterministic seed for ground plan
 * derivePanelSeed(12345, 'elev_north')  // Returns different deterministic seed for north elevation
 */
export function derivePanelSeed(baseSeed, panelKey) {
  if (!panelKey || typeof panelKey !== 'string') {
    logger.warn('Invalid panelKey for seed derivation', { panelKey });
    return Number(baseSeed) || 0;
  }

  // Convert base seed to number
  const baseNum = Number(baseSeed) || 0;

  // djb2 hash algorithm for stability
  let hash = 5381;
  for (let i = 0; i < panelKey.length; i++) {
    hash = ((hash << 5) + hash) + panelKey.charCodeAt(i);
  }

  // Clamp to Together.ai seed space (0-999999)
  const mod = Math.abs(hash % 1000000);
  const derivedSeed = (baseNum + mod) % 1000000;

  logger.debug('Derived panel seed (hash-based)', {
    baseSeed: baseNum,
    panelKey,
    hash,
    derivedSeed
  });

  return derivedSeed;
}

/**
 * Derive seeds for multiple panels at once
 * Uses deterministic formula: seed = (baseSeed + index * 137) % 1000000
 * 
 * @param {number|string} baseSeed - Base seed
 * @param {string[]} panelKeys - Array of panel identifiers (order matters!)
 * @returns {Object} Map of panelKey -> derivedSeed
 * 
 * @example
 * derivePanelSeeds(12345, ['plan_ground', 'elev_north'])
 * // Returns { plan_ground: 12345+0*137=12345, elev_north: 12345+1*137=12482 }
 */
export function derivePanelSeeds(baseSeed, panelKeys) {
  const seedMap = {};
  const baseNum = Number(baseSeed) || 0;

  // Use deterministic index-based formula for perfect reproducibility
  panelKeys.forEach((panelKey, index) => {
    const derivedSeed = (baseNum + (index * 137)) % 1000000;
    seedMap[panelKey] = derivedSeed;
  });

  logger.debug('Derived panel seeds (deterministic)', {
    baseSeed: baseNum,
    panelCount: panelKeys.length,
    method: 'index*137'
  });

  return seedMap;
}

/**
 * Validate seed is within Together.ai acceptable range
 * 
 * @param {number|string} seed - Seed to validate
 * @returns {boolean} True if valid
 */
export function isValidSeed(seed) {
  const num = Number(seed);
  return !isNaN(num) && num >= 0 && num <= 999999;
}

/**
 * Hash DNA to create deterministic base seed
 * Uses djb2 hash algorithm on stringified DNA
 * 
 * @param {Object} masterDNA - Master DNA object
 * @returns {number} Hashed seed value (0-999999)
 */
export function hashDNA(masterDNA) {
  if (!masterDNA || typeof masterDNA !== 'object') {
    logger.warn('Invalid DNA for hashing');
    return 0;
  }

  // Create stable string representation of DNA
  // Only include deterministic fields (dimensions, materials, style)
  const materials = masterDNA.materials || {};

  // Handle materials as either array or object
  let materialsArray = [];
  if (Array.isArray(materials)) {
    // Legacy array format
    materialsArray = materials.map(m => ({
      name: typeof m === 'string' ? m : (m.name || 'material'),
      hexColor: m.hexColor || ''
    }));
  } else if (typeof materials === 'object') {
    // Current object format with exterior, roof, etc.
    const materialEntries = [];
    if (materials.exterior) {
      materialEntries.push({
        name: materials.exterior.primary || materials.exterior.name || 'exterior',
        hexColor: materials.exterior.color_hex || materials.exterior.hexColor || ''
      });
    }
    if (materials.roof) {
      materialEntries.push({
        name: materials.roof.material || materials.roof.name || 'roof',
        hexColor: materials.roof.color_hex || materials.roof.hexColor || ''
      });
    }
    materialsArray = materialEntries;
  }

  const stableFields = {
    dimensions: masterDNA.dimensions || {},
    materials: materialsArray,
    architecturalStyle: masterDNA.architecturalStyle || '',
    projectType: masterDNA.projectType || ''
  };

  const dnaString = JSON.stringify(stableFields);

  // djb2 hash algorithm
  let hash = 5381;
  for (let i = 0; i < dnaString.length; i++) {
    hash = ((hash << 5) + hash) + dnaString.charCodeAt(i);
  }

  // Clamp to Together.ai seed space (0-999999)
  const seed = Math.abs(hash % 1000000);

  logger.debug('Hashed DNA to seed', {
    dnaLength: dnaString.length,
    hash,
    seed
  });

  return seed;
}

/**
 * Derive panel seeds from DNA hash
 * Ensures same DNA always produces same seeds for reproducibility
 * 
 * @param {Object} masterDNA - Master DNA object
 * @param {string[]} panelKeys - Array of panel identifiers
 * @returns {Object} Map of panelKey -> derivedSeed
 * 
 * @example
 * derivePanelSeedsFromDNA(dna, ['plan_ground', 'elev_north'])
 * // Returns { plan_ground: 123456, elev_north: 234567 }
 * // Same DNA will always produce same seeds
 */
export function derivePanelSeedsFromDNA(masterDNA, panelKeys) {
  // Hash DNA to get base seed
  const dnaHash = hashDNA(masterDNA);

  // Derive panel seeds from DNA hash
  const seedMap = derivePanelSeeds(dnaHash, panelKeys);

  logger.info('Derived panel seeds from DNA', {
    dnaHash,
    panelCount: panelKeys.length,
    method: 'hash-derived'
  });

  return seedMap;
}

export default {
  derivePanelSeed,
  derivePanelSeeds,
  isValidSeed,
  hashDNA,
  derivePanelSeedsFromDNA
};

