/**
 * DNA-Driven Prompt Generator
 * Generates UNIQUE, SPECIFIC prompts for each architectural view
 * Ensures NO duplicate images while maintaining perfect consistency
 */

class DNAPromptGenerator {
  constructor() {
    console.log('📝 DNA Prompt Generator initialized');
  }

  /**
   * Generate prompts for specific views only
   * Used for selective regeneration in modify workflow
   */
  generatePromptsForViews(masterDNA, viewIds, projectContext = null) {
    console.log(`📝 Generating prompts for ${viewIds.length} specific views...`);

    const prompts = {};
    const locationContext = masterDNA.locationContext || '';
    const climateDesign = masterDNA.climateDesign || {};

    viewIds.forEach(viewId => {
      switch (viewId) {
        case 'plan_ground':
          prompts.floor_plan_ground = this.generateFloorPlanPrompt(masterDNA, 'ground', projectContext);
          break;
        case 'plan_upper':
          prompts.floor_plan_upper = this.generateFloorPlanPrompt(masterDNA, 'upper', projectContext);
          break;
        case 'elev_n':
          prompts.elevation_north = this.generateElevationPrompt(masterDNA, 'north', projectContext);
          break;
        case 'elev_s':
          prompts.elevation_south = this.generateElevationPrompt(masterDNA, 'south', projectContext);
          break;
        case 'elev_e':
          prompts.elevation_east = this.generateElevationPrompt(masterDNA, 'east', projectContext);
          break;
        case 'elev_w':
          prompts.elevation_west = this.generateElevationPrompt(masterDNA, 'west', projectContext);
          break;
        case 'sect_long':
          prompts.section_longitudinal = this.generateSectionPrompt(masterDNA, 'longitudinal', projectContext);
          break;
        case 'sect_trans':
          prompts.section_cross = this.generateSectionPrompt(masterDNA, 'cross', projectContext);
          break;
        case 'v_exterior':
          prompts.exterior_front_3d = this.generate3DExteriorPrompt(masterDNA, 'front', projectContext);
          break;
        case 'v_axon':
          prompts.axonometric_3d = this.generate3DAxonometricPrompt(masterDNA, projectContext);
          break;
        case 'v_site':
          prompts.site_3d = this.generate3DSitePrompt(masterDNA, projectContext);
          break;
        case 'v_interior':
          prompts.interior_3d = this.generate3DInteriorPrompt(masterDNA, projectContext);
          break;
        default:
          console.warn(`⚠️ Unknown view ID: ${viewId}`);
      }
    });

    console.log(`✅ Generated ${Object.keys(prompts).length} prompts`);
    return prompts;
  }

  /**
   * Generate prompts for ALL 13 architectural views
   * Each prompt is UNIQUE and SPECIFIC to prevent duplicates
   * NOW ENHANCED with location, climate, and site context
   */
  generateAllPrompts(masterDNA, projectContext) {
    console.log('📝 Generating 13 unique site-aware prompts from Master DNA...');

    // 🌍 Extract location context for all prompts
    const locationContext = masterDNA.locationContext || '';
    const climateDesign = masterDNA.climateDesign || {};
    
    // 🆕 Extract site polygon context
    const siteMetrics = projectContext?.siteMetrics || null;
    const siteContext = (siteMetrics && siteMetrics.areaM2) ? `
Site Area: ${siteMetrics.areaM2.toFixed(0)}m²
Site Orientation: ${(siteMetrics.orientationDeg || 0).toFixed(0)}° from North
Building must fit within site boundaries with 3m setbacks` : '';

    // 🆕 Extract levels and recommended elevations from DNA
    const levels = masterDNA.levels || [];
    const numLevels = masterDNA.dimensions?.numLevels || masterDNA.dimensions?.floorCount || 2;
    const hasBasement = masterDNA.dimensions?.hasBasement || false;
    const recommendedElevations = masterDNA.recommendedElevations || ['north', 'south'];
    
    // Build floor plan prompts dynamically based on levels
    const floorPlanPrompts = {};
    levels.forEach(level => {
      const levelName = level.level || '';
      if (levelName === 'basement' && hasBasement) {
        floorPlanPrompts.floor_plan_basement = this.generateFloorPlanPrompt(masterDNA, 'basement', projectContext);
      } else if (levelName === 'ground') {
        floorPlanPrompts.floor_plan_ground = this.generateFloorPlanPrompt(masterDNA, 'ground', projectContext);
      } else if (levelName === 'first') {
        floorPlanPrompts.floor_plan_first = this.generateFloorPlanPrompt(masterDNA, 'first', projectContext);
      } else if (levelName === 'second') {
        floorPlanPrompts.floor_plan_second = this.generateFloorPlanPrompt(masterDNA, 'second', projectContext);
      } else if (levelName === 'third') {
        floorPlanPrompts.floor_plan_third = this.generateFloorPlanPrompt(masterDNA, 'third', projectContext);
      }
    });
    
    // Fallback to legacy format if levels array is empty
    if (Object.keys(floorPlanPrompts).length === 0) {
      floorPlanPrompts.floor_plan_ground = this.generateFloorPlanPrompt(masterDNA, 'ground', projectContext);
      if (numLevels > 1) {
        floorPlanPrompts.floor_plan_upper = this.generateFloorPlanPrompt(masterDNA, 'upper', projectContext);
      }
    }

    // Generate elevation prompts - use recommended elevations if available
    const elevationPrompts = {};
    if (recommendedElevations.length >= 2) {
      // Use AI-recommended elevations
      elevationPrompts[`elevation_${recommendedElevations[0]}`] = this.generateElevationPrompt(masterDNA, recommendedElevations[0], projectContext);
      elevationPrompts[`elevation_${recommendedElevations[1]}`] = this.generateElevationPrompt(masterDNA, recommendedElevations[1], projectContext);
    } else {
      // Fallback to all 4 elevations
      elevationPrompts.elevation_north = this.generateElevationPrompt(masterDNA, 'north', projectContext);
      elevationPrompts.elevation_south = this.generateElevationPrompt(masterDNA, 'south', projectContext);
      elevationPrompts.elevation_east = this.generateElevationPrompt(masterDNA, 'east', projectContext);
      elevationPrompts.elevation_west = this.generateElevationPrompt(masterDNA, 'west', projectContext);
    }

    const prompts = {
      // ========================================
      // FLOOR PLANS (dynamic based on levels)
      // ========================================
      ...floorPlanPrompts,

      // ========================================
      // ELEVATIONS (2 AI-recommended or 4 fallback)
      // ========================================
      ...elevationPrompts,

      // ========================================
      // SECTIONS (2 unique)
      // ========================================
      section_longitudinal: this.generateSectionPrompt(masterDNA, 'longitudinal', projectContext),
      section_cross: this.generateSectionPrompt(masterDNA, 'cross', projectContext),

      // ========================================
      // 3D EXTERIOR VIEWS (2 unique)
      // ========================================
      exterior_front_3d: this.generate3DExteriorPrompt(masterDNA, 'front', projectContext),
      exterior_side_3d: this.generate3DExteriorPrompt(masterDNA, 'side', projectContext),

      // ========================================
      // 3D SPECIAL VIEWS (2 unique)
      // ========================================
      axonometric_3d: this.generateAxonometricPrompt(masterDNA, projectContext),
      perspective_3d: this.generatePerspectivePrompt(masterDNA, projectContext),

      // ========================================
      // INTERIOR VIEW (1 unique)
      // ========================================
      interior_3d: this.generateInteriorPrompt(masterDNA, projectContext),

      // ========================================
      // SITE PLAN VIEW (1 unique)
      // ========================================
      site_plan: this.generateSitePlanPrompt(masterDNA, projectContext)
    };

    console.log(`✅ Generated ${Object.keys(prompts).length} unique prompts (${Object.keys(floorPlanPrompts).length} floor plans, ${Object.keys(elevationPrompts).length} elevations, 2 sections, 5 3D views, 1 site plan)`);
    return prompts;
  }

  /**
   * Generate view-specific prompt for individual views
   * Used by AI modification service
   */
  generateViewSpecificPrompt(viewType, dna, projectContext = null) {
    console.log(`📝 Generating prompt for specific view: ${viewType}`);

    // Map view types to generation methods
    if (viewType.includes('floor-plan') || viewType.includes('floor_plan')) {
      const floor = viewType.includes('ground') ? 'ground' : 'upper';
      return {
        prompt: this.generateFloorPlanPrompt(dna, floor, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), (perspective:1.5), (3D:1.5), (isometric:1.5), watermark, signature'
      };
    }

    if (viewType.includes('elevation')) {
      const direction = viewType.includes('north') ? 'north' :
                       viewType.includes('south') ? 'south' :
                       viewType.includes('east') ? 'east' : 'west';
      return {
        prompt: this.generateElevationPrompt(dna, direction, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), (perspective:1.3), watermark, signature'
      };
    }

    if (viewType.includes('section')) {
      const type = viewType.includes('longitudinal') ? 'longitudinal' : 'cross';
      return {
        prompt: this.generateSectionPrompt(dna, type, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), photorealistic, watermark, signature'
      };
    }

    if (viewType.includes('exterior')) {
      const direction = viewType.includes('front') ? 'front' : 'side';
      return {
        prompt: this.generate3DExteriorPrompt(dna, direction, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), cartoon, sketch, watermark, signature'
      };
    }

    if (viewType.includes('axonometric')) {
      return {
        prompt: this.generateAxonometricPrompt(dna, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), perspective, watermark, signature'
      };
    }

    if (viewType.includes('perspective')) {
      return {
        prompt: this.generatePerspectivePrompt(dna, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), cartoon, watermark, signature'
      };
    }

    if (viewType.includes('interior')) {
      return {
        prompt: this.generateInteriorPrompt(dna, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), exterior view, watermark, signature'
      };
    }

    if (viewType.includes('site')) {
      return {
        prompt: this.generateSitePlanPrompt(dna, projectContext),
        negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), 3D, perspective, watermark, signature'
      };
    }

    // Fallback
    console.warn(`⚠️ Unknown view type: ${viewType}, using generic prompt`);
    return {
      prompt: `Architectural view: ${viewType}`,
      negativePrompt: '(low quality:1.4), (worst quality:1.4), (blurry:1.3), watermark, signature'
    };
  }

  /**
   * FLOOR PLAN PROMPTS - 2D overhead views
   */
  generateFloorPlanPrompt(dna, floor, projectContext = null) {
    const floorData = dna.floorPlans?.[floor];
    
    // 🆕 Extract project type and program spaces
    const projectType = projectContext?.projectType || dna.projectType || dna.buildingProgram || 'mixed-use';
    const programSpaces = projectContext?.programSpaces || dna.programSpaces || [];
    
    // 🆕 Build negative prompts based on project type
    const negativePrompts = [];
    if (projectType && !['residential-house', 'detached-house', 'semi-detached-house', 'terraced-house', 'villa', 'cottage', 'apartment', 'apartment-building'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO single-family house features', 'NO residential house layout', 'NO pitched roof unless specified');
    }
    if (projectType && ['office', 'retail', 'school', 'hospital'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO residential features', 'NO bedrooms unless specified', 'NO kitchen unless specified');
    }
    
    // Map floor names to display names
    const floorNameMap = {
      'basement': 'BASEMENT',
      'ground': 'GROUND FLOOR',
      'first': 'FIRST FLOOR',
      'second': 'SECOND FLOOR',
      'third': 'THIRD FLOOR',
      'upper': 'UPPER FLOOR'
    };
    
    const floorName = floorNameMap[floor] || floor.toUpperCase() + ' FLOOR';
    
    if (!floorData) {
      return this.getFallbackFloorPlanPrompt(floor);
    }

    const rooms = floorData.rooms || [];
    const roomList = rooms.map(r => `${r.name} (${r.dimensions}, ${r.area})`).join(', ');

    return `FLAT 2D OVERHEAD ARCHITECTURAL FLOOR PLAN - NO 3D, NO PERSPECTIVE, NO AXONOMETRIC, NO ISOMETRIC
${projectType !== 'residential-house' && negativePrompts.length > 0 ? `PROJECT TYPE: ${projectType.toUpperCase()} - ${negativePrompts.join(', ')}` : ''}
${programSpaces.length > 0 ? `PROGRAM SPACES REQUIRED: ${programSpaces.map(s => `${s.name}: ${s.area}m² × ${s.count}`).join(', ')}` : ''}

Pure orthographic top-down view, black lines on white background, CAD technical drawing style.
Absolutely flat like looking straight down from above. Zero depth. Zero shadows. Zero 3D effects.
This must look like AutoCAD or Revit output - completely flat 2D technical drawing.

DO NOT create: 3D view, perspective view, isometric view, axonometric view, rendered view, shadowed view.
ONLY create: Flat 2D plan view from directly above.

${floor === 'ground' ? `🚨🚨🚨 CRITICAL REQUIREMENT - MAIN ENTRANCE DOOR 🚨🚨🚨
THIS IS THE GROUND FLOOR - IT MUST HAVE A MAIN ENTRANCE DOOR FROM OUTSIDE!
The main entrance door MUST be clearly visible as a door opening in the exterior wall.
Show the door with swing arc (90° quarter circle showing door opening direction).
This is how people enter the building from the street/outside.
WITHOUT AN ENTRANCE DOOR, THE BUILDING IS INACCESSIBLE!
🚨🚨🚨 FAILURE TO SHOW ENTRANCE DOOR = UNUSABLE FLOOR PLAN 🚨🚨🚨` : ''}
${floor === 'basement' ? `🚨 BASEMENT FLOOR REQUIREMENTS 🚨
THIS IS THE BASEMENT - NO EXTERNAL ENTRANCE DOOR FROM OUTSIDE!
Access is via internal staircase from ground floor only.
Typically contains: Utility rooms, storage, mechanical spaces, or parking.
NO windows to exterior (below ground level).
Show internal staircase opening connecting to ground floor above.` : ''}
${floor !== 'ground' && floor !== 'basement' ? `🚨 UPPER FLOOR REQUIREMENTS 🚨
THIS IS AN UPPER FLOOR (${floorName}) - NO EXTERNAL ENTRANCE DOOR FROM OUTSIDE!
Access is via internal staircase from floor below.
${floor === 'first' ? 'Typically contains: Bedrooms, bathrooms, private spaces.' : 'May contain: Additional bedrooms, offices, or other spaces.'}
Show staircase opening connecting to floor below.
Show windows to exterior (matching positions from floor plans below).` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${floorName} PLAN - ${floor === 'ground' ? 'GROUND FLOOR (MUST HAVE ENTRANCE DOOR + LIVING SPACES)' : floor === 'basement' ? 'BASEMENT (UTILITY/STORAGE, NO EXTERNAL ENTRANCE)' : `${floorName} (NO EXTERNAL ENTRANCE, ACCESS VIA STAIRS)`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 VIEW TYPE: 100% FLAT 2D orthographic projection (looking straight down)
🎯 STYLE: Black linework on pure white background (CAD/technical drawing)
🎯 FLOOR: ${floorName} ONLY - ${floor === 'ground' ? 'showing MAIN ENTRANCE DOOR, LIVING SPACES' : floor === 'basement' ? 'showing UTILITY/STORAGE, NO EXTERNAL DOOR' : 'showing PRIVATE SPACES, NO EXTERNAL DOOR'}

━━━ 2D REQUIREMENTS (CRITICAL) ━━━
✓ TRUE orthographic top view (90° overhead, bird's eye)
✓ BLACK lines on PURE WHITE background only
✓ All walls shown as parallel lines (no perspective convergence)
✓ Zero depth perception (completely flat like a printed plan)
✓ Zero 3D rendering (no shading, shadows, lighting, or volume)
✓ Zero isometric/axonometric angles (must be straight overhead)

━━━ FLOOR SPECIFICATION ━━━
Floor Level: ${floorName} (${floor === 'ground' ? 'First level' : 'Second level'})
Building Footprint: ${dna.dimensions?.length}m (length) × ${dna.dimensions?.width}m (width)
Wall Thickness: Exterior ${typeof dna.dimensions?.wallThickness === 'string' ? dna.dimensions.wallThickness.split(',')[0].trim() : '0.3m'}, Interior 0.15m
Floor Height: ${floor === 'ground' ? dna.dimensions?.groundFloorHeight : dna.dimensions?.upperFloorHeight}
${dna.siteContext || ''}

━━━ ROOMS LAYOUT (${floorName} ONLY) ━━━
${floor === 'ground' ? '🚪 GROUND FLOOR ROOMS (Living Spaces + Entrance):' : '🛏️ UPPER FLOOR ROOMS (Bedrooms + Bathroom ONLY):'}
${roomList}
${floor === 'ground' ? `
🚪 MAIN ENTRANCE: ${floorData.entrance?.location} (${floorData.entrance?.type})
   ⚠️  This entrance MUST be visible as it connects to the street
   ⚠️  This is the PRIMARY access point to the building` : `
🪜 STAIRCASE LANDING: ${floorData.circulation || '2.0m × 1.5m'}
   ⚠️  This is the ONLY access to this floor (no external entrance)
   ⚠️  Stairs come UP from ground floor below
   ⚠️  NO main entrance door on this floor`}

━━━ MANDATORY ELEMENTS ━━━
${floor === 'ground' ? `
🚨 ABSOLUTE PRIORITY #1 - MAIN ENTRANCE DOOR:
✓ MAIN ENTRANCE DOOR FROM OUTSIDE - THIS IS CRITICAL!
✓ Position: In exterior wall (typically north/front facade)
✓ Size: 1.0m-1.2m wide opening in wall
✓ Symbol: Door swing arc (90° quarter circle) showing opening direction
✓ Label: "MAIN ENTRANCE" or "ENTRANCE" text near door
✓ MUST connect to exterior/street (NOT to another room)
✓ This is how people enter from outside - WITHOUT IT THE BUILDING IS UNUSABLE!

Then show these required annotations:` : 'Required Annotations:'}
✓ Room names in clean sans-serif font (Arial/Helvetica style, 10-12pt equivalent)
✓ Dimension lines with arrows showing room sizes
✓ 1 METER GRID LINES (light grey, every 1m) - REQUIRED for scale reference
✓ Furniture shown as simple 2D symbols (sofa, table, bed outlines)
✓ Wall thickness clearly shown as double lines
✓ Door swings with 90° arc indicators showing opening direction
✓ Window positions shown as breaks in walls with sill lines
✓ North arrow pointing upward (or specified direction) - REQUIRED
✓ Scale indicator: 1:100 - REQUIRED
✓ Floor level identifier: ${floor === 'ground' ? 'GF (Ground Floor)' : 'UF (Upper Floor) or 1F (First Floor)'}

${floor === 'ground' ? `
🚪 GROUND FLOOR SPECIFIC ELEMENTS (ALL REQUIRED):
✓ MAIN ENTRANCE DOOR (CRITICAL - see priority #1 above)
✓ Entrance hallway/foyer immediately inside main door
✓ Living room connected to hallway
✓ Kitchen and/or dining area
✓ Staircase with "UP" arrow showing stairs going to upper floor
✓ Ground floor toilet/powder room (optional but common)
✓ NO bedrooms on ground floor (bedrooms only on upper floor)
✓ NO "landing" on ground floor (landing is upper floor feature)` : `
🪜 UPPER FLOOR SPECIFIC ELEMENTS:
✓ Staircase opening with "UP" arrow from ground floor (showing stairs coming up)
✓ Landing at top of stairs (where you arrive from ground floor)
✓ 2-3 BEDROOMS clearly labeled (Master Bedroom, Bedroom 2, etc.)
✓ BATHROOM(S) clearly labeled (full bathroom with bath/shower/toilet/sink)
✓ NO main entrance from outside (only access is via internal stairs)
✓ NO kitchen (kitchen is on ground floor only)
✓ NO living room (living room is on ground floor only)
✓ NO door to street/outside (this floor is internal only)`}

━━━ EXPLICIT PROHIBITIONS ━━━
✗ NO 3D effects whatsoever (no depth, no shadows, no gradients)
✗ NO perspective distortion (all parallel walls must be parallel lines)
✗ NO isometric or axonometric projection
✗ NO color fills or shading
✗ NO thickness to walls (show as two parallel lines only)
✗ NO furniture visualization (or minimal 2D symbols if absolutely necessary)
✗ NO rendering effects (no ambient occlusion, no lighting)
✗ NO text shadows or decorative fonts

${floor === 'ground' ? `
━━━ GROUND FLOOR PROHIBITIONS ━━━
🚫 ABSOLUTELY FORBIDDEN ON GROUND FLOOR:
✗ NO "Bedroom" labels (bedrooms only on upper floor)
✗ NO "Master Bedroom" (upper floor only)
✗ NO "Landing" area (landing is at top of stairs on upper floor)
✗ NO bathroom labeled as "Master Bath" (upper floor only)
✗ The layout MUST show living/social spaces, NOT sleeping spaces` : `
━━━ UPPER FLOOR PROHIBITIONS ━━━
🚫 ABSOLUTELY FORBIDDEN ON UPPER FLOOR:
✗ NO main entrance door from outside
✗ NO "Main Entrance" label anywhere
✗ NO door connecting directly to street/garden/outside
✗ NO "Living Room" (ground floor only)
✗ NO "Kitchen" or "Dining Room" (ground floor only)
✗ NO "Reception" or "Hallway to entrance" (ground floor only)
✗ The layout MUST show sleeping/private spaces, NOT living/social spaces`}

━━━ CONSISTENCY MARKERS ━━━
Building Materials: ${dna.materials?.exterior?.primary}
Roof Configuration: ${dna.materials?.roof?.type} roof (${dna.materials?.roof?.pitch} pitch)
Project DNA Seed: ${dna.seed}
Floor Count: ${dna.dimensions?.floorCount} total floors

━━━ LOCATION CONTEXT ━━━
${dna.locationContext || 'Generic urban location'}
${dna.climateDesign?.thermal?.strategy ? `Climate Strategy: ${dna.climateDesign.thermal.strategy}` : ''}
${dna.climateDesign?.ventilation?.type ? `Ventilation: ${dna.climateDesign.ventilation.type}` : ''}

━━━ FINAL VALIDATION CHECK ━━━
🚨🚨🚨 CRITICAL FLOOR DIFFERENTIATION 🚨🚨🚨

THIS IS THE ${floorName.toUpperCase()} - NOT THE ${floor === 'ground' ? 'UPPER' : 'GROUND'} FLOOR!

${floor === 'ground' ? `
✅ GROUND FLOOR CHECKLIST (ALL must be present):
   1. ✓ MAIN ENTRANCE DOOR from street/outside
   2. ✓ Living room OR Reception area
   3. ✓ Kitchen OR Dining area
   4. ✓ Hallway connecting rooms
   5. ✓ Staircase with "UP" arrow to upper floor
   6. ✓ NO bedrooms
   7. ✓ NO landing area

❌ REJECTION CRITERIA - Regenerate if ANY of these are present:
   ✗ Bedroom labels
   ✗ Master bathroom
   ✗ Landing area
   ✗ Layout showing sleeping quarters instead of living spaces
` : `
✅ UPPER FLOOR CHECKLIST (ALL must be present):
   1. ✓ BEDROOMS (2-3 labeled as Bedroom 1, 2, Master Bedroom)
   2. ✓ BATHROOM(S) with bath/shower
   3. ✓ LANDING area at top of stairs
   4. ✓ Staircase opening (stairs coming UP from ground floor)
   5. ✓ NO main entrance from outside
   6. ✓ NO kitchen
   7. ✓ NO living room

❌ REJECTION CRITERIA - Regenerate if ANY of these are present:
   ✗ Main entrance door from outside
   ✗ Kitchen
   ✗ Living room
   ✗ Dining room
   ✗ Reception area
   ✗ "Main Entrance" label
   ✗ Layout showing living/social spaces instead of sleeping quarters
`}

🔍 BEFORE FINALIZING: Verify this is truly the ${floorName} layout, not a duplicate of the ${floor === 'ground' ? 'upper' : 'ground'} floor!

${floor === 'ground' ? `
🚨 FINAL ENTRANCE DOOR CHECK 🚨
STOP! Before outputting this floor plan, verify:
1. Is there a MAIN ENTRANCE DOOR visible in an exterior wall? ✓
2. Does it have a door swing arc showing it opens inward/outward? ✓
3. Is it labeled as "MAIN ENTRANCE" or "ENTRANCE"? ✓
4. Does it connect directly to outside (not to another room)? ✓
5. Is there an entrance hallway/foyer immediately inside? ✓

IF ANY OF THESE ARE MISSING - REDRAW THE PLAN WITH AN ENTRANCE DOOR!
A building without an entrance door is architecturally impossible!
` : ''}

Output: Professional architectural floor plan with ${floor === 'ground' ? 'MAIN ENTRANCE DOOR clearly visible' : 'bedrooms and NO external entrance'}, black linework on white background, true 2D orthographic overhead projection.`;
  }

  /**
   * ELEVATION PROMPTS - 2D Technical Blueprint Drawings (4 unique)
   */
  generateElevationPrompt(dna, direction, projectContext = null) {
    const elevData = dna.elevations?.[direction];
    if (!elevData) {
      return this.getFallbackElevationPrompt(direction);
    }

    // 🆕 Extract project type
    const projectType = projectContext?.projectType || dna.projectType || dna.buildingProgram || 'mixed-use';
    const negativePrompts = [];
    if (projectType && !['residential-house', 'detached-house', 'semi-detached-house', 'terraced-house', 'villa', 'cottage', 'apartment', 'apartment-building'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO single-family house', 'NO residential house facade', 'NO pitched roof unless specified');
    }
    
    const directionName = direction.toUpperCase();
    const features = elevData.features?.join(', ') || 'Standard facade features';
    const isMainFacade = direction === 'north';
    const facadeWidth = (direction === 'north' || direction === 'south') ? dna.dimensions?.length : dna.dimensions?.width;

    return `ARCHITECTURAL 2D TECHNICAL ELEVATION DRAWING - ${directionName} FACADE
${projectType !== 'residential-house' && negativePrompts.length > 0 ? `PROJECT TYPE: ${projectType.toUpperCase()} - ${negativePrompts.join(', ')}` : ''}
BLACK AND WHITE BLUEPRINT STYLE - NO PHOTOREALISM, NO 3D EFFECTS, NO COLORS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 DRAWING TYPE: 2D ORTHOGRAPHIC ELEVATION (Technical Blueprint)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This MUST be a pure 2D technical architectural drawing, NOT a photograph or rendering:
✓ Black lines on white background (blueprint/CAD style)
✓ Flat orthographic projection (zero perspective, zero depth)
✓ Technical linework showing facade outline, windows, doors, roof
✓ Dimension lines and measurements visible
✓ Material hatching patterns (brick, concrete, wood grain)
✓ Construction details and annotations
✓ Ground line clearly marked

✗ NO photorealistic rendering or photography
✗ NO 3D effects, shadows, lighting, textures
✗ NO colors (only black, white, and grayscale hatching)
✗ NO perspective distortion
✗ NO people, cars, trees, or landscaping
✗ NO sky, clouds, or background scenery

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 BUILDING SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Building: ${dna.dimensions?.floorCount}-story ${dna.building_program || 'residential building'}
Facade Width: ${facadeWidth}m
Total Height: ${dna.dimensions?.totalHeight}m
Ground Floor Height: ${dna.dimensions?.groundFloorHeight}
Upper Floor Height: ${dna.dimensions?.upperFloorHeight}

Materials (shown via hatching):
- Exterior Walls: ${dna.materials?.exterior?.primary} (use ${dna.materials?.exterior?.primary} hatching pattern)
- Roof: ${dna.materials?.roof?.type} (show roof pitch and eaves)
- Windows: ${dna.materials?.windows?.type} (show window frames as thin rectangles)
${isMainFacade ? `- Main Entrance: ${dna.materials?.doors?.main?.type} door (show with clear door symbol)` : ''}

Facade Features: ${features}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 REQUIRED DIMENSIONS & ANNOTATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Must include dimension lines showing:
✓ Total building width (${facadeWidth}m)
✓ Total building height (${dna.dimensions?.totalHeight}m)
✓ Floor-to-floor heights (ground: ${dna.dimensions?.groundFloorHeight}, upper: ${dna.dimensions?.upperFloorHeight})
✓ Window openings (width × height)
✓ Door openings (width × height)
✓ Roof height and pitch angle
✓ Ground level (±0.00) clearly marked

Annotations required:
- Drawing title: "${directionName} ELEVATION"
- Scale indicator (e.g., "SCALE 1:100")
- North arrow (if applicable)
- Material notes with leader lines
- Floor level markers (FFL 0.00m / FFL ${dna.dimensions?.groundFloorHeight || '3.10'}m / FFL ${dna.dimensions?.totalHeight || '6.20'}m)
- Material transitions clearly annotated (e.g., "Brick to Timber Cladding")
- Roof slope angle marked (e.g., "35° pitch")
- Glazing area percentage marked (e.g., "28% facade area")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 DRAWING STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Line Weights:
- Heavy lines (thick): Building outline, ground line, roof line
- Medium lines: Window/door frames, floor lines
- Thin lines: Dimension lines, hatching, annotations
- Dashed lines: Hidden elements (if any)

Hatching Patterns:
- ${dna.materials?.exterior?.primary} walls: Appropriate material hatch
- Windows: Light crosshatch or clear (show glass)
- Roof: Roof tile or material pattern
- Ground: Simple horizontal line

Format: Professional architectural technical drawing, CAD/blueprint style, black linework on white background, orthographic elevation, dimensioned and annotated.

SEED: ${dna.seed}`;
  }

  /**
   * SECTION PROMPTS - 2D Technical Section Drawings (2 unique)
   */
  generateSectionPrompt(dna, type, projectContext = null) {
    const sectionData = dna.sections?.[type];
    if (!sectionData) {
      return this.getFallbackSectionPrompt(type);
    }

    // 🆕 Extract project type
    const projectType = projectContext?.projectType || dna.projectType || dna.buildingProgram || 'mixed-use';
    const negativePrompts = [];
    if (projectType && !['residential-house', 'detached-house', 'semi-detached-house', 'terraced-house', 'villa', 'cottage', 'apartment', 'apartment-building'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO single-family house', 'NO residential house section');
    }

    const sectionName = type === 'longitudinal' ? 'LONGITUDINAL SECTION' : 'CROSS SECTION';
    const visible = sectionData.visible?.join(', ') || 'Interior structure';
    const dimension = type === 'longitudinal' ? dna.dimensions?.length : dna.dimensions?.width;
    const cutDirection = type === 'longitudinal' ? 'lengthwise (front to back)' : 'across width (side to side)';

    return `ARCHITECTURAL 2D TECHNICAL SECTION DRAWING - ${sectionName}
BLACK AND WHITE BLUEPRINT STYLE - NO PHOTOREALISM, NO 3D EFFECTS, NO COLORS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 DRAWING TYPE: 2D ORTHOGRAPHIC SECTION (Technical Blueprint)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This MUST be a pure 2D technical architectural section drawing, NOT a rendering:
✓ Black lines on white background (blueprint/CAD style)
✓ Flat orthographic projection (zero perspective, zero depth)
✓ Building CUT ${cutDirection} to show interior
✓ Cut elements (walls, floors, roof) shown with heavy lines
✓ Interior spaces clearly visible beyond cut
✓ All floor levels, ceiling heights clearly marked
✓ Dimension lines showing heights, widths, depths
✓ Room labels and annotations
✓ Staircase details visible (if in cut plane)
✓ Foundation and ground level shown

✗ NO photorealistic 3D rendering or visualization
✗ NO colors, shading, shadows, or lighting effects
✗ NO perspective distortion (all vertical lines must be perfectly vertical)
✗ NO people, furniture, or decorative elements
✗ NO texture mapping or material rendering
✗ NO depth effects or atmospheric perspective

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 SECTION SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Building: ${dna.dimensions?.floorCount}-story ${dna.building_program || 'residential building'}
Cut Location: ${sectionData.cutLocation}
Section Depth: ${dimension}m
Total Building Height: ${dna.dimensions?.totalHeight}m
Ground Floor Height: ${dna.dimensions?.groundFloorHeight}
Upper Floor Height: ${dna.dimensions?.upperFloorHeight}
Wall Thickness: ${dna.dimensions?.wallThickness} (exterior walls)

Visible Interior Elements:
${visible}
${type === 'longitudinal' ? '- Staircase connecting floors with step details' : '- Room widths and interior wall divisions'}
- Floor slabs (${dna.dimensions?.slabThickness} thick)
- Ceiling heights at each level
- Roof structure and pitch
- Foundation depth below ground level

Materials (shown via hatching on CUT surfaces):
- Exterior Walls: ${dna.materials?.exterior?.primary} (heavy hatch on cut surface)
- Roof Structure: ${dna.materials?.roof?.type} (show rafters/trusses)
- Floor Slabs: Concrete (diagonal hatch on cut)
- Interior Walls: Lightweight construction (lighter hatch)
- Foundation: Concrete (heavy diagonal hatch)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 REQUIRED DIMENSIONS & ANNOTATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Must include dimension lines showing:
✓ Total building height (${dna.dimensions?.totalHeight}m)
✓ Ground floor ceiling height (${dna.dimensions?.groundFloorHeight})
✓ Upper floor ceiling height (${dna.dimensions?.upperFloorHeight})
✓ Floor slab thickness (${dna.dimensions?.slabThickness})
✓ Exterior wall thickness (${dna.dimensions?.wallThickness})
✓ Room widths/depths (all major spaces)
✓ Foundation depth below grade
✓ Roof pitch and height
✓ Floor-to-floor dimensions

Level Markers (on left side):
- Roof Level: +${dna.dimensions?.totalHeight}m
- Upper Floor: +${dna.dimensions?.groundFloorHeight}
- Ground Floor: ±0.00
- Foundation: -0.5m (or actual depth)

Annotations required:
- Drawing title: "${sectionName}" or "SECTION A-A"
- Section cut line direction indicator (A-A arrows)
- Scale indicator (e.g., "SCALE 1:100")
- Room labels (Living Room, Kitchen, Bedroom, etc.)
- Material notes with leader lines pointing to cut elements
- Floor level labels (FFL 0.00m / FFL ${dna.dimensions?.groundFloorHeight || '3.10'}m / FFL ${dna.dimensions?.totalHeight || '6.20'}m)
- Key detail callouts: insulation layer, foundation strip footing
- Floor build-ups annotated (e.g., "150mm concrete slab + 50mm insulation")
- Ceiling heights clearly marked at each level

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 DRAWING STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Line Weights:
- Extra heavy lines: Elements in cut (walls, floors, roof where cut)
- Heavy lines: Building outline, major structural elements
- Medium lines: Interior walls, windows, doors beyond cut
- Thin lines: Dimension lines, hatching, annotations
- Dashed lines: Hidden elements or structure above/below

Hatching Patterns (for CUT elements only):
- Exterior walls (cut): Dense diagonal hatch (45°)
- Floor slabs (cut): Concrete hatch pattern
- Roof structure (cut): Wood/structural pattern
- Foundation (cut): Heavy concrete hatch
- Interior walls (cut): Light hatch (indicates non-structural)

Elements Beyond Cut (NOT hatched):
- Show windows and doors as outlines
- Show visible walls in background as thin lines
- Indicate room spaces clearly
- NO hatching on elements that are not cut

Format: Professional architectural technical section drawing, CAD/blueprint style, black linework on white background, orthographic projection, fully dimensioned and annotated.

SEED: ${dna.seed}`;
  }

  /**
   * 3D EXTERIOR PROMPTS - Photorealistic views (2 unique angles)
   */
  generate3DExteriorPrompt(dna, viewDirection, projectContext = null) {
    const viewData = dna['3dViews']?.[`exterior_${viewDirection}`];
    if (!viewData) {
      return this.getFallback3DExteriorPrompt(viewDirection);
    }

    // 🆕 Extract project type
    const projectType = projectContext?.projectType || dna.projectType || dna.buildingProgram || 'mixed-use';
    const negativePrompts = [];
    if (projectType && !['residential-house', 'detached-house', 'semi-detached-house', 'terraced-house', 'villa', 'cottage', 'apartment', 'apartment-building'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO single-family house', 'NO residential house', 'NO pitched roof unless specified', 'NO front yard/garden');
    }
    
    const visible = viewData.visible?.join('\n✓ ') || 'Building exterior';
    const camera = viewData.camera || 'Eye level view';
    const isFrontView = viewDirection === 'front';

    return `Photorealistic 3D architectural exterior render - ${viewDirection.toUpperCase()} VIEW [SEED: ${dna.seed}]
${projectType !== 'residential-house' && negativePrompts.length > 0 ? `PROJECT TYPE: ${projectType.toUpperCase()} - ${negativePrompts.join(', ')}` : ''}

🎯 PRIMARY OBJECTIVE: Create a HIGH-QUALITY photorealistic 3D render that EXACTLY matches the floor plans and elevations

━━━ RENDER SPECIFICATIONS ━━━
Render Quality: Professional architectural visualization (4K quality)
Style: Photorealistic (NOT cartoon, NOT artistic, NOT stylized)
Camera Position: ${camera}
View Direction: ${isFrontView ? 'From NORTH looking at SOUTH facade (front view)' : 'From EAST looking at WEST facade (side view)'}
Eye Height: 1.6m (human standing viewpoint)
Focal Length: 35-50mm equivalent (natural perspective, minimal distortion)

━━━ VIEW CONFIGURATION ━━━
${viewData.description}
Visible Elements:
✓ ${visible}

Primary Focus: ${viewData.mustShow}
${isFrontView ? '🚪 MAIN ENTRANCE must be PROMINENTLY VISIBLE and clearly recognizable' : '📏 Building DEPTH and three-dimensional form clearly shown'}

━━━ BUILDING DIMENSIONS (CRITICAL - MUST MATCH TECHNICAL DRAWINGS) ━━━
Floor Count: EXACTLY ${dna.dimensions?.floorCount} floors
  └─ Ground Floor: 0.0m to +${dna.dimensions?.groundFloorHeight} (height: ${dna.dimensions?.groundFloorHeight})
  └─ Upper Floor: +${dna.dimensions?.groundFloorHeight} to +${dna.dimensions?.totalHeight} (height: ${dna.dimensions?.upperFloorHeight})
Building Footprint: ${dna.dimensions?.length}m (length) × ${dna.dimensions?.width}m (width)
Total Height: ${dna.dimensions?.totalHeight}m from ground to roof ridge
${isFrontView ? `Front Facade Width: ${dna.dimensions?.length}m` : `Side Facade Width: ${dna.dimensions?.width}m`}

⚠️ CRITICAL: This is a ${dna.dimensions?.floorCount}-floor ${dna.dimensions?.floorCount === 1 ? 'single-story building' : dna.dimensions?.floorCount === 2 ? 'two-story house' : 'multi-story building'}, NOT a ${dna.dimensions?.floorCount + 1}-floor building!

━━━ MATERIALS - PHOTOREALISTIC & EXACT ━━━
Exterior Walls: ${dna.materials?.exterior?.primary}
  └─ Exact Color: ${dna.materials?.exterior?.color} (match this hex code precisely)
  └─ Texture: ${dna.materials?.exterior?.texture} finish
  └─ Pattern: ${dna.materials?.exterior?.bond || 'Standard bond pattern'}
  └─ Finish: ${dna.materials?.exterior?.finish || 'Matte'} appearance
  └─ Rendering: Show realistic brick/material texture with subtle color variation
  └─ Weathering: Clean, well-maintained (slight weathering acceptable)

Roof: ${dna.materials?.roof?.material}
  └─ Color: ${dna.materials?.roof?.color} (exact match)
  └─ Type: ${dna.materials?.roof?.type} roof
  └─ Pitch: ${dna.materials?.roof?.pitch} angle (clearly visible)
  └─ Overhang: ${dna.materials?.roof?.overhang || '0.4m'} beyond walls
  └─ Ridge Height: ${dna.materials?.roof?.ridgeHeight || dna.dimensions?.totalHeight}m
  └─ Rendering: Show realistic tile/material texture, clean and new

Windows: ${dna.materials?.windows?.type} style windows
  └─ Frame Material: ${dna.materials?.windows?.frame}
  └─ Frame Color: ${dna.materials?.windows?.color} (exact match)
  └─ Glazing: ${dna.materials?.windows?.glazing} glazed with realistic reflections
  └─ Size: ${dna.materials?.windows?.standardSize || '1.5m × 1.2m each'}
  └─ Mullions: ${dna.materials?.windows?.mullions || 'Yes'} (if specified)
  └─ Rendering: Show realistic glass reflections (subtle sky/environment reflection)
  └─ Positions: EXACTLY as shown in elevations (no additional windows)

${isFrontView ? `Main Entrance Door:
  └─ Type: ${dna.materials?.doors?.main?.type} door
  └─ Material: ${dna.materials?.doors?.main?.material}
  └─ Color: ${dna.materials?.doors?.main?.color} (exact match)
  └─ Size: ${dna.materials?.doors?.main?.width} × ${dna.materials?.doors?.main?.height || '2.1m'}
  └─ Style: ${dna.materials?.doors?.main?.panelConfig || 'Traditional panel configuration'}
  └─ Details: Door handle, threshold, frame clearly visible
  └─ Rendering: High-quality material finish, realistic wood grain or painted surface` : ''}

Trim & Details: ${dna.materials?.trim?.material} trim
  └─ Color: ${dna.materials?.trim?.color} (contrasts with exterior)
  └─ Width: ${dna.materials?.trim?.width || '150mm'}
  └─ Application: Around windows, doors, corners, roof edges

━━━ LIGHTING & ATMOSPHERE ━━━
Time of Day: Golden hour (late afternoon, 4-5 PM)
Sun Position: Low in sky, creating warm directional light
Sky: Realistic blue sky with scattered white clouds (20-30% cloud cover)
Lighting Quality: Soft, warm, natural sunlight
  └─ Primary Light: Warm golden sunlight from sun
  └─ Shadows: Soft, natural shadows (not harsh, not absent)
  └─ Ambient Light: Gentle blue sky fill light
  └─ Exposure: Balanced (neither too bright nor too dark)

Material Reflections:
  └─ Windows: Subtle sky and environment reflections in glass
  └─ Surfaces: Realistic material response to light (matte brick, glossy windows)
  └─ Atmosphere: Clear visibility, slight atmospheric haze in distance

━━━ CONTEXT & SURROUNDINGS ━━━
Site Context: Suburban/residential neighborhood setting
Landscaping:
  └─ Front/Side Garden: Well-maintained lawn (green grass, not yellow)
  └─ Path/Driveway: Paved walkway leading to entrance (concrete or paving stones)
  └─ Planting: Small shrubs or flowers near building foundation (not overgrown)
  └─ Trees: 1-2 small ornamental trees (not blocking view of building)
  └─ Boundaries: Low hedge or fence visible in background (optional)

Background:
  └─ Neighboring Buildings: Subtle context (houses visible in far background, out of focus)
  └─ Sky: Realistic atmosphere
  └─ Ground Plane: Continues naturally into distance

Scale Reference:
  └─ Optional: Car in driveway, bicycle, or outdoor furniture for human scale
  └─ Keep minimal - building is the focus

━━━ CRITICAL CONSISTENCY REQUIREMENTS ━━━
✓ Floor count MUST be EXACTLY ${dna.dimensions?.floorCount} floors (count the horizontal divisions)
✓ Window positions MUST match elevation drawings EXACTLY (same number, same spacing)
✓ Building proportions MUST match dimensions: ${dna.dimensions?.length}m × ${dna.dimensions?.width}m × ${dna.dimensions?.totalHeight}m
✓ Material colors MUST match hex codes EXACTLY (${dna.materials?.exterior?.color} walls, ${dna.materials?.roof?.color} roof)
✓ Roof type and pitch MUST match (${dna.materials?.roof?.type} at ${dna.materials?.roof?.pitch})
✓ ${isFrontView ? 'Main entrance MUST be visible and match north elevation drawing' : 'Side facade MUST match east/west elevation drawing'}
✓ No additional architectural features not shown in technical drawings

━━━ EXPLICIT PROHIBITIONS ━━━
✗ NO cartoon or artistic stylization (photorealistic only)
✗ NO unrealistic materials (no shiny plastic, no fake textures)
✗ NO harsh dramatic lighting (natural daylight only)
✗ NO extra floors beyond ${dna.dimensions?.floorCount} (common AI mistake)
✗ NO wrong building type (this is a ${dna.dimensions?.floorCount === 2 ? 'two-story detached house' : 'residential building'}, NOT an apartment block)
✗ NO additional windows not shown in elevations
✗ NO wrong facade (${isFrontView ? 'show FRONT facade, not side or rear' : 'show SIDE facade, not front or rear'})
✗ NO fantasy architecture or creative reinterpretation

━━━ DIFFERENTIATION FROM OTHER VIEWS ━━━
This is the ${isFrontView ? 'FRONT' : 'SIDE'} 3D view:
${isFrontView ? '- Shows north facade with main entrance prominently\n- Primary facade, typically symmetrical\n- Focus on entrance and front facade details\n- DIFFERENT from side view (which shows building depth)' : '- Shows east or west facade from side\n- Demonstrates building depth and three-dimensional form\n- Partial view of front or rear facade\n- DIFFERENT from front view (which shows main entrance)'}

Output: Professional architectural 3D render, photorealistic quality, natural lighting, ${viewDirection} exterior view showing EXACTLY ${dna.dimensions?.floorCount} floors.`;
  }

  /**
   * AXONOMETRIC PROMPT - 45° isometric technical view
   */
  generateAxonometricPrompt(dna, projectContext = null) {
    const viewData = dna['3dViews']?.axonometric;
    
    // 🆕 Extract project type
    const projectType = projectContext?.projectType || dna.projectType || dna.buildingProgram || 'mixed-use';
    const negativePrompts = [];
    if (projectType && !['residential-house', 'detached-house', 'semi-detached-house', 'terraced-house', 'villa', 'cottage', 'apartment', 'apartment-building'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO single-family house', 'NO residential house', 'NO pitched roof unless specified');
    }

    return `Architectural AXONOMETRIC projection - 45° isometric technical drawing.
${projectType !== 'residential-house' && negativePrompts.length > 0 ? `PROJECT TYPE: ${projectType.toUpperCase()} - ${negativePrompts.join(', ')}` : ''}

CRITICAL REQUIREMENTS:
- 45-DEGREE AXONOMETRIC PROJECTION (NOT perspective)
- Isometric view with NO perspective distortion
- All parallel lines remain parallel
- Technical architectural illustration style
- View from NORTHEAST corner looking down at 30°

VIEW: ${viewData?.description || '45° axonometric from northeast'}
Projection: TRUE AXONOMETRIC (no perspective convergence)
Angle: 45° plan rotation, 30° vertical angle

BUILDING SPECIFICATIONS:
- ${dna.dimensions?.floorCount} floors
- ${dna.dimensions?.length}m × ${dna.dimensions?.width}m × ${dna.dimensions?.totalHeight}m
- Roof: ${dna.materials?.roof?.type} at ${dna.materials?.roof?.pitch}

VISIBLE IN THIS VIEW:
- NORTH facade (front with main entrance)
- EAST facade (right side)
- FULL ROOF GEOMETRY clearly visible from above
- All three dimensions visible

MATERIALS - CLEAN TECHNICAL STYLE:
- Walls: ${dna.materials?.exterior?.primary} (${dna.materials?.exterior?.color})
- Roof: ${dna.materials?.roof?.material} (${dna.materials?.roof?.color})
- Windows: ${dna.materials?.windows?.type} (${dna.materials?.windows?.color} frames)

DRAWING STYLE:
- Clean line drawing with subtle color/shading
- Technical illustration quality
- Clear edges and details
- No harsh shadows
- Architectural presentation style
- White/light background

MUST SHOW:
- Main entrance on north facade
- Window pattern clearly visible
- Roof shape and pitch clear
- Building proportions accurate
- All three dimensions (length, width, height)

MUST NOT INCLUDE:
- NO perspective distortion
- NO vanishing points
- NO strong shadows
- Parallel lines MUST stay parallel

Project Seed: ${dna.seed}
This is an AXONOMETRIC view - technical isometric showing all faces and roof from above without perspective.`;
  }

  /**
   * PERSPECTIVE PROMPT - Realistic eye-level perspective view
   */
  generatePerspectivePrompt(dna, projectContext = null) {
    const viewData = dna['3dViews']?.perspective;
    
    // 🆕 Extract project type
    const projectType = projectContext?.projectType || dna.projectType || dna.buildingProgram || 'mixed-use';
    const negativePrompts = [];
    if (projectType && !['residential-house', 'detached-house', 'semi-detached-house', 'terraced-house', 'villa', 'cottage', 'apartment', 'apartment-building'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO single-family house', 'NO residential house', 'NO pitched roof unless specified');
    }

    return `Photorealistic 2-POINT PERSPECTIVE architectural visualization - CORNER VIEW.
${projectType !== 'residential-house' && negativePrompts.length > 0 ? `PROJECT TYPE: ${projectType.toUpperCase()} - ${negativePrompts.join(', ')}` : ''}

CRITICAL REQUIREMENTS:
- 2-POINT PERSPECTIVE (two vanishing points)
- Eye-level human viewpoint
- Realistic perspective convergence
- Photorealistic render quality
- View from NORTHWEST corner

VIEW: ${viewData?.description || 'Eye level perspective from northwest'}
Camera: Standing at northwest corner, looking southeast
Perspective: TWO-POINT perspective with realistic convergence
Eye height: 1.6m (human standing view)

BUILDING SPECIFICATIONS:
- ${dna.dimensions?.floorCount} floors
- ${dna.dimensions?.length}m × ${dna.dimensions?.width}m × ${dna.dimensions?.totalHeight}m
- View angle: 45° to building corner

VISIBLE IN THIS VIEW:
- NORTH facade (front with main entrance) - PROMINENTLY VISIBLE
- WEST facade (left side) - partially visible
- Roof with realistic perspective
- Corner of building emphasized

MATERIALS - PHOTOREALISTIC:
- Exterior walls: ${dna.materials?.exterior?.primary}, color ${dna.materials?.exterior?.color}, ${dna.materials?.exterior?.texture} texture
- Roof: ${dna.materials?.roof?.material}, color ${dna.materials?.roof?.color}
- Windows: ${dna.materials?.windows?.type}, ${dna.materials?.windows?.frame} frames in ${dna.materials?.windows?.color}
- Main entrance: ${dna.materials?.doors?.main?.type} door in ${dna.materials?.doors?.main?.color}
- Trim: ${dna.materials?.trim?.color} ${dna.materials?.trim?.material}

LIGHTING & ATMOSPHERE:
- Natural daylight (soft, even lighting)
- Realistic shadows on ground
- Blue sky with few clouds
- Natural material reflections (glass windows reflect sky)
- Warm, inviting atmosphere

CONTEXT & SURROUNDINGS:
- Front garden with lawn
- Path leading to entrance
- Small landscaping (shrubs, flowers near entrance)
- Driveway visible
- Neighboring houses in background (out of focus)
- Human scale reference (person, car, or bicycle optional)

PERSPECTIVE EFFECTS:
- Vertical lines remain vertical
- Horizontal lines converge to two vanishing points
- Natural depth and distance perception
- Realistic foreshortening

MUST SHOW:
- Main entrance clearly visible on north facade
- Corner of building emphasized
- Two facades visible at angle
- Realistic perspective depth
- Human-eye-level viewpoint

Project Seed: ${dna.seed}
This is a PERSPECTIVE view - realistic human eye level from corner showing depth and dimension with natural perspective convergence.`;
  }

  /**
   * INTERIOR PROMPT - Living room interior
   */
  generateInteriorPrompt(dna, projectContext = null) {
    const viewData = dna['3dViews']?.interior;
    const livingRoom = dna.floorPlans?.ground?.rooms?.find(r => r.name?.toLowerCase().includes('living'));
    
    // 🆕 Extract project type
    const projectType = projectContext?.projectType || dna.projectType || dna.buildingProgram || 'mixed-use';
    const negativePrompts = [];
    if (projectType && ['office', 'retail', 'school', 'hospital'].includes(projectType.toLowerCase())) {
      negativePrompts.push('NO residential features', 'NO bedrooms unless specified', 'NO kitchen unless specified');
    }

    return `Photorealistic INTERIOR architectural visualization - ${projectType === 'office' ? 'OFFICE SPACE' : projectType === 'retail' ? 'RETAIL SPACE' : 'LIVING ROOM'}.
${projectType !== 'residential-house' && negativePrompts.length > 0 ? `PROJECT TYPE: ${projectType.toUpperCase()} - ${negativePrompts.join(', ')}` : ''}

CRITICAL REQUIREMENTS:
- Interior view INSIDE the building
- High-quality 3D render
- Photorealistic materials and lighting
- Standing inside living room, looking toward windows
- Natural daylight flooding in

VIEW: ${viewData?.description || 'Interior of living room'}
Camera: Standing in living room, looking at south-facing windows
Room: Ground floor living room
Dimensions: ${livingRoom?.dimensions || '5.5m × 4.0m'}

ROOM SPECIFICATIONS:
- Ceiling height: ${dna.dimensions?.groundFloorHeight}
- Floor area: ${livingRoom?.area || '22m²'}
- Windows: ${livingRoom?.windows?.[0] || '2 large windows with natural light'}
- Doors: ${livingRoom?.doors?.[0] || '1 door visible'}

INTERIOR MATERIALS:
- Walls: Painted drywall in warm neutral color (off-white, light grey)
- Flooring: Hardwood or engineered wood in natural oak color
- Ceiling: White painted with subtle texture
- Windows: ${dna.materials?.windows?.type} with ${dna.materials?.windows?.color} frames
- Trim: ${dna.materials?.trim?.color} skirting boards and door frames

FURNITURE (for scale and realism):
- Modern comfortable sofa (grey or neutral)
- Coffee table (wood or glass)
- Side table with lamp
- Minimalist contemporary style
- Not cluttered - clean, spacious feeling

LIGHTING:
- NATURAL LIGHT as main source (through windows)
- Soft, warm sunlight streaming in
- Gentle shadows
- Bright, airy atmosphere
- Optional: subtle ceiling lights or floor lamp

WINDOWS & VIEW:
- Large windows visible
- Natural light flooding the space
- View outside showing garden (slightly out of focus)
- Curtains or blinds optional (if present, partially open)
- SOUTH-FACING WINDOWS: Main daylight source from south (if applicable)
- Daylight optimization: Living area oriented toward south for maximum daylight

ATMOSPHERE:
- Warm and inviting
- Clean and modern
- Spacious feeling
- Comfortable living space
- Natural materials and textures

MUST SHOW:
- Interior space clearly
- Windows with natural light
- Ceiling height and room proportions
- Flooring material
- Furniture for human scale
- Warm, lived-in feeling

MUST NOT SHOW:
- Exterior of building
- Other rooms (unless doorway visible)
- Cluttered space

Project Seed: ${dna.seed}
This is the INTERIOR view of the living room - completely different from all exterior views, showing the inside of the ${dna.dimensions?.floorCount}-floor house.`;
  }

  /**
   * SITE PLAN PROMPT - Site context with building footprint
   */
  generateSitePlanPrompt(dna, projectContext) {
    const siteArea = projectContext?.siteMetrics?.areaM2 || dna.siteArea || 450;
    const siteOrientation = projectContext?.siteMetrics?.orientationDeg || 0;
    const sitePolygon = projectContext?.sitePolygon || null;

    return `ARCHITECTURAL SITE PLAN - 1:500 SCALE
TOP-DOWN ORTHOGRAPHIC VIEW showing building on site with context

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 DRAWING TYPE: 2D Site Plan (Technical Drawing)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This MUST be a pure 2D technical site plan:
✓ Black lines on white background (CAD/technical drawing style)
✓ Top-down orthographic view (90° overhead, bird's eye)
✓ Building footprint clearly shown
✓ Site boundary marked
✓ Orientation (north arrow REQUIRED)
✓ Surrounding context (roads, neighboring buildings, garden)
✓ Driveway/pathway if applicable
✓ Scale 1:500 clearly marked

✗ NO 3D effects or perspective
✗ NO photorealistic rendering
✗ NO colors (only black, white, greyscale)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 SITE SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Site Area: ${siteArea.toFixed(0)} m²
Site Orientation: ${siteOrientation.toFixed(0)}° from North
Building Footprint: ${dna.dimensions?.length}m (length) × ${dna.dimensions?.width}m (width)
Building Orientation: South-facing main façade (if applicable)

Site Context:
- Site boundary polygon clearly marked
- Setbacks: 3m minimum from boundaries
- Garden area shown
- Driveway/pathway to main entrance
- Orientation to road/street
- Neighboring buildings (outlined, not detailed)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 REQUIRED ELEMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Building footprint outline (rectangular or as per design)
✓ Site boundary (if custom polygon provided)
✓ North arrow - REQUIRED (pointing upward)
✓ Scale bar: 1:500 - REQUIRED
✓ Main entrance location marked
✓ Garden/landscaping area
✓ Driveway/pathway to entrance
✓ Setback distances marked (3m from boundaries)
✓ Orientation annotation (e.g., "Building oriented to South")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 DRAWING STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Line Weights:
- Heavy lines: Building footprint outline
- Medium lines: Site boundary, roads
- Thin lines: Dimensions, annotations, grid

Format: Professional architectural site plan, CAD/technical drawing style, black linework on white background, orthographic top-down view, fully annotated with north arrow and scale.

SEED: ${dna.seed}`;
  }

  /**
   * FALLBACK PROMPTS - If DNA data is incomplete
   */
  getFallbackFloorPlanPrompt(floor) {
    if (floor === 'ground') {
      return `GROUND FLOOR PLAN WITH MAIN ENTRANCE DOOR - 2D CAD technical drawing

🚨 CRITICAL: MUST SHOW MAIN ENTRANCE DOOR FROM OUTSIDE!
The main entrance door in an exterior wall with door swing arc (90° quarter circle).
This is how people enter the building - WITHOUT IT THE PLAN IS UNUSABLE!

Architectural ground floor plan showing:
- MAIN ENTRANCE DOOR (critical) with label
- Living room, kitchen, dining area
- Staircase with UP arrow
- NO bedrooms (ground floor has living spaces only)
- Room labels, dimensions, door swings
- Black lines on white background
- TRUE 2D overhead view (NO 3D perspective)
- North arrow, scale 1:100
- Professional CAD style`;
    } else {
      return `UPPER FLOOR PLAN - 2D CAD technical drawing

Architectural upper floor plan showing:
- 2-3 Bedrooms (Master, Bedroom 2, etc.)
- Bathroom(s)
- Landing at top of stairs
- Staircase opening (stairs coming UP from ground)
- NO main entrance (upper floor has NO external doors)
- Room labels, dimensions, door swings
- Black lines on white background
- TRUE 2D overhead view (NO 3D perspective)
- North arrow, scale 1:100
- Professional CAD style`;
    }
  }

  getFallbackElevationPrompt(direction) {
    return `Architectural ${direction} elevation, 2D flat facade view, black lines on white background, NO perspective, technical line drawing, showing ${direction} facade only, dimension lines, floor levels, windows, doors, materials annotated, professional CAD style. This is the ${direction} elevation - different from other elevations.`;
  }

  getFallbackSectionPrompt(type) {
    return `Architectural ${type} section, 2D cut through building, black lines on white background, interior structure visible, floor levels, ceiling heights, roof structure, foundation, wall thicknesses, dimension lines, material hatching, technical drawing. This is a ${type} section - different from other sections.`;
  }

  getFallback3DExteriorPrompt(direction) {
    return `Photorealistic 3D exterior view from ${direction}, high-quality architectural render, natural materials, golden hour lighting, ${direction === 'front' ? 'main entrance visible' : 'side facade showing building depth'}, professional photography style, realistic landscaping, sky background. This is the ${direction} view - different angle from other 3D views.`;
  }
}

export default new DNAPromptGenerator();
