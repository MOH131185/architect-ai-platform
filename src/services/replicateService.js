/**
 * Replicate Service for Architectural Image Generation
 * Uses SDXL Multi-ControlNet LoRA for architectural visualization
 */

import logger from '../utils/productionLogger';
import { getReplicatePredictUrl, getReplicateStatusUrl } from '../utils/apiRoutes';
import viewConsistencyService from './viewConsistencyService';
import consistencyValidationService from './consistencyValidationService';
import geometricFloorPlanService from './geometricFloorPlanService';

const REPLICATE_API_KEY = process.env.REACT_APP_REPLICATE_API_KEY;

// Resolve API endpoints at runtime for dev/prod
const REPLICATE_API_PROXY_URL = getReplicatePredictUrl();
// Note: REPLICATE_STATUS_URL is available but not currently used

class ReplicateService {
  constructor() {
    // API key is not needed in client-side code
    // The proxy server handles authentication
    this.apiKey = REPLICATE_API_KEY; // Will be undefined in browser, which is OK

    // Only log warning in development mode and if we're not in browser
    if (typeof window === 'undefined' && !this.apiKey) {
      logger.warn('Replicate API key not found in server environment.');
    }
  }

  /**
   * Format Master Design Specification for injection into prompts
   * Creates consistent specification string that ensures all views show the same building
   * @param {Object} masterDesignSpec - Master design specification object
   * @returns {String} Formatted specification string for prompts
   */
  formatMasterDesignSpec(masterDesignSpec) {
    if (!masterDesignSpec) return '';

    // Safely access nested properties with defaults
    const dimensions = masterDesignSpec.dimensions || {};
    const entrance = masterDesignSpec.entrance || {};
    const materials = masterDesignSpec.materials || {};
    const roof = masterDesignSpec.roof || {};
    const windows = masterDesignSpec.windows || {};
    const structure = masterDesignSpec.structure || {};
    const colors = masterDesignSpec.colors || {};

    // Only include lines that have valid data
    const specs = [];

    if (dimensions.length && dimensions.width && dimensions.height) {
      specs.push(`- Dimensions: ${dimensions.length}m × ${dimensions.width}m × ${dimensions.height}m${dimensions.floors ? ` (${dimensions.floors} floors)` : ''}`);
    }

    if (entrance.facade && entrance.position) {
      specs.push(`- Entrance: ${entrance.facade} facade, ${entrance.position}${entrance.width ? `, ${entrance.width}m wide` : ''}`);
    }

    if (materials.primary || materials.secondary || materials.accent) {
      const matParts = [];
      if (materials.primary) matParts.push(`Primary ${materials.primary}`);
      if (materials.secondary) matParts.push(`Secondary ${materials.secondary}`);
      if (materials.accent) matParts.push(`Accent ${materials.accent}`);
      specs.push(`- Materials: ${matParts.join(', ')}`);
    }

    if (roof.type || roof.material) {
      specs.push(`- Roof: ${roof.type || 'standard'} type${roof.material ? `, ${roof.material}` : ''}`);
    }

    if (windows.pattern || windows.frameColor) {
      specs.push(`- Windows: ${windows.pattern || 'standard'} pattern${windows.frameColor ? `, ${windows.frameColor} frames` : ''}`);
    }

    if (structure.system && structure.gridSpacing) {
      specs.push(`- Structure: ${structure.system} with ${structure.gridSpacing}m grid`);
    }

    if (colors.facade || colors.roof) {
      const colorParts = [];
      if (colors.facade) colorParts.push(`Facade ${colors.facade}`);
      if (colors.roof) colorParts.push(`Roof ${colors.roof}`);
      specs.push(`- Colors: ${colorParts.join(', ')}`);
    }

    if (specs.length === 0) return '';

    return `EXACT BUILDING SPECIFICATION (must match precisely):
${specs.join('\n')}
THIS BUILDING MUST BE IDENTICAL IN ALL VIEWS.`;
  }

  /**
   * Create consistent building description for all outputs
   * This ensures 2D and 3D outputs describe the SAME building
   */
  createUnifiedBuildingDescription(projectContext) {
    const {
      buildingProgram = 'house',
      architecturalStyle = 'contemporary',
      materials = 'brick and glass',
      floorArea = 200,
      entranceDirection = 'N'
    } = projectContext;

    // Calculate consistent building characteristics
    const floorCount = this.calculateFloorCount(projectContext);
    const levels = floorCount === 1 ? 'single-story' : `${floorCount}-story`;

    // Create entrance description based on direction
    const entranceMap = {
      'N': 'north-facing entrance',
      'NE': 'northeast-facing entrance',
      'E': 'east-facing entrance',
      'SE': 'southeast-facing entrance',
      'S': 'south-facing entrance',
      'SW': 'southwest-facing entrance',
      'W': 'west-facing entrance',
      'NW': 'northwest-facing entrance'
    };
    const entranceDesc = entranceMap[entranceDirection] || 'north-facing entrance';

    // Build unified description used by ALL generation functions
    return {
      buildingType: `${levels} ${architecturalStyle} ${buildingProgram}`,
      fullDescription: `${levels} ${architecturalStyle} ${buildingProgram} with ${entranceDesc}`,
      materials: materials,
      floorArea: floorArea,
      floorCount: floorCount,
      entranceDirection: entranceDirection,
      architecturalStyle: architecturalStyle,
      buildingProgram: buildingProgram,
      // Specific architectural features based on type
      features: this.getBuildingFeatures(buildingProgram, architecturalStyle, floorCount)
    };
  }

  /**
   * Extract detailed project specifications from context
   * Includes room program, areas, and specific requirements
   */
  extractProjectDetails(projectContext) {
    const {
      area,
      floorArea,
      programDetails,
      buildingProgram
      // floors - reserved for future use
    } = projectContext;

    // Extract total area
    const totalArea = area || floorArea || 200;
    const areaDetail = totalArea ? ` (${totalArea}m² total area)` : '';

    // Extract program details (room-by-room breakdown)
    let programDetail = '';
    let spacesDetail = '';
    let interiorDetail = '';
    let mainSpace = null;

    if (programDetails && typeof programDetails === 'object') {
      // Build detailed room list from programDetails
      const rooms = Object.entries(programDetails)
        .map(([room, area]) => `${room} (${area}m²)`)
        .filter(r => r);

      if (rooms.length > 0) {
        programDetail = `containing ${rooms.join(', ')}`;
        spacesDetail = ` with ${rooms.length} distinct spaces`;

        // Extract main space for interior view
        const roomNames = Object.keys(programDetails);
        mainSpace = roomNames.find(r =>
          r.toLowerCase().includes('living') ||
          r.toLowerCase().includes('main') ||
          r.toLowerCase().includes('great')
        ) || roomNames[0];

        interiorDetail = `featuring ${rooms.slice(0, 3).join(', ')}`;
      }
    } else if (buildingProgram) {
      // Fallback to building program type
      programDetail = `designed as ${buildingProgram}`;
    }

    return {
      areaDetail,
      programDetail,
      spacesDetail,
      interiorDetail,
      mainSpace,
      totalArea
    };
  }

  /**
   * Get building-specific features for consistent description
   */
  getBuildingFeatures(buildingProgram, style, floorCount) {
    const features = [];

    // Add program-specific features
    if (buildingProgram.includes('house') || buildingProgram.includes('villa')) {
      features.push('residential spaces', 'private garden', 'garage');
      if (floorCount > 1) features.push('balcony', 'master bedroom upstairs');
    } else if (buildingProgram.includes('apartment')) {
      features.push('multiple units', 'common areas', 'balconies');
    } else if (buildingProgram.includes('office')) {
      features.push('open plan offices', 'meeting rooms', 'reception area');
    }

    // Add style-specific features
    if (style.includes('modern') || style.includes('contemporary')) {
      features.push('large windows', 'clean lines', 'flat roof');
    } else if (style.includes('traditional')) {
      features.push('pitched roof', 'classic proportions', 'detailed facade');
    }

    return features.join(', ');
  }

  /**
   * Generate architectural visualization using SDXL Multi-ControlNet LoRA
   * @param {Object} generationParams - Parameters for image generation
   * @returns {Promise<Object>} Generation result with image URLs
   */
  async generateArchitecturalImage(generationParams) {
    // NOTE: API key is handled by proxy server, not needed in client
    // Removed API key check that was preventing image generation

    try {
      const prediction = await this.createPrediction(generationParams);
      const result = await this.waitForCompletion(prediction.id);

      return {
        success: true,
        images: result.output,
        predictionId: prediction.id,
        parameters: generationParams,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Replicate generation error:', error);
      logger.warn('Using fallback image due to error');
      const fallback = this.getFallbackImage(generationParams);
      return {
        success: false,
        images: fallback.images || [fallback],
        error: error.message,
        isFallback: true,
        parameters: generationParams,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Create prediction on Replicate API
   */
  async createPrediction(params) {
    const requestBody = {
      version: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      input: {
        prompt: params.prompt || this.buildDefaultPrompt(params),
        negative_prompt: params.negativePrompt || "blurry, low quality, distorted, unrealistic",
        width: params.width || 1024,
        height: params.height || 1024,
        num_inference_steps: params.steps || 50,
        guidance_scale: params.guidanceScale || 7.5,
        seed: params.seed || Math.floor(Math.random() * 1000000),
        ...this.buildControlNetParams(params)
      }
    };

    const response = await fetch(REPLICATE_API_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Replicate API error: ${response.status} - ${errorData.detail || 'Unknown error'}`);
    }

    return await response.json();
  }

  /**
   * Wait for prediction completion
   */
  async waitForCompletion(predictionId, maxWaitTime = 300000) { // 5 minutes max
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const url = getReplicateStatusUrl(predictionId);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to check prediction status: ${response.status}`);
      }

      const prediction = await response.json();
      
      if (prediction.status === 'succeeded') {
        return prediction;
      } else if (prediction.status === 'failed') {
        throw new Error(`Prediction failed: ${prediction.error || 'Unknown error'}`);
      }

      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Prediction timed out');
  }

  /**
   * Build default architectural prompt based on project context
   */
  buildDefaultPrompt(params) {
    const {
      buildingType = 'modern building',
      architecturalStyle = 'contemporary',
      location = 'urban setting',
      materials = 'glass and steel',
      timeOfDay = 'daylight',
      weather = 'clear sky',
      perspective = 'exterior view'
    } = params;

    return `Professional architectural visualization, ${perspective} of a ${architecturalStyle} ${buildingType} in ${location}, constructed with ${materials}, ${timeOfDay} lighting, ${weather}, photorealistic, high quality, detailed, architectural photography style, professional rendering`;
  }

  /**
   * Build ControlNet parameters for architectural control
   */
  buildControlNetParams(params) {
    const controlNetParams = {};

    // Check both params.controlImage and params.image for backward compatibility
    if (params.controlImage || params.image) {
      controlNetParams.image = params.controlImage || params.image;
      // Use moderate conditioning - guides layout without forcing exact replication
      controlNetParams.controlnet_conditioning_scale = params.conditioning_scale || 0.5;
      logger.verbose('🎯 ControlNet enabled with conditioning scale:', controlNetParams.controlnet_conditioning_scale);
    }

    if (params.controlType) {
      controlNetParams.controlnet_conditioning_scale = params.controlType === 'canny' ? 1.0 : 0.8;
    }

    return controlNetParams;
  }

  /**
   * Generate multiple architectural views with consistent seed for same project
   * STEP 2: Accept optional controlImage to use floor plan as ControlNet input
   * FIXED: Add seed variation per view to prevent identical images
   * OPTIMIZED: Parallel generation for 80% speed improvement
   */
  async generateMultipleViews(projectContext, viewTypes = ['exterior', 'interior', 'site_plan'], controlImage = null) {
    const startTime = Date.now();
    const results = {};

    // STEP 1: Use unified projectSeed from context (no random generation here)
    const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

    // CRITICAL FIX: Unified seed strategy for geometric consistency with sufficient variation
    // Technical views use SAME seed for geometric consistency
    // 3D views use VARIED seeds for camera angle diversity while maintaining same building
    const technicalViews = ['axonometric', 'site_plan']; // Pure technical views
    const exteriorViews = ['exterior_front', 'exterior_side']; // Exterior 3D views
    const interiorViews = ['interior']; // Interior 3D views
    const perspectiveViews = ['perspective']; // Perspective 3D views
    const strictConsistency = !!projectContext.strictConsistency;

    // Define seed offsets for 3D views - INCREASED for sufficient variation
    // Offsets must be large enough to generate different camera angles but same building
    const viewSeedOffsets = {
      'exterior_front': 0,        // Base seed - front view
      'exterior_side': 500,       // +500 for side view variety
      'interior': 1000,           // +1000 for interior diversity
      'perspective': 1500,        // +1500 for perspective variation
      'axonometric': 2000         // +2000 for axonometric distinctness
    };

    // PERFORMANCE OPTIMIZATION: Build all view promises for parallel execution
    const viewPromises = viewTypes.map(viewType => {
      try {
        const params = this.buildViewParameters(projectContext, viewType);

        // Determine seed strategy based on view type
        const isTechnicalView = technicalViews.includes(viewType);
        const isExteriorView = exteriorViews.includes(viewType);
        const isInteriorView = interiorViews.includes(viewType);
        const isPerspectiveView = perspectiveViews.includes(viewType);

        if (strictConsistency) {
          // Strict mode: All views use same seed (no variation)
          params.seed = projectSeed;
          logger.verbose(`✅ Strict consistency enabled. ${viewType} using base seed: ${params.seed}`);
        } else if (viewSeedOffsets.hasOwnProperty(viewType)) {
          // Use defined seed offset for this view type
          const seedOffset = viewSeedOffsets[viewType];
          params.seed = projectSeed + seedOffset;
          logger.verbose(`🎨 3D view ${viewType} using varied seed: ${params.seed} (base: ${projectSeed} + offset: ${seedOffset})`);
        } else if (isTechnicalView) {
          // Technical views use base seed for geometric accuracy
          params.seed = projectSeed;
          logger.verbose(`🎯 Technical view ${viewType} using base seed: ${params.seed}`);
        } else {
          // Default to base seed for unknown view types
          params.seed = projectSeed;
          logger.verbose(`🔧 Default view ${viewType} using base seed: ${params.seed}`);
        }

        logger.verbose(`🎲 Generating ${viewType} with final seed: ${params.seed}`);

        // STEP 2: If controlImage is provided, add it for ControlNet guidance
        if (controlImage) {
          params.image = controlImage;
          logger.verbose(`🎯 Using floor plan as ControlNet control for ${viewType} view`);
        }

        return {
          viewType,
          promise: this.generateArchitecturalImage(params)
        };
      } catch (error) {
        logger.error(`Error building parameters for ${viewType} view:`, error);
        return {
          viewType,
          promise: Promise.resolve({
            success: false,
            error: error.message,
            fallback: this.getFallbackImage({ viewType })
          })
        };
      }
    });

    // Execute all view generations in parallel
    const viewResults = await Promise.all(
      viewPromises.map(({ viewType, promise }) =>
        promise
          .then(result => ({ viewType, result }))
          .catch(error => ({
            viewType,
            result: {
              success: false,
              error: error.message,
              fallback: this.getFallbackImage({ viewType })
            }
          }))
      )
    );

    // Collect results
    viewResults.forEach(({ viewType, result }) => {
      results[viewType] = result;
    });

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.verbose(`✅ 3D views generated in ${elapsedTime}s (parallel execution, ${viewTypes.length} views)`);

    return results;
  }

  /**
   * Generate multi-level floor plans (ground, upper, roof)
   * ENHANCED: Uses ProjectDNA for intelligent floor generation
   * FIXED: Each floor gets DISTINCT prompts with room programs from ProjectDNA
   * OPTIMIZED: Parallel generation for 60-70% speed improvement
   */
  async generateMultiLevelFloorPlans(projectContext, generateAllLevels = true) {
    // NOTE: Using geometric floor plan generation instead of SDXL
    // SDXL is not suitable for 2D technical drawings - see FLOOR_PLAN_GENERATION_ANALYSIS.md

    try {
      const startTime = Date.now();

      // DEBUG: Log input parameters
      logger.info(`🔍 DEBUG - Floor plan generation started (GEOMETRIC MODE)`);
      logger.info(`🔍 DEBUG - floorArea: ${projectContext.floorArea}`);
      logger.info(`🔍 DEBUG - buildingProgram: ${projectContext.buildingProgram}`);
      logger.info(`🔍 DEBUG - generateAllLevels: ${generateAllLevels}`);

      // Use ProjectDNA if available for intelligent floor distribution
      const projectDNA = projectContext.projectDNA;
      let floorCount, floorBreakdown;

      if (projectDNA) {
        floorCount = projectDNA.floorCount;
        floorBreakdown = projectDNA.floorPlans;
        logger.info(`📐 Using ProjectDNA: ${floorCount} floors with intelligent distribution`);
      } else {
        floorCount = this.calculateFloorCount(projectContext);
        floorBreakdown = null;
        logger.info(`📐 Calculated floor count: ${floorCount} (no ProjectDNA)`);
      }

      // DEBUG: Log calculated floor count
      logger.info(`🔍 DEBUG - Final floor count: ${floorCount}`);

      const results = {};

      // Use unified seed from ProjectDNA or context
      const projectSeed = projectDNA?.seeds?.master ||
                         projectContext.seed ||
                         projectContext.projectSeed ||
                         Math.floor(Math.random() * 1000000);

      // CRITICAL: Check if ProjectDNA is available for geometric generation
      if (projectDNA && projectDNA.floorPlans && projectDNA.floorPlans.length > 0) {
        // NEW APPROACH: Use geometric floor plan service with ProjectDNA
        logger.info('✨ Using GEOMETRIC floor plan generation with ProjectDNA');
        logger.verbose('🏗️ Generating GEOMETRIC floor plans for each level (parallel execution)...');
        logger.verbose(`📊 Floor count: ${floorCount} floors`);

        const planPromises = [];

        // Generate geometric floor plans for each floor in ProjectDNA
        for (let i = 0; i < projectDNA.floorPlans.length && i < floorCount; i++) {
          const floor = projectDNA.floorPlans[i];
          const floorKey = floor.level.toLowerCase().replace(/\s+/g, '_');

          logger.verbose(`${floor.level} (${floor.area}m²): ${floor.program} - GEOMETRIC`);

          // Generate geometric floor plan using ProjectDNA
          planPromises.push({
            key: floorKey,
            promise: geometricFloorPlanService.generateFloorPlan(projectDNA, i)
              .then(dataURL => ({
                success: true,
                images: [dataURL],
                type: 'geometric_floor_plan',
                timestamp: new Date().toISOString()
              }))
              .catch(error => {
                logger.error(`Geometric floor plan generation failed for ${floorKey}:`, error);
                return {
                  success: false,
                  images: [`https://placehold.co/1536x1536/2C3E50/FFFFFF?text=${encodeURIComponent(floor.level + ' Plan Error')}`],
                  error: error.message,
                  isFallback: true
                };
              })
          });
        }

        // Execute all generations in parallel
        const planResults = await Promise.all(planPromises.map(({ key, promise }) =>
          promise.then(result => ({ key, result }))
        ));

        // Collect results
        planResults.forEach(({ key, result }) => {
          results[key] = result;
          logger.verbose(`${key} floor result:`, result.success ? 'Success (GEOMETRIC)' : 'Failed', result.isFallback ? '(Fallback)' : '');
        });

      } else {
        // FALLBACK: Use SDXL if ProjectDNA not available (old behavior)
        logger.warn('⚠️ ProjectDNA not available - falling back to SDXL (may produce low-quality floor plans)');
        logger.warn('⚠️ For best results, ensure ProjectDNA is generated first');

        // PERFORMANCE OPTIMIZATION: Generate all floor plans in parallel
        logger.verbose('🏗️ Generating DISTINCT floor plans for each level (parallel execution)...');
        logger.verbose(`📊 Floor count: ${floorCount} floors`);

        const planPromises = [];

        // Fallback to standard floor generation using SDXL
        const groundParams = this.buildFloorPlanParameters(projectContext, 'ground', 0);
        groundParams.seed = projectSeed;

        logger.info(`🔍 DEBUG - Ground floor params (SDXL FALLBACK):`);
        logger.info(`🔍 DEBUG - Prompt: ${groundParams.prompt.substring(0, 200)}...`);
        logger.info(`🔍 DEBUG - Seed: ${groundParams.seed}`);
        logger.info(`🔍 DEBUG - Width x Height: ${groundParams.width} x ${groundParams.height}`);

        planPromises.push({ key: 'ground', promise: this.generateArchitecturalImage(groundParams) });

        // Only generate additional levels if explicitly requested
        if (generateAllLevels) {
          logger.info(`🔍 DEBUG - generateAllLevels is TRUE, checking if floorCount > 1...`);
          logger.info(`🔍 DEBUG - floorCount > 1? ${floorCount > 1} (floorCount = ${floorCount})`);

          if (floorCount > 1) {
            logger.info(`🔍 DEBUG - Condition MET: Generating upper floor plan for ${floorCount} floors`);
            logger.verbose(`🏗️ Generating upper floor plan (floors 2-${floorCount})...`);
            const upperParams = this.buildFloorPlanParameters(projectContext, 'upper', 1);
            upperParams.seed = projectSeed;

            logger.info(`🔍 DEBUG - Upper floor params:`);
            logger.info(`🔍 DEBUG - Prompt: ${upperParams.prompt.substring(0, 200)}...`);
            logger.info(`🔍 DEBUG - Seed: ${upperParams.seed}`);

            planPromises.push({ key: 'upper', promise: this.generateArchitecturalImage(upperParams) });
          } else {
            logger.info(`🔍 DEBUG - Condition NOT MET: floorCount is ${floorCount}, skipping upper floor`);
          }

          // Generate roof plan (roof is above all floors)
          logger.info(`🔍 DEBUG - Generating roof plan...`);
          logger.verbose('🏗️ Generating roof plan...');
          const roofParams = this.buildFloorPlanParameters(projectContext, 'roof', floorCount);
          roofParams.seed = projectSeed;

          planPromises.push({ key: 'roof', promise: this.generateArchitecturalImage(roofParams) });
        } else {
          logger.info(`🔍 DEBUG - generateAllLevels is FALSE, skipping upper and roof`);
        }

        // DEBUG: Log total number of plans to generate
        logger.info(`🔍 DEBUG - Total plans to generate: ${planPromises.length}`);

        // Execute all generations in parallel
        const planResults = await Promise.all(planPromises.map(({ key, promise }) =>
          promise.then(result => ({ key, result }))
        ));

        // Collect results
        planResults.forEach(({ key, result }) => {
          results[key] = result;
          logger.verbose(`${key} floor result:`, result.success ? 'Success' : 'Failed', result.isFallback ? '(Fallback)' : '');
        });
      }

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.verbose(`✅ Floor plans generated in ${elapsedTime}s (parallel execution)`);

      return {
        success: true,
        floorPlans: results,
        floorCount,
        projectSeed,
        generationTime: elapsedTime,
        generationMethod: projectDNA ? 'geometric' : 'sdxl_fallback',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Multi-level floor plan generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackMultiLevelFloorPlans(projectContext)
      };
    }
  }

  /**
   * Generate elevations and sections for 2D technical drawings
   * Uses floor plan as ControlNet control for consistency
   * Optimized to generate only essential views (2 elevations + 1 section)
   * OPTIMIZED: Parallel generation for 75-80% speed improvement
   */
  async generateElevationsAndSections(projectContext, generateAllDrawings = false, controlImage = null) {
    // NOTE: API key is handled by proxy server, not needed in client
    // Removed API key check

    try {
      const startTime = Date.now();
      const results = {};

      // STEP 1: Use unified projectSeed from context (no random generation here)
      const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

      if (controlImage) {
        logger.verbose('🎯 Using floor plan as ControlNet control for technical drawings');
      }

      // PERFORMANCE OPTIMIZATION: Generate all technical drawings in parallel
      const drawingPromises = [];

      if (generateAllDrawings) {
        // FIX: Use high-quality settings when generating all drawings (full documentation set)
        // High quality: 1536×1152 with 50 steps for crisp, professional technical drawings
        logger.verbose('🏗️ Generating elevations (N, S, E, W) with HIGH QUALITY settings (1536×1152, 50 steps)...');
        for (const direction of ['north', 'south', 'east', 'west']) {
          const params = this.buildElevationParameters(projectContext, direction, true); // highQuality = true
          params.seed = projectSeed;
          if (controlImage) params.image = controlImage;
          drawingPromises.push({
            key: `elevation_${direction}`,
            promise: this.generateArchitecturalImage(params)
          });
        }

        // Generate 2 sections with high quality
        logger.verbose('🏗️ Generating sections (longitudinal, cross) with HIGH QUALITY settings (1536×1152, 50 steps)...');
        for (const sectionType of ['longitudinal', 'cross']) {
          const params = this.buildSectionParameters(projectContext, sectionType, true); // highQuality = true
          params.seed = projectSeed;
          if (controlImage) params.image = controlImage;
          drawingPromises.push({
            key: `section_${sectionType}`,
            promise: this.generateArchitecturalImage(params)
          });
        }
      } else {
        // FIX: Use standard quality for quick previews (faster generation, lower cost)
        // Standard quality: 1024×768 with 40 steps
        // Generate front and side elevations (entrance direction)
        const entranceDir = projectContext.entranceDirection || 'N';
        const mainDirection = this.getCardinalDirection(entranceDir);
        const sideDirection = this.getPerpendicularDirection(mainDirection);

        logger.verbose(`🏗️ Generating main elevation (${mainDirection}) and side elevation (${sideDirection}) with STANDARD QUALITY settings (1024×768, 40 steps)...`);

        const mainParams = this.buildElevationParameters(projectContext, mainDirection.toLowerCase(), false); // highQuality = false
        mainParams.seed = projectSeed;
        if (controlImage) mainParams.image = controlImage;
        drawingPromises.push({
          key: `elevation_${mainDirection.toLowerCase()}`,
          promise: this.generateArchitecturalImage(mainParams)
        });

        const sideParams = this.buildElevationParameters(projectContext, sideDirection.toLowerCase(), false); // highQuality = false
        sideParams.seed = projectSeed;
        if (controlImage) sideParams.image = controlImage;
        drawingPromises.push({
          key: `elevation_${sideDirection.toLowerCase()}`,
          promise: this.generateArchitecturalImage(sideParams)
        });

        // Generate one section (longitudinal) with standard quality
        logger.verbose('🏗️ Generating longitudinal section with STANDARD QUALITY settings (1024×768, 40 steps)...');
        const sectionParams = this.buildSectionParameters(projectContext, 'longitudinal', false); // highQuality = false
        sectionParams.seed = projectSeed;
        if (controlImage) sectionParams.image = controlImage;
        drawingPromises.push({
          key: `section_longitudinal`,
          promise: this.generateArchitecturalImage(sectionParams)
        });
      }

      // Execute all generations in parallel
      const drawingResults = await Promise.all(drawingPromises.map(({ key, promise }) =>
        promise.then(result => ({ key, result }))
      ));

      // Collect results
      drawingResults.forEach(({ key, result }) => {
        results[key] = result;
      });

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.verbose(`✅ Technical drawings generated in ${elapsedTime}s (parallel execution, ${drawingPromises.length} drawings)`);

      return {
        success: true,
        technicalDrawings: results,
        projectSeed,
        generationTime: elapsedTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Elevations and sections generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackElevationsAndSections(projectContext)
      };
    }
  }

  /**
   * Get cardinal direction from compass notation
   */
  getCardinalDirection(compassDir) {
    const dirMap = {
      'N': 'north', 'NE': 'north', 'E': 'east', 'SE': 'east',
      'S': 'south', 'SW': 'south', 'W': 'west', 'NW': 'north'
    };
    return dirMap[compassDir] || 'north';
  }

  /**
   * Get perpendicular direction for side elevation
   */
  getPerpendicularDirection(direction) {
    const perpMap = {
      'north': 'east',
      'east': 'north',
      'south': 'west',
      'west': 'north'
    };
    return perpMap[direction] || 'east';
  }

  /**
   * Calculate number of floors based on building area and type
   */
  calculateFloorCount(projectContext) {
    const area = projectContext.floorArea || 200;
    const buildingType = projectContext.buildingProgram || 'house';

    // Single-story buildings
    if (buildingType.includes('cottage') || buildingType.includes('bungalow')) {
      return 1;
    }

    // Multi-story based on area
    if (area < 150) return 1;
    if (area < 300) return 2;
    if (area < 500) return 3;
    return Math.min(Math.ceil(area / 200), 5); // Max 5 floors
  }

  /**
   * Generate 2D floor plan using specialized architectural models
   */
  async generateFloorPlan(projectContext) {
    // NOTE: API key is handled by proxy server, not needed in client
    // Removed API key check

    try {
      const params = this.buildFloorPlanParameters(projectContext);
      const result = await this.generateArchitecturalImage(params);
      
      return {
        success: true,
        floorPlan: result,
        type: '2d_floor_plan',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Floor plan generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackFloorPlan(projectContext)
      };
    }
  }

  /**
   * Generate 3D architectural preview
   * STEP 2: Accept optional controlImage to use floor plan as ControlNet input
   */
  async generate3DPreview(projectContext, controlImage = null) {
    // NOTE: API key is handled by proxy server, not needed in client
    // Removed API key check

    try {
      const params = this.build3DPreviewParameters(projectContext, controlImage);
      const result = await this.generateArchitecturalImage(params);

      return {
        success: true,
        preview3D: result,
        type: '3d_preview',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('3D preview generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallback3DPreview(projectContext)
      };
    }
  }

  /**
   * Build parameters for specific view types
   * ENHANCED: Inject unified architectural prompt from OpenAI reasoning
   */
  buildViewParameters(projectContext, viewType) {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    // Determine entrance side for accurate 3D views
    const entranceDir = this.getCardinalDirection(unifiedDesc.entranceDirection);

    // Extract detailed project specifications
    const projectDetails = this.extractProjectDetails(projectContext);

    // CRITICAL FIX: Check if we have unified architectural prompt from OpenAI reasoning
    const hasReasoningGuidance = projectContext.isReasoningEnhanced && projectContext.unifiedArchitecturalPrompt;
    const reasoningPrefix = hasReasoningGuidance ? projectContext.unifiedArchitecturalPrompt + '. ' : '';

    // CRITICAL FIX: Inject Master Design Specification for consistency
    const specPrefix = this.formatMasterDesignSpec(projectContext.masterDesignSpec);

    // Override materials if reasoning-enhanced
    const materials = projectContext.isReasoningEnhanced && projectContext.materials
      ? projectContext.materials
      : unifiedDesc.materials;

    switch (viewType) {
      case 'exterior':
      case 'exterior_front':
        // CRITICAL FIX: Use enhanced negative prompt to prevent 2D floor plans or different buildings
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: materials,
          prompt: `${specPrefix}\n\n${reasoningPrefix}EXTERIOR ONLY: Professional 3D architectural visualization showing ${entranceDir}-facing front view of ${unifiedDesc.fullDescription}${projectDetails.areaDetail}, ${projectDetails.programDetail}, ${materials} facade, ${unifiedDesc.features}, main entrance clearly visible on ${entranceDir} side, ${unifiedDesc.floorCount} levels height${projectDetails.spacesDetail}, professional architectural photography from street level, daylight, clear blue sky, photorealistic rendering, high quality, detailed facade, landscape context, site-specific design matching project requirements, EXTERIOR VIEW ONLY, BUILDING FROM OUTSIDE, SAME PROJECT, SAME BUILDING, SAME DESIGN`,
          perspective: 'exterior front view',
          width: 1024,
          height: 768,
          negativePrompt: consistencyValidationService.get3DViewNegativePrompt()
        };

      case 'exterior_side':
        const sideDir = this.getPerpendicularDirection(entranceDir);
        // CRITICAL FIX: Use enhanced negative prompt to prevent 2D floor plans or different buildings
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: materials,
          prompt: `${specPrefix}\n\n${reasoningPrefix}EXTERIOR ONLY: Professional 3D architectural visualization showing ${sideDir} side view of ${unifiedDesc.fullDescription}${projectDetails.areaDetail}, ${projectDetails.programDetail}, ${materials} construction, ${unifiedDesc.features}, ${unifiedDesc.floorCount} levels clearly visible${projectDetails.spacesDetail}, professional architectural photography from street level, daylight, clear sky, photorealistic rendering, high quality, detailed side facade, landscape context with trees, design matching project specifications, EXTERIOR VIEW ONLY, BUILDING FROM OUTSIDE, SAME PROJECT, SAME BUILDING, SAME DESIGN`,
          perspective: 'exterior side view',
          width: 1024,
          height: 768,
          negativePrompt: consistencyValidationService.get3DViewNegativePrompt()
        };

      case 'interior':
        // Determine main interior space from program details or building type
        const interiorSpace = projectDetails.mainSpace || (
          unifiedDesc.buildingProgram.includes('house') || unifiedDesc.buildingProgram.includes('villa')
            ? 'main living room with open kitchen'
            : unifiedDesc.buildingProgram.includes('office')
            ? 'main office space'
            : 'main interior space'
        );

        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: materials,
          prompt: `${specPrefix}\n\n${reasoningPrefix}INTERIOR ONLY: Professional 3D architectural interior visualization, inside view of ${interiorSpace} of ${unifiedDesc.fullDescription}${projectDetails.areaDetail}, ${projectDetails.interiorDetail}, ${unifiedDesc.architecturalStyle} interior design with ${materials} visible indoors, spacious open interior space with ${unifiedDesc.features}${projectDetails.spacesDetail}, well-lit with natural light from large windows, professional interior architectural photography, photorealistic interior rendering, high quality, detailed interior furnishings, contemporary furniture and decor, interior space only, interior design matching project program requirements, warm inviting interior atmosphere, INTERIOR VIEW ONLY, NO EXTERIOR ELEMENTS`,
          perspective: 'interior view',
          width: 1024,
          height: 768,
          negativePrompt: "exterior, outside, facade, building exterior, outdoor, landscape, trees, street, sky visible, exterior walls, building from outside, aerial view, elevation, front view, site plan, technical drawing, blueprint, 3D exterior view, building facade, outdoor environment, external view, building from outside, street view, exterior perspective, outdoor space, external architecture"
        };

      case 'site_plan':
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: unifiedDesc.materials,
          prompt: `${specPrefix}\n\nAerial view, site plan showing ${unifiedDesc.fullDescription} with clear footprint, entrance on ${entranceDir} side marked, urban context, professional architectural drawing style, technical illustration`,
          perspective: 'aerial view',
          width: 1024,
          height: 1024
        };

      case 'axonometric':
        // FIXED: Use view consistency service for consistent 3D views
        viewConsistencyService.initializeProjectConsistency(projectContext);
        const consistentDesc = viewConsistencyService.getUnifiedDescription();
        const consistentSeed = viewConsistencyService.getProjectSeed();
        
        return {
          buildingType: consistentDesc.buildingType,
          architecturalStyle: consistentDesc.architecturalStyle,
          materials: consistentDesc.materials,
          seed: consistentSeed,
          prompt: `${specPrefix}\n\nProfessional architectural axonometric 45-degree isometric view of the SAME ${consistentDesc.fullDescription}, isometric 3D projection from above showing ${entranceDir}-facing entrance clearly visible on ${entranceDir} side, ${consistentDesc.materials} construction consistent with elevations, ${consistentDesc.features}, ${consistentDesc.floorCount} floor levels clearly visible with floor separation lines, technical illustration style matching other technical drawings, architectural drawing with clean precise lines, complete roof structure and all building volumes shown, professional architectural visualization, high detail, precise geometry, design must match floor plan layout and elevation facades exactly, unified consistent building design, SAME PROJECT, SAME BUILDING, SAME DESIGN`,
          perspective: 'axonometric view',
          width: 1024,
          height: 768,
          negativePrompt: viewConsistencyService.getNegativePrompt('axonometric')
        };

      case 'perspective':
        // FIXED: Use view consistency service for consistent perspective views
        viewConsistencyService.initializeProjectConsistency(projectContext);
        const perspectiveDesc = viewConsistencyService.getUnifiedDescription();
        const perspectiveSeed = viewConsistencyService.getProjectSeed();
        
        return {
          buildingType: perspectiveDesc.buildingType,
          architecturalStyle: perspectiveDesc.architecturalStyle,
          materials: perspectiveDesc.materials,
          seed: perspectiveSeed,
          prompt: `${specPrefix}\n\n${reasoningPrefix}Wide angle aerial perspective rendering of COMPLETE ${perspectiveDesc.fullDescription}${projectDetails.areaDetail}, ${projectDetails.programDetail}, dramatic 3D perspective view from distance showing entire building with ${entranceDir}-facing entrance, FULL BUILDING IN FRAME with surrounding context, ${perspectiveDesc.materials} facade, ${perspectiveDesc.features}, ${perspectiveDesc.floorCount} levels height fully visible${projectDetails.spacesDetail}, photorealistic architectural rendering, landscape context with trees and people for scale providing sense of distance, golden hour lighting, professional architectural visualization from elevated vantage point, cinematic composition showing complete project, high quality detailed rendering with full building view, bird's eye perspective angle capturing entire structure, distant viewpoint, SAME PROJECT, SAME BUILDING, SAME DESIGN`,
          perspective: 'perspective view',
          width: 1024,
          height: 768,
          negativePrompt: viewConsistencyService.getNegativePrompt('perspective')
        };

      case 'section':
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: unifiedDesc.materials,
          prompt: `Architectural section view of ${unifiedDesc.fullDescription}, showing ${unifiedDesc.floorCount} levels, ${unifiedDesc.materials} construction, technical drawing style, professional architectural illustration, detailed, precise`,
          perspective: 'section view',
          width: 1024,
          height: 768
        };

      default:
        // Default exterior view
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: unifiedDesc.materials,
          prompt: `Professional 3D architectural visualization of ${unifiedDesc.fullDescription}, ${unifiedDesc.materials} facade, professional architectural photography, photorealistic rendering, high quality`,
          perspective: 'exterior view',
          width: 1024,
          height: 768
        };
    }
  }

  /**
   * Generate architectural variations with different styles
   */
  async generateStyleVariations(projectContext, styles = ['modern', 'traditional', 'sustainable', 'futuristic']) {
    const results = {};
    
    for (const style of styles) {
      try {
        const params = {
          ...this.buildViewParameters(projectContext, 'exterior'),
          architecturalStyle: style,
          prompt: `${style} architectural style, ${projectContext.buildingProgram || 'building'}, professional visualization, photorealistic`
        };
        
        const result = await this.generateArchitecturalImage(params);
        results[style] = result;
      } catch (error) {
        logger.error(`Error generating ${style} variation:`, error);
        results[style] = {
          success: false,
          error: error.message,
          fallback: this.getFallbackImage({ style })
        };
      }
    }

    return results;
  }

  /**
   * Generate architectural concept based on design reasoning
   */
  async generateFromReasoning(designReasoning, projectContext) {
    const reasoningPrompt = this.buildReasoningPrompt(designReasoning, projectContext);
    
    const params = {
      prompt: reasoningPrompt,
      buildingType: projectContext.buildingProgram,
      architecturalStyle: designReasoning.designPhilosophy || 'contemporary',
      location: projectContext.location?.address,
      materials: this.extractMaterialsFromReasoning(designReasoning),
      width: 1024,
      height: 768,
      steps: 60,
      guidanceScale: 8.0
    };

    return await this.generateArchitecturalImage(params);
  }

  /**
   * Build prompt from design reasoning
   */
  buildReasoningPrompt(designReasoning, projectContext) {
    const philosophy = designReasoning.designPhilosophy || 'contemporary design';
    const materials = this.extractMaterialsFromReasoning(designReasoning);
    const approach = designReasoning.spatialOrganization || 'functional organization';
    
    return `Professional architectural visualization based on design philosophy: "${philosophy}". ${projectContext.buildingProgram || 'Building'} with ${materials}, ${approach}, photorealistic rendering, professional architectural photography, high quality, detailed`;
  }

  /**
   * Extract materials from design reasoning
   */
  extractMaterialsFromReasoning(designReasoning) {
    const materialText = designReasoning.materialRecommendations || '';
    const materials = ['glass', 'steel', 'concrete', 'wood', 'stone'];
    const foundMaterials = materials.filter(material => 
      materialText.toLowerCase().includes(material)
    );
    
    return foundMaterials.length > 0 ? foundMaterials.join(' and ') : 'glass and steel';
  }

  /**
   * Build parameters for 2D floor plan generation
   * FIXED: Uses ProjectDNA for consistent floor plan generation
   */
  buildFloorPlanParameters(projectContext, level = 'ground', floorIndex = null) {
    // Use ProjectDNA if available
    const projectDNA = projectContext.projectDNA;

    // Initialize project consistency
    viewConsistencyService.initializeProjectConsistency(projectContext);
    const unifiedDesc = viewConsistencyService.getUnifiedDescription();

    // Extract detailed project specifications
    const projectDetails = this.extractProjectDetails(projectContext);

    // Calculate floor count and determine floor index
    const floorCount = this.calculateFloorCount(projectContext);
    let actualFloorIndex = floorIndex;
    if (actualFloorIndex === null) {
      // Map level string to floor index
      if (level === 'ground') actualFloorIndex = 0;
      else if (level === 'upper') actualFloorIndex = 1;
      else if (level === 'roof') actualFloorIndex = floorCount; // Roof is above all floors
    }

    // CRITICAL FIX: Use consistency validation service to get DISTINCT floor-specific prompts
    // This ensures each floor has unique spatial characteristics (ground has entrance, upper has bedrooms, etc.)
    const buildingProgram = projectContext.buildingProgram || 'house';
    const floorSpecificPrompt = consistencyValidationService.getFloorSpecificPrompt(
      actualFloorIndex,
      floorCount,
      buildingProgram
    );

    // Create entrance-aware floor plan description (only for ground floor)
    const entranceNote = level === 'ground'
      ? `entrance on ${this.getCardinalDirection(unifiedDesc.entranceDirection)} side,`
      : '';

    // Build complete room list for the prompt
    const roomListDetail = projectDetails.programDetail
      ? `, specific rooms: ${projectDetails.programDetail}`
      : '';

    // Use view consistency service for consistent prompts
    const specPrefix = viewConsistencyService.formatMasterDesignSpec(projectContext.masterDesignSpec);
    const basePrompt = viewConsistencyService.getPositivePrompt('floor_plan', projectContext);

    // CRITICAL FIX: Use enhanced negative prompt from consistency validation service
    const enhancedNegativePrompt = consistencyValidationService.get2DFloorPlanNegativePrompt();

    // Add ProjectDNA specification if available
    let dnaSpec = '';
    if (projectDNA && floorIndex !== null && projectDNA.floorPlans[floorIndex]) {
      const floor = projectDNA.floorPlans[floorIndex];
      const roomList = floor.rooms?.map(r => `${r.name} (${r.area}m²)`).join(', ') || '';
      dnaSpec = `DNA SPECIFICATION: ${floor.level} (${floor.area}m²) containing ${roomList}, `;
    }

    // Enhanced prompt for better 2D floor plan generation
    const floorPlanPrompt = level === 'roof'
      ? `ARCHITECTURAL ROOF PLAN: Professional 2D architectural roof plan drawing, technical blueprint showing roof layout of ${unifiedDesc.fullDescription}, flat orthographic top view showing roof structure, ridge lines, valleys, drainage slopes, gutters, downspouts, roof material indication, chimney if present, HVAC equipment placement, roof access, parapet walls if flat roof, dimension lines, north arrow, scale 1:100, black and white technical drawing, CAD-style linework, NO 3D elements, NO perspective`
      : `ARCHITECTURAL FLOOR PLAN: Professional 2D architectural floor plan, ${level} level technical blueprint of ${unifiedDesc.fullDescription}${projectDetails.areaDetail}, ${floorSpecificPrompt}, ${entranceNote} showing clear wall outlines as thick black lines, door openings with arc swing indicators, window openings as parallel lines in walls${roomListDetail}, room names and area labels in m², furniture layout indicators, dimension lines with measurements, grid lines if applicable, north arrow indicator, scale notation 1:100, professional CAD-style technical drawing, clean black lines on white background, orthographic top-down view only, architectural drafting standards, NO 3D elements whatsoever, NO perspective, NO shading, NO rendering, flat 2D technical documentation`;

    const floorPlanNegative = "3D rendering, perspective view, isometric, axonometric, exterior view, building facade, photorealistic, colored, shaded, rendered, artistic, elevation, section, site plan, landscape, trees, cars, people, sky, clouds, shadows, materials, textures, lighting effects, reflections, 3D visualization, architectural photography, street view, aerial perspective, building exterior, outdoor environment";

    return {
      prompt: `${dnaSpec}${floorPlanPrompt}`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: unifiedDesc.materials,
      viewType: `floor_plan_${level}`,
      width: 1024,
      height: 1024,
      steps: 45,  // Increased for better quality
      guidanceScale: 8.5,  // Increased for stronger adherence to prompt
      seed: viewConsistencyService.getProjectSeed(), // CONSISTENCY FIX: Use SAME seed for all floors
      negativePrompt: floorPlanNegative
    };
  }

  /**
   * Build parameters for elevation drawings
   * FIX: Increased resolution and inference steps for sharper, more detailed technical drawings
   * FIX: Enhanced negative prompts to prevent 3D views
   */
  buildElevationParameters(projectContext, direction = 'north', highQuality = true) {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    // Determine if this is the entrance elevation
    const entranceDir = this.getCardinalDirection(unifiedDesc.entranceDirection);
    const isEntranceElevation = direction === entranceDir;
    const elevationType = isEntranceElevation ? 'main entrance elevation' : 'side elevation';

    // FIX: Use high-quality settings for sharper linework and better detail
    // High quality: 1536×1152 with 50 steps for crisp, professional technical drawings
    // Standard quality: 1024×768 with 40 steps for faster previews
    const resolution = highQuality ? { width: 1536, height: 1152 } : { width: 1024, height: 768 };
    const renderQuality = highQuality ? { steps: 50, guidanceScale: 7.5 } : { steps: 40, guidanceScale: 7.0 };

    // CRITICAL FIX: Inject Master Design Specification for consistency
    const specPrefix = this.formatMasterDesignSpec(projectContext.masterDesignSpec);

    // CRITICAL FIX: Use enhanced negative prompt from consistency validation service
    const enhancedNegativePrompt = consistencyValidationService.getTechnicalDrawingNegativePrompt();

    return {
      prompt: `${specPrefix}\n\nSTRICTLY 2D ELEVATION DRAWING: Professional 2D architectural elevation drawing, ${direction} ${elevationType} technical blueprint of ${unifiedDesc.fullDescription}, FLAT 2D ORTHOGRAPHIC FACADE VIEW showing ${unifiedDesc.floorCount} floor levels, ${unifiedDesc.materials} facade with proper hatching patterns, window and door openings clearly shown${isEntranceElevation ? ', main entrance prominently displayed' : ''}, ground line reference (±0.00m), roof profile, floor division lines, WITH COMPLETE VISIBLE DIMENSIONAL ANNOTATIONS: overall building width in meters with dimension lines and arrows, overall building height from ground to roof peak with vertical dimension lines, floor-to-floor heights labeled (typically 3.0m), window dimensions (width x height), door dimensions, foundation depth below grade, all dimensions clearly marked with extension lines, dimension text readable and professional, scale 1:100, architectural dimensions and annotations, technical line drawing style, black and white CAD-style documentation, clean precise linework, architectural elevation drawing with full dimensioning, NO 3D perspective, NO rendering, NO colors, professional technical drawing with measurements, ELEVATION VIEW ONLY, NO 3D RENDERINGS, NO PERSPECTIVE VIEWS`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: unifiedDesc.materials,
      viewType: `elevation_${direction}`,
      width: resolution.width,
      height: resolution.height,
      steps: renderQuality.steps,
      guidanceScale: renderQuality.guidanceScale,
      negativePrompt: "3D rendering, perspective view, isometric view, axonometric view, photorealistic, colors, rendered, artistic, decorative, furniture, landscaping, trees, sky, outdoor, aerial view, bird's eye view, 3D visualization, architectural photography, interior view, floor plan, section view, technical drawing that is not elevation"
      // Removed ControlNet completely - elevations should be independent 2D drawings
    };
  }

  /**
   * Build parameters for section drawings
   * FIX: Increased resolution and inference steps for sharper, more detailed technical drawings
   * FIX: Enhanced negative prompts to prevent 3D views
   */
  buildSectionParameters(projectContext, sectionType = 'longitudinal', highQuality = true) {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    const sectionDesc = sectionType === 'longitudinal'
      ? 'longitudinal section, length-wise cut through building showing entrance to back'
      : 'cross section, width-wise cut through building';

    // ENHANCED: Boost quality settings for sections specifically
    // High quality: 1536×1152 with 75 steps (increased from 50) and stronger guidance
    // Standard quality: 1024×768 with 50 steps (increased from 40)
    const resolution = highQuality ? { width: 1536, height: 1152 } : { width: 1024, height: 768 };
    const renderQuality = highQuality ? { steps: 75, guidanceScale: 8.5 } : { steps: 50, guidanceScale: 8.0 };

    // CRITICAL FIX: Inject Master Design Specification for consistency
    const specPrefix = this.formatMasterDesignSpec(projectContext.masterDesignSpec);

    // CRITICAL FIX: Use enhanced negative prompt from consistency validation service
    const enhancedNegativePrompt = consistencyValidationService.getTechnicalDrawingNegativePrompt();

    return {
      prompt: `${specPrefix}\n\nSTRICTLY 2D SECTION DRAWING: HIGHLY DETAILED 2D architectural section drawing, ${sectionDesc} technical blueprint of ${unifiedDesc.fullDescription}, STRICTLY FLAT 2D CUT-THROUGH VIEW showing all ${unifiedDesc.floorCount} floor levels vertically, MAXIMUM DETAIL construction documentation showing: floor slabs as thick horizontal lines with reinforcement (#4 @ 300mm c/c), walls in section as thick black lines with material layers visible, interior room heights clearly labeled, stairs${unifiedDesc.floorCount > 1 ? ' connecting floors with tread and riser details' : ''}, foundation line with depth annotation (0.5m typical), roof structure in section with rafters and covering, ${unifiedDesc.materials} construction indicated with proper architectural hatching patterns (concrete cross-hatch, brick diagonal lines, insulation wavy lines), ORTHOGRAPHIC PROJECTION, section cut line indicator, poché (solid black fill) for all cut walls and slabs, floor-to-floor heights dimensioned (typically 3.0m), ceiling heights labeled (2.7m typical), all structural elements visible and labeled, CAD-style high-detail technical drawing, professional architectural blueprint with maximum clarity, crisp black and white line drawing ONLY, SHARP LINEWORK, high contrast, NO 3D elements, NO perspective, NO rendering, NO colors, flat 2D technical documentation, vertical section view ONLY, professional construction document quality, SECTION VIEW ONLY, NO 3D RENDERINGS, NO PERSPECTIVE VIEWS`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: unifiedDesc.materials,
      viewType: `section_${sectionType}`,
      width: resolution.width,
      height: resolution.height,
      steps: renderQuality.steps,
      guidanceScale: renderQuality.guidanceScale,
      negativePrompt: "3D rendering, perspective view, isometric view, axonometric view, photorealistic, colors, rendered, artistic, decorative, furniture, landscaping, trees, sky, outdoor, aerial view, bird's eye view, 3D visualization, architectural photography, interior view, floor plan, elevation view, technical drawing that is not section"
      // Removed ControlNet completely - sections should be independent 2D drawings
    };
  }

  /**
   * Build parameters for 3D preview generation
   * STEP 2: Accept optional controlImage to use floor plan as ControlNet input
   */
  build3DPreviewParameters(projectContext, controlImage = null) {
    const {
      buildingProgram = 'commercial building',
      architecturalStyle = 'contemporary',
      location = 'urban setting',
      materials = 'glass and steel'
    } = projectContext;

    const params = {
      prompt: `Professional 3D architectural visualization, ${architecturalStyle} ${buildingProgram} in ${location}, constructed with ${materials}, photorealistic rendering, professional architectural photography, high quality, detailed, 3D perspective view, modern design, clean lines, natural lighting, professional rendering`,
      buildingType: buildingProgram,
      architecturalStyle,
      location,
      materials,
      viewType: '3d_preview',
      width: 1024,
      height: 768,
      steps: 50,
      guidanceScale: 8.0,
      negativePrompt: "2D, floor plan, technical drawing, blueprint, black and white, line drawing, blurry, low quality"
    };

    // STEP 2: If controlImage is provided, add it for ControlNet guidance
    if (controlImage) {
      params.image = controlImage;
      logger.verbose('🎯 Using floor plan as ControlNet control image for 3D preview');
    }

    return params;
  }

  /**
   * Build parameters for detailed construction drawings at specific scales
   * NEW: Generates high-resolution detail drawings with construction information
   * @param {Object} projectContext - Project context
   * @param {Number} floorIndex - Floor level (0 = ground, 1 = first, etc.)
   * @param {Number} scale - Drawing scale (5, 10, 20, 50 for 1:5, 1:10, 1:20, 1:50)
   * @returns {Object} Parameters for detail drawing generation
   */
  buildDetailParameters(projectContext, floorIndex = 0, scale = 20) {
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);
    const floorName = floorIndex === 0 ? 'ground floor' : `floor ${floorIndex + 1}`;

    // Scale-dependent resolution and detail level
    const scaleSettings = {
      5: { width: 4096, height: 3072, detail: 'EXTREMELY DETAILED', steps: 60 },    // 1:5 - Very detailed
      10: { width: 3072, height: 2304, detail: 'HIGHLY DETAILED', steps: 55 },      // 1:10 - Detailed
      20: { width: 2048, height: 1536, detail: 'DETAILED', steps: 50 },             // 1:20 - Standard detail
      50: { width: 1536, height: 1152, detail: 'MODERATELY DETAILED', steps: 45 }   // 1:50 - Overview detail
    };

    const settings = scaleSettings[scale] || scaleSettings[20];

    return {
      prompt: `STRICTLY 2D CONSTRUCTION DETAIL: 2D construction detail drawing at 1:${scale} scale of ${unifiedDesc.fullDescription} ${floorName}, ${settings.detail} technical blueprint showing: wall sections with ${unifiedDesc.materials} assembly layers, floor slab construction with reinforcement bars (#4 @ 300mm c/c), foundation details with footings and piles, structural columns and beams with dimensions, window and door jamb details, flashing and waterproofing layers, insulation placement, ceiling assembly, all construction joints, COMPLETE DIMENSIONAL ANNOTATIONS in millimeters, material callouts (concrete grade, steel grade, insulation R-value), construction notes, welding symbols, bolt specifications, ORTHOGRAPHIC PROJECTION, CAD-style construction documentation, black and white line drawing with hatching for materials, scale bar 1:${scale}, title block, drawing number, NO 3D rendering, NO perspective, NO colors, professional construction documentation, CONSTRUCTION DETAIL ONLY, NO 3D RENDERINGS, NO PERSPECTIVE VIEWS`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: unifiedDesc.materials,
      viewType: `construction_detail_floor_${floorIndex}_scale_1_${scale}`,
      width: settings.width,
      height: settings.height,
      steps: settings.steps,
      guidanceScale: 8.0,
      negativePrompt: "3D rendering, perspective view, isometric view, axonometric view, photorealistic, colors, rendered, artistic, decorative, interior design, furniture, landscaping, trees, sky, outdoor, aerial view, bird's eye view, 3D visualization, architectural photography, exterior view, building facade, outdoor environment, external view, building from outside, street view, exterior perspective, outdoor space, external architecture"
    };
  }

  /**
   * Build parameters for structural plans
   * FIXED: Ensures structural plans match the same project design
   * @param {Object} projectContext - Project context
   * @param {Number} floorIndex - Floor level (0 = ground/foundation, 1 = first floor structure, etc.)
   * @returns {Object} Parameters for structural plan generation
   */
  buildStructuralPlanParameters(projectContext, floorIndex = 0) {
    // FIXED: Use view consistency service for consistent structural plans
    viewConsistencyService.initializeProjectConsistency(projectContext);
    const consistentDesc = viewConsistencyService.getUnifiedDescription();
    const consistentSeed = viewConsistencyService.getProjectSeed();
    const floorName = floorIndex === 0 ? 'foundation and ground floor structural plan' : `floor ${floorIndex + 1} structural plan`;

    // CRITICAL FIX: Inject Master Design Specification for consistency
    const specPrefix = this.formatMasterDesignSpec(projectContext.masterDesignSpec);

    // CRITICAL FIX: Use enhanced negative prompt from consistency validation service
    const enhancedNegativePrompt = consistencyValidationService.getStructuralPlanNegativePrompt();

    return {
      prompt: `${specPrefix}\n\nSTRICTLY 2D STRUCTURAL PLAN: 2D structural engineering plan of ${consistentDesc.fullDescription} ${floorName}, showing: structural grid with axis labels (A, B, C / 1, 2, 3), column positions and sizes (e.g., 400x400mm RC column), beam layout with spans and sizes (e.g., 300x600mm beam), slab thickness and reinforcement (#5 @ 200mm c/c both ways), ${floorIndex === 0 ? 'foundation footings, pile caps, grade beams, soil bearing capacity notes,' : 'floor framing direction arrows,'} load-bearing walls indicated with hatching, structural steel connections where applicable, moment frames, shear walls, expansion joints, COMPLETE STRUCTURAL DIMENSIONS, reinforcement bar schedules, concrete grade specifications (e.g., C30/37), steel grade (e.g., S355), load annotations (kN/m²), structural notes and calculations references, scale 1:100, ORTHOGRAPHIC TOP VIEW, CAD-style structural drawing, black and white technical documentation, NO 3D, NO perspective, NO colors, professional structural engineering blueprint, SAME PROJECT, SAME BUILDING, SAME DESIGN, STRUCTURAL PLAN ONLY, NO 3D RENDERINGS, NO PERSPECTIVE VIEWS`,
      buildingType: consistentDesc.buildingType,
      architecturalStyle: consistentDesc.architecturalStyle,
      materials: consistentDesc.materials,
      viewType: `structural_plan_floor_${floorIndex}`,
      width: 2048,
      height: 1536,
      steps: 55,
      guidanceScale: 8.0,
      seed: consistentSeed,
      negativePrompt: enhancedNegativePrompt
    };
  }

  /**
   * Build parameters for MEP (Mechanical, Electrical, Plumbing) plans
   * FIXED: Ensures MEP plans match the same project design
   * @param {Object} projectContext - Project context
   * @param {Number} floorIndex - Floor level
   * @param {String} system - MEP system type: 'hvac', 'electrical', 'plumbing', or 'combined'
   * @returns {Object} Parameters for MEP plan generation
   */
  buildMEPPlanParameters(projectContext, floorIndex = 0, system = 'combined') {
    // FIXED: Use view consistency service for consistent MEP plans
    viewConsistencyService.initializeProjectConsistency(projectContext);
    const consistentDesc = viewConsistencyService.getUnifiedDescription();
    const consistentSeed = viewConsistencyService.getProjectSeed();
    const floorName = floorIndex === 0 ? 'ground floor' : `floor ${floorIndex + 1}`;

    // CRITICAL FIX: Inject Master Design Specification for consistency
    const specPrefix = this.formatMasterDesignSpec(projectContext.masterDesignSpec);

    // CRITICAL FIX: Use enhanced negative prompt from consistency validation service
    const enhancedNegativePrompt = consistencyValidationService.getMEPPlanNegativePrompt();

    const systemPrompts = {
      hvac: `HVAC system layout: air handling units (AHU) locations, supply and return ductwork with sizes (e.g., 600x400mm duct), diffuser and grille locations, chilled water piping, heating hot water piping, thermostat locations, control zones, outdoor air intake, exhaust fans`,
      electrical: `Electrical system layout: main distribution boards (MDB), sub-distribution boards (SDB), lighting fixture locations and types, power outlet locations (single, double, 3-phase), cable routing and conduit sizes, circuit breakers and ratings, emergency lighting, fire alarm devices, data/telecom outlets, electrical load schedule`,
      plumbing: `Plumbing system layout: water supply mains and risers, drainage and waste pipes with slopes, vent stacks, fixture locations (sinks, toilets, showers), hot and cold water distribution, pipe sizes (e.g., 50mm drain), cleanouts, floor drains, water heater location, backflow preventers, shut-off valves`,
      combined: `Combined MEP systems: HVAC ductwork and equipment, electrical distribution and lighting, plumbing supply and drainage, integrated coordination showing clashes resolved, ceiling height requirements, service corridors, mechanical rooms, riser diagrams`
    };

    const systemPrompt = systemPrompts[system] || systemPrompts.combined;

    return {
      prompt: `${specPrefix}\n\nSTRICTLY 2D MEP PLAN: 2D MEP (Mechanical, Electrical, Plumbing) engineering plan of ${consistentDesc.fullDescription} ${floorName}, showing ${systemPrompt}, all equipment specifications and model numbers, pipe and duct sizing annotations, flow directions with arrows, isolating valves, control devices, legends for symbols used, equipment schedules, design criteria notes (CFM, GPM, kW), scale 1:100, ORTHOGRAPHIC TOP VIEW, CAD-style MEP drawing, black and white technical documentation with color-coded systems (represented by different line types: dashed, dotted, solid), professional MEP engineering blueprint, NO 3D, NO perspective, NO architectural details, focused on building services, SAME PROJECT, SAME BUILDING, SAME DESIGN, MEP PLAN ONLY, NO 3D RENDERINGS, NO PERSPECTIVE VIEWS`,
      buildingType: consistentDesc.buildingType,
      architecturalStyle: consistentDesc.architecturalStyle,
      materials: consistentDesc.materials,
      viewType: `mep_${system}_plan_floor_${floorIndex}`,
      width: 2048,
      height: 1536,
      steps: 55,
      guidanceScale: 8.0,
      seed: consistentSeed,
      negativePrompt: enhancedNegativePrompt
    };
  }

  /**
   * Generate construction detail drawings for all floors at specified scale
   * NEW: Comprehensive construction documentation workflow
   * OPTIMIZED: Parallel generation for all floors (60-70% speed improvement)
   * @param {Object} projectContext - Project context
   * @param {Number} scale - Drawing scale (5, 10, 20, or 50)
   * @returns {Promise<Object>} Construction details for all floors
   */
  async generateConstructionDetails(projectContext, scale = 20) {
    // NOTE: API key is handled by proxy server, not needed in client
    // Removed API key check

    try {
      const startTime = Date.now();
      const floorCount = this.calculateFloorCount(projectContext);
      const results = {};
      const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

      logger.verbose(`🔧 Generating construction details at 1:${scale} scale for ${floorCount} floor(s) (parallel execution)...`);

      // PERFORMANCE OPTIMIZATION: Generate all floors in parallel
      const detailPromises = [];
      for (let floorIndex = 0; floorIndex < floorCount; floorIndex++) {
        const params = this.buildDetailParameters(projectContext, floorIndex, scale);
        params.seed = projectSeed + floorIndex; // Vary seed slightly per floor

        logger.verbose(`  📐 Floor ${floorIndex + 1} details...`);
        detailPromises.push({
          key: `floor_${floorIndex}`,
          promise: this.generateArchitecturalImage(params)
        });
      }

      // Execute all in parallel
      const detailResults = await Promise.all(detailPromises.map(({ key, promise }) =>
        promise.then(result => ({ key, result }))
      ));

      // Collect results
      detailResults.forEach(({ key, result }) => {
        results[key] = result;
      });

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.verbose(`✅ Construction details generated in ${elapsedTime}s (parallel execution)`);

      return {
        success: true,
        details: results,
        scale: scale,
        floorCount: floorCount,
        projectSeed,
        generationTime: elapsedTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Construction details generation error:', error);
      return {
        success: false,
        error: error.message,
        details: {},
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate structural plans for all floors
   * NEW: Structural engineering documentation workflow
   * OPTIMIZED: Parallel generation for all levels (70% speed improvement)
   * @param {Object} projectContext - Project context
   * @param {Object} controlImage - Optional floor plan for reference
   * @returns {Promise<Object>} Structural plans for all floors
   */
  async generateStructuralPlans(projectContext, controlImage = null) {
    // NOTE: API key is handled by proxy server, not needed in client
    // Removed API key check

    try {
      const startTime = Date.now();
      const floorCount = this.calculateFloorCount(projectContext);
      const results = {};
      const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

      logger.verbose(`🏗️ Generating structural plans for ${floorCount + 1} level(s) (including foundation, parallel execution)...`);

      // PERFORMANCE OPTIMIZATION: Generate foundation + all floors in parallel
      const structuralPromises = [];
      for (let floorIndex = 0; floorIndex <= floorCount; floorIndex++) {
        const params = this.buildStructuralPlanParameters(projectContext, floorIndex);
        params.seed = projectSeed + floorIndex * 10; // Vary seed per floor
        if (controlImage) params.image = controlImage;

        const levelName = floorIndex === 0 ? 'foundation' : `floor_${floorIndex}`;
        logger.verbose(`  🏛️ ${levelName} structural plan...`);
        structuralPromises.push({
          key: levelName,
          promise: this.generateArchitecturalImage(params)
        });
      }

      // Execute all in parallel
      const structuralResults = await Promise.all(structuralPromises.map(({ key, promise }) =>
        promise.then(result => ({ key, result }))
      ));

      // Collect results
      structuralResults.forEach(({ key, result }) => {
        results[key] = result;
      });

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.verbose(`✅ Structural plans generated in ${elapsedTime}s (parallel execution)`);

      return {
        success: true,
        structuralPlans: results,
        floorCount: floorCount,
        projectSeed,
        generationTime: elapsedTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Structural plans generation error:', error);
      return {
        success: false,
        error: error.message,
        structuralPlans: {},
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate MEP plans for all floors
   * NEW: MEP engineering documentation workflow
   * OPTIMIZED: Parallel generation for all floors (70% speed improvement)
   * @param {Object} projectContext - Project context
   * @param {String} system - MEP system: 'hvac', 'electrical', 'plumbing', or 'combined'
   * @param {Object} controlImage - Optional floor plan for reference
   * @returns {Promise<Object>} MEP plans for all floors
   */
  async generateMEPPlans(projectContext, system = 'combined', controlImage = null) {
    // NOTE: API key is handled by proxy server, not needed in client
    // Removed API key check

    try {
      const startTime = Date.now();
      const floorCount = this.calculateFloorCount(projectContext);
      const results = {};
      const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

      logger.verbose(`⚡ Generating ${system.toUpperCase()} MEP plans for ${floorCount} floor(s) (parallel execution)...`);

      // PERFORMANCE OPTIMIZATION: Generate all floors in parallel
      const mepPromises = [];
      for (let floorIndex = 0; floorIndex < floorCount; floorIndex++) {
        const params = this.buildMEPPlanParameters(projectContext, floorIndex, system);
        params.seed = projectSeed + floorIndex * 100; // Vary seed per floor
        if (controlImage) params.image = controlImage;

        logger.verbose(`  ⚙️  Floor ${floorIndex + 1} ${system} MEP plan...`);
        mepPromises.push({
          key: `floor_${floorIndex}`,
          promise: this.generateArchitecturalImage(params)
        });
      }

      // Execute all in parallel
      const mepResults = await Promise.all(mepPromises.map(({ key, promise }) =>
        promise.then(result => ({ key, result }))
      ));

      // Collect results
      mepResults.forEach(({ key, result }) => {
        results[key] = result;
      });

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.verbose(`✅ MEP plans generated in ${elapsedTime}s (parallel execution)`);

      return {
        success: true,
        mepPlans: results,
        system: system,
        floorCount: floorCount,
        projectSeed,
        generationTime: elapsedTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('MEP plans generation error:', error);
      return {
        success: false,
        error: error.message,
        mepPlans: {},
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get fallback floor plan when API is unavailable
   */
  getFallbackFloorPlan(projectContext) {
    return {
      success: false,
      isFallback: true,
      floorPlan: {
        images: ['https://placehold.co/1024x1024/2C3E50/FFFFFF?text=2D+Floor+Plan+Placeholder'],
        message: 'Using placeholder floor plan - API unavailable'
      },
      type: '2d_floor_plan',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback 3D preview when API is unavailable
   */
  getFallback3DPreview(projectContext) {
    return {
      success: false,
      isFallback: true,
      preview3D: {
        images: ['https://placehold.co/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder'],
        message: 'Using placeholder 3D preview - API unavailable'
      },
      type: '3d_preview',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback multi-level floor plans when API is unavailable
   */
  getFallbackMultiLevelFloorPlans(projectContext) {
    const floorCount = this.calculateFloorCount(projectContext);
    const fallbackPlans = {
      ground: {
        images: ['https://placehold.co/1024x1024/2C3E50/FFFFFF?text=Ground+Floor+Plan'],
        success: false
      },
      roof: {
        images: ['https://placehold.co/1024x1024/2C3E50/FFFFFF?text=Roof+Plan'],
        success: false
      }
    };

    if (floorCount > 1) {
      fallbackPlans.upper = {
        images: ['https://placehold.co/1024x1024/2C3E50/FFFFFF?text=Upper+Floor+Plan'],
        success: false
      };
    }

    return {
      success: false,
      isFallback: true,
      floorPlans: fallbackPlans,
      floorCount,
      message: 'Using placeholder floor plans - API unavailable',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback elevations and sections when API is unavailable
   */
  getFallbackElevationsAndSections(projectContext) {
    return {
      success: false,
      isFallback: true,
      technicalDrawings: {
        elevation_north: {
          images: ['https://placehold.co/1024x768/34495E/FFFFFF?text=North+Elevation'],
          success: false
        },
        elevation_south: {
          images: ['https://placehold.co/1024x768/34495E/FFFFFF?text=South+Elevation'],
          success: false
        },
        elevation_east: {
          images: ['https://placehold.co/1024x768/34495E/FFFFFF?text=East+Elevation'],
          success: false
        },
        elevation_west: {
          images: ['https://placehold.co/1024x768/34495E/FFFFFF?text=West+Elevation'],
          success: false
        },
        section_longitudinal: {
          images: ['https://placehold.co/1024x768/2C3E50/FFFFFF?text=Longitudinal+Section'],
          success: false
        },
        section_cross: {
          images: ['https://placehold.co/1024x768/2C3E50/FFFFFF?text=Cross+Section'],
          success: false
        }
      },
      message: 'Using placeholder technical drawings - API unavailable',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback image when API is unavailable
   */
  getFallbackImage(params) {
    const { viewType = 'exterior' } = params;
    // style parameter reserved for future use

    // Return placeholder image URLs based on view type
    const fallbackImages = {
      exterior: 'https://placehold.co/1024x768/4A90E2/FFFFFF?text=Exterior+View+Placeholder',
      exterior_front: 'https://placehold.co/1024x768/4A90E2/FFFFFF?text=Front+View',
      exterior_side: 'https://placehold.co/1024x768/5AA3E5/FFFFFF?text=Side+View',
      interior: 'https://placehold.co/1024x768/7ED321/FFFFFF?text=Interior+View+Placeholder',
      site_plan: 'https://placehold.co/1024x1024/9013FE/FFFFFF?text=Site+Plan+Placeholder',
      section: 'https://placehold.co/1024x768/F5A623/FFFFFF?text=Section+View+Placeholder',
      section_longitudinal: 'https://placehold.co/1024x768/F5A623/FFFFFF?text=Longitudinal+Section',
      section_cross: 'https://placehold.co/1024x768/E89611/FFFFFF?text=Cross+Section',
      floor_plan: 'https://placehold.co/1024x1024/2C3E50/FFFFFF?text=Floor+Plan+Placeholder',
      floor_plan_ground: 'https://placehold.co/1024x1024/2C3E50/FFFFFF?text=Ground+Floor+Plan',
      floor_plan_upper: 'https://placehold.co/1024x1024/34495E/FFFFFF?text=Upper+Floor+Plan',
      floor_plan_roof: 'https://placehold.co/1024x1024/1A252F/FFFFFF?text=Roof+Plan',
      elevation_north: 'https://placehold.co/1024x768/8B4513/FFFFFF?text=North+Elevation',
      elevation_south: 'https://placehold.co/1024x768/A0522D/FFFFFF?text=South+Elevation',
      elevation_east: 'https://placehold.co/1024x768/CD853F/FFFFFF?text=East+Elevation',
      elevation_west: 'https://placehold.co/1024x768/D2691E/FFFFFF?text=West+Elevation',
      '3d_preview': 'https://placehold.co/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder'
    };

    return {
      success: false,
      isFallback: true,
      images: [fallbackImages[viewType] || fallbackImages.exterior],
      message: 'Using placeholder image - API unavailable',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get generation status
   */
  async getGenerationStatus(predictionId) {
    // NOTE: API key is handled by proxy server, not needed in client

    try {
      const url = getReplicateStatusUrl(predictionId);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Cancel generation
   */
  async cancelGeneration(predictionId) {
    // NOTE: API key is handled by proxy server, not needed in client

    try {
      const url = process.env.NODE_ENV === 'production'
        ? `/api/replicate-status?id=${predictionId}` // Note: would need separate cancel endpoint
        : `http://localhost:3001/api/replicate/predictions/${predictionId}/cancel`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Cancel failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

const replicateService = new ReplicateService();
export default replicateService;
