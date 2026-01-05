/**
 * Feature Flags for Architect AI Platform
 *
 * Controls experimental and progressive features
 */

import logger from "../utils/logger.js";

export const FEATURE_FLAGS = {
  /**
   * A1-Only Output Mode (DEFAULT)
   *
   * When enabled (default):
   * - A1 sheet is the ONLY output format
   * - Single comprehensive A1 sheet with all views embedded
   * - Style/climate/portfolio blended automatically
   * - Consistency: 98%+
   * - 13-view mode completely removed
   *
   * @type {boolean}
   * @default true
   */
  a1Only: false,

  /**
   * Geometry-First Pipeline (OPTIONAL)
   *
   * When enabled:
   * - Uses spatial layout algorithm for 99.5%+ dimensional accuracy
   * - 3D geometry generation before rendering
   * - Final output is still A1 sheet (no 13-view mode)
   *
   * @type {boolean}
   * @default false
   */
  geometryFirst: false,

  /**
   * Geometry Volume Agent (EXPERIMENTAL)
   *
   * When enabled:
   * - Runs geometry/volume DNA reasoning
   * - Persists geometry baselines and renders
   * - Threads geometry into panel prompts (future steps)
   */
  geometryVolumeFirst: false,

  /**
   * Hybrid A1 Sheet Mode (EXPERIMENTAL)
   *
   * When enabled:
   * - Generates individual panels separately (floor plans, elevations, sections, 3D views)
   * - Composites panels into professional A1 presentation board
   * - Better control over each view's quality and consistency
   * - Allows panel-specific prompts and validation
   * - Generation time: ~2-3 minutes (vs ~60 seconds for single-shot)
   * - Maintains strict DNA consistency with deterministic seed derivation
   *
   * When disabled (default):
   * - Uses single-shot A1 generation (faster but less control)
   * - May produce wireframe or incomplete layouts
   *
   * @type {boolean}
   * @default false (Enable via setFeatureFlag('hybridA1Mode', true))
   */
  hybridA1Mode: true,

  /**
   * Multi-Panel A1 Generation (NEW)
   *
   * When enabled:
   * - Generates 14 individual panels with specialized prompts
   * - Uses hash-derived seeds from DNA for reproducibility
   * - Server-side sharp composition into complete A1 sheet
   * - Panel-specific drift detection and validation
   * - Baseline artifact storage for modifications
   * - Generation time: ~90-100 seconds (14 panels × 6s + composition)
   * - API cost: ~$0.17-$0.24 per sheet
   *
   * When disabled:
   * - Uses existing single-shot A1 generation
   *
   * @type {boolean}
   * @default true (Enable for dev testing)
   */
  multiPanelA1: true,

  /**
   * Minimum interval between Together.ai image generation requests (ms)
   *
   * Default: 9000ms (9 seconds) to avoid rate limiting
   * Can be increased if experiencing 429 errors
   *
   * @type {number}
   * @default 9000
   */
  togetherImageMinIntervalMs: 9000,

  /**
   * Cooldown delay between panel batches (ms)
   *
   * Default: 30000ms (30 seconds) to give API breathing room
   *
   * @type {number}
   * @default 30000
   */
  togetherBatchCooldownMs: 30000,

  /**
   * Whether to respect Retry-After headers from Together.ai API
   *
   * When enabled, automatically waits for the duration specified in Retry-After header
   * before retrying rate-limited requests
   *
   * @type {boolean}
   * @default true
   */
  respectRetryAfter: true,

  /**
   * FLUX model to use for A1 sheet generation
   *
   * Options:
   * - 'black-forest-labs/FLUX.1-dev' - High-quality model with img2img support (default)
   * - 'black-forest-labs/FLUX.1-kontext-max' - Best for comprehensive architectural sheets (opt-in)
   * - 'black-forest-labs/FLUX.1-schnell' - Faster generation (lower quality)
   *
   * @type {string}
   * @default 'black-forest-labs/FLUX.1-dev'
   */
  fluxImageModel: "black-forest-labs/FLUX.1-dev",

  /**
   * A1 sheet orientation
   *
   * - 'portrait' - Vertical orientation (594×841mm)
   * - 'landscape' - Horizontal orientation (841×594mm, default for Hybrid A1)
   *
   * @type {string}
   * @default 'landscape'
   */
  a1Orientation: "landscape",
  /**
   * Overlay captured site snapshot onto A1 sheet image
   * Default disabled to rely on AI-generated site panel only
   */
  overlaySiteSnapshotOnA1: true,

  /**
   * Composite site snapshot during A1 modify flow
   * Default disabled to avoid duplicate/overlapping site panels
   */
  compositeSiteSnapshotOnModify: false,

  /**
   * Use FLUX.1-kontext-max for A1 sheet generation
   * Requires Build Tier 2+ on Together.ai
   *
   * @type {boolean}
   * @default false
   */
  useFluxKontextForA1: false,

  /**
   * Use ModelRouter for all LLM/image calls
   * Enables env-driven model selection (GPT-5, Claude, Together)
   *
   * @type {boolean}
   * @default true
   */
  useModelRouter: true,

  /**
   * Show consistency warnings in UI before exports
   * Validates DNA, geometry, views, and A1 sheet structure
   *
   * @type {boolean}
   * @default true
   */
  showConsistencyWarnings: true,

  /**
   * Two-Pass DNA Generation (STRICT MODE)
   *
   * When enabled (default):
   * - Uses Qwen2.5-72B in two passes (Author + Reviewer)
   * - Pass A: Generate structured JSON DNA
   * - Pass B: Validate and repair DNA
   * - NO fallback DNA - errors are surfaced to user
   * - Enforces strict schema with site, program, style, geometry_rules
   * - Deterministic repair for missing fields
   *
   * When disabled:
   * - Uses legacy DNA generator with fallback DNA
   *
   * @type {boolean}
   * @default true
   */
  twoPassDNA: true,

  /**
   * Geometry Volume First (3D MASSING AGENT)
   *
   * When enabled:
   * - Pass C: Generate 3D volume specification after DNA
   * - Uses Qwen2.5-72B to reason about building massing
   * - Generates neutral geometry renders (elevations, axonometric, perspective)
   * - FLUX/SDXL use geometry renders as control images
   * - Ensures single coherent project (no mixed roof types)
   * - Modify workflow preserves 3D volume for appearance changes
   *
   * When disabled (default):
   * - Skips geometry reasoning and renders
   * - FLUX/SDXL generate from prompts only
   *
   * @type {boolean}
   * @default false
   *
   * NOTE: This flag is defined above at line 46. Do not duplicate.
   */
  // geometryVolumeFirst: false // ❌ REMOVED - Duplicate of line 46
};

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flagName) {
  if (!(flagName in FEATURE_FLAGS)) {
    logger.warn("Unknown feature flag: " + flagName);
    return false;
  }
  return FEATURE_FLAGS[flagName] === true;
}

/**
 * Set a feature flag value (for testing/admin)
 */
export function setFeatureFlag(flagName, value) {
  if (!(flagName in FEATURE_FLAGS)) {
    logger.warn("Unknown feature flag: " + flagName);
    return;
  }

  const oldValue = FEATURE_FLAGS[flagName];
  FEATURE_FLAGS[flagName] = value;

  logger.debug("Feature flag updated: " + flagName, {
    from: oldValue,
    to: value,
  });

  // Persist to sessionStorage for current session
  try {
    const flags = JSON.parse(sessionStorage.getItem("featureFlags") || "{}");
    flags[flagName] = value;
    sessionStorage.setItem("featureFlags", JSON.stringify(flags));
  } catch (error) {
    logger.error("Failed to persist feature flag", { error, flagName });
  }
}

/**
 * Get a feature flag value (for non-boolean flags)
 */
export function getFeatureValue(flagName) {
  if (!(flagName in FEATURE_FLAGS)) {
    logger.warn("Unknown feature flag: " + flagName);
    return undefined;
  }
  return FEATURE_FLAGS[flagName];
}

/**
 * Get all feature flags and their current values
 */
export function getAllFeatureFlags() {
  return { ...FEATURE_FLAGS };
}

/**
 * Reset all feature flags to defaults
 */
export function resetFeatureFlags() {
  try {
    sessionStorage.removeItem("featureFlags");
  } catch (error) {
    logger.error("Failed to clear feature flags", { error });
  }

  FEATURE_FLAGS.a1Only = false;
  FEATURE_FLAGS.geometryFirst = false;
  FEATURE_FLAGS.hybridA1Mode = true;
  FEATURE_FLAGS.multiPanelA1 = true;
  FEATURE_FLAGS.togetherImageMinIntervalMs = 9000;
  FEATURE_FLAGS.togetherBatchCooldownMs = 30000;
  FEATURE_FLAGS.respectRetryAfter = true;
  FEATURE_FLAGS.fluxImageModel = "black-forest-labs/FLUX.1-dev";
  FEATURE_FLAGS.a1Orientation = "landscape";
  FEATURE_FLAGS.overlaySiteSnapshotOnA1 = true;
  FEATURE_FLAGS.compositeSiteSnapshotOnModify = false;
  FEATURE_FLAGS.useFluxKontextForA1 = false;
  FEATURE_FLAGS.useModelRouter = true;
  FEATURE_FLAGS.showConsistencyWarnings = true;
  FEATURE_FLAGS.twoPassDNA = true;
  FEATURE_FLAGS.geometryVolumeFirst = false;

  logger.info(
    "Feature flags reset to defaults (ModelRouter enabled, consistency warnings enabled, two-pass DNA enabled, geometry volume disabled)",
  );
}

/**
 * Load feature flags from sessionStorage (if overridden)
 */
export function loadFeatureFlagsFromStorage() {
  try {
    const stored = sessionStorage.getItem("featureFlags");
    if (stored) {
      const flags = JSON.parse(stored);
      Object.keys(flags).forEach((key) => {
        if (key in FEATURE_FLAGS) {
          FEATURE_FLAGS[key] = flags[key];
        }
      });
      logger.debug("Feature flags loaded from storage", flags);
    }
  } catch (error) {
    logger.error("Failed to load feature flags", { error });
  }
}

// Auto-load on module import
loadFeatureFlagsFromStorage();
FEATURE_FLAGS.multiPanelA1 = true;
FEATURE_FLAGS.a1Only = false;

/**
 * Development helper: Log current feature flag status
 */
export function logFeatureFlags() {
  logger.group("Feature Flags Status");
  Object.entries(FEATURE_FLAGS).forEach(([key, value]) => {
    const icon = value ? "[ON]" : "[OFF]";
    logger.debug(icon + " " + key + ": " + value);
  });
  logger.groupEnd();
}

// Log feature flags in development mode
if (process.env.NODE_ENV === "development") {
  logger.info("Feature Flags initialized");
  logger.debug("   a1Only: " + FEATURE_FLAGS.a1Only);
  logger.debug("   geometryFirst: " + FEATURE_FLAGS.geometryFirst);
  logger.debug(
    "   hybridA1Mode: " +
      FEATURE_FLAGS.hybridA1Mode +
      " ← Enable for panel-based generation",
  );
  logger.debug(
    "   fluxImageModel: " +
      FEATURE_FLAGS.fluxImageModel +
      " ← FLUX.1-dev for A1 sheets (img2img compatible)",
  );
  logger.debug(
    "   a1Orientation: " +
      FEATURE_FLAGS.a1Orientation +
      " ← Landscape by default (Hybrid A1)",
  );
  logger.debug(
    "   togetherImageMinIntervalMs: " +
      FEATURE_FLAGS.togetherImageMinIntervalMs +
      " ms",
  );
  logger.debug(
    "   togetherBatchCooldownMs: " +
      FEATURE_FLAGS.togetherBatchCooldownMs +
      " ms",
  );
  logger.debug("   respectRetryAfter: " + FEATURE_FLAGS.respectRetryAfter);
  logger.debug("   Use setFeatureFlag() to override");
}

export default FEATURE_FLAGS;

// CommonJS compatibility for Node.js testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FEATURE_FLAGS,
    isFeatureEnabled,
    setFeatureFlag,
    getFeatureValue,
    getAllFeatureFlags,
    resetFeatureFlags,
    loadFeatureFlagsFromStorage,
    logFeatureFlags,
  };
}
