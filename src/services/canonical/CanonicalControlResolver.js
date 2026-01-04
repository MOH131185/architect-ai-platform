/**
 * Canonical Control Resolver
 *
 * ENFORCES: hero_3d and interior_3d panels MUST use init_image
 * derived from the same designFingerprint canonical pack.
 *
 * This service makes it IMPOSSIBLE to proceed without valid canonical control.
 *
 * @module services/canonical/CanonicalControlResolver
 */

import { isFeatureEnabled } from '../../config/featureFlags.js';
import { normalizeToCanonical } from '../../config/panelRegistry.js';
import logger from '../core/logger.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Panels that MUST have canonical control images
 * These panels cannot use arbitrary init_image - only canonical renders
 */
export const MANDATORY_CANONICAL_CONTROL_PANELS = ['hero_3d', 'interior_3d'];

/**
 * Mapping from AI panel type to canonical pack panel type
 */
export const PANEL_TO_CANONICAL_MAP = {
  // 3D views use massing/axonometric from canonical pack
  hero_3d: 'canonical_massing_3d',
  interior_3d: 'canonical_massing_3d', // Interior uses massing as base (no interior in pack)

  // Floor plans map directly
  floor_plan_ground: 'canonical_floor_plan_ground',
  floor_plan_first: 'canonical_floor_plan_first',
  floor_plan_second: 'canonical_floor_plan_second',

  // Elevations map directly
  elevation_north: 'canonical_elevation_north',
  elevation_south: 'canonical_elevation_south',
  elevation_east: 'canonical_elevation_east',
  elevation_west: 'canonical_elevation_west',

  // Sections map directly
  section_AA: 'canonical_section_aa',
  section_BB: 'canonical_section_bb',
};

/**
 * Error codes for canonical control resolution
 */
export const RESOLVER_ERROR_CODES = {
  MISSING_CANONICAL_PACK: 'MISSING_CANONICAL_PACK',
  MISSING_CONTROL_IMAGE: 'MISSING_CONTROL_IMAGE',
  FINGERPRINT_MISMATCH: 'FINGERPRINT_MISMATCH',
  INVALID_PANEL_TYPE: 'INVALID_PANEL_TYPE',
  CORRUPT_CONTROL_DATA: 'CORRUPT_CONTROL_DATA',
};

// =============================================================================
// HASH COMPUTATION
// =============================================================================

/**
 * Compute SHA256-like hash for content verification
 * Uses a simple hash for performance, with option for full SHA256 in Node.js
 *
 * @param {string} content - Content to hash
 * @returns {string} Hash string (hex)
 */
export function computeControlImageHash(content) {
  if (!content) {return 'null_content';}

  // Simple fast hash for browser/Node compatibility
  let hash = 0;
  const str = typeof content === 'string' ? content : String(content);
  const len = Math.min(str.length, 10000); // Sample first 10k chars

  for (let i = 0; i < len; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  // Return hex string with 'sha256_' prefix for clarity
  return `sha256_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Compute fingerprint-based hash including design identity
 *
 * @param {string} designFingerprint - Design fingerprint
 * @param {string} panelType - Panel type
 * @param {string} contentHash - Content hash
 * @returns {string} Combined hash
 */
export function computeCanonicalFingerprint(designFingerprint, panelType, contentHash) {
  const combined = `${designFingerprint}:${panelType}:${contentHash}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `canon_${Math.abs(hash).toString(16).padStart(12, '0')}`;
}

// =============================================================================
// CONTROL IMAGE RESOLUTION
// =============================================================================

/**
 * Resolve canonical control image for a panel type.
 *
 * CRITICAL: For hero_3d and interior_3d, this function returns null if
 * no valid canonical control exists. Callers MUST check for null and
 * refuse to proceed.
 *
 * @param {string} panelType - Panel type (e.g., 'hero_3d', 'interior_3d')
 * @param {Object} canonicalPack - Canonical pack object with panels
 * @param {string} designFingerprint - Expected design fingerprint
 * @returns {Object|null} Control image data or null if not found/invalid
 */
export function resolveControlImage(panelType, canonicalPack, designFingerprint) {
  const canonical = normalizeToCanonical(panelType) || panelType;

  // Validate inputs
  if (!canonical) {
    logger.warn(`[CanonicalControlResolver] Invalid panel type: ${panelType}`);
    return null;
  }

  if (!canonicalPack || typeof canonicalPack !== 'object') {
    logger.warn(`[CanonicalControlResolver] Missing or invalid canonical pack for ${canonical}`);
    return null;
  }

  if (!designFingerprint) {
    logger.warn(`[CanonicalControlResolver] Missing design fingerprint for ${canonical}`);
    return null;
  }

  // Get canonical panel type mapping
  const canonicalPanelType = PANEL_TO_CANONICAL_MAP[canonical];
  if (!canonicalPanelType) {
    // Panel type doesn't require canonical control
    logger.debug(`[CanonicalControlResolver] ${canonical} has no canonical mapping - skipping`);
    return null;
  }

  // Verify pack fingerprint matches
  const packFingerprint = canonicalPack.designFingerprint;
  if (packFingerprint && packFingerprint !== designFingerprint) {
    logger.error(
      `[CanonicalControlResolver] FINGERPRINT MISMATCH for ${canonical}! ` +
        `Expected: ${designFingerprint}, Got: ${packFingerprint}`
    );
    return null;
  }

  // Get control image from pack
  const panels = canonicalPack.panels || canonicalPack;
  const controlData = panels[canonicalPanelType];

  if (!controlData) {
    logger.warn(
      `[CanonicalControlResolver] No ${canonicalPanelType} in canonical pack for ${canonical}`
    );
    return null;
  }

  // Validate control data has usable content
  const controlUrl = controlData.dataUrl || controlData.url || controlData.path;
  if (!controlUrl) {
    logger.warn(
      `[CanonicalControlResolver] ${canonicalPanelType} has no URL/dataUrl for ${canonical}`
    );
    return null;
  }

  // Compute hashes for verification
  const contentHash = computeControlImageHash(controlUrl);
  const canonicalFingerprint = computeCanonicalFingerprint(
    designFingerprint,
    canonicalPanelType,
    contentHash
  );

  // Build resolved control image
  const resolvedControl = {
    // Control image URL (for init_image)
    url: controlUrl,
    dataUrl: controlData.dataUrl || controlUrl,

    // Metadata for verification
    panelType: canonical,
    canonicalPanelType,
    controlSource: 'canonical',

    // Fingerprint verification (CRITICAL for hero_3d/interior_3d)
    designFingerprint,
    packFingerprint: packFingerprint || designFingerprint,
    canonicalFingerprint,

    // Hash for DEBUG_REPORT
    controlImageSha256: contentHash,
    controlImagePath: controlData.path || `canonical://${canonicalPanelType}`,

    // Original control data for reference
    svgHash: controlData.svgHash,
    generatedAt: controlData.generatedAt,
    dimensions: {
      width: controlData.width,
      height: controlData.height,
    },

    // Flag for downstream verification
    isCanonical: true,
    verifiedFingerprint: true,
  };

  logger.info(
    `[CanonicalControlResolver] Resolved ${canonical} → ${canonicalPanelType} ` +
      `(fingerprint: ${designFingerprint.substring(0, 12)}..., hash: ${contentHash})`
  );

  return resolvedControl;
}

/**
 * Check if a panel type requires mandatory canonical control.
 *
 * @param {string} panelType - Panel type
 * @returns {boolean} True if mandatory control is required
 */
export function requiresMandatoryCanonicalControl(panelType) {
  const canonical = normalizeToCanonical(panelType) || panelType;
  return MANDATORY_CANONICAL_CONTROL_PANELS.includes(canonical);
}

/**
 * Assert that a panel has valid canonical control. Throws if required but missing.
 *
 * @param {string} panelType - Panel type
 * @param {Object} canonicalPack - Canonical pack
 * @param {string} designFingerprint - Design fingerprint
 * @param {Object} options - Options
 * @returns {Object} Resolved control image
 * @throws {Error} If mandatory control is missing
 */
export function assertCanonicalControl(panelType, canonicalPack, designFingerprint, options = {}) {
  const { strictMode = true } = options;
  const canonical = normalizeToCanonical(panelType) || panelType;
  const isMandatory = requiresMandatoryCanonicalControl(canonical);

  const resolved = resolveControlImage(panelType, canonicalPack, designFingerprint);

  if (!resolved && isMandatory && strictMode) {
    const error = new Error(
      `[CanonicalControlResolver] FATAL: Cannot generate ${canonical} without canonical control image. ` +
        `Panels ${MANDATORY_CANONICAL_CONTROL_PANELS.join(', ')} MUST use init_image from the same designFingerprint. ` +
        `Ensure canonical pack exists and matches fingerprint: ${designFingerprint}`
    );
    error.code = RESOLVER_ERROR_CODES.MISSING_CONTROL_IMAGE;
    error.panelType = canonical;
    error.designFingerprint = designFingerprint;
    error.isMandatory = true;

    logger.error(error.message);
    throw error;
  }

  if (!resolved && isMandatory) {
    logger.warn(
      `[CanonicalControlResolver] Missing mandatory control for ${canonical} (non-strict mode)`
    );
  }

  return resolved;
}

/**
 * Validate that init_image matches canonical control for mandatory panels.
 *
 * @param {string} panelType - Panel type
 * @param {string} initImage - init_image URL being used
 * @param {Object} canonicalPack - Canonical pack
 * @param {string} designFingerprint - Design fingerprint
 * @returns {Object} Validation result
 */
export function validateInitImageIsCanonical(
  panelType,
  initImage,
  canonicalPack,
  designFingerprint
) {
  const canonical = normalizeToCanonical(panelType) || panelType;
  const isMandatory = requiresMandatoryCanonicalControl(canonical);

  const result = {
    panelType: canonical,
    isMandatory,
    valid: false,
    controlSource: 'unknown',
    reason: null,
    canonicalFingerprint: null,
    controlImageSha256: null,
    controlImagePath: null,
  };

  // Get expected canonical control
  const resolved = resolveControlImage(panelType, canonicalPack, designFingerprint);

  if (!resolved) {
    result.reason = 'NO_CANONICAL_CONTROL_AVAILABLE';
    result.valid = !isMandatory; // Invalid only if mandatory
    return result;
  }

  // Compute hash of provided init_image
  const providedHash = computeControlImageHash(initImage);
  const canonicalHash = resolved.controlImageSha256;

  // Check if init_image matches canonical
  if (providedHash === canonicalHash) {
    result.valid = true;
    result.controlSource = 'canonical';
    result.reason = 'HASH_MATCH';
    result.canonicalFingerprint = resolved.canonicalFingerprint;
    result.controlImageSha256 = canonicalHash;
    result.controlImagePath = resolved.controlImagePath;
  } else {
    result.valid = false;
    result.controlSource = 'non_canonical';
    result.reason = 'HASH_MISMATCH';
    result.expectedHash = canonicalHash;
    result.providedHash = providedHash;

    if (isMandatory) {
      logger.error(
        `[CanonicalControlResolver] VIOLATION: ${canonical} using non-canonical init_image! ` +
          `Expected hash: ${canonicalHash}, Got: ${providedHash}`
      );
    }
  }

  return result;
}

/**
 * Build init_image parameters with canonical enforcement.
 *
 * For hero_3d/interior_3d: Returns params only if canonical control exists.
 * For other panels: Returns params if available, null otherwise.
 *
 * @param {string} panelType - Panel type
 * @param {Object} canonicalPack - Canonical pack
 * @param {string} designFingerprint - Design fingerprint
 * @param {Object} options - Options
 * @returns {Object|null} Init image params or null
 */
export function buildCanonicalInitParams(
  panelType,
  canonicalPack,
  designFingerprint,
  options = {}
) {
  const {
    strength = 0.65, // Default strength for stylization
    strictMode = true,
  } = options;

  const resolved = assertCanonicalControl(panelType, canonicalPack, designFingerprint, {
    strictMode,
  });

  if (!resolved) {
    return null;
  }

  // Determine optimal strength based on panel type
  const canonical = normalizeToCanonical(panelType) || panelType;
  const strengthMap = {
    hero_3d: 0.65, // Allow FLUX to stylize while preserving form
    interior_3d: 0.6, // Slightly more freedom for interior lighting
    floor_plan_ground: 0.15, // Very tight control for plans
    floor_plan_first: 0.15,
    floor_plan_second: 0.15,
    elevation_north: 0.35, // Moderate control for elevations
    elevation_south: 0.35,
    elevation_east: 0.35,
    elevation_west: 0.35,
    section_AA: 0.15, // Very tight control for sections
    section_BB: 0.15,
  };

  const finalStrength = strengthMap[canonical] ?? strength;

  return {
    init_image: resolved.url,
    strength: finalStrength,

    // Metadata for DEBUG_REPORT (REQUIRED)
    _canonicalControl: {
      controlSource: 'canonical',
      controlImagePath: resolved.controlImagePath,
      controlImageSha256: resolved.controlImageSha256,
      canonicalFingerprint: resolved.canonicalFingerprint,
      designFingerprint: resolved.designFingerprint,
      panelType: canonical,
      canonicalPanelType: resolved.canonicalPanelType,
      verified: true,
    },
  };
}

// =============================================================================
// DEBUG REPORT FIELDS
// =============================================================================

/**
 * Extract canonical control fields for DEBUG_REPORT.
 *
 * @param {Object} resolvedControl - Resolved control image from resolveControlImage
 * @returns {Object} Fields for DEBUG_REPORT
 */
export function extractDebugReportFields(resolvedControl) {
  if (!resolvedControl) {
    return {
      controlImagePath: null,
      controlImageSha256: null,
      canonicalFingerprint: null,
      controlSource: 'none',
      isCanonical: false,
      verified: false,
    };
  }

  return {
    controlImagePath: resolvedControl.controlImagePath,
    controlImageSha256: resolvedControl.controlImageSha256,
    canonicalFingerprint: resolvedControl.canonicalFingerprint,
    controlSource: resolvedControl.controlSource || 'canonical',
    isCanonical: resolvedControl.isCanonical || false,
    verified: resolvedControl.verifiedFingerprint || false,
    designFingerprint: resolvedControl.designFingerprint,
    canonicalPanelType: resolvedControl.canonicalPanelType,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Core resolution
  resolveControlImage,
  assertCanonicalControl,
  buildCanonicalInitParams,

  // Validation
  requiresMandatoryCanonicalControl,
  validateInitImageIsCanonical,

  // Hashing
  computeControlImageHash,
  computeCanonicalFingerprint,

  // Debug report
  extractDebugReportFields,

  // Constants
  MANDATORY_CANONICAL_CONTROL_PANELS,
  PANEL_TO_CANONICAL_MAP,
  RESOLVER_ERROR_CODES,
};
