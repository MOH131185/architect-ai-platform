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
      area = '1000 sq ft'
    } = projectContext;

    return {
      prompt: `Professional architectural floor plan, ${architecturalStyle} ${buildingProgram}, ${area} area, technical drawing style, 2D plan view, detailed room layout, dimensions, doors, windows, furniture layout, professional architectural drafting, black and white line drawing, precise measurements, architectural blueprint style`,
      buildingType: buildingProgram,
      architecturalStyle,
      location,
      materials,
      viewType: 'floor_plan',
      width: 1024,
      height: 1024,
      steps: 40,
      guidanceScale: 7.0,
      negativePrompt: "3D, perspective, color, realistic, photorealistic, blurry, low quality"
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
