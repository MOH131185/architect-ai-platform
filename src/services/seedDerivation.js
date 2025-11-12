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

  logger.debug('Derived panel seed', {
    baseSeed: baseNum,
    panelKey,
    hash,
    derivedSeed
  });

  return derivedSeed;
}

/**
 * Derive seeds for multiple panels at once
 * 
 * @param {number|string} baseSeed - Base seed
 * @param {string[]} panelKeys - Array of panel identifiers
 * @returns {Object} Map of panelKey -> derivedSeed
 * 
 * @example
 * derivePanelSeeds(12345, ['plan_ground', 'elev_north'])
 * // Returns { plan_ground: 123456, elev_north: 234567 }
 */
export function derivePanelSeeds(baseSeed, panelKeys) {
  const seedMap = {};
  
  panelKeys.forEach(panelKey => {
    seedMap[panelKey] = derivePanelSeed(baseSeed, panelKey);
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

export default {
  derivePanelSeed,
  derivePanelSeeds,
  isValidSeed
};

