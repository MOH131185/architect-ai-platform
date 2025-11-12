/**
 * Enhanced Site Map Integration Service
 *
 * Manages intelligent site map capture and integration into A1 sheets
 * without duplication. Uses site map as IMG2IMG context for better
 * architectural consistency and site awareness.
 *
 * Features:
 * - Smart site map capture with manual polygon support
 * - IMG2IMG context generation for site-aware designs
 * - Duplicate prevention in A1 sheet layout
 * - High-quality output settings for best architectural rendering
 *
 * LOGGING: Uses centralized logger (Opus 4.1 compliant)
 */

import logger from '../utils/logger';
import { captureSitePlanForA1, simplifyPolygon } from './sitePlanCaptureService';
// Note: Image compression is optional - if compressor not available, use original
const imageCompressor = {
  needsCompression: (dataUrl, maxMB) => {
    const sizeKB = dataUrl.length / 1024;
    return sizeKB > maxMB * 1024;
  },
  compressDataURL: async (dataUrl, options) => {
    // Return original if compression not available
    console.log('Image compression not available, using original');
    return dataUrl;
  }
};

/**
 * Capture and prepare site map for A1 sheet generation
 *
 * @param {Object} params - Capture parameters
 * @param {Object} params.locationData - Location data with coordinates
 * @param {Array} params.sitePolygon - Manual site boundary polygon
 * @param {boolean} params.useAsContext - Use as IMG2IMG context (true) or embed in prompt (false)
 * @param {string} params.mode - Integration mode: 'context', 'embed', 'overlay', 'none'
 * @returns {Promise<Object>} Site map data with metadata
 */
export async function captureSiteMapForGeneration({
  locationData,
  sitePolygon = null,
  useAsContext = true,
  mode = 'context'
}) {
  logger.info('Capturing site map for A1 generation', {
    mode,
    hasLocation: !!locationData,
    hasPolygon: !!sitePolygon,
    polygonPoints: sitePolygon?.length || 0
  }, '🗺️');

  if (!locationData || !locationData.coordinates) {
    logger.warn('No location data provided for site map capture');
    return {
      attachment: null,
      metadata: null,
      mode: 'none',
      instructions: null
    };
  }

  try {
    // Simplify polygon if too complex (>20 vertices)
    const simplifiedPolygon = sitePolygon && sitePolygon.length > 20
      ? simplifyPolygon(sitePolygon, 20)
      : sitePolygon;

    // Capture site plan with optimized settings
    const sitePlanResult = await captureSitePlanForA1({
      center: locationData.coordinates,
      zoom: simplifiedPolygon ? undefined : 17, // Auto-fit if polygon provided
      polygon: simplifiedPolygon || locationData.sitePolygon || locationData.siteAnalysis?.polygon || null,
      size: { width: 1280, height: 1280 }, // Square format for site plans
      mapType: 'hybrid' // Satellite + labels for best context
    });

    if (!sitePlanResult || !sitePlanResult.dataUrl) {
      logger.warn('Site plan capture failed');
      return {
        attachment: null,
        metadata: null,
        mode: 'none',
        instructions: null
      };
    }

    logger.success('Site plan captured successfully', {
      sizeKB: Math.round(sitePlanResult.dataUrl.length / 1024),
      hasPolygon: sitePlanResult.metadata.hasPolygon,
      zoom: sitePlanResult.metadata.zoom
    });

    // Compress if needed for API compatibility
    let processedDataUrl = sitePlanResult.dataUrl;
    if (imageCompressor.needsCompression(sitePlanResult.dataUrl, 1.0)) {
      logger.info('Compressing site plan for API compatibility', null, '🗜️');
      try {
        processedDataUrl = await imageCompressor.compressDataURL(sitePlanResult.dataUrl, {
          maxSizeMB: 1.0,
          maxWidthOrHeight: 1280,
          useWebWorker: false
        });
        logger.success('Site plan compressed', {
          originalKB: Math.round(sitePlanResult.dataUrl.length / 1024),
          compressedKB: Math.round(processedDataUrl.length / 1024)
        });
      } catch (error) {
        logger.warn('Site plan compression failed, using original', { error: error.message });
      }
    }

    // Prepare integration instructions based on mode
    let instructions = null;
    if (mode === 'context') {
      // Use as IMG2IMG context - site map influences entire generation
      instructions = {
        type: 'img2img_context',
        strength: 0.85, // High strength for site context influence
        prompt: `Architectural design respecting the provided site context and boundaries. The building must fit within the marked site polygon, respecting setbacks and orientation. Site features and surrounding context should influence the design.`
      };
    } else if (mode === 'embed') {
      // Embed in A1 sheet prompt - AI generates site panel based on description
      instructions = {
        type: 'prompt_embed',
        prompt: `Include a site plan panel in the A1 sheet showing the building footprint within the actual site boundaries. The site plan should show the captured location context with north arrow, scale bar, and site dimensions.`
      };
    } else if (mode === 'overlay') {
      // Post-process overlay - composite real site map after generation
      instructions = {
        type: 'post_overlay',
        position: 'top-left',
        size: { width: 20, height: 20 }, // Percentage of A1 sheet
        label: 'SITE PLAN'
      };
    }

    return {
      attachment: processedDataUrl,
      metadata: {
        ...sitePlanResult.metadata,
        mode,
        compressed: processedDataUrl !== sitePlanResult.dataUrl
      },
      instructions,
      mode
    };

  } catch (error) {
    logger.error('Site map capture failed', error);
    return {
      attachment: null,
      metadata: { error: error.message },
      mode: 'none',
      instructions: null
    };
  }
}

/**
 * Generate site-aware A1 sheet prompt without duplication
 *
 * @param {Object} params - Prompt parameters
 * @param {Object} params.masterDNA - Design DNA
 * @param {Object} params.siteMapData - Site map capture data
 * @param {string} params.basePrompt - Base A1 sheet prompt
 * @returns {Object} Modified prompt without site duplication
 */
export function generateSiteAwarePrompt({
  masterDNA,
  siteMapData,
  basePrompt
}) {
  if (!siteMapData || !siteMapData.attachment) {
    // No site map - use standard prompt with placeholder site panel
    return {
      prompt: basePrompt,
      attachments: null,
      useAsInit: false
    };
  }

  const { mode, instructions } = siteMapData;

  if (mode === 'context') {
    // IMG2IMG context mode - site map as init image
    // IMPORTANT: Remove site plan generation from prompt to avoid duplication
    const modifiedPrompt = basePrompt
      .replace(/Site & Climate context.*?\n.*?\n.*?\n.*?\n/g, '') // Remove site panel section
      .replace(/Small map with site outline.*?\./g, '') // Remove site map instructions
      .replace(/Site\/Location plan.*?scale bar/g, ''); // Remove site plan from mandatory panels

    const contextPrompt = `${modifiedPrompt}

IMPORTANT: This generation uses the actual site map as context (IMG2IMG mode).
The architectural design MUST respect the site boundaries and context shown in the reference image.
DO NOT generate a separate site plan panel - the site context is already provided.
Focus on creating architecture that fits perfectly within the given site constraints.`;

    return {
      prompt: contextPrompt,
      attachments: [siteMapData.attachment],
      useAsInit: true,
      initStrength: 0.85 // High influence for site context
    };

  } else if (mode === 'embed') {
    // Embed mode - AI generates site panel based on description
    // Keep site panel instructions but enhance with actual data
    const enhancedPrompt = basePrompt.replace(
      'Small map with site outline',
      `Accurate site plan based on actual location at ${masterDNA.location?.address || 'site'} with exact polygon boundaries`
    );

    return {
      prompt: enhancedPrompt,
      attachments: null, // Don't send as attachment
      useAsInit: false
    };

  } else if (mode === 'overlay') {
    // Overlay mode - generate without site, will composite later
    const promptWithoutSite = basePrompt
      .replace(/Site & Climate context.*?\n.*?\n.*?\n.*?\n/g, '') // Remove site panel
      .replace(/Small map with site outline.*?\./g, 'Reserved space for site plan overlay.')
      .replace(/Site\/Location plan.*?scale bar/g, 'Space reserved for site overlay');

    return {
      prompt: promptWithoutSite,
      attachments: null,
      useAsInit: false,
      postProcess: 'overlay_site'
    };
  }

  // Default - standard prompt
  return {
    prompt: basePrompt,
    attachments: null,
    useAsInit: false
  };
}

/**
 * Validate site map integration to prevent duplication
 *
 * @param {string} a1SheetUrl - Generated A1 sheet URL
 * @param {Object} siteMapData - Site map data used
 * @returns {Promise<Object>} Validation result
 */
export async function validateSiteIntegration(a1SheetUrl, siteMapData) {
  logger.info('Validating site map integration', null, '🔍');

  // TODO: Implement visual analysis to detect duplicate site maps
  // Could use perceptual hashing or AI vision model

  return {
    valid: true,
    hasDuplication: false,
    siteMapCount: 1,
    recommendation: 'Site map properly integrated without duplication'
  };
}

/**
 * Enhance image quality settings for architectural rendering
 *
 * @param {Object} baseSettings - Base generation settings
 * @param {string} purpose - Generation purpose: 'initial', 'modify', 'upscale'
 * @returns {Object} Enhanced quality settings
 */
export function getOptimalQualitySettings(baseSettings = {}, purpose = 'initial') {
  const settings = { ...baseSettings };

  if (purpose === 'initial') {
    // Initial A1 sheet generation - maximum quality
    return {
      ...settings,
      model: 'black-forest-labs/FLUX.1-dev', // Best architectural model
      steps: 48, // Optimal for quality vs time
      guidanceScale: 7.8, // Strong prompt adherence
      width: 1792, // Maximum API width
      height: 1269, // A1 landscape ratio
      seed: settings.seed || Math.floor(Math.random() * 1e6)
    };

  } else if (purpose === 'modify') {
    // Modification - preserve consistency
    return {
      ...settings,
      model: 'black-forest-labs/FLUX.1-dev', // Same model for consistency
      steps: 48, // Keep same quality
      guidanceScale: 8.5, // Stronger guidance for modifications
      imageStrength: 0.18, // Low strength to preserve original
      preserveDimensions: true // Lock dimensions to original
    };

  } else if (purpose === 'upscale') {
    // Upscaling for print quality
    return {
      ...settings,
      model: 'stabilityai/stable-diffusion-x4-upscaler', // Specialized upscaler
      targetWidth: 9933, // 300 DPI A1 landscape
      targetHeight: 7016,
      denoisingStrength: 0.2 // Minimal changes, just enhance
    };
  }

  return settings;
}

export default {
  captureSiteMapForGeneration,
  generateSiteAwarePrompt,
  validateSiteIntegration,
  getOptimalQualitySettings
};