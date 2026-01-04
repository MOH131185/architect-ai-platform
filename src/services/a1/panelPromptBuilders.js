/**
 * Panel Prompt Builders
 * 
 * Specialized prompt builders for each of the 14 panel types in multi-panel A1 generation.
 * Each builder creates highly specific prompts with consistency locks and DNA integration.
 * 
 * @module services/a1/panelPromptBuilders
 */

import logger from '../../utils/logger.js';

const DRAWING_STYLE_SUFFIX = 'pure white background, thin clean black lines, no shadows, no title block, no text outside the drawing';
const RENDER_STYLE_SUFFIX = 'same materials and colors as other views, soft neutral sky, no watermark, no text';

/**
 * Normalize DNA dimensions with fallbacks
 * @private
 */
function normalizeDimensions(masterDNA = {}) {
  const dims = masterDNA.dimensions || {};
  return {
    length: dims.length || 30,
    width: dims.width || 20,
    height: dims.height || 10,
    floors: dims.floors || dims.floorCount || 2,
    floorHeights: dims.floorHeights || [3.0, 3.0]
  };
}

/**
 * Normalize materials list
 * @private
 */
function normalizeMaterials(masterDNA = {}) {
  const materials = masterDNA.materials || [];
  if (Array.isArray(materials) && materials.length > 0) {
    return materials
      .map((m) => {
        const name = typeof m === 'string' ? m : m.name || m.type || 'material';
        const color = m.hexColor ? ` (${m.hexColor})` : '';
        return `${name}${color}`;
      })
      .slice(0, 5);
  }
  return ['stone', 'glass', 'timber'];
}

/**
 * Build site diagram prompt
 */
export function buildSiteDiagramPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const dims = normalizeDimensions(masterDNA);
  const style = masterDNA?.architecturalStyle || 'Contemporary';
  const footprint = `${dims.length}m × ${dims.width}m`;
  const address = locationData?.address || 'Site location';
  
  const prompt = `Site plan diagram - overhead orthographic view
Location: ${address}
Building footprint: ${footprint}
Style: ${style}

REQUIREMENTS:
- True overhead 2D view (NOT perspective)
- Building footprint positioned within site boundary
- North arrow clearly visible
- Scale bar (1:500 or 1:200)
- Property boundary lines
- Access roads and pathways
- Context landscaping (trees, parking)
- Site dimensions and setbacks labeled
- Clean technical drawing style

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: '3d, perspective, photorealistic, noisy background, cluttered annotations, angled view'
  };
}

/**
 * Build hero 3D exterior prompt
 */
export function buildHero3DPrompt({ masterDNA, locationData, projectContext, consistencyLock, geometryHint }) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || 'Contemporary';
  const projectType = projectContext?.buildingProgram || 'residential';
  const geomConstraint = geometryHint?.type
    ? `FOLLOW PROVIDED GEOMETRY silhouette (${geometryHint.type}) for massing and roofline.`
    : 'Keep massing consistent with plans and elevations.';
  
  const prompt = `Hero exterior 3D perspective view
Building: ${style} ${projectType}
Dimensions: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floors
Materials: ${materials.join(', ')}

REQUIREMENTS:
- Photorealistic architectural rendering
- Southwest viewing angle (45° from corner)
- Natural daylight with volumetric shadows
- ${style} architectural style clearly expressed
- Material textures visible and accurate
- Contextual environment (sky, ground plane, light landscaping)
- Single building only (no variations or alternatives)
- Professional architecture magazine quality
- Coherent massing matching floor plans
- ${geomConstraint}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''} 
STYLE: ${RENDER_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: 'cartoon, sketch, overexposed, low detail, multiple buildings, people, cars, wireframe'
  };
}

/**
 * Build interior 3D prompt
 */
export function buildInterior3DPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || 'Contemporary';
  const projectType = projectContext?.buildingProgram || 'residential';
  
  const prompt = `Interior 3D perspective view - main lobby/living space
Building: ${style} ${projectType}
Materials: ${materials.join(', ')}

REQUIREMENTS:
- Photorealistic interior rendering
- Main entrance lobby or living core space
- Natural lighting from windows (consistent with elevations)
- ${style} interior design language
- Furniture layout matching program
- Material finishes visible (floors, walls, ceiling)
- Spatial depth showing multiple rooms/areas
- No people, clean professional presentation
- Openings align with floor plans

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}`;

  return {
    prompt,
    negativePrompt: 'cartoon, sketch, fisheye, low detail, people, cluttered, messy, dark'
  };
}

/**
 * Build ground floor plan prompt
 */
export function buildGroundFloorPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const dims = normalizeDimensions(masterDNA);
  const projectType = projectContext?.buildingProgram || 'residential';
  const programSpaces = projectContext?.programSpaces || [];
  const roomList = programSpaces.length > 0 
    ? programSpaces.map(p => p.name || p.type).join(', ')
    : 'lobby, living, kitchen, services';
  
  const prompt = `Ground floor plan - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: ${roomList}

REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- All rooms labeled with names and dimensions
- Door swings and window positions shown
- Furniture layout indicated
- Dimension lines for key measurements
- North arrow
- Main entrance clearly marked
- Staircase if multi-storey
- Align with elevations (window/door positions match)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: 'perspective, 3d, isometric, angled, blurry, messy lines, low contrast, watermark, sketch'
  };
}

/**
 * Build first floor plan prompt
 */
export function buildFirstFloorPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const dims = normalizeDimensions(masterDNA);
  const projectType = projectContext?.buildingProgram || 'residential';
  
  const prompt = `First floor plan (Level 1) - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: Upper floor spaces (bedrooms, private rooms, or upper program)

REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- Align staircase with ground floor
- All rooms labeled with dimensions
- Door swings and window positions
- Furniture layout
- Dimension lines
- Vertical circulation (stairs/lifts) in same position as ground floor
- Window positions align with elevations

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: 'perspective, 3d, isometric, angled, blurry, messy lines, low contrast, watermark'
  };
}

/**
 * Build second floor plan prompt
 */
export function buildSecondFloorPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const dims = normalizeDimensions(masterDNA);
  
  const prompt = `Second floor plan (Level 2) - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: Top floor spaces or roof plan

REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- Align vertical cores with lower floors
- All rooms labeled
- Roof structure indicated if applicable
- Dimension lines
- Staircase/lift alignment with lower floors
- Window positions align with elevations

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: 'perspective, 3d, isometric, angled, blurry, messy lines, low contrast'
  };
}

/**
 * Build elevation prompt (reusable for all 4 orientations)
 */
export function buildElevationPrompt(orientation) {
  return ({ masterDNA, locationData, projectContext, consistencyLock, geometryHint }) => {
    const dims = normalizeDimensions(masterDNA);
    const materials = normalizeMaterials(masterDNA);
    const style = masterDNA?.architecturalStyle || 'Contemporary';
    const dirUpper = orientation.toUpperCase();
    const geomConstraint = geometryHint?.type
      ? `FOLLOW PROVIDED GEOMETRY: match the ${geometryHint.type} silhouette exactly (roofline, massing, openings).`
      : 'Maintain strict orthographic alignment to plans and roofline.';
    
    const prompt = `${dirUpper} elevation - flat orthographic facade view
Style: ${style}
Height: ${dims.height}m (${dims.floors} floors)
Materials: ${materials.join(', ')}

REQUIREMENTS:
- FLAT ORTHOGRAPHIC VIEW (NO perspective, NO angled view)
- Show complete facade from grade to roofline
- Window and door positions (align with floor plans)
- Material indications and textures
- Facade articulation and depth
- Dimension lines for height and key features
- Grade line at base
- Roof form and details
- Clean technical drawing with proper line weights
- ${geomConstraint}
- ${dirUpper === 'NORTH' ? 'Main entrance if north-facing' : ''}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}`;

    return {
      prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
      negativePrompt: 'perspective, angled view, fisheye, 3d, low quality, sketchy, blurry'
    };
  };
}

/**
 * Build section A-A prompt (longitudinal)
 */
export function buildSectionAAPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const floorHeights = dims.floorHeights.map((h, i) => `Floor ${i}: ${h}m`).join(', ');
  
  const prompt = `Section A-A (longitudinal) - orthographic building section
Total height: ${dims.height}m
Floor heights: ${floorHeights}
Materials: ${materials.join(', ')}

REQUIREMENTS:
- TRUE ORTHOGRAPHIC SECTION (NOT perspective)
- Cut through entrance and main circulation
- Show all floor levels with slab thickness
- Staircase visible in section
- Ceiling heights labeled
- Foundation and roof structure
- Material indications
- Dimension lines for floor-to-floor heights
- Interior spaces visible in section
- Clean technical drawing style

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: 'photorealistic, perspective, 3d, low contrast, messy lines, blurry'
  };
}

/**
 * Build section B-B prompt (transverse)
 */
export function buildSectionBBPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  
  const prompt = `Section B-B (transverse/cross section) - orthographic building section
Width: ${dims.width}m
Total height: ${dims.height}m
Materials: ${materials.join(', ')}

REQUIREMENTS:
- TRUE ORTHOGRAPHIC SECTION (NOT perspective)
- Cut perpendicular to Section A-A
- Show structural grid if applicable
- All floor levels with slab thickness
- Window openings in section
- Ceiling heights labeled
- Foundation and roof structure
- Material indications
- Dimension lines
- Align with elevations (window positions match)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: 'photorealistic, perspective, 3d, low contrast, messy lines, blurry'
  };
}

/**
 * Build material palette prompt
 */
export function buildMaterialPalettePrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const materials = normalizeMaterials(masterDNA);
  
  const prompt = `Material palette board - architectural materials presentation
Materials: ${materials.join(', ')}

REQUIREMENTS:
- Display as color swatches in grid layout
- Each material shown as rectangular swatch
- Material name labeled below each swatch
- Hex color codes visible for each material
- Texture indication (smooth, rough, etc.)
- Application notes (exterior walls, roof, etc.)
- Professional material board presentation
- Clean flat 2D layout (NO perspective)
- High contrast for readability
- Typography: clean sans-serif labels

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: 'perspective, 3d, photorealistic materials, cluttered, messy layout, low contrast, blurry'
  };
}

/**
 * Build climate card prompt
 */
export function buildClimateCardPrompt({ masterDNA, locationData, projectContext, consistencyLock }) {
  const climate = locationData?.climate || { type: 'temperate oceanic' };
  const climateType = climate.type || 'temperate oceanic';
  const location = locationData?.address || 'Site location';
  const sunPath = locationData?.sunPath || {};
  const orientation = sunPath.optimalOrientation || 180;
  
  const prompt = `Climate analysis card - environmental data infographic
Location: ${location}
Climate: ${climateType}
Optimal orientation: ${orientation}°

REQUIREMENTS:
- Solar orientation diagram with compass rose
- Sun path diagram (summer and winter solstice paths)
- Seasonal temperature ranges (bar chart or graph)
- Precipitation data (monthly averages)
- Wind rose diagram showing prevailing winds
- Energy performance indicators
- Sustainability features summary
- Professional infographic style
- Clean data visualization with icons
- Flat 2D presentation (NO perspective)
- High contrast for readability
- Color-coded data (warm/cool colors for temperature)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ''}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: 'perspective, 3d, photorealistic, cluttered data, messy charts, low readability, blurry'
  };
}

/**
 * Panel prompt builders map
 */
export const PANEL_PROMPT_BUILDERS = {
  site_diagram: buildSiteDiagramPrompt,
  hero_3d: buildHero3DPrompt,
  interior_3d: buildInterior3DPrompt,
  floor_plan_ground: buildGroundFloorPrompt,
  floor_plan_first: buildFirstFloorPrompt,
  floor_plan_level2: buildSecondFloorPrompt,
  elevation_north: buildElevationPrompt('north'),
  elevation_south: buildElevationPrompt('south'),
  elevation_east: buildElevationPrompt('east'),
  elevation_west: buildElevationPrompt('west'),
  section_AA: buildSectionAAPrompt,
  section_BB: buildSectionBBPrompt,
  material_palette: buildMaterialPalettePrompt,
  climate_card: buildClimateCardPrompt
};

/**
 * Build prompt for a specific panel type
 * 
 * @param {string} panelType - Panel type identifier
 * @param {Object} context - Context for prompt generation
 * @returns {Object} { prompt, negativePrompt }
 */
export function buildPanelPrompt(panelType, context) {
  const builder = PANEL_PROMPT_BUILDERS[panelType];
  
  if (!builder) {
    logger.warn(`No prompt builder found for panel type: ${panelType}`);
    return {
      prompt: `Panel ${panelType} for architectural presentation`,
      negativePrompt: 'low quality, blurry, watermark'
    };
  }
  
  return builder(context);
}

export default {
  PANEL_PROMPT_BUILDERS,
  buildPanelPrompt,
  buildSiteDiagramPrompt,
  buildHero3DPrompt,
  buildInterior3DPrompt,
  buildGroundFloorPrompt,
  buildFirstFloorPrompt,
  buildSecondFloorPrompt,
  buildElevationPrompt,
  buildSectionAAPrompt,
  buildSectionBBPrompt,
  buildMaterialPalettePrompt,
  buildClimateCardPrompt
};

