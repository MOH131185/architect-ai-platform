/**
 * DNA Prompt Context Builder
 * 
 * Builds structured, stable JSON context from DNA for embedding in prompts.
 * Ensures reproducibility by using sorted keys and compact format.
 */

import { extractStructuredDNA } from './dnaSchema.js';
import logger from '../utils/logger.js';

/**
 * Build structured DNA context for prompts
 * Returns a compact JSON block with essential DNA fields
 */
export function buildStructuredDNAContext(masterDNA) {
  if (!masterDNA) {
    logger.warn('buildStructuredDNAContext: No DNA provided');
    return '{}';
  }

  // Extract structured DNA (handles both new and legacy formats)
  const structured = masterDNA._structured || extractStructuredDNA(masterDNA);

  // Build compact context with sorted keys for stability
  const context = {
    // Site context
    site: {
      area_m2: structured.site?.area_m2 || 0,
      climate: structured.site?.climate_zone || 'temperate',
      orientation: structured.site?.sun_path || 'south'
    },

    // Program context
    program: {
      floors: structured.program?.floors || 2,
      rooms: (structured.program?.rooms || []).map(room => ({
        name: room.name,
        area: room.area_m2 || room.area || 0,
        floor: room.floor
      })).slice(0, 10) // Limit to 10 rooms for prompt size
    },

    // Style context
    style: {
      architecture: structured.style?.architecture || 'contemporary',
      materials: (structured.style?.materials || []).slice(0, 5), // Top 5 materials
      windows: structured.style?.windows?.pattern || 'regular grid'
    },

    // Geometry rules
    geometry: {
      roof: structured.geometry_rules?.roof_type || 'gable',
      grid: structured.geometry_rules?.grid || '1m',
      span: structured.geometry_rules?.max_span || '6m'
    }
  };

  // Return compact JSON string (sorted keys)
  return JSON.stringify(context, Object.keys(context).sort(), 0);
}

/**
 * Build 3D panel prompt template
 * For hero views, interior, site diagrams
 */
export function build3DPanelPrompt(panelType, dna, additionalContext = '') {
  const dnaContext = buildStructuredDNAContext(dna);

  const basePrompt = `Generate a photorealistic 3D ${panelType.replace(/_/g, ' ')} of the SAME HOUSE defined in this DNA:

${dnaContext}

STRICT RULES:
- Do NOT change building shape, dimensions, or proportions
- Do NOT change window count or positions
- Do NOT change roof type or pitch
- Do NOT change materials or colors
- Do NOT invent new architectural features
- Maintain exact consistency with the DNA specification

${additionalContext}

Style: Photorealistic architectural rendering, professional quality, natural lighting.`;

  return basePrompt;
}

/**
 * Build 2D floor plan prompt template
 * For ground, first, second floor plans
 */
export function buildPlanPrompt(level, dna, additionalContext = '') {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);
  
  // Filter rooms for this level
  const levelRooms = (structured.program?.rooms || []).filter(r => 
    r.floor === level || (level === 'ground' && !r.floor)
  );

  const roomList = levelRooms.map(r => 
    `${r.name}: ${r.area_m2 || r.area || 0}m²`
  ).join(', ');

  const basePrompt = `Generate a clean black and white architectural FLOOR PLAN for ${level} floor of the SAME HOUSE defined in this DNA:

${dnaContext}

FLOOR PLAN REQUIREMENTS FOR ${level.toUpperCase()} FLOOR:
- Rooms: ${roomList || 'As per DNA'}
- Total area: ${levelRooms.reduce((sum, r) => sum + (r.area_m2 || r.area || 0), 0)}m²
- Keep global footprint identical to DNA
- Maintain consistent wall thickness (0.3m exterior, 0.15m interior)
- Position doors and windows exactly according to DNA
- No invented rooms or spaces
- TRUE OVERHEAD ORTHOGRAPHIC VIEW (not perspective, not 3D, not isometric)

${additionalContext}

Style: Clean black and white line drawing, architectural standard, dimension lines, room labels.

NEGATIVE: (perspective:1.5), (3D:1.5), (isometric:1.5), photorealistic, shading, shadows`;

  return basePrompt;
}

/**
 * Build elevation prompt template
 * For north, south, east, west elevations
 */
export function buildElevationPrompt(direction, dna, additionalContext = '') {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  const basePrompt = `Generate ${direction.toUpperCase()} ELEVATION of the SAME HOUSE defined in this DNA:

${dnaContext}

ELEVATION REQUIREMENTS:
- Direction: ${direction} facade
- Materials: ${structured.style?.materials?.join(', ') || 'As per DNA'}
- Roof: ${structured.geometry_rules?.roof_type || 'gable'}
- Windows: ${structured.style?.windows?.pattern || 'regular grid'}
- FLAT ORTHOGRAPHIC VIEW (no perspective distortion)
- Maintain exact proportions from DNA
- Show true heights and widths

${additionalContext}

Style: Clean architectural elevation drawing, black and white line work, dimension lines.

NEGATIVE: (perspective:1.3), (3D:1.3), photorealistic, shading, shadows`;

  return basePrompt;
}

/**
 * Build section prompt template
 * For longitudinal and cross sections
 */
export function buildSectionPrompt(sectionType, dna, additionalContext = '') {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  const basePrompt = `Generate ${sectionType.toUpperCase()} SECTION of the SAME HOUSE defined in this DNA:

${dnaContext}

SECTION REQUIREMENTS:
- Type: ${sectionType} section (${sectionType === 'longitudinal' ? 'along length' : 'across width'})
- Floors: ${structured.program?.floors || 2}
- Floor heights: 3.0m ground, 2.7m upper
- Show interior spaces, floor structures, roof structure
- Cut through building to reveal interior
- FLAT ORTHOGRAPHIC VIEW (no perspective)
- Dimension lines showing heights

${additionalContext}

Style: Clean architectural section drawing, black and white, hatching for cut elements, dimension lines.

NEGATIVE: perspective, 3D, photorealistic, exterior view`;

  return basePrompt;
}

/**
 * Build negative prompt for panel type
 */
export function buildNegativePrompt(panelType) {
  const is2D = panelType.includes('floor_plan') || panelType.includes('elevation') || panelType.includes('section');
  
  if (is2D) {
    return '(low quality:1.4), (worst quality:1.4), (blurry:1.3), (perspective:1.5), (3D:1.5), (isometric:1.5), photorealistic, shading, shadows, watermark, signature, text';
  } else {
    return '(low quality:1.4), (worst quality:1.4), (blurry:1.3), cartoon, sketch, drawing, line art, watermark, signature, text';
  }
}

export default {
  buildStructuredDNAContext,
  build3DPanelPrompt,
  buildPlanPrompt,
  buildElevationPrompt,
  buildSectionPrompt,
  buildNegativePrompt
};

