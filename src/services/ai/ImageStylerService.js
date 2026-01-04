/**
 * ImageStylerService
 *
 * Handles AI-styled image generation for photorealistic renders.
 * Uses adapter pattern for easy model swaps.
 *
 * ONLY used for: hero_3d and interior_3d panels
 * Technical drawings (plans, elevations, sections) use Blender.
 *
 * MANDATORY CORRECTION A:
 * - Model ID must be "gpt-image-1.5" (not "openai/gpt-image-1.5")
 * - Model adapter for easy swapping between providers
 *
 * MANDATORY CORRECTION D:
 * - Must use IMAGE EDIT API with Blender render passed as input
 * - This preserves geometry from the control image
 *
 * Supported models:
 * - gpt-image-1.5 (recommended - default)
 * - dall-e-2 (legacy - supports edit)
 * - flux.1-dev (fallback - Together.ai)
 *
 * Part of Phase 4: Meshy + Blender + OpenAI Pipeline Refactor
 *
 * @module services/ai/ImageStylerService
 */

import { isFeatureEnabled } from '../../config/featureFlags.js';
import logger from '../logging/logger.js';

/**
 * Model configurations with adapter pattern (Correction A)
 * Model IDs are plain names, not prefixed with provider
 */
const MODEL_CONFIGS = {
  // Primary model (Correction A: use "gpt-image-1.5" not "openai/...")
  'gpt-image-1.5': {
    provider: 'openai',
    apiModelId: 'gpt-image-1.5',
    endpoint: '/api/openai-image-stylize',
    supportsEdit: true, // Correction D: supports image edit
    maxWidth: 1024,
    maxHeight: 1024,
    supportedSizes: ['1024x1024', '512x512', '256x256'],
    supportedFormats: ['png'],
    defaultStyle: 'vivid',
    deprecated: false,
    notes: 'Recommended - uses IMAGE EDIT for geometry preservation',
  },
  // Legacy fallback
  'dall-e-2': {
    provider: 'openai',
    apiModelId: 'dall-e-2',
    endpoint: '/api/openai-image-stylize',
    supportsEdit: true,
    maxWidth: 1024,
    maxHeight: 1024,
    supportedSizes: ['1024x1024', '512x512', '256x256'],
    supportedFormats: ['png'],
    defaultStyle: 'natural',
    deprecated: true,
    deprecationDate: '2025-12-01',
    notes: 'Legacy - migrate to gpt-image-1.5',
  },
  // Together.ai fallback (no edit support)
  'flux.1-dev': {
    provider: 'together',
    apiModelId: 'black-forest-labs/FLUX.1-dev',
    endpoint: '/api/together-image',
    supportsEdit: false, // No geometry preservation
    maxWidth: 1792,
    maxHeight: 1792,
    supportedFormats: ['png'],
    stepsMapping: { low: 4, medium: 30, high: 50 },
    deprecated: false,
    notes: 'Fallback - no geometry preservation',
  },
};

/**
 * Allowed panel types for styled rendering
 * All other panel types should use Blender technical drawings
 */
const STYLED_PANEL_TYPES = ['hero_3d', 'interior_3d'];

/**
 * ImageStylerService class
 * Handles photorealistic styled rendering for hero/interior panels
 */
export class ImageStylerService {
  constructor(options = {}) {
    // Correction A: Use plain model ID, not prefixed
    this.defaultModel = options.model || 'gpt-image-1.5';
    this.fallbackModel = options.fallback || 'flux.1-dev';
    this.apiBaseUrl = options.apiBaseUrl || '';
  }

  /**
   * Get model configuration (Correction A: model adapter)
   * @param {string} modelName - Model identifier (e.g., "gpt-image-1.5")
   * @returns {Object|null}
   */
  getModelConfig(modelName) {
    // Handle legacy prefixed names (convert "openai/gpt-image-1.5" to "gpt-image-1.5")
    const cleanName = modelName.includes('/') ? modelName.split('/').pop() : modelName;
    return MODEL_CONFIGS[cleanName] || null;
  }

  /**
   * List available models
   * @returns {Object[]}
   */
  listModels() {
    return Object.entries(MODEL_CONFIGS).map(([name, config]) => ({
      name,
      provider: config.provider,
      supportsEdit: config.supportsEdit,
      deprecated: config.deprecated,
      notes: config.notes,
    }));
  }

  /**
   * Validate panel type
   * @param {string} panelType
   * @returns {boolean}
   */
  isValidPanelType(panelType) {
    return STYLED_PANEL_TYPES.includes(panelType);
  }

  /**
   * Generate styled render for hero_3d or interior_3d
   *
   * CORRECTION D: Uses IMAGE EDIT API with Blender render as input
   *
   * @param {Object} params
   * @param {string} params.panelType - 'hero_3d' or 'interior_3d'
   * @param {Buffer|string} params.controlImage - Blender render (buffer or base64)
   * @param {string} params.stylePrompt - Base style description
   * @param {Object} params.dna - Design DNA for context
   * @param {Object} [params.options] - Additional options
   * @returns {Promise<Object>} - { success, imageUrl, buffer, model, metadata }
   */
  async generateStyledRender(params) {
    const { panelType, controlImage, stylePrompt, dna, options = {} } = params;

    // Check feature flag
    if (!isFeatureEnabled('openaiStyler')) {
      logger.info('[ImageStyler] OpenAI styler disabled (feature flag)');
      return {
        success: false,
        reason: 'feature_disabled',
        message: 'OpenAI styling is disabled. Enable openaiStyler feature flag.',
      };
    }

    // Validate panel type
    if (!this.isValidPanelType(panelType)) {
      throw new Error(
        `ImageStylerService only supports ${STYLED_PANEL_TYPES.join(', ')}, got: ${panelType}`
      );
    }

    const model = options.model || this.defaultModel;
    const config = this.getModelConfig(model);

    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }

    // Warn if using deprecated model
    if (config.deprecated) {
      logger.warn(
        `[ImageStyler] Using deprecated model: ${model}. ` +
          `Will be removed on ${config.deprecationDate}. ` +
          `Migrate to ${this.defaultModel}`
      );
    }

    // Warn if no control image provided (Correction D)
    if (!controlImage && config.supportsEdit) {
      logger.warn(
        `[ImageStyler] No control image provided for ${panelType}. ` +
          'Geometry preservation will not be available.'
      );
    }

    // Build enhanced prompt with DNA context
    const fullPrompt = this.buildStyledPrompt(panelType, stylePrompt, dna);

    logger.info(`[ImageStyler] Generating styled ${panelType} with ${model}`);
    logger.info(`[ImageStyler] Using ${controlImage ? 'IMAGE EDIT' : 'IMAGE GENERATION'} mode`);

    try {
      const result = await this.callModel(model, config, {
        prompt: fullPrompt,
        controlImage, // Correction D: pass control image for edit
        panelType,
        width: options.width || this.getDefaultWidth(panelType, config),
        height: options.height || this.getDefaultHeight(panelType, config),
        strength: options.strength || 'medium',
        style: options.style || config.defaultStyle,
      });

      return {
        success: true,
        imageUrl: result.url,
        buffer: result.buffer,
        model,
        panelType,
        geometryPreserved: result.geometryPreserved || false,
        metadata: {
          prompt: fullPrompt,
          revisedPrompt: result.revisedPrompt,
          timestamp: new Date().toISOString(),
          config: { width: result.width, height: result.height },
          mode: result.mode || 'generation',
        },
      };
    } catch (error) {
      logger.error(`[ImageStyler] ${model} failed: ${error.message}`);

      // Try fallback model
      if (model !== this.fallbackModel) {
        logger.warn(`[ImageStyler] Trying fallback: ${this.fallbackModel}`);
        return this.generateStyledRender({
          ...params,
          options: { ...options, model: this.fallbackModel },
        });
      }

      // All models failed
      return {
        success: false,
        error: error.message,
        model,
        panelType,
      };
    }
  }

  /**
   * Get default width for panel type
   */
  getDefaultWidth(panelType, config) {
    // Edit API has smaller size limits
    if (config.supportsEdit) {
      return Math.min(1024, config.maxWidth);
    }
    if (panelType === 'hero_3d') {return Math.min(1792, config.maxWidth);}
    if (panelType === 'interior_3d') {return Math.min(1792, config.maxWidth);}
    return 1024;
  }

  /**
   * Get default height for panel type
   */
  getDefaultHeight(panelType, config) {
    if (config.supportsEdit) {
      return Math.min(1024, config.maxHeight);
    }
    return Math.min(1024, config.maxHeight);
  }

  /**
   * Build styled prompt with DNA context
   *
   * @param {string} panelType
   * @param {string} basePrompt
   * @param {Object} dna
   * @returns {string}
   */
  buildStyledPrompt(panelType, basePrompt, dna) {
    const style = dna?.style || {};
    const materials = style.materials || [];
    const architecture = style.architecture || style.style || 'contemporary';
    const dimensions = dna?.dimensions || {};

    // Extract material descriptions
    const materialDesc = materials
      .slice(0, 3)
      .map((m) => m.name || m.material)
      .filter(Boolean)
      .join(', ');

    // Extract colors
    const colorDesc = materials
      .slice(0, 2)
      .map((m) => m.hexColor || m.color)
      .filter(Boolean)
      .join(' and ');

    // Building context
    const floors = dna?.program?.floors || dimensions.floors || 2;
    const buildingType = dna?.program?.buildingType || 'residential';

    if (panelType === 'hero_3d') {
      return [
        basePrompt || 'Photorealistic architectural exterior visualization',
        `${architecture} style ${buildingType} building`,
        `${floors}-story structure`,
        materialDesc ? `featuring ${materialDesc} materials` : '',
        colorDesc ? `with ${colorDesc} color palette` : '',
        'professional architectural photography',
        'golden hour natural lighting',
        'high-end real estate visualization',
        '8K resolution, sharp details',
        'dramatic sky, landscaped surroundings',
        'PRESERVE the exact building geometry and proportions',
        'no watermarks, no text overlays',
      ]
        .filter(Boolean)
        .join(', ');
    }

    // interior_3d
    return [
      basePrompt || 'Photorealistic architectural interior visualization',
      `${architecture} style interior design`,
      'modern high-quality furniture and fixtures',
      'natural lighting through large windows',
      materialDesc ? `${materialDesc} finishes` : '',
      colorDesc ? `${colorDesc} accent colors` : '',
      'interior design magazine quality',
      '8K resolution, accurate proportions',
      'warm ambient lighting, styled decor',
      'PRESERVE the room layout and proportions',
      'no watermarks, no text overlays',
    ]
      .filter(Boolean)
      .join(', ');
  }

  /**
   * Call the model API
   *
   * @param {string} model - Model name
   * @param {Object} config - Model config
   * @param {Object} params - Request params
   * @returns {Promise<Object>}
   */
  async callModel(model, config, params) {
    if (config.provider === 'openai') {
      return this.callOpenAI(config, params);
    }

    if (config.provider === 'together') {
      return this.callTogether(config, params);
    }

    throw new Error(`Unknown provider: ${config.provider}`);
  }

  /**
   * Call OpenAI Images API (Correction D: IMAGE EDIT)
   *
   * @param {Object} config - Model configuration
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>}
   */
  async callOpenAI(config, params) {
    const { prompt, controlImage, width, height, style, panelType } = params;

    // Select appropriate size (edit API has limited sizes)
    let size = '1024x1024';
    if (config.supportsEdit) {
      // Edit API supports: 1024x1024, 512x512, 256x256
      size = '1024x1024';
    } else if (width > height * 1.2) {
      size = '1792x1024'; // Wide landscape
    } else if (height > width * 1.2) {
      size = '1024x1792'; // Portrait
    }

    // Prepare request body
    const requestBody = {
      prompt,
      size,
      style: style || 'vivid',
      model: config.apiModelId, // Correction A: use apiModelId
      response_format: 'url',
      panelType,
    };

    // Add control image if provided (Correction D)
    if (controlImage) {
      // Convert buffer to base64 if needed
      if (Buffer.isBuffer(controlImage)) {
        requestBody.image = controlImage.toString('base64');
      } else if (typeof controlImage === 'string') {
        // Already base64 or URL
        requestBody.image = controlImage.startsWith('data:')
          ? controlImage.split(',')[1] // Remove data URL prefix
          : controlImage;
      }
    }

    const response = await fetch(`${this.apiBaseUrl}${config.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const imageData = data.images?.[0] || data.data?.[0] || {};

    return {
      url: imageData.url,
      revisedPrompt: imageData.revised_prompt,
      width: parseInt(size.split('x')[0], 10),
      height: parseInt(size.split('x')[1], 10),
      buffer: imageData.b64_json ? Buffer.from(imageData.b64_json, 'base64') : null,
      mode: data.mode || (controlImage ? 'edit' : 'generation'),
      geometryPreserved: data.geometryPreserved || !!controlImage,
    };
  }

  /**
   * Call Together.ai FLUX API
   *
   * @param {Object} config - Model configuration
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>}
   */
  async callTogether(config, params) {
    const { prompt, width, height, strength } = params;
    const steps = config.stepsMapping?.[strength] || 30;

    const response = await fetch(`${this.apiBaseUrl}${config.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        width: Math.min(width, config.maxWidth),
        height: Math.min(height, config.maxHeight),
        steps,
        model: config.apiModelId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Together API error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.output?.[0];

    return {
      url: imageUrl,
      width: Math.min(width, config.maxWidth),
      height: Math.min(height, config.maxHeight),
      buffer: null,
      mode: 'generation',
      geometryPreserved: false, // FLUX doesn't preserve geometry
    };
  }
}

// Export singleton instance
export const imageStylerService = new ImageStylerService();

// Export class for custom instances
export default ImageStylerService;
