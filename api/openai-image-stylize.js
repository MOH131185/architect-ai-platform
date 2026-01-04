/**
 * OpenAI Image Stylization API Endpoint
 *
 * Uses OpenAI's IMAGE EDIT API for photorealistic styled renders.
 * ONLY used for hero_3d and interior_3d panels.
 *
 * MANDATORY CORRECTION D:
 * - Must be an IMAGE EDIT with Blender render passed as input
 * - This preserves geometry from the control image
 *
 * MANDATORY CORRECTION A:
 * - Model ID must be "gpt-image-1.5" (not openai/...)
 * - Model adapter for easy swapping
 *
 * Supports:
 * - gpt-image-1.5 (recommended - default)
 * - dall-e-2 (legacy - for image edit, dall-e-3 doesn't support edit)
 *
 * Falls back to Together.ai FLUX if no OpenAI API key.
 *
 * POST /api/openai-image-stylize
 * Body: {
 *   prompt: string (required),
 *   image: string (base64 - Blender render for geometry preservation),
 *   mask?: string (base64 - optional mask for inpainting),
 *   size?: '1024x1024' | '512x512' | '256x256',
 *   model?: 'gpt-image-1.5' | 'dall-e-2',
 *   response_format?: 'url' | 'b64_json',
 *   panelType?: 'hero_3d' | 'interior_3d',
 * }
 *
 * Part of Phase 4: Meshy + Blender + OpenAI Pipeline Refactor
 */

// Force Node.js runtime for OpenAI API calls
export const runtime = 'nodejs';
export const config = {
  runtime: 'nodejs',
  maxDuration: 120, // Allow more time for image edit
};

/**
 * Model Adapter Pattern (Correction A)
 * Maps friendly model names to API model IDs
 */
const MODEL_ADAPTERS = {
  // Primary model (Correction A: use "gpt-image-1.5" not "openai/...")
  'gpt-image-1.5': {
    apiModel: 'gpt-image-1.5',
    supportsEdit: true,
    supportsGeneration: true,
    maxSize: '1024x1024',
    endpoint: 'edits', // Use edit endpoint for geometry preservation
  },
  // Legacy fallback (dall-e-2 supports edit, dall-e-3 does not)
  'dall-e-2': {
    apiModel: 'dall-e-2',
    supportsEdit: true,
    supportsGeneration: true,
    maxSize: '1024x1024',
    endpoint: 'edits',
  },
  // Generation-only model (not used for styling due to no control)
  'dall-e-3': {
    apiModel: 'dall-e-3',
    supportsEdit: false,
    supportsGeneration: true,
    maxSize: '1792x1024',
    endpoint: 'generations',
  },
};

/**
 * Get model adapter
 * @param {string} modelName - Model name
 * @returns {Object} - Model adapter configuration
 */
function getModelAdapter(modelName) {
  const adapter = MODEL_ADAPTERS[modelName];
  if (!adapter) {
    console.warn(`[OpenAI-Stylize] Unknown model: ${modelName}, falling back to gpt-image-1.5`);
    return MODEL_ADAPTERS['gpt-image-1.5'];
  }
  return adapter;
}

/**
 * Create multipart form data for image edit
 * @param {Object} params - Request parameters
 * @returns {FormData}
 */
function createFormData(params) {
  const FormData = require('form-data');
  const form = new FormData();

  // Add image (required for edit)
  if (params.image) {
    // Handle base64 or Buffer
    const imageBuffer = Buffer.isBuffer(params.image)
      ? params.image
      : Buffer.from(params.image, 'base64');

    form.append('image', imageBuffer, {
      filename: 'input.png',
      contentType: 'image/png',
    });
  }

  // Add optional mask
  if (params.mask) {
    const maskBuffer = Buffer.isBuffer(params.mask)
      ? params.mask
      : Buffer.from(params.mask, 'base64');

    form.append('mask', maskBuffer, {
      filename: 'mask.png',
      contentType: 'image/png',
    });
  }

  form.append('prompt', params.prompt);
  form.append('n', '1');
  form.append('size', params.size || '1024x1024');
  form.append('response_format', params.response_format || 'url');

  // Note: model is added to headers/endpoint, not form for some endpoints
  if (params.model) {
    form.append('model', params.model);
  }

  return form;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are supported',
    });
  }

  const {
    prompt,
    image, // Base64 Blender render (Correction D)
    mask,
    size = '1024x1024',
    model = 'gpt-image-1.5', // Default to gpt-image-1.5 (Correction A)
    response_format = 'url',
    panelType,
  } = req.body;

  // Validate required fields
  if (!prompt) {
    return res.status(400).json({
      error: 'MISSING_PROMPT',
      message: 'Prompt is required for image generation',
    });
  }

  // Validate panel type if provided
  const validPanelTypes = ['hero_3d', 'interior_3d'];
  if (panelType && !validPanelTypes.includes(panelType)) {
    return res.status(400).json({
      error: 'INVALID_PANEL_TYPE',
      message: `Panel type must be one of: ${validPanelTypes.join(', ')}`,
      provided: panelType,
    });
  }

  // Get model adapter (Correction A)
  const adapter = getModelAdapter(model);

  // Validate size
  const validSizes = ['1024x1024', '512x512', '256x256'];
  const validatedSize = validSizes.includes(size) ? size : '1024x1024';

  // Check for OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_REASONING_API_KEY;

  if (!apiKey) {
    console.log('[OpenAI-Stylize] No OpenAI API key, redirecting to FLUX fallback');

    // Redirect to Together.ai FLUX endpoint
    try {
      const [widthStr, heightStr] = validatedSize.split('x');
      const width = parseInt(widthStr, 10);
      const height = parseInt(heightStr, 10);

      // Forward to together-image endpoint
      const fluxResponse = await fetch(
        `${req.headers.origin || 'http://localhost:3001'}/api/together-image`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            width: Math.min(width, 1792),
            height: Math.min(height, 1792),
            steps: 30,
            model: 'black-forest-labs/FLUX.1-dev',
            // Note: FLUX doesn't support img2img directly here
          }),
        }
      );

      if (!fluxResponse.ok) {
        const error = await fluxResponse.json().catch(() => ({}));
        return res.status(fluxResponse.status).json({
          error: 'FLUX_FALLBACK_FAILED',
          message: error.message || 'FLUX fallback failed',
          fallbackUsed: true,
        });
      }

      const fluxData = await fluxResponse.json();
      return res.status(200).json({
        images: [
          {
            url: fluxData.data?.[0]?.url || fluxData.output?.[0],
            revised_prompt: prompt,
          },
        ],
        fallbackUsed: true,
        fallbackModel: 'FLUX.1-dev',
        note: 'Geometry preservation not available in fallback mode',
      });
    } catch (fluxError) {
      console.error('[OpenAI-Stylize] FLUX fallback failed:', fluxError.message);
      return res.status(503).json({
        error: 'NO_IMAGE_PROVIDER',
        message: 'No OpenAI API key and FLUX fallback failed',
        recommendation: 'Set OPENAI_API_KEY environment variable',
      });
    }
  }

  // Determine if we should use edit or generation
  const useEdit = image && adapter.supportsEdit;

  try {
    console.log(
      `[OpenAI-Stylize] ${useEdit ? 'EDIT' : 'GENERATE'} ${validatedSize} with ${adapter.apiModel}`
    );

    let openaiResponse;

    if (useEdit) {
      // IMAGE EDIT API (Correction D: preserves geometry)
      console.log('[OpenAI-Stylize] Using IMAGE EDIT API with control image');

      const form = createFormData({
        image,
        mask,
        prompt,
        size: validatedSize,
        model: adapter.apiModel,
        response_format,
      });

      openaiResponse = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        body: form,
      });
    } else {
      // IMAGE GENERATION API (fallback if no control image)
      console.log('[OpenAI-Stylize] Using IMAGE GENERATION API (no control image)');

      openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: adapter.apiModel,
          prompt,
          n: 1,
          size: validatedSize,
          response_format,
        }),
      });
    }

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json().catch(() => ({}));
      console.error('[OpenAI-Stylize] OpenAI API error:', error);

      // If rate limited or quota exceeded, try FLUX fallback
      if (openaiResponse.status === 429 || openaiResponse.status === 402) {
        console.log('[OpenAI-Stylize] Rate limited, returning error for client-side fallback');
      }

      return res.status(openaiResponse.status).json({
        error: 'OPENAI_API_ERROR',
        message: error.error?.message || `OpenAI API error: ${openaiResponse.status}`,
        details: error,
        canFallback: true,
      });
    }

    const data = await openaiResponse.json();
    const imageData = data.data?.[0];

    if (!imageData) {
      return res.status(500).json({
        error: 'NO_IMAGE_GENERATED',
        message: 'OpenAI did not return an image',
        response: data,
      });
    }

    console.log(
      `[OpenAI-Stylize] Successfully ${useEdit ? 'edited' : 'generated'} image (${validatedSize})`
    );

    // Return standardized response
    return res.status(200).json({
      images: [
        {
          url: imageData.url,
          b64_json: imageData.b64_json,
          revised_prompt: imageData.revised_prompt || prompt,
        },
      ],
      model: adapter.apiModel,
      size: validatedSize,
      mode: useEdit ? 'edit' : 'generation',
      geometryPreserved: useEdit,
      panelType,
    });
  } catch (error) {
    console.error('[OpenAI-Stylize] Error:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message,
    });
  }
}
