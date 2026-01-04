/**
 * A1 Prompt Service
 *
 * Consolidated AI prompt generation service for A1 architectural sheets.
 * Merges functionality from:
 * - a1SheetPromptGenerator.js (Context-aware prompt generation)
 * - a1SheetPromptBuilder.js (Pure deterministic prompt building)
 *
 * Provides unified API for building prompts with:
 * - Deterministic prompt building
 * - Context-aware generation
 * - Consistency locking for modifications
 * - Multiple prompt versions (v3, v4)
 * - Non-residential type detection
 * - Strong negative prompts
 *
 * @module services/a1/A1PromptService
 */

import logger from '../../utils/logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const NON_RESIDENTIAL_TYPES = [
  'clinic', 'hospital', 'office', 'retail', 'school',
  'commercial', 'medical', 'healthcare', 'restaurant',
  'shop', 'warehouse', 'industrial', 'dental-clinic'
];

const DEFAULT_PROMPT_VERSION = 'v4';

// ============================================================================
// MAIN PROMPT BUILDING API (Pure/Deterministic)
// ============================================================================

/**
 * Build sheet prompt (pure function, deterministic)
 *
 * @param {Object} params - Prompt parameters
 * @param {Object} params.dna - Master DNA
 * @param {Object} params.siteSnapshot - Site snapshot with climate, location
 * @param {Object} params.sheetConfig - Sheet configuration
 * @param {string} params.sheetType - Sheet type (ARCH, STRUCTURE, MEP)
 * @param {Array} params.overlays - Overlay descriptors
 * @param {string} params.mode - Mode (generate, modify)
 * @param {Object} params.modifyContext - Modify context (for modify mode)
 * @param {number} params.seed - Generation seed
 * @returns {Object} { prompt, negativePrompt, metadata }
 */
export function buildPrompt({
  dna,
  siteSnapshot = {},
  sheetConfig = {},
  sheetType = 'ARCH',
  overlays = [],
  mode = 'generate',
  modifyContext = null,
  seed
}) {
  logger.info('🔨 Building deterministic A1 sheet prompt...');

  if (!dna) {
    throw new Error('DNA is required for prompt generation');
  }

  // Extract dimensions with strict placeholders for missing data
  const dimensions = dna.dimensions || {};
  const length = dimensions.length || 15;
  const width = dimensions.width || 12;
  const height = dimensions.height || 7;
  const floors = dimensions.floors || dimensions.floorHeights?.length || 2;

  // Extract materials
  const materials = dna.materials || [];
  const materialDesc = materials.length > 0
    ? materials.map(m => `${m.name}${m.hexColor ? ` (${m.hexColor})` : ''}`).join(', ')
    : 'brick, timber, glass';

  // Extract style and project type
  const style = dna.architecturalStyle || 'Contemporary';
  const projectType = dna.projectType || 'residential';

  // Check if non-residential
  const isNonResidential = NON_RESIDENTIAL_TYPES.some(
    type => projectType.toLowerCase().includes(type)
  );

  // Build climate description
  const climate = siteSnapshot.climate || {};
  const climateType = climate.type || 'temperate oceanic';

  // Build sun path description
  const sunPath = siteSnapshot.sunPath || {};
  const orientation = sunPath.optimalOrientation || 180;

  // Build prompt based on mode
  const promptContent = {
    style,
    projectType,
    length,
    width,
    height,
    floors,
    materialDesc,
    climateType,
    orientation,
    isNonResidential
  };

  const prompt = mode === 'modify' && modifyContext
    ? buildModifyPrompt(promptContent, modifyContext)
    : buildGeneratePrompt(promptContent, sheetConfig);

  const negativePrompt = buildNegativePrompt(isNonResidential, sheetConfig);

  logger.success('✅ Prompt built successfully');

  return {
    prompt,
    negativePrompt,
    metadata: {
      sheetType,
      mode,
      seed,
      isNonResidential,
      projectType,
      style
    }
  };
}

/**
 * Build prompt with full context (legacy compatibility)
 *
 * @param {Object} dna - Master DNA
 * @param {Object} location - Location data
 * @param {Object} projectContext - Project context
 * @param {Object} blendedStyle - Blended style (optional)
 * @param {Object} options - Additional options
 * @returns {Object} { prompt, negativePrompt, systemHints }
 */
export function buildPromptWithContext(
  dna,
  location,
  projectContext = {},
  blendedStyle = null,
  options = {}
) {
  logger.info('🔨 Building context-aware A1 sheet prompt...');

  const context = derivePromptContext({
    masterDNA: dna,
    location,
    projectContext,
    blendedStyle,
    ...options
  });

  const promptVersion = options.promptVersion || DEFAULT_PROMPT_VERSION;
  const useV4 = promptVersion.toLowerCase() === 'v4';

  const prompt = useV4
    ? buildKontextPromptV4(context)
    : buildKontextPromptV3(context);

  const negativePrompt = buildNegativePrompt(
    context.isNonResidential,
    options.sheetConfig,
    options.requiredSections
  );

  const systemHints = {
    targetAspectRatio: 1.414,
    layoutType: 'professional_architectural_portfolio_board',
    viewCount: '10+ views on single sheet',
    visualQuality: 'photorealistic_renders_and_colored_plans',
    presentationStyle: 'architecture_magazine_quality',
    avoidWireframes: true,
    consistencyPriority: 'high',
    seed: options.seed || Date.now()
  };

  logger.success('✅ Context-aware prompt built successfully');

  return {
    prompt,
    negativePrompt,
    systemHints
  };
}

/**
 * Build prompt with consistency lock for modifications
 *
 * @param {string} basePrompt - Original base prompt
 * @param {string} deltaPrompt - Modification request
 * @param {Object} masterDNA - Master DNA (immutable)
 * @returns {string} Combined prompt with consistency lock
 */
export function withConsistencyLock(basePrompt, deltaPrompt, masterDNA) {
  logger.info('🔒 Applying consistency lock to modification prompt...');

  const { dimensions = {}, materials = [] } = masterDNA;

  // Extract immutable characteristics
  const dimDesc = `${dimensions.length || 15}m × ${dimensions.width || 12}m × ${dimensions.height || 7}m`;
  const materialDesc = materials.map(m => `${m.name} (${m.hexColor})`).join(', ');

  const consistencyRules = `
🔒 CONSISTENCY LOCK (IMMUTABLE):
- Building Dimensions: ${dimDesc} - DO NOT CHANGE
- Primary Materials: ${materialDesc} - DO NOT CHANGE
- Architectural Style: ${masterDNA.architecturalStyle || 'Contemporary'} - PRESERVE
- Floor Count: ${dimensions.floorHeights?.length || 2} - DO NOT CHANGE
- Foundation Position: SAME AS ORIGINAL - DO NOT MOVE

📝 MODIFICATION REQUEST:
${deltaPrompt}

⚠️ RULES:
1. Apply ONLY the changes specified in the modification request above
2. Keep ALL other elements EXACTLY as they were in the original design
3. Maintain dimensional consistency across all views
4. Preserve material color codes and finishes
5. Do not alter unrelated features or sections
  `.trim();

  const lockedPrompt = `${basePrompt}\n\n${consistencyRules}`;

  logger.success('✅ Consistency lock applied');

  return lockedPrompt;
}

// ============================================================================
// CONTEXT DERIVATION
// ============================================================================

/**
 * Derive complete prompt context from project data
 *
 * @param {Object} params - Context parameters
 * @returns {Object} Derived context for prompt building
 * @private
 */
function derivePromptContext({
  masterDNA = {},
  location = {},
  projectContext = {},
  projectMeta = {},
  siteShape = null,
  siteConstraints = null,
  blendedStyle = null
}) {
  // Extract dimensions
  const dimensions = masterDNA.dimensions || {};
  const length = dimensions.length || dimensions.width || 15;
  const width = dimensions.width || dimensions.depth || 12;
  const height = dimensions.height || dimensions.totalHeight || 7;
  const dimDesc = `${length}m × ${width}m × ${height}m`;
  const floorCount = dimensions.floorHeights?.length || dimensions.floor_count || dimensions.floors || 2;
  const floorDesc = floorCount === 1 ? 'single-storey' : floorCount === 2 ? 'two-storey' : `${floorCount}-storey`;

  // Extract materials
  const materials = masterDNA.materials || [];
  const materialsArray = Array.isArray(materials) ? materials : [materials].filter(Boolean);
  const materialDesc = materialsArray.length > 0
    ? materialsArray.map(m => `${m.name}${m.hexColor ? ` (${m.hexColor})` : ''}`).join(', ')
    : 'brick, timber, glass';

  // Extract style
  const style = masterDNA.architecturalStyle || masterDNA.architectural_style?.name || projectMeta.style || 'Contemporary';

  // Extract project type
  const projectTypeRaw = projectContext?.buildingProgram || projectContext?.projectType || masterDNA?.projectType || projectMeta?.projectType || 'three-bedroom family house';
  const projectType = projectTypeRaw;
  const buildingProgram = projectContext?.buildingProgram || projectType;

  // Check if non-residential
  const projectTypeLower = (projectType || '').toLowerCase();
  const buildingProgramLower = (buildingProgram || '').toLowerCase();
  const isNonResidential = NON_RESIDENTIAL_TYPES.some(
    type => projectTypeLower.includes(type) || buildingProgramLower.includes(type)
  );

  // Extract climate and location
  const locationDesc = location?.address || 'Birmingham, UK';
  const climateDesc = location?.climate?.type || 'temperate oceanic';
  const sunPathInfo = getSunPathDescription(location?.sunPath, 'south-facing');

  // Site constraints
  const siteArea = siteConstraints?.siteArea || location?.siteAnalysis?.area || 450;
  const siteShapeDesc = siteConstraints?.shapeType || siteShape || 'rectangular';

  // Project metadata
  const projectName = projectMeta.name || `${style} ${buildingProgram}`;
  const architectName = 'ArchiAI Solution Ltd – Mohammed Reggab';
  const arbNumber = projectMeta.arbNumber || 'ARB-123456';
  const clientName = projectMeta.client || projectMeta.clientName || 'Confidential Client';
  const projectRef = projectMeta.reference || projectMeta.projectRef || 'A1-001';
  const revisionNumber = projectMeta.revision || 'P01';

  // Program summary
  const programSummary = isNonResidential
    ? `${projectType} spaces: reception, consultation rooms, support areas, circulation`
    : 'residential spaces: living, bedrooms, kitchen, bathrooms';

  const typologyReminder = isNonResidential
    ? `This is a ${projectType.toUpperCase()} building. NO SINGLE-FAMILY HOUSE. NO RESIDENTIAL HOUSE. - NO bedrooms, NO domestic kitchen, NO residential features`
    : `This is a RESIDENTIAL building - include bedrooms, living areas, kitchen`;

  return {
    architectName,
    arbNumber,
    buildingProgram,
    climateDesc,
    clientName,
    dimensions,
    dimDesc,
    floorCount,
    floorDesc,
    height,
    isNonResidential,
    length,
    locationDesc,
    materialDesc,
    materialsArray,
    programSummary,
    projectName,
    projectRef,
    projectType,
    revisionNumber,
    siteArea,
    siteShapeDesc,
    style,
    sunPathInfo,
    typologyReminder,
    width
  };
}

/**
 * Get sun path description
 * @private
 */
function getSunPathDescription(sunPathData, fallback = 'South-facing') {
  if (!sunPathData) {
    return {
      orientationText: fallback,
      detailText: 'Sun path data unavailable'
    };
  }

  const orientation = `${Math.round(sunPathData.optimalOrientation ?? 180)}° optimal orientation`;
  const winter = sunPathData.winterSolstice || {};
  const summer = sunPathData.summerSolstice || {};
  const winterAz = Math.round(winter.azimuth ?? 180);
  const winterAlt = Math.round(winter.altitude ?? 15);
  const summerAz = Math.round(summer.azimuth ?? 180);
  const summerAlt = Math.round(summer.altitude ?? 65);

  return {
    orientationText: orientation,
    detailText: `Winter: Az ${winterAz}° / Alt ${winterAlt}° | Summer: Az ${summerAz}° / Alt ${summerAlt}°`
  };
}

// ============================================================================
// PROMPT BUILDERS (v3 and v4)
// ============================================================================

/**
 * Build Kontext A1 Prompt V3
 * @private
 */
function buildKontextPromptV3(context) {
  const {
    materialDesc,
    floorDesc,
    dimDesc,
    style,
    projectType,
    floorCount,
    length,
    width,
    height,
    climateDesc,
    sunPathInfo,
    programSummary,
    locationDesc,
    architectName,
    arbNumber,
    clientName,
    projectRef,
    revisionNumber,
    typologyReminder
  } = context;

  return `📐 A1 ARCHITECTURAL PRESENTATION — VERSION 3 ULTRA-PROFESSIONAL

Landscape 841×594mm | UK RIBA STAGE 3–4 | ONE CONSISTENT BUILDING
STRICT GRID • STRICT PANEL POSITIONS • STRICT STYLE • ZERO DRIFT

YOU MUST GENERATE ONE (1) SINGLE BUILDING SHOWN ACROSS ALL PANELS.
NO variations. NO catalog layouts. NO alternative buildings.
All drawings must match the same footprint, dimensions, materials, and geometry.

═══════════════════════════════════════════════════════
🔒 1. IMMUTABLE PANEL GRID (ABSOLUTE)
═══════════════════════════════════════════════════════
┌────────────────────────────────────────────────────────────┐
│ [SITE PLAN]           [3D HERO VIEW]      [MATERIAL PANEL]  │
├────────────────────────────────────────────────────────────┤
│ [GROUND FLOOR PLAN]   [FIRST FLOOR]       [AXONOMETRIC]     │
├────────────────────────────────────────────────────────────┤
│ [NORTH ELEV]          [SOUTH ELEV]        [PROJECT DATA]    │
├────────────────────────────────────────────────────────────┤
│ [EAST ELEV]           [WEST ELEV]         [ENVIRONMENTAL]   │
├────────────────────────────────────────────────────────────┤
│ [SECTION A-A]         [SECTION B-B]       [TITLE BLOCK]     │
└────────────────────────────────────────────────────────────┘
No panel may move, be resized, be replaced, or be omitted.

═══════════════════════════════════════════════════════
🏗️ 2. BUILDING SPECIFICATIONS (LOCKED)
═══════════════════════════════════════════════════════
${typologyReminder}

Style: ${style}
Dimensions: ${dimDesc}
Floors: ${floorCount}
Materials: ${materialDesc}
Location: ${locationDesc}
Climate: ${climateDesc}
Orientation: ${sunPathInfo.orientationText}
Program: ${programSummary}

═══════════════════════════════════════════════════════
📋 3. REQUIRED PANELS (ALL MANDATORY)
═══════════════════════════════════════════════════════

🗺️ SITE PLAN (TOP-LEFT):
- Overhead orthographic site boundary view
- Building footprint positioned within site
- North arrow, scale bar, boundary lines
- Property lines and access roads
- Contextual landscaping (trees, paths)

🏠 3D HERO VIEW (TOP-CENTER):
- PHOTOREALISTIC exterior perspective from southwest angle
- ${style} architectural style clearly visible
- ${materialDesc} materials rendered with realism
- Volumetric shadows and natural lighting
- Contextual environment (sky, landscaping)
- NO wireframes, NO line drawings

🎨 MATERIAL PALETTE (TOP-RIGHT):
- Color swatches for ${materialDesc}
- Material names and specifications
- Hex color codes visible
- Professional material board layout

📐 GROUND FLOOR PLAN:
- TRUE OVERHEAD ORTHOGRAPHIC 2D plan (NOT perspective)
- ${programSummary}
- Dimension lines, door swings, furniture layout
- Scale: 1:100
- Wall thickness visible, labeled rooms

📐 FIRST FLOOR PLAN:
- TRUE OVERHEAD ORTHOGRAPHIC 2D plan (NOT perspective)
- Upper floor layout matching ground floor footprint
- Staircase connection visible
- ${floorCount > 1 ? 'Multiple bedrooms and bathrooms' : 'Roof plan'}

🔷 AXONOMETRIC VIEW:
- 45-degree axonometric projection showing building volume
- Cutaway revealing interior spaces
- ${style} style visible from all angles
- Materials and colors matching hero view

🏛️ ELEVATIONS (4 REQUIRED):
- NORTH ELEVATION: Front facade with main entrance
- SOUTH ELEVATION: Rear facade with outdoor spaces
- EAST ELEVATION: Side elevation showing ${height}m height
- WEST ELEVATION: Side elevation
- All elevations: strict vertical/horizontal 2D technical drawings
- Dimension lines, material indications, fenestration details

✂️ SECTIONS (2 REQUIRED):
- SECTION A-A: Longitudinal section showing floor-to-ceiling heights
- SECTION B-B: Transverse section showing ${dimDesc} dimensions
- Cut through building revealing interior spaces
- Dimension lines, structural elements visible

📊 PROJECT DATA:
- Building dimensions: ${dimDesc}
- Total floor area: ${Math.round(length * width * floorCount)} m²
- Climate zone: ${climateDesc}
- Energy rating: EPC B (estimated)

🌱 ENVIRONMENTAL:
- Solar orientation diagram
- Energy performance metrics
- Sustainable features summary

📋 TITLE BLOCK (BOTTOM-RIGHT):
- Project: ${projectType}
- Architect: ${architectName}
- ARB: ${arbNumber}
- Client: ${clientName || 'Confidential'}
- Drawing: ${projectRef}
- Revision: ${revisionNumber}
- Date: ${new Date().toLocaleDateString('en-GB')}
- Scale: As indicated
- RIBA Stage: 3

═══════════════════════════════════════════════════════
🎯 4. CRITICAL QUALITY RULES
═══════════════════════════════════════════════════════
✅ YES:
- Professional architectural portfolio board
- Photorealistic 3D renders
- Colored floor plans with furniture
- Technical drawings with dimension lines
- Consistent ${style} style across ALL panels
- Magazine-quality presentation

❌ NO:
- Multiple building variants or catalog layouts
- Placeholder boxes or sketch boards
- Grid paper backgrounds
- Perspective floor plans or elevations
- Missing panels or empty sections
- Inconsistent materials or colors between views
- Wireframe or line-art 3D views
- Low-quality or blurry renders

═══════════════════════════════════════════════════════
🔐 5. CONSISTENCY ENFORCEMENT
═══════════════════════════════════════════════════════
CRITICAL: Every panel must show the SAME building:
- Same footprint: ${length}m × ${width}m
- Same height: ${height}m
- Same materials: ${materialDesc}
- Same style: ${style}
- Same window/door positions
- Same roof form and chimneys (if any)

Cross-check ground floor, first floor, elevations, sections, and 3D views.
They must geometrically align. No dimensional drift allowed.`;
}

/**
 * Build Kontext A1 Prompt V4 (Enhanced)
 * @private
 */
function buildKontextPromptV4(context) {
  // V4 is enhanced version with stricter layout enforcement
  // For now, delegate to V3 (can be enhanced later)
  return buildKontextPromptV3(context);
}

/**
 * Build generate prompt
 * @private
 */
function buildGeneratePrompt(content, sheetConfig = {}) {
  const {
    style,
    projectType,
    length,
    width,
    height,
    floors,
    materialDesc,
    climateType,
    orientation
  } = content;

  return `Professional A1 architectural presentation sheet (841×594mm landscape).

Building: ${style} ${projectType}
Dimensions: ${length}m × ${width}m × ${height}m, ${floors} floors
Materials: ${materialDesc}
Climate: ${climateType}
Orientation: ${orientation}°

Include all required sections:
- Site plan with context
- Floor plans (all levels)
- Elevations (4 sides)
- Building sections (minimum 2)
- 3D exterior perspectives
- Material palette
- UK RIBA title block

Professional architectural magazine quality.
Photorealistic 3D renders, colored technical drawings.`;
}

/**
 * Build modify prompt
 * @private
 */
function buildModifyPrompt(content, modifyContext) {
  const basePrompt = buildGeneratePrompt(content);
  const deltaPrompt = modifyContext.deltaPrompt || '';

  return `${basePrompt}

MODIFICATION REQUEST:
${deltaPrompt}

Preserve all unmodified elements exactly as they were.`;
}

/**
 * Build negative prompt
 * @private
 */
function buildNegativePrompt(isNonResidential = false, sheetConfig = {}, requiredSections = null) {
  const baseNegatives = [
    '(multiple buildings:4.0)',
    '(house catalog:4.0)',
    '(sketch board:4.0)',
    '(perspective floor plan:4.0)',
    '(perspective elevation:4.0)',
    '(missing panel:4.0)',
    '(random site plan:4.0)',
    '(grid paper background:3.5)',
    '(placeholder boxes:3.5)',
    '(empty a1 sheet:4.0)',
    '(low quality:3.5)',
    '(blurry:3.5)',
    '(watermark:3.5)',
    '(text too small:3.5)'
  ];

  const nonResidentialNegatives = isNonResidential ? [
    '(domestic interior focus:3.5)',
    '(suburban house styling:3.5)'
  ] : [];

  const sectionNegatives = requiredSections && requiredSections.length > 0
    ? requiredSections.flatMap(section => [
        `(missing ${section.id}:4.0)`,
        `(no ${section.id}:4.0)`,
        `(${section.id} omitted:4.0)`
      ])
    : [];

  return [...baseNegatives, ...nonResidentialNegatives, ...sectionNegatives].join(', ');
}

// ============================================================================
// COMPACT MODIFICATION PROMPTS (for img2img workflows)
// ============================================================================

/**
 * Ultra-compact consistency lock for img2img modifications
 * Preserves existing design while allowing targeted changes
 *
 * @param {Object} options - Lock options
 * @param {Object} options.base - Base design data { masterDNA, mainPrompt, projectContext, projectType }
 * @param {string} options.delta - Delta prompt with requested changes
 * @returns {string} Ultra-compact prompt (<1k chars)
 */
export function withConsistencyLockCompact({ base, delta }) {
  // Truncate delta if too long (safety)
  const maxDeltaLength = 800;
  let truncatedDelta = delta;
  if (delta && delta.length > maxDeltaLength) {
    truncatedDelta = delta.substring(0, maxDeltaLength) + '...';
    logger.warn('Delta truncated for safety', {
      original: delta.length,
      truncated: maxDeltaLength
    });
  }

  // Extract project type to preserve building type (clinic vs house)
  const projectContext = base.projectContext || {};
  const projectType = base.projectType || projectContext?.projectType || projectContext?.buildingProgram || base.masterDNA?.projectType || 'residential';
  const isNonResidential = NON_RESIDENTIAL_TYPES.some(type => projectType.toLowerCase().includes(type));

  // Extract key DNA specs for consistency
  const masterDNA = base.masterDNA || {};
  const dimensions = masterDNA.dimensions || {};
  const materials = masterDNA.materials || [];
  const materialsArray = Array.isArray(materials) ? materials : [materials].filter(Boolean);
  const style = masterDNA.architecturalStyle || masterDNA.architectural_style?.name || 'Contemporary';

  // Ultra-minimal prompt focusing ONLY on changes
  const prompt = `A1 MODIFY MODE (IMG2IMG • STRICT LOCK)
- Preserve ≥98% of the sheet: layout, geometry, panels, materials, text, title block.
- Grid is immutable; do NOT move panels or redesign the building.
- Site placeholder stays blank with overlay label only (no map drawing).
- Modify ONLY the requested panel; all other content remains untouched.
- DNA lock: ${projectType.toUpperCase()} ${style} ${dimensions.length || 15}×${dimensions.width || 10}×${dimensions.height || 7}m, materials ${materialsArray.slice(0, 3).map(m => m.name || m).join(', ')}.
- Img2img: strength 0.10–0.14 (safe) or up to 0.18–0.22 for small local edits. Seed must be reused.

User delta:
${truncatedDelta || 'No additional instructions provided – preserve entire sheet as-is.'}`;

  logger.info(`Ultra-compact prompt: ${prompt.length} chars`, null, '📝');

  return prompt;
}

/**
 * Strong negative prompts for layout drift prevention
 * @returns {string} Negative prompt string
 */
export function strongNegativesForLayoutDrift() {
  return `(replace entire sheet:4.0), (only floor plans:4.0), (grid of floor plans:4.0), (remove existing views:3.5),
(complete redesign:3.0), (new layout:3.0), (rearranged sections:3.0), (moved views:2.5),
(different grid:2.5), (changed spacing:2.5), (altered margins:2.5), (resized panels:2.5),
(color palette changes:2.5), (font substitutions:2.5), (lineweight variations:2.5),
(title block modifications:2.5), (different style:2.5), (material changes:2.5),
(no AI-generated site plan:4.0), (no fake map:4.0), (no hallucinated context:4.0), (missing elevations:3.0), (missing sections:3.0), (missing 3D views:2.5)`;
}

/**
 * Build compact modify prompt for img2img workflows
 *
 * @param {Object} params - Parameters
 * @param {Object} params.dna - Master DNA
 * @param {Object} params.siteSnapshot - Site snapshot
 * @param {string} params.deltaPrompt - User modification request
 * @param {number} params.seed - Generation seed
 * @returns {Object} { prompt, negativePrompt }
 */
export function buildCompactModifyPrompt({ dna, siteSnapshot, deltaPrompt, seed }) {
  const prompt = withConsistencyLockCompact({
    base: { masterDNA: dna, projectContext: siteSnapshot },
    delta: deltaPrompt
  });

  return {
    prompt,
    negativePrompt: strongNegativesForLayoutDrift(),
    seed
  };
}

/**
 * Alias for backward compatibility
 * @deprecated Use buildPromptWithContext instead
 */
/**
 * Build A1 sheet prompt (wrapper for object-style API)
 * @param {Object} params - Parameters
 * @param {Object} params.masterDNA - Master DNA
 * @param {Object} params.location - Location data
 * @param {Object} params.projectContext - Project context
 * @param {Object} params.blendedStyle - Blended style (optional)
 * @param {Object} params.projectMeta - Project metadata (optional)
 * @returns {Object} { prompt, negativePrompt, systemHints }
 */
export function buildA1SheetPrompt({
  masterDNA,
  location = {},
  projectContext = {},
  blendedStyle = null,
  projectMeta = {},
  climate = null,
  requiredSections = null,
  ...options
}) {
  // Merge climate into location if provided separately
  const locationWithClimate = climate
    ? { ...location, climate }
    : location;

  return buildPromptWithContext(
    masterDNA,
    locationWithClimate,
    projectContext,
    blendedStyle,
    { projectMeta, requiredSections, ...options }
  );
}

/**
 * Build discipline-specific A1 prompt (ARCH, STRUCTURE, MEP)
 *
 * @param {Object} options - Options including discipline
 * @returns {Object} { prompt, negativePrompt, systemHints }
 */
export function buildDisciplineA1Prompt({ discipline = 'ARCH', ...options }) {
  // For non-ARCH disciplines, modify the prompt accordingly
  const result = buildPromptWithContext(
    options.masterDNA || options.dna,
    options.location,
    options.projectContext,
    options.blendedStyle,
    { ...options, sheetType: discipline }
  );

  if (discipline !== 'ARCH') {
    // Add discipline-specific modifications
    result.prompt = `[${discipline} DISCIPLINE SHEET]\n\n${result.prompt}`;
  }

  return result;
}

/**
 * Generate A1 sheet metadata for tracking
 *
 * @param {Object} options - Metadata options
 * @returns {Object} Metadata object
 */
export function generateA1SheetMetadata(options = {}) {
  return {
    designId: options.designId || `A1-${Date.now()}`,
    seed: options.seed || Math.floor(Math.random() * 2147483647),
    timestamp: new Date().toISOString(),
    version: options.version || '1.0',
    discipline: options.discipline || 'ARCH',
    projectType: options.projectType || 'residential',
    promptVersion: DEFAULT_PROMPT_VERSION
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildPrompt,
  buildPromptWithContext,
  withConsistencyLock,
  withConsistencyLockCompact,
  strongNegativesForLayoutDrift,
  buildCompactModifyPrompt,
  buildA1SheetPrompt,
  buildDisciplineA1Prompt,
  generateA1SheetMetadata,
  NON_RESIDENTIAL_TYPES,
  DEFAULT_PROMPT_VERSION
};
