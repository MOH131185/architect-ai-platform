/**
 * DNA Utilities
 * 
 * Pure utility functions for DNA operations:
 * - normalizeDNA: Enforce canonical structure
 * - hashDNA: Deterministic hashing
 * - compareDNA: Compute drift metrics
 * - mergeDNA: Merge DNA sources
 */

import { normalizeDNA as schemaNormalizeDNA } from '../types/schemas.js';

/**
 * Normalize DNA to canonical format
 * Ensures consistent structure, sorted fields, and normalized units
 * @param {Object} dna - Raw DNA
 * @param {Object} options - Normalization options
 * @returns {Object} Normalized DNA
 */
export function normalizeDNA(dna, options = {}) {
  if (!dna || typeof dna !== 'object') {
    return null;
  }
  
  // Use schema normalization first
  let normalized = schemaNormalizeDNA(dna);
  
  // Additional normalization
  
  // Sort materials by application order (facade, roof, trim, accent)
  if (normalized.materials && normalized.materials.length > 0) {
    const applicationOrder = ['exterior walls', 'facade', 'roof', 'trim', 'accent', 'interior'];
    normalized.materials.sort((a, b) => {
      const aIndex = applicationOrder.findIndex(app => 
        a.application?.toLowerCase().includes(app)
      );
      const bIndex = applicationOrder.findIndex(app => 
        b.application?.toLowerCase().includes(app)
      );
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
  }
  
  // Sort rooms by floor, then by area
  if (normalized.rooms && normalized.rooms.length > 0) {
    const floorOrder = ['ground', 'first', 'second', 'third'];
    normalized.rooms.sort((a, b) => {
      const aFloorIndex = floorOrder.indexOf(a.floor?.toLowerCase());
      const bFloorIndex = floorOrder.indexOf(b.floor?.toLowerCase());
      
      if (aFloorIndex !== bFloorIndex) {
        return (aFloorIndex === -1 ? 999 : aFloorIndex) - (bFloorIndex === -1 ? 999 : bFloorIndex);
      }
      
      // Sort by area if on same floor
      const aArea = parseFloat(a.dimensions?.split('×')[0]) || 0;
      const bArea = parseFloat(b.dimensions?.split('×')[0]) || 0;
      return bArea - aArea;
    });
  }
  
  // Normalize dimensions (ensure consistent precision)
  if (normalized.dimensions) {
    const dim = normalized.dimensions;
    normalized.dimensions = {
      length: parseFloat((dim.length || 15).toFixed(2)),
      width: parseFloat((dim.width || 12).toFixed(2)),
      height: parseFloat((dim.height || 7).toFixed(2)),
      floors: parseInt(dim.floors || dim.floorHeights?.length || 2),
      floorHeights: Array.isArray(dim.floorHeights) 
        ? dim.floorHeights.map(h => parseFloat(h.toFixed(2)))
        : []
    };
  }
  
  return normalized;
}

/**
 * Hash DNA for deterministic identification
 * Same DNA (after normalization) always produces same hash
 * @param {Object} dna - DNA object
 * @returns {string} Hash string
 */
export function hashDNA(dna) {
  const normalized = normalizeDNA(dna);
  
  if (!normalized) {
    return '0';
  }
  
  // Create deterministic hash input (sorted keys)
  const hashInput = JSON.stringify({
    dimensions: normalized.dimensions,
    materials: normalized.materials.map(m => ({ name: m.name, color: m.hexColor, app: m.application })),
    style: normalized.architecturalStyle,
    projectType: normalized.projectType,
    floors: normalized.dimensions.floors
  });
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Compare two DNA objects and return drift metrics
 * @param {Object} baseDNA - Base DNA
 * @param {Object} candidateDNA - Candidate DNA
 * @returns {Object} Drift metrics
 */
export function compareDNA(baseDNA, candidateDNA) {
  const base = normalizeDNA(baseDNA);
  const candidate = normalizeDNA(candidateDNA);
  
  if (!base || !candidate) {
    return {
      drift: 1.0,
      changes: [],
      errors: ['Missing DNA for comparison']
    };
  }
  
  const changes = [];
  let totalDrift = 0;
  let comparedFields = 0;
  
  // Compare dimensions
  const dimFields = ['length', 'width', 'height', 'floors'];
  for (const field of dimFields) {
    const baseVal = base.dimensions[field];
    const candVal = candidate.dimensions[field];
    
    if (baseVal !== undefined && candVal !== undefined) {
      if (baseVal !== candVal) {
        const drift = Math.abs(baseVal - candVal) / baseVal;
        totalDrift += drift;
        comparedFields++;
        
        changes.push({
          field: `dimensions.${field}`,
          baseline: baseVal,
          candidate: candVal,
          drift: (drift * 100).toFixed(1) + '%',
          type: 'dimension'
        });
      }
    }
  }
  
  // Compare materials
  const baseMaterialNames = base.materials.map(m => m.name).sort();
  const candMaterialNames = candidate.materials.map(m => m.name).sort();
  
  if (JSON.stringify(baseMaterialNames) !== JSON.stringify(candMaterialNames)) {
    changes.push({
      field: 'materials',
      baseline: baseMaterialNames,
      candidate: candMaterialNames,
      type: 'material'
    });
    totalDrift += 0.5;
    comparedFields++;
  }
  
  // Compare material colors
  for (const baseMat of base.materials) {
    const candMat = candidate.materials.find(m => m.name === baseMat.name);
    if (candMat && baseMat.hexColor !== candMat.hexColor) {
      changes.push({
        field: `material.${baseMat.name}.color`,
        baseline: baseMat.hexColor,
        candidate: candMat.hexColor,
        type: 'material_color'
      });
      totalDrift += 0.2;
      comparedFields++;
    }
  }
  
  // Compare style
  if (base.architecturalStyle !== candidate.architecturalStyle) {
    changes.push({
      field: 'architecturalStyle',
      baseline: base.architecturalStyle,
      candidate: candidate.architecturalStyle,
      type: 'style'
    });
    totalDrift += 0.5;
    comparedFields++;
  }
  
  // Compare project type
  if (base.projectType !== candidate.projectType) {
    changes.push({
      field: 'projectType',
      baseline: base.projectType,
      candidate: candidate.projectType,
      type: 'project_type'
    });
    totalDrift += 1.0; // Critical change
    comparedFields++;
  }
  
  const avgDrift = comparedFields > 0 ? totalDrift / comparedFields : 0;
  
  return {
    drift: Math.min(1.0, avgDrift),
    changes,
    errors: [],
    comparedFields,
    summary: {
      dimensionChanges: changes.filter(c => c.type === 'dimension').length,
      materialChanges: changes.filter(c => c.type === 'material' || c.type === 'material_color').length,
      styleChanged: changes.some(c => c.type === 'style'),
      projectTypeChanged: changes.some(c => c.type === 'project_type')
    }
  };
}

/**
 * Merge DNA sources (e.g., portfolio + location-based)
 * @param {Object} baseDNA - Base DNA
 * @param {Object} sourceDNA - Source DNA to merge
 * @param {Object} options - Merge options
 * @param {number} options.sourceWeight - Weight for source DNA (0-1)
 * @returns {Object} Merged DNA
 */
export function mergeDNA(baseDNA, sourceDNA, options = {}) {
  const { sourceWeight = 0.5 } = options;
  
  const base = normalizeDNA(baseDNA);
  const source = normalizeDNA(sourceDNA);
  
  if (!base) return source;
  if (!source) return base;
  
  // Merge materials (weighted blend)
  const mergedMaterials = [];
  const baseCount = Math.ceil(base.materials.length * (1 - sourceWeight));
  const sourceCount = Math.floor(source.materials.length * sourceWeight);
  
  mergedMaterials.push(...base.materials.slice(0, baseCount));
  mergedMaterials.push(...source.materials.slice(0, sourceCount));
  
  // Merge dimensions (prefer base)
  const mergedDimensions = {
    ...base.dimensions,
    // Only override if source has more specific data
    ...(source.dimensions.floorHeights?.length > 0 ? { floorHeights: source.dimensions.floorHeights } : {})
  };
  
  // Merge style (weighted)
  const mergedStyle = sourceWeight > 0.5 ? source.architecturalStyle : base.architecturalStyle;
  
  return {
    ...base,
    dimensions: mergedDimensions,
    materials: mergedMaterials,
    architecturalStyle: mergedStyle,
    mergeMetadata: {
      baseWeight: 1 - sourceWeight,
      sourceWeight,
      mergedAt: new Date().toISOString()
    }
  };
}

/**
 * Extract DNA summary for compact representations
 * @param {Object} dna - DNA object
 * @returns {string} Summary string
 */
export function summarizeDNA(dna) {
  const normalized = normalizeDNA(dna);
  
  if (!normalized) {
    return 'No DNA available';
  }
  
  const dim = normalized.dimensions;
  const materials = normalized.materials.slice(0, 2).map(m => m.name).join('/');
  
  return `${normalized.architecturalStyle} ${normalized.projectType}, ${dim.length}×${dim.width}×${dim.height}m, ${dim.floors}F, ${materials}`;
}

/**
 * Validate DNA completeness
 * @param {Object} dna - DNA object
 * @returns {Object} Validation result
 */
export function validateDNACompleteness(dna) {
  const normalized = normalizeDNA(dna);
  
  if (!normalized) {
    return {
      isComplete: false,
      missing: ['entire DNA'],
      score: 0
    };
  }
  
  const required = [
    'dimensions.length',
    'dimensions.width',
    'dimensions.height',
    'dimensions.floors',
    'materials',
    'architecturalStyle',
    'projectType'
  ];
  
  const missing = [];
  
  for (const field of required) {
    const parts = field.split('.');
    let value = normalized;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      missing.push(field);
    }
  }
  
  return {
    isComplete: missing.length === 0,
    missing,
    score: (required.length - missing.length) / required.length
  };
}

export default {
  normalizeDNA,
  hashDNA,
  compareDNA,
  mergeDNA,
  summarizeDNA,
  validateDNACompleteness
};

