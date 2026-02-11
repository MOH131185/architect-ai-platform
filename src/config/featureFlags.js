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
  a1Only: true,

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
   * AI Floor Plan Layout Engine (EXPERIMENTAL)
   *
   * When enabled:
   * - After DNA generation, calls Qwen2.5-72B to generate room coordinates
   * - AI considers adjacency, circulation, daylight, UK building regs
   * - Coordinates injected into programRooms before BuildingModel
   * - BuildingModel detects pre-computed layout and skips strip-packing
   *
   * When disabled:
   * - Uses zone-based strip-packing algorithm in BuildingModel
   *
   * @type {boolean}
   * @default true
   */
  aiFloorPlanLayout: true,

  /**
   * Hybrid A1 Sheet Mode (EXPERIMENTAL)
   *
   * When enabled:
   * - Generates individual panels separately (floor plans, elevations, sections, 3D views)
   * - Composites panels into professional A1 presentation board
   * - Better control over each view's quality and consistency
   * - Allows panel-specific prompts and validation
   * - Generation time: ~2-3 minutes (14 panels × 6s + composition)
   * - Maintains strict DNA consistency with deterministic seed derivation
   *
   * When disabled (default):
   * - Uses multi-panel A1 generation (default pipeline)
   * - May produce wireframe or incomplete layouts
   *
   * @type {boolean}
   * @default true
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
   * - Uses standard multi-panel A1 generation
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
   * Default enabled to composite site snapshot onto generated A1 sheet
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
  // STRICT MODE FLAGS (Pipeline Hard Gates)
  // =========================================================================

  /**
   * Strict No-Fallback Mode
   *
   * When enabled:
   * - Floor plans, elevations, and sections MUST have geometry mask / init_image
   * - No text-to-image-only generation for technical panels
   * - Pipeline fails if control image is missing
   *
   * @type {boolean}
   * @default true
   */
  strictNoFallback: true,

  /**
   * Require Complete Geometry DNA
   *
   * When enabled:
   * - Blocks generation if geometry DNA is incomplete
   * - Enforces that all spatial data is resolved before rendering
   *
   * @type {boolean}
   * @default false
   */
  requireCompleteGeometryDNA: false,

  /**
   * Enhanced SVG Generators
   *
   * When enabled:
   * - Uses improved SVG generation for floor plans, elevations, sections
   * - Produces higher fidelity technical drawings
   *
   * @type {boolean}
   * @default true
   */
  enhancedSVGGenerators: true,

  /**
   * Program Compliance Gate (Hard)
   *
   * When enabled:
   * - ProgramSpacesLock is built from user input and enforced at 3 checkpoints
   * - Post-DNA, post-render, pre-compose validation
   * - Any violation blocks the pipeline
   *
   * @type {boolean}
   * @default true
   */
  programComplianceGate: true,

  /**
   * Drift Gate (Hard)
   *
   * When enabled:
   * - Pre-compose drift detection compares panels to CDS baseline
   * - Modify drift detection ensures volumetric stability across iterations
   *
   * @type {boolean}
   * @default true
   */
  driftGate: true,

  /**
   * CDS Required
   *
   * When enabled:
   * - Canonical Design State must be built before panel generation
   * - All panels carry CDS hash for traceability
   *
   * @type {boolean}
   * @default true
   */
  cdsRequired: true,

  /**
   * Allow Technical Fallback
   *
   * When disabled (default):
   * - No fallback to default/placeholder floor plans in strict mode
   * - Pipeline fails instead of generating ambiguous content
   *
   * @type {boolean}
   * @default false
   */
  allowTechnicalFallback: false,

  // =========================================================================
  // GENERATION HOT-PATH FLAGS (used by panelGenerationService / orchestrator)
  // =========================================================================

  /** Strict control image mode - enforce control images for all panels */
  strictControlImageMode: true,

  /** Use canonical baseline comparison during generation */
  useCanonicalBaseline: false,

  /** Enable geometry-controlled 3D generation */
  geometryControlled3D: false,

  /** Use Meshy.ai for 3D model generation */
  meshy3DMode: false,

  /** Generate debug reports for control image processing */
  enableControlImageDebugReport: false,

  /** Use OpenAI as primary DNA generator */
  useOpenAIDNA: false,

  /** Enable hybrid 3D pipeline */
  hybrid3DPipeline: false,

  /** Enable dual-track technical drawing generation */
  dualTrackTechnicalDrawings: false,

  /** Route reasoning through Claude */
  useClaudeReasoning: false,

  /** Enable v2 geometry DNA generation */
  geometryDNAv2: false,

  /** Enforce strict panel validation */
  strictPanelValidation: false,

  /** @type {'presentation'|'technical'} Panel output mode */
  outputMode: "presentation",

  /** Fail fast on first invalid panel */
  strictPanelFailFast: false,

  /** Auto-repair invalid panels */
  strictPanelAutoRepair: false,

  /** Enable automatic retry logic */
  enableAutoRetry: true,

  /** Force use of baseline control images */
  forceBaselineControl: false,

  /** Enforce deterministic 2D generation */
  strictDeterministic2D: false,

  /** Validate panel quality before composition */
  panelQualityValidation: true,

  /** Block pipeline when panel quality validation still fails after retry */
  panelQualityBlockOnFailure: true,

  /** Auto-retry failed panel generation */
  autoRetryFailedPanels: true,

  /** Gate for control image fidelity */
  controlFidelityGate: true,

  /** Fail-fast behavior in contract gate validation */
  contractGateFailFast: false,

  /** Use canonical control pack (enforce mode: build pack for every generation) */
  canonicalControlPack: true,

  /** Require canonical pack presence (enforce mode: block generation without pack) */
  requireCanonicalPack: true,

  /**
   * Geometry Authority Mandatory
   *
   * When enabled (enforce mode, DEFAULT):
   * - Canonical geometry pack is the mandatory authority for all panels
   * - All panels receive canonical SVG as init_image
   * - Composition requires identical geometry hash across all panels
   * - No panel may generate without geometry control
   *
   * When disabled (shadow mode):
   * - Canonical pack is built and used when available
   * - Pipeline falls back to hero-first flow if pack unavailable
   *
   * @type {boolean}
   * @default true
   */
  geometryAuthorityMandatory: true,

  /**
   * Three-Tier Panel Consistency
   *
   * When enabled:
   * - TIER 1 (floor plans, elevations, sections): Deterministic SVG from canonical pack — NO FLUX
   * - TIER 2 (hero_3d, axonometric): FLUX with 0.80-0.85 geometry lock
   * - TIER 3 (interior_3d, site_diagram): FLUX with DNA style constraints
   *
   * When disabled:
   * - All panels sent to FLUX as init_image (original behavior)
   *
   * @type {boolean}
   * @default true
   */
  threeTierPanelConsistency: true,

  /**
   * DNA Schema Version
   *
   * Controls which DNA normalization schema is used:
   * - 2: DNA v2 with room instance IDs, per-room hashes, dnaHash (default)
   * - 1: Legacy DNA v1 (no instance IDs or hashes)
   *
   * @type {number}
   * @default 2
   */
  dnaSchemaVersion: 2,

  /**
   * Area Tolerance for Program Compliance
   *
   * Maximum allowed deviation between geometry room area and locked space area.
   * 0.10 = 10% tolerance (default) — realistic for strip-packing geometry.
   *
   * @type {number}
   * @default 0.10
   */
  areaTolerance: 0.1,

  /**
   * Program Lock Required
   *
   * When enabled, every generation run MUST build a ProgramSpacesLock
   * from user input before panel generation. Fail-closed if missing.
   *
   * @type {boolean}
   * @default true
   */
  programLockRequired: true,

  /**
   * Max Program Violations (0 = strict)
   *
   * Maximum number of program compliance violations tolerated before
   * blocking the pipeline. Allows minor circulation/service space mismatches
   * (corridors, stairwells) to pass while catching major room failures.
   *
   * @type {number}
   * @default 2
   */
  maxProgramViolations: 2,

  /**
   * Max Level Mismatch (0 = strict)
   *
   * Maximum number of level mismatches tolerated (e.g. first-floor rooms
   * appearing on ground floor) before blocking. 0 means zero tolerance.
   *
   * @type {number}
   * @default 0
   */
  maxLevelMismatch: 0,

  /**
   * Drift Threshold (0.00 - 1.00)
   *
   * Maximum drift score before the DriftGate blocks a panel or modify run.
   * Lower = stricter. 0.10 = 10% drift tolerance.
   *
   * @type {number}
   * @default 0.10
   */
  driftThreshold: 0.1,

  /** Strict canonical control mode enforcement */
  strictCanonicalControlMode: false,

  /** Strict geometry pack requirements */
  strictCanonicalGeometryPack: true,

  /** Enforce room area/count fidelity against built geometry */
  programGeometryFidelityGate: true,

  /** Require env-defined primary model keys for routed tasks */
  strictEnvModelRouting: false,

  /** @type {number} Max validation passes before stopping */
  maxValidationPasses: 3,

  /** Save control pack to debug */
  saveControlPackToDebug: false,

  /** @type {number} Max retries for contract gate validation */
  contractGateMaxRetries: 2,

  /** @type {Object|null} Control image strength bands per panel type */
  controlStrengthBands: null,

  /** @type {Object|null} Control image strength multipliers per panel type */
  controlStrengthMultipliers: null,

  /** @type {number} Max retries for control image generation */
  maxControlImageRetries: 2,

  /** @type {Array|null} Priority order for control image sources */
  controlImageSourcePriority: null,

  // =========================================================================
  // NON-HOT-PATH FLAGS (optional services, export gates)
  // =========================================================================

  /** A1 programmatic composer */
  a1ProgrammaticComposer: false,

  /** AI stylization rendering */
  aiStylization: false,

  /** OpenAI image styler */
  openaiStyler: false,

  /** Vector panel generation */
  vectorPanelGeneration: false,

  /** Conditioned image pipeline */
  conditionedImagePipeline: false,

  /** Facade generation layer */
  facadeGenerationLayer: false,

  /** Block export on consistency failure */
  blockExportOnConsistencyFailure: false,

  /** Cross-view consistency gate */
  crossViewConsistencyGate: false,

  /** Semantic vision validation */
  semanticVisionValidation: false,

  /** Edge-based consistency gate */
  edgeBasedConsistencyGate: false,

  /** Enforce 3D canonical control */
  enforce3DCanonicalControl: false,

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

  FEATURE_FLAGS.a1Only = true;
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
  FEATURE_FLAGS.aiFloorPlanLayout = true;
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
  // Strict mode defaults
  FEATURE_FLAGS.strictNoFallback = true;
  FEATURE_FLAGS.requireCompleteGeometryDNA = false;
  FEATURE_FLAGS.enhancedSVGGenerators = true;
  FEATURE_FLAGS.programComplianceGate = true;
  FEATURE_FLAGS.driftGate = true;
  FEATURE_FLAGS.cdsRequired = true;
  FEATURE_FLAGS.allowTechnicalFallback = false;
  // QA / Review systems defaults
  FEATURE_FLAGS.qaGates = false;
  FEATURE_FLAGS.opusSheetCritic = false;
  FEATURE_FLAGS.opusPanelValidator = false;
  // Hot-path panel generation defaults
  FEATURE_FLAGS.strictControlImageMode = true;
  FEATURE_FLAGS.useCanonicalBaseline = false;
  FEATURE_FLAGS.outputMode = "presentation";
  FEATURE_FLAGS.strictPanelValidation = false;
  FEATURE_FLAGS.strictPanelFailFast = false;
  FEATURE_FLAGS.strictPanelAutoRepair = false;
  FEATURE_FLAGS.enableAutoRetry = true;
  FEATURE_FLAGS.autoRetryFailedPanels = true;
  FEATURE_FLAGS.forceBaselineControl = false;
  FEATURE_FLAGS.strictDeterministic2D = false;
  FEATURE_FLAGS.panelQualityValidation = true;
  FEATURE_FLAGS.panelQualityBlockOnFailure = true;
  FEATURE_FLAGS.controlFidelityGate = true;
  FEATURE_FLAGS.contractGateFailFast = false;
  FEATURE_FLAGS.canonicalControlPack = true;
  FEATURE_FLAGS.requireCanonicalPack = true;
  FEATURE_FLAGS.geometryAuthorityMandatory = true;
  FEATURE_FLAGS.dnaSchemaVersion = 2;
  FEATURE_FLAGS.areaTolerance = 0.1; // 10% — realistic for strip-packing geometry
  FEATURE_FLAGS.strictCanonicalControlMode = false;
  FEATURE_FLAGS.strictCanonicalGeometryPack = true;
  FEATURE_FLAGS.programGeometryFidelityGate = true;
  FEATURE_FLAGS.strictEnvModelRouting = false;
  FEATURE_FLAGS.maxValidationPasses = 3;
  FEATURE_FLAGS.saveControlPackToDebug = false;
  FEATURE_FLAGS.contractGateMaxRetries = 2;
  FEATURE_FLAGS.controlStrengthBands = null;
  FEATURE_FLAGS.controlStrengthMultipliers = null;
  FEATURE_FLAGS.maxControlImageRetries = 2;
  FEATURE_FLAGS.controlImageSourcePriority = null;
  // Optional services / export gates
  FEATURE_FLAGS.a1ProgrammaticComposer = false;
  FEATURE_FLAGS.aiStylization = false;
  FEATURE_FLAGS.openaiStyler = false;
  FEATURE_FLAGS.vectorPanelGeneration = false;
  FEATURE_FLAGS.conditionedImagePipeline = false;
  FEATURE_FLAGS.facadeGenerationLayer = false;
  FEATURE_FLAGS.blockExportOnConsistencyFailure = false;
  FEATURE_FLAGS.crossViewConsistencyGate = false;
  FEATURE_FLAGS.semanticVisionValidation = false;
  FEATURE_FLAGS.edgeBasedConsistencyGate = false;
  FEATURE_FLAGS.enforce3DCanonicalControl = false;
  // Experimental modes
  FEATURE_FLAGS.useVercelAIGateway = false;
  FEATURE_FLAGS.geometryControlled3D = false;
  FEATURE_FLAGS.meshy3DMode = false;
  FEATURE_FLAGS.enableControlImageDebugReport = false;
  FEATURE_FLAGS.useOpenAIDNA = false;
  FEATURE_FLAGS.hybrid3DPipeline = false;
  FEATURE_FLAGS.dualTrackTechnicalDrawings = false;
  FEATURE_FLAGS.useClaudeReasoning = false;
  FEATURE_FLAGS.geometryDNAv2 = false;

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

/**
 * Load P0 gate flags from environment variables (ARCHIAI_*).
 * Runs once at module init. Env vars override compile-time defaults.
 */
function loadP0EnvOverrides() {
  const env = typeof process !== "undefined" && process.env ? process.env : {};

  const envMap = {
    ARCHIAI_CDS_REQUIRED: { flag: "cdsRequired", parse: (v) => v === "true" },
    ARCHIAI_PROGRAM_GATE_MODE: {
      flag: "programComplianceGate",
      parse: (v) => v === "hard",
    },
    ARCHIAI_DRIFT_GATE_MODE: { flag: "driftGate", parse: (v) => v === "hard" },
    ARCHIAI_ALLOW_TECHNICAL_FALLBACK: {
      flag: "allowTechnicalFallback",
      parse: (v) => v === "true",
    },
    ARCHIAI_REQUIRE_GEOMETRY_MASK: {
      flag: "strictGeometryMaskGate",
      parse: (v) => v === "true",
    },
    ARCHIAI_GEOMETRY_AUTHORITY_MODE: {
      flag: null, // compound: sets multiple flags
      parse: (v) => v, // raw string
      apply: (v) => {
        if (v === "shadow") {
          // Shadow mode: build pack but don't require it (opt-in only)
          FEATURE_FLAGS.geometryAuthorityMandatory = false;
          FEATURE_FLAGS.canonicalControlPack = true;
          FEATURE_FLAGS.requireCanonicalPack = false;
        } else {
          // Default and "enforce": geometry authority is mandatory
          FEATURE_FLAGS.geometryAuthorityMandatory = true;
          FEATURE_FLAGS.canonicalControlPack = true;
          FEATURE_FLAGS.requireCanonicalPack = true;
        }
      },
    },
    ARCHIAI_DNA_SCHEMA_VERSION: {
      flag: "dnaSchemaVersion",
      parse: (v) => parseInt(v, 10) || 2,
    },
    ARCHIAI_PROGRAM_LOCK_REQUIRED: {
      flag: "programLockRequired",
      parse: (v) => v === "true",
    },
    ARCHIAI_MAX_PROGRAM_VIOLATIONS: {
      flag: "maxProgramViolations",
      parse: (v) => parseInt(v, 10) || 0,
    },
    ARCHIAI_MAX_LEVEL_MISMATCH: {
      flag: "maxLevelMismatch",
      parse: (v) => parseInt(v, 10) || 0,
    },
    ARCHIAI_DRIFT_THRESHOLD: {
      flag: "driftThreshold",
      parse: (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.1;
      },
    },
    ARCHIAI_PROGRAM_GEOMETRY_FIDELITY: {
      flag: "programGeometryFidelityGate",
      parse: (v) => v === "true",
    },
    ARCHIAI_STRICT_MODEL_ROUTING: {
      flag: "strictEnvModelRouting",
      parse: (v) => v === "true",
    },
  };

  // Also support REACT_APP_ prefix for CRA browser builds
  const applied = [];
  for (const [envKey, entry] of Object.entries(envMap)) {
    const raw = env[envKey] ?? env[`REACT_APP_${envKey}`];
    if (raw !== undefined && raw !== "") {
      if (entry.apply) {
        // Compound env var that sets multiple flags
        entry.apply(raw);
        applied.push(`${envKey}=${raw} (compound)`);
      } else if (entry.flag) {
        FEATURE_FLAGS[entry.flag] = entry.parse(raw);
        applied.push(
          `${entry.flag}=${FEATURE_FLAGS[entry.flag]} (from ${envKey})`,
        );
      }
    }
  }

  if (applied.length > 0) {
    logger.info("P0 env overrides applied: " + applied.join(", "));
  }
}

// Auto-load on module import: env first, then sessionStorage overrides
loadP0EnvOverrides();
if (HAS_SESSION_STORAGE) loadFeatureFlagsFromStorage();

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
