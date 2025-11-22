/**
 * Strict A1 Prompt Generator - Version 2 (Ultra-Precision)
 * 
 * MISSION: Generate A1 sheets with PERFECT consistency across all panels
 * - Plans match elevations (window counts, dimensions)
 * - Window counts match 3D views
 * - Materials identical across all views
 * - Dimensions exact and consistent
 * - NO hallucination, NO geometry drift
 * 
 * Uses ARCHITECTURAL LOGIC, not artistic interpretation
 */

import logger from '../utils/logger.js';

/**
 * Build ultra-strict A1 prompt with architectural consistency locks
 * @param {Object} params - Generation parameters
 * @returns {Object} { prompt, negativePrompt, systemHints, consistencyLocks }
 */
export function buildStrictA1Prompt({
  masterDNA,
  location,
  climate,
  projectContext = {},
  projectMeta = {},
  siteShape = null,
  siteConstraints = null
}) {
  logger.info('Building STRICT A1 prompt with consistency locks', null, '🔒');

  // Extract and validate DNA
  const dna = validateAndNormalizeDNA(masterDNA);
  
  // Build consistency locks
  const locks = buildConsistencyLocks(dna);
  
  // Build strict prompt
  const prompt = buildUltraStrictPrompt(dna, locks, location, climate, projectContext, projectMeta, siteConstraints);
  
  // Build negative guardrails
  const negativePrompt = buildStrictNegativePrompt(dna);
  
  // System hints for generation
  const systemHints = {
    targetAspectRatio: 1.414,
    layoutType: 'uk_riba_a1_sheet_fixed_grid',
    viewCount: '15 panels (all required)',
    visualQuality: 'architectural_precision_over_artistic_interpretation',
    presentationStyle: 'technical_documentation_not_portfolio',
    consistencyPriority: 'absolute',
    seed: projectMeta.seed || Date.now(),
    guidanceScale: 7.8,
    steps: 48
  };

  logger.success('Strict A1 prompt generated', {
    promptLength: prompt.length,
    locksCount: Object.keys(locks).length
  });

  return {
    prompt,
    negativePrompt,
    systemHints,
    consistencyLocks: locks
  };
}

/**
 * Validate and normalize DNA for strict generation
 * @private
 */
function validateAndNormalizeDNA(masterDNA) {
  if (!masterDNA) {
    throw new Error('Master DNA is required for strict A1 generation');
  }

  const dimensions = masterDNA.dimensions || {};
  const materials = masterDNA.materials || {};
  
  // Normalize dimensions
  const length = parseFloat(dimensions.length) || 15;
  const width = parseFloat(dimensions.width) || 10;
  const height = parseFloat(dimensions.totalHeight || dimensions.height) || 7;
  const floorCount = parseInt(dimensions.floorCount || dimensions.floors) || 2;
  
  // Normalize materials
  const materialsArray = Array.isArray(materials) 
    ? materials 
    : materials.exterior 
      ? [materials.exterior, materials.roof] 
      : [];
  
  // Extract exact specifications
  return {
    projectID: masterDNA.projectID || `STRICT_${Date.now()}`,
    dimensions: {
      length,
      width,
      height,
      floorCount,
      footprintArea: length * width,
      totalArea: length * width * floorCount,
      groundFloorHeight: parseFloat(dimensions.groundFloorHeight) || 3.0,
      upperFloorHeight: parseFloat(dimensions.upperFloorHeight) || 2.7
    },
    materials: materialsArray,
    roof: {
      type: masterDNA.roof?.type || 'gable',
      pitch: parseFloat(masterDNA.roof?.pitch) || 35,
      material: masterDNA.roof?.material || 'Clay tiles',
      color: masterDNA.roof?.color || '#654321'
    },
    windows: extractWindowSpec(masterDNA),
    doors: extractDoorSpec(masterDNA),
    elevations: masterDNA.elevations || {},
    floorPlans: masterDNA.floorPlans || {},
    sections: masterDNA.sections || {},
    colorPalette: masterDNA.colorPalette || {},
    architecturalStyle: masterDNA.architecturalStyle || 'Contemporary'
  };
}

/**
 * Extract exact window specifications from DNA
 * @private
 */
function extractWindowSpec(masterDNA) {
  const windows = masterDNA.windows || {};
  const materials = masterDNA.materials || {};
  
  return {
    type: windows.type || materials.windows?.type || 'Casement',
    frame: materials.windows?.frame || 'UPVC',
    color: materials.windows?.color || '#FFFFFF',
    glazing: materials.windows?.glazing || 'Double',
    standardSize: materials.windows?.standardSize || '1.5m × 1.2m',
    sillHeight: materials.windows?.sillHeight || '0.9m',
    // Extract counts per elevation
    counts: {
      north: extractWindowCount(masterDNA.elevations?.north),
      south: extractWindowCount(masterDNA.elevations?.south),
      east: extractWindowCount(masterDNA.elevations?.east),
      west: extractWindowCount(masterDNA.elevations?.west)
    }
  };
}

/**
 * Extract window count from elevation features
 * @private
 */
function extractWindowCount(elevation) {
  if (!elevation || !elevation.features) return 0;
  
  const featuresText = elevation.features.join(' ').toLowerCase();
  const match = featuresText.match(/(\d+)\s+windows?/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Extract exact door specifications from DNA
 * @private
 */
function extractDoorSpec(masterDNA) {
  const doors = masterDNA.materials?.doors?.main || masterDNA.doors?.main || {};
  
  return {
    type: doors.type || 'Panel',
    material: doors.material || 'Composite',
    color: doors.color || '#2C3E50',
    width: parseFloat(doors.width) || 1.0,
    height: parseFloat(doors.height) || 2.1,
    location: masterDNA.entrance?.facade || 'N',
    position: masterDNA.entrance?.position || 'center'
  };
}

/**
 * Build consistency locks - exact specifications that MUST NOT change
 * @private
 */
function buildConsistencyLocks(dna) {
  const locks = {
    // DIMENSIONAL LOCKS
    EXACT_LENGTH: `${dna.dimensions.length}m`,
    EXACT_WIDTH: `${dna.dimensions.width}m`,
    EXACT_HEIGHT: `${dna.dimensions.height}m`,
    EXACT_FOOTPRINT: `${dna.dimensions.length}m × ${dna.dimensions.width}m`,
    EXACT_FLOOR_COUNT: dna.dimensions.floorCount,
    EXACT_GROUND_HEIGHT: `${dna.dimensions.groundFloorHeight}m`,
    EXACT_UPPER_HEIGHT: `${dna.dimensions.upperFloorHeight}m`,
    
    // MATERIAL LOCKS
    EXACT_MATERIALS: dna.materials.map(m => 
      `${m.name || m.primary} (${m.hexColor || m.color})`
    ).join(', '),
    
    // ROOF LOCKS
    EXACT_ROOF_TYPE: dna.roof.type,
    EXACT_ROOF_PITCH: `${dna.roof.pitch}°`,
    EXACT_ROOF_MATERIAL: dna.roof.material,
    EXACT_ROOF_COLOR: dna.roof.color,
    
    // WINDOW LOCKS
    EXACT_WINDOW_TYPE: dna.windows.type,
    EXACT_WINDOW_SIZE: dna.windows.standardSize,
    EXACT_WINDOW_COUNT_NORTH: dna.windows.counts.north,
    EXACT_WINDOW_COUNT_SOUTH: dna.windows.counts.south,
    EXACT_WINDOW_COUNT_EAST: dna.windows.counts.east,
    EXACT_WINDOW_COUNT_WEST: dna.windows.counts.west,
    EXACT_WINDOW_TOTAL: Object.values(dna.windows.counts).reduce((a, b) => a + b, 0),
    
    // DOOR LOCKS
    EXACT_DOOR_LOCATION: dna.doors.location,
    EXACT_DOOR_POSITION: dna.doors.position,
    EXACT_DOOR_WIDTH: `${dna.doors.width}m`,
    EXACT_DOOR_COLOR: dna.doors.color,
    
    // ENTRANCE ORIENTATION LOCK
    EXACT_ENTRANCE_DIRECTION: dna.entranceDirection || dna.entrance?.facade || dna.entrance?.direction || 'N',
    
    // COLOR LOCKS
    EXACT_FACADE_COLOR: dna.colorPalette.facade || dna.materials[0]?.hexColor || '#8B4513',
    EXACT_TRIM_COLOR: dna.colorPalette.trim || '#FFFFFF',
    EXACT_ROOF_COLOR_LOCK: dna.roof.color
  };
  
  return locks;
}

/**
 * Build ultra-strict prompt with consistency locks
 * @private
 */
function buildUltraStrictPrompt(dna, locks, location, climate, projectContext, projectMeta, siteConstraints) {
  const locationDesc = location?.address || 'Birmingham, UK';
  const climateDesc = climate?.type || 'Temperate oceanic';
  const projectType = projectContext?.projectType || projectContext?.buildingProgram || 'residential house';
  
  // Extract building taxonomy
  const buildingCategory = projectContext?.buildingCategory || dna?.buildingCategory || '';
  const buildingSubType = projectContext?.buildingSubType || dna?.buildingSubType || '';
  const fullBuildingType = buildingCategory && buildingSubType 
    ? `${buildingCategory.charAt(0).toUpperCase() + buildingCategory.slice(1)} – ${buildingSubType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`
    : projectType;
  
  // Extract program spaces summary
  const programSpaces = projectContext?.programSpaces || dna?.programSpaces || [];
  let programSummary = '';
  if (programSpaces.length > 0) {
    const topSpaces = programSpaces.slice(0, 5);
    programSummary = '\n\nPROGRAM SPACES (MUST BE SHOWN IN PLANS):\n' + 
      topSpaces.map(s => `- ${s.label || s.name}: ${s.area}m² (${s.level || 'Ground'})`).join('\n');
  }
  
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 STRICT A1 ARCHITECTURAL SHEET — ONE SINGLE BUILDING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MISSION: Generate ONE building across ALL panels with PERFECT consistency.
- Plans MUST match elevations (window counts, dimensions)
- Window counts MUST match 3D views
- Materials MUST be identical across ALL views
- Dimensions MUST be exact (NO hallucination, NO geometry drift)
- USE ARCHITECTURAL LOGIC, NOT ARTISTIC INTERPRETATION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 IMMUTABLE CONSISTENCY LOCKS (ABSOLUTE, NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIMENSIONAL LOCKS (EXACT, NO DEVIATION):
├─ Building footprint: ${locks.EXACT_FOOTPRINT} (length × width)
├─ Building height: ${locks.EXACT_HEIGHT} (total height)
├─ Floor count: ${locks.EXACT_FLOOR_COUNT} floors (ALL views must show this)
├─ Ground floor height: ${locks.EXACT_GROUND_HEIGHT}
└─ Upper floor height: ${locks.EXACT_UPPER_HEIGHT}

MATERIAL LOCKS (EXACT, NO SUBSTITUTION):
├─ Facade material: ${locks.EXACT_MATERIALS}
├─ Facade color: ${locks.EXACT_FACADE_COLOR} (exact hex)
├─ Trim color: ${locks.EXACT_TRIM_COLOR} (exact hex, DIFFERENT from facade)
└─ Roof: ${locks.EXACT_ROOF_MATERIAL} ${locks.EXACT_ROOF_COLOR}

ROOF LOCKS (EXACT, NO VARIATION):
├─ Type: ${locks.EXACT_ROOF_TYPE} (ONLY this type)
├─ Pitch: ${locks.EXACT_ROOF_PITCH} (exact angle)
└─ Material: ${locks.EXACT_ROOF_MATERIAL}

WINDOW LOCKS (EXACT COUNTS, NO DEVIATION):
├─ Type: ${locks.EXACT_WINDOW_TYPE}
├─ Size: ${locks.EXACT_WINDOW_SIZE} (ALL windows this size)
├─ North elevation: EXACTLY ${locks.EXACT_WINDOW_COUNT_NORTH} windows
├─ South elevation: EXACTLY ${locks.EXACT_WINDOW_COUNT_SOUTH} windows
├─ East elevation: EXACTLY ${locks.EXACT_WINDOW_COUNT_EAST} windows
├─ West elevation: EXACTLY ${locks.EXACT_WINDOW_COUNT_WEST} windows
└─ TOTAL: ${locks.EXACT_WINDOW_TOTAL} windows (ALL views must match this)

DOOR LOCKS (EXACT POSITION, NO VARIATION):
├─ Location: ${locks.EXACT_DOOR_LOCATION} facade (ONLY this facade)
├─ Position: ${locks.EXACT_DOOR_POSITION} (ONLY this position)
├─ Width: ${locks.EXACT_DOOR_WIDTH}
└─ Color: ${locks.EXACT_DOOR_COLOR}

ENTRANCE ORIENTATION LOCK (ABSOLUTE):
└─ Main entrance MUST be on ${locks.EXACT_ENTRANCE_DIRECTION} facade (arrow annotation required in title block)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 FIXED 6-ROW RIBA GRID (IMMUTABLE LAYOUT - ALIGNED WITH EXAMPLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────────────────────────────────────────────────────────────┐
│ ROW 1: [SITE CONTEXT] [3D HERO EXTERIOR (LARGE, 2 cols)] [STYLE] │
├──────────────────────────────────────────────────────────────────┤
│ ROW 2: [GROUND PLAN]  [FIRST PLAN]  [3D INTERIOR/AXONOMETRIC]    │
├──────────────────────────────────────────────────────────────────┤
│ ROW 3: [NORTH ELEV]   [SOUTH ELEV]  [PROJECT DATA TABLE]         │
├──────────────────────────────────────────────────────────────────┤
│ ROW 4: [EAST ELEV]    [WEST ELEV]   [ENVIRONMENTAL PANEL]        │
├──────────────────────────────────────────────────────────────────┤
│ ROW 5: [SECTION A-A (LARGE, 2 cols)] [SECTION B-B]               │
├──────────────────────────────────────────────────────────────────┤
│ ROW 6: [ENVIRONMENTAL TABLE] [MATERIAL SWATCHES + TITLE BLOCK]   │
└──────────────────────────────────────────────────────────────────┘

CRITICAL RULES:
• NO panel may be missing, moved, resized, replaced, or duplicated
• Hero view MUST span 2 columns (large, prominent)
• Section A-A MUST span 2 columns (detailed, longitudinal)
• Material swatches MUST be VISUAL color chips (rectangles), NOT text
• Environmental table MUST be structured (columns: metric | value | unit)
• ALL panels MUST be present and correctly typed (plan/elevation/3D/table)
• NO blank cells, NO placeholder grids, NO duplicate hero renders in plan cells

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ROW 1: SITE CONTEXT + HERO EXTERIOR + STYLE INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SITE CONTEXT MAP (Left, 1 col):
• Site location map showing building footprint, site boundary, nearby streets
• Scale 1:1250, north arrow (top-right), scale bar (0-10-20-30m)
• Site boundary outlined in red, building footprint in dark gray
• Label: "SITE CONTEXT" at top
• Simple, clean cartographic style (NOT satellite, NOT 3D)

3D HERO EXTERIOR VIEW (Center-Right, 2 cols LARGE):
• LARGE photorealistic exterior perspective (MAIN FOCAL POINT)
• Eye level, 10m from ${locks.EXACT_DOOR_LOCATION} facade
• Show: ${locks.EXACT_DOOR_LOCATION} facade with entrance + partial side facade + roof
• EXACTLY ${locks.EXACT_WINDOW_TOTAL} windows visible
• Entrance: ${locks.EXACT_DOOR_LOCATION} facade, ${locks.EXACT_DOOR_POSITION}
• Roof: ${locks.EXACT_ROOF_TYPE} ${locks.EXACT_ROOF_PITCH}
• Materials: ${locks.EXACT_MATERIALS}
• Colors: ${locks.EXACT_FACADE_COLOR} facade / ${locks.EXACT_TRIM_COLOR} trim
• ${locks.EXACT_FLOOR_COUNT} floors visible
• Ray-traced lighting, realistic shadows, architectural photography quality

STYLE & MATERIALS INFO (Right, 1 col):
• Architectural style: ${dna.architecturalStyle}
• Brief style description (2-3 sentences)
• Material palette text summary
• Climate adaptation notes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ROW 2: FLOOR PLANS + INTERIOR 3D (STRICT ORTHOGRAPHIC, LABELED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GROUND FLOOR PLAN (Left, 1 col, Scale 1:100):
• Label: "GROUND FLOOR PLAN" at top
• TRUE 2D orthographic overhead (NO perspective, NO 3D, NO isometric)
• Colored hatching: walls (gray #CCCCCC), floors (beige #F5F5DC), fixtures (blue #ADD8E6)
• BS1192 wall thickness: 0.30m external, 0.15m internal
• ROOM LABELS in each space (e.g., "LIVING 5.5m × 4.0m", "KITCHEN 4.0m × 3.5m", "BEDROOM 1 3.5m × 3.0m")${programSummary ? '\n• Program spaces from brief: ' + programSpaces.slice(0, 3).map(s => s.label || s.name).join(', ') : ''}
• Dimension strings: external walls (${locks.EXACT_FOOTPRINT}), key internal walls
• Furniture outlines: sofa in living, table in kitchen, beds in bedrooms
• Grid lines: A-D horizontal, 1-4 vertical (thin gray lines)
• North arrow: top-right corner (bold N with arrow)
• Stair: UP arrow, 13 risers, handrail shown
• Door swings: 90° arcs (thin lines)
• Window symbols: double lines (1.5m × 1.2m typical)
• Scale bar: 0-1-2-3-4-5m at bottom

FIRST FLOOR PLAN (Center, 1 col, Scale 1:100):
• Label: "FIRST FLOOR PLAN" at top
• TRUE 2D orthographic overhead (NO perspective, NO 3D, NO isometric)
• Colored hatching: SAME as ground floor
• ROOM LABELS in each space (DIFFERENT layout from ground)
• Dimension strings: footprint ${locks.EXACT_FOOTPRINT} (SAME as ground)
• Furniture outlines: beds, desks, storage
• Grid lines: A-D / 1-4 (SAME as ground)
• North arrow: top-right corner
• Stair: DOWN arrow, 13 risers
• Door swings, window symbols, scale bar

3D INTERIOR VIEW OR AXONOMETRIC (Right, 1 col):
• EITHER interior perspective (living room or main space, showing spatial quality, furniture, windows, ceiling height)
• OR axonometric projection (45° angle, 30° down, northeast corner, showing roof geometry and massing)
• Photorealistic rendering if interior, clean technical style if axonometric
• Materials and colors MATCH exterior views

CONSISTENCY:
• Total windows in plans = ${locks.EXACT_WINDOW_TOTAL} (EXACT)
• Main entrance on ${locks.EXACT_DOOR_LOCATION} facade, ${locks.EXACT_DOOR_POSITION}
• Footprint IDENTICAL in both plans (${locks.EXACT_FOOTPRINT})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ROW 3: ELEVATIONS (NORTH & SOUTH) + PROJECT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NORTH ELEVATION (Left, 1 col, Scale 1:100):
• Label: "NORTH ELEVATION" at top
• Flat orthographic projection (NO perspective, NO depth, NO 3D)
• Rendered with correct materials, realistic shadows, textures
• Dimensions: height ${locks.EXACT_HEIGHT} (total), width ${locks.EXACT_LENGTH}
• Level markers: 0.00 (ground), +${locks.EXACT_GROUND_HEIGHT} (first floor), +${locks.EXACT_HEIGHT} (ridge)
• Main entrance: ${locks.EXACT_DOOR_POSITION}, width ${locks.EXACT_DOOR_WIDTH}, door color ${locks.EXACT_DOOR_COLOR}
• Windows: EXACTLY ${locks.EXACT_WINDOW_COUNT_NORTH} windows, size ${locks.EXACT_WINDOW_SIZE}, evenly spaced
• Roof: ${locks.EXACT_ROOF_TYPE} ${locks.EXACT_ROOF_PITCH}, ${locks.EXACT_ROOF_MATERIAL} ${locks.EXACT_ROOF_COLOR}
• Materials: ${locks.EXACT_MATERIALS}
• Colors: facade ${locks.EXACT_FACADE_COLOR}, trim ${locks.EXACT_TRIM_COLOR}
• Dimension strings: opening widths, floor-to-floor heights
• Material callouts: arrows pointing to key materials

SOUTH ELEVATION (Center, 1 col, Scale 1:100):
• Label: "SOUTH ELEVATION" at top
• Flat orthographic projection (NO perspective, NO depth)
• Rendered with materials, shadows, textures (SAME quality as North)
• Dimensions: height ${locks.EXACT_HEIGHT} (SAME), width ${locks.EXACT_LENGTH} (SAME)
• Level markers: 0.00, +${locks.EXACT_GROUND_HEIGHT}, +${locks.EXACT_HEIGHT}
• Windows: EXACTLY ${locks.EXACT_WINDOW_COUNT_SOUTH} windows, size ${locks.EXACT_WINDOW_SIZE}
• DIFFERENT window arrangement from North (e.g., patio doors, balcony)
• Roof: ${locks.EXACT_ROOF_TYPE} ${locks.EXACT_ROOF_PITCH} (SAME as North)
• Materials/colors: SAME as North (${locks.EXACT_MATERIALS}, ${locks.EXACT_FACADE_COLOR}/${locks.EXACT_TRIM_COLOR})

PROJECT DATA TABLE (Right, 1 col):
• Label: "PROJECT DATA" at top
• Structured table format (left-aligned labels, right-aligned values):
  - GIFA: ${dna.dimensions.totalArea}m²
  - Site Area: ${siteConstraints?.siteArea || 'TBD'}
  - Footprint: ${locks.EXACT_FOOTPRINT}
  - Height: ${locks.EXACT_HEIGHT}
  - Floors: ${locks.EXACT_FLOOR_COUNT}
  - Program: ${fullBuildingType}
  - Location: ${locationDesc}
  - Climate: ${climateDesc}
  - Style: ${dna.architecturalStyle}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ROW 4: ELEVATIONS (EAST & WEST) + ENVIRONMENTAL PANEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EAST ELEVATION (Left, 1 col, Scale 1:100):
• Label: "EAST ELEVATION" at top
• Flat orthographic projection (NO perspective, NO depth)
• Rendered with materials, shadows, textures
• Dimensions: height ${locks.EXACT_HEIGHT}, width ${locks.EXACT_WIDTH}
• Level markers: 0.00, +${locks.EXACT_GROUND_HEIGHT}, +${locks.EXACT_HEIGHT}
• Windows: EXACTLY ${locks.EXACT_WINDOW_COUNT_EAST} windows, size ${locks.EXACT_WINDOW_SIZE}
• Roof slope visible (gable end or eaves)
• Materials/colors: SAME as North/South

WEST ELEVATION (Center, 1 col, Scale 1:100):
• Label: "WEST ELEVATION" at top
• Flat orthographic projection (NO perspective, NO depth)
• Rendered with materials, shadows, textures
• Dimensions: height ${locks.EXACT_HEIGHT}, width ${locks.EXACT_WIDTH} (SAME as East)
• Level markers: 0.00, +${locks.EXACT_GROUND_HEIGHT}, +${locks.EXACT_HEIGHT}
• Windows: EXACTLY ${locks.EXACT_WINDOW_COUNT_WEST} windows, size ${locks.EXACT_WINDOW_SIZE}
• Roof slope visible
• Materials/colors: SAME as all other elevations

ENVIRONMENTAL PERFORMANCE PANEL (Right, 1 col):
• Label: "ENVIRONMENTAL PERFORMANCE" at top
• Structured data (label: value format):
  - U-Value Wall: 0.18 W/m²K
  - U-Value Roof: 0.13 W/m²K
  - U-Value Glazing: 1.4 W/m²K
  - U-Value Floor: 0.15 W/m²K
  - EPC Rating: B (81-91)
  - Air Tightness: 5.0 m³/h/m² @ 50Pa
  - Ventilation: Natural cross-ventilation
  - Sun Orientation: ${location?.sunPath?.optimalOrientation || 180}° optimal
  - Renewable Energy: Solar PV 4kWp (optional)

CONSISTENCY (ALL ELEVATIONS):
• ALL show ${locks.EXACT_FLOOR_COUNT} floors
• ALL show SAME roof ${locks.EXACT_ROOF_TYPE} ${locks.EXACT_ROOF_PITCH}
• ALL use SAME materials ${locks.EXACT_MATERIALS}
• ALL use SAME colors ${locks.EXACT_FACADE_COLOR}/${locks.EXACT_TRIM_COLOR}
• Total windows = ${locks.EXACT_WINDOW_TOTAL}, aligned vertically between floors

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ROW 5: SECTIONS (STRICT ORTHOGRAPHIC CUTS, DETAILED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION A-A (Longitudinal, Left-Center LARGE 2 cols, Scale 1:100):
• Label: "SECTION A-A" at top, with cut line indicator (A——A)
• TRUE orthographic cut through center of building (hallway, staircase, main spaces)
• Cut location shown on floor plans
• Structural layers VISIBLE and LABELED:
  - External wall buildup: ${locks.EXACT_MATERIALS} (0.30m), insulation (0.10m), blockwork (0.10m), plaster (0.02m)
  - Roof buildup: ${locks.EXACT_ROOF_MATERIAL}, sarking, insulation (0.20m), rafters, plasterboard
  - Floor slab: concrete slab (0.15m), insulation (0.10m), DPM, hardcore
  - Foundation: strip footing (1.2m below ground level)
• Dimension strings:
  - Ground floor height: ${locks.EXACT_GROUND_HEIGHT} (floor to floor)
  - Upper floor height: ${locks.EXACT_UPPER_HEIGHT} (floor to ceiling)
  - Total height: ${locks.EXACT_HEIGHT} (ground to ridge)
  - Foundation depth: 1.2m below ground
  - Room ceiling heights: 2.4m (ground), 2.4m (first)
• Level markers: -1.20 (foundation), 0.00 (ground), +${locks.EXACT_GROUND_HEIGHT} (first floor), +${locks.EXACT_HEIGHT} (ridge)
• Roof structure: ${locks.EXACT_ROOF_TYPE} at ${locks.EXACT_ROOF_PITCH} pitch, rafters, ridge beam
• Staircase visible: 13 risers, handrail, balustrade
• Hatching: concrete (diagonal lines), insulation (dots), timber (grain lines)

SECTION B-B (Transverse, Right, 1 col, Scale 1:100):
• Label: "SECTION B-B" at top, with cut line indicator (B——B)
• TRUE orthographic cut perpendicular to Section A-A (through living room and bedroom)
• Cut location shown on floor plans
• Structural layers visible: wall buildup, roof buildup, floor slab
• Dimension strings:
  - Building width: ${locks.EXACT_WIDTH}
  - Floor heights: ${locks.EXACT_GROUND_HEIGHT}, ${locks.EXACT_UPPER_HEIGHT}
  - Wall thicknesses: 0.30m external, 0.15m internal
• Level markers: 0.00, +${locks.EXACT_GROUND_HEIGHT}, +${locks.EXACT_HEIGHT}
• Roof structure: ${locks.EXACT_ROOF_TYPE} ${locks.EXACT_ROOF_PITCH}, eaves detail
• Room spaces visible: living room (ground), bedroom (first)

CONSISTENCY:
• Sections show ${locks.EXACT_FLOOR_COUNT} floors
• Floor heights MATCH elevations (${locks.EXACT_GROUND_HEIGHT}, ${locks.EXACT_UPPER_HEIGHT})
• Total height MATCHES elevations (${locks.EXACT_HEIGHT})
• Roof pitch MATCHES elevations (${locks.EXACT_ROOF_PITCH})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ROW 6: ENVIRONMENTAL TABLE + MATERIAL SWATCHES + TITLE BLOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENVIRONMENTAL METRICS TABLE (Left, 1 col):
• Label: "ENVIRONMENTAL METRICS" at top
• Structured table format (3 columns: Metric | Value | Unit):

| Metric              | Value  | Unit      |
|---------------------|--------|-----------|
| Site Area           | ${siteConstraints?.siteArea || 'TBD'} | m²        |
| Building Footprint  | ${parseFloat(locks.EXACT_FOOTPRINT.split('×')[0]) * parseFloat(locks.EXACT_FOOTPRINT.split('×')[1])} | m²        |
| GIFA                | ${dna.dimensions.totalArea} | m²        |
| Site Coverage       | ${siteConstraints?.siteArea ? Math.round((parseFloat(locks.EXACT_FOOTPRINT.split('×')[0]) * parseFloat(locks.EXACT_FOOTPRINT.split('×')[1]) / siteConstraints.siteArea) * 100) : 'TBD'}% | %         |
| Floor Area Ratio    | ${siteConstraints?.siteArea ? (dna.dimensions.totalArea / siteConstraints.siteArea).toFixed(2) : 'TBD'} | ratio     |
| Perimeter           | ${(parseFloat(locks.EXACT_FOOTPRINT.split('×')[0]) + parseFloat(locks.EXACT_FOOTPRINT.split('×')[1])) * 2} | m         |
| Compactness         | ${((parseFloat(locks.EXACT_FOOTPRINT.split('×')[0]) * parseFloat(locks.EXACT_FOOTPRINT.split('×')[1])) / Math.pow((parseFloat(locks.EXACT_FOOTPRINT.split('×')[0]) + parseFloat(locks.EXACT_FOOTPRINT.split('×')[1])) * 2, 2) * 4 * Math.PI).toFixed(2)} | ratio     |
| Glazing Ratio       | 18% | %         |

• Clean table styling: thin borders, alternating row colors (white/light gray)

MATERIAL SWATCHES + TITLE BLOCK (Center-Right, 2 cols):
• Label: "MATERIALS & LEGEND" at top

MATERIAL SWATCHES (Visual color chips, NOT text):
• Row of rectangular color chips (each 40mm × 30mm):
  1. Primary Material: ${locks.EXACT_MATERIALS}
     - Color chip: solid rectangle filled with ${locks.EXACT_FACADE_COLOR}
     - Label below: "${locks.EXACT_MATERIALS} ${locks.EXACT_FACADE_COLOR}"
  2. Trim/Secondary:
     - Color chip: solid rectangle filled with ${locks.EXACT_TRIM_COLOR}
     - Label below: "Trim ${locks.EXACT_TRIM_COLOR}"
  3. Roof Material: ${locks.EXACT_ROOF_MATERIAL}
     - Color chip: solid rectangle filled with ${locks.EXACT_ROOF_COLOR}
     - Label below: "${locks.EXACT_ROOF_MATERIAL} ${locks.EXACT_ROOF_COLOR}"
  4. Window Frames: ${dna.windows.frame}
     - Color chip: solid rectangle filled with ${dna.windows.color}
     - Label below: "${dna.windows.frame} ${dna.windows.color}"

TITLE BLOCK (UK RIBA Format, integrated below swatches):
• Project Title: ${fullBuildingType}
• Address: ${locationDesc}
• Client: ${projectMeta.client || 'Confidential Client'}
• Architect: ArchiAI Solution Ltd – Mohammed Reggab
• ARB Number: ARB-123456
• Drawing Number: GA-01-${projectMeta.projectRef || 'A1-001'}
• Scale: AS SHOWN @ A1 (1:100 for plans/elevations/sections)
• Revision: ${projectMeta.revision || 'P01'}
• Date: ${new Date().toLocaleDateString('en-GB')}
• Status: PLANNING APPLICATION
• Main Entrance: ${locks.EXACT_ENTRANCE_DIRECTION} facade (↑ arrow annotation)
• Notes: Do not scale; verify dimensions on site; all dimensions in millimeters unless noted
• Logo: ArchiAI Solution logo (bottom-right corner)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ZERO-DRIFT GUARANTEE (ABSOLUTE, NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALL views MUST depict ONE SINGLE BUILDING with:
├─ IDENTICAL footprint: ${locks.EXACT_FOOTPRINT}
├─ IDENTICAL height: ${locks.EXACT_HEIGHT}
├─ IDENTICAL floor count: ${locks.EXACT_FLOOR_COUNT}
├─ IDENTICAL roof: ${locks.EXACT_ROOF_TYPE} at ${locks.EXACT_ROOF_PITCH}
├─ IDENTICAL materials: ${locks.EXACT_MATERIALS}
├─ IDENTICAL colors: ${locks.EXACT_FACADE_COLOR} facade, ${locks.EXACT_TRIM_COLOR} trim
├─ IDENTICAL window count: ${locks.EXACT_WINDOW_TOTAL} total
├─ IDENTICAL window size: ${locks.EXACT_WINDOW_SIZE}
├─ IDENTICAL door location: ${locks.EXACT_DOOR_LOCATION} facade, ${locks.EXACT_DOOR_POSITION}
└─ IDENTICAL proportions across ALL panels

NO variations. NO catalog layouts. NO alternative buildings.
NO redesign. NO reinterpretation. NO artistic license.

USE SAME BUILDING IN ALL PANELS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PANEL COMPLETENESS CHECKLIST (VERIFY BEFORE FINALIZING)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before finalizing the A1 sheet, verify ALL 16 panels are present and correct:

ROW 1 (3 panels):
☐ Site context map with scale and north arrow
☐ 3D hero exterior view (LARGE, 2 cols, photorealistic)
☐ Style & materials info panel

ROW 2 (3 panels):
☐ Ground floor plan with room labels and dimensions
☐ First floor plan with room labels and dimensions
☐ 3D interior view OR axonometric

ROW 3 (3 panels):
☐ North elevation with correct window count (${locks.EXACT_WINDOW_COUNT_NORTH}) and materials
☐ South elevation with correct window count (${locks.EXACT_WINDOW_COUNT_SOUTH}) and materials
☐ Project data table (GIFA, area, height, floors)

ROW 4 (3 panels):
☐ East elevation with correct window count (${locks.EXACT_WINDOW_COUNT_EAST})
☐ West elevation with correct window count (${locks.EXACT_WINDOW_COUNT_WEST})
☐ Environmental performance panel (U-values, EPC, ventilation)

ROW 5 (2 panels):
☐ Section A-A (LARGE, 2 cols, longitudinal) with floor heights and structural layers
☐ Section B-B (transverse) with structural layers

ROW 6 (2 panels):
☐ Environmental metrics table (structured data with columns)
☐ Material swatches (VISUAL color chips) + title block

If ANY panel is missing, incomplete, replaced by duplicate content, or has wrong type:
• DO NOT generate placeholder boxes or blank cells
• DO NOT duplicate hero view in plan cells
• DO NOT use text-only materials (must be visual swatches)
• REGENERATE with ALL panels present and correctly typed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ OUTPUT RULES (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Follow fixed 6-row RIBA grid EXACTLY (no deviations, no panel moves, no missing panels)
2. Site context = actual map (NOT blank, show building footprint + site boundary + streets)
3. Hero exterior = LARGE (2 cols), photorealistic, architectural photography quality
4. Plans = orthographic, colored hatching, ROOM LABELS required, dimension strings required
5. Elevations = rendered with materials, shadows, dimension strings, level markers
6. Sections = structural layers VISIBLE and LABELED, dimension lines, cut indicators
7. 3D interior/axo = photorealistic interior OR clean axonometric
8. Material swatches = VISUAL color chips (rectangles), NOT text-only
9. Environmental table = structured (columns: metric | value | unit)
10. Use SAME building in ALL panels (no variations, no catalog layout, no alternatives)
11. CLEAN architectural drawing style (NO sketch, NO concept art, NO placeholder grids)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF STRICT A1 PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Build strict negative prompt to prevent common issues
 * @private
 */
function buildStrictNegativePrompt(dna) {
  return `(multiple buildings:5.0), (house catalog:5.0), (sketch board:5.0), (concept art:5.0), 
(perspective floor plan:5.0), (perspective elevation:5.0), (3D floor plan:5.0), 
(missing panel:5.0), (incomplete grid:5.0), (blank panels:5.0),
(duplicate hero in plan cells:5.0), (duplicate 3D in elevation cells:5.0),
(grid paper background:4.5), (placeholder boxes:4.5), (empty a1 sheet:5.0), 
(text-only materials:4.5), (no color swatches:4.5), (no visual chips:4.5),
(no room labels:4.0), (no dimensions:4.0), (no environmental table:4.0),
(gibberish text:4.5), (lorem ipsum:4.5), (random characters:4.5),
(inconsistent windows:5.0), (different materials:5.0), (different colors:5.0), 
(wrong floor count:5.0), (wrong roof type:5.0), (wrong dimensions:5.0),
(hallucinated geometry:5.0), (geometry drift:5.0), (artistic interpretation:4.5),
(portfolio collage:5.0), (design variations:5.0), (alternative options:5.0),
(low quality:4.0), (blurry:4.0), (watermark:4.0), (text too small:4.0),
(missing elevations:5.0), (missing sections:5.0), (missing 3D views:4.5),
(missing floor plans:5.0), (missing interior view:4.0), (missing site context:4.5),
(wrong window count:5.0), (wrong door location:5.0), (wrong roof pitch:5.0),
(no structural layers in sections:4.0), (no dimension strings:4.0)`;
}

/**
 * Validate consistency locks against generation result
 * @param {Object} locks - Consistency locks
 * @param {Object} result - Generation result
 * @returns {Object} Validation result
 */
export function validateConsistencyLocks(locks, result) {
  const errors = [];
  const warnings = [];
  
  // TODO: Implement post-generation validation
  // - Check if generated image matches locks
  // - Use computer vision to count windows, measure dimensions
  // - Verify materials and colors
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  buildStrictA1Prompt,
  validateConsistencyLocks
};

