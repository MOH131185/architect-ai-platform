/**
 * Panel Orchestrator
 * 
 * Orchestrates generation of individual panels for Hybrid A1 mode.
 * Generates panels sequentially with paced requests, maintains DNA consistency,
 * and uses deterministic seed derivation.
 */

import dnaPromptGenerator from './dnaPromptGenerator.js';
import { generateArchitecturalImage } from './togetherAIService.js';
import { derivePanelSeed, derivePanelSeeds } from './seedDerivation.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import logger from '../utils/logger.js';

/**
 * Map panel keys to a1TemplateGenerator layout IDs
 */
export const PANEL_KEY_TO_LAYOUT_ID = {
  site: 'site-map',
  plan_ground: 'ground-floor',
  plan_upper: 'first-floor',
  elev_north: 'north-elevation',
  elev_south: 'south-elevation',
  elev_east: 'east-elevation',
  elev_west: 'west-elevation',
  sect_long: 'section-a-a',
  sect_trans: 'section-b-b',
  v_exterior: '3d-hero',
  v_axon: 'axonometric',
  v_interior: 'interior-3d'
};

/**
 * Panel definitions for Hybrid A1 mode
 * Each panel has: key, type, dimensions, and zone mapping
 */
export const PANEL_DEFINITIONS = {
  // 3D Views (PRIORITY 1 - Generate first for establishing massing)
  v_exterior: {
    key: 'v_exterior',
    type: 'exterior_front_3d',
    width: 1500,
    height: 1500,
    zone: 'top3DCluster',
    priority: 1,
    model: 'flux-1-dev' // High quality for hero view
  },
  v_interior: {
    key: 'v_interior',
    type: 'interior_3d',
    width: 1500,
    height: 1500,
    zone: 'top3DCluster',
    priority: 2,
    model: 'flux-1-dev' // High quality for interior
  },
  v_axon: {
    key: 'v_axon',
    type: 'axonometric_3d',
    width: 1500,
    height: 1500,
    zone: 'top3DCluster',
    priority: 3,
    model: 'flux-1-dev' // High quality for axonometric
  },

  // Site Context (PRIORITY 4 - After 3D establishes massing)
  site: {
    key: 'site',
    type: 'site_plan',
    width: 1500,
    height: 1500,
    zone: 'siteClimate',
    priority: 4,
    model: 'flux-1-dev' // High quality for site context
  },

  // Floor Plans (PRIORITY 5 - After 3D and site)
  plan_ground: {
    key: 'plan_ground',
    type: 'floor_plan_ground',
    width: 1500,
    height: 1500,
    zone: 'plansColumn',
    priority: 5,
    model: 'flux-1-schnell' // Fast 2D generation
  },
  plan_upper: {
    key: 'plan_upper',
    type: 'floor_plan_upper',
    width: 1500,
    height: 1500,
    zone: 'plansColumn',
    priority: 6,
    model: 'flux-1-schnell' // Fast 2D generation
  },

  // Elevations (PRIORITY 7-10 - After floor plans)
  elev_north: {
    key: 'elev_north',
    type: 'elevation_north',
    width: 1500,
    height: 1500,
    zone: 'elevationsColumn',
    priority: 7,
    model: 'flux-1-schnell' // Fast 2D generation
  },
  elev_south: {
    key: 'elev_south',
    type: 'elevation_south',
    width: 1500,
    height: 1500,
    zone: 'elevationsColumn',
    priority: 8,
    model: 'flux-1-schnell' // Fast 2D generation
  },
  elev_east: {
    key: 'elev_east',
    type: 'elevation_east',
    width: 1500,
    height: 1500,
    zone: 'elevationsColumn',
    priority: 9,
    model: 'flux-1-schnell' // Fast 2D generation
  },
  elev_west: {
    key: 'elev_west',
    type: 'elevation_west',
    width: 1500,
    height: 1500,
    zone: 'elevationsColumn',
    priority: 10,
    model: 'flux-1-schnell' // Fast 2D generation
  },

  // Sections (PRIORITY 11-12 - After elevations)
  sect_long: {
    key: 'sect_long',
    type: 'section_longitudinal',
    width: 1500,
    height: 1000,
    zone: 'sectionBand',
    priority: 11,
    model: 'flux-1-schnell' // Fast 2D generation
  },
  sect_trans: {
    key: 'sect_trans',
    type: 'section_cross',
    width: 1500,
    height: 1000,
    zone: 'sectionBand',
    priority: 12,
    model: 'flux-1-schnell' // Fast 2D generation
  }
};

/**
 * Get panel list based on project requirements
 * 
 * @param {Object} masterDNA - Master Design DNA
 * @param {Object} projectContext - Project context
 * @returns {Array} Array of panel keys to generate
 */
export function getPanelList(masterDNA, projectContext) {
  const panels = [];

  // Always include site plan
  panels.push('site');

  // Floor plans based on levels
  const numLevels = masterDNA.dimensions?.numLevels || masterDNA.dimensions?.floorCount || 2;
  panels.push('plan_ground');
  if (numLevels > 1) {
    panels.push('plan_upper');
  }

  // Elevations (all 4 or AI-recommended)
  const recommendedElevations = masterDNA.recommendedElevations || ['north', 'south', 'east', 'west'];
  if (recommendedElevations.includes('north')) panels.push('elev_north');
  if (recommendedElevations.includes('south')) panels.push('elev_south');
  if (recommendedElevations.includes('east')) panels.push('elev_east');
  if (recommendedElevations.includes('west')) panels.push('elev_west');

  // Sections (always 2)
  panels.push('sect_long');
  panels.push('sect_trans');

  // 3D views
  panels.push('v_exterior');
  panels.push('v_axon');
  panels.push('v_interior');

  logger.info('Panel list generated', {
    totalPanels: panels.length,
    panels: panels
  });

  return panels;
}

/**
 * Build prompts for all panels
 * 
 * @param {Object} masterDNA - Master Design DNA
 * @param {Object} projectContext - Project context
 * @param {Object} locationData - Location data
 * @param {Object} blendedStyle - Blended style
 * @returns {Object} Map of panelKey -> { prompt, negativePrompt }
 */
export function buildPanelPrompts(masterDNA, projectContext, locationData, blendedStyle) {
  logger.info('Building panel prompts from DNA', null, '📝');

  const prompts = {};
  const generator = new dnaPromptGenerator();

  // Generate all prompts using existing generator
  const allPrompts = generator.generateAllPrompts(masterDNA, projectContext);

  // Map to panel keys
  const promptMap = {
    site: allPrompts.site_plan,
    plan_ground: allPrompts.floor_plan_ground,
    plan_upper: allPrompts.floor_plan_upper || allPrompts.floor_plan_first,
    elev_north: allPrompts.elevation_north,
    elev_south: allPrompts.elevation_south,
    elev_east: allPrompts.elevation_east,
    elev_west: allPrompts.elevation_west,
    sect_long: allPrompts.section_longitudinal,
    sect_trans: allPrompts.section_cross,
    v_exterior: allPrompts.exterior_front_3d,
    v_axon: allPrompts.axonometric_3d,
    v_interior: allPrompts.interior_3d
  };

  // Build prompt objects with negative prompts
  Object.keys(promptMap).forEach(panelKey => {
    const promptText = promptMap[panelKey];
    if (promptText) {
      prompts[panelKey] = {
        prompt: promptText,
        negativePrompt: getNegativePromptForPanel(panelKey)
      };
    }
  });

  logger.info(`Built ${Object.keys(prompts).length} panel prompts`);

  return prompts;
}

/**
 * Get negative prompt for panel type
 */
function getNegativePromptForPanel(panelKey) {
  const baseNegative = '(low quality:1.4), (worst quality:1.4), (blurry:1.3), watermark, signature';

  if (panelKey.startsWith('plan_')) {
    return `${baseNegative}, (perspective:1.5), (3D:1.5), (isometric:1.5), (axonometric:1.5)`;
  }

  if (panelKey.startsWith('elev_')) {
    return `${baseNegative}, (perspective:1.3), (3D:1.3)`;
  }

  if (panelKey.startsWith('sect_')) {
    return `${baseNegative}, photorealistic`;
  }

  if (panelKey.startsWith('v_')) {
    return `${baseNegative}, cartoon, sketch`;
  }

  if (panelKey === 'site') {
    return `${baseNegative}, 3D, perspective`;
  }

  return baseNegative;
}

/**
 * Orchestrate panel generation
 * 
 * @param {Object} params - Generation parameters
 * @param {Object} params.masterDNA - Master Design DNA
 * @param {Object} params.projectContext - Project context
 * @param {Object} params.locationData - Location data
 * @param {Object} params.blendedStyle - Blended style
 * @param {number} params.baseSeed - Base seed for derivation
 * @param {Array} params.panelKeys - Optional: specific panels to generate (default: all)
 * @param {Function} params.onProgress - Optional: progress callback (panelKey, status)
 * @returns {Promise<Object>} { success: boolean, panelMap: {...}, errors: [...] }
 */
export async function orchestratePanelGeneration(params) {
  const {
    masterDNA,
    projectContext,
    locationData,
    blendedStyle,
    baseSeed,
    panelKeys = null,
    onProgress = null
  } = params;

  logger.info('Starting panel orchestration', {
    baseSeed,
    requestedPanels: panelKeys?.length || 'all'
  }, '🎼');

  // Get panel list
  const allPanelKeys = panelKeys || getPanelList(masterDNA, projectContext);

  // Build prompts
  const panelPrompts = buildPanelPrompts(masterDNA, projectContext, locationData, blendedStyle);

  // Derive seeds for all panels
  const seedMap = derivePanelSeeds(baseSeed, allPanelKeys);

  // Generate panels sequentially (paced by RequestQueue)
  const panelMap = {};
  const errors = [];

  // Sort by priority
  const sortedPanels = allPanelKeys
    .map(key => ({ key, def: PANEL_DEFINITIONS[key] }))
    .filter(p => p.def)
    .sort((a, b) => (a.def.priority || 99) - (b.def.priority || 99));

  logger.info(`Generating ${sortedPanels.length} panels sequentially`);

  for (let i = 0; i < sortedPanels.length; i++) {
    const { key, def } = sortedPanels[i];

    if (!panelPrompts[key]) {
      logger.warn(`No prompt found for panel: ${key}`);
      errors.push({ panel: key, error: 'No prompt available' });
      continue;
    }

    const { prompt, negativePrompt } = panelPrompts[key];
    const panelSeed = seedMap[key];

    logger.info(`Generating panel ${i + 1}/${sortedPanels.length}: ${key}`, {
      seed: panelSeed,
      dimensions: `${def.width}×${def.height}`
    });

    if (onProgress) {
      onProgress(key, 'generating');
    }

    try {
      // Use existing generateArchitecturalImage function (paced by RequestQueue)
      const result = await generateArchitecturalImage({
        viewType: def.type,
        designDNA: masterDNA,
        prompt,
        seed: panelSeed,
        width: def.width,
        height: def.height
      });

      panelMap[key] = {
        url: result.url,
        prompt,
        negativePrompt,
        seed: panelSeed,
        meta: {
          width: def.width,
          height: def.height,
          zone: def.zone,
          type: def.type,
          generatedAt: new Date().toISOString()
        }
      };

      logger.success(`Panel ${key} generated successfully`);

      if (onProgress) {
        onProgress(key, 'completed');
      }

    } catch (error) {
      logger.error(`Panel ${key} generation failed`, error);
      errors.push({ panel: key, error: error.message });

      if (onProgress) {
        onProgress(key, 'failed');
      }

      // Continue with other panels (don't fail entire workflow)
    }
  }

  // Retry failed panels once
  if (errors.length > 0) {
    logger.warn(`Attempting retry for ${errors.length} failed panels...`);

    // Create a copy of errors to iterate over
    const failedPanels = [...errors];
    // Clear errors array to repopulate with final failures
    errors.length = 0;

    for (const failure of failedPanels) {
      const key = failure.panel;
      const { def } = sortedPanels.find(p => p.key === key) || {};

      if (!def || !panelPrompts[key]) {
        errors.push(failure); // Cannot retry
        continue;
      }

      const { prompt, negativePrompt } = panelPrompts[key];
      const panelSeed = seedMap[key]; // Reuse same seed for consistency

      logger.info(`Retrying panel: ${key}`, { seed: panelSeed });

      try {
        const result = await generateArchitecturalImage({
          viewType: def.type,
          designDNA: masterDNA,
          prompt,
          seed: panelSeed,
          width: def.width,
          height: def.height
        });

        panelMap[key] = {
          url: result.url,
          prompt,
          negativePrompt,
          seed: panelSeed,
          meta: {
            width: def.width,
            height: def.height,
            zone: def.zone,
            type: def.type,
            generatedAt: new Date().toISOString(),
            retried: true
          }
        };

        logger.success(`✅ Retry successful for ${key}`);

        if (onProgress) {
          onProgress(key, 'completed');
        }

      } catch (retryError) {
        logger.error(`❌ Retry failed for ${key}`, retryError);
        errors.push({ panel: key, error: retryError.message });

        if (onProgress) {
          onProgress(key, 'failed');
        }
      }
    }
  }

  const success = Object.keys(panelMap).length > 0;

  logger.info('Panel orchestration complete', {
    success,
    generated: Object.keys(panelMap).length,
    failed: errors.length,
    total: sortedPanels.length
  });

  return {
    success,
    panelMap,
    errors,
    seedMap // Return seed map for consistency tracking
  };
}

/**
 * Map panel key to layout ID for compositor
 */
export function getLayoutIdForPanel(panelKey) {
  return PANEL_KEY_TO_LAYOUT_ID[panelKey] || panelKey;
}

export default {
  PANEL_DEFINITIONS,
  PANEL_KEY_TO_LAYOUT_ID,
  getPanelList,
  buildPanelPrompts,
  orchestratePanelGeneration,
  getLayoutIdForPanel
};
