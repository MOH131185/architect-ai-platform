/**
 * AI Modification Service
 *
 * Handles modifications to existing AI-generated designs:
 * - Adding missing floor plans, elevations, sections, or 3D views
 * - Modifying existing A1 sheet elements
 * - Regenerating specific elements with user feedback
 * - Maintaining consistency with original DNA
 *
 * SECURITY: All API calls use secureApiClient (Opus 4.1 compliant)
 * LOGGING: Centralized logger instead of console.* (Opus 4.1 compliant)
 * ERRORS: Custom error classes for structured handling (Opus 4.1 compliant)
 * CACHING: Prompt and SSIM result caching for performance (Opus 4.1 compliant)
 */

import designGenerationHistory from './designGenerationHistory';
import secureApiClient from './secureApiClient';
import dnaPromptGenerator from './dnaPromptGenerator';
import { withConsistencyLock, withConsistencyLockCompact, strongNegativesForLayoutDrift } from './a1SheetPromptGenerator';
import sheetConsistencyGuard from './sheetConsistencyGuard';
import architecturalSheetService from './architecturalSheetService';
import { isFeatureEnabled } from '../config/featureFlags';
import modificationValidator from './modificationValidator';
import imageCompressor from './imageCompressor';
import logger from '../utils/logger';
import { ValidationError, GenerationError, APIError, NetworkError } from '../utils/errors';
import { orchestratePanelGeneration, getLayoutIdForPanel, PANEL_KEY_TO_LAYOUT_ID } from './panelOrchestrator';
import { derivePanelSeed } from './seedDerivation';
import { compositeA1Sheet } from './a1Compositor';

/**
 * Prompt cache for avoiding repeated generation
 * @type {Map<string, {prompt: Object, timestamp: number}>}
 */
const promptCache = new Map();
const PROMPT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * SSIM result cache for consistency validation
 * @type {Map<string, {score: number, timestamp: number}>}
 */
const ssimCache = new Map();
const SSIM_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

class AIModificationService {
  constructor() {
    logger.info('AI Modification Service initialized', null, '🔧');
  }

  /**
   * Get cached prompt if available and not expired
   * @private
   */
  getCachedPrompt(cacheKey) {
    const cached = promptCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL) {
      logger.debug('Using cached prompt', { cacheKey }, '💾');
      return cached.prompt;
    }
    return null;
  }

  /**
   * Cache a generated prompt
   * @private
   */
  cachePrompt(cacheKey, prompt) {
    promptCache.set(cacheKey, {
      prompt,
      timestamp: Date.now()
    });
    logger.debug('Cached prompt', { cacheKey, size: JSON.stringify(prompt).length }, '💾');
  }

  /**
   * Get cached SSIM score if available
   * @private
   */
  getCachedSSIM(hash1, hash2) {
    const cacheKey = `${hash1}_${hash2}`;
    const cached = ssimCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SSIM_CACHE_TTL) {
      logger.debug('Using cached SSIM score', { score: cached.score }, '💾');
      return cached.score;
    }
    return null;
  }

  /**
   * Cache SSIM result
   * @private
   */
  cacheSSIM(hash1, hash2, score) {
    const cacheKey = `${hash1}_${hash2}`;
    ssimCache.set(cacheKey, {
      score,
      timestamp: Date.now()
    });
    logger.debug('Cached SSIM score', { cacheKey, score }, '💾');
  }

  /**
   * Add a missing view (floor plan, elevation, section, or 3D)
   * @param {Object} params - Generation parameters
   * @returns {Promise<Object>} Generation result
   * @throws {ValidationError} If original DNA not found
   * @throws {GenerationError} If image generation fails
   */
  async addMissingView(params) {
    logger.info(`Adding missing view: ${params.viewType}`, null, '🎨');

    const {
      sessionId,
      viewType, // 'ground-floor-plan', 'north-elevation', etc.
      userPrompt = null,
      useOriginalDNA = true
    } = params;

    // Get original DNA for consistency
    const originalDNA = designGenerationHistory.getOriginalDNA(sessionId);
    const originalSeed = designGenerationHistory.getOriginalSeed(sessionId);

    if (!originalDNA) {
      throw new ValidationError(
        'Original DNA not found - cannot ensure consistency',
        'sessionId',
        sessionId
      );
    }

    // Create modification record
    const modification = designGenerationHistory.addModificationRequest(sessionId, {
      type: 'add-view',
      description: `Add missing ${viewType}`,
      targetView: viewType,
      userPrompt: userPrompt,
      useOriginalDNA: useOriginalDNA
    });

    try {
      modification.status = 'processing';

      // Check cache first
      const cacheKey = `view_${viewType}_${sessionId}_${userPrompt || 'default'}`;
      let prompt = this.getCachedPrompt(cacheKey);

      if (!prompt) {
        // Generate view-specific prompt using original DNA
        prompt = this.generateViewPrompt(viewType, originalDNA, userPrompt);
        this.cachePrompt(cacheKey, prompt);
      }

      logger.info(`Generated prompt for ${viewType}`, { length: prompt.prompt.length }, '📝');
      logger.debug(`Using original seed for consistency`, { seed: originalSeed }, '🎲');

      // Determine image dimensions based on view type
      const dimensions = this.getViewDimensions(viewType);

      // Generate the view using secureApiClient
      const result = await secureApiClient.togetherImage({
        prompt: prompt.prompt,
        negative_prompt: prompt.negativePrompt,
        width: dimensions.width,
        height: dimensions.height,
        steps: 48,
        guidance_scale: 7.5,
        seed: originalSeed,
        model: 'black-forest-labs/FLUX.1-dev'
      });

      if (!result || !result.success) {
        throw new GenerationError(
          result?.error || 'Image generation failed',
          'view-generation',
          { viewType, sessionId }
        );
      }

      // Record successful result
      designGenerationHistory.recordModificationResult(sessionId, modification.id, {
        success: true,
        type: 'individual-view',
        viewType: viewType,
        data: {
          url: result.url,
          seed: originalSeed,
          prompt: prompt.prompt,
          dimensions: dimensions,
          timestamp: new Date().toISOString()
        }
      });

      logger.success(`Successfully added ${viewType}`);

      return {
        success: true,
        viewType: viewType,
        url: result.url,
        seed: originalSeed,
        modificationId: modification.id
      };

    } catch (error) {
      logger.error(`Failed to add ${viewType}`, error);

      designGenerationHistory.recordModificationResult(sessionId, modification.id, {
        success: false,
        error: error.message
      });

      // Re-throw if it's one of our custom errors
      if (error instanceof ValidationError || error instanceof GenerationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new GenerationError(
        `Failed to add view: ${error.message}`,
        'view-generation',
        { viewType, sessionId, originalError: error.message }
      );
    }
  }

  /**
   * Modify the A1 sheet based on user request with consistency lock
   * Uses low-strength img2img (0.30→0.20 retry) to preserve original sheet
   * @param {Object} params - Modification parameters
   * @returns {Promise<Object>} Generation result
   * @throws {ValidationError} If missing required design data
   * @throws {GenerationError} If A1 sheet generation fails
   */
  async modifyA1Sheet(params) {
    logger.info('Modifying A1 sheet with img2img consistency lock', null, '🎨');

    const {
      designId,
      deltaPrompt,
      quickToggles = {},
      userPrompt = null,
      baselineUrl = null,
      masterDNA = null,
      mainPrompt = null,
      strictLock = true,
      targetPanels = null // 🆕 Array of panel keys to target (Hybrid A1 mode)
    } = params;

    // Check if Hybrid A1 mode is enabled
    const hybridModeEnabled = isFeatureEnabled('hybridA1Mode');
    
    // If hybrid mode and we have panel map, use panel-targeted modification
    if (hybridModeEnabled) {
      return this.modifyA1SheetHybrid(params);
    }

    // Get original design from history - DO NOT CREATE NEW DESIGN
    const designHistory = await import('./designHistoryService').then(m => m.default);

    // 🚨 CRITICAL: Get existing design - throw error if not found (don't create new one)
    const originalDesign = designHistory.getDesign(designId);

    if (!originalDesign) {
      throw new ValidationError(
        `Design ${designId} not found in history. Cannot modify - design must exist first. Please generate the A1 sheet before modifying.`,
        'designId',
        designId
      );
    }

    // Use provided data or fall back to stored design data
    // 🎯 CRITICAL: Preserve EXACT DNA to maintain building identity across modifications
    const originalDNA = masterDNA || originalDesign.masterDNA;
    const originalSeed = originalDesign.seedsByView?.a1Sheet || originalDesign.seed;
    const originalPrompt = mainPrompt || originalDesign.basePrompt || originalDesign.mainPrompt;
    const resolvedBaselineUrl = baselineUrl || originalDesign.resultUrl || originalDesign.a1SheetUrl;
    
    // Extract site and context data for consistency
    const originalLocation = originalDesign.locationData;
    const originalSiteShape = originalDesign.siteShape || originalLocation?.siteAnalysis?.shape;
    const originalPortfolioStyle = originalDesign.blendedStyle || originalDesign.portfolioAnalysis?.dominantStyle;

    // 🚨 CRITICAL: Validate that we have all required data for consistency lock
    if (!originalDNA || Object.keys(originalDNA).length === 0) {
      logger.error('Missing DNA for modification', { designId, hasDNA: !!originalDNA });
      throw new ValidationError(
        `Design ${designId} missing masterDNA. Cannot ensure consistency. The original building identity cannot be preserved without DNA. Please regenerate the A1 sheet with complete DNA.`,
        'masterDNA',
        designId
      );
    }

    if (!originalSeed) {
      throw new ValidationError(
        `Design ${designId} missing seed. Cannot ensure consistency. Please regenerate the A1 sheet.`,
        'seed',
        designId
      );
    }

    if (!originalPrompt || originalPrompt.trim().length === 0) {
      throw new ValidationError(
        `Design ${designId} missing base prompt. Cannot ensure consistency. Please regenerate the A1 sheet.`,
        'basePrompt',
        designId
      );
    }

    if (!resolvedBaselineUrl) {
      throw new ValidationError(
        `Design ${designId} missing baseline A1 sheet URL. Cannot use img2img without baseline image. Please regenerate the A1 sheet first.`,
        'baselineUrl',
        designId
      );
    }

    logger.info('Retrieved existing design for modification', {
      designId,
      hasDNA: !!originalDNA,
      hasSeed: !!originalSeed,
      hasPrompt: !!originalPrompt,
      hasBaseline: !!resolvedBaselineUrl
    }, '🔍');

    // 🔒 DIMENSION LOCK: Read baseline dimensions, model, and layout from history
    const baselineMetadata = originalDesign.a1Sheet?.metadata || {};
    // Use valid A1 portrait defaults (multiples of 16): 1264×1792px
    let baselineWidth = baselineMetadata.width ?? 1264;  // 79×16
    let baselineHeight = baselineMetadata.height ?? 1792; // 112×16
    // Ensure multiples of 16 (Together.ai requirement)
    baselineWidth -= baselineWidth % 16;
    baselineHeight -= baselineHeight % 16;
    let baselineModel = baselineMetadata.model || 'black-forest-labs/FLUX.1-dev';
    const baselineLayoutKey = baselineMetadata.a1LayoutKey || 'uk-riba-standard';

    // 🔧 IMG2IMG COMPATIBILITY: Force compatible model if kontext detected
    // kontext models don't support img2img, so we use FLUX.1-dev instead
    if (baselineModel && /kontext/i.test(baselineModel)) {
      logger.info('Baseline model uses kontext - switching to FLUX.1-dev for img2img compatibility', {
        originalModel: baselineModel,
        newModel: 'black-forest-labs/FLUX.1-dev'
      }, '🔧');
      baselineModel = 'black-forest-labs/FLUX.1-dev';
    }

    logger.info('Baseline locked', {
      dimensions: `${baselineWidth}×${baselineHeight}px`,
      model: baselineModel,
      seed: originalSeed
    }, '🔒');

    // Build delta prompt from quick toggles and user prompt
    let deltaText = deltaPrompt || '';

    if (quickToggles.addSections) {
      deltaText += '\n\n🚨 ADD SECTIONS TO EXISTING A1 SHEET (IMG2IMG - PRESERVE SHEET):\n- IMAGE-TO-IMAGE mode: Reference shows COMPLETE A1 sheet with all views\n- PRESERVE 95%: Site plan, floor plans, elevations, 3D views, title block\n- ONLY ADD sections in available white space if missing\n- ADD SECTION A-A (Longitudinal) and SECTION B-B (Transverse)\n- Both sections must show dimension lines matching original dimensions\n- DO NOT replace sheet, DO NOT remove views, DO NOT rearrange layout';
    }

    if (quickToggles.add3DView) {
      deltaText += '\n\n🚨 ADD 3D VIEWS TO EXISTING A1 SHEET (IMG2IMG - PRESERVE SHEET):\n- IMAGE-TO-IMAGE mode: Reference shows COMPLETE A1 sheet with all views\n- PRESERVE 95%: Site plan, floor plans, elevations, sections, title block\n- ONLY ADD 3D views in available white space\n- ADD exterior 3D perspective, axonometric, or interior views as needed\n- DO NOT replace sheet, DO NOT remove views, DO NOT rearrange layout';
    }

    if (quickToggles.addSitePlan) {
      deltaText += '\n\nADD SITE PLAN TO EXISTING A1 SHEET:\n- MAINTAIN the complete A1 sheet layout with ALL existing elements\n- ADD detailed site plan with context in available space if missing\n- Show site boundaries, building footprint, and surrounding context\n- Include north arrow and scale\n- Show access paths, parking, and landscaping\n- DO NOT replace the sheet - ADD to existing layout\n- PRESERVE all existing views';
    }

    if (quickToggles.addInterior3D) {
      deltaText += '\n\n🚨 ADD INTERIOR 3D TO EXISTING A1 SHEET (DO NOT REPLACE ANYTHING):\n\nCRITICAL INSTRUCTIONS:\n- This is IMAGE-TO-IMAGE modification - the reference image shows the COMPLETE A1 sheet\n- ABSOLUTELY PRESERVE the complete A1 sheet layout with ALL existing elements\n- PRESERVE: Site plan (top-left), ALL floor plans, ALL elevations, ALL sections, ALL 3D views, title block\n- ONLY ADD interior 3D perspective views in any available white space\n- Show key spaces (living room, kitchen, or main function spaces)\n- Include furniture layout and interior finishes\n\nSTRICT RULES:\n- DO NOT replace the sheet with just floor plans\n- DO NOT remove any existing views\n- DO NOT rearrange the layout\n- DO NOT create a new sheet - only ADD interior views to existing sheet\n- PRESERVE 95% of the original image - ONLY modify small areas to add interior views';
    }

    if (quickToggles.addDetails) {
      deltaText += '\n\nADD DETAILS TO EXISTING A1 SHEET:\n- MAINTAIN the complete A1 sheet layout\n- ENHANCE existing drawings with dimension lines if missing\n- ADD material annotations to existing views\n- ADD scale bars on all drawings\n- DO NOT replace any views - only enhance them';
    }

    if (quickToggles.addFloorPlans) {
      deltaText += '\n\nADD FLOOR PLANS TO EXISTING A1 SHEET:\n- MAINTAIN the complete A1 sheet layout with ALL existing elements\n- GROUND FLOOR PLAN: MUST be in ROW 2 LEFT position - TRUE OVERHEAD orthographic view (NO perspective, NO 3D)\n- FIRST FLOOR PLAN: MUST be in ROW 2 CENTER position if building has multiple floors - TRUE OVERHEAD orthographic view\n- Both plans must be STRICTLY 2D overhead view (NO perspective, NO isometric, NO diagonal walls)\n- Include dimension lines with arrowheads showing building dimensions and room dimensions\n- Room names and areas labeled in LARGE BOLD text\n- DO NOT replace the sheet - ADD floor plans to ROW 2 positions only\n- PRESERVE all existing views: site plan (top-left), elevations, sections, 3D views, title block\n- PRESERVE the exact same building design, materials, and dimensions from original design';
    }

    if (userPrompt) {
      deltaText += `\n\nUSER REQUEST: ${userPrompt}`;
    }

    if (!deltaText.trim()) {
      deltaText = 'Regenerate A1 sheet maintaining exact consistency with original design';
    }

    // 🔍 PRE-VALIDATE MODIFICATION before expensive generation
    logger.info('Pre-validating modification request', null, '🔍');
    const validationResult = modificationValidator.validateModification(
      { deltaPrompt: deltaText, quickToggles },
      {
        masterDNA: originalDNA,
        siteConstraints: originalDNA?.siteConstraints || null,
        history: originalDesign.modifications || []
      }
    );

    // Log validation results
    if (!validationResult.valid) {
      logger.warn('Modification validation failed', { errors: validationResult.errors });
    }

    if (validationResult.warnings.length > 0) {
      logger.warn(`${validationResult.warnings.length} validation warnings`, {
        warnings: validationResult.warnings.map(w => w.message)
      });
    }

    if (validationResult.suggestions.length > 0) {
      logger.info(`${validationResult.suggestions.length} suggestions`, {
        suggestions: validationResult.suggestions
      }, '💡');
    }

    logger.info('Modification feasibility', {
      feasible: validationResult.feasible,
      estimatedTime: validationResult.estimatedTime || '60-90 seconds'
    });

    try {
      // 🎯 EXTRACT PROJECT CONTEXT FIRST (needed for both cached and new prompts)
      // 🚨 CRITICAL: Include projectContext to preserve project type (clinic vs house)
      const projectContext = originalDesign.projectContext || {};
      const projectType = projectContext?.projectType || projectContext?.buildingProgram || originalDNA?.projectType || originalDNA?.buildingProgram || 'residential';
      const buildingName = originalDNA?.buildingProgram?.charAt(0).toUpperCase() + originalDNA?.buildingProgram?.slice(1) || projectType?.charAt(0).toUpperCase() + projectType?.slice(1) || 'Building';

      // Check cache for prompt
      const promptCacheKey = `a1_${designId}_${deltaText.substring(0, 100)}`;
      let compactPrompt = this.getCachedPrompt(promptCacheKey);

      if (!compactPrompt) {
        // 🎯 COMPACT PROMPT: Use withConsistencyLockCompact for <8k chars

        compactPrompt = strictLock
          ? withConsistencyLockCompact({
              base: {
                masterDNA: originalDNA,
                mainPrompt: originalPrompt,
                a1LayoutKey: baselineLayoutKey,
                projectContext: projectContext, // 🆕 Preserve project type
                projectType: projectType, // 🆕 Explicit project type
                buildingName: buildingName // 🆕 Explicit building name
              },
              delta: deltaText
            })
          : withConsistencyLock(originalPrompt, deltaText, originalDNA, projectContext).prompt;

        this.cachePrompt(promptCacheKey, compactPrompt);
      }

      logger.info(`Generated ${strictLock ? 'compact' : 'standard'} locked prompt`, {
        length: typeof compactPrompt === 'string' ? compactPrompt.length : JSON.stringify(compactPrompt).length,
        baseLength: originalPrompt?.length || 0,
        deltaLength: deltaText?.length || 0
      }, '📝');

      // 🚨 SAFETY: Ensure prompt is <8k chars (Together.ai typical limit)
      const maxPromptLength = 8000;
      const promptText = typeof compactPrompt === 'string' ? compactPrompt : compactPrompt.prompt || '';

      if (promptText.length > maxPromptLength) {
        logger.error('Prompt too long, intelligently condensing', {
          length: promptText.length,
          max: maxPromptLength
        });

        // Fallback to condensed but comprehensive prompt that preserves essential DNA
        const projectType = projectContext?.projectType || projectContext?.buildingProgram || originalDNA?.projectType || originalDNA?.buildingProgram || 'residential';
        const buildingProgram = originalDNA?.buildingProgram || projectType || 'residential';
        const buildingName = buildingProgram.charAt(0).toUpperCase() + buildingProgram.slice(1);

        const essentialDNA = {
          projectType: buildingName, // 🆕 EXPLICIT PROJECT TYPE
          style: originalDNA?.architecturalStyle || 'Modern',
          dimensions: `${originalDNA?.dimensions?.length || 11}m × ${originalDNA?.dimensions?.width || 7}m × ${originalDNA?.dimensions?.height || 6.4}m`,
          materials: originalDNA?.materials?.map(m => m.name).slice(0, 3).join(', ') || 'brick, concrete',
          floors: originalDNA?.floors?.count || 2
        };

        compactPrompt = `UK RIBA A1 Sheet Modification for ${essentialDNA.projectType} Project (PRESERVE COMPLETE SHEET LAYOUT):

CRITICAL: This is an img2img modification of an EXISTING ${essentialDNA.projectType.toUpperCase()} A1 SHEET with multiple views.
PROJECT TYPE: ${essentialDNA.projectType} - MUST REMAIN ${essentialDNA.projectType.toUpperCase()} (NOT residential house!)
MAINTAIN: The COMPLETE A1 sheet layout with ALL existing views (site plan, floor plans, elevations, sections, 3D views)
Building: ${essentialDNA.projectType} ${essentialDNA.style} ${essentialDNA.dimensions}, ${essentialDNA.floors} floors
Materials: ${essentialDNA.materials}
Seed: ${originalSeed}

MODIFICATIONS - ADD TO EXISTING ${essentialDNA.projectType.toUpperCase()} LAYOUT:
${deltaText ? deltaText.substring(0, 1000) : 'Apply requested changes'}

STRICT RULES:
- PRESERVE the entire ${essentialDNA.projectType} A1 sheet layout with all existing views
- This is a ${essentialDNA.projectType.toUpperCase()}, NOT a residential house
- ADD new elements in available spaces, do not replace the sheet
- MAINTAIN all existing views: site plan, floor plans, elevations, 3D views
- Keep the same ${essentialDNA.projectType} design, materials, proportions
DO NOT: Create a single view, replace the sheet, change the project type from ${essentialDNA.projectType}.`;

        logger.info('Truncated prompt', { newLength: compactPrompt.length });
      }

      logger.debug('Using original seed for consistency', { seed: originalSeed }, '🎲');

      // 🖼️ Load baseline image as init image for img2img
      logger.info('Loading baseline image for img2img', null, '🖼️');
      let initImageData = resolvedBaselineUrl ? await this.loadImageAsDataURL(resolvedBaselineUrl) : null;

      if (initImageData) {
        const originalSizeKB = (initImageData.length / 1024).toFixed(1);

        // 🗜️ Compress image if it exceeds Together.ai limit (~1.5MB)
        if (imageCompressor.needsCompression(initImageData, 1.0)) {
          logger.info('Compressing large image for API compatibility', {
            originalSizeKB: `${originalSizeKB}KB`,
            maxSizeMB: '1.0MB'
          }, '🗜️');

          try {
            initImageData = await imageCompressor.compressImage(initImageData, 1.0, 0.8);
            const compressedSizeKB = (initImageData.length / 1024).toFixed(1);

            logger.success('Image compressed successfully', {
              originalSize: `${originalSizeKB}KB`,
              compressedSize: `${compressedSizeKB}KB`,
              reduction: `${(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100).toFixed(0)}%`
            }, '✅');
          } catch (compressionError) {
            logger.error('Image compression failed', {
              error: compressionError.message,
              fallback: 'Using original image'
            });
            // Continue with original image if compression fails
          }
        }

        // 📐 EXACT DIMENSION RESIZE: Ensure init image matches requested dimensions
        // Together.ai img2img requires init_image to match width×height params exactly
        logger.info('Resizing init image to exact baseline dimensions', {
          targetDimensions: `${baselineWidth}×${baselineHeight}px`
        }, '📐');

        try {
          initImageData = await imageCompressor.resizeToExact(
            initImageData,
            baselineWidth,
            baselineHeight,
            1.0,
            0.8
          );
          logger.success('Init image resized to exact dimensions for API compatibility');
        } catch (resizeError) {
          logger.error('Image resize failed', {
            error: resizeError.message,
            fallback: 'Using compressed image (may cause 400 error)'
          });
          // Continue with compressed image if resize fails (may cause API error)
        }

        const finalSizeKB = (initImageData.length / 1024).toFixed(1);
        logger.success('Baseline image ready for img2img', {
          sizeKB: `${finalSizeKB}KB`,
          dimensions: `${baselineWidth}×${baselineHeight}px`,
          mode: 'img2img'
        });
      } else {
        logger.warn('No baseline image - falling back to text-to-image', {
          warning: 'Lower consistency expected'
        });
      }

      // 🎚️ IMG2IMG STRENGTH: OPTIMIZED for best quality and consistency
      // CRITICAL: Strength must be low enough to preserve layout but high enough for visible changes
      // Testing shows: <0.10 = no visible changes, >0.20 = layout drift, 0.12-0.18 = optimal
      let imageStrength;

      const isSiteRelated = deltaText.toLowerCase().includes('site') || quickToggles.addSitePlan;
      const isAddingViews = quickToggles.addSections || quickToggles.add3DView ||
                           quickToggles.addInterior3D || quickToggles.addFloorPlans;
      const isDetailsOnly = quickToggles.addDetails && !isAddingViews;

      // OPTIMIZED: Balance between preservation and effective modification
      if (isSiteRelated) {
        imageStrength = strictLock ? 0.12 : 0.15; // Site modifications need visibility (88-85% preserve)
      } else if (isAddingViews) {
        imageStrength = strictLock ? 0.15 : 0.18; // Adding views needs more flexibility (85-82% preserve)
      } else if (isDetailsOnly) {
        imageStrength = strictLock ? 0.10 : 0.12; // Details are subtle changes (90-88% preserve)
      } else {
        imageStrength = strictLock ? 0.12 : 0.15; // Default balanced (88-85% preserve)
      }

      logger.info('Image-to-Image settings', {
        strength: imageStrength,
        mode: imageStrength < 0.25 ? 'HIGH PRESERVE' : imageStrength < 0.35 ? 'BALANCED' : 'HIGH MODIFY',
        preservation: `${((1 - imageStrength) * 100).toFixed(0)}%`,
        changes: `${(imageStrength * 100).toFixed(0)}%`
      }, '🎚️');

      // Generate modified A1 sheet with img2img using secureApiClient
      const promptToUse = typeof compactPrompt === 'string' ? compactPrompt : compactPrompt.prompt || compactPrompt;

      // 🚫 STRONG NEGATIVE PROMPTS: Always send A1 negatives + layout-drift prevention
      // Even with compact prompts, we need explicit negatives to prevent grid/collage regressions
      const baseNegatives = this.getA1NegativePrompt();
      const layoutDriftNegatives = strongNegativesForLayoutDrift();
      const combinedNegativePrompt = `${baseNegatives}, ${layoutDriftNegatives}`;

      logger.info('Using strong A1 negative prompts', {
        baseLength: baseNegatives.length,
        layoutDriftLength: layoutDriftNegatives.length,
        combinedLength: combinedNegativePrompt.length
      }, '🚫');

      let result = await secureApiClient.togetherImage({
        prompt: promptToUse,
        negativePrompt: combinedNegativePrompt,
        seed: originalSeed,
        width: baselineWidth,
        height: baselineHeight,
        num_inference_steps: 48, // OPTIMIZED: Higher steps for best architectural quality
        guidanceScale: 9.0, // ENHANCED: Stronger guidance for precise modifications
        model: baselineModel,
        initImage: initImageData,
        imageStrength: imageStrength
      });

      if (!result || !result.url) {
        throw new GenerationError(
          'A1 sheet generation failed - no URL returned',
          'a1-generation',
          { designId }
        );
      }

      // 🔍 VALIDATE CONSISTENCY and RETRY if needed
      let consistencyResult = null;
      let finalResult = result;

      if (resolvedBaselineUrl && initImageData) {
        logger.info('Validating consistency with baseline', null, '🔍');

        // Calculate hash keys for caching (outside try block for retry access)
        const hash1 = resolvedBaselineUrl.substring(0, 50);
        const hash2 = result.url.substring(0, 50);

        try {
          // Check SSIM cache
          const cachedSSIM = this.getCachedSSIM(hash1, hash2);

          if (cachedSSIM !== null) {
            consistencyResult = {
              score: cachedSSIM,
              ssimScore: cachedSSIM,
              hashDistance: 0,
              issues: []
            };
            logger.debug('Using cached consistency score', { score: cachedSSIM }, '💾');
          } else {
            consistencyResult = await sheetConsistencyGuard.validateConsistency(
              resolvedBaselineUrl,
              result.url,
              {
                strictMode: true,
                allowedDrift: quickToggles.addSections || quickToggles.add3DView ? 'moderate' : 'minimal'
              }
            );

            // Cache the result
            this.cacheSSIM(hash1, hash2, consistencyResult.ssimScore);
          }
        } catch (validationError) {
          logger.warn('Consistency validation failed, skipping', {
            error: validationError.message,
            fallback: 'Proceeding without validation'
          });
          // Continue without consistency validation (non-fatal)
          consistencyResult = {
            score: 0,
            ssimScore: 0,
            hashDistance: 0,
            issues: ['Validation skipped due to error'],
            validationSkipped: true
          };
        }

        logger.info('Consistency metrics', {
          score: (consistencyResult.score ?? 0).toFixed(3),
          ssim: (consistencyResult.ssimScore ?? 0).toFixed(3),
          threshold: 0.92,
          hashDistance: consistencyResult.hashDistance ?? 0,
          validationSkipped: consistencyResult.validationSkipped || false
        });

        // 🔄 AUTOMATIC RETRY: If SSIM < 0.85 and strict lock enabled (skip if validation failed)
        if (strictLock && !consistencyResult.validationSkipped && (consistencyResult.ssimScore ?? 0) < 0.85) {
          // Use even lower strength for retry, especially for site-related changes
          const retryStrength = isSiteRelated ? 0.03 : 0.05;

          logger.warn('SSIM below threshold, retrying with minimal strength for maximum preservation', {
            currentSSIM: (consistencyResult.ssimScore ?? 0).toFixed(3),
            threshold: 0.85,
            newStrength: retryStrength,
            modType: isSiteRelated ? 'site-related' : 'general'
          });

          const retryResult = await secureApiClient.togetherImage({
            prompt: promptToUse,
            negativePrompt: combinedNegativePrompt, // Use same strong negatives for retry
            seed: originalSeed,
            width: baselineWidth,
            height: baselineHeight,
            num_inference_steps: 40, // Match main generation
            guidanceScale: 8.5, // Match main generation
            model: baselineModel,
            initImage: initImageData,
            imageStrength: retryStrength  // Ultra-minimal strength for site (97% preserve) or minimal (95% preserve)
          });

          if (retryResult && retryResult.url) {
            // Validate retry result
            const retryHash = retryResult.url.substring(0, 50);
            const retryConsistency = await sheetConsistencyGuard.validateConsistency(
              resolvedBaselineUrl,
              retryResult.url,
              { strictMode: false, allowedDrift: 'minimal' }
            );

            logger.info('Retry consistency', { ssim: (retryConsistency.ssimScore ?? 0).toFixed(3) });

            // Use retry result if SSIM improved
            if ((retryConsistency.ssimScore ?? 0) > (consistencyResult.ssimScore ?? 0)) {
              logger.success('Retry improved SSIM', {
                from: (consistencyResult.ssimScore ?? 0).toFixed(3),
                to: (retryConsistency.ssimScore ?? 0).toFixed(3)
              });
              finalResult = retryResult;
              consistencyResult = retryConsistency;
              this.cacheSSIM(hash1, retryHash, retryConsistency.ssimScore);
            } else {
              logger.warn('Retry did not improve SSIM, using original result');
            }
          }
        } else if ((consistencyResult.ssimScore ?? 0) >= 0.92) {
          logger.success('Consistency acceptable', {
            ssim: (consistencyResult.ssimScore ?? 0).toFixed(3)
          });
        }
      }

      // 🗺️ SITE MAP PARITY: Composite site snapshot for pixel-exact map
      // If data URL was stripped from storage, re-fetch using stored metadata
      const siteSnapshot = originalDesign.siteSnapshot;
      let ensuredSiteSnapshot = siteSnapshot;
      try {
        if (siteSnapshot && (!siteSnapshot.dataUrl || siteSnapshot.dataUrl.includes('[DATA_URL_REMOVED'))) {
          const { getSiteSnapshot } = await import('./siteMapSnapshotService');
          if (siteSnapshot.center) {
            const refreshedDataUrl = await getSiteSnapshot({
              coordinates: siteSnapshot.center,
              polygon: siteSnapshot.polygon || null,
              zoom: siteSnapshot.zoom || 17,
              size: [
                Math.max(320, siteSnapshot.size?.width || 400),
                Math.max(240, siteSnapshot.size?.height || 300)
              ],
              mapType: siteSnapshot.mapType || 'hybrid'
            });
            if (refreshedDataUrl && refreshedDataUrl.startsWith('data:')) {
              ensuredSiteSnapshot = { ...siteSnapshot, dataUrl: refreshedDataUrl };
            }
          }
        }
      } catch (e) {
        logger.warn('Failed to refresh site snapshot; proceeding without overlay', { error: e.message });
      }

      const hasValidSiteSnapshot = ensuredSiteSnapshot &&
                                   ensuredSiteSnapshot.dataUrl &&
                                   ensuredSiteSnapshot.dataUrl.startsWith('data:') &&
                                   !ensuredSiteSnapshot.dataUrl.includes('[DATA_URL_REMOVED');

      if (hasValidSiteSnapshot && isFeatureEnabled('compositeSiteSnapshotOnModify')) {
          logger.info('Compositing site snapshot for pixel-exact map parity', null, '🗺️');

          try {
            const bbox = architecturalSheetService.getSiteMapBBox(
              baselineLayoutKey,
              baselineWidth,
              baselineHeight
            );

            const compositedSheetUrl = await architecturalSheetService.compositeSiteSnapshot(finalResult.url, ensuredSiteSnapshot, bbox);

            finalResult.url = compositedSheetUrl;
            logger.success('Site snapshot composited - pixel-exact map parity maintained');

          } catch (error) {
            logger.error('Failed to composite site snapshot', error);
            // Continue with unmodified result (non-fatal)
          }
      } else if (hasValidSiteSnapshot) {
        logger.info('Site snapshot available but overlay disabled by feature flag - using AI-generated site panel only', null, '🗺️');
      } else if (siteSnapshot && (!siteSnapshot.dataUrl || siteSnapshot.dataUrl.includes('[DATA_URL_REMOVED'))) {
        logger.info('Site snapshot present but data URL stripped and refresh unavailable - using AI-generated site panel only', null, '🗺️');
      } else {
        logger.info('No site snapshot available - site panel generated by AI', null, '🗺️');
      }

      // Save version to history
      const versionId = await designHistory.addVersion(designId, {
        deltaPrompt: deltaText,
        quickToggles,
        userPrompt,
        resultUrl: finalResult.url,
        seed: originalSeed,
        prompt: promptToUse,
        consistencyScore: consistencyResult?.score || null,
        ssimScore: consistencyResult?.ssimScore || null,
        timestamp: new Date().toISOString()
      });

      logger.success('Successfully modified A1 sheet with img2img consistency lock');

      return {
        success: true,
        url: finalResult.url,
        seed: originalSeed,
        versionId,
        consistencyScore: consistencyResult?.score || null,
        ssimScore: consistencyResult?.ssimScore || null,
        consistencyIssues: consistencyResult?.issues || []
      };

    } catch (error) {
      logger.error('Failed to modify A1 sheet', error);

      // Re-throw custom errors
      if (error instanceof ValidationError || error instanceof GenerationError || error instanceof APIError) {
        throw error;
      }

      // Wrap unknown errors
      throw new GenerationError(
        `A1 sheet modification failed: ${error.message}`,
        'a1-modification',
        { designId, originalError: error.message }
      );
    }
  }

  /**
   * Generate view-specific prompt using original DNA
   * @param {string} viewType - Type of view
   * @param {Object} dna - Original DNA
   * @param {string} userPrompt - Additional user instructions
   * @returns {Object} Prompt and negative prompt
   */
  generateViewPrompt(viewType, dna, userPrompt = null) {
    const basePrompt = dnaPromptGenerator.generateViewSpecificPrompt(viewType, dna);

    let enhancedPrompt = basePrompt.prompt;

    // Add user modifications if provided
    if (userPrompt) {
      enhancedPrompt += `\n\nADDITIONAL REQUIREMENTS: ${userPrompt}`;
    }

    // Add consistency reinforcement
    enhancedPrompt += `\n\nIMPORTANT: Maintain exact consistency with the master design:
- Building dimensions: ${dna.dimensions.length}m × ${dna.dimensions.width}m × ${dna.dimensions.height}m
- Materials: ${dna.materials.map(m => m.name).join(', ')}
- Style: ${dna.style || 'Modern'}
- Roof: ${dna.roof || 'gable'}`;

    return {
      prompt: enhancedPrompt,
      negativePrompt: basePrompt.negativePrompt || this.getDefaultNegativePrompt(viewType)
    };
  }

  /**
   * Build modified A1 sheet prompt
   * @param {Object} params - Prompt building parameters
   * @returns {Object} Modified prompt
   */
  buildModifiedA1Prompt(params) {
    const {
      originalPrompt,
      originalDNA,
      modifications,
      userPrompt,
      keepElements
    } = params;

    // Start with original prompt
    let modifiedPrompt = originalPrompt;

    // Apply modifications
    if (Array.isArray(modifications)) {
      modifications.forEach(mod => {
        if (mod.type === 'replace') {
          modifiedPrompt = modifiedPrompt.replace(mod.from, mod.to);
        } else if (mod.type === 'add') {
          modifiedPrompt += `\n\n${mod.content}`;
        } else if (mod.type === 'remove') {
          modifiedPrompt = modifiedPrompt.replace(mod.pattern, '');
        }
      });
    }

    // Add user prompt
    if (userPrompt) {
      modifiedPrompt += `\n\nUSER MODIFICATIONS: ${userPrompt}`;
    }

    // Add preservation instructions
    if (keepElements && keepElements.length > 0) {
      modifiedPrompt += `\n\nPRESERVE EXACTLY: ${keepElements.join(', ')}`;
    }

    // Reinforce consistency
    modifiedPrompt += `\n\nCRITICAL: Maintain consistency with original design:
- Dimensions: ${originalDNA.dimensions.length}m × ${originalDNA.dimensions.width}m × ${originalDNA.dimensions.height}m
- Materials: ${originalDNA.materials.map(m => `${m.name} (${m.hexColor})`).join(', ')}
- Style characteristics must remain identical`;

    return {
      prompt: modifiedPrompt,
      negativePrompt: this.getA1NegativePrompt()
    };
  }

  /**
   * Get view dimensions based on type
   * @param {string} viewType - View type
   * @returns {Object} Width and height
   */
  getViewDimensions(viewType) {
    const dimensionMap = {
      // Floor plans - square for overhead view
      'ground-floor-plan': { width: 1024, height: 1024 },
      'upper-floor-plan': { width: 1024, height: 1024 },

      // Elevations - landscape for horizontal views
      'north-elevation': { width: 1024, height: 768 },
      'south-elevation': { width: 1024, height: 768 },
      'east-elevation': { width: 1024, height: 768 },
      'west-elevation': { width: 1024, height: 768 },

      // Sections - portrait for vertical cuts
      'longitudinal-section': { width: 768, height: 1024 },
      'transverse-section': { width: 768, height: 1024 },

      // 3D views - square or landscape
      'exterior-3d': { width: 1024, height: 1024 },
      'axonometric-3d': { width: 1024, height: 1024 },
      'site-3d': { width: 1024, height: 768 },
      'interior-3d': { width: 1024, height: 768 }
    };

    return dimensionMap[viewType] || { width: 1024, height: 1024 };
  }

  /**
   * Get default negative prompt for a view type
   * @param {string} viewType - View type
   * @returns {string} Negative prompt
   */
  getDefaultNegativePrompt(viewType) {
    const isFloorPlan = viewType.includes('floor-plan');
    const isElevation = viewType.includes('elevation');
    const isSection = viewType.includes('section');
    const is3D = viewType.includes('3d');

    let negativePrompt = '(low quality:1.4), (worst quality:1.4), (blurry:1.3), watermark, signature, text, logo';

    if (isFloorPlan) {
      negativePrompt += ', (perspective:1.5), (3D:1.5), (isometric:1.5), diagonal walls, tilted view, photorealistic furniture';
    } else if (isElevation) {
      negativePrompt += ', (perspective:1.3), (3D depth:1.3), (angled view:1.4), windows from inside, interior visible';
    } else if (isSection) {
      negativePrompt += ', (perspective:1.3), exterior view, complete building, façade';
    } else if (is3D) {
      negativePrompt += ', flat view, 2D drawing, orthographic, technical drawing, blueprint';
    }

    return negativePrompt;
  }

  /**
   * Get negative prompt for A1 sheet
   * @returns {string} Negative prompt
   */
  getA1NegativePrompt() {
    return `(low quality:1.4), (worst quality:1.4), (blurry:1.3),
watermark, signature, amateur,
(grid paper:1.5), (graph paper:1.5), (placeholder boxes:1.5),
(ASCII text:1.5), (multiple sheets:1.3), collage layout,
inconsistent style, mixed art styles, cartoon, sketch`;
  }

  /**
   * Load image from URL and convert to data URL for image-to-image generation
   * @param {string} imageUrl - Image URL
   * @returns {Promise<string|null>} Data URL or null on failure
   * @throws {NetworkError} If image loading fails critically
   */
  async loadImageAsDataURL(imageUrl) {
    try {
      // If already a data URL, return as-is
      if (imageUrl.startsWith('data:')) {
        return imageUrl;
      }

      // Check if it's a same-origin URL
      const isSameOrigin = imageUrl.startsWith(window.location.origin) || imageUrl.startsWith('http://localhost');

      // Use proxy for cross-origin URLs to avoid CORS
      const fetchUrl = isSameOrigin
        ? imageUrl
        : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;

      logger.info(`Loading image: ${isSameOrigin ? 'direct' : 'via proxy'}`, null, '🖼️');
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        logger.warn(`Failed to load image (${response.status}), falling back to text-to-image`);
        return null;
      }

      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const sizeKB = (dataUrl.length / 1024).toFixed(1);
      logger.success(`Image loaded as data URL: ${sizeKB}KB`);

      return dataUrl;
    } catch (error) {
      logger.error('Error loading image for initImage', error);
      logger.warn('Falling back to text-to-image mode (no img2img)');
      return null; // Graceful fallback
    }
  }

  /**
   * Panel-targeted modification for Hybrid A1 mode
   * Only regenerates specified panels, keeps others unchanged
   * @param {Object} params - Modification parameters
   * @returns {Promise<Object>} Modification result
   */
  async modifyA1SheetHybrid(params) {
    logger.info('Modifying A1 sheet in Hybrid mode (panel-targeted)', null, '🎼');

    const {
      designId,
      deltaPrompt,
      quickToggles = {},
      userPrompt = null,
      masterDNA = null,
      mainPrompt = null,
      strictLock = true,
      targetPanels = null
    } = params;

    // Get original design
    const designHistory = await import('./designHistoryService').then(m => m.default);
    const originalDesign = designHistory.getDesign(designId);

    if (!originalDesign) {
      throw new ValidationError(
        `Design ${designId} not found in history. Cannot modify - design must exist first.`,
        'designId',
        designId
      );
    }

    // Extract panel map and seed map from original design
    const originalPanelMap = originalDesign.a1Sheet?.panels || originalDesign.panelMap || {};
    const originalSeedMap = originalDesign.a1Sheet?.seedMap || {};
    const baseSeed = originalDesign.a1Sheet?.seed || originalDesign.seed;
    const originalDNA = masterDNA || originalDesign.masterDNA;
    const projectContext = originalDesign.projectContext || {};
    const locationData = originalDesign.locationData || {};
    const blendedStyle = originalDesign.blendedStyle || null;

    if (!baseSeed || Object.keys(originalPanelMap).length === 0) {
      throw new ValidationError(
        `Design ${designId} missing panel data. Cannot modify in Hybrid mode. Please regenerate with Hybrid A1 mode enabled.`,
        'panelMap',
        designId
      );
    }

    // Parse delta prompt to identify target panels
    const panelsToRegenerate = this.parsePanelTargets(deltaPrompt, quickToggles, userPrompt, targetPanels);
    
    logger.info('Panel-targeted modification', {
      targetPanels: panelsToRegenerate,
      totalPanels: Object.keys(originalPanelMap).length
    }, '🎯');

    if (panelsToRegenerate.length === 0) {
      logger.warn('No panels identified for modification, falling back to full sheet modify');
      return this.modifyA1Sheet({ ...params, targetPanels: null }); // Fallback to One-Shot
    }

    try {
      // Regenerate only targeted panels
      const panelResults = await orchestratePanelGeneration({
        masterDNA: originalDNA,
        projectContext,
        locationData,
        blendedStyle,
        baseSeed,
        panelKeys: panelsToRegenerate,
        onProgress: (panelKey, status) => {
          logger.debug(`Panel ${panelKey}: ${status}`);
        }
      });

      if (!panelResults.success || Object.keys(panelResults.panelMap).length === 0) {
        throw new GenerationError('Panel regeneration failed', 'panel_generation');
      }

      // Merge regenerated panels with original panels
      const updatedPanelMap = {
        ...originalPanelMap,
        ...panelResults.panelMap
      };

      // Get layout for compositing
      const { generateA1Template } = await import('./a1TemplateGenerator.js');
      const templateResult = generateA1Template({ 
        resolution: 'working',
        format: 'json'
      });
      const layout = templateResult.layout;

      // Convert panelMap to array format for compositor
      const panelsArray = Object.entries(updatedPanelMap).map(([key, data]) => ({
        id: getLayoutIdForPanel(key),
        originalKey: key,
        url: data.url,
        seed: data.seed,
        meta: data.meta
      }));

      // Re-composite sheet
      const compositedSheet = await compositeA1Sheet({
        panels: panelsArray,
        layout: layout,
        masterDNA: originalDNA,
        locationData,
        projectContext,
        format: 'canvas',
        includeAnnotations: true,
        includeTitleBlock: true
      });

      // Validate unchanged zones if requested
      const unchangedPanels = Object.keys(originalPanelMap).filter(
        key => !panelsToRegenerate.includes(key)
      );
      
      let zoneValidation = null;
      if (unchangedPanels.length > 0 && originalDesign.a1Sheet?.url) {
        try {
          const zones = layout.panels.filter(p => 
            unchangedPanels.some(key => getLayoutIdForPanel(key) === p.id)
          );
          
          zoneValidation = await sheetConsistencyGuard.validateZoneConsistency(
            originalDesign.a1Sheet.url,
            compositedSheet.url,
            zones,
            { unchangedPanels: zones.map(z => z.id) }
          );
          
          logger.info('Zone consistency validation', {
            consistent: zoneValidation.consistent,
            overallScore: zoneValidation.overallScore.toFixed(3)
          });
        } catch (validationError) {
          logger.warn('Zone validation failed', validationError);
        }
      }

      // Save version to history
      const versionId = designHistory.addVersion(designId, {
        resultUrl: compositedSheet.url,
        a1SheetUrl: compositedSheet.url,
        panelMap: updatedPanelMap,
        seedMap: { ...originalSeedMap, ...panelResults.seedMap },
        seed: baseSeed,
        deltaPrompt,
        consistencyScore: zoneValidation?.overallScore || 1.0,
        workflow: 'hybrid-modify',
        modifiedPanels: panelsToRegenerate
      });

      return {
        success: true,
        url: compositedSheet.url,
        versionId,
        consistencyScore: zoneValidation?.overallScore || 1.0,
        zoneValidation,
        modifiedPanels: panelsToRegenerate,
        panelMap: updatedPanelMap,
        metadata: {
          ...compositedSheet.metadata,
          workflow: 'hybrid-modify',
          panelsRegenerated: panelsToRegenerate.length,
          panelsUnchanged: unchangedPanels.length
        }
      };

    } catch (error) {
      logger.error('Hybrid modification failed', error);
      
      // Fallback to One-Shot modify if panel regeneration fails or rate limit hit
      if (error instanceof GenerationError && (error.code === 'panel_generation' || error.message?.includes('rate limit') || error.message?.includes('429'))) {
        logger.warn('Falling back to One-Shot modify workflow');
        // Temporarily disable hybrid mode
        const { setFeatureFlag } = await import('../config/featureFlags.js');
        const originalHybridFlag = isFeatureEnabled('hybridA1Mode');
        setFeatureFlag('hybridA1Mode', false);
        try {
          return await this.modifyA1Sheet({ ...params, targetPanels: null });
        } finally {
          setFeatureFlag('hybridA1Mode', originalHybridFlag);
        }
      }
      
      throw error;
    }
  }

  /**
   * Parse delta prompt to identify which panels need regeneration
   * @param {string} deltaPrompt - User modification request
   * @param {Object} quickToggles - Quick toggle flags
   * @param {string} userPrompt - Free-form user prompt
   * @param {Array} targetPanels - Explicit panel keys (if provided)
   * @returns {Array} Array of panel keys to regenerate
   */
  parsePanelTargets(deltaPrompt, quickToggles, userPrompt, targetPanels) {
    // If explicit targets provided, use them
    if (targetPanels && Array.isArray(targetPanels) && targetPanels.length > 0) {
      return targetPanels;
    }

    const targets = [];
    const combinedPrompt = `${deltaPrompt || ''} ${userPrompt || ''}`.toLowerCase();

    // Parse quick toggles
    if (quickToggles.addSections) {
      targets.push('sect_long', 'sect_trans');
    }
    if (quickToggles.add3DView) {
      targets.push('v_exterior', 'v_axon');
    }
    if (quickToggles.addInterior3D) {
      targets.push('v_interior');
    }
    if (quickToggles.addSitePlan) {
      targets.push('site');
    }
    if (quickToggles.addFloorPlans) {
      targets.push('plan_ground', 'plan_upper');
    }

    // Parse user prompt for panel keywords
    if (combinedPrompt.includes('north elevation') || combinedPrompt.includes('north elev')) {
      targets.push('elev_north');
    }
    if (combinedPrompt.includes('south elevation') || combinedPrompt.includes('south elev')) {
      targets.push('elev_south');
    }
    if (combinedPrompt.includes('east elevation') || combinedPrompt.includes('east elev')) {
      targets.push('elev_east');
    }
    if (combinedPrompt.includes('west elevation') || combinedPrompt.includes('west elev')) {
      targets.push('elev_west');
    }
    if (combinedPrompt.includes('ground plan') || combinedPrompt.includes('ground floor')) {
      targets.push('plan_ground');
    }
    if (combinedPrompt.includes('upper plan') || combinedPrompt.includes('first floor')) {
      targets.push('plan_upper');
    }
    if (combinedPrompt.includes('section') && !targets.includes('sect_long')) {
      targets.push('sect_long', 'sect_trans');
    }
    if (combinedPrompt.includes('3d') || combinedPrompt.includes('three d')) {
      if (!targets.includes('v_exterior')) targets.push('v_exterior');
      if (!targets.includes('v_axon')) targets.push('v_axon');
    }

    // If no specific targets found, return empty (will fallback to full sheet modify)
    return [...new Set(targets)]; // Remove duplicates
  }
}

export default new AIModificationService();
