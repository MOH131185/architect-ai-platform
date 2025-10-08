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
      // Use strong conditioning for technical drawings to ensure consistency
      controlNetParams.controlnet_conditioning_scale = params.conditioning_scale || 0.9;
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
   * Optimized to generate only ground floor by default, with option for full generation
   */
  async generateMultiLevelFloorPlans(projectContext, generateAllLevels = false) {
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
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: unifiedDesc.materials,
          prompt: `Professional 3D architectural visualization showing ${entranceDir}-facing front view of ${unifiedDesc.fullDescription}, ${unifiedDesc.materials} facade, ${unifiedDesc.features}, main entrance clearly visible on ${entranceDir} side, ${unifiedDesc.floorCount} levels height, professional architectural photography, daylight, clear blue sky, photorealistic rendering, high quality, detailed facade, landscape context matching floor plan`,
          perspective: 'exterior front view',
          width: 1024,
          height: 768
        };

      case 'exterior_side':
        const sideDir = this.getPerpendicularDirection(entranceDir);
        return {
          buildingType: unifiedDesc.buildingType,
          architecturalStyle: unifiedDesc.architecturalStyle,
          materials: unifiedDesc.materials,
          prompt: `Professional 3D architectural visualization showing ${sideDir} side view of ${unifiedDesc.fullDescription}, ${unifiedDesc.materials} construction, ${unifiedDesc.features}, ${unifiedDesc.floorCount} levels clearly visible, professional architectural photography, daylight, clear sky, photorealistic rendering, high quality, detailed side facade, landscape context with trees`,
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

    return {
      prompt: `Professional architectural floor plan for ${unifiedDesc.fullDescription}, ${levelDesc}, ${entranceNote} ${unifiedDesc.floorArea}m² total floor area, ${unifiedDesc.materials} construction indicated, showing ${unifiedDesc.features}, technical drawing style, 2D top-view plan, detailed room layout with dimensions, walls, doors, windows, furniture layout, professional architectural drafting, black and white line drawing with annotations, precise measurements, architectural blueprint style, clean technical drawing`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: unifiedDesc.materials,
      viewType: `floor_plan_${level}`,
      width: 1024,
      height: 1024,
      steps: 40,
      guidanceScale: 7.0,
      negativePrompt: "3D, perspective, color photograph, realistic photo, photorealistic, blurry, low quality, sketchy, hand drawn"
    };
  }

  /**
   * Build parameters for elevation drawings
   */
  buildElevationParameters(projectContext, direction = 'north') {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    // Determine if this is the entrance elevation
    const entranceDir = this.getCardinalDirection(unifiedDesc.entranceDirection);
    const isEntranceElevation = direction === entranceDir;
    const elevationType = isEntranceElevation ? 'main entrance elevation' : 'side elevation';

    return {
      prompt: `Professional architectural elevation drawing derived from floor plan layout, ${direction} ${elevationType} of ${unifiedDesc.fullDescription}, MATCHING the floor plan footprint and proportions, showing ${unifiedDesc.floorCount} levels, ${unifiedDesc.materials} facade, ${unifiedDesc.features}, windows and doors positioned according to floor plan, technical drawing style, orthographic projection, 2D elevation view, detailed facade with accurate window placement${isEntranceElevation ? ', prominent main entrance as shown in floor plan' : ''}, materials indication, professional architectural drafting, black and white line drawing with hatching, precise proportions matching floor plan dimensions, architectural blueprint style, clean technical drawing, CONSISTENT with floor plan layout`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: unifiedDesc.materials,
      viewType: `elevation_${direction}`,
      width: 1024,
      height: 768,
      steps: 40,
      guidanceScale: 7.0,
      negativePrompt: "3D, perspective, color photograph, realistic photo, photorealistic, floor plan, blurry, low quality",
      conditioning_scale: 0.9 // Strong ControlNet conditioning for floor plan consistency
    };
  }

  /**
   * Build parameters for section drawings
   */
  buildSectionParameters(projectContext, sectionType = 'longitudinal') {
    // Get unified building description for consistency
    const unifiedDesc = this.createUnifiedBuildingDescription(projectContext);

    const sectionDesc = sectionType === 'longitudinal'
      ? 'longitudinal section, length-wise cut through building showing entrance to back'
      : 'cross section, width-wise cut through building';

    return {
      prompt: `Professional architectural section drawing derived from floor plan layout, ${sectionDesc} of ${unifiedDesc.fullDescription}, MATCHING the floor plan spatial arrangement and room layout, showing all ${unifiedDesc.floorCount} floor levels, interior spaces visible with ${unifiedDesc.features}, ceiling heights corresponding to floor plan dimensions, floor slabs, structural elements, stairs${unifiedDesc.floorCount > 1 ? ', vertical circulation' : ''}, ${unifiedDesc.materials} construction system, technical drawing style, orthographic projection, 2D section view, detailed interior heights and materials, professional architectural drafting, black and white line drawing with hatching and poché, precise vertical proportions matching floor plan, architectural blueprint style, clean technical drawing, CONSISTENT with floor plan layout`,
      buildingType: unifiedDesc.buildingType,
      architecturalStyle: unifiedDesc.architecturalStyle,
      materials: unifiedDesc.materials,
      viewType: `section_${sectionType}`,
      width: 1024,
      height: 768,
      steps: 40,
      guidanceScale: 7.0,
      negativePrompt: "3D, perspective, color photograph, realistic photo, photorealistic, floor plan, elevation, blurry, low quality",
      conditioning_scale: 0.9 // Strong ControlNet conditioning for floor plan consistency
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
