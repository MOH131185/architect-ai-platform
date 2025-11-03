/**
 * AI Modification Service
 *
 * Handles modifications to existing AI-generated designs:
 * - Adding missing floor plans, elevations, sections, or 3D views
 * - Modifying existing A1 sheet elements
 * - Regenerating specific elements with user feedback
 * - Maintaining consistency with original DNA
 */

import designGenerationHistory from './designGenerationHistory';
import togetherAIService, { generateA1SheetImage } from './togetherAIService';
import dnaPromptGenerator from './dnaPromptGenerator';
import { withConsistencyLock } from './a1SheetPromptGenerator';
import sheetConsistencyGuard from './sheetConsistencyGuard';

class AIModificationService {
  constructor() {
    console.log('🔧 AI Modification Service initialized');
  }

  /**
   * Add a missing view (floor plan, elevation, section, or 3D)
   * @param {Object} params - Generation parameters
   * @returns {Promise<Object>} Generation result
   */
  async addMissingView(params) {
    console.log(`🎨 Adding missing view: ${params.viewType}`);

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
      throw new Error('Original DNA not found - cannot ensure consistency');
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

      // Generate view-specific prompt using original DNA
      const prompt = this.generateViewPrompt(viewType, originalDNA, userPrompt);

      console.log(`📝 Generated prompt for ${viewType} (${prompt.length} chars)`);
      console.log(`🎲 Using original seed: ${originalSeed} for consistency`);

      // Determine image dimensions based on view type
      const dimensions = this.getViewDimensions(viewType);

      // Generate the view
      const result = await togetherAIService.generateImage({
        prompt: prompt.prompt,
        negative_prompt: prompt.negativePrompt,
        width: dimensions.width,
        height: dimensions.height,
        steps: 48,
        guidance_scale: 7.5,
        seed: originalSeed, // Use original seed for consistency
        model: 'black-forest-labs/FLUX.1-dev'
      });

      if (!result.success) {
        throw new Error(result.error || 'Image generation failed');
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

      console.log(`✅ Successfully added ${viewType}`);

      return {
        success: true,
        viewType: viewType,
        url: result.url,
        seed: originalSeed,
        modificationId: modification.id
      };

    } catch (error) {
      console.error(`❌ Failed to add ${viewType}:`, error);

      designGenerationHistory.recordModificationResult(sessionId, modification.id, {
        success: false,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Modify the A1 sheet based on user request with consistency lock
   * @param {Object} params - Modification parameters
   * @returns {Promise<Object>} Generation result
   */
  async modifyA1Sheet(params) {
    console.log('🎨 Modifying A1 sheet with consistency lock...');

    const {
      designId, // NEW: Use designId instead of sessionId
      deltaPrompt, // User-requested changes as text
      quickToggles = {}, // Quick actions like { addSections: true, add3DView: true }
      userPrompt = null, // Free-form prompt
      baselineUrl = null, // Optional baseline URL if history doesn't exist
      masterDNA = null, // Optional DNA if history doesn't exist
      mainPrompt = null // Optional prompt if history doesn't exist
    } = params;

    // Get original design from history
    const designHistory = await import('./designHistoryService').then(m => m.default);
    let originalDesign = designHistory.getDesign(designId);

    // Fallback: Create minimal history entry if missing (for older A1 sheets)
    if (!originalDesign && baselineUrl) {
      console.log('⚠️ Design not found in history, creating minimal entry as fallback...');
      try {
        await designHistory.createDesign({
          designId,
          masterDNA: masterDNA || {},
          mainPrompt: mainPrompt || deltaPrompt || 'A1 Sheet Modification',
          basePrompt: mainPrompt || deltaPrompt,
          seed: Date.now(),
          resultUrl: baselineUrl,
          a1SheetUrl: baselineUrl,
          projectContext: {},
          workflow: 'a1-sheet-one-shot',
          createdAt: new Date().toISOString()
        });
        originalDesign = designHistory.getDesign(designId);
        console.log('✅ Minimal history entry created for modification');
      } catch (error) {
        console.error('❌ Failed to create fallback history entry:', error);
      }
    }

    if (!originalDesign) {
      throw new Error(`Design ${designId} not found in history and could not create fallback entry`);
    }

    const originalDNA = originalDesign.masterDNA;
    const originalSeed = originalDesign.seedsByView?.a1Sheet || originalDesign.seed || Date.now();
    const originalPrompt = originalDesign.basePrompt || originalDesign.mainPrompt;
    const resolvedBaselineUrl = baselineUrl || originalDesign.resultUrl || originalDesign.a1SheetUrl;

    if (!originalDNA || !originalSeed || !originalPrompt) {
      throw new Error('Missing original design data for consistency lock');
    }

    // Build delta prompt from quick toggles and user prompt
    let deltaText = deltaPrompt || '';

    if (quickToggles.addSections) {
      deltaText += '\n\nADD MISSING SECTIONS:\n- Add SECTION A-A (Longitudinal) if missing\n- Add SECTION B-B (Transverse) if missing\n- Both sections must show dimension lines and match original design dimensions';
    }

    if (quickToggles.add3DView) {
      deltaText += '\n\nADD MISSING 3D VIEWS:\n- Add exterior 3D perspective view if missing\n- Add axonometric view if missing\n- Add interior perspective view if missing';
    }

    if (quickToggles.addSitePlan) {
      deltaText += '\n\nADD SITE PLAN:\n- Add detailed site plan with context if missing\n- Show site boundaries, building footprint, and surrounding context\n- Include north arrow and scale\n- Show access paths, parking, and landscaping\n- Include Google Maps or aerial view context if applicable';
    }

    if (quickToggles.addInterior3D) {
      deltaText += '\n\nADD INTERIOR 3D VIEWS:\n- Add interior 3D perspective views if missing\n- Show key spaces (living room, kitchen, or main function spaces)\n- Include furniture layout and interior finishes\n- Ensure lighting and materials are visible\n- Multiple interior views for different key spaces preferred';
    }

    if (quickToggles.addDetails) {
      deltaText += '\n\nADD TECHNICAL DETAILS:\n- Ensure all dimension lines are visible\n- Add material annotations\n- Include scale bars on all drawings';
    }

    if (quickToggles.addFloorPlans) {
      deltaText += '\n\nADD FLOOR PLANS (OVERHEAD ORTHOGRAPHIC):\n- Add TRUE OVERHEAD orthographic ground floor plan if missing\n- Add TRUE OVERHEAD orthographic upper floor plan if missing\n- Both plans must be STRICTLY 2D overhead view (NO perspective, NO isometric, NO 3D)\n- Include dimension lines and room labels on all floor plans\n- Show wall thicknesses, door swings, window locations\n- NEGATIVE PROMPTS CRITICAL: (perspective:1.5), (3D:1.5), (isometric:1.5), (angled view:1.5)';
    }

    if (userPrompt) {
      deltaText += `\n\nUSER REQUEST: ${userPrompt}`;
    }

    if (!deltaText.trim()) {
      deltaText = 'Regenerate A1 sheet maintaining exact consistency with original design';
    }

    try {
      // Apply consistency lock to prompt
      const { prompt: lockedPrompt, negativePrompt } = withConsistencyLock(
        originalPrompt,
        deltaText,
        originalDNA
      );

      console.log(`📝 Generated consistency-locked prompt (${lockedPrompt.length} chars)`);
      console.log(`🎲 Using original seed: ${originalSeed} for consistency`);

      // Generate modified A1 sheet using togetherAIService.generateA1SheetImage
      // (imported at top of file as static import for reliability)

      // Pass negativePrompt as separate parameter (not combined into prompt)
      const result = await generateA1SheetImage({
        prompt: lockedPrompt,
        negativePrompt: negativePrompt, // CRITICAL: Pass as separate parameter
        seed: originalSeed, // CRITICAL: Same seed for consistency
        width: 1792, // Together API compliant dimensions
        height: 1280, // Fixed to multiple of 16 (80×16=1280)
        initImage: resolvedBaselineUrl ? await this.loadImageAsDataURL(resolvedBaselineUrl) : null, // Use original A1 as init image for better consistency
        guidanceScale: 7.8
      });

      if (!result || !result.url) {
        throw new Error('A1 sheet generation failed - no URL returned');
      }

      // Validate consistency with baseline
      let consistencyResult = null;
      if (resolvedBaselineUrl) {
        console.log('🔍 Validating consistency with baseline...');
        consistencyResult = await sheetConsistencyGuard.validateConsistency(
          resolvedBaselineUrl,
          result.url,
          {
            strictMode: true,
            allowedDrift: quickToggles.addSections || quickToggles.add3DView ? 'moderate' : 'minimal'
          }
        );

        console.log(`   Consistency score: ${consistencyResult.score.toFixed(3)}`);
        console.log(`   SSIM: ${consistencyResult.ssimScore.toFixed(3)}`);
        console.log(`   pHash distance: ${consistencyResult.hashDistance}`);

        // Retry with stronger lock if consistency is too low
        if (consistencyResult.retryNeeded && !deltaText.includes('completely regenerate')) {
          console.log('⚠️ Consistency below threshold, retrying with stronger lock...');
          
          const retryConfig = sheetConsistencyGuard.generateRetryConfig(1, {
            guidanceScale: 7.8,
            steps: 48,
            negativePrompt
          });

          const enhancedPrompt = lockedPrompt + '\n\nSTRICT CONSISTENCY ENFORCEMENT: Maintain EXACT visual appearance of original design.';

          const retryResult = await generateA1SheetImage({
            prompt: enhancedPrompt,
            negativePrompt: retryConfig.enhancedNegativePrompt || negativePrompt, // Pass as separate parameter
            seed: originalSeed,
            width: 1792,
            height: 1269,
            initImage: resolvedBaselineUrl ? await this.loadImageAsDataURL(resolvedBaselineUrl) : null,
            guidanceScale: 7.8
          });

          if (retryResult && retryResult.url) {
            // Validate retry result
            const retryConsistency = await sheetConsistencyGuard.validateConsistency(
              resolvedBaselineUrl,
              retryResult.url,
              { strictMode: false, allowedDrift: 'moderate' }
            );

            if (retryConsistency.score > consistencyResult.score) {
              console.log('✅ Retry improved consistency, using retry result');
              result.url = retryResult.url;
              consistencyResult = retryConsistency;
            }
          }
        }
      }

      // Save version to history
      const versionId = await designHistory.addVersion(designId, {
        deltaPrompt: deltaText,
        quickToggles,
        userPrompt,
        resultUrl: result.url,
        seed: originalSeed,
        prompt: lockedPrompt,
        consistencyScore: consistencyResult?.score || null,
        timestamp: new Date().toISOString()
      });

      console.log('✅ Successfully modified A1 sheet with consistency lock');

      return {
        success: true,
        url: result.url,
        seed: originalSeed,
        versionId,
        consistencyScore: consistencyResult?.score || null,
        consistencyIssues: consistencyResult?.issues || []
      };

    } catch (error) {
      console.error('❌ Failed to modify A1 sheet:', error);

      return {
        success: false,
        error: error.message
      };
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
   * @returns {Promise<string>} Data URL
   */
  async loadImageAsDataURL(imageUrl) {
    try {
      // If already a data URL, return as-is
      if (imageUrl.startsWith('data:')) {
        return imageUrl;
      }

      // Fetch image via proxy if needed (to avoid CORS)
      const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(imageUrl)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        console.warn('Failed to load image for initImage, will use text-to-image only');
        return null;
      }

      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error loading image for initImage:', error);
      return null; // Fallback to text-to-image if image loading fails
    }
  }
}

export default new AIModificationService();
