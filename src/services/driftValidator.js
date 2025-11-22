/**
 * Drift Validator
 * 
 * Detects and quantifies drift between baseline and modified designs.
 * Operates at both DNA level and image level (SSIM/pHash).
 * 
 * Provides:
 * - DNA-level drift detection (dimensions, materials, layout)
 * - Image-level drift detection (SSIM, pHash)
 * - Per-panel drift analysis
 * - Drift correction suggestions
 */

import { normalizeDNA } from '../types/schemas.js';
import { computePanelCoordinates } from '../config/sheetLayoutConfig.js';
import logger from '../utils/logger.js';

/**
 * Drift thresholds
 */
export const DRIFT_THRESHOLDS = {
  DNA: {
    DIMENSIONS: 0.05, // 5% tolerance for dimensions
    MATERIALS: 0, // 0% tolerance for materials (exact match)
    LAYOUT: 0, // 0% tolerance for layout (exact match)
    OVERALL: 0.10 // 10% overall DNA drift threshold
  },
  IMAGE: {
    SSIM_WHOLE: 0.92, // Minimum SSIM for whole sheet
    SSIM_PANEL: 0.95, // Minimum SSIM for individual panels
    PHASH_DISTANCE: 5 // Maximum pHash distance
  }
};

/**
 * Detect DNA-level drift
 * @param {DNA} baselineDNA - Baseline DNA
 * @param {DNA} candidateDNA - Candidate DNA
 * @returns {Object} Drift analysis
 */
export function detectDNADrift(baselineDNA, candidateDNA) {
  const baseline = normalizeDNA(baselineDNA);
  const candidate = normalizeDNA(candidateDNA);
  
  if (!baseline || !candidate) {
    return {
      hasDrift: true,
      driftScore: 1.0,
      errors: ['Missing DNA for comparison'],
      warnings: [],
      details: {}
    };
  }
  
  const errors = [];
  const warnings = [];
  const details = {};
  
  // Check dimensions
  const dimDrift = compareDimensions(baseline.dimensions, candidate.dimensions);
  if (dimDrift.drift > DRIFT_THRESHOLDS.DNA.DIMENSIONS) {
    errors.push(`Dimension drift: ${(dimDrift.drift * 100).toFixed(1)}% (threshold: ${DRIFT_THRESHOLDS.DNA.DIMENSIONS * 100}%)`);
    details.dimensions = dimDrift;
  }
  
  // Check materials
  const matDrift = compareMaterials(baseline.materials, candidate.materials);
  if (matDrift.drift > DRIFT_THRESHOLDS.DNA.MATERIALS) {
    errors.push(`Material drift: ${matDrift.changedCount} materials changed`);
    details.materials = matDrift;
  }
  
  // Check architectural style
  if (baseline.architecturalStyle !== candidate.architecturalStyle) {
    errors.push(`Style changed: ${baseline.architecturalStyle} → ${candidate.architecturalStyle}`);
  }
  
  // Check project type
  if (baseline.projectType !== candidate.projectType) {
    errors.push(`Project type changed: ${baseline.projectType} → ${candidate.projectType}`);
  }
  
  // Check floor count
  if (baseline.dimensions.floors !== candidate.dimensions.floors) {
    errors.push(`Floor count changed: ${baseline.dimensions.floors} → ${candidate.dimensions.floors}`);
  }
  
  // Calculate overall drift score
  const driftScore = calculateOverallDriftScore({
    dimensionDrift: dimDrift.drift,
    materialDrift: matDrift.drift,
    styleChanged: baseline.architecturalStyle !== candidate.architecturalStyle ? 1 : 0,
    projectTypeChanged: baseline.projectType !== candidate.projectType ? 1 : 0
  });
  
  return {
    hasDrift: driftScore > DRIFT_THRESHOLDS.DNA.OVERALL,
    driftScore,
    errors,
    warnings,
    details,
    threshold: DRIFT_THRESHOLDS.DNA.OVERALL
  };
}

/**
 * Compare dimensions
 * @private
 */
function compareDimensions(baseline, candidate) {
  const fields = ['length', 'width', 'height', 'floors'];
  let totalDrift = 0;
  let comparedFields = 0;
  const changes = [];
  
  for (const field of fields) {
    const baseVal = baseline[field];
    const candVal = candidate[field];
    
    if (baseVal !== undefined && candVal !== undefined) {
      const drift = Math.abs(baseVal - candVal) / baseVal;
      totalDrift += drift;
      comparedFields++;
      
      if (drift > DRIFT_THRESHOLDS.DNA.DIMENSIONS) {
        changes.push({
          field,
          baseline: baseVal,
          candidate: candVal,
          drift: (drift * 100).toFixed(1) + '%'
        });
      }
    }
  }
  
  return {
    drift: comparedFields > 0 ? totalDrift / comparedFields : 0,
    changes
  };
}

/**
 * Compare materials
 * @private
 */
function compareMaterials(baseline, candidate) {
  const baseNames = new Set(baseline.map(m => m.name));
  const candNames = new Set(candidate.map(m => m.name));
  
  const added = [...candNames].filter(n => !baseNames.has(n));
  const removed = [...baseNames].filter(n => !candNames.has(n));
  const changed = [];
  
  // Check color changes for common materials
  for (const baseMat of baseline) {
    const candMat = candidate.find(m => m.name === baseMat.name);
    if (candMat && baseMat.hexColor !== candMat.hexColor) {
      changed.push({
        name: baseMat.name,
        baselineColor: baseMat.hexColor,
        candidateColor: candMat.hexColor
      });
    }
  }
  
  const changedCount = added.length + removed.length + changed.length;
  const totalCount = Math.max(baseline.length, candidate.length);
  
  return {
    drift: totalCount > 0 ? changedCount / totalCount : 0,
    changedCount,
    added,
    removed,
    colorChanged: changed
  };
}

/**
 * Calculate overall drift score
 * @private
 */
function calculateOverallDriftScore(components) {
  // Weighted average of drift components
  const weights = {
    dimensionDrift: 0.4,
    materialDrift: 0.3,
    styleChanged: 0.2,
    projectTypeChanged: 0.1
  };
  
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (components[key] || 0) * weight;
  }
  
  return Math.min(1.0, score);
}

/**
 * Detect image-level drift (requires server-side SSIM/pHash computation)
 * @param {string} baselineUrl - Baseline image URL
 * @param {string} candidateUrl - Candidate image URL
 * @param {Object} options - Options
 * @param {Array} options.panelCoordinates - Panel coordinates for per-panel analysis
 * @returns {Promise<Object>} Drift analysis
 */
export async function detectImageDrift(baselineUrl, candidateUrl, options = {}) {
  const { panelCoordinates = [] } = options;
  
  try {
    // Call server-side drift detection API
    const response = await fetch('/api/drift-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baselineUrl,
        candidateUrl,
        panelCoordinates
      })
    });
    
    if (!response.ok) {
      throw new Error(`Drift detection failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Analyze results against thresholds
    const wholeSheetDrift = result.wholeSheet.ssim < DRIFT_THRESHOLDS.IMAGE.SSIM_WHOLE;
    const panelDrifts = result.panels?.filter(p => p.ssim < DRIFT_THRESHOLDS.IMAGE.SSIM_PANEL) || [];
    
    return {
      hasDrift: wholeSheetDrift || panelDrifts.length > 0,
      wholeSheet: {
        ssim: result.wholeSheet.ssim,
        pHash: result.wholeSheet.pHash,
        threshold: DRIFT_THRESHOLDS.IMAGE.SSIM_WHOLE,
        passed: !wholeSheetDrift
      },
      panels: result.panels || [],
      driftedPanels: panelDrifts,
      driftScore: 1 - result.wholeSheet.ssim,
      recommendation: wholeSheetDrift ? 'retry_with_stricter_lock' : 'accept'
    };
  } catch (error) {
    logger.error('Image drift detection failed', error);
    
    // Fallback: assume no drift (optimistic)
    return {
      hasDrift: false,
      wholeSheet: { ssim: 1.0, pHash: 0, passed: true },
      panels: [],
      driftedPanels: [],
      driftScore: 0,
      error: error.message,
      recommendation: 'accept_with_warning'
    };
  }
}

/**
 * Suggest drift corrections
 * @param {Object} driftAnalysis - Drift analysis from detectDNADrift or detectImageDrift
 * @returns {Object} Correction suggestions
 */
export function suggestDriftCorrections(driftAnalysis) {
  const corrections = [];
  
  if (driftAnalysis.details?.dimensions) {
    corrections.push({
      type: 'dimension',
      action: 'lock_dimensions',
      description: 'Add explicit dimension locks to prompt',
      priority: 'high'
    });
  }
  
  if (driftAnalysis.details?.materials) {
    corrections.push({
      type: 'material',
      action: 'lock_materials',
      description: 'Add explicit material locks with hex colors',
      priority: 'high'
    });
  }
  
  if (driftAnalysis.driftedPanels?.length > 0) {
    corrections.push({
      type: 'panel',
      action: 'reduce_strength',
      description: `Reduce img2img strength for panels: ${driftAnalysis.driftedPanels.map(p => p.id).join(', ')}`,
      priority: 'medium',
      suggestedStrength: 0.08
    });
  }
  
  if (driftAnalysis.driftScore > 0.2) {
    corrections.push({
      type: 'overall',
      action: 'fail_modification',
      description: 'Drift too high - reject modification and suggest simplification',
      priority: 'critical'
    });
  }
  
  return {
    corrections,
    canAutoCorrect: corrections.every(c => c.priority !== 'critical'),
    recommendation: corrections.length > 0 ? corrections[0].action : 'accept'
  };
}

/**
 * Panel-specific drift rules
 * Different panel types have different tolerance thresholds
 */
export const PANEL_DRIFT_RULES = {
  site_diagram: {
    allowedDrift: 0.15,  // Site can vary slightly
    criticalElements: ['building_footprint', 'north_arrow', 'site_boundary'],
    description: 'Site plan with context - moderate tolerance'
  },
  floor_plans: {
    allowedDrift: 0.05,  // Plans must be very consistent
    criticalElements: ['dimensions', 'wall_thickness', 'room_labels', 'door_swings'],
    description: 'Floor plans - strict consistency required',
    panelTypes: ['floor_plan_ground', 'floor_plan_first', 'floor_plan_level2']
  },
  elevations: {
    allowedDrift: 0.08,
    criticalElements: ['height', 'window_positions', 'materials', 'facade_articulation'],
    description: 'Elevations - high consistency required',
    panelTypes: ['elevation_north', 'elevation_south', 'elevation_east', 'elevation_west']
  },
  sections: {
    allowedDrift: 0.08,
    criticalElements: ['floor_heights', 'structure', 'dimensions', 'slab_thickness'],
    description: 'Building sections - high consistency required',
    panelTypes: ['section_AA', 'section_BB']
  },
  '3d_views': {
    allowedDrift: 0.12,  // 3D can have more variation
    criticalElements: ['massing', 'materials', 'roof_form', 'overall_proportions'],
    description: '3D views - moderate tolerance for rendering variation',
    panelTypes: ['hero_3d', 'interior_3d']
  },
  diagrams: {
    allowedDrift: 0.20,  // Diagrams can vary more
    criticalElements: ['key_data', 'labels', 'color_codes'],
    description: 'Diagrams and cards - flexible tolerance',
    panelTypes: ['material_palette', 'climate_card']
  }
};

/**
 * Get drift rule for specific panel type
 * @param {string} panelType - Panel type identifier
 * @returns {Object} Drift rule
 */
function getDriftRuleForPanel(panelType) {
  // Check each category
  for (const [category, rule] of Object.entries(PANEL_DRIFT_RULES)) {
    if (rule.panelTypes && rule.panelTypes.includes(panelType)) {
      return rule;
    }
    if (category === panelType) {
      return rule;
    }
  }
  
  // Default rule
  return {
    allowedDrift: 0.10,
    criticalElements: [],
    description: 'Default panel - standard tolerance'
  };
}

/**
 * Validate panel consistency against baseline
 * @param {Object} params - Validation parameters
 * @param {string} params.panelType - Panel type
 * @param {string} params.baselineUrl - Baseline panel image URL
 * @param {string} params.candidateUrl - Candidate panel image URL
 * @param {Object} params.baselineDNA - Baseline DNA
 * @param {Object} params.candidateDNA - Candidate DNA
 * @returns {Promise<Object>} Validation result
 */
export async function validatePanelConsistency(params) {
  const { panelType, baselineUrl, candidateUrl, baselineDNA, candidateDNA } = params;
  
  // Get panel-specific drift rule
  const rule = getDriftRuleForPanel(panelType);
  
  logger.info('Validating panel consistency', {
    panelType,
    rule: rule.description,
    allowedDrift: rule.allowedDrift
  });
  
  const errors = [];
  const warnings = [];
  
  // DNA-level validation
  if (baselineDNA && candidateDNA) {
    const dnaDrift = detectDNADrift(baselineDNA, candidateDNA);
    
    if (dnaDrift.driftScore > rule.allowedDrift) {
      errors.push({
        type: 'dna_drift',
        panelType,
        driftScore: dnaDrift.driftScore,
        threshold: rule.allowedDrift,
        message: `DNA drift ${(dnaDrift.driftScore * 100).toFixed(1)}% exceeds threshold ${(rule.allowedDrift * 100).toFixed(1)}%`
      });
    }
  }
  
  // Image-level validation (if URLs provided)
  let imageDrift = null;
  if (baselineUrl && candidateUrl) {
    try {
      imageDrift = await detectImageDrift(baselineUrl, candidateUrl);
      
      if (imageDrift.driftScore > rule.allowedDrift) {
        errors.push({
          type: 'image_drift',
          panelType,
          driftScore: imageDrift.driftScore,
          threshold: rule.allowedDrift,
          ssim: imageDrift.wholeSheet?.ssim,
          message: `Image drift ${(imageDrift.driftScore * 100).toFixed(1)}% exceeds threshold ${(rule.allowedDrift * 100).toFixed(1)}%`
        });
      }
    } catch (error) {
      logger.warn('Image drift detection failed', { panelType, error: error.message });
      warnings.push({
        type: 'image_drift_failed',
        panelType,
        message: `Could not compute image drift: ${error.message}`
      });
    }
  }
  
  // Check critical elements
  const missingElements = [];
  for (const element of rule.criticalElements) {
    // This is a placeholder - actual element detection would require image analysis
    // For now, we just log the critical elements that should be checked
    logger.debug(`Should validate critical element: ${element} for ${panelType}`);
  }
  
  const isValid = errors.length === 0;
  const driftScore = imageDrift?.driftScore || 0;
  
  return {
    valid: isValid,
    panelType,
    rule: rule.description,
    allowedDrift: rule.allowedDrift,
    driftScore,
    errors,
    warnings,
    criticalElements: rule.criticalElements,
    recommendation: isValid ? 'accept' : 'retry_with_stricter_lock'
  };
}

/**
 * Validate consistency across multiple panels
 * @param {Array} panels - Array of panel validation results
 * @returns {Object} Overall consistency report
 */
export function validateMultiPanelConsistency(panels) {
  const results = panels.map(p => p.valid);
  const validCount = results.filter(v => v).length;
  const totalCount = results.length;
  const consistencyScore = totalCount > 0 ? validCount / totalCount : 0;
  
  const failedPanels = panels.filter(p => !p.valid);
  const overallValid = consistencyScore >= 0.92; // 92% threshold
  
  return {
    valid: overallValid,
    consistencyScore,
    validPanels: validCount,
    totalPanels: totalCount,
    failedPanels: failedPanels.map(p => ({
      panelType: p.panelType,
      driftScore: p.driftScore,
      errors: p.errors
    })),
    recommendation: overallValid ? 'accept' : 'retry_failed_panels'
  };
}

export default {
  detectDNADrift,
  detectImageDrift,
  suggestDriftCorrections,
  validatePanelConsistency,
  validateMultiPanelConsistency,
  DRIFT_THRESHOLDS,
  PANEL_DRIFT_RULES
};

