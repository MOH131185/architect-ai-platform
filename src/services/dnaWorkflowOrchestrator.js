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
// DEPRECATED: compositeA1Sheet and architecturalSheetService are only used by
// the dead runHybridA1Workflow path. Imports removed in Phase 4 cleanup.
// import { compositeA1Sheet } from "./a1/A1SheetGenerator.js";
// import architecturalSheetService from "./architecturalSheetService.js";
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
  getVerbatimPromptLock,
  getHeroControlForPanel,
  HERO_REFERENCE_PANELS,
  HERO_CONTROL_STRENGTH,
} from "./design/designFingerprintService.js";
import { buildPanelPrompt } from "./a1/panelPromptBuilders.js";
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
   * @deprecated Phase 4 – Dead path. UI calls runMultiPanelA1Workflow() exclusively.
   * Retained for backwards-compatibility but logs a deprecation warning.
   * Will be removed in a future release.
   *
   * @param {Object} ctx - Generation context
   * @returns {Promise<Object>} Delegates to runMultiPanelA1Workflow
   */
  async runA1SheetWorkflow(ctx) {
    logger.warn(
      "⚠️  [DEPRECATED] runA1SheetWorkflow() is a dead path. " +
        "Redirecting to runMultiPanelA1Workflow(). " +
        "Remove this method in the next major release.",
    );
    return this.runMultiPanelA1Workflow(ctx);
    // Original one-shot/hybrid body removed – see git history for reference.
  }

  /**
   * @deprecated Phase 4 – Dead path. Only called from the also-dead runA1SheetWorkflow().
   * UI calls runMultiPanelA1Workflow() exclusively. Retained for reference.
   * Will be removed in a future release.
   *
   * @param {Object} ctx - Workflow context
   * @returns {Promise<Object>} Delegates to runMultiPanelA1Workflow
   */
  async runHybridA1Workflow(ctx) {
    logger.warn(
      "⚠️  [DEPRECATED] runHybridA1Workflow() is a dead path. " +
        "Redirecting to runMultiPanelA1Workflow(). " +
        "Remove this method in the next major release.",
    );
    return this.runMultiPanelA1Workflow(ctx);
    // Dead code removed - see git history for original hybrid A1 workflow body.
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

      // POST-DNA FLOOR COUNT ENFORCEMENT:
      // Ensure masterDNA.dimensions.floors matches user's requested floor count.
      // DNA generators sometimes hallucinate extra floors.
      const userRequestedFloors =
        projectContext?.floorCount ||
        projectContext?.floors ||
        projectContext?.programSpaces?._calculatedFloorCount ||
        null;

      if (userRequestedFloors) {
        const dnaFloors =
          masterDNA?.dimensions?.floors ||
          masterDNA?.dimensions?.floorCount ||
          masterDNA?.dimensions?.floor_count;

        if (dnaFloors && dnaFloors !== userRequestedFloors) {
          logger.warn(
            `⚠️ [FLOOR COUNT FIX] DNA has ${dnaFloors} floors but user requested ${userRequestedFloors}. Force-correcting.`,
          );
          masterDNA.dimensions.floors = userRequestedFloors;
          masterDNA.dimensions.floorCount = userRequestedFloors;
          masterDNA.dimensions.floor_count = userRequestedFloors;
          // Recalculate height if needed
          const floorHeight = 3.2;
          const expectedHeight = userRequestedFloors * floorHeight;
          if (
            masterDNA.dimensions.height &&
            masterDNA.dimensions.height > expectedHeight + floorHeight
          ) {
            masterDNA.dimensions.height = expectedHeight;
            logger.warn(
              `   Height adjusted to ${expectedHeight}m for ${userRequestedFloors} floor(s)`,
            );
          }
        }
      }

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
        masterDNA?.dimensions?.floors ||
        masterDNA?.dimensions?.floorCount ||
        masterDNA?.dimensions?.floor_count ||
        1;
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

        // DATA PANELS: Skip FLUX — these will be rendered as deterministic SVG
        // during the composition step (schedules, materials, climate are text-heavy
        // and FLUX produces semi-legible text). The compose API renders them server-side.
        const DATA_PANELS = [
          "schedules_notes",
          "material_palette",
          "climate_card",
        ];
        if (DATA_PANELS.includes(job.type)) {
          logger.info(
            `   📊 [SVG] Skipping FLUX for data panel ${job.type} — will render as SVG during composition`,
          );
          const panelResult = {
            id: job.id,
            type: job.type,
            imageUrl: null,
            svgPanel: true,
            seed: job.seed,
            prompt: job.prompt,
            width: job.width,
            height: job.height,
            dnaSnapshot: job.dnaSnapshot,
            meta: { ...job.meta, model: "svg", generatorUsed: "svg" },
          };
          generatedPanels.push(panelResult);
          reportProgress("rendering", `${job.type} (SVG)`, panelDonePercent);
          continue;
        }

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

          // NEW: Determine style reference for panels that should match hero_3d
          // IP-Adapter ensures material consistency: brick colors, window frames, roof tiles
          // Uses HERO_REFERENCE_PANELS to include elevations, sections, axonometric, and interior_3d
          const shouldUseHeroStyleRef =
            HERO_REFERENCE_PANELS.includes(job.type) ||
            job.type.startsWith("section_");
          const effectiveStyleReference =
            shouldUseHeroStyleRef && heroStyleReferenceUrl
              ? heroStyleReferenceUrl
              : null;

          if (effectiveStyleReference) {
            const panelStrength = HERO_CONTROL_STRENGTH[job.type] || 0.6;
            logger.info(
              `   🎨 [STYLE LOCK] Using hero_3d as style reference for ${job.type} (strength: ${panelStrength})`,
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
            // NEW: Per-panel strength from HERO_CONTROL_STRENGTH (axonometric: 0.7, elevations: 0.6, sections: 0.5)
            styleReferenceStrength: effectiveStyleReference
              ? HERO_CONTROL_STRENGTH[job.type] || 0.6
              : null,
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

            // PROMPT REBUILD: Now that we have the design fingerprint, rebuild
            // all remaining panel prompts with the fingerprint constraint injected.
            // The generation loop is sequential so jobs[i+1..n] haven't been sent yet.
            if (designFingerprint) {
              const fingerprintConstraint =
                getVerbatimPromptLock(designFingerprint);
              let rebuiltCount = 0;

              for (let j = i + 1; j < panelJobs.length; j++) {
                const futureJob = panelJobs[j];
                // Skip panels that don't have a prompt builder (e.g., data panels)
                try {
                  const rebuilt = buildPanelPrompt(futureJob.type, {
                    masterDNA,
                    locationData,
                    projectContext,
                    consistencyLock: futureJob.meta?.consistencyLock || null,
                    geometryHint: futureJob.meta?.geometryHint || null,
                    designFingerprint,
                    fingerprintConstraint,
                    hasStyleReference: !!heroStyleReferenceUrl,
                  });

                  if (rebuilt && rebuilt.prompt) {
                    futureJob.prompt = rebuilt.prompt;
                    futureJob.negativePrompt =
                      rebuilt.negativePrompt || futureJob.negativePrompt;
                    rebuiltCount++;
                  }
                } catch (rebuildErr) {
                  // Non-fatal: keep original prompt if rebuild fails
                  logger.debug(
                    `   ℹ️ Could not rebuild prompt for ${futureJob.type}: ${rebuildErr.message}`,
                  );
                }
              }

              if (rebuiltCount > 0) {
                logger.success(
                  `   🔒 Rebuilt ${rebuiltCount} panel prompts with fingerprint constraint`,
                );
              }
            }
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
                  styleReferenceStrength: heroStyleReferenceUrl
                    ? HERO_CONTROL_STRENGTH[panelType] || 0.6
                    : null,
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
      // Enrich floor plan panels with roomCount from DNA so compose API
      // validation passes (it checks roomCount > 0 for floor_plan_* panels)
      const dnaRooms = masterDNA?.rooms || masterDNA?.program?.rooms || [];
      // Use the designFingerprint that planA1Panels assigned to panels.
      // This MUST match panel.meta.designFingerprint or the compose API
      // will reject with FINGERPRINT_MISMATCH.
      const panelFingerprint =
        masterDNA?.designFingerprint ||
        generatedPanels[0]?.meta?.designFingerprint ||
        designId;

      // Build site overlay – drop base64 data URLs that exceed 2MB to
      // stay within Vercel's 4.5MB body limit.  The compose endpoint
      // can still render the site panel without the overlay image.
      let siteOverlay = null;
      if (siteSnapshot?.dataUrl) {
        const dataUrlBytes = siteSnapshot.dataUrl.length;
        if (dataUrlBytes < 2_000_000) {
          siteOverlay = { imageUrl: siteSnapshot.dataUrl };
        } else {
          logger.warn(
            `⚠️ Site snapshot too large (${(dataUrlBytes / 1_000_000).toFixed(1)}MB) – omitting from compose payload`,
          );
        }
      }

      const composePayload = {
        designId,
        designFingerprint: panelFingerprint,
        panels: generatedPanels.map((p) => {
          const meta = { ...(p.meta || {}) };
          // Strip large prompt strings – compose endpoint doesn't need them
          delete meta.prompt;
          delete meta.basePrompt;
          delete meta.consistencyLock;
          delete meta.geometryHint;
          delete meta.designFingerprint; // Already sent as top-level field
          if (p.type?.includes("floor_plan") && !meta.roomCount) {
            const floorIndex =
              p.type === "floor_plan_ground"
                ? 0
                : p.type === "floor_plan_first"
                  ? 1
                  : 2;
            const floorRooms = dnaRooms.filter((r) => {
              const level = r.floor ?? r.level ?? 0;
              return level === floorIndex;
            });
            meta.roomCount = floorRooms.length || dnaRooms.length || 1;
            meta.wallCount = meta.roomCount * 4; // approximate
          }
          return {
            type: p.type,
            imageUrl: p.imageUrl,
            label: p.type.toUpperCase().replace(/_/g, " "),
            meta,
            ...(p.svgPanel ? { svgPanel: true } : {}),
          };
        }),
        siteOverlay,
        layoutConfig: "uk-riba-standard",
        // TRIMMED: Only fields the compose endpoint actually uses for SVG data panels
        masterDNA: {
          rooms: masterDNA?.rooms || masterDNA?.program?.rooms || [],
          materials: masterDNA?.materials || [],
          dimensions: masterDNA?.dimensions || {},
          architecturalStyle: masterDNA?.architecturalStyle,
          roof: masterDNA?.roof,
        },
        projectContext: {
          programSpaces: projectContext?.programSpaces || [],
          buildingProgram: projectContext?.buildingProgram,
        },
        locationData: {
          climate: locationData?.climate,
          sunPath: locationData?.sunPath,
          address: locationData?.address,
        },
      };

      const composeBody = JSON.stringify(composePayload);
      const bodyMB = composeBody.length / 1_000_000;
      logger.info(`📦 Compose payload size: ${bodyMB.toFixed(2)}MB`);
      if (bodyMB > 4.0) {
        logger.warn(
          `⚠️ Compose payload approaching Vercel limit (4.5MB). Breakdown:`,
        );
        logger.warn(
          `   panels: ${(JSON.stringify(composePayload.panels).length / 1000).toFixed(1)}KB`,
        );
        logger.warn(
          `   masterDNA: ${(JSON.stringify(composePayload.masterDNA).length / 1000).toFixed(1)}KB`,
        );
        logger.warn(
          `   siteOverlay: ${(JSON.stringify(composePayload.siteOverlay || null).length / 1000).toFixed(1)}KB`,
        );
      }

      const composeResponse = await fetchImpl(
        `${API_BASE_URL}/api/a1/compose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: composeBody,
        },
      );

      if (!composeResponse.ok) {
        let errorDetail = "";
        try {
          const errorBody = await composeResponse.json();
          errorDetail =
            errorBody.message || errorBody.error || JSON.stringify(errorBody);
          logger.error(`❌ Compose API error: ${errorDetail}`);
        } catch (_) {
          /* ignore parse errors */
        }
        throw new Error(
          `Composition failed: ${composeResponse.status} – ${errorDetail}`,
        );
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
