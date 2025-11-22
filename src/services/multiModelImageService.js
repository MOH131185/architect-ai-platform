/**
 * Multi-Model Image Service
 * 
 * Handles image generation with FLUX primary and SDXL fallback.
 * Supports geometry-conditioned generation (img2img/controlnet).
 */

import { generateArchitecturalImage as generateWithFLUX } from './togetherAIService.js';
import logger from '../utils/logger.js';

class MultiModelImageService {
  constructor() {
    logger.info('🎨 Multi-Model Image Service initialized');
  }

  /**
   * Generate image with FLUX primary, SDXL fallback
   * 
 * @param {Object} params - Generation parameters
 * @param {string} params.viewType - View type (e.g., 'hero_3d', 'elevation_north')
 * @param {string} params.prompt - Text prompt
 * @param {string} params.negativePrompt - Negative prompt
 * @param {number} params.seed - Generation seed
 * @param {number} params.width - Image width
 * @param {number} params.height - Image height
 * @param {Object} params.designDNA - Design DNA
 * @param {Object|string} params.geometryRender - Optional geometry render (control image)
 * @param {number} params.geometryStrength - Geometry influence (0-1, default 0.7)
 * @returns {Promise<Object>} Generation result
 */
  async generateImage(params) {
    const {
      viewType,
      prompt,
      negativePrompt,
      seed,
      width,
      height,
      designDNA,
      geometryRender = null,
      geometryStrength = 0.7
    } = params;

    // Try FLUX first
    try {
      logger.info(`🎨 Attempting FLUX generation for ${viewType}...`);
      
      const fluxParams = {
        viewType,
        prompt,
        negativePrompt,
        seed,
        width,
        height,
        designDNA,
        geometryRender: geometryRender ? { url: geometryRender.url || geometryRender, type: geometryRender.type || null, model: geometryRender.model || null } : null,
        geometryStrength
      };

      const result = await generateWithFLUX(fluxParams);
      
      logger.success(`✅ FLUX generation successful for ${viewType}`);
      
      return {
        ...result,
        model: 'flux',
        hadFallback: false
      };

    } catch (fluxError) {
      logger.warn(`⚠️  FLUX generation failed for ${viewType}: ${fluxError.message}`);
      logger.info(`   Attempting SDXL fallback...`);

      // Try SDXL fallback
      try {
        const sdxlResult = await this.generateWithSDXL({
          viewType,
          prompt,
          negativePrompt,
          seed,
          width,
          height,
          geometryRender,
          geometryStrength
        });

        logger.success(`✅ SDXL fallback successful for ${viewType}`);
        
        return {
          ...sdxlResult,
          model: 'sdxl',
          hadFallback: true,
          fallbackReason: fluxError.message
        };

      } catch (sdxlError) {
        logger.error(`❌ Both FLUX and SDXL failed for ${viewType}`);
        throw new Error(`Image generation failed: FLUX (${fluxError.message}), SDXL (${sdxlError.message})`);
      }
    }
  }

  /**
   * Generate with SDXL via Replicate
   * Uses REPLICATE_API_KEY from environment
   */
  async generateWithSDXL(params) {
    const {
      viewType,
      prompt,
      negativePrompt,
      seed,
      width,
      height,
      geometryRender,
      geometryStrength
    } = params;

    // Check if Replicate API key is available
    const replicateKey = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    
    if (!replicateKey) {
      throw new Error('REPLICATE_API_KEY not found in environment');
    }

    // Use SDXL with ControlNet if geometry render available
    const model = geometryRender 
      ? 'stability-ai/sdxl:controlnet'
      : 'stability-ai/sdxl:latest';

    logger.info(`   Using Replicate model: ${model}`);

    const API_BASE_URL = process.env.REACT_APP_API_PROXY_URL || 'http://localhost:3001';

    try {
      const response = await fetch(`${API_BASE_URL}/api/replicate/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          seed,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          ...(geometryRender && {
            image: geometryRender.url || geometryRender,
            controlnet_conditioning_scale: geometryStrength
          })
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Replicate API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return {
        url: data.url || data.output?.[0],
        seed,
        viewType,
        metadata: {
          model: 'sdxl',
          width,
          height,
          hadGeometryControl: !!geometryRender
        }
      };

    } catch (error) {
      logger.error('SDXL generation error:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
const multiModelImageService = new MultiModelImageService();
export default multiModelImageService;

