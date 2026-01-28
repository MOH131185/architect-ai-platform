/**
 * Feature Flags for Architect AI Platform
 *
 * Controls experimental and progressive features
 */

import logger from "../utils/logger.js";

const HAS_SESSION_STORAGE =
  typeof sessionStorage !== "undefined" && sessionStorage !== null;

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
   * Use Vercel AI Gateway for AI calls
   *
   * When enabled:
   * - Routes chat/reasoning requests through Vercel AI Gateway
   * - Routes image generation through AI Gateway (BFL FLUX models)
   * - Requires AI_GATEWAY_API_KEY environment variable
   * - Model mapping: Qwen → alibaba/qwen3-*, FLUX → bfl/flux-*
   *
   * When disabled (default):
   * - Uses Together.ai directly for all AI calls
   *
   * Benefits of AI Gateway:
   * - Unified billing through Vercel
   * - Model fallback/routing support
   * - No separate Together.ai account needed
   *
   * @type {boolean}
   * @default false
   */
  useVercelAIGateway: false,

  /**
   * Show consistency warnings in UI before exports
   * Validates DNA, geometry, views, and A1 sheet structure
   *
   * @type {boolean}
   * @default true
   */
  showConsistencyWarnings: true,

  /**
   * Show Geometry Debug Viewer (DEV)
   *
   * When enabled:
   * - Shows geometry debug viewer in results UI
   *
   * @type {boolean}
   * @default false
   */
  showGeometryDebugViewer: false,

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
   * Strict Preflight Gate (Panel Planning)
   *
   * When enabled:
   * - Runs a strict preflight validation gate before planning panels
   * - Blocks generation if DNA/program is invalid
   *
   * @type {boolean}
   * @default true
   */
  strictPreflightGate: true,

  /**
   * Strict Geometry Mask Gate (Floor Plan Generation)
   *
   * When enabled:
   * - Throws error if floor_plan_* panel has useGeometryMask=true but no init_image
   * - Prevents silent fallback to AI-invented floor plans
   * - Ensures 100% floor plan consistency via ProceduralGeometryService
   *
   * When disabled:
   * - Falls back to AI-generated floor plans if geometry mask is missing
   * - May result in inconsistent wall placements and room layouts
   *
   * @type {boolean}
   * @default true
   */
  strictGeometryMaskGate: true,

  /**
   * Save Geometry Mask Debug Artifacts
   *
   * When enabled:
   * - Saves SVG, PNG, and metadata JSON per floor to debug folder
   * - Uses designFingerprint for folder isolation
   * - Useful for debugging geometry mask generation issues
   *
   * Debug artifacts saved:
   * - `geometry_mask_floor_0.svg` - Raw SVG string
   * - `geometry_mask_floor_0.png` - Rasterized PNG (if rasterization available)
   * - `geometry_mask_metadata.json` - Per-floor metadata (rooms, doors, circulation)
   *
   * @type {boolean}
   * @default false
   */
  saveGeometryMaskDebug: false,

  /**
   * Strict Canonical Design State Requirement (CDS)
   *
   * When enabled:
   * - Requires a complete CanonicalDesignState (geometry-first pipeline)
   * - Blocks generation if CDS is missing/incomplete
   *
   * @type {boolean}
   * @default false
   */
  strictCanonicalDesignState: false,

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

  // =========================================================================  
  // DESIGN FINGERPRINT SYSTEM - Cross-Panel Consistency Enforcement
  // =========================================================================  

  /**
   * Extract Design Fingerprint from hero_3d
   *
   * When enabled:
   * - After hero_3d generates, extracts visual fingerprint (massing, roof, materials)
   * - Fingerprint is injected into ALL subsequent panel prompts
   * - Ensures all panels show THE SAME building
   * - Prevents visual drift between 3D renders, elevations, and floor plans
   *
   * When disabled:
   * - Panels generated independently with only DNA constraints
   * - May result in inconsistent designs across panels
   *
   * @type {boolean}
   * @default true
   */
  extractDesignFingerprint: true,

  /**
   * Use hero_3d as img2img control for subsequent panels
   *
   * When enabled:
   * - Interior 3D, axonometric, and elevation panels use hero_3d as init_image
   * - Applies control strength based on panel type
   * - Forces visual consistency with hero render
   *
   * Panel-specific control strength:
   * - axonometric: 0.70 (high - must match massing)
   * - interior_3d: 0.55 (medium - allow interior variation)
   * - elevation_*: 0.60 (medium-high - facade must match)
   *
   * @type {boolean}
   * @default true
   */
  useHeroAsControl: true,

  /**
   * Strict Fingerprint Validation Gate
   *
   * When enabled:
   * - Pre-composition validation compares all panels to hero fingerprint
   * - Blocks A1 composition if panels deviate beyond threshold
   * - Automatically retries failed panels with stronger control
   * - Aborts if critical panels (hero, axonometric, north elevation) fail
   *
   * When disabled:
   * - All panels accepted regardless of consistency
   *
   * @type {boolean}
   * @default true
   */
  strictFingerprintGate: true,

  /**
   * Minimum match score for fingerprint validation (0-1)
   *
   * Panels with match score below this threshold will:
   * - Be flagged for retry
   * - Block composition if strictFingerprintGate is enabled
   *
   * Recommended values:
   * - 0.85: Balanced (default) - catches major deviations
   * - 0.90: Strict - requires close visual match
   * - 0.75: Lenient - allows more variation
   *
   * @type {number}
   * @default 0.85
   */
  fingerprintMatchThreshold: 0.85,

  /**
   * Maximum retries for mismatched panels
   *
   * When a panel fails fingerprint validation:
   * - Retry up to this many times with progressively stronger control
   * - Control strength increases by 0.10 each retry
   * - If all retries fail, action depends on panel criticality
   *
   * @type {number}
   * @default 2
   */
  maxFingerprintRetries: 2,

  /**
   * Hero control strength per panel type
   *
   * When useHeroAsControl is enabled, these values determine
   * how strongly each panel type adheres to the hero_3d image.
   *
   * Higher values = more visual similarity to hero
   * Lower values = more prompt adherence (panel-specific content)
   *
   * @type {Object}
   */
  heroControlStrength: {
    interior_3d: 0.55,
    axonometric: 0.7,
    elevation_north: 0.6,
    elevation_south: 0.6,
    elevation_east: 0.6,
    elevation_west: 0.6,
  },

  // =========================================================================  
  // QA / REVIEW SYSTEMS (Opt-in)
  // =========================================================================  

  /**
   * QA Gates (Automated)
   *
   * When enabled:
   * - Runs automated QA gates on panels/sheets (contrast, duplicates, sizing)
   *
   * @type {boolean}
   * @default false
   */
  qaGates: false,

  /**
   * Opus Sheet Critic (AI-Powered)
   *
   * When enabled:
   * - Uses Claude Opus 4.5 to critique composed A1 sheets
   * - Requires network access and valid API route
   *
   * @type {boolean}
   * @default false
   */
  opusSheetCritic: false,

  /**
   * Opus Panel Validator (AI-Powered)
   *
   * When enabled:
   * - Uses Claude Opus 4.5 to validate individual panels (type correctness, drift)
   * - Requires network access and valid API route
   *
   * @type {boolean}
   * @default false
   */
  opusPanelValidator: false,
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

  if (HAS_SESSION_STORAGE) {
    // Persist to sessionStorage for current session
    try {
      const flags = JSON.parse(sessionStorage.getItem("featureFlags") || "{}");
      flags[flagName] = value;
      sessionStorage.setItem("featureFlags", JSON.stringify(flags));
    } catch (error) {
      logger.error("Failed to persist feature flag", { error, flagName });
    }
  }
}

/**
 * Get all feature flags and their current values
 */
export function getAllFeatureFlags() {
  return { ...FEATURE_FLAGS };
}

/**
 * Get a specific feature flag value
 */
export function getFeatureValue(flagName) {
  if (!(flagName in FEATURE_FLAGS)) {
    logger.warn("Unknown feature flag: " + flagName);
    return undefined;
  }
  return FEATURE_FLAGS[flagName];
}

/**
 * Reset all feature flags to defaults
 */
export function resetFeatureFlags() {
  if (HAS_SESSION_STORAGE) {
    try {
      sessionStorage.removeItem("featureFlags");
    } catch (error) {
      logger.error("Failed to clear feature flags", { error });
    }
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
  FEATURE_FLAGS.showGeometryDebugViewer = false;
  FEATURE_FLAGS.twoPassDNA = true;
  FEATURE_FLAGS.strictPreflightGate = true;
  FEATURE_FLAGS.strictGeometryMaskGate = true;
  FEATURE_FLAGS.saveGeometryMaskDebug = false;
  FEATURE_FLAGS.strictCanonicalDesignState = false;
  FEATURE_FLAGS.geometryVolumeFirst = false;
  // Design Fingerprint System defaults
  FEATURE_FLAGS.extractDesignFingerprint = true;
  FEATURE_FLAGS.useHeroAsControl = true;
  FEATURE_FLAGS.strictFingerprintGate = true;
  FEATURE_FLAGS.fingerprintMatchThreshold = 0.85;
  FEATURE_FLAGS.maxFingerprintRetries = 2;
  FEATURE_FLAGS.heroControlStrength = {
    interior_3d: 0.55,
    axonometric: 0.7,
    elevation_north: 0.6,
    elevation_south: 0.6,
    elevation_east: 0.6,
    elevation_west: 0.6,
  };
  // QA / Review systems defaults
  FEATURE_FLAGS.qaGates = false;
  FEATURE_FLAGS.opusSheetCritic = false;
  FEATURE_FLAGS.opusPanelValidator = false;

  logger.info(
    "Feature flags reset to defaults (ModelRouter enabled, fingerprint system enabled, two-pass DNA enabled)",
  );
}

/**
 * Load feature flags from sessionStorage (if overridden)
 */
export function loadFeatureFlagsFromStorage() {
  if (!HAS_SESSION_STORAGE) return;

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
if (HAS_SESSION_STORAGE) loadFeatureFlagsFromStorage();
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
    getAllFeatureFlags,
    resetFeatureFlags,
    loadFeatureFlagsFromStorage,
    logFeatureFlags,
  };
}
