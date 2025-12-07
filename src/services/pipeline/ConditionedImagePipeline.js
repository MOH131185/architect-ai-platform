/**
 * Conditioned Image Pipeline
 *
 * Unified pipeline for generating architecture images with:
 * - Geometry conditioning (depth/edge maps from BuildingModel)
 * - StyleProfile integration (materials, colors, atmosphere)
 * - Consistent seed across all views
 *
 * Flow:
 * 1. CanonicalDesignState → BuildingModel → GeometryConditioner
 * 2. Location + Portfolio → StyleProfile → Style Descriptors
 * 3. DNA + Style + Conditioning → Enhanced Prompts → FLUX Generation
 *
 * @module services/pipeline/ConditionedImagePipeline
 */

import { createBuildingModel } from '../../geometry/BuildingModel.js';
import { generateAllConditions, CONDITIONING_TYPES } from '../../geometry/GeometryConditioner.js';
import { createStyleProfile, generateStyleDescriptors } from '../../types/StyleProfile.js';
import logger from '../core/logger.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * View types for the A1 sheet
 */
export const A1_VIEW_TYPES = {
  // 3D Views
  HERO_EXTERIOR: 'hero_exterior',
  AXONOMETRIC: 'axonometric',
  INTERIOR_3D: 'interior_3d',

  // 2D Technical
  FLOOR_PLAN_GROUND: 'floor_plan_ground',
  FLOOR_PLAN_FIRST: 'floor_plan_first',
  ELEVATION_NORTH: 'elevation_north',
  ELEVATION_SOUTH: 'elevation_south',
  ELEVATION_EAST: 'elevation_east',
  ELEVATION_WEST: 'elevation_west',
  SECTION_AA: 'section_aa',
  SECTION_BB: 'section_bb',

  // Diagrams
  SITE_PLAN: 'site_plan',
  SUN_DIAGRAM: 'sun_diagram',
};

/**
 * View configuration with conditioning strengths
 */
const VIEW_CONFIG = {
  [A1_VIEW_TYPES.HERO_EXTERIOR]: {
    is3D: true,
    conditioningType: CONDITIONING_TYPES.SILHOUETTE,
    conditioningStrength: 0.45, // Raised for better massing/silhouette match to elevations
    width: 1536,
    height: 1024,
    steps: 48,
    guidanceScale: 5.8,
  },
  [A1_VIEW_TYPES.AXONOMETRIC]: {
    is3D: true,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.55, // Raised for better structural consistency
    width: 1024,
    height: 1024,
    steps: 40,
    guidanceScale: 5.0,
  },
  [A1_VIEW_TYPES.INTERIOR_3D]: {
    is3D: true,
    conditioningType: CONDITIONING_TYPES.DEPTH, // Changed to DEPTH for room perspective
    conditioningStrength: 0.4, // Raised for room layout consistency
    width: 1280,
    height: 960,
    steps: 48,
    guidanceScale: 5.8,
  },
  [A1_VIEW_TYPES.FLOOR_PLAN_GROUND]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.7,
    width: 1024,
    height: 1024,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.FLOOR_PLAN_FIRST]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.7,
    width: 1024,
    height: 1024,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.ELEVATION_NORTH]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.6,
    width: 1280,
    height: 720,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.ELEVATION_SOUTH]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.6,
    width: 1280,
    height: 720,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.ELEVATION_EAST]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.6,
    width: 1280,
    height: 720,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.ELEVATION_WEST]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.6,
    width: 1280,
    height: 720,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.SECTION_AA]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.65,
    width: 1280,
    height: 720,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.SECTION_BB]: {
    is3D: false,
    conditioningType: CONDITIONING_TYPES.EDGE,
    conditioningStrength: 0.65,
    width: 1280,
    height: 720,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.SITE_PLAN]: {
    is3D: false,
    conditioningType: null, // No conditioning for site plan
    conditioningStrength: 0,
    width: 800,
    height: 800,
    steps: 4,
    guidanceScale: 7.5,
  },
  [A1_VIEW_TYPES.SUN_DIAGRAM]: {
    is3D: false,
    conditioningType: null,
    conditioningStrength: 0,
    width: 512,
    height: 512,
    steps: 4,
    guidanceScale: 7.5,
  },
};

// =============================================================================
// PIPELINE STATE
// =============================================================================

/**
 * Pipeline state for tracking generation
 */
class PipelineState {
  constructor(designId, seed) {
    this.designId = designId;
    this.seed = seed;
    this.model = null;
    this.styleProfile = null;
    this.conditions = {};
    this.generatedViews = {};
    this.startTime = Date.now();
    this.errors = [];
  }

  setModel(model) {
    this.model = model;
  }

  setStyleProfile(profile) {
    this.styleProfile = profile;
  }

  setConditions(conditions) {
    this.conditions = conditions;
  }

  addGeneratedView(viewType, result) {
    this.generatedViews[viewType] = result;
  }

  addError(error) {
    this.errors.push(error);
  }

  getElapsedMs() {
    return Date.now() - this.startTime;
  }
}

// =============================================================================
// MAIN PIPELINE FUNCTIONS
// =============================================================================

/**
 * Initialize pipeline with design state and style info
 *
 * @param {Object} canonicalState - CanonicalDesignState
 * @param {Object} options - Pipeline options
 * @returns {Object} Initialized pipeline state
 */
export function initializePipeline(canonicalState, options = {}) {
  const {
    locationData,
    portfolioStyle,
    blendWeights,
    seed = Math.floor(Math.random() * 1e6),
  } = options;

  const designId = canonicalState?.meta?.designId || `design_${Date.now()}`;

  logger.info('[ConditionedImagePipeline] Initializing pipeline', { designId, seed });

  const state = new PipelineState(designId, seed);

  // Step 1: Build geometry model
  try {
    const model = createBuildingModel(canonicalState);
    state.setModel(model);
    logger.info('[ConditionedImagePipeline] BuildingModel created', {
      floors: model.floors.length,
      dimensions: model.getDimensionsMeters(),
    });
  } catch (error) {
    logger.error('[ConditionedImagePipeline] Failed to create BuildingModel', error);
    state.addError({ stage: 'model', error: error.message });
  }

  // Step 2: Create style profile
  try {
    const styleProfile = createStyleProfile({
      locationStyle: extractLocationStyle(locationData),
      portfolioStyle: portfolioStyle,
      blendWeights: blendWeights,
      buildingType: canonicalState?.program?.buildingType || 'residential',
    });
    state.setStyleProfile(styleProfile);
    logger.info('[ConditionedImagePipeline] StyleProfile created', {
      archetype: styleProfile.archetype,
      roofType: styleProfile.roof?.type,
    });
  } catch (error) {
    logger.error('[ConditionedImagePipeline] Failed to create StyleProfile', error);
    state.addError({ stage: 'style', error: error.message });
  }

  // Step 3: Generate all conditioning images
  if (state.model) {
    try {
      const conditions = generateAllConditions(state.model, {
        conditioningType: CONDITIONING_TYPES.EDGE,
      });
      state.setConditions(conditions);
      logger.info('[ConditionedImagePipeline] Conditioning images generated', {
        count: Object.keys(conditions).length,
      });
    } catch (error) {
      logger.error('[ConditionedImagePipeline] Failed to generate conditions', error);
      state.addError({ stage: 'conditioning', error: error.message });
    }
  }

  return state;
}

/**
 * Build enhanced prompt for a view type
 *
 * @param {string} viewType - View type
 * @param {Object} canonicalState - Design state
 * @param {Object} styleProfile - Style profile
 * @param {Object} baseDNA - Base DNA for the view
 * @returns {string} Enhanced prompt
 */
export function buildEnhancedPrompt(viewType, canonicalState, styleProfile, baseDNA = {}) {
  const styleDescriptors = styleProfile
    ? generateStyleDescriptors(styleProfile)
    : { exteriorPrompt: '', interiorPrompt: '', technicalPrompt: '' };

  const viewConfig = VIEW_CONFIG[viewType] || {};
  const is3D = viewConfig.is3D;

  // Extract dimensions from DNA (prefixed with _ as reserved for future use)
  const dims = baseDNA?.dimensions || canonicalState?.massing || {};
  const _length = dims.length || dims.lengthM || 15;
  const _width = dims.width || dims.widthM || 10;
  const _height = dims.height || dims.totalHeightM || 7;

  // Build base prompt
  let prompt = '';

  if (viewType === A1_VIEW_TYPES.HERO_EXTERIOR) {
    prompt = buildHeroExteriorPrompt(styleDescriptors, dims, styleProfile);
  } else if (viewType === A1_VIEW_TYPES.AXONOMETRIC) {
    prompt = buildAxonometricPrompt(styleDescriptors, dims, styleProfile);
  } else if (viewType === A1_VIEW_TYPES.INTERIOR_3D) {
    prompt = buildInteriorPrompt(styleDescriptors, styleProfile);
  } else if (viewType.includes('floor_plan')) {
    prompt = buildFloorPlanPrompt(viewType, canonicalState, styleProfile, dims);
  } else if (viewType.includes('elevation')) {
    prompt = buildElevationPrompt(viewType, canonicalState, styleProfile, dims);
  } else if (viewType.includes('section')) {
    prompt = buildSectionPrompt(viewType, canonicalState, styleProfile, dims);
  } else {
    prompt = baseDNA?.prompt || 'Architectural visualization';
  }

  // Add quality suffixes
  prompt += is3D
    ? ', photorealistic, 8K resolution, architectural photography'
    : ', clean architectural drawing, technical illustration, precise lines';

  return prompt;
}

/**
 * Build hero exterior prompt
 */
function buildHeroExteriorPrompt(styleDescriptors, dims, styleProfile) {
  const materials = styleProfile?.materialPalette || {};
  const atmosphere = styleProfile?.atmosphere || {};

  return (
    `Award-winning ${styleProfile?.archetype || 'contemporary'} residential architecture exterior, ` +
    `${materials.primaryWall?.name || 'brick'} walls (${materials.primaryWall?.hexColor || '#8B4513'}), ` +
    `${styleProfile?.roof?.type || 'pitched'} ${materials.roof?.name || 'slate'} roof, ` +
    `${materials.windows?.name || 'white'} windows, ` +
    `building dimensions ${dims.length}m x ${dims.width}m x ${dims.height}m, ` +
    `${atmosphere.lighting || 'golden hour lighting'}, ${atmosphere.mood || 'welcoming'}, ` +
    `${atmosphere.setting || 'landscaped garden'}, ` +
    `professional architectural photography, Dezeen magazine quality`
  );
}

/**
 * Build axonometric prompt
 */
function buildAxonometricPrompt(styleDescriptors, dims, styleProfile) {
  return (
    `Axonometric architectural diagram, ` +
    `${styleProfile?.archetype || 'contemporary'} building, ` +
    `${dims.length}m x ${dims.width}m footprint, ${dims.height}m height, ` +
    `${styleProfile?.roof?.type || 'pitched'} roof at ${styleProfile?.roof?.pitch || 35}° pitch, ` +
    `clean white background, technical visualization, isometric projection, ` +
    `showing all four facades, no perspective distortion`
  );
}

/**
 * Build interior prompt
 */
function buildInteriorPrompt(styleDescriptors, styleProfile) {
  return (
    `${styleProfile?.archetype || 'contemporary'} interior architecture, ` +
    `${styleDescriptors.interiorPrompt || 'modern living space'}, ` +
    `high ceilings, large windows, natural light, ` +
    `interior design photography, Architectural Digest quality`
  );
}

/**
 * Build floor plan prompt
 */
function buildFloorPlanPrompt(viewType, canonicalState, styleProfile, dims) {
  const floorIndex = viewType.includes('first') ? 1 : 0;
  const floorName = floorIndex === 0 ? 'Ground Floor' : 'First Floor';

  // Extract rooms for this floor
  const level = canonicalState?.program?.levels?.[floorIndex];
  const roomList = level?.rooms?.map((r) => r.name).join(', ') || 'living room, kitchen, bedroom';

  return (
    `Professional architectural floor plan, ${floorName}, ` +
    `TRUE OVERHEAD ORTHOGRAPHIC view, NO perspective, NO 3D, ` +
    `building footprint ${dims.length}m x ${dims.width}m, ` +
    `rooms: ${roomList}, ` +
    `dimension lines, room labels with areas, door swings, ` +
    `clean technical drawing style, white background, ` +
    `professional CAD quality, RIBA drawing standards`
  );
}

/**
 * Build elevation prompt
 */
function buildElevationPrompt(viewType, canonicalState, styleProfile, dims) {
  const orientation = viewType.includes('north')
    ? 'NORTH'
    : viewType.includes('south')
      ? 'SOUTH'
      : viewType.includes('east')
        ? 'EAST'
        : 'WEST';

  const materials = styleProfile?.materialPalette || {};

  return (
    `Professional architectural elevation, ${orientation} facade, ` +
    `FLAT ORTHOGRAPHIC projection, NO perspective, ` +
    `${materials.primaryWall?.name || 'brick'} walls, ` +
    `${styleProfile?.roof?.type || 'pitched'} ${materials.roof?.name || 'slate'} roof, ` +
    `${materials.windows?.name || 'white'} windows, ` +
    `facade width ${['north', 'south'].some((d) => viewType.includes(d)) ? dims.length : dims.width}m, ` +
    `height ${dims.height}m, ` +
    `ground line, floor levels shown, dimension annotations, ` +
    `technical architectural drawing, white background`
  );
}

/**
 * Build section prompt
 */
function buildSectionPrompt(viewType, canonicalState, styleProfile, dims) {
  const sectionType = viewType.includes('aa') ? 'A-A (Longitudinal)' : 'B-B (Transverse)';
  const sectionWidth = viewType.includes('aa') ? dims.length : dims.width;

  return (
    `Professional architectural section, Section ${sectionType}, ` +
    `building cut showing interior structure, ` +
    `section width ${sectionWidth}m, height ${dims.height}m, ` +
    `${canonicalState?.program?.levelCount || 2} floors visible, ` +
    `floor slabs, walls in poche (solid black), ` +
    `${styleProfile?.roof?.type || 'pitched'} roof profile, ` +
    `ground hatch pattern below, foundation detail, ` +
    `dimension annotations, level markers, ` +
    `technical section drawing, white background`
  );
}

/**
 * Get view generation parameters
 *
 * @param {string} viewType - View type
 * @param {Object} pipelineState - Pipeline state
 * @returns {Object} Generation parameters
 */
export function getViewGenerationParams(viewType, pipelineState) {
  const config = VIEW_CONFIG[viewType] || {};
  const conditionKey = mapViewTypeToConditionKey(viewType);
  const condition = conditionKey ? pipelineState.conditions[conditionKey] : null;

  // NEW: Conditioning object format for Phase 4/5 pipeline
  // This is passed directly to togetherAIService.generateArchitecturalImage
  const conditioning = condition
    ? {
        dataUrl: condition.dataUrl,
        type: condition.type || config.conditioningType || 'edge',
        strength: config.conditioningStrength || 0.5,
      }
    : null;

  return {
    viewType,
    seed: pipelineState.seed, // SAME seed for all views
    width: config.width,
    height: config.height,
    steps: config.steps,
    guidanceScale: config.guidanceScale,

    // NEW: Conditioning object (preferred)
    conditioning,

    // Legacy: Keep for backward compatibility
    geometryRender: condition
      ? {
          url: condition.dataUrl,
          type: condition.type,
          model: 'BuildingModel',
        }
      : null,
    geometryStrength: condition ? config.conditioningStrength : 0,

    // Metadata
    is3D: config.is3D,
    conditioningType: config.conditioningType,
  };
}

/**
 * Map view type to conditioning key
 */
function mapViewTypeToConditionKey(viewType) {
  const mapping = {
    [A1_VIEW_TYPES.HERO_EXTERIOR]: 'exterior_3d_corner',
    [A1_VIEW_TYPES.AXONOMETRIC]: 'axonometric',
    [A1_VIEW_TYPES.INTERIOR_3D]: 'interior_3d', // Now has depth-based conditioning
    [A1_VIEW_TYPES.FLOOR_PLAN_GROUND]: 'floor_plan_ground',
    [A1_VIEW_TYPES.FLOOR_PLAN_FIRST]: 'floor_plan_first',
    [A1_VIEW_TYPES.ELEVATION_NORTH]: 'elevation_north',
    [A1_VIEW_TYPES.ELEVATION_SOUTH]: 'elevation_south',
    [A1_VIEW_TYPES.ELEVATION_EAST]: 'elevation_east',
    [A1_VIEW_TYPES.ELEVATION_WEST]: 'elevation_west',
    [A1_VIEW_TYPES.SECTION_AA]: 'section_longitudinal',
    [A1_VIEW_TYPES.SECTION_BB]: 'section_transverse',
  };
  return mapping[viewType];
}

/**
 * Extract location style from location data
 */
function extractLocationStyle(locationData) {
  if (!locationData) {
    return null;
  }

  return {
    region: locationData.region || locationData.address || 'UK',
    vernacularStyle: locationData.recommendedStyle || 'traditional',
    typicalRoofType: locationData.roofType || 'pitched',
    typicalRoofPitch: 35,
    typicalMaterials: locationData.materials || ['brick', 'slate'],
    climate: locationData.climate?.type || 'temperate',
    localCharacteristics: locationData.characteristics || [],
  };
}

/**
 * Generate complete set of views for A1 sheet
 *
 * @param {Object} canonicalState - CanonicalDesignState
 * @param {Object} options - Generation options
 * @param {Function} generateImageFn - Image generation function
 * @returns {Object} Generated views and metadata
 */
export async function generateA1Views(canonicalState, options = {}, generateImageFn) {
  const {
    locationData,
    portfolioStyle,
    blendWeights,
    seed,
    viewsToGenerate = Object.values(A1_VIEW_TYPES),
    onProgress,
  } = options;

  // Initialize pipeline
  const state = initializePipeline(canonicalState, {
    locationData,
    portfolioStyle,
    blendWeights,
    seed,
  });

  const results = {
    designId: state.designId,
    seed: state.seed,
    views: {},
    conditions: {},
    styleProfile: state.styleProfile,
    errors: [],
    metadata: {
      startTime: new Date().toISOString(),
      totalViews: viewsToGenerate.length,
      completedViews: 0,
    },
  };

  // Store conditioning images for reference
  results.conditions = Object.fromEntries(
    Object.entries(state.conditions).map(([key, val]) => [key, val.dataUrl])
  );

  // Generate each view
  for (let i = 0; i < viewsToGenerate.length; i++) {
    const viewType = viewsToGenerate[i];

    try {
      // Build enhanced prompt
      const prompt = buildEnhancedPrompt(
        viewType,
        canonicalState,
        state.styleProfile,
        canonicalState // Pass full state as DNA for now
      );

      // Get generation parameters
      const params = getViewGenerationParams(viewType, state);

      // Report progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: viewsToGenerate.length,
          viewType,
          status: 'generating',
        });
      }

      // Log conditioning status
      if (params.conditioning) {
        logger.info(
          `[ConditionedImagePipeline] Generating ${viewType} with ${params.conditioning.type} conditioning, strength=${params.conditioning.strength}`
        );
      } else {
        logger.info(
          `[ConditionedImagePipeline] Generating ${viewType} (no conditioning available)`
        );
      }

      // Generate image
      if (generateImageFn) {
        const imageResult = await generateImageFn({
          viewType,
          prompt,
          seed: params.seed,
          width: params.width,
          height: params.height,
          // NEW: Pass conditioning object directly (Phase 4/5)
          conditioning: params.conditioning,
          // Legacy: Keep for backward compatibility
          geometryRender: params.geometryRender,
          geometryStrength: params.geometryStrength,
        });

        results.views[viewType] = {
          url: imageResult.url || imageResult.data?.output?.url,
          prompt,
          seed: params.seed,
          conditioning: params.conditioning
            ? {
                type: params.conditioning.type,
                strength: params.conditioning.strength,
                used: true,
              }
            : null,
        };

        logger.info(`[ConditionedImagePipeline] ✓ ${viewType} generated successfully`);
      }

      results.metadata.completedViews++;
    } catch (error) {
      logger.error(`[ConditionedImagePipeline] Failed to generate ${viewType}`, error);
      results.errors.push({
        viewType,
        error: error.message,
      });
    }
  }

  results.metadata.endTime = new Date().toISOString();
  results.metadata.elapsedMs = state.getElapsedMs();

  logger.info('[ConditionedImagePipeline] Generation complete', {
    completed: results.metadata.completedViews,
    total: results.metadata.totalViews,
    elapsedMs: results.metadata.elapsedMs,
  });

  return results;
}

// =============================================================================
// EXPORTS
// =============================================================================

const ConditionedImagePipeline = {
  initializePipeline,
  buildEnhancedPrompt,
  getViewGenerationParams,
  generateA1Views,
  A1_VIEW_TYPES,
  VIEW_CONFIG,
};

export default ConditionedImagePipeline;
