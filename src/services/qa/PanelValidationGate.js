/**
 * PanelValidationGate - Unified Panel Validation with Fail-Fast
 *
 * DELIVERABLE #5: Validation Gates
 * - No blank plans (detectBlank)
 * - No duplicate elevations (pHash/SSIM)
 * - Fail-fast with actionable error
 *
 * Integrates:
 * - BlankPanelDetector for blank/degenerate detection
 * - ImageMetricsService for pHash/SSIM duplicate detection
 *
 * Part of Phase 5: Meshy + Blender + OpenAI Pipeline Refactor
 *
 * @module services/qa/PanelValidationGate
 */

import { normalizeToCanonical, PANEL_REGISTRY } from '../../config/panelRegistry.js';
import logger from '../core/logger.js';

import {
  detectBlank,
  detectDegenerateRender,
  DegenerateRenderError,
  BLANK_THRESHOLD,
} from './BlankPanelDetector.js';
import {
  computePHash,
  computeSSIM,
  hammingDistance,
  METRIC_THRESHOLDS,
} from './ImageMetricsService.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Elevation panels that should be checked for duplicates
 */
export const ELEVATION_PANELS = [
  'elevation_north',
  'elevation_south',
  'elevation_east',
  'elevation_west',
];

/**
 * pHash distance threshold for duplicate detection
 * If two elevations have distance < this, they're considered duplicates
 */
export const DUPLICATE_PHASH_THRESHOLD = 8; // ~87.5% similarity

/**
 * SSIM threshold for duplicate detection
 * If two elevations have SSIM > this, they're considered duplicates
 */
export const DUPLICATE_SSIM_THRESHOLD = 0.92;

/**
 * Technical panels that should be checked for blankness
 */
export const TECHNICAL_PANELS = [
  'floor_plan_ground',
  'floor_plan_first',
  'floor_plan_level2',
  'elevation_north',
  'elevation_south',
  'elevation_east',
  'elevation_west',
  'section_AA',
  'section_BB',
  'axonometric',
  'site_plan',
];

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Custom error for validation failures with actionable messages
 */
export class PanelValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PanelValidationError';
    this.details = details;
    this.actionable = true;
    this.recoverable = details.recoverable ?? true;
  }

  /**
   * Get actionable suggestion for fixing the error
   */
  getSuggestion() {
    const { failureType, panelType, duplicatePair } = this.details;

    switch (failureType) {
      case 'blank_panel':
        return `Panel '${panelType}' is blank. Action: Regenerate using SVG-only mode (skip FLUX).`;

      case 'degenerate_render':
        return `Panel '${panelType}' has degenerate content. Action: Check geometry input and regenerate.`;

      case 'duplicate_elevations':
        return `Elevations ${duplicatePair[0]} and ${duplicatePair[1]} are duplicates. Action: Ensure each elevation uses unique camera angle.`;

      default:
        return 'Unknown validation failure. Action: Check panel generation pipeline.';
    }
  }
}

// =============================================================================
// BLANK DETECTION
// =============================================================================

/**
 * Validates a single panel for blankness
 *
 * @param {Buffer|string} image - Panel image buffer or URL
 * @param {string} panelType - Panel type identifier
 * @param {Object} options - Validation options
 * @returns {Promise<{pass: boolean, reason: string, metrics: Object}>}
 */
export async function validateBlankness(image, panelType, options = {}) {
  const canonical = normalizeToCanonical(panelType) || panelType;

  // Only check technical panels
  if (!TECHNICAL_PANELS.includes(canonical)) {
    return {
      pass: true,
      skipped: true,
      reason: `Panel type '${canonical}' does not require blank check`,
      panelType: canonical,
    };
  }

  try {
    const result = await detectBlank(image, {
      blankThreshold: options.blankThreshold || BLANK_THRESHOLD,
    });

    if (result.isBlank) {
      logger.warn(`[ValidationGate] BLANK panel detected: ${canonical}`);
      return {
        pass: false,
        reason: result.reason,
        panelType: canonical,
        metrics: {
          whiteRatio: result.whiteRatio,
          blackRatio: result.blackRatio,
          blanknessScore: result.blanknessScore,
        },
        failureType: 'blank_panel',
      };
    }

    return {
      pass: true,
      reason: 'Panel has adequate content',
      panelType: canonical,
      metrics: {
        whiteRatio: result.whiteRatio,
        blackRatio: result.blackRatio,
        blanknessScore: result.blanknessScore,
      },
    };
  } catch (error) {
    // Fail-closed: treat errors as failures
    logger.error(`[ValidationGate] Blank detection failed for ${canonical}:`, error.message);
    return {
      pass: false,
      error: error.message,
      reason: `Detection error (fail-closed): ${error.message}`,
      panelType: canonical,
      failureType: 'detection_error',
    };
  }
}

// =============================================================================
// DEGENERATE DETECTION
// =============================================================================

/**
 * Validates a panel for degenerate rendering (thin towers, tiny content)
 *
 * @param {Buffer|string} image - Panel image buffer or URL
 * @param {string} panelType - Panel type identifier
 * @returns {Promise<{pass: boolean, reason: string, issues: string[]}>}
 */
export async function validateDegenerate(image, panelType, options = {}) {
  const canonical = normalizeToCanonical(panelType) || panelType;

  // Only check technical panels
  if (!TECHNICAL_PANELS.includes(canonical)) {
    return {
      pass: true,
      skipped: true,
      reason: `Panel type '${canonical}' does not require degenerate check`,
      panelType: canonical,
    };
  }

  try {
    const result = await detectDegenerateRender(image, canonical, options);

    if (result.isDegenerate) {
      logger.warn(`[ValidationGate] DEGENERATE panel: ${canonical} - ${result.issues.join('; ')}`);
      return {
        pass: false,
        reason: result.reason,
        panelType: canonical,
        issues: result.issues,
        warnings: result.warnings,
        metrics: result.metrics,
        failureType: 'degenerate_render',
      };
    }

    return {
      pass: true,
      reason: 'Panel passed degenerate checks',
      panelType: canonical,
      warnings: result.warnings,
      metrics: result.metrics,
    };
  } catch (error) {
    logger.error(`[ValidationGate] Degenerate detection failed for ${canonical}:`, error.message);
    return {
      pass: false,
      error: error.message,
      reason: `Detection error: ${error.message}`,
      panelType: canonical,
      failureType: 'detection_error',
    };
  }
}

// =============================================================================
// DUPLICATE ELEVATION DETECTION
// =============================================================================

/**
 * Checks if two elevations are duplicates using pHash and SSIM
 *
 * @param {Buffer|string} imageA - First elevation image
 * @param {Buffer|string} imageB - Second elevation image
 * @returns {Promise<{isDuplicate: boolean, pHashDistance: number, ssim: number}>}
 */
export async function checkElevationDuplicate(imageA, imageB) {
  try {
    const [pHashA, pHashB, ssimResult] = await Promise.all([
      computePHash(imageA),
      computePHash(imageB),
      computeSSIM(imageA, imageB),
    ]);

    const pHashDistance = hammingDistance(pHashA.bits, pHashB.bits);
    const ssim = ssimResult.ssim;

    // Consider duplicate if BOTH pHash is very similar AND SSIM is high
    const isDuplicate =
      pHashDistance < DUPLICATE_PHASH_THRESHOLD && ssim > DUPLICATE_SSIM_THRESHOLD;

    return {
      isDuplicate,
      pHashDistance,
      pHashSimilarity: 1 - pHashDistance / 64,
      ssim,
      thresholds: {
        pHashMax: DUPLICATE_PHASH_THRESHOLD,
        ssimMin: DUPLICATE_SSIM_THRESHOLD,
      },
    };
  } catch (error) {
    logger.warn(`[ValidationGate] Duplicate check failed:`, error.message);
    // Fail open for duplicate check (not critical)
    return {
      isDuplicate: false,
      error: error.message,
    };
  }
}

/**
 * Validates all elevation panels for duplicates
 *
 * @param {Object} panels - Map of panelType -> image (buffer or URL)
 * @returns {Promise<{pass: boolean, duplicates: Array, reason: string}>}
 */
export async function validateElevationDuplicates(panels) {
  const elevations = ELEVATION_PANELS.filter((type) => panels[type]);

  if (elevations.length < 2) {
    return {
      pass: true,
      reason: 'Not enough elevations to check for duplicates',
      checked: elevations.length,
    };
  }

  const duplicates = [];
  const comparisons = [];

  // Compare all pairs
  for (let i = 0; i < elevations.length; i++) {
    for (let j = i + 1; j < elevations.length; j++) {
      const typeA = elevations[i];
      const typeB = elevations[j];

      const result = await checkElevationDuplicate(panels[typeA], panels[typeB]);

      comparisons.push({
        pair: [typeA, typeB],
        ...result,
      });

      if (result.isDuplicate) {
        duplicates.push({
          panels: [typeA, typeB],
          pHashDistance: result.pHashDistance,
          ssim: result.ssim,
        });
      }
    }
  }

  if (duplicates.length > 0) {
    const dupDesc = duplicates.map((d) => `${d.panels[0]} ≈ ${d.panels[1]}`).join(', ');
    logger.warn(`[ValidationGate] DUPLICATE elevations detected: ${dupDesc}`);

    return {
      pass: false,
      reason: `Duplicate elevations found: ${dupDesc}`,
      duplicates,
      comparisons,
      failureType: 'duplicate_elevations',
      duplicatePair: duplicates[0].panels,
    };
  }

  return {
    pass: true,
    reason: 'All elevations are unique',
    comparisons,
    checked: elevations.length,
  };
}

// =============================================================================
// UNIFIED VALIDATION GATE
// =============================================================================

/**
 * Validates all panels with fail-fast behavior
 *
 * DELIVERABLE #5: Fail-fast with actionable error
 *
 * @param {Object} panels - Map of panelType -> image (buffer or URL)
 * @param {Object} options - Validation options
 * @param {boolean} options.failFast - Stop on first failure (default: true)
 * @param {boolean} options.checkBlanks - Check for blank panels (default: true)
 * @param {boolean} options.checkDuplicates - Check for duplicate elevations (default: true)
 * @param {boolean} options.checkDegenerate - Check for degenerate renders (default: true)
 * @param {boolean} options.throwOnFailure - Throw PanelValidationError on failure (default: true)
 * @returns {Promise<ValidationGateResult>}
 */
export async function validatePanels(panels, options = {}) {
  const {
    failFast = true,
    checkBlanks = true,
    checkDuplicates = true,
    checkDegenerate = true,
    throwOnFailure = true,
  } = options;

  const results = {
    pass: true,
    blankChecks: [],
    degenerateChecks: [],
    duplicateCheck: null,
    failures: [],
    warnings: [],
    timestamp: new Date().toISOString(),
  };

  logger.info(`[ValidationGate] Validating ${Object.keys(panels).length} panels...`);

  // 1. Check for blank panels
  if (checkBlanks) {
    for (const [panelType, image] of Object.entries(panels)) {
      const blankResult = await validateBlankness(image, panelType, options);
      results.blankChecks.push(blankResult);

      if (!blankResult.pass && !blankResult.skipped) {
        results.pass = false;
        results.failures.push({
          type: 'blank_panel',
          panelType,
          reason: blankResult.reason,
        });

        if (failFast) {
          logger.error(`[ValidationGate] FAIL-FAST: Blank panel ${panelType}`);
          break;
        }
      }
    }

    // Exit early if fail-fast triggered
    if (!results.pass && failFast) {
      return handleValidationResult(results, throwOnFailure);
    }
  }

  // 2. Check for degenerate renders
  if (checkDegenerate && results.pass) {
    for (const [panelType, image] of Object.entries(panels)) {
      const degResult = await validateDegenerate(image, panelType, options);
      results.degenerateChecks.push(degResult);

      if (!degResult.pass && !degResult.skipped) {
        results.pass = false;
        results.failures.push({
          type: 'degenerate_render',
          panelType,
          reason: degResult.reason,
          issues: degResult.issues,
        });

        if (failFast) {
          logger.error(`[ValidationGate] FAIL-FAST: Degenerate render ${panelType}`);
          break;
        }
      }

      // Collect warnings
      if (degResult.warnings?.length > 0) {
        results.warnings.push({
          panelType,
          warnings: degResult.warnings,
        });
      }
    }

    // Exit early if fail-fast triggered
    if (!results.pass && failFast) {
      return handleValidationResult(results, throwOnFailure);
    }
  }

  // 3. Check for duplicate elevations
  if (checkDuplicates && results.pass) {
    results.duplicateCheck = await validateElevationDuplicates(panels);

    if (!results.duplicateCheck.pass) {
      results.pass = false;
      results.failures.push({
        type: 'duplicate_elevations',
        reason: results.duplicateCheck.reason,
        duplicates: results.duplicateCheck.duplicates,
      });
    }
  }

  return handleValidationResult(results, throwOnFailure);
}

/**
 * Handle validation result with optional throw
 *
 * @param {Object} results - Validation results
 * @param {boolean} throwOnFailure - Whether to throw on failure
 * @returns {Object} Results
 * @throws {PanelValidationError} If validation failed and throwOnFailure is true
 */
function handleValidationResult(results, throwOnFailure) {
  if (!results.pass && throwOnFailure) {
    const firstFailure = results.failures[0];
    const error = new PanelValidationError(`Panel validation failed: ${firstFailure.reason}`, {
      failureType: firstFailure.type,
      panelType: firstFailure.panelType,
      duplicatePair: firstFailure.duplicates?.[0]?.panels,
      failures: results.failures,
      recoverable: true,
    });

    logger.error(`[ValidationGate] ${error.message}`);
    logger.error(`[ValidationGate] Suggestion: ${error.getSuggestion()}`);

    throw error;
  }

  // Log summary
  const blankPassed = results.blankChecks.filter((r) => r.pass || r.skipped).length;
  const degPassed = results.degenerateChecks.filter((r) => r.pass || r.skipped).length;

  logger.info(
    `[ValidationGate] Results: ` +
      `blanks=${blankPassed}/${results.blankChecks.length}, ` +
      `degenerate=${degPassed}/${results.degenerateChecks.length}, ` +
      `duplicates=${results.duplicateCheck?.pass ? 'PASS' : 'FAIL'}`
  );

  return results;
}

/**
 * Quick validation for a single panel
 *
 * @param {Buffer|string} image - Panel image
 * @param {string} panelType - Panel type
 * @param {Object} options - Options
 * @returns {Promise<{pass: boolean, reason: string}>}
 */
export async function validateSinglePanel(image, panelType, options = {}) {
  const blankResult = await validateBlankness(image, panelType, options);
  if (!blankResult.pass && !blankResult.skipped) {
    return blankResult;
  }

  const degResult = await validateDegenerate(image, panelType, options);
  if (!degResult.pass && !degResult.skipped) {
    return degResult;
  }

  return {
    pass: true,
    reason: 'Panel passed all validation checks',
    panelType: normalizeToCanonical(panelType) || panelType,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Single panel validation
  validateBlankness,
  validateDegenerate,
  validateSinglePanel,

  // Elevation duplicate detection
  checkElevationDuplicate,
  validateElevationDuplicates,

  // Unified gate
  validatePanels,

  // Error class
  PanelValidationError,

  // Constants
  ELEVATION_PANELS,
  TECHNICAL_PANELS,
  DUPLICATE_PHASH_THRESHOLD,
  DUPLICATE_SSIM_THRESHOLD,
};

/**
 * @typedef {Object} ValidationGateResult
 * @property {boolean} pass - Overall pass/fail
 * @property {Object[]} blankChecks - Blank detection results per panel
 * @property {Object[]} degenerateChecks - Degenerate detection results per panel
 * @property {Object} duplicateCheck - Duplicate elevation check result
 * @property {Object[]} failures - List of failures
 * @property {Object[]} warnings - List of warnings
 * @property {string} timestamp - ISO timestamp
 */
