/**
 * Replicate Service for Architectural Image Generation
 * Uses SDXL Multi-ControlNet LoRA for architectural visualization
 */

// In production, we don't need the API key on client side - serverless functions handle it
// This check is only for development
const REPLICATE_API_KEY = typeof process !== 'undefined' && process.env
  ? process.env.REACT_APP_REPLICATE_API_KEY
  : null;

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
    this.isProduction = process.env.NODE_ENV === 'production';

    // In production, we don't need the API key on client side - the serverless functions handle it
    // Only check for API key in development
    if (!this.apiKey && !this.isProduction) {
      console.warn('Replicate API key not found in development. Image generation will use placeholder images.');
    }

    // Log the environment for debugging
    console.log('🔧 ReplicateService initialized:', {
      isProduction: this.isProduction,
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey?.length || 0,
      urls: {
        predictions: REPLICATE_API_PROXY_URL,
        status: REPLICATE_STATUS_URL
      }
    });
  }

  /**
   * Generate architectural visualization using SDXL Multi-ControlNet LoRA
   * @param {Object} generationParams - Parameters for image generation
   * @returns {Promise<Object>} Generation result with image URLs
   */
  async generateArchitecturalImage(generationParams) {
    console.log('🎨 Starting image generation:', {
      viewType: generationParams.viewType,
      hasApiKey: !!this.apiKey,
      isProduction: this.isProduction
    });

    // In production, serverless functions handle auth - no client-side key needed
    // In development, we need the API key
    if (!this.isProduction && !this.apiKey) {
      console.warn('⚠️ No API key in development, using fallback');
      return this.getFallbackImage(generationParams);
    }

    try {
      console.log('📡 Creating prediction...');
      const prediction = await this.createPrediction(generationParams);

      console.log('⏳ Waiting for completion...');
      const result = await this.waitForCompletion(prediction.id);

      console.log('✅ Generation successful:', {
        predictionId: prediction.id,
        outputType: typeof result.output,
        outputIsArray: Array.isArray(result.output),
        outputLength: result.output?.length,
        output: result.output
      });

      return {
        success: true,
        images: result.output,
        predictionId: prediction.id,
        parameters: generationParams,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Replicate generation error:', error);
      const fallbackImage = this.getFallbackImage(generationParams);
      console.log('🔄 Using fallback image:', fallbackImage);
      return {
        success: false,
        error: error.message,
        images: fallbackImage.images || fallbackImage.image
      };
    }
  }

  /**
   * Create prediction on Replicate API
   */
  async createPrediction(params) {
    const requestBody = {
      // Use version field with full model version hash for Replicate API
      version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
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

    console.log('🌐 Sending request to:', REPLICATE_API_PROXY_URL);
    console.log('📦 Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(REPLICATE_API_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📨 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Replicate API error details:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        url: REPLICATE_API_PROXY_URL
      });
      throw new Error(`Replicate API error: ${response.status} - ${errorData.detail || errorData.error || response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Replicate prediction created:', result.id);
    return result;
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

      console.log(`🔄 Prediction ${predictionId} status: ${prediction.status}`);

      if (prediction.status === 'succeeded') {
        console.log('✅ Prediction succeeded! Output:', prediction.output);
        return prediction;
      } else if (prediction.status === 'failed') {
        console.error('❌ Prediction failed:', prediction.error);
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
    if (!this.apiKey && !this.isProduction) {
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
    if (!this.apiKey && !this.isProduction) {
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
    if (!this.apiKey && !this.isProduction) {
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
    if (!this.apiKey && !this.isProduction) {
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
    if (!this.apiKey && !this.isProduction) {
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
    if (!this.apiKey && !this.isProduction) {
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

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: HIGH-RESOLUTION 2D AND 3D GENERATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Step 6.1: Generate per-level floor plans with high resolution (1024×1024)
   *
   * @param {Object} buildingProgram - Building program with per-level allocation
   * @param {Object} projectContext - Complete project context
   * @returns {Promise<Object>} Floor plans for each level
   */
  async generatePerLevelFloorPlans(buildingProgram, projectContext) {
    console.log('🏗️ STEP 6.1: Generating per-level floor plans...');
    const perLevelAllocation = buildingProgram?.perLevelAllocation || [];

    // If no levels allocated, create default levels
    if (perLevelAllocation.length === 0) {
      console.warn('⚠️ No per-level allocation found, creating default levels');
      const defaultLevels = [
        { level: 'Ground Floor', surfaceArea: 200, functions: ['entrance', 'lobby'] },
        { level: 'Floor 2', surfaceArea: 200, functions: ['offices', 'meeting rooms'] }
      ];
      perLevelAllocation.push(...defaultLevels);
    }

    console.log(`📊 Processing ${perLevelAllocation.length} levels:`, perLevelAllocation);
    const floorPlans = {};

    for (const level of perLevelAllocation) {
      // Normalize level name for use as object key
      const levelKey = level.level.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      console.log(`🎯 Generating floor plan for: ${level.level} (key: ${levelKey})`);

      try {
        const floorPlanParams = this.buildPerLevelFloorPlanParams(level, buildingProgram, projectContext);
        console.log(`📝 Floor plan params:`, floorPlanParams);
        const result = await this.generateArchitecturalImage(floorPlanParams);
        console.log(`📸 Generation result for ${level.level}:`, result);

        // Check if generation succeeded
        if (result.success && result.images) {
          const imageUrl = Array.isArray(result.images) ? result.images[0] : result.images;
          floorPlans[levelKey] = {
            success: true,
            image: imageUrl,
            surfaceArea: level.surfaceArea,
            functions: level.functions,
            spacePlanning: level.spacePlanning,
            timestamp: new Date().toISOString()
          };
        } else {
          // Generation failed, use fallback
          console.warn(`Generation failed for ${level.level}, using fallback`);
          floorPlans[levelKey] = {
            success: false,
            error: result.error || 'Image generation failed',
            image: `https://via.placeholder.com/1024x1024/ECF0F1/2C3E50?text=${encodeURIComponent(level.level + ' Floor Plan')}`
          };
        }

      } catch (error) {
        console.error(`Error generating floor plan for ${level.level}:`, error);
        floorPlans[levelKey] = {
          success: false,
          error: error.message,
          image: `https://via.placeholder.com/1024x1024/ECF0F1/2C3E50?text=${encodeURIComponent(level.level + ' Floor Plan')}`
        };
      }
    }

    const result = {
      success: true,
      floorPlans,
      totalLevels: perLevelAllocation.length,
      timestamp: new Date().toISOString()
    };

    console.log('✅ Floor plans generation complete:', {
      levelsGenerated: Object.keys(floorPlans),
      totalImages: Object.values(floorPlans).filter(fp => fp.image).length,
      successfulGenerations: Object.values(floorPlans).filter(fp => fp.success).length
    });

    return result;
  }

  /**
   * Build per-level floor plan parameters with detailed room layout
   */
  buildPerLevelFloorPlanParams(level, buildingProgram, projectContext) {
    const {
      architecturalStyle = 'Contemporary',
      blendedStyle,
      materials = []
    } = projectContext;

    const style = blendedStyle?.dominantStyle || architecturalStyle;
    const functions = level.functions?.join(', ') || 'Multi-functional spaces';
    const surfaceArea = level.surfaceArea || 100;

    // Build detailed space planning description
    let spacePlanningDesc = '';
    if (level.spacePlanning) {
      spacePlanningDesc = Object.entries(level.spacePlanning)
        .map(([space, area]) => `${space}: ${area}m²`)
        .join(', ');
    }

    // Add dwelling type and shared wall info if available
    let dwellingInfo = '';
    if (level.dwellingType) {
      dwellingInfo = `${level.dwellingType} dwelling`;
      if (level.hasSharedWall) {
        dwellingInfo += ', party wall on one side, windows on three sides';
      }
    }

    const prompt = `Professional architectural floor plan, 2D top-down plan view, ${level.level}, ${dwellingInfo}, ${style} style, ${surfaceArea}m² total area, detailed room layout: ${functions}, space allocation: ${spacePlanningDesc}, dimension lines with measurements, door swings and door symbols, window openings with window symbols, wall thickness indicators (200mm-300mm), furniture layout suggestions (beds, tables, seating), scale 1:50 or 1:100, north arrow, room labels with areas, circulation paths highlighted, entrance marked, technical drawing style, clean black lines on white background, architectural blueprint precision, high resolution ≥1024×1024 pixels, detailed annotations`;

    return {
      prompt,
      width: 1024,
      height: 1024,
      steps: 50,
      guidanceScale: 7.5,
      viewType: 'floor_plan',
      level: level.level,
      negativePrompt: "3D rendering, photorealistic, color photograph, perspective view, elevation, section, blurry, low quality, sketchy, hand-drawn, unclear dimensions, missing labels"
    };
  }

  /**
   * Step 6.2: Generate four exterior 3D views (North, South, East, West) + two interior views
   *
   * @param {Object} projectContext - Complete project context
   * @returns {Promise<Object>} Exterior and interior views
   */
  async generateComprehensiveViews(projectContext) {
    console.log('🏢 STEP 6.2: Generating comprehensive 3D views...');
    const {
      buildingProgram,
      blendedStyle,
      materialAnalysis,
      solarOrientation
    } = projectContext;

    const views = {};

    // Step 6.2.1: Four exterior 3D views (cardinal directions)
    const exteriorDirections = ['North', 'South', 'East', 'West'];
    console.log(`📊 Generating ${exteriorDirections.length} exterior views`);

    for (const direction of exteriorDirections) {
      console.log(`🎯 Generating exterior view: ${direction}`);
      try {
        const exteriorParams = this.buildExterior3DParams(direction, projectContext);
        const result = await this.generateArchitecturalImage(exteriorParams);

        // Check if generation succeeded
        if (result.success && result.images) {
          const imageUrl = Array.isArray(result.images) ? result.images[0] : result.images;
          views[`exterior_${direction.toLowerCase()}`] = {
            success: true,
            image: imageUrl,
            direction,
            viewType: 'exterior_3d',
            timestamp: new Date().toISOString()
          };
        } else {
          // Generation failed, use fallback
          console.warn(`Generation failed for ${direction} exterior view, using fallback`);
          views[`exterior_${direction.toLowerCase()}`] = {
            success: false,
            error: result.error || 'Image generation failed',
            image: `https://via.placeholder.com/1024x1024/3498DB/FFFFFF?text=${direction}+Exterior+View`
          };
        }

      } catch (error) {
        console.error(`Error generating ${direction} exterior view:`, error);
        views[`exterior_${direction.toLowerCase()}`] = {
          success: false,
          error: error.message,
          image: `https://via.placeholder.com/1024x1024/3498DB/FFFFFF?text=${direction}+Exterior+View`
        };
      }
    }

    // Step 6.2.2: Two interior views
    const interiorSpaces = this.determineInteriorSpaces(buildingProgram);

    for (const space of interiorSpaces) {
      try {
        const interiorParams = this.buildInterior3DParams(space, projectContext);
        const result = await this.generateArchitecturalImage(interiorParams);

        // Check if generation succeeded
        if (result.success && result.images) {
          const imageUrl = Array.isArray(result.images) ? result.images[0] : result.images;
          views[`interior_${space.key}`] = {
            success: true,
            image: imageUrl,
            spaceName: space.name,
            viewType: 'interior_3d',
            timestamp: new Date().toISOString()
          };
        } else {
          // Generation failed, use fallback
          console.warn(`Generation failed for ${space.name} interior view, using fallback`);
          views[`interior_${space.key}`] = {
            success: false,
            error: result.error || 'Image generation failed',
            image: `https://via.placeholder.com/1024x1024/E74C3C/FFFFFF?text=${encodeURIComponent(space.name)}`
          };
        }

      } catch (error) {
        console.error(`Error generating ${space.name} interior view:`, error);
        views[`interior_${space.key}`] = {
          success: false,
          error: error.message,
          image: `https://via.placeholder.com/1024x1024/E74C3C/FFFFFF?text=${encodeURIComponent(space.name)}`
        };
      }
    }

    return {
      success: true,
      views,
      exteriorCount: exteriorDirections.length,
      interiorCount: interiorSpaces.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build exterior 3D view parameters for cardinal directions
   */
  buildExterior3DParams(direction, projectContext) {
    const {
      buildingProgram,
      blendedStyle,
      materialAnalysis,
      solarOrientation
    } = projectContext;

    const style = blendedStyle?.dominantStyle || 'Contemporary';
    const materials = materialAnalysis?.primaryMaterials?.join(', ') || 'glass, steel, concrete';
    const stories = buildingProgram?.massing?.stories?.recommended || 2;
    const buildingType = buildingProgram?.buildingType || 'residential building';

    // Determine lighting based on solar orientation
    const optimalDirection = solarOrientation?.optimalOrientation?.primaryOrientation?.direction || 'South';
    const isOptimalSide = direction === optimalDirection;
    const lighting = isOptimalSide
      ? 'abundant natural light, south-facing facade, large windows'
      : 'balanced lighting, secondary facade';

    const prompt = `Professional 3D architectural exterior visualization, ${direction} facade view, ${style} ${buildingType}, ${stories} stories, photorealistic rendering, ${materials} construction materials, ${lighting}, atmospheric lighting with soft shadows, clear blue sky, landscape context with trees and surroundings, high quality architectural photography style, professional rendering, detailed facade composition, realistic materials and textures, ${direction}-facing elevation perspective, depth of field, cinematic composition, ultra-high resolution ≥1024×1024 pixels, architectural photography, sharp details`;

    return {
      prompt,
      width: 1024,
      height: 1024,
      steps: 60, // Higher steps for photorealistic quality
      guidanceScale: 8.5, // Higher guidance for detailed facades
      viewType: `exterior_3d_${direction.toLowerCase()}`,
      negativePrompt: "blurry, low quality, distorted, unrealistic, cartoon, sketch, 2D drawing, floor plan, section, low resolution, artifacts, noise"
    };
  }

  /**
   * Determine appropriate interior spaces based on building program
   */
  determineInteriorSpaces(buildingProgram) {
    const buildingType = buildingProgram?.buildingType || '';
    const perLevelAllocation = buildingProgram?.perLevelAllocation || [];

    // Medical clinic: waiting area + exam room
    if (buildingType.includes('medical') || buildingType.includes('clinic')) {
      return [
        { key: 'waiting_area', name: 'Waiting Area and Reception' },
        { key: 'exam_room', name: 'Examination Room' }
      ];
    }

    // Office: lobby + open office
    if (buildingType.includes('office')) {
      return [
        { key: 'lobby', name: 'Lobby and Reception' },
        { key: 'open_office', name: 'Open Office Space' }
      ];
    }

    // Residential (default): living space + bedroom
    return [
      { key: 'living_space', name: 'Main Living Space' },
      { key: 'bedroom', name: 'Master Bedroom' }
    ];
  }

  /**
   * Build interior 3D view parameters for specific spaces
   */
  buildInterior3DParams(space, projectContext) {
    const {
      blendedStyle,
      materialAnalysis,
      buildingProgram
    } = projectContext;

    const style = blendedStyle?.dominantStyle || 'Contemporary';
    const materials = materialAnalysis?.primaryMaterials?.slice(0, 3).join(', ') || 'wood, stone, glass';
    const colorPalette = blendedStyle?.colorPalette?.description || 'neutral tones with natural accents';

    // Space-specific descriptions
    const spaceDescriptions = {
      'waiting_area': 'comfortable seating area, reception desk, modern furniture, calming atmosphere, natural light from large windows, plants and greenery, minimalist design',
      'exam_room': 'medical examination table, clean white surfaces, medical equipment, task lighting, hygienic environment, professional medical interior',
      'lobby': 'grand entrance, reception desk, seating area, corporate branding, professional atmosphere, high ceilings, impressive lighting',
      'open_office': 'modern workstations, collaborative spaces, standing desks, natural light, productive environment, contemporary office furniture',
      'living_space': 'comfortable seating, modern furniture, large windows with natural light, open-plan layout, entertainment area, stylish interior design',
      'bedroom': 'comfortable bed, bedside tables, wardrobes, soft lighting, relaxing atmosphere, private sanctuary, elegant furnishings'
    };

    const spaceDesc = spaceDescriptions[space.key] || 'well-designed interior space, modern furnishings, natural lighting';

    const prompt = `Professional 3D architectural interior visualization, ${space.name}, ${style} style, photorealistic rendering, ${spaceDesc}, ${materials} materials, ${colorPalette} color scheme, atmospheric lighting with soft shadows and highlights, depth of field, cinematic composition, architectural interior photography style, high quality professional rendering, detailed furnishings and textures, realistic materials, ultra-high resolution ≥1024×1024 pixels, interior design photography, sharp details, ambient occlusion`;

    return {
      prompt,
      width: 1024,
      height: 1024,
      steps: 60,
      guidanceScale: 8.5,
      viewType: `interior_3d_${space.key}`,
      negativePrompt: "blurry, low quality, distorted, unrealistic, cartoon, sketch, exterior view, floor plan, elevation, low resolution, artifacts, noise, dark, underexposed"
    };
  }

  /**
   * Step 6.3: Generate 2D sectional drawings and four elevations with dimensions
   *
   * @param {Object} buildingProgram - Building program with massing data
   * @param {Object} projectContext - Complete project context
   * @returns {Promise<Object>} Sections and elevations
   */
  async generateTechnicalDrawings(buildingProgram, projectContext) {
    const drawings = {};

    // Step 6.3.1: Generate 2D sectional drawing
    try {
      const sectionParams = this.buildSectionParams(buildingProgram, projectContext);
      const sectionResult = await this.generateArchitecturalImage(sectionParams);

      // Check if generation succeeded
      if (sectionResult.success && sectionResult.images) {
        const imageUrl = Array.isArray(sectionResult.images) ? sectionResult.images[0] : sectionResult.images;
        drawings.section = {
          success: true,
          image: imageUrl,
          viewType: '2d_section',
          timestamp: new Date().toISOString()
        };
      } else {
        // Generation failed, use fallback
        console.warn('Generation failed for section drawing, using fallback');
        drawings.section = {
          success: false,
          error: sectionResult.error || 'Image generation failed',
          image: 'https://via.placeholder.com/1024x768/95A5A6/FFFFFF?text=Section+Drawing'
        };
      }

    } catch (error) {
      console.error('Error generating section:', error);
      drawings.section = {
        success: false,
        error: error.message,
        image: 'https://via.placeholder.com/1024x768/95A5A6/FFFFFF?text=Section+Drawing'
      };
    }

    // Step 6.3.2: Generate four elevations (North, South, East, West)
    const elevationDirections = ['North', 'South', 'East', 'West'];

    for (const direction of elevationDirections) {
      try {
        const elevationParams = this.buildElevationParams(direction, buildingProgram, projectContext);
        const elevationResult = await this.generateArchitecturalImage(elevationParams);

        // Check if generation succeeded
        if (elevationResult.success && elevationResult.images) {
          const imageUrl = Array.isArray(elevationResult.images) ? elevationResult.images[0] : elevationResult.images;
          drawings[`elevation_${direction.toLowerCase()}`] = {
            success: true,
            image: imageUrl,
            direction,
            viewType: '2d_elevation',
            timestamp: new Date().toISOString()
          };
        } else {
          // Generation failed, use fallback
          console.warn(`Generation failed for ${direction} elevation, using fallback`);
          drawings[`elevation_${direction.toLowerCase()}`] = {
            success: false,
            error: elevationResult.error || 'Image generation failed',
            image: `https://via.placeholder.com/1024x768/7F8C8D/FFFFFF?text=${direction}+Elevation`
          };
        }

      } catch (error) {
        console.error(`Error generating ${direction} elevation:`, error);
        drawings[`elevation_${direction.toLowerCase()}`] = {
          success: false,
          error: error.message,
          image: `https://via.placeholder.com/1024x768/7F8C8D/FFFFFF?text=${direction}+Elevation`
        };
      }
    }

    return {
      success: true,
      drawings,
      sectionCount: 1,
      elevationCount: elevationDirections.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build 2D section parameters with dimensions and annotations
   */
  buildSectionParams(buildingProgram, projectContext) {
    const {
      blendedStyle,
      materialAnalysis
    } = projectContext;

    const stories = buildingProgram?.massing?.stories?.recommended || 2;
    const totalHeight = stories * 3.0; // Assume 3m per floor
    const buildingType = buildingProgram?.buildingType || 'building';
    const perLevelAllocation = buildingProgram?.perLevelAllocation || [];

    // Extract level heights and functions
    const levelDescriptions = perLevelAllocation.map((level, idx) => {
      const floorHeight = 3.0; // Standard 3m floor-to-floor
      return `${level.level}: ${floorHeight}m floor-to-floor height, ${level.functions?.slice(0, 2).join(', ')}`;
    }).join('; ');

    const prompt = `Professional architectural cross-section drawing, 2D sectional view, ${buildingType}, ${stories} stories, total height ${totalHeight}m, technical drawing style, vertical section cut through building, floor levels clearly indicated: ${levelDescriptions}, dimension lines with height measurements (floor-to-floor heights, total height, room heights), foundation detail with ground line, roof structure detail (rafters, insulation), interior spaces labeled, wall thickness annotations (200mm-300mm), staircase section showing treads and risers, window and door heights marked, material indications (hatching for concrete, brick patterns), scale 1:100, clean black lines on white background, architectural blueprint precision, detailed annotations, dimension chains, construction details, high resolution ≥1024×768 pixels`;

    return {
      prompt,
      width: 1024,
      height: 768, // Wider aspect ratio for sections
      steps: 50,
      guidanceScale: 7.5,
      viewType: '2d_section',
      negativePrompt: "3D rendering, photorealistic, color photograph, perspective view, floor plan, elevation, blurry, low quality, sketchy, unclear dimensions, missing annotations"
    };
  }

  /**
   * Build 2D elevation parameters with dimensions and annotations
   */
  buildElevationParams(direction, buildingProgram, projectContext) {
    const {
      blendedStyle,
      materialAnalysis,
      solarOrientation
    } = projectContext;

    const stories = buildingProgram?.massing?.stories?.recommended || 2;
    const totalHeight = stories * 3.0;
    const buildingType = buildingProgram?.buildingType || 'building';
    const materials = materialAnalysis?.primaryMaterials?.join(', ') || 'brick, glass, concrete';
    const style = blendedStyle?.dominantStyle || 'Contemporary';

    // Determine facade features based on direction and solar orientation
    const optimalDirection = solarOrientation?.optimalOrientation?.primaryOrientation?.direction || 'South';
    const isOptimalSide = direction === optimalDirection;
    const facadeFeatures = isOptimalSide
      ? 'large window openings for solar gain, glazing ratio 35-40%, balconies'
      : 'standard window openings, balanced glazing, secondary facade';

    const prompt = `Professional architectural ${direction} elevation drawing, 2D front view, ${style} ${buildingType}, ${stories} stories, total height ${totalHeight}m, ${materials} facade materials, ${facadeFeatures}, technical drawing style, orthographic projection, dimension lines with measurements (total height, floor heights, window dimensions), window and door openings clearly indicated with dimensions (width × height), material annotations and hatching patterns, ground line and foundation indication, roof line with parapet or eaves detail, horizontal dimension chain showing building width, vertical dimension chain showing floor levels, scale 1:100, clean black and white line drawing, architectural blueprint style, precise measurements and annotations, construction details, high resolution ≥1024×768 pixels`;

    return {
      prompt,
      width: 1024,
      height: 768,
      steps: 50,
      guidanceScale: 7.5,
      viewType: `2d_elevation_${direction.toLowerCase()}`,
      negativePrompt: "3D rendering, photorealistic, color photograph, perspective view, floor plan, section, blurry, low quality, sketchy, unclear dimensions, missing labels, hand-drawn"
    };
  }

  /**
   * Step 6.4: Generate structural and MEP diagrams
   *
   * @param {Object} buildingProgram - Building program
   * @param {Object} designReasoning - Design reasoning with structural/MEP notes
   * @param {Object} projectContext - Complete project context
   * @returns {Promise<Object>} Structural and MEP diagrams
   */
  async generateEngineeringDiagrams(buildingProgram, designReasoning, projectContext) {
    const diagrams = {};

    // Step 6.4.1: Generate structural diagram
    try {
      const structuralParams = this.buildStructuralDiagramParams(buildingProgram, designReasoning, projectContext);
      const structuralResult = await this.generateArchitecturalImage(structuralParams);

      // Check if generation succeeded
      if (structuralResult.success && structuralResult.images) {
        const imageUrl = Array.isArray(structuralResult.images) ? structuralResult.images[0] : structuralResult.images;
        diagrams.structural = {
          success: true,
          image: imageUrl,
          viewType: 'structural_diagram',
          summary: this.generateStructuralSummary(buildingProgram, designReasoning, projectContext),
          timestamp: new Date().toISOString()
        };
      } else {
        // Generation failed, use fallback
        console.warn('Generation failed for structural diagram, using fallback');
        diagrams.structural = {
          success: false,
          error: structuralResult.error || 'Image generation failed',
          image: 'https://via.placeholder.com/1024x1024/16A085/FFFFFF?text=Structural+Diagram',
          summary: this.generateStructuralSummary(buildingProgram, designReasoning, projectContext)
        };
      }

    } catch (error) {
      console.error('Error generating structural diagram:', error);
      diagrams.structural = {
        success: false,
        error: error.message,
        image: 'https://via.placeholder.com/1024x1024/16A085/FFFFFF?text=Structural+Diagram',
        summary: this.generateStructuralSummary(buildingProgram, designReasoning, projectContext)
      };
    }

    // Step 6.4.2: Generate MEP diagram
    try {
      const mepParams = this.buildMEPDiagramParams(buildingProgram, designReasoning, projectContext);
      const mepResult = await this.generateArchitecturalImage(mepParams);

      // Check if generation succeeded
      if (mepResult.success && mepResult.images) {
        const imageUrl = Array.isArray(mepResult.images) ? mepResult.images[0] : mepResult.images;
        diagrams.mep = {
          success: true,
          image: imageUrl,
          viewType: 'mep_diagram',
          summary: this.generateMEPSummary(buildingProgram, designReasoning, projectContext),
          timestamp: new Date().toISOString()
        };
      } else {
        // Generation failed, use fallback
        console.warn('Generation failed for MEP diagram, using fallback');
        diagrams.mep = {
          success: false,
          error: mepResult.error || 'Image generation failed',
          image: 'https://via.placeholder.com/1024x1024/E67E22/FFFFFF?text=MEP+Diagram',
          summary: this.generateMEPSummary(buildingProgram, designReasoning, projectContext)
        };
      }

    } catch (error) {
      console.error('Error generating MEP diagram:', error);
      diagrams.mep = {
        success: false,
        error: error.message,
        image: 'https://via.placeholder.com/1024x1024/E67E22/FFFFFF?text=MEP+Diagram',
        summary: this.generateMEPSummary(buildingProgram, designReasoning, projectContext)
      };
    }

    return {
      success: true,
      diagrams,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build structural diagram parameters
   */
  buildStructuralDiagramParams(buildingProgram, designReasoning, projectContext) {
    const structuralSystem = buildingProgram?.structuralConsiderations?.primarySystem || 'reinforced concrete frame';
    const foundationType = buildingProgram?.structuralConsiderations?.foundationType || 'strip footings';
    const stories = buildingProgram?.massing?.stories?.recommended || 2;
    const buildingType = buildingProgram?.buildingType || 'building';

    const prompt = `Professional structural engineering diagram, ${buildingType}, ${stories} stories, ${structuralSystem} structural system, ${foundationType} foundation, isometric or axonometric view showing structural grid, column locations and dimensions (e.g., 400mm × 400mm), beam spans and sizes (e.g., 300mm × 600mm), floor slab thickness (150mm-200mm), foundation details, lateral load resisting system (shear walls or braced frames), structural grid lines labeled (A, B, C... and 1, 2, 3...), dimension annotations, load paths indicated with arrows, connection details, technical drawing style, clean lines, color-coded structural elements (columns in blue, beams in red, slabs in gray), annotations and labels, engineering diagram precision, high resolution ≥1024×1024 pixels`;

    return {
      prompt,
      width: 1024,
      height: 1024,
      steps: 50,
      guidanceScale: 7.5,
      viewType: 'structural_diagram',
      negativePrompt: "photorealistic, 3D rendering, architectural elevation, floor plan without structure, blurry, low quality, unclear labels, missing dimensions"
    };
  }

  /**
   * Build MEP diagram parameters
   */
  buildMEPDiagramParams(buildingProgram, designReasoning, projectContext) {
    const stories = buildingProgram?.massing?.stories?.recommended || 2;
    const buildingType = buildingProgram?.buildingType || 'building';
    const climate = projectContext.siteAnalysis?.climate?.description || 'temperate climate';

    const prompt = `Professional MEP (Mechanical, Electrical, Plumbing) engineering diagram, ${buildingType}, ${stories} stories, ${climate}, overlay floor plan showing MEP systems, HVAC ductwork in blue with supply and return air paths, plumbing risers and pipe runs in green (water supply) and brown (drainage), electrical conduits and panels in red, lighting fixture locations, vertical shafts for services, equipment rooms labeled (mechanical room, electrical room), fresh air intake and exhaust locations, sprinkler system in purple, ventilation grilles and diffusers, pipe and duct sizes annotated, flow directions indicated with arrows, legend showing all systems, color-coded systems for clarity, technical drawing style, clean lines and symbols, standard MEP symbols (ASHRAE/ISO), high resolution ≥1024×1024 pixels, detailed annotations`;

    return {
      prompt,
      width: 1024,
      height: 1024,
      steps: 50,
      guidanceScale: 7.5,
      viewType: 'mep_diagram',
      negativePrompt: "photorealistic, 3D rendering, architectural rendering, floor plan without MEP, blurry, low quality, unclear symbols, missing legend"
    };
  }

  /**
   * Generate structural engineering summary based on local regulations (UK Part A example)
   */
  generateStructuralSummary(buildingProgram, designReasoning, projectContext) {
    const stories = buildingProgram?.massing?.stories?.recommended || 2;
    const totalArea = buildingProgram?.massing?.floorAreas?.totalGrossArea || 200;
    const buildingType = buildingProgram?.buildingType || 'residential';
    const structuralSystem = buildingProgram?.structuralConsiderations?.primarySystem || 'reinforced concrete frame';

    // Basic structural calculations (simplified)
    const deadLoad = totalArea * 3.5; // kN (3.5 kN/m² typical)
    const liveLoad = totalArea * (buildingType.includes('residential') ? 1.5 : 2.5); // kN
    const totalLoad = deadLoad + liveLoad;

    const columnCount = Math.ceil(totalArea / 25); // ~5m grid
    const loadPerColumn = totalLoad / columnCount;

    return {
      structuralSystem,
      stories,
      totalFloorArea: `${totalArea}m²`,
      foundationType: buildingProgram?.structuralConsiderations?.foundationType || 'Strip footings or raft slab',

      loadings: {
        deadLoad: `${Math.round(deadLoad)} kN (3.5 kN/m² - self-weight, finishes, partitions)`,
        liveLoad: `${Math.round(liveLoad)} kN (${buildingType.includes('residential') ? '1.5' : '2.5'} kN/m² - occupancy, furniture)`,
        totalLoad: `${Math.round(totalLoad)} kN`,
        loadPerColumn: `${Math.round(loadPerColumn)} kN (estimated)`
      },

      design: {
        columns: `${columnCount} columns, 400mm × 400mm reinforced concrete (estimated)`,
        beams: 'Reinforced concrete beams, 300mm × 600mm typical spans 5-6m',
        slabs: 'Reinforced concrete slabs, 200mm thickness with mesh reinforcement',
        lateralSystem: stories > 2 ? 'Shear walls or braced frames for lateral stability' : 'Moment frames adequate for 2-story structure'
      },

      compliance: {
        standard: 'UK Building Regulations Part A (Structure)',
        references: [
          'Part A: Structure - loading requirements (BS EN 1991)',
          'Eurocode 2 (BS EN 1992) - concrete design',
          'Eurocode 7 (BS EN 1997) - geotechnical design',
          'Dead loads: BS EN 1991-1-1',
          'Imposed loads: BS EN 1991-1-1 (residential: 1.5 kN/m², office: 2.5-3.0 kN/m²)',
          'Wind loads: BS EN 1991-1-4 (if stories > 3)',
          'Seismic design: BS EN 1998 (if applicable to region)'
        ],
        safetyCriteria: 'Ultimate Limit State (ULS) and Serviceability Limit State (SLS) checks required'
      },

      notes: `Preliminary calculations based on ${stories}-story ${buildingType} with ${totalArea}m² floor area. Detailed structural engineering analysis required with geotechnical investigation, material testing, and full load calculations per BS EN 1991. Professional structural engineer certification required for construction.`
    };
  }

  /**
   * Generate MEP engineering summary based on local regulations (UK Part L example)
   */
  generateMEPSummary(buildingProgram, designReasoning, projectContext) {
    const stories = buildingProgram?.massing?.stories?.recommended || 2;
    const totalArea = buildingProgram?.massing?.floorAreas?.totalGrossArea || 200;
    const buildingType = buildingProgram?.buildingType || 'residential';
    const climate = projectContext.siteAnalysis?.climate?.description || 'Temperate climate';
    const insulationWalls = projectContext.materialAnalysis?.insulationStrategy?.walls || 'R-18 to R-27 (U-value: 0.18-0.26 W/m²K)';
    const insulationRoof = projectContext.materialAnalysis?.insulationStrategy?.roof || 'R-38 to R-49 (U-value: 0.11-0.16 W/m²K)';

    // Basic MEP calculations
    const heatingLoad = totalArea * (buildingType.includes('residential') ? 50 : 60); // W (50-60 W/m²)
    const coolingLoad = totalArea * (buildingType.includes('residential') ? 40 : 50); // W
    const ventilationRate = totalArea * 1.0; // L/s (1.0 L/s/m²)
    const electricalLoad = totalArea * (buildingType.includes('residential') ? 40 : 60); // W/m²

    return {
      mechanical: {
        heatingSystem: buildingType.includes('residential')
          ? 'Gas boiler or heat pump with radiators/underfloor heating'
          : 'Central heating with VRF or fan coil units',
        heatingLoad: `${Math.round(heatingLoad / 1000)} kW (${buildingType.includes('residential') ? '50' : '60'} W/m²)`,
        coolingSystem: 'Air conditioning via split systems or VRF (Variable Refrigerant Flow)',
        coolingLoad: `${Math.round(coolingLoad / 1000)} kW (${buildingType.includes('residential') ? '40' : '50'} W/m²)`,
        ventilation: `Mechanical ventilation with heat recovery (MVHR), ${Math.round(ventilationRate)} L/s fresh air supply`,
        ductwork: 'Insulated ductwork, supply and return air distribution, fresh air intake and exhaust'
      },

      electrical: {
        mainSupply: buildingType.includes('residential') ? '230V single-phase (or 3-phase if load > 15kW)' : '400V 3-phase',
        totalLoad: `${Math.round(electricalLoad * totalArea / 1000)} kW (${buildingType.includes('residential') ? '40' : '60'} W/m²)`,
        distribution: 'Consumer unit(s) with RCDs, MCBs per circuit',
        lighting: 'LED lighting throughout, daylight sensors, occupancy sensors in circulation areas',
        powerOutlets: buildingType.includes('residential') ? 'Double sockets every 3m, dedicated circuits for kitchen appliances' : 'Floor boxes and wall outlets every 2-3m for workstations',
        emergencyLighting: stories > 2 ? 'Emergency lighting and exit signage per BS 5266' : 'Not required for 2-story residential'
      },

      plumbing: {
        waterSupply: 'Mains water supply, internal distribution via copper or PEX pipes',
        hotWater: buildingType.includes('residential') ? 'Combi boiler or hot water cylinder (200-300L)' : 'Central hot water system',
        drainage: 'Gravity drainage to sewer, soil and waste stack(s), vent pipes',
        fixtures: buildingType.includes('residential')
          ? 'Toilets (6L dual-flush), sinks, showers, kitchen sink'
          : 'Toilets, urinals, sinks, accessible facilities per Part M',
        waterDemand: `${Math.round(totalArea * 0.05)} L/s peak demand (estimated)`
      },

      energyCompliance: {
        standard: 'UK Building Regulations Part L (Conservation of Fuel and Power)',
        references: [
          'Part L1A (New dwellings) or L2A (New buildings other than dwellings)',
          'Target CO₂ emissions rate (TER) and Target Fabric Energy Efficiency (TFEE)',
          'U-values: Walls ' + (insulationWalls.includes('U-value') ? insulationWalls.split('U-value: ')[1].split(')')[0] : '≤0.26 W/m²K') + ', Roof ' + (insulationRoof.includes('U-value') ? insulationRoof.split('U-value: ')[1].split(')')[0] : '≤0.16 W/m²K'),
          'Air permeability: ≤8 m³/(h·m²) at 50 Pa (residential), ≤10 m³/(h·m²) (non-residential)',
          'Heating efficiency: ≥90% for gas boilers, SCOP ≥2.8 for heat pumps',
          'Lighting efficacy: ≥75 lumens/W (LED lighting)',
          'Renewable energy: Consider solar PV or solar thermal to reduce emissions'
        ],
        estimatedEUI: buildingType.includes('residential') ? '80-120 kWh/m²/year' : '100-150 kWh/m²/year',
        estimatedCO2: `${Math.round(totalArea * 0.025)} kg CO₂/m²/year (estimated, depends on fuel mix)`
      },

      notes: `Preliminary MEP design for ${stories}-story ${buildingType} with ${totalArea}m² floor area in ${climate}. Detailed mechanical, electrical, and plumbing engineering required with full load calculations, equipment sizing, and energy modeling per UK Building Regulations Part L. Professional MEP engineer certification and SAP/SBEM energy assessment required for compliance.`
    };
  }
}

export default new ReplicateService();
