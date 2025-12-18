/**
 * Strict Panel Validator
 *
 * Production-ready validation service with FAIL-FAST capabilities:
 *
 * 1. NON-EMPTY CHECK: Validates panels aren't blank/white
 *    - Percent non-white pixels
 *    - Shannon entropy of pixel distribution
 *
 * 2. CONTROL-PACK SIMILARITY: Compares output to control images
 *    - pixelmatch diff ratio (strict)
 *    - Optional SSIM for structural comparison
 *
 * 3. FACADE CONSISTENCY: Compares elevations to canonical controls
 *    - Ensures all elevations match the canonical elevation control
 *    - NOT compared to hero (different render style)
 *
 * 4. FAIL-FAST INTEGRATION: Can halt generation and trigger auto-repair
 *
 * @module services/validation/strictPanelValidator
 */

import logger from '../core/logger.js';
import {
  compareImages,
  pixelDiffRatio,
  perceptualHash,
  hashDistance,
  normalizeImage,
  loadImageBuffer,
  CONFIG as SIMILARITY_CONFIG,
} from '../design/imageSimilarityService.js';

// =============================================================================
// CONFIGURABLE THRESHOLDS
// =============================================================================

export const VALIDATION_THRESHOLDS = {
  // Non-empty check thresholds
  nonEmpty: {
    minNonWhitePercent: 0.15, // At least 15% of pixels should be non-white
    minEntropy: 3.0, // Shannon entropy minimum (max ~8 for 8-bit)
    whiteThreshold: 250, // Pixel values >= 250 are considered "white"
  },

  // Control-pack similarity thresholds (output vs control image)
  controlPack: {
    maxPixelDiffRatio: 0.35, // Max 35% pixel difference from control
    minHashSimilarity: 0.7, // At least 70% hash similarity
    maxHashDistance: 19, // Max 19/64 bits different (~70% similar)
  },

  // Facade consistency thresholds (elevation vs canonical control)
  facade: {
    maxPixelDiffRatio: 0.4, // Max 40% pixel difference between elevations
    minHashSimilarity: 0.65, // At least 65% hash similarity
    maxHashDistance: 22, // Max 22/64 bits different (~66% similar)
  },

  // Required panels that must pass validation
  requiredPanels: [
    'hero_3d',
    'floor_plan_ground',
    'elevation_north',
    'elevation_south',
    'elevation_east',
    'elevation_west',
  ],

  // Panels that use control images
  controlledPanels: [
    'floor_plan_ground',
    'floor_plan_first',
    'elevation_north',
    'elevation_south',
    'elevation_east',
    'elevation_west',
    'section_AA',
    'section_BB',
  ],

  // Facade panels (compared against canonical elevation control)
  facadePanels: ['elevation_north', 'elevation_south', 'elevation_east', 'elevation_west'],
};

// Browser detection
const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

// Module caches
let sharpModule = null;
let sharpLoadAttempted = false;

/**
 * Load sharp module dynamically
 */
async function getSharp() {
  if (IS_BROWSER) {return null;}
  if (sharpLoadAttempted) {return sharpModule;}

  sharpLoadAttempted = true;
  try {
    sharpModule = (await import(/* webpackIgnore: true */ 'sharp')).default;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

// =============================================================================
// NON-EMPTY CHECK
// =============================================================================

/**
 * Calculate Shannon entropy of pixel distribution
 *
 * Higher entropy = more varied content (not blank)
 * Lower entropy = uniform content (possibly blank/white)
 *
 * @param {Uint8Array} pixels - Grayscale pixel values
 * @returns {number} - Entropy value (0-8 for 8-bit pixels)
 */
function calculateEntropy(pixels) {
  if (!pixels || pixels.length === 0) {return 0;}

  // Build histogram (256 bins for 8-bit grayscale)
  const histogram = new Array(256).fill(0);
  for (const pixel of pixels) {
    histogram[pixel]++;
  }

  // Calculate Shannon entropy
  const total = pixels.length;
  let entropy = 0;

  for (const count of histogram) {
    if (count === 0) {continue;}
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Calculate percent of non-white pixels
 *
 * @param {Uint8Array} pixels - Grayscale pixel values
 * @param {number} whiteThreshold - Pixels >= this value are "white"
 * @returns {number} - Ratio of non-white pixels (0-1)
 */
function calculateNonWhitePercent(pixels, whiteThreshold = 250) {
  if (!pixels || pixels.length === 0) {return 0;}

  let nonWhiteCount = 0;
  for (const pixel of pixels) {
    if (pixel < whiteThreshold) {
      nonWhiteCount++;
    }
  }

  return nonWhiteCount / pixels.length;
}

/**
 * Check if a panel image is non-empty (has actual content)
 *
 * @param {string|Buffer} image - Image source
 * @param {Object} options - Check options
 * @returns {Promise<{
 *   pass: boolean,
 *   nonWhitePercent: number,
 *   entropy: number,
 *   reasons: string[],
 *   error?: string
 * }>}
 */
export async function checkNonEmpty(image, options = {}) {
  const thresholds = { ...VALIDATION_THRESHOLDS.nonEmpty, ...options };
  const reasons = [];

  try {
    // Normalize image to grayscale for analysis
    const normalized = await normalizeImage(image, {
      width: 128, // Lower resolution is fine for content check
      height: 128,
      grayscale: true,
    });

    if (!normalized.success) {
      return {
        pass: false,
        nonWhitePercent: 0,
        entropy: 0,
        reasons: [`Image load failed: ${normalized.error}`],
        error: normalized.error,
      };
    }

    const nonWhitePercent = calculateNonWhitePercent(normalized.pixels, thresholds.whiteThreshold);
    const entropy = calculateEntropy(normalized.pixels);

    // Check thresholds
    const nonWhitePass = nonWhitePercent >= thresholds.minNonWhitePercent;
    const entropyPass = entropy >= thresholds.minEntropy;

    if (!nonWhitePass) {
      reasons.push(
        `Non-white pixels: ${(nonWhitePercent * 100).toFixed(1)}% < ${(thresholds.minNonWhitePercent * 100).toFixed(0)}% required`
      );
    }

    if (!entropyPass) {
      reasons.push(`Entropy: ${entropy.toFixed(2)} < ${thresholds.minEntropy.toFixed(1)} required`);
    }

    const pass = nonWhitePass && entropyPass;

    if (pass) {
      reasons.push('Panel has sufficient content');
    }

    return {
      pass,
      nonWhitePercent,
      entropy,
      reasons,
    };
  } catch (err) {
    return {
      pass: false,
      nonWhitePercent: 0,
      entropy: 0,
      reasons: [`Non-empty check error: ${err.message}`],
      error: err.message,
    };
  }
}

// =============================================================================
// CONTROL-PACK SIMILARITY CHECK
// =============================================================================

/**
 * Compare generated panel to its control image
 *
 * @param {string|Buffer} generated - Generated panel image
 * @param {string|Buffer} control - Control/reference image
 * @param {Object} options - Comparison options
 * @returns {Promise<{
 *   pass: boolean,
 *   pixelDiffRatio: number,
 *   pixelSimilarity: number,
 *   hashDistance: number,
 *   hashSimilarity: number,
 *   combinedScore: number,
 *   reasons: string[],
 *   error?: string
 * }>}
 */
export async function checkControlPackSimilarity(generated, control, options = {}) {
  const thresholds = { ...VALIDATION_THRESHOLDS.controlPack, ...options };
  const reasons = [];

  if (!generated || !control) {
    return {
      pass: false,
      pixelDiffRatio: 1,
      pixelSimilarity: 0,
      hashDistance: 64,
      hashSimilarity: 0,
      combinedScore: 0,
      reasons: ['Missing generated or control image'],
      error: 'Missing image',
    };
  }

  try {
    // Run full comparison
    const comparison = await compareImages(generated, control, {
      hashThreshold: thresholds.maxHashDistance,
      pixelDiffThreshold: thresholds.maxPixelDiffRatio,
    });

    if (!comparison.success) {
      return {
        pass: false,
        pixelDiffRatio: 1,
        pixelSimilarity: 0,
        hashDistance: 64,
        hashSimilarity: 0,
        combinedScore: 0,
        reasons: [`Comparison failed: ${comparison.error}`],
        error: comparison.error,
      };
    }

    // Check thresholds
    const pixelPass = comparison.pixelDiffRatio <= thresholds.maxPixelDiffRatio;
    const hashPass = comparison.hashDistance <= thresholds.maxHashDistance;

    if (!pixelPass) {
      reasons.push(
        `Pixel diff: ${(comparison.pixelDiffRatio * 100).toFixed(1)}% > ${(thresholds.maxPixelDiffRatio * 100).toFixed(0)}% max`
      );
    }

    if (!hashPass) {
      reasons.push(
        `Hash distance: ${comparison.hashDistance}/64 > ${thresholds.maxHashDistance}/64 max`
      );
    }

    const pass = pixelPass && hashPass;

    if (pass) {
      reasons.push('Control similarity within thresholds');
    }

    return {
      pass,
      pixelDiffRatio: comparison.pixelDiffRatio,
      pixelSimilarity: comparison.pixelSimilarity,
      hashDistance: comparison.hashDistance,
      hashSimilarity: comparison.hashSimilarity,
      combinedScore: comparison.combinedSimilarity,
      reasons,
    };
  } catch (err) {
    return {
      pass: false,
      pixelDiffRatio: 1,
      pixelSimilarity: 0,
      hashDistance: 64,
      hashSimilarity: 0,
      combinedScore: 0,
      reasons: [`Control check error: ${err.message}`],
      error: err.message,
    };
  }
}

// =============================================================================
// FACADE CONSISTENCY CHECK
// =============================================================================

/**
 * Compare facade elevations to canonical elevation control
 *
 * All elevations should be compared to the SAME canonical control
 * (not to hero_3d which has different render style)
 *
 * @param {Object} elevations - Map of elevation panels { elevation_north: { url }, ... }
 * @param {string|Buffer} canonicalControl - Canonical elevation control image
 * @param {Object} options - Comparison options
 * @returns {Promise<{
 *   pass: boolean,
 *   elevationResults: Object,
 *   failedElevations: string[],
 *   averageScore: number,
 *   reasons: string[]
 * }>}
 */
export async function checkFacadeConsistency(elevations, canonicalControl, options = {}) {
  const thresholds = { ...VALIDATION_THRESHOLDS.facade, ...options };
  const results = {};
  const failedElevations = [];
  const reasons = [];
  let totalScore = 0;
  let count = 0;

  if (!canonicalControl) {
    return {
      pass: true, // Skip if no canonical control
      elevationResults: {},
      failedElevations: [],
      averageScore: 1,
      reasons: ['No canonical control provided - skipping facade check'],
    };
  }

  for (const [name, panel] of Object.entries(elevations)) {
    if (!panel?.url && !panel?.buffer) {
      results[name] = { pass: false, reason: 'Missing image' };
      failedElevations.push(name);
      continue;
    }

    const image = panel.url || panel.buffer;

    try {
      const comparison = await compareImages(image, canonicalControl, {
        hashThreshold: thresholds.maxHashDistance,
        pixelDiffThreshold: thresholds.maxPixelDiffRatio,
      });

      if (!comparison.success) {
        results[name] = {
          pass: false,
          error: comparison.error,
          pixelDiffRatio: 1,
          hashSimilarity: 0,
        };
        failedElevations.push(name);
        reasons.push(`${name}: Comparison failed - ${comparison.error}`);
        continue;
      }

      const pixelPass = comparison.pixelDiffRatio <= thresholds.maxPixelDiffRatio;
      const hashPass = comparison.hashDistance <= thresholds.maxHashDistance;
      const pass = pixelPass && hashPass;

      results[name] = {
        pass,
        pixelDiffRatio: comparison.pixelDiffRatio,
        pixelSimilarity: comparison.pixelSimilarity,
        hashDistance: comparison.hashDistance,
        hashSimilarity: comparison.hashSimilarity,
        combinedScore: comparison.combinedSimilarity,
      };

      totalScore += comparison.combinedSimilarity;
      count++;

      if (!pass) {
        failedElevations.push(name);
        if (!pixelPass) {
          reasons.push(
            `${name}: Pixel diff ${(comparison.pixelDiffRatio * 100).toFixed(1)}% exceeds ${(thresholds.maxPixelDiffRatio * 100).toFixed(0)}%`
          );
        }
        if (!hashPass) {
          reasons.push(
            `${name}: Hash distance ${comparison.hashDistance}/64 exceeds ${thresholds.maxHashDistance}/64`
          );
        }
      }
    } catch (err) {
      results[name] = { pass: false, error: err.message };
      failedElevations.push(name);
      reasons.push(`${name}: Error - ${err.message}`);
    }
  }

  const averageScore = count > 0 ? totalScore / count : 0;
  const pass = failedElevations.length === 0;

  if (pass) {
    reasons.push('All elevations consistent with canonical control');
  }

  return {
    pass,
    elevationResults: results,
    failedElevations,
    averageScore,
    reasons,
  };
}

// =============================================================================
// STRICT PANEL VALIDATOR CLASS
// =============================================================================

/**
 * Strict Panel Validator
 *
 * Comprehensive validation with fail-fast support
 */
export class StrictPanelValidator {
  constructor(options = {}) {
    this.thresholds = {
      nonEmpty: { ...VALIDATION_THRESHOLDS.nonEmpty, ...options.nonEmpty },
      controlPack: { ...VALIDATION_THRESHOLDS.controlPack, ...options.controlPack },
      facade: { ...VALIDATION_THRESHOLDS.facade, ...options.facade },
    };

    this.failFastMode = options.failFastMode ?? false;
    this.requiredPanels = options.requiredPanels || VALIDATION_THRESHOLDS.requiredPanels;

    logger.info(`[StrictPanelValidator] Initialized (failFastMode: ${this.failFastMode})`);
  }

  /**
   * Validate a single panel
   *
   * @param {string} panelType - Panel type identifier
   * @param {Object} panelData - Panel data { url, buffer, controlImage }
   * @param {Object} options - Validation options
   * @returns {Promise<{
   *   pass: boolean,
   *   panelType: string,
   *   checks: { nonEmpty, controlPack },
   *   failureReasons: string[]
   * }>}
   */
  async validatePanel(panelType, panelData, options = {}) {
    const checks = {
      nonEmpty: null,
      controlPack: null,
    };
    const failureReasons = [];
    const image = panelData.url || panelData.buffer;

    logger.debug(`[StrictPanelValidator] Validating panel: ${panelType}`);

    // 1. Non-empty check
    const nonEmptyResult = await checkNonEmpty(image, this.thresholds.nonEmpty);
    checks.nonEmpty = nonEmptyResult;

    if (!nonEmptyResult.pass) {
      failureReasons.push(...nonEmptyResult.reasons);
      logger.warn(
        `[StrictPanelValidator] ${panelType} failed non-empty check:`,
        nonEmptyResult.reasons
      );

      // Fail-fast: stop here if panel is blank
      if (this.failFastMode) {
        return {
          pass: false,
          panelType,
          checks,
          failureReasons,
          failedAt: 'nonEmpty',
        };
      }
    }

    // 2. Control-pack similarity check (if control image provided)
    if (panelData.controlImage) {
      const controlResult = await checkControlPackSimilarity(
        image,
        panelData.controlImage,
        this.thresholds.controlPack
      );
      checks.controlPack = controlResult;

      if (!controlResult.pass) {
        failureReasons.push(...controlResult.reasons);
        logger.warn(
          `[StrictPanelValidator] ${panelType} failed control-pack check:`,
          controlResult.reasons
        );

        if (this.failFastMode) {
          return {
            pass: false,
            panelType,
            checks,
            failureReasons,
            failedAt: 'controlPack',
          };
        }
      }
    }

    const pass = failureReasons.length === 0;

    return {
      pass,
      panelType,
      checks,
      failureReasons,
    };
  }

  /**
   * Validate all panels in a generation run
   *
   * @param {Object} panelMap - Map of panels { panelType: { url, buffer, controlImage } }
   * @param {Object} options - Validation options
   * @param {string|Buffer} options.canonicalElevationControl - Canonical control for elevations
   * @returns {Promise<{
   *   pass: boolean,
   *   panelResults: Object,
   *   facadeResult: Object,
   *   failedPanels: string[],
   *   requiredFailures: string[],
   *   canCompose: boolean,
   *   summary: Object
   * }>}
   */
  async validateAllPanels(panelMap, options = {}) {
    const timestamp = new Date().toISOString();
    const panelResults = {};
    const failedPanels = [];
    const requiredFailures = [];

    logger.info('\n========================================');
    logger.info('STRICT PANEL VALIDATION');
    logger.info(`Fail-fast mode: ${this.failFastMode ? 'ENABLED' : 'DISABLED'}`);
    logger.info('========================================\n');

    // Validate each panel
    for (const [panelType, panelData] of Object.entries(panelMap)) {
      const result = await this.validatePanel(panelType, panelData, options);
      panelResults[panelType] = result;

      if (!result.pass) {
        failedPanels.push(panelType);

        if (this.requiredPanels.includes(panelType)) {
          requiredFailures.push(panelType);
        }

        // Log result
        const statusIcon = '❌';
        logger.info(`${statusIcon} ${panelType}: FAILED`);
        for (const reason of result.failureReasons.slice(0, 2)) {
          logger.info(`   → ${reason}`);
        }

        // Fail-fast: abort validation if required panel fails
        if (this.failFastMode && this.requiredPanels.includes(panelType)) {
          logger.error(`[StrictPanelValidator] FAIL-FAST: Required panel ${panelType} failed`);
          break;
        }
      } else {
        logger.info(`✅ ${panelType}: PASSED`);
      }
    }

    // Facade consistency check (elevations vs canonical control)
    let facadeResult = null;
    if (options.canonicalElevationControl) {
      const elevations = {};
      for (const facadePanel of VALIDATION_THRESHOLDS.facadePanels) {
        if (panelMap[facadePanel]) {
          elevations[facadePanel] = panelMap[facadePanel];
        }
      }

      if (Object.keys(elevations).length > 0) {
        facadeResult = await checkFacadeConsistency(
          elevations,
          options.canonicalElevationControl,
          this.thresholds.facade
        );

        if (!facadeResult.pass) {
          for (const failedElevation of facadeResult.failedElevations) {
            if (!failedPanels.includes(failedElevation)) {
              failedPanels.push(failedElevation);
            }
            if (
              this.requiredPanels.includes(failedElevation) &&
              !requiredFailures.includes(failedElevation)
            ) {
              requiredFailures.push(failedElevation);
            }
          }

          logger.info('\n📐 Facade Consistency: FAILED');
          for (const reason of facadeResult.reasons.slice(0, 3)) {
            logger.info(`   → ${reason}`);
          }
        } else {
          logger.info('\n📐 Facade Consistency: PASSED');
        }
      }
    }

    // Determine overall pass/fail
    const pass = failedPanels.length === 0;
    const canCompose = requiredFailures.length === 0;

    // Summary
    const summary = {
      totalPanels: Object.keys(panelMap).length,
      passedPanels: Object.keys(panelMap).length - failedPanels.length,
      failedPanels: failedPanels.length,
      requiredFailures: requiredFailures.length,
      passRate:
        Object.keys(panelMap).length > 0
          ? (
              ((Object.keys(panelMap).length - failedPanels.length) /
                Object.keys(panelMap).length) *
              100
            ).toFixed(1)
          : 0,
    };

    logger.info('\n----------------------------------------');
    logger.info('VALIDATION SUMMARY:');
    logger.info(`   Total: ${summary.totalPanels}`);
    logger.info(`   Passed: ${summary.passedPanels}`);
    logger.info(`   Failed: ${summary.failedPanels}`);
    logger.info(`   Pass Rate: ${summary.passRate}%`);
    logger.info(`   Can Compose A1: ${canCompose ? '✅ YES' : '❌ NO'}`);
    if (requiredFailures.length > 0) {
      logger.info(`   Required Failures: ${requiredFailures.join(', ')}`);
    }
    logger.info('----------------------------------------\n');

    return {
      pass,
      panelResults,
      facadeResult,
      failedPanels,
      requiredFailures,
      canCompose,
      summary,
      timestamp,
      thresholds: this.thresholds,
    };
  }

  /**
   * Get panels that need regeneration
   *
   * @param {Object} validationResult - Result from validateAllPanels
   * @returns {string[]} - List of panel types to regenerate
   */
  getPanelsToRegenerate(validationResult) {
    return validationResult.failedPanels;
  }

  /**
   * Check if A1 composition should proceed
   *
   * @param {Object} validationResult - Result from validateAllPanels
   * @returns {boolean}
   */
  canProceedToCompose(validationResult) {
    return validationResult.canCompose;
  }
}

// =============================================================================
// AUTO-REPAIR HELPERS
// =============================================================================

/**
 * Build a stronger prompt for repair attempts
 *
 * Adds explicit constraints based on panel type and repair attempt number.
 * Higher attempt numbers use more aggressive constraints.
 *
 * @param {string} originalPrompt - Original generation prompt
 * @param {string} panelType - Type of panel being repaired
 * @param {number} repairAttempt - Current repair attempt (1, 2, 3...)
 * @returns {string} - Enhanced prompt with stronger constraints
 */
export function buildRepairPrompt(originalPrompt, panelType, repairAttempt) {
  if (!originalPrompt) {return originalPrompt;}

  let enhancedPrompt = originalPrompt;
  const constraints = [];

  // Panel-type specific constraints
  if (panelType.startsWith('elevation_')) {
    const direction = panelType.replace('elevation_', '').toUpperCase();
    constraints.push(
      `CRITICAL: This is the ${direction} elevation view.`,
      'MUST match the canonical elevation control image EXACTLY.',
      'Preserve ALL window positions, sizes, and counts.',
      'Preserve ALL door positions and styles.',
      'Maintain EXACT roof profile and pitch.',
      'Match material patterns precisely.'
    );

    if (repairAttempt >= 2) {
      constraints.push(
        'STRICT GEOMETRY LOCK: Do NOT modify any building proportions.',
        'STRICT OPENING LOCK: Window and door positions are FIXED.',
        'STRICT MATERIAL LOCK: Use ONLY the specified materials.'
      );
    }
  } else if (panelType === 'hero_3d') {
    constraints.push(
      'CRITICAL: Main 3D perspective view.',
      'Building must match ALL elevation views exactly.',
      'Same roof type, window patterns, and materials as elevations.',
      'Consistent architectural style throughout.'
    );

    if (repairAttempt >= 2) {
      constraints.push(
        'STRICT: Single coherent building, no multiple structures.',
        'STRICT: Photorealistic rendering with accurate shadows.',
        'STRICT: Match control image geometry precisely.'
      );
    }
  } else if (panelType === 'floor_plan_ground' || panelType === 'floor_plan_first') {
    constraints.push(
      'CRITICAL: Accurate 2D overhead floor plan.',
      'Room positions and sizes must match geometry exactly.',
      'Wall thicknesses must be consistent.',
      'All doors and windows must be shown correctly.'
    );

    if (repairAttempt >= 2) {
      constraints.push(
        'STRICT: Pure orthographic 2D view (NO perspective).',
        'STRICT: Professional CAD-quality line work.',
        'STRICT: Dimension lines must match actual measurements.'
      );
    }
  } else if (panelType.startsWith('section_')) {
    constraints.push(
      'CRITICAL: Accurate building section cut.',
      'Floor levels must match elevation views.',
      'Wall and slab thicknesses must be consistent.',
      'Show structural elements accurately.'
    );

    if (repairAttempt >= 2) {
      constraints.push(
        'STRICT: Pure orthographic section view.',
        'STRICT: Correct cut line representation.',
        'STRICT: Material hatching as specified.'
      );
    }
  }

  // Add progressive constraints based on attempt number
  if (repairAttempt >= 3) {
    constraints.push(
      'MAXIMUM CONSTRAINT MODE: Follow control image with 95%+ accuracy.',
      'NO creative interpretation - exact reproduction only.',
      'Any deviation from control image is a FAILURE.'
    );
  }

  // Build final prompt
  if (constraints.length > 0) {
    enhancedPrompt = `${constraints.join(' ')}\n\n${originalPrompt}`;
  }

  return enhancedPrompt;
}

/**
 * Get repair strategy for a panel type
 *
 * @param {string} panelType - Type of panel
 * @param {number} repairAttempt - Current repair attempt
 * @returns {Object} - Repair strategy configuration
 */
export function getRepairStrategy(panelType, repairAttempt) {
  const baseStrategy = {
    controlStrengthMultiplier: 1.0,
    simplifyPrompt: false,
    useStricterNegatives: false,
    forceGeometryLock: false,
  };

  // Progressive strategy based on attempt
  if (repairAttempt === 1) {
    return {
      ...baseStrategy,
      controlStrengthMultiplier: 1.25, // 0.6 → 0.75
      simplifyPrompt: false,
    };
  } else if (repairAttempt === 2) {
    return {
      ...baseStrategy,
      controlStrengthMultiplier: 1.5, // 0.6 → 0.90
      simplifyPrompt: true,
      useStricterNegatives: true,
    };
  } else {
    return {
      ...baseStrategy,
      controlStrengthMultiplier: 1.6, // 0.6 → 0.95 (capped)
      simplifyPrompt: true,
      useStricterNegatives: true,
      forceGeometryLock: true,
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const strictPanelValidator = new StrictPanelValidator({ failFastMode: false });

export {
  calculateEntropy,
  calculateNonWhitePercent,
  // VALIDATION_THRESHOLDS already exported on line 38
};

export default StrictPanelValidator;
