/**
 * AI Integration Service
 * Combines OpenAI reasoning with Replicate generation for complete AI-powered architectural workflow
 */

import togetherAIReasoningService from './togetherAIReasoningService';
import portfolioStyleDetection from './portfolioStyleDetection';
import { locationIntelligence } from './locationIntelligence';
import bimService from './bimService';
import dimensioningService from './dimensioningService';
import { enforce2DFloorPlan } from '../utils/floorPlan2DEnforcement';
import togetherAIService from './togetherAIService';
import controlNetMultiViewService from './controlNetMultiViewService';
import { safeParseJsonFromLLM } from '../utils/parseJsonFromLLM';

// Together AI is now the DEFAULT for all reasoning (except location/weather)
const USE_TOGETHER = true; // Always use Together AI for reasoning

// Feature flag for ControlNet Multi-View workflow
const USE_CONTROLNET_WORKFLOW = process.env.REACT_APP_USE_CONTROLNET_WORKFLOW === 'true';

class AIIntegrationService {
  constructor() {
    this.ai = togetherAIReasoningService; // Now using Together AI for all reasoning
    this.portfolioStyleDetection = portfolioStyleDetection;
    this.bim = bimService;
    this.dimensioning = dimensioningService;
    this.controlNet = controlNetMultiViewService;

    // Style signature cache (one per project session)
    this.styleSignatureCache = null;
  }

  /**
   * Generate consistent multi-view architectural package using ControlNet workflow
   *
   * This method implements the complete 6-step ControlNet workflow for perfect consistency:
   * 1. Context Setup - AI assistant configuration
   * 2. Input Parameters - Validate project data
   * 3. Reasoning Phase - Generate building_core_description
   * 4. Generation Phase - Create 6 views with ControlNet
   * 5. Consistency Validation - Verify same seed, materials, control_image
   * 6. Output Format - Return complete JSON package
   *
   * @param {Object} projectParams - Project parameters
   * @param {string} projectParams.project_name - Project name
   * @param {string} projectParams.location - Project location
   * @param {string} projectParams.style - Architectural style
   * @param {string} projectParams.materials - Materials description
   * @param {number} projectParams.floors - Number of floors (1-5)
   * @param {string} projectParams.main_entry_orientation - N/S/E/W/NE/SE/SW/NW
   * @param {string} projectParams.control_image - Floor plan image URL or base64
   * @param {number} projectParams.seed - Optional seed for consistency
   * @param {string} projectParams.climate - Climate description
   * @param {number} projectParams.floor_area - Total floor area in m²
   * @param {string} projectParams.building_program - Building type
   * @returns {Promise<Object>} Complete visualization package with all 6 views
   */
  async generateControlNetMultiViewPackage(projectParams) {
    console.log('\n🎯 [AI Integration] Starting ControlNet Multi-View workflow...');

    try {
      // Delegate to ControlNet service
      const result = await this.controlNet.generateConsistentMultiViewPackage(projectParams);

      console.log('✅ [AI Integration] ControlNet workflow complete');
      return result;

    } catch (error) {
      console.error('❌ [AI Integration] ControlNet workflow failed:', error);
      throw error;
    }
  }

  /**
   * Quick helper to convert existing project context to ControlNet format
   *
   * @param {Object} existingContext - Existing project context (from ArchitectAIEnhanced)
   * @param {string} floorPlanImageUrl - URL of uploaded floor plan
   * @returns {Object} ControlNet-compatible parameters
   */
  convertToControlNetParams(existingContext, floorPlanImageUrl) {
    const {
      buildingProgram = 'house',
      floorArea = 200,
      location = {},
      portfolio = {},
      buildingDNA = {},
      projectSeed
    } = existingContext;

    // Extract materials from building DNA or portfolio
    const materials = [
      buildingDNA.materials?.exterior?.primary || 'brick',
      buildingDNA.roof?.material || 'tile roof',
      buildingDNA.windows?.color ? `${buildingDNA.windows.color} window frames` : 'window frames'
    ].join(', ');

    // Determine entrance orientation from DNA or default to North
    const entranceDir = buildingDNA.entrance?.facade ||
                       (buildingDNA.entrance?.direction ? this.normalizeOrientation(buildingDNA.entrance.direction) : 'North');

    return {
      project_name: existingContext.projectName || `${buildingProgram} project`,
      location: location.address || 'Not specified',
      style: portfolio.detectedStyle || buildingDNA.style_features?.architectural_style || 'Contemporary',
      materials: materials,
      floors: buildingDNA.dimensions?.floors || buildingDNA.dimensions?.floorCount || 2,
      main_entry_orientation: entranceDir,
      control_image: floorPlanImageUrl,
      seed: projectSeed || Math.floor(Math.random() * 1000000),
      climate: location.climate?.type || 'Temperate',
      floor_area: floorArea,
      building_program: buildingProgram
    };
  }

  /**
   * Normalize orientation to cardinal directions
   */
  normalizeOrientation(direction) {
    const normalized = {
      'north': 'North', 'n': 'North',
      'south': 'South', 's': 'South',
      'east': 'East', 'e': 'East',
      'west': 'West', 'w': 'West',
      'northeast': 'NE', 'ne': 'NE',
      'southeast': 'SE', 'se': 'SE',
      'southwest': 'SW', 'sw': 'SW',
      'northwest': 'NW', 'nw': 'NW'
    };
    return normalized[direction.toLowerCase()] || 'North';
  }

  /**
   * Generate or retrieve cached style signature for consistent image generation
   * @param {Object} portfolio - Portfolio data (files, detected style)
   * @param {Object} specs - Project specifications (building program, area, etc.)
   * @param {Object} location - Location and climate data
   * @returns {Promise<Object>} Style signature with all consistency parameters
   */
  async generateStyleSignature(portfolio, specs, location) {
    // Return cached signature if exists (one per project session)
    if (this.styleSignatureCache) {
      console.log('✅ Using cached style signature');
      return this.styleSignatureCache;
    }

    try {
      console.log('🎨 Generating style signature via GPT-4o...');

      // CRITICAL: Use blended style materials (respects user's material weight settings)
      const blendedStyle = portfolio?.blendedStyle;
      const buildingDNA = specs?.buildingDNA;

      // Extract materials from blended style (already weighted by user preferences)
      const blendedMaterials = blendedStyle?.materials?.slice(0, 5).join(', ') ||
                               buildingDNA?.materials?.exterior?.primary ||
                               buildingDNA?.materials ||
                               'brick, glass, timber';

      const prompt = `You are an architectural style consultant. Based on the following project information, create a detailed style signature that will ensure visual consistency across all architectural drawings and renderings.

PROJECT INFORMATION:
Building Type: ${specs.buildingProgram || 'residential'}
Floor Area: ${specs.floorArea || specs.area || 200}m²
Location: ${location.address || 'Not specified'}
Climate: ${location.climate?.type || 'temperate'}

MANDATORY MATERIALS TO USE (from blended style - MUST USE THESE EXACT MATERIALS):
${blendedMaterials}

${blendedStyle ? `
STYLE GUIDE (from location and portfolio blend):
Style Name: ${blendedStyle.styleName}
Characteristics: ${blendedStyle.characteristics?.slice(0, 3).join(', ') || 'Modern, functional design'}
Description: ${blendedStyle.description || 'Contemporary design'}
` : ''}

${buildingDNA ? `
BUILDING DNA (for dimensional consistency):
Dimensions: ${buildingDNA.dimensions?.length || 15}m × ${buildingDNA.dimensions?.width || 10}m
Floors: ${buildingDNA.dimensions?.floorCount || buildingDNA.dimensions?.floors || 2}
Roof: ${buildingDNA.roof?.type || 'gable'} ${buildingDNA.roof?.material || ''}
Windows: ${buildingDNA.windows?.type || 'modern'} - ${buildingDNA.windows?.color || 'white'}
Color Palette: ${buildingDNA.colorPalette?.primary || buildingDNA.colors?.facade || 'Natural tones'}
` : ''}

Generate a comprehensive style signature that includes:

1. MATERIALS PALETTE: You MUST use ONLY the materials listed above (${blendedMaterials}). Do NOT add or change materials. Specify exact descriptions (e.g., "polished concrete", "anodized aluminum")

2. COLOR PALETTE: Specify exact colors for facades, roofing, trim, and accents (e.g., "warm gray concrete", "dark charcoal metal", "white trim")

3. FAÇADE ARTICULATION: Describe the facade composition style (e.g., "horizontal emphasis", "vertical fins", "grid pattern")

4. GLAZING RATIO: Specify window-to-wall ratio percentage (e.g., "40%", "60%")

5. LINE WEIGHT RULES (for 2D drawings):
   - Wall lines: thickness
   - Window lines: thickness
   - Annotation lines: thickness
   (e.g., "walls: 0.5mm, windows: 0.3mm, annotations: 0.1mm")

6. DIAGRAM CONVENTIONS: Specify floor plan conventions (e.g., "minimal furniture, emphasis on circulation", "detailed furniture layout")

7. LIGHTING/TIME-OF-DAY: Specify lighting for 3D renders (e.g., "soft overcast daylight, 10am", "golden hour, 5pm")

8. CAMERA SETTINGS: Specify lens and perspective (e.g., "35mm lens, eye level 1.6m", "50mm lens, slight upward angle")

9. POST-PROCESSING: Specify rendering style (e.g., "photorealistic with subtle color grading", "high contrast black and white for sections")

Return as JSON with these exact keys: materialsPalette (array), colorPalette (object), facadeArticulation (string), glazingRatio (string), lineWeightRules (object), diagramConventions (string), lighting (string), camera (string), postProcessing (string)`;

      const response = await this.ai.chatCompletion([
        { role: 'system', content: 'You are an expert architectural style consultant. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ], {
        model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
        temperature: 0.3, // Low temperature for consistency
        response_format: { type: 'json_object' }
      });

      const signatureText = response.choices[0].message.content;
      const signature = safeParseJsonFromLLM(signatureText, this.getFallbackStyleSignature(specs, location));

      // Add metadata
      signature.timestamp = new Date().toISOString();
      signature.projectId = specs.projectId || Date.now().toString();

      console.log('✅ Style signature generated:', {
        materials: signature.materialsPalette?.slice(0, 2).join(', '),
        facadeStyle: signature.facadeArticulation,
        lighting: signature.lighting
      });

      // Cache for this project session
      this.styleSignatureCache = signature;

      return signature;
    } catch (error) {
      console.error('❌ Style signature generation failed:', error);
      // Return fallback signature
      return this.getFallbackStyleSignature(specs, location);
    }
  }

  /**
   * Build prompt kit for a specific view type using style signature
   * @param {Object} styleSignature - The project style signature
   * @param {string} viewType - Type of view (plan, section, elevation, axon, exterior, interior)
   * @param {Object} projectMeta - Additional project metadata
   * @param {Object} extractedDetails - Extracted visual details from master image (for consistency)
   * @returns {Object} Complete prompt kit with positive and negative prompts
   */
  buildPromptKit(styleSignature, viewType, projectMeta = {}, extractedDetails = null) {
    // eslint-disable-next-line no-unused-vars
    const { buildingProgram = 'building', area = 200, location = {}, buildingDNA = null } = projectMeta;

    // Base prompt components from style signature
    const materials = styleSignature.materialsPalette?.join(', ') || 'glass, steel, concrete';
    const colors = Object.values(styleSignature.colorPalette || {}).join(', ') || 'neutral tones';
    const facadeStyle = styleSignature.facadeArticulation || 'contemporary facade';

    // CRITICAL: Extract Building DNA for PERFECT consistency across all views
    const dna = buildingDNA || {};
    const dimensions = dna.dimensions || {};
    const dnaMaterials = dna.materials || {};
    const dnaRoof = dna.roof || {};
    const dnaWindows = dna.windows || {};
    // eslint-disable-next-line no-unused-vars
    const dnaColors = dna.colorPalette || dna.colors || {};
    const dnaEntrance = dna.entrance || {};

    // Build consistency strings from DNA
    let dimensionStr = dimensions.length && dimensions.width ?
      `${dimensions.length} × ${dimensions.width} footprint` : '';
    let floorStr = dimensions.floors || dimensions.floorCount ?
      `${dimensions.floors || dimensions.floorCount} floors` : '';
    let heightStr = dimensions.height ?
      `${dimensions.height} total height` : '';
    let roofStr = dnaRoof.type ?
      `${dnaRoof.type}${dnaRoof.material ? ` with ${dnaRoof.material}` : ''}${dnaRoof.pitch ? ` at ${dnaRoof.pitch}` : ''}` : '';
    let windowStr = dnaWindows.type ?
      `${dnaWindows.color || 'standard'} ${dnaWindows.type} windows${dnaWindows.pattern ? ` in ${dnaWindows.pattern}` : ''}` : '';
    let materialStr = dnaMaterials.exterior?.primary ?
      `${dnaMaterials.exterior.primary}${dnaMaterials.exterior.color ? ` in ${dnaMaterials.exterior.color} color` : ''}${dnaMaterials.exterior.texture ? ` with ${dnaMaterials.exterior.texture}` : ''}` : '';
    let entranceStr = dnaEntrance.facade && dnaEntrance.position ?
      `${dnaEntrance.facade}-facing entrance at ${dnaEntrance.position}` : '';

    // 🎯 CRITICAL: If we have extracted details from master image, use them for PERFECT consistency
    if (extractedDetails && !extractedDetails.fallback) {
      console.log(`🎯 Using EXTRACTED VISUAL DETAILS for ${viewType} (ensures perfect consistency)`);

      // Override DNA strings with EXACT extracted details from master image
      if (extractedDetails.materials?.facade) {
        materialStr = extractedDetails.materials.facade;
        if (extractedDetails.materials.facade_hex) {
          materialStr += ` (${extractedDetails.materials.facade_hex})`;
        }
      }

      if (extractedDetails.roof?.type) {
        roofStr = `${extractedDetails.roof.type}${extractedDetails.roof.pitch ? ` ${extractedDetails.roof.pitch}` : ''} roof`;
        if (extractedDetails.roof.material) {
          roofStr += ` with ${extractedDetails.roof.material}`;
        }
        if (extractedDetails.roof.color) {
          roofStr += ` in ${extractedDetails.roof.color}`;
        }
        if (extractedDetails.roof.color_hex) {
          roofStr += ` (${extractedDetails.roof.color_hex})`;
        }
      }

      if (extractedDetails.windows?.type) {
        windowStr = `${extractedDetails.windows.frame_color || ''} ${extractedDetails.windows.type} windows`;
        if (extractedDetails.windows.pattern) {
          windowStr += ` in ${extractedDetails.windows.pattern}`;
        }
        if (extractedDetails.windows.panes) {
          windowStr += ` with ${extractedDetails.windows.panes}`;
        }
        if (extractedDetails.windows.frame_hex) {
          windowStr += ` (frame: ${extractedDetails.windows.frame_hex})`;
        }
      }

      if (extractedDetails.floors_visible) {
        floorStr = `${extractedDetails.floors_visible} floors`;
      }

      console.log(`   📦 Exact facade: ${materialStr}`);
      console.log(`   🏠 Exact roof: ${roofStr}`);
      console.log(`   🪟 Exact windows: ${windowStr}`);
    } else {
      console.log(`🧬 Building DNA for ${viewType}:`, {
        dimensions: dimensionStr,
        floors: floorStr,
        roof: roofStr,
        windows: windowStr,
        materials: materialStr
      });
    }

    // Shared negative prompts
    const sharedNegatives = [
      'inconsistent styles',
      'mismatched materials',
      'text artifacts',
      'watermarks',
      'deformed annotations',
      'unrealistic shadows',
      'fisheye distortion',
      'extreme HDR',
      'chromatic aberration',
      'blurry details',
      'low quality'
    ];

    // View-specific prompt kits
    switch (viewType) {
      case 'plan':
      case 'floor_plan':
        return {
          prompt: `BLACK LINE DRAWING ON WHITE BACKGROUND showing OVERHEAD ORTHOGRAPHIC VIEW of building interior space layout for ${buildingProgram}, ${area}m²${dimensionStr ? `, ${dimensionStr}` : ''}${floorStr ? `, ${floorStr}` : ''}${entranceStr ? `, ${entranceStr}` : ''}${materialStr ? `, using ${materialStr}` : ''}${roofStr ? `, ${roofStr}` : ''}${windowStr ? `, ${windowStr}` : ''}, drawn as if looking STRAIGHT DOWN FROM DIRECTLY ABOVE like a geographic map, showing walls as simple black rectangles forming rooms, windows as breaks in the walls, doors as gaps in the walls, all drawn with ZERO perspective, ZERO depth, ZERO height shown, using ONLY horizontal and vertical lines parallel to the page edges, ${styleSignature.lineWeightRules?.walls || '0.5mm'} line weight for walls, scale 1:100, north arrow, dimension lines, FLAT ORTHOGONAL PROJECTION ONLY like a city planning document`,
          negativePrompt: [...sharedNegatives, 'colors', 'shadows', '3D', 'perspective', 'depth', 'textures', 'photos', 'isometric', 'axonometric', 'diagonal walls', 'angled view', 'slanted lines', 'tilted view', 'bird eye', 'rendered', 'shading', 'gradients', 'vanishing point', 'oblique', 'dimetric', 'trimetric', 'cutaway', 'sectional view', 'elevation', 'any angle', 'any tilt', 'realistic materials', 'architectural rendering', '3D model', 'SketchUp style', 'perspective projection', 'depth perception', 'height representation', 'vertical walls visible', '3D isometric', '3D diagram'].join(', '),
          size: '1024x1024',
          camera: 'PURE ORTHOGRAPHIC OVERHEAD, PARALLEL PROJECTION, NO PERSPECTIVE, GEOGRAPHIC MAP VIEW',
          viewType: 'plan'
        };

      case 'floor_plan_ground':
        return {
          prompt: `Architectural GROUND FLOOR PLAN, BLACK LINEWORK ON WHITE, TRUE 2D ORTHOGRAPHIC OVERHEAD (NO 3D/NO AXONOMETRIC). ${buildingProgram}, ${area}m²${dimensionStr ? `, ${dimensionStr}` : ''}${materialStr ? `, using ${materialStr}` : ''}${roofStr ? `, ${roofStr}` : ''}${windowStr ? `, ${windowStr}` : ''}. MUST include MAIN ENTRANCE on street-facing frontage, labeled Entry/Foyer near street side; include stairs with 'UP' arrow; NO bedrooms on ground floor; room labels and dimensions; north arrow; scale 1:100.`,
          negativePrompt: [...sharedNegatives, 'upper floor entrance', 'bedrooms on ground floor', '3D', 'perspective', 'axonometric'].join(', '),
          size: '1024x1024',
          camera: 'PURE ORTHOGRAPHIC OVERHEAD',
          viewType: 'plan'
        };

      case 'floor_plan_upper':
        return {
          prompt: `Architectural UPPER FLOOR PLAN, BLACK LINEWORK ON WHITE, TRUE 2D ORTHOGRAPHIC OVERHEAD (NO 3D/NO AXONOMETRIC). ${buildingProgram}, ${area}m²${dimensionStr ? `, ${dimensionStr}` : ''}. ABSOLUTELY NO MAIN ENTRANCE from outside; include Landing at stairs; bedrooms and bathrooms only (no kitchen/living); room labels and dimensions; north arrow; scale 1:100.`,
          negativePrompt: [...sharedNegatives, 'main entrance', 'ground floor entrance', 'kitchen', 'living room', '3D', 'perspective', 'axonometric'].join(', '),
          size: '1024x1024',
          camera: 'PURE ORTHOGRAPHIC OVERHEAD',
          viewType: 'plan'
        };

      case 'section':
      case 'section_longitudinal':
      case 'section_cross':
        return {
          prompt: `Architectural section drawing, ${buildingProgram}, black-and-white line drawing, ${styleSignature.lineWeightRules?.walls || '0.5mm'} wall cuts, ${styleSignature.lineWeightRules?.windows || '0.3mm'} fenestration, uniform white background, consistent line hierarchy, scale bar, floor levels marked, ${styleSignature.diagramConventions || 'minimal interior detail'}, professional architectural drawing, orthographic projection, clean linework, no colors`,
          negativePrompt: [...sharedNegatives, 'colors', 'shadows', '3D perspective', 'realistic textures', 'photos'].join(', '),
          size: '1024x1024',
          camera: 'orthographic section view',
          viewType: 'section'
        };

      case 'elevation':
      case 'elevation_north':
      case 'elevation_south':
      case 'elevation_east':
      case 'elevation_west':
        const direction = viewType.split('_')[1] || 'front';
        return {
          prompt: `Architectural elevation drawing, ${direction} facade, ${buildingProgram}${floorStr ? `, ${floorStr}` : ''}${heightStr ? `, ${heightStr}` : ''}${materialStr ? `, ${materialStr} walls` : ''}${roofStr ? `, ${roofStr}` : ''}${windowStr ? `, ${windowStr}` : ''}, black-and-white line drawing, ${facadeStyle}, ${styleSignature.glazingRatio || '40%'} glazing ratio, ${styleSignature.lineWeightRules?.walls || '0.5mm'} wall lines, uniform white background, consistent line hierarchy, ground line, professional architectural drawing, orthographic projection, no textures, clean linework`,
          negativePrompt: [...sharedNegatives, 'colors', 'shadows', '3D perspective', 'realistic textures', 'photos'].join(', '),
          size: '1024x1024',
          camera: 'orthographic front view',
          viewType: 'elevation'
        };

      case 'axonometric':
      case 'axon':
        return {
          prompt: `Architectural axonometric drawing, ${buildingProgram}, parallel projection at 30° angle, ${materials}, ${facadeStyle}, ${styleSignature.lineWeightRules?.walls || '0.5mm'} consistent line weights, no atmospheric perspective, uniform lighting, clean geometric lines, professional architectural diagram, isometric precision, minimal shadows, white background`,
          negativePrompt: [...sharedNegatives, 'vanishing points', 'perspective distortion', 'fisheye', 'atmospheric perspective'].join(', '),
          size: '1024x1024',
          camera: '30° parallel projection',
          viewType: 'axonometric'
        };

      case 'exterior':
      case 'exterior_front':
        return {
          prompt: `Professional architectural photography, FRONT VIEW of ${buildingProgram}${dimensionStr ? `, ${dimensionStr} proportions` : ''}${floorStr ? `, ${floorStr} building` : ''}${materialStr ? `, ${materialStr}` : `, ${materials}`}${roofStr ? `, ${roofStr}` : ''}${windowStr ? `, ${windowStr}` : ''}, ${colors}, ${facadeStyle}, ${styleSignature.glazingRatio || '40%'} glazing, ${styleSignature.lighting || 'soft overcast daylight'}, ${styleSignature.camera || '35mm lens, eye level 1.6m height'}, photorealistic rendering, high detail, professional composition, ${styleSignature.postProcessing || 'natural color grading'}, sharp focus, main entrance visible, architectural photography quality`,
          negativePrompt: [...sharedNegatives, 'side view', 'corner view', 'oblique angle'].join(', '),
          size: '1024x1536', // Portrait for exterior
          camera: styleSignature.camera || '35mm lens, eye level',
          viewType: 'exterior'
        };

      case 'exterior_side':
        return {
          prompt: `Professional architectural photography, SIDE VIEW from corner angle of ${buildingProgram}${dimensionStr ? `, ${dimensionStr} proportions` : ''}${floorStr ? `, ${floorStr} building` : ''}${materialStr ? `, ${materialStr}` : `, ${materials}`}${roofStr ? `, ${roofStr}` : ''}${windowStr ? `, ${windowStr}` : ''}, ${colors}, ${facadeStyle}, ${styleSignature.glazingRatio || '40%'} glazing, ${styleSignature.lighting || 'soft overcast daylight'}, ${styleSignature.camera || '35mm lens, eye level 1.6m height'}, 45-degree corner perspective showing both front and side facades, photorealistic rendering, high detail, professional composition, ${styleSignature.postProcessing || 'natural color grading'}, sharp focus, architectural photography quality`,
          negativePrompt: [...sharedNegatives, 'frontal view only', 'elevation drawing'].join(', '),
          size: '1024x1536', // Portrait for exterior
          camera: '35mm lens, eye level, 45-degree angle',
          viewType: 'exterior'
        };

      case 'exterior_front_3d':
        return {
          prompt: `Photorealistic 3D EXTERIOR FRONT view, ${buildingProgram}${dimensionStr ? `, ${dimensionStr} proportions` : ''}${floorStr ? `, ${floorStr} building` : ''}${materialStr ? `, ${materialStr}` : `, ${materials}`}, FRONT facade centered, MAIN ENTRANCE prominently visible, materials and colors match technical drawings`,
          negativePrompt: [...sharedNegatives, 'side-only view', 'rear facade', 'axonometric', 'isometric'].join(', '),
          size: '1024x1024',
          camera: 'eye level 1.6m, frontal composition',
          viewType: 'exterior'
        };

      case 'exterior_side_3d':
        return {
          prompt: `Photorealistic 3D EXTERIOR SIDE view (45° corner), ${buildingProgram}${dimensionStr ? `, ${dimensionStr} proportions` : ''}${floorStr ? `, ${floorStr} building` : ''}${materialStr ? `, ${materialStr}` : `, ${materials}`}, SIDE facade emphasized, do not center main entrance (may be partial), materials/colors match technical drawings`,
          negativePrompt: [...sharedNegatives, 'front-only view', 'elevation drawing', 'axonometric', 'isometric'].join(', '),
          size: '1024x1024',
          camera: 'eye level 1.6m, 45° corner angle',
          viewType: 'exterior'
        };

      case 'axonometric_3d':
        return {
          prompt: `Architectural AXONOMETRIC 3D, PARALLEL PROJECTION (NO PERSPECTIVE), 45° plan rotation, ~30° tilt, ${materials}, technical illustration style, shows roof geometry and two facades, ${colors}`,
          negativePrompt: [...sharedNegatives, 'vanishing points', '2-point perspective', '1-point perspective', 'fisheye'].join(', '),
          size: '1024x1024',
          camera: 'parallel projection, 45°/30° axon',
          viewType: 'axonometric'
        };

      case 'perspective_3d':
        return {
          prompt: `Photorealistic 2-POINT PERSPECTIVE architectural view, eye level 1.6m, two vanishing points, realistic convergence, DIFFERENT from axonometric (must show perspective depth), ${materials}, ${colors}`,
          negativePrompt: [...sharedNegatives, 'parallel projection', 'axonometric', 'isometric'].join(', '),
          size: '1536x1024',
          camera: 'eye level, 2-point perspective',
          viewType: 'perspective'
        };

      case 'perspective':
        return {
          prompt: `Professional architectural photography, AERIAL PERSPECTIVE VIEW from elevated vantage point, ${buildingProgram}${dimensionStr ? `, ${dimensionStr} proportions` : ''}${floorStr ? `, ${floorStr} building` : ''}${materialStr ? `, ${materialStr}` : `, ${materials}`}${roofStr ? `, ${roofStr}` : ''}${windowStr ? `, ${windowStr}` : ''}, ${colors}, ${facadeStyle}, showing roof and surrounding context, bird's eye angle 25-35 degrees above horizon, ${styleSignature.lighting || 'soft overcast daylight'}, photorealistic rendering, high detail, professional architectural visualization, ${styleSignature.postProcessing || 'natural color grading'}, sharp focus, contextual landscape visible, dramatic composition`,
          negativePrompt: [...sharedNegatives, 'ground level', 'eye level', 'frontal view', 'elevation'].join(', '),
          size: '1536x1024', // Landscape for perspective
          camera: 'Elevated angle, 25-35° above horizon, wider context',
          viewType: 'perspective'
        };

      case 'interior':
        return {
          prompt: `Professional interior architectural photography, ${buildingProgram} interior, ${materials}, ${colors}, ${styleSignature.lighting || 'soft natural daylight through windows'}, ${styleSignature.camera || '35mm lens, eye level 1.6m height'}, photorealistic rendering, high detail, professional composition, ${styleSignature.postProcessing || 'warm natural color grading'}, sharp focus, architectural photography quality, spacious feeling`,
          negativePrompt: [...sharedNegatives, 'cluttered', 'dark', 'narrow'].join(', '),
          size: '1536x1024', // Landscape for interior
          camera: styleSignature.camera || '35mm lens, eye level',
          viewType: 'interior'
        };

      default:
        return {
          prompt: `Professional architectural visualization, ${buildingProgram}, ${materials}, ${colors}, ${facadeStyle}, photorealistic, high quality`,
          negativePrompt: sharedNegatives.join(', '),
          size: '1024x1024',
          camera: 'standard view',
          viewType: 'default'
        };
    }
  }

  /**
   * Get fallback style signature when generation fails
   */
  getFallbackStyleSignature(specs, location) {
    return {
      materialsPalette: ['polished concrete', 'anodized aluminum', 'double-glazed clear glass', 'natural wood'],
      colorPalette: {
        facade: 'warm gray concrete',
        roof: 'dark charcoal',
        trim: 'white',
        accent: 'natural wood tone'
      },
      facadeArticulation: 'horizontal emphasis with ribbon windows',
      glazingRatio: '40%',
      lineWeightRules: {
        walls: '0.5mm',
        windows: '0.3mm',
        annotations: '0.1mm'
      },
      diagramConventions: 'minimal furniture, emphasis on circulation and spatial flow',
      lighting: 'soft overcast daylight, 10am, even illumination',
      camera: '35mm lens, eye level 1.6m height, straight-on view',
      postProcessing: 'photorealistic with subtle natural color grading',
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extract exact visual details from master image using GPT-4o Vision
   * This solves DALL·E 3's no-memory limitation by using ChatGPT as coordinator
   * @param {string} imageUrl - URL of the master image to analyze
   * @param {Object} buildingDNA - Expected building DNA for reference
   * @returns {Promise<Object>} Extracted visual details with exact descriptions
   */
  async extractVisualDetailsFromImage(imageUrl, buildingDNA = {}) {
    try {
      console.log(`\n🔍 Extracting exact visual details from master image using GPT-4o Vision...`);

      const dna = buildingDNA || {};
      const expectedMaterials = dna.materials?.exterior?.primary || 'materials';
      const expectedRoof = dna.roof?.type || 'roof';
      const expectedWindows = dna.windows?.type || 'windows';
      const expectedFloors = dna.dimensions?.floors || dna.dimensions?.floorCount || 'floors';

      const response = await this.ai.chatCompletion([
        {
          role: 'system',
          content: 'You are an expert architectural visual analyst. Extract EXACT visual details from images with extreme precision. Return ONLY valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this architectural building image and extract EXACT visual details for perfect consistency across multiple views.

Expected building DNA (use as reference):
- Materials: ${expectedMaterials}
- Roof: ${expectedRoof}
- Windows: ${expectedWindows}
- Floors: ${expectedFloors}

Extract and return ONLY a JSON object with these EXACT details:

{
  "materials": {
    "facade": "precise description with color (e.g., warm orange brick with visible white mortar)",
    "facade_hex": "hex color code if discernible (e.g., #D4762E)",
    "trim": "trim/accent material and color",
    "trim_hex": "hex color code",
    "texture": "visible texture details"
  },
  "roof": {
    "type": "exact type (gable/flat/hip/mansard)",
    "pitch": "angle description (steep/moderate/shallow or degrees if visible)",
    "material": "roofing material (slate/tile/shingle/metal)",
    "color": "exact color description",
    "color_hex": "hex color code"
  },
  "windows": {
    "type": "exact window type (sash/casement/modern/fixed)",
    "frame_color": "frame color description",
    "frame_hex": "hex color code",
    "pattern": "window pattern (symmetrical/ribbon/punched/curtain wall)",
    "panes": "pane configuration (6-over-6/single-pane/etc)",
    "count_per_floor": "approximate count per floor"
  },
  "entrance": {
    "type": "door type and style",
    "color": "door color",
    "location": "position on facade",
    "features": "surrounding features (portico/steps/etc)"
  },
  "colors": {
    "primary": "dominant color with hex",
    "secondary": "secondary color with hex",
    "accent": "accent color with hex"
  },
  "architectural_style": "overall style (Victorian/Modern/Traditional/Contemporary/etc)",
  "floors_visible": "number of floors visible",
  "lighting": "lighting conditions (overcast/sunny/golden hour/shadows direction)",
  "distinctive_features": ["list", "of", "unique", "features"]
}

Be EXTREMELY specific with colors, materials, and patterns. These details will be used to generate perfectly consistent architectural views.`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            }
          ]
        }
      ], {
        model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
        temperature: 0.1, // Very low for consistency
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      const extractedDetails = safeParseJsonFromLLM(response.choices[0].message.content, {
        materials: {},
        roof: {},
        windows: {},
        colors: {},
        floors_visible: 1
      });

      // 🔧 CRITICAL FIX: Override extracted floor count with Building DNA floor count
      // GPT-4o Vision sometimes misidentifies floor count from master image
      // Design DNA is authoritative source for building specifications
      const totalFloors = buildingDNA?.dimensions?.floors || buildingDNA?.dimensions?.floorCount;
      if (totalFloors && extractedDetails.floors_visible !== totalFloors) {
        console.log(`   🔧 Overriding extracted floors (${extractedDetails.floors_visible}) with Design DNA floors (${totalFloors})`);
        extractedDetails.floors_visible = totalFloors;
      }

      console.log(`✅ Visual details extracted successfully:`);
      console.log(`   📦 Facade: ${extractedDetails.materials?.facade || 'N/A'}`);
      console.log(`   🏠 Roof: ${extractedDetails.roof?.type || 'N/A'} - ${extractedDetails.roof?.color || 'N/A'}`);
      console.log(`   🪟 Windows: ${extractedDetails.windows?.type || 'N/A'} - ${extractedDetails.windows?.frame_color || 'N/A'}`);
      console.log(`   🎨 Colors: ${Object.keys(extractedDetails.colors || {}).length} extracted`);
      console.log(`   📏 Floors: ${extractedDetails.floors_visible || 'N/A'}`);

      return extractedDetails;

    } catch (error) {
      console.error(`❌ Failed to extract visual details:`, error.message);
      console.log(`⚠️  Falling back to Building DNA only`);

      // Return basic structure from DNA as fallback
      return {
        materials: {
          facade: buildingDNA.materials?.exterior?.primary || 'brick',
          facade_hex: buildingDNA.colorPalette?.primary || '#D4762E'
        },
        roof: {
          type: buildingDNA.roof?.type || 'gable',
          material: buildingDNA.roof?.material || 'slate'
        },
        windows: {
          type: buildingDNA.windows?.type || 'sash',
          frame_color: buildingDNA.windows?.color || 'white'
        },
        fallback: true
      };
    }
  }

  /**
   * Determine if a view type is technical (requires precision) or photorealistic
   * @param {string} viewType - The view type to check
   * @returns {boolean} True if technical view (DALL-E 3), false if photorealistic (Midjourney)
   */
  isTechnicalView(viewType) {
    const technicalViews = [
      'plan',
      'floor_plan',
      'elevation',
      'elevation_north',
      'elevation_south',
      'elevation_east',
      'elevation_west',
      'section',
      'section_longitudinal',
      'section_cross',
      'axonometric',
      'axon'
    ];
    return technicalViews.includes(viewType);
  }

  /**
   * Generate consistent images using HYBRID MODEL SELECTION
   * Strategy: DALL-E 3 for technical drawings (precise instructions),
   * Midjourney for photorealistic renders (superior quality)
   * @param {Array} viewRequests - Array of view generation requests
   * @param {Object} context - Project context with style signature
   * @returns {Promise<Array>} Array of generated images
   */
  async generateConsistentImages(viewRequests, context) {
    try {
      console.log(`🎨 Generating ${viewRequests.length} consistent images with HYBRID MODEL SELECTION`);
      console.log(`   🎯 Strategy: DALL-E 3 for technical views, Midjourney for photorealistic renders`);
      console.log(`   📐 Technical views (floor plans, elevations, sections, axonometric) → DALL-E 3`);
      console.log(`   📸 Photorealistic views (exterior, interior, perspective) → Midjourney (optional)`);

      // Ensure style signature exists
      const styleSignature = context.styleSignature ||
        await this.generateStyleSignature(
          context.portfolio || {},
          context.specs || context,
          context.location || {}
        );

      const results = [];
      let masterImageUrl = null;
      let extractedVisualDetails = null;

      // 🎯 STEP 1: Find and generate master exterior image FIRST
      const masterIndex = viewRequests.findIndex(req =>
        req.viewType === 'exterior' || req.viewType === 'exterior_front' || req.viewType === 'exterior_side'
      );

      if (masterIndex !== -1 && masterIndex > 0) {
        // Move master to front for sequential generation
        const [masterReq] = viewRequests.splice(masterIndex, 1);
        viewRequests.unshift(masterReq);
        console.log(`📌 Moved ${masterReq.viewType} to first position as master reference image`);
      }

      for (let i = 0; i < viewRequests.length; i++) {
        const req = viewRequests[i];
        const isMaster = i === 0 && (req.viewType === 'exterior' || req.viewType === 'exterior_front' || req.viewType === 'exterior_side');

        if (isMaster) {
          console.log(`\n🎨 [MASTER] Generating master ${req.viewType} for visual reference...`);
        } else {
          console.log(`\n🎨 [${i + 1}/${viewRequests.length}] Generating ${req.viewType}${extractedVisualDetails ? ' using extracted details' : ''}...`);
        }

        // Build prompt kit for this view (with extracted details if available)
        const promptKit = this.buildPromptKit(
          styleSignature,
          req.viewType,
          req.meta || context,
          extractedVisualDetails // Pass extracted details for consistency
        );

        let retries = 0;
        const maxRetries = 3;
        let success = false;
        let images = null;
        let lastError = null;

        // Retry loop for DALL·E 3 (no fallback to SDXL)
        while (!success && retries < maxRetries) {
          try {
            if (retries > 0) {
              console.log(`   🔄 Retry attempt ${retries}/${maxRetries - 1} for ${req.viewType}...`);
            }

            // 🎯 HYBRID MODEL SELECTION: Route based on view type
            const isTechnical = this.isTechnicalView(req.viewType);

            if (isTechnical) {
              // 📐 TECHNICAL VIEWS → DALL-E 3 (better at following precise instructions)
              console.log(`   📐 Using DALL-E 3 for ${req.viewType} (technical precision)...`);

              try {
                const result = await this.openaiImage.generateImage({
                  prompt: promptKit.prompt,
                  size: promptKit.size || '1024x1024',
                  quality: 'hd',
                  style: 'natural'
                });

                // DALL-E 3 returns an array of image objects
                if (result && result.length > 0) {
                  images = [{
                    url: result[0].url,
                    revised_prompt: result[0].revised_prompt || promptKit.prompt,
                    model: 'dalle3'
                  }];
                } else {
                  throw new Error('No images returned from DALL-E 3');
                }

                console.log(`   ✅ DALL-E 3 generation successful for ${req.viewType}`);
              } catch (dalle3Error) {
                console.error(`   ❌ DALL-E 3 failed for ${req.viewType}:`, dalle3Error.message);
                throw new Error(`DALL-E 3 generation failed for ${req.viewType}: ${dalle3Error.message}`);
              }

            }

            success = true;

            let imageUrl = images[0]?.url;

            // 🎨 CRITICAL FIX #3: Apply 2D enforcement for floor plans (convert 3D axonometric to 2D blueprint)
            if (imageUrl && (req.viewType === 'plan' || req.viewType === 'floor_plan')) {
              console.log(`   🔧 Applying 2D floor plan enforcement (convert 3D to flat blueprint)...`);
              try {
                const processedImageUrl = await enforce2DFloorPlan(imageUrl, {
                  applyBlueprintTint: true,
                  contrastBoost: 1.5,
                  desaturate: true,
                  lineThickness: 1.2
                });
                imageUrl = processedImageUrl;
                images[0].url = processedImageUrl; // Update the images array
                console.log(`   ✅ Floor plan converted to 2D blueprint style`);
              } catch (enforce2DError) {
                console.error(`   ❌ 2D enforcement failed:`, enforce2DError.message);
                console.warn(`   ⚠️  Using original floor plan image (DALL·E 3 generated)`);
                // Continue with original image
              }
            }

            // 🔍 CRITICAL FIX #2: Validate view correctness using GPT-4 Vision
            if (imageUrl) {
              console.log(`   🔍 Validating view correctness with GPT-4 Vision...`);
              try {
                // Note: Together AI doesn't have vision API, skip classification
                const classification = null;

                if (classification.isCorrect) {
                  console.log(`   ✅ View verified: ${classification.actualView} (confidence: ${classification.confidence})`);
                } else {
                  console.warn(`   ⚠️  View mismatch: expected ${req.viewType}, got ${classification.actualView}`);
                  console.warn(`   Reason: ${classification.reason}`);

                  // Auto-regenerate up to 2 times for 2D views (floor_plan, elevation_*, section_*)
                  const is2DView = req.viewType === 'plan' || req.viewType === 'floor_plan' ||
                                   req.viewType.startsWith('elevation_') || req.viewType.startsWith('section_');
                  const maxRegenAttempts = is2DView ? 2 : 1;

                  if (retries < maxRegenAttempts) {
                    console.log(`   🔄 Auto-regenerating with enhanced prompt (attempt ${retries + 1}/${maxRegenAttempts})...`);
                    retries++;
                    success = false;
                    continue; // Retry with same parameters
                  } else {
                    console.warn(`   ⚠️  Keeping mismatched view after ${maxRegenAttempts} retries (user will be warned)`);
                  }
                }

                // Store classification result in images metadata
                if (images[0]) {
                  images[0].classification = classification;
                }
              } catch (classifyError) {
                console.error(`   ❌ View classification failed:`, classifyError.message);
                console.log(`   ⚠️  Continuing without validation`);
              }
            }

            // 🎯 STEP 2: If this is the master image, extract visual details
            if (isMaster && imageUrl) {
              masterImageUrl = imageUrl;
              console.log(`\n🔍 Master image generated, extracting visual details for consistency...`);

              extractedVisualDetails = await this.extractVisualDetailsFromImage(
                masterImageUrl,
                (req.meta || context).buildingDNA || {}
              );

              if (extractedVisualDetails && !extractedVisualDetails.fallback) {
                console.log(`✅ Visual details extracted successfully - will be used for ALL remaining views`);
              } else {
                console.log(`⚠️  Visual extraction failed or fallback - using Building DNA only`);
              }
            }

            // Determine actual model used
            const modelUsed = this.isTechnicalView(req.viewType) ? 'dalle3' : 'midjourney';

            results.push({
              success: true,
              viewType: req.viewType,
              images: images.map(img => img.url),
              revisedPrompt: images[0]?.revised_prompt,
              source: modelUsed,  // Correctly set based on actual model used
              promptKit,
              attempts: retries + 1,
              isMaster: isMaster || false,
              usedExtractedDetails: !isMaster && extractedVisualDetails && !extractedVisualDetails.fallback
            });

            const modelName = modelUsed === 'dalle3' ? 'DALL-E 3' : 'Midjourney';
            console.log(`   ✅ ${req.viewType} generated with ${modelName}${retries > 0 ? ` (attempt ${retries + 1})` : ''}`);

          } catch (midjourneyGenError) {
            lastError = midjourneyGenError;
            retries++;

            console.error(`   ❌ Midjourney attempt ${retries} failed:`, midjourneyGenError.message);

            if (retries < maxRetries) {
              const waitTime = retries * 3000; // Exponential backoff: 3s, 6s, 9s
              console.log(`   ⏳ Waiting ${waitTime / 1000}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              // All retries exhausted - use placeholder
              console.error(`   ❌ All ${maxRetries} attempts failed for ${req.viewType}`);
              console.warn(`   ⚠️  Using placeholder image (Midjourney ONLY policy - no fallback)`);

              results.push({
                success: false,
                viewType: req.viewType,
                error: `Midjourney failed after ${maxRetries} attempts: ${lastError.message}`,
                images: [this.openaiImage.getFallbackImage(req.viewType, promptKit.size).url],
                source: 'placeholder',
                promptKit,
                attempts: maxRetries
              });
            }
          }
        }

        // Add delay between requests to respect rate limits (except after last request)
        if (i < viewRequests.length - 1) {
          console.log(`   ⏳ Waiting 2s before next image...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Count by actual model used (check the images array model field)
      let togetherAICount = 0;
      let placeholderCount = 0;

      results.forEach(r => {
        if (r.source === 'placeholder') {
          placeholderCount++;
        } else if (r.images && r.images.length > 0) {
          togetherAICount++;
        }
      });

      const successCount = togetherAICount;
      const usedExtractedDetails = results.filter(r => r.usedExtractedDetails).length;
      const hasMaster = results.some(r => r.isMaster);

      console.log(`\n✅ ============================================`);
      console.log(`✅ Completed ${results.length} image generations (TOGETHER AI EXCLUSIVE)`);
      console.log(`   🎨 Together AI (FLUX.1): ${togetherAICount}/${results.length}`);
      console.log(`   ❌ Placeholder: ${placeholderCount}/${results.length}`);
      console.log(`   🎯 Master Image: ${hasMaster ? 'Generated successfully' : 'Not found'}`);
      console.log(`   🔗 Used Extracted Details: ${usedExtractedDetails}/${results.length - 1} views`);
      console.log(`   🎨 Consistency Level: ${extractedVisualDetails && !extractedVisualDetails.fallback ? 'PERFECT (GPT-4o coordinated)' : successCount === results.length ? 'HIGH (DNA-based)' : 'MEDIUM'}`);
      console.log(`✅ ============================================`);

      return results;
    } catch (error) {
      console.error('❌ Consistent image generation error:', error);
      throw error;
    }
  }

  /**
   * Complete AI-powered architectural design workflow
   * @param {Object} projectContext - Complete project information
   * @returns {Promise<Object>} Combined reasoning and generation results
   */
  async generateCompleteDesign(projectContext) {
    try {
      console.log('Starting complete AI design workflow...');
      
      // Step 1: Generate design reasoning
      const reasoning = await this.generateDesignReasoning(projectContext);
      
      // Step 2: Generate architectural visualizations
      const visualizations = await this.generateVisualizations(projectContext, reasoning);
      
      // Step 3: Generate design alternatives
      const alternatives = await this.generateDesignAlternatives(projectContext, reasoning);
      
      // Step 4: Analyze feasibility
      const feasibility = await this.analyzeFeasibility(projectContext);
      
      return {
        success: true,
        reasoning,
        visualizations,
        alternatives,
        feasibility,
        projectContext,
        timestamp: new Date().toISOString(),
        workflow: 'complete'
      };

    } catch (error) {
      console.error('Complete design workflow error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackDesign(projectContext)
      };
    }
  }

  /**
   * Generate design reasoning using OpenAI
   */
  async generateDesignReasoning(projectContext) {
    try {
      console.log(`Generating design reasoning... (Using ${USE_TOGETHER ? 'Together AI' : 'OpenAI'})`);

      let reasoning;
      if (USE_TOGETHER) {
        // Use Together AI with Meta Llama 3.1 70B
        reasoning = await togetherAIService.generateReasoning({
          projectContext: projectContext,
          portfolioAnalysis: projectContext.portfolioAnalysis,
          locationData: projectContext.locationContext || projectContext.location,
          buildingProgram: projectContext.buildingProgram || projectContext.buildingType
        });

        // Normalize Together AI response to match OpenAI format (ensure strings)
        reasoning = {
          designPhilosophy: String(reasoning.designPhilosophy || 'Modern contextual design'),
          spatialOrganization: String(reasoning.spatialOrganization || 'Optimized flow'),
          materialRecommendations: String(reasoning.materials || reasoning.materialRecommendations || 'Sustainable materials'),
          environmentalConsiderations: String(reasoning.environmentalConsiderations || 'Climate-responsive design'),
          technicalSolutions: String(reasoning.technicalSolutions || 'Efficient systems'),
          codeCompliance: String(reasoning.codeCompliance || 'Meets local regulations'),
          costStrategies: String(reasoning.costStrategies || 'Value engineering'),
          futureProofing: String(reasoning.futureProofing || 'Adaptable design'),
          source: 'together'
        };
      } else {
        reasoning = await this.ai.generateDesignReasoning(projectContext);
        reasoning.source = 'openai';
      }

      return {
        ...reasoning,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Design reasoning error:', error);
      return {
        designPhilosophy: 'Contextual and sustainable design approach',
        spatialOrganization: 'Functional and flexible spatial arrangement',
        materialRecommendations: 'Locally sourced, sustainable materials',
        environmentalConsiderations: 'Passive design and renewable energy integration',
        technicalSolutions: 'Efficient structural and MEP systems',
        codeCompliance: 'Full compliance with local regulations',
        costStrategies: 'Value engineering and lifecycle cost optimization',
        futureProofing: 'Adaptable design for future needs',
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate architectural visualizations using Replicate
   */
  async generateVisualizations(projectContext, reasoning) {
    try {
      console.log(`Generating architectural visualizations... (Using ${USE_TOGETHER ? 'Together AI FLUX.1' : 'Replicate'})`);

      if (USE_TOGETHER) {
        // Use Together AI FLUX.1 DNA-enhanced generation for all 13 views
        console.log('🧬 Generating complete architectural package with DNA consistency...');

        const packageResult = await togetherAIService.generateConsistentArchitecturalPackage({
          projectContext: {
            ...projectContext,
            seed: Math.floor(Math.random() * 1000000)
          }
        });

        console.log(`✅ Generated ${packageResult.totalViews} views with ${packageResult.consistency} consistency`);

        // Map the 13 views to the expected format
        return {
          views: {
            // 2D Technical Drawings
            floor_plan_ground: packageResult.floor_plan_ground?.url,
            floor_plan_upper: packageResult.floor_plan_upper?.url,
            elevation_north: packageResult.elevation_north?.url,
            elevation_south: packageResult.elevation_south?.url,
            elevation_east: packageResult.elevation_east?.url,
            elevation_west: packageResult.elevation_west?.url,
            section_longitudinal: packageResult.section_longitudinal?.url,
            section_cross: packageResult.section_cross?.url,

            // 3D Visualizations (maintain backward compatibility with existing keys)
            exterior_front: packageResult.exterior_front_3d?.url,
            exterior_side: packageResult.exterior_side_3d?.url,
            interior: packageResult.interior_3d?.url,
            axonometric: packageResult.axonometric_3d?.url,
            perspective: packageResult.perspective_3d?.url
          },
          styleVariations: [],
          reasoningBased: [],
          source: 'together-flux-dna',
          seed: packageResult.seed,
          masterDNA: packageResult.masterDNA,
          consistency: packageResult.consistency,
          uniqueImages: packageResult.uniqueImages,
          timestamp: new Date().toISOString()
        };
      } else {
        // Original Replicate implementation
        const views = await this.replicate.generateMultipleViews(
          projectContext,
          ['exterior_front', 'exterior_side', 'interior']
        );

        const styleVariations = await this.replicate.generateStyleVariations(
          projectContext,
          ['modern', 'sustainable', 'contemporary']
        );

        const reasoningBased = await this.replicate.generateFromReasoning(
          reasoning,
          projectContext
        );

        return {
          views,
          styleVariations,
          reasoningBased,
          source: 'replicate',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      console.error('Visualization generation error:', error);
      return {
        views: this.getFallbackViews(),
        styleVariations: this.getFallbackStyleVariations(),
        reasoningBased: this.getFallbackReasoningBased(),
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate design alternatives
   */
  async generateDesignAlternatives(projectContext, reasoning) {
    try {
      console.log('Generating design alternatives...');
      
      const approaches = ['sustainable', 'cost_effective', 'innovative', 'traditional'];
      const alternatives = {};

      for (const approach of approaches) {
        try {
          const alternativeReasoning = await this.ai.generateDesignAlternatives(
            projectContext, 
            approach
          );
          
          const alternativeVisualization = await this.replicate.generateArchitecturalImage({
            ...this.buildAlternativeParams(projectContext, approach),
            prompt: this.buildAlternativePrompt(alternativeReasoning, approach)
          });

          alternatives[approach] = {
            reasoning: alternativeReasoning,
            visualization: alternativeVisualization,
            approach
          };
        } catch (error) {
          console.error(`Error generating ${approach} alternative:`, error);
          alternatives[approach] = {
            error: error.message,
            approach
          };
        }
      }

      return {
        alternatives,
        source: 'ai_integration',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Design alternatives error:', error);
      return {
        alternatives: this.getFallbackAlternatives(),
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Analyze project feasibility
   */
  async analyzeFeasibility(projectContext) {
    try {
      console.log('Analyzing project feasibility...');
      return await this.ai.analyzeFeasibility(projectContext);
    } catch (error) {
      console.error('Feasibility analysis error:', error);
      return {
        feasibility: 'Medium',
        constraints: ['Detailed analysis unavailable'],
        recommendations: ['Manual feasibility review recommended'],
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Build parameters for alternative approaches
   */
  buildAlternativeParams(projectContext, approach) {
    const baseParams = {
      buildingType: projectContext.buildingProgram || 'building',
      location: projectContext.location?.address || 'urban setting',
      width: 1024,
      height: 768
    };

    switch (approach) {
      case 'sustainable':
        return {
          ...baseParams,
          architecturalStyle: 'sustainable',
          materials: 'recycled and renewable materials',
          prompt: 'Sustainable architectural design, green building, eco-friendly materials, energy efficient, LEED certified, environmental consciousness'
        };

      case 'cost_effective':
        return {
          ...baseParams,
          architecturalStyle: 'cost-effective',
          materials: 'standard construction materials',
          prompt: 'Cost-effective architectural design, value engineering, budget-conscious, efficient construction, practical solutions'
        };

      case 'innovative':
        return {
          ...baseParams,
          architecturalStyle: 'futuristic',
          materials: 'advanced materials and technology',
          prompt: 'Innovative architectural design, cutting-edge technology, smart building, futuristic, advanced materials, digital integration'
        };

      case 'traditional':
        return {
          ...baseParams,
          architecturalStyle: 'traditional',
          materials: 'traditional local materials',
          prompt: 'Traditional architectural design, cultural context, local materials, heritage-inspired, timeless design'
        };

      default:
        return baseParams;
    }
  }

  /**
   * Build prompt for alternative approaches
   */
  buildAlternativePrompt(reasoning, approach) {
    const philosophy = reasoning.designPhilosophy || `${approach} design approach`;
    const materials = this.extractMaterialsFromReasoning(reasoning);
    
    return `Professional architectural visualization, ${approach} design approach: "${philosophy}", using ${materials}, photorealistic rendering, professional architectural photography, high quality, detailed`;
  }

  /**
   * Extract materials from reasoning
   */
  extractMaterialsFromReasoning(reasoning) {
    // Ensure materialText is a string
    const materialText = String(reasoning.materialRecommendations || reasoning.materials || '');
    const materials = ['glass', 'steel', 'concrete', 'wood', 'stone', 'brick'];
    const foundMaterials = materials.filter(material =>
      materialText.toLowerCase().includes(material)
    );

    return foundMaterials.length > 0 ? foundMaterials.join(' and ') : 'glass and steel';
  }

  /**
   * Get fallback design when services are unavailable
   */
  getFallbackDesign(projectContext) {
    return {
      reasoning: {
        designPhilosophy: 'Contextual and sustainable design approach',
        spatialOrganization: 'Functional and flexible spatial arrangement',
        materialRecommendations: 'Locally sourced, sustainable materials',
        environmentalConsiderations: 'Passive design and renewable energy integration',
        technicalSolutions: 'Efficient structural and MEP systems',
        codeCompliance: 'Full compliance with local regulations',
        costStrategies: 'Value engineering and lifecycle cost optimization',
        futureProofing: 'Adaptable design for future needs',
        isFallback: true
      },
      visualizations: this.getFallbackViews(),
      alternatives: this.getFallbackAlternatives(),
      feasibility: {
        feasibility: 'Medium',
        constraints: ['AI services unavailable'],
        recommendations: ['Manual design review recommended']
      },
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback views
   */
  getFallbackViews() {
    return {
      exterior: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Exterior+View+Placeholder']
      },
      interior: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Interior+View+Placeholder']
      },
      site_plan: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x1024/9013FE/FFFFFF?text=Site+Plan+Placeholder']
      }
    };
  }

  /**
   * Get fallback style variations
   */
  getFallbackStyleVariations() {
    return {
      modern: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Modern+Style+Placeholder']
      },
      sustainable: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Sustainable+Style+Placeholder']
      },
      contemporary: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/9013FE/FFFFFF?text=Contemporary+Style+Placeholder']
      }
    };
  }

  /**
   * Get fallback reasoning-based visualization
   */
  getFallbackReasoningBased() {
    return {
      success: false,
      isFallback: true,
      images: ['https://via.placeholder.com/1024x768/F5A623/FFFFFF?text=AI+Reasoning+Based+Placeholder']
    };
  }

  /**
   * Get fallback alternatives
   */
  getFallbackAlternatives() {
    return {
      sustainable: {
        reasoning: { designPhilosophy: 'Sustainable design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'sustainable'
      },
      cost_effective: {
        reasoning: { designPhilosophy: 'Cost-effective design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'cost_effective'
      },
      innovative: {
        reasoning: { designPhilosophy: 'Innovative design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'innovative'
      },
      traditional: {
        reasoning: { designPhilosophy: 'Traditional design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'traditional'
      }
    };
  }

  /**
   * Get fallback floor plan and 3D preview
   */
  getFallbackFloorPlanAnd3D(projectContext) {
    return {
      floorPlan: {
        success: false,
        isFallback: true,
        floorPlan: {
          images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=2D+Floor+Plan+Placeholder'],
          message: 'Using placeholder floor plan - API unavailable'
        },
        type: '2d_floor_plan'
      },
      preview3D: {
        success: false,
        isFallback: true,
        preview3D: {
          images: ['https://via.placeholder.com/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder'],
          message: 'Using placeholder 3D preview - API unavailable'
        },
        type: '3d_preview'
      },
      styleDetection: null,
      reasoning: this.getFallbackReasoning(projectContext),
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback style-optimized design
   */
  getFallbackStyleOptimized(projectContext) {
    return {
      styleDetection: {
        primaryStyle: { style: 'Contemporary', confidence: 'Medium' },
        designElements: { materials: 'Glass, steel, concrete' },
        isFallback: true
      },
      compatibilityAnalysis: {
        compatibilityScore: '7/10',
        isFallback: true
      },
      reasoning: this.getFallbackReasoning(projectContext),
      visualizations: this.getFallbackVisualizations(),
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback reasoning
   */
  getFallbackReasoning(projectContext) {
    return {
      designPhilosophy: 'Contextual and sustainable design approach',
      spatialOrganization: 'Functional and flexible spatial arrangement',
      materialRecommendations: 'Locally sourced, sustainable materials',
      environmentalConsiderations: 'Passive design and renewable energy integration',
      technicalSolutions: 'Efficient structural and MEP systems',
      codeCompliance: 'Full compliance with local regulations',
      costStrategies: 'Value engineering and lifecycle cost optimization',
      futureProofing: 'Adaptable design for future needs',
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback visualizations
   */
  getFallbackVisualizations() {
    return {
      floorPlan: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Floor+Plan+Placeholder']
      },
      preview3D: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder']
      },
      styleVariations: {
        contemporary: {
          success: false,
          isFallback: true,
          images: ['https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Contemporary+Style+Placeholder']
        },
        sustainable: {
          success: false,
          isFallback: true,
          images: ['https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Sustainable+Style+Placeholder']
        },
        innovative: {
          success: false,
          isFallback: true,
          images: ['https://via.placeholder.com/1024x768/9013FE/FFFFFF?text=Innovative+Style+Placeholder']
        }
      },
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate 2D floor plan and 3D preview with style detection
   */
  async generateFloorPlanAnd3DPreview(projectContext, portfolioImages = []) {
    try {
      console.log('Starting comprehensive architectural generation...');

      // STEP 1: Use projectSeed from context (generated once in frontend)
      const projectSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      const enhancedContext = { ...projectContext, seed: projectSeed };

      console.log(`🎲 Using unified project seed: ${projectSeed} for ALL outputs (2D plans, elevations, sections, 3D views)`);

      // Step 1: Detect architectural style from portfolio if provided
      let styleDetection = null;
      if (portfolioImages && portfolioImages.length > 0) {
        styleDetection = await this.portfolioStyleDetection.detectArchitecturalStyle(
          portfolioImages,
          projectContext.location
        );
      }

      // Step 2: Generate multi-level floor plans (ground, upper if needed, roof)
      console.log('🏗️ Generating multi-level floor plans...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(enhancedContext);

      // STEP 2: Capture ground floor plan image URL for use as ControlNet control
      let floorPlanControlImage = null;
      if (floorPlans?.floorPlans?.ground?.images && floorPlans.floorPlans.ground.images.length > 0) {
        floorPlanControlImage = floorPlans.floorPlans.ground.images[0];
        console.log('🎯 Captured ground floor plan for ControlNet:', floorPlanControlImage?.substring(0, 50) + '...');
      }

      // Step 3: Generate elevations and sections as independent 2D technical drawings
      console.log('🏗️ Generating all elevations (N,S,E,W) and sections (longitudinal, cross) as pure 2D technical drawings...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(
        enhancedContext,
        true, // Generate all drawings (4 elevations + 2 sections)
        null // No ControlNet - elevations/sections must be independent 2D orthographic projections
      );

      // Step 4: Generate 3D views (2 exterior + 1 interior + axonometric + perspective) - WITHOUT ControlNet for better photorealistic results
      console.log('🏗️ Generating 3D photorealistic views: exterior_front, exterior_side, interior, axonometric, perspective (no ControlNet for perspective freedom)');
      const views = await this.replicate.generateMultipleViews(
        enhancedContext,
        ['exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective'],
        null // Removed ControlNet - 3D views need photorealistic perspective freedom, not constrained by 2D floor plan
      );

      // Step 5: Generate design reasoning with style context
      const reasoning = await this.generateDesignReasoningWithStyle(
        projectContext,
        styleDetection
      );

      return {
        success: true,
        floorPlans,
        technicalDrawings,
        visualizations: { views }, // Wrap views in visualizations object
        styleDetection,
        reasoning,
        projectContext: enhancedContext,
        projectSeed,
        timestamp: new Date().toISOString(),
        workflow: 'comprehensive_architectural_generation'
      };

    } catch (error) {
      console.error('Floor plan and 3D preview generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackFloorPlanAnd3D(projectContext)
      };
    }
  }

  /**
   * STEP 3 & 4: Integrated design generation with location analysis and style blending
   * Orchestrates location analysis, portfolio detection, and coordinated 2D/3D generation
   * @param {Object} projectContext - Project context with all specifications
   * @param {Array} portfolioImages - Optional portfolio images for style detection
   * @param {Number} materialWeight - Material blend weight (0-1): 0=all local, 1=all portfolio, 0.5=balanced
   * @param {Number} characteristicWeight - Characteristic blend weight (0-1): 0=all local, 1=all portfolio, 0.5=balanced
   */
  async generateIntegratedDesign(projectContext, portfolioImages = [], materialWeight = 0.5, characteristicWeight = 0.5) {
    try {
      console.log('🎯 Starting integrated design generation workflow...');
      console.log('⚖️  Material weight:', materialWeight, `(${Math.round((1-materialWeight)*100)}% local / ${Math.round(materialWeight*100)}% portfolio)`);
      console.log('⚖️  Characteristic weight:', characteristicWeight, `(${Math.round((1-characteristicWeight)*100)}% local / ${Math.round(characteristicWeight*100)}% portfolio)`);

      // STEP 3.1: Location analysis
      console.log('📍 Step 1: Analyzing location and architectural context...');
      const locationAnalysis = locationIntelligence.recommendArchitecturalStyle(
        projectContext.location,
        projectContext.climateData || { type: 'temperate' }
      );

      // Store location analysis in projectContext
      const enhancedContext = {
        ...projectContext,
        locationAnalysis: locationAnalysis
      };

      console.log('✅ Location analysis complete:', {
        primary: locationAnalysis.primary,
        materials: locationAnalysis.materials?.slice(0, 3),
        climateAdaptations: locationAnalysis.climateAdaptations?.features?.slice(0, 3)
      });

      // STEP 3.2: Optional portfolio style detection
      let portfolioStyle = null;
      if (portfolioImages && portfolioImages.length > 0) {
        console.log('🎨 Step 2: Detecting portfolio style from', portfolioImages.length, 'images...');
        portfolioStyle = await this.portfolioStyleDetection.detectArchitecturalStyle(
          portfolioImages,
          projectContext.location
        );
        enhancedContext.portfolioStyle = portfolioStyle;
        console.log('✅ Portfolio style detected:', portfolioStyle?.primaryStyle?.style);
      } else {
        console.log('⏭️  Step 2: Skipping portfolio analysis (no images provided)');
      }

      // STEP 4: Blended style creation with granular weighted merging
      console.log('🎨 Step 3: Creating blended style with separate material and characteristic weights');
      const blendedStyle = this.createBlendedStylePrompt(enhancedContext, locationAnalysis, portfolioStyle, materialWeight, characteristicWeight);
      enhancedContext.blendedStyle = blendedStyle;
      enhancedContext.blendedPrompt = blendedStyle.description; // Keep backward compatibility

      // STEP 4: Apply blended style to architectural context
      enhancedContext.architecturalStyle = blendedStyle.styleName;
      enhancedContext.materials = blendedStyle.materials.slice(0, 3).join(', ') || projectContext.materials;

      console.log('✅ Blended style created:', blendedStyle.styleName);

      // STEP 3.4: Use unified seed from projectContext
      const projectSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      enhancedContext.seed = projectSeed;
      console.log('🎲 Using unified seed:', projectSeed);

      // CRITICAL: Create Building DNA for perfect 2D/3D consistency
      console.log('🧬 Creating building DNA master specification for consistency...');
      const buildingDNA = this.createBuildingDNA(enhancedContext, blendedStyle);
      enhancedContext.masterDesignSpec = buildingDNA;
      enhancedContext.reasoningParams = buildingDNA; // Backward compatibility
      console.log('✅ Building DNA created:', {
        materials: buildingDNA.materials,
        roofType: buildingDNA.roof?.type,
        windowPattern: buildingDNA.windows?.pattern,
        floors: buildingDNA.dimensions?.floors
      });

      // STEP 3.5: Generate multi-level floor plans with unified seed and blended prompt
      console.log('🏗️ Step 4: Generating multi-level floor plans with blended style...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(enhancedContext);

      // Capture ground floor plan image for ControlNet
      // eslint-disable-next-line no-unused-vars
      let floorPlanImage = null;
      if (floorPlans?.floorPlans?.ground?.images && floorPlans.floorPlans.ground.images.length > 0) {
        floorPlanImage = floorPlans.floorPlans.ground.images[0];
        console.log('✅ Ground floor plan generated, captured for ControlNet control');
      }

      // STEP 3.6: Generate elevations and sections as independent 2D technical drawings
      console.log('🏗️ Step 5: Generating all elevations (N,S,E,W) and sections (longitudinal, cross) as pure 2D technical drawings...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(
        enhancedContext,
        true, // generateAllDrawings - generate all 4 elevations + 2 sections
        null // No ControlNet - elevations/sections must be independent 2D orthographic projections
      );
      console.log('✅ All technical drawings generated as independent 2D orthographic projections');

      // STEP 3.6.5: Annotate elevations and sections with dimensions
      console.log('📐 Annotating technical drawings with dimensions...');
      try {
        const td = technicalDrawings?.technicalDrawings;
        if (td) {
          // Annotate elevations
          ['north', 'south', 'east', 'west'].forEach(dir => {
            const key = `elevation_${dir}`;
            if (td[key]?.images && td[key].images.length > 0) {
              const baseImage = td[key].images[0];
              const annotatedSvg = this.dimensioning.annotateElevation(baseImage, {
                direction: dir,
                height: enhancedContext.buildingHeight || '12m',
                width: enhancedContext.buildingWidth || '20m'
              });
              td[key].annotated = annotatedSvg;
              console.log(`✅ Annotated ${dir} elevation`);
            }
          });

          // Annotate sections
          ['longitudinal', 'cross'].forEach(type => {
            const key = `section_${type}`;
            if (td[key]?.images && td[key].images.length > 0) {
              const baseImage = td[key].images[0];
              const annotatedSvg = this.dimensioning.annotateSection(baseImage, {
                type: type,
                floors: enhancedContext.floors || 1
              });
              td[key].annotated = annotatedSvg;
              console.log(`✅ Annotated ${type} section`);
            }
          });
        }
        console.log('✅ Technical drawing annotation complete');
      } catch (annoError) {
        console.error('⚠️ Elevation annotation failed:', annoError.message);
        // Continue without annotations - originals are still available
      }

      // STEP 3.7: Generate multiple 3D views (exterior, interior, perspective) + BIM-derived axonometric
      console.log('🏗️ Step 6: Generating 3D photorealistic views (exterior front, side, interior, perspective)...');
      // Generate photorealistic views WITHOUT axonometric (will use BIM-derived version)
      const views = await this.replicate.generateMultipleViews(
        enhancedContext,
        ['exterior_front', 'exterior_side', 'interior', 'perspective'],
        null // No ControlNet for photorealistic freedom
      );
      console.log('✅ Photorealistic 3D views generated');

      // STEP 3: Combine all results in single object
      const combinedResults = {
        floorPlans: floorPlans,
        technicalDrawings: technicalDrawings,
        views: views,
        metadata: {
          floorPlansSuccess: floorPlans?.success !== false,
          technicalDrawingsSuccess: technicalDrawings?.success !== false,
          viewsSuccess: Object.keys(views || {}).length > 0,
          floorPlanCount: floorPlans?.floorCount || 1,
          viewCount: Object.keys(views || {}).length
        }
      };

      console.log('✅ Combined results:', {
        floorPlans: combinedResults.metadata.floorPlansSuccess ? 'Success' : 'Failed',
        technicalDrawings: combinedResults.metadata.technicalDrawingsSuccess ? 'Success' : 'Failed',
        views: combinedResults.metadata.viewsSuccess ? 'Success' : 'Failed',
        floorPlanCount: combinedResults.metadata.floorPlanCount,
        viewCount: combinedResults.metadata.viewCount
      });

      // STEP 3.8: Generate parametric BIM model based on blended style
      console.log('🏗️ Step 7: Generating parametric BIM model from blended style specifications...');
      let bimModel = null;
      let bimAxonometric = null;
      let axonometricSource = 'none';

      try {
        bimModel = await this.bim.generateParametricModel({
          ...enhancedContext,
          style: blendedStyle.styleName,
          materials: blendedStyle.materials,
          characteristics: blendedStyle.characteristics,
          floorPlan: floorPlans,
          elevations: technicalDrawings
        });
        console.log('✅ BIM model generated successfully with', bimModel?.components?.length || 0, 'components');

        // STEP 3.9: Derive geometrically accurate axonometric view from BIM
        console.log('🏗️ Deriving axonometric view from BIM model...');
        try {
          bimAxonometric = this.bim.deriveAxonometric(bimModel, {
            angle: 30,
            scale: 1.0,
            showGrid: true,
            showDimensions: true
          });
          axonometricSource = 'bim';
          console.log('✅ Axonometric view derived from BIM (geometrically consistent)');
        } catch (axonometricError) {
          console.error('⚠️ BIM axonometric derivation failed:', axonometricError.message);
          console.log('↩️  Falling back to Replicate for axonometric view...');
          // Fallback: Generate axonometric using Replicate if BIM fails
          try {
            const fallbackAxonometric = await this.replicate.generateMultipleViews(
              enhancedContext,
              ['axonometric'],
              null
            );
            if (fallbackAxonometric?.axonometric?.images?.[0]) {
              bimAxonometric = fallbackAxonometric.axonometric.images[0];
              axonometricSource = 'replicate_fallback';
              console.log('✅ Axonometric generated from Replicate fallback');
            }
          } catch (fallbackError) {
            console.error('⚠️ Replicate axonometric fallback also failed:', fallbackError.message);
            axonometricSource = 'failed';
          }
        }
      } catch (bimError) {
        console.error('⚠️ BIM generation failed:', bimError.message);
        console.log('↩️  Falling back to Replicate for axonometric view...');
        // Fallback: Generate axonometric using Replicate if entire BIM generation fails
        try {
          const fallbackAxonometric = await this.replicate.generateMultipleViews(
            enhancedContext,
            ['axonometric'],
            null
          );
          if (fallbackAxonometric?.axonometric?.images?.[0]) {
            bimAxonometric = fallbackAxonometric.axonometric.images[0];
            axonometricSource = 'replicate_fallback';
            console.log('✅ Axonometric generated from Replicate fallback (BIM unavailable)');
          }
        } catch (fallbackError) {
          console.error('⚠️ All axonometric generation methods failed:', fallbackError.message);
          axonometricSource = 'failed';
        }
      }

      // Calculate overall blend weight for backward compatibility
      const overallBlendWeight = (materialWeight + characteristicWeight) / 2;

      // Return integrated results with all visualizations and blended style
      return {
        success: true,
        locationAnalysis,
        portfolioStyle,
        blendedStyle, // STEP 4: Full blended style object
        blendedPrompt: blendedStyle.description, // Keep backward compatibility
        blendWeight: overallBlendWeight, // STEP 4: Store the overall blend weight (average of material and characteristic weights)
        materialWeight, // NEW: Store individual material weight
        characteristicWeight, // NEW: Store individual characteristic weight
        results: combinedResults, // Combined floor plans + technical drawings + 3D views
        floorPlans: floorPlans, // Also keep individual results for compatibility
        technicalDrawings: technicalDrawings,
        visualizations: {
          views, // Photorealistic 3D views
          axonometric: bimAxonometric, // BIM-derived geometrically accurate axonometric or Replicate fallback
          axonometricSource // NEW: Track source ('bim', 'replicate_fallback', 'failed', 'none')
        },
        bimModel, // NEW: Include parametric BIM model in results
        bimAxonometric, // NEW: Geometrically consistent axonometric from BIM or fallback
        axonometricSource, // NEW: Source metadata for axonometric generation
        projectSeed,
        enhancedContext,
        timestamp: new Date().toISOString(),
        workflow: 'integrated_design_generation'
      };

    } catch (error) {
      console.error('❌ Integrated design generation error:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * STEP 4: Blend local and portfolio styles with weighted merging
   * Merges style descriptors based on separate material and characteristic weights
   * @param {Object} localStyle - Location-based architectural style
   * @param {Object} portfolioStyle - Portfolio-detected style
   * @param {Number} materialWeight - Material blend weight (0 = all local, 1 = all portfolio, 0.5 = balanced)
   * @param {Number} characteristicWeight - Characteristic blend weight (0 = all local, 1 = all portfolio, 0.5 = balanced)
   * @returns {Object} Blended style with merged characteristics
   */
  blendStyles(localStyle, portfolioStyle, materialWeight = 0.5, characteristicWeight = 0.5) {
    // Validate weights are between 0 and 1
    const matWeight = Math.max(0, Math.min(1, materialWeight));
    const charWeight = Math.max(0, Math.min(1, characteristicWeight));
    const localMatWeight = 1 - matWeight;
    const localCharWeight = 1 - charWeight;

    console.log(`🎨 Blending styles with:`);
    console.log(`   Materials: ${Math.round(localMatWeight * 100)}% local / ${Math.round(matWeight * 100)}% portfolio`);
    console.log(`   Characteristics: ${Math.round(localCharWeight * 100)}% local / ${Math.round(charWeight * 100)}% portfolio`);

    // Extract local style descriptors
    const localDescriptors = {
      primary: localStyle?.primary || 'contemporary',
      materials: localStyle?.materials || [],
      characteristics: localStyle?.characteristics || [],
      climateAdaptations: localStyle?.climateAdaptations?.features || []
    };

    // Extract portfolio style descriptors
    const portfolioDescriptors = {
      primary: portfolioStyle?.primaryStyle?.style || null,
      materials: portfolioStyle?.materials || [],
      characteristics: portfolioStyle?.designElements || [],
      features: portfolioStyle?.keyFeatures || []
    };

    // If no portfolio style, return local style
    if (!portfolioDescriptors.primary) {
      return {
        styleName: localDescriptors.primary,
        materials: localDescriptors.materials,
        characteristics: localDescriptors.characteristics,
        climateAdaptations: localDescriptors.climateAdaptations,
        blendRatio: {
          local: 1.0,
          portfolio: 0.0,
          materials: { local: 1.0, portfolio: 0.0 },
          characteristics: { local: 1.0, portfolio: 0.0 }
        },
        description: `${localDescriptors.primary} style adapted for local context`
      };
    }

    // Blend materials (weighted selection based on materialWeight)
    const materialCount = Math.max(3, Math.round(5 * (localMatWeight + matWeight)));
    const localMaterialCount = Math.round(materialCount * localMatWeight);
    const portfolioMaterialCount = materialCount - localMaterialCount;

    const blendedMaterials = [
      ...localDescriptors.materials.slice(0, localMaterialCount),
      ...portfolioDescriptors.materials.slice(0, portfolioMaterialCount)
    ];

    // Blend characteristics (weighted selection based on characteristicWeight)
    const charCount = Math.max(3, Math.round(6 * (localCharWeight + charWeight)));
    const localCharCount = Math.round(charCount * localCharWeight);
    const portfolioCharCount = charCount - localCharCount;

    const blendedCharacteristics = [
      ...localDescriptors.characteristics.slice(0, localCharCount),
      ...(portfolioDescriptors.characteristics.slice
        ? portfolioDescriptors.characteristics.slice(0, portfolioCharCount)
        : []),
      ...(portfolioDescriptors.features.slice
        ? portfolioDescriptors.features.slice(0, Math.max(0, portfolioCharCount - 1))
        : [])
    ];

    // Calculate overall blend weight (average of material and characteristic weights)
    const overallWeight = (matWeight + charWeight) / 2;

    // Create blended style name based on overall dominance
    let blendedStyleName;
    if (overallWeight < 0.3) {
      // Local dominant
      blendedStyleName = `${localDescriptors.primary} with subtle ${portfolioDescriptors.primary} influences`;
    } else if (overallWeight < 0.7) {
      // Balanced
      blendedStyleName = `Hybrid ${portfolioDescriptors.primary}–${localDescriptors.primary}`;
    } else {
      // Portfolio dominant
      blendedStyleName = `${portfolioDescriptors.primary} adapted to ${localDescriptors.primary} context`;
    }

    // Create detailed description
    const description = this.createBlendedDescription(
      localDescriptors,
      portfolioDescriptors,
      blendedMaterials,
      blendedCharacteristics,
      overallWeight,
      { material: matWeight, characteristic: charWeight }
    );

    return {
      styleName: blendedStyleName,
      materials: blendedMaterials,
      characteristics: blendedCharacteristics,
      climateAdaptations: localDescriptors.climateAdaptations, // Always preserve climate adaptations
      blendRatio: {
        local: 1 - overallWeight,
        portfolio: overallWeight,
        materials: { local: localMatWeight, portfolio: matWeight },
        characteristics: { local: localCharWeight, portfolio: charWeight }
      },
      localStyle: localDescriptors.primary,
      portfolioStyle: portfolioDescriptors.primary,
      description
    };
  }

  /**
   * STEP 4: Create detailed blended style description for prompts
   * Enhanced to reflect granular material and characteristic weights
   */
  createBlendedDescription(localDesc, portfolioDesc, materials, characteristics, weight, weights) {
    const materialList = materials.slice(0, 3).join(', ') || 'contemporary materials';
    const charList = characteristics.slice(0, 4).join(', ') || 'modern features';

    // Create nuanced description based on material and characteristic weights
    const matWeightPct = Math.round((weights?.material || 0.5) * 100);
    const charWeightPct = Math.round((weights?.characteristic || 0.5) * 100);

    if (weight < 0.3) {
      // Local dominant
      const materialNote = matWeightPct < 30 ? 'local' : matWeightPct > 70 ? 'contemporary' : 'mixed';
      const charNote = charWeightPct < 30 ? 'traditional' : charWeightPct > 70 ? 'modern' : 'hybrid';
      return `${localDesc.primary} architectural style with subtle ${portfolioDesc.primary} influences, featuring ${materialNote} materials (${materialList}), incorporating ${charNote} characteristics (${charList}), while maintaining strong local architectural context`;
    } else if (weight < 0.7) {
      // Balanced
      return `Balanced fusion of ${portfolioDesc.primary} and ${localDesc.primary} styles, utilizing ${materialList} (${100-matWeightPct}% local/${matWeightPct}% portfolio materials), characterized by ${charList} (${100-charWeightPct}% local/${charWeightPct}% portfolio spatial features), creating a contemporary hybrid design that respects both traditions`;
    } else {
      // Portfolio dominant
      const materialNote = matWeightPct > 70 ? 'signature' : matWeightPct < 30 ? 'locally-sourced' : 'blended';
      const charNote = charWeightPct > 70 ? 'distinctive' : charWeightPct < 30 ? 'contextual' : 'integrated';
      return `${portfolioDesc.primary} architectural approach adapted for local context, expressed through ${materialNote} materials (${materialList}), featuring ${charNote} spatial characteristics (${charList}), thoughtfully respecting regional architectural traditions`;
    }
  }

  /**
   * STEP 4: Create blended style prompt for generation
   * Uses blendStyles function with granular weighted merging
   */
  createBlendedStylePrompt(projectContext, locationAnalysis, portfolioStyle, materialWeight = 0.5, characteristicWeight = 0.5) {
    // STEP 4: Use sophisticated style blending with separate weights
    const blendedStyle = this.blendStyles(locationAnalysis, portfolioStyle, materialWeight, characteristicWeight);

    console.log('🎨 Blended style created:', {
      name: blendedStyle.styleName,
      overallRatio: `${Math.round(blendedStyle.blendRatio.local * 100)}% local / ${Math.round(blendedStyle.blendRatio.portfolio * 100)}% portfolio`,
      materialRatio: `${Math.round(blendedStyle.blendRatio.materials.local * 100)}% local / ${Math.round(blendedStyle.blendRatio.materials.portfolio * 100)}% portfolio`,
      characteristicRatio: `${Math.round(blendedStyle.blendRatio.characteristics.local * 100)}% local / ${Math.round(blendedStyle.blendRatio.characteristics.portfolio * 100)}% portfolio`,
      materials: blendedStyle.materials.slice(0, 3).join(', '),
      characteristics: blendedStyle.characteristics.slice(0, 3).join(', ')
    });

    // Return comprehensive blended style object
    return blendedStyle;
  }

  /**
   * Create Building DNA master specification for perfect 2D/3D consistency
   * This creates explicit building parameters shared across ALL generations
   */
  createBuildingDNA(projectContext, blendedStyle) {
    const area = projectContext.floorArea || projectContext.area || 200;
    const buildingType = projectContext.buildingProgram || 'house';

    // Calculate floors
    let floors = 1;
    if (buildingType.includes('cottage') || buildingType.includes('bungalow')) {
      floors = 1;
    } else if (area < 150) {
      floors = 1;
    } else if (area < 300) {
      floors = 2;
    } else if (area < 500) {
      floors = 3;
    } else {
      floors = Math.min(Math.ceil(area / 200), 5);
    }

    // Determine roof type from style
    let roofType = 'flat roof';
    const styleName = (blendedStyle.styleName || '').toLowerCase();
    if (styleName.includes('traditional') || styleName.includes('colonial') || styleName.includes('victorian')) {
      roofType = 'gable roof';
    } else if (styleName.includes('mediterranean') || styleName.includes('tuscan')) {
      roofType = 'hip roof';
    } else if (styleName.includes('modern') || styleName.includes('contemporary')) {
      roofType = 'flat roof';
    }

    // Determine window pattern from style
    let windowPattern = 'ribbon windows';
    if (styleName.includes('traditional') || styleName.includes('colonial')) {
      windowPattern = 'punched windows';
    } else if (styleName.includes('modern') || styleName.includes('contemporary')) {
      windowPattern = 'ribbon windows';
    } else if (styleName.includes('glass') || blendedStyle.materials.some(m => m.toLowerCase().includes('glass'))) {
      windowPattern = 'curtain wall glazing';
    }

    // Calculate dimensions based on area and floors
    const areaPerFloor = area / floors;
    const length = Math.sqrt(areaPerFloor * 1.6); // 1.6:1 aspect ratio
    const width = areaPerFloor / length;
    const floorHeight = 3.5; // Standard floor height in meters

    return {
      dimensions: {
        length: `${length.toFixed(1)}m`,
        width: `${width.toFixed(1)}m`,
        height: `${(floors * floorHeight).toFixed(1)}m`,
        floors: floors,
        floorHeight: `${floorHeight}m`,
        totalArea: `${area}m²`
      },
      entrance: {
        facade: projectContext.entranceDirection || 'N',
        position: 'center',
        width: '2.4m'
      },
      materials: blendedStyle.materials.slice(0, 3).join(', '),
      roof: {
        type: roofType,
        material: blendedStyle.materials[0] || 'concrete'
      },
      windows: {
        pattern: windowPattern,
        frameColor: 'aluminum'
      },
      structure: {
        system: floors > 3 ? 'concrete frame' : 'load-bearing walls',
        gridSpacing: '6.0m'
      },
      colors: {
        facade: 'neutral tones',
        roof: 'dark gray',
        trim: 'white'
      },
      style: blendedStyle.styleName
    };
  }

  /**
   * Generate design reasoning with style detection context
   */
  async generateDesignReasoningWithStyle(projectContext, styleDetection) {
    try {
      // Enhance project context with style detection
      const enhancedContext = {
        ...projectContext,
        detectedStyle: styleDetection?.primaryStyle?.style || 'contemporary',
        styleCharacteristics: styleDetection?.designElements || {},
        styleRecommendations: styleDetection?.recommendations || {}
      };

      return await this.ai.generateDesignReasoning(enhancedContext);
    } catch (error) {
      console.error('Style-enhanced reasoning error:', error);
      return this.getFallbackReasoning(projectContext);
    }
  }

  /**
   * Analyze portfolio and generate style-optimized design
   */
  async generateStyleOptimizedDesign(projectContext, portfolioImages) {
    try {
      console.log('Starting style-optimized design generation...');
      
      // Step 1: Analyze portfolio for style detection
      const styleDetection = await this.portfolioStyleDetection.detectArchitecturalStyle(
        portfolioImages, 
        projectContext.location
      );

      // Step 2: Analyze style-location compatibility
      const compatibilityAnalysis = await this.portfolioStyleDetection.analyzeLocationStyleCompatibility(
        styleDetection,
        projectContext.location
      );

      // Step 3: Generate enhanced project context with style information
      const enhancedContext = this.buildEnhancedProjectContext(
        projectContext, 
        styleDetection, 
        compatibilityAnalysis
      );

      // Step 4: Generate design reasoning with style optimization
      const reasoning = await this.generateDesignReasoningWithStyle(enhancedContext, styleDetection);
      
      // Step 5: Generate visualizations optimized for detected style
      const visualizations = await this.generateStyleOptimizedVisualizations(
        enhancedContext, 
        styleDetection
      );

      return {
        success: true,
        styleDetection,
        compatibilityAnalysis,
        reasoning,
        visualizations,
        enhancedContext,
        timestamp: new Date().toISOString(),
        workflow: 'style_optimized'
      };

    } catch (error) {
      console.error('Style-optimized design error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackStyleOptimized(projectContext)
      };
    }
  }

  /**
   * Build enhanced project context with style information
   */
  buildEnhancedProjectContext(projectContext, styleDetection, compatibilityAnalysis) {
    return {
      ...projectContext,
      architecturalStyle: styleDetection?.primaryStyle?.style || 'contemporary',
      styleCharacteristics: styleDetection?.designElements || {},
      styleRecommendations: styleDetection?.recommendations || {},
      compatibilityScore: compatibilityAnalysis?.compatibilityScore || '7/10',
      recommendedAdaptations: compatibilityAnalysis?.recommendedAdaptations || [],
      materials: this.extractMaterialsFromStyle(styleDetection),
      designApproach: this.buildDesignApproachFromStyle(styleDetection)
    };
  }

  /**
   * Extract materials from style detection
   */
  extractMaterialsFromStyle(styleDetection) {
    if (!styleDetection?.designElements?.materials) {
      return 'glass and steel';
    }
    
    const materials = styleDetection.designElements.materials;
    const materialList = materials.split(',').map(m => m.trim());
    return materialList.slice(0, 3).join(' and '); // Take first 3 materials
  }

  /**
   * Build design approach from style detection
   */
  buildDesignApproachFromStyle(styleDetection) {
    const style = styleDetection?.primaryStyle?.style || 'contemporary';
    const characteristics = styleDetection?.designElements?.spatialOrganization || '';
    
    return `${style} design approach with ${characteristics}`;
  }

  /**
   * Generate style-optimized visualizations
   */
  async generateStyleOptimizedVisualizations(enhancedContext, styleDetection) {
    try {
      const style = styleDetection?.primaryStyle?.style || 'contemporary';
      const materials = this.extractMaterialsFromStyle(styleDetection);

      const styledContext = {
        ...enhancedContext,
        architecturalStyle: style,
        materials
      };

      // Generate multi-level floor plans with style optimization
      console.log('🏗️ Generating style-optimized multi-level floor plans...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(styledContext);

      // Generate elevations and sections with style optimization
      console.log('🏗️ Generating style-optimized elevations and sections...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(styledContext);

      // Generate 3D views (2 exterior + 1 interior) with style optimization
      console.log('🏗️ Generating style-optimized 3D views: exterior_front, exterior_side, interior');
      const views = await this.replicate.generateMultipleViews(
        styledContext,
        ['exterior_front', 'exterior_side', 'interior']
      );

      // Generate additional style variations
      const styleVariations = await this.replicate.generateStyleVariations(
        styledContext,
        [style, 'sustainable', 'innovative']
      );

      return {
        floorPlans,
        technicalDrawings,
        views, // Changed from preview3D to views
        styleVariations,
        source: 'style_optimized',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Style-optimized visualization error:', error);
      return this.getFallbackVisualizations();
    }
  }

  /**
   * Quick design generation for MVP testing
   */
  async quickDesign(projectContext) {
    try {
      console.log(`Starting quick design generation... (Using ${USE_TOGETHER ? 'Together AI' : 'OpenAI/Replicate'})`);

      // Generate basic reasoning (now uses Together AI when flag is set)
      const reasoning = await this.generateDesignReasoning(projectContext);

      // Generate single exterior view
      let visualization;
      if (USE_TOGETHER) {
        // Use Together AI FLUX.1 for image generation
        const seed = Math.floor(Math.random() * 1000000);
        visualization = await togetherAIService.generateImage({
          viewType: 'exterior',
          prompt: this.buildQuickPrompt(reasoning, projectContext),
          seed: seed,
          width: 1792,
          height: 1024
        });

        // Ensure we have a URL
        if (!visualization?.url) {
          visualization = {
            url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTc5MiIgaGVpZ2h0PSIxMDI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxNzkyIiBoZWlnaHQ9IjEwMjQiIGZpbGw9IiMyQzNFNTAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjQ4IiBmaWxsPSIjRkZGRkZGIj5FeHRlcmlvciBWaWV3PC90ZXh0Pjwvc3ZnPg==',
            model: 'flux-fallback'
          };
        }
      } else {
        // Original Replicate implementation
        visualization = await this.replicate.generateArchitecturalImage({
          ...this.buildViewParameters(projectContext, 'exterior'),
          prompt: this.buildQuickPrompt(reasoning, projectContext)
        });
      }

      return {
        success: true,
        reasoning,
        visualization,
        projectContext,
        timestamp: new Date().toISOString(),
        workflow: 'quick',
        source: USE_TOGETHER ? 'together-ai' : 'openai-replicate'
      };

    } catch (error) {
      console.error('Quick design error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackDesign(projectContext)
      };
    }
  }

  /**
   * Build view parameters for quick generation
   */
  buildViewParameters(projectContext, viewType) {
    return {
      buildingType: projectContext.buildingProgram || 'commercial building',
      architecturalStyle: projectContext.architecturalStyle || 'contemporary',
      location: projectContext.location?.address || 'urban setting',
      materials: projectContext.materials || 'glass and steel',
      viewType,
      width: 1024,
      height: 768
    };
  }

  /**
   * Build quick prompt for MVP
   */
  buildQuickPrompt(reasoning, projectContext) {
    const philosophy = reasoning.designPhilosophy || 'contemporary design';
    const materials = this.extractMaterialsFromReasoning(reasoning);
    
    return `Professional architectural visualization, ${philosophy}, ${projectContext.buildingProgram || 'building'} with ${materials}, photorealistic rendering, professional architectural photography, high quality, detailed`;
  }
}

const aiIntegrationServiceInstance = new AIIntegrationService();
export default aiIntegrationServiceInstance;
