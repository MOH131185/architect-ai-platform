/**
 * Feature Flags for Architect AI Platform
 *
 * Controls experimental and progressive features
 */

import logger from "../utils/logger.js";

const HAS_SESSION_STORAGE =
  typeof sessionStorage !== "undefined" && sessionStorage !== null;

const FEATURE_FLAG_GROUPS = [
  ["useFloorplanEngine", "useFloorplanGenerator"],
  ["useModelRegistryRouter", "modelRegistry"],
];

function resolveFeatureFlagGroup(flagName) {
  return (
    FEATURE_FLAG_GROUPS.find((entry) => entry.includes(flagName)) || [flagName]
  );
}

function syncFeatureFlagGroup(flagName) {
  const group = resolveFeatureFlagGroup(flagName);
  if (!group) return;

  const resolvedValue = group
    .map((entry) => FEATURE_FLAGS[entry])
    .find((value) => typeof value === "boolean");

  if (typeof resolvedValue !== "boolean") return;
  group.forEach((entry) => {
    FEATURE_FLAGS[entry] = resolvedValue;
  });
}

function syncAllFeatureFlagGroups() {
  FEATURE_FLAG_GROUPS.forEach((group) => {
    const resolvedValue = group
      .map((entry) => FEATURE_FLAGS[entry])
      .find((value) => typeof value === "boolean");

    if (typeof resolvedValue !== "boolean") return;
    group.forEach((entry) => {
      FEATURE_FLAGS[entry] = resolvedValue;
    });
  });
}

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
   * Floor-Plan Reference Corpus
   *
   * When enabled:
   * - Injects HouseExpo-derived residential layout priors into spatial-graph
   *   and layout prompts
   * - Injects Roboflow-derived symbol vocabulary hints into technical floor-plan
   *   prompt builders
   * - Uses compact in-repo summaries only; raw datasets stay under data/external
   *
   * @type {boolean}
   * @default true
   */
  layoutReferenceCorpus: true,

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
   * - 'black-forest-labs/FLUX.1-schnell' - Serverless, fast, free (default)
   * - 'black-forest-labs/FLUX.1.1-pro' - Higher quality serverless ($0.04/MP)
   * - 'black-forest-labs/FLUX.1-kontext-max' - Best for comprehensive architectural sheets
   * - 'black-forest-labs/FLUX.1-dev' - Requires dedicated endpoint (no longer serverless)
   *
   * @type {string}
   * @default 'black-forest-labs/FLUX.1-schnell'
   */
  fluxImageModel: "black-forest-labs/FLUX.1-schnell",

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
   * Model Registry (Pluggable AI Architecture)
   *
   * When enabled:
   * - Uses centralized category-based model registry for model selection
   * - Categories: layout, render, style, dna, geometry
   * - Supports hot-swapping models via env vars (AI_MODEL_LAYOUT, AI_MODEL_RENDER, etc.)
   * - Services import getActiveModel() instead of hardcoding model strings
   * - Future models (LoRA, GNN, Blender) register here and auto-activate
   *
   * When disabled:
   * - Uses hardcoded model strings in each service file (legacy behavior)
   *
   * @type {boolean}
   * @default true
   */
  modelRegistry: true,

  /**
   * ControlNet Rendering (Geometry-Locked)
   *
   * When enabled:
   * - Routes panel renders through Replicate ControlNet (Canny or Depth)
   * - Source 1: Canonical SVG → Canny edges (white-on-black)
   * - Source 2: Blender Phase 2 multi-pass renders → composite control image
   *   via ControlNetConditioningService (depth+lineart, canny, lineart+ao, etc.)
   * - Per-panel-type strength + model selection from CONTROLNET_PASS_POLICY
   *   (hero/interior/axon → depth model, elevations/sections/plans → canny)
   * - Falls back to FLUX init_image pipeline if Replicate fails or token missing
   * - Requires REPLICATE_API_TOKEN environment variable
   * - Synergizes with blenderRendering=true for full multi-pass conditioning
   *
   * When disabled (default):
   * - Uses FLUX init_image pipeline with canonical SVG or raw Blender PNG
   *
   * @type {boolean}
   * @default false
   */
  controlNetRendering: false,

  /**
   * Blender 3D Rendering (EXPERIMENTAL)
   *
   * When enabled:
   * - After spatial graph generation, calls /api/blender-render
   *   to produce technical drawings and depth maps from a 3D model
   * - Requires Blender installed locally (dev) or BLENDER_WORKER_URL (prod)
   * - Falls back to existing SVG + FLUX pipeline if Blender unavailable
   *
   * When disabled (default):
   * - Uses existing BuildingModel.js + SVG pipeline
   *
   * @type {boolean}
   * @default false
   */
  blenderRendering: false,

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
  strictFingerprintGate: false,

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
    interior_3d: 0.65,
    axonometric: 0.8,
    elevation_north: 0.65,
    elevation_south: 0.65,
    elevation_east: 0.65,
    elevation_west: 0.65,
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

  /** Use canonical baseline comparison during generation — routes 2D panels to deterministic SVG */
  useCanonicalBaseline: true,

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

  /** Enforce deterministic 2D generation — belt-and-suspenders with useCanonicalBaseline */
  strictDeterministic2D: true,

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
   * @default 6
   */
  maxProgramViolations: 6,

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

  /** Open-source-ready style engine */
  useOpenSourceStyleEngine: true,

  /** Structured floorplan generator (Phase 1 name) */
  useFloorplanEngine: true,

  /** Structured floorplan generator */
  useFloorplanGenerator: true,

  /** Technical drawing engine */
  useTechnicalDrawingEngine: true,

  /** Canonical project geometry generation and routing */
  useCanonicalGeometryPhase2: true,

  /** Deterministic adjacency-first layout scoring/solver */
  useAdjacencySolver: true,

  /** Geometry-first SVG plan/elevation/section rendering */
  useDeterministicSvgPlans: true,

  /** Canonical geometry and drawing validation engine */
  useGeometryValidationEngine: true,

  /** Fail closed when generated geometry or drawings are invalid */
  useFailClosedTechnicalFlow: true,

  /** Phase 3 multi-level distribution, stacking, and level explanations */
  usePhase3MultiLevelEngine: true,

  /** Deterministic stair/core reservation and vertical circulation generation */
  useStairCoreGenerator: true,

  /** Geometry-aware facade grammar composition */
  useFacadeGrammarEngine: true,

  /** Concept-level structural grid and support sanity checks */
  useStructuralSanityLayer: true,

  /** Layer locking, diffs, and partial regeneration routes */
  usePartialRegeneration: true,

  /** Provider-agnostic geometry-locked visual packaging */
  useGeometryLockedVisuals: true,

  /** Phase 3 cross-level, facade, structure, and edit integrity validation */
  usePhase3Validation: true,

  /** Phase 4 candidate search for deterministic layouts */
  usePhase4LayoutSearch: true,

  /** Phase 4 buildable-envelope interpretation from site constraints */
  useBuildableEnvelopeReasoning: true,

  /** Phase 4 JSON-schema-like request and geometry enforcement */
  useFormalSchemaValidation: true,

  /** Phase 4 facade component assembly beyond side-level grammar */
  useFacadeComponentAssembly: true,

  /** Phase 4 structural continuity and support semantics */
  useStructuralSemanticsPhase4: true,

  /** Phase 4 dependency-driven regeneration planning */
  useDependencyGraphRegeneration: true,

  /** Phase 4 A1 readiness and panel planning services */
  useA1ProjectReadiness: true,

  /** Phase 5 deterministic layout repair search */
  usePhase5RepairEngine: true,

  /** Phase 5 formal schema registry and Ajv-style enforcement */
  useFormalSchemaEngine: true,

  /** Phase 5 fragment-level dependency invalidation */
  useFragmentDependencyInvalidation: true,

  /** Phase 5 compose readiness and blocking orchestration */
  useComposeReadinessPhase5: true,

  /** Phase 5 artifact lifecycle store and snapshotting */
  useArtifactLifecycleStore: true,

  /** Phase 5 irregular-site fallback scoring and strategy selection */
  useIrregularSiteFallbackPhase5: true,

  /** Phase 6 deeper deterministic repair search and multi-step planning */
  usePhase6RepairSearch: true,

  /** Phase 6 minimum safe targeted regeneration planning */
  useTargetedRegenerationPlanning: true,

  /** Phase 6 finer dependency fragment edges */
  useFragmentEdgesPhase6: true,

  /** Phase 6 compose execution and recovery planning */
  useComposeExecutionPlanning: true,

  /** Phase 6 irregular-site fallback partitioning and confidence metadata */
  useIrregularSiteFallbackPhase6: true,

  /** Phase 6 project recovery and health flows */
  useProjectRecoveryFlows: true,

  /** Phase 6 deterministic technical panel readability checks */
  useTechnicalPanelReadabilityChecks: true,

  /** Phase 6 honest A1 technical panel gating */
  useA1TechnicalPanelGating: true,

  /** Phase 7 entity-aware dependency graph */
  usePhase7EntityDependencies: true,

  /** Phase 7 minimum-scope regeneration execution */
  useTargetedRegenerationExecution: true,

  /** Phase 7 deterministic technical drawing upgrade */
  useTechnicalDrawingUpgradePhase7: true,

  /** Phase 7 annotation placement guarantees and fallback metadata */
  useAnnotationPlacementGuarantees: true,

  /** Phase 7 richer section-cut specificity */
  useSectionSpecificityPhase7: true,

  /** Phase 7 technical panel scoring thresholds */
  useTechnicalPanelScoringPhase7: true,

  /** Phase 7 bridge from blocked panels to executable recovery */
  useA1RecoveryExecutionBridge: true,

  /** Phase 8 bundled font embedding on final A1 sheet SVG output */
  useA1FontEmbeddingFix: true,

  /** Phase 8 single-source-of-truth material palette derived from canonical inputs */
  useCanonicalMaterialPaletteSSOT: true,

  /** Phase 8 optional hero-last sequencing override for image workflows */
  useHeroGeneratedLast: false,

  /** Phase 8 metadata-first consistency guards between hero and canonical spec */
  useA1ConsistencyGuards: true,

  /** Phase 8 richer deterministic plan renderer */
  usePlanRendererUpgradePhase8: true,

  /** Phase 8 richer deterministic elevation renderer */
  useElevationRendererUpgradePhase8: true,

  /** Phase 8 richer deterministic section renderer */
  useSectionRendererUpgradePhase8: true,

  /** Phase 8 stricter technical panel scoring and verdicts */
  useTechnicalPanelScoringPhase8: true,

  /** Phase 8 compose-time blocking for weak technical panels */
  useTechnicalPanelComposeBlockingPhase8: true,

  /** Phase 8 optional technical-first board weighting */
  useTechnicalFirstA1LayoutPhase8: false,

  /** Phase 9 canonical side-facade extraction for east/west credibility */
  useSideFacadeExtractionPhase9: true,

  /** Phase 9 richer elevation semantics and side articulation */
  useElevationRichnessPhase9: true,

  /** Phase 9 semantic section candidate ranking */
  useSectionSemanticSelectionPhase9: true,

  /** Phase 9 richer section graphics and semantic annotations */
  useSectionGraphicsUpgradePhase9: true,

  /** Phase 9 fragment-level technical scoring */
  useDrawingFragmentScoringPhase9: true,

  /** Phase 9 final-sheet regression checks */
  useA1FinalSheetRegressionChecksPhase9: true,

  /** Phase 9 pre-compose regression verification */
  useA1PreComposeVerificationPhase9: true,

  /** Phase 10 cut-specific section evidence extraction */
  useSectionEvidencePhase10: true,

  /** Phase 10 richer facade-side semantics before rendering */
  useSideFacadeSemanticsPhase10: true,

  /** Phase 10 specialized deterministic section strategies */
  useSectionStrategyLibraryPhase10: true,

  /** Phase 10 section graphics and annotation maturity */
  useSectionGraphicsMaturityPhase10: true,

  /** Phase 10 regression fixture comparisons for final sheets */
  useA1RegressionFixturesPhase10: true,

  /** Phase 11 true cut-geometry section evidence */
  useTrueSectionEvidencePhase11: true,

  /** Phase 11 OCR-backed rendered text verification */
  useOCRTextVerificationPhase11: true,

  /** Phase 11 richer side-facade schema extraction */
  useSideFacadeSchemaPhase11: true,

  /** Phase 11 unified verification bundle model */
  useUnifiedVerificationBundlePhase11: true,

  /** Phase 11 evidence-driven publishability decisions */
  useEvidenceDrivenPublishabilityPhase11: true,

  /** Phase 12 richer cut-geometry section evidence */
  useTrueSectionEvidencePhase12: true,

  /** Phase 12 stronger OCR-backed rendered text proof */
  useOCRTextVerificationPhase12: true,

  /** Phase 12 richer upstream side-facade schema extraction */
  useSideFacadeSchemaPhase12: true,

  /** Phase 12 canonical public verification bundle */
  useCanonicalVerificationBundlePhase12: true,

  /** Phase 12 stronger evidence-driven publishability decisions */
  useEvidenceDrivenPublishabilityPhase12: true,

  /** Phase 13 true geometric section clipping */
  useTrueSectionClippingPhase13: true,

  /** Phase 13 section graphics driven from clipped geometry */
  useClippedSectionGraphicsPhase13: true,

  /** Phase 13 section candidate ranking from exact cut truth */
  useSectionTruthScoringPhase13: true,

  /** Phase 13 section credibility gate in final A1 readiness/publishability */
  useSectionCredibilityGatePhase13: true,

  /** Phase 14 construction-truth classification for sections */
  useSectionConstructionTruthPhase14: true,

  /** Phase 14 drafting-grade section graphics from construction truth */
  useDraftingGradeSectionGraphicsPhase14: true,

  /** Phase 14 section candidate ranking with construction truth */
  useSectionConstructionScoringPhase14: true,

  /** Phase 14 section construction credibility gate in A1 readiness/publishability */
  useSectionConstructionCredibilityGatePhase14: true,

  /** Phase 15 canonical roof primitives in canonical geometry */
  useCanonicalRoofPrimitivesPhase15: true,

  /** Phase 15 canonical foundation/base-condition primitives in canonical geometry */
  useCanonicalFoundationPrimitivesPhase15: true,

  /** Phase 15 stronger roof/foundation section truth from canonical primitives */
  useRoofFoundationSectionTruthPhase15: true,

  /** Phase 15 roof/foundation section credibility gate in A1 readiness/publishability */
  useRoofFoundationSectionCredibilityGatePhase15: true,

  /** Phase 16 richer canonical roof geometry generation */
  useRicherCanonicalRoofGeometryPhase16: true,

  /** Phase 16 richer canonical foundation/base-condition geometry generation */
  useRicherCanonicalFoundationGeometryPhase16: true,

  /** Phase 16 upstream construction primitives carried into downstream section truth */
  useUpstreamConstructionPrimitivesPhase16: true,

  /** Phase 16 richer roof/foundation truth modes for sections */
  useRoofFoundationTruthPhase16: true,

  /** Phase 16 roof/foundation truth-aware credibility gate */
  useRoofFoundationCredibilityGatePhase16: true,

  /** Phase 17 richer explicit upstream roof primitive synthesis */
  useExplicitRoofPrimitiveSynthesisPhase17: true,

  /** Phase 17 richer explicit upstream foundation/base-condition primitive synthesis */
  useExplicitFoundationPrimitiveSynthesisPhase17: true,

  /** Phase 17 shared canonical roof/foundation construction truth model */
  useCanonicalConstructionTruthModelPhase17: true,

  /** Phase 17 deeper roof/foundation clipping using explicit segment and zone primitives */
  useDeeperRoofFoundationClippingPhase17: true,

  /** Phase 17 roof/foundation-aware section credibility gate */
  useRoofFoundationCredibilityGatePhase17: true,

  /** Phase 10 rendered text-zone verification */
  useRenderedTextVerificationPhase10: true,

  /** Phase 10 final technical credibility checks */
  useFinalTechnicalCredibilityChecksPhase10: true,

  /** Phase 10 shared verification-state model across readiness and post-compose flows */
  useUnifiedVerificationStatePhase10: true,

  /** Phase 10 post-compose verification of the composed board */
  usePostComposeVerificationPhase10: true,

  /** Phase 10 final publishability gate */
  useFinalPublishabilityGatePhase10: true,

  /** Phase 10 publishability classification and blocking */
  useA1PublishabilityGatePhase10: true,

  /** Phase 10 final-sheet regression protection */
  useFinalSheetRegressionProtectionPhase10: true,

  /** A1v3 P3 — thread facadeGrammar (porch/dormer/chimney/bay) into active elevation generator */
  useFacadeGrammarElevation: true,

  /** A1v3 P4 — lock canonical palette pre-hero and share with technical panels */
  useSharedCanonicalPaletteA1v3: true,

  /** Local precedent retrieval */
  usePrecedentRetrieval: true,

  /** CAD understanding normalization layer */
  useCadUnderstandingLayer: true,

  /** Model registry/category router (Phase 1 name) */
  useModelRegistryRouter: true,

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
  qaGates: true,

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
  opusSheetCritic: true,

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
  syncFeatureFlagGroup(flagName);

  logger.debug("Feature flag updated: " + flagName, {
    from: oldValue,
    to: FEATURE_FLAGS[flagName],
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
 * Return the full synchronized flag group for a flag name.
 * This is useful when a newer Phase 1 name must remain aligned with a legacy alias.
 */
export function getSynchronizedFeatureFlagNames(flagName) {
  return [...resolveFeatureFlagGroup(flagName)];
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
  FEATURE_FLAGS.fluxImageModel = "black-forest-labs/FLUX.1-schnell";
  FEATURE_FLAGS.a1Orientation = "landscape";
  FEATURE_FLAGS.overlaySiteSnapshotOnA1 = true;
  FEATURE_FLAGS.compositeSiteSnapshotOnModify = false;
  FEATURE_FLAGS.useFluxKontextForA1 = false;
  FEATURE_FLAGS.useModelRouter = true;
  FEATURE_FLAGS.modelRegistry = true;
  FEATURE_FLAGS.controlNetRendering = false;
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
  FEATURE_FLAGS.strictFingerprintGate = false; // CORS blocks cross-origin image loading for comparison
  FEATURE_FLAGS.fingerprintMatchThreshold = 0.85;
  FEATURE_FLAGS.maxFingerprintRetries = 2;
  FEATURE_FLAGS.heroControlStrength = {
    interior_3d: 0.65,
    axonometric: 0.8,
    elevation_north: 0.65,
    elevation_south: 0.65,
    elevation_east: 0.65,
    elevation_west: 0.65,
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
  FEATURE_FLAGS.qaGates = true;
  FEATURE_FLAGS.opusSheetCritic = true;
  FEATURE_FLAGS.opusPanelValidator = false;
  // Hot-path panel generation defaults
  FEATURE_FLAGS.strictControlImageMode = true;
  FEATURE_FLAGS.useCanonicalBaseline = true;
  FEATURE_FLAGS.outputMode = "presentation";
  FEATURE_FLAGS.strictPanelValidation = false;
  FEATURE_FLAGS.strictPanelFailFast = false;
  FEATURE_FLAGS.strictPanelAutoRepair = false;
  FEATURE_FLAGS.enableAutoRetry = true;
  FEATURE_FLAGS.autoRetryFailedPanels = true;
  FEATURE_FLAGS.forceBaselineControl = false;
  FEATURE_FLAGS.strictDeterministic2D = true;
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
  FEATURE_FLAGS.useOpenSourceStyleEngine = true;
  FEATURE_FLAGS.useFloorplanEngine = true;
  FEATURE_FLAGS.useFloorplanGenerator = true;
  FEATURE_FLAGS.useTechnicalDrawingEngine = true;
  FEATURE_FLAGS.useCanonicalGeometryPhase2 = true;
  FEATURE_FLAGS.useAdjacencySolver = true;
  FEATURE_FLAGS.useDeterministicSvgPlans = true;
  FEATURE_FLAGS.useGeometryValidationEngine = true;
  FEATURE_FLAGS.useFailClosedTechnicalFlow = true;
  FEATURE_FLAGS.usePhase3MultiLevelEngine = true;
  FEATURE_FLAGS.useStairCoreGenerator = true;
  FEATURE_FLAGS.useFacadeGrammarEngine = true;
  FEATURE_FLAGS.useStructuralSanityLayer = true;
  FEATURE_FLAGS.usePartialRegeneration = true;
  FEATURE_FLAGS.useGeometryLockedVisuals = true;
  FEATURE_FLAGS.usePhase3Validation = true;
  FEATURE_FLAGS.usePhase4LayoutSearch = true;
  FEATURE_FLAGS.useBuildableEnvelopeReasoning = true;
  FEATURE_FLAGS.useFormalSchemaValidation = true;
  FEATURE_FLAGS.useFacadeComponentAssembly = true;
  FEATURE_FLAGS.useStructuralSemanticsPhase4 = true;
  FEATURE_FLAGS.useDependencyGraphRegeneration = true;
  FEATURE_FLAGS.useA1ProjectReadiness = true;
  FEATURE_FLAGS.usePhase5RepairEngine = true;
  FEATURE_FLAGS.useFormalSchemaEngine = true;
  FEATURE_FLAGS.useFragmentDependencyInvalidation = true;
  FEATURE_FLAGS.useComposeReadinessPhase5 = true;
  FEATURE_FLAGS.useArtifactLifecycleStore = true;
  FEATURE_FLAGS.useIrregularSiteFallbackPhase5 = true;
  FEATURE_FLAGS.usePhase6RepairSearch = true;
  FEATURE_FLAGS.useTargetedRegenerationPlanning = true;
  FEATURE_FLAGS.useFragmentEdgesPhase6 = true;
  FEATURE_FLAGS.useComposeExecutionPlanning = true;
  FEATURE_FLAGS.useIrregularSiteFallbackPhase6 = true;
  FEATURE_FLAGS.useProjectRecoveryFlows = true;
  FEATURE_FLAGS.useTechnicalPanelReadabilityChecks = true;
  FEATURE_FLAGS.useA1TechnicalPanelGating = true;
  FEATURE_FLAGS.usePhase7EntityDependencies = true;
  FEATURE_FLAGS.useTargetedRegenerationExecution = true;
  FEATURE_FLAGS.useTechnicalDrawingUpgradePhase7 = true;
  FEATURE_FLAGS.useAnnotationPlacementGuarantees = true;
  FEATURE_FLAGS.useSectionSpecificityPhase7 = true;
  FEATURE_FLAGS.useTechnicalPanelScoringPhase7 = true;
  FEATURE_FLAGS.useA1RecoveryExecutionBridge = true;
  FEATURE_FLAGS.useA1FontEmbeddingFix = true;
  FEATURE_FLAGS.useCanonicalMaterialPaletteSSOT = true;
  FEATURE_FLAGS.useHeroGeneratedLast = false;
  FEATURE_FLAGS.useA1ConsistencyGuards = true;
  FEATURE_FLAGS.usePlanRendererUpgradePhase8 = true;
  FEATURE_FLAGS.useElevationRendererUpgradePhase8 = true;
  FEATURE_FLAGS.useSectionRendererUpgradePhase8 = true;
  FEATURE_FLAGS.useTechnicalPanelScoringPhase8 = true;
  FEATURE_FLAGS.useTechnicalPanelComposeBlockingPhase8 = true;
  FEATURE_FLAGS.useTechnicalFirstA1LayoutPhase8 = false;
  FEATURE_FLAGS.useSideFacadeExtractionPhase9 = true;
  FEATURE_FLAGS.useElevationRichnessPhase9 = true;
  FEATURE_FLAGS.useSectionSemanticSelectionPhase9 = true;
  FEATURE_FLAGS.useSectionGraphicsUpgradePhase9 = true;
  FEATURE_FLAGS.useDrawingFragmentScoringPhase9 = true;
  FEATURE_FLAGS.useA1FinalSheetRegressionChecksPhase9 = true;
  FEATURE_FLAGS.useA1PreComposeVerificationPhase9 = true;
  FEATURE_FLAGS.useSectionEvidencePhase10 = true;
  FEATURE_FLAGS.useSideFacadeSemanticsPhase10 = true;
  FEATURE_FLAGS.useSectionStrategyLibraryPhase10 = true;
  FEATURE_FLAGS.useSectionGraphicsMaturityPhase10 = true;
  FEATURE_FLAGS.useA1RegressionFixturesPhase10 = true;
  FEATURE_FLAGS.useTrueSectionEvidencePhase11 = true;
  FEATURE_FLAGS.useOCRTextVerificationPhase11 = true;
  FEATURE_FLAGS.useSideFacadeSchemaPhase11 = true;
  FEATURE_FLAGS.useUnifiedVerificationBundlePhase11 = true;
  FEATURE_FLAGS.useEvidenceDrivenPublishabilityPhase11 = true;
  FEATURE_FLAGS.useTrueSectionEvidencePhase12 = true;
  FEATURE_FLAGS.useOCRTextVerificationPhase12 = true;
  FEATURE_FLAGS.useSideFacadeSchemaPhase12 = true;
  FEATURE_FLAGS.useCanonicalVerificationBundlePhase12 = true;
  FEATURE_FLAGS.useEvidenceDrivenPublishabilityPhase12 = true;
  FEATURE_FLAGS.useTrueSectionClippingPhase13 = true;
  FEATURE_FLAGS.useClippedSectionGraphicsPhase13 = true;
  FEATURE_FLAGS.useSectionTruthScoringPhase13 = true;
  FEATURE_FLAGS.useSectionCredibilityGatePhase13 = true;
  FEATURE_FLAGS.useSectionConstructionTruthPhase14 = true;
  FEATURE_FLAGS.useDraftingGradeSectionGraphicsPhase14 = true;
  FEATURE_FLAGS.useSectionConstructionScoringPhase14 = true;
  FEATURE_FLAGS.useSectionConstructionCredibilityGatePhase14 = true;
  FEATURE_FLAGS.useCanonicalRoofPrimitivesPhase15 = true;
  FEATURE_FLAGS.useCanonicalFoundationPrimitivesPhase15 = true;
  FEATURE_FLAGS.useRoofFoundationSectionTruthPhase15 = true;
  FEATURE_FLAGS.useRoofFoundationSectionCredibilityGatePhase15 = true;
  FEATURE_FLAGS.useRicherCanonicalRoofGeometryPhase16 = true;
  FEATURE_FLAGS.useRicherCanonicalFoundationGeometryPhase16 = true;
  FEATURE_FLAGS.useUpstreamConstructionPrimitivesPhase16 = true;
  FEATURE_FLAGS.useRoofFoundationTruthPhase16 = true;
  FEATURE_FLAGS.useRoofFoundationCredibilityGatePhase16 = true;
  FEATURE_FLAGS.useExplicitRoofPrimitiveSynthesisPhase17 = true;
  FEATURE_FLAGS.useExplicitFoundationPrimitiveSynthesisPhase17 = true;
  FEATURE_FLAGS.useCanonicalConstructionTruthModelPhase17 = true;
  FEATURE_FLAGS.useDeeperRoofFoundationClippingPhase17 = true;
  FEATURE_FLAGS.useRoofFoundationCredibilityGatePhase17 = true;
  FEATURE_FLAGS.useRenderedTextVerificationPhase10 = true;
  FEATURE_FLAGS.useFinalTechnicalCredibilityChecksPhase10 = true;
  FEATURE_FLAGS.useUnifiedVerificationStatePhase10 = true;
  FEATURE_FLAGS.usePostComposeVerificationPhase10 = true;
  FEATURE_FLAGS.useFinalPublishabilityGatePhase10 = true;
  FEATURE_FLAGS.useA1PublishabilityGatePhase10 = true;
  FEATURE_FLAGS.useFinalSheetRegressionProtectionPhase10 = true;
  FEATURE_FLAGS.usePrecedentRetrieval = true;
  FEATURE_FLAGS.useCadUnderstandingLayer = true;
  FEATURE_FLAGS.useModelRegistryRouter = true;
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
  syncAllFeatureFlagGroups();

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
      syncAllFeatureFlagGroups();
      // DEFENSIVE: Clear stale FLUX.1-dev from sessionStorage — it's no longer serverless
      if (
        FEATURE_FLAGS.fluxImageModel &&
        FEATURE_FLAGS.fluxImageModel.includes("FLUX.1-dev")
      ) {
        logger.warn(
          "⚠️ Clearing stale FLUX.1-dev from sessionStorage — model is no longer serverless",
        );
        FEATURE_FLAGS.fluxImageModel = "black-forest-labs/FLUX.1-schnell";
        flags.fluxImageModel = "black-forest-labs/FLUX.1-schnell";
        sessionStorage.setItem("featureFlags", JSON.stringify(flags));
      }
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
    ARCHIAI_CONTROLNET_RENDERING: {
      flag: "controlNetRendering",
      parse: (v) => v === "true",
    },
    ARCHIAI_OPEN_SOURCE_STYLE_ENGINE: {
      flag: "useOpenSourceStyleEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_FLOORPLAN_ENGINE: {
      flag: "useFloorplanEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_FLOORPLAN_GENERATOR: {
      flag: "useFloorplanEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_TECHNICAL_DRAWING_ENGINE: {
      flag: "useTechnicalDrawingEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_CANONICAL_GEOMETRY_PHASE2: {
      flag: "useCanonicalGeometryPhase2",
      parse: (v) => v === "true",
    },
    ARCHIAI_ADJACENCY_SOLVER: {
      flag: "useAdjacencySolver",
      parse: (v) => v === "true",
    },
    ARCHIAI_DETERMINISTIC_SVG_PLANS: {
      flag: "useDeterministicSvgPlans",
      parse: (v) => v === "true",
    },
    ARCHIAI_GEOMETRY_VALIDATION_ENGINE: {
      flag: "useGeometryValidationEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_FAIL_CLOSED_TECHNICAL_FLOW: {
      flag: "useFailClosedTechnicalFlow",
      parse: (v) => v === "true",
    },
    ARCHIAI_PHASE3_MULTILEVEL_ENGINE: {
      flag: "usePhase3MultiLevelEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_STAIR_CORE_GENERATOR: {
      flag: "useStairCoreGenerator",
      parse: (v) => v === "true",
    },
    ARCHIAI_FACADE_GRAMMAR_ENGINE: {
      flag: "useFacadeGrammarEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_STRUCTURAL_SANITY_LAYER: {
      flag: "useStructuralSanityLayer",
      parse: (v) => v === "true",
    },
    ARCHIAI_PARTIAL_REGENERATION: {
      flag: "usePartialRegeneration",
      parse: (v) => v === "true",
    },
    ARCHIAI_GEOMETRY_LOCKED_VISUALS: {
      flag: "useGeometryLockedVisuals",
      parse: (v) => v === "true",
    },
    ARCHIAI_PHASE3_VALIDATION: {
      flag: "usePhase3Validation",
      parse: (v) => v === "true",
    },
    ARCHIAI_PHASE4_LAYOUT_SEARCH: {
      flag: "usePhase4LayoutSearch",
      parse: (v) => v === "true",
    },
    ARCHIAI_BUILDABLE_ENVELOPE_REASONING: {
      flag: "useBuildableEnvelopeReasoning",
      parse: (v) => v === "true",
    },
    ARCHIAI_FORMAL_SCHEMA_VALIDATION: {
      flag: "useFormalSchemaValidation",
      parse: (v) => v === "true",
    },
    ARCHIAI_FACADE_COMPONENT_ASSEMBLY: {
      flag: "useFacadeComponentAssembly",
      parse: (v) => v === "true",
    },
    ARCHIAI_STRUCTURAL_SEMANTICS_PHASE4: {
      flag: "useStructuralSemanticsPhase4",
      parse: (v) => v === "true",
    },
    ARCHIAI_DEPENDENCY_GRAPH_REGENERATION: {
      flag: "useDependencyGraphRegeneration",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_PROJECT_READINESS: {
      flag: "useA1ProjectReadiness",
      parse: (v) => v === "true",
    },
    ARCHIAI_PHASE5_REPAIR_ENGINE: {
      flag: "usePhase5RepairEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_FORMAL_SCHEMA_ENGINE: {
      flag: "useFormalSchemaEngine",
      parse: (v) => v === "true",
    },
    ARCHIAI_FRAGMENT_DEPENDENCY_INVALIDATION: {
      flag: "useFragmentDependencyInvalidation",
      parse: (v) => v === "true",
    },
    ARCHIAI_COMPOSE_READINESS_PHASE5: {
      flag: "useComposeReadinessPhase5",
      parse: (v) => v === "true",
    },
    ARCHIAI_ARTIFACT_LIFECYCLE_STORE: {
      flag: "useArtifactLifecycleStore",
      parse: (v) => v === "true",
    },
    ARCHIAI_IRREGULAR_SITE_FALLBACK_PHASE5: {
      flag: "useIrregularSiteFallbackPhase5",
      parse: (v) => v === "true",
    },
    ARCHIAI_PHASE6_REPAIR_SEARCH: {
      flag: "usePhase6RepairSearch",
      parse: (v) => v === "true",
    },
    ARCHIAI_TARGETED_REGENERATION_PLANNING: {
      flag: "useTargetedRegenerationPlanning",
      parse: (v) => v === "true",
    },
    ARCHIAI_FRAGMENT_EDGES_PHASE6: {
      flag: "useFragmentEdgesPhase6",
      parse: (v) => v === "true",
    },
    ARCHIAI_COMPOSE_EXECUTION_PLANNING: {
      flag: "useComposeExecutionPlanning",
      parse: (v) => v === "true",
    },
    ARCHIAI_IRREGULAR_SITE_FALLBACK_PHASE6: {
      flag: "useIrregularSiteFallbackPhase6",
      parse: (v) => v === "true",
    },
    ARCHIAI_PROJECT_RECOVERY_FLOWS: {
      flag: "useProjectRecoveryFlows",
      parse: (v) => v === "true",
    },
    ARCHIAI_TECHNICAL_PANEL_READABILITY_CHECKS: {
      flag: "useTechnicalPanelReadabilityChecks",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_TECHNICAL_PANEL_GATING: {
      flag: "useA1TechnicalPanelGating",
      parse: (v) => v === "true",
    },
    ARCHIAI_PHASE7_ENTITY_DEPENDENCIES: {
      flag: "usePhase7EntityDependencies",
      parse: (v) => v === "true",
    },
    ARCHIAI_TARGETED_REGENERATION_EXECUTION: {
      flag: "useTargetedRegenerationExecution",
      parse: (v) => v === "true",
    },
    ARCHIAI_TECHNICAL_DRAWING_UPGRADE_PHASE7: {
      flag: "useTechnicalDrawingUpgradePhase7",
      parse: (v) => v === "true",
    },
    ARCHIAI_ANNOTATION_PLACEMENT_GUARANTEES: {
      flag: "useAnnotationPlacementGuarantees",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_SPECIFICITY_PHASE7: {
      flag: "useSectionSpecificityPhase7",
      parse: (v) => v === "true",
    },
    ARCHIAI_TECHNICAL_PANEL_SCORING_PHASE7: {
      flag: "useTechnicalPanelScoringPhase7",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_RECOVERY_EXECUTION_BRIDGE: {
      flag: "useA1RecoveryExecutionBridge",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_FONT_EMBEDDING_FIX: {
      flag: "useA1FontEmbeddingFix",
      parse: (v) => v === "true",
    },
    ARCHIAI_CANONICAL_MATERIAL_PALETTE_SSOT: {
      flag: "useCanonicalMaterialPaletteSSOT",
      parse: (v) => v === "true",
    },
    ARCHIAI_HERO_GENERATED_LAST: {
      flag: "useHeroGeneratedLast",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_CONSISTENCY_GUARDS: {
      flag: "useA1ConsistencyGuards",
      parse: (v) => v === "true",
    },
    ARCHIAI_PLAN_RENDERER_UPGRADE_PHASE8: {
      flag: "usePlanRendererUpgradePhase8",
      parse: (v) => v === "true",
    },
    ARCHIAI_ELEVATION_RENDERER_UPGRADE_PHASE8: {
      flag: "useElevationRendererUpgradePhase8",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_RENDERER_UPGRADE_PHASE8: {
      flag: "useSectionRendererUpgradePhase8",
      parse: (v) => v === "true",
    },
    ARCHIAI_TECHNICAL_PANEL_SCORING_PHASE8: {
      flag: "useTechnicalPanelScoringPhase8",
      parse: (v) => v === "true",
    },
    ARCHIAI_TECHNICAL_PANEL_COMPOSE_BLOCKING_PHASE8: {
      flag: "useTechnicalPanelComposeBlockingPhase8",
      parse: (v) => v === "true",
    },
    ARCHIAI_TECHNICAL_FIRST_A1_LAYOUT_PHASE8: {
      flag: "useTechnicalFirstA1LayoutPhase8",
      parse: (v) => v === "true",
    },
    ARCHIAI_SIDE_FACADE_EXTRACTION_PHASE9: {
      flag: "useSideFacadeExtractionPhase9",
      parse: (v) => v === "true",
    },
    ARCHIAI_ELEVATION_RICHNESS_PHASE9: {
      flag: "useElevationRichnessPhase9",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_SEMANTIC_SELECTION_PHASE9: {
      flag: "useSectionSemanticSelectionPhase9",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_GRAPHICS_UPGRADE_PHASE9: {
      flag: "useSectionGraphicsUpgradePhase9",
      parse: (v) => v === "true",
    },
    ARCHIAI_DRAWING_FRAGMENT_SCORING_PHASE9: {
      flag: "useDrawingFragmentScoringPhase9",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_FINAL_SHEET_REGRESSION_CHECKS_PHASE9: {
      flag: "useA1FinalSheetRegressionChecksPhase9",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_PRECOMPOSE_VERIFICATION_PHASE9: {
      flag: "useA1PreComposeVerificationPhase9",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_EVIDENCE_PHASE10: {
      flag: "useSectionEvidencePhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_SIDE_FACADE_SEMANTICS_PHASE10: {
      flag: "useSideFacadeSemanticsPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_STRATEGY_LIBRARY_PHASE10: {
      flag: "useSectionStrategyLibraryPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_GRAPHICS_MATURITY_PHASE10: {
      flag: "useSectionGraphicsMaturityPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_REGRESSION_FIXTURES_PHASE10: {
      flag: "useA1RegressionFixturesPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_TRUE_SECTION_EVIDENCE_PHASE11: {
      flag: "useTrueSectionEvidencePhase11",
      parse: (v) => v === "true",
    },
    ARCHIAI_OCR_TEXT_VERIFICATION_PHASE11: {
      flag: "useOCRTextVerificationPhase11",
      parse: (v) => v === "true",
    },
    ARCHIAI_SIDE_FACADE_SCHEMA_PHASE11: {
      flag: "useSideFacadeSchemaPhase11",
      parse: (v) => v === "true",
    },
    ARCHIAI_UNIFIED_VERIFICATION_BUNDLE_PHASE11: {
      flag: "useUnifiedVerificationBundlePhase11",
      parse: (v) => v === "true",
    },
    ARCHIAI_EVIDENCE_DRIVEN_PUBLISHABILITY_PHASE11: {
      flag: "useEvidenceDrivenPublishabilityPhase11",
      parse: (v) => v === "true",
    },
    ARCHIAI_TRUE_SECTION_EVIDENCE_PHASE12: {
      flag: "useTrueSectionEvidencePhase12",
      parse: (v) => v === "true",
    },
    ARCHIAI_OCR_TEXT_VERIFICATION_PHASE12: {
      flag: "useOCRTextVerificationPhase12",
      parse: (v) => v === "true",
    },
    ARCHIAI_SIDE_FACADE_SCHEMA_PHASE12: {
      flag: "useSideFacadeSchemaPhase12",
      parse: (v) => v === "true",
    },
    ARCHIAI_CANONICAL_VERIFICATION_BUNDLE_PHASE12: {
      flag: "useCanonicalVerificationBundlePhase12",
      parse: (v) => v === "true",
    },
    ARCHIAI_EVIDENCE_DRIVEN_PUBLISHABILITY_PHASE12: {
      flag: "useEvidenceDrivenPublishabilityPhase12",
      parse: (v) => v === "true",
    },
    ARCHIAI_TRUE_SECTION_CLIPPING_PHASE13: {
      flag: "useTrueSectionClippingPhase13",
      parse: (v) => v === "true",
    },
    ARCHIAI_CLIPPED_SECTION_GRAPHICS_PHASE13: {
      flag: "useClippedSectionGraphicsPhase13",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_TRUTH_SCORING_PHASE13: {
      flag: "useSectionTruthScoringPhase13",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_CREDIBILITY_GATE_PHASE13: {
      flag: "useSectionCredibilityGatePhase13",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_CONSTRUCTION_TRUTH_PHASE14: {
      flag: "useSectionConstructionTruthPhase14",
      parse: (v) => v === "true",
    },
    ARCHIAI_DRAFTING_GRADE_SECTION_GRAPHICS_PHASE14: {
      flag: "useDraftingGradeSectionGraphicsPhase14",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_CONSTRUCTION_SCORING_PHASE14: {
      flag: "useSectionConstructionScoringPhase14",
      parse: (v) => v === "true",
    },
    ARCHIAI_SECTION_CONSTRUCTION_CREDIBILITY_GATE_PHASE14: {
      flag: "useSectionConstructionCredibilityGatePhase14",
      parse: (v) => v === "true",
    },
    ARCHIAI_CANONICAL_ROOF_PRIMITIVES_PHASE15: {
      flag: "useCanonicalRoofPrimitivesPhase15",
      parse: (v) => v === "true",
    },
    ARCHIAI_CANONICAL_FOUNDATION_PRIMITIVES_PHASE15: {
      flag: "useCanonicalFoundationPrimitivesPhase15",
      parse: (v) => v === "true",
    },
    ARCHIAI_ROOF_FOUNDATION_SECTION_TRUTH_PHASE15: {
      flag: "useRoofFoundationSectionTruthPhase15",
      parse: (v) => v === "true",
    },
    ARCHIAI_ROOF_FOUNDATION_SECTION_CREDIBILITY_GATE_PHASE15: {
      flag: "useRoofFoundationSectionCredibilityGatePhase15",
      parse: (v) => v === "true",
    },
    ARCHIAI_RICHER_CANONICAL_ROOF_GEOMETRY_PHASE16: {
      flag: "useRicherCanonicalRoofGeometryPhase16",
      parse: (v) => v === "true",
    },
    ARCHIAI_RICHER_CANONICAL_FOUNDATION_GEOMETRY_PHASE16: {
      flag: "useRicherCanonicalFoundationGeometryPhase16",
      parse: (v) => v === "true",
    },
    ARCHIAI_UPSTREAM_CONSTRUCTION_PRIMITIVES_PHASE16: {
      flag: "useUpstreamConstructionPrimitivesPhase16",
      parse: (v) => v === "true",
    },
    ARCHIAI_ROOF_FOUNDATION_TRUTH_PHASE16: {
      flag: "useRoofFoundationTruthPhase16",
      parse: (v) => v === "true",
    },
    ARCHIAI_ROOF_FOUNDATION_CREDIBILITY_GATE_PHASE16: {
      flag: "useRoofFoundationCredibilityGatePhase16",
      parse: (v) => v === "true",
    },
    ARCHIAI_EXPLICIT_ROOF_PRIMITIVE_SYNTHESIS_PHASE17: {
      flag: "useExplicitRoofPrimitiveSynthesisPhase17",
      parse: (v) => v === "true",
    },
    ARCHIAI_EXPLICIT_FOUNDATION_PRIMITIVE_SYNTHESIS_PHASE17: {
      flag: "useExplicitFoundationPrimitiveSynthesisPhase17",
      parse: (v) => v === "true",
    },
    ARCHIAI_CANONICAL_CONSTRUCTION_TRUTH_MODEL_PHASE17: {
      flag: "useCanonicalConstructionTruthModelPhase17",
      parse: (v) => v === "true",
    },
    ARCHIAI_DEEPER_ROOF_FOUNDATION_CLIPPING_PHASE17: {
      flag: "useDeeperRoofFoundationClippingPhase17",
      parse: (v) => v === "true",
    },
    ARCHIAI_ROOF_FOUNDATION_CREDIBILITY_GATE_PHASE17: {
      flag: "useRoofFoundationCredibilityGatePhase17",
      parse: (v) => v === "true",
    },
    ARCHIAI_RENDERED_TEXT_VERIFICATION_PHASE10: {
      flag: "useRenderedTextVerificationPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_FINAL_TECHNICAL_CREDIBILITY_CHECKS_PHASE10: {
      flag: "useFinalTechnicalCredibilityChecksPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_UNIFIED_VERIFICATION_STATE_PHASE10: {
      flag: "useUnifiedVerificationStatePhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_POST_COMPOSE_VERIFICATION_PHASE10: {
      flag: "usePostComposeVerificationPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_FINAL_PUBLISHABILITY_GATE_PHASE10: {
      flag: "useFinalPublishabilityGatePhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_A1_PUBLISHABILITY_GATE_PHASE10: {
      flag: "useA1PublishabilityGatePhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_FINAL_SHEET_REGRESSION_PROTECTION_PHASE10: {
      flag: "useFinalSheetRegressionProtectionPhase10",
      parse: (v) => v === "true",
    },
    ARCHIAI_PRECEDENT_RETRIEVAL: {
      flag: "usePrecedentRetrieval",
      parse: (v) => v === "true",
    },
    ARCHIAI_CAD_UNDERSTANDING_LAYER: {
      flag: "useCadUnderstandingLayer",
      parse: (v) => v === "true",
    },
    ARCHIAI_MODEL_REGISTRY_ROUTER: {
      flag: "useModelRegistryRouter",
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
  syncAllFeatureFlagGroups();

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
      " ← FLUX model for A1 sheets (override via TOGETHER_FLUX_MODEL env var)",
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
    getFeatureValue,
    getSynchronizedFeatureFlagNames,
    resetFeatureFlags,
    loadFeatureFlagsFromStorage,
    logFeatureFlags,
  };
}
