/**
 * QA Services - Image Quality Assurance
 *
 * Provides real image metrics comparison for cross-view consistency validation.
 *
 * @module services/qa
 */

// Image Metrics Service - Core metric computation
export {
  // Image loading
  loadImage,
  normalizeImages,
  toGrayscale,

  // Individual metrics
  computePHash,
  hammingDistance,
  computeSSIM,
  computePixelDiff,

  // Combined
  computeAllMetrics,

  // QA evaluation
  getThresholds,
  evaluateQA,
  comparePanel,
  comparePanels,
  formatQATable,

  // Constants
  METRIC_THRESHOLDS,
  COMPARE_SIZE,

  // Default export
  default as ImageMetricsService,
} from './ImageMetricsService.js';

// Panel QA Runner - Orchestration
export {
  runPanelQA,
  validateHeroInterior,
  validateTechnicalPanels,
  quickQACheck,
  getQAThresholds,

  // Default export
  default as PanelQARunner,
} from './PanelQARunner.js';

// Blank Panel Detector - Detect blank/empty technical drawings
export {
  detectBlank,
  shouldCheckBlankness,
  validatePanelBlankness,
  validatePanelBatchBlankness,
  formatBlankTable,
  BLANK_THRESHOLD,
  WHITE_PIXEL_THRESHOLD,
  BLANK_CHECK_CATEGORIES,

  // Default export
  default as BlankPanelDetector,
} from './BlankPanelDetector.js';

// Strict Control Enforcer - Mandatory canonical control images
export {
  // Mode checking
  isStrictModeEnabled,
  requiresControlImage,
  shouldUseDeterministicFallback,

  // Control pack validation
  validateControlPack,
  assertControlPackValid,

  // Panel generation
  requireControlImage as getRequiredControlImage,
  buildImg2ImgParams,

  // Blank handling
  validateAndHandleBlank,
  createDeterministicGenerator,

  // Constants
  REQUIRED_CONTROL_PANELS,
  DETERMINISTIC_FALLBACK_PANELS,
  ERROR_CODES,

  // Default export
  default as StrictControlEnforcer,
} from './StrictControlEnforcer.js';

// ============================================================================
// Panel↔Canonical QA System (NEW)
// Validates AI-generated panels against canonical control images
// ============================================================================

// Panel↔Canonical QA Service - SSIM/pHash/diffRatio validation
export {
  validatePanelAgainstCanonical,
  batchValidatePanels,
  formatForDebugReport as formatPanelQAForDebugReport,
  hasCanonicalValidation,
  getRequiredQAPanels,
  PANEL_CANONICAL_THRESHOLDS,

  // Default export
  default as PanelCanonicalQAService,
} from './PanelCanonicalQAService.js';

// Geometry Signature Validator - Vector-native panel validation
export {
  extractSignatureFromModel,
  extractSignatureFromDNA,
  extractSignatureFromMetadata,
  compareSignatures,
  validateGeometrySignature,
  batchValidateGeometrySignatures,
  formatGeometryValidationForReport,
  SIGNATURE_TOLERANCES,

  // Default export
  default as GeometrySignatureValidator,
} from './GeometrySignatureValidator.js';

// A1 Export Gate - Blocks export on QA failure
export {
  validateForExport,
  canExportQuickCheck,
  getExportStatusMessage,
  createGatedExport,
  suggestRetryStrategy,
  DEFAULT_EXPORT_GATE_CONFIG,

  // Default export
  default as A1ExportGate,
} from './A1ExportGate.js';

// ============================================================================
// Panel Validation Gate (NEW - Phase 5)
// Unified fail-fast validation with blank/duplicate detection
// ============================================================================

export {
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

  // Default export
  default as PanelValidationGate,
} from './PanelValidationGate.js';
