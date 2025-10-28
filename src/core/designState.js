/**
 * Design State Manager
 * Handles loading, saving, and updating the single source of truth design.json
 */

import { createDesign, validateDesignSchema, convertLegacyDNAToDesign } from './designSchema';

const STORAGE_KEY = 'architect_ai_design';
const HISTORY_KEY_PREFIX = 'architect_ai_history_';

/**
 * Load design from localStorage
 */
export function loadDesign() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const design = JSON.parse(stored);
      validateDesignSchema(design);
      console.log('✅ Loaded design from localStorage:', design.design_id);
      return design;
    }
  } catch (error) {
    console.warn('⚠️  Failed to load design from localStorage:', error.message);
  }

  // Return default design if none exists
  const defaultDesign = createDesign();
  console.log('📝 Created default design:', defaultDesign.design_id);
  return defaultDesign;
}

/**
 * Save design to localStorage
 */
export function saveDesign(design) {
  try {
    validateDesignSchema(design);
    design.timestamp = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
    console.log('💾 Saved design to localStorage:', design.design_id);
    return design;
  } catch (error) {
    console.error('❌ Failed to save design:', error);
    throw error;
  }
}

/**
 * Update design with a mutation function
 */
export function updateDesign(mutator) {
  const design = loadDesign();
  mutator(design);
  return saveDesign(design);
}

/**
 * Save design snapshot to history
 */
export function saveDesignToHistory(design) {
  try {
    const historyKey = `${HISTORY_KEY_PREFIX}${design.timestamp}`;
    localStorage.setItem(historyKey, JSON.stringify(design));
    console.log('📦 Saved design to history:', historyKey);
  } catch (error) {
    console.warn('⚠️  Failed to save to history:', error.message);
  }
}

/**
 * Load all design history
 */
export function loadDesignHistory() {
  const history = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(HISTORY_KEY_PREFIX)) {
        const design = JSON.parse(localStorage.getItem(key));
        history.push(design);
      }
    }
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.warn('⚠️  Failed to load history:', error.message);
  }
  return history;
}

/**
 * Convert legacy masterDNA to new design format and save
 */
export function convertAndSaveLegacyDNA(masterDNA, projectContext, location, siteMetrics) {
  console.log('🔄 Converting legacy DNA to new design format...');

  const design = convertLegacyDNAToDesign(masterDNA, projectContext, location, siteMetrics);

  // Save to current
  saveDesign(design);

  // Save to history
  saveDesignToHistory(design);

  console.log('✅ Legacy DNA converted and saved:', design.design_id);
  return design;
}

/**
 * Export design as JSON file (download)
 */
export function exportDesignJSON(design) {
  const json = JSON.stringify(design, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `design_${design.design_id}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log('📥 Exported design JSON:', design.design_id);
}

/**
 * Import design from JSON file
 */
export function importDesignJSON(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const design = JSON.parse(e.target.result);
      validateDesignSchema(design);
      saveDesign(design);
      console.log('📤 Imported design JSON:', design.design_id);
      if (callback) callback(design);
    } catch (error) {
      console.error('❌ Failed to import design:', error);
      throw error;
    }
  };
  reader.readAsText(file);
}

/**
 * Clear all designs (reset)
 */
export function clearAllDesigns() {
  localStorage.removeItem(STORAGE_KEY);

  // Clear history
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(HISTORY_KEY_PREFIX)) {
      keys.push(key);
    }
  }
  keys.forEach(key => localStorage.removeItem(key));

  console.log('🗑️  Cleared all designs and history');
}

/**
 * Get current design summary (for display)
 */
export function getDesignSummary(design) {
  return {
    id: design.design_id,
    timestamp: design.timestamp,
    location: design.site.address || `${design.site.lat}, ${design.site.lon}`,
    dimensions: `${design.dimensions.length}m × ${design.dimensions.width}m × ${design.dimensions.height}m`,
    floors: design.dimensions.floorCount,
    rooms: design.rooms.length,
    style: design.dna.style,
    seed: design.dna.seed
  };
}
