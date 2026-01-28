/**
 * FLUX Model Presets for A1 Architectural Sheets
 * 
 * Optimized parameters for Together.ai FLUX.1-dev
 * Locked configuration for production use
 */

/**
 * A1_ARCH_FINAL Preset
 * 
 * Production-grade preset for architectural A1 sheet generation
 * Optimized for consistency, quality, and deterministic output
 */
export const A1_ARCH_FINAL = {
  /**
   * GENERATE Mode (text → image)
   * Used for initial A1 sheet generation from DNA + prompt
   */
  generate: {
    model: 'black-forest-labs/FLUX.1-dev',
    width: 1792,
    height: 1269,
    steps: 48,
    cfg: 7.8,
    scheduler: 'dpmpp_2m_sde_karras',
    denoise: 1.0,
    seedPolicy: 'perDesign', // One seed per design, reused for life
    
    // Prompt structure rules
    promptStructure: {
      maxLength: 4000,
      sections: [
        'system_banner',
        'consistency_locks',
        'grid_layout',
        'panel_instructions',
        'program_taxonomy',
        'output_rules'
      ],
      style: 'dense_bullets' // Short bullets, no prose paragraphs
    },
    
    // Negative prompt weights
    negativeWeights: {
      multipleBuildings: 5.0,
      houseCatalog: 5.0,
      sketchBoard: 5.0,
      conceptArt: 5.0,
      wrongFloorCount: 5.0,
      wrongRoofType: 5.0,
      wrongWindowCount: 5.0,
      layoutChanged: 5.0,
      missingPanels: 5.0
    }
  },
  
  /**
   * MODIFY Mode (img → img)
   * Used for modifying existing A1 sheets with consistency lock
   */
  modify: {
    model: 'black-forest-labs/FLUX.1-dev',
    width: 1792,
    height: 1269,
    steps: 32, // Reduced for img2img
    cfg: 6.5,  // Lower to respect init image more
    scheduler: 'dpmpp_2m_sde_karras',
    seedPolicy: 'reuseDesignSeed', // Always reuse baseline seed
    
    // img2img strength ranges
    img2imgStrength: {
      default: 0.14,
      minor: 0.10,      // Minor additions (labels, annotations)
      moderate: 0.14,   // Add sections, details
      significant: 0.18, // Major additions (but still safe)
      max: 0.20         // Absolute maximum (rarely use)
    },
    
    // Denoise matches strength
    denoise: 'matchStrength', // denoise = img2imgStrength
    
    // Drift detection thresholds
    driftThresholds: {
      acceptable: 0.08,  // < 8% drift is acceptable
      warning: 0.12,     // 8-12% drift triggers warning
      retry: 0.15,       // > 15% drift triggers retry with lower strength
      fail: 0.25         // > 25% drift fails modification
    },
    
    // Retry strategy
    retryStrategy: {
      maxRetries: 2,
      strengthReduction: 0.7, // Multiply strength by 0.7 on retry
      minStrength: 0.08       // Don't go below 0.08
    },
    
    // Prompt structure rules
    promptStructure: {
      maxLength: 2500,
      sections: [
        'modify_header',
        'base_lock_summary',
        'dna_locks',
        'delta_section',
        'output_expectations'
      ],
      style: 'ultra_compact' // Even more compact than generate
    },
    
    // Additional negative weights for modify
    negativeWeights: {
      newSheet: 4.0,
      layoutChanged: 4.5,
      initImageIgnored: 4.5,
      missingPanels: 5.0,
      multipleBuildings: 5.0
    }
  }
};

/**
 * Get preset for mode
 * @param {string} mode - 'generate' or 'modify'
 * @returns {Object} Preset configuration
 */
export function getA1Preset(mode = 'generate') {
  return A1_ARCH_FINAL[mode] || A1_ARCH_FINAL.generate;
}

/**
 * Get img2img strength for modification type
 * @param {string} modificationType - 'minor', 'moderate', 'significant'
 * @returns {number} Strength value
 */
export function getModifyStrength(modificationType = 'moderate') {
  const strengths = A1_ARCH_FINAL.modify.img2imgStrength;
  return strengths[modificationType] || strengths.default;
}

/**
 * Calculate retry strength after drift detection
 * @param {number} currentStrength - Current strength
 * @param {number} retryCount - Number of retries so far
 * @returns {number} New strength
 */
export function calculateRetryStrength(currentStrength, retryCount) {
  const strategy = A1_ARCH_FINAL.modify.retryStrategy;
  const newStrength = currentStrength * Math.pow(strategy.strengthReduction, retryCount);
  return Math.max(newStrength, strategy.minStrength);
}

/**
 * Check if drift score requires retry
 * @param {number} driftScore - Drift score (0-1)
 * @returns {Object} Retry decision
 */
export function shouldRetryForDrift(driftScore) {
  const thresholds = A1_ARCH_FINAL.modify.driftThresholds;
  
  return {
    shouldRetry: driftScore > thresholds.retry,
    shouldWarn: driftScore > thresholds.warning && driftScore <= thresholds.retry,
    shouldFail: driftScore > thresholds.fail,
    isAcceptable: driftScore <= thresholds.acceptable,
    driftScore,
    threshold: driftScore > thresholds.retry ? 'retry' : 
               driftScore > thresholds.warning ? 'warning' : 'acceptable'
  };
}

/**
 * Validate preset parameters
 * @param {Object} preset - Preset to validate
 * @returns {Object} Validation result
 */
export function validatePreset(preset) {
  const errors = [];
  
  if (!preset.model) errors.push('Model is required');
  if (!preset.width || !preset.height) errors.push('Dimensions are required');
  if (!preset.steps || preset.steps < 1) errors.push('Steps must be positive');
  if (!preset.cfg || preset.cfg < 1) errors.push('CFG must be >= 1');
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

const fluxPresets = {
  A1_ARCH_FINAL,
  getA1Preset,
  getModifyStrength,
  calculateRetryStrength,
  shouldRetryForDrift,
  validatePreset
};

export default fluxPresets;

