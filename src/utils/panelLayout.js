/**
 * Panel Layout Utilities
 * 
 * Pure functions for computing panel positions and layout metadata.
 * Ensures deterministic, stable layouts for identical inputs.
 */

import { getLayoutForSheetType, computePanelCoordinates } from '../config/sheetLayoutConfig.js';

/**
 * Compute stable layout for sheet metadata
 * @param {Object} sheetMetadata - Sheet metadata
 * @param {number} sheetMetadata.width - Sheet width in pixels
 * @param {number} sheetMetadata.height - Sheet height in pixels
 * @param {string} sheetMetadata.sheetType - Sheet type (ARCH, STRUCTURE, MEP)
 * @param {string} sheetMetadata.a1LayoutKey - Layout key
 * @returns {Object} Layout with panel coordinates
 */
export function computeStableLayout(sheetMetadata) {
  const { width, height, sheetType = 'ARCH', a1LayoutKey } = sheetMetadata;
  
  if (!width || !height) {
    throw new Error('Sheet dimensions required for layout computation');
  }
  
  // Get layout configuration
  const layout = getLayoutForSheetType(sheetType, a1LayoutKey);
  
  // Compute panel coordinates
  const panelCoordinates = computePanelCoordinates(layout, width, height);
  
  return {
    layoutKey: layout.name,
    sheetType: layout.sheetType,
    aspectRatio: layout.aspectRatio,
    orientation: layout.orientation,
    panelCoordinates,
    sheetDimensions: { width, height }
  };
}

/**
 * Validate panel layout (check for overlaps)
 * @param {Array} panelCoordinates - Panel coordinates
 * @returns {Object} Validation result
 */
export function validatePanelLayout(panelCoordinates) {
  const errors = [];
  const warnings = [];
  
  if (!Array.isArray(panelCoordinates) || panelCoordinates.length === 0) {
    errors.push('No panels defined');
    return { valid: false, errors, warnings };
  }
  
  // Check for overlaps
  for (let i = 0; i < panelCoordinates.length; i++) {
    for (let j = i + 1; j < panelCoordinates.length; j++) {
      const p1 = panelCoordinates[i];
      const p2 = panelCoordinates[j];
      
      if (panelsOverlap(p1, p2)) {
        errors.push(`Panels ${p1.id} and ${p2.id} overlap`);
      }
    }
  }
  
  // Check for panels outside sheet bounds
  for (const panel of panelCoordinates) {
    if (panel.x < 0 || panel.y < 0) {
      errors.push(`Panel ${panel.id} has negative position`);
    }
    
    // Note: We can't check upper bounds without sheet dimensions
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Check if two panels overlap
 * @private
 */
function panelsOverlap(p1, p2) {
  return !(
    p1.x + p1.width <= p2.x ||
    p2.x + p2.width <= p1.x ||
    p1.y + p1.height <= p2.y ||
    p2.y + p2.height <= p1.y
  );
}

/**
 * Get panel by ID
 * @param {Array} panelCoordinates - Panel coordinates
 * @param {string} panelId - Panel ID
 * @returns {Object|null} Panel or null
 */
export function getPanelById(panelCoordinates, panelId) {
  return panelCoordinates.find(p => p.id === panelId) || null;
}

/**
 * Get panels by type
 * @param {Array} panelCoordinates - Panel coordinates
 * @param {string} type - Panel type (plan, elevation, section, render, data, title)
 * @returns {Array} Matching panels
 */
export function getPanelsByType(panelCoordinates, type) {
  return panelCoordinates.filter(p => p.type === type);
}

/**
 * Compute panel area
 * @param {Object} panel - Panel with x, y, width, height
 * @returns {number} Area in square pixels
 */
export function computePanelArea(panel) {
  return panel.width * panel.height;
}

/**
 * Sort panels by position (top-to-bottom, left-to-right)
 * @param {Array} panelCoordinates - Panel coordinates
 * @returns {Array} Sorted panels
 */
export function sortPanelsByPosition(panelCoordinates) {
  return [...panelCoordinates].sort((a, b) => {
    if (a.row !== b.row) {
      return a.row - b.row;
    }
    return a.col - b.col;
  });
}

/**
 * Generate layout hash for deterministic identification
 * @param {Array} panelCoordinates - Panel coordinates
 * @returns {string} Layout hash
 */
export function hashLayout(panelCoordinates) {
  const sorted = sortPanelsByPosition(panelCoordinates);
  const hashInput = JSON.stringify(
    sorted.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      w: p.width,
      h: p.height
    }))
  );
  
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Compare two layouts
 * @param {Array} baselineLayout - Baseline panel coordinates
 * @param {Array} candidateLayout - Candidate panel coordinates
 * @returns {Object} Comparison result
 */
export function compareLayouts(baselineLayout, candidateLayout) {
  const baseHash = hashLayout(baselineLayout);
  const candHash = hashLayout(candidateLayout);
  
  if (baseHash === candHash) {
    return {
      identical: true,
      changes: [],
      drift: 0
    };
  }
  
  const changes = [];
  
  // Check for moved panels
  for (const basePanel of baselineLayout) {
    const candPanel = candidateLayout.find(p => p.id === basePanel.id);
    
    if (!candPanel) {
      changes.push({
        type: 'removed',
        panelId: basePanel.id,
        baseline: basePanel
      });
      continue;
    }
    
    if (basePanel.x !== candPanel.x || basePanel.y !== candPanel.y) {
      changes.push({
        type: 'moved',
        panelId: basePanel.id,
        baseline: { x: basePanel.x, y: basePanel.y },
        candidate: { x: candPanel.x, y: candPanel.y }
      });
    }
    
    if (basePanel.width !== candPanel.width || basePanel.height !== candPanel.height) {
      changes.push({
        type: 'resized',
        panelId: basePanel.id,
        baseline: { width: basePanel.width, height: basePanel.height },
        candidate: { width: candPanel.width, height: candPanel.height }
      });
    }
  }
  
  // Check for added panels
  for (const candPanel of candidateLayout) {
    if (!baselineLayout.find(p => p.id === candPanel.id)) {
      changes.push({
        type: 'added',
        panelId: candPanel.id,
        candidate: candPanel
      });
    }
  }
  
  return {
    identical: false,
    changes,
    drift: changes.length / Math.max(baselineLayout.length, candidateLayout.length)
  };
}

export default {
  computeStableLayout,
  validatePanelLayout,
  getPanelById,
  getPanelsByType,
  computePanelArea,
  sortPanelsByPosition,
  hashLayout,
  compareLayouts
};

