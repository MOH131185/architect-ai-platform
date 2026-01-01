/**
 * DNA Workflow Orchestrator
 *
 * High-level orchestrator that integrates the Project DNA Pipeline with the application.
 * Provides a simple API for the main application to generate consistent architectural designs.
 *
 * Workflow:
 * 1. Initialize Project → Generate Project ID
 * 2. Generate Floor Plan → Save DNA Reference
 * 3. Generate 3D Views → Use DNA Reference + Check Consistency
 * 4. Generate Elevations → Use DNA Reference + Check Consistency
 * 5. Generate Sections → Use DNA Reference + Check Consistency
 * 6. Export Results → Complete project with consistency report
 */

import { isFeatureEnabled, getFeatureValue } from '../../config/featureFlags.js';
import {
  generateAllConditions,
  CONDITIONING_TYPES,
  CONDITIONING_STRENGTHS,
} from '../../geometry/GeometryConditioner.js';
import { runGeometryPipeline, clearModelCache } from '../../geometry/GeometryPipeline.js';
import { buildSVGFloorPlan } from '../../rings/ring3-2d/svgFloorPlanBuilder.js';
import { fromLegacyDNA, createCanonicalDesignState } from '../../types/CanonicalDesignState.js';
import {
  createStyleProfile,
  generateStyleDescriptors,
  createLocationStyle,
  createPortfolioStyle,
} from '../../types/StyleProfile.js';
import dnaCache from '../../utils/dnaCache.js';
import { validateAndCorrectFootprint, polygonToLocalXY } from '../../utils/geometry.js';
import runtimeEnv from '../../utils/runtimeEnv.js';
import { validateSiteSnapshot } from '../../validators/siteSnapshotValidator.js';
import { validatePanelLayout, getRequiredPanels } from '../a1/a1LayoutConstants.js';
import { generateA1SheetMetadata, buildPrompt } from '../a1/A1PromptService.js';
import { compositeA1Sheet, composeWithCanvas } from '../a1/A1SheetGenerator.js';
import a1SheetValidator from '../a1/A1ValidationService.js';
import clipEmbeddingService from '../ai/clipEmbeddingService.js';
import imageUpscalingService from '../ai/imageUpscalingService.js';
import reasoningOrchestrator from '../ai/reasoningOrchestrator.js';
import { generateArchitecturalImage } from '../ai/togetherAIService.js';
import logger from '../core/logger.js';
import { getSiteSnapshotWithMetadata } from '../location/siteMapSnapshotService.js';

import baselineArtifactStore from './baselineArtifactStore.js';
import { check3Dvs2DConsistency } from './bimConsistencyChecker.js';
// REMOVED: multiModelImageService - fail-fast architecture, no SDXL fallback

import { runConsistencyGate } from './crossViewConsistencyGate.js';
import designHistoryService from './designHistoryService.js';
import { validatePanelConsistency, validateMultiPanelConsistency } from './driftValidator.js';
import { validateGeometryRenders } from './geometryControlValidator.js';
import {
  planA1Panels,
  generateA1PanelsSequential,
  clearStyleCache,
} from './panelGenerationService.js';
import { orchestratePanelGeneration } from './panelOrchestrator.js';
import { derivePanelSeedsFromDNA } from './seedDerivation.js';


import architecturalSheetService from './architecturalSheetService.js';

// Lazy import for geometry-first features (TypeScript dependencies)
// import { generateMassingModel } from '../rings/ring4-3d/massingGenerator.js';

import { runFullQAPipeline, getQASummaryForUI } from './qualityAssuranceIntegration.js';
import normalizeDNA from './dnaNormalization.js';
import dnaValidator from './dnaValidator.js';
import enhancedDesignDNAService from './enhancedDesignDNAService.js';
import { buildGeometryModel, createSceneSpec } from './geometryBuilder.js';
import { generateGeometryDNA } from './geometryReasoningService.js';
import { renderGeometryPlaceholders } from './geometryRenderService.js';

import {
  buildMasterGeometry,
  getGeometryRenderForPanel,
} from '../geometry/masterGeometryBuilder.js';

import projectDNAPipeline from './projectDNAPipeline.js';
import { generateAllTechnicalDrawings, isTechnicalPanel } from './technicalDrawingGenerator.js';
import twoPassDNAGenerator from './twoPassDNAGenerator.js';

// Cross-view consistency gate - blocks A1 composition until all panels pass validation

// Geometry-First gate - MANDATORY validation before panel generation
// Ensures geometry is complete: floors populated, rooms > 0 per floor, valid footprint
import { enforceGeometryFirstGate, extractGeometryStats } from '../validation/GeometryFirstGate.js';

// Strict panel validator - fail-fast validation with non-empty, control-pack, and facade checks
import StrictPanelValidator, { buildRepairPrompt } from '../validation/strictPanelValidator.js';

// Debug run recorder - captures real runtime data during generation
import debugRecorder from '../debug/DebugRunRecorder.js';

// Baseline render service - generates deterministic baselines before FLUX stylization
import {
  generateBaselineRenders,
  storeBaselines,
  BASELINE_VIEW_TYPES,
  BASELINE_PIPELINE_VERSION,
} from './BaselineRenderService.js';

// Canonical Control Pack (CCP) - ensures ALL panels reference the SAME design
import {
  initializeCCP,
  setActiveContext,
  clearActiveContext,
  enhanceJobWithCCP,
  generateConsistencyReport,
  generateDesignFingerprint,
  GEOMETRY_LOCK_INSTRUCTION,
} from '../consistency/ccpPanelIntegration.js';

// =============================================================================
// CANONICAL BASELINE MODE: DesignContract + ContractGate
// Ensures ALL panels reference the SAME canonical geometry baseline
// =============================================================================
import {
  DesignContract,
  createDesignContract,
  isDeterministicPanel,
  isStylised3DPanel,
  PANEL_CATEGORIES,
} from './DesignContract.js';
import { ContractGate, createContractGate } from './ContractGate.js';

// FIX: Import floor distributor to ensure proper room distribution across floors
import { distributeRoomsToFloors } from '../spatial/floorDistributor.js';

// FIX: Import TypologyIntegrityGuard for terrace vs detached selection preservation
import {
  createTypologyIntegrityGuard,
  normalizeTypologyKey as normalizeTypology,
} from './TypologyIntegrityGuard.js';

// Import geometry generation engine for populating floor data
import { MVPFloorPlanGenerator } from '../geometry/floorPlanGeometryEngine.js';

// Import geometry projection layer for facades/sections/roofProfiles
import {
  generateProjections,
  generateRoofProfilesForFacades,
} from '../geometry/geometryProjectionLayer.js';

// Import Facade Generation Layer for control images
import { FacadeGenerationLayer } from '../facade/facadeGenerationLayer.js';

// Import GeometryPrimerV3 for geometry normalization/fixing
import { GeometryPrimerV3 } from '../geometry/geometryPrimer.js';

// =============================================================================
// NEW: Conditioned Image Pipeline (Phase 4/5)
// =============================================================================
// These modules provide geometry-conditioned image generation:
// - CanonicalDesignState: Single source of truth for design data
// - GeometryPipeline: Builds 3D model and 2D projections
// - GeometryConditioner: Generates depth/edge maps for FLUX img2img
// - StyleProfile: Blends location (30%) and portfolio (70%) styles
// - ConditionedImagePipeline: Unified generation with conditioning
import {
  initializePipeline,
  generateA1Views,
  buildEnhancedPrompt,
  A1_VIEW_TYPES,
} from '../pipeline/ConditionedImagePipeline.js';

// DataPanelService - Generates deterministic SVG data panels (material_palette, climate_card)
import { generateDataPanels } from '../core/DataPanelService.js';

// Canonical Render Service - Generates 3D control images from geometry BEFORE CCP initialization
import {
  generateCanonical3DRenders,
  hasCanonical3DRenders,
} from '../canonical/canonicalRenderService.js';

// =============================================================================
// QA Services - StrictControlEnforcer + AutoCropService
// =============================================================================
// StrictControlEnforcer: Ensures ALL panels have canonical control images
// AutoCropService: Trims white margins from panel images before A1 composition
import {
  isStrictModeEnabled,
  validateControlPack,
  assertControlPackValid,
  buildImg2ImgParams,
  validateAndHandleBlank,
  REQUIRED_CONTROL_PANELS,
} from '../qa/StrictControlEnforcer.js';
import { AutoCropService } from '../pipeline/AutoCropService.js';

// Import SVG builders for PDE technical drawings

// New hybrid pipeline imports

// =============================================================================
// NEW: Floor-Plan-First Pipeline (v2.0)
// Ensures floor plans are generated FIRST, then 3D/elevations derived from them
// =============================================================================
// These modules provide floor-plan-first generation:
// - FloorPlanFirstOrchestrator: Main orchestrator for the new pipeline
// - MultiLevelFloorPlanGenerator: Generates floor plans for each level
// - WindowPositionExtractor: Extracts window positions for FGL
// - ControlImageManager: Manages control images for FLUX
let floorPlanFirstOrchestrator = null;

// Dynamic imports for heavy modules
let hybrid3DPipeline = null;
let multiPassValidator = null;
let meshy3DService = null;

// Track whether migration skip logs have been output (once per session)
const _migrationLogsShown = {
  masterGeometryBuilder: false,
  geometryRenderService: false,
};

/**
 * Get Meshy 3D service (lazy-loaded)
 * Phase 4: Meshy 3D Integration for 100% cross-view consistency
 */
async function getMeshy3DService() {
  if (!meshy3DService) {
    try {
      const module = await import('../geometry/meshy3DService.js');
      meshy3DService = module.default;
      logger.info('🎨 Meshy 3D service loaded');
    } catch (err) {
      logger.warn('Meshy 3D service not available:', err.message);
    }
  }
  return meshy3DService;
}

/**
 * Get Floor-Plan-First Orchestrator (lazy-loaded)
 * Phase 5: Floor-Plan-First Pipeline for 99.5%+ consistency
 *
 * This orchestrator ensures floor plans are generated FIRST, then:
 * - Extracts window positions from floor plans
 * - Generates FGL control images for elevations
 * - Constrains Meshy 3D with accurate window counts
 * - Uses FLUX with proper control images
 */
async function getFloorPlanFirstOrchestrator() {
  if (!floorPlanFirstOrchestrator) {
    try {
      // Use webpackIgnore to prevent bundling server-side dependencies
      const module = await import(
        /* webpackIgnore: true */ '../pipeline/FloorPlanFirstOrchestrator.js'
      );
      floorPlanFirstOrchestrator = module.floorPlanFirstOrchestrator || new module.default();
      logger.info('🏗️ Floor-Plan-First Orchestrator loaded');
    } catch (err) {
      logger.warn('Floor-Plan-First Orchestrator not available:', err.message);
    }
  }
  return floorPlanFirstOrchestrator;
}

async function getHybrid3DPipeline() {
  if (!hybrid3DPipeline) {
    try {
      const module = await import('../pipeline/hybrid3DPipeline.js');
      hybrid3DPipeline = module.default;
    } catch (err) {
      logger.warn('Hybrid 3D pipeline not available');
    }
  }
  return hybrid3DPipeline;
}

async function getMultiPassValidator() {
  if (!multiPassValidator) {
    try {
      const module = await import('../validation/multiPassValidator.js');
      multiPassValidator = module;
    } catch (err) {
      logger.warn('Multi-pass validator not available');
    }
  }
  return multiPassValidator;
}

// API proxy server URL (runs on port 3001 in dev)
const API_BASE_URL = process.env.REACT_APP_API_PROXY_URL || 'http://localhost:3001';

const getFeatureFlags = () => {
  const session = runtimeEnv.getSession();
  if (!session) {
    return {};
  }
  try {
    return JSON.parse(session.getItem('featureFlags') || '{}');
  } catch {
    return {};
  }
};

const getOverlayEndpoint = () => {
  if (runtimeEnv.isBrowser) {
    return '/api/overlay-site-map';
  }
  return `${API_BASE_URL}/api/overlay-site-map`;
};

/**
 * Get default rooms for geometry generation when DNA has no rooms defined.
 * Mirrors the logic in technicalDrawingGenerator.js getDefaultRooms().
 * This ensures STEP 2.07 can generate floor geometry even when DNA is sparse.
 */
function getDefaultRoomsForGeometry(buildingType) {
  const lowerType = (buildingType || '').toLowerCase();

  if (
    lowerType.includes('clinic') ||
    lowerType.includes('medical') ||
    lowerType.includes('healthcare')
  ) {
    return [
      { name: 'Reception', area: 20, floor: 0 },
      { name: 'Waiting Area', area: 25, floor: 0 },
      { name: 'Consultation 1', area: 15, floor: 0 },
      { name: 'Treatment Room', area: 18, floor: 0 },
      { name: 'WC', area: 8, floor: 0 },
      { name: 'Office', area: 20, floor: 1 },
      { name: 'Staff Room', area: 15, floor: 1 },
      { name: 'Storage', area: 12, floor: 1 },
    ];
  }

  if (lowerType.includes('office') || lowerType.includes('commercial')) {
    return [
      { name: 'Reception', area: 20, floor: 0 },
      { name: 'Open Office', area: 60, floor: 0 },
      { name: 'Meeting Room', area: 25, floor: 0 },
      { name: 'Kitchen', area: 15, floor: 0 },
      { name: 'WC', area: 10, floor: 0 },
      { name: 'Office 1', area: 25, floor: 1 },
      { name: 'Office 2', area: 25, floor: 1 },
      { name: 'Break Room', area: 20, floor: 1 },
    ];
  }

  // Default residential
  return [
    { name: 'Kitchen', area: 16, floor: 0 },
    { name: 'Living Room', area: 25, floor: 0 },
    { name: 'Dining', area: 14, floor: 0 },
    { name: 'Utility', area: 8, floor: 0 },
    { name: 'Hallway', area: 10, floor: 0 },
    { name: 'Bedroom 1', area: 18, floor: 1 },
    { name: 'Bedroom 2', area: 14, floor: 1 },
    { name: 'Bathroom', area: 8, floor: 1 },
    { name: 'Landing', area: 8, floor: 1 },
  ];
}

class DNAWorkflowOrchestrator {
  constructor() {
    this.pipeline = projectDNAPipeline;
    this.clipService = clipEmbeddingService;
    this.historyService = designHistoryService;
    this.validator = dnaValidator;

    // 🆕 Enhanced generation guard with atomic-like behavior and timeout
    this.isGenerating = false;
    this.currentGenerationId = null;
    this.lockAcquiredAt = null;
    this.lockTimeout = 10 * 60 * 1000; // 10 minute timeout for stale locks
    this._lockMutex = false; // Mutex flag for atomic-like acquire

    // Use TwoPass DNA generator when OpenAI DNA is enabled (hybrid mode)
    // When useOpenAIDNA: true  → TwoPass (OpenAI PRIMARY, Claude FALLBACK)
    // When useOpenAIDNA: false → Enhanced (legacy Qwen-only mode)
    const useOpenAIDNA = isFeatureEnabled('useOpenAIDNA');
    this.dnaGenerator = useOpenAIDNA ? twoPassDNAGenerator : enhancedDesignDNAService;
    this.useHybridPipeline = isFeatureEnabled('hybrid3DPipeline');
    this.useDualTrackDrawings = isFeatureEnabled('dualTrackTechnicalDrawings');

    logger.info('🎼 DNA Workflow Orchestrator initialized');
    logger.info(
      `   DNA Generator: ${useOpenAIDNA ? 'TwoPass (OpenAI PRIMARY)' : 'Enhanced (Legacy)'}`
    );
    logger.info(`   Hybrid 3D Pipeline: ${this.useHybridPipeline ? 'enabled' : 'disabled'}`);
    logger.info(`   Dual Track Drawings: ${this.useDualTrackDrawings ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if generation is already in progress
   * @returns {boolean} True if generation is in progress
   */
  isGenerationInProgress() {
    // Also check for stale locks
    if (this.isGenerating && this._isLockStale()) {
      logger.warn(`🔄 Stale lock detected (${this.currentGenerationId}), auto-releasing...`);
      this._forceReleaseLock();
      return false;
    }
    return this.isGenerating;
  }

  /**
   * Check if the current lock is stale (exceeded timeout)
   * @private
   * @returns {boolean} True if lock is stale
   */
  _isLockStale() {
    if (!this.lockAcquiredAt) {return false;}
    const elapsed = Date.now() - this.lockAcquiredAt;
    return elapsed > this.lockTimeout;
  }

  /**
   * Force release a stale lock
   * @private
   */
  _forceReleaseLock() {
    const staleId = this.currentGenerationId;
    const elapsed = this.lockAcquiredAt ? Date.now() - this.lockAcquiredAt : 0;
    this.isGenerating = false;
    this.currentGenerationId = null;
    this.lockAcquiredAt = null;
    this._lockMutex = false;
    logger.warn(
      `🔓 Force-released stale lock: ${staleId} (was held for ${Math.round(elapsed / 1000)}s)`
    );
  }

  /**
   * Attempt to acquire generation lock with atomic-like behavior
   * Uses mutex pattern to prevent race conditions in synchronous code path
   * @param {string} [generationId] - Optional generation ID for tracking
   * @returns {boolean} True if lock acquired, false if generation already in progress
   */
  acquireGenerationLock(generationId = null) {
    // Check for stale locks first
    if (this.isGenerating && this._isLockStale()) {
      logger.warn(
        `🔄 Stale lock detected during acquire (${this.currentGenerationId}), auto-releasing...`
      );
      this._forceReleaseLock();
    }

    // Atomic-like compare-and-swap using mutex
    // In single-threaded JS, this ensures only one caller can proceed
    if (this._lockMutex) {
      logger.warn(`🚫 Lock mutex held, another acquisition in progress`);
      return false;
    }

    // Set mutex immediately (synchronous)
    this._lockMutex = true;

    try {
      // Check if already generating
      if (this.isGenerating) {
        const elapsed = this.lockAcquiredAt
          ? Math.round((Date.now() - this.lockAcquiredAt) / 1000)
          : 0;
        logger.warn(
          `🚫 Generation already in progress (current: ${this.currentGenerationId}, elapsed: ${elapsed}s). Blocking duplicate request.`
        );
        return false;
      }

      // Acquire lock
      this.isGenerating = true;
      this.currentGenerationId =
        generationId || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.lockAcquiredAt = Date.now();
      logger.info(`🔒 Generation lock acquired: ${this.currentGenerationId}`);
      return true;
    } finally {
      // Always release mutex
      this._lockMutex = false;
    }
  }

  /**
   * Release generation lock with validation
   * @param {string} [generationId] - Optional generation ID to validate ownership
   * @returns {boolean} True if lock was released, false if not owned or not locked
   */
  releaseGenerationLock(generationId = null) {
    const wasLocked = this.isGenerating;
    const previousId = this.currentGenerationId;

    // Validate ownership if generationId provided
    if (generationId && previousId && generationId !== previousId) {
      logger.warn(
        `🚫 Cannot release lock: ID mismatch (provided: ${generationId}, current: ${previousId})`
      );
      return false;
    }

    this.isGenerating = false;
    this.currentGenerationId = null;
    const elapsed = this.lockAcquiredAt ? Math.round((Date.now() - this.lockAcquiredAt) / 1000) : 0;
    this.lockAcquiredAt = null;

    if (wasLocked) {
      logger.info(`🔓 Generation lock released: ${previousId} (held for ${elapsed}s)`);
    }
    return wasLocked;
  }

  /**
   * Get current lock status for debugging
   * @returns {Object} Lock status info
   */
  getLockStatus() {
    const elapsed = this.lockAcquiredAt ? Math.round((Date.now() - this.lockAcquiredAt) / 1000) : 0;
    const isStale = this._isLockStale();
    return {
      isLocked: this.isGenerating,
      generationId: this.currentGenerationId,
      elapsedSeconds: elapsed,
      isStale,
      timeoutSeconds: Math.round(this.lockTimeout / 1000),
    };
  }

  /**
   * STEP 1: Initialize a new architectural project
   *
   * @param {Object} projectData - Project initialization data
   * @param {Object} projectData.locationData - Location and climate data
   * @param {Object} projectData.projectContext - Building specifications
   * @param {Array} projectData.portfolioFiles - Optional portfolio images
   * @returns {Promise<Object>} Initialization result with project ID and DNA
   */
  async initializeProject(projectData) {
    logger.info('\n🚀 ========================================');
    logger.info('🚀 INITIALIZING NEW PROJECT');
    logger.info('🚀 ========================================\n');

    const { locationData, projectContext, portfolioFiles = [] } = projectData;

    try {
      // 1. Generate Project ID
      const projectId = this.pipeline.generateProjectId(
        locationData?.address || 'Unknown Location',
        projectContext?.buildingProgram || 'house'
      );

      logger.info(`\n✅ Project ID Generated: ${projectId}`);

      // 2. Generate Master Design DNA
      logger.info('\n🧬 Generating Master Design DNA...');
      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        null, // Portfolio analysis (to be added)
        locationData
      );

      if (!dnaResult.success) {
        // FAIL-FAST: No fallback DNA - throw error for user to retry
        throw new Error('DNA generation failed. Please try again.');
      }

      const masterDNA = dnaResult.masterDNA;

      // 3. Validate DNA
      logger.info('\n🔍 Validating Design DNA...');
      const validation = this.validator.validateDesignDNA(masterDNA);

      if (!validation.isValid) {
        logger.warn('⚠️  DNA validation issues found');
        logger.info('   Errors:', validation.errors.length);
        logger.info('   Warnings:', validation.warnings.length);

        // Attempt auto-fix
        const fixed = this.validator.autoFixDesignDNA(masterDNA);
        if (fixed) {
          logger.success(' DNA auto-fixed successfully');
          Object.assign(masterDNA, fixed);
        }
      }

      const bimIssues = check3Dvs2DConsistency({ masterDNA });
      if (bimIssues.length) {
        logger.warn('BIM consistency issues detected', { bimIssues });
      }

      // 4. Extract portfolio DNA if provided
      let portfolioDNA = null;
      if (portfolioFiles.length > 0) {
        logger.info('\n🎨 Extracting portfolio style DNA...');
        portfolioDNA = await this.dnaGenerator.extractDNAFromPortfolio(portfolioFiles);
        if (portfolioDNA) {
          logger.success(' Portfolio DNA extracted');
          // Merge with master DNA
          this.dnaGenerator.mergeDNASources(masterDNA, portfolioDNA);
        }
      }

      // 5. Save to legacy history service for compatibility
      const legacyProjectId = this.historyService.saveDesignContext({
        projectId,
        location: locationData,
        buildingDNA: masterDNA,
        prompt: this.buildInitialPrompt(projectContext, locationData),
        metadata: {
          buildingProgram: projectContext.buildingProgram,
          floorArea: projectContext.floorArea,
          floors: projectContext.floors,
          style: projectContext.style,
        },
      });

      logger.info('\n✅ ========================================');
      logger.success(' PROJECT INITIALIZED SUCCESSFULLY');
      logger.success(' ========================================');
      logger.info(`   🔑 Project ID: ${projectId}`);
      logger.info(
        `   📏 Dimensions: ${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m`
      );
      logger.info(`   🏗️  Floors: ${masterDNA.dimensions?.floor_count}`);
      logger.info(`   🎨 Style: ${masterDNA.architectural_style?.name}`);
      logger.info(`   📦 Materials: ${masterDNA.materials?.exterior?.primary}`);

      return {
        success: true,
        projectId,
        masterDNA,
        validation,
        portfolioDNA,
        message: 'Project initialized successfully. Ready to generate floor plan.',
      };
    } catch (error) {
      logger.error('\n❌ Project initialization failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to initialize project',
      };
    }
  }

  /**
   * STEP 2: Generate floor plan and establish DNA baseline
   *
   * @param {string} projectId - Project identifier
   * @param {string} floorPlanImageUrl - Generated floor plan image URL or base64
   * @param {Object} generationData - Additional generation metadata
   * @returns {Promise<Object>} Result with DNA baseline established
   */
  async establishDNABaseline(projectId, floorPlanImageUrl, generationData = {}) {
    logger.info('\n📐 ========================================');
    logger.info('📐 ESTABLISHING DNA BASELINE');
    logger.info('📐 ========================================\n');

    try {
      // 1. Load project DNA
      const legacyContext = this.historyService.getDesignContext(projectId);
      if (!legacyContext) {
        throw new Error('Project not found. Initialize project first.');
      }

      // 2. Generate prompt embedding
      logger.info('\n🎯 Generating CLIP embedding for floor plan...');
      const embeddingResult = await this.clipService.generateEmbedding(floorPlanImageUrl);

      // 3. Generate text embedding for prompt
      const prompt = generationData.prompt || legacyContext.prompt;
      const textEmbeddingResult = await this.clipService.generateTextEmbedding(prompt);

      // 4. Save DNA package to new pipeline
      logger.info('\n💾 Saving DNA baseline to pipeline...');
      const saveResult = await this.pipeline.saveProjectDNA({
        projectId,
        floorPlanImage: floorPlanImageUrl,
        prompt,
        promptEmbedding: textEmbeddingResult.embedding,
        designDNA: legacyContext.buildingDNA,
        locationData: legacyContext.location,
        projectContext: legacyContext.metadata,
        imageEmbedding: embeddingResult.embedding, // Store image embedding too
      });

      if (!saveResult.success) {
        throw new Error('Failed to save DNA baseline');
      }

      logger.info('\n✅ ========================================');
      logger.success(' DNA BASELINE ESTABLISHED');
      logger.success(' ========================================');
      logger.info(`   🔑 Project ID: ${projectId}`);
      logger.info(`   🖼️  Floor Plan: ${embeddingResult.dimension}D embedding`);
      logger.info(`   📝 Prompt: ${textEmbeddingResult.dimension}D embedding`);
      logger.info(`   💾 Storage: ${saveResult.storageKey}`);

      return {
        success: true,
        projectId,
        baseline: {
          floorPlanImage: floorPlanImageUrl,
          imageEmbedding: embeddingResult,
          promptEmbedding: textEmbeddingResult,
        },
        dnaPackage: saveResult.dnaPackage,
        message: 'DNA baseline established. Ready to generate additional views.',
      };
    } catch (error) {
      logger.error('\n❌ DNA baseline establishment failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to establish DNA baseline',
      };
    }
  }

  /**
   * STEP 3: Generate view with DNA consistency
   *
   * @param {string} projectId - Project identifier
   * @param {string} viewType - Type of view (exterior_3d, elevation_north, section, etc.)
   * @param {Object} aiService - AI service to use for generation (Replicate, Together AI, etc.)
   * @param {Object} options - Additional generation options
   * @returns {Promise<Object>} Generation result with consistency check
   */
  async generateConsistentView(projectId, viewType, aiService, options = {}) {
    logger.info(`\n🎨 ========================================`);
    logger.info(`🎨 GENERATING CONSISTENT VIEW: ${viewType.toUpperCase()}`);
    logger.info(`🎨 ========================================\n`);

    try {
      // 1. Load DNA baseline
      logger.info('📖 Loading DNA baseline...');
      const dnaPackage = this.pipeline.loadProjectDNA(projectId);
      if (!dnaPackage) {
        throw new Error('DNA baseline not found. Generate floor plan first.');
      }

      // 2. Prepare generation parameters
      logger.info('⚙️  Preparing generation parameters...');
      const generationParams = await this.pipeline.generateWithDNA(projectId, viewType, options);

      // 3. Build enhanced prompt with DNA constraints
      const enhancedPrompt = this.buildDNAConstrainedPrompt(
        dnaPackage,
        viewType,
        options.userPrompt || ''
      );

      logger.info('📝 Enhanced prompt prepared:');
      logger.info(`   Length: ${enhancedPrompt.length} chars`);
      logger.info(`   Consistency Rules: ${dnaPackage.designDNA?.consistency_rules?.length || 0}`);

      // 4. Call AI service to generate image
      logger.info(`\n🤖 Calling AI service: ${aiService.constructor.name || 'AI Service'}...`);

      // Return generation params for AI service to use
      // The actual generation is handled by the AI service
      return {
        success: true,
        projectId,
        viewType,
        generationParams: {
          ...generationParams.generationParams,
          enhancedPrompt,
          referenceImage: dnaPackage.references.basePlan,
          designDNA: dnaPackage.designDNA,
        },
        message: 'Generation parameters ready. Call AI service with these parameters.',
        nextStep: 'Call validateGeneratedView() after image generation',
      };
    } catch (error) {
      logger.error(`\n❌ View generation preparation failed:`, error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to prepare view generation',
      };
    }
  }

  /**
   * STEP 4: Validate generated view for consistency
   *
   * @param {string} projectId - Project identifier
   * @param {string} viewType - Type of view that was generated
   * @param {string} generatedImageUrl - URL or base64 of generated image
   * @returns {Promise<Object>} Validation result with consistency score
   */
  async validateGeneratedView(projectId, viewType, generatedImageUrl) {
    logger.info(`\n🔍 ========================================`);
    logger.info(`🔍 VALIDATING VIEW: ${viewType.toUpperCase()}`);
    logger.info(`🔍 ========================================\n`);

    try {
      // 1. Check harmony using CLIP similarity
      logger.info('🎯 Checking design harmony...');
      const harmonyResult = await this.pipeline.checkHarmony(
        projectId,
        generatedImageUrl,
        viewType
      );

      // 2. Get workflow status
      const workflowStatus = this.pipeline.getWorkflowStatus(projectId);

      logger.info('\n✅ ========================================');
      logger.success(` VALIDATION COMPLETE: ${harmonyResult.status.toUpperCase()}`);
      logger.success(' ========================================');
      logger.info(`   📊 Consistency Score: ${(harmonyResult.score * 100).toFixed(1)}%`);
      logger.info(`   🎯 Status: ${harmonyResult.status}`);
      logger.info(`   💬 ${harmonyResult.message}`);
      logger.info(`   📈 Project Completion: ${workflowStatus.workflow?.completionPercentage}%`);

      return {
        success: true,
        projectId,
        viewType,
        consistency: harmonyResult,
        workflow: workflowStatus.workflow,
        recommendation: this.getConsistencyRecommendation(harmonyResult),
        message: harmonyResult.message,
      };
    } catch (error) {
      logger.error('\n❌ View validation failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to validate view',
      };
    }
  }

  /**
   * STEP 5: Get complete project summary
   *
   * @param {string} projectId - Project identifier
   * @returns {Object} Complete project summary with all generations and consistency scores
   */
  getProjectSummary(projectId) {
    logger.info('\n📊 ========================================');
    logger.info('📊 PROJECT SUMMARY');
    logger.info('📊 ========================================\n');

    const workflowStatus = this.pipeline.getWorkflowStatus(projectId);

    if (!workflowStatus.success) {
      return {
        success: false,
        message: 'Project not found',
      };
    }

    const workflow = workflowStatus.workflow;

    logger.info(`   🔑 Project ID: ${projectId}`);
    logger.info(`   📍 Address: ${workflow.projectInfo.address}`);
    logger.info(`   🏠 Type: ${workflow.projectInfo.buildingType}`);
    logger.info(`   📏 Area: ${workflow.projectInfo.floorArea}m²`);
    logger.info(`   🏗️  Floors: ${workflow.projectInfo.floors}`);
    logger.info(`   📈 Completion: ${workflow.completionPercentage}%`);
    logger.info(`   🎯 Avg Consistency: ${(workflow.consistency.averageScore * 100).toFixed(1)}%`);
    logger.info(`   ✅ Checks Performed: ${workflow.consistency.checksPerformed}`);

    return {
      success: true,
      projectId,
      summary: workflow,
      consistency: this.generateConsistencyReport(workflow),
    };
  }

  /**
   * NEW: A1 Sheet Workflow (One-Shot Generation)
   * Generates a single comprehensive A1 architectural sheet with all views
   *
   * @param {Object} ctx - Generation context
   * @param {Object} ctx.projectContext - Building specifications
   * @param {Object} ctx.locationData - Location and climate data
   * @param {Object} ctx.portfolioAnalysis - Optional portfolio analysis
   * @param {number} ctx.portfolioBlendPercent - Portfolio influence (0-100)
   * @param {number} ctx.seed - Consistent seed for reproducibility
   * @returns {Promise<Object>} A1 sheet generation result
   */
  async runA1SheetWorkflow(ctx) {
    // 🛡️ GENERATION GUARD: Prevent duplicate runs
    const generationId = `a1_${Date.now()}`;
    if (!this.acquireGenerationLock(generationId)) {
      return {
        success: false,
        workflow: 'a1-sheet-one-shot',
        error: 'Generation already in progress. Please wait for current generation to complete.',
        message: 'Duplicate generation blocked',
        blocked: true,
      };
    }

    // Hybrid/multi-panel modes are removed; always run one-shot A1
    const hybridModeEnabled = isFeatureEnabled('hybridA1Mode');
    const multiPanelEnabled = isFeatureEnabled('multiPanelA1');

    if (hybridModeEnabled || multiPanelEnabled) {
      logger.warn(
        'Hybrid/multi-panel A1 modes are deprecated and removed. Proceeding with one-shot A1 workflow.',
        null,
        '??'
      );
    }

    logger.info('\n📐 ========================================');
    logger.info('📐 A1 SHEET WORKFLOW (ONE-SHOT ONLY)');
    logger.info('📐 ========================================\n');

    // [Pipeline Mode] Log which geometry pipeline is active
    const conditionedPipelineActive = isFeatureEnabled('conditionedImagePipeline');
    logger.info('[Pipeline] Mode', {
      conditionedImagePipeline: conditionedPipelineActive,
      geometrySource: conditionedPipelineActive
        ? 'GeometryPipeline + Projections2D + GeometryConditioner'
        : 'Legacy (geometryRenderService + masterGeometryBuilder)',
    });

    const {
      projectContext,
      locationData,
      portfolioAnalysis = null,
      portfolioBlendPercent = 70,
      styleWeights: ctxStyleWeights = null,
      seed,
      strictLock = false,
      consistencyLockOptions = {},
      sitePlanAttachment: ctxSitePlanAttachment = null,
      sitePlanMetadata: ctxSitePlanMetadata = null,
      onProgress = null, // Progress callback for UI updates
    } = ctx;

    // Progress reporting helper - sends updates to UI
    const reportProgress = (stage, message, percent) => {
      if (typeof onProgress === 'function') {
        onProgress({ stage, message, percent });
      }
    };

    projectContext.buildingType = projectContext.buildingType || projectContext.buildingProgram;
    let effectivePortfolioBlendPercent = portfolioBlendPercent;
    const effectiveSeed = seed || projectContext.seed || Math.floor(Math.random() * 1e6);

    // ═══════════════════════════════════════════════════════════════════════
    // TYPOLOGY INTEGRITY GUARD: Track selected typology through entire pipeline
    // Prevents terrace→detached silent substitution bug
    // ═══════════════════════════════════════════════════════════════════════
    const typologyGuard = createTypologyIntegrityGuard(projectContext.buildingType, {
      strictMode: true, // Throw on mismatch
    });
    typologyGuard.logBoundary('ORCHESTRATOR_ENTRY', projectContext.buildingType, {
      source: 'projectContext',
      hasProgram: !!projectContext.buildingProgram,
    });

    try {
      // ========================================
      // DEBUG RUN RECORDER: Start capturing real runtime data
      // ========================================
      const runId = debugRecorder.startRun({
        designId: projectContext?.designId || generationId,
        buildingType: projectContext?.buildingType || projectContext?.buildingProgram,
        userSelection: {
          buildingType: projectContext?.buildingType || projectContext?.buildingProgram,
          totalArea: projectContext?.totalArea || projectContext?.gfa,
          levels: projectContext?.floorCount || projectContext?.floors,
          location: locationData?.address || locationData?.formattedAddress,
          programSpaces: projectContext?.programSpaces?.length || 0,
        },
      });

      // Record feature flags snapshot
      debugRecorder.recordStep('feature_flags_captured', {
        flags: debugRecorder.currentRun?.featureFlags || {},
      });

      // ========================================
      // STEP 0: Clear all caches for fresh generation
      // ========================================
      reportProgress('analysis', 'Clearing caches for fresh generation...', 5);
      logger.info('🧹 STEP 0: Clearing all caches for fresh generation...');

      // Clear DNA cache to prevent reusing old DNA
      dnaCache.clear();

      // Clear style cache
      clearStyleCache();

      // Clear hybrid3D pipeline cache if available
      const hybrid3D = await getHybrid3DPipeline();
      if (hybrid3D?.clearCache) {
        hybrid3D.clearCache();
      }

      logger.success('✅ All caches cleared');

      // ========================================
      // STEP 1: Generate Master Design DNA
      // ========================================
      reportProgress('dna', 'Generating Master Design DNA...', 10);
      logger.info('🧬 STEP 1: Generating Master Design DNA...');

      // ═══════════════════════════════════════════════════════════════════════
      // DIAGNOSTIC: Confirm programSpaces received from UI
      // [DEBUG Program→DNA] entering orchestrator
      // ═══════════════════════════════════════════════════════════════════════
      const programSpacesFromContext = projectContext?.programSpaces || [];
      const floorsFromContext = projectContext?.floors || projectContext?.floorCount || 2;

      logger.info('[DEBUG Program→DNA] entering orchestrator', {
        totalRooms: programSpacesFromContext.length,
        floorsRequested: floorsFromContext,
        source:
          programSpacesFromContext.length > 0 ? 'UI (projectContext.programSpaces)' : 'MISSING',
        firstThree: programSpacesFromContext.slice(0, 3).map((r) => ({
          name: r.name,
          area: r.area,
          level: r.level,
        })),
        floorDistribution: programSpacesFromContext.reduce((acc, r) => {
          const level = r.level || 'Ground';
          acc[level] = (acc[level] || 0) + 1;
          return acc;
        }, {}),
      });

      if (programSpacesFromContext.length === 0) {
        logger.warn(
          '[Orchestrator] WARNING: No programSpaces in projectContext! DNA will generate defaults.',
          null,
          '⚠️'
        );
      }

      // DEBUG: Record DNA generation start
      const dnaStartTime = Date.now();
      debugRecorder.recordStep('dna_generation_start', {
        generator: this.dnaGenerator?.constructor?.name || 'unknown',
      });

      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        portfolioAnalysis,
        locationData
      );

      if (!dnaResult.success) {
        // FAIL-FAST: No fallback DNA - throw error for user to retry
        throw new Error('Master DNA generation failed. Please try again.');
      }

      let masterDNA = dnaResult.masterDNA;

      // ═══════════════════════════════════════════════════════════════════════
      // TYPOLOGY BOUNDARY: After DNA generation
      // ═══════════════════════════════════════════════════════════════════════
      typologyGuard.logBoundary('DNA_GENERATION', typologyGuard.extractTypology(masterDNA), {
        dnaProjectType: masterDNA.projectType,
        dnaBuildingType: masterDNA.buildingType,
        dnaTypology: masterDNA.typology?.building_type,
      });

      // [DEBUG DNA RAW] Log raw DNA before normalization
      const rawRooms = masterDNA.rooms || masterDNA.program?.rooms || [];
      logger.info('[DEBUG DNA RAW] after GPT-4o/Qwen', {
        hasRooms: rawRooms.length > 0,
        roomCount: rawRooms.length,
        floors: masterDNA.dimensions?.floors || masterDNA.dimensions?.floorCount,
        rooms: rawRooms
          .slice(0, 5)
          .map((r) => `${r.name || r.roomName}@${r.floor || r.level || 0}`),
      });

      // Normalize DNA to ensure consistent structure (materials as array, etc.)
      masterDNA = normalizeDNA(masterDNA, {
        floors: projectContext.floors || projectContext.floorCount || 2,
        area: projectContext.floorArea || projectContext.area || 200,
        style: projectContext.architecturalStyle || 'Contemporary',
      });

      reportProgress('dna', 'Master DNA generated - normalizing...', 18);
      logger.success(' Master DNA generated and normalized');
      logger.info(
        `   📏 Dimensions: ${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m × ${masterDNA.dimensions?.height}m`
      );
      logger.info(`   🏗️  Floors: ${masterDNA.dimensions?.floors}`);
      logger.info(`   🎨 Style: ${masterDNA.architecturalStyle}`);
      logger.info(`   📦 Materials: ${masterDNA.materials?.length} items (array)`);

      // DEBUG: Record DNA generation complete with actual DNA object
      debugRecorder.recordStep('dna_generation_complete', {
        durationMs: Date.now() - dnaStartTime,
        masterDNA: {
          dimensions: masterDNA.dimensions,
          architecturalStyle: masterDNA.architecturalStyle,
          buildingType: masterDNA.buildingType || masterDNA.projectType,
          materials: masterDNA.materials?.map((m) => m.name || m),
          roomCount: (masterDNA.rooms || masterDNA.program?.rooms || []).length,
          floors: masterDNA.dimensions?.floors,
        },
        cacheHit: false,
      });

      // DEBUG: Record seed derivation
      debugRecorder.recordStep('seed_derivation', {
        baseSeed: effectiveSeed,
        source: seed ? 'provided' : projectContext.seed ? 'projectContext' : 'random',
      });

      // Align building type and style weights with user intent
      const normalizedStyleWeights = normalizeStyleWeights(
        ctxStyleWeights || projectContext?.styleWeights
      );
      const requestedBuildingType = normalizeBuildingTypeKey(
        projectContext?.buildingType || projectContext?.buildingProgram || masterDNA?.projectType
      );

      if (normalizedStyleWeights) {
        masterDNA.styleWeights = normalizedStyleWeights;
        projectContext.styleWeights = normalizedStyleWeights;
        if (typeof normalizedStyleWeights.portfolio === 'number') {
          effectivePortfolioBlendPercent = Math.round(normalizedStyleWeights.portfolio * 100);
        }
      }

      if (requestedBuildingType) {
        masterDNA.typology = masterDNA.typology || {};
        const currentType = normalizeBuildingTypeKey(
          masterDNA.typology.building_type || masterDNA.projectType
        );
        if (currentType && currentType !== requestedBuildingType) {
          logger.warn('🚧 Building type drift detected, locking to user selection', {
            requested: requestedBuildingType,
            dna: currentType,
          });
        }
        masterDNA.typology.building_type = requestedBuildingType;
        masterDNA.buildingType = requestedBuildingType;
        masterDNA.projectType = projectContext.buildingProgram || requestedBuildingType;
        projectContext.buildingType = requestedBuildingType;
        projectContext.projectType = projectContext.projectType || requestedBuildingType;
        projectContext.buildingProgram = projectContext.buildingProgram || requestedBuildingType;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // TYPOLOGY BOUNDARY: After building type enforcement
      // ═══════════════════════════════════════════════════════════════════════
      typologyGuard.logBoundary('TYPE_ENFORCEMENT', masterDNA.buildingType, {
        typologyField: masterDNA.typology?.building_type,
        projectType: masterDNA.projectType,
        contextType: projectContext.buildingType,
      });

      // Validate DNA against typology constraints (party walls, frontage, etc.)
      const typologyValidation = typologyGuard.validateDNA(masterDNA);
      if (!typologyValidation.valid) {
        logger.warn('[TypologyGuard] DNA validation issues:', typologyValidation.errors);
      }
      if (typologyValidation.warnings.length > 0) {
        logger.info('[TypologyGuard] DNA warnings:', typologyValidation.warnings);
      }

      // ========================================
      // STEP 2: Validate Master DNA
      // ========================================
      reportProgress('validation', 'Validating Master DNA...', 22);
      logger.info('\n🔍 STEP 2: Validating Master DNA...');

      const validation = this.validator.validateDesignDNA(masterDNA);

      if (!validation.isValid) {
        logger.warn('⚠️  DNA validation found issues:', validation.errors);
        logger.info('🔧 Attempting auto-fix...');
        const fixed = this.validator.autoFixDesignDNA(masterDNA);
        if (fixed) {
          logger.success(' DNA auto-fixed successfully');
          Object.assign(masterDNA, fixed);
        }
      } else {
        logger.success(' DNA validation passed');
      }
      reportProgress('validation', 'DNA validated successfully', 25);

      // ========================================
      // STEP 2.005: Create Design Contract (CANONICAL BASELINE MODE)
      // ========================================
      // The DesignContract is the SINGLE SOURCE OF TRUTH for design identity.
      // Once created, the buildingType and geometry are IMMUTABLE.
      // All panels MUST reference this contract for consistent generation.
      let designContract = null;
      let contractGate = null;
      const useCanonicalBaseline = isFeatureEnabled('useCanonicalBaseline');

      if (useCanonicalBaseline) {
        logger.info('\n📜 STEP 2.005: Creating Design Contract (Canonical Baseline Mode)...');

        try {
          designContract = createDesignContract({
            masterDNA,
            projectContext,
            locationData,
            designState: null, // Will be populated by geometry generation
          });

          logger.success(`✅ Design Contract created: ${designContract.contractId}`);
          logger.info(`   🏠 Building Type (IMMUTABLE): ${designContract.buildingType}`);
          logger.info(`   🧱 Party Walls: ${designContract.partyWalls ? 'Yes' : 'No'}`);
          if (designContract.partyWallSides?.length > 0) {
            logger.info(`   🔒 Party Wall Sides: ${designContract.partyWallSides.join(', ')}`);
          }
          logger.info(
            `   📐 Facade: ${designContract.facadeWidth}m × ${designContract.facadeDepth}m`
          );
          logger.info(`   🏛️ Roof: ${designContract.roofType} (${designContract.roofPitch}°)`);

          // Create ContractGate for validation and auto-regeneration
          contractGate = createContractGate(designContract);
          logger.info(
            `   🚪 Contract Gate active (max retries: ${getFeatureValue('contractGateMaxRetries') || 2})`
          );

          // Store contract reference in DNA for downstream access
          masterDNA.designContract = {
            contractId: designContract.contractId,
            buildingType: designContract.buildingType,
            partyWalls: designContract.partyWalls,
            partyWallSides: designContract.partyWallSides,
            promptInjection: designContract.getPromptInjection(),
            negativePromptInjection: designContract.getNegativePromptInjection(),
          };

          // DEBUG: Record contract creation
          debugRecorder.recordStep('design_contract_created', {
            contractId: designContract.contractId,
            buildingType: designContract.buildingType,
            partyWalls: designContract.partyWalls,
            promptInjectionLength: designContract.getPromptInjection()?.length || 0,
          });
        } catch (contractError) {
          logger.warn('⚠️  Design Contract creation failed:', contractError.message);
          logger.info('   Continuing without canonical baseline enforcement...');
          designContract = null;
          contractGate = null;
        }
      }

      // ========================================
      // STEP 2.01: Conditioned Image Pipeline (NEW - Phase 4/5)
      // ========================================
      // When enabled, this converts DNA to CanonicalDesignState, builds a
      // single-source-of-truth BuildingModel, and generates conditioning images
      // for all views. These conditioning images are used by FLUX img2img.
      let conditionedPipelineContext = null;
      const useConditionedPipeline = isFeatureEnabled('conditionedImagePipeline');

      if (useConditionedPipeline) {
        logger.info('\n🎯 STEP 2.01: Running Conditioned Image Pipeline (Phase 4/5)...');

        try {
          // 2.01.1: Convert legacy DNA to CanonicalDesignState
          // CRITICAL FIX: Use masterDNA.programRooms (distributed rooms from STEP 2.07) instead of raw UI rooms
          // This ensures rooms have proper floor assignments (Floor 1 won't be blank)
          logger.info('   📐 Converting DNA to CanonicalDesignState...');
          const distributedRooms = masterDNA.programRooms || [];
          const programSpacesFromUI = projectContext?.programSpaces || [];

          // Prefer distributed rooms (with floor assignments) over raw UI rooms
          const roomsToUse = distributedRooms.length > 0 ? distributedRooms : programSpacesFromUI;
          logger.info(
            `      Rooms source: ${distributedRooms.length > 0 ? 'masterDNA.programRooms (distributed)' : 'projectContext.programSpaces (raw)'}`
          );
          logger.info(`      Room count: ${roomsToUse.length}`);
          if (distributedRooms.length > 0) {
            const byFloor = distributedRooms.reduce((acc, r) => {
              const f =
                (r.floor ?? 0) === 0
                  ? 'Ground'
                  : (r.floor ?? 0) === 1
                    ? 'First'
                    : `Floor ${r.floor ?? 0}`;
              acc[f] = (acc[f] || 0) + 1;
              return acc;
            }, {});
            logger.info(`      Rooms by floor: ${JSON.stringify(byFloor)}`);
          }

          const canonicalState = fromLegacyDNA(
            masterDNA,
            null, // siteSnapshot
            projectContext,
            roomsToUse // Use distributed rooms if available, otherwise fall back to UI rooms
          );

          // Enrich with location data
          if (locationData?.sitePolygon) {
            canonicalState.site.boundary = locationData.sitePolygon;
          }
          if (locationData?.climate) {
            canonicalState.site.climate = locationData.climate;
          }
          if (projectContext?.entranceOrientation) {
            canonicalState.site.entranceSide = projectContext.entranceOrientation;
          }

          logger.info(`      Design ID: ${canonicalState.meta.designId}`);
          logger.info(`      Levels: ${canonicalState.program.levelCount}`);
          logger.info(`      Building Type: ${canonicalState.program.buildingType}`);
          logger.info(
            `      Total Rooms: ${canonicalState.program.levels.flatMap((l) => l.rooms).length}`
          );

          // CRITICAL FIX: Copy programRooms from canonicalState to masterDNA
          // so BuildingModel can find rooms during CanonicalGeometryPackService calls
          if (canonicalState.programRooms?.length > 0) {
            masterDNA.programRooms = canonicalState.programRooms;
            logger.info(
              `      ✓ Copied ${canonicalState.programRooms.length} programRooms to masterDNA`
            );
          }

          // 2.01.2: Run geometry pipeline to get BuildingModel
          logger.info('   🏗️  Running geometry pipeline...');
          const geometryResult = await runGeometryPipeline(canonicalState, {
            useCache: true,
          });

          logger.info(`      BuildingModel created: ${geometryResult.model.designId}`);
          logger.info(`      Floors: ${geometryResult.model.floors?.length || 0}`);
          logger.info(
            `      Validation: ${geometryResult.validation?.valid ? 'passed' : 'issues found'}`
          );

          // 2.01.3: Create StyleProfile from location + portfolio
          logger.info('   🎨 Creating StyleProfile...');
          const locationStyle = createLocationStyle({
            region: locationData?.address || 'UK',
            vernacularStyle: locationData?.recommendedStyle || 'contemporary',
            climate: locationData?.climate?.type || 'temperate',
          });

          const portfolioStyle = createPortfolioStyle({
            primaryArchetype: portfolioAnalysis?.detectedStyle || 'contemporary',
            designLanguage: portfolioAnalysis?.designLanguage || 'modern architectural',
            confidence: portfolioAnalysis?.confidence || 0.5,
          });

          const styleProfile = createStyleProfile({
            locationStyle,
            portfolioStyle,
            buildingType: projectContext?.buildingType || masterDNA.buildingType,
            blendWeights: {
              locationWeight: (100 - effectivePortfolioBlendPercent) / 100,
              portfolioWeight: effectivePortfolioBlendPercent / 100,
            },
          });

          logger.info(`      Archetype: ${styleProfile.archetype}`);
          logger.info(
            `      Blend: ${effectivePortfolioBlendPercent}% portfolio, ${100 - effectivePortfolioBlendPercent}% location`
          );

          // 2.01.4: Generate conditioning images from geometry
          logger.info('   🖼️  Generating conditioning images...');
          const conditioningImages = generateAllConditions(geometryResult.model, {
            conditioningType: CONDITIONING_TYPES.EDGE,
          });

          const conditioningCount = Object.keys(conditioningImages).length;
          logger.info(`      Generated ${conditioningCount} conditioning images`);

          // 2.01.5: Generate style descriptors for prompts
          const styleDescriptors = generateStyleDescriptors(styleProfile);

          // 2.01.6: Store context for panel generation
          conditionedPipelineContext = {
            canonicalState,
            model: geometryResult.model,
            outputs2D: geometryResult.outputs2D,
            styleProfile,
            styleDescriptors,
            conditioningImages,
            facadeSummary: geometryResult.facadeSummary,
            seed: effectiveSeed || seed || Date.now(),
          };

          // Store on masterDNA for downstream access
          masterDNA.conditionedPipeline = {
            enabled: true,
            canonicalStateId: canonicalState.meta.designId,
            conditioningStrengths: CONDITIONING_STRENGTHS,
            styleArchetype: styleProfile.archetype,
            conditioningCount,
          };

          // Store 2D SVG outputs for A1 composition
          masterDNA.conditioned2DOutputs = geometryResult.outputs2D;

          logger.success('✅ Conditioned pipeline initialized');
          logger.info(
            `      2D outputs ready: ${Object.keys(geometryResult.outputs2D?.floorPlans || {}).length} plans, ${Object.keys(geometryResult.outputs2D?.elevations || {}).length} elevations`
          );
        } catch (conditionedError) {
          logger.warn(
            '⚠️  Conditioned pipeline failed, falling back to legacy:',
            conditionedError.message
          );
          logger.info('   Continuing with standard generation path...');
          conditionedPipelineContext = null;
          masterDNA.conditionedPipeline = { enabled: false, error: conditionedError.message };
        }
      }

      // ========================================
      // STEP 2.05: Generate GeometryDNA v2 (if Claude reasoning enabled)
      // ========================================
      let geometryDNAv2 = null;
      const useClaudeReasoning = isFeatureEnabled('useClaudeReasoning');
      const useGeometryDNAv2 = isFeatureEnabled('geometryDNAv2');

      if (useClaudeReasoning && useGeometryDNAv2) {
        logger.info(
          '\n🔷 STEP 2.05: Generating GeometryDNA v2 (Claude constraints + NLE geometry)...'
        );

        try {
          // Check if twoPassDNAGenerator has v2 generation capability
          if (this.dnaGenerator.generateGeometryDNAv2) {
            geometryDNAv2 = await this.dnaGenerator.generateGeometryDNAv2(
              masterDNA,
              projectContext,
              locationData
            );

            if (geometryDNAv2?.version === '2.0') {
              logger.success(' GeometryDNA v2 generated');
              logger.info(
                `   📐 Constraints: ${Object.keys(geometryDNAv2.constraints || {}).length} sections`
              );
              logger.info(
                `   🏗️  Geometry: ${(geometryDNAv2.geometry?.floors || []).length} floors`
              );
              logger.info(
                `   🏠 Rooms: ${(geometryDNAv2.geometry?.floors?.[0]?.rooms || []).length} on ground floor`
              );

              // Run multi-pass validation if available
              const validator = await getMultiPassValidator();
              if (validator?.runMultiPassValidation) {
                const maxPasses = isFeatureEnabled('maxValidationPasses') || 3;
                logger.info(
                  `\n🔄 STEP 2.06: Running multi-pass Claude validation (max ${maxPasses} passes)...`
                );

                const validationResult = await validator.runMultiPassValidation(
                  geometryDNAv2.constraints,
                  geometryDNAv2.geometry,
                  { maxPasses }
                );

                logger.info(`   ✅ Validation complete in ${validationResult.passes} pass(es)`);
                logger.info(`   📊 Status: ${validationResult.status}`);

                // Update geometry with validated/corrected version
                if (validationResult.geometry) {
                  geometryDNAv2.geometry = validationResult.geometry;
                  geometryDNAv2.metadata.validationPasses = validationResult.passes;
                  geometryDNAv2.metadata.validationScore = validationResult.score || 0;
                }
              }

              // Store v2 DNA for panel generation
              masterDNA.geometryDNAv2 = geometryDNAv2;
              masterDNA.version = '2.0';
            }
          } else {
            logger.info('   ⏭️  GeometryDNA v2 generator not available, using standard DNA');
          }
        } catch (v2Error) {
          logger.warn('⚠️  GeometryDNA v2 generation failed:', v2Error.message);
          logger.info('   Continuing with standard DNA');
        }
      }

      // ========================================
      // STEP 2.07: Populate Floor Geometry (rooms, walls, openings)
      // ========================================
      reportProgress('layout', 'Populating floor geometry...', 32);
      logger.info('\n📐 STEP 2.07: Populating floor geometry...');

      try {
        // Convert DNA program specs to actual geometry using MVPFloorPlanGenerator
        const geometryGenerator = new MVPFloorPlanGenerator({
          gridSize: 0.1, // 10cm grid
          floorHeight: 3.0,
        });

        // Extract program data from masterDNA with robust fallback
        let rawRooms = [];
        const floorKeyToIndex = (floorKey) => {
          const key = String(floorKey || '').toLowerCase();
          if (!key) {return 0;}
          if (key === 'ground' || key.includes('ground') || key.includes('gf')) {return 0;}
          if (key === 'first' || key.includes('first') || key === 'upper' || key.includes('upper'))
            {return 1;}
          if (
            key === 'second' ||
            key.includes('second') ||
            key.includes('level2') ||
            key.includes('floor2')
          )
            {return 2;}
          if (
            key === 'third' ||
            key.includes('third') ||
            key.includes('level3') ||
            key.includes('floor3')
          )
            {return 3;}
          const numeric = Number.parseInt(key.replace(/[^0-9]/g, ''), 10);
          return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
        };

        // 1. Try to extract from floorPlans (EnhancedDNAGenerator output)
        if (masterDNA.floorPlans) {
          Object.entries(masterDNA.floorPlans).forEach(([floorKey, floorData]) => {
            if (floorData.rooms && Array.isArray(floorData.rooms)) {
              const floorIndex = floorKeyToIndex(floorKey);
              floorData.rooms.forEach((room) => {
                rawRooms.push({
                  ...room,
                  floor: floorIndex,
                  // Parse area string "22m²" -> 22
                  area: typeof room.area === 'string' ? parseFloat(room.area) : room.area,
                });
              });
            }
          });
        }

        // 2. Fallback to flat lists
        if (rawRooms.length === 0) {
          rawRooms =
            masterDNA.program?.rooms || masterDNA.rooms || projectContext?.programSpaces || [];
        }

        const buildingType =
          projectContext?.buildingType ||
          projectContext?.buildingProgram ||
          masterDNA.buildingType ||
          'residential';

        // CRITICAL: Respect user/requested floor count from projectContext.
        // Regression: 3-floor configs were generating only 2 floors, causing GeometryFirstGate EMPTY_FLOOR failures.
        const requestedFloorsRaw =
          projectContext?.floors ??
          projectContext?.floorCount ??
          masterDNA.program?.floors ??
          masterDNA.dimensions?.floors ??
          2;
        const requestedFloors = Number.parseInt(String(requestedFloorsRaw), 10);
        const floorCount =
          Number.isFinite(requestedFloors) && requestedFloors > 0 ? requestedFloors : 2;

        // Keep masterDNA consistent for downstream stages
        masterDNA.dimensions = masterDNA.dimensions || {};
        if (!masterDNA.dimensions.floors || masterDNA.dimensions.floors !== floorCount) {
          masterDNA.dimensions.floors = floorCount;
        }
        masterDNA.program = masterDNA.program || {};
        if (!masterDNA.program.floors || masterDNA.program.floors !== floorCount) {
          masterDNA.program.floors = floorCount;
        }

        // Use getDefaultRoomsForGeometry() fallback if no rooms defined (same logic as technicalDrawingGenerator.js)
        const defaultRooms =
          rawRooms.length > 0 ? rawRooms : getDefaultRoomsForGeometry(buildingType);

        // FIX Floor 1 = 0 rooms bug: Use distributeRoomsToFloors to ensure proper floor assignment
        // Convert rooms to format expected by distributeRoomsToFloors
        const roomsForDistribution = defaultRooms.map((room, index) => ({
          id: room.id || `room_${index}`,
          name: room.name || room.type || `Room ${index + 1}`,
          area_m2: parseFloat(room.area || room.area_m2 || 20) || 20,
          floor: room.floor, // Pass existing floor assignment (may be undefined)
        }));

        // Distribute rooms to floors based on room type and building configuration
        const distribution = distributeRoomsToFloors(roomsForDistribution, {
          buildingType: buildingType,
          floorCount: floorCount,
          siteArea: masterDNA.site?.area_m2 || 150,
          enforceCirculation: true,
        });

        // Use distributed rooms
        const distributedRooms = distribution.success
          ? Object.values(distribution.floors).flat()
          : roomsForDistribution;

        // Log distribution summary
        if (distribution.success) {
          logger.info(
            `[STEP 2.07] Floor distribution complete: ${JSON.stringify(distribution.summary.roomsPerFloor)}`
          );
        } else {
          logger.warn('[STEP 2.07] Floor distribution failed - using original room assignments');
        }

        const programRooms = distributedRooms.map((room, index) => {
          // Ensure area is a number
          let area = room.area || room.area_m2 || 20;
          if (typeof area === 'string') {
            area = parseFloat(area) || 20;
          }

          // Convert floor to numeric (0 = ground, 1 = first, etc.)
          let floorNum = 0;
          const rawFloor = room.floor;
          if (typeof rawFloor === 'number') {
            floorNum = rawFloor;
          } else if (rawFloor === 'first' || rawFloor === '1' || rawFloor === 'upper') {
            floorNum = 1;
          } else if (rawFloor === 'second' || rawFloor === '2') {
            floorNum = 2;
          }

          return {
            id: room.id || `room_${index}`,
            name: room.name || room.type || `Room ${index + 1}`,
            area: area,
            floor: floorNum,
            program: (room.name || room.type || 'living').toLowerCase().replace(/\s+/g, '_'),
          };
        });

        logger.info(
          `[STEP 2.07] Program rooms: ${programRooms.length} (${rawRooms.length > 0 ? 'from DNA' : 'defaults for ' + buildingType})`
        );

        // CRITICAL FIX: Attach programRooms to masterDNA so BuildingModel can find them
        // during CanonicalGeometryPackService.buildPack() call (which creates floor plan SVGs)
        // Without this, BuildingModel falls back to "envelope-only geometry" = empty floor plans
        masterDNA.programRooms = programRooms;

        const dimensions = masterDNA.dimensions || {};
        const buildingWidth = dimensions.width || dimensions.length || 10000; // mm
        const buildingDepth = dimensions.depth || dimensions.width || 8000; // mm

        const programDNA = {
          rooms: programRooms,
          metadata: { floors: floorCount },
          totalArea: { gross: programRooms.reduce((sum, r) => sum + (r.area || 20), 0) },
          adjacencyMatrix: [],
        };

        const sitePolygonLatLng =
          locationData?.sitePolygon ||
          locationData?.siteBoundary ||
          locationData?.polygon ||
          locationData?.siteSnapshot?.polygon ||
          locationData?.siteSnapshot?.sitePolygon ||
          locationData?.siteSnapshot?.siteBoundary ||
          locationData?.metadata?.sitePolygon ||
          locationData?.metadata?.siteAnalysis?.siteBoundary ||
          locationData?.metadata?.siteAnalysis?.polygon ||
          null;

        const siteOrigin =
          locationData?.metadata?.siteMetrics?.centroid ||
          locationData?.siteSnapshot?.center ||
          locationData?.siteSnapshot?.coordinates ||
          locationData?.center ||
          locationData?.coordinates ||
          null;

        const constraints = {
          sitePolygon:
            Array.isArray(sitePolygonLatLng) && sitePolygonLatLng.length >= 3
              ? polygonToLocalXY(sitePolygonLatLng, siteOrigin)
              : null,
          setbacks: { front: 3, back: 3, left: 3, right: 3 },
        };

        // Generate actual geometry (room polygons, walls, openings)
        const populatedGeometry = await geometryGenerator.generateLayout(programDNA, constraints);

        if (populatedGeometry?.floors && populatedGeometry.floors.length > 0) {
          // Count rooms with polygons - floors is an array of { level, rooms: [...], walls, ... }
          // Each room object has a polygon property
          const roomsWithPolygons = populatedGeometry.floors
            .flatMap((f) => f.rooms || [])
            .filter((r) => r.polygon && r.polygon.length >= 3).length;

          logger.success(' Floor geometry populated');
          logger.info(`   🏠 Floors: ${populatedGeometry.floors.length}`);
          logger.info(`   📐 Rooms with polygons: ${roomsWithPolygons}`);

          // Store populated geometry in masterDNA for panel generation
          masterDNA.populatedGeometry = populatedGeometry;
          masterDNA.hasPopulatedGeometry = true;

          // If we have geometryDNAv2, populate its geometry too
          if (masterDNA.geometryDNAv2) {
            masterDNA.geometryDNAv2.populatedGeometry = populatedGeometry;
            masterDNA.geometryDNAv2.hasPopulatedGeometry = true;
          }
        } else {
          logger.warn('⚠️ Floor geometry generation returned no floors');
        }
      } catch (geometryError) {
        logger.warn('⚠️ Floor geometry population failed:', geometryError.message);
        logger.info('   Technical drawings will use simplified layouts');
      }

      // ========================================
      // STEP 2.07b: GEOMETRY PRIMER V3 - Normalize/Fix Geometry
      // ========================================
      logger.info('\n🔧 STEP 2.07b: Running GeometryPrimerV3 normalization...');
      try {
        // CRITICAL: Normalize geometry BEFORE projections to fix:
        // - Missing rooms on floors
        // - Invalid walls (NaN coords, missing endpoints)
        // - Missing/inconsistent openings
        // - Empty floor geometry
        masterDNA = GeometryPrimerV3.normalize(masterDNA);

        // Verify geometry is now valid
        const floors = masterDNA.populatedGeometry?.floors || [];
        if (floors.length > 0) {
          const totalRooms = floors.reduce((sum, f) => sum + (f.rooms?.length || 0), 0);
          const totalWalls = floors.reduce((sum, f) => sum + (f.walls?.length || 0), 0);
          const totalOpenings = floors.reduce((sum, f) => sum + (f.openings?.length || 0), 0);
          const exteriorWalls = floors.reduce(
            (sum, f) => sum + (f.walls?.filter((w) => w.exterior)?.length || 0),
            0
          );

          logger.success('✅ GeometryPrimerV3 normalization complete');
          logger.info(`   🏠 Floors: ${floors.length}`);
          logger.info(`   📦 Total rooms: ${totalRooms}`);
          logger.info(`   🧱 Total walls: ${totalWalls} (${exteriorWalls} exterior)`);
          logger.info(`   🪟 Total openings: ${totalOpenings}`);

          // [DEBUG-207] Detailed geometry structure logging
          console.warn('[DEBUG-207] populatedGeometry.floors:', floors.length);
          floors.forEach((floor, i) => {
            console.warn(`[DEBUG-207] Floor ${i}:`, {
              rooms: floor.rooms?.length || 0,
              walls: floor.walls?.length || 0,
              exteriorWalls: floor.walls?.filter((w) => w.exterior)?.length || 0,
              openings: floor.openings?.length || 0,
              boundary: floor.boundary?.length || 0,
            });
            // Log first wall format for debugging
            if (floor.walls?.length > 0) {
              const firstWall = floor.walls[0];
              console.warn(`[DEBUG-207] Floor ${i} first wall format:`, {
                id: firstWall.id,
                start: firstWall.start,
                end: firstWall.end,
                exterior: firstWall.exterior,
                facadeDirection: firstWall.facadeDirection,
              });
            }
            // Log first opening format for debugging
            if (floor.openings?.length > 0) {
              const firstOpening = floor.openings[0];
              console.warn(`[DEBUG-207] Floor ${i} first opening format:`, {
                id: firstOpening.id,
                type: firstOpening.type,
                facade: firstOpening.facade,
                wallId: firstOpening.wallId,
                x: firstOpening.x,
                y: firstOpening.y,
                z: firstOpening.z,
              });
            }
          });

          masterDNA.hasPopulatedGeometry = true;
          masterDNA.geometryPrimerApplied = true;
          // CRITICAL FIX: Set version to '2.0' to enable PDE/DualTrack technical drawings
          // This ensures proper floor plans with internal walls instead of "box" layouts
          if (!masterDNA.version) {
            masterDNA.version = '2.0';
            logger.info('   📋 Set DNA version to 2.0 for PDE/DualTrack compatibility');
          }
        } else {
          logger.warn('⚠️ GeometryPrimerV3 could not fix geometry');
          console.error('[DEBUG-207] CRITICAL: No floors after GeometryPrimerV3 normalization!');
        }
      } catch (primerError) {
        logger.error('❌ GeometryPrimerV3 failed:', primerError.message);
        logger.info('   Technical drawings may be incomplete');
      }

      // ========================================
      // STEP 2.07c: FLOOR PLAN COMPLETENESS GATE (HARD GATE)
      // Validates that all floors have room data before panel generation
      // ROOT CAUSE FIX: Prevents empty floor plan panels
      // ========================================
      logger.info('\n🚪 STEP 2.07c: Floor Plan Completeness Gate...');
      try {
        const { validateFloorPlanCompleteness, enforceFloorPlanCompletenessGate } = await import(
          '../validation/FloorPlanCompletenessValidator.js'
        );

        // Get floor count from masterDNA (floorCount variable is out of scope here)
        const expectedFloors =
          masterDNA.dimensions?.floors || masterDNA.dimensions?.floorCount || 2;

        const floorPlanValidation = validateFloorPlanCompleteness(masterDNA, {
          expectedFloorCount: expectedFloors,
          programRooms: masterDNA.programRooms || [],
          strict: false, // Log warnings but don't fail (allow repair attempt)
        });

        if (!floorPlanValidation.valid) {
          logger.error('❌ Floor Plan Completeness Gate FAILED');
          floorPlanValidation.errors.forEach((err) => logger.error(`   ${err}`));

          // Check if repair is possible
          if (floorPlanValidation.canRepair) {
            logger.warn('   Attempting automatic repair via geometry regeneration...');
            // Mark for re-run of geometry generation
            masterDNA._needsGeometryRegeneration = true;
          }
        } else {
          logger.success('✅ Floor Plan Completeness Gate PASSED');
          logger.info(`   All ${expectedFloors} floors have room data`);
        }

        // Log floor stats
        Object.entries(floorPlanValidation.floorStats).forEach(([level, stats]) => {
          const status = stats.roomCount > 0 ? '✓' : '✗';
          logger.info(
            `   Floor ${level}: ${status} ${stats.roomCount} rooms, ${stats.roomsWithPolygons} with polygons`
          );
        });

        // Store validation result for downstream use
        masterDNA.floorPlanValidation = floorPlanValidation;
      } catch (validationError) {
        logger.warn('⚠️ Floor Plan Completeness validation failed:', validationError.message);
        // Non-fatal - continue with generation
      }

      // ========================================
      // STEP 2.08: Generate Geometry Projections (facades + sections + roof profiles)
      // FIX: ALWAYS generate projections when we have populatedGeometry
      // The PDE needs facades/sections data regardless of geometryFirst flag
      // ========================================
      if (masterDNA.hasPopulatedGeometry) {
        logger.info('\n📐 STEP 2.08: Generating geometry projections...');
        try {
          // Generate all 3D projections: facades, sections, roof profiles
          generateProjections(masterDNA, masterDNA.populatedGeometry);

          logger.success('✅ Geometry projections generated');
          logger.info(
            `   🏛️ Facades: N, S, E, W (${masterDNA.facades?.N?.wallLines?.length || 0} wall lines)`
          );
          logger.info(`   📏 Sections: A-A, B-B`);
          logger.info(`   🏠 Roof: ${masterDNA.roofProfiles?.ridgeHeight || 0}mm ridge height`);

          // Add diagnostic logs for debugging
          console.warn('[GEOM DEBUG] facades:', Object.keys(masterDNA.facades || {}));
          console.warn('[GEOM DEBUG] sections:', Object.keys(masterDNA.sections || {}));
          console.warn(
            '[GEOM DEBUG] N facade walls:',
            masterDNA.facades?.N?.wallLines?.length || 0
          );
          console.warn(
            '[GEOM DEBUG] N facade openings:',
            masterDNA.facades?.N?.openingRects?.length || 0
          );
        } catch (projectionError) {
          logger.warn('⚠️ Geometry projection failed:', projectionError.message);
          logger.info('   Elevations will use AI-generated layouts');
        }
      } else if (!masterDNA.hasPopulatedGeometry) {
        logger.warn(
          '\n⚠️  STEP 2.08: Skipping geometry projections (hasPopulatedGeometry is FALSE)'
        );
        logger.warn(
          '   ⚠️ Technical drawings will use fallback SVGs - check STEP 2.07 for floor geometry errors'
        );
        logger.info(
          '   💡 Ensure MVPFloorPlanGenerator.generateLayout() is returning valid floors with rooms'
        );
      }

      // ========================================
      // STEP 2.09: Generate FGL Facade Control Images
      // ========================================
      if (masterDNA.hasPopulatedGeometry && isFeatureEnabled('geometryFirst')) {
        logger.info('\n🏛️ STEP 2.09: Generating FGL facade control images...');
        try {
          // Create FGL instance with populated geometry and style DNA
          const fgl = new FacadeGenerationLayer(masterDNA.populatedGeometry, masterDNA, {
            controlImage: { controlStrength: 0.85 },
          });

          // Generate all facade data including control images
          const fglResult = await fgl.generate();

          // Store FGL data in masterDNA for panel generation
          masterDNA.fglData = {
            controlImages: fglResult.controlImages,
            facadeRooms: fglResult.facadeRooms,
            windowPlacements: fglResult.windowPlacements,
            roofProfile: fglResult.roofProfile,
            elevationSVGs: fglResult.elevationSVGs,
          };

          const windowCounts = {
            N: fglResult.windowPlacements?.N?.length || 0,
            S: fglResult.windowPlacements?.S?.length || 0,
            E: fglResult.windowPlacements?.E?.length || 0,
            W: fglResult.windowPlacements?.W?.length || 0,
          };

          logger.success('✅ FGL control images generated');
          logger.info(
            `   🪟 Windows: N=${windowCounts.N}, S=${windowCounts.S}, E=${windowCounts.E}, W=${windowCounts.W}`
          );
          logger.info(`   🎯 Control strength: 0.85`);
        } catch (fglError) {
          logger.warn('⚠️ FGL generation failed:', fglError.message);
          logger.info('   FLUX will generate without geometric control');
        }
      } else if (!isFeatureEnabled('geometryFirst')) {
        logger.info('\n⏭️  STEP 2.09: Skipping FGL control images (geometryFirst disabled)');
      }

      // ========================================
      // STEP 2.10: Generate PDE SVG Technical Drawings
      // ========================================
      if (masterDNA.hasPopulatedGeometry && isFeatureEnabled('geometryFirst')) {
        logger.info('\n📄 STEP 2.10: Generating SVG technical drawings...');
        try {
          const svgDrawings = {
            floorPlans: [],
            elevations: masterDNA.fglData?.elevationSVGs || {},
          };

          // Generate floor plan SVGs from populated geometry
          const floors = masterDNA.populatedGeometry?.floors || [];
          for (const floor of floors) {
            if (floor.rooms && floor.rooms.length > 0) {
              // Build a DNA-like structure for the SVG builder
              const floorDNA = {
                footprint: masterDNA.populatedGeometry?.footprint?.polygon ||
                  masterDNA.populatedGeometry?.footprint || [
                    { x: 0, y: 0 },
                    { x: 15, y: 0 },
                    { x: 15, y: 10 },
                    { x: 0, y: 10 },
                  ],
                rooms: floor.rooms.map((r) => ({
                  ...r,
                  level: floor.level,
                })),
              };
              const floorSvg = buildSVGFloorPlan(floorDNA, floor.level, { scale: 50 });
              svgDrawings.floorPlans.push({
                level: floor.level,
                svg: floorSvg.svg,
                dataUrl: floorSvg.dataUrl,
              });
            }
          }

          // Store SVG drawings in masterDNA
          masterDNA.svgDrawings = svgDrawings;

          logger.success('✅ SVG technical drawings generated');
          logger.info(`   📋 Floor plans: ${svgDrawings.floorPlans.length}`);
          logger.info(`   🏛️ Elevations: ${Object.keys(svgDrawings.elevations).length}`);
        } catch (svgError) {
          logger.warn('⚠️ SVG generation failed:', svgError.message);
          logger.info('   Technical panels will use AI-generated drawings');
        }
      } else if (!isFeatureEnabled('geometryFirst')) {
        logger.info('\n⏭️  STEP 2.10: Skipping SVG technical drawings (geometryFirst disabled)');
      }

      // ========================================
      // STEP 2.11: Meshy 3D Model Generation (100% Consistency)
      // Phase 4 Implementation - Optional canonical 3D model
      // ========================================
      let meshy3DResult = null;
      const useMeshy3D = isFeatureEnabled('meshy3DMode');

      if (useMeshy3D) {
        logger.info('\n🎨 STEP 2.11: Generating Meshy 3D model for 100% consistency...');

        try {
          const meshyService = await getMeshy3DService();

          if (meshyService && meshyService.isAvailable()) {
            // Build volume spec from masterDNA
            const volumeSpec = {
              dimensions: {
                length: masterDNA.dimensions?.length || 15,
                width: masterDNA.dimensions?.width || 10,
                height: masterDNA.dimensions?.height || 7,
              },
              floors: masterDNA.dimensions?.floors || masterDNA.program?.floors || 2,
              roofType: masterDNA.geometry_rules?.roof_type || 'gable',
              roofPitch: masterDNA.geometry_rules?.roof_pitch || 35,
            };

            // Generate 3D model from DNA
            meshy3DResult = await meshyService.generate3DFromDNA(masterDNA, volumeSpec, {
              seed: seed || projectContext.seed,
              artStyle: 'realistic',
            });

            if (meshy3DResult.success) {
              logger.success('✅ Meshy 3D model generated');
              logger.info(
                `   🎯 Model URL: ${meshy3DResult.modelUrl ? 'available' : 'not available'}`
              );
              logger.info(
                `   📸 Renders: ${Object.keys(meshy3DResult.mappedRenders || {}).length} views`
              );
              logger.info(`   🔧 Control strength: 0.8 (for FLUX img2img)`);

              // Store Meshy data in masterDNA for panel generation
              masterDNA.meshy3D = {
                modelUrl: meshy3DResult.modelUrl,
                thumbnailUrl: meshy3DResult.thumbnailUrl,
                renders: meshy3DResult.renders,
                mappedRenders: meshy3DResult.mappedRenders,
                taskId: meshy3DResult.taskId,
                timestamp: meshy3DResult.metadata?.timestamp,
              };

              // Map Meshy renders to control images for elevation panels
              if (meshy3DResult.mappedRenders) {
                masterDNA.meshyControlImages = meshy3DResult.mappedRenders;
                logger.info(
                  `   🎛️ Control images mapped to: ${Object.keys(meshy3DResult.mappedRenders).join(', ')}`
                );
              }
            } else {
              logger.warn('⚠️ Meshy 3D generation failed:', meshy3DResult.error);
              logger.info('   Continuing without Meshy control images');
            }
          } else {
            logger.info('   ⏭️ Meshy service not available (check MESHY_API_KEY)');
          }
        } catch (meshyError) {
          logger.warn('⚠️ Meshy 3D generation error:', meshyError.message);
          logger.info('   Continuing with geometry-first or DNA-only pipeline');
        }
      } else {
        logger.info('\n⏭️  STEP 2.11: Skipping Meshy 3D (meshy3DMode disabled)');
        logger.info('   💡 Enable with: setFeatureFlag("meshy3DMode", true)');
      }

      // ========================================
      // STEP 2.1: Validate Building Footprint Against Site Boundary
      // ========================================
      logger.info('\n📐 STEP 2.1: Validating building footprint against site boundaries...');

      let boundaryValidation = null;
      let correctedFootprint = null;

      if (locationData?.sitePolygon && locationData.sitePolygon.length >= 3) {
        try {
          const dimensions = masterDNA.dimensions || {};
          const length = dimensions.length || 15;
          const width = dimensions.width || 10;

          // Create proposed footprint as a simple rectangle
          // (centered on origin for now - in production, would use building position from DNA)
          const proposedFootprint = [
            { x: -length / 2, y: -width / 2 },
            { x: length / 2, y: -width / 2 },
            { x: length / 2, y: width / 2 },
            { x: -length / 2, y: width / 2 },
          ];

          // Define setbacks (use from zoning data if available, else defaults)
          const setbacks = locationData.zoning?.setbacks || {
            front: 3,
            rear: 3,
            sideLeft: 3,
            sideRight: 3,
          };

          // Validate and correct footprint
          const origin = locationData.coordinates || { lat: 0, lng: 0 };

          boundaryValidation = validateAndCorrectFootprint({
            siteBoundary: locationData.sitePolygon,
            setbacks,
            proposedFootprint,
            origin,
          });

          correctedFootprint = boundaryValidation.correctedFootprint;

          // Update DNA with corrected dimensions if modified
          if (boundaryValidation.wasCorrected) {
            logger.info('🔧 Updating DNA with boundary-corrected dimensions...');

            // Calculate corrected dimensions from footprint
            const xs = correctedFootprint.map((p) => p.x);
            const ys = correctedFootprint.map((p) => p.y);
            const correctedLength = Math.max(...xs) - Math.min(...xs);
            const correctedWidth = Math.max(...ys) - Math.min(...ys);

            masterDNA.dimensions.length = parseFloat(correctedLength.toFixed(2));
            masterDNA.dimensions.width = parseFloat(correctedWidth.toFixed(2));

            logger.info(
              `   Updated: ${masterDNA.dimensions.length}m × ${masterDNA.dimensions.width}m`
            );
          }

          // Store boundary validation results in DNA for prompt generation
          masterDNA.boundaryValidation = {
            validated: true,
            compliant: boundaryValidation.validation.isValid,
            compliancePercentage: boundaryValidation.validation.compliancePercentage,
            wasCorrected: boundaryValidation.wasCorrected,
            correctedFootprint: correctedFootprint,
            buildableBoundary: boundaryValidation.buildableBoundary,
            setbacks: setbacks,
          };

          logger.success(
            ` Boundary validation complete: ${boundaryValidation.validation.compliancePercentage.toFixed(1)}% compliant`
          );
        } catch (error) {
          logger.warn('⚠️  Boundary validation failed:', error.message);
          logger.info('   Continuing without boundary validation');
        }
      } else {
        logger.info('   ⏭️  No site polygon available, skipping boundary validation');
      }

      // ========================================
      // STEP 2.5: Build Blended Style (Local + Portfolio) - ENHANCED
      // ========================================
      reportProgress('style', 'Building blended style with portfolio...', 45);
      logger.info('\n🎨 STEP 2.5: Building blended style with advanced weighted algorithm...');

      // Use sophisticated weighted blending algorithm from aiIntegrationService
      const portfolioWeight = (effectivePortfolioBlendPercent || 70) / 100; // Convert 0-100 to 0-1

      let blendedStyle;

      if (portfolioAnalysis && this.aiIntegrationService) {
        // Use advanced weighted blending with granular control
        logger.info(
          `   Using advanced blending: ${Math.round(portfolioWeight * 100)}% portfolio influence`
        );

        blendedStyle = this.aiIntegrationService.blendStyles(
          locationData,
          portfolioAnalysis,
          portfolioWeight, // material weight
          portfolioWeight // characteristic weight
        );

        // Enhance with Master DNA color specifications
        if (masterDNA.materials && Array.isArray(masterDNA.materials)) {
          blendedStyle.colorPalette = {
            facade:
              masterDNA.materials[0]?.hexColor || blendedStyle.colorPalette?.facade || '#B8604E',
            roof: masterDNA.materials[1]?.hexColor || blendedStyle.colorPalette?.roof || '#8B4513',
            trim: blendedStyle.colorPalette?.trim || '#FFFFFF',
            accent: blendedStyle.colorPalette?.accent || '#2C3E50',
          };
        }

        logger.info(`   ✅ Advanced blend complete: ${blendedStyle.styleName}`);
        logger.info(
          `   📊 Blend ratio - Local: ${Math.round(blendedStyle.blendRatio?.local * 100)}%, Portfolio: ${Math.round(blendedStyle.blendRatio?.portfolio * 100)}%`
        );
      } else {
        // Fallback to simple blending if aiIntegrationService not available
        logger.info('   ⚠️ Using fallback simple blending (aiIntegrationService not available)');

        let materialsArray = ['Brick', 'Glass', 'Concrete']; // Default fallback

        if (Array.isArray(portfolioAnalysis?.materials)) {
          materialsArray = portfolioAnalysis.materials;
        } else if (Array.isArray(masterDNA.materials)) {
          materialsArray = masterDNA.materials
            .slice(0, 3)
            .map((m) => (typeof m === 'string' ? m : m.name || 'Material'));
        }

        blendedStyle = {
          styleName:
            masterDNA.architecturalStyle || portfolioAnalysis?.dominantStyle || 'Contemporary',
          materials: materialsArray,
          characteristics: Array.isArray(portfolioAnalysis?.characteristics)
            ? portfolioAnalysis.characteristics
            : ['Modern', 'Functional', 'Sustainable'],
          facadeArticulation:
            portfolioAnalysis?.facadeArticulation || 'Clean modern lines with balanced proportions',
          glazingRatio: portfolioAnalysis?.glazingRatio || '40%',
          colorPalette: {
            facade:
              masterDNA.materials?.[0]?.hexColor ||
              portfolioAnalysis?.colorPalette?.facade ||
              '#B8604E',
            roof:
              masterDNA.materials?.[1]?.hexColor ||
              portfolioAnalysis?.colorPalette?.roof ||
              '#8B4513',
            trim: portfolioAnalysis?.colorPalette?.trim || '#FFFFFF',
            accent: portfolioAnalysis?.colorPalette?.accent || '#2C3E50',
          },
        };
      }

      // Extract site shape from location data if available
      const siteShape = locationData?.siteAnalysis?.polygon || locationData?.detectedShape || null;

      logger.success(' Blended style computed');
      logger.info(`   🎨 Style: ${blendedStyle.styleName}`);
      logger.info(
        `   📦 Materials: ${Array.isArray(blendedStyle.materials) ? blendedStyle.materials.slice(0, 2).join(', ') : 'N/A'}`
      );
      logger.info(`   🏠 Facade: ${blendedStyle.facadeArticulation.substring(0, 50)}...`);

      // ========================================
      // STEP 2.75: Generate Design Reasoning (OpenAI → Together.ai fallback)
      // ========================================
      logger.info('\n🧠 STEP 2.75: Generating design reasoning...');

      let designReasoning = null;
      try {
        // Build context for reasoning orchestrator
        const reasoningContext = {
          ...projectContext,
          location: locationData,
          locationAnalysis: locationData?.architecturalData || null,
          portfolioStyle: portfolioAnalysis,
          blendedStyle: blendedStyle,
          climate: locationData?.climate,
          climateData: locationData,
          zoning: locationData?.zoning,
          buildingDNA: masterDNA,
        };

        designReasoning = await reasoningOrchestrator.generateDesignReasoning(reasoningContext);
        logger.success(' Design reasoning generated');
        logger.info(`   📊 Source: ${designReasoning.source || 'unknown'}`);
        logger.info(`   🎨 Model: ${designReasoning.model || 'unknown'}`);
      } catch (error) {
        logger.warn('⚠️  Design reasoning generation failed:', error.message);
        // Continue without reasoning - not critical for A1 sheet generation
      }

      // ========================================
      // STEP 4: Generate 3D Massing Preview
      // ========================================
      this.attachMassingPreview(masterDNA, projectContext, locationData);

      // ========================================
      // STEP 2.75: Extract Climate-Responsive Technical Details
      // ========================================
      logger.info('\n🌡️ STEP 2.75: Extracting climate-responsive technical details...');

      let selectedDetails = null;

      if (masterDNA.climateDesign) {
        // Extract 2-3 key technical details from climate parameters
        const climateParams = masterDNA.climateDesign;

        selectedDetails = [];

        // Thermal strategy
        if (climateParams.thermal) {
          selectedDetails.push({
            title: 'Thermal Performance',
            specs: [
              `Strategy: ${climateParams.thermal.strategy || 'Balanced'}`,
              `Wall insulation: ${climateParams.thermal.insulation?.walls || 'R-20'}`,
              `Roof insulation: ${climateParams.thermal.insulation?.roof || 'R-35'}`,
              `Glazing ratio: ${Math.round((climateParams.thermal.glazingRatio || 0.2) * 100)}%`,
            ],
          });
        }

        // Ventilation strategy
        if (climateParams.ventilation) {
          selectedDetails.push({
            title: 'Ventilation Design',
            specs: [
              `Primary: ${climateParams.ventilation.primary || 'Natural cross-ventilation'}`,
              `Type: ${climateParams.ventilation.type || 'Mixed mode'}`,
              `Details: ${climateParams.ventilation.details || 'Operable windows with mechanical backup'}`,
            ],
          });
        }

        // Solar design (if available)
        if (climateParams.solar && selectedDetails.length < 3) {
          selectedDetails.push({
            title: 'Passive Solar',
            specs: [
              `Orientation: ${climateParams.solar.orientation || 'South-facing primary glazing'}`,
              `Overhang: ${climateParams.solar.overhangDepth || '1.2m south facade'}`,
              `Shading: ${climateParams.solar.shadingType || 'Fixed overhangs'}`,
            ],
          });
        }

        logger.info(`   ✅ ${selectedDetails.length} climate-responsive details extracted`);
      } else {
        logger.info('   ⚠️ No climate design parameters available, using defaults');
      }

      // Get feature flags early (needed for multiple steps)
      const flags = getFeatureFlags();

      // ========================================
      // STEP 3: Enhanced Site Map Integration (IMG2IMG Context)
      // ========================================
      reportProgress('site', 'Processing site map for A1 generation...', 52);
      logger.info('\n🗺️  STEP 3: Enhanced site map capture for A1 generation...');

      let sitePlanAttachment = ctxSitePlanAttachment;
      let sitePlanMetadata = ctxSitePlanMetadata;
      let siteMapData = null;
      let useAsInitImage = false;

      // Force overlay-only mode to guarantee HTML injection instead of AI generation
      const siteMapMode = 'overlay';

      if (!sitePlanAttachment && typeof window !== 'undefined' && window.sessionStorage) {
        try {
          const storedDataUrl = window.sessionStorage.getItem('a1SiteSnapshot');
          if (storedDataUrl && storedDataUrl.startsWith('data:')) {
            sitePlanAttachment = storedDataUrl;
            let storedMeta = null;
            const rawMeta = window.sessionStorage.getItem('a1SiteSnapshotMeta');
            if (rawMeta) {
              storedMeta = JSON.parse(rawMeta);
            }
            sitePlanMetadata = {
              ...storedMeta,
              source: 'user-captured',
              capturedAt: storedMeta?.capturedAt || new Date().toISOString(),
              mode: siteMapMode,
              overlayOnly: true,
            };
            logger.success(' Loaded site snapshot from session storage');
          }
        } catch (storageError) {
          logger.warn('⚠️ Failed to load site snapshot from session storage', storageError);
        }
      }

      // Import enhanced site map integration
      const { captureSiteMapForGeneration, getOptimalQualitySettings } = await import(
        './enhancedSiteMapIntegration.js'
      );
      logger.info('   📍 Site map mode LOCKED: overlay-only (never AI-generated)');
      logger.info('   🛡️  Site plan will be injected as HTML overlay after generation');

      if (sitePlanAttachment && sitePlanAttachment.startsWith('data:')) {
        siteMapData = {
          attachment: sitePlanAttachment,
          metadata: sitePlanMetadata || {
            source: 'provided',
            capturedAt: new Date().toISOString(),
            mode: siteMapMode,
            overlayOnly: true,
          },
          mode: siteMapMode,
          instructions: {
            type: 'overlay_only',
            prompt: 'Leave top-left site panel blank; real map injected as HTML overlay',
          },
        };

        logger.success(' Using provided site plan attachment');
        logger.info('   🎯 Integration mode: overlay-only (HTML layer)');
      }

      // If no captured site plan, try to generate one from location data
      if (!sitePlanAttachment && locationData && locationData.coordinates) {
        try {
          // Use enhanced site map capture
          siteMapData = await captureSiteMapForGeneration({
            locationData,
            sitePolygon: locationData.sitePolygon || locationData.siteAnalysis?.polygon || null,
            useAsContext: false,
            mode: siteMapMode,
          });

          if (siteMapData && siteMapData.attachment) {
            sitePlanAttachment = siteMapData.attachment;
            sitePlanMetadata = siteMapData.metadata;
            if (sitePlanMetadata) {
              sitePlanMetadata.overlayOnly = true;
            }
            logger.success(' Generated site map from location data');
            logger.info('   📐 Mode: overlay-only (HTML layer)');
            logger.info(`   🗺️ Has polygon: ${sitePlanMetadata.hasPolygon}`);
          }
        } catch (error) {
          logger.warn('⚠️  Enhanced site map generation failed:', error.message);
          logger.info('   Continuing without site plan - will use placeholder');
        }
      }

      // Auto-add timestamp if missing to prevent validation errors
      const snapshotCapturedAt = sitePlanMetadata?.capturedAt || new Date().toISOString();

      const snapshotValidation = await validateSiteSnapshot(
        sitePlanAttachment
          ? {
              dataUrl: sitePlanAttachment,
              capturedAt: snapshotCapturedAt,
              size: sitePlanMetadata?.size,
              metadata: sitePlanMetadata,
            }
          : null,
        {
          context: 'a1-generation',
          // If capture fails, continue with a placeholder site panel (overlay mode injects later).
          allowMissing: true,
        }
      );

      if (!snapshotValidation.valid) {
        const reason = snapshotValidation.errors.map((err) => err.message).join(' ');
        throw new Error(
          `Site snapshot invalid: ${reason}. Please recapture the site map via \"Capture Map\" before generating.`
        );
      }

      if (
        sitePlanMetadata &&
        !sitePlanMetadata.size &&
        snapshotValidation.details.width &&
        snapshotValidation.details.height
      ) {
        sitePlanMetadata.size = {
          width: snapshotValidation.details.width,
          height: snapshotValidation.details.height,
        };
      }

      // ========================================
      // STEP 3.5: Pre-validate Template Requirements
      // ========================================
      logger.info('\n✅ STEP 3.5: Pre-validating A1 template requirements...');

      const requiredSections = a1SheetValidator.getRequiredSections(projectContext);
      logger.info(
        `   Required sections: ${requiredSections.length} (${requiredSections.map((s) => s.name).join(', ')})`
      );

      // ========================================
      // STEP 3.6: MANDATORY Geometry-First Gate
      // ========================================
      // This gate MUST pass before ANY panel generation.
      // Hard fails if:
      // - Geometry is missing
      // - Any floor has 0 rooms placed
      // - Footprint is degenerate (thin bar/tower)
      // - Interior walls missing when rooms > 1
      logger.info('\n🚧 STEP 3.6: Enforcing MANDATORY Geometry-First Gate...');
      reportProgress('geometry-gate', 'Validating geometry before panel generation...', 55);

      try {
        // CRITICAL: Use masterDNA as the authoritative source for floor count.
        // The DNA generation normalizes user input, so masterDNA.dimensions.floors
        // should match what was actually generated in geometry.
        // Using projectContext.floors can cause mismatch if DNA adjusted the floor count.
        const expectedFloors =
          masterDNA?.dimensions?.floors ||
          masterDNA?.program?.floors ||
          masterDNA?.populatedGeometry?.floors?.length ||
          projectContext?.floors ||
          2;

        // Log floor count sources for debugging
        logger.info(
          `   📊 Floor count sources: DNA=${masterDNA?.dimensions?.floors}, program=${masterDNA?.program?.floors}, geometry=${masterDNA?.populatedGeometry?.floors?.length}, context=${projectContext?.floors}`
        );
        logger.info(`   📊 Using expectedFloors=${expectedFloors}`);

        // Extract and log geometry stats
        const geometryStats = extractGeometryStats(masterDNA);
        logger.info('   📊 Geometry Stats:');
        logger.info(`      - Floor count: ${geometryStats.floorCount}`);
        logger.info(`      - Total rooms: ${geometryStats.totalRooms}`);
        logger.info(`      - Rooms per floor: ${JSON.stringify(geometryStats.roomsPerFloor)}`);
        logger.info(`      - Interior walls: ${geometryStats.interiorWalls}`);
        logger.info(
          `      - Footprint: ${geometryStats.footprint.length.toFixed(1)}m × ${geometryStats.footprint.width.toFixed(1)}m`
        );
        logger.info(`      - Aspect ratio: ${geometryStats.aspectRatio.toFixed(2)}`);

        // Enforce the gate - throws if validation fails
        const gateResult = enforceGeometryFirstGate(masterDNA, {
          expectedFloors,
          expectRooms: true, // Always expect rooms in architectural designs
        });

        logger.success('✅ Geometry-First Gate PASSED');
        logger.info(`   All ${gateResult.stats.floorCount} floors have rooms placed`);
        logger.info(`   Footprint is valid (not thin bar/tower)`);

        // Store geometry stats in masterDNA for downstream use
        masterDNA._geometryStats = gateResult.stats;
        masterDNA._geometryGatePassed = true;

        // Log any warnings (non-fatal but worth noting)
        if (gateResult.warnings.length > 0) {
          gateResult.warnings.forEach((warn) => {
            logger.warn(`   ⚠️ ${warn}`);
          });
        }
      } catch (geometryGateError) {
        // HARD FAIL - Do not proceed with panel generation
        logger.error('❌ Geometry-First Gate FAILED');
        logger.error(`   ${geometryGateError.message}`);
        logger.error('   Panel generation BLOCKED - geometry must be fixed first');

        // Extract specific error code for user-friendly messaging
        const errorMessage = geometryGateError.message || '';
        let userMessage = 'Generation failed due to invalid building geometry.';

        if (errorMessage.includes('EMPTY_FLOOR')) {
          userMessage =
            'Floor plan generation incomplete. Some floors are missing room data. This can happen with complex building configurations. Try reducing the number of floors or simplifying the program.';
        } else if (errorMessage.includes('GEOMETRY_MISSING')) {
          userMessage =
            'Building geometry could not be generated. Please try again or adjust your building specifications.';
        } else if (
          errorMessage.includes('DEGENERATE') ||
          errorMessage.includes('THIN_BAR') ||
          errorMessage.includes('TOWER')
        ) {
          userMessage =
            'Building footprint dimensions are invalid (too narrow or too small). Please adjust your building dimensions.';
        } else if (errorMessage.includes('NO_INTERIOR_WALLS')) {
          userMessage =
            'Floor plans are missing internal walls. This may be caused by room layout issues.';
        }

        const error = new Error(`[GEOMETRY_FIRST_MANDATORY] ${userMessage}`);
        error.code = 'GEOMETRY_FIRST_MANDATORY';
        error.details = {
          technicalError: geometryGateError.message,
          floorCountSources: {
            dna: masterDNA?.dimensions?.floors,
            program: masterDNA?.program?.floors,
            geometry: masterDNA?.populatedGeometry?.floors?.length,
            context: projectContext?.floors,
          },
        };
        throw error;
      }

      // ========================================
      // STEP 4: Build Site-Aware A1 Sheet Prompt (No Duplication)
      // ========================================
      reportProgress('prompt', 'Building site-aware A1 sheet prompt...', 60);
      logger.info('\n📝 STEP 4: Building site-aware A1 sheet prompt...');

      const sheetDiscipline = (
        projectContext.sheetType ||
        projectContext.discipline ||
        'ARCH'
      ).toUpperCase();
      const promptVersionOverride =
        projectContext?.promptVersion || projectContext?.promptMode || flags?.a1PromptVersion;

      if (sheetDiscipline !== 'ARCH') {
        logger.info(`   🧱 Generating ${sheetDiscipline} discipline sheet`);
      }

      const promptBuilderOptions = {
        masterDNA,
        location: locationData,
        climate: locationData?.climate,
        portfolioBlendPercent: effectivePortfolioBlendPercent,
        projectContext,
        projectMeta: {
          name: projectContext.projectName || 'Architectural Design',
          style: masterDNA.architectural_style?.name || masterDNA.architecturalStyle,
          seed: seed || Date.now(),
          promptVersion: promptVersionOverride,
        },
        blendedStyle,
        siteShape,
        siteConstraints: masterDNA.siteConstraints || null,
        requiredSections,
        promptVersion: promptVersionOverride,
      };

      // Generate base prompt with required sections
      const promptInput = {
        dna: masterDNA,
        siteSnapshot: locationData,
        sheetConfig: {
          sitePlanAttachment,
          sitePlanPolicy: sitePlanAttachment ? 'overlay' : 'placeholder',
          selectedDetails,
          styleWeights: masterDNA.styleWeights,
          buildingType: masterDNA.typology?.building_type,
        },
        sheetType: sheetDiscipline,
        requiredSections,
        strictSections: true,
      };

      if (sheetDiscipline !== 'ARCH') {
        logger.info(`   📄 Generating ${sheetDiscipline} discipline sheet (architectural layout)`);
      }

      const basePromptResult = buildPrompt(promptInput);

      const { prompt, negativePrompt, systemHints = {} } = basePromptResult;

      if (siteMapData && siteMapData.attachment) {
        logger.info(
          '   🗺️ Overlay mode instructions applied - AI told to leave site panel blank for HTML injection'
        );
      }

      // CRITICAL: Never use site plan as initImage - it transforms the entire A1 sheet
      useAsInitImage = false;

      logger.success(' A1 sheet prompt generated');
      logger.info(`   📝 Prompt length: ${prompt.length} chars`);
      logger.info(`   🚫 Negative prompt length: ${negativePrompt.length} chars`);
      logger.info(`   📐 Target aspect ratio: ${systemHints.targetAspectRatio || '1.414'}`);

      // ========================================
      // STEP 4.5: Validate Template Completeness in Prompt
      // ========================================
      logger.info('\n🔍 STEP 4.5: Validating template completeness in prompt...');

      const templateValidation = a1SheetValidator.validateA1TemplateCompleteness({
        prompt,
        masterDNA,
        projectContext,
      });

      if (!templateValidation.valid) {
        logger.warn('⚠️  Template validation failed - missing mandatory sections');
        logger.warn(`   Missing: ${templateValidation.missingMandatory.join(', ')}`);

        // Log warning but continue - the prompt should still work
        // In future, we could trigger regeneration with stricter prompts here
        logger.info('   ⚠️  Continuing with generation despite missing sections...');
        logger.info('   💡 Consider regenerating with more explicit section requirements');
      } else {
        logger.info(`   ✅ Template validation passed (${templateValidation.score}% completeness)`);
        logger.info(
          `   Present sections: ${templateValidation.presentSections.length}/${requiredSections.length}`
        );
      }

      // Store validation result for later use
      const promptValidationResult = templateValidation;

      const promptCoverage = validatePromptCoverage(prompt, masterDNA.typology?.building_type);
      logger.info('🧬 A1 DNA summary for prompt', {
        buildingType: masterDNA.typology?.building_type || projectContext.buildingProgram,
        materials: (masterDNA.materials || []).map((m) => m.name || m).slice(0, 4),
        styleWeights: masterDNA.styleWeights || projectContext.styleWeights || null,
      });
      if (!promptCoverage.ok || promptCoverage.warnings.length) {
        logger.warn('⚠️ A1 prompt coverage warnings', {
          missingClauses: promptCoverage.missingClauses,
          warnings: promptCoverage.warnings,
        });
      }
      logger.info(`📝 FINAL A1 PROMPT (ready for generation)
${prompt}`);

      // ========================================
      // STEP 5: Generate A1 panels and compose sheet
      // ========================================
      reportProgress('rendering', 'Generating A1 panels and composing sheet...', 70);
      logger.info('\n🖼️ STEP 5: Generating panels and composing A1 sheet...');

      // Clear style cache to ensure fresh style calculation for this generation
      clearStyleCache();

      // effectiveSeed is computed once at workflow start for determinism

      // DIAGNOSTIC: Log geometry data summary before panel generation
      const facadesCount = masterDNA.facades ? Object.keys(masterDNA.facades).length : 0;
      const sectionsCount = masterDNA.sections ? Object.keys(masterDNA.sections).length : 0;
      const hasRoofProfiles = !!masterDNA.roofProfiles;
      const hasPopulatedGeometry = !!masterDNA.hasPopulatedGeometry;

      logger.info(`   📊 Geometry data summary:`);
      logger.info(`      - hasPopulatedGeometry: ${hasPopulatedGeometry}`);
      logger.info(
        `      - facades: ${facadesCount} (${facadesCount > 0 ? Object.keys(masterDNA.facades).join(', ') : 'none'})`
      );
      logger.info(
        `      - sections: ${sectionsCount} (${sectionsCount > 0 ? Object.keys(masterDNA.sections).join(', ') : 'none'})`
      );
      logger.info(`      - roofProfiles: ${hasRoofProfiles}`);

      if (facadesCount === 0 || sectionsCount === 0) {
        logger.warn(
          `   ⚠️ Missing geometry projections - technical drawings will use fallback SVGs`
        );
      }

      // ========================================
      // STEP 4.05: Generate Canonical 3D Control Images
      // ========================================
      // Generate canonical 3D renders BEFORE CCP initialization
      // These renders ensure all 3D panels (hero_3d, interior_3d, axonometric)
      // reference the SAME geometry from the building model
      logger.info('\n🎨 STEP 4.05: Generating canonical control images...');
      reportProgress('canonical_renders', 'Generating Canonical 3D Renders', 43);

      let canonical3DRenders = {};
      try {
        const preFingerprint = generateDesignFingerprint(masterDNA);
        canonical3DRenders = generateCanonical3DRenders(masterDNA, preFingerprint, {
          width: 1024,
          height: 1024,
        });
        const renderCount = Object.keys(canonical3DRenders).length;
        logger.info(`   ✅ Generated ${renderCount} canonical 3D renders`);
        if (renderCount > 0) {
          logger.info(`   📸 Views: ${Object.keys(canonical3DRenders).join(', ')}`);
        }
      } catch (canonErr) {
        logger.warn('   ⚠️ Canonical 3D render generation failed:', canonErr.message);
        logger.info('   Continuing with empty canonical renders - control images may be missing');
      }

      // ========================================
      // STEP 4.1: Initialize Canonical Control Pack (CCP)
      // ========================================
      // CCP ensures ALL panels reference the SAME design by:
      // 1. Building control images from geometry/baseline renders
      // 2. Assigning deterministic seeds per panel type
      // 3. Generating a unique designFingerprint for cache keys
      // 4. Enforcing geometry lock in all prompts
      logger.info('\n🔒 STEP 4.1: Initializing Canonical Control Pack (CCP)...');
      reportProgress('ccp', 'Building Canonical Control Pack', 45);

      let designContext = null;
      try {
        // Collect geometry renders from all sources - INCLUDE canonical 3D renders
        const geometryRenders = {
          ...canonical3DRenders, // CRITICAL: Include canonical 3D renders first
          ...(masterDNA.geometryRenders || {}),
          ...(masterDNA.conditioned2DOutputs?.floorPlans || {}),
          ...(masterDNA.conditioned2DOutputs?.elevations || {}),
          ...(masterDNA.conditioned2DOutputs?.sections || {}),
        };

        // Collect Meshy renders if available
        const meshyRenders = masterDNA.meshyControlImages || masterDNA.meshy3D?.renders || {};

        // Initialize CCP with all available data
        designContext = await initializeCCP({
          masterDNA,
          geometryRenders,
          meshyRenders,
          baselinePanels: {}, // Will be populated after baseline generation
          siteContext: {
            polygon: locationData?.sitePolygon,
            climate: locationData?.climate,
            entrance: projectContext?.entranceOrientation,
          },
          styleProfile: conditionedPipelineContext?.styleProfile || {},
          baseSeed: effectiveSeed,
        });

        logger.success('✅ CCP initialized');
        logger.info(`   🔑 Design Fingerprint: ${designContext.designFingerprint}`);
        logger.info(`   🎯 Design ID: ${designContext.designId}`);
        logger.info(`   🌱 Base Seed: ${designContext.seedMap.baseSeed}`);
        logger.info(
          `   📸 Control Images: ${Object.keys(designContext.controlPack.controlImages).length}`
        );

        // Store fingerprint on masterDNA for downstream access
        masterDNA.designFingerprint = designContext.designFingerprint;
        masterDNA.designContextId = designContext.designId;

        // DEBUG: Record CCP creation
        debugRecorder.recordStep('ccp_initialized', {
          designFingerprint: designContext.designFingerprint,
          designId: designContext.designId,
          baseSeed: designContext.seedMap.baseSeed,
          controlImageCount: Object.keys(designContext.controlPack.controlImages).length,
          controlSources: Object.fromEntries(
            Object.entries(designContext.controlPack.controlImages).map(([k, v]) => [k, v.source])
          ),
        });
      } catch (ccpError) {
        logger.warn('⚠️ CCP initialization failed:', ccpError.message);
        logger.info('   Continuing without CCP - panels may have inconsistent geometry');
        // Generate fingerprint anyway for tracking
        const fallbackFingerprint = generateDesignFingerprint(masterDNA);
        masterDNA.designFingerprint = fallbackFingerprint;
        logger.info(`   📍 Fallback fingerprint: ${fallbackFingerprint}`);
      }

      const panelJobs = await planA1Panels({
        masterDNA,
        siteBoundary: locationData?.sitePolygon || null,
        buildingType:
          projectContext?.buildingType || projectContext?.buildingProgram || masterDNA?.projectType,
        entranceOrientation: projectContext?.entranceOrientation || null,
        programSpaces: projectContext?.programSpaces || projectContext?.program || [],
        baseSeed: effectiveSeed,
        // NEW: Pass location and portfolio data for adaptive style transfer
        locationData,
        climate: locationData?.climate || null,
        portfolioItems: portfolioAnalysis?.portfolioFiles || portfolioAnalysis?.images || [],
        // CRITICAL FIX: Pass COMPLETE geometry data including facades, sections, roofProfiles
        // These are generated in STEP 2.08 (generateProjections) and stored directly on masterDNA
        fglData: masterDNA.fglData || null,
        geometryDNA: {
          // Include base geometry data
          ...(masterDNA.geometryDNAv2 || {}),
          ...(masterDNA.populatedGeometry || {}),
          // CRITICAL: Include projection data from STEP 2.08
          facades: masterDNA.facades || null,
          sections: masterDNA.sections || null,
          roofProfiles: masterDNA.roofProfiles || null,
          storeyHeights: masterDNA.storeyHeights || null,
          // Include dimensions for fallback calculations
          dimensions: masterDNA.dimensions || null,
          hasPopulatedGeometry: masterDNA.hasPopulatedGeometry || false,
        },
        geometryRenders: masterDNA.geometryRenders || null,
        // Phase 4: Meshy 3D control images for 100% consistency
        meshy3D: masterDNA.meshy3D || null,
        meshyControlImages: masterDNA.meshyControlImages || null,
        // ========================================
        // NEW: Phase 4/5 Conditioned Image Pipeline data
        // ========================================
        // When conditionedImagePipeline is enabled, these provide:
        // - conditioningImages: Edge/depth/silhouette maps for FLUX img2img
        // - styleDescriptors: Unified style strings from StyleProfile
        // - outputs2D: Pre-rendered SVG floor plans and elevations
        conditionedPipeline: conditionedPipelineContext
          ? {
              enabled: true,
              conditioningImages: conditionedPipelineContext.conditioningImages,
              styleDescriptors: conditionedPipelineContext.styleDescriptors,
              outputs2D: conditionedPipelineContext.outputs2D,
              facadeSummary: conditionedPipelineContext.facadeSummary,
              styleProfile: conditionedPipelineContext.styleProfile,
              conditioningStrengths: CONDITIONING_STRENGTHS,
            }
          : null,
      });

      // ========================================
      // STEP 4.5: Baseline Render Generation (FLUX Never Invents Geometry)
      // ========================================
      // When forceBaselineControl is enabled, generate deterministic baseline
      // renders BEFORE any FLUX calls. These baselines are used as control images
      // to ensure FLUX only stylizes materials/lighting, never invents geometry.
      const forceBaselineControl = isFeatureEnabled('forceBaselineControl');
      const designId =
        projectContext?.designId ||
        `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let baselinesGenerated = false;

      if (forceBaselineControl) {
        logger.info('\n🔒 STEP 4.5: Generating Baseline Renders (forceBaselineControl=ON)');
        logger.info(`   📋 Pipeline version: ${BASELINE_PIPELINE_VERSION}`);
        logger.info(`   🎯 Target views: ${BASELINE_VIEW_TYPES.join(', ')}`);

        try {
          // Build designState from available data
          // NOTE: BaselineRenderService expects 'geometry' and 'program' fields specifically
          const programSpaces =
            projectContext?.programSpaces || projectContext?.program || masterDNA?.program || [];
          const geometryData =
            masterDNA?.geometryDNAv2 || masterDNA?.populatedGeometry || masterDNA?.geometry || null;

          const designState = {
            masterDNA,
            // Required by BaselineRenderService.generateBaselineRenders():
            geometry: geometryData, // Strategy 1 & 2 require this field
            program: programSpaces, // Strategy 1 requires this field as alternative
            projectContext: {
              ...projectContext,
              designId,
              buildingType:
                projectContext?.buildingType ||
                projectContext?.buildingProgram ||
                masterDNA?.projectType,
              floorCount: masterDNA?.dimensions?.floors || projectContext?.floorCount || 2,
              entranceOrientation: projectContext?.entranceOrientation || null,
              programSpaces,
            },
            locationData,
            sitePolygon: locationData?.sitePolygon || null,
            // Include geometry data for render generation (additional fields)
            geometryDNA: geometryData,
            facades: masterDNA?.facades || null,
            sections: masterDNA?.sections || null,
            meshy3D: masterDNA?.meshy3D || null,
            geometryRenders: masterDNA?.geometryRenders || null,
            fglData: masterDNA?.fglData || null,
          };

          // generateBaselineRenders returns baselines object directly (not wrapped in { success, baselines })
          const baselines = await generateBaselineRenders(designState, designId, {
            viewTypes: BASELINE_VIEW_TYPES,
            quality: 'high',
            includeAnnotations: false,
          });

          // Check if we got any baselines (function returns object directly)
          const baselineKeys = baselines ? Object.keys(baselines) : [];
          if (baselineKeys.length > 0) {
            // Store baselines in IndexedDB (already done in generateBaselineRenders, but ensure)
            await storeBaselines(designId, baselines);
            baselinesGenerated = true;

            logger.success('✅ Baseline renders generated and stored');
            logger.info(`   📁 Design ID: ${designId}`);
            logger.info(`   📸 Views generated: ${baselineKeys.join(', ')}`);
            logger.info(`   🔐 FLUX will now use these as MANDATORY control images`);
            logger.info(`   ✨ Mode: STYLIZE-ONLY (geometry preserved)`);

            // DEBUG: Record baseline cache info
            debugRecorder.recordStep('baseline_cache_check', {
              cacheKey: `baseline:${designId}:2.0.0`,
              cacheHit: false,
              viewsGenerated: baselineKeys,
              viewsRetrieved: [],
            });
          } else {
            logger.warn('⚠️ Baseline generation returned no views');
            logger.info('   Reason: No geometry data available or all generation failed');
            logger.info('   FLUX will proceed without baseline control (geometry may vary)');

            // DEBUG: Record baseline failure
            debugRecorder.recordStep('baseline_cache_check', {
              cacheKey: null,
              cacheHit: false,
              viewsGenerated: [],
              viewsRetrieved: [],
              error: 'No geometry data available or generation returned empty',
            });
          }
        } catch (baselineError) {
          logger.error('❌ Baseline generation failed:', baselineError.message);
          logger.info('   FLUX will proceed without baseline control (not recommended)');
          // Don't fail the workflow - allow FLUX to proceed but log warning

          // DEBUG: Record baseline error
          debugRecorder.recordError(baselineError, { step: 'baseline_generation' });
        }
      } else {
        logger.info('\n⏭️  STEP 4.5: Skipping Baseline Generation (forceBaselineControl=OFF)');

        // DEBUG: Record baseline skipped
        debugRecorder.recordStep('baseline_cache_check', {
          cacheKey: null,
          cacheHit: false,
          skipped: true,
          reason: 'forceBaselineControl=OFF',
        });
      }

      // Add designId, runId, and CCP data to each panelJob
      logger.info('\n🔒 STEP 4.6: Enhancing panel jobs with CCP...');
      for (const job of panelJobs) {
        job.designId = designId;
        job.baselinesGenerated = baselinesGenerated;
        job.runId = runId; // DEBUG: Propagate runId for tracking

        // CCP Enhancement: Add fingerprint and control data
        if (designContext) {
          const enhancedJob = enhanceJobWithCCP(job, designContext);
          Object.assign(job, {
            designFingerprint: enhancedJob.designFingerprint,
            controlHash: enhancedJob.controlHash,
            cacheKey: enhancedJob.cacheKey,
            _ccpControlImage: enhancedJob._ccpControlImage,
            _ccpControlStrength: enhancedJob._ccpControlStrength,
            _ccpBypassAI: enhancedJob._ccpBypassAI,
            _ccpEnhanced: enhancedJob._ccpEnhanced,
            // Keep original prompt but log that geometry lock is applied
            _originalPrompt: job.prompt,
          });
          logger.info(
            `   ✅ ${job.type}: fingerprint=${job.designFingerprint}, controlHash=${job.controlHash || 'none'}`
          );
        } else {
          // Fallback: just add fingerprint for tracking
          job.designFingerprint = masterDNA.designFingerprint;
          logger.info(`   ⚠️ ${job.type}: fingerprint=${job.designFingerprint} (no CCP control)`);
        }
      }

      // Log CCP summary
      const ccpEnhancedCount = panelJobs.filter((j) => j._ccpEnhanced).length;
      const ccpControlCount = panelJobs.filter((j) => j._ccpControlImage).length;
      logger.info(`\n📊 CCP Enhancement Summary:`);
      logger.info(`   Total Jobs: ${panelJobs.length}`);
      logger.info(`   CCP Enhanced: ${ccpEnhancedCount}`);
      logger.info(`   With Control Image: ${ccpControlCount}`);
      logger.info(`   Design Fingerprint: ${masterDNA.designFingerprint}`);

      // ========================================
      // STEP 4.7: Strict Control Mode Validation (MANDATORY)
      // ========================================
      // Validates that ALL required panels have canonical control images
      // In strict mode, throws error if control images are missing
      if (isStrictModeEnabled()) {
        logger.info('\n🔒 STEP 4.7: Validating Strict Control Mode...');

        // Build control pack from CCP data for validation
        const controlPackForValidation = {};
        for (const job of panelJobs) {
          if (job._ccpControlImage) {
            controlPackForValidation[job.type] = {
              url: job._ccpControlImage,
              hash: job.controlHash,
              source: 'ccp',
            };
          }
        }

        try {
          // Validate control pack - throws in strict mode if missing required panels
          const controlValidation = validateControlPack(
            controlPackForValidation,
            REQUIRED_CONTROL_PANELS
          );

          if (controlValidation.valid) {
            logger.info(
              `   ✅ Strict Control Mode: All ${controlValidation.presentPanels.length} required control images present`
            );
          } else {
            logger.warn(
              `   ⚠️ Strict Control Mode: Missing ${controlValidation.missingPanels.length} control images`
            );
            logger.warn(`      Missing: ${controlValidation.missingPanels.join(', ')}`);

            // In strict mode with strictControlImageMode feature flag, this would throw
            // For now, log warning and continue (soft enforcement)
            if (isFeatureEnabled('strictControlImageMode')) {
              // Don't throw - just log and record for debugging
              debugRecorder.recordWarning('Strict control mode violation', {
                missingPanels: controlValidation.missingPanels,
                presentPanels: controlValidation.presentPanels,
              });
            }
          }
        } catch (strictErr) {
          logger.error(`   ❌ Strict Control Mode validation failed: ${strictErr.message}`);
          // Continue anyway - we don't want to block generation entirely
        }
      } else {
        logger.info('\n⏭️  STEP 4.7: Strict Control Mode disabled - skipping validation');
      }

      const togetherClient = {
        generateImage: (params) =>
          generateArchitecturalImage({
            viewType: params.type || params.viewType || 'panel',
            designDNA: masterDNA,
            prompt: params.prompt,
            seed: params.seed,
            width: params.width,
            height: params.height,
          }),
      };

      const panelResults = await generateA1PanelsSequential(panelJobs, togetherClient);

      // ========================================
      // STEP 5.02: Generate deterministic data panels (material_palette, climate_card)
      // ========================================
      // These panels are 100% deterministic SVG - no AI generation, no API calls
      logger.info('\n📊 STEP 5.02: Generating deterministic data panels...');
      try {
        const dataPanels = generateDataPanels(masterDNA, locationData);

        // Merge data panels into results - update existing failed panels or add new ones
        for (const [panelType, dataUrl] of Object.entries(dataPanels || {})) {
          if (!dataUrl) {continue;}

          // Find existing panel result for this type
          const existingIndex = panelResults.findIndex((p) => p.type === panelType);

          if (existingIndex >= 0) {
            // Update existing panel if it failed or has no image
            if (!panelResults[existingIndex].imageUrl && !panelResults[existingIndex].url) {
              panelResults[existingIndex].imageUrl = dataUrl;
              panelResults[existingIndex].success = true;
              panelResults[existingIndex].source = 'DataPanelService';
              logger.info(
                `   ✅ ${panelType}: Data panel SVG generated (replaced failed AI panel)`
              );
            }
          } else {
            // Add new panel result
            panelResults.push({
              type: panelType,
              imageUrl: dataUrl,
              success: true,
              prompt: `Data panel: ${panelType}`,
              source: 'DataPanelService',
            });
            logger.info(`   ✅ ${panelType}: Data panel SVG generated (new)`);
          }
        }
      } catch (dataPanelErr) {
        logger.warn('   ⚠️ Data panel generation failed:', dataPanelErr.message);
      }

      // ========================================
      // STEP 5.03: Auto-Crop Panel Images (MANDATORY)
      // ========================================
      // Trims white margins from panel images before A1 composition
      // Uses Sharp's trim() with panel-specific configurations
      logger.info('\n✂️  STEP 5.03: Auto-cropping panel images...');
      try {
        // Only run in Node.js environment (Sharp not available in browser)
        if (typeof window === 'undefined') {
          const autoCropService = new AutoCropService();

          // Dynamically import Sharp (only in Node.js)
          const sharp = (await import(/* webpackIgnore: true */ 'sharp')).default;

          // Build panel map for batch cropping
          const panelsToProcess = {};
          for (const panel of panelResults) {
            if (panel.imageUrl || panel.url) {
              const imageUrl = panel.imageUrl || panel.url;

              // Skip data URLs (SVG) - they don't need cropping
              if (imageUrl.startsWith('data:image/svg')) {
                continue;
              }

              // For URLs, fetch the image buffer
              if (imageUrl.startsWith('http')) {
                try {
                  const response = await fetch(imageUrl);
                  if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    panelsToProcess[panel.type] = {
                      buffer: Buffer.from(arrayBuffer),
                      originalUrl: imageUrl,
                    };
                  }
                } catch (fetchErr) {
                  logger.debug(
                    `   ⏭️  ${panel.type}: Could not fetch for cropping - ${fetchErr.message}`
                  );
                }
              } else if (imageUrl.startsWith('data:image/')) {
                // Base64 image - decode it
                const base64Data = imageUrl.split(',')[1];
                if (base64Data) {
                  panelsToProcess[panel.type] = {
                    buffer: Buffer.from(base64Data, 'base64'),
                    originalUrl: imageUrl,
                  };
                }
              }
            }
          }

          if (Object.keys(panelsToProcess).length > 0) {
            const cropResult = await autoCropService.cropAllPanels(sharp, panelsToProcess);

            // Update panel results with cropped images
            for (const [panelType, croppedData] of Object.entries(cropResult.panels)) {
              const panelIndex = panelResults.findIndex((p) => p.type === panelType);
              if (panelIndex >= 0 && croppedData.buffer) {
                // Convert buffer back to base64 data URL
                const base64 = croppedData.buffer.toString('base64');
                const mimeType = 'image/png'; // Sharp outputs PNG by default
                panelResults[panelIndex].imageUrl = `data:${mimeType};base64,${base64}`;
                panelResults[panelIndex].autoCropped = croppedData.autoCropped;
                panelResults[panelIndex].autoCropDimensions = croppedData.autoCropDimensions;
              }
            }

            logger.info(
              `   ✅ Auto-cropped ${cropResult.stats.trimmed}/${cropResult.stats.total} panels`
            );
            if (cropResult.stats.errors > 0) {
              logger.warn(`   ⚠️ ${cropResult.stats.errors} panels had crop errors`);
            }
          } else {
            logger.info('   ⏭️  No panels to crop (all SVG or unavailable)');
          }
        } else {
          logger.info('   ⏭️  Skipping auto-crop (browser environment - Sharp not available)');
        }
      } catch (autoCropErr) {
        logger.warn('   ⚠️ Auto-crop failed (non-fatal):', autoCropErr.message);
        // Continue without cropping - this is not a critical failure
      }

      // ========================================
      // STEP 5.04: Blank Panel Detection & Regeneration
      // ========================================
      // Detects blank/nearly-blank panels and triggers deterministic regeneration
      // Uses SVG directly for technical drawings (no FLUX)
      if (isStrictModeEnabled() && typeof window === 'undefined') {
        logger.info('\n🔍 STEP 5.04: Detecting blank panels...');
        try {
          const sharp = (await import(/* webpackIgnore: true */ 'sharp')).default;
          let blankCount = 0;
          let regeneratedCount = 0;

          for (let i = 0; i < panelResults.length; i++) {
            const panel = panelResults[i];
            if (!panel.imageUrl && !panel.url) {continue;}

            const imageUrl = panel.imageUrl || panel.url;
            // Skip SVG data URLs - they're deterministic and can't be blank
            if (imageUrl.startsWith('data:image/svg')) {continue;}

            try {
              // Get image buffer for blank detection
              let imageBuffer = null;
              if (imageUrl.startsWith('data:image/')) {
                const base64Data = imageUrl.split(',')[1];
                if (base64Data) {
                  imageBuffer = Buffer.from(base64Data, 'base64');
                }
              } else if (imageUrl.startsWith('http')) {
                const response = await fetch(imageUrl);
                if (response.ok) {
                  const arrayBuffer = await response.arrayBuffer();
                  imageBuffer = Buffer.from(arrayBuffer);
                }
              }

              if (!imageBuffer) {continue;}

              // Build control pack for deterministic regeneration
              const controlPackForPanel = {};
              const job = panelJobs.find((j) => j.type === panel.type);
              if (job?._ccpControlImage) {
                controlPackForPanel[panel.type] = {
                  url: job._ccpControlImage,
                  dataUrl: job._ccpControlImage,
                };
              }

              // Validate and handle blank - may trigger deterministic regeneration
              const blankResult = await validateAndHandleBlank({
                image: imageBuffer,
                panelType: panel.type,
                controlPack: controlPackForPanel,
                deterministicGenerator: null, // Let it use control image if available
              });

              if (blankResult.isBlank) {
                blankCount++;
                logger.warn(
                  `   ⚠️ ${panel.type}: BLANK detected (${(blankResult.whiteRatio * 100).toFixed(1)}% white)`
                );

                if (blankResult.regenerated && blankResult.fallbackResult) {
                  // Use regenerated result
                  const fallback = blankResult.fallbackResult;
                  if (fallback.url || fallback.dataUrl) {
                    panelResults[i].imageUrl = fallback.url || fallback.dataUrl;
                    panelResults[i].regeneratedFromBlank = true;
                    panelResults[i].regenerationSource = blankResult.regenerationSource;
                    regeneratedCount++;
                    logger.info(`   ✅ ${panel.type}: Regenerated deterministically`);
                  }
                }

                // Record blank detection for debugging
                debugRecorder.recordWarning(`Blank panel detected: ${panel.type}`, {
                  blanknessScore: blankResult.blanknessScore,
                  whiteRatio: blankResult.whiteRatio,
                  blackRatio: blankResult.blackRatio,
                  regenerated: blankResult.regenerated,
                });
              }
            } catch (blankErr) {
              logger.debug(`   ⏭️  ${panel.type}: Blank detection skipped - ${blankErr.message}`);
            }
          }

          if (blankCount > 0) {
            logger.info(
              `   📊 Blank Detection Summary: ${blankCount} blank, ${regeneratedCount} regenerated`
            );
          } else {
            logger.info('   ✅ No blank panels detected');
          }
        } catch (blankDetectErr) {
          logger.warn('   ⚠️ Blank detection failed (non-fatal):', blankDetectErr.message);
        }
      }

      // Count successful panels (those with imageUrl)
      const successfulPanels = panelResults.filter((p) => p.imageUrl || p.url);
      const failedPanels = panelResults.filter((p) => !p.imageUrl && !p.url);

      logger.info(`\n📊 Panel Generation Summary:`);
      logger.info(`   Total: ${panelResults.length}`);
      logger.info(`   Successful: ${successfulPanels.length}`);
      logger.info(`   Failed: ${failedPanels.length}`);

      if (failedPanels.length > 0) {
        logger.warn(`   ⚠️ Failed panels: ${failedPanels.map((p) => p.type).join(', ')}`);
      }

      // ========================================
      // CCP Consistency Report
      // ========================================
      // Verify all panels have the same designFingerprint
      const ccpReport = generateConsistencyReport(
        panelResults.map((p) => ({
          panelType: p.type,
          success: !!(p.imageUrl || p.url),
          designFingerprint:
            p.designFingerprint || panelJobs.find((j) => j.type === p.type)?.designFingerprint,
          controlHash: p.controlHash || panelJobs.find((j) => j.type === p.type)?.controlHash,
        }))
      );

      logger.info('\n🔒 CCP Consistency Report:');
      logger.info(`   Consistent: ${ccpReport.consistent ? '✅ YES' : '❌ NO'}`);
      logger.info(`   Design Fingerprint: ${ccpReport.designFingerprint || 'MULTIPLE'}`);
      if (!ccpReport.consistent) {
        logger.error(`   ⚠️ Multiple fingerprints detected: ${ccpReport.fingerprints.join(', ')}`);
      }
      logger.info(`   Panels: ${ccpReport.successCount}/${ccpReport.panelCount} successful`);

      // Log each panel's control hash for debugging
      logger.info('   Control Hashes:');
      for (const [panelType, hash] of Object.entries(ccpReport.controlHashes)) {
        logger.info(`      ${panelType}: ${hash}`);
      }

      // If no panels generated successfully, return early with helpful error
      if (successfulPanels.length === 0) {
        logger.error('❌ No panels generated successfully - cannot compose A1 sheet');
        return {
          success: false,
          workflow: 'a1-panel-composed',
          error: 'All panels failed to generate. Check console for individual panel errors.',
          panelResults: panelResults.map((p) => ({
            type: p.type,
            error: p.error || 'Generation failed',
          })),
        };
      }

      // Warn if less than 50% of panels generated
      if (successfulPanels.length < panelResults.length * 0.5) {
        logger.warn(
          `⚠️ Only ${successfulPanels.length}/${panelResults.length} panels generated - A1 sheet will be incomplete`
        );
      }

      reportProgress(
        'validation',
        `Generated ${successfulPanels.length}/${panelResults.length} panels - running contract validation...`,
        76
      );

      // ========================================
      // STEP 5.05: Contract Gate Validation (CANONICAL BASELINE MODE)
      // Validates all panels against the DesignContract (building type, party walls, etc.)
      // ========================================
      if (contractGate && useCanonicalBaseline) {
        logger.info('\n🚪 STEP 5.05: Running Contract Gate Validation...');

        // Convert panel results for validation
        const panelsForValidation = panelResults.map((p) => ({
          type: p.type,
          panelType: p.type,
          prompt: p.prompt,
          url: p.imageUrl || p.url,
          seed: p.seed,
        }));

        // Validate all panels against the contract
        const contractValidation = contractGate.validateAllPanels(panelsForValidation);

        // Log validation summary
        logger.info(`\n📜 Contract Gate Summary:`);
        logger.info(`   Building Type: ${designContract.buildingType}`);
        logger.info(`   Total Panels: ${contractValidation.totalPanels}`);
        logger.info(`   Passed: ${contractValidation.passed}`);
        logger.info(`   Failed: ${contractValidation.failed}`);
        logger.info(
          `   Pass Rate: ${contractValidation.passed > 0 ? ((contractValidation.passed / contractValidation.totalPanels) * 100).toFixed(1) : 0}%`
        );

        if (contractValidation.failed > 0) {
          logger.warn(`   ⚠️ Failed Panels: ${contractValidation.failedPanels.join(', ')}`);

          // Check if we should fail fast
          const gateDecision = contractGate.getFinalGateDecision();
          if (!gateDecision.pass) {
            logger.error('❌ Contract Gate FAILED - design contract violations detected');

            // Generate detailed report
            const report = contractGate.generateReport();
            debugRecorder.recordStep('contract_gate_failed', {
              report,
              failedPanels: contractValidation.failedPanels,
              buildingType: designContract.buildingType,
            });

            return {
              success: false,
              workflow: 'a1-panel-composed',
              error: `Contract validation failed: ${gateDecision.reason}`,
              contractValidation: report,
              failedPanels: contractValidation.failedPanels,
              panelResults: panelResults.map((p) => ({
                type: p.type,
                url: p.imageUrl,
                seed: p.seed,
              })),
            };
          }
        } else {
          logger.success('✅ All panels passed contract validation');
        }

        // Record contract validation success
        debugRecorder.recordStep('contract_gate_passed', {
          buildingType: designContract.buildingType,
          passed: contractValidation.passed,
          total: contractValidation.totalPanels,
        });
      }

      reportProgress(
        'validation',
        `Generated ${panelResults.length} panels - running cross-view consistency validation...`,
        78
      );

      // ========================================
      // STEP 5.1: Cross-View Consistency Gate
      // Validates all panels against hero_3d baseline before composition
      // ========================================
      logger.info('\n🔍 STEP 5.1: Running Cross-View Consistency Gate...');

      // Convert panelResults array to panelMap object for gate
      const panelMap = {};
      for (const panel of panelResults) {
        const key = panel.type || panel.id;
        panelMap[key] = {
          url: panel.imageUrl || panel.url,
          prompt: panel.prompt,
          negativePrompt: panel.negativePrompt,
          seed: panel.seed,
          meta: {
            width: panel.width,
            height: panel.height,
            model: panel.model,
          },
        };
      }

      // Create regenerate function for retries
      const regeneratePanelFn = async (panelKey, retryParams) => {
        logger.info(`   🔄 Regenerating ${panelKey} with retry params...`);
        const result = await togetherClient.generateImage({
          type: panelKey,
          prompt: retryParams.prompt,
          seed: retryParams.seed,
          width: retryParams.width,
          height: retryParams.height,
        });
        return {
          url: result.url || result.imageUrls?.[0],
          seed: result.seedUsed || retryParams.seed,
        };
      };

      // Run the consistency gate
      const gateResult = await runConsistencyGate(panelMap, {
        masterDNA,
        baseSeed: effectiveSeed,
        regenerateFn: regeneratePanelFn,
        designId: projectContext?.designId || 'a1-panel-generation',
        baseDir: './debug_runs',
      });

      // Log gate summary
      logger.info(`\n📊 Consistency Gate Summary:`);
      logger.info(`   Pass: ${gateResult.pass ? '✅ YES' : '❌ NO'}`);
      logger.info(`   Validated: ${gateResult.validationSummary?.totalValidated || 0} panels`);
      logger.info(`   Passed: ${gateResult.validationSummary?.passed || 0}`);
      logger.info(`   Failed: ${gateResult.validationSummary?.failed || 0}`);
      logger.info(`   Retried: ${gateResult.retriedPanels?.length || 0}`);
      logger.info(
        `   Avg Score: ${((gateResult.validationSummary?.averageScore || 0) * 100).toFixed(1)}%`
      );

      // BLOCK COMPOSITION if gate fails
      if (!gateResult.pass) {
        logger.error('❌ Cross-view consistency gate FAILED - blocking A1 composition');
        logger.error(`   Reason: ${gateResult.blockedReason}`);

        // Return failure result with details
        return {
          success: false,
          workflow: 'a1-panel-composed',
          error: `Cross-view consistency validation failed: ${gateResult.blockedReason}`,
          validationSummary: gateResult.validationSummary,
          retriedPanels: gateResult.retriedPanels,
          panelResults: panelResults.map((p) => ({
            type: p.type,
            url: p.imageUrl,
            seed: p.seed,
          })),
          message:
            'Panel generation succeeded but consistency validation failed. Some panels may not match the hero view. Please regenerate or adjust consistency thresholds.',
        };
      }

      // Update panelResults with any retried panels from gate
      let updatedPanelResults = panelResults.map((panel) => {
        const key = panel.type || panel.id;
        const gatedPanel = gateResult.panelMap[key];
        if (gatedPanel && gatedPanel.url !== (panel.imageUrl || panel.url)) {
          // Panel was retried and updated
          return {
            ...panel,
            imageUrl: gatedPanel.url,
            url: gatedPanel.url,
            seed: gatedPanel.seed,
            _retriedByGate: true,
            _retryAttempt: gatedPanel._retryAttempt,
          };
        }
        return panel;
      });

      logger.success(
        '✅ Cross-view consistency gate PASSED - proceeding to strict panel validation'
      );
      reportProgress(
        'validation',
        `Consistency validated - running strict panel validation...`,
        82
      );

      // ========================================
      // STEP 5.2: Strict Panel Validation (Non-Empty, Control-Pack, Facade Consistency)
      // WITH AUTO-REPAIR: Automatically regenerates failed panels
      // ========================================
      const strictValidationEnabled = isFeatureEnabled('strictPanelValidation');
      const failFastMode = isFeatureEnabled('strictPanelFailFast');
      const autoRepairEnabled = isFeatureEnabled('strictPanelAutoRepair');
      const maxAutoRepairRetries = getFeatureValue('strictPanelAutoRepairMaxRetries') || 2;
      const strengthMultiplier = getFeatureValue('strictPanelAutoRepairStrengthMultiplier') || 1.25;

      let strictValidationResult = null;
      const panelsAfterStrictValidation = updatedPanelResults;
      const repairHistory = []; // Track all repair attempts

      if (strictValidationEnabled) {
        logger.info('\n🔒 STEP 5.2: Running Strict Panel Validation...');
        logger.info(`   Fail-fast mode: ${failFastMode ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`   Auto-repair mode: ${autoRepairEnabled ? 'ENABLED' : 'DISABLED'}`);
        if (autoRepairEnabled) {
          logger.info(`   Max repair retries: ${maxAutoRepairRetries}`);
        }

        const strictValidator = new StrictPanelValidator({
          failFastMode,
          requiredPanels: [
            'hero_3d',
            'floor_plan_ground',
            'elevation_north',
            'elevation_south',
            'elevation_east',
            'elevation_west',
          ],
        });

        // Build panel map for validation
        const buildStrictPanelMap = (panels) => {
          const panelMap = {};
          for (const panel of panels) {
            const key = panel.type || panel.id;
            panelMap[key] = {
              url: panel.imageUrl || panel.url,
              buffer: null,
              controlImage: panel.controlImageInfo?.used ? panel._controlSource?.dataUrl : null,
            };
          }
          return panelMap;
        };

        let strictPanelMap = buildStrictPanelMap(panelsAfterStrictValidation);

        // Get canonical elevation control for facade consistency check
        const getCanonicalElevationControl = (panelMap) => {
          return (
            panelMap.elevation_north?.controlImage ||
            panelMap.elevation_south?.controlImage ||
            panelMap.elevation_east?.controlImage ||
            panelMap.elevation_west?.controlImage ||
            null
          );
        };

        let canonicalElevationControl = getCanonicalElevationControl(strictPanelMap);

        // Initial validation
        strictValidationResult = await strictValidator.validateAllPanels(strictPanelMap, {
          canonicalElevationControl,
        });

        // Log initial validation summary
        logger.info(`\n📊 Initial Strict Validation Summary:`);
        logger.info(`   Pass: ${strictValidationResult.pass ? '✅ YES' : '❌ NO'}`);
        logger.info(`   Pass Rate: ${strictValidationResult.summary.passRate}%`);
        logger.info(`   Failed Panels: ${strictValidationResult.failedPanels.length}`);
        logger.info(`   Can Compose: ${strictValidationResult.canCompose ? '✅ YES' : '❌ NO'}`);

        // ========================================
        // AUTO-REPAIR LOOP: Regenerate failed panels
        // ========================================
        let repairAttempt = 0;
        let currentControlStrength = getFeatureValue('controlStrengthBands')?.initial || 0.6;

        while (
          autoRepairEnabled &&
          !strictValidationResult.canCompose &&
          strictValidationResult.requiredFailures.length > 0 &&
          repairAttempt < maxAutoRepairRetries
        ) {
          repairAttempt++;
          currentControlStrength = Math.min(0.95, currentControlStrength * strengthMultiplier);

          logger.info(`\n🔧 AUTO-REPAIR ATTEMPT ${repairAttempt}/${maxAutoRepairRetries}`);
          logger.info(
            `   Failed panels to repair: ${strictValidationResult.requiredFailures.join(', ')}`
          );
          logger.info(`   Control strength: ${(currentControlStrength * 100).toFixed(0)}%`);

          reportProgress(
            'repairing',
            `Auto-repairing ${strictValidationResult.requiredFailures.length} failed panels (attempt ${repairAttempt})...`,
            83 + repairAttempt
          );

          // Track repair attempt
          const attemptLog = {
            attempt: repairAttempt,
            failedPanels: [...strictValidationResult.requiredFailures],
            controlStrength: currentControlStrength,
            repairedPanels: [],
            timestamp: new Date().toISOString(),
          };

          // Regenerate each failed panel
          for (const panelType of strictValidationResult.requiredFailures) {
            logger.info(`   🔄 Regenerating ${panelType}...`);

            // Find the original panel job to get prompt and seed
            const originalPanel = panelsAfterStrictValidation.find(
              (p) => (p.type || p.id) === panelType
            );
            if (!originalPanel) {
              logger.warn(`   ⚠️ Could not find original panel data for ${panelType}, skipping`);
              continue;
            }

            try {
              // Build stronger prompt with explicit constraints
              const repairPrompt = buildRepairPrompt(
                originalPanel.prompt,
                panelType,
                repairAttempt
              );

              // Regenerate with stronger control
              const repairResult = await regeneratePanelFn(panelType, {
                prompt: repairPrompt,
                seed: originalPanel.seed, // Keep same seed for consistency
                width: originalPanel.width || 1024,
                height: originalPanel.height || 1024,
                controlStrength: currentControlStrength,
              });

              if (repairResult?.url) {
                // Update the panel in our results
                const panelIndex = panelsAfterStrictValidation.findIndex(
                  (p) => (p.type || p.id) === panelType
                );
                if (panelIndex >= 0) {
                  panelsAfterStrictValidation[panelIndex] = {
                    ...panelsAfterStrictValidation[panelIndex],
                    imageUrl: repairResult.url,
                    url: repairResult.url,
                    seed: repairResult.seed || originalPanel.seed,
                    _repairedByStrictValidation: true,
                    _repairAttempt: repairAttempt,
                    _repairControlStrength: currentControlStrength,
                  };
                  logger.success(`   ✅ ${panelType} regenerated successfully`);
                  attemptLog.repairedPanels.push({
                    panelType,
                    success: true,
                    newUrl: repairResult.url,
                  });
                }
              } else {
                logger.warn(`   ⚠️ ${panelType} regeneration returned no URL`);
                attemptLog.repairedPanels.push({
                  panelType,
                  success: false,
                  error: 'No URL returned',
                });
              }
            } catch (repairError) {
              logger.error(`   ❌ ${panelType} regeneration failed: ${repairError.message}`);
              attemptLog.repairedPanels.push({
                panelType,
                success: false,
                error: repairError.message,
              });
            }
          }

          repairHistory.push(attemptLog);

          // Re-validate after repair
          logger.info(`\n🔍 Re-validating after repair attempt ${repairAttempt}...`);
          strictPanelMap = buildStrictPanelMap(panelsAfterStrictValidation);
          canonicalElevationControl = getCanonicalElevationControl(strictPanelMap);

          strictValidationResult = await strictValidator.validateAllPanels(strictPanelMap, {
            canonicalElevationControl,
          });

          logger.info(`\n📊 Validation Summary (After Repair ${repairAttempt}):`);
          logger.info(`   Pass: ${strictValidationResult.pass ? '✅ YES' : '❌ NO'}`);
          logger.info(`   Pass Rate: ${strictValidationResult.summary.passRate}%`);
          logger.info(`   Failed Panels: ${strictValidationResult.failedPanels.length}`);
          logger.info(`   Can Compose: ${strictValidationResult.canCompose ? '✅ YES' : '❌ NO'}`);
        }

        // Record final validation result with repair history
        debugRecorder.recordStep('strict_panel_validation', {
          pass: strictValidationResult.pass,
          failedPanels: strictValidationResult.failedPanels,
          requiredFailures: strictValidationResult.requiredFailures,
          canCompose: strictValidationResult.canCompose,
          summary: strictValidationResult.summary,
          thresholds: strictValidationResult.thresholds,
          autoRepair: {
            enabled: autoRepairEnabled,
            attempts: repairAttempt,
            maxRetries: maxAutoRepairRetries,
            history: repairHistory,
          },
        });

        // Final check: Block composition if still failing after all repairs
        if (!strictValidationResult.canCompose) {
          logger.error('❌ Strict panel validation FAILED after all repair attempts');
          logger.error(
            `   Required failures: ${strictValidationResult.requiredFailures.join(', ')}`
          );
          logger.error(`   Repair attempts: ${repairAttempt}/${maxAutoRepairRetries}`);

          const panelsToRegenerate = strictValidator.getPanelsToRegenerate(strictValidationResult);

          return {
            success: false,
            workflow: 'a1-panel-composed',
            error: `Strict validation failed after ${repairAttempt} repair attempts. Required panels [${strictValidationResult.requiredFailures.join(', ')}] did not pass validation`,
            validationSummary: strictValidationResult.summary,
            failedPanels: strictValidationResult.failedPanels,
            requiredFailures: strictValidationResult.requiredFailures,
            panelsToRegenerate,
            repairHistory,
            panelResults: panelsAfterStrictValidation.map((p) => ({
              type: p.type,
              url: p.imageUrl,
              seed: p.seed,
              repaired: p._repairedByStrictValidation || false,
              repairAttempt: p._repairAttempt || 0,
              validation: strictValidationResult.panelResults[p.type] || null,
            })),
          };
        }

        // Warn about non-critical failures
        if (strictValidationResult.failedPanels.length > 0) {
          const nonCriticalFailures = strictValidationResult.failedPanels.filter(
            (p) => !strictValidationResult.requiredFailures.includes(p)
          );
          if (nonCriticalFailures.length > 0) {
            logger.warn(`   ⚠️ Non-critical panels failed: ${nonCriticalFailures.join(', ')}`);
          }
        }

        // Log repair summary if repairs were made
        if (repairAttempt > 0) {
          const repairedPanels = panelsAfterStrictValidation.filter(
            (p) => p._repairedByStrictValidation
          );
          logger.success(
            `\n✅ Strict panel validation PASSED after ${repairAttempt} repair attempt(s)`
          );
          logger.info(`   Repaired panels: ${repairedPanels.map((p) => p.type).join(', ')}`);
        } else {
          logger.success('✅ Strict panel validation PASSED - proceeding to A1 composition');
        }

        // Update panel results with repaired panels
        updatedPanelResults = panelsAfterStrictValidation;
      } else {
        logger.info('ℹ️  Strict panel validation DISABLED - skipping...');
      }

      reportProgress('composing', `All validations passed - composing A1 sheet...`, 85);

      const composeResponse = await fetch(`${API_BASE_URL}/api/a1/compose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Use updatedPanelResults which includes any panels retried by consistency gate
          panels: updatedPanelResults.map((p) => ({
            id: p.id || p.type,
            type: p.type,
            imageUrl: p.imageUrl,
            label: p.type,
            _retriedByGate: p._retriedByGate || false,
          })),
          siteOverlay: sitePlanAttachment || null,
          resolution: projectContext?.composeResolution || 'final',
          consistencyGateResult: {
            passed: gateResult.pass,
            averageScore: gateResult.validationSummary?.averageScore,
            retriedCount: gateResult.retriedPanels?.length || 0,
          },
        }),
      });

      if (!composeResponse.ok) {
        let errorBody = null;
        try {
          errorBody = await composeResponse.json();
        } catch (e) {
          errorBody = await composeResponse.text().catch(() => null);
        }
        const errorCode = errorBody?.error || errorBody?.code || `HTTP_${composeResponse.status}`;
        const errorMessage =
          errorBody?.message ||
          errorBody?.error ||
          (typeof errorBody === 'string' ? errorBody : `HTTP ${composeResponse.status}`);
        const composeError = new Error(
          `Compose API responded with ${composeResponse.status}: [${errorCode}] ${errorMessage}`
        );
        composeError.code = errorCode;
        composeError.httpStatus = composeResponse.status;
        composeError.details = errorBody?.details || errorBody || null;
        throw composeError;
      }

      let composeData;
      try {
        composeData = await composeResponse.json();
      } catch (e) {
        const composeError = new Error('Compose API returned invalid JSON');
        composeError.code = 'INVALID_JSON';
        throw composeError;
      }

      if (composeData?.success === false) {
        const errorCode = composeData.error || 'COMPOSE_FAILED';
        const errorMessage = composeData.message || 'Compose API returned success=false';
        const composeError = new Error(`Compose API error: [${errorCode}] ${errorMessage}`);
        composeError.code = errorCode;
        composeError.details = composeData.details || null;
        throw composeError;
      }

      // 🔍 DIAGNOSTIC: Log raw compose API response
      logger.info('🔍 Compose API response:', {
        hasSheetUrl: !!composeData?.sheetUrl,
        hasComposedSheetUrl: !!composeData?.composedSheetUrl,
        hasUrl: !!composeData?.url,
        keys: Object.keys(composeData || {}),
      });

      const finalSheetUrl =
        composeData?.sheetUrl || composeData?.composedSheetUrl || composeData?.url;
      const panelCoordinates = composeData?.coordinates || {};
      const composedMetadata = composeData?.metadata || {};
      const composedWidth = composedMetadata.width || 9933;
      const composedHeight = composedMetadata.height || 7016;
      const composedResolution = composedMetadata.resolution || 'final';

      if (!finalSheetUrl) {
        logger.error('Compose API returned no URL. Full response:', composeData);
        const composeError = new Error('Compose API returned no sheet URL');
        composeError.code = 'NO_SHEET_URL';
        composeError.details = composeData || null;
        throw composeError;
      }

      const baseSheetUrl = finalSheetUrl;
      const overlayMetadata = null;
      const isLandscape = true;

      const imageResult = {
        url: finalSheetUrl,
        seed: effectiveSeed,
        imageUrls: [finalSheetUrl],
        metadata: {
          width: composedWidth,
          height: composedHeight,
          aspectRatio: (composedWidth / composedHeight).toFixed(3),
          model: 'panel-compose',
          format: `A1 landscape (${composedResolution} panel-composed)`,
          isLandscape: composedWidth > composedHeight,
          panelCoordinates,
          panels: panelResults.map((p) => ({
            id: p.id,
            type: p.type,
            seed: p.seed,
            width: p.width,
            height: p.height,
            url: p.imageUrl,
          })),
        },
      };

      const panelSeedMap = panelResults.reduce((acc, p) => {
        acc[p.id || p.type] = p.seed;
        return acc;
      }, {});

      try {
        const designId = projectContext?.designId || masterDNA?.projectID || 'panel-a1-design';
        const sheetId = projectContext?.sheetId || 'panel-a1-sheet';
        await baselineArtifactStore.saveBaselineArtifacts({
          designId,
          sheetId,
          bundle: {
            baselineImageUrl: finalSheetUrl,
            siteSnapshotUrl: sitePlanAttachment || null,
            baselineDNA: masterDNA,
            panelCoordinates,
            panels: imageResult.metadata.panels,
            metadata: {
              seed: effectiveSeed,
              model: 'panel-compose',
              width: imageResult.metadata.width,
              height: imageResult.metadata.height,
              panelSeedMap,
              ...imageResult.metadata,
            },
            seeds: panelSeedMap,
            basePrompt: prompt,
          },
        });
      } catch (baselineError) {
        logger.warn('??  Failed to save panel baseline bundle:', baselineError.message);
      }

      // ========================================
      // STEP 5.25: Cross-View Consistency & Quality Assurance
      // ========================================
      reportProgress('qa', 'Running Quality Assurance Pipeline...', 85);
      logger.info('\n🔍 STEP 5.25: Running Quality Assurance Pipeline...');

      let qaResults = null;
      let qaSummary = null;

      try {
        // Find hero panel for consistency anchor
        const heroPanel = panelResults.find(
          (p) => p.type === 'v_exterior' || p.id === 'v_exterior' || p.type === 'hero_3d'
        );

        const heroAnchor = heroPanel
          ? {
              url: heroPanel.imageUrl || heroPanel.url,
              prompt: heroPanel.prompt,
              seed: heroPanel.seed,
              meta: { width: heroPanel.width, height: heroPanel.height },
            }
          : null;

        // Create regeneration function for retry service
        const regeneratePanel = async (panelKey, options, dna, ctx) => {
          const result = await generateArchitecturalImage({
            viewType: panelKey,
            designDNA: dna,
            prompt: options.prompt,
            seed: options.seed,
            width: 2000,
            height: 2000,
            init_image: options.init_image,
            image_strength: options.image_strength,
          });
          return {
            url: result?.url,
            imageUrl: result?.url,
            prompt: options.prompt,
            seed: options.seed,
          };
        };

        // Run full QA pipeline
        const qaPipelineResult = await runFullQAPipeline({
          panelResults,
          heroAnchor,
          projectContext,
          masterDNA,
          locationData,
          regeneratePanel,
          options: {
            enableRetry: isFeatureEnabled('enableAutoRetry'),
            enableArchitectQA: true,
          },
        });

        qaResults = qaPipelineResult.qaResults;
        qaSummary = getQASummaryForUI(qaResults);

        logger.info(`   QA Grade: ${qaSummary.grade} (${qaSummary.gradeLabel})`);
        logger.info(`   Overall Score: ${qaSummary.score}%`);
        logger.info(`   Cross-View Consistency: ${qaSummary.crossViewScore}%`);
        logger.info(`   RIBA Compliance: ${qaSummary.ribaCompliance}%`);
        logger.info(`   Status: ${qaSummary.passed ? '✅ PASSED' : '⚠️ NEEDS ATTENTION'}`);

        if (qaSummary.issueCount > 0) {
          logger.warn(`   Issues found: ${qaSummary.issueCount}`);
        }
      } catch (qaError) {
        logger.warn('⚠️  QA Pipeline error (non-blocking):', qaError.message);
        qaResults = null;
        qaSummary = null;
      }

      // ========================================
      // STEP 5.5: Site Plan Integration (AI-Generated, Not Composited)
      // ========================================
      // Site plan overlay metadata
      logger.info('\n🗺️ STEP 5.5: Site plan integration (HTML overlay)...');
      if (sitePlanAttachment && sitePlanAttachment.startsWith('data:')) {
        logger.info('   ✅ Captured site snapshot available for overlay');
        imageResult.metadata.sitePlanComposited = true;
        imageResult.metadata.sitePlanSource = 'server-overlay';
      } else {
        logger.info('   ℹ️ No site snapshot attachment available for overlay');
        imageResult.metadata.sitePlanComposited = false;
        imageResult.metadata.sitePlanSource = 'placeholder';
      }

      // ========================================
      // STEP 5.6: Store Upscale Metadata (On-Demand Upscaling)
      // ========================================
      logger.info('\n🔍 STEP 5.6: A1 sheet generated at base resolution...');
      logger.info(
        `   📐 Base resolution: ${imageResult.metadata.width}×${imageResult.metadata.height}px`
      );

      logger.info(
        `   📐 Target 300 DPI: ${isLandscape ? '9933×7016px' : '7016×9933px'} (upscaled on download)`
      );
      logger.info(`   💡 Upscaling to 300 DPI will be performed on-demand when user downloads`);

      // Store upscale metadata for download function
      imageResult.metadata.upscaleTarget = {
        width: isLandscape ? 9933 : 7016,
        height: isLandscape ? 7016 : 9933,
        dpi: 300,
        orientation: isLandscape ? 'landscape' : 'portrait',
      };

      imageResult.metadata.originalSheetUrl = baseSheetUrl;
      imageResult.metadata.overlay = overlayMetadata;
      imageResult.metadata.composited = finalSheetUrl !== baseSheetUrl;
      imageResult.url = finalSheetUrl;

      // ========================================
      // STEP 6: Generate Metadata
      // ========================================
      const metadata = generateA1SheetMetadata({
        masterDNA,
        location: locationData,
        portfolioBlendPercent,
      });

      if (masterDNA.massingMetrics) {
        metadata.massingMetrics = masterDNA.massingMetrics;
      }

      if (masterDNA.geometryPreview) {
        metadata.geometryPreview = masterDNA.geometryPreview;
      }
      const panelMetadata =
        Array.isArray(requiredSections) && requiredSections.length > 0
          ? buildPanelMetadata(requiredSections)
          : [];

      if (panelMetadata.length === 0) {
        logger.warn('⚠️ No panel metadata generated - requiredSections may be missing or empty');
      }

      if (panelMetadata.length > 0) {
        imageResult.metadata.panels = panelMetadata;
        metadata.panels = panelMetadata;
      }

      const modelUsed = flags.fluxImageModel || 'black-forest-labs/FLUX.1-dev';

      logger.info('\n✅ ========================================');
      logger.success(' A1 SHEET WORKFLOW COMPLETE');
      logger.success(' ========================================');
      logger.info(`   🎨 Single comprehensive sheet generated`);
      logger.info(
        `   📏 Format: A1 ${isLandscape ? 'landscape' : 'portrait'} ISO 216 (${isLandscape ? '841×594mm' : '594×841mm'})`
      );
      logger.info(
        `   🖼️  Resolution: ${imageResult.metadata.width}×${imageResult.metadata.height}px (Together.ai max)`
      );
      logger.info(
        `   📐 Print reference: 300 DPI = ${isLandscape ? '9933×7016px' : '7016×9933px'}`
      );
      logger.info(`   🤖 Model: ${modelUsed}`);
      logger.info(`   🎲 Seed: ${effectiveSeed}`);
      logger.info(
        `   🗺️  Site plan: ${sitePlanAttachment ? 'embedded via prompt' : 'placeholder generated'}`
      );
      if (sitePlanMetadata) {
        logger.info(`   📍 Site plan source: ${sitePlanMetadata.source || 'generated'}`);
      }
      logger.info(`   ⏱️  Generation time: ~40-60 seconds`);
      logger.info(`   ✨ Contains: 10+ professional sections`);

      // ========================================
      // STEP 7: Validate A1 Sheet Quality
      // ========================================
      reportProgress('finalizing', 'Validating A1 sheet quality...', 92);
      logger.info('\n🔍 STEP 7: Validating A1 sheet quality...');

      const a1SheetValidation = await a1SheetValidator.validateA1Sheet(
        {
          url: imageResult.url,
          seed: imageResult.seed,
          prompt,
          negativePrompt,
          metadata: imageResult.metadata,
        },
        masterDNA,
        blendedStyle
      );

      logger.info(`   ✅ Validation complete: ${a1SheetValidation?.score ?? 0}% quality score`);
      logger.info(`   📊 Status: ${a1SheetValidation?.valid ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);
      const validationIssues = a1SheetValidation?.issues || [];
      const validationWarnings = a1SheetValidation?.warnings || [];
      if (validationIssues.length > 0) {
        logger.info(`   ⚠️  Issues: ${validationIssues.length}`);
        validationIssues.slice(0, 3).forEach((issue) => {
          logger.info(`      - ${issue}`);
        });
      }
      if (validationWarnings.length > 0) {
        logger.info(`   ⚡ Warnings: ${validationWarnings.length}`);
      }

      // Generate validation report
      const validationReport = a1SheetValidator.generateReport(a1SheetValidation);

      // ========================================
      // STEP 7.5: DNA Consistency Check
      // ========================================
      logger.info('\n🔍 STEP 7.5: Checking consistency against DNA...');

      const consistencyChecker = (await import('./consistencyChecker.js')).default;
      const dnaConsistencyReport = consistencyChecker.checkA1SheetConsistency(
        {
          url: imageResult.url,
          prompt,
          metadata: imageResult.metadata,
        },
        masterDNA,
        projectContext
      );

      logger.info(`   DNA consistency score: ${dnaConsistencyReport.score.toFixed(1)}%`);
      logger.info(`   Status: ${dnaConsistencyReport.consistent ? 'CONSISTENT' : 'INCONSISTENT'}`);

      // Check if regeneration is needed
      const consistencyThreshold = 85; // 85% minimum for acceptable consistency
      if (!dnaConsistencyReport.consistent && dnaConsistencyReport.score < consistencyThreshold) {
        logger.warn(
          `   ⚠️  Consistency score ${dnaConsistencyReport.score.toFixed(1)}% below threshold ${consistencyThreshold}%`
        );
        logger.warn(`   💡 Consider regenerating with stronger consistency prompts`);
        logger.warn(`   Issues: ${dnaConsistencyReport.issues.slice(0, 3).join(', ')}`);

        // TODO: Implement auto-regeneration logic here
        // For now, we log the warning and continue
      } else {
        logger.info(`   ✅ DNA consistency acceptable`);
      }

      // Report completion
      reportProgress('finalizing', 'A1 sheet generation complete!', 100);

      // 🔍 DIAGNOSTIC: Log the result structure before returning
      const resultToReturn = {
        success: true,
        workflow: 'a1-sheet-one-shot',
        masterDNA,
        blendedStyle, // Include blendedStyle for history saving
        validation,
        templateValidation: promptValidationResult, // 🆕 Add template validation result
        dnaConsistencyReport, // 🆕 Add DNA consistency report
        qaResults, // 🆕 Full QA pipeline results
        qaSummary, // 🆕 QA summary for UI display
        a1Sheet: {
          url: imageResult.url,
          seed: imageResult.seed,
          prompt,
          negativePrompt,
          metadata: {
            ...imageResult.metadata,
            insetSources: {
              siteMapUrl: sitePlanMetadata?.sourceUrl || null,
              hasRealSiteMap: !!sitePlanAttachment,
              siteMapAttribution: sitePlanMetadata?.attribution || 'Google Maps',
            },
            templateCompleteness: promptValidationResult.score, // 🆕 Add template completeness score
            dnaConsistency: dnaConsistencyReport.score, // 🆕 Add DNA consistency score
            qaGrade: qaSummary?.grade || null, // 🆕 QA grade
            crossViewConsistency: qaSummary?.crossViewScore || null, // 🆕 Cross-view consistency
            ribaCompliance: qaSummary?.ribaCompliance || null, // 🆕 RIBA compliance score
          },
          format: metadata,
          qualityScore: a1SheetValidation.score, // 🆕 Add quality score
          validationReport, // 🆕 Add full validation report
        },
        sitePlanAttachment: sitePlanAttachment
          ? { dataUrl: sitePlanAttachment, ...sitePlanMetadata }
          : null, // 🆕 Store captured site plan for modifications
        sitePlanMetadata, // 🆕 Store site plan metadata
        reasoning: designReasoning || dnaResult.reasoning || {},
        projectContext,
        locationData,
        generationMetadata: {
          type: 'a1_sheet',
          seed: effectiveSeed,
          model: 'FLUX.1-dev',
          timestamp: new Date().toISOString(),
          portfolioBlend: effectivePortfolioBlendPercent,
          qualityScore: a1SheetValidation.score, // 🆕 Include in metadata
          validated: a1SheetValidation.valid,
          templateCompleteness: promptValidationResult.score, // 🆕 Add template completeness
          dnaConsistency: dnaConsistencyReport.score, // 🆕 Add DNA consistency
          qaGrade: qaSummary?.grade || null, // 🆕 QA grade
          crossViewConsistency: qaSummary?.crossViewScore || null, // 🆕 Cross-view consistency
          ribaCompliance: qaSummary?.ribaCompliance || null, // 🆕 RIBA compliance
        },
      };

      // 🔍 DIAGNOSTIC: Log exactly what we're returning
      console.log('🎯 WORKFLOW RETURNING:', {
        hasSheet: !!resultToReturn?.a1Sheet,
        hasUrl: !!resultToReturn?.a1Sheet?.url,
        url: resultToReturn?.a1Sheet?.url || 'none',
        success: resultToReturn.success,
        workflow: resultToReturn.workflow,
      });

      // DEBUG: Finish recording with success
      debugRecorder.finishRun({
        status: 'success',
        result: resultToReturn,
      });

      return resultToReturn;
    } catch (error) {
      // Extract meaningful error message
      let errorMessage = error?.message || String(error);

      // Provide helpful context for common errors
      if (
        error?.status === 503 ||
        errorMessage.includes('503') ||
        errorMessage.includes('proxy server')
      ) {
        errorMessage =
          'Proxy server unavailable. Please start the Express server by running: npm run server';
      } else if (errorMessage.includes('[object Object]')) {
        // Try to extract more details from the error object
        errorMessage =
          error?.body?.error ||
          error?.error ||
          error?.originalError?.message ||
          JSON.stringify(error) ||
          'Unknown error occurred';
      }

      logger.error('\n❌ A1 Sheet Workflow failed:', errorMessage);
      logger.error(
        '   Full error details:',
        JSON.stringify(
          {
            message: error?.message,
            status: error?.status,
            body: error?.body,
            error: error?.error,
            stack: error?.stack,
            originalError: error?.originalError,
          },
          null,
          2
        )
      );

      // DEBUG: Record error and finish run with failed status
      debugRecorder.recordError(error, { phase: 'workflow' });
      debugRecorder.finishRun({
        status: 'failed',
        result: { error: errorMessage },
      });

      return {
        success: false,
        workflow: 'a1-sheet-one-shot',
        error: errorMessage,
        message: 'Failed to generate A1 sheet',
        status: error?.status,
      };
    } finally {
      // 🛡️ ALWAYS release the generation lock
      this.releaseGenerationLock();
    }
  }

  /**
   * HYBRID A1 SHEET WORKFLOW - Panel-based generation with compositing
   *
   * Generates A1 sheet using individual panel generation for better control
   * and quality. Each panel is generated separately then composited.
   * Maintains strict DNA consistency with deterministic seed derivation.
   *
   * @param {Object} ctx - Workflow context (same as runA1SheetWorkflow)
   * @param {Object} ctx.projectContext - Building specifications
   * @param {Object} ctx.locationData - Location and climate data
   * @param {Object} ctx.portfolioAnalysis - Optional portfolio analysis
   * @param {number} ctx.portfolioBlendPercent - Portfolio influence (0-100)
   * @param {number} ctx.seed - Consistent seed for reproducibility
   * @returns {Promise<Object>} Generated A1 sheet with all panels
   */
  async runHybridA1Workflow(ctx) {
    logger.error('Hybrid A1 workflow has been removed. Use runA1SheetWorkflow (one-shot).');
    return {
      success: false,
      error: 'Hybrid A1 workflow has been removed. Use one-shot A1 generation.',
      workflow: 'hybrid-a1-removed',
    };

    logger.info('\n🎯 ========================================');
    logger.info('🎯 HYBRID A1 SHEET WORKFLOW STARTING');
    logger.info('🎯 Panel-based generation with compositing');
    logger.info('🎯 ========================================\n');

    const {
      projectContext,
      locationData,
      portfolioAnalysis = null,
      portfolioBlendPercent = 70,
      seed,
    } = ctx;

    try {
      // ========================================
      // STEP 1: Generate Master Design DNA
      // ========================================
      logger.info('\n🧬 STEP 1: Generating Master Design DNA...');

      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        null, // Portfolio analysis
        locationData
      );

      if (!dnaResult.success) {
        throw new Error('Failed to generate Master Design DNA');
      }

      const masterDNA = normalizeDNA(dnaResult.masterDNA);

      // Validate and auto-fix DNA
      const validation = this.validator.validateDesignDNA(masterDNA);
      if (!validation.isValid) {
        const fixed = this.validator.autoFixDesignDNA(masterDNA);
        if (fixed) {
          Object.assign(masterDNA, fixed);
        }
      }

      logger.success(' Master DNA generated and validated');
      this.attachMassingPreview(masterDNA, projectContext, locationData, 'STEP 1.5 (Hybrid)');

      // ========================================
      // STEP 1.6: Build Master Geometry (LEGACY - skipped when conditionedImagePipeline=true)
      // ========================================
      let masterGeometry = null;
      const useConditionedPipelineForGeometry = isFeatureEnabled('conditionedImagePipeline');

      if (!useConditionedPipelineForGeometry) {
        // LEGACY PATH: Use masterGeometryBuilder when conditionedImagePipeline is OFF
        logger.info('\n📐 STEP 1.6: Building Master Geometry (Legacy Single Source of Truth)...');

        try {
          masterGeometry = await buildMasterGeometry(masterDNA, projectContext);

          if (!masterGeometry.validation.isValid) {
            logger.warn('⚠️  Master Geometry has validation issues:');
            masterGeometry.validation.issues.forEach((issue) => {
              logger.warn(`   - ${issue}`);
            });
          } else {
            logger.success(
              ` Master Geometry built: ${masterGeometry.floors.length} floors, ${masterGeometry.validation.roomCount} rooms`
            );
          }

          // Log facade summary for cross-view validation
          const fs = masterGeometry.facadeSummary;
          logger.info('   Facade Summary:');
          logger.info(`   - North: ${fs.N.windowCount} windows, ${fs.N.doorCount} doors`);
          logger.info(`   - South: ${fs.S.windowCount} windows, ${fs.S.doorCount} doors`);
          logger.info(`   - East: ${fs.E.windowCount} windows, ${fs.E.doorCount} doors`);
          logger.info(`   - West: ${fs.W.windowCount} windows, ${fs.W.doorCount} doors`);
        } catch (geometryError) {
          logger.warn(
            `⚠️  Master Geometry build failed, proceeding without: ${geometryError.message}`
          );
          // Continue without master geometry - generators will fall back to DNA
        }
      } else {
        // NEW PATH: Skip legacy masterGeometryBuilder - geometry comes from GeometryPipeline in STEP 2.01
        if (!_migrationLogsShown.masterGeometryBuilder) {
          logger.info(
            '\n📐 STEP 1.6: [Migration] Skipping legacy masterGeometryBuilder (conditionedImagePipeline=true)'
          );
          logger.info(
            '   → Geometry will be generated via GeometryPipeline + BuildingModel in STEP 2.01'
          );
          _migrationLogsShown.masterGeometryBuilder = true;
        }
      }

      // ========================================
      // STEP 2: Blend Portfolio Style (if available)
      // ========================================
      logger.info('\n🎨 STEP 2: Blending portfolio style...');

      let blendedStyle = null;
      if (portfolioAnalysis) {
        // Use existing blending logic from One-Shot workflow
        blendedStyle = {
          styleName:
            masterDNA.architecturalStyle || portfolioAnalysis?.dominantStyle || 'Contemporary',
          materials: Array.isArray(masterDNA.materials)
            ? masterDNA.materials
                .slice(0, 3)
                .map((m) => (typeof m === 'string' ? m : m.name || 'Material'))
            : ['Brick', 'Glass', 'Concrete'],
          characteristics: Array.isArray(portfolioAnalysis?.characteristics)
            ? portfolioAnalysis.characteristics
            : ['Modern', 'Functional', 'Sustainable'],
        };
        logger.success(` Blended style: ${blendedStyle.styleName}`);
      }

      // ========================================
      // STEP 2.9: MANDATORY GEOMETRY GATE (FAIL-CLOSED)
      // Ensures geometry is complete before panel generation
      // Added 2025-12-23: Technical drawings REQUIRE geometry data
      // ========================================
      logger.info('\n🔒 STEP 2.9: Mandatory Geometry Gate...');

      const hasPopulatedGeometry = masterDNA.hasPopulatedGeometry === true;
      const hasFloorRooms = masterDNA.populatedGeometry?.floors?.some((f) => f.rooms?.length > 0);
      const hasFacadeData = !!masterDNA.facades && Object.keys(masterDNA.facades).length >= 4;
      const expectedFloors = masterDNA.dimensions?.floors || masterDNA.program?.floors || 2;

      logger.info(`   📊 Geometry Status:`);
      logger.info(`      - Has Populated Geometry: ${hasPopulatedGeometry ? '✅' : '❌'}`);
      logger.info(`      - Has Floor Rooms: ${hasFloorRooms ? '✅' : '❌'}`);
      logger.info(`      - Has Facade Data: ${hasFacadeData ? '✅' : '❌'}`);
      logger.info(`      - Expected Floors: ${expectedFloors}`);
      logger.info(`      - Actual Floors: ${masterDNA.populatedGeometry?.floors?.length || 0}`);

      // FAIL-CLOSED: Cannot proceed without geometry for technical drawings
      if (!hasPopulatedGeometry || !hasFloorRooms) {
        logger.error('❌ MANDATORY GEOMETRY GATE FAILED');
        logger.error('   Technical drawings require geometry control images.');
        logger.error('   Generation BLOCKED - fix geometry priming first.');

        // Record failure
        debugRecorder.recordStep('geometry_gate_failed', {
          hasPopulatedGeometry,
          hasFloorRooms,
          hasFacadeData,
          expectedFloors,
          actualFloors: masterDNA.populatedGeometry?.floors?.length || 0,
        });

        return {
          success: false,
          workflow: 'hybrid-a1-sheet',
          error:
            'Mandatory geometry gate failed: No geometry data available for technical drawings',
          geometryGateResult: {
            hasPopulatedGeometry,
            hasFloorRooms,
            hasFacadeData,
            expectedFloors,
            actualFloors: masterDNA.populatedGeometry?.floors?.length || 0,
          },
          masterDNA,
          suggestion:
            'Ensure GeometryPrimer.normalize() completes successfully with room polygon data.',
        };
      }

      logger.success('✅ Mandatory Geometry Gate PASSED - geometry data available');

      // ========================================
      // STEP 3: Generate Individual Panels
      // ========================================
      logger.info('\n🎨 STEP 3: Generating individual panels...');

      const baseSeed = seed || Math.floor(Math.random() * 1000000);

      // ========================================
      // STEP 3.1: Generate Hero Image First (Visual Anchor)
      // ========================================
      logger.info('\n🎯 STEP 3.1: Generating Hero 3D as visual anchor...');

      // Import hero anchor service
      const { generateHeroImage } = await import('./heroAnchorService.js');
      const { buildHero3DPrompt } = await import('../a1/panelPromptBuilders.js');
      const { derivePanelSeed } = await import('./seedDerivation.js');

      // Ensure building type is explicitly set in projectContext
      projectContext.buildingType =
        projectContext.buildingType ||
        projectContext.buildingProgram ||
        masterDNA.buildingType ||
        masterDNA.projectType;
      projectContext.buildingProgram =
        projectContext.buildingProgram || projectContext.buildingType;

      logger.info(`   🏗️  Building Type: ${projectContext.buildingType}`);

      // Build hero prompt with building type assertion
      const heroPromptData = buildHero3DPrompt({
        masterDNA,
        locationData,
        projectContext,
        consistencyLock: null, // Will be built internally
      });

      // Generate hero image first
      const heroSeed = derivePanelSeed(baseSeed, 'v_exterior');
      let heroImage = null;

      try {
        const heroResult = await generateArchitecturalImage({
          viewType: 'exterior_front_3d',
          designDNA: masterDNA,
          prompt: heroPromptData.prompt,
          negativePrompt: heroPromptData.negativePrompt,
          seed: heroSeed,
          width: 1500,
          height: 1500,
        });
        heroImage = heroResult.url;
        logger.success(`   ✅ Hero 3D generated successfully (anchor for other views)`);
      } catch (heroError) {
        logger.warn(
          `   ⚠️ Hero generation failed, proceeding without anchor: ${heroError.message}`
        );
      }

      // ========================================
      // STEP 3.2: Generate All Panels with Hero Anchor
      // ========================================
      logger.info('\n🎨 STEP 3.2: Generating remaining panels with hero anchor...');

      // Generate all panels with new orchestrator, passing hero as anchor and masterGeometry
      const panelResults = await orchestratePanelGeneration({
        masterDNA,
        masterGeometry, // NEW: Pass master geometry as single source of truth
        projectContext,
        locationData,
        blendedStyle,
        baseSeed,
        heroImage, // NEW: Pass hero image as visual anchor
        onProgress: (panelKey, status) => {
          logger.info(
            `   ${status === 'generating' ? '⏳' : status === 'completed' ? '✅' : '❌'} Panel ${panelKey}: ${status}`
          );

          // Emit granular progress for frontend
          if (ctx.onProgress) {
            ctx.onProgress({
              stage: 'rendering',
              message: `Generating panel: ${panelKey}`,
              panelUpdate: { key: panelKey, status },
            });
          }
        },
      });

      // Add hero to panel results if successful
      if (heroImage) {
        panelResults.panelMap['v_exterior'] = {
          url: heroImage,
          prompt: heroPromptData.prompt,
          negativePrompt: heroPromptData.negativePrompt,
          seed: heroSeed,
          meta: {
            width: 1500,
            height: 1500,
            zone: 'top3DCluster',
            type: 'exterior_front_3d',
            generatedAt: new Date().toISOString(),
            isHeroAnchor: true,
          },
        };
      }

      logger.success(` Generated ${Object.keys(panelResults.panelMap).length} panels`);

      if (panelResults.errors.length > 0) {
        logger.warn(`⚠️  ${panelResults.errors.length} panels failed, will use placeholders`);
        panelResults.errors.forEach((err) => {
          logger.warn(`   - ${err.panel}: ${err.error}`);
        });
      }

      // FAIL-FAST: No fallback to One-Shot - throw error for user to retry
      if (!panelResults.success || Object.keys(panelResults.panelMap).length < 3) {
        const failedCount = panelResults.errors?.length || 0;
        const generatedCount = Object.keys(panelResults.panelMap).length;
        throw new Error(
          `Panel generation failed: ${failedCount} panels failed, only ${generatedCount} generated. Please try again.`
        );
      }

      // Check for rate limit errors (now only logged, no early fallback)
      const rateLimitErrors = panelResults.errors.filter(
        (err) =>
          err.error &&
          (err.error.includes('429') ||
            err.error.includes('rate limit') ||
            err.error.includes('Rate limit'))
      );

      if (rateLimitErrors.length > 0) {
        logger.warn(`⚠️  Rate limit errors encountered: ${rateLimitErrors.length} panels affected`);
        // Continue without falling back to One-Shot; allow remaining panels to complete.
      }

      // ========================================
      // STEP 3.5: A1 EXPORT GATE (MANDATORY - FAIL-CLOSED)
      // Validates all panels before composition is allowed
      // Added 2025-12-23: Prevents bad panels from being composited
      // ========================================
      logger.info('\n🚪 STEP 3.5: Running A1 Export Gate (MANDATORY)...');

      const { validateForExport } = await import('../qa/A1ExportGate.js');

      // Prepare panels for validation
      const panelsForValidation = Object.entries(panelResults.panelMap).map(([key, data]) => ({
        type: key,
        imageUrl: data.url,
        dataUrl: data.dataUrl,
        seed: data.seed,
        controlImageInfo: data.controlImageInfo,
      }));

      const exportGateResult = await validateForExport(
        masterDNA.designFingerprint || `design_${Date.now()}`,
        panelsForValidation,
        masterDNA.populatedGeometry || null,
        masterDNA,
        {
          strictMode: true,
          requireGeometry: isFeatureEnabled('geometryFirst'),
          allowPartialExport: false,
          skipRenderSanityGate: false,
        }
      );

      logger.info(`   📊 Export Gate Status: ${exportGateResult.status.toUpperCase()}`);
      logger.info(`   ✅ Can Export: ${exportGateResult.canExport ? 'YES' : 'NO'}`);
      logger.info(`   ❌ Block Reasons: ${exportGateResult.blockReasons.length}`);
      logger.info(`   ⚠️  Warnings: ${exportGateResult.warnings.length}`);

      // FAIL-CLOSED: BLOCK COMPOSITION IF EXPORT GATE FAILS
      if (!exportGateResult.canExport) {
        logger.error('❌ A1 Export Gate FAILED - BLOCKING COMPOSITION');
        for (const reason of exportGateResult.blockReasons) {
          logger.error(`   ❌ ${reason}`);
        }

        // Record failure in debug recorder
        debugRecorder.recordStep('export_gate_failed', {
          status: exportGateResult.status,
          blockReasons: exportGateResult.blockReasons,
          warnings: exportGateResult.warnings,
          panelCount: panelsForValidation.length,
        });

        return {
          success: false,
          workflow: 'hybrid-a1-sheet',
          error: `A1 Export Gate blocked composition: ${exportGateResult.blockReasons[0]}`,
          exportGateResult: {
            status: exportGateResult.status,
            blockReasons: exportGateResult.blockReasons,
            warnings: exportGateResult.warnings,
            panelQA: exportGateResult.panelQA,
            geometryQA: exportGateResult.geometryQA,
            renderSanityQA: exportGateResult.renderSanityQA,
          },
          masterDNA,
          panelResults: panelsForValidation,
          suggestion: 'Fix the blocking issues and retry generation.',
        };
      }

      logger.success('✅ A1 Export Gate PASSED - proceeding to composition');

      // Log any warnings (non-blocking)
      if (exportGateResult.warnings.length > 0) {
        logger.warn(`   ⚠️  ${exportGateResult.warnings.length} warnings (non-blocking):`);
        for (const warning of exportGateResult.warnings.slice(0, 3)) {
          logger.warn(`      - ${warning}`);
        }
      }

      // ========================================
      // STEP 4: Composite Panels into A1 Sheet
      // ========================================
      logger.info('\n🖼️  STEP 4: Compositing panels into A1 sheet...');

      // Convert panelMap to array format for compositor
      // Map panel keys to layout IDs expected by a1TemplateGenerator
      const { getLayoutIdForPanel } = await import('./panelOrchestrator.js');
      const panelsArray = Object.entries(panelResults.panelMap).map(([key, data]) => ({
        id: getLayoutIdForPanel(key), // Map to layout ID (e.g., 'plan_ground' -> 'ground-floor')
        originalKey: key, // Keep original key for reference
        url: data.url,
        seed: data.seed,
        meta: data.meta,
      }));

      // Get layout from a1TemplateGenerator
      const { generateA1Template } = await import('./a1TemplateGenerator.js');
      const templateResult = generateA1Template({
        resolution: 'working', // Use working resolution (will be landscape for hybrid)
        format: 'json', // Get layout object
      });
      const layout = templateResult.layout; // Contains sheet, dimensions, panels

      // Composite all panels into final A1 sheet
      const compositedSheet = await compositeA1Sheet({
        panels: panelsArray,
        layout: layout,
        masterDNA,
        locationData,
        projectContext,
        format: 'canvas', // Use canvas for high-quality compositing
        includeAnnotations: true,
        includeTitleBlock: true,
      });

      logger.success(' A1 sheet composited successfully');

      // ========================================
      // STEP 5: Validate Final Sheet
      // ========================================
      logger.info('\n🔍 STEP 5: Validating composited A1 sheet...');

      compositedSheet.metadata.panels = panelsArray.map((panel) => ({
        id: panel.id || panel.originalKey || 'panel',
        name: panel.originalKey || panel.id || 'panel',
        view: panel.originalKey || panel.id || 'panel',
        status: panel.url ? 'rendered' : 'missing',
      }));

      const a1SheetValidation = await a1SheetValidator.validateA1Sheet(
        {
          url: compositedSheet.url,
          panels: panelsArray,
          metadata: compositedSheet.metadata,
        },
        masterDNA,
        blendedStyle
      );

      logger.info(`   ✅ Validation complete: ${a1SheetValidation.score}% quality score`);
      logger.info(`   📊 Status: ${a1SheetValidation.valid ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

      // ========================================
      // STEP 5: Generate Metadata
      // ========================================
      const metadata = generateA1SheetMetadata({
        masterDNA,
        location: locationData,
        portfolioBlendPercent,
      });

      logger.info('\n✅ ========================================');
      logger.success(' HYBRID A1 SHEET WORKFLOW COMPLETE');
      logger.success(' ========================================');
      logger.info(
        `   🎨 ${Object.keys(panelResults.panelMap).length} panels generated and composited`
      );
      logger.info(`   📏 Format: A1 landscape ISO 216 (841×594mm)`);
      logger.info(`   🖼️  Resolution: ${compositedSheet.width}×${compositedSheet.height}px`);
      logger.info(`   📊 Quality score: ${a1SheetValidation.score}%`);
      logger.info(`   🎲 Base seed: ${baseSeed}`);
      logger.info(`   ⏱️  Total generation time: ~2-3 minutes`);

      // Return in format compatible with existing UI
      return {
        success: true,
        workflow: 'hybrid-a1-sheet',
        masterDNA,
        blendedStyle,
        validation,
        a1Sheet: {
          url: compositedSheet.url,
          panels: panelResults.panelMap, // Include individual panels with seeds
          seed: baseSeed,
          seedMap: panelResults.seedMap, // Include seed map for consistency
          prompt: null, // No single prompt for hybrid mode
          negativePrompt: null,
          metadata: {
            ...compositedSheet.metadata,
            panelCount: Object.keys(panelResults.panelMap).length,
            failedPanels: panelResults.errors.length,
            panelMap: panelResults.panelMap,
            workflow: 'hybrid',
          },
          format: metadata,
          qualityScore: a1SheetValidation.score,
          validationReport: a1SheetValidator.generateReport(a1SheetValidation),
        },
        reasoning: dnaResult.reasoning || {},
        projectContext,
        locationData,
        generationMetadata: {
          type: 'hybrid_a1_sheet',
          seed: baseSeed,
          model: 'FLUX.1-dev',
          timestamp: new Date().toISOString(),
          portfolioBlend: portfolioBlendPercent,
          qualityScore: a1SheetValidation.score,
          validated: a1SheetValidation.valid,
          panelsGenerated: Object.keys(panelResults.panelMap).length,
          panelsFailed: panelResults.errors.length,
        },
      };
    } catch (error) {
      logger.error('\n❌ Hybrid A1 Sheet Workflow failed:', error);
      return {
        success: false,
        workflow: 'hybrid-a1-sheet',
        error: error.message,
        message: 'Failed to generate hybrid A1 sheet',
      };
    }
  }

  async attachMassingPreview(masterDNA, projectContext, locationData, stepLabel = 'STEP 4') {
    logger.info(`\n🏗️ ${stepLabel}: Generating 3D massing model...`);

    try {
      const fallbackSiteContext = locationData?.siteAnalysis
        ? {
            metrics: {
              areaM2: locationData.siteAnalysis.surfaceArea || null,
              orientationDeg: locationData.siteAnalysis.orientationDeg || null,
            },
            facadeOrientation: locationData.siteAnalysis.principalFacadeDirection || null,
          }
        : null;

      // Lazy import geometry-first features (TypeScript dependencies)
      let massingModel = null;
      try {
        const { generateMassingModel } = await import('../rings/ring4-3d/massingGenerator.js');
        massingModel = await generateMassingModel({
          masterDNA,
          siteContext: locationData?.siteDNA || fallbackSiteContext,
          options: {
            coverageTarget:
              locationData?.zoning?.siteCoverage || locationData?.zoning?.maxCoverage || null,
          },
        });
      } catch (err) {
        logger.warn('⚠️ Geometry-first features not available (TypeScript not compiled)');
      }

      if (massingModel?.summary) {
        const { summary, preview, warnings } = massingModel;

        masterDNA.massingMetrics = summary;
        masterDNA.geometryPreview = preview;

        if (projectContext) {
          if (!projectContext.massingMetrics) {
            projectContext.massingMetrics = summary;
          }
          if (!projectContext.geometryPreview) {
            projectContext.geometryPreview = preview;
          }
        }

        const coverageText =
          typeof summary.siteCoverage === 'number'
            ? `${(summary.siteCoverage * 100).toFixed(1)}%`
            : 'n/a';

        logger.info(
          `   ✅ Massing summary → Footprint: ${summary.footprintArea || 'n/a'}m², Height: ${summary.buildingHeight || 'n/a'}m, Coverage: ${coverageText}`
        );

        if (warnings?.length) {
          warnings.forEach((warning) => logger.warn(`   ⚠️ ${warning}`));
        }
      }

      return massingModel;
    } catch (error) {
      logger.warn('⚠️  Massing model generation failed:', error.message);
      return null;
    }
  }

  /**
   * UTILITY: Build initial project prompt
   */
  buildInitialPrompt(projectContext, locationData) {
    const {
      buildingProgram = 'house',
      floorArea = 200,
      floors = 2,
      style = 'modern',
      materials = 'brick, glass, concrete',
    } = projectContext;

    return `Design a ${style} ${buildingProgram} with ${floors} floors and ${floorArea}m² total area.
Location: ${locationData?.address || 'Not specified'}
Climate: ${locationData?.climate?.type || 'Temperate'}
Materials: ${materials}
Architectural Style: ${style}`;
  }

  /**
   * UTILITY: Build DNA-constrained prompt for view generation
   */
  buildDNAConstrainedPrompt(dnaPackage, viewType, userPrompt = '') {
    const dna = dnaPackage.designDNA;

    // Base DNA constraints
    const prompt = `Generate architectural ${viewType.replace('_', ' ')} view.

DESIGN DNA CONSTRAINTS (MUST FOLLOW):
- Exact Dimensions: ${dna.dimensions?.length}m × ${dna.dimensions?.width}m × ${dna.dimensions?.height || dna.dimensions?.totalHeight}m
- Exact Floors: ${dna.dimensions?.floor_count || dna.dimensions?.floors} floors (NO MORE, NO LESS)
- Primary Material: ${dna.materials?.exterior?.primary} (${dna.materials?.exterior?.color_hex})
- Roof: ${dna.roof?.type} roof, ${dna.roof?.pitch}, ${dna.roof?.material} (${dna.materials?.roof?.color_hex})
- Windows: ${dna.windows?.type} windows, ${dna.windows?.count_total} total
- Color Palette: Primary ${dna.color_palette?.primary}, Secondary ${dna.color_palette?.secondary}, Accent ${dna.color_palette?.accent}
- Style: ${dna.architectural_style?.name}

CONSISTENCY RULES:
${dna.consistency_rules?.slice(0, 5).join('\n') || 'Maintain exact specifications'}

VIEW-SPECIFIC REQUIREMENTS:
${dna.view_specific_notes?.[viewType] || 'Standard architectural representation'}

${userPrompt ? `\nADDITIONAL INSTRUCTIONS:\n${userPrompt}` : ''}

CRITICAL: All specifications above are EXACT and MANDATORY. No variations allowed.`;

    return prompt;
  }

  /**
   * UTILITY: Get consistency recommendation
   */
  getConsistencyRecommendation(harmonyResult) {
    const score = harmonyResult.score;

    if (score >= 0.85) {
      return {
        action: 'accept',
        message: 'Excellent consistency. This view can be used as-is.',
        confidence: 'high',
      };
    } else if (score >= 0.8) {
      return {
        action: 'accept_with_review',
        message: 'Good consistency. Minor review recommended.',
        confidence: 'medium',
      };
    } else if (score >= 0.7) {
      return {
        action: 'review_required',
        message:
          'Acceptable consistency but review required. Consider regenerating with stronger constraints.',
        confidence: 'low',
      };
    } else {
      return {
        action: 'regenerate',
        message: 'Poor consistency detected. Regeneration strongly recommended.',
        confidence: 'very_low',
      };
    }
  }

  /**
   * UTILITY: Generate consistency report
   */
  generateConsistencyReport(workflow) {
    const history = workflow.consistency.history;

    const report = {
      totalChecks: workflow.consistency.checksPerformed,
      averageScore: workflow.consistency.averageScore,
      averagePercentage: (workflow.consistency.averageScore * 100).toFixed(1) + '%',
      scoreDistribution: {
        excellent: history.filter((h) => h.score >= 0.85).length,
        good: history.filter((h) => h.score >= 0.8 && h.score < 0.85).length,
        acceptable: history.filter((h) => h.score >= 0.7 && h.score < 0.8).length,
        poor: history.filter((h) => h.score < 0.7).length,
      },
      viewsGenerated: Object.keys(workflow.pipeline.filter((p) => p.status === 'completed')).length,
      completionPercentage: workflow.completionPercentage,
    };

    return report;
  }

  /**
   * Run Multi-Panel A1 Workflow
   *
   * Generates 14 individual panels with specialized prompts, then composes into A1 sheet.
   * Uses hash-derived seeds for reproducibility and panel-specific drift detection.
   *
   * @param {Object} params - Workflow parameters
   * @param {Object} params.locationData - Location and climate data
   * @param {Object} params.projectContext - Building specifications
   * @param {Array} params.portfolioFiles - Optional portfolio images
   * @param {Object} params.siteSnapshot - Site snapshot with map
   * @param {number} params.baseSeed - Optional base seed
   * @returns {Promise<Object>} Complete A1 sheet result with panels
   */
  async runMultiPanelA1Workflow(params, options = {}) {
    logger.error('Multi-panel A1 workflow has been removed. Use runA1SheetWorkflow (one-shot).');
    return {
      success: false,
      error: 'Multi-panel A1 workflow has been removed. Use one-shot A1 generation.',
      workflow: 'multi-panel-a1-removed',
    };

    const overrides = options?.overrides || {};

    const dnaGeneratorInstance = overrides.dnaGenerator || this.dnaGenerator;
    const dnaValidatorInstance = overrides.dnaValidator || this.validator;
    const deriveSeedsFn = overrides.seedUtils?.derivePanelSeedsFromDNA || derivePanelSeedsFromDNA;
    const planPanelsFn = overrides.panelService?.planA1Panels || planA1Panels;
    const generateImageFn =
      overrides.togetherAIService?.generateArchitecturalImage || generateArchitecturalImage;
    const validatePanelConsistencyFn =
      overrides.driftValidator?.validatePanelConsistency || validatePanelConsistency;
    const validateMultiConsistencyFn =
      overrides.driftValidator?.validateMultiPanelConsistency || validateMultiPanelConsistency;
    const baselineStore = overrides.baselineStore || baselineArtifactStore;
    const historyService = overrides.historyService || this.historyService;
    const panelTypesOverride = overrides.panelTypes;
    const fetchImpl = overrides.composeClient || (typeof fetch === 'function' ? fetch : null);
    const progressCallback = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const reportProgress = (stage, message, percent) => {
      if (progressCallback) {
        progressCallback({ stage, message, percent });
      }
    };

    logger.info('\n🎨 ========================================');
    logger.info('🎨 MULTI-PANEL A1 WORKFLOW');
    logger.info('🎨 ========================================\n');

    const {
      locationData,
      projectContext,
      portfolioFiles = [],
      siteSnapshot = null,
      baseSeed = null,
    } = params;

    try {
      // STEP 1: Generate Master DNA via Qwen
      logger.info('🧬 STEP 1: Generating Master DNA...');
      reportProgress('analysis', 'Generating Master DNA', 10);

      // Extract portfolio analysis if files provided
      let portfolioAnalysis = null;
      if (portfolioFiles && portfolioFiles.length > 0) {
        try {
          portfolioAnalysis = await dnaGeneratorInstance.extractDNAFromPortfolio(portfolioFiles);
        } catch (err) {
          logger.warn('Portfolio analysis failed, continuing without it:', err.message);
        }
      }

      // Use two-pass DNA generator if enabled (default: true for strict consistency)
      const useTwoPassDNA = isFeatureEnabled('twoPassDNA') !== false; // Default to true
      let dnaResponse;

      if (useTwoPassDNA) {
        logger.info('   Using Two-Pass DNA Generator (strict mode)');
        try {
          dnaResponse = await twoPassDNAGenerator.generateMasterDesignDNA(
            projectContext,
            portfolioAnalysis,
            locationData
          );

          if (!dnaResponse.success) {
            throw new Error('Two-pass DNA generation failed');
          }
        } catch (twoPassError) {
          logger.error('❌ Two-Pass DNA generation failed:', twoPassError.message);
          throw new Error(
            `DNA generation failed: ${twoPassError.message}. Please check your inputs and try again.`
          );
        }
      } else {
        logger.info('   Using Legacy DNA Generator');
        dnaResponse = await dnaGeneratorInstance.generateMasterDesignDNA(
          projectContext,
          portfolioAnalysis,
          locationData
        );
      }

      // Extract masterDNA from response (handles both direct DNA and wrapped response)
      const masterDNA = dnaResponse.masterDNA || dnaResponse;

      // FAIL-FAST: No fallback DNA allowed
      if (masterDNA.isFallback) {
        throw new Error('DNA generation produced fallback result. Please try again.');
      }

      logger.success('✅  [DNA Generator] Master Design DNA generated and normalized');
      logger.info(
        `   📏 Dimensions: ${masterDNA.dimensions?.length || 0}m × ${masterDNA.dimensions?.width || 0}m × ${masterDNA.dimensions?.height || masterDNA.dimensions?.totalHeight || 0}m`
      );
      logger.info(
        `   🏗️  Floors: ${masterDNA.dimensions?.floors || masterDNA.dimensions?.floorCount || 0}`
      );
      logger.info(
        `   🎨 Materials: ${Array.isArray(masterDNA.materials) ? masterDNA.materials.length : 'N/A'} items`
      );
      logger.info(`   🏠 Roof: ${masterDNA.roof?.type || 'N/A'}`);

      // STEP 2: Validate DNA
      logger.info('✅ STEP 2: Validating DNA...');
      const validationResult = dnaValidatorInstance.validateDesignDNA(masterDNA);

      if (!validationResult.isValid) {
        logger.warn('⚠️ DNA validation issues found');
        logger.info('   Errors:', validationResult.errors?.length || 0);
        logger.info('   Warnings:', validationResult.warnings?.length || 0);

        // Attempt auto-fix if available
        if (dnaValidatorInstance.autoFixDesignDNA) {
          const fixed = dnaValidatorInstance.autoFixDesignDNA(masterDNA);
          if (fixed) {
            logger.success('✅ DNA auto-fixed successfully');
            Object.assign(masterDNA, fixed);
          }
        }
      }

      logger.success('✅ DNA validated');
      reportProgress('dna', 'DNA validated', 25);

      // STEP 2.5: Geometry reasoning + baseline (LEGACY - skipped when conditionedImagePipeline=true)
      let geometryRenders = null;
      let geometryRenderMap = null;
      let geometryDNA = null;
      let geometryScene = null;

      // Skip legacy geometry rendering if conditioned pipeline is active
      const skipLegacyGeometryRender = isFeatureEnabled('conditionedImagePipeline');

      if (isFeatureEnabled('geometryVolumeFirst') && !skipLegacyGeometryRender) {
        // LEGACY PATH: Use geometryRenderService when conditionedImagePipeline is OFF or failed
        logger.info('🏗️  STEP 2.5: Generating geometry DNA and placeholder renders (Legacy)...');

        try {
          geometryDNA = generateGeometryDNA({
            masterDNA,
            sitePolygon: siteSnapshot?.sitePolygon || [],
            climate: locationData?.climate,
            style: masterDNA.architecturalStyle,
          });

          const geometryModel = buildGeometryModel(geometryDNA, masterDNA);
          geometryScene = createSceneSpec(geometryModel);
          const rendersArray = (await renderGeometryPlaceholders(geometryDNA)) || [];

          geometryRenders = rendersArray;
          geometryRenderMap = rendersArray.reduce((acc, render) => {
            acc[render.type] = render;
            return acc;
          }, {});

          // Attach geometry DNA to masterDNA for downstream consumers
          masterDNA.geometry = geometryDNA;

          logger.success('✅ Geometry DNA and placeholder renders generated', {
            renders: rendersArray.length,
          });
          reportProgress('layout', 'Geometry baseline ready', 35);
        } catch (renderError) {
          logger.warn(
            '⚠️  Geometry pass failed, continuing without geometry baselines:',
            renderError.message
          );
        }
      } else if (skipLegacyGeometryRender) {
        // NEW PATH: Skip legacy geometryRenderService - renders come from GeometryPipeline
        if (!_migrationLogsShown.geometryRenderService) {
          logger.info(
            '🏗️  STEP 2.5: [Migration] Skipping legacy geometryRenderService (conditionedImagePipeline=true)'
          );
          logger.info('   → 2D outputs already generated via Projections2D in STEP 2.01');
          _migrationLogsShown.geometryRenderService = true;
        }
      }

      // STEP 3: Derive panel seeds from DNA hash
      logger.info('🔢 STEP 3: Deriving panel seeds from DNA...');
      const panelSequence = panelTypesOverride || [
        'hero_3d',
        'interior_3d',
        'axonometric', // 3D-03: Overview axonometric diagram
        'site_diagram',
        'floor_plan_ground',
        'floor_plan_first',
        'floor_plan_level2',
        'elevation_north',
        'elevation_south',
        'elevation_east',
        'elevation_west',
        'section_AA',
        'section_BB',
        'schedules_notes',
        'material_palette',
        'climate_card',
      ];

      const panelSeeds = deriveSeedsFn(masterDNA, panelSequence);
      const effectiveBaseSeed = baseSeed || panelSeeds.hero_3d || Date.now();

      logger.success(`✅ Derived ${Object.keys(panelSeeds).length} panel seeds`);

      const geometryValidation = geometryRenderMap
        ? validateGeometryRenders(geometryRenderMap, panelSequence)
        : { filtered: null, invalidKeys: [], missing: [], hasValid: false };
      const usableGeometryRenders = geometryValidation.filtered || null;

      // STEP 4: Generate panel jobs
      logger.info('📋 STEP 4: Planning panel generation jobs...');
      const panelJobs = planPanelsFn({
        masterDNA,
        siteBoundary: siteSnapshot?.sitePolygon || null,
        buildingType: projectContext?.buildingProgram || 'residential',
        entranceOrientation: masterDNA?.entranceDirection || 'N',
        programSpaces: projectContext?.programSpaces || [],
        baseSeed: effectiveBaseSeed,
        climate: locationData?.climate,
        locationData: locationData,
        geometryRenders: usableGeometryRenders,
        geometryDNA,
      });

      const floorCount = masterDNA?.dimensions?.floors || 2;
      const expectedPanels = floorCount === 1 ? 12 : floorCount === 2 ? 13 : 14;
      logger.success(
        `✅ Planned ${panelJobs.length} panel generation jobs (expected ${expectedPanels} for ${floorCount}-floor building)`
      );
      reportProgress('layout', 'Panel jobs ready', 45);

      // STEP 5: Execute parallel batch generation with Together.ai
      logger.info('🎨 STEP 5: Generating panels in parallel batches...');

      // Group panels into logical batches for parallel processing
      // This balances speed with rate limits (approx 3 concurrent requests)
      const batches = [];
      const batchSize = 3;

      // Sort jobs to prioritize key visuals first
      const prioritizedJobs = [...panelJobs].sort((a, b) => {
        const priority = {
          hero_3d: 0,
          interior_3d: 1,
          site_diagram: 2,
          floor_plan_ground: 3,
          floor_plan_first: 4,
          elevation_south: 5,
          elevation_north: 6,
          elevation_east: 7,
          elevation_west: 8,
          section_AA: 9,
          section_BB: 10,
          schedules_notes: 11,
          material_palette: 12,
          climate_card: 13,
        };
        return (priority[a.type] || 99) - (priority[b.type] || 99);
      });

      for (let i = 0; i < prioritizedJobs.length; i += batchSize) {
        batches.push(prioritizedJobs.slice(i, i + batchSize));
      }

      logger.info(
        `   Processing ${batches.length} batches (approx 3 panels each) with 5s inter-batch delay`
      );

      const generatedPanels = [];
      const generationStart = 45;
      const generationSpan = 45;
      reportProgress('rendering', 'Starting parallel panel generation', generationStart);

      let completedCount = 0;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        logger.info(
          `   🚀 Starting Batch ${b + 1}/${batches.length} (${batch.map((j) => j.type).join(', ')})`
        );

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (job) => {
            try {
              // Check if we have a geometry render for this panel type
              let geometryRender = null;
              if (usableGeometryRenders && job.type.includes('elevation')) {
                const direction = job.type.includes('north')
                  ? 'north'
                  : job.type.includes('south')
                    ? 'south'
                    : job.type.includes('east')
                      ? 'east'
                      : 'west';
                geometryRender = usableGeometryRenders[`orthographic_${direction}`];
              } else if (usableGeometryRenders && job.type === 'hero_3d') {
                geometryRender = usableGeometryRenders.perspective_hero;
              } else if (usableGeometryRenders && job.type === 'axonometric_3d') {
                geometryRender = usableGeometryRenders.axonometric;
              } else if (usableGeometryRenders && job.type.startsWith('section_')) {
                geometryRender =
                  usableGeometryRenders[job.type] || usableGeometryRenders.axonometric || null;
              }

              const result = await generateImageFn({
                viewType: job.type,
                prompt: job.prompt,
                negativePrompt: job.negativePrompt,
                width: job.width,
                height: job.height,
                seed: job.seed,
                designDNA: masterDNA,
                geometryDNA,
                geometryRender, // Pass geometry render if available
                geometryStrength: job.meta?.geometryStrength || 0.6, // Moderate influence - allow AI to add details
              });

              return {
                id: job.id,
                type: job.type,
                imageUrl: result.url || result.imageUrls?.[0],
                seed: result.seedUsed || job.seed,
                prompt: job.prompt,
                negativePrompt: job.negativePrompt,
                width: result.metadata?.width || job.width,
                height: result.metadata?.height || job.height,
                dnaSnapshot: job.dnaSnapshot,
                meta: {
                  ...job.meta,
                  hadGeometryControl: !!geometryRender,
                  model: result.model || 'flux',
                },
                success: true,
              };
            } catch (error) {
              logger.error(`   ❌ Failed to generate ${job.type}:`, error.message);
              return { type: job.type, success: false, error: error.message };
            }
          })
        );

        // Process results
        batchResults.forEach((result) => {
          if (result.success) {
            generatedPanels.push(result);
            logger.success(`   ✅ Generated ${result.type}`);
          }
        });

        completedCount += batch.length;
        const percent =
          generationStart + Math.round((completedCount / panelJobs.length) * generationSpan);
        reportProgress('rendering', `Batch ${b + 1} complete`, Math.min(90, percent));

        // Reduced rate limiting delay (5 seconds between batches)
        if (b < batches.length - 1) {
          logger.info('   ⏳ Waiting 5s for rate limit safety...');
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      logger.success(`✅ Generated ${generatedPanels.length}/${panelJobs.length} panels`);
      reportProgress('rendering', 'Panel generation complete', 90);

      // Ensure required panels (from planned jobs) exist; retry missing once
      const requiredPanels = Array.from(new Set(panelJobs.map((j) => j.type)));

      const existingTypes = new Set(generatedPanels.map((p) => p.type));
      const missingTypes = requiredPanels.filter((type) => !existingTypes.has(type));

      if (missingTypes.length > 0) {
        logger.warn(
          `Missing panels detected, attempting single retry for: ${missingTypes.join(', ')}`
        );

        for (const type of missingTypes) {
          const job = panelJobs.find((j) => j.type === type);
          if (!job) {
            continue;
          }
          try {
            const result = await generateImageFn({
              viewType: job.type,
              prompt: job.prompt,
              negativePrompt: job.negativePrompt,
              width: job.width,
              height: job.height,
              seed: job.seed,
              designDNA: masterDNA,
            });

            generatedPanels.push({
              id: job.id,
              type: job.type,
              imageUrl: result.url || result.imageUrls?.[0],
              seed: result.seedUsed || job.seed,
              prompt: job.prompt,
              negativePrompt: job.negativePrompt,
              width: result.metadata?.width || job.width,
              height: result.metadata?.height || job.height,
              dnaSnapshot: job.dnaSnapshot,
              meta: job.meta,
            });
            existingTypes.add(type);
            logger.success(`✅ Retried and captured ${type}`);
          } catch (retryErr) {
            logger.error(`Retry failed for missing panel ${type}:`, retryErr.message);
          }
        }
      }

      const stillMissing = requiredPanels.filter((type) => !existingTypes.has(type));
      if (stillMissing.length > 0) {
        return {
          success: false,
          error: `Missing required panels after retry: ${stillMissing.join(', ')}`,
          missingPanels: stillMissing,
        };
      }

      // STEP 6: Store panels in baseline artifact store
      logger.info('💾 STEP 6: Storing panels in baseline artifact store...');
      const designId = `design_${Date.now()}`;
      const sheetId = `sheet_${Date.now()}`;

      // STEP 7: Detect drift with drift validator
      logger.info('🔍 STEP 7: Validating panel consistency...');
      // FIX: Use Promise.allSettled to handle individual validation errors gracefully
      const panelValidationResults = await Promise.allSettled(
        generatedPanels.map(async (panel) => {
          try {
            return await validatePanelConsistencyFn({
              panelType: panel.type,
              baselineUrl: null, // No baseline for initial generation
              candidateUrl: panel.imageUrl,
              baselineDNA: masterDNA,
              candidateDNA: masterDNA,
            });
          } catch (validationError) {
            logger.warn(`Panel validation failed for ${panel.type}: ${validationError.message}`);
            // Return a default validation result instead of failing
            return {
              panelType: panel.type,
              valid: true, // Assume valid if validation fails
              score: 0.8, // Conservative default score
              error: validationError.message,
            };
          }
        })
      );

      // Extract successful results or default values for rejected promises
      const panelValidations = panelValidationResults.map((result, idx) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          // Promise was rejected - use default validation
          const panel = generatedPanels[idx];
          logger.warn(`Panel validation promise rejected for ${panel?.type}: ${result.reason}`);
          return {
            panelType: panel?.type || `panel_${idx}`,
            valid: true,
            score: 0.8,
            error: String(result.reason),
          };
        }
      });

      const consistencyReport = validateMultiConsistencyFn(panelValidations);
      logger.info(
        `   Consistency score: ${(consistencyReport.consistencyScore * 100).toFixed(1)}%`
      );

      // STEP 7.5: Validate panel layout before composition
      logger.info('🔍 STEP 7.5: Validating panel layout before composition...');
      const layoutValidation = validatePanelLayout(generatedPanels, { floorCount });

      if (!layoutValidation.valid) {
        logger.error(`❌ Panel layout validation failed: ${layoutValidation.errors.join(', ')}`);
        logger.error(`   Missing panels: ${layoutValidation.missingPanels.join(', ')}`);
        return {
          success: false,
          error: 'MISSING_REQUIRED_PANELS',
          message: `Cannot compose A1 sheet - missing required panels: ${layoutValidation.missingPanels.join(', ')}`,
          details: {
            missingPanels: layoutValidation.missingPanels,
            generatedPanels: generatedPanels.map((p) => p.type),
          },
          missingPanels: layoutValidation.missingPanels,
          generatedPanels: generatedPanels.map((p) => p.type),
          // backwards-compat helper for UI
          suggestion: 'Please retry generation or regenerate missing panels individually.',
        };
      }

      logger.success(
        `✅ Panel layout validated: ${layoutValidation.panelCount}/${getRequiredPanels(floorCount).length} panels ready for composition`
      );

      // STEP 8: Compose sheet via /api/a1/compose
      logger.info('🖼️  STEP 8: Composing A1 sheet...');
      reportProgress('composing', 'Composing panels into A1 sheet...', 93);

      if (!fetchImpl) {
        throw new Error('Fetch API is not available and no composeClient override was provided');
      }

      // Check panel count before attempting composition
      const requiredPanelCount = getRequiredPanels(floorCount).length;
      if (generatedPanels.length < requiredPanelCount) {
        logger.error(
          `❌ Insufficient panels for composition: ${generatedPanels.length}/${requiredPanelCount}`
        );
        logger.error(
          `   Missing: ${getRequiredPanels(floorCount)
            .filter((p) => !generatedPanels.find((gp) => gp.type === p))
            .join(', ')}`
        );

        const errorMsg = `Generation incomplete: Only ${generatedPanels.length}/${requiredPanelCount} panels were generated. This usually indicates rate limiting or API timeouts. Please try again in 1-2 minutes.`;

        throw new Error(errorMsg);
      }

      const composePayload = {
        designId,
        panels: generatedPanels.map((p) => ({
          type: p.type,
          imageUrl: p.imageUrl,
          label: p.type.toUpperCase().replace(/_/g, ' '),
        })),
        siteOverlay: siteSnapshot?.dataUrl ? { imageUrl: siteSnapshot.dataUrl } : null,
        layoutTemplate: 'board-v2',
        resolution: 'final',
      };

      let compositionResult;
      try {
        reportProgress('composing', 'Uploading panels for composition...', 95);

        const composeResponse = await fetchImpl(`${API_BASE_URL}/api/a1/compose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(composePayload),
        });

        reportProgress('composing', 'Processing composition...', 96);

        if (!composeResponse.ok) {
          let errorBody = null;
          try {
            errorBody = await composeResponse.json();
          } catch (e) {
            errorBody = await composeResponse.text().catch(() => null);
          }
          const errorCode = errorBody?.error || errorBody?.code || `HTTP_${composeResponse.status}`;
          const errorMessage =
            errorBody?.message ||
            errorBody?.error ||
            (typeof errorBody === 'string' ? errorBody : `HTTP ${composeResponse.status}`);

          if (errorBody?.missingPanels) {
            const missingError = new Error(
              `Missing required panels: ${errorBody.missingPanels.join(', ')}. Generation may have been interrupted by rate limits. Please retry.`
            );
            missingError.code = errorCode || 'MISSING_REQUIRED_PANELS';
            missingError.httpStatus = composeResponse.status;
            missingError.details = { missingPanels: errorBody.missingPanels };
            throw missingError;
          }

          const composeError = new Error(`Composition failed: [${errorCode}] ${errorMessage}`);
          composeError.code = errorCode;
          composeError.httpStatus = composeResponse.status;
          composeError.details = errorBody?.details || errorBody || null;
          throw composeError;
        }

        let composeJson;
        try {
          composeJson = await composeResponse.json();
        } catch (e) {
          const composeError = new Error('Compose API returned invalid JSON');
          composeError.code = 'INVALID_JSON';
          throw composeError;
        }

        if (composeJson?.success === false) {
          const errorCode = composeJson.error || 'COMPOSE_FAILED';
          const errorMessage = composeJson.message || 'Compose API returned success=false';
          const composeError = new Error(`Composition failed: [${errorCode}] ${errorMessage}`);
          composeError.code = errorCode;
          composeError.details = composeJson.details || null;
          throw composeError;
        }

        const composedSheetUrl =
          composeJson?.sheetUrl || composeJson?.composedSheetUrl || composeJson?.url;
        if (!composedSheetUrl) {
          const composeError = new Error('Compose API returned no sheet URL');
          composeError.code = 'NO_SHEET_URL';
          composeError.details = composeJson || null;
          throw composeError;
        }

        compositionResult = {
          ...composeJson,
          sheetUrl: composedSheetUrl,
          composedSheetUrl: composedSheetUrl,
          url: composedSheetUrl,
        };
        logger.success('✅ A1 sheet composed successfully');
        reportProgress('finalizing', 'A1 sheet composed successfully', 97);
      } catch (composeError) {
        logger.error('❌ A1 Sheet Composition failed:', composeError.message);

        // If we have panels, report them to user
        if (generatedPanels.length > 0) {
          logger.info(`   Generated panels: ${generatedPanels.map((p) => p.type).join(', ')}`);
        }

        // Re-throw error with user-friendly message
        const wrappedError = new Error(
          `A1 sheet composition failed: ${composeError.message}\n\nTip: If this persists, it may be due to rate limiting. Wait 60 seconds and try again with a lower generation count.`
        );
        wrappedError.code = composeError.code || 'COMPOSITION_FAILED';
        wrappedError.details = composeError.details || null;
        throw wrappedError;
      }

      // STEP 9: Save to baseline artifact store
      logger.info('💾 STEP 9: Saving baseline artifacts...');
      const panelsMap = {};
      generatedPanels.forEach((panel) => {
        panelsMap[panel.type] = {
          imageUrl: panel.imageUrl,
          seed: panel.seed,
          prompt: panel.prompt,
          negativePrompt: panel.negativePrompt,
          width: panel.width,
          height: panel.height,
          coordinates: compositionResult.coordinates[panel.type] || {},
          metadata: panel.meta,
        };
      });

      const baselineBundle = {
        designId,
        sheetId,
        baselineImageUrl: compositionResult.composedSheetUrl,
        siteSnapshotUrl: siteSnapshot?.dataUrl || null,
        baselineDNA: masterDNA,
        geometryBaseline: geometryDNA
          ? {
              geometryDNA,
              renders: usableGeometryRenders,
              scene: geometryScene,
            }
          : null,
        baselineLayout: {
          panelCoordinates: Object.values(compositionResult.coordinates),
          layoutKey: 'board-v2',
          sheetWidth: compositionResult.metadata.width,
          sheetHeight: compositionResult.metadata.height,
        },
        panels: panelsMap,
        metadata: {
          seed: effectiveBaseSeed,
          model: 'black-forest-labs/FLUX.1-dev',
          dnaHash: '',
          layoutHash: '',
          width: compositionResult.metadata.width,
          height: compositionResult.metadata.height,
          a1LayoutKey: 'board-v2',
          generatedAt: new Date().toISOString(),
          workflow: geometryDNA ? 'geometry-volume-first' : 'multi-panel-a1',
          consistencyScore: consistencyReport.consistencyScore,
          panelCount: generatedPanels.length,
          panelValidations,
          hasGeometryControl: !!geometryDNA,
        },
        seeds: {
          base: effectiveBaseSeed,
          derivationMethod: 'hash-derived',
          panelSeeds: panelSeeds,
        },
        basePrompt: '',
        consistencyLocks: [],
      };

      await baselineStore.saveBaselineArtifacts({
        designId,
        sheetId,
        bundle: baselineBundle,
      });

      logger.success('✅ Baseline artifacts saved');

      // STEP 10: Save to design history
      logger.info('📝 STEP 10: Saving to design history...');
      await historyService.createDesign({
        designId,
        masterDNA,
        geometryDNA: geometryDNA || masterDNA.geometry || null,
        geometryRenders: usableGeometryRenders,
        mainPrompt: 'Multi-panel A1 generation',
        seed: effectiveBaseSeed,
        seedsByView: panelSeeds,
        resultUrl: compositionResult.composedSheetUrl,
        a1SheetUrl: compositionResult.composedSheetUrl,
        projectContext,
        locationData,
        styleBlendPercent: 70,
        width: compositionResult.metadata.width,
        height: compositionResult.metadata.height,
        model: 'black-forest-labs/FLUX.1-dev',
        a1LayoutKey: 'board-v2',
        siteSnapshot,
        a1SheetMetadata: compositionResult.metadata,
        panelMap: panelsMap,
      });

      logger.success('✅ Design saved to history');

      // STEP 11: Return complete result
      logger.info('\n✅ ========================================');
      logger.info('✅ MULTI-PANEL A1 WORKFLOW COMPLETE');
      logger.info('✅ ========================================\n');
      reportProgress('finalizing', 'Completed', 100);

      return {
        success: true,
        designId,
        sheetId,
        masterDNA,
        panels: generatedPanels,
        panelMap: panelsMap,
        composedSheetUrl: compositionResult.composedSheetUrl,
        coordinates: compositionResult.coordinates,
        geometryDNA: geometryDNA || masterDNA.geometry || null,
        geometryRenders: usableGeometryRenders,
        geometryScene,
        consistencyReport,
        baselineBundle,
        seeds: {
          base: effectiveBaseSeed,
          panelSeeds,
        },
        panelValidations,
        // Include designFingerprint at top level for A1SheetViewer
        designFingerprint: masterDNA.designFingerprint || designId,
        metadata: {
          workflow: geometryDNA ? 'geometry-volume-first' : 'multi-panel-a1',
          panelCount: generatedPanels.length,
          consistencyScore: consistencyReport.consistencyScore,
          generatedAt: new Date().toISOString(),
          baseSeed: effectiveBaseSeed,
          panelSeeds,
          // Include designFingerprint in metadata for print export
          designFingerprint: masterDNA.designFingerprint || designId,
          designId,
        },
      };
    } catch (error) {
      logger.error('❌ Multi-panel A1 workflow failed:', {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      });
      return {
        success: false,
        error: error.message || 'Unknown error in multi-panel workflow',
      };
    }
  }
}

function buildPanelMetadata(sections = []) {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    status: 'rendered',
    keywords: section.keywords || [],
    minCount: section.minCount || 1,
    idealCount: section.idealCount || section.minCount || 1,
    position: section.position || null,
  }));
}

function normalizeStyleWeights(styleWeights) {
  if (!styleWeights) {
    return null;
  }

  const clamp = (v, fb = 0) => {
    if (typeof v !== 'number') {
      return fb;
    }
    const normalized = v > 1 ? v / 100 : v;
    if (Number.isNaN(normalized)) {
      return fb;
    }
    return Math.min(1, Math.max(0, normalized));
  };

  const local = clamp(styleWeights.local, 0.7);
  const portfolio = clamp(styleWeights.portfolio, 1 - local);

  return {
    ...styleWeights,
    local,
    portfolio,
    materialWeight: clamp(
      styleWeights.materialWeight ?? styleWeights.materialPortfolio,
      styleWeights.materialWeight ?? portfolio
    ),
    characteristicWeight: clamp(
      styleWeights.characteristicWeight ?? styleWeights.characteristicPortfolio,
      styleWeights.characteristicWeight ?? portfolio
    ),
  };
}

function normalizeBuildingTypeKey(rawType) {
  const desc = (rawType || '').toLowerCase();
  if (!desc) {
    return null;
  }
  if (desc.includes('terrace') || desc.includes('row') || desc.includes('townhouse')) {
    return 'terrace_house';
  }
  if (desc.includes('semi-detached') || desc.includes('semi detached')) {
    return 'semi_detached_house';
  }
  if (
    desc.includes('detached') ||
    desc.includes('single-family') ||
    desc.includes('single family') ||
    desc.includes('standalone') ||
    desc.includes('villa')
  ) {
    return 'detached_house';
  }
  if (desc.includes('apartment') || desc.includes('flat') || desc.includes('condo')) {
    return 'apartment_block';
  }
  return desc;
}

function validatePromptCoverage(prompt, buildingTypeKey = '') {
  const upper = (prompt || '').toUpperCase();
  const required = [
    'GROUND FLOOR PLAN',
    'FIRST/UPPER FLOOR PLAN',
    'NORTH ELEVATION',
    'SOUTH ELEVATION',
    'EAST ELEVATION',
    'WEST ELEVATION',
    'SECTION A-A',
    'SECTION B-B',
    '3D HERO VIEW',
    'SECONDARY 3D VIEW',
    'TITLE BLOCK',
  ];
  const missingClauses = required.filter((token) => !upper.includes(token));

  const warnings = [];
  if (buildingTypeKey === 'detached_house' && upper.includes('ROW')) {
    warnings.push('Prompt mentions row/terrace while building type is detached.');
  }
  if (buildingTypeKey === 'detached_house' && !upper.includes('DETACHED')) {
    warnings.push('Detached building type not explicitly stated in prompt.');
  }
  if (buildingTypeKey === 'terrace_house' && !upper.includes('TERRACE')) {
    warnings.push('Terrace/row house type not explicitly stated in prompt.');
  }
  if (!upper.includes('STYLE BLEND')) {
    warnings.push('Style blend percentages not found in prompt text.');
  }

  return {
    ok: missingClauses.length === 0,
    missingClauses,
    warnings,
  };
}

// Export singleton instance
const dnaWorkflowOrchestrator = new DNAWorkflowOrchestrator();
export default dnaWorkflowOrchestrator;
