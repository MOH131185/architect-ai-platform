/**
 * Panel Generation Service (Phase 1 - Planning + Sequential Generation)
 *
 * Pure service that plans A1 panel jobs and runs them sequentially.
 * Uses specialized prompt builders for each of 14 panel types.
 * 
 * ENHANCED: Now uses structured DNA context for all prompts
 */

import { derivePanelSeed, derivePanelSeeds } from './seedDerivation.js';
import { buildPanelPrompt as buildSpecializedPanelPrompt } from './a1/panelPromptBuilders.js';
import { 
  build3DPanelPrompt, 
  buildPlanPrompt, 
  buildElevationPrompt, 
  buildSectionPrompt,
  buildNegativePrompt as buildStandardNegativePrompt
} from './dnaPromptContext.js';

// Normalized panel resolutions for consistent composition
// 3D panels: 2000×2000 (high quality, square format)
// 2D technical: 1500×1500 (clean lines, square format)
// Diagrams: 1500×1500 (infographics, square format)
const PANEL_CONFIGS = {
  // 3D Views - High resolution for photorealistic quality
  hero_3d: { width: 2000, height: 2000, model: 'flux-1-dev' },
  interior_3d: { width: 2000, height: 2000, model: 'flux-1-dev' },
  site_diagram: { width: 2000, height: 2000, model: 'flux-1-dev' },
  
  // 2D Technical - Standard resolution for clean line work
  floor_plan_ground: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  floor_plan_first: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  floor_plan_level2: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  elevation_north: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  elevation_south: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  elevation_east: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  elevation_west: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  section_AA: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  section_BB: { width: 1500, height: 1500, model: 'flux-1-schnell' },
  
  // Diagrams - Standard resolution for infographics
  material_palette: { width: 1500, height: 1500, model: 'flux-1-dev' },
  climate_card: { width: 1500, height: 1500, model: 'flux-1-dev' }
};

// Panel generation order (PRIORITY ORDER):
// 1. 3D views first (establish massing and materials)
// 2. Site context (establish site relationship)
// 3. Floor plans (establish layout)
// 4. Elevations (establish facades)
// 5. Sections (establish structure)
// 6. Diagrams (establish documentation)
const BASE_PANEL_SEQUENCE = [
  // Priority 1-3: 3D Views (establish massing)
  'hero_3d',
  'interior_3d',
  'site_diagram',
  
  // Priority 4-6: Floor Plans (establish layout)
  'floor_plan_ground',
  'floor_plan_first',
  'floor_plan_level2',
  
  // Priority 7-10: Elevations (establish facades)
  'elevation_north',
  'elevation_south',
  'elevation_east',
  'elevation_west',
  
  // Priority 11-12: Sections (establish structure)
  'section_AA',
  'section_BB',
  
  // Priority 13-14: Diagrams (establish documentation)
  'material_palette',
  'climate_card'
];

function normalizeDimensions(masterDNA = {}) {
  const dims = masterDNA.dimensions || {};
  return {
    length: dims.length || 30,
    width: dims.width || 20,
    height: dims.height || 10,
    floors: dims.floors || dims.floorCount || 2
  };
}

function normalizeMaterials(masterDNA = {}) {
  const materials = masterDNA.materials || [];
  if (Array.isArray(materials) && materials.length > 0) {
    return materials
      .map((m) => (typeof m === 'string' ? m : m.name || m.type || 'material'))
      .slice(0, 4)
      .join(', ');
  }
  return 'stone, glass, timber';
}

function normalizeProgram(programSpaces = []) {
  if (!Array.isArray(programSpaces) || programSpaces.length === 0) {
    return 'lobby, living, kitchen, bedrooms, services';
  }
  return programSpaces
    .map((p) => {
      const name = p.name || p.type || 'space';
      const area = p.area ? `${p.area} sqm` : null;
      return area ? `${name} (${area})` : name;
    })
    .join(', ');
}

function buildPanelPrompt(panelType, context = {}) {
  const { masterDNA, buildingType, entranceOrientation, programSpaces, siteBoundary, climate } = context;
  
  // Use new structured prompt builders for better consistency
  if (panelType === 'hero_3d' || panelType === 'interior_3d' || panelType === 'site_diagram') {
    const additionalContext = panelType === 'hero_3d' 
      ? `Entrance on ${entranceOrientation || 'north'} side. Show building from optimal viewing angle.`
      : panelType === 'interior_3d'
      ? `View from main entrance area. Show ${buildingType || 'residential'} interior spaces.`
      : `Site context with building footprint. Show site boundaries and access.`;
    
    return build3DPanelPrompt(panelType, masterDNA, additionalContext);
  }
  
  if (panelType.includes('floor_plan')) {
    const level = panelType.includes('ground') ? 'ground' 
      : panelType.includes('first') ? 'first'
      : panelType.includes('level2') ? 'second'
      : 'ground';
    
    const additionalContext = `Entrance on ${entranceOrientation || 'north'} side. Building type: ${buildingType || 'residential'}.`;
    return buildPlanPrompt(level, masterDNA, additionalContext);
  }
  
  if (panelType.includes('elevation')) {
    const direction = panelType.includes('north') ? 'north'
      : panelType.includes('south') ? 'south'
      : panelType.includes('east') ? 'east'
      : 'west';
    
    const additionalContext = direction === (entranceOrientation || 'north').toLowerCase()
      ? `This is the MAIN ENTRANCE facade. Show entrance door prominently.`
      : `This facade is different from the entrance side.`;
    
    return buildElevationPrompt(direction, masterDNA, additionalContext);
  }
  
  if (panelType.includes('section')) {
    const sectionType = panelType.includes('AA') ? 'longitudinal' : 'cross';
    return buildSectionPrompt(sectionType, masterDNA, '');
  }
  
  // Fallback to legacy format for material_palette and climate_card
  const style = masterDNA?.architecturalStyle || 'Contemporary';
  const projectType = buildingType || masterDNA?.projectType || 'residential';
  const materials = normalizeMaterials(masterDNA);
  const program = normalizeProgram(programSpaces);
  const dims = normalizeDimensions(masterDNA);
  const entrance = entranceOrientation || 'street-facing';
  const footprint = `${dims.length}m x ${dims.width}m`;
  const height = `${dims.height}m total, ${dims.floors} floors`;

  switch (panelType) {
    case 'hero_3d':
      return [
        `Hero exterior 3D view of a ${projectType} building in ${style} style`,
        `Materials: ${materials}`,
        `Footprint ${footprint}, height ${height}`,
        `Entrance on ${entrance} side, coherent massing, consistent with plans`,
        'High fidelity, natural lighting, no people, single building only',
        'Show surrounding site context lightly without changing building geometry'
      ].join('. ');
    case 'interior_3d':
      return [
        `Interior 3D view of main lobby/living core for ${projectType} in ${style} style`,
        `Materials: ${materials}`,
        `Consistent openings and structure per plans; view aligns with entrance side ${entrance}`,
        'Show furniture layout logically matching program; single building only; no people'
      ].join('. ');
    case 'floor_plan_ground':
      return [
        `Ground floor plan, true orthographic overhead`,
        `Scale 1:100 @ A1, footprint ${footprint}`,
        `Rooms: ${program}`,
        `Entrance on ${entrance} side; align doors/windows to elevations`,
        'Wall thickness ext 0.3m, int 0.15m; clear labels and north arrow'
      ].join('. ');
    case 'floor_plan_first':
      return [
        `First floor plan (Level 1), true orthographic overhead`,
        `Scale 1:100 @ A1, footprint ${footprint}`,
        `Align stairs/shafts with ground floor; bedrooms/private rooms prioritized`,
        `Entrance stack over ${entrance} side; consistent window/door positions`,
        'Wall thickness ext 0.3m, int 0.15m; clear labels and dimensions'
      ].join('. ');
    case 'floor_plan_level2':
      return [
        `Second floor plan (Level 2), true orthographic overhead`,
        `Scale 1:100 @ A1, footprint ${footprint}`,
        `Align vertical cores with lower levels; bedrooms/private or service per program`,
        `Entrance stack over ${entrance} side; window/door positions match elevations`,
        'Wall thickness ext 0.3m, int 0.15m; clear labels and dimensions'
      ].join('. ');
    case 'elevation_north':
    case 'elevation_south':
    case 'elevation_east':
    case 'elevation_west': {
      const dir = panelType.split('_')[1];
      return [
        `${dir.toUpperCase()} elevation, flat orthographic`,
        `Style ${style}, materials: ${materials}`,
        `Show entrance on ${entrance} side where applicable`,
        `Align openings with floor plans; reveal facade articulation and roofline`,
        'No perspective; clean line weights; include grade line'
      ].join('. ');
    }
    case 'section_AA':
      return [
        'Section A-A (longitudinal) cutting through entrance and main circulation',
        `Show floor-to-floor heights (${height}), slab thickness, stairs alignment`,
        `Materials: ${materials}; annotate key levels and roof build-up`,
        'True orthographic, no perspective, clean line weights'
      ].join('. ');
    case 'section_BB':
      return [
        'Section B-B (cross section) cutting perpendicular to A-A',
        `Show structural grid if implied; align openings with elevations`,
        `Heights: ${height}; materials: ${materials}`,
        'True orthographic, no perspective, clear labels for levels'
      ].join('. ');
    case 'site_diagram': {
      const siteDesc = siteBoundary ? 'Use provided site boundary polygon; ' : '';
      return [
        `${siteDesc}Site diagram with north arrow and scale`,
        `Place building footprint ${footprint} oriented to entrance ${entrance}`,
        'Show context roads/blocks lightly; no redesign of building massing',
        'Clear labels: site boundary, setback hints, legend minimal'
      ].join('. ');
    }
    case 'material_palette': {
      const matList = normalizeMaterials(masterDNA);
      return [
        'Material palette board showing primary building materials',
        `Materials: ${matList}`,
        'Display as color swatches with hex codes and material names',
        'Professional material board layout with labels',
        'Show texture samples and finish specifications',
        'Clean grid layout, no perspective, flat presentation'
      ].join('. ');
    }
    case 'climate_card': {
      const climate = context.climate || { type: 'temperate oceanic' };
      const climateType = climate.type || 'temperate oceanic';
      return [
        `Climate analysis card for ${climateType} climate`,
        'Show solar orientation diagram with compass rose',
        'Display seasonal temperature ranges and precipitation',
        'Include sun path diagram (summer/winter solstice)',
        'Energy performance metrics and sustainability features',
        'Professional infographic style with clear data visualization',
        'No perspective, flat 2D presentation with icons and charts'
      ].join('. ');
    }
    default:
      return `Panel ${panelType} for ${projectType} in ${style} style.`;
  }
}

function buildNegativePrompt(panelType) {
  // Use standardized negative prompts for consistency
  return buildStandardNegativePrompt(panelType);
}

/**
 * Build panel sequence based on floor count
 * 
 * Panel count is floor-dependent:
 * - 1-floor building: 12 panels (no floor_plan_first, no floor_plan_level2)
 * - 2-floor building: 13 panels (includes floor_plan_first, no floor_plan_level2)
 * - 3+ floor building: 14 panels (includes both floor_plan_first and floor_plan_level2)
 * 
 * @param {Object} masterDNA - Master DNA with dimensions
 * @returns {Array<string>} Filtered panel sequence
 */
function buildPanelSequence(masterDNA = {}) {
  const { floors } = normalizeDimensions(masterDNA);
  const includeFirstFloor = floors > 1;
  const includeSecondFloor = floors > 2;
  return BASE_PANEL_SEQUENCE.filter((key) => {
    if (key === 'floor_plan_first' && !includeFirstFloor) return false;
    if (key === 'floor_plan_level2' && !includeSecondFloor) return false;
    return true;
  });
}

/**
 * Plan panel jobs with deterministic seeds.
 */
export function planA1Panels({
  masterDNA,
  siteBoundary,
  buildingType,
  entranceOrientation,
  programSpaces,
  baseSeed,
  climate,
  locationData
}) {
  const seedSource = typeof baseSeed === 'number' || typeof baseSeed === 'string'
    ? baseSeed
    : Math.floor(Math.random() * 1000000);

  const panelSequence = buildPanelSequence(masterDNA);
  const panelSeedMap = derivePanelSeeds(seedSource, panelSequence);

  return panelSequence.map((panelType) => {
    const seed = panelSeedMap[panelType] ?? derivePanelSeed(seedSource, panelType);
    
    // Try specialized builder first, fallback to generic
    let jobPrompt, jobNegativePrompt;
    try {
      const specialized = buildSpecializedPanelPrompt(panelType, {
        masterDNA,
        locationData: locationData || { climate },
        projectContext: { buildingProgram: buildingType, programSpaces },
        consistencyLock: null
      });
      jobPrompt = specialized.prompt;
      jobNegativePrompt = specialized.negativePrompt;
    } catch (err) {
      // Fallback to generic builder
      jobPrompt = buildPanelPrompt(panelType, {
        masterDNA,
        siteBoundary,
        buildingType,
        entranceOrientation,
        programSpaces,
        climate
      });
      jobNegativePrompt = buildNegativePrompt(panelType);
    }

    return {
      id: `${panelType}-${seed}`,
      type: panelType,
      width: PANEL_CONFIGS[panelType]?.width || 1280,
      height: PANEL_CONFIGS[panelType]?.height || 960,
      prompt: jobPrompt,
      negativePrompt: jobNegativePrompt,
      seed,
      dnaSnapshot: masterDNA || null,
      meta: {
        siteBoundary,
        entranceOrientation
      }
    };
  });
}

/**
 * Generate panels sequentially using the provided Together client.
 * togetherClient is expected to expose generateImage(params).
 */
export async function generateA1PanelsSequential(jobs, togetherClient) {
  if (!togetherClient || typeof togetherClient.generateImage !== 'function') {
    throw new Error('togetherClient.generateImage is required');
  }

  const results = [];

  for (const job of jobs) {
    const response = await togetherClient.generateImage({
      type: job.type,
      prompt: job.prompt,
      negativePrompt: job.negativePrompt,
      width: job.width,
      height: job.height,
      seed: job.seed
    });

    const imageUrl = response?.url || response?.imageUrls?.[0] || '';
    const width = response?.metadata?.width || response?.width || job.width;
    const height = response?.metadata?.height || response?.height || job.height;
    const seedUsed = typeof response?.seedUsed === 'number'
      ? response.seedUsed
      : typeof response?.seed === 'number'
        ? response.seed
        : job.seed;

    results.push({
      id: job.id || job.type,
      type: job.type,
      imageUrl,
      width,
      height,
      seed: seedUsed,
      prompt: job.prompt,
      negativePrompt: job.negativePrompt,
      dnaSnapshot: job.dnaSnapshot || null,
      meta: job.meta
    });
  }

  return results;
}

export default {
  planA1Panels,
  generateA1PanelsSequential
};
