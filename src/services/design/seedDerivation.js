/**
 * Seed Derivation Service
 *
 * Deterministic seed generation for consistent panel generation.
 */

/**
 * Derive deterministic seed from DNA hash
 * @param {Object} dna - Design DNA
 * @returns {number} Base seed
 */
export function deriveBaseSeed(dna) {
  if (!dna) return 42;

  // Create a simple hash from DNA content
  const str = JSON.stringify(dna);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash) % 1000000;
}

/**
 * Derive panel-specific seed
 * @param {number} baseSeed - Base seed from DNA
 * @param {number} panelIndex - Panel index (0-based)
 * @returns {number} Panel seed
 */
export function derivePanelSeed(baseSeed, panelIndex) {
  // Formula: baseSeed + index * 137 (prime number for distribution)
  return (baseSeed + panelIndex * 137) % 1000000;
}

/**
 * Get seed map for all panels
 * @param {Object} dna - Design DNA
 * @param {string[]} panelTypes - Array of panel types
 * @returns {Object} Map of panel type to seed
 */
export function getSeedMap(dna, panelTypes) {
  const baseSeed = deriveBaseSeed(dna);
  const seedMap = {};

  panelTypes.forEach((type, index) => {
    seedMap[type] = derivePanelSeed(baseSeed, index);
  });

  return seedMap;
}

/**
 * Derive seeds for multiple panels
 * @param {number} baseSeed - Base seed
 * @param {number} count - Number of panels
 * @returns {number[]} Array of panel seeds
 */
export function derivePanelSeeds(baseSeed, count) {
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push(derivePanelSeed(baseSeed, i));
  }
  return seeds;
}

/**
 * Derive panel seeds from DNA
 * @param {Object} dna - Design DNA
 * @param {string[]} panelTypes - Panel types
 * @returns {Object} Map of panel type to seed
 */
export function derivePanelSeedsFromDNA(dna, panelTypes) {
  return getSeedMap(dna, panelTypes);
}

export default {
  deriveBaseSeed,
  derivePanelSeed,
  derivePanelSeeds,
  derivePanelSeedsFromDNA,
  getSeedMap,
};
