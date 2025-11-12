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

import projectDNAPipeline from './projectDNAPipeline';
import clipEmbeddingService from './clipEmbeddingService';
import enhancedDesignDNAService from './enhancedDesignDNAService';
import designHistoryService from './designHistoryService';
import dnaValidator from './dnaValidator';
import normalizeDNA from './dnaNormalization';
import { buildA1SheetPrompt, buildKontextA1Prompt, generateA1SheetMetadata } from './a1SheetPromptGenerator';
import { generateA1SheetImage } from './togetherAIService';
import imageUpscalingService from './imageUpscalingService';
import reasoningOrchestrator from './reasoningOrchestrator';
import a1SheetValidator from './a1SheetValidator';
import { getSiteSnapshotWithMetadata } from './siteMapSnapshotService';
import { overlaySiteMapOnA1Sheet } from './a1SheetOverlay';
import { orchestratePanelGeneration } from './panelOrchestrator';
import { compositeA1Sheet } from './a1Compositor';
import architecturalSheetService from './architecturalSheetService';
import { isFeatureEnabled } from '../config/featureFlags.js';

class DNAWorkflowOrchestrator {
  constructor() {
    this.pipeline = projectDNAPipeline;
    this.clipService = clipEmbeddingService;
    this.dnaGenerator = enhancedDesignDNAService;
    this.historyService = designHistoryService;
    this.validator = dnaValidator;

    console.log('🎼 DNA Workflow Orchestrator initialized');
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
    console.log('\n🚀 ========================================');
    console.log('🚀 INITIALIZING NEW PROJECT');
    console.log('🚀 ========================================\n');

    const {
      locationData,
      projectContext,
      portfolioFiles = []
    } = projectData;

    try {
      // 1. Generate Project ID
      const projectId = this.pipeline.generateProjectId(
        locationData?.address || 'Unknown Location',
        projectContext?.buildingProgram || 'house'
      );

      console.log(`\n✅ Project ID Generated: ${projectId}`);

      // 2. Generate Master Design DNA
      console.log('\n🧬 Generating Master Design DNA...');
      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        null, // Portfolio analysis (to be added)
        locationData
      );

      if (!dnaResult.success) {
        console.warn('⚠️  DNA generation failed, using fallback');
      }

      const masterDNA = dnaResult.masterDNA;

      // 3. Validate DNA
      console.log('\n🔍 Validating Design DNA...');
      const validation = this.validator.validateDesignDNA(masterDNA);

      if (!validation.isValid) {
        console.warn('⚠️  DNA validation issues found');
        console.log('   Errors:', validation.errors.length);
        console.log('   Warnings:', validation.warnings.length);

        // Attempt auto-fix
        const fixed = this.validator.autoFixDesignDNA(masterDNA);
        if (fixed) {
          console.log('✅ DNA auto-fixed successfully');
          Object.assign(masterDNA, fixed);
        }
      }

      // 4. Extract portfolio DNA if provided
      let portfolioDNA = null;
      if (portfolioFiles.length > 0) {
        console.log('\n🎨 Extracting portfolio style DNA...');
        portfolioDNA = await this.dnaGenerator.extractDNAFromPortfolio(portfolioFiles);
        if (portfolioDNA) {
          console.log('✅ Portfolio DNA extracted');
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
          style: projectContext.style
        }
      });

      console.log('\n✅ ========================================');
      console.log('✅ PROJECT INITIALIZED SUCCESSFULLY');
      console.log('✅ ========================================');
      console.log(`   🔑 Project ID: ${projectId}`);
      console.log(`   📏 Dimensions: ${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m`);
      console.log(`   🏗️  Floors: ${masterDNA.dimensions?.floor_count}`);
      console.log(`   🎨 Style: ${masterDNA.architectural_style?.name}`);
      console.log(`   📦 Materials: ${masterDNA.materials?.exterior?.primary}`);

      return {
        success: true,
        projectId,
        masterDNA,
        validation,
        portfolioDNA,
        message: 'Project initialized successfully. Ready to generate floor plan.'
      };

    } catch (error) {
      console.error('\n❌ Project initialization failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to initialize project'
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
    console.log('\n📐 ========================================');
    console.log('📐 ESTABLISHING DNA BASELINE');
    console.log('📐 ========================================\n');

    try {
      // 1. Load project DNA
      const legacyContext = this.historyService.getDesignContext(projectId);
      if (!legacyContext) {
        throw new Error('Project not found. Initialize project first.');
      }

      // 2. Generate prompt embedding
      console.log('\n🎯 Generating CLIP embedding for floor plan...');
      const embeddingResult = await this.clipService.generateEmbedding(floorPlanImageUrl);

      // 3. Generate text embedding for prompt
      const prompt = generationData.prompt || legacyContext.prompt;
      const textEmbeddingResult = await this.clipService.generateTextEmbedding(prompt);

      // 4. Save DNA package to new pipeline
      console.log('\n💾 Saving DNA baseline to pipeline...');
      const saveResult = await this.pipeline.saveProjectDNA({
        projectId,
        floorPlanImage: floorPlanImageUrl,
        prompt,
        promptEmbedding: textEmbeddingResult.embedding,
        designDNA: legacyContext.buildingDNA,
        locationData: legacyContext.location,
        projectContext: legacyContext.metadata,
        imageEmbedding: embeddingResult.embedding // Store image embedding too
      });

      if (!saveResult.success) {
        throw new Error('Failed to save DNA baseline');
      }

      console.log('\n✅ ========================================');
      console.log('✅ DNA BASELINE ESTABLISHED');
      console.log('✅ ========================================');
      console.log(`   🔑 Project ID: ${projectId}`);
      console.log(`   🖼️  Floor Plan: ${embeddingResult.dimension}D embedding`);
      console.log(`   📝 Prompt: ${textEmbeddingResult.dimension}D embedding`);
      console.log(`   💾 Storage: ${saveResult.storageKey}`);

      return {
        success: true,
        projectId,
        baseline: {
          floorPlanImage: floorPlanImageUrl,
          imageEmbedding: embeddingResult,
          promptEmbedding: textEmbeddingResult
        },
        dnaPackage: saveResult.dnaPackage,
        message: 'DNA baseline established. Ready to generate additional views.'
      };

    } catch (error) {
      console.error('\n❌ DNA baseline establishment failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to establish DNA baseline'
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
    console.log(`\n🎨 ========================================`);
    console.log(`🎨 GENERATING CONSISTENT VIEW: ${viewType.toUpperCase()}`);
    console.log(`🎨 ========================================\n`);

    try {
      // 1. Load DNA baseline
      console.log('📖 Loading DNA baseline...');
      const dnaPackage = this.pipeline.loadProjectDNA(projectId);
      if (!dnaPackage) {
        throw new Error('DNA baseline not found. Generate floor plan first.');
      }

      // 2. Prepare generation parameters
      console.log('⚙️  Preparing generation parameters...');
      const generationParams = await this.pipeline.generateWithDNA(
        projectId,
        viewType,
        options
      );

      // 3. Build enhanced prompt with DNA constraints
      const enhancedPrompt = this.buildDNAConstrainedPrompt(
        dnaPackage,
        viewType,
        options.userPrompt || ''
      );

      console.log('📝 Enhanced prompt prepared:');
      console.log(`   Length: ${enhancedPrompt.length} chars`);
      console.log(`   Consistency Rules: ${dnaPackage.designDNA?.consistency_rules?.length || 0}`);

      // 4. Call AI service to generate image
      console.log(`\n🤖 Calling AI service: ${aiService.constructor.name || 'AI Service'}...`);

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
          designDNA: dnaPackage.designDNA
        },
        message: 'Generation parameters ready. Call AI service with these parameters.',
        nextStep: 'Call validateGeneratedView() after image generation'
      };

    } catch (error) {
      console.error(`\n❌ View generation preparation failed:`, error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to prepare view generation'
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
    console.log(`\n🔍 ========================================`);
    console.log(`🔍 VALIDATING VIEW: ${viewType.toUpperCase()}`);
    console.log(`🔍 ========================================\n`);

    try {
      // 1. Check harmony using CLIP similarity
      console.log('🎯 Checking design harmony...');
      const harmonyResult = await this.pipeline.checkHarmony(
        projectId,
        generatedImageUrl,
        viewType
      );

      // 2. Get workflow status
      const workflowStatus = this.pipeline.getWorkflowStatus(projectId);

      console.log('\n✅ ========================================');
      console.log(`✅ VALIDATION COMPLETE: ${harmonyResult.status.toUpperCase()}`);
      console.log('✅ ========================================');
      console.log(`   📊 Consistency Score: ${(harmonyResult.score * 100).toFixed(1)}%`);
      console.log(`   🎯 Status: ${harmonyResult.status}`);
      console.log(`   💬 ${harmonyResult.message}`);
      console.log(`   📈 Project Completion: ${workflowStatus.workflow?.completionPercentage}%`);

      return {
        success: true,
        projectId,
        viewType,
        consistency: harmonyResult,
        workflow: workflowStatus.workflow,
        recommendation: this.getConsistencyRecommendation(harmonyResult),
        message: harmonyResult.message
      };

    } catch (error) {
      console.error('\n❌ View validation failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to validate view'
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
    console.log('\n📊 ========================================');
    console.log('📊 PROJECT SUMMARY');
    console.log('📊 ========================================\n');

    const workflowStatus = this.pipeline.getWorkflowStatus(projectId);

    if (!workflowStatus.success) {
      return {
        success: false,
        message: 'Project not found'
      };
    }

    const workflow = workflowStatus.workflow;

    console.log(`   🔑 Project ID: ${projectId}`);
    console.log(`   📍 Address: ${workflow.projectInfo.address}`);
    console.log(`   🏠 Type: ${workflow.projectInfo.buildingType}`);
    console.log(`   📏 Area: ${workflow.projectInfo.floorArea}m²`);
    console.log(`   🏗️  Floors: ${workflow.projectInfo.floors}`);
    console.log(`   📈 Completion: ${workflow.completionPercentage}%`);
    console.log(`   🎯 Avg Consistency: ${(workflow.consistency.averageScore * 100).toFixed(1)}%`);
    console.log(`   ✅ Checks Performed: ${workflow.consistency.checksPerformed}`);

    return {
      success: true,
      projectId,
      summary: workflow,
      consistency: this.generateConsistencyReport(workflow)
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
    const hybridModeEnabled = isFeatureEnabled('hybridA1Mode');
    
    if (hybridModeEnabled) {
      console.log('\n🎼 ========================================');
      console.log('🎼 HYBRID A1 WORKFLOW (PANEL-BASED)');
      console.log('🎼 ========================================\n');
      return this.runHybridA1Workflow(ctx);
    }
    
    console.log('\n📐 ========================================');
    console.log('📐 A1 SHEET WORKFLOW (ONE-SHOT)');
    console.log('📐 ========================================\n');

    const {
      projectContext,
      locationData,
      portfolioAnalysis = null,
      portfolioBlendPercent = 70,
      seed
    } = ctx;

    try {
      // ========================================
      // STEP 1: Generate Master Design DNA
      // ========================================
      console.log('🧬 STEP 1: Generating Master Design DNA...');

      const dnaResult = await this.dnaGenerator.generateMasterDesignDNA(
        projectContext,
        portfolioAnalysis,
        locationData
      );

      if (!dnaResult.success && !dnaResult.masterDNA?.isFallback) {
        console.warn('⚠️  Master DNA generation had issues, using fallback DNA');
      }

      let masterDNA = dnaResult.masterDNA;

      // Normalize DNA to ensure consistent structure (materials as array, etc.)
      masterDNA = normalizeDNA(masterDNA, {
        floors: projectContext.floors || 2,
        area: projectContext.floorArea || projectContext.area || 200,
        style: projectContext.architecturalStyle || 'Contemporary'
      });

      console.log('✅ Master DNA generated and normalized');
      console.log(`   📏 Dimensions: ${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m × ${masterDNA.dimensions?.height}m`);
      console.log(`   🏗️  Floors: ${masterDNA.dimensions?.floors}`);
      console.log(`   🎨 Style: ${masterDNA.architecturalStyle}`);
      console.log(`   📦 Materials: ${masterDNA.materials?.length} items (array)`);

      // ========================================
      // STEP 2: Validate Master DNA
      // ========================================
      console.log('\n🔍 STEP 2: Validating Master DNA...');

      const validation = this.validator.validateDesignDNA(masterDNA);

      if (!validation.isValid) {
        console.warn('⚠️  DNA validation found issues:', validation.errors);
        console.log('🔧 Attempting auto-fix...');
        const fixed = this.validator.autoFixDesignDNA(masterDNA);
        if (fixed) {
          console.log('✅ DNA auto-fixed successfully');
          Object.assign(masterDNA, fixed);
        }
      } else {
        console.log('✅ DNA validation passed');
      }

      // ========================================
      // STEP 2.5: Build Blended Style (Local + Portfolio) - ENHANCED
      // ========================================
      console.log('\n🎨 STEP 2.5: Building blended style with advanced weighted algorithm...');

      // Use sophisticated weighted blending algorithm from aiIntegrationService
      const portfolioWeight = (portfolioBlendPercent || 70) / 100; // Convert 0-100 to 0-1

      let blendedStyle;

      if (portfolioAnalysis && this.aiIntegrationService) {
        // Use advanced weighted blending with granular control
        console.log(`   Using advanced blending: ${Math.round(portfolioWeight * 100)}% portfolio influence`);

        blendedStyle = this.aiIntegrationService.blendStyles(
          locationData,
          portfolioAnalysis,
          portfolioWeight, // material weight
          portfolioWeight  // characteristic weight
        );

        // Enhance with Master DNA color specifications
        if (masterDNA.materials && Array.isArray(masterDNA.materials)) {
          blendedStyle.colorPalette = {
            facade: masterDNA.materials[0]?.hexColor || blendedStyle.colorPalette?.facade || '#B8604E',
            roof: masterDNA.materials[1]?.hexColor || blendedStyle.colorPalette?.roof || '#8B4513',
            trim: blendedStyle.colorPalette?.trim || '#FFFFFF',
            accent: blendedStyle.colorPalette?.accent || '#2C3E50'
          };
        }

        console.log(`   ✅ Advanced blend complete: ${blendedStyle.styleName}`);
        console.log(`   📊 Blend ratio - Local: ${Math.round(blendedStyle.blendRatio?.local * 100)}%, Portfolio: ${Math.round(blendedStyle.blendRatio?.portfolio * 100)}%`);

      } else {
        // Fallback to simple blending if aiIntegrationService not available
        console.log('   ⚠️ Using fallback simple blending (aiIntegrationService not available)');

        let materialsArray = ['Brick', 'Glass', 'Concrete']; // Default fallback

        if (Array.isArray(portfolioAnalysis?.materials)) {
          materialsArray = portfolioAnalysis.materials;
        } else if (Array.isArray(masterDNA.materials)) {
          materialsArray = masterDNA.materials.slice(0, 3).map(m =>
            typeof m === 'string' ? m : m.name || 'Material'
          );
        }

        blendedStyle = {
          styleName: masterDNA.architecturalStyle || portfolioAnalysis?.dominantStyle || 'Contemporary',
          materials: materialsArray,
          characteristics: Array.isArray(portfolioAnalysis?.characteristics)
            ? portfolioAnalysis.characteristics
            : ['Modern', 'Functional', 'Sustainable'],
          facadeArticulation: portfolioAnalysis?.facadeArticulation || 'Clean modern lines with balanced proportions',
          glazingRatio: portfolioAnalysis?.glazingRatio || '40%',
          colorPalette: {
            facade: masterDNA.materials?.[0]?.hexColor || portfolioAnalysis?.colorPalette?.facade || '#B8604E',
            roof: masterDNA.materials?.[1]?.hexColor || portfolioAnalysis?.colorPalette?.roof || '#8B4513',
            trim: portfolioAnalysis?.colorPalette?.trim || '#FFFFFF',
            accent: portfolioAnalysis?.colorPalette?.accent || '#2C3E50'
          }
        };
      }

      // Extract site shape from location data if available
      const siteShape = locationData?.siteAnalysis?.polygon || locationData?.detectedShape || null;

      console.log('✅ Blended style computed');
      console.log(`   🎨 Style: ${blendedStyle.styleName}`);
      console.log(`   📦 Materials: ${blendedStyle.materials.slice(0, 2).join(', ')}`);
      console.log(`   🏠 Facade: ${blendedStyle.facadeArticulation.substring(0, 50)}...`);

      // ========================================
      // STEP 2.75: Generate Design Reasoning (OpenAI → Together.ai fallback)
      // ========================================
      console.log('\n🧠 STEP 2.75: Generating design reasoning...');
      
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
          buildingDNA: masterDNA
        };

        designReasoning = await reasoningOrchestrator.generateDesignReasoning(reasoningContext);
        console.log('✅ Design reasoning generated');
        console.log(`   📊 Source: ${designReasoning.source || 'unknown'}`);
        console.log(`   🎨 Model: ${designReasoning.model || 'unknown'}`);
      } catch (error) {
        console.warn('⚠️  Design reasoning generation failed:', error.message);
        // Continue without reasoning - not critical for A1 sheet generation
      }

      // ========================================
      // STEP 2.75: Extract Climate-Responsive Technical Details
      // ========================================
      console.log('\n🌡️ STEP 2.75: Extracting climate-responsive technical details...');

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
              `Glazing ratio: ${Math.round((climateParams.thermal.glazingRatio || 0.20) * 100)}%`
            ]
          });
        }

        // Ventilation strategy
        if (climateParams.ventilation) {
          selectedDetails.push({
            title: 'Ventilation Design',
            specs: [
              `Primary: ${climateParams.ventilation.primary || 'Natural cross-ventilation'}`,
              `Type: ${climateParams.ventilation.type || 'Mixed mode'}`,
              `Details: ${climateParams.ventilation.details || 'Operable windows with mechanical backup'}`
            ]
          });
        }

        // Solar design (if available)
        if (climateParams.solar && selectedDetails.length < 3) {
          selectedDetails.push({
            title: 'Passive Solar',
            specs: [
              `Orientation: ${climateParams.solar.orientation || 'South-facing primary glazing'}`,
              `Overhang: ${climateParams.solar.overhangDepth || '1.2m south facade'}`,
              `Shading: ${climateParams.solar.shadingType || 'Fixed overhangs'}`
            ]
          });
        }

        console.log(`   ✅ ${selectedDetails.length} climate-responsive details extracted`);
      } else {
        console.log('   ⚠️ No climate design parameters available, using defaults');
      }

      // Get feature flags early (needed for multiple steps)
      const flags = (() => {
        try {
          return JSON.parse(sessionStorage.getItem('featureFlags') || '{}');
        } catch {
          return {};
        }
      })();

      // ========================================
      // STEP 3: Enhanced Site Map Integration (IMG2IMG Context)
      // ========================================
      console.log('\n🗺️  STEP 3: Enhanced site map capture for A1 generation...');

      let sitePlanAttachment = null;
      let sitePlanMetadata = null;
      let siteMapData = null;
      let useAsInitImage = false;
      let initImageStrength = null;

      // Import enhanced site map integration
      const { captureSiteMapForGeneration, generateSiteAwarePrompt, getOptimalQualitySettings } = await import('./enhancedSiteMapIntegration');

      // Determine integration mode from feature flags
      // DEFAULT: 'embed' mode - AI generates site plan from prompt description (NOT as initImage)
      // 'context' mode uses site plan as initImage which transforms entire sheet - NOT what we want
      const siteMapMode = flags.siteMapMode || 'embed'; // 'embed' | 'context' | 'overlay' | 'none'
      console.log(`   📍 Site map mode: ${siteMapMode} (embed = AI generates from prompt, context = initImage transform)`);

      // Check if site plan was captured from map (stored in sessionStorage)
      try {
        const capturedSitePlan = sessionStorage.getItem('a1SiteSnapshot');
        if (capturedSitePlan && capturedSitePlan.startsWith('data:')) {
          sitePlanAttachment = capturedSitePlan;
          sitePlanMetadata = {
            source: 'user-captured',
            capturedAt: new Date().toISOString(),
            mode: siteMapMode
          };

          // Create enhanced site map data
          // IMPORTANT: Use 'embed' mode by default - AI generates site plan from prompt, NOT as initImage
          const effectiveMode = siteMapMode === 'context' ? 'embed' : siteMapMode; // Force embed to prevent initImage usage
          siteMapData = {
            attachment: sitePlanAttachment,
            metadata: sitePlanMetadata,
            mode: effectiveMode,
            instructions: effectiveMode === 'embed' ? {
              type: 'prompt_embed',
              prompt: 'Include detailed site plan in top-left corner based on captured Google Maps context'
            } : null
          };

          console.log('✅ Using user-captured site plan');
          console.log(`   🎯 Integration mode: ${siteMapMode}`);
        }
      } catch (e) {
        console.log('   No captured site plan found in sessionStorage');
      }
      
      // If no captured site plan, try to generate one from location data
      if (!sitePlanAttachment && locationData && locationData.coordinates) {
        try {
          // Use enhanced site map capture
          siteMapData = await captureSiteMapForGeneration({
            locationData,
            sitePolygon: locationData.sitePolygon || locationData.siteAnalysis?.polygon || null,
            useAsContext: siteMapMode === 'context',
            mode: siteMapMode
          });

          if (siteMapData && siteMapData.attachment) {
            sitePlanAttachment = siteMapData.attachment;
            sitePlanMetadata = siteMapData.metadata;
            console.log('✅ Generated site map from location data');
            console.log(`   📐 Mode: ${siteMapData.mode}`);
            console.log(`   🗺️ Has polygon: ${sitePlanMetadata.hasPolygon}`);

            // IMPORTANT: Do NOT use site plan as initImage - it transforms entire sheet
            // Instead, use 'embed' mode where AI generates site plan from prompt description
            if (siteMapMode === 'context') {
              console.log(`   ⚠️  Context mode disabled - using 'embed' mode instead to prevent full sheet transformation`);
              console.log(`   ✅ Site plan will be AI-generated from prompt description, not used as initImage`);
            }
            // Never set useAsInitImage = true for site plans - it causes the site plan to transform the entire A1 sheet
          }
        } catch (error) {
          console.warn('⚠️  Enhanced site map generation failed:', error.message);
          console.log('   Continuing without site plan - will use placeholder');
        }
      }

      // ========================================
      // STEP 4: Build Site-Aware A1 Sheet Prompt (No Duplication)
      // ========================================
      console.log('\n📝 STEP 4: Building site-aware A1 sheet prompt...');

      const useKontextPrompt = (flags.fluxImageModel || 'black-forest-labs/FLUX.1-dev').includes('kontext');

      // Generate base prompt
      let basePromptResult = useKontextPrompt
        ? buildKontextA1Prompt({
            masterDNA,
            location: locationData,
            climate: locationData?.climate,
            portfolioBlendPercent,
            projectContext,
            projectMeta: {
              name: projectContext.projectName || 'Architectural Design',
              style: masterDNA.architectural_style?.name || masterDNA.architecturalStyle,
              seed: seed || Date.now()
            },
            blendedStyle,
            siteShape,
            siteConstraints: masterDNA.siteConstraints || null
          })
        : buildA1SheetPrompt({
            masterDNA,
            location: locationData,
            climate: locationData?.climate,
            portfolioBlendPercent,
            projectContext,
            projectMeta: {
              name: projectContext.projectName || 'Architectural Design',
              style: masterDNA.architectural_style?.name || masterDNA.architecturalStyle,
              seed: seed || Date.now()
            },
            blendedStyle,
            siteShape,
            selectedDetails,
            siteConstraints: masterDNA.siteConstraints || null,
            sitePlanAttachment: sitePlanAttachment, 
            sitePlanPolicy: sitePlanAttachment ? 'embed' : 'placeholder' // Use 'embed' to include site plan details in prompt when captured
          });

      // Apply site-aware enhancements (only for 'embed' mode - do NOT remove site plan instructions)
      let { prompt, negativePrompt, systemHints } = basePromptResult;

      if (siteMapData && siteMapData.attachment && siteMapData.mode === 'embed') {
        console.log('   🗺️ Applying site-aware enhancements (embed mode)...');
        console.log('   ✅ Site plan instructions KEPT in prompt - AI will generate site plan section');
        console.log('   🚫 Site plan NOT used as initImage - prevents full sheet transformation');
        // For 'embed' mode, keep the prompt as-is - it already includes site plan instructions
        // The prompt generator already handles sitePlanAttachment and includes detailed description
      } else if (siteMapData && siteMapData.attachment && siteMapData.mode === 'context') {
        // Context mode disabled - fall back to embed
        console.log('   ⚠️  Context mode detected but disabled - using embed mode instead');
      }
      
      // CRITICAL: Never use site plan as initImage - it transforms the entire A1 sheet
      useAsInitImage = false;

      console.log('✅ A1 sheet prompt generated');
      console.log(`   📝 Prompt length: ${prompt.length} chars`);
      console.log(`   🚫 Negative prompt length: ${negativePrompt.length} chars`);
      console.log(`   📐 Target aspect ratio: ${systemHints.targetAspectRatio}`);

      // ========================================
      // STEP 5: Generate A1 Sheet Image with Site Context
      // ========================================
      console.log('\n🎨 STEP 5: Generating A1 sheet image with site awareness...');

      const effectiveSeed = seed || projectContext.seed || Math.floor(Math.random() * 1e6);

      // Get optimal quality settings for initial generation
      const qualitySettings = getOptimalQualitySettings({
        seed: effectiveSeed,
        orientation: flags.a1Orientation || 'landscape',
        model: flags.fluxImageModel || 'black-forest-labs/FLUX.1-dev'
      }, 'initial');

      // Generate A1 sheet with enhanced quality and site context
      let imageResult = await generateA1SheetImage({
        prompt: prompt,  // Site-aware prompt (duplication removed if using IMG2IMG)
        negativePrompt: negativePrompt,  // Separate negative prompt
        width: qualitySettings.width,
        height: qualitySettings.height,
        seed: effectiveSeed,
        initImage: null, // NEVER use site plan as initImage - it transforms entire sheet instead of generating site plan section
        imageStrength: null, // No initImage = no imageStrength needed
        guidanceScale: qualitySettings.guidanceScale, // Optimized guidance
        attachments: null, // FLUX.1-dev doesn't support attachments - site plan details are in prompt only
        orientation: qualitySettings.orientation || 'landscape',
        model: qualitySettings.model,
        stepsOverride: qualitySettings.steps // Higher steps for quality
      });

      console.log('   ✅ Site plan details included in prompt - AI will generate site plan section in top-left corner');
      console.log('   🚫 Site plan NOT used as initImage - prevents full sheet transformation');

      console.log('✅ A1 sheet image generated successfully');
      console.log(`   🖼️  URL: ${imageResult.url?.substring(0, 80)}...`);
      console.log(`   🎲 Seed: ${imageResult.seed}`);
      console.log(`   📐 Dimensions: ${imageResult.metadata.width}×${imageResult.metadata.height}`);
      console.log(`   📊 Aspect ratio: ${imageResult.metadata.aspectRatio}`);

      // ========================================
      // STEP 5.5: Site Plan Integration (AI-Generated, Not Composited)
      // ========================================
      // Site plan is now integrated into the prompt - AI generates it as part of the A1 sheet
      // NO POST-PROCESSING OVERLAY - this was causing the site plan to cover the sheet
      console.log('\n🗺️ STEP 5.5: Site plan integration (AI-generated in prompt)...');
      if (sitePlanAttachment && sitePlanAttachment.startsWith('data:')) {
        console.log('   ✅ Site plan details included in prompt - AI will generate it in top-left corner');
        console.log('   🚫 Post-processing overlay DISABLED - site plan integrated into generation');
        imageResult.metadata.sitePlanComposited = false; // Mark as AI-generated, not composited
        imageResult.metadata.sitePlanSource = 'ai-generated-from-prompt';
      } else {
        console.log('   ℹ️ No captured site snapshot; AI will generate placeholder site panel');
        imageResult.metadata.sitePlanSource = 'ai-generated-placeholder';
      }

      // ========================================
      // STEP 5.6: Store Upscale Metadata (On-Demand Upscaling)
      // ========================================
      console.log('\n🔍 STEP 5.6: A1 sheet generated at base resolution...');
      console.log(`   📐 Base resolution: ${imageResult.metadata.width}×${imageResult.metadata.height}px`);

      // 🔒 LANDSCAPE ENFORCEMENT: Always landscape for A1 sheets
      const isLandscape = true; // FIXED: Always landscape

      console.log(`   📐 Target 300 DPI: ${isLandscape ? '9933×7016px' : '7016×9933px'} (upscaled on download)`);
      console.log(`   💡 Upscaling to 300 DPI will be performed on-demand when user downloads`);

      // Store upscale metadata for download function
      imageResult.metadata.upscaleTarget = {
        width: isLandscape ? 9933 : 7016,
        height: isLandscape ? 7016 : 9933,
        dpi: 300,
        orientation: isLandscape ? 'landscape' : 'portrait'
      };

      // ========================================
      // STEP 6: Generate Metadata
      // ========================================
      const metadata = generateA1SheetMetadata({
        masterDNA,
        location: locationData,
        portfolioBlendPercent
      });
      const modelUsed = flags.fluxImageModel || 'black-forest-labs/FLUX.1-dev';
      
      console.log('\n✅ ========================================');
      console.log('✅ A1 SHEET WORKFLOW COMPLETE');
      console.log('✅ ========================================');
      console.log(`   🎨 Single comprehensive sheet generated`);
      console.log(`   📏 Format: A1 ${isLandscape ? 'landscape' : 'portrait'} ISO 216 (${isLandscape ? '841×594mm' : '594×841mm'})`);
      console.log(`   🖼️  Resolution: ${imageResult.metadata.width}×${imageResult.metadata.height}px (Together.ai max)`);
      console.log(`   📐 Print reference: 300 DPI = ${isLandscape ? '9933×7016px' : '7016×9933px'}`);
      console.log(`   🤖 Model: ${modelUsed}`);
      console.log(`   🎲 Seed: ${effectiveSeed}`);
      console.log(`   🗺️  Site plan: ${sitePlanAttachment ? 'embedded via prompt' : 'placeholder generated'}`);
      if (sitePlanMetadata) {
        console.log(`   📍 Site plan source: ${sitePlanMetadata.source || 'generated'}`);
      }
      console.log(`   ⏱️  Generation time: ~40-60 seconds`);
      console.log(`   ✨ Contains: 10+ professional sections`);

      // ========================================
      // STEP 7: Validate A1 Sheet Quality
      // ========================================
      console.log('\n🔍 STEP 7: Validating A1 sheet quality...');

      const a1SheetValidation = a1SheetValidator.validateA1Sheet(
        {
          url: imageResult.url,
          seed: imageResult.seed,
          prompt,
          negativePrompt,
          metadata: imageResult.metadata
        },
        masterDNA,
        blendedStyle
      );

      console.log(`   ✅ Validation complete: ${a1SheetValidation.score}% quality score`);
      console.log(`   📊 Status: ${a1SheetValidation.valid ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);
      if (a1SheetValidation.issues.length > 0) {
        console.log(`   ⚠️  Issues: ${a1SheetValidation.issues.length}`);
        a1SheetValidation.issues.slice(0, 3).forEach(issue => {
          console.log(`      - ${issue}`);
        });
      }
      if (a1SheetValidation.warnings.length > 0) {
        console.log(`   ⚡ Warnings: ${a1SheetValidation.warnings.length}`);
      }

      // Generate validation report
      const validationReport = a1SheetValidator.generateReport(a1SheetValidation);

      // Return in format compatible with existing UI
      return {
        success: true,
        workflow: 'a1-sheet-one-shot',
        masterDNA,
        blendedStyle, // Include blendedStyle for history saving
        validation,
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
              siteMapAttribution: sitePlanMetadata?.attribution || 'Google Maps'
            }
          },
          format: metadata,
          qualityScore: a1SheetValidation.score, // 🆕 Add quality score
          validationReport // 🆕 Add full validation report
        },
        sitePlanAttachment: sitePlanAttachment ? { dataUrl: sitePlanAttachment, ...sitePlanMetadata } : null, // 🆕 Store captured site plan for modifications
        sitePlanMetadata, // 🆕 Store site plan metadata
        reasoning: designReasoning || dnaResult.reasoning || {},
        projectContext,
        locationData,
        generationMetadata: {
          type: 'a1_sheet',
          seed: effectiveSeed,
          model: 'FLUX.1-dev',
          timestamp: new Date().toISOString(),
          portfolioBlend: portfolioBlendPercent,
          qualityScore: a1SheetValidation.score, // 🆕 Include in metadata
          validated: a1SheetValidation.valid
        }
      };

    } catch (error) {
      // Extract meaningful error message
      let errorMessage = error?.message || String(error);
      
      // Provide helpful context for common errors
      if (error?.status === 503 || errorMessage.includes('503') || errorMessage.includes('proxy server')) {
        errorMessage = 'Proxy server unavailable. Please start the Express server by running: npm run server';
      } else if (errorMessage.includes('[object Object]')) {
        // Try to extract more details from the error object
        errorMessage = error?.body?.error || error?.error || error?.originalError?.message || JSON.stringify(error) || 'Unknown error occurred';
      }
      
      console.error('\n❌ A1 Sheet Workflow failed:', errorMessage);
      console.error('   Full error details:', JSON.stringify({
        message: error?.message,
        status: error?.status,
        body: error?.body,
        error: error?.error,
        stack: error?.stack,
        originalError: error?.originalError
      }, null, 2));
      
      return {
        success: false,
        workflow: 'a1-sheet-one-shot',
        error: errorMessage,
        message: 'Failed to generate A1 sheet',
        status: error?.status
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
    console.log('\n🎯 ========================================');
    console.log('🎯 HYBRID A1 SHEET WORKFLOW STARTING');
    console.log('🎯 Panel-based generation with compositing');
    console.log('🎯 ========================================\n');

    const {
      projectContext,
      locationData,
      portfolioAnalysis = null,
      portfolioBlendPercent = 70,
      seed
    } = ctx;

    try {
      // ========================================
      // STEP 1: Generate Master Design DNA
      // ========================================
      console.log('\n🧬 STEP 1: Generating Master Design DNA...');

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

      console.log('✅ Master DNA generated and validated');

      // ========================================
      // STEP 2: Blend Portfolio Style (if available)
      // ========================================
      console.log('\n🎨 STEP 2: Blending portfolio style...');
      
      let blendedStyle = null;
      if (portfolioAnalysis) {
        // Use existing blending logic from One-Shot workflow
        blendedStyle = {
          styleName: masterDNA.architecturalStyle || portfolioAnalysis?.dominantStyle || 'Contemporary',
          materials: Array.isArray(masterDNA.materials) 
            ? masterDNA.materials.slice(0, 3).map(m => typeof m === 'string' ? m : m.name || 'Material')
            : ['Brick', 'Glass', 'Concrete'],
          characteristics: Array.isArray(portfolioAnalysis?.characteristics)
            ? portfolioAnalysis.characteristics
            : ['Modern', 'Functional', 'Sustainable']
        };
        console.log(`✅ Blended style: ${blendedStyle.styleName}`);
      }

      // ========================================
      // STEP 3: Generate Individual Panels
      // ========================================
      console.log('\n🎨 STEP 3: Generating individual panels...');

      const baseSeed = seed || Math.floor(Math.random() * 1000000);
      
      // Generate all panels with new orchestrator
      const panelResults = await orchestratePanelGeneration({
        masterDNA,
        projectContext,
        locationData,
        blendedStyle,
        baseSeed,
        onProgress: (panelKey, status) => {
          console.log(`   ${status === 'generating' ? '⏳' : status === 'completed' ? '✅' : '❌'} Panel ${panelKey}: ${status}`);
        }
      });

      console.log(`✅ Generated ${Object.keys(panelResults.panelMap).length} panels`);

      if (panelResults.errors.length > 0) {
        console.warn(`⚠️  ${panelResults.errors.length} panels failed, will use placeholders`);
        panelResults.errors.forEach(err => {
          console.warn(`   - ${err.panel}: ${err.error}`);
        });
      }
      
      // Fallback to One-Shot if too many panels failed or rate limit hit
      if (!panelResults.success || Object.keys(panelResults.panelMap).length < 3) {
        console.warn('⚠️  Too many panel failures, falling back to One-Shot workflow');
        // Temporarily disable hybrid mode to force One-Shot
        const { setFeatureFlag } = await import('../config/featureFlags.js');
        const originalHybridFlag = isFeatureEnabled('hybridA1Mode');
        setFeatureFlag('hybridA1Mode', false);
        try {
          const result = await this.runA1SheetWorkflow(ctx);
          return result;
        } finally {
          // Restore original flag
          setFeatureFlag('hybridA1Mode', originalHybridFlag);
        }
      }
      
      // Check for rate limit errors
      const rateLimitErrors = panelResults.errors.filter(err => 
        err.error && (err.error.includes('429') || err.error.includes('rate limit') || err.error.includes('Rate limit'))
      );
      
      if (rateLimitErrors.length > 0 && Object.keys(panelResults.panelMap).length < 5) {
        console.warn('⚠️  Rate limit detected with insufficient panels, falling back to One-Shot workflow');
        const { setFeatureFlag } = await import('../config/featureFlags.js');
        const originalHybridFlag = isFeatureEnabled('hybridA1Mode');
        setFeatureFlag('hybridA1Mode', false);
        try {
          const result = await this.runA1SheetWorkflow(ctx);
          return result;
        } finally {
          setFeatureFlag('hybridA1Mode', originalHybridFlag);
        }
      }

      // ========================================
      // STEP 4: Composite Panels into A1 Sheet
      // ========================================
      console.log('\n🖼️  STEP 4: Compositing panels into A1 sheet...');

      // Convert panelMap to array format for compositor
      // Map panel keys to layout IDs expected by a1TemplateGenerator
      const { getLayoutIdForPanel } = await import('./panelOrchestrator.js');
      const panelsArray = Object.entries(panelResults.panelMap).map(([key, data]) => ({
        id: getLayoutIdForPanel(key), // Map to layout ID (e.g., 'plan_ground' -> 'ground-floor')
        originalKey: key, // Keep original key for reference
        url: data.url,
        seed: data.seed,
        meta: data.meta
      }));

      // Get layout from a1TemplateGenerator
      const { generateA1Template } = await import('./a1TemplateGenerator.js');
      const templateResult = generateA1Template({ 
        resolution: 'working', // Use working resolution (will be landscape for hybrid)
        format: 'json' // Get layout object
      });
      const layout = templateResult.layout; // Contains sheet, dimensions, panels

      // Composite all panels into final A1 sheet
      const compositedSheet = await compositeA1Sheet({
        panels: panelsArray,
        layout: layout,
        masterDNA,
        locationData,
        projectContext,
        format: 'canvas',  // Use canvas for high-quality compositing
        includeAnnotations: true,
        includeTitleBlock: true
      });

      console.log('✅ A1 sheet composited successfully');

      // ========================================
      // STEP 5: Validate Final Sheet
      // ========================================
      console.log('\n🔍 STEP 5: Validating composited A1 sheet...');

      const a1SheetValidation = a1SheetValidator.validateA1Sheet(
        {
          url: compositedSheet.url,
          panels: panelsArray,
          metadata: compositedSheet.metadata
        },
        masterDNA,
        blendedStyle
      );

      console.log(`   ✅ Validation complete: ${a1SheetValidation.score}% quality score`);
      console.log(`   📊 Status: ${a1SheetValidation.valid ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

      // ========================================
      // STEP 5: Generate Metadata
      // ========================================
      const metadata = generateA1SheetMetadata({
        masterDNA,
        location: locationData,
        portfolioBlendPercent
      });

      console.log('\n✅ ========================================');
      console.log('✅ HYBRID A1 SHEET WORKFLOW COMPLETE');
      console.log('✅ ========================================');
      console.log(`   🎨 ${Object.keys(panelResults.panelMap).length} panels generated and composited`);
      console.log(`   📏 Format: A1 landscape ISO 216 (841×594mm)`);
      console.log(`   🖼️  Resolution: ${compositedSheet.width}×${compositedSheet.height}px`);
      console.log(`   📊 Quality score: ${a1SheetValidation.score}%`);
      console.log(`   🎲 Base seed: ${baseSeed}`);
      console.log(`   ⏱️  Total generation time: ~2-3 minutes`);

      // Return in format compatible with existing UI
      return {
        success: true,
        workflow: 'hybrid-a1-sheet',
        masterDNA,
        blendedStyle,
        validation,
        a1Sheet: {
          url: compositedSheet.url,
          panels: panelResults.panelMap,  // Include individual panels with seeds
          seed: baseSeed,
          seedMap: panelResults.seedMap,  // Include seed map for consistency
          prompt: null, // No single prompt for hybrid mode
          negativePrompt: null,
          metadata: {
            ...compositedSheet.metadata,
            panelCount: Object.keys(panelResults.panelMap).length,
            failedPanels: panelResults.errors.length,
            panelMap: panelResults.panelMap,
            workflow: 'hybrid'
          },
          format: metadata,
          qualityScore: a1SheetValidation.score,
          validationReport: a1SheetValidator.generateReport(a1SheetValidation)
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
          panelsFailed: panelResults.errors.length
        }
      };

    } catch (error) {
      console.error('\n❌ Hybrid A1 Sheet Workflow failed:', error);
      return {
        success: false,
        workflow: 'hybrid-a1-sheet',
        error: error.message,
        message: 'Failed to generate hybrid A1 sheet'
      };
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
      materials = 'brick, glass, concrete'
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
    let prompt = `Generate architectural ${viewType.replace('_', ' ')} view.

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
        confidence: 'high'
      };
    } else if (score >= 0.80) {
      return {
        action: 'accept_with_review',
        message: 'Good consistency. Minor review recommended.',
        confidence: 'medium'
      };
    } else if (score >= 0.70) {
      return {
        action: 'review_required',
        message: 'Acceptable consistency but review required. Consider regenerating with stronger constraints.',
        confidence: 'low'
      };
    } else {
      return {
        action: 'regenerate',
        message: 'Poor consistency detected. Regeneration strongly recommended.',
        confidence: 'very_low'
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
        excellent: history.filter(h => h.score >= 0.85).length,
        good: history.filter(h => h.score >= 0.80 && h.score < 0.85).length,
        acceptable: history.filter(h => h.score >= 0.70 && h.score < 0.80).length,
        poor: history.filter(h => h.score < 0.70).length
      },
      viewsGenerated: Object.keys(workflow.pipeline.filter(p => p.status === 'completed')).length,
      completionPercentage: workflow.completionPercentage
    };

    return report;
  }
}

// Export singleton instance
const dnaWorkflowOrchestrator = new DNAWorkflowOrchestrator();
export default dnaWorkflowOrchestrator;
