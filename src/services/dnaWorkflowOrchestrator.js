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

import projectDNAPipeline from "./projectDNAPipeline.js";
import clipEmbeddingService from "./clipEmbeddingService.js";
import enhancedDesignDNAService from "./enhancedDesignDNAService.js";
import twoPassDNAGenerator from "./twoPassDNAGenerator.js";
import { generateGeometryDNA } from "./geometryReasoningService.js";
import { buildGeometryModel, createSceneSpec } from "./geometryBuilder.js";
import { renderGeometryPlaceholders } from "./geometryRenderService.js";
import designHistoryService from "./designHistoryService.js";
import dnaValidator from "./dnaValidator.js";
import normalizeDNA from "./dnaNormalization.js";
import {
  buildA1SheetPrompt,
  buildDisciplineA1Prompt,
  generateA1SheetMetadata,
} from "./a1/A1PromptService.js";
import { check3Dvs2DConsistency } from "./bimConsistencyChecker.js";
import { generateArchitecturalImage } from "./togetherAIService.js";
import multiModelImageService from "./multiModelImageService.js";
import imageUpscalingService from "./imageUpscalingService.js";
import reasoningOrchestrator from "./reasoningOrchestrator.js";
import a1SheetValidator from "./a1/A1ValidationService.js";
import { getSiteSnapshotWithMetadata } from "./siteMapSnapshotService.js";
import { orchestratePanelGeneration } from "./panelOrchestrator.js";
import {
  planA1Panels,
  generateA1PanelsSequential,
} from "./panelGenerationService.js";
import { derivePanelSeedsFromDNA } from "./seedDerivation.js";
import baselineArtifactStore from "./baselineArtifactStore.js";
import { compositeA1Sheet } from "./a1/A1SheetGenerator.js";
import architecturalSheetService from "./architecturalSheetService.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import {
  validateAndCorrectFootprint,
  polygonToLocalXY,
} from "../utils/geometry.js";
// Lazy import for geometry-first features (TypeScript dependencies)
// import { generateMassingModel } from '../rings/ring4-3d/massingGenerator.js';
import logger from "../utils/logger.js";
import { validateSiteSnapshot } from "../validators/siteSnapshotValidator.js";
import runtimeEnv from "../utils/runtimeEnv.js";
import {
  validatePanelConsistency,
  validateMultiPanelConsistency,
} from "./driftValidator.js";
import {
  validatePanelLayout,
  getRequiredPanels,
} from "./a1/a1LayoutConstants.js";
// Design Fingerprint System - Cross-panel consistency enforcement
import {
  extractFingerprintFromHero,
  storeFingerprint,
  getFingerprint,
  getFingerprintPromptConstraint,
  getHeroControlForPanel,
  HERO_REFERENCE_PANELS,
} from "./design/designFingerprintService.js";
import {
  runPreCompositionGate,
  getStrictFallbackParams,
  FINGERPRINT_THRESHOLDS,
} from "./validation/FingerprintValidationGate.js";

// API proxy server URL (runs on port 3001 in dev; browser defaults to same-origin)
const DEFAULT_API_BASE_URL = runtimeEnv.isBrowser
  ? ""
  : "http://localhost:3001";
const API_BASE_URL =
  process.env.REACT_APP_API_PROXY_URL || DEFAULT_API_BASE_URL;

const getFeatureFlags = () => {
  const session = runtimeEnv.getSession();
  if (!session) {
    return {};
  }
  try {
    return JSON.parse(session.getItem("featureFlags") || "{}");
  } catch {
    return {};
  }
};

const getOverlayEndpoint = () => {
  if (runtimeEnv.isBrowser) {
    return "/api/overlay-site-map";
  }
  return `${API_BASE_URL}/api/overlay-site-map`;
};

class DNAWorkflowOrchestrator {
  constructor() {
    this.pipeline = projectDNAPipeline;
    this.clipService = clipEmbeddingService;
    this.dnaGenerator = enhancedDesignDNAService;
    this.historyService = designHistoryService;
    this.validator = dnaValidator;

    logger.info("🎼 DNA Workflow Orchestrator initialized");
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
    logger.info("\n🚀 ========================================");
    logger.info("🚀 INITIALIZING NEW PROJECT");
    logger.info("🚀 ========================================\n");

    const { locationData, projectContext, portfolioFiles = [] } = projectData;

    try {
      // 1. Generate Project ID
      const projectId = this.pipeline.generateProjectId(
        locationData?.address || "Unknown Location",
        projectContext?.buildingProgram || "house",
      );

      logger.info(`\n✅ Project ID Generated: ${projectId}`);

      // 2. Generate Master Design DNA
      logger.info("\n🧬 Generating Master Design DNA...");
      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        null, // Portfolio analysis (to be added)
        locationData,
      );

      if (!dnaResult.success) {
        logger.warn("⚠️  DNA generation failed, using fallback");
      }

      const masterDNA = dnaResult.masterDNA;

      // 3. Validate DNA
      logger.info("\n🔍 Validating Design DNA...");
      const validation = this.validator.validateDesignDNA(masterDNA);

      if (!validation.isValid) {
        logger.warn("⚠️  DNA validation issues found");
        logger.info("   Errors:", validation.errors.length);
        logger.info("   Warnings:", validation.warnings.length);

        // Attempt auto-fix
        const fixed = this.validator.autoFixDesignDNA(masterDNA);
        if (fixed) {
          logger.success(" DNA auto-fixed successfully");
          Object.assign(masterDNA, fixed);
        }
      }

      const bimIssues = check3Dvs2DConsistency({ masterDNA });
      if (bimIssues.length) {
        logger.warn("BIM consistency issues detected", { bimIssues });
      }

      // 4. Extract portfolio DNA if provided
      let portfolioDNA = null;
      if (portfolioFiles.length > 0) {
        logger.info("\n🎨 Extracting portfolio style DNA...");
        portfolioDNA =
          await this.dnaGenerator.extractDNAFromPortfolio(portfolioFiles);
        if (portfolioDNA) {
          logger.success(" Portfolio DNA extracted");
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

      logger.info("\n✅ ========================================");
      logger.success(" PROJECT INITIALIZED SUCCESSFULLY");
      logger.success(" ========================================");
      logger.info(`   🔑 Project ID: ${projectId}`);
      logger.info(
        `   📏 Dimensions: ${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m`,
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
        message:
          "Project initialized successfully. Ready to generate floor plan.",
      };
    } catch (error) {
      logger.error("\n❌ Project initialization failed:", error);
      return {
        success: false,
        error: error.message,
        message: "Failed to initialize project",
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
  async establishDNABaseline(
    projectId,
    floorPlanImageUrl,
    generationData = {},
  ) {
    logger.info("\n📐 ========================================");
    logger.info("📐 ESTABLISHING DNA BASELINE");
    logger.info("📐 ========================================\n");

    try {
      // 1. Load project DNA
      const legacyContext = this.historyService.getDesignContext(projectId);
      if (!legacyContext) {
        throw new Error("Project not found. Initialize project first.");
      }

      // 2. Generate prompt embedding
      logger.info("\n🎯 Generating CLIP embedding for floor plan...");
      const embeddingResult =
        await this.clipService.generateEmbedding(floorPlanImageUrl);

      // 3. Generate text embedding for prompt
      const prompt = generationData.prompt || legacyContext.prompt;
      const textEmbeddingResult =
        await this.clipService.generateTextEmbedding(prompt);

      // 4. Save DNA package to new pipeline
      logger.info("\n💾 Saving DNA baseline to pipeline...");
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
        throw new Error("Failed to save DNA baseline");
      }

      logger.info("\n✅ ========================================");
      logger.success(" DNA BASELINE ESTABLISHED");
      logger.success(" ========================================");
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
        message:
          "DNA baseline established. Ready to generate additional views.",
      };
    } catch (error) {
      logger.error("\n❌ DNA baseline establishment failed:", error);
      return {
        success: false,
        error: error.message,
        message: "Failed to establish DNA baseline",
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
      logger.info("📖 Loading DNA baseline...");
      const dnaPackage = this.pipeline.loadProjectDNA(projectId);
      if (!dnaPackage) {
        throw new Error("DNA baseline not found. Generate floor plan first.");
      }

      // 2. Prepare generation parameters
      logger.info("⚙️  Preparing generation parameters...");
      const generationParams = await this.pipeline.generateWithDNA(
        projectId,
        viewType,
        options,
      );

      // 3. Build enhanced prompt with DNA constraints
      const enhancedPrompt = this.buildDNAConstrainedPrompt(
        dnaPackage,
        viewType,
        options.userPrompt || "",
      );

      logger.info("📝 Enhanced prompt prepared:");
      logger.info(`   Length: ${enhancedPrompt.length} chars`);
      logger.info(
        `   Consistency Rules: ${dnaPackage.designDNA?.consistency_rules?.length || 0}`,
      );

      // 4. Call AI service to generate image
      logger.info(
        `\n🤖 Calling AI service: ${aiService.constructor.name || "AI Service"}...`,
      );

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
        message:
          "Generation parameters ready. Call AI service with these parameters.",
        nextStep: "Call validateGeneratedView() after image generation",
      };
    } catch (error) {
      logger.error(`\n❌ View generation preparation failed:`, error);
      return {
        success: false,
        error: error.message,
        message: "Failed to prepare view generation",
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
      logger.info("🎯 Checking design harmony...");
      const harmonyResult = await this.pipeline.checkHarmony(
        projectId,
        generatedImageUrl,
        viewType,
      );

      // 2. Get workflow status
      const workflowStatus = this.pipeline.getWorkflowStatus(projectId);

      logger.info("\n✅ ========================================");
      logger.success(
        ` VALIDATION COMPLETE: ${harmonyResult.status.toUpperCase()}`,
      );
      logger.success(" ========================================");
      logger.info(
        `   📊 Consistency Score: ${(harmonyResult.score * 100).toFixed(1)}%`,
      );
      logger.info(`   🎯 Status: ${harmonyResult.status}`);
      logger.info(`   💬 ${harmonyResult.message}`);
      logger.info(
        `   📈 Project Completion: ${workflowStatus.workflow?.completionPercentage}%`,
      );

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
      logger.error("\n❌ View validation failed:", error);
      return {
        success: false,
        error: error.message,
        message: "Failed to validate view",
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
    logger.info("\n📊 ========================================");
    logger.info("📊 PROJECT SUMMARY");
    logger.info("📊 ========================================\n");

    const workflowStatus = this.pipeline.getWorkflowStatus(projectId);

    if (!workflowStatus.success) {
      return {
        success: false,
        message: "Project not found",
      };
    }

    const workflow = workflowStatus.workflow;

    logger.info(`   🔑 Project ID: ${projectId}`);
    logger.info(`   📍 Address: ${workflow.projectInfo.address}`);
    logger.info(`   🏠 Type: ${workflow.projectInfo.buildingType}`);
    logger.info(`   📏 Area: ${workflow.projectInfo.floorArea}m²`);
    logger.info(`   🏗️  Floors: ${workflow.projectInfo.floors}`);
    logger.info(`   📈 Completion: ${workflow.completionPercentage}%`);
    logger.info(
      `   🎯 Avg Consistency: ${(workflow.consistency.averageScore * 100).toFixed(1)}%`,
    );
    logger.info(
      `   ✅ Checks Performed: ${workflow.consistency.checksPerformed}`,
    );

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
    // Check if Hybrid A1 mode is enabled
    const hybridModeEnabled = isFeatureEnabled("hybridA1Mode");

    logger.info("🔍 A1 Workflow Decision Point:");
    logger.info("   hybridModeEnabled:", hybridModeEnabled);
    logger.info(
      "   isFeatureEnabled result:",
      isFeatureEnabled("hybridA1Mode"),
    );

    if (hybridModeEnabled) {
      logger.info("\n🎼 ========================================");
      logger.info("🎼 HYBRID A1 WORKFLOW (PANEL-BASED)");
      logger.info("🎼 ========================================\n");
      return this.runHybridA1Workflow(ctx);
    }

    logger.info("\n📐 ========================================");
    logger.info("📐 A1 SHEET WORKFLOW (ONE-SHOT)");
    logger.info("📐 ========================================\n");

    const {
      projectContext,
      locationData,
      portfolioAnalysis = null,
      portfolioBlendPercent = 70,
      seed,
      strictLock = false,
      consistencyLockOptions = {},
      sitePlanAttachment: ctxSitePlanAttachment = null,
      sitePlanMetadata: ctxSitePlanMetadata = null,
    } = ctx;

    try {
      // ========================================
      // STEP 1: Generate Master Design DNA
      // ========================================
      logger.info("🧬 STEP 1: Generating Master Design DNA...");

      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        portfolioAnalysis,
        locationData,
      );

      if (!dnaResult.success && !dnaResult.masterDNA?.isFallback) {
        logger.warn("⚠️  Master DNA generation had issues, using fallback DNA");
      }

      let masterDNA = dnaResult.masterDNA;

      // Normalize DNA to ensure consistent structure (materials as array, etc.)
      masterDNA = normalizeDNA(masterDNA, {
        floors: projectContext.floors || 2,
        area: projectContext.floorArea || projectContext.area || 200,
        style: projectContext.architecturalStyle || "Contemporary",
      });

      logger.success(" Master DNA generated and normalized");
      logger.info(
        `   📏 Dimensions: ${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m × ${masterDNA.dimensions?.height}m`,
      );
      logger.info(`   🏗️  Floors: ${masterDNA.dimensions?.floors}`);
      logger.info(`   🎨 Style: ${masterDNA.architecturalStyle}`);
      logger.info(
        `   📦 Materials: ${masterDNA.materials?.length} items (array)`,
      );

      // ========================================
      // STEP 2: Validate Master DNA
      // ========================================
      logger.info("\n🔍 STEP 2: Validating Master DNA...");

      const validation = this.validator.validateDesignDNA(masterDNA);

      if (!validation.isValid) {
        logger.warn("⚠️  DNA validation found issues:", validation.errors);
        logger.info("🔧 Attempting auto-fix...");
        const fixed = this.validator.autoFixDesignDNA(masterDNA);
        if (fixed) {
          logger.success(" DNA auto-fixed successfully");
          Object.assign(masterDNA, fixed);
        }
      } else {
        logger.success(" DNA validation passed");
      }

      // ========================================
      // STEP 2.1: Validate Building Footprint Against Site Boundary
      // ========================================
      logger.info(
        "\n📐 STEP 2.1: Validating building footprint against site boundaries...",
      );

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
            logger.info(
              "🔧 Updating DNA with boundary-corrected dimensions...",
            );

            // Calculate corrected dimensions from footprint
            const xs = correctedFootprint.map((p) => p.x);
            const ys = correctedFootprint.map((p) => p.y);
            const correctedLength = Math.max(...xs) - Math.min(...xs);
            const correctedWidth = Math.max(...ys) - Math.min(...ys);

            masterDNA.dimensions.length = parseFloat(
              correctedLength.toFixed(2),
            );
            masterDNA.dimensions.width = parseFloat(correctedWidth.toFixed(2));

            logger.info(
              `   Updated: ${masterDNA.dimensions.length}m × ${masterDNA.dimensions.width}m`,
            );
          }

          // Store boundary validation results in DNA for prompt generation
          masterDNA.boundaryValidation = {
            validated: true,
            compliant: boundaryValidation.validation.isValid,
            compliancePercentage:
              boundaryValidation.validation.compliancePercentage,
            wasCorrected: boundaryValidation.wasCorrected,
            correctedFootprint: correctedFootprint,
            buildableBoundary: boundaryValidation.buildableBoundary,
            setbacks: setbacks,
          };

          logger.success(
            ` Boundary validation complete: ${boundaryValidation.validation.compliancePercentage.toFixed(1)}% compliant`,
          );
        } catch (error) {
          logger.warn("⚠️  Boundary validation failed:", error.message);
          logger.info("   Continuing without boundary validation");
        }
      } else {
        logger.info(
          "   ⏭️  No site polygon available, skipping boundary validation",
        );
      }

      // ========================================
      // STEP 2.5: Build Blended Style (Local + Portfolio) - ENHANCED
      // ========================================
      logger.info(
        "\n🎨 STEP 2.5: Building blended style with advanced weighted algorithm...",
      );

      // Use sophisticated weighted blending algorithm from aiIntegrationService
      const portfolioWeight = (portfolioBlendPercent || 70) / 100; // Convert 0-100 to 0-1

      let blendedStyle;

      if (portfolioAnalysis && this.aiIntegrationService) {
        // Use advanced weighted blending with granular control
        logger.info(
          `   Using advanced blending: ${Math.round(portfolioWeight * 100)}% portfolio influence`,
        );

        blendedStyle = this.aiIntegrationService.blendStyles(
          locationData,
          portfolioAnalysis,
          portfolioWeight, // material weight
          portfolioWeight, // characteristic weight
        );

        // Enhance with Master DNA color specifications
        if (masterDNA.materials && Array.isArray(masterDNA.materials)) {
          blendedStyle.colorPalette = {
            facade:
              masterDNA.materials[0]?.hexColor ||
              blendedStyle.colorPalette?.facade ||
              "#B8604E",
            roof:
              masterDNA.materials[1]?.hexColor ||
              blendedStyle.colorPalette?.roof ||
              "#8B4513",
            trim: blendedStyle.colorPalette?.trim || "#FFFFFF",
            accent: blendedStyle.colorPalette?.accent || "#2C3E50",
          };
        }

        logger.info(`   ✅ Advanced blend complete: ${blendedStyle.styleName}`);
        logger.info(
          `   📊 Blend ratio - Local: ${Math.round(blendedStyle.blendRatio?.local * 100)}%, Portfolio: ${Math.round(blendedStyle.blendRatio?.portfolio * 100)}%`,
        );
      } else {
        // Fallback to simple blending if aiIntegrationService not available
        logger.info(
          "   ⚠️ Using fallback simple blending (aiIntegrationService not available)",
        );

        let materialsArray = ["Brick", "Glass", "Concrete"]; // Default fallback

        if (Array.isArray(portfolioAnalysis?.materials)) {
          materialsArray = portfolioAnalysis.materials;
        } else if (Array.isArray(masterDNA.materials)) {
          materialsArray = masterDNA.materials
            .slice(0, 3)
            .map((m) => (typeof m === "string" ? m : m.name || "Material"));
        }

        blendedStyle = {
          styleName:
            masterDNA.architecturalStyle ||
            portfolioAnalysis?.dominantStyle ||
            "Contemporary",
          materials: materialsArray,
          characteristics: Array.isArray(portfolioAnalysis?.characteristics)
            ? portfolioAnalysis.characteristics
            : ["Modern", "Functional", "Sustainable"],
          facadeArticulation:
            portfolioAnalysis?.facadeArticulation ||
            "Clean modern lines with balanced proportions",
          glazingRatio: portfolioAnalysis?.glazingRatio || "40%",
          colorPalette: {
            facade:
              masterDNA.materials?.[0]?.hexColor ||
              portfolioAnalysis?.colorPalette?.facade ||
              "#B8604E",
            roof:
              masterDNA.materials?.[1]?.hexColor ||
              portfolioAnalysis?.colorPalette?.roof ||
              "#8B4513",
            trim: portfolioAnalysis?.colorPalette?.trim || "#FFFFFF",
            accent: portfolioAnalysis?.colorPalette?.accent || "#2C3E50",
          },
        };
      }

      // Extract site shape from location data if available
      const siteShape =
        locationData?.siteAnalysis?.polygon ||
        locationData?.detectedShape ||
        null;

      logger.success(" Blended style computed");
      logger.info(`   🎨 Style: ${blendedStyle.styleName}`);
      logger.info(
        `   📦 Materials: ${blendedStyle.materials.slice(0, 2).join(", ")}`,
      );
      logger.info(
        `   🏠 Facade: ${blendedStyle.facadeArticulation.substring(0, 50)}...`,
      );

      // ========================================
      // STEP 2.75: Generate Design Reasoning (OpenAI → Together.ai fallback)
      // ========================================
      logger.info("\n🧠 STEP 2.75: Generating design reasoning...");

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

        designReasoning =
          await reasoningOrchestrator.generateDesignReasoning(reasoningContext);
        logger.success(" Design reasoning generated");
        logger.info(`   📊 Source: ${designReasoning.source || "unknown"}`);
        logger.info(`   🎨 Model: ${designReasoning.model || "unknown"}`);
      } catch (error) {
        logger.warn("⚠️  Design reasoning generation failed:", error.message);
        // Continue without reasoning - not critical for A1 sheet generation
      }

      // ========================================
      // STEP 4: Generate 3D Massing Preview
      // ========================================
      this.attachMassingPreview(masterDNA, projectContext, locationData);

      // ========================================
      // STEP 2.75: Extract Climate-Responsive Technical Details
      // ========================================
      logger.info(
        "\n🌡️ STEP 2.75: Extracting climate-responsive technical details...",
      );

      let selectedDetails = null;

      if (masterDNA.climateDesign) {
        // Extract 2-3 key technical details from climate parameters
        const climateParams = masterDNA.climateDesign;

        selectedDetails = [];

        // Thermal strategy
        if (climateParams.thermal) {
          selectedDetails.push({
            title: "Thermal Performance",
            specs: [
              `Strategy: ${climateParams.thermal.strategy || "Balanced"}`,
              `Wall insulation: ${climateParams.thermal.insulation?.walls || "R-20"}`,
              `Roof insulation: ${climateParams.thermal.insulation?.roof || "R-35"}`,
              `Glazing ratio: ${Math.round((climateParams.thermal.glazingRatio || 0.2) * 100)}%`,
            ],
          });
        }

        // Ventilation strategy
        if (climateParams.ventilation) {
          selectedDetails.push({
            title: "Ventilation Design",
            specs: [
              `Primary: ${climateParams.ventilation.primary || "Natural cross-ventilation"}`,
              `Type: ${climateParams.ventilation.type || "Mixed mode"}`,
              `Details: ${climateParams.ventilation.details || "Operable windows with mechanical backup"}`,
            ],
          });
        }

        // Solar design (if available)
        if (climateParams.solar && selectedDetails.length < 3) {
          selectedDetails.push({
            title: "Passive Solar",
            specs: [
              `Orientation: ${climateParams.solar.orientation || "South-facing primary glazing"}`,
              `Overhang: ${climateParams.solar.overhangDepth || "1.2m south facade"}`,
              `Shading: ${climateParams.solar.shadingType || "Fixed overhangs"}`,
            ],
          });
        }

        logger.info(
          `   ✅ ${selectedDetails.length} climate-responsive details extracted`,
        );
      } else {
        logger.info(
          "   ⚠️ No climate design parameters available, using defaults",
        );
      }

      // Get feature flags early (needed for multiple steps)
      const flags = getFeatureFlags();

      // ========================================
      // STEP 3: Enhanced Site Map Integration (IMG2IMG Context)
      // ========================================
      logger.info(
        "\n🗺️  STEP 3: Enhanced site map capture for A1 generation...",
      );

      let sitePlanAttachment = ctxSitePlanAttachment;
      let sitePlanMetadata = ctxSitePlanMetadata;
      let siteMapData = null;
      let useAsInitImage = false;

      // Force overlay-only mode to guarantee HTML injection instead of AI generation
      const siteMapMode = "overlay";

      if (
        !sitePlanAttachment &&
        typeof window !== "undefined" &&
        window.sessionStorage
      ) {
        try {
          const storedDataUrl = window.sessionStorage.getItem("a1SiteSnapshot");
          if (storedDataUrl && storedDataUrl.startsWith("data:")) {
            sitePlanAttachment = storedDataUrl;
            let storedMeta = null;
            const rawMeta = window.sessionStorage.getItem("a1SiteSnapshotMeta");
            if (rawMeta) {
              storedMeta = JSON.parse(rawMeta);
            }
            sitePlanMetadata = {
              ...storedMeta,
              source: "user-captured",
              capturedAt: storedMeta?.capturedAt || new Date().toISOString(),
              mode: siteMapMode,
              overlayOnly: true,
            };
            logger.success(" Loaded site snapshot from session storage");
          }
        } catch (storageError) {
          logger.warn(
            "⚠️ Failed to load site snapshot from session storage",
            storageError,
          );
        }
      }

      // Import enhanced site map integration
      const { captureSiteMapForGeneration, getOptimalQualitySettings } =
        await import("./enhancedSiteMapIntegration.js");
      logger.info(
        "   📍 Site map mode LOCKED: overlay-only (never AI-generated)",
      );
      logger.info(
        "   🛡️  Site plan will be injected as HTML overlay after generation",
      );

      if (sitePlanAttachment && sitePlanAttachment.startsWith("data:")) {
        siteMapData = {
          attachment: sitePlanAttachment,
          metadata: sitePlanMetadata || {
            source: "provided",
            capturedAt: new Date().toISOString(),
            mode: siteMapMode,
            overlayOnly: true,
          },
          mode: siteMapMode,
          instructions: {
            type: "overlay_only",
            prompt:
              "Leave top-left site panel blank; real map injected as HTML overlay",
          },
        };

        logger.success(" Using provided site plan attachment");
        logger.info("   🎯 Integration mode: overlay-only (HTML layer)");
      }

      // If no captured site plan, try to generate one from location data
      if (!sitePlanAttachment && locationData && locationData.coordinates) {
        try {
          // Use enhanced site map capture
          siteMapData = await captureSiteMapForGeneration({
            locationData,
            sitePolygon:
              locationData.sitePolygon ||
              locationData.siteAnalysis?.polygon ||
              null,
            useAsContext: false,
            mode: siteMapMode,
          });

          if (siteMapData && siteMapData.attachment) {
            sitePlanAttachment = siteMapData.attachment;
            sitePlanMetadata = siteMapData.metadata;
            if (sitePlanMetadata) {
              sitePlanMetadata.overlayOnly = true;
            }
            logger.success(" Generated site map from location data");
            logger.info("   📐 Mode: overlay-only (HTML layer)");
            logger.info(`   🗺️ Has polygon: ${sitePlanMetadata.hasPolygon}`);
          }
        } catch (error) {
          logger.warn(
            "⚠️  Enhanced site map generation failed:",
            error.message,
          );
          logger.info("   Continuing without site plan - will use placeholder");
        }
      }

      // Auto-add timestamp if missing to prevent validation errors
      const snapshotCapturedAt =
        sitePlanMetadata?.capturedAt || new Date().toISOString();

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
          context: "a1-generation",
          allowMissing: false,
        },
      );

      if (!snapshotValidation.valid) {
        const reason = snapshotValidation.errors
          .map((err) => err.message)
          .join(" ");
        throw new Error(
          `Site snapshot invalid: ${reason}. Please recapture the site map via \"Capture Map\" before generating.`,
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
      logger.info("\n✅ STEP 3.5: Pre-validating A1 template requirements...");

      const requiredSections =
        a1SheetValidator.getRequiredSections(projectContext);
      logger.info(
        `   Required sections: ${requiredSections.length} (${requiredSections.map((s) => s.name).join(", ")})`,
      );

      // ========================================
      // STEP 4: Build Site-Aware A1 Sheet Prompt (No Duplication)
      // ========================================
      logger.info("\n📝 STEP 4: Building site-aware A1 sheet prompt...");

      const useKontextPrompt = (
        flags.fluxImageModel || "black-forest-labs/FLUX.1-dev"
      ).includes("kontext");
      const sheetDiscipline = (
        projectContext.sheetType ||
        projectContext.discipline ||
        "ARCH"
      ).toUpperCase();
      const promptVersionOverride =
        projectContext?.promptVersion ||
        projectContext?.promptMode ||
        flags?.a1PromptVersion;

      if (sheetDiscipline !== "ARCH") {
        logger.info(`   🧱 Generating ${sheetDiscipline} discipline sheet`);
      }

      const promptBuilderOptions = {
        masterDNA,
        location: locationData,
        climate: locationData?.climate,
        portfolioBlendPercent,
        projectContext,
        projectMeta: {
          name: projectContext.projectName || "Architectural Design",
          style:
            masterDNA.architectural_style?.name || masterDNA.architecturalStyle,
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
      let basePromptResult;
      if (useKontextPrompt) {
        basePromptResult = buildDisciplineA1Prompt({
          discipline: sheetDiscipline,
          ...promptBuilderOptions,
        });
      } else {
        if (sheetDiscipline !== "ARCH") {
          logger.warn(
            `⚠️ Discipline ${sheetDiscipline} requires Kontext prompt builder. Falling back to ARCH layout.`,
          );
        }
        basePromptResult = buildA1SheetPrompt({
          ...promptBuilderOptions,
          sitePlanAttachment,
          sitePlanPolicy: sitePlanAttachment ? "overlay" : "placeholder",
          selectedDetails,
        });
      }

      let { prompt, negativePrompt, systemHints } = basePromptResult;

      if (siteMapData && siteMapData.attachment) {
        logger.info(
          "   🗺️ Overlay mode instructions applied - AI told to leave site panel blank for HTML injection",
        );
      }

      // CRITICAL: Never use site plan as initImage - it transforms the entire A1 sheet
      useAsInitImage = false;

      logger.success(" A1 sheet prompt generated");
      logger.info(`   📝 Prompt length: ${prompt.length} chars`);
      logger.info(
        `   🚫 Negative prompt length: ${negativePrompt.length} chars`,
      );
      logger.info(
        `   📐 Target aspect ratio: ${systemHints.targetAspectRatio}`,
      );

      // ========================================
      // STEP 4.5: Validate Template Completeness in Prompt
      // ========================================
      logger.info(
        "\n🔍 STEP 4.5: Validating template completeness in prompt...",
      );

      const templateValidation =
        a1SheetValidator.validateA1TemplateCompleteness({
          prompt,
          masterDNA,
          projectContext,
        });

      if (!templateValidation.valid) {
        logger.warn(
          "⚠️  Template validation failed - missing mandatory sections",
        );
        logger.warn(
          `   Missing: ${templateValidation.missingMandatory.join(", ")}`,
        );

        // Log warning but continue - the prompt should still work
        // In future, we could trigger regeneration with stricter prompts here
        logger.info(
          "   ⚠️  Continuing with generation despite missing sections...",
        );
        logger.info(
          "   💡 Consider regenerating with more explicit section requirements",
        );
      } else {
        logger.info(
          `   ✅ Template validation passed (${templateValidation.score}% completeness)`,
        );
        logger.info(
          `   Present sections: ${templateValidation.presentSections.length}/${requiredSections.length}`,
        );
      }

      // Store validation result for later use
      const promptValidationResult = templateValidation;

      // ========================================
      // STEP 4.6: Generate Procedural Geometry Masks
      // ========================================
      logger.info(
        "\n📐 STEP 4.6: Generating procedural geometry masks for floor plan consistency...",
      );

      let geometryMasks = null;
      try {
        const { ProceduralGeometryService } =
          await import("./geometry/ProceduralGeometryService.js");
        const geometryService = new ProceduralGeometryService();
        geometryMasks = geometryService.generateLayout(masterDNA);

        if (geometryMasks) {
          logger.success("✅ Procedural geometry masks generated");
          logger.info(`   Floors: ${Object.keys(geometryMasks.floors).length}`);
          logger.info(
            `   Has ground floor: ${!!geometryMasks.groundFloorDataUrl}`,
          );
        }
      } catch (geometryMaskError) {
        logger.warn(
          "⚠️ Procedural geometry mask generation failed:",
          geometryMaskError.message,
        );
      }

      // ========================================
      // STEP 5: Generate A1 panels and compose sheet
      // ========================================
      logger.info("\n🎨 STEP 5: Generating panels and composing A1 sheet...");

      const effectiveSeed =
        seed || projectContext.seed || Math.floor(Math.random() * 1e6);

      const panelJobs = await planA1Panels({
        masterDNA,
        siteBoundary: locationData?.sitePolygon || null,
        buildingType:
          projectContext?.buildingType ||
          projectContext?.buildingProgram ||
          masterDNA?.projectType,
        entranceOrientation: projectContext?.entranceOrientation || null,
        programSpaces:
          projectContext?.programSpaces || projectContext?.program || [],
        baseSeed: effectiveSeed,
        geometryMasks, // NEW: Pass geometry masks for floor plan consistency
      });

      // togetherClient wrapper - now passes init_image and strength for geometry control
      const togetherClient = {
        generateImage: (params) => {
          // Build geometry render from init_image if present
          let geometryRender = null;
          let geometryStrength = 0.6;

          if (params.init_image) {
            geometryRender = {
              url: params.init_image,
              type: "geometry_mask",
              model: "procedural_svg",
            };
            geometryStrength = params.strength || 0.65;
            logger.info(
              `   📐 [togetherClient] init_image attached for ${params.type} (strength: ${geometryStrength})`,
            );
          }

          return generateArchitecturalImage({
            viewType: params.type || params.viewType || "panel",
            designDNA: masterDNA,
            prompt: params.prompt,
            seed: params.seed,
            width: params.width,
            height: params.height,
            geometryRender, // Pass through for init_image
            geometryStrength, // Pass through for strength
          });
        },
      };

      const panelResults = await generateA1PanelsSequential(
        panelJobs,
        togetherClient,
      );

      const composeResponse = await fetch(`${API_BASE_URL}/api/a1/compose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          panels: panelResults.map((p) => ({
            id: p.id || p.type,
            type: p.type,
            url: p.imageUrl,
            label: p.type,
          })),
          siteOverlay: sitePlanAttachment || null,
        }),
      });

      if (!composeResponse.ok) {
        throw new Error(`Compose API responded with ${composeResponse.status}`);
      }

      const composeData = await composeResponse.json();
      const finalSheetUrl = composeData?.url;
      const panelCoordinates = composeData?.coordinates || {};

      if (!finalSheetUrl) {
        throw new Error("Compose API returned no URL");
      }

      const baseSheetUrl = finalSheetUrl;
      const overlayMetadata = null;
      const isLandscape = true;

      const imageResult = {
        url: finalSheetUrl,
        seed: effectiveSeed,
        imageUrls: [finalSheetUrl],
        metadata: {
          width: 9933,
          height: 7016,
          aspectRatio: (9933 / 7016).toFixed(3),
          model: "panel-compose",
          format: "A1 landscape (panel-composed)",
          isLandscape: true,
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
        const designId =
          projectContext?.designId || masterDNA?.projectID || "panel-a1-design";
        const sheetId = projectContext?.sheetId || "panel-a1-sheet";
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
              model: "panel-compose",
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
        logger.warn(
          "??  Failed to save panel baseline bundle:",
          baselineError.message,
        );
      }

      // ========================================
      // STEP 5.5: Site Plan Integration (AI-Generated, Not Composited)
      // ========================================
      // Site plan overlay metadata
      logger.info("\n🗺️ STEP 5.5: Site plan integration (HTML overlay)...");
      if (sitePlanAttachment && sitePlanAttachment.startsWith("data:")) {
        logger.info("   ✅ Captured site snapshot available for overlay");
        imageResult.metadata.sitePlanComposited = true;
        imageResult.metadata.sitePlanSource = "server-overlay";
      } else {
        logger.info("   ℹ️ No site snapshot attachment available for overlay");
        imageResult.metadata.sitePlanComposited = false;
        imageResult.metadata.sitePlanSource = "placeholder";
      }

      // ========================================
      // STEP 5.6: Store Upscale Metadata (On-Demand Upscaling)
      // ========================================
      logger.info("\n🔍 STEP 5.6: A1 sheet generated at base resolution...");
      logger.info(
        `   📐 Base resolution: ${imageResult.metadata.width}×${imageResult.metadata.height}px`,
      );

      logger.info(
        `   📐 Target 300 DPI: ${isLandscape ? "9933×7016px" : "7016×9933px"} (upscaled on download)`,
      );
      logger.info(
        `   💡 Upscaling to 300 DPI will be performed on-demand when user downloads`,
      );

      // Store upscale metadata for download function
      imageResult.metadata.upscaleTarget = {
        width: isLandscape ? 9933 : 7016,
        height: isLandscape ? 7016 : 9933,
        dpi: 300,
        orientation: isLandscape ? "landscape" : "portrait",
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
        logger.warn(
          "⚠️ No panel metadata generated - requiredSections may be missing or empty",
        );
      }

      if (panelMetadata.length > 0) {
        imageResult.metadata.panels = panelMetadata;
        metadata.panels = panelMetadata;
      }

      const modelUsed = flags.fluxImageModel || "black-forest-labs/FLUX.1-dev";

      logger.info("\n✅ ========================================");
      logger.success(" A1 SHEET WORKFLOW COMPLETE");
      logger.success(" ========================================");
      logger.info(`   🎨 Single comprehensive sheet generated`);
      logger.info(
        `   📏 Format: A1 ${isLandscape ? "landscape" : "portrait"} ISO 216 (${isLandscape ? "841×594mm" : "594×841mm"})`,
      );
      logger.info(
        `   🖼️  Resolution: ${imageResult.metadata.width}×${imageResult.metadata.height}px (Together.ai max)`,
      );
      logger.info(
        `   📐 Print reference: 300 DPI = ${isLandscape ? "9933×7016px" : "7016×9933px"}`,
      );
      logger.info(`   🤖 Model: ${modelUsed}`);
      logger.info(`   🎲 Seed: ${effectiveSeed}`);
      logger.info(
        `   🗺️  Site plan: ${sitePlanAttachment ? "embedded via prompt" : "placeholder generated"}`,
      );
      if (sitePlanMetadata) {
        logger.info(
          `   📍 Site plan source: ${sitePlanMetadata.source || "generated"}`,
        );
      }
      logger.info(`   ⏱️  Generation time: ~40-60 seconds`);
      logger.info(`   ✨ Contains: 10+ professional sections`);

      // ========================================
      // STEP 7: Validate A1 Sheet Quality
      // ========================================
      logger.info("\n🔍 STEP 7: Validating A1 sheet quality...");

      const a1SheetValidation = a1SheetValidator.validateA1Sheet(
        {
          url: imageResult.url,
          seed: imageResult.seed,
          prompt,
          negativePrompt,
          metadata: imageResult.metadata,
        },
        masterDNA,
        blendedStyle,
      );

      logger.info(
        `   ✅ Validation complete: ${a1SheetValidation.score}% quality score`,
      );
      logger.info(
        `   📊 Status: ${a1SheetValidation.valid ? "PASSED" : "NEEDS IMPROVEMENT"}`,
      );
      if (a1SheetValidation.issues.length > 0) {
        logger.info(`   ⚠️  Issues: ${a1SheetValidation.issues.length}`);
        a1SheetValidation.issues.slice(0, 3).forEach((issue) => {
          logger.info(`      - ${issue}`);
        });
      }
      if (a1SheetValidation.warnings.length > 0) {
        logger.info(`   ⚡ Warnings: ${a1SheetValidation.warnings.length}`);
      }

      // Generate validation report
      const validationReport =
        a1SheetValidator.generateReport(a1SheetValidation);

      // ========================================
      // STEP 7.5: DNA Consistency Check
      // ========================================
      logger.info("\n🔍 STEP 7.5: Checking consistency against DNA...");

      const consistencyChecker = (await import("./consistencyChecker.js"))
        .default;
      const dnaConsistencyReport = consistencyChecker.checkA1SheetConsistency(
        {
          url: imageResult.url,
          prompt,
          metadata: imageResult.metadata,
        },
        masterDNA,
        projectContext,
      );

      logger.info(
        `   DNA consistency score: ${dnaConsistencyReport.score.toFixed(1)}%`,
      );
      logger.info(
        `   Status: ${dnaConsistencyReport.consistent ? "CONSISTENT" : "INCONSISTENT"}`,
      );

      // Check if regeneration is needed
      const consistencyThreshold = 85; // 85% minimum for acceptable consistency
      if (
        !dnaConsistencyReport.consistent &&
        dnaConsistencyReport.score < consistencyThreshold
      ) {
        logger.warn(
          `   ⚠️  Consistency score ${dnaConsistencyReport.score.toFixed(1)}% below threshold ${consistencyThreshold}%`,
        );
        logger.warn(
          `   💡 Consider regenerating with stronger consistency prompts`,
        );
        logger.warn(
          `   Issues: ${dnaConsistencyReport.issues.slice(0, 3).join(", ")}`,
        );

        // TODO: Implement auto-regeneration logic here
        // For now, we log the warning and continue
      } else {
        logger.info(`   ✅ DNA consistency acceptable`);
      }

      // Return in format compatible with existing UI
      return {
        success: true,
        workflow: "a1-sheet-one-shot",
        masterDNA,
        blendedStyle, // Include blendedStyle for history saving
        validation,
        templateValidation: promptValidationResult, // 🆕 Add template validation result
        dnaConsistencyReport, // 🆕 Add DNA consistency report
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
              siteMapAttribution:
                sitePlanMetadata?.attribution || "Google Maps",
            },
            templateCompleteness: promptValidationResult.score, // 🆕 Add template completeness score
            dnaConsistency: dnaConsistencyReport.score, // 🆕 Add DNA consistency score
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
          type: "a1_sheet",
          seed: effectiveSeed,
          model: "FLUX.1-dev",
          timestamp: new Date().toISOString(),
          portfolioBlend: portfolioBlendPercent,
          qualityScore: a1SheetValidation.score, // 🆕 Include in metadata
          validated: a1SheetValidation.valid,
          templateCompleteness: promptValidationResult.score, // 🆕 Add template completeness
          dnaConsistency: dnaConsistencyReport.score, // 🆕 Add DNA consistency
        },
      };
    } catch (error) {
      // Extract meaningful error message
      let errorMessage = error?.message || String(error);

      // Provide helpful context for common errors
      if (
        error?.status === 503 ||
        errorMessage.includes("503") ||
        errorMessage.includes("proxy server")
      ) {
        errorMessage =
          "Proxy server unavailable. Please start the Express server by running: npm run server";
      } else if (errorMessage.includes("[object Object]")) {
        // Try to extract more details from the error object
        errorMessage =
          error?.body?.error ||
          error?.error ||
          error?.originalError?.message ||
          JSON.stringify(error) ||
          "Unknown error occurred";
      }

      logger.error("\n❌ A1 Sheet Workflow failed:", errorMessage);
      logger.error(
        "   Full error details:",
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
          2,
        ),
      );

      return {
        success: false,
        workflow: "a1-sheet-one-shot",
        error: errorMessage,
        message: "Failed to generate A1 sheet",
        status: error?.status,
      };
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
    logger.info("\n🎯 ========================================");
    logger.info("🎯 HYBRID A1 SHEET WORKFLOW STARTING");
    logger.info("🎯 Panel-based generation with compositing");
    logger.info("🎯 ========================================\n");

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
      logger.info("\n🧬 STEP 1: Generating Master Design DNA...");

      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        null, // Portfolio analysis
        locationData,
      );

      if (!dnaResult.success) {
        throw new Error("Failed to generate Master Design DNA");
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

      logger.success(" Master DNA generated and validated");
      this.attachMassingPreview(
        masterDNA,
        projectContext,
        locationData,
        "STEP 1.5 (Hybrid)",
      );

      // ========================================
      // STEP 2: Blend Portfolio Style (if available)
      // ========================================
      logger.info("\n🎨 STEP 2: Blending portfolio style...");

      let blendedStyle = null;
      if (portfolioAnalysis) {
        // Use existing blending logic from One-Shot workflow
        blendedStyle = {
          styleName:
            masterDNA.architecturalStyle ||
            portfolioAnalysis?.dominantStyle ||
            "Contemporary",
          materials: Array.isArray(masterDNA.materials)
            ? masterDNA.materials
                .slice(0, 3)
                .map((m) => (typeof m === "string" ? m : m.name || "Material"))
            : ["Brick", "Glass", "Concrete"],
          characteristics: Array.isArray(portfolioAnalysis?.characteristics)
            ? portfolioAnalysis.characteristics
            : ["Modern", "Functional", "Sustainable"],
        };
        logger.success(` Blended style: ${blendedStyle.styleName}`);
      }

      // ========================================
      // STEP 3: Generate Individual Panels
      // ========================================
      logger.info("\n🎨 STEP 3: Generating individual panels...");

      const baseSeed = seed || Math.floor(Math.random() * 1000000);

      // Generate all panels with new orchestrator
      const panelResults = await orchestratePanelGeneration({
        masterDNA,
        projectContext,
        locationData,
        blendedStyle,
        baseSeed,
        onProgress: (panelKey, status) => {
          logger.info(
            `   ${status === "generating" ? "⏳" : status === "completed" ? "✅" : "❌"} Panel ${panelKey}: ${status}`,
          );
        },
      });

      logger.success(
        ` Generated ${Object.keys(panelResults.panelMap).length} panels`,
      );

      if (panelResults.errors.length > 0) {
        logger.warn(
          `⚠️  ${panelResults.errors.length} panels failed, will use placeholders`,
        );
        panelResults.errors.forEach((err) => {
          logger.warn(`   - ${err.panel}: ${err.error}`);
        });
      }

      // Fallback to One-Shot if too many panels failed or rate limit hit
      if (
        !panelResults.success ||
        Object.keys(panelResults.panelMap).length < 3
      ) {
        logger.warn(
          "⚠️  Too many panel failures, falling back to One-Shot workflow",
        );
        // Temporarily disable hybrid mode to force One-Shot
        const { setFeatureFlag } = await import("../config/featureFlags.js");
        const originalHybridFlag = isFeatureEnabled("hybridA1Mode");
        setFeatureFlag("hybridA1Mode", false);
        try {
          const result = await this.runMultiPanelA1Workflow(ctx);
          return result;
        } finally {
          // Restore original flag
          setFeatureFlag("hybridA1Mode", originalHybridFlag);
        }
      }

      // Check for rate limit errors
      const rateLimitErrors = panelResults.errors.filter(
        (err) =>
          err.error &&
          (err.error.includes("429") ||
            err.error.includes("rate limit") ||
            err.error.includes("Rate limit")),
      );

      if (
        rateLimitErrors.length > 0 &&
        Object.keys(panelResults.panelMap).length < 5
      ) {
        logger.warn(
          "⚠️  Rate limit detected with insufficient panels, falling back to One-Shot workflow",
        );
        const { setFeatureFlag } = await import("../config/featureFlags.js");
        const originalHybridFlag = isFeatureEnabled("hybridA1Mode");
        setFeatureFlag("hybridA1Mode", false);
        try {
          const result = await this.runMultiPanelA1Workflow(ctx);
          return result;
        } finally {
          setFeatureFlag("hybridA1Mode", originalHybridFlag);
        }
      }

      // ========================================
      // STEP 4: Composite Panels into A1 Sheet
      // ========================================
      logger.info("\n🖼️  STEP 4: Compositing panels into A1 sheet...");

      // Convert panelMap to array format for compositor
      // Map panel keys to layout IDs expected by a1TemplateGenerator
      const { getLayoutIdForPanel } = await import("./panelOrchestrator.js");
      const panelsArray = Object.entries(panelResults.panelMap).map(
        ([key, data]) => ({
          id: getLayoutIdForPanel(key), // Map to layout ID (e.g., 'plan_ground' -> 'ground-floor')
          originalKey: key, // Keep original key for reference
          url: data.url,
          seed: data.seed,
          meta: data.meta,
        }),
      );

      // Get layout from a1TemplateGenerator
      const { generateA1Template } = await import("./a1TemplateGenerator.js");
      const templateResult = generateA1Template({
        resolution: "working", // Use working resolution (will be landscape for hybrid)
        format: "json", // Get layout object
      });
      const layout = templateResult.layout; // Contains sheet, dimensions, panels

      // Composite all panels into final A1 sheet
      const compositedSheet = await compositeA1Sheet({
        panels: panelsArray,
        layout: layout,
        masterDNA,
        locationData,
        projectContext,
        format: "canvas", // Use canvas for high-quality compositing
        includeAnnotations: true,
        includeTitleBlock: true,
      });

      logger.success(" A1 sheet composited successfully");

      // ========================================
      // STEP 5: Validate Final Sheet
      // ========================================
      logger.info("\n🔍 STEP 5: Validating composited A1 sheet...");

      compositedSheet.metadata.panels = panelsArray.map((panel) => ({
        id: panel.id || panel.originalKey || "panel",
        name: panel.originalKey || panel.id || "panel",
        view: panel.originalKey || panel.id || "panel",
        status: panel.url ? "rendered" : "missing",
      }));

      const a1SheetValidation = a1SheetValidator.validateA1Sheet(
        {
          url: compositedSheet.url,
          panels: panelsArray,
          metadata: compositedSheet.metadata,
        },
        masterDNA,
        blendedStyle,
      );

      logger.info(
        `   ✅ Validation complete: ${a1SheetValidation.score}% quality score`,
      );
      logger.info(
        `   📊 Status: ${a1SheetValidation.valid ? "PASSED" : "NEEDS IMPROVEMENT"}`,
      );

      // ========================================
      // STEP 5: Generate Metadata
      // ========================================
      const metadata = generateA1SheetMetadata({
        masterDNA,
        location: locationData,
        portfolioBlendPercent,
      });

      logger.info("\n✅ ========================================");
      logger.success(" HYBRID A1 SHEET WORKFLOW COMPLETE");
      logger.success(" ========================================");
      logger.info(
        `   🎨 ${Object.keys(panelResults.panelMap).length} panels generated and composited`,
      );
      logger.info(`   📏 Format: A1 landscape ISO 216 (841×594mm)`);
      logger.info(
        `   🖼️  Resolution: ${compositedSheet.width}×${compositedSheet.height}px`,
      );
      logger.info(`   📊 Quality score: ${a1SheetValidation.score}%`);
      logger.info(`   🎲 Base seed: ${baseSeed}`);
      logger.info(`   ⏱️  Total generation time: ~2-3 minutes`);

      // Return in format compatible with existing UI
      return {
        success: true,
        workflow: "hybrid-a1-sheet",
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
            workflow: "hybrid",
          },
          format: metadata,
          qualityScore: a1SheetValidation.score,
          validationReport: a1SheetValidator.generateReport(a1SheetValidation),
        },
        reasoning: dnaResult.reasoning || {},
        projectContext,
        locationData,
        generationMetadata: {
          type: "hybrid_a1_sheet",
          seed: baseSeed,
          model: "FLUX.1-dev",
          timestamp: new Date().toISOString(),
          portfolioBlend: portfolioBlendPercent,
          qualityScore: a1SheetValidation.score,
          validated: a1SheetValidation.valid,
          panelsGenerated: Object.keys(panelResults.panelMap).length,
          panelsFailed: panelResults.errors.length,
        },
      };
    } catch (error) {
      logger.error("\n❌ Hybrid A1 Sheet Workflow failed:", error);
      return {
        success: false,
        workflow: "hybrid-a1-sheet",
        error: error.message,
        message: "Failed to generate hybrid A1 sheet",
      };
    }
  }

  async attachMassingPreview(
    masterDNA,
    projectContext,
    locationData,
    stepLabel = "STEP 4",
  ) {
    logger.info(`\n🏗️ ${stepLabel}: Generating 3D massing model...`);

    try {
      const fallbackSiteContext = locationData?.siteAnalysis
        ? {
            metrics: {
              areaM2: locationData.siteAnalysis.surfaceArea || null,
              orientationDeg: locationData.siteAnalysis.orientationDeg || null,
            },
            facadeOrientation:
              locationData.siteAnalysis.principalFacadeDirection || null,
          }
        : null;

      // Lazy import geometry-first features (TypeScript dependencies)
      let massingModel = null;
      try {
        const { generateMassingModel } =
          await import("../rings/ring4-3d/massingGenerator.js");
        massingModel = await generateMassingModel({
          masterDNA,
          siteContext: locationData?.siteDNA || fallbackSiteContext,
          options: {
            coverageTarget:
              locationData?.zoning?.siteCoverage ||
              locationData?.zoning?.maxCoverage ||
              null,
          },
        });
      } catch (err) {
        logger.warn(
          "⚠️ Geometry-first features not available (TypeScript not compiled)",
        );
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
          typeof summary.siteCoverage === "number"
            ? `${(summary.siteCoverage * 100).toFixed(1)}%`
            : "n/a";

        logger.info(
          `   ✅ Massing summary → Footprint: ${summary.footprintArea || "n/a"}m², Height: ${summary.buildingHeight || "n/a"}m, Coverage: ${coverageText}`,
        );

        if (warnings?.length) {
          warnings.forEach((warning) => logger.warn(`   ⚠️ ${warning}`));
        }
      }

      return massingModel;
    } catch (error) {
      logger.warn("⚠️  Massing model generation failed:", error.message);
      return null;
    }
  }

  /**
   * UTILITY: Build initial project prompt
   */
  buildInitialPrompt(projectContext, locationData) {
    const {
      buildingProgram = "house",
      floorArea = 200,
      floors = 2,
      style = "modern",
      materials = "brick, glass, concrete",
    } = projectContext;

    return `Design a ${style} ${buildingProgram} with ${floors} floors and ${floorArea}m² total area.
Location: ${locationData?.address || "Not specified"}
Climate: ${locationData?.climate?.type || "Temperate"}
Materials: ${materials}
Architectural Style: ${style}`;
  }

  /**
   * UTILITY: Build DNA-constrained prompt for view generation
   */
  buildDNAConstrainedPrompt(dnaPackage, viewType, userPrompt = "") {
    const dna = dnaPackage.designDNA;

    // Base DNA constraints
    let prompt = `Generate architectural ${viewType.replace("_", " ")} view.

DESIGN DNA CONSTRAINTS (MUST FOLLOW):
- Exact Dimensions: ${dna.dimensions?.length}m × ${dna.dimensions?.width}m × ${dna.dimensions?.height || dna.dimensions?.totalHeight}m
- Exact Floors: ${dna.dimensions?.floor_count || dna.dimensions?.floors} floors (NO MORE, NO LESS)
- Primary Material: ${dna.materials?.exterior?.primary} (${dna.materials?.exterior?.color_hex})
- Roof: ${dna.roof?.type} roof, ${dna.roof?.pitch}, ${dna.roof?.material} (${dna.materials?.roof?.color_hex})
- Windows: ${dna.windows?.type} windows, ${dna.windows?.count_total} total
- Color Palette: Primary ${dna.color_palette?.primary}, Secondary ${dna.color_palette?.secondary}, Accent ${dna.color_palette?.accent}
- Style: ${dna.architectural_style?.name}

CONSISTENCY RULES:
${dna.consistency_rules?.slice(0, 5).join("\n") || "Maintain exact specifications"}

VIEW-SPECIFIC REQUIREMENTS:
${dna.view_specific_notes?.[viewType] || "Standard architectural representation"}

${userPrompt ? `\nADDITIONAL INSTRUCTIONS:\n${userPrompt}` : ""}

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
        action: "accept",
        message: "Excellent consistency. This view can be used as-is.",
        confidence: "high",
      };
    } else if (score >= 0.8) {
      return {
        action: "accept_with_review",
        message: "Good consistency. Minor review recommended.",
        confidence: "medium",
      };
    } else if (score >= 0.7) {
      return {
        action: "review_required",
        message:
          "Acceptable consistency but review required. Consider regenerating with stronger constraints.",
        confidence: "low",
      };
    } else {
      return {
        action: "regenerate",
        message:
          "Poor consistency detected. Regeneration strongly recommended.",
        confidence: "very_low",
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
      averagePercentage:
        (workflow.consistency.averageScore * 100).toFixed(1) + "%",
      scoreDistribution: {
        excellent: history.filter((h) => h.score >= 0.85).length,
        good: history.filter((h) => h.score >= 0.8 && h.score < 0.85).length,
        acceptable: history.filter((h) => h.score >= 0.7 && h.score < 0.8)
          .length,
        poor: history.filter((h) => h.score < 0.7).length,
      },
      viewsGenerated: Object.keys(
        workflow.pipeline.filter((p) => p.status === "completed"),
      ).length,
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
    const overrides = options?.overrides || {};

    const dnaGeneratorInstance = overrides.dnaGenerator || this.dnaGenerator;
    const dnaValidatorInstance = overrides.dnaValidator || this.validator;
    const deriveSeedsFn =
      overrides.seedUtils?.derivePanelSeedsFromDNA || derivePanelSeedsFromDNA;
    const planPanelsFn = overrides.panelService?.planA1Panels || planA1Panels;
    const generateImageFn =
      overrides.togetherAIService?.generateArchitecturalImage ||
      multiModelImageService.generateImage.bind(multiModelImageService);
    const validatePanelConsistencyFn =
      overrides.driftValidator?.validatePanelConsistency ||
      validatePanelConsistency;
    const validateMultiConsistencyFn =
      overrides.driftValidator?.validateMultiPanelConsistency ||
      validateMultiPanelConsistency;
    const baselineStore = overrides.baselineStore || baselineArtifactStore;
    const historyService = overrides.historyService || this.historyService;
    const panelTypesOverride = overrides.panelTypes;
    const fetchImpl =
      overrides.composeClient || (typeof fetch === "function" ? fetch : null);
    const progressCallback =
      typeof options?.onProgress === "function" ? options.onProgress : null;
    const reportProgress = (stage, message, percent) => {
      if (!progressCallback) return;
      const clamped =
        typeof percent === "number" && Number.isFinite(percent)
          ? Math.max(0, Math.min(100, Math.round(percent)))
          : undefined;
      try {
        progressCallback({
          stage,
          message,
          percent: clamped,
          percentage: clamped,
        });
      } catch {}
    };

    const panelDelayMs =
      typeof overrides.panelDelayMs === "number" &&
      Number.isFinite(overrides.panelDelayMs)
        ? Math.max(0, Math.round(overrides.panelDelayMs))
        : process.env.NODE_ENV === "test"
          ? 0
          : 20000;

    logger.info("\n🎨 ========================================");
    logger.info("🎨 MULTI-PANEL A1 WORKFLOW");
    logger.info("🎨 ========================================\n");

    const {
      locationData,
      projectContext,
      portfolioFiles = [],
      siteSnapshot = null,
      baseSeed = null,
    } = params;

    try {
      reportProgress("analysis", "Starting multi-panel generation...", 2);
      // STEP 1: Generate Master DNA via Qwen
      logger.info("🧬 STEP 1: Generating Master DNA...");
      reportProgress("dna", "Generating master design DNA...", 10);

      // Extract portfolio analysis if files provided
      let portfolioAnalysis = null;
      if (portfolioFiles && portfolioFiles.length > 0) {
        try {
          portfolioAnalysis =
            await dnaGeneratorInstance.extractDNAFromPortfolio(portfolioFiles);
        } catch (err) {
          logger.warn(
            "Portfolio analysis failed, continuing without it:",
            err.message,
          );
        }
      }

      // Use two-pass DNA generator if enabled (default: true for strict consistency)
      // Allow tests to override (avoid network calls, deterministic mocks).
      const useTwoPassDNA =
        typeof overrides.useTwoPassDNA === "boolean"
          ? overrides.useTwoPassDNA
          : isFeatureEnabled("twoPassDNA");
      const twoPassGenerator =
        overrides.twoPassDNAGenerator || twoPassDNAGenerator;
      let dnaResponse;

      if (useTwoPassDNA) {
        logger.info("   Using Two-Pass DNA Generator (strict mode)");
        try {
          dnaResponse = await twoPassGenerator.generateMasterDesignDNA(
            projectContext,
            portfolioAnalysis,
            locationData,
          );

          if (!dnaResponse.success) {
            throw new Error("Two-pass DNA generation failed");
          }
        } catch (twoPassError) {
          logger.error(
            "❌ Two-Pass DNA generation failed:",
            twoPassError.message,
          );
          throw new Error(
            `DNA generation failed: ${twoPassError.message}. Please check your inputs and try again.`,
          );
        }
      } else {
        logger.info("   Using Legacy DNA Generator");
        dnaResponse = await dnaGeneratorInstance.generateMasterDesignDNA(
          projectContext,
          portfolioAnalysis,
          locationData,
        );
      }

      // Extract masterDNA from response (handles both direct DNA and wrapped response)
      const masterDNA = dnaResponse.masterDNA || dnaResponse;

      // Log DNA quality
      if (masterDNA.isFallback) {
        logger.warn("⚠️  [DNA Generator] Using high-quality fallback DNA");
      } else {
        logger.success(
          "✅  [DNA Generator] Master Design DNA generated and normalized",
        );
        logger.info(
          `   📏 Dimensions: ${masterDNA.dimensions?.length || 0}m × ${masterDNA.dimensions?.width || 0}m × ${masterDNA.dimensions?.height || masterDNA.dimensions?.totalHeight || 0}m`,
        );
        logger.info(
          `   🏗️  Floors: ${masterDNA.dimensions?.floors || masterDNA.dimensions?.floorCount || 0}`,
        );
        logger.info(
          `   🎨 Materials: ${Array.isArray(masterDNA.materials) ? masterDNA.materials.length : "N/A"} items`,
        );
        logger.info(`   🏠 Roof: ${masterDNA.roof?.type || "N/A"}`);
      }

      // STEP 2: Validate DNA
      reportProgress("dna", "Validating design DNA...", 20);
      logger.info("✅ STEP 2: Validating DNA...");
      const validationResult =
        dnaValidatorInstance.validateDesignDNA(masterDNA);

      if (!validationResult.isValid) {
        logger.warn("⚠️ DNA validation issues found");
        logger.info("   Errors:", validationResult.errors?.length || 0);
        logger.info("   Warnings:", validationResult.warnings?.length || 0);

        // Attempt auto-fix if available
        if (dnaValidatorInstance.autoFixDesignDNA) {
          const fixed = dnaValidatorInstance.autoFixDesignDNA(masterDNA);
          if (fixed) {
            logger.success("✅ DNA auto-fixed successfully");
            Object.assign(masterDNA, fixed);
          }
        }
      }

      logger.success("✅ DNA validated");
      reportProgress("dna", "Design DNA validated", 25);

      // STEP 2.5: Geometry reasoning + baseline (feature-flagged)
      let geometryRenders = null;
      let geometryRenderMap = null;
      let geometryDNA = null;
      let geometryScene = null;

      if (isFeatureEnabled("geometryVolumeFirst")) {
        logger.info(
          "🏗️  STEP 2.5: Generating geometry DNA and placeholder renders...",
        );
        reportProgress("dna", "Generating geometry baselines...", 28);

        try {
          geometryDNA = generateGeometryDNA({
            masterDNA,
            sitePolygon: siteSnapshot?.sitePolygon || [],
            climate: locationData?.climate,
            style: masterDNA.architecturalStyle,
          });

          const geometryModel = buildGeometryModel(geometryDNA, masterDNA);
          geometryScene = createSceneSpec(geometryModel);
          const rendersArray =
            renderGeometryPlaceholders(geometryScene, {
              includePerspective: true,
              includeAxon: true,
            }) || [];

          geometryRenders = rendersArray;
          geometryRenderMap = rendersArray.reduce((acc, render) => {
            acc[render.type] = render;
            return acc;
          }, {});

          // Attach geometry DNA to masterDNA for downstream consumers
          masterDNA.geometry = geometryDNA;

          logger.success("✅ Geometry DNA and placeholder renders generated", {
            renders: rendersArray.length,
          });
          reportProgress("dna", "Geometry baselines generated", 30);
        } catch (renderError) {
          logger.warn(
            "⚠️  Geometry pass failed, continuing without geometry baselines:",
            renderError.message,
          );
        }
      }

      // STEP 2.6: Generate procedural geometry masks (ALWAYS active for floor plan consistency)
      let geometryMasks = null;

      try {
        const { ProceduralGeometryService } =
          await import("./geometry/ProceduralGeometryService.js");
        const geometryService = new ProceduralGeometryService();

        geometryMasks = geometryService.generateLayout(masterDNA);

        if (geometryMasks) {
          logger.success("✅ Procedural geometry masks generated", {
            floors: Object.keys(geometryMasks.floors).length,
            hasGroundFloor: !!geometryMasks.groundFloorDataUrl,
          });
          reportProgress("dna", "Geometry masks generated", 31);

          // Save debug artifacts if flag enabled
          if (
            isFeatureEnabled("saveGeometryMaskDebug") &&
            geometryMasks.floorMetadata
          ) {
            try {
              const debugDir = `debug_runs/${masterDNA?.designFingerprint || "unknown"}/geometry_masks`;
              const fs = await import(/* webpackIgnore: true */ "fs").catch(
                () => null,
              );
              const path = await import(/* webpackIgnore: true */ "path").catch(
                () => null,
              );

              if (fs && path && typeof fs.mkdirSync === "function") {
                // Create debug directory
                fs.mkdirSync(debugDir, { recursive: true });

                // Save SVG per floor
                Object.entries(geometryMasks.floors || {}).forEach(
                  ([floorIndex, floorData]) => {
                    if (floorData?.svgString) {
                      const svgPath = path.join(
                        debugDir,
                        `geometry_mask_floor_${floorIndex}.svg`,
                      );
                      fs.writeFileSync(svgPath, floorData.svgString, "utf-8");
                      logger.debug(`   📁 Saved SVG: ${svgPath}`);
                    }
                  },
                );

                // Save metadata JSON
                const metadataPath = path.join(
                  debugDir,
                  "geometry_mask_metadata.json",
                );
                const metadataPayload = {
                  designFingerprint: masterDNA?.designFingerprint,
                  generatedAt: new Date().toISOString(),
                  version:
                    geometryMasks.metadata?.version || "2.0-program-logical",
                  dimensions: geometryMasks.metadata,
                  floors: geometryMasks.floorMetadata,
                };
                fs.writeFileSync(
                  metadataPath,
                  JSON.stringify(metadataPayload, null, 2),
                  "utf-8",
                );
                logger.debug(`   📁 Saved metadata: ${metadataPath}`);
                logger.info(`   🗂️ Debug artifacts saved to: ${debugDir}`);
              } else {
                logger.debug(
                  "   ℹ️ Debug artifacts not saved (browser environment)",
                );
              }
            } catch (debugSaveError) {
              logger.warn(
                "   ⚠️ Failed to save debug artifacts:",
                debugSaveError.message,
              );
            }
          }
        }
      } catch (geometryMaskError) {
        logger.warn(
          "⚠️ Procedural geometry mask generation failed:",
          geometryMaskError.message,
        );
        // Continue without geometry masks - AI will generate from prompt alone
      }

      // STEP 3: Derive panel seeds from DNA hash
      logger.info("🔢 STEP 3: Deriving panel seeds from DNA...");
      reportProgress("layout", "Deriving panel seeds...", 32);
      // HERO-FIRST ENFORCEMENT: hero_3d MUST be first for style anchor
      // Elevations and sections use hero_3d as style reference via init_image
      const defaultSequence = [
        "hero_3d",
        "interior_3d",
        "axonometric",
        "site_diagram",
        "floor_plan_ground",
        "floor_plan_first",
        "floor_plan_level2",
        "elevation_north",
        "elevation_south",
        "elevation_east",
        "elevation_west",
        "section_AA",
        "section_BB",
        "schedules_notes",
        "material_palette",
        "climate_card",
      ];

      // If override provided, ensure hero_3d is first (style anchor requirement)
      let panelSequence = panelTypesOverride || defaultSequence;
      if (panelTypesOverride && !panelTypesOverride[0]?.includes("hero")) {
        const heroIndex = panelTypesOverride.findIndex((p) => p === "hero_3d");
        if (heroIndex > 0) {
          logger.warn(
            "⚠️ [HERO-FIRST] Reordering panels to ensure hero_3d is first (style anchor requirement)",
          );
          panelSequence = [
            "hero_3d",
            ...panelTypesOverride.filter((p) => p !== "hero_3d"),
          ];
        } else if (heroIndex === -1) {
          logger.warn(
            "⚠️ [HERO-FIRST] Adding hero_3d to panel sequence (required as style anchor)",
          );
          panelSequence = ["hero_3d", ...panelTypesOverride];
        }
      }

      const panelSeeds = deriveSeedsFn(masterDNA, panelSequence);
      const effectiveBaseSeed = baseSeed || panelSeeds.hero_3d || Date.now();

      logger.success(
        `✅ Derived ${Object.keys(panelSeeds).length} panel seeds`,
      );

      // STEP 4: Generate panel jobs
      logger.info("📋 STEP 4: Planning panel generation jobs...");
      reportProgress("layout", "Planning panel generation...", 35);
      const panelJobs = await planPanelsFn({
        masterDNA,
        siteBoundary: siteSnapshot?.sitePolygon || null,
        buildingType: projectContext?.buildingProgram || "residential",
        entranceOrientation: masterDNA?.entranceDirection || "N",
        programSpaces: projectContext?.programSpaces || [],
        baseSeed: effectiveBaseSeed,
        climate: locationData?.climate,
        locationData: locationData,
        geometryRenders: geometryRenderMap,
        geometryDNA,
        geometryMasks, // NEW: Procedural geometry masks for floor plan consistency
      });

      const floorCount =
        masterDNA?.dimensions?.floors || masterDNA?.dimensions?.floorCount || 2;
      const expectedPanels = floorCount === 1 ? 14 : floorCount === 2 ? 15 : 16;
      logger.success(
        `✅ Planned ${panelJobs.length} panel generation jobs (expected ${expectedPanels} for ${floorCount}-floor building)`,
      );
      reportProgress("layout", `Planned ${panelJobs.length} panels`, 38);

      // STEP 5: Execute sequential generation with Together.ai
      logger.info("🎨 STEP 5: Generating panels sequentially...");
      reportProgress(
        "rendering",
        `Generating ${panelJobs.length} panels...`,
        40,
      );
      const delaySeconds = panelDelayMs / 1000;
      logger.info(
        `   This will take ~${Math.round(panelJobs.length * delaySeconds)} seconds (${delaySeconds}s per panel for rate limit safety)`,
      );

      const generatedPanels = [];

      // Design Fingerprint context - populated after hero_3d generates
      let designFingerprint = null;
      let heroReference = null;
      const runId = `run_${Date.now()}`;

      // NEW: Style reference for material consistency (captured from hero_3d)
      // Passed to elevations/sections via IP-Adapter to lock brick colors, window frames, etc.
      let heroStyleReferenceUrl = null;

      // NEW: Floor plan mask for interior_3d window alignment
      // Ensures interior windows match the floor plan openings exactly
      let floorPlanGroundUrl = null;

      for (let i = 0; i < panelJobs.length; i++) {
        const job = panelJobs[i];
        logger.info(
          `   Generating panel ${i + 1}/${panelJobs.length}: ${job.type}...`,
        );

        const panelStartPercent = 40 + (i / Math.max(1, panelJobs.length)) * 40;
        const panelDonePercent =
          40 + ((i + 1) / Math.max(1, panelJobs.length)) * 40;
        reportProgress(
          "rendering",
          `Generating ${job.type} (${i + 1}/${panelJobs.length})...`,
          panelStartPercent,
        );

        try {
          // Check if we have a geometry render for this panel type
          let geometryRender = null;
          let effectiveGeometryStrength = job.meta?.geometryStrength || 0.6;

          // PRIORITY 1: Use job.meta.controlImage from geometry masks (highest priority for floor plans)
          // This comes from ProceduralGeometryService via panelGenerationService
          if (job.meta?.controlImage && job.meta?.useGeometryMask) {
            geometryRender = {
              url: job.meta.controlImage,
              type: "geometry_mask",
              model: "procedural_svg",
            };
            effectiveGeometryStrength = job.meta.controlStrength || 0.65;
            logger.info(
              `   🎯 [Geometry Mode] Using procedural geometry mask for ${job.type} (strength: ${effectiveGeometryStrength})`,
            );
          }
          // PRIORITY 2: Use geometryRenderMap for elevations and 3D views
          else if (geometryRenderMap && job.type.includes("elevation")) {
            const direction = job.type.includes("north")
              ? "north"
              : job.type.includes("south")
                ? "south"
                : job.type.includes("east")
                  ? "east"
                  : "west";
            geometryRender = geometryRenderMap[`orthographic_${direction}`];
          } else if (geometryRenderMap && job.type === "hero_3d") {
            geometryRender = geometryRenderMap.perspective_hero;
          } else if (
            geometryRenderMap &&
            (job.type === "axonometric" || job.type === "axonometric_3d")
          ) {
            geometryRender = geometryRenderMap.axonometric;
          }

          // Log whether init_image will be used
          if (geometryRender?.url) {
            logger.info(
              `   📐 init_image attached for ${job.type} (strength: ${effectiveGeometryStrength})`,
            );
          }

          // NEW: Determine style reference for elevations/sections (from hero_3d)
          // IP-Adapter ensures material consistency: brick colors, window frames, roof tiles
          const isElevationOrSection =
            job.type.startsWith("elevation_") ||
            job.type.startsWith("section_");
          const effectiveStyleReference =
            isElevationOrSection && heroStyleReferenceUrl
              ? heroStyleReferenceUrl
              : null;

          if (effectiveStyleReference) {
            logger.info(
              `   🎨 Style reference will be applied via IP-Adapter (weight: 0.65)`,
            );
          }

          // NEW: Determine floor plan mask for interior_3d (from floor_plan_ground)
          // Ensures windows in interior match floor plan openings exactly
          const effectiveFloorPlanMask =
            job.type === "interior_3d" && floorPlanGroundUrl
              ? floorPlanGroundUrl
              : null;

          if (effectiveFloorPlanMask) {
            logger.info(
              `   🏠 Floor plan mask will be applied for window alignment (strength: 0.55)`,
            );
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
            geometryStrength: effectiveGeometryStrength, // Use computed strength
            // NEW: Style reference for material consistency (elevations/sections)
            styleReferenceUrl: effectiveStyleReference,
            // NEW: Floor plan mask for interior_3d window alignment
            floorPlanMaskUrl: effectiveFloorPlanMask,
          });

          const panelResult = {
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
              model: result.model || "flux",
            },
          };

          generatedPanels.push(panelResult);

          // FINGERPRINT EXTRACTION: After hero_3d generates, extract fingerprint
          // This fingerprint is used as the reference for all subsequent panels
          if (
            job.type === "hero_3d" &&
            panelResult.imageUrl &&
            isFeatureEnabled("extractDesignFingerprint")
          ) {
            logger.info("   🔒 Extracting design fingerprint from hero_3d...");
            try {
              designFingerprint = await extractFingerprintFromHero(
                panelResult.imageUrl,
                masterDNA,
                { runId },
              );
              if (designFingerprint) {
                heroReference = {
                  imageUrl: panelResult.imageUrl,
                  seed: panelResult.seed,
                  timestamp: Date.now(),
                };
                storeFingerprint(runId, designFingerprint);
                logger.success(
                  "   ✅ Design fingerprint locked for consistency enforcement",
                );
                logger.info(`      Massing: ${designFingerprint.massingType}`);
                logger.info(`      Roof: ${designFingerprint.roofProfile}`);
                logger.info(
                  `      Style: ${designFingerprint.styleDescriptor}`,
                );
              }
            } catch (fpError) {
              logger.warn(
                "   ⚠️ Could not extract fingerprint:",
                fpError.message,
              );
            }
          }

          // NEW: Capture hero_3d URL for style reference (IP-Adapter for elevations/sections)
          // This ensures brick colors, window frames, roof materials match the hero render
          if (job.type === "hero_3d" && panelResult.imageUrl) {
            heroStyleReferenceUrl = panelResult.imageUrl;
            logger.info(
              "   🎨 [STYLE LOCK] Hero style reference captured for elevation/section consistency",
            );
            logger.info(
              `      URL: ${heroStyleReferenceUrl.substring(0, 60)}...`,
            );
          }

          // NEW: Capture floor_plan_ground URL for interior_3d window alignment
          // Ensures interior windows are positioned exactly where the floor plan shows openings
          if (job.type === "floor_plan_ground" && panelResult.imageUrl) {
            floorPlanGroundUrl = panelResult.imageUrl;
            logger.info(
              "   🏠 [FLOOR PLAN LOCK] Ground floor plan captured for interior_3d window alignment",
            );
          }

          logger.success(
            `   ✅ Generated ${job.type}${result.hadFallback ? " (SDXL fallback)" : ""}`,
          );
          reportProgress(
            "rendering",
            `Generated ${job.type} (${i + 1}/${panelJobs.length})`,
            panelDonePercent,
          );

          // Rate limiting delay (default 20s between panels to avoid 429s)
          if (i < panelJobs.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, panelDelayMs));
          }
        } catch (error) {
          logger.error(`   ❌ Failed to generate ${job.type}:`, error.message);
          reportProgress(
            "rendering",
            `Failed ${job.type} (${i + 1}/${panelJobs.length})`,
            panelDonePercent,
          );

          // HERO-FIRST FAIL-FAST: If hero_3d fails, abort entire generation
          // hero_3d is the style anchor - without it, elevations/sections cannot have consistent materials
          if (job.type === "hero_3d") {
            logger.error(
              "❌ [HERO-FIRST FAIL-FAST] hero_3d generation failed - aborting workflow",
            );
            logger.error(
              "   hero_3d is required as style anchor for elevation/section material consistency",
            );
            return {
              success: false,
              error: `Hero generation failed: ${error.message}. hero_3d is required as the style anchor for all subsequent panels.`,
              failedPanel: "hero_3d",
              generatedPanels: [],
              message:
                "Cannot proceed without hero_3d - it provides the style reference for elevations and sections.",
            };
          }

          // Continue with other panels (non-hero failures are tolerable)
        }
      }

      logger.success(
        `✅ Generated ${generatedPanels.length}/${panelJobs.length} panels`,
      );
      reportProgress(
        "rendering",
        `Generated ${generatedPanels.length}/${panelJobs.length} panels`,
        80,
      );

      // Ensure required panels (from planned jobs) exist; retry missing once
      const requiredPanels = Array.from(new Set(panelJobs.map((j) => j.type)));

      const existingTypes = new Set(generatedPanels.map((p) => p.type));
      const missingTypes = requiredPanels.filter(
        (type) => !existingTypes.has(type),
      );

      if (missingTypes.length > 0) {
        logger.warn(
          `Missing panels detected, attempting single retry for: ${missingTypes.join(", ")}`,
        );
        reportProgress(
          "rendering",
          `Retrying missing panels: ${missingTypes.join(", ")}`,
          82,
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
            logger.error(
              `Retry failed for missing panel ${type}:`,
              retryErr.message,
            );
          }
        }
      }

      const stillMissing = requiredPanels.filter(
        (type) => !existingTypes.has(type),
      );
      if (stillMissing.length > 0) {
        return {
          success: false,
          error: `Missing required panels after retry: ${stillMissing.join(", ")}`,
          missingPanels: stillMissing,
        };
      }

      // STEP 6: Store panels in baseline artifact store
      logger.info("💾 STEP 6: Storing panels in baseline artifact store...");
      const designId = `design_${Date.now()}`;
      const sheetId = `sheet_${Date.now()}`;

      // STEP 7: Detect drift with drift validator
      logger.info("🔍 STEP 7: Validating panel consistency...");
      reportProgress("finalizing", "Validating panel consistency...", 84);
      const panelValidations = await Promise.all(
        generatedPanels.map(async (panel) => {
          return validatePanelConsistencyFn({
            panelType: panel.type,
            baselineUrl: null, // No baseline for initial generation
            candidateUrl: panel.imageUrl,
            baselineDNA: masterDNA,
            candidateDNA: masterDNA,
          });
        }),
      );

      const consistencyReport = validateMultiConsistencyFn(panelValidations);
      logger.info(
        `   Consistency score: ${(consistencyReport.consistencyScore * 100).toFixed(1)}%`,
      );

      // STEP 7.5: Validate panel layout before composition
      logger.info("🔍 STEP 7.5: Validating panel layout before composition...");
      reportProgress("layout", "Validating sheet layout...", 86);
      const layoutValidation = validatePanelLayout(generatedPanels, {
        floorCount,
      });

      if (!layoutValidation.valid) {
        logger.error(
          `❌ Panel layout validation failed: ${layoutValidation.errors.join(", ")}`,
        );
        logger.error(
          `   Missing panels: ${layoutValidation.missingPanels.join(", ")}`,
        );
        return {
          success: false,
          error: `Cannot compose A1 sheet - missing required panels: ${layoutValidation.missingPanels.join(", ")}`,
          missingPanels: layoutValidation.missingPanels,
          generatedPanels: generatedPanels.map((p) => p.type),
          message:
            "Please retry generation or regenerate missing panels individually.",
        };
      }

      logger.success(
        `✅ Panel layout validated: ${layoutValidation.panelCount}/${getRequiredPanels(floorCount).length} panels ready for composition`,
      );

      // STEP 7.6: Fingerprint validation gate with STRICT FALLBACK RETRY
      // Validates all panels against hero_3d fingerprint before composition
      // If validation fails, regenerates failed panels with strict control parameters
      if (designFingerprint && isFeatureEnabled("strictFingerprintGate")) {
        logger.info("🔒 STEP 7.6: Running fingerprint validation gate...");
        reportProgress("finalizing", "Validating design consistency...", 87);

        const maxGateRetries = FINGERPRINT_THRESHOLDS.MAX_PANEL_RETRIES || 2;
        let retryCount = 0;
        let currentPanels = [...generatedPanels];

        while (retryCount <= maxGateRetries) {
          const gateResult = await runPreCompositionGate(
            currentPanels,
            designFingerprint,
            { blockOnMismatch: true, retryCount },
          );

          if (gateResult.canCompose) {
            logger.success(
              `✅ Fingerprint gate PASSED: ${gateResult.passedPanels.length}/${currentPanels.length} panels match design`,
            );
            logger.info(
              `   Overall consistency score: ${(gateResult.overallMatchScore * 100).toFixed(1)}%`,
            );
            // Update generatedPanels with validated panels
            generatedPanels.length = 0;
            generatedPanels.push(...currentPanels);
            break;
          }

          // Handle different gate actions
          if (gateResult.action === "abort") {
            logger.error(
              `❌ Fingerprint gate BLOCKED composition: ${gateResult.failedPanels.length} panels deviated from design`,
            );
            return {
              success: false,
              error: `Design consistency check failed: ${gateResult.failedPanels.length} panels do not match hero design`,
              failedPanels: gateResult.failedPanels.map((f) => f.panelType),
              overallMatchScore: gateResult.overallMatchScore,
              message: gateResult.summary,
            };
          }

          // STRICT FALLBACK RETRY: Regenerate failed panels with strict control parameters
          if (
            gateResult.action === "retry_failed" ||
            gateResult.action === "strict_fallback"
          ) {
            retryCount++;
            const isStrictFallback =
              gateResult.action === "strict_fallback" ||
              retryCount >= maxGateRetries;

            logger.warn(
              `⚠️ [FINGERPRINT GATE] ${gateResult.failedPanels.length} panels failed validation`,
            );
            logger.info(
              `   Retry ${retryCount}/${maxGateRetries} with ${isStrictFallback ? "STRICT FALLBACK" : "increased control"} parameters`,
            );
            reportProgress(
              "finalizing",
              `Regenerating ${gateResult.failedPanels.length} inconsistent panels...`,
              88,
            );

            // Regenerate each failed panel with strict params
            for (const failedPanel of gateResult.failedPanels) {
              const panelType = failedPanel.panelType;
              const originalPanel = currentPanels.find(
                (p) => p.type === panelType,
              );

              if (!originalPanel) {
                logger.warn(
                  `   ⚠️ Could not find original panel for ${panelType}, skipping retry`,
                );
                continue;
              }

              // Get strict fallback parameters
              const strictParams = getStrictFallbackParams(
                panelType,
                originalPanel.seed,
              );

              logger.info(
                `   🔄 Regenerating ${panelType} with strict params:`,
              );
              logger.info(
                `      control_strength: ${strictParams.control_strength}`,
              );
              logger.info(
                `      image_strength: ${strictParams.image_strength}`,
              );
              logger.info(
                `      guidance_scale: ${strictParams.guidance_scale}`,
              );
              logger.info(
                `      seed: ${strictParams.seed} (${isStrictFallback ? "incremented" : "same"})`,
              );

              try {
                // Find original job for this panel
                const originalJob = panelJobs.find((j) => j.type === panelType);

                if (!originalJob) {
                  logger.warn(
                    `   ⚠️ Could not find job for ${panelType}, skipping retry`,
                  );
                  continue;
                }

                // Compute floor plan mask URL for interior_3d panels
                const retryFloorPlanMaskUrl =
                  panelType === "interior_3d" && floorPlanGroundUrl
                    ? floorPlanGroundUrl
                    : null;

                // Regenerate with strict parameters
                const result = await generateImageFn({
                  viewType: panelType,
                  prompt: originalJob.prompt,
                  negativePrompt: originalJob.negativePrompt,
                  width: originalJob.width,
                  height: originalJob.height,
                  seed: isStrictFallback
                    ? strictParams.seed
                    : originalPanel.seed, // Keep seed unless strict fallback
                  designDNA: masterDNA,
                  geometryDNA,
                  geometryStrength: strictParams.control_strength,
                  styleReferenceUrl: heroStyleReferenceUrl,
                  floorPlanMaskUrl: retryFloorPlanMaskUrl,
                });

                // Update panel in currentPanels
                const panelIndex = currentPanels.findIndex(
                  (p) => p.type === panelType,
                );
                if (panelIndex !== -1) {
                  currentPanels[panelIndex] = {
                    ...currentPanels[panelIndex],
                    imageUrl: result.url || result.imageUrls?.[0],
                    seed: result.seedUsed || strictParams.seed,
                    meta: {
                      ...currentPanels[panelIndex].meta,
                      strictFallbackRetry: true,
                      retryAttempt: retryCount,
                      strictParams,
                    },
                  };
                  logger.success(
                    `   ✅ Regenerated ${panelType} with strict params`,
                  );
                }

                // Rate limit delay between retries
                await new Promise((resolve) =>
                  setTimeout(resolve, panelDelayMs),
                );
              } catch (retryError) {
                logger.error(
                  `   ❌ Failed to regenerate ${panelType}: ${retryError.message}`,
                );
                // Continue with other failed panels
              }
            }
          }

          // If we've exhausted retries, abort
          if (retryCount > maxGateRetries) {
            logger.error(
              `❌ Fingerprint gate FAILED after ${maxGateRetries} retries`,
            );
            return {
              success: false,
              error: `Design consistency check failed after ${maxGateRetries} retry attempts`,
              failedPanels: gateResult.failedPanels.map((f) => f.panelType),
              overallMatchScore: gateResult.overallMatchScore,
              message:
                "Panels could not be made consistent with hero design after multiple retries.",
            };
          }
        }
      }

      // STEP 8: Compose sheet via /api/a1/compose
      logger.info("🖼️  STEP 8: Composing A1 sheet...");
      reportProgress("finalizing", "Composing A1 sheet...", 90);
      if (!fetchImpl) {
        throw new Error(
          "Fetch API is not available and no composeClient override was provided",
        );
      }
      const composePayload = {
        designId,
        panels: generatedPanels.map((p) => ({
          type: p.type,
          imageUrl: p.imageUrl,
          label: p.type.toUpperCase().replace(/_/g, " "),
        })),
        siteOverlay: siteSnapshot?.dataUrl
          ? { imageUrl: siteSnapshot.dataUrl }
          : null,
        layoutConfig: "uk-riba-standard",
      };

      const composeResponse = await fetchImpl(
        `${API_BASE_URL}/api/a1/compose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(composePayload),
        },
      );

      if (!composeResponse.ok) {
        throw new Error(`Composition failed: ${composeResponse.status}`);
      }

      const compositionResult = await composeResponse.json();
      logger.success("✅ A1 sheet composed successfully");
      reportProgress("finalizing", "A1 sheet composed", 92);

      // STEP 9: Save to baseline artifact store
      logger.info("💾 STEP 9: Saving baseline artifacts...");
      reportProgress("finalizing", "Saving baseline artifacts...", 93);
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
              renders: geometryRenders,
              scene: geometryScene,
            }
          : null,
        baselineLayout: {
          panelCoordinates: Object.values(compositionResult.coordinates),
          layoutKey: "uk-riba-standard",
          sheetWidth: compositionResult.metadata.width,
          sheetHeight: compositionResult.metadata.height,
        },
        panels: panelsMap,
        metadata: {
          seed: effectiveBaseSeed,
          model: "black-forest-labs/FLUX.1-dev",
          dnaHash: "",
          layoutHash: "",
          width: compositionResult.metadata.width,
          height: compositionResult.metadata.height,
          a1LayoutKey: "uk-riba-standard",
          generatedAt: new Date().toISOString(),
          workflow: geometryDNA ? "geometry-volume-first" : "multi-panel-a1",
          consistencyScore: consistencyReport.consistencyScore,
          panelCount: generatedPanels.length,
          panelValidations,
          hasGeometryControl: !!geometryDNA,
        },
        seeds: {
          base: effectiveBaseSeed,
          derivationMethod: "hash-derived",
          panelSeeds: panelSeeds,
        },
        basePrompt: "",
        consistencyLocks: [],
      };

      await baselineStore.saveBaselineArtifacts({
        designId,
        sheetId,
        bundle: baselineBundle,
      });

      logger.success("✅ Baseline artifacts saved");

      // STEP 10: Save to design history
      logger.info("📝 STEP 10: Saving to design history...");
      reportProgress("finalizing", "Saving design history...", 94);
      await historyService.createDesign({
        designId,
        masterDNA,
        geometryDNA: geometryDNA || masterDNA.geometry || null,
        geometryRenders: geometryRenders,
        mainPrompt: "Multi-panel A1 generation",
        seed: effectiveBaseSeed,
        seedsByView: panelSeeds,
        resultUrl: compositionResult.composedSheetUrl,
        a1SheetUrl: compositionResult.composedSheetUrl,
        projectContext,
        locationData,
        styleBlendPercent: 70,
        width: compositionResult.metadata.width,
        height: compositionResult.metadata.height,
        model: "black-forest-labs/FLUX.1-dev",
        a1LayoutKey: "uk-riba-standard",
        siteSnapshot,
        a1SheetMetadata: compositionResult.metadata,
        panelMap: panelsMap,
      });

      logger.success("✅ Design saved to history");
      reportProgress("finalizing", "Finalizing...", 95);

      // STEP 11: Return complete result
      logger.info("\n✅ ========================================");
      logger.info("✅ MULTI-PANEL A1 WORKFLOW COMPLETE");
      logger.info("✅ ========================================\n");

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
        geometryRenders: geometryRenders,
        geometryScene,
        consistencyReport,
        baselineBundle,
        seeds: {
          base: effectiveBaseSeed,
          panelSeeds,
        },
        panelValidations,
        metadata: {
          workflow: geometryDNA ? "geometry-volume-first" : "multi-panel-a1",
          panelCount: generatedPanels.length,
          consistencyScore: consistencyReport.consistencyScore,
          generatedAt: new Date().toISOString(),
          baseSeed: effectiveBaseSeed,
          panelSeeds,
        },
      };
    } catch (error) {
      const errorMsg = error.message || "Unknown error";
      const stackTrace = error.stack?.split("\n").slice(0, 5).join("\n") || "";
      logger.error(`❌ Multi-panel A1 workflow failed: ${errorMsg}`);
      if (stackTrace) {
        logger.error(`   Stack: ${stackTrace}`);
      }
      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}

function buildPanelMetadata(sections = []) {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    status: "rendered",
    keywords: section.keywords || [],
    minCount: section.minCount || 1,
    idealCount: section.idealCount || section.minCount || 1,
    position: section.position || null,
  }));
}

// Export singleton instance
const dnaWorkflowOrchestrator = new DNAWorkflowOrchestrator();
export default dnaWorkflowOrchestrator;
