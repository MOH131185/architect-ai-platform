/**
 * A1 Sheet Prompt Generator
 *
 * Generates a comprehensive prompt for a single A1 architectural presentation sheet
 * that includes all views: floor plans, elevations, sections, 3D views, and title block.
 *
 * ISO A1 Standard (Landscape): 841mm × 594mm
 * High Resolution: 9933×7016 pixels @ 300 DPI (aspect ratio 1.414)
 * Professional architectural presentation standard
 * Note: This generates a complete A1 sheet with all required elements including
 *       Google Maps site plan integration and comprehensive dimension annotations.
 *
 * LOGGING: Uses centralized logger (Opus 4.1 compliant)
 */

import logger from '../utils/logger';

/**
 * Build Kontext A1 Prompt - Optimized for FLUX.1-kontext-max
 * Mirrors the professional prompt structure provided by the user
 * Focuses on clean, organized presentation board layout
 */
export function buildKontextA1Prompt({
  masterDNA,
  location,
  climate,
  portfolioBlendPercent = 70,
  projectMeta = {},
  projectContext = {},
  blendedStyle = null,
  siteShape = null,
  siteConstraints = null
}) {
  const dimensions = masterDNA.dimensions || {};
  const materials = masterDNA.materials || [];
  const materialsArray = Array.isArray(materials) ? materials : [];
  const rooms = masterDNA.rooms || [];
  const style = masterDNA.architecturalStyle || masterDNA.architectural_style?.name || projectMeta.style || 'Contemporary';
  
  // Extract project type - prioritize buildingProgram which is more reliable
  const projectTypeRaw = projectContext?.buildingProgram || projectContext?.projectType || masterDNA?.projectType || projectMeta?.projectType || 'three-bedroom family house';
  const projectType = projectTypeRaw; // Use as-is for now
  const locationDesc = location?.address || 'Birmingham, UK';
  const buildingProgram = projectContext?.buildingProgram || projectType;
  
  // Detect non-residential types - check both projectType and buildingProgram
  const nonResidentialTypes = ['clinic', 'hospital', 'office', 'retail', 'school', 'commercial', 'medical', 'healthcare', 'restaurant', 'shop', 'warehouse', 'industrial', 'dental-clinic'];
  const projectTypeLower = projectType.toLowerCase();
  const buildingProgramLower = (buildingProgram || '').toLowerCase();
  const isNonResidential = nonResidentialTypes.some(type => 
    projectTypeLower.includes(type) || buildingProgramLower.includes(type)
  );
  
  // Log for debugging
  logger.debug('Kontext Prompt - Project type extraction', {
    projectType,
    buildingProgram,
    isNonResidential,
    projectContextProgram: projectContext?.buildingProgram,
    projectContextType: projectContext?.projectType
  }, '📋');

  if (isNonResidential) {
    logger.info(`Non-residential detected: ${projectType}`, { buildingProgram }, '🏥');
    logger.debug(`Applying ${projectType} building restrictions (NOT a house)`);
  } else {
    logger.info(`Residential building: ${projectType}`, null, '🏠');
  }
  
  // Extract key specifications
  const length = dimensions.length || dimensions.width || 15;
  const width = dimensions.width || dimensions.depth || 12;
  const height = dimensions.height || dimensions.totalHeight || 7;
  const floorCount = dimensions.floorHeights?.length || dimensions.floor_count || dimensions.floors || 2;
  
  // Material description
  const materialDesc = materialsArray.length > 0
    ? materialsArray.map(m => `${m.name}${m.hexColor ? ` (${m.hexColor})` : ''}`).join(', ')
    : 'brick, timber, glass';
  
  // Climate context
  const climateDesc = climate?.type || location?.climate?.type || 'temperate oceanic';
  const sunPath = location?.sunPath?.optimalOrientation || 'south-facing';
  
  // Calculate areas with site constraints (with safe defaults)
  const siteArea = siteConstraints?.siteArea || location?.siteAnalysis?.area || location?.surfaceArea || '450m²';
  const siteAreaNumeric = typeof siteArea === 'string' ? parseFloat(siteArea) : siteArea;
  const safeSiteArea = !isNaN(siteAreaNumeric) && siteAreaNumeric > 0 ? siteAreaNumeric : 450;
  const buildableArea = siteConstraints?.buildableArea || Math.floor(safeSiteArea * 0.7);
  const builtUpArea = Math.round(length * width * floorCount);
  const costEstimate = `£${(builtUpArea * 1400).toLocaleString()}`;

  // Site constraints info
  const siteShapeDesc = siteConstraints?.shapeType || siteShape || 'rectangular';
  const setbacks = siteConstraints?.constraints || { frontSetback: 3, rearSetback: 3, sideSetbacks: [3, 3] };
  const buildingOrientation = siteConstraints?.orientation || masterDNA?.buildingOrientation || '0°';

  // Project metadata
  const projectName = projectMeta.name || `${style} ${buildingProgram}`;
  const architectName = 'ArchiAI Solution Ltd – Mohammed Reggab';
  const drawingDate = new Date().toLocaleDateString('en-GB');
  
  // Determine appropriate interior render description based on building type
  const interiorRenderDesc = isNonResidential
    ? (projectType.toLowerCase().includes('clinic') || projectType.toLowerCase().includes('medical') || projectType.toLowerCase().includes('healthcare')
        ? 'reception area and waiting room'
        : projectType.toLowerCase().includes('office')
        ? 'open office space'
        : projectType.toLowerCase().includes('retail') || projectType.toLowerCase().includes('shop')
        ? 'retail space'
        : projectType.toLowerCase().includes('school')
        ? 'classroom or corridor'
        : 'main interior space')
    : 'living/dining area';
  
  // Build project type restrictions for non-residential
  const projectTypeRestrictions = isNonResidential ? `
🚨 CRITICAL PROJECT TYPE RESTRICTIONS - ENFORCE STRICTLY:
- PROJECT TYPE: ${projectType.toUpperCase()} - This is a ${projectType} building, NOT a residential house
- NO single-family house features, NO residential house layout, NO bedrooms, NO kitchen (unless specified in program)
- NO pitched roof unless specified for ${projectType} buildings
- The building MUST be a ${projectType} building with appropriate spaces for its function
- Floor plans MUST show ${projectType}-appropriate spaces (reception, consultation rooms, offices, etc. for clinics)
- ALL architectural drawings must reflect ${projectType} building typology, NOT residential house typology
- Professional commercial/medical building appearance, NOT domestic residential appearance` : '';
  
  // Build the Kontext-optimized prompt
  const prompt = `Generate a single A1 architectural presentation sheet in LANDSCAPE orientation (841mm WIDE × 594mm TALL, aspect ratio 1.414:1, 300 DPI, 9933px WIDE × 7016px TALL) for a ${style.toLowerCase()} ${projectType} in ${locationDesc}.

🚨 CRITICAL ORIENTATION: This is a LANDSCAPE (horizontal) sheet - WIDTH (841mm) is GREATER than HEIGHT (594mm). NOT portrait.

${projectTypeRestrictions}

The A1 sheet must contain all architectural elements organized professionally and consistently, as if prepared by an architect for client presentation.

Content to include in the A1 sheet:

Title block and project info (bottom-right):
- Project title: ${projectName}, ${locationDesc}
- Architect: ${architectName}
- Drawing title: Architectural Presentation Sheet – A1
- Scale 1:100 / 1:50
- Date: ${drawingDate}, drawing number, and company logo.

Site & Climate context (top-left) - MANDATORY EMBEDDED:
- ACTUAL SITE MAP from ${locationDesc} showing REAL site shape (${siteShapeDesc}) with building footprint overlay
- Site boundaries clearly marked with property lines matching the detected Google Maps polygon
- Building footprint within site boundaries respecting setbacks (${setbacks.frontSetback}m front, ${setbacks.rearSetback}m rear, ${setbacks.sideSetbacks[0]}m sides)
- Building orientation: ${buildingOrientation} from north for optimal solar gain (building aligned to site shape)
- LARGE north arrow (minimum 5% of map size), scale bar with measurements
- Wind direction arrows and climate notes (${climateDesc} climate, ${sunPath} façade)
- Site analysis diagram showing: access points, solar path, prevailing winds, topography
- THIS SITE MAP MUST BE EMBEDDED IN THE A1 SHEET AND EXPORTED WITH THE FINAL OUTPUT

3D visuals (top-center) - PHOTOREALISTIC AND CONSISTENT:
- Main exterior perspective: Photorealistic render showing building from street view, ${materialDesc} façade${isNonResidential ? ` in ${projectType} building style` : ''}, with context (street, trees, people for scale)
- THIS MUST MATCH THE FLOOR PLANS AND ELEVATIONS EXACTLY - same form, materials, window positions, roof type
- Secondary exterior perspective: Different angle (side or rear) showing depth and massing
- Interior render: ${interiorRenderDesc} with realistic lighting, materials matching external palette
- Axonometric/Exploded view: Technical 3D diagram showing floor plates, structure, and spatial organization labeled "Design Concept"
- ALL 3D views must depict the SAME BUILDING from the plans/elevations with IDENTICAL materials and proportions

Architectural drawings (ALL MANDATORY - MUST BE CONSISTENT WITH SAME PROJECT DNA):
- Ground floor plan (1:100): COMPLETE LAYOUT with ${isNonResidential ? `${projectType}-appropriate spaces` : 'all rooms labeled'}, furniture, dimensions, door swings, wall thicknesses
- First/Upper floor plan (1:100): COMPLETE LAYOUT matching ground floor footprint, ${isNonResidential ? 'functional spaces' : 'bedrooms and bathrooms'}, dimensions
- Roof plan (1:200): showing roof form, materials, drainage, PV panels if applicable
- Four elevations (ALL REQUIRED):
  * North elevation (1:100): COMPLETE facade with windows, doors, materials, height dimensions
  * South elevation (1:100): COMPLETE facade matching building DNA, different from north
  * East elevation (1:100): COMPLETE side facade with gable/party wall details
  * West elevation (1:100): COMPLETE side facade consistent with building form
- Two building sections (BOTH MANDATORY):
  * Section A-A (1:100): Longitudinal cut through ${isNonResidential ? 'main circulation' : 'stair and living spaces'}, showing floor-to-floor heights, roof structure, foundations
  * Section B-B (1:100): Transverse cut through building showing width, room heights, structural bays
- ALL drawings must show the SAME BUILDING with CONSISTENT dimensions (${length}m × ${width}m × ${height}m), materials (${materialDesc}), and architectural style (${style})

Material and style legend (top-right) - COMPLETE SPECIFICATION:
- Material palette showing ${materialDesc} with hex colors and texture samples
- Each material labeled with: name, application (walls/roof/windows), sustainability rating
- Architectural style label: "${style}" with key characteristics
- Design DNA panel showing: building dimensions (${length}m × ${width}m × ${height}m), floor count (${floorCount}), total area (${builtUpArea}m²)
- Local context integration: "Responding to ${locationDesc} vernacular architecture and ${climateDesc} climate"
- Portfolio style reference: "${blendedStyle?.styleName || style}" influence${portfolioBlendPercent > 0 ? ` (${portfolioBlendPercent}% portfolio blend)` : ''}

Project data table (bottom-right):
- Site area: ${siteArea}, buildable area: ${buildableArea}m²
- Built-up area: ${builtUpArea}m², site coverage: ${buildableArea > 0 ? Math.round((length * width) / buildableArea * 100) : 'N/A'}%
- Floors: ${floorCount}, height: ${height}m, orientation: ${buildingOrientation}
- Climate zone: ${climateDesc}, estimated construction cost: ${costEstimate}.
- Environmental data and reasoning:
  - Solar exposure, cross-ventilation arrows, PV panels on roof, and brief sustainability notes.

Visual style:
- Clean, minimal layout with light beige or white background.
- Consistent line thickness, modern sans-serif fonts, and proportional spacing.
- All drawings, diagrams, and visuals aligned to grid.
- Architectural realism in 3D views, not cartoonish.

🔤 CRITICAL TEXT REQUIREMENTS - MUST BE READABLE:
- ALL TEXT must be LARGE, BOLD, and CRYSTAL CLEAR - easily readable when zoomed
- Minimum text height: 3-5% of sheet height for body text, 8-12% for titles
- Use BOLD SANS-SERIF fonts (Arial, Helvetica, Futura) in BLACK or DARK GRAY
- Title block text: EXTRA LARGE (project name must be 10%+ of title block height)
- Dimension labels: BOLD with clear leader lines, minimum 2-3% of drawing height
- Room labels on floor plans: LARGE UPPERCASE, minimum 4% of plan height
- Scale bars: BOLD numbers, minimum 3% height
- North arrows: LARGE clear arrows with "N" label minimum 5% of map size
- Material labels: LARGE readable text next to each material swatch
- All numbers (dimensions, areas, dates): BOLD and LARGE, minimum 2.5% height
- NEVER use small, thin, or fine text that becomes illegible when viewed at full size
- Text contrast ratio: minimum 7:1 (dark text on light background)
- All critical information (dimensions, room names, scales) must be PROMINENTLY SIZED

Output format:
- One single A1 sheet showing the complete project.
- Orientation: Landscape (horizontal).
- Resolution: 300 DPI equivalent quality.
- Text optimized for professional printing and screen viewing at high zoom levels.

MANDATORY PANELS (MUST ALL EXIST ON THE SHEET):
- Site/Location plan (1:1250) with north arrow and scale bar
- Ground floor plan (1:100) and First/Upper floor plan (if multi‑storey)
- Four elevations: North, South, East, West (1:100)
- Two sections: Section A‑A and Section B‑B (1:100)
- 3D exterior perspective and axonometric view; one interior perspective
- Material palette panel, environmental performance panel, and UK RIBA title block
Never omit panels. If uncertain, synthesize a clean technical drawing consistent with the Design DNA.

🎯 ABSOLUTE CONSISTENCY REQUIREMENTS (STRICTLY ENFORCE):
1. SAME BUILDING DNA ACROSS ALL VIEWS:
   - Building footprint dimensions: EXACTLY ${length}m × ${width}m in ALL plans, elevations, sections, and 3D views
   - Building height: EXACTLY ${height}m in ALL elevations, sections, and 3D views
   - Materials: EXACTLY ${materialDesc} in ALL views (plans show material hatching, elevations show textures, 3D shows realistic materials)
   - Roof type: EXACTLY ${masterDNA?.materials?.roof?.type || 'gable'} in ALL elevations, sections, and 3D views
   - Window count and positions: MUST MATCH between elevations and floor plans
   - Door positions: MUST MATCH between floor plans and elevations
   
2. GEOMETRIC CONSISTENCY:
   - Floor plan footprint shape MUST match site plan building outline
   - Elevation widths MUST match floor plan dimensions (North/South = ${length}m, East/West = ${width}m)
   - Section cut lines MUST align with actual floor plan layout
   - 3D perspective views MUST show the exact building from the floor plans
   
3. SITE INTEGRATION:
   - Building MUST fit within ${siteShapeDesc} site respecting all setbacks
   - Building orientation ${buildingOrientation} MUST be consistent in site plan, floor plans, and 3D views
   - Site map MUST show ACTUAL location ${locationDesc} with real context
   
4. STYLE CONSISTENCY:
   - ${style} architectural language MUST be evident in ALL views
   - ${blendedStyle ? `Portfolio style influence (${blendedStyle.styleName})` : 'Local architectural context'} MUST be reflected in design details
   - Climate-responsive design for ${climateDesc} climate MUST be visible (overhangs, shading, ventilation)

Goal:
Produce one unified, coherent A1 sheet that looks like a professional architectural presentation board prepared for a REAL project at ${locationDesc}. This must be the SAME BUILDING shown consistently across all 12+ views (site, plans, elevations, sections, 3D). Every dimension, material, and design element must match perfectly between technical drawings and photorealistic renders. ALL TEXT AND NUMBERS MUST BE LARGE ENOUGH TO READ CLEARLY WHEN THE IMAGE IS ZOOMED OR PRINTED AT A1 SIZE.${isNonResidential ? ` CRITICAL: This is a ${projectType} building, NOT a house - all views must reflect commercial/medical/industrial building typology, NOT residential.` : ''}`;

  // Build negative prompt with project-type-specific restrictions + CONSISTENCY + TEXT CLARITY
  const baseNegativePrompt = `(single 3D view only:3.0), (one large rendering:3.0), (perspective photo only:3.0), (exterior view only:3.0), (single elevation view:3.0),
(no floor plans:3.0), (no elevations:3.0), (no sections:3.0), (missing architectural drawings:3.0), (no technical drawings:3.0),
(no site plan:3.0), (missing site map:3.0), (no site context:3.0),
(inconsistent dimensions:3.5), (different building in each view:3.5), (mismatched elevations:3.5), (conflicting floor plans:3.5),
(different materials between views:3.0), (inconsistent roof:3.0), (varying building height:3.0), (inconsistent footprint:3.0),
(unrelated 3D views:3.0), (perspective not matching floor plan:3.0), (sections not matching elevations:3.0),
(missing north arrow:2.5), (no scale bars:2.5), (unlabeled rooms:2.5), (no dimensions:2.5),
(missing title block:2.5), (incomplete elevations:2.5), (partial sections:2.5),
graph paper grid, grid background, dotted grid, dot-matrix, placeholder boxes, ASCII boxes, lorem ipsum, gibberish text,
text-only labels, wireframe only, fake text blocks,
sketch lines, line drawing only, blueprint lines, construction diagram, technical schematic, empty boxes with labels,
unfilled shapes, collage of separate images, photomontage, template layout, form template,
blurry, low quality, distorted, watermark, text artifacts, unfinished, incomplete, draft quality,
multiple title blocks, cluttered layout, overlapping views, pixelated,
cartoonish, unrealistic, inconsistent materials, inconsistent colors, different building styles,
(tiny text:3.5), (small text:3.5), (illegible text:3.5), (unreadable text:3.5), (microscopic text:3.5),
(thin text:3.0), (fine print:3.0), (small labels:3.0), (tiny numbers:3.5), (small dimensions:3.5),
(faint text:3.0), (low contrast text:3.0), (gray text:2.5), (light text:2.5),
(compressed text:2.5), (squished text:2.5), (text too small to read:3.5),
text smaller than 2% of image height, labels smaller than 3% of drawing height,
generic site, placeholder site, fake location, unspecified site context`;

  const nonResidentialNegativePrompt = isNonResidential ? `,
(residential house:3.0), (single-family house:3.0), (house layout:3.0), (bedrooms:2.5), (residential kitchen:2.5), (domestic appearance:2.5),
(pitched roof house:2.5), (house facade:2.5), (residential typology:2.5), (house plan:2.5), (residential building:2.5),
NOT a house, NOT residential, NOT domestic, NOT single-family dwelling` : '';

  const negativePrompt = baseNegativePrompt + nonResidentialNegativePrompt;

  return {
    prompt,
    negativePrompt,
    systemHints: {
      targetAspectRatio: 1.414, // Landscape A1
      layoutType: 'professional_architectural_presentation_board',
      viewCount: '10+ views on single sheet',
      visualQuality: 'photorealistic_renders_and_colored_plans',
      presentationStyle: 'architecture_magazine_quality',
      avoidWireframes: true,
      consistencyPriority: 'high',
      seed: projectMeta.seed || Date.now()
    }
  };
}

/**
 * Builds a detailed A1 sheet prompt from Master DNA and context
 * @param {Object} params - Generation parameters
 * @param {Object} params.masterDNA - Validated Master DNA with dimensions, materials, rooms
 * @param {Object} params.location - Location data with address, climate, zoning
 * @param {Object} params.climate - Climate analysis data
 * @param {number} params.portfolioBlendPercent - Portfolio influence percentage (0-100)
 * @param {Object} params.projectMeta - Project metadata (name, type, etc.)
 * @param {Object} params.projectContext - Project context (building program, etc.)
 * @param {Object} params.blendedStyle - Blended local + portfolio style with materials, palette, articulation
 * @param {Object} params.siteShape - Site polygon shape data for inset map
 * @returns {Object} { prompt, negativePrompt, systemHints }
 */
export function buildA1SheetPrompt({
  masterDNA,
  location,
  climate,
  portfolioBlendPercent = 70,
  projectMeta = {},
  projectContext = {},
  blendedStyle = null,
  siteShape = null,
  selectedDetails = null, // 🆕 Added for technical details
  siteConstraints = null, // 🆕 Added for site constraints
  sitePlanAttachment = null, // 🆕 Site plan image (base64 data URL) to embed
  sitePlanPolicy = 'embed' // 🆕 'embed' to use attachment, 'placeholder' to reserve empty box
}) {
  // Extract key DNA specifications
  const dimensions = masterDNA.dimensions || {};
  const materials = masterDNA.materials || [];
  const materialsArray = Array.isArray(materials) ? materials : [];
  const rooms = masterDNA.rooms || [];
  const viewFeatures = masterDNA.viewSpecificFeatures || {};
  const style = masterDNA.architecturalStyle || masterDNA.architectural_style?.name || projectMeta.style || 'Contemporary';

  // Site shape description
  const siteShapeDesc = siteConstraints?.shapeType || siteShape || 'rectangular';

  // 🆕 Extract project type and program spaces
  const projectType = projectContext?.projectType || masterDNA?.projectType || projectMeta?.projectType || null;
  const programSpaces = projectContext?.programSpaces || masterDNA?.programSpaces || [];
  
  // 🆕 Build program schedule string if available
  let programScheduleStr = '';
  if (programSpaces && programSpaces.length > 0) {
    const programTotal = programSpaces.reduce((sum, space) => 
      sum + (parseFloat(space.area || 0) * (space.count || 1)), 0
    );
    programScheduleStr = `
PROGRAM SCHEDULE (Must be displayed in title block area):
${programSpaces.map((space, idx) => 
  `- ${space.name || `Space ${idx + 1}`}: ${space.area || 'TBD'}m² × ${space.count || 1} = ${(parseFloat(space.area || 0) * (space.count || 1)).toFixed(0)}m²${space.level ? ` (Level: ${space.level})` : ''}`
).join('\n')}
TOTAL PROGRAM AREA: ${programTotal.toFixed(0)}m²`;
  }
  
  // 🆕 Build project type restrictions - STRENGTHENED for non-residential programs
  let projectTypeRestrictions = '';
  const nonResidentialTypes = ['clinic', 'hospital', 'office', 'retail', 'school', 'commercial', 'medical', 'healthcare'];
  const isNonResidential = projectType && nonResidentialTypes.some(type => projectType.toLowerCase().includes(type));
  
  if (isNonResidential) {
    projectTypeRestrictions = `
PROJECT TYPE: ${projectType.toUpperCase()} - CRITICAL RESTRICTIONS (ENFORCE STRICTLY):
- NO single-family house features, NO residential house layout, NO pitched roof unless specified
- NO bedrooms, NO kitchen unless specified in program
- The building MUST be a ${projectType} building, NOT a house
- CRITICAL: ALL REQUIRED SECTIONS MUST BE PRESENT:
  * Location Plan (with site context)
  * Ground Floor Plan (MANDATORY - showing ${projectType} layout)
  * Upper Floor Plan (if multiple floors)
  * ALL FOUR ELEVATIONS: North, South, East, West (MANDATORY - NO MISSING ELEVATIONS)
  * TWO SECTIONS: Section A-A (Longitudinal) AND Section B-B (Transverse) (BOTH REQUIRED)
  * 3D EXTERIOR VIEW (MANDATORY)
  * 3D AXONOMETRIC VIEW (MANDATORY)
  * INTERIOR PERSPECTIVE (if applicable)
  * MATERIAL PALETTE PANEL (MANDATORY)
  * ENVIRONMENTAL PERFORMANCE PANEL (MANDATORY)
  * UK RIBA TITLE BLOCK (MANDATORY)
- NO placeholder boxes, NO empty sections, NO missing views
- Professional architectural presentation quality required`;
  }

  // Build material description - handle both array and object formats
  let materialDesc = '';
  if (Array.isArray(materials)) {
    materialDesc = materials
      .map(m => `${m.name} ${m.hexColor || ''} for ${m.application}`)
      .join(', ');
  } else if (typeof materials === 'object' && materials !== null) {
    // Handle object format: {exterior: {primary: 'brick', color_hex: '#...'}, roof: {...}}
    const parts = [];
    if (materials.exterior?.primary) {
      parts.push(`${materials.exterior.primary} ${materials.exterior.color_hex || ''} for exterior walls`);
    }
    if (materials.roof?.material) {
      parts.push(`${materials.roof.material} ${materials.roof.color_hex || ''} for roof`);
    }
    if (materials.secondary) {
      parts.push(`${materials.secondary} for accents`);
    }
    materialDesc = parts.join(', ');
  }

  // Fallback if no materials found
  if (!materialDesc) {
    materialDesc = 'contemporary materials';
  }

  // Build dimensional specs - handle missing values
  const length = dimensions.length || dimensions.width || 15;
  const width = dimensions.width || dimensions.depth || 12;
  const height = dimensions.height || dimensions.totalHeight || 7;
  const dimDesc = `${length}m × ${width}m × ${height}m total height`;

  // Floor count - handle multiple possible property names
  const floorCount = dimensions.floorHeights?.length ||
                     dimensions.floor_count ||
                     dimensions.floors ||
                     2;
  const floorDesc = floorCount === 1 ? 'single-story' : `${floorCount}-story`;

  // Extract room layout for floor plans - safely handle non-array rooms
  let groundFloorRooms = '';
  let upperFloorRooms = '';

  if (Array.isArray(rooms) && rooms.length > 0) {
    groundFloorRooms = rooms
      .filter(r => r.floor === 'ground' || r.floor === 0)
      .map(r => `${r.name} ${r.dimensions || ''}`)
      .join(', ');

    upperFloorRooms = rooms
      .filter(r => r.floor === 'upper' || r.floor === 1)
      .map(r => `${r.name} ${r.dimensions || ''}`)
      .join(', ');
  } else {
    // Fallback room layouts
    groundFloorRooms = 'Living room, Kitchen, Entry';
    if (floorCount > 1) {
      upperFloorRooms = 'Bedrooms, Bathrooms';
    }
  }

  // Build view-specific features for elevations
  const northFeatures = viewFeatures.north
    ? `North: ${viewFeatures.north.mainEntrance ? 'main entrance centered' : ''} ${viewFeatures.north.windows || 0} windows`
    : 'North elevation';

  const southFeatures = viewFeatures.south
    ? `South: ${viewFeatures.south.patioDoors ? 'large patio doors' : ''} ${viewFeatures.south.windows || 0} windows`
    : 'South elevation';

  const eastFeatures = viewFeatures.east
    ? `East: ${viewFeatures.east.windows || 0} windows`
    : 'East elevation';

  const westFeatures = viewFeatures.west
    ? `West: ${viewFeatures.west.windows || 0} windows`
    : 'West elevation';

  // Climate and location context
  const climateDesc = climate?.type || location?.climate?.type || 'temperate';
  const locationDesc = location?.address || 'residential location';
  const avgTemp = climate?.seasonal?.summer?.avgTemp || climate?.seasonal?.winter?.avgTemp || '15°C';
  const sunPath = location?.sunPath?.optimalOrientation || 'South-facing';

  // Calculate areas
  const siteArea = location?.siteAnalysis?.area || '450m²';
  const builtUpAreaNumeric = (length * width * floorCount);
  const builtUpArea = builtUpAreaNumeric.toFixed(0) + 'm²';
  const costEstimate = `£${(parseInt(builtUpAreaNumeric) * 1400).toLocaleString()}`; // £1400/m² avg

  // Project metadata - UK RIBA standards
  const projectName = projectMeta.name || `${style} ${projectContext?.buildingProgram || 'Residence'}`;
  const drawingDate = new Date().toLocaleDateString('en-GB');
  const revisionNumber = 'A';
  const clientName = projectContext?.clientName || 'Private Client';
  const projectRef = `P${Date.now().toString().slice(-6)}`;
  const planningRef = `PP/2025/${projectRef}`;

  // UK Professional details
  const architectName = 'ArchiAI Solutions Ltd';
  const arbNumber = 'ARB 123456'; // Architects Registration Board number
  const practiceAddress = 'London, UK';
  const ribaStage = 'Stage 3 - Spatial Coordination';

  // Build comprehensive professional A1 sheet prompt - UK RIBA Standards
  // 🔒 LANDSCAPE ORIENTATION ENFORCEMENT: 841×594mm (width×height), NOT 594×841mm
  const prompt = `Professional UK RIBA A1 architectural presentation sheet in LANDSCAPE orientation (841mm WIDE × 594mm TALL) for a ${floorDesc} ${style.toLowerCase()} ${projectType || 'building'} in ${locationDesc}.

🎯 ULTRA HIGH QUALITY ARCHITECTURAL DRAWING with ALL OF THE FOLLOWING MANDATORY ELEMENTS:
✅ MULTIPLE PHOTOREALISTIC 3D RENDERS (exterior perspective, axonometric, street view) - NO MISSING 3D VIEWS
✅ COMPLETE FLOOR PLANS (ground floor + upper floors if multi-story) WITH DIMENSION LINES - NO MISSING FLOOR PLANS
✅ ALL FOUR ELEVATIONS (North, South, East, West) WITH DIMENSIONS - NO MISSING ELEVATIONS
✅ TWO SECTIONS (Longitudinal A-A, Transverse B-B) WITH DIMENSIONS - NO MISSING SECTIONS
✅ DETAILED SITE PLAN showing building in context with boundaries and landscaping
✅ Professional material palette with swatches and specifications
✅ Clear dimension lines with arrowheads and measurements on ALL technical drawings
✅ Large readable text labels (minimum 3% of drawing height)
✅ Bold room names and area calculations
✅ Complete title block with project information
This is a UK RIBA Stage 3 Detailed Design presentation for PROFESSIONAL ARCHITECTURAL SUBMISSION.
Competition/Client Presentation Standard - ALL ELEMENTS MUST BE PRESENT.

🚨 CRITICAL: This is a LANDSCAPE sheet with WIDTH (841mm) GREATER than HEIGHT (594mm).

🎯 CRITICAL LAYOUT INSTRUCTION: This is ONE UNIFIED PRESENTATION BOARD showing MULTIPLE ARCHITECTURAL VIEWS arranged in a professional grid layout. NOT a single 3D rendering - this must show MANY different views (plans, elevations, sections, 3D, data) organized on ONE SHEET like an architectural competition board or client presentation poster.

═══════════════════════════════════════════════════════════════
VISUAL GRID STRUCTURE (Professional Architectural Presentation Board):
═══════════════════════════════════════════════════════════════

BACKGROUND: Plain white or neutral background with NO grid lines, NO graph paper, NO ruled lines. Clean, minimal, professional architectural presentation board.

GRID LAYOUT (Divided into clear rectangular sections with thin black borders):

┌─────────────────────────────────────────────────────────────┐
│ [SITE PLAN]       [3D EXTERIOR]        [MATERIAL PALETTE]  │ ← TOP ROW (Site plan MUST be top-left)
├─────────────────────────────────────────────────────────────┤
│ [GROUND FLOOR]    [FIRST FLOOR]        [AXONOMETRIC 3D]    │ ← ROW 2 (Floor plans MANDATORY)
├─────────────────────────────────────────────────────────────┤
│ [NORTH ELEV]      [SOUTH ELEV]         [PROJECT DATA]      │ ← ROW 3
├─────────────────────────────────────────────────────────────┤
│ [EAST ELEV]       [WEST ELEV]          [ENVIRONMENTAL]     │ ← ROW 4
├─────────────────────────────────────────────────────────────┤
│ [SECTION A-A]     [SECTION B-B]        [TITLE BLOCK]       │ ← ROW 5
└─────────────────────────────────────────────────────────────┘

🚨 CRITICAL LAYOUT REQUIREMENTS:
- SITE PLAN: TOP LEFT corner (will be composited from captured map)
- GROUND FLOOR PLAN: MUST be in ROW 2 LEFT position - MANDATORY, cannot be missing
- FIRST FLOOR PLAN: MUST be in ROW 2 CENTER if building has multiple floors
- All floor plans must be TRUE 2D OVERHEAD VIEWS (NO perspective, NO 3D effect)

Each rectangular section is a SEPARATE DRAWING OR VIEW. All sections are visible simultaneously on the same sheet. Thin black lines separate each section. Modern sans-serif labels above each section.

MANDATORY PANELS (NEVER MISSING – MUST APPEAR TOGETHER ON ONE A1 SHEET - UK RIBA STANDARD):
🚨 CRITICAL: ALL PANELS MUST BE PRESENT IN THEIR EXACT POSITIONS - NO MISSING ELEMENTS ALLOWED:

1. SITE PLAN (MANDATORY - TOP LEFT ONLY):
   - Position: TOP LEFT CORNER (x: 0-25% width, y: 0-20% height) - ABSOLUTE POSITION LOCK
   - Scale: 1:1250
   - Must include: north arrow, scale bar, site boundaries, building footprint, surrounding context
   - DO NOT place site plan in any other position
   - DO NOT omit site plan

2. FLOOR PLANS (MANDATORY - ROW 2):
   - GROUND FLOOR PLAN: ROW 2 LEFT position (MANDATORY - cannot be missing)
   - FIRST/UPPER FLOOR PLAN: ROW 2 CENTER position (if multi-storey)
   - Scale: 1:100
   - Must include: room labels, dimensions, north arrow, grid references
   - DO NOT omit floor plans
   - DO NOT place floor plans in wrong row

3. ELEVATIONS (MANDATORY - ALL FOUR REQUIRED):
   - NORTH ELEVATION: ROW 3 LEFT position
   - SOUTH ELEVATION: ROW 3 CENTER position
   - EAST ELEVATION: ROW 4 LEFT position
   - WEST ELEVATION: ROW 4 CENTER position
   - Scale: 1:100
   - Must include: dimension lines, level markers, material annotations
   - DO NOT omit any elevations - ALL FOUR ARE REQUIRED

4. SECTIONS (MANDATORY - BOTH REQUIRED):
   - SECTION A-A (Longitudinal): ROW 5 LEFT position
   - SECTION B-B (Transverse): ROW 5 CENTER position
   - Scale: 1:100
   - Must include: dimension lines, level markers, structural details
   - DO NOT omit sections - BOTH ARE REQUIRED

5. 3D VIEWS (MANDATORY):
   - EXTERIOR PERSPECTIVE: TOP CENTER position
   - AXONOMETRIC VIEW: TOP RIGHT or ROW 2 RIGHT position
   - INTERIOR PERSPECTIVE: BOTTOM LEFT position
   - Must be photorealistic renders
   - DO NOT omit 3D views

6. DATA PANELS (MANDATORY):
   - MATERIAL PALETTE: TOP RIGHT or dedicated panel
   - ENVIRONMENTAL PERFORMANCE: MIDDLE RIGHT or dedicated panel
   - PROJECT DATA: MIDDLE LEFT or dedicated panel
   - UK RIBA TITLE BLOCK: BOTTOM RIGHT position (MANDATORY)
   - DO NOT omit data panels or title block

If any information is ambiguous, SYNTHESIZE a clean technical drawing consistent with the Design DNA. Do NOT omit panels, do NOT use placeholder text blocks, do NOT use grid backgrounds, and do NOT rearrange the layout - positions are FIXED per UK RIBA standards.

${projectTypeRestrictions}
${projectTypeRestrictions ? `\n🚨 PROJECT TYPE: ${projectType.toUpperCase()} - NOT a house, MUST be a ${projectType} building with appropriate spaces.` : ''}
${programScheduleStr ? `\n📋 PROGRAM SPACES REQUIRED in floor plans: ${programSpaces.map(s => `${s.name}: ${s.area}m²`).slice(0, 5).join(', ')}` : ''}

═══════════════════════════════════════════════════════════════
🔤 CRITICAL TEXT REQUIREMENTS - MUST BE READABLE AT ALL ZOOM LEVELS:
═══════════════════════════════════════════════════════════════

ALL TEXT must be LARGE, BOLD, and CRYSTAL CLEAR - easily readable when zoomed or printed at A1 size:

MINIMUM TEXT SIZES (percentage of sheet/drawing height):
- Title block project name: EXTRA LARGE, minimum 12% of title block height, BOLD BLACK
- Section labels (GROUND FLOOR PLAN, NORTH ELEVATION, etc.): LARGE BOLD, minimum 5-6% of section height
- Dimension labels and numbers: BOLD, minimum 3-4% of drawing height with clear leader lines
- Room labels on floor plans: LARGE UPPERCASE, minimum 4-5% of plan height
- Material labels and specifications: BOLD text, minimum 3% height next to material swatches
- Title block data (date, scale, drawing number): BOLD, minimum 2.5-3% of title block height
- North arrows: LARGE "N" label, minimum 8% of north arrow size
- Scale bars: BOLD numbers and labels, minimum 3-4% height
- All dimension numbers (meters, areas, heights): BOLD, minimum 3% of drawing height
- Regulatory notes and compliance text: Minimum 2-2.5% of panel height

FONT SPECIFICATIONS:
- Use BOLD SANS-SERIF fonts ONLY: Arial Black, Helvetica Bold, Futura Bold, or similar
- ALL text in BLACK or VERY DARK GRAY (minimum contrast ratio 7:1 against light background)
- NO thin fonts, NO fine print, NO light gray text that becomes illegible

TEXT PLACEMENT AND CLARITY:
- Text must have clear white/light background or halo for contrast
- Dimension text must be positioned clearly above/beside dimension lines
- Room labels centered in rooms with ample spacing
- No text smaller than 2% of image height anywhere on the sheet
- All critical information (dimensions, room names, scales, levels) PROMINENTLY SIZED

SPECIFICALLY ENSURE READABLE:
- Every dimension number on plans, elevations, and sections
- Every room name and area measurement
- All level markers (Ground 0.00, Floor +${(height/floorCount).toFixed(2)}m, etc.)
- Project name, architect name, client name in title block
- Scale indicators (1:100, 1:200, etc.)
- Material specifications and hex color codes
- Regulatory compliance notes
- Date, drawing number, revision letter

🚨 TEXT READABILITY IS CRITICAL: If text cannot be easily read when zoomed to 200-300%, the drawing is UNACCEPTABLE and must be regenerated with larger text.

═══════════════════════════════════════════════════════════════
DETAILED CONTENT FOR EACH SECTION OF THE GRID:
═══════════════════════════════════════════════════════════════

**TOP LEFT - SITE PLAN / LOCATION PLAN (Scale 1:1250) - MANDATORY - ABSOLUTE POSITION LOCK:**
🚨 CRITICAL POSITIONING: SITE PLAN MUST BE IN TOP LEFT CORNER (x: 0-25% width, y: 0-20% height) - NO OTHER POSITION ACCEPTABLE.
🚨 CRITICAL: This is a UK RIBA standard A1 sheet - site plan position is FIXED at top-left, cannot be moved or omitted.

${sitePlanAttachment && sitePlanAttachment.startsWith('data:') ? `
📍 CAPTURED SITE PLAN INTEGRATION (Scale 1:1250):
- A site plan was captured from Google Maps showing the actual location context
- Location: ${locationDesc || 'Site location'}
- Coordinates: ${location && location.coordinates ? `${location.coordinates.lat.toFixed(4)}°N, ${Math.abs(location.coordinates.lng).toFixed(4)}°${location.coordinates.lng < 0 ? 'W' : 'E'}` : 'Not specified'}
- Site boundaries: ${location?.sitePolygon?.length > 0 ? `Irregular polygon with ${location.sitePolygon.length} vertices matching the captured map` : siteShapeDesc === 'rectangular' ? 'Rectangular plot approximately 30m × 20m' : `${siteShapeDesc} plot approximately 30m × 20m`}
- Generate a DETAILED ARCHITECTURAL SITE PLAN that matches the captured Google Maps context
- Show the building footprint positioned within the actual site boundaries from the map
- Include surrounding context from the map: adjacent buildings, roads, pathways, landmarks
- Preserve geographic features visible in the captured map (roads, green spaces, water features)
- Include landscaping: trees, gardens, parking areas, driveways matching the map context
- Road access from ${location?.address?.includes('Street') ? 'street' : 'road'} with clear entrance matching map
- North arrow pointing UP (large, clear, BLACK arrow with "N" label) - MUST match map orientation
- Scale bar showing 0-10-20-30m measurements
- Site address label: "${locationDesc}" in BOLD text
- Planning reference: "${planningRef}"
- Property boundary lines in RED matching captured polygon
- Building footprint in SOLID BLACK with dimensions (${length}m × ${width}m)
- Setbacks labeled from all boundaries (e.g., "3m setback")
- Access paths and driveways with surface materials noted
- Trees and landscaping elements in green
- Parking spaces clearly marked if applicable
- ARCHITECTURAL DRAWING STYLE: Clean technical drawing based on captured map context, NOT satellite photo overlay` : (location && location.coordinates) ? `
📍 AI-GENERATED SITE PLAN (Scale 1:1250):
- Generate a DETAILED ARCHITECTURAL SITE PLAN showing the building in its actual location
- Location: ${locationDesc || 'Site location'}
- Coordinates: ${location.coordinates ? `${location.coordinates.lat.toFixed(4)}°N, ${Math.abs(location.coordinates.lng).toFixed(4)}°${location.coordinates.lng < 0 ? 'W' : 'E'}` : 'Not specified'}
- Site boundaries: ${location?.sitePolygon?.length > 0 ? `Irregular polygon with ${location.sitePolygon.length} vertices` : siteShapeDesc === 'rectangular' ? 'Rectangular plot approximately 30m × 20m' : `${siteShapeDesc} plot approximately 30m × 20m`}
- Building footprint positioned within site boundaries
- Show surrounding context: adjacent buildings, roads, pathways
- Include landscaping: trees, gardens, parking areas, driveways
- Road access from ${location?.address?.includes('Street') ? 'street' : 'road'} with clear entrance
- North arrow pointing UP (large, clear, BLACK arrow with "N" label)
- Scale bar showing 0-10-20-30m measurements
- Site address label: "${locationDesc}" in BOLD text
- Planning reference: "${planningRef}"
- Property boundary lines in RED
- Building footprint in SOLID BLACK with dimensions
- Setbacks labeled from all boundaries (e.g., "3m setback")
- Access paths and driveways with surface materials noted
- Trees and landscaping elements in green
- Parking spaces clearly marked if applicable
- ARCHITECTURAL DRAWING STYLE: Clean technical drawing, NOT satellite photo style` : `
📍 SITE PLAN (Scale 1:1250) - MANDATORY:
- Generate a DETAILED ARCHITECTURAL SITE PLAN showing the building in context
- Create a clean technical site plan drawing (approximately 25% width, 20% height of sheet)
- Position: TOP LEFT CORNER ONLY (x: 0-25% width, y: 0-20% height) - ABSOLUTE POSITION
- Draw property boundaries with RED lines
- Show building footprint in SOLID BLACK within the plot
- Include surrounding context: neighboring buildings, roads
- Add landscaping elements: trees, gardens, pathways
- North arrow pointing UP (large, clear, BLACK)
- Scale bar showing 0-10-20-30m measurements
- Site address: "${locationDesc}" below the plan
- Planning reference: "${planningRef}"
- Setback dimensions from boundaries
- Access roads and driveways
- ARCHITECTURAL DRAWING STYLE: Clean technical drawing, NOT placeholder`}

**TOP CENTER - 3D EXTERIOR VIEW:**
Main 3D View: Photorealistic render of the ${floorDesc} ${materialDesc} building from SW corner showing front and side facades. EXACT MATERIALS throughout: ${materialDesc}. Building dimensions EXACTLY ${dimDesc}. Natural daylight, realistic shadows, UK suburban context with gardens and neighboring houses. Human figures for scale (1.7m height).${blendedStyle ? `\n\nCONSISTENT DESIGN DNA: ${blendedStyle.styleName || style} style. Materials MUST match in ALL views: ${Array.isArray(blendedStyle.materials) ? blendedStyle.materials.slice(0, 3).join(', ') : materialDesc}. Window count: ${viewFeatures.north?.windows || 4} north, ${viewFeatures.south?.windows || 3} south. ${blendedStyle.facadeArticulation || 'clean modern lines'}.` : ''}

**TOP RIGHT - MATERIAL PALETTE & AXONOMETRIC 3D VIEW:**
Material Palette panel showing material swatches with hex colors.
A 3D isometric/axonometric view showing the complete building from above at 30° angle. Shows all four facades simultaneously, roof structure visible, ${materialDesc} clearly depicted. Clean technical illustration style with light shading.

**ROW 2 LEFT - GROUND FLOOR PLAN (Scale 1:100) - MANDATORY - MUST BE PRESENT:**
🚨 CRITICAL: GROUND FLOOR PLAN IS MANDATORY AND MUST BE IN ROW 2 LEFT POSITION. NO MISSING FLOOR PLANS ALLOWED.

GROUND FLOOR PLAN: TRUE ORTHOGRAPHIC TOP VIEW (NO perspective, NO isometric, NO 3D, NO diagonal walls, NO tilted view). 
- Colored architectural plan showing ${groundFloorRooms}
- Walls in BLACK (${materialDesc}), 300mm external/100mm internal thickness
- Room names and areas labeled in LARGE BOLD text (m²)
- Door swings marked with arcs
- Window cills marked
- Grid references (A-D horizontal, 1-4 vertical)
- North arrow pointing UP

⚠️ CRITICAL: DIMENSION LINES MUST BE VISIBLE AND CLEAR:
- Dimension lines with arrowheads pointing to wall edges
- Overall building dimensions: ${length}m × ${width}m CLEARLY LABELED in BOLD text
- Room dimensions: Each room must show width × length in meters (e.g., "5.5m × 4.0m") in BOLD
- Grid-to-grid dimensions between columns
- Opening dimensions: Window widths and door widths marked
- NO dimension lines = INVALID DRAWING
- Floor plan MUST be TRUE 2D OVERHEAD VIEW - NO perspective distortion

**ROW 2 CENTER - FIRST FLOOR PLAN (Scale 1:100) - MANDATORY IF MULTI-STORY:**
${floorCount > 1 ? `FIRST FLOOR PLAN: Showing ${upperFloorRooms}, identical drawing conventions to ground floor plan.
- TRUE ORTHOGRAPHIC TOP VIEW (NO perspective, NO isometric, NO 3D)
- Stair direction arrows marked
- Same grid references as ground floor (A-D, 1-4)
- MUST INCLUDE dimension lines with arrowheads showing overall ${length}m × ${width}m and individual room dimensions
- Room names and areas labeled in LARGE BOLD text
- North arrow pointing UP` : 'UPPER FLOOR PLAN: Not applicable (single-story building)'}

**ROW 2 RIGHT - AXONOMETRIC 3D VIEW:**
Additional 3D EXTERIOR VIEW: Photorealistic perspective from street level showing main entrance and architectural character.

**MIDDLE LEFT - PROJECT DATA PANEL:**
Project information panel with site area, buildable area, and key metrics.

**MIDDLE CENTER - ELEVATIONS (Scale 1:100) - MANDATORY DIMENSION LINES REQUIRED:

🚨 CRITICAL: ALL FOUR ELEVATIONS MUST BE PRESENT: NORTH, SOUTH, EAST, WEST. NO MISSING ELEVATIONS ALLOWED. Each must show TRUE ORTHOGRAPHIC FLAT PROJECTION (NO perspective, NO 3D effect).**

NORTH ELEVATION (FRONT): ${northFeatures}. Building height EXACTLY ${height}m. Materials CONSISTENTLY ${materialDesc}. Windows and doors with dimensions. Roof pitch angle noted. Ground level line (0.00), floor levels (+${(height/floorCount).toFixed(2)}m), ridge level (+${height}m). MUST INCLUDE dimension lines with arrowheads showing vertical heights and horizontal widths.

REAR ELEVATION (SOUTH): ${southFeatures}. MUST show same building height ${height}m, same materials ${materialDesc}, same roof form. Different window arrangement from front. MUST INCLUDE dimension lines identical to front elevation format.

EAST ELEVATION: Building depth ${width}m visible. IDENTICAL materials and heights to front/rear. Dimension lines showing depth ${width}m, height ${height}m, floor levels. All materials annotated with specifications.

WEST ELEVATION: Building depth ${width}m visible. IDENTICAL materials and heights to front/rear. Dimension lines showing depth ${width}m, height ${height}m, floor levels. All materials annotated with specifications.

ALL ELEVATIONS: Flat orthographic projections with material hatching patterns per BS 1192. Consistent ${materialDesc} throughout ALL views. NO missing elevations - all four facades must be shown.

⚠️ CRITICAL DIMENSION REQUIREMENTS FOR ALL ELEVATIONS:
- Vertical dimension lines with arrowheads showing: Ground level to first floor ${(height/floorCount).toFixed(2)}m, First floor to roof ridge ${(height - height/floorCount).toFixed(2)}m, Total height ${height}m CLEARLY LABELED
- Horizontal dimension lines showing: Overall building width ${length}m (or depth ${width}m for side elevations), Window spacings and widths, Door widths
- Level markers: Ground (0.00), Floor (+${(height/floorCount).toFixed(2)}m), Ridge (+${height}m)
- Roof pitch angle annotation (e.g., "35° pitch")
- NO dimension lines = INVALID DRAWING

**MIDDLE RIGHT - SECTION DRAWINGS (Two cuts) - MANDATORY DIMENSION LINES REQUIRED:

🚨 CRITICAL: BOTH SECTIONS MUST BE PRESENT: SECTION A-A (Longitudinal) AND SECTION B-B (Transverse). NO MISSING SECTIONS ALLOWED. Each must show TRUE ORTHOGRAPHIC CUT VIEW (NO perspective, NO 3D effect).**

SECTION A-A (LONGITUDINAL): A colored section cut showing interior spaces vertically. Shows floor heights (${(height / floorCount).toFixed(2)}m per floor), foundation, floor slabs, roof structure, stair detail, wall construction. This is a slice through the building showing what's inside.

⚠️ CRITICAL: DIMENSION LINES MUST BE VISIBLE:
- Vertical dimension lines with arrowheads showing: Foundation depth (typically 0.5-1.0m), Ground floor height ${(height / floorCount).toFixed(2)}m CLEARLY LABELED, Upper floor height ${(height / floorCount).toFixed(2)}m CLEARLY LABELED (if applicable), Total height to ridge ${height}m CLEARLY LABELED
- Horizontal dimension lines showing: Overall building length ${length}m, Room widths along cut line, Wall thicknesses: 0.3m exterior, 0.15m interior
- Level markers: Ground (0.00), Floor (+${(height/floorCount).toFixed(2)}m), Ridge (+${height}m)
- NO dimension lines = INVALID DRAWING

SECTION B-B (TRANSVERSE): Perpendicular section cut showing structural spans, internal walls, windows/doors in section.

⚠️ CRITICAL: DIMENSION LINES MUST BE VISIBLE:
- Vertical dimension lines identical to Section A-A format
- Horizontal dimension lines showing: Overall building width ${width}m CLEARLY LABELED, Room depths along cut line, Wall thicknesses and structural spans
- Level markers consistent with Section A-A
- NO dimension lines = INVALID DRAWING

BOTH SECTIONS MUST SHOW: Foundation detail, floor slab construction, wall construction layers, roof structure, windows/doors in section view, stair detail (if cut through stairs).

${selectedDetails && selectedDetails.length >= 1 ? `**TECHNICAL PERFORMANCE SPECIFICATIONS:**

${selectedDetails.map((detail, idx) => {
  // Handle both old format (with callout) and new format (with title + specs)
  const title = detail.title || detail.callout?.title || detail.name || `Detail ${idx + 1}`;
  const specs = detail.specs || detail.callout?.annotations || [];

  return `${title.toUpperCase()}:
${Array.isArray(specs) ? specs.map(spec => `  • ${spec}`).join('\n') : specs}
${detail.callout?.climateSpecific?.length > 0 ? `  Climate-specific: ${detail.callout.climateSpecific.join(', ')}` : ''}`;
}).join('\n\n')}

These technical specifications ensure compliance with UK Building Regulations and climate-responsive design principles.` : ''}

**BOTTOM LEFT - INTERIOR PERSPECTIVE:**
A photorealistic 3D render showing the interior living space. Natural light streaming through windows, modern furniture, interior finishes visible, connection to exterior through large windows. High-quality architectural visualization.

**BOTTOM CENTER - PROFESSIONAL DATA PANELS:**

╔═══════════════════════════════════════════════════════════════╗
║ MATERIAL PALETTE & SPECIFICATIONS                              ║
╠═══════════════════════════════════════════════════════════════╣
${blendedStyle && blendedStyle.colorPalette ? `
║ PRIMARY FACADE:                                                ║
║   • Material: ${blendedStyle.materials?.[0] || materialsArray[0]?.name || 'Primary material'}
║   • Color: ${blendedStyle.colorPalette.facade || 'color'}       ║
║   • Application: All external walls, consistent across views   ║
║                                                                ║
║ ROOF SYSTEM:                                                   ║
║   • Material: ${blendedStyle.materials?.[1] || materialsArray[1]?.name || 'Roof material'}
║   • Color: ${blendedStyle.colorPalette.roof || 'roof color'}    ║
║   • Pitch: ${materialsArray.find(m => m.pitch)?.pitch || '35'}° (constant ALL views)  ║
║                                                                ║
║ TRIM & ACCENTS:                                                ║
║   • Frame color: ${blendedStyle.colorPalette.trim || 'trim'}    ║
║   • Accent color: ${blendedStyle.colorPalette.accent || 'accent'} ║
║   • Glazing: ${blendedStyle.glazingRatio || '20%'} of facade area ║
║                                                                ║
║ FACADE ARTICULATION:                                           ║
║   ${blendedStyle.facadeArticulation || 'Contemporary design with balanced proportions'}
║                                                                ║` :
`║ Materials: ${materialsArray.map(m => `${m.name} (${m.hexColor})`).join(', ')} ║`}
╚═══════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════╗
║ ENVIRONMENTAL PERFORMANCE & COMPLIANCE                         ║
╠═══════════════════════════════════════════════════════════════╣
║ CLIMATE ZONE: ${climateDesc}                                   ║
║ ORIENTATION: ${location?.sunPath?.optimalOrientation || 'South-facing'} (passive solar) ║
${selectedDetails && selectedDetails.length > 0 ? selectedDetails.map(detail => `║ ${detail.title?.toUpperCase() || 'TECHNICAL'}:
${detail.specs ? detail.specs.map(spec => `║   • ${spec}`).join('\n') : ''}
║`).join('') : ''}
║ UK BUILDING REGULATIONS COMPLIANCE:                            ║
║   Part A (Structure): Eurocode EN 1990-1999                    ║
║   Part B (Fire): 30min resistance, escape routes <9m           ║
║   Part L (Conservation): U-values Wall 0.18, Roof 0.13 W/m²K   ║
║   Part M (Access): Level threshold, 900mm doors, accessible WC ║
║                                                                ║
║ ENERGY PERFORMANCE:                                            ║
║   Target: EPC Band B (81-91)                                   ║
║   CO₂ Emissions: <15 kg/m²/year                                ║
║   Renewable: Solar-ready roof orientation                      ║
╚═══════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════╗
║ PROJECT DATA SUMMARY                                           ║
╠═══════════════════════════════════════════════════════════════╣
║ Gross Internal Area:    ${builtUpArea}                         ║
║ Site Area:               ${siteArea}                            ║
║ Building Footprint:      ${length}m × ${width}m                ║
║ Total Height:            ${height}m (to ridge)                 ║
║ Storeys:                 ${floorDesc}                          ║
║ Floor-to-Floor:          ${(height/floorCount).toFixed(2)}m   ║
║ Construction Type:       ${materialDesc.substring(0, 40)}...   ║
║ Estimated Cost:          ${costEstimate}                       ║
║ Construction Duration:   ${Math.ceil(builtUpAreaNumeric / 100)} months (est.) ║
╚═══════════════════════════════════════════════════════════════╝

**BOTTOM RIGHT - UK RIBA PROFESSIONAL TITLE BLOCK:**

╔═══════════════════════════════════════════════════════════════╗
║                    ARCHITECTURAL TITLE BLOCK                   ║
╠═══════════════════════════════════════════════════════════════╣
║ PROJECT INFORMATION:                                           ║
║   Project Name:      ${projectName}                            ║
║   Client:            ${clientName}                             ║
║   Site Address:      ${locationDesc}                           ║
║                                                                ║
║ DESIGN TEAM:                                                   ║
║   Lead Architect:    ${architectName}                          ║
║   ARB Registration:  ${arbNumber}                              ║
║   Practice:          ${practiceAddress}                        ║
║   Contact:           +44 20 7946 0000                          ║
║   Email:             info@architecture.uk                      ║
║                                                                ║
║ DRAWING INFORMATION:                                           ║
║   Drawing Title:     PROPOSED DEVELOPMENT                      ║
║                      General Arrangement - A1 Master Sheet     ║
║   Drawing Number:    GA-01-${projectRef}                       ║
║   Scale:             AS SHOWN @ A1 (841×594mm)                 ║
║   Date Issued:       ${drawingDate}                            ║
║   Drawn By:          CAD / AI-Assisted                         ║
║   Checked By:        PM                                        ║
║   Revision:          ${revisionNumber}                         ║
║                                                                ║
║ STATUTORY INFORMATION:                                         ║
║   RIBA Work Stage:   ${ribaStage} (Concept Design / Planning)  ║
║   Planning Ref:      ${planningRef}                            ║
║   Building Regs:     BR/2025/${projectRef}                     ║
║   Status:            FOR PLANNING APPLICATION                  ║
║                                                                ║
║ NOTES:                                                         ║
║   • All dimensions in metres unless noted                      ║
║   • Do not scale from this drawing                             ║
║   • Check all dimensions on site before construction           ║
║   • Report any discrepancies to architect immediately          ║
║                                                                ║
║ COPYRIGHT © ${new Date().getFullYear()} ${architectName}       ║
║ This drawing remains the property of the architect and must    ║
║ not be reproduced without written permission.                  ║
╚═══════════════════════════════════════════════════════════════╝

SHEET COMPOSITION REQUIREMENTS:
- Title block positioned bottom-right corner with professional border
- All text legible at minimum 2.5mm height when printed @ A1
- QR code or design hash (SHA256) in title block corner for verification
- Revision triangle symbol if revised (${revisionNumber === 'P01' ? 'none' : 'include'})
- North arrow symbol on all plan views
- Scale bars on all measured drawings (1:100, 1:200, etc.)
- Professional line weights: Heavy (walls) 0.5mm, Medium (details) 0.25mm, Light (grids) 0.13mm

═══════════════════════════════════════════════════════════════
CRITICAL UK CONSISTENCY REQUIREMENTS:
═══════════════════════════════════════════════════════════════

ABSOLUTE CONSISTENCY ACROSS ALL VIEWS:
- Building dimensions: EXACTLY ${dimDesc} in ALL views (plans, elevations, sections, 3D)
- Materials: EXACTLY ${materialDesc} throughout - same color, texture, appearance in EVERY view
- Window positions: IDENTICAL placement across floor plans, elevations, and 3D renders
- Roof form: SAME pitch angle, ridge height ${height}m, and materials in ALL views
- Floor heights: CONSISTENT ${(height/floorCount).toFixed(2)}m per floor throughout

MATERIAL ENFORCEMENT RULES (EXACT HEX COLORS REQUIRED):
${blendedStyle && blendedStyle.colorPalette ? `
- Facade material: EXACTLY ${blendedStyle.colorPalette.facade} in ALL exterior views (plans, elevations, 3D)
- Roof material: EXACTLY ${blendedStyle.colorPalette.roof} in ALL roof views (elevations, sections, 3D, axonometric)
- Trim/accents: EXACTLY ${blendedStyle.colorPalette.trim} for ALL window frames, door frames, fascia
- Accent color: EXACTLY ${blendedStyle.colorPalette.accent} for ALL doors and accent elements
- NO color variation allowed - same hex codes across ALL 10+ views
- Glazing ratio: ${blendedStyle.glazingRatio || '20%'} of facade area (consistent in ALL elevations)` :
`- Primary facade: ${materialsArray[0]?.hexColor || 'specified color'} in ALL views
- Secondary elements: ${materialsArray[1]?.hexColor || 'specified color'} in ALL views
- NO color variations between views`}

GEOMETRIC CONSTRAINT SPECIFICATIONS:
- Building footprint: ${length}m × ${width}m EXACTLY (tolerance ±0.0m - NO variations)
- Total height: ${height}m EXACTLY from ground to ridge (ALL elevations and 3D views)
- Floor-to-floor: ${(height/floorCount).toFixed(2)}m EXACTLY (every floor in ALL sections)
- Window dimensions: ${materialsArray.find(m => m.application?.includes('window'))?.dimensions || 'standard size'} IDENTICAL in ALL views
- Door dimensions: ${materialsArray.find(m => m.application?.includes('door'))?.dimensions || '0.9m × 2.1m'} IDENTICAL in ALL views
- Wall thickness: 0.3m exterior, 0.15m interior EXACTLY (ALL plans and sections)

CROSS-VIEW CONSISTENCY CHECKLIST:
✓ Floor Plans → Elevations: Every window on plan MUST appear on corresponding elevation at EXACT same position
✓ Floor Plans → Sections: Room dimensions on plan MUST match section cuts EXACTLY
✓ Elevations → 3D Views: Every facade feature (windows, doors, materials) MUST match 3D renders EXACTLY
✓ Sections → 3D Views: Interior ceiling heights in sections MUST match 3D interior views EXACTLY
✓ Axonometric → Perspective: Same building geometry, just different camera angles - ZERO dimensional changes
✓ Site Plan → All Views: Building footprint ${length}m × ${width}m MUST match ALL views EXACTLY
✓ Material Palette → All Views: Hex colors from palette MUST be used consistently - NO substitutions

UK ARCHITECTURAL STANDARDS:
- Title block: Full RIBA format with architect details, ARB number, client, drawing number
- Scales: Clearly marked on EVERY drawing (1:100 plans/elevations, 1:200 site, 1:50 details)
- North arrows: On ALL plans, pointing UP
- Grid references: Consistent A-D, 1-4 grid on all plans
- Dimensions: To grid lines, overall dimensions, opening sizes
- Levels: Ground 0.00, floor levels marked, FFL and SSL noted

DRAWING CONVENTIONS (BS 1192):
- Walls: Black fill for cut walls, grey for walls beyond
- Windows: Double lines with cill projection
- Doors: Arc showing swing direction
- Materials: Standard UK hatching patterns
- Text: 2.5mm minimum height, Arial/Helvetica font

REGULATORY COMPLIANCE SHOWN:
- Building Regulations Parts A, B, L, M compliance notes
- Planning application reference number
- Fire escape routes on plans (green arrows)
- Accessible routes and facilities marked
- U-values and thermal performance noted

Project: ${projectName}
Client: ${clientName}
Location: ${locationDesc}
Architect: ${architectName} (ARB: ${arbNumber})
Drawing: GA-01-${projectRef}

ALL VIEWS MUST BE PERFECTLY CONSISTENT - this is ONE BUILDING shown from multiple viewpoints, not different designs!`;

  // Enhanced negative prompt to avoid common issues and enforce material consistency
  const negativePrompt = `(portrait orientation:3.5), (vertical orientation:3.5), (594mm wide:3.5), (taller than wide:3.5), (height > width:3.5),
(single 3D view only:3.5), (one large rendering:3.5), (perspective photo only:3.5), (exterior view only:3.5), (single elevation view:3.5),
(no floor plans:3.5), (no elevations:3.5), (no sections:3.5), (missing architectural drawings:3.5), (no technical drawings:3.5),
(photograph instead of presentation board:3.0), (render without technical drawings:3.0), (just one building view:3.0),
(low quality:4.0), (incomplete sheet:4.0), (missing details:4.0), (unprofessional:4.0), (student work:4.0),
(only elevations:4.0), (missing 3D renders:4.0), (no 3D views:4.0), (only 2D drawings:3.5), (no photorealistic renders:4.0),
(poor architectural quality:4.0), (unprofessional presentation:4.0), (bad composition:3.5), (missing key elements:4.0),
(no floor plans:4.0), (elevations only:4.0), (single view:4.0), (one drawing:4.0), (incomplete views:4.0),
graph paper grid, grid background, placeholder boxes, ASCII boxes, text-only labels, wireframe only,
sketch lines, line drawing only, blueprint lines, construction diagram, technical schematic, empty boxes with labels,
unfilled shapes, collage of separate images, photomontage, template layout, form template,
(perspective in floor plans:2.0), (perspective in elevations:2.0), (3D floor plans:2.0), (isometric floor plans:2.0),
multiple separate images, different building designs, inconsistent materials, inconsistent colors,
blurry, low quality, distorted, watermark, text artifacts, unfinished, incomplete, draft quality,
multiple title blocks, cluttered layout, overlapping views, illegible text, pixelated,
missing dimension lines, plans without dimensions, elevations without dimensions, sections without dimensions,
no dimension arrows, no dimension labels, no measurement text, dimension lines missing, dimension text missing,
(floor plans without dimensions:2.0), (elevations without dimensions:2.0), (sections without dimensions:2.0),
(missing elevations:3.0), (only one elevation:3.0), (only two elevations:3.0), (three elevations missing one:3.0), (missing north elevation:3.0), (missing south elevation:3.0), (missing east elevation:3.0), (missing west elevation:3.0),
(missing sections:3.0), (only one section:3.0), (no longitudinal section:3.0), (no transverse section:3.0), (missing section A-A:3.0), (missing section B-B:3.0),
(missing 3D views:2.5), (no axonometric:2.5), (no exterior 3D:2.5), (placeholder sections:3.0), (empty sections:3.0), (incomplete A1 sheet:3.0),
(missing floor plan:4.0), (missing ground floor plan:4.0), (no ground floor plan:4.0), (floor plans missing:4.0), (missing location plan:4.0), (missing site plan:4.0), (site plan wrong position:4.0), (site plan middle:4.0), (site plan not top-left:4.0), (site plan bottom:4.0), (site plan right:4.0), (site plan covering sheet:4.0), (site plan overlay:4.0), (site plan composited:4.0), (site plan missing:4.0), (no site plan:4.0), (missing material palette:3.0), (missing environmental panel:3.0), (missing title block:4.0),
(tiny text:3.5), (small text:3.5), (illegible text:3.5), (unreadable text:3.5), (microscopic text:3.5),
(thin text:3.0), (fine print:3.0), (small labels:3.0), (tiny numbers:3.5), (small dimensions:3.5),
(faint text:3.0), (low contrast text:3.0), (gray text:2.5), (light text:2.5),
(compressed text:2.5), (squished text:2.5), (text too small to read:3.5),
text smaller than 2% of image height, labels smaller than 3% of drawing height, dimension text under 3% height,
(title block text too small:3.5), (unreadable room labels:3.5), (tiny dimension numbers:3.5),
(small scale indicators:3.0), (illegible material labels:3.0), (unreadable north arrow:3.0),
${blendedStyle && blendedStyle.colorPalette ? `
(facade color variations:1.5), (different brick colors:1.5), (inconsistent roof colors:1.5),
(material substitutions:1.5), (color palette deviations:1.5), (hex code variations:1.5),
(window frame color changes:1.5), (door color inconsistencies:1.5), (trim color variations:1.5),
(different material textures between views:1.5), (glazing ratio variations:1.5)` : ''}
(dimensional inconsistencies:1.5), (height variations between views:1.5), (footprint size changes:1.5),
(window position shifts:1.5), (door placement variations:1.5), (floor height changes:1.5),
(wall thickness inconsistencies:1.5), (roof pitch variations:1.5)`;

  // System hints for generation
  const systemHints = {
    targetAspectRatio: 1.414,
    layoutType: 'professional_architectural_portfolio_board',
    viewCount: '10+ views on single sheet',
    visualQuality: 'photorealistic_renders_and_colored_plans',
    presentationStyle: 'architecture_magazine_quality',
    avoidWireframes: true,
    consistencyPriority: 'high',
    seed: projectMeta.seed || Date.now()
  };

  return {
    prompt,
    negativePrompt,
    systemHints
  };
}

/**
 * Validates A1 sheet generation parameters
 * @param {Object} params - Parameters to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateA1SheetParams(params) {
  const errors = [];

  if (!params.masterDNA) {
    errors.push('Master DNA is required');
  }

  if (!params.masterDNA?.dimensions) {
    errors.push('DNA must include dimensions');
  }

  if (!params.masterDNA?.materials || params.masterDNA.materials.length === 0) {
    errors.push('DNA must include materials');
  }

  if (!params.location && !params.climate) {
    errors.push('Either location or climate data is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generates metadata for A1 sheet
 * @param {Object} params - Generation parameters
 * @returns {Object} Metadata object
 */
export function generateA1SheetMetadata(params) {
  return {
    format: 'A1',
    orientation: 'landscape', // ALWAYS landscape (width > height)
    dimensions: {
      mm: { width: 841, height: 594 }, // Landscape: WIDTH is GREATER than height
      px: { width: 9933, height: 7016 }, // 300 DPI landscape
      dpi: 300,
      printDPI: 300,
      printPx: { width: 9933, height: 7016 },
      ratio: 1.414, // width / height (always > 1 for landscape)
      isLandscape: true, // Explicit landscape flag
      isPortrait: false
    },
    generatedAt: new Date().toISOString(),
    dnaVersion: params.masterDNA?.version || '1.0',
    portfolioBlend: params.portfolioBlendPercent || 70,
    location: params.location?.address || 'Unknown',
    style: params.masterDNA?.architecturalStyle || 'Contemporary',
    hasSitePlan: !!params.sitePlanAttachment, // Track if site plan was provided
    sitePlanPolicy: params.sitePlanPolicy || 'placeholder' // 'embed' or 'placeholder'
  };
}

/**
 * Adds consistency lock to base prompt with delta changes
 * Ensures modified A1 sheets maintain original design consistency
 * @param {string} basePrompt - Original prompt from initial generation
 * @param {string} deltaPrompt - Additional modifications requested by user
 * @param {Object} masterDNA - Original Master DNA for reference
 * @returns {Object} { prompt, negativePrompt } with consistency lock applied
 */
export function withConsistencyLock(basePrompt, deltaPrompt, masterDNA = null, projectContext = null) {
  // Extract key consistency elements from base prompt
  const consistencyRules = [];
  
  // 🆕 Extract project type from context to preserve building type (clinic vs house)
  const projectType = projectContext?.projectType || projectContext?.buildingProgram || masterDNA?.projectType || 'residential';
  const nonResidentialTypes = ['clinic', 'hospital', 'office', 'retail', 'school', 'commercial', 'medical', 'healthcare'];
  const isNonResidential = nonResidentialTypes.some(type => projectType.toLowerCase().includes(type));
  
  if (masterDNA) {
    const dimensions = masterDNA.dimensions || {};
    const materials = masterDNA.materials || [];
    const materialsArray = Array.isArray(materials) ? materials : [materials].filter(Boolean);
    
    consistencyRules.push(
      `CRITICAL CONSISTENCY LOCK - DO NOT CHANGE:`,
      `- PROJECT TYPE: ${projectType.toUpperCase()} - This is a ${projectType} building${isNonResidential ? ', NOT a residential house' : ''}`,
      `- Building dimensions: EXACTLY ${dimensions.length || 15}m × ${dimensions.width || 10}m × ${dimensions.height || 7}m`,
      `- Materials: EXACTLY ${materialsArray.map(m => `${m.name} ${m.hexColor || ''}`).join(', ')}`,
      `- Architectural style: ${masterDNA.architecturalStyle || masterDNA.architectural_style?.name || 'Contemporary'}`,
      `- Floor count: ${dimensions.floorHeights?.length || dimensions.floor_count || 2}`,
      `- Window positions and counts must match original design`,
      `- Roof form and pitch must remain identical`,
      `- All existing sections, elevations, and plans must appear IDENTICAL except for requested changes`,
      `${isNonResidential ? `- NO residential house features, NO bedrooms (unless clinic), NO kitchen (unless specified)\n- Floor plans MUST show ${projectType}-appropriate spaces` : `- Floor plans MUST show residential spaces (living, bedrooms, kitchen)`}`
    );
  }
  
  // Build locked prompt
  const lockedPrompt = `${basePrompt}

═══════════════════════════════════════════════════════════════
A1 SHEET MODIFICATION - PRESERVE COMPLETE SHEET LAYOUT
═══════════════════════════════════════════════════════════════
CRITICAL: This is an A1 SHEET with multiple views in a grid layout.
MAINTAIN: The COMPLETE A1 sheet structure with ALL existing views arranged in grid.
${consistencyRules.join('\n')}

MODIFICATION TYPE: ADD elements to existing A1 sheet, DO NOT replace the sheet.
USER REQUESTED MODIFICATIONS:
${deltaPrompt}

STRICT RULES FOR A1 SHEET:
- PRESERVE the entire A1 sheet layout grid structure
- KEEP all existing views in their current positions
- ADD requested elements in available/empty spaces only
- DO NOT create a single view output
- DO NOT replace or remove any existing views
- The output MUST be a complete A1 sheet with multiple views`;

  // Enhanced negative prompt to prevent drift
  const negativePrompt = `(inconsistent dimensions:2.0), (changed materials:2.0), (different colors:2.0),
(inconsistent style:2.0), (modified unchanged elements:2.0), (drift from original:2.0),
(graph paper:2.0), (grid background:2.0), (placeholder boxes:2.0), (multiple sheets:2.0),
(missing sections:2.5), (missing elevations:2.5), (missing floor plans:2.5), (missing 3D views:2.0),
(missing dimension lines:2.0), (incomplete A1 sheet:2.5), (empty sections:2.5),
low quality, blurry, watermark, signature, text artifacts`;

  return {
    prompt: lockedPrompt,
    negativePrompt
  };
}

/**
 * Compact Consistency Lock for A1 Modify with img2img
 *
 * Generates an ULTRA-COMPACT prompt (<1k chars) for img2img modifications.
 * Relies on initImage for preservation, not verbose text prompts.
 *
 * @param {Object} options - Configuration
 * @param {Object} options.base - Base design data { masterDNA, mainPrompt, a1LayoutKey }
 * @param {string} options.delta - Delta prompt with requested changes
 * @returns {string} Ultra-compact prompt (<1k chars)
 */
export function withConsistencyLockCompact({ base, delta }) {
  // ULTRA-COMPACT: Rely on img2img, not text
  // The initImage parameter preserves the original design
  // We only need to specify what to CHANGE

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

  // 🆕 Extract project type to preserve building type (clinic vs house)
  const projectContext = base.projectContext || {};
  const projectType = base.projectType || projectContext?.projectType || projectContext?.buildingProgram || base.masterDNA?.projectType || 'residential';
  const nonResidentialTypes = ['clinic', 'hospital', 'office', 'retail', 'school', 'commercial', 'medical', 'healthcare'];
  const isNonResidential = nonResidentialTypes.some(type => projectType.toLowerCase().includes(type));
  
  // Extract key DNA specs for consistency
  const masterDNA = base.masterDNA || {};
  const dimensions = masterDNA.dimensions || {};
  const materials = masterDNA.materials || [];
  const materialsArray = Array.isArray(materials) ? materials : [materials].filter(Boolean);
  const style = masterDNA.architecturalStyle || masterDNA.architectural_style?.name || 'Contemporary';

  // Ultra-minimal prompt focusing ONLY on changes
  // Let img2img handle preservation
  const prompt = `Modify A1 architectural sheet (img2img - PRESERVE EXISTING SHEET):

🚨 CRITICAL: This is an IMAGE-TO-IMAGE modification. The reference image shows the COMPLETE A1 sheet with ALL existing views.
- PRESERVE the entire A1 sheet layout structure EXACTLY as shown in reference image
- PRESERVE all existing views: site plan (top-left), floor plans (row 2), elevations, sections, 3D views, title block
- PRESERVE all existing positions, sizes, and arrangements
- PRESERVE all existing building design, materials, colors, dimensions

🗺️ SITE PLAN LOCK - ABSOLUTELY DO NOT CHANGE:
- The SITE PLAN in top-left corner MUST remain EXACTLY as shown in reference image
- Position: Top-left (x: 2%, y: 2%, width: 25%, height: 20%) - LOCKED, DO NOT MOVE
- DO NOT regenerate, redraw, or modify the site context/map/satellite view
- The site boundaries, building footprint position, and geographic context are LOCKED
- If site plan is missing: ADD it using the EXACT site context from original design at top-left position
- PRESERVE exact satellite/map imagery, site polygon boundaries, north orientation, and scale label
- LANDSCAPE ORIENTATION: Keep sheet landscape (width > height), DO NOT rotate

🔒 PROJECT TYPE LOCK - DO NOT CHANGE:
- PROJECT TYPE: ${projectType.toUpperCase()}${isNonResidential ? ' (NOT a residential house)' : ' (residential)'}
- Building dimensions: ${dimensions.length || 15}m × ${dimensions.width || 10}m × ${dimensions.height || 7}m
- Materials: ${materialsArray.slice(0, 3).map(m => m.name || m).join(', ')}
- Style: ${style}
${isNonResidential ? `- NO residential house features, NO bedrooms (unless ${projectType}), NO kitchen (unless specified)\n- Floor plans MUST show ${projectType}-appropriate spaces (reception, consultation rooms, etc.)` : `- Floor plans MUST show residential spaces (living, bedrooms, kitchen)`}

CHANGES TO APPLY:
${truncatedDelta || 'No specific changes requested - maintain exact consistency'}

STRICT RULES:
- DO NOT rearrange the layout
- DO NOT change existing views (especially site plan)
- DO NOT modify unmentioned elements
- DO NOT create a new design - this is a modification of the existing sheet
- DO NOT change project type - keep ${projectType} building type
- DO NOT regenerate site context - preserve EXACT satellite/map from reference
- If adding floor plans: ADD them in the existing floor plan area (row 2), do not replace other views
- Site plan position: MUST remain at top-left (x: 2%, y: 2%, width: 25%, height: 20%)`;

  // Log the dramatic size reduction
  logger.info(`Ultra-compact prompt: ${prompt.length} chars (was 2-3k, now <1k)`, null, '📝');

  return prompt;
}

/**
 * Build delta instructions from modification request
 * Extracts specific changes and formats them clearly
 * @param {string} deltaPrompt - User's modification request
 * @returns {string} Formatted delta instructions
 */
function buildDeltaInstructions(deltaPrompt) {
  if (!deltaPrompt) return 'No specific changes requested';

  // Common modification patterns
  const patterns = [
    { match: /add.*section/i, format: 'ADD: Missing sections with full detail' },
    { match: /add.*3d|add.*view/i, format: 'ADD: Additional 3D views' },
    { match: /add.*detail/i, format: 'ADD: Technical details and annotations' },
    { match: /fix.*dimension/i, format: 'FIX: Add missing dimension lines with arrowheads' },
    { match: /improve.*label/i, format: 'IMPROVE: Text labels and annotations' }
  ];

  for (const pattern of patterns) {
    if (pattern.match.test(deltaPrompt)) {
      return pattern.format;
    }
  }

  // Return as-is if no pattern matches
  return deltaPrompt;
}

/**
 * Summarize DNA concisely for compact prompts
 * @param {Object} masterDNA - Master DNA object
 * @returns {string} Brief DNA summary
 */
function summarizeDNA(masterDNA) {
  if (!masterDNA) return 'Standard architectural design';

  const dimensions = masterDNA.dimensions || {};
  const materials = masterDNA.materials || [];
  const materialsArray = Array.isArray(materials) ? materials : [];
  const style = masterDNA.architecturalStyle || 'Contemporary';

  const parts = [
    `${style} style`,
    `${dimensions.length || 15}×${dimensions.width || 10}×${dimensions.height || 7}m`,
    `${dimensions.floorHeights?.length || 2}F`,
    materialsArray.slice(0, 2).map(m => m.name).join('/')
  ];

  return parts.filter(Boolean).join(', ');
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
(missing site plan:3.0), (missing elevations:3.0), (missing sections:3.0), (missing 3D views:2.5)`;
}
