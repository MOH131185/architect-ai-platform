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
   * Generate architectural visualization using SDXL Multi-ControlNet LoRA
   * @param {Object} generationParams - Parameters for image generation
   * @returns {Promise<Object>} Generation result with image URLs
   */
  async generateArchitecturalImage(generationParams) {
    if (!this.apiKey) {
      return this.getFallbackImage(generationParams);
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
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackImage(generationParams)
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
    
    if (params.controlImage) {
      controlNetParams.image = params.controlImage;
    }
    
    if (params.controlType) {
      controlNetParams.controlnet_conditioning_scale = params.controlType === 'canny' ? 1.0 : 0.8;
    }

    return controlNetParams;
  }

  /**
   * Generate multiple architectural views
   */
  async generateMultipleViews(projectContext, viewTypes = ['exterior', 'interior', 'site_plan']) {
    const results = {};
    
    for (const viewType of viewTypes) {
      try {
        const params = this.buildViewParameters(projectContext, viewType);
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
   */
  async generate3DPreview(projectContext) {
    if (!this.apiKey) {
      return this.getFallback3DPreview(projectContext);
    }

    try {
      const params = this.build3DPreviewParameters(projectContext);
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
    const baseParams = {
      buildingType: projectContext.buildingProgram || 'commercial building',
      architecturalStyle: projectContext.architecturalStyle || 'contemporary',
      location: projectContext.location?.address || 'urban setting',
      materials: projectContext.materials || 'glass and steel'
    };

    switch (viewType) {
      case 'exterior':
        return {
          ...baseParams,
          prompt: `${baseParams.architecturalStyle} ${baseParams.buildingType} exterior view, ${baseParams.materials}, professional architectural photography, daylight, clear sky, photorealistic`,
          perspective: 'exterior view',
          width: 1024,
          height: 768
        };

      case 'interior':
        return {
          ...baseParams,
          prompt: `Interior view of ${baseParams.buildingType}, modern ${baseParams.architecturalStyle} design, spacious, well-lit, professional architectural photography, photorealistic`,
          perspective: 'interior view',
          width: 1024,
          height: 768
        };

      case 'site_plan':
        return {
          ...baseParams,
          prompt: `Aerial view, site plan, ${baseParams.buildingType} in ${baseParams.location}, urban context, professional architectural drawing style, technical illustration`,
          perspective: 'aerial view',
          width: 1024,
          height: 1024
        };

      case 'section':
        return {
          ...baseParams,
          prompt: `Architectural section view, ${baseParams.buildingType}, technical drawing style, professional architectural illustration, detailed, precise`,
          perspective: 'section view',
          width: 1024,
          height: 768
        };

      default:
        return baseParams;
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
  buildFloorPlanParameters(projectContext) {
    const {
      buildingProgram = 'commercial building',
      architecturalStyle = 'contemporary',
      location = 'urban setting',
      materials = 'glass and steel',
      area = '1000 sq ft',
      roomProgram = null
    } = projectContext;

    // Build detailed room description from room program if available
    let roomDescription = 'functional room layout';
    if (roomProgram && roomProgram.spaces && roomProgram.spaces.length > 0) {
      const majorSpaces = roomProgram.spaces.slice(0, 4).map(space => space.name).join(', ');
      roomDescription = `with ${majorSpaces}`;
    }

    return {
      prompt: `Professional architectural floor plan, ${architecturalStyle} ${buildingProgram}, ${area} total area, ${roomDescription}, technical drawing style, 2D top-down plan view, detailed room layout with labeled spaces, dimension lines, door swings, window openings, wall thickness, furniture layout, professional architectural drafting, clean black and white line drawing, precise measurements, architectural blueprint style, high resolution, detailed annotations`,
      buildingType: buildingProgram,
      architecturalStyle,
      location,
      materials,
      viewType: 'floor_plan',
      width: 1024,
      height: 1024,
      steps: 50,
      guidanceScale: 7.5,
      negativePrompt: "3D, perspective, color photograph, realistic rendering, photorealistic, blurry, low quality, sketchy, incomplete, distorted"
    };
  }

  /**
   * Generate 2D section view
   */
  async generateSection(projectContext) {
    if (!this.apiKey) {
      return this.getFallbackSection(projectContext);
    }

    try {
      const params = this.buildSectionParameters(projectContext);
      const result = await this.generateArchitecturalImage(params);

      return {
        success: true,
        section: result,
        type: '2d_section',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Section generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackSection(projectContext)
      };
    }
  }

  /**
   * Build parameters for 2D section view generation
   */
  buildSectionParameters(projectContext) {
    const {
      buildingProgram = 'commercial building',
      architecturalStyle = 'contemporary',
      materials = 'glass and steel',
      stories = 2,
      structuralSystem = 'concrete frame'
    } = projectContext;

    return {
      prompt: `Professional architectural section view, ${architecturalStyle} ${buildingProgram}, ${stories} stories, ${structuralSystem}, showing floor levels, roof structure, foundation, ceiling heights, vertical circulation, structural elements, technical drawing style, 2D cross-section, dimension lines, material annotations, professional architectural drafting, clean black and white line drawing, precise measurements, architectural blueprint style, high resolution, detailed construction details`,
      buildingType: buildingProgram,
      architecturalStyle,
      materials,
      viewType: 'section',
      width: 1024,
      height: 768,
      steps: 50,
      guidanceScale: 7.5,
      negativePrompt: "3D, perspective, color photograph, realistic rendering, photorealistic, floor plan, elevation, blurry, low quality, sketchy"
    };
  }

  /**
   * Generate four elevation views
   */
  async generateElevations(projectContext) {
    if (!this.apiKey) {
      return this.getFallbackElevations(projectContext);
    }

    try {
      const elevations = {};
      const directions = ['north', 'south', 'east', 'west'];

      for (const direction of directions) {
        const params = this.buildElevationParameters(projectContext, direction);
        const result = await this.generateArchitecturalImage(params);
        elevations[direction] = result;
      }

      return {
        success: true,
        elevations,
        type: '2d_elevations',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Elevation generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackElevations(projectContext)
      };
    }
  }

  /**
   * Build parameters for elevation view generation
   */
  buildElevationParameters(projectContext, direction) {
    const {
      buildingProgram = 'commercial building',
      architecturalStyle = 'contemporary',
      materials = 'glass and steel',
      stories = 2,
      facadeFeatures = 'large windows, modern cladding'
    } = projectContext;

    return {
      prompt: `Professional architectural ${direction} elevation view, ${architecturalStyle} ${buildingProgram}, ${stories} stories, ${materials} facade, ${facadeFeatures}, technical drawing style, 2D front view, dimension lines, window and door openings, material annotations, height measurements, professional architectural drafting, clean black and white line drawing, precise measurements, architectural blueprint style, high resolution, detailed facade composition`,
      buildingType: buildingProgram,
      architecturalStyle,
      materials,
      viewType: `${direction}_elevation`,
      width: 1024,
      height: 768,
      steps: 50,
      guidanceScale: 7.5,
      negativePrompt: "3D, perspective, color photograph, realistic rendering, photorealistic, floor plan, section, blurry, low quality, sketchy, distorted"
    };
  }

  /**
   * Get fallback section when API is unavailable
   */
  getFallbackSection(projectContext) {
    return {
      success: false,
      isFallback: true,
      section: {
        images: ['https://via.placeholder.com/1024x768/34495E/FFFFFF?text=2D+Section+Placeholder'],
        message: 'Using placeholder section - API unavailable'
      },
      type: '2d_section',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback elevations when API is unavailable
   */
  getFallbackElevations(projectContext) {
    return {
      success: false,
      isFallback: true,
      elevations: {
        north: {
          images: ['https://via.placeholder.com/1024x768/2C3E50/FFFFFF?text=North+Elevation+Placeholder'],
          message: 'Using placeholder - API unavailable'
        },
        south: {
          images: ['https://via.placeholder.com/1024x768/34495E/FFFFFF?text=South+Elevation+Placeholder'],
          message: 'Using placeholder - API unavailable'
        },
        east: {
          images: ['https://via.placeholder.com/1024x768/5D6D7E/FFFFFF?text=East+Elevation+Placeholder'],
          message: 'Using placeholder - API unavailable'
        },
        west: {
          images: ['https://via.placeholder.com/1024x768/7F8C8D/FFFFFF?text=West+Elevation+Placeholder'],
          message: 'Using placeholder - API unavailable'
        }
      },
      type: '2d_elevations',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build parameters for 3D preview generation
   */
  build3DPreviewParameters(projectContext) {
    const {
      buildingProgram = 'commercial building',
      architecturalStyle = 'contemporary',
      location = 'urban setting',
      materials = 'glass and steel'
    } = projectContext;

    return {
      prompt: `Professional 3D architectural visualization, ${architecturalStyle} ${buildingProgram} in ${location}, constructed with ${materials}, photorealistic rendering, professional architectural photography, high quality, detailed, 3D perspective view, modern design, clean lines, natural lighting, professional rendering, high resolution ≥1024×1024 pixels, medium to high detail, dramatic composition, contextual environment`,
      buildingType: buildingProgram,
      architecturalStyle,
      location,
      materials,
      viewType: '3d_preview',
      width: 1024,
      height: 1024,
      steps: 60,
      guidanceScale: 8.5,
      negativePrompt: "2D, floor plan, technical drawing, blueprint, black and white, line drawing, blurry, low quality, low resolution, pixelated, distorted"
    };
  }

  /**
   * Generate multiple 3D exterior views from different angles
   */
  async generate3DExteriorViews(projectContext, viewAngles = ['front', 'rear', 'aerial', 'street']) {
    if (!this.apiKey) {
      return this.getFallback3DExteriorViews(projectContext);
    }

    try {
      const views = {};

      for (const angle of viewAngles) {
        const params = this.build3DExteriorViewParameters(projectContext, angle);
        const result = await this.generateArchitecturalImage(params);
        views[angle] = result;
      }

      return {
        success: true,
        exteriorViews: views,
        type: '3d_exterior_views',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('3D exterior views generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallback3DExteriorViews(projectContext)
      };
    }
  }

  /**
   * Build parameters for 3D exterior view from specific angle
   */
  build3DExteriorViewParameters(projectContext, angle) {
    const {
      buildingProgram = 'commercial building',
      architecturalStyle = 'contemporary',
      location = 'urban setting',
      materials = 'glass and steel',
      context = 'urban context with landscaping'
    } = projectContext;

    const angleDescriptions = {
      front: 'front perspective view at eye level, main entrance visible',
      rear: 'rear perspective view showing back facade',
      aerial: 'aerial perspective view from 45-degree angle showing roof and massing',
      street: 'street-level perspective view showing building in urban context'
    };

    const angleDescription = angleDescriptions[angle] || 'perspective view';

    return {
      prompt: `Professional 3D architectural exterior visualization, ${angleDescription}, ${architecturalStyle} ${buildingProgram} in ${location}, constructed with ${materials}, ${context}, photorealistic rendering, professional architectural photography, high quality, detailed, natural daylight lighting, professional rendering, high resolution ≥1024×1024 pixels, medium to high detail, dramatic composition`,
      buildingType: buildingProgram,
      architecturalStyle,
      location,
      materials,
      viewType: `3d_exterior_${angle}`,
      width: 1024,
      height: 1024,
      steps: 60,
      guidanceScale: 8.5,
      negativePrompt: "2D, floor plan, technical drawing, blueprint, black and white, line drawing, blurry, low quality, low resolution, pixelated, distorted, interior view"
    };
  }

  /**
   * Generate multiple 3D interior views
   */
  async generate3DInteriorViews(projectContext, spaces = ['lobby', 'main-space']) {
    if (!this.apiKey) {
      return this.getFallback3DInteriorViews(projectContext);
    }

    try {
      const views = {};

      for (const space of spaces) {
        const params = this.build3DInteriorViewParameters(projectContext, space);
        const result = await this.generateArchitecturalImage(params);
        views[space] = result;
      }

      return {
        success: true,
        interiorViews: views,
        type: '3d_interior_views',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('3D interior views generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallback3DInteriorViews(projectContext)
      };
    }
  }

  /**
   * Build parameters for 3D interior view of specific space
   */
  build3DInteriorViewParameters(projectContext, space) {
    const {
      buildingProgram = 'commercial building',
      architecturalStyle = 'contemporary',
      materials = 'glass and steel',
      interiorFinishes = 'modern finishes with natural materials'
    } = projectContext;

    const spaceDescriptions = {
      lobby: 'main lobby or entrance hall with reception area',
      'main-space': 'primary functional space with furniture and fixtures',
      office: 'open office space with workstations',
      residential: 'residential living space with furniture'
    };

    const spaceDescription = spaceDescriptions[space] || 'interior space';

    return {
      prompt: `Professional 3D architectural interior visualization, ${spaceDescription}, ${architecturalStyle} design style, ${buildingProgram}, ${interiorFinishes}, photorealistic rendering, professional architectural photography, high quality, detailed, natural and artificial lighting, professional rendering, high resolution ≥1024×1024 pixels, medium to high detail, atmospheric composition, visible materials and textures`,
      buildingType: buildingProgram,
      architecturalStyle,
      materials,
      viewType: `3d_interior_${space}`,
      width: 1024,
      height: 1024,
      steps: 60,
      guidanceScale: 8.5,
      negativePrompt: "2D, floor plan, technical drawing, blueprint, black and white, line drawing, blurry, low quality, low resolution, pixelated, distorted, exterior view"
    };
  }

  /**
   * Get fallback 3D exterior views
   */
  getFallback3DExteriorViews(projectContext) {
    return {
      success: false,
      isFallback: true,
      exteriorViews: {
        front: {
          images: ['https://via.placeholder.com/1024x1024/3498DB/FFFFFF?text=Front+Exterior+View+Placeholder'],
          message: 'Using placeholder - API unavailable'
        },
        rear: {
          images: ['https://via.placeholder.com/1024x1024/2980B9/FFFFFF?text=Rear+Exterior+View+Placeholder'],
          message: 'Using placeholder - API unavailable'
        },
        aerial: {
          images: ['https://via.placeholder.com/1024x1024/5DADE2/FFFFFF?text=Aerial+View+Placeholder'],
          message: 'Using placeholder - API unavailable'
        },
        street: {
          images: ['https://via.placeholder.com/1024x1024/3498DB/FFFFFF?text=Street+View+Placeholder'],
          message: 'Using placeholder - API unavailable'
        }
      },
      type: '3d_exterior_views',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback 3D interior views
   */
  getFallback3DInteriorViews(projectContext) {
    return {
      success: false,
      isFallback: true,
      interiorViews: {
        lobby: {
          images: ['https://via.placeholder.com/1024x1024/7ED321/FFFFFF?text=Lobby+Interior+Placeholder'],
          message: 'Using placeholder - API unavailable'
        },
        'main-space': {
          images: ['https://via.placeholder.com/1024x1024/50C878/FFFFFF?text=Main+Space+Interior+Placeholder'],
          message: 'Using placeholder - API unavailable'
        }
      },
      type: '3d_interior_views',
      timestamp: new Date().toISOString()
    };
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
   * Get fallback image when API is unavailable
   */
  getFallbackImage(params) {
    const { viewType = 'exterior', style = 'contemporary' } = params;
    
    // Return placeholder image URLs based on view type
    const fallbackImages = {
      exterior: 'https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Exterior+View+Placeholder',
      interior: 'https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Interior+View+Placeholder',
      site_plan: 'https://via.placeholder.com/1024x1024/9013FE/FFFFFF?text=Site+Plan+Placeholder',
      section: 'https://via.placeholder.com/1024x768/F5A623/FFFFFF?text=Section+View+Placeholder',
      floor_plan: 'https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Floor+Plan+Placeholder',
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
