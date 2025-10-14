/**
 * Replicate Service for Architectural Image Generation
 * Uses SDXL Multi-ControlNet LoRA for architectural visualization
 */

const REPLICATE_API_KEY = process.env.REACT_APP_REPLICATE_API_KEY;

// Use Vercel serverless functions in production, local proxy in development
const REPLICATE_API_PROXY_URL = process.env.NODE_ENV === 'production'
  ? '/api/replicate-predictions'  // Vercel serverless function
  : 'http://localhost:3001/api/replicate/predictions';  // Local proxy server

const REPLICATE_STATUS_URL = process.env.NODE_ENV === 'production'
  ? '/api/replicate-status'  // Vercel serverless function
  : 'http://localhost:3001/api/replicate/predictions';  // Local proxy server

class ReplicateService {
  constructor() {
    this.apiKey = REPLICATE_API_KEY;
    if (!this.apiKey) {
      console.warn('Replicate API key not found. Image generation will use placeholder images.');
    }
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
    if (!this.apiKey) {
      console.warn('No Replicate API key, using fallback image');
      const fallback = this.getFallbackImage(generationParams);
      return {
        success: false,
        images: fallback.images || [fallback],
        isFallback: true,
        parameters: generationParams,
        timestamp: new Date().toISOString()
      };
    }

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
      console.error('Replicate generation error:', error);
      console.warn('Using fallback image due to error');
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
      const url = process.env.NODE_ENV === 'production'
        ? `/api/replicate-status?id=${predictionId}`
        : `http://localhost:3001/api/replicate/predictions/${predictionId}`;

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
      console.log('🎯 ControlNet enabled with conditioning scale:', controlNetParams.controlnet_conditioning_scale);
    }

    if (params.controlType) {
      controlNetParams.controlnet_conditioning_scale = params.controlType === 'canny' ? 1.0 : 0.8;
    }

    return controlNetParams;
  }

  /**
   * Generate multiple architectural views with consistent seed for same project
   * STEP 2: Accept optional controlImage to use floor plan as ControlNet input
   */
  async generateMultipleViews(projectContext, viewTypes = ['exterior', 'interior', 'site_plan'], controlImage = null) {
    const results = {};

    // STEP 1: Use unified projectSeed from context (no random generation here)
    const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

    for (const viewType of viewTypes) {
      try {
        const params = this.buildViewParameters(projectContext, viewType);
        // Use same seed for consistency across all views
        params.seed = projectSeed;

        // STEP 2: If controlImage is provided, add it for ControlNet guidance
        if (controlImage) {
          params.image = controlImage;
          console.log(`🎯 Using floor plan as ControlNet control for ${viewType} view`);
        }

        const result = await this.generateArchitecturalImage(params);
        results[viewType] = result;
      } catch (error) {
        console.error(`Error generating ${viewType} view:`, error);
        results[viewType] = {
          success: false,
          error: error.message,
          fallback: this.getFallbackImage({ viewType })
        };
      }
    }

    return results;
  }

  /**
   * Generate multi-level floor plans (ground, upper, roof)
   * Generates all levels by default to show complete building design
   */
  async generateMultiLevelFloorPlans(projectContext, generateAllLevels = true) {
    if (!this.apiKey) {
      return this.getFallbackMultiLevelFloorPlans(projectContext);
    }

    try {
      const floorCount = this.calculateFloorCount(projectContext);
      const results = {};

      // STEP 1: Use unified projectSeed from context (no random generation here)
      const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

      // Always generate ground floor (most important)
      console.log('🏗️ Generating ground floor plan...');
      const groundParams = this.buildFloorPlanParameters(projectContext, 'ground');
      groundParams.seed = projectSeed;
      console.log('Floor plan params:', groundParams.viewType, groundParams.prompt?.substring(0, 100));
      results.ground = await this.generateArchitecturalImage(groundParams);
      console.log('Ground floor result:', results.ground.success ? 'Success' : 'Failed', results.ground.isFallback ? '(Fallback)' : '');

      // Only generate additional levels if explicitly requested
      if (generateAllLevels) {
        // Generate upper floors if multi-story
        if (floorCount > 1) {
          console.log(`🏗️ Generating upper floor plan (${floorCount - 1} levels)...`);
          const upperParams = this.buildFloorPlanParameters(projectContext, 'upper');
          upperParams.seed = projectSeed;
          results.upper = await this.generateArchitecturalImage(upperParams);
        }

        // Generate roof plan
        console.log('🏗️ Generating roof plan...');
        const roofParams = this.buildFloorPlanParameters(projectContext, 'roof');
        roofParams.seed = projectSeed;
        results.roof = await this.generateArchitecturalImage(roofParams);
      }

      return {
        success: true,
        floorPlans: results,
        floorCount,
        projectSeed,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Multi-level floor plan generation error:', error);
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
   */
  async generateElevationsAndSections(projectContext, generateAllDrawings = false, controlImage = null) {
    if (!this.apiKey) {
      return this.getFallbackElevationsAndSections(projectContext);
    }

    try {
      const results = {};

      // STEP 1: Use unified projectSeed from context (no random generation here)
      const projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

      if (controlImage) {
        console.log('🎯 Using floor plan as ControlNet control for technical drawings');
      }

      if (generateAllDrawings) {
        // Generate all 4 elevations
        console.log('🏗️ Generating elevations (N, S, E, W) with floor plan control...');
        for (const direction of ['north', 'south', 'east', 'west']) {
          const params = this.buildElevationParameters(projectContext, direction);
          params.seed = projectSeed;
          if (controlImage) params.image = controlImage;
          results[`elevation_${direction}`] = await this.generateArchitecturalImage(params);
        }

        // Generate 2 sections
        console.log('🏗️ Generating sections (longitudinal, cross) with floor plan control...');
        for (const sectionType of ['longitudinal', 'cross']) {
          const params = this.buildSectionParameters(projectContext, sectionType);
          params.seed = projectSeed;
          if (controlImage) params.image = controlImage;
          results[`section_${sectionType}`] = await this.generateArchitecturalImage(params);
        }
      } else {
        // Generate only essential drawings (faster, lower cost)
        // Generate front and side elevations (entrance direction)
        const entranceDir = projectContext.entranceDirection || 'N';
        const mainDirection = this.getCardinalDirection(entranceDir);
        const sideDirection = this.getPerpendicularDirection(mainDirection);

        console.log(`🏗️ Generating main elevation (${mainDirection}) and side elevation (${sideDirection}) with floor plan control...`);

        const mainParams = this.buildElevationParameters(projectContext, mainDirection.toLowerCase());
        mainParams.seed = projectSeed;
        if (controlImage) mainParams.image = controlImage;
        results[`elevation_${mainDirection.toLowerCase()}`] = await this.generateArchitecturalImage(mainParams);

        const sideParams = this.buildElevationParameters(projectContext, sideDirection.toLowerCase());
        sideParams.seed = projectSeed;
        if (controlImage) sideParams.image = controlImage;
        results[`elevation_${sideDirection.toLowerCase()}`] = await this.generateArchitecturalImage(sideParams);

        // Generate one section (longitudinal) with floor plan control
        console.log('🏗️ Generating longitudinal section with floor plan control...');
        const sectionParams = this.buildSectionParameters(projectContext, 'longitudinal');
        sectionParams.seed = projectSeed;
        if (controlImage) sectionParams.image = controlImage;
        results[`section_longitudinal`] = await this.generateArchitecturalImage(sectionParams);
      }

      return {
        success: true,
        technicalDrawings: results,
        projectSeed,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Elevations and sections generation error:', error);
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
    if (!this.apiKey) {
      return this.getFallbackFloorPlan(projectContext);
    }

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
      console.error('Floor plan generation error:', error);
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
    if (!this.apiKey) {
      return this.getFallback3DPreview(projectContext);
    }

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
      console.error('3D preview generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallback3DPreview(projectContext)
      };
    }
  }

  /**
   * Build parameters for specific view types
   */
  buildViewParameters(projectContext, viewType) {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    // Determine entrance side for accurate 3D views
    const entranceDir = this.getCardinalDirection(unifiedDesc.entranceDirection);

    switch (viewType) {
      case 'exterior':
      case 'exterior_front':
        // Extract comprehensive Design DNA for 80%+ consistency
        const buildingDNA = projectContext.buildingDNA || projectContext.masterDesignSpec || projectContext.comprehensiveDNA || {};
        const designContext = projectContext.masterDesignSpec || projectContext.reasoningParams || {};

        // Extract EXACT material specifications from comprehensive DNA
        const dnaMaterialsExt = buildingDNA.materials?.exterior || {};
        const materialPrimaryExt = dnaMaterialsExt.primary || unifiedDesc.materials;
        const materialColorExt = dnaMaterialsExt.color || 'natural';
        const materialTextureExt = dnaMaterialsExt.texture || 'smooth finish';
        const specificMaterialsExt = `${materialPrimaryExt} (${materialColorExt}) with ${materialTextureExt}`;

        // Extract exact roof specifications
        const roofTypeExt = buildingDNA.roof?.type || 'gable';
        const roofMaterialExt = buildingDNA.roof?.material || 'tiles';
        const roofColorExt = buildingDNA.roof?.color || 'dark grey';
        const roofSpecExt = `${roofTypeExt} roof with ${roofMaterialExt} (${roofColorExt})`;

        // Extract exact window specifications
        const windowTypeExt = buildingDNA.windows?.type || 'casement';
        const windowColorExt = buildingDNA.windows?.color || 'white';
        const windowPatternExt = buildingDNA.windows?.pattern || 'regular grid pattern';
        const windowSpecExt = `${windowTypeExt} windows with ${windowColorExt} frames in ${windowPatternExt}`;

        // Get consistency notes
        const consistencyRuleExt = buildingDNA.consistencyNotes?.viewEmphasis3d ||
                                   buildingDNA.consistencyNotes?.criticalForAllViews ||
                                   `Photorealistic ${materialPrimaryExt} (${materialColorExt}) texture`;

        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: specificMaterialsExt,
          prompt: `Professional 3D photorealistic architectural visualization showing ${entranceDir}-facing front view of the SAME ${unifiedDesc.fullDescription} matching floor plan and elevation designs exactly, CRITICAL CONSISTENCY REQUIREMENT: ${consistencyRuleExt}, EXACT MATERIALS: ${specificMaterialsExt} facade construction IDENTICAL to elevation drawings and all other views, ${windowSpecExt} clearly visible matching elevation specifications, ${roofSpecExt} profile EXACTLY as shown in elevations, ${unifiedDesc.features}, main entrance prominently visible on ${entranceDir} side matching elevation drawings, ${unifiedDesc.floorCount} levels height with clear floor separations matching technical dimensions, professional architectural photography, daylight, clear blue sky, photorealistic rendering with accurate ${materialPrimaryExt} (${materialColorExt}) texture and color, high quality, detailed facade showing ${materialTextureExt} of ${materialPrimaryExt}, landscape context with trees and hardscape, design must be identical to floor plans and elevations, unified consistent building, no design variations, MUST USE SAME MATERIALS AND COLORS as all other views (${materialPrimaryExt} in ${materialColorExt}), same ${roofMaterialExt} roof color (${roofColorExt}), same ${windowColorExt} window frames`,
          perspective: 'exterior front view',
          width: 1536,
          height: 1152,
          steps: 60,
          guidanceScale: 8.0
        };

      case 'exterior_side':
        const sideDir = this.getPerpendicularDirection(entranceDir);

        // Extract comprehensive Design DNA for 80%+ consistency
        const buildingDNASide = projectContext.buildingDNA || projectContext.masterDesignSpec || projectContext.comprehensiveDNA || {};

        // Extract EXACT material specifications
        const dnaMaterialsSide = buildingDNASide.materials?.exterior || {};
        const materialPrimarySide = dnaMaterialsSide.primary || unifiedDesc.materials;
        const materialColorSide = dnaMaterialsSide.color || 'natural';
        const materialTextureSide = dnaMaterialsSide.texture || 'smooth finish';
        const specificMaterialsSide = `${materialPrimarySide} (${materialColorSide}) with ${materialTextureSide}`;

        // Extract roof specifications
        const roofTypeSide = buildingDNASide.roof?.type || 'gable';
        const roofMaterialSide = buildingDNASide.roof?.material || 'tiles';
        const roofColorSide = buildingDNASide.roof?.color || 'dark grey';

        // Extract window specifications
        const windowTypeSide = buildingDNASide.windows?.type || 'casement';
        const windowColorSide = buildingDNASide.windows?.color || 'white';
        const windowPatternSide = buildingDNASide.windows?.pattern || 'regular grid pattern';

        // Get consistency notes
        const consistencyRuleSide = buildingDNASide.consistencyNotes?.viewEmphasis3d ||
                                    buildingDNASide.consistencyNotes?.criticalForAllViews ||
                                    `Photorealistic ${materialPrimarySide} (${materialColorSide}) texture`;

        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: specificMaterialsSide,
          prompt: `Professional 3D photorealistic architectural visualization showing ${sideDir} side view of ${unifiedDesc.fullDescription}, CRITICAL CONSISTENCY REQUIREMENT: ${consistencyRuleSide}, EXACT MATERIALS: ${specificMaterialsSide} construction IDENTICAL to front view and elevation drawings, ${windowTypeSide} windows with ${windowColorSide} frames in ${windowPatternSide} matching all other views, ${roofTypeSide} roof with ${roofMaterialSide} (${roofColorSide}) profile, ${unifiedDesc.features}, ${unifiedDesc.floorCount} levels clearly visible with floor separations, professional architectural photography, daylight, clear sky, photorealistic rendering with accurate ${materialPrimarySide} (${materialColorSide}) texture and color, high quality, detailed side facade showing ${materialTextureSide}, landscape context with trees, MUST USE IDENTICAL MATERIALS AND COLORS as front view (${materialPrimarySide} in ${materialColorSide}), same ${roofMaterialSide} roof (${roofColorSide}), same ${windowColorSide} window frames, unified consistent architectural design`,
          perspective: 'exterior side view',
          width: 1024,
          height: 768
        };

      case 'interior':
        const interiorSpace = unifiedDesc.buildingProgram.includes('house') || unifiedDesc.buildingProgram.includes('villa')
          ? 'main living room with open kitchen'
          : unifiedDesc.buildingProgram.includes('office')
          ? 'main office space'
          : 'main interior space';

        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: unifiedDesc.materials,
          prompt: `Professional 3D architectural interior visualization, ${interiorSpace} of ${unifiedDesc.fullDescription}, ${unifiedDesc.architecturalStyle} interior design matching exterior ${unifiedDesc.materials}, spacious interior with ${unifiedDesc.features}, well-lit with natural light from ${entranceDir}-facing windows, professional architectural photography, photorealistic rendering, high quality, detailed furnishings, contemporary furniture`,
          perspective: 'interior view',
          width: 1024,
          height: 768
        };

      case 'site_plan':
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: unifiedDesc.materials,
          prompt: `Aerial view, site plan showing ${unifiedDesc.fullDescription} with clear footprint, entrance on ${entranceDir} side marked, urban context, professional architectural drawing style, technical illustration`,
          perspective: 'aerial view',
          width: 1024,
          height: 1024
        };

      case 'axonometric':
        // Extract Building DNA for perfect consistency
        const buildingDNAAxo = projectContext.buildingDNA || projectContext.masterDesignSpec || {};
        const dnaMaterials = buildingDNAAxo.materials?.exterior || unifiedDesc.materials;
        const dnaRoof = buildingDNAAxo.roof?.type || 'gable roof';
        const dnaWindows = buildingDNAAxo.openings?.windows?.type || buildingDNAAxo.windows?.pattern || 'modern windows';
        const dnaDimensions = buildingDNAAxo.dimensions || {};
        const dnaLength = dnaDimensions.length || dnaDimensions.width || 15;
        const dnaWidth = dnaDimensions.width || dnaDimensions.depth || 10;
        const dnaHeight = dnaDimensions.height || dnaDimensions.floorCount * 3.5 || 7;

        // Use blended style description if available
        const blendedDesc = projectContext.blendedPrompt || (projectContext.blendedStyle?.description);
        const styleContext = blendedDesc
          ? `matching the ${unifiedDesc.architecturalStyle} style design from floor plans and elevations`
          : `in ${unifiedDesc.architecturalStyle} style`;

        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: dnaMaterials,
          prompt: `Professional architectural axonometric 45-degree isometric technical drawing view of the EXACT SAME BUILDING from floor plans and elevations. CRITICAL CONSISTENCY REQUIREMENTS: Building dimensions EXACTLY ${dnaLength}m × ${dnaWidth}m × ${dnaHeight}m, ${unifiedDesc.floorCount} floors, ${entranceDir}-facing entrance on ${entranceDir} side, EXACT materials: ${dnaMaterials} construction IDENTICAL to elevation drawings, roof type: ${dnaRoof} EXACTLY as shown in elevations, windows: ${dnaWindows} EXACTLY matching elevation pattern, ${unifiedDesc.features}, ${styleContext}, isometric 3D projection from 45-degree angle showing complete building volume, floor separation lines visible at each level, technical illustration with architectural precision, clean professional CAD-style lines, MUST USE IDENTICAL MATERIALS AND COLORS as other 3D views (Exterior Front and Side views), same brick/material texture and color palette, unified consistent architectural design, this is the SAME building shown in all other views just from a different angle, high detail precise geometry matching floor plan footprint and elevation facades exactly`,
          perspective: 'axonometric view',
          width: 1024,
          height: 768
        };

      case 'perspective':
        // Extract comprehensive Design DNA for 80%+ consistency
        const buildingDNAPersp = projectContext.buildingDNA || projectContext.masterDesignSpec || projectContext.comprehensiveDNA || {};

        // Extract EXACT material specifications
        const dnaMaterialsPersp = buildingDNAPersp.materials?.exterior || {};
        const materialPrimaryPersp = dnaMaterialsPersp.primary || unifiedDesc.materials;
        const materialColorPersp = dnaMaterialsPersp.color || 'natural';
        const materialTexturePersp = dnaMaterialsPersp.texture || 'smooth finish';
        const specificMaterialsPersp = `${materialPrimaryPersp} (${materialColorPersp}) with ${materialTexturePersp}`;

        // Extract roof specifications
        const roofTypePersp = buildingDNAPersp.roof?.type || 'gable';
        const roofMaterialPersp = buildingDNAPersp.roof?.material || 'tiles';
        const roofColorPersp = buildingDNAPersp.roof?.color || 'dark grey';

        // Extract window specifications
        const windowColorPersp = buildingDNAPersp.windows?.color || 'white';

        // Get color palette for consistency
        const colorPalette = buildingDNAPersp.colorPalette || {};
        const primaryColor = colorPalette.primary || materialColorPersp;

        // Get consistency notes
        const consistencyRulePersp = buildingDNAPersp.consistencyNotes?.viewEmphasis3d ||
                                     buildingDNAPersp.consistencyNotes?.criticalForAllViews ||
                                     `Photorealistic ${materialPrimaryPersp} (${materialColorPersp}) texture`;

        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: specificMaterialsPersp,
          prompt: `Professional architectural perspective rendering of ${unifiedDesc.fullDescription}, dramatic 3D perspective view showing ${entranceDir}-facing entrance with depth and scale, CRITICAL CONSISTENCY REQUIREMENT: ${consistencyRulePersp}, EXACT MATERIALS: ${specificMaterialsPersp} facade IDENTICAL to all other views, ${roofTypePersp} roof with ${roofMaterialPersp} (${roofColorPersp}) profile matching elevations, ${windowColorPersp} window frames matching all views, ${unifiedDesc.features}, ${unifiedDesc.floorCount} levels height, photorealistic architectural rendering with accurate ${materialPrimaryPersp} (${materialColorPersp}) texture showing ${materialTexturePersp}, landscape context with trees and people for scale, golden hour lighting, professional architectural visualization, cinematic composition, high quality detailed rendering, MUST USE CONSISTENT COLOR PALETTE with primary color ${primaryColor}, same materials as front and side views (${materialPrimaryPersp} in ${materialColorPersp}), unified consistent architectural design`,
          perspective: 'perspective view',
          width: 1024,
          height: 768
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
        console.error(`Error generating ${style} variation:`, error);
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
   */
  buildFloorPlanParameters(projectContext, level = 'ground') {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    const levelDescriptions = {
      ground: 'ground floor showing main entrance, living areas, kitchen, common spaces',
      upper: 'upper floor showing bedrooms, private spaces, bathrooms',
      roof: 'roof plan showing mechanical equipment, roof access, terraces, skylights'
    };

    const levelDesc = levelDescriptions[level] || levelDescriptions.ground;

    // Create entrance-aware floor plan description
    const entranceNote = level === 'ground'
      ? `entrance on ${this.getCardinalDirection(unifiedDesc.entranceDirection)} side,`
      : '';

    // Extract additional design details from context if available
    const designContext = projectContext.masterDesignSpec || projectContext.reasoningParams || {};
    const specificMaterials = designContext.materials || unifiedDesc.materials;
    const roofType = designContext.roof?.type || 'flat roof';
    const windowPattern = designContext.windows?.pattern || 'ribbon windows';

    return {
      prompt: `MAXIMUM QUALITY professional CAD architectural floor plan drawing, ${level} floor technical blueprint for ${unifiedDesc.fullDescription}, ${levelDesc}, ${entranceNote} ${unifiedDesc.floorArea}m² total area, ULTRA-PRECISE BLACK AND WHITE CAD-QUALITY TECHNICAL DRAWING showing: thick solid black exterior walls (250mm), interior walls (150mm), door openings with accurate 90° swing arcs, ${windowPattern} shown as double parallel lines with sill details and mullions, wall thickness clearly differentiated, all room labels with area annotations (m²), furniture layout outlines, COMPLETE PROFESSIONAL DIMENSIONING SYSTEM with: dimension chains for all wall segments with measurements in meters, overall building dimensions with extension lines and arrows, room dimensions showing length × width (e.g. 4.50m × 3.80m), window opening widths, door widths (0.90m, 1.20m), wall thicknesses annotated, north arrow with cardinal directions, metric scale bar (1:100), grid reference coordinate system (A-H, 1-10), construction axis lines, STRICTLY 2D ORTHOGRAPHIC TOP-DOWN VIEW, technical blueprint precision matching professional CAD software output (AutoCAD/Revit quality), full professional dimensioning and detailed annotations, ultra-crisp clean lines, maximum detail technical drawing, laser-sharp precise linework, professional construction documentation standards, ${specificMaterials} materials notation, ${roofType} indicated`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: specificMaterials,
      viewType: `floor_plan_${level}`,
      width: 2048,
      height: 2048,
      steps: 70,
      guidanceScale: 9.0,
      negativePrompt: "3D, three dimensional, perspective, isometric, axonometric, rendered, photorealistic, realistic photo, color photograph, shading, shadows, depth, volumetric, elevation view, section view, exterior view, interior view, building facade, roof view from side, blurry, low quality, sketchy, hand drawn, artistic, fuzzy lines, poor detail, incomplete dimensions, missing annotations, low resolution, pixelated"
    };
  }

  /**
   * Build parameters for elevation drawings
   * ENHANCED: Uses comprehensive Design DNA for 80%+ consistency
   */
  buildElevationParameters(projectContext, direction = 'north') {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    // Determine if this is the entrance elevation
    const entranceDir = this.getCardinalDirection(unifiedDesc.entranceDirection);
    const isEntranceElevation = direction === entranceDir;
    const elevationType = isEntranceElevation ? 'main entrance elevation' : 'side elevation';

    // Extract comprehensive Design DNA for 80%+ consistency
    const buildingDNA = projectContext.buildingDNA || projectContext.masterDesignSpec || projectContext.comprehensiveDNA || {};
    const designContext = projectContext.masterDesignSpec || projectContext.reasoningParams || {};

    // Extract EXACT material specifications from comprehensive DNA
    const dnaMaterials = buildingDNA.materials?.exterior || {};
    const materialPrimary = dnaMaterials.primary || unifiedDesc.materials;
    const materialColor = dnaMaterials.color || 'natural';
    const materialTexture = dnaMaterials.texture || 'smooth finish';
    const materialFinish = dnaMaterials.finish || 'matte';

    // Construct detailed material description for consistency
    const specificMaterials = `${materialPrimary} (${materialColor}) with ${materialTexture}, ${materialFinish} finish`;

    // Extract exact roof specifications
    const roofType = buildingDNA.roof?.type || 'gable';
    const roofMaterial = buildingDNA.roof?.material || 'tiles';
    const roofColor = buildingDNA.roof?.color || 'dark grey';
    const roofSpec = `${roofType} ${roofMaterial} (${roofColor})`;

    // Extract exact window specifications
    const windowType = buildingDNA.windows?.type || 'casement';
    const windowColor = buildingDNA.windows?.color || 'white';
    const windowFrame = buildingDNA.materials?.windows?.frame || `${windowColor} frames`;
    const windowPattern = buildingDNA.windows?.pattern || 'regular grid pattern';
    const windowSpec = `${windowType} windows with ${windowFrame}, ${windowPattern}`;

    // Extract dimensions
    const floorHeight = buildingDNA.dimensions?.floorHeight || designContext.dimensions?.floorHeight || 3.2;
    const totalHeight = buildingDNA.dimensions?.height || (floorHeight * unifiedDesc.floorCount);

    // Get consistency notes for elevations
    const consistencyRule = buildingDNA.consistencyNotes?.elevationEmphasis ||
                           buildingDNA.consistencyNotes?.criticalForAllViews ||
                           `MUST USE: ${materialPrimary} (${materialColor}) for ALL exterior walls`;

    return {
      prompt: `MAXIMUM QUALITY professional CAD architectural elevation drawing, ${direction} ${elevationType} technical blueprint of ${unifiedDesc.fullDescription}, STRICTLY FLAT 2D FACADE VIEW ORTHOGRAPHIC PROJECTION, CRITICAL CONSISTENCY REQUIREMENT: ${consistencyRule}, ULTRA-PRECISE CAD-QUALITY TECHNICAL DRAWING showing: ${unifiedDesc.floorCount} floor levels stacked vertically with clear floor division lines at ${floorHeight}m intervals, EXACT MATERIALS: ${specificMaterials} facade construction IDENTICAL to 3D views and other elevations, materials shown with professional architectural hatching patterns and textures indicating ${materialPrimary} (${materialColor}) with ${materialTexture}, ${windowSpec} shown as precise rectangles with glazing lines and mullions, door openings with frame details and thresholds${isEntranceElevation ? ', main entrance door clearly articulated with threshold, frame, and canopy' : ''}, ground line marked (±0.00m), ${roofSpec} profile with edge detail and parapet/eaves, floor separation lines at each level at ${floorHeight}m spacing, COMPLETE PROFESSIONAL DIMENSIONING SYSTEM: vertical dimension chains showing floor heights (+0.00m, +${floorHeight}m, +${floorHeight*2}m, etc.), floor-to-floor heights (${floorHeight}m typical), total building height ${totalHeight}m dimension with extension lines, horizontal dimensions showing overall building width, facade bay modules and structural grid spacing, window opening dimensions (height × width), door opening dimensions, dimension extension lines with clear arrows, dimension text in meters clearly labeled and legible, elevation level markers at each floor level, ground level reference datum (±0.00m), material legend showing ${materialPrimary} (${materialColor}), detail reference bubbles and section cut indicators, ORTHOGRAPHIC PROJECTION technical precision matching AutoCAD/Revit output quality, professional CAD-style architectural construction documentation with full dimensioning system and annotations, ultra-crisp clean black and white linework, maximum detail technical drawing, laser-sharp precise lines, professional construction documentation standards, MUST USE IDENTICAL MATERIALS AND COLORS as all other elevations (${materialPrimary} in ${materialColor}), unified consistent architectural design`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: specificMaterials,
      viewType: `elevation_${direction}`,
      width: 2048,
      height: 1536,
      steps: 70,
      guidanceScale: 9.0,
      negativePrompt: "3D, three dimensional, perspective, isometric, axonometric, rendered, photorealistic, realistic photo, color photograph, shading, shadows, depth, volumetric, floor plan, top view, plan view, bird's eye view, interior view, section cut, blurry, low quality, sketchy, hand drawn, artistic, fuzzy lines, poor detail, incomplete dimensions, missing annotations, low resolution, pixelated, inconsistent design, yellow walls, wrong material color, incorrect materials"
      // Removed ControlNet completely - elevations should be independent 2D drawings
    };
  }

  /**
   * Build parameters for section drawings
   * ENHANCED: Uses comprehensive Design DNA for 80%+ consistency
   */
  buildSectionParameters(projectContext, sectionType = 'longitudinal') {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    const sectionDesc = sectionType === 'longitudinal'
      ? 'longitudinal section, length-wise cut through building showing entrance to back'
      : 'cross section, width-wise cut through building';

    // Extract comprehensive Design DNA for 80%+ consistency
    const buildingDNA = projectContext.buildingDNA || projectContext.masterDesignSpec || projectContext.comprehensiveDNA || {};
    const designContext = projectContext.masterDesignSpec || projectContext.reasoningParams || {};

    // Extract EXACT material specifications from comprehensive DNA
    const dnaMaterials = buildingDNA.materials?.exterior || {};
    const materialPrimary = dnaMaterials.primary || unifiedDesc.materials;
    const materialColor = dnaMaterials.color || 'natural';
    const materialTexture = dnaMaterials.texture || 'smooth finish';
    const specificMaterials = `${materialPrimary} (${materialColor}) with ${materialTexture}`;

    // Extract exact roof specifications
    const roofType = buildingDNA.roof?.type || 'gable';
    const roofMaterial = buildingDNA.roof?.material || 'tiles';
    const roofPitch = buildingDNA.roof?.pitch || 'medium 40-45 degrees';
    const roofSpec = `${roofType} ${roofMaterial} at ${roofPitch}`;

    // Extract exact dimensions
    const floorHeight = buildingDNA.dimensions?.floorHeight || designContext.dimensions?.floorHeight || 3.2;
    const totalHeight = buildingDNA.dimensions?.height || (floorHeight * unifiedDesc.floorCount);
    const buildingLength = buildingDNA.dimensions?.length || 15;
    const buildingWidth = buildingDNA.dimensions?.width || 10;
    const ceilingHeight = 2.7;

    // Get consistency notes
    const consistencyRule = buildingDNA.consistencyNotes?.criticalForAllViews ||
                           `MUST USE: ${materialPrimary} (${materialColor}) for ALL exterior walls`;

    return {
      prompt: `MAXIMUM QUALITY professional CAD architectural section drawing, ${sectionDesc} technical blueprint of ${unifiedDesc.fullDescription}, STRICTLY FLAT 2D CUT-THROUGH VIEW ORTHOGRAPHIC PROJECTION, CRITICAL CONSISTENCY REQUIREMENT: ${consistencyRule}, ULTRA-PRECISE CAD-QUALITY TECHNICAL DRAWING showing: all ${unifiedDesc.floorCount} floor levels stacked vertically at ${floorHeight}m intervals with clear separation lines, floor slabs shown as thick horizontal lines (200mm reinforced concrete), walls in section cut shown as thick solid black lines with poché (solid black fill indicating cut elements) using EXACT MATERIALS: ${specificMaterials} construction, interior room heights clearly visible with ${ceilingHeight}m ceiling clearance, stairs with detailed treads (280mm) and risers (175mm)${unifiedDesc.floorCount > 1 ? ' connecting all floors with proper 30° rise and run, handrails indicated' : ''}, foundation wall (300mm) and spread footing shown below grade (-1.20m), ${roofSpec} structure in section with rafters/joists spacing (600mm o.c.) and roof assembly layers (waterproofing, insulation, structure), ${specificMaterials} construction assembly indicated with professional architectural hatching patterns showing ${materialPrimary} (${materialColor}) construction (masonry coursing, concrete solid fill, insulation diagonal lines, structural steel cross-hatching), structural elements (beams 300×600mm, columns 300×300mm) clearly shown in section cut, COMPLETE PROFESSIONAL DIMENSIONING SYSTEM: vertical dimension chains showing floor heights (+0.00m, +${floorHeight}m, +${floorHeight*2}m, etc.), ceiling heights (${ceilingHeight}m typical), total building height ${totalHeight}m with parapet, foundation depth below grade (-1.20m), horizontal dimensions showing room widths ${sectionType === 'longitudinal' ? buildingLength : buildingWidth}m, building depth, structural bay spacing, dimension extension lines with arrows, dimension text in meters clearly labeled, section cut line indicators (Section A-A or Section B-B), level markers and datum references at each floor, material notation legend showing ${materialPrimary} (${materialColor}) with hatching key, detail reference callouts (numbered circles), finish floor level indicators (FFL), ORTHOGRAPHIC PROJECTION technical precision matching AutoCAD/Revit quality, section cut poché (solid black fill) for all cut structural elements, professional CAD-style construction documentation, architectural blueprint quality, ultra-crisp clean black and white linework, maximum technical detail, laser-sharp precise lines, ${materialPrimary} (${materialColor}) wall construction clearly indicated`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: specificMaterials,
      viewType: `section_${sectionType}`,
      width: 2048,
      height: 1536,
      steps: 70,
      guidanceScale: 9.0,
      negativePrompt: "3D, three dimensional, perspective, isometric, axonometric, rendered, photorealistic, realistic photo, color photograph, shading, shadows, depth, volumetric, floor plan, top view, plan view, elevation view, exterior view, facade, blurry, low quality, sketchy, hand drawn, artistic, fuzzy lines, poor detail, incomplete dimensions, missing annotations, low resolution, pixelated, inconsistent design, wrong material color, incorrect materials"
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
      console.log('🎯 Using floor plan as ControlNet control image for 3D preview');
    }

    return params;
  }

  /**
   * Get fallback floor plan when API is unavailable
   */
  getFallbackFloorPlan(projectContext) {
    return {
      success: false,
      isFallback: true,
      floorPlan: {
        images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=2D+Floor+Plan+Placeholder'],
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
        images: ['https://via.placeholder.com/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder'],
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
        images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Ground+Floor+Plan'],
        success: false
      },
      roof: {
        images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Roof+Plan'],
        success: false
      }
    };

    if (floorCount > 1) {
      fallbackPlans.upper = {
        images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Upper+Floor+Plan'],
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
          images: ['https://via.placeholder.com/1024x768/34495E/FFFFFF?text=North+Elevation'],
          success: false
        },
        elevation_south: {
          images: ['https://via.placeholder.com/1024x768/34495E/FFFFFF?text=South+Elevation'],
          success: false
        },
        elevation_east: {
          images: ['https://via.placeholder.com/1024x768/34495E/FFFFFF?text=East+Elevation'],
          success: false
        },
        elevation_west: {
          images: ['https://via.placeholder.com/1024x768/34495E/FFFFFF?text=West+Elevation'],
          success: false
        },
        section_longitudinal: {
          images: ['https://via.placeholder.com/1024x768/2C3E50/FFFFFF?text=Longitudinal+Section'],
          success: false
        },
        section_cross: {
          images: ['https://via.placeholder.com/1024x768/2C3E50/FFFFFF?text=Cross+Section'],
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
    const { viewType = 'exterior', style = 'contemporary' } = params;

    // Return placeholder image URLs based on view type
    const fallbackImages = {
      exterior: 'https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Exterior+View+Placeholder',
      exterior_front: 'https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Front+View',
      exterior_side: 'https://via.placeholder.com/1024x768/5AA3E5/FFFFFF?text=Side+View',
      interior: 'https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Interior+View+Placeholder',
      site_plan: 'https://via.placeholder.com/1024x1024/9013FE/FFFFFF?text=Site+Plan+Placeholder',
      section: 'https://via.placeholder.com/1024x768/F5A623/FFFFFF?text=Section+View+Placeholder',
      section_longitudinal: 'https://via.placeholder.com/1024x768/F5A623/FFFFFF?text=Longitudinal+Section',
      section_cross: 'https://via.placeholder.com/1024x768/E89611/FFFFFF?text=Cross+Section',
      floor_plan: 'https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Floor+Plan+Placeholder',
      floor_plan_ground: 'https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Ground+Floor+Plan',
      floor_plan_upper: 'https://via.placeholder.com/1024x1024/34495E/FFFFFF?text=Upper+Floor+Plan',
      floor_plan_roof: 'https://via.placeholder.com/1024x1024/1A252F/FFFFFF?text=Roof+Plan',
      elevation_north: 'https://via.placeholder.com/1024x768/8B4513/FFFFFF?text=North+Elevation',
      elevation_south: 'https://via.placeholder.com/1024x768/A0522D/FFFFFF?text=South+Elevation',
      elevation_east: 'https://via.placeholder.com/1024x768/CD853F/FFFFFF?text=East+Elevation',
      elevation_west: 'https://via.placeholder.com/1024x768/D2691E/FFFFFF?text=West+Elevation',
      '3d_preview': 'https://via.placeholder.com/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder'
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
    if (!this.apiKey) {
      return { status: 'unavailable', message: 'API key not configured' };
    }

    try {
      const url = process.env.NODE_ENV === 'production'
        ? `/api/replicate-status?id=${predictionId}`
        : `http://localhost:3001/api/replicate/predictions/${predictionId}`;

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
    if (!this.apiKey) {
      return { success: false, message: 'API key not configured' };
    }

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

export default new ReplicateService();
