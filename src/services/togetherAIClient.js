/**
 * Together AI Client (REFACTORED)
 * 
 * Pure, deterministic client for Together.ai API.
 * Separated reasoning (Qwen) and image generation (FLUX.1-dev).
 * No browser dependencies, no storage access, no React awareness.
 * 
 * All context passed via parameters from environmentAdapter.
 * Uses A1_ARCH_FINAL preset for optimized parameters.
 */

import logger from '../utils/logger.js';
import { getA1Preset, getModifyStrength } from '../config/fluxPresets.js';

/**
 * Rate limiter for Together.ai API
 */
class RateLimiter {
  constructor(minInterval = 6000) {
    this.minInterval = minInterval;
    this.lastRequestTime = 0;
    this.queue = [];
    this.processing = false;
  }
  
  /**
   * Schedule a request with rate limiting
   * @param {string} type - Request type (for logging)
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Result of fn
   */
  async schedule(type, fn) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      logger.debug(`Rate limiting: waiting ${waitTime}ms before ${type}`, null, '⏱️');
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    
    try {
      const result = await fn();
      return result;
    } catch (error) {
      // If rate limit error, increase interval temporarily
      if (error.status === 429) {
        const retryAfter = error.retryAfter || 15;
        this.minInterval = Math.max(this.minInterval, retryAfter * 1000);
        logger.warn(`Rate limit hit, increasing interval to ${this.minInterval}ms`, null, '⏱️');
      }
      throw error;
    }
  }
  
  /**
   * Set minimum interval
   * @param {number} interval - Interval in milliseconds
   */
  setMinInterval(interval) {
    this.minInterval = interval;
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter(6000);

/**
 * Together AI Client
 */
class TogetherAIClient {
  constructor(env) {
    this.env = env;
    this.baseUrl = env?.api?.urls?.togetherImage || '/api/together/image';
    this.chatUrl = env?.api?.urls?.togetherChat || '/api/together/chat';
  }
  
  /**
   * Generate reasoning with Qwen
   * @param {Object} params - Parameters
   * @param {string} params.prompt - Reasoning prompt
   * @param {Object} params.options - Generation options
   * @param {number} params.options.temperature - Temperature (default: 0.1 for deterministic)
   * @param {number} params.options.maxTokens - Max tokens
   * @returns {Promise<Object>} { content, model, usage, traceId }
   */
  async generateReasoning({ prompt, options = {} }) {
    const {
      temperature = 0.1, // Low temperature for deterministic reasoning
      maxTokens = 2000,
      topP = 0.9
    } = options;
    
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.info('Generating reasoning with Qwen', { temperature, maxTokens, traceId }, '🧠');
    
    try {
      const response = await fetch(this.chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an expert architect specializing in consistent architectural design. Provide EXACT specifications with dimensions, materials, and hex colors.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature,
          max_tokens: maxTokens,
          top_p: topP
        })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const latencyMs = Date.now() - startTime;
      
      logger.success('Reasoning generated', { latencyMs, traceId }, '✅');
      
      return {
        content: data.choices[0].message.content,
        model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
        usage: data.usage || {},
        latencyMs,
        traceId
      };
    } catch (error) {
      logger.error('Reasoning generation failed', error);
      throw error;
    }
  }
  
  /**
   * Generate image with FLUX
   * @param {Object} params - Image request parameters
   * @param {string} params.prompt - Image prompt
   * @param {number} params.seed - Seed for reproducibility
   * @param {string} params.sheetType - Sheet type
   * @param {Object} params.sheetConfig - Sheet configuration
   * @param {string} params.model - Model to use
   * @param {number} params.width - Image width
   * @param {number} params.height - Image height
   * @param {number} params.steps - Inference steps
   * @param {number} params.guidanceScale - Guidance scale
   * @param {string} params.negativePrompt - Negative prompt
   * @param {string} params.initImage - Init image for img2img
   * @param {number} params.imageStrength - Image strength for img2img
   * @returns {Promise<Object>} { imageUrls, seedUsed, model, latencyMs, traceId }
   */
  async generateImage({
    prompt,
    seed,
    sheetType = 'ARCH',
    sheetConfig = {},
    model = 'black-forest-labs/FLUX.1-dev',
    width = 1792,
    height = 1269,
    steps = 48,
    guidanceScale = 7.8,
    negativePrompt = '',
    initImage = null,
    imageStrength = null
  }) {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    // Snap dimensions to multiples of 16 (Together.ai requirement)
    const clamp = (v) => Math.min(Math.max(Math.floor(v), 64), 1792);
    let validatedWidth = clamp(width);
    let validatedHeight = clamp(height);
    // Round down to nearest multiple of 16
    validatedWidth -= validatedWidth % 16;
    validatedHeight -= validatedHeight % 16;
    
    if (validatedWidth !== width || validatedHeight !== height) {
      logger.warn(`Dimensions adjusted from ${width}×${height} to ${validatedWidth}×${validatedHeight} (multiples of 16)`, null, '📐');
    }
    
    logger.info('Generating image with FLUX', {
      model,
      dimensions: `${validatedWidth}×${validatedHeight}`,
      seed,
      traceId,
      hasInitImage: !!initImage
    }, '🎨');
    
    // Schedule through rate limiter
    const result = await rateLimiter.schedule('flux-image', async () => {
      const payload = {
        model,
        prompt,
        negativePrompt,
        width: validatedWidth,
        height: validatedHeight,
        seed,
        num_inference_steps: steps,
        guidanceScale
      };
      
      // Add img2img parameters if provided
      if (initImage) {
        payload.initImage = initImage;
        payload.imageStrength = imageStrength || 0.18;
      }
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const err = new Error(error.error || `HTTP ${response.status}`);
        err.status = response.status;
        err.retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        throw err;
      }
      
      return response.json();
    });
    
    const latencyMs = Date.now() - startTime;
    
    logger.success('Image generated', { latencyMs, traceId }, '✅');
    
    return {
      imageUrls: [result.url],
      seedUsed: seed,
      model,
      latencyMs,
      traceId,
      metadata: {
        width: validatedWidth,
        height: validatedHeight,
        requestedWidth: width,
        requestedHeight: height,
        steps,
        guidanceScale,
        hasInitImage: !!initImage,
        imageStrength: initImage ? (imageStrength || 0.18) : null
      }
    };
  }
  
  /**
   * Generate A1 sheet image (convenience method)
   * Uses A1_ARCH_FINAL preset
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Generation result
   */
  async generateA1SheetImage(params) {
    const preset = getA1Preset('generate');
    
    return this.generateImage({
      ...params,
      model: params.model || preset.model,
      width: params.width || preset.width,
      height: params.height || preset.height,
      steps: params.steps || preset.steps,
      guidanceScale: params.guidanceScale || preset.cfg
    });
  }
  
  /**
   * Generate modify image (with strict defaults)
   * Uses A1_ARCH_FINAL preset for modify mode
   * @param {Object} params - Parameters
   * @param {string} params.modificationType - 'minor', 'moderate', 'significant'
   * @returns {Promise<Object>} Generation result
   */
  async generateModifyImage(params) {
    if (!params.initImage) {
      throw new Error('initImage required for modify mode');
    }
    
    const preset = getA1Preset('modify');
    const modificationType = params.modificationType || 'moderate';
    const strength = params.imageStrength || getModifyStrength(modificationType);
    
    logger.info('Modify mode parameters', {
      modificationType,
      strength,
      steps: preset.steps,
      cfg: preset.cfg
    }, '🔧');
    
    return this.generateImage({
      ...params,
      model: params.model || preset.model,
      width: params.width || preset.width,
      height: params.height || preset.height,
      steps: params.steps || preset.steps,
      guidanceScale: params.guidanceScale || preset.cfg,
      imageStrength: strength
    });
  }
}

/**
 * Create Together AI client
 * @param {Object} env - Environment adapter
 * @returns {TogetherAIClient} Client instance
 */
export function createTogetherAIClient(env) {
  return new TogetherAIClient(env);
}

// Export for backward compatibility
export default {
  createTogetherAIClient,
  RateLimiter
};

