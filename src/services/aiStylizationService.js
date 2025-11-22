/**
 * AI Stylization Service
 *
 * DEPRECATED: ControlNet-based stylization is no longer part of the A1-only workflow.
 * This module remains for backward compatibility with legacy geometry-first experiments.
 * The `aiStylization` feature flag should stay disabled in production.
 */

import { isFeatureEnabled } from '../config/featureFlags.js';
import logger from '../utils/logger.js';


/**
 * Apply AI stylization to geometry views using ControlNet
 */
export async function stylizeGeometryViews(geometryUrls, design, masterDNA) {
  logger.info('🎨 Starting AI stylization of geometry views...');

  if (!isFeatureEnabled('aiStylization')) {
    logger.info('AI stylization disabled via feature flag');
    return null;
  }

  const seed = design.dna?.seed || Math.floor(Math.random() * 1000000);

  const stylizedResults = {
    axonometric: null,
    perspective: null,
    interior: null,
    floorPlans: [],
    elevations: []
  };

  try {
    // Stylize 3D views with depth/normal ControlNet
    if (geometryUrls.axon) {
      stylizedResults.axonometric = await stylizeWithControlNet(
        geometryUrls.axon,
        design,
        masterDNA,
        'axonometric',
        seed
      );
    }

    if (geometryUrls.persp) {
      stylizedResults.perspective = await stylizeWithControlNet(
        geometryUrls.persp,
        design,
        masterDNA,
        'perspective',
        seed
      );
    }

    if (geometryUrls.interior) {
      stylizedResults.interior = await stylizeWithControlNet(
        geometryUrls.interior,
        design,
        masterDNA,
        'interior',
        seed
      );
    }

    logger.success(' AI stylization complete');
    return stylizedResults;

  } catch (error) {
    logger.error('❌ AI stylization failed:', error);
    return null;
  }
}

/**
 * Apply ControlNet-based stylization to a single view
 */
async function stylizeWithControlNet(imageUrl, design, masterDNA, viewType, seed) {
  logger.info(`  Stylizing ${viewType} view...`);

  const prompt = buildStylizationPrompt(design, masterDNA, viewType);
  const controlNetType = getControlNetType(viewType);

  // Together.ai does not provide ControlNet support; this legacy flow relies on Replicate SDXL.
  // New implementations should favor DNA-driven consistency via togetherAIService instead.

  const requestBody = {
    model: 'stability-ai/sdxl:controlnet',
    input: {
      image: imageUrl,
      prompt: prompt,
      negative_prompt: buildNegativePrompt(viewType),
      control_type: controlNetType,
      control_strength: 0.75, // Strong guidance from geometry
      guidance_scale: 4.0, // Lower guidance for more photorealism
      num_inference_steps: 30,
      seed: seed,
      width: 1024,
      height: 1024
    }
  };

  try {
    const response = await fetch('/api/replicate/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`ControlNet API failed: ${response.status}`);
    }

    const prediction = await response.json();

    // Poll for completion
    const result = await pollPredictionStatus(prediction.id);

    return {
      url: result.output?.[0],
      prompt: prompt,
      controlType: controlNetType,
      seed: seed
    };

  } catch (error) {
    logger.error(`  Failed to stylize ${viewType}:`, error);
    return null;
  }
}

/**
 * Build stylization prompt from DNA
 */
function buildStylizationPrompt(design, masterDNA, viewType) {
  const materials = masterDNA?.materials || [];
  const style = masterDNA?.architecturalStyle || design.dna?.style || 'modern';

  // Extract material descriptions
  const materialDesc = materials
    .map(m => `${m.name} (${m.hexColor})`)
    .join(', ');

  const basePrompts = {
    axonometric: `Photorealistic architectural rendering, axonometric view, ${style} architecture`,
    perspective: `Photorealistic architectural photograph, exterior perspective, ${style} style house`,
    interior: `Photorealistic interior photograph, ${style} interior design`,
    floor_plan: `Professional architectural floor plan drawing, clean CAD style`,
    elevation: `Professional architectural elevation drawing, technical precision`
  };

  let prompt = basePrompts[viewType] || basePrompts.perspective;

  // Add material details
  if (materialDesc) {
    prompt += `, materials: ${materialDesc}`;
  }

  // Add context from DNA
  if (masterDNA?.dimensions) {
    const { length, width, floorCount } = masterDNA.dimensions;
    prompt += `, ${floorCount}-story building, ${length}m x ${width}m`;
  }

  // Add quality modifiers
  prompt += `, high quality, professional photography, natural lighting, realistic textures, architectural photography`;

  return prompt;
}

/**
 * Get appropriate ControlNet type for view
 */
function getControlNetType(viewType) {
  const controlNetTypes = {
    axonometric: 'depth', // Depth map preserves 3D geometry
    perspective: 'depth',
    interior: 'normal', // Normal maps for interior surfaces
    floor_plan: 'canny', // Edge detection for plans
    elevation: 'hed' // HED for technical drawings
  };

  return controlNetTypes[viewType] || 'depth';
}

/**
 * Build negative prompt to avoid common issues
 */
function buildNegativePrompt(viewType) {
  const commonNegatives = 'low quality, blurry, distorted, unrealistic, cartoon, anime, sketch';

  const viewSpecificNegatives = {
    axonometric: 'perspective distortion, fish-eye, warped',
    perspective: 'unrealistic proportions, impossible geometry',
    interior: 'cluttered, messy, dark, gloomy',
    floor_plan: '3D, perspective, shading, shadows',
    elevation: 'perspective, depth, 3D rendering'
  };

  return `${commonNegatives}, ${viewSpecificNegatives[viewType] || ''}`;
}

/**
 * Poll Replicate prediction status
 */
async function pollPredictionStatus(predictionId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay

    const response = await fetch(`/api/replicate/predictions/${predictionId}`);
    const prediction = await response.json();

    if (prediction.status === 'succeeded') {
      return prediction;
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Prediction failed: ${prediction.error || 'Unknown error'}`);
    }

    logger.info(`  Polling ${predictionId}: ${prediction.status}...`);
  }

  throw new Error('Prediction timeout');
}

/**
 * Apply stylization to floor plans and elevations (HED/Canny ControlNet)
 */
export async function stylizeTechnicalDrawings(svgUrls, design, masterDNA) {
  logger.info('📐 Stylizing technical drawings...');

  if (!isFeatureEnabled('aiStylization')) {
    return null;
  }

  const results = [];

  for (const drawing of svgUrls) {
    const { type, url, direction } = drawing;

    const controlType = type === 'floor_plan' ? 'canny' : 'hed';
    const viewType = type === 'floor_plan' ? 'floor_plan' : 'elevation';

    const stylized = await stylizeWithControlNet(
      url,
      design,
      masterDNA,
      viewType,
      design.dna?.seed
    );

    if (stylized) {
      results.push({
        ...drawing,
        stylizedUrl: stylized.url,
        controlType
      });
    }
  }

  logger.success(` Stylized ${results.length} technical drawings`);
  return results;
}

/**
 * Fallback: Use basic image-to-image without ControlNet
 */
export async function stylizeWithBasicImg2Img(imageUrl, design, masterDNA, viewType) {
  logger.info(`  Using fallback img2img for ${viewType}...`);

  const prompt = buildStylizationPrompt(design, masterDNA, viewType);

  const requestBody = {
    model: 'black-forest-labs/FLUX.1-dev',
    prompt: prompt,
    image: imageUrl,
    prompt_strength: 0.75, // How much to preserve original
    num_inference_steps: 30,
    seed: design.dna?.seed || Math.floor(Math.random() * 1000000)
  };

  try {
    const response = await fetch('/api/together/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      url: result.data?.[0]?.url || result.url,
      prompt: prompt
    };

  } catch (error) {
    logger.error(`Fallback img2img failed for ${viewType}:`, error);
    return null;
  }
}
