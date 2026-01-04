/**
 * Enhanced View Configuration Service
 *
 * Implements professional-grade multi-view consistency using:
 * - Enhanced prompt templates with explicit floor plan/elevation references
 * - Multi-ControlNet configuration (floor plan + multiple elevations)
 * - Dynamic elevation mapping based on view orientation
 * - Enhanced negative prompts to prevent hallucinations
 * - Optimal conditioning scales and preprocessors
 * - Strict facade enumeration for exact window/door counts
 */

import facadeFeatureAnalyzer from './facadeFeatureAnalyzer.js';
import logger from '../utils/logger.js';


class EnhancedViewConfigurationService {
  constructor() {
    logger.info('🎨 Enhanced View Configuration Service initialized');
    this.facadeAnalyzer = facadeFeatureAnalyzer;

    // ControlNet configuration
    this.defaultConfig = {
      floorPlanWeight: 1.1,        // High weight for overall structure
      elevationWeight: 0.9,        // Slightly lower for facade details
      preprocessor: 'scribble',    // Best for architectural line drawings
      controlMode: 'balanced',     // ControlNet + prompt balanced
      cfgScale: 8,                 // Moderate guidance scale
      steps: 30                    // Good quality/speed balance
    };

    // Cardinal direction to elevation mapping
    this.elevationMap = {
      north: 'elevation_north',
      south: 'elevation_south',
      east: 'elevation_east',
      west: 'elevation_west'
    };
  }

  /**
   * Determine which elevation images are visible from a given view orientation
   *
   * @param {string} viewOrientation - e.g., "NW", "North-West", "south-east"
   * @returns {Array<string>} - Array of elevation names (e.g., ["north", "west"])
   */
  getVisibleElevations(viewOrientation) {
    const orientation = viewOrientation.toUpperCase().replace(/[- ]/g, '');
    const visible = [];

    // Check for cardinal directions in the orientation string
    if (orientation.includes('N') && !orientation.includes('NE') && !orientation.includes('NW')) {
      visible.push('north');
    } else if (orientation.includes('NW')) {
      visible.push('north', 'west');
    } else if (orientation.includes('NE')) {
      visible.push('north', 'east');
    }

    if (orientation.includes('S') && !orientation.includes('SE') && !orientation.includes('SW')) {
      visible.push('south');
    } else if (orientation.includes('SW')) {
      visible.push('south', 'west');
    } else if (orientation.includes('SE')) {
      visible.push('south', 'east');
    }

    if (orientation.includes('E') && !visible.includes('east')) {
      visible.push('east');
    }

    if (orientation.includes('W') && !visible.includes('west')) {
      visible.push('west');
    }

    // Default to north + east if no orientation specified
    if (visible.length === 0) {
      visible.push('north', 'east');
    }

    // Limit to 2 primary facades for perspective views
    return visible.slice(0, 2);
  }

  /**
   * Generate enhanced exterior perspective prompt
   * Follows the professional template with explicit floor plan/elevation references
   */
  generateExteriorPrompt(buildingCore, viewOrientation = 'NW') {
    const { geometry, materials, openings, roof, style_features } = buildingCore;
    const visibleSides = this.getVisibleElevations(viewOrientation);

    // ENHANCEMENT: Analyze facade features for strict enumeration
    const facadeFeatures = this.facadeAnalyzer.analyzeFacadeFeatures(buildingCore);

    // Generate strict facade specification for each visible side
    const facadeSpecification = this.facadeAnalyzer.generateMultiFacadeSpecification(
      visibleSides,
      facadeFeatures
    );

    const prompt = `A detailed **exterior perspective render** of the building, **exactly following the provided floor plan and elevations**.

**CRITICAL 2D-3D CONSISTENCY**: The building SHAPE and MASSING must EXACTLY match the 2D floor plan. The footprint shape visible from above must be identical to the floor plan outline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURE & GEOMETRY (MUST MATCH PLAN EXACTLY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Building Type**: ${geometry.floor_count}-story ${buildingCore.building_program || 'house'}
- **Footprint**: EXACTLY ${geometry.length}m × ${geometry.width}m (as shown in floor plan)
- **Total Height**: EXACTLY ${geometry.height}m (${geometry.floor_height}m per floor)
- **Shape**: ${geometry.shape || 'rectangular'} (must match floor plan outline)
- **Roof**: ${roof.type} (${roof.material}, ${materials.roof_color_hex})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT FACADE ENUMERATION (VISIBLE FROM ${viewOrientation.toUpperCase()}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${facadeSpecification}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MATERIALS & FINISHES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Walls**: ${materials.walls} (${materials.walls_color_hex})
- **Roof**: ${roof.material} ${roof.type} (${materials.roof_color_hex})
- **Windows**: ${materials.windows} (${materials.windows_color_hex})
- **Doors**: ${materials.doors || materials.windows} (${materials.doors_color_hex || materials.windows_color_hex})
- **Style**: ${style_features.architectural_style} ${style_features.facade_articulation || ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIEW & LIGHTING:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Camera Angle**: ${viewOrientation.toUpperCase()} corner perspective
- **Visible Facades**: ${visibleSides.join(' and ')} elevations
- **Lighting**: Realistic late-afternoon sunlight, natural shadows
- **Scene**: Simple landscaping (lawn, path), no distracting elements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Building SHAPE must match floor plan outline EXACTLY
✅ Window/door counts must match the EXACT numbers specified above
✅ Facade materials and colors must match EXACTLY (hex codes provided)
✅ Roof type ${roof.type} must match elevation drawings
✅ NO extra openings, NO missing features
✅ Dimensions ${geometry.length}m × ${geometry.width}m × ${geometry.height}m must be precise

🚫 FORBIDDEN:
   - Do NOT add extra windows beyond specified counts
   - Do NOT add dormers or features not in elevations
   - Do NOT modify building shape from floor plan
   - Do NOT change material colors from specified hex codes
   - Do NOT add complex massing not shown in plan`;

    return prompt;
  }

  /**
   * Generate enhanced interior perspective prompt with orientation specification
   */
  generateInteriorPrompt(buildingCore, roomType = 'living room', wallOrientation = 'north') {
    const { geometry, materials, openings, style_features } = buildingCore;

    // ENHANCEMENT: Analyze facade features to determine interior wall features
    const facadeFeatures = this.facadeAnalyzer.analyzeFacadeFeatures(buildingCore);

    // Get specific features for the wall the camera is facing
    const wallFeatures = this.facadeAnalyzer.getInteriorWallFeatures(
      wallOrientation,
      facadeFeatures,
      { windowCount: 2, hasEntryDoor: false } // Default room configuration
    );

    const prompt = `An **interior perspective render** of the **${roomType}** as designed in the floor plan, maintaining exact layout and window positions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROOM & LAYOUT (EXACT FROM FLOOR PLAN):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Room Type**: ${roomType}
- **Ceiling Height**: ${geometry.floor_height}m (as specified in plan)
- **Floor**: Ground floor of ${geometry.floor_count}-story building
- **Style**: ${style_features.architectural_style}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA ORIENTATION & VISIBLE WALL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📷 **Camera Position**: Inside ${roomType}, facing **${wallOrientation.toUpperCase()} wall**

🪟 **${wallOrientation.toUpperCase()} Wall Features** (visible in this view):
   - EXACTLY ${wallFeatures.windows} ${openings.window_type} window${wallFeatures.windows !== 1 ? 's' : ''}
   - Window style: ${materials.windows} (${materials.windows_color_hex})
   - Window shape and spacing: EXACTLY matches ${wallOrientation} elevation
   - ${wallFeatures.hasDoor ? `Entry door (${openings.door_position})` : 'No door on this wall'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERIOR FINISHES & MATERIALS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Walls**: Interior finish matching ${materials.walls} exterior style
- **Windows**: Interior view of ${materials.windows} matching exterior exactly
- **Floor**: ${materials.floor_material || 'timber/tile appropriate to style'}
- **Ceiling**: ${geometry.floor_height}m height, ${materials.ceiling_material || 'painted plaster'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIGHTING & ATMOSPHERE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Natural Light**: Sunlight entering from ${wallOrientation.toUpperCase()} direction through ${wallFeatures.windows} window${wallFeatures.windows !== 1 ? 's' : ''}
- **Time**: Late afternoon, warm natural lighting
- **Style**: Clean, professional architectural interior photography
- **Furniture**: Minimal, tasteful furniture suggesting room function

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Camera MUST face ${wallOrientation.toUpperCase()} wall
✅ ${wallOrientation.toUpperCase()} wall MUST have EXACTLY ${wallFeatures.windows} window${wallFeatures.windows !== 1 ? 's' : ''}
✅ Window positions MUST match ${wallOrientation} elevation drawing
✅ Wall positions MUST align with floor plan
✅ Ceiling height EXACTLY ${geometry.floor_height}m

🚫 FORBIDDEN:
   - Do NOT add extra windows (max ${wallFeatures.windows} on ${wallOrientation} wall)
   - Do NOT change wall positions from floor plan
   - Do NOT improvise window shapes or sizes
   - Do NOT face different direction (MUST face ${wallOrientation})`;

    return prompt;
  }

  /**
   * Generate enhanced axonometric view prompt
   * CRITICAL: This must be orthographic isometric - NO perspective distortion
   */
  generateAxonometricPrompt(buildingCore, viewAngle = '45°') {
    const { geometry, materials, openings, roof, style_features } = buildingCore;

    const prompt = `A **true orthographic axonometric (isometric) 3D view** of the building from a bird's eye angle - technical architectural drawing style.

**CRITICAL ISOMETRIC REQUIREMENTS**:
- TRUE AXONOMETRIC/ISOMETRIC projection (NO perspective distortion whatsoever)
- All PARALLEL LINES remain parallel (do NOT converge)
- NO vanishing points, NO foreshortening
- Consistent scale throughout (no depth diminishment)
- ${viewAngle} angle from above (bird's eye view)
- Technical architectural visualization, NOT a photograph

**CRITICAL DIFFERENCE FROM PERSPECTIVE**: This is NOT a photorealistic perspective view. This is a technical isometric drawing where parallel lines stay parallel and there is no perspective depth.

- **Viewing Angle**: ${viewAngle} isometric angle from ABOVE (bird's eye view), showing building from top-corner. Camera positioned high above the building looking down at an angle.

- **Geometry Matching Floor Plan**: The building's footprint ${geometry.length}m × ${geometry.width}m mirrors the floor plan EXACTLY, extruded upward to ${geometry.floor_count} stories at ${geometry.height}m total height. Building shape and massing must match the 2D floor plan precisely.

- **Facades Matching Elevations**: Multiple facades visible in this isometric view strictly adhere to the reference elevations. Every window (${openings.window_count_total} total), door (${openings.door_position}), and architectural detail from the elevation drawings is present in the correct place.

- **Materials & Colors**: ${materials.walls} (${materials.walls_color_hex}) on all exterior walls, ${roof.type} roof with ${roof.material} (${materials.roof_color_hex}), ${materials.windows} (${materials.windows_color_hex}) on all windows.

- **Roof Details**: The roof form (${roof.type}, ${roof.pitch}) matches the elevation drawings precisely. No elements omitted or added beyond the plans.

- **Rendering Style**: Clean technical architectural rendering with uniform materials on each facade, showing the ${style_features.architectural_style} design clearly. Similar to AutoCAD 3D isometric view or Revit axonometric export.

**CRITICAL DISTINCTIONS**:
1. This is AXONOMETRIC/ISOMETRIC (orthographic), NOT perspective
2. Camera is HIGH ABOVE (bird's eye), NOT at ground level
3. NO perspective distortion - parallel lines stay parallel
4. Technical drawing style, NOT photorealistic
5. COMPLETELY DIFFERENT from street-level perspective view

**FORBIDDEN**: Do NOT add perspective distortion. Do NOT use vanishing points. Do NOT make it look like a photograph from the street. Do NOT use ground-level camera.`;

    return prompt;
  }

  /**
   * Generate enhanced perspective view prompt
   * CRITICAL: COMPLETELY DIFFERENT from axonometric - LOW ANGLE street photography
   */
  generatePerspectivePrompt(buildingCore, viewOrientation = 'SE') {
    const { geometry, materials, openings, roof, style_features } = buildingCore;
    const visibleSides = this.getVisibleElevations(viewOrientation);

    // ENHANCEMENT: Analyze facade features for strict enumeration
    const facadeFeatures = this.facadeAnalyzer.analyzeFacadeFeatures(buildingCore);

    // Generate strict facade specification for visible sides
    const facadeSpecification = this.facadeAnalyzer.generateMultiFacadeSpecification(
      visibleSides,
      facadeFeatures
    );

    const prompt = `A **professional architectural photograph** taken from STREET LEVEL at the corner of the property - realistic WORM'S EYE PERSPECTIVE VIEW.

🚫 **ABSOLUTELY NOT AXONOMETRIC/ISOMETRIC** 🚫
This is a REAL PHOTOGRAPH taken by a photographer STANDING ON THE STREET with a camera, NOT a technical drawing from above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA SETUP (REAL PHOTOGRAPHY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📷 **Camera Position**:
   - STANDING ON THE STREET at the ${viewOrientation.toLowerCase()} corner
   - Height: 1.5-1.7m (normal human eye level)
   - Distance: 8-12 meters from building
   - Angle: Looking UP at 10-20 degrees (to see roof)
   - **NOT from above, NOT bird's eye, NOT isometric angle**

📷 **Lens**:
   - 24-35mm focal length (wide angle for architectural photography)
   - Captures realistic perspective distortion
   - Vertical lines slightly converge upward (normal in photos)

📷 **Perspective Effects**:
   - ✅ TRUE LINEAR PERSPECTIVE: Vertical lines converge upward (building looks taller)
   - ✅ HORIZONTAL CONVERGENCE: Facades recede to vanishing points
   - ✅ FORESHORTENING: Closer corner appears larger, far corner smaller
   - ✅ DEPTH OF FIELD: Realistic focus with slight background blur
   - ✅ ATMOSPHERIC DEPTH: Building against sky background

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILDING GEOMETRY & STRUCTURE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏠 **Building Dimensions**:
   - ${geometry.floor_count}-story ${buildingCore.building_program || 'house'}
   - Footprint: ${geometry.length}m × ${geometry.width}m (matches floor plan)
   - Total Height: ${geometry.height}m (${geometry.floor_height}m per floor)
   - Roof: ${roof.type} (${roof.material}, ${materials.roof_color_hex})

📐 **View Composition**:
   - Camera at ${viewOrientation.toUpperCase()} corner (shows depth and dimensionality)
   - TWO facades visible: ${visibleSides.join(' and ')} elevations
   - Building photographed from CORNER angle at 45° horizontal
   - Building appears TALLER than wide (due to upward camera angle)
   - Ground, foundation, and base clearly visible
   - Roof edge and pitch visible from below

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT FACADE ENUMERATION (VISIBLE IN PHOTO):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${facadeSpecification}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE CONTEXT & PHOTOGRAPHY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌳 **Environment**:
   - Photographer standing on SIDEWALK or STREET
   - Simple LANDSCAPING (lawn, driveway, path to entrance)
   - Realistic GROUND PLANE (grass, pavement, street visible in foreground)
   - Natural SKY (blue sky with few clouds, NOT flat background)
   - Realistic LIGHTING: Golden hour, long shadows on ground
   - Possible STREET ELEMENTS: curb, mailbox, distant trees (subtle, not distracting)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL DISTINCTIONS FROM AXONOMETRIC:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ❌ NOT ISOMETRIC - This has TRUE PERSPECTIVE with vanishing points
2. ❌ NOT FROM ABOVE - Camera is AT GROUND LEVEL looking UP
3. ❌ NOT TECHNICAL DRAWING - This is a REAL PHOTOGRAPH
4. ❌ NOT PARALLEL LINES - Lines CONVERGE to vanishing points
5. ❌ NOT FLAT/ORTHOGRAPHIC - Has DEPTH, FORESHORTENING, 3D feeling
6. ❌ NOT 45° FROM ABOVE - Camera angle is 10-20° UPWARD from ground

✅ YES PERSPECTIVE - Vertical lines converge upward
✅ YES DEPTH - Atmospheric perspective, closer parts larger
✅ YES PHOTOGRAPHY - Looks like Canon/Nikon architectural photo
✅ YES REALISTIC - Exactly what you'd see standing on the street

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORBIDDEN (MUST NOT INCLUDE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚫 NO isometric/axonometric projection
🚫 NO bird's eye view or view from above
🚫 NO parallel lines (they MUST converge)
🚫 NO flat, orthographic, or technical drawing style
🚫 NO 45-degree angle from above
🚫 NO view looking down at roof
🚫 NO people, cars, or busy street elements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STYLE: Professional architectural photography, photorealistic, golden hour lighting, natural atmosphere, depth of field, realistic shadows, taken with high-end camera (Canon 5D/Nikon D850), magazine quality.

Think: "Real Estate Photography" or "Architectural Digest photo shoot" - a professional photographer standing on the street corner taking a photo of the building for a magazine or website.`;

    return prompt;
  }

  /**
   * Generate comprehensive negative prompt to prevent hallucinations
   */
  generateNegativePrompt(viewType = 'exterior') {
    // Base negatives for all views
    const base = [
      'text', 'watermark', 'signature', 'logo',
      'blurry', 'low quality', 'distorted', 'deformed',
      'bad anatomy', 'disfigured', 'duplicate elements',
      'cropped', 'out of frame', 'draft', 'grainy'
    ];

    // Architecture-specific negatives
    const architectural = [
      'extra windows', 'additional windows', 'missing windows',
      'extra doors', 'additional doors', 'unplanned doors',
      'random balconies', 'unwanted balconies',
      'undesired extensions', 'extra floors',
      'warped geometry', 'distorted geometry', 'crooked lines',
      'asymmetrical (when should be symmetrical)',
      'inconsistent materials', 'mismatched colors'
    ];

    // View-specific negatives
    const viewSpecific = {
      exterior: ['people', 'humans', 'cars', 'vehicles', 'animals', 'furniture'],
      interior: ['people', 'humans', 'animals'],
      axonometric: [
        'perspective distortion', 'vanishing points', 'converging lines',
        'foreshortening', 'depth of field', 'camera lens distortion',
        'people', 'vehicles', 'street level view', 'ground level'
      ],
      perspective: [
        // Strongly prevent axonometric/isometric (with weights)
        '(isometric):1.5', '(axonometric):1.5', '(orthographic):1.5',
        '(bird eye view):1.5', '(bird\'s eye):1.5', '(from above):1.5',
        '(top down):1.5', '(45 degree from above):1.5',
        '(parallel lines):1.5', '(no perspective):1.5',
        '(technical drawing):1.4', '(flat view):1.4',
        '(looking down at roof):1.5', '(roof from above):1.5',
        // Prevent CAD/technical style
        'CAD drawing', 'AutoCAD', 'Revit isometric', 'technical illustration',
        'architectural diagram', 'orthographic projection',
        // Prevent other unwanted elements
        'people', 'cars', 'busy street', 'traffic'
      ]
    };

    const combined = [
      ...base,
      ...architectural,
      ...(viewSpecific[viewType] || viewSpecific.exterior)
    ];

    // Emphasize critical negatives with weights
    const emphasized = combined.map(term => {
      if (term.includes('extra') || term.includes('additional') || term.includes('warped')) {
        return `(${term}):1.3`; // Strong penalty
      }
      return term;
    });

    return emphasized.join(', ');
  }

  /**
   * Generate multi-ControlNet configuration for a view
   *
   * @param {Object} params - Configuration parameters
   * @returns {Array} - Array of ControlNet configurations
   */
  generateControlNetConfig(params) {
    const {
      floorPlanImage,
      elevationImages = {},
      viewOrientation,
      viewType = 'exterior'
    } = params;

    const controlNetUnits = [];

    // 1. Floor Plan ControlNet (primary structure guide)
    // CRITICAL: Floor plan is REQUIRED for all views
    if (floorPlanImage) {
      controlNetUnits.push({
        name: 'floor_plan',
        image: floorPlanImage,
        preprocessor: 'scribble', // Best for clean line drawings
        model: 'control_scribble-sdxl-1.0',
        conditioning_scale: this.defaultConfig.floorPlanWeight, // 1.1 - high priority
        control_mode: 'balanced',
        resize_mode: 'fill' // Preserve aspect, don't distort
      });
      logger.info('   ✅ Floor plan ControlNet added (scale: 1.1)');
    } else {
      logger.warn('   ⚠️ WARNING: Floor plan image missing - consistency may be reduced!');
    }

    // 2. Elevation ControlNet(s) - REQUIRED for exterior/perspective/axonometric views
    // This is critical for facade consistency!
    if (viewType !== 'interior') {
      const visibleSides = this.getVisibleElevations(viewOrientation);
      let elevationCount = 0;

      logger.info(`   🔍 View type: ${viewType}, orientation: ${viewOrientation}`);
      logger.info(`   🏠 Visible facades: ${visibleSides.join(', ')}`);

      visibleSides.forEach(side => {
        const elevationImage = elevationImages[side];
        if (elevationImage) {
          controlNetUnits.push({
            name: `elevation_${side}`,
            image: elevationImage,
            preprocessor: 'scribble', // Clean architectural lines
            model: 'control_scribble-sdxl-1.0',
            conditioning_scale: this.defaultConfig.elevationWeight, // 0.9 - facade details
            control_mode: 'balanced',
            resize_mode: 'fill'
          });
          elevationCount++;
          logger.info(`   ✅ ${side} elevation ControlNet added (scale: 0.9)`);
        } else {
          logger.warn(`   ⚠️ WARNING: ${side} elevation image missing - facade details may be inconsistent!`);
        }
      });

      // CRITICAL VALIDATION: For exterior views, at least one elevation should be present
      if (elevationCount === 0) {
        logger.error(`   ❌ CRITICAL: No elevation images provided for ${viewType} view!`);
        logger.error('   This will cause facade inconsistencies (wrong window counts, incorrect details).');
        logger.error('   Please provide elevation images for visible facades.');
      } else if (elevationCount < visibleSides.length) {
        logger.warn(`   ⚠️ Only ${elevationCount}/${visibleSides.length} elevations provided - partial facade control.`);
      } else {
        logger.info(`   ✅ All ${elevationCount} required elevations present - full facade control!`);
      }
    }

    logger.info(`   📊 Total ControlNet units: ${controlNetUnits.length}`);

    return controlNetUnits;
  }

  /**
   * Generate complete view configuration with all enhancements
   * Ready for FastAPI/Replicate integration
   */
  generateEnhancedViewConfig(params) {
    const {
      viewType, // 'exterior', 'interior', 'axonometric', 'perspective'
      viewOrientation = 'NW', // For exterior/perspective views
      roomType = 'living room', // For interior views
      buildingCore,
      floorPlanImage,
      elevationImages = {}, // { north: 'url/base64', south: 'url', east: 'url', west: 'url' }
      seed,
      width = 1024,
      height = 768
    } = params;

    // Generate appropriate prompt based on view type
    let prompt;
    switch (viewType) {
      case 'exterior':
        prompt = this.generateExteriorPrompt(buildingCore, viewOrientation);
        break;
      case 'interior':
        prompt = this.generateInteriorPrompt(buildingCore, roomType);
        break;
      case 'axonometric':
        prompt = this.generateAxonometricPrompt(buildingCore, '45°');
        break;
      case 'perspective':
        prompt = this.generatePerspectivePrompt(buildingCore, viewOrientation);
        break;
      default:
        prompt = this.generateExteriorPrompt(buildingCore, viewOrientation);
    }

    // Generate negative prompt
    const negative_prompt = this.generateNegativePrompt(viewType);

    // Generate ControlNet configuration
    const controlnet = this.generateControlNetConfig({
      floorPlanImage,
      elevationImages,
      viewOrientation,
      viewType
    });

    // Return complete configuration in API-ready JSON format
    return {
      view: `${viewType}_${viewType === 'interior' ? roomType.replace(/\s+/g, '_') : viewOrientation}`,
      prompt,
      negative_prompt,
      model: 'stable-diffusion-SDXL-architecture-v1.0', // Adjust to your model
      width,
      height,
      cfg_scale: this.defaultConfig.cfgScale,
      steps: this.defaultConfig.steps,
      seed: seed || Math.floor(Math.random() * 1000000),
      controlnet,

      // Metadata for tracking
      metadata: {
        view_type: viewType,
        orientation: viewOrientation,
        visible_elevations: viewType !== 'interior' ? this.getVisibleElevations(viewOrientation) : [],
        controlnet_count: controlnet.length,
        enhanced_prompts: true,
        version: '2.0'
      }
    };
  }

  /**
   * Generate all 6 standard architectural views with enhanced configuration
   */
  generateAllEnhancedViews(params) {
    const {
      buildingCore,
      floorPlanImage,
      elevationImages,
      seed
    } = params;

    const views = {};

    // 1. Floor Plan (2D technical drawing - special case, no 3D render)
    views.floor_plan = {
      view: 'floor_plan_2d',
      prompt: `Professional architectural floor plan, 2D CAD technical drawing, black lines on white background, scale 1:100.
Building footprint: ${buildingCore.geometry.length}m × ${buildingCore.geometry.width}m
Floors: ${buildingCore.geometry.floor_count}
Rooms clearly labeled, dimension lines, door swings, window positions, north arrow.
**CRITICAL**: Pure 2D overhead view, NO 3D perspective, NO shading, clean CAD style.`,
      negative_prompt: '3D, perspective, shading, color, artistic, rendered, photorealistic, blur',
      width: 1024,
      height: 1024,
      controlnet: [{
        image: floorPlanImage,
        preprocessor: 'scribble',
        model: 'control_scribble-sdxl-1.0',
        conditioning_scale: 1.2 // Very high for technical accuracy
      }]
    };

    // 2. Exterior Front View (primary facade)
    const frontOrientation = buildingCore.openings?.door_position || 'North';
    views.exterior_front = this.generateEnhancedViewConfig({
      viewType: 'exterior',
      viewOrientation: frontOrientation,
      buildingCore,
      floorPlanImage,
      elevationImages,
      seed,
      width: 1536,
      height: 1152
    });

    // 3. Exterior Side View (perpendicular to front)
    const sideOrientation = this.getPerpendicularOrientation(frontOrientation);
    views.exterior_side = this.generateEnhancedViewConfig({
      viewType: 'exterior',
      viewOrientation: sideOrientation,
      buildingCore,
      floorPlanImage,
      elevationImages,
      seed,
      width: 1024,
      height: 768
    });

    // 4. Interior Main Space
    views.interior = this.generateEnhancedViewConfig({
      viewType: 'interior',
      roomType: 'living room',
      buildingCore,
      floorPlanImage,
      elevationImages,
      seed,
      width: 1536,
      height: 1024
    });

    // 5. Axonometric View
    views.axonometric = this.generateEnhancedViewConfig({
      viewType: 'axonometric',
      viewOrientation: 'NE', // North-East for good visibility
      buildingCore,
      floorPlanImage,
      elevationImages,
      seed,
      width: 1024,
      height: 768
    });

    // 6. Perspective View
    const perspectiveOrientation = frontOrientation + (sideOrientation.charAt(0) || 'E');
    views.perspective = this.generateEnhancedViewConfig({
      viewType: 'perspective',
      viewOrientation: perspectiveOrientation,
      buildingCore,
      floorPlanImage,
      elevationImages,
      seed,
      width: 1024,
      height: 768
    });

    return views;
  }

  /**
   * Get perpendicular orientation for side views
   */
  getPerpendicularOrientation(orientation) {
    const perpMap = {
      'North': 'East',
      'East': 'South',
      'South': 'West',
      'West': 'North'
    };
    return perpMap[orientation] || 'East';
  }
}

// Export singleton instance
export default new EnhancedViewConfigurationService();
