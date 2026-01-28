/**
 * Seed Derivation - Stub
 */

export function derivePanelSeeds(baseSeed, panelCount) {
  return Array.from({ length: panelCount }, (_, i) => baseSeed + i);
}

export function derivePanelSeed(baseSeed, panelType, index) {
  return baseSeed + index;
}

export default { derivePanelSeeds, derivePanelSeed };
