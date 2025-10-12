/**
 * Unified Prompt Service
 * Creates unified prompts that ensure 2D floor plans, elevations, and 3D views
 * all represent the SAME building by including complete master specification
 * in every Replicate generation call.
 */

import logger from '../utils/productionLogger';

class UnifiedPromptService {
  /**
   * Create master specification prompt for OpenAI
   * This prompt asks OpenAI to generate a COMPLETE design specification
   * that will be used as single source of truth for all Replicate generations
   *
   * @param {Object} projectContext - Complete project context with location, portfolio, etc.
   * @returns {String} Detailed prompt for OpenAI to generate master specification
   */
  createMasterSpecificationPrompt(projectContext) {
    const {
      location,
      buildingProgram,
      floorArea,
      climateData,
      locationAnalysis,
      portfolioStyle,
      blendedStyle,
      userPreferences
    } = projectContext;

    const area = floorArea || 200;
    const floorCount = this.calculateFloorCount(buildingProgram, area);

    return `
You are a master architect tasked with creating a COMPLETE, DETAILED architectural design specification.
This specification will be used to generate floor plans, elevations, and 3D visualizations that must all show the SAME building.

CRITICAL REQUIREMENT: Your response must be a complete, detailed specification with EXACT values, not vague descriptions.

PROJECT CONTEXT:
- Location: ${location?.address || 'Not specified'}
- Climate: ${climateData?.type || 'temperate'}
- Building Program: ${buildingProgram || 'residential house'}
- Total Floor Area: ${area}m²
- Calculated Floors: ${floorCount}

${locationAnalysis ? `
LOCAL ARCHITECTURAL CONTEXT:
- Primary Style: ${locationAnalysis.primary}
- Local Materials: ${locationAnalysis.materials?.slice(0, 5).join(', ')}
- Local Characteristics: ${locationAnalysis.characteristics?.slice(0, 5).join(', ')}
- Climate Adaptations: ${locationAnalysis.climateAdaptations?.features?.slice(0, 5).join(', ')}
` : ''}

${portfolioStyle ? `
PORTFOLIO STYLE PREFERENCES:
- Detected Style: ${portfolioStyle.primaryStyle?.style}
- Key Materials: ${portfolioStyle.designElements?.materials}
- Spatial Organization: ${portfolioStyle.designElements?.spatialOrganization}
` : ''}

${blendedStyle ? `
BLENDED STYLE TARGET:
- Style Name: ${blendedStyle.styleName}
- Materials: ${blendedStyle.materials?.slice(0, 5).join(', ')}
- Blend Ratio: ${Math.round((blendedStyle.blendRatio?.local || 0.5) * 100)}% local / ${Math.round((blendedStyle.blendRatio?.portfolio || 0.5) * 100)}% portfolio
` : ''}

${userPreferences ? `
USER PREFERENCES: ${userPreferences}
` : ''}

Generate a COMPLETE Master Design Specification in the following JSON format.
Every field must have SPECIFIC, EXACT values (not "local materials" but "limestone", not "suitable" but "2.4m").

RESPOND ONLY WITH VALID JSON:

{
  "projectName": "Descriptive project name including location",
  "styleName": "Specific style name (e.g., 'Contemporary Egyptian Vernacular Fusion')",
  "philosophy": "2-3 sentence design philosophy explaining the approach and how it responds to context",

  "dimensions": {
    "totalArea": ${area},
    "floors": ${floorCount},
    "floorHeight": 3.0,
    "length": 0.0,
    "width": 0.0,
    "height": 0.0,
    "calculated": "Explain calculation: calculate length and width from area assuming aspect ratio 1.5:1, height = floors × floorHeight"
  },

  "materials": {
    "primary": "Specific primary material (e.g., 'local limestone', 'brick', 'glass')",
    "secondary": "Specific secondary material",
    "accent": "Specific accent material",
    "roof": "Specific roof material and type (e.g., 'flat concrete with white membrane')",
    "windows": "Specific window frame material (e.g., 'aluminum frame, bronze anodized')",
    "doors": "Specific door material (e.g., 'solid wood')",
    "rationale": "Why these materials were selected for this climate and context"
  },

  "entrance": {
    "orientation": "north|south|east|west - choose based on climate (hot climates prefer north/east)",
    "type": "Specific entrance type (e.g., 'double door', 'single door with sidelight')",
    "width": 2.4,
    "feature": "Specific entrance feature (e.g., 'covered entrance with columns', 'recessed entry')",
    "rationale": "Why this orientation and design"
  },

  "floors": [
    {
      "level": 0,
      "name": "Ground Floor",
      "area": 0,
      "primaryFunction": "Main functional purpose",
      "rooms": [
        {
          "name": "Entrance Lobby",
          "area": 0,
          "position": "north-center|north-east|north-west|center|south-center|etc",
          "purpose": "Specific purpose",
          "features": ["feature1", "feature2"],
          "connections": ["room1", "room2"]
        }
        // ADD MORE ROOMS - must cover entire floor area
      ],
      "circulation": ["Describe staircase location", "Describe hallway layout"],
      "uniqueCharacteristics": ["What makes this floor unique"]
    }
    // REPEAT for each floor level (0 to ${floorCount - 1})
    // CRITICAL: Ground floor (level 0) must have entrance, public spaces
    // CRITICAL: Upper floors must have NO ground entrance, only stairs/elevator access
    // CRITICAL: Top floor should have roof access, premium spaces
  ],

  "features": {
    "roof": "Specific roof design (e.g., 'flat roof with parapet', 'gable roof with clay tiles')",
    "windows": "Specific window design (e.g., 'large glass panels', 'ribbon windows', 'punched openings')",
    "facade": "Specific facade treatment (e.g., 'limestone cladding with vertical grooving')",
    "balconies": "Specific balcony locations if any (e.g., 'first floor bedrooms', 'master bedroom terrace')",
    "landscaping": "Appropriate landscaping for climate",
    "sustainability": ["Specific sustainable features"]
  },

  "climate": {
    "type": "${climateData?.type || 'temperate'}",
    "orientation": "How building is oriented for climate",
    "shading": "Specific shading strategies",
    "cooling": "Specific cooling strategies",
    "insulation": "Specific insulation approach",
    "daylighting": "Specific daylighting strategy"
  },

  "structuralSystem": {
    "type": "Specific structural system (e.g., 'reinforced concrete frame', 'load-bearing masonry')",
    "foundation": "Foundation type",
    "columns": "Column size and spacing",
    "floors": "Floor slab type and thickness",
    "roof": "Roof structure"
  },

  "colorPalette": {
    "exterior": {
      "primary": "Primary exterior color",
      "accent": "Accent color",
      "trim": "Trim color"
    },
    "interior": {
      "walls": "Interior wall color",
      "floors": "Floor finish",
      "accents": "Interior accents"
    }
  }
}

CRITICAL REQUIREMENTS:
1. ALL numeric fields must have EXACT calculated values, not 0 or null
2. Calculate length and width from area (assume rectangular footprint, aspect ratio 1.5:1)
3. Calculate height as floors × floorHeight
4. Each floor must have complete room program with areas that sum to floor total area
5. Ground floor (level 0) MUST include entrance and public/main spaces
6. Upper floors (level > 0) MUST NOT have ground entrance, only stair/elevator access
7. Each floor must have DIFFERENT room programs (don't repeat same layout)
8. Use SPECIFIC material names (not "suitable materials" but "limestone", "glass", "wood")
9. All positions must use compass directions: north-west, north-center, north-east, center, south-west, south-center, south-east

RESPOND ONLY WITH THE JSON OBJECT, NO ADDITIONAL TEXT.
`.trim();
  }

  /**
   * Calculate floor count based on building program and area
   * Must match OpenAI service calculation for consistency
   */
  calculateFloorCount(buildingProgram, floorArea) {
    const area = floorArea || 200;
    const buildingType = (buildingProgram || 'house').toLowerCase();

    // Single-floor building types
    if (buildingType.includes('cottage') ||
        buildingType.includes('bungalow') ||
        buildingType.includes('pavilion')) {
      return 1;
    }

    // Area-based calculation
    if (area < 150) return 1;
    if (area < 300) return 2;
    if (area < 500) return 3;
    if (area < 800) return 4;

    // Maximum 5 floors
    return Math.min(Math.ceil(area / 200), 5);
  }

  /**
   * Create unified Replicate prompt that includes complete master specification
   * This ensures ALL generated views show the SAME building
   *
   * @param {Object} masterSpec - Complete master design specification from OpenAI
   * @param {String} viewType - Type of view to generate: 'floor_plan', 'elevation', '3d_exterior', '3d_interior'
   * @param {Object} options - Additional options (floorIndex, direction, etc.)
   * @returns {String} Complete prompt for Replicate that includes master spec
   */
  createUnifiedReplicatePrompt(masterSpec, viewType, options = {}) {
    logger.verbose(`Creating unified prompt for ${viewType}`);

    // BASE SPECIFICATION - Same for ALL views
    const baseSpec = this.formatBaseSpecification(masterSpec);

    // VIEW-SPECIFIC ADDITIONS
    let viewSpec = '';
    let negativePrompt = '';
    let dimensions = { width: 1024, height: 1024 };

    switch (viewType) {
      case 'floor_plan':
        viewSpec = this.createFloorPlanSpec(masterSpec, options.floorIndex || 0);
        negativePrompt = this.getFloorPlanNegativePrompt();
        dimensions = { width: 1536, height: 1536 };
        break;

      case 'elevation':
        viewSpec = this.createElevationSpec(masterSpec, options.direction || 'north');
        negativePrompt = this.getElevationNegativePrompt();
        dimensions = { width: 1536, height: 1152 };
        break;

      case '3d_exterior':
        viewSpec = this.create3DExteriorSpec(masterSpec, options.viewType || 'front');
        negativePrompt = this.get3DExteriorNegativePrompt();
        dimensions = { width: 1024, height: 768 };
        break;

      case '3d_interior':
        viewSpec = this.create3DInteriorSpec(masterSpec, options.roomName || null);
        negativePrompt = this.get3DInteriorNegativePrompt();
        dimensions = { width: 1024, height: 768 };
        break;

      default:
        throw new Error(`Unknown view type: ${viewType}`);
    }

    // UNIFIED PROMPT
    const unifiedPrompt = `${baseSpec}\n\n${viewSpec}\n\nCRITICAL: ALL VIEWS MUST REPRESENT THE SAME BUILDING WITH IDENTICAL SPECIFICATIONS LISTED ABOVE.`;

    return {
      prompt: unifiedPrompt,
      negativePrompt,
      dimensions
    };
  }

  /**
   * Format base specification section (same for all views)
   */
  formatBaseSpecification(masterSpec) {
    const dims = masterSpec.dimensions || {};
    const mats = masterSpec.materials || {};
    const entrance = masterSpec.entrance || {};
    const features = masterSpec.features || {};

    return `
MASTER DESIGN SPECIFICATION - SINGLE SOURCE OF TRUTH
Project: ${masterSpec.projectName || 'Architectural Design'}
Style: ${masterSpec.styleName || 'Contemporary'}
Philosophy: ${masterSpec.philosophy || 'Context-responsive design'}

EXACT DIMENSIONS (MUST MATCH IN ALL VIEWS):
- Building Footprint: ${dims.length}m × ${dims.width}m
- Total Height: ${dims.height}m (${dims.floors} floors × ${dims.floorHeight}m each)
- Total Floor Area: ${dims.totalArea}m²
- Floor Count: ${dims.floors} floors

EXACT MATERIALS (MUST USE THESE IN ALL VIEWS):
- Primary Material: ${mats.primary}
- Secondary Material: ${mats.secondary}
- Accent Material: ${mats.accent}
- Roof: ${mats.roof}
- Windows: ${mats.windows}
- Doors: ${mats.doors}

ENTRANCE SPECIFICATION:
- Location: ${entrance.orientation} facade
- Type: ${entrance.type}
- Width: ${entrance.width}m
- Feature: ${entrance.feature}

ARCHITECTURAL FEATURES:
- Roof Design: ${features.roof}
- Window Design: ${features.windows}
- Facade Treatment: ${features.facade}
- Balconies: ${features.balconies || 'None'}
- Landscaping: ${features.landscaping}
    `.trim();
  }

  /**
   * Create floor plan specific specification
   */
  createFloorPlanSpec(masterSpec, floorIndex) {
    const floor = masterSpec.floors?.[floorIndex];
    if (!floor) {
      throw new Error(`Floor ${floorIndex} not found in master specification`);
    }

    const roomList = floor.rooms.map(r =>
      `- ${r.name}: ${r.area}m² at ${r.position}${r.features ? ` (${r.features.join(', ')})` : ''}`
    ).join('\n');

    const circulationDesc = floor.circulation?.join(', ') || 'Central staircase';
    const isGroundFloor = floorIndex === 0;

    return `
VIEW TYPE: 2D ARCHITECTURAL FLOOR PLAN - ${floor.name.toUpperCase()}

FLOOR SPECIFICATION:
- Level: ${floor.level} (${floor.name})
- Total Area: ${floor.area}m²
- Primary Function: ${floor.primaryFunction}

EXACT ROOM PROGRAM (MUST INCLUDE ALL ROOMS):
${roomList}

CIRCULATION:
- ${circulationDesc}
${isGroundFloor ? `- Main entrance on ${masterSpec.entrance.orientation} side` : '- No ground entrance (upper floor)'}

DRAWING REQUIREMENTS:
- STRICTLY 2D orthographic top-down view
- Black and white technical drawing style
- Wall thickness: 200mm (shown as double parallel lines)
- Door openings: show with arc indicating swing direction
- Window openings: shown as gaps in walls with parallel lines
- Room labels: include room name and area in m²
- Dimension lines: show key dimensions
- North arrow: pointing ${masterSpec.entrance.orientation}
- Scale notation: 1:100
- Furniture layout: indicate general furniture positions (not photorealistic)
${isGroundFloor ? `- Entrance: clearly mark ${masterSpec.entrance.type} on ${masterSpec.entrance.orientation} facade` : ''}

CRITICAL REQUIREMENTS:
- This floor plan must show floor ${floorIndex} of the building specified above
- Building dimensions: ${masterSpec.dimensions.length}m × ${masterSpec.dimensions.width}m
- ALL rooms listed above must be visible
- Layout must be logical and functional
- Walls must align with overall building envelope
- NO 3D perspective, NO rendering, ONLY flat 2D technical drawing
    `.trim();
  }

  /**
   * Create elevation specific specification
   */
  createElevationSpec(masterSpec, direction) {
    const dims = masterSpec.dimensions || {};
    const entrance = masterSpec.entrance || {};
    const mats = masterSpec.materials || {};
    const isEntranceFacade = direction === entrance.orientation;

    return `
VIEW TYPE: 2D ARCHITECTURAL ELEVATION - ${direction.toUpperCase()} FACADE${isEntranceFacade ? ' (ENTRANCE SIDE)' : ''}

ELEVATION SPECIFICATION:
- Direction: ${direction} facade
- Building Width: ${dims.length}m (along facade)
- Building Height: ${dims.height}m (${dims.floors} floors)
- Floor Heights: ${dims.floors} levels × ${dims.floorHeight}m = ${dims.height}m total

FACADE DETAILS:
- Primary Material: ${mats.primary}
- Window Treatment: ${masterSpec.features.windows}
- Roof Profile: ${masterSpec.features.roof}
${isEntranceFacade ? `- Main Entrance: ${entrance.type} (${entrance.width}m wide) with ${entrance.feature}` : ''}

DRAWING REQUIREMENTS:
- STRICTLY 2D orthographic front view (NO perspective)
- Black and white technical drawing style
- Show ALL ${dims.floors} floor levels clearly
- Ground line at ±0.00m
- Floor separation lines at ${dims.floorHeight}m, ${dims.floorHeight * 2}m${dims.floors > 2 ? `, ${dims.floorHeight * 3}m` : ''}, etc.
- Window and door openings clearly defined
- Material hatching patterns for ${mats.primary}
${isEntranceFacade ? `- ${entrance.type} prominently visible at ground level center` : ''}
- Roof line and profile clearly shown
- Dimension annotations: total height, floor heights, facade width
- Scale notation: 1:100
- Clean, precise CAD-style linework

CRITICAL REQUIREMENTS:
- This elevation must show the ${direction} side of the building specified above
- Must show EXACTLY ${dims.floors} floors
- Height must be EXACTLY ${dims.height}m
- Facade material must be ${mats.primary}
- NO 3D rendering, NO perspective, ONLY flat 2D elevation drawing
    `.trim();
  }

  /**
   * Create 3D exterior view specific specification
   */
  create3DExteriorSpec(masterSpec, viewType) {
    const dims = masterSpec.dimensions || {};
    const entrance = masterSpec.entrance || {};
    const mats = masterSpec.materials || {};
    const features = masterSpec.features || {};

    let cameraAngle = '';
    let visibleFacades = '';

    switch (viewType) {
      case 'front':
        cameraAngle = `street level view from ${entrance.orientation} side (entrance side)`;
        visibleFacades = `${entrance.orientation} facade with ${entrance.type} clearly visible`;
        break;
      case 'side':
        const sideDir = this.getPerpendicularDirection(entrance.orientation);
        cameraAngle = `street level view from ${sideDir} side`;
        visibleFacades = `${sideDir} facade`;
        break;
      case 'aerial':
        cameraAngle = '45-degree aerial perspective from above';
        visibleFacades = 'roof and multiple facades visible';
        break;
      default:
        cameraAngle = 'street level view';
        visibleFacades = 'main facade';
    }

    return `
VIEW TYPE: 3D PHOTOREALISTIC EXTERIOR VIEW

3D RENDERING SPECIFICATION:
- Camera Angle: ${cameraAngle}
- Visible Facades: ${visibleFacades}
- Building Visibility: COMPLETE building in frame, ${dims.floors}-story structure clearly visible

BUILDING APPEARANCE:
- Floors: ${dims.floors} stories (${dims.height}m total height)
- Facade Material: ${mats.primary} (primary), ${mats.secondary} (secondary)
- Windows: ${features.windows}
- Roof: ${features.roof}
- Entrance: ${entrance.type} on ${entrance.orientation} facade${viewType === 'front' ? ' (prominently visible)' : ''}
- Balconies: ${features.balconies || 'None'}

RENDERING REQUIREMENTS:
- Photorealistic architectural visualization
- Professional architectural photography style
- Daylight with clear blue sky
- ${features.landscaping}
- High quality, detailed rendering
- Realistic materials and textures
- Natural lighting and shadows
- Context: ${masterSpec.climate?.type || 'temperate'} climate setting

CRITICAL REQUIREMENTS:
- This 3D view must show the EXACT building specified in master specification
- Must show ${dims.floors}-story building (not ${dims.floors - 1} or ${dims.floors + 1})
- Facade must be ${mats.primary} material (not different material)
- Building dimensions must match ${dims.length}m × ${dims.width}m footprint
- This is the SAME building as shown in floor plans and elevations
    `.trim();
  }

  /**
   * Create 3D interior view specific specification
   */
  create3DInteriorSpec(masterSpec, roomName) {
    const mats = masterSpec.materials || {};
    const features = masterSpec.features || {};

    // Find room in floor plans
    let targetRoom = null;
    let floorLevel = 0;

    if (roomName) {
      for (const floor of masterSpec.floors || []) {
        const room = floor.rooms?.find(r => r.name.toLowerCase() === roomName.toLowerCase());
        if (room) {
          targetRoom = room;
          floorLevel = floor.level;
          break;
        }
      }
    }

    // Default to first major room on ground floor
    if (!targetRoom && masterSpec.floors?.[0]?.rooms) {
      targetRoom = masterSpec.floors[0].rooms.find(r =>
        r.name.toLowerCase().includes('living') ||
        r.name.toLowerCase().includes('main') ||
        r.name.toLowerCase().includes('lobby')
      ) || masterSpec.floors[0].rooms[0];
    }

    const roomDesc = targetRoom
      ? `${targetRoom.name} (${targetRoom.area}m², ${targetRoom.purpose})`
      : 'main interior space';

    const roomFeatures = targetRoom?.features?.join(', ') || 'spacious interior';

    return `
VIEW TYPE: 3D PHOTOREALISTIC INTERIOR VIEW

INTERIOR RENDERING SPECIFICATION:
- Room: ${roomDesc}
- Floor Level: ${floorLevel === 0 ? 'Ground Floor' : `Floor ${floorLevel + 1}`}
- Features: ${roomFeatures}

INTERIOR APPEARANCE:
- Architectural Style: ${masterSpec.styleName}
- Interior Materials: ${mats.primary} visible, ${mats.accent} accents
- Windows: ${features.windows} allowing natural light
- Ceiling Height: ${masterSpec.dimensions.floorHeight}m
- Color Palette: ${masterSpec.colorPalette?.interior?.walls || 'neutral tones'}

RENDERING REQUIREMENTS:
- Photorealistic interior visualization
- Professional interior architectural photography
- Natural daylight through windows
- Well-lit, inviting atmosphere
- Contemporary furniture and decor matching ${masterSpec.styleName}
- High quality, detailed interior rendering
- Realistic materials and textures
- Warm, comfortable interior environment

CRITICAL REQUIREMENTS:
- This interior view must be inside the building specified in master specification
- Interior design must match ${masterSpec.styleName}
- Must show quality and style consistent with exterior design
- Ceiling height ${masterSpec.dimensions.floorHeight}m
- NO exterior elements visible, ONLY interior space
    `.trim();
  }

  /**
   * Get perpendicular direction for side views
   */
  getPerpendicularDirection(direction) {
    const perpMap = {
      'north': 'east',
      'east': 'south',
      'south': 'west',
      'west': 'north'
    };
    return perpMap[direction] || 'east';
  }

  /**
   * Negative prompts for each view type
   */
  getFloorPlanNegativePrompt() {
    return "3D rendering, perspective view, isometric, axonometric, photorealistic, colors, shaded, rendered, artistic, elevation, section, site plan, landscape, trees, cars, people, sky, clouds, shadows, materials textures, lighting effects, 3D visualization, architectural photography, exterior view, building facade";
  }

  getElevationNegativePrompt() {
    return "3D rendering, perspective view, isometric, axonometric, photorealistic, colors rendered, artistic, decorative, furniture, landscaping, trees, sky, outdoor, aerial view, bird's eye view, 3D visualization, architectural photography, interior view, floor plan, section view";
  }

  get3DExteriorNegativePrompt() {
    return "2D drawing, floor plan, elevation, section, technical drawing, blueprint, black and white linework, CAD drawing, schematic, diagram, flat illustration, different building, inconsistent design, wrong number of floors, different materials";
  }

  get3DInteriorNegativePrompt() {
    return "exterior, outside, facade, building exterior, outdoor, landscape, trees, street, sky visible, exterior walls, building from outside, aerial view, elevation, front view, site plan, technical drawing, blueprint, 2D drawing, different building";
  }

  /**
   * Validate master specification completeness
   * Ensures all required fields are present before using for generation
   *
   * @param {Object} masterSpec - Master design specification to validate
   * @returns {Object} { valid: boolean, missing: string[] }
   */
  validateMasterSpecification(masterSpec) {
    const missing = [];
    const warnings = [];

    // Check top-level fields
    if (!masterSpec.projectName) missing.push('projectName');
    if (!masterSpec.styleName) missing.push('styleName');
    if (!masterSpec.philosophy) missing.push('philosophy');

    // Check dimensions
    if (!masterSpec.dimensions) {
      missing.push('dimensions');
    } else {
      const dims = masterSpec.dimensions;
      if (!dims.totalArea || dims.totalArea === 0) missing.push('dimensions.totalArea');
      if (!dims.floors || dims.floors === 0) missing.push('dimensions.floors');
      if (!dims.floorHeight || dims.floorHeight === 0) missing.push('dimensions.floorHeight');
      if (!dims.length || dims.length === 0) missing.push('dimensions.length');
      if (!dims.width || dims.width === 0) missing.push('dimensions.width');
      if (!dims.height || dims.height === 0) missing.push('dimensions.height');
    }

    // Check materials
    if (!masterSpec.materials) {
      missing.push('materials');
    } else {
      const mats = masterSpec.materials;
      if (!mats.primary) missing.push('materials.primary');
      if (!mats.secondary) missing.push('materials.secondary');
      if (!mats.roof) missing.push('materials.roof');
      if (!mats.windows) missing.push('materials.windows');
    }

    // Check entrance
    if (!masterSpec.entrance) {
      missing.push('entrance');
    } else {
      const ent = masterSpec.entrance;
      if (!ent.orientation) missing.push('entrance.orientation');
      if (!ent.type) missing.push('entrance.type');
    }

    // Check floors
    if (!masterSpec.floors || !Array.isArray(masterSpec.floors)) {
      missing.push('floors');
    } else {
      if (masterSpec.floors.length === 0) {
        missing.push('floors (empty array)');
      } else {
        // Check each floor
        masterSpec.floors.forEach((floor, index) => {
          if (!floor.name) warnings.push(`floors[${index}].name missing`);
          if (!floor.area || floor.area === 0) warnings.push(`floors[${index}].area missing or zero`);
          if (!floor.rooms || floor.rooms.length === 0) {
            warnings.push(`floors[${index}].rooms missing or empty`);
          }
        });
      }
    }

    // Check features
    if (!masterSpec.features) {
      warnings.push('features');
    } else {
      if (!masterSpec.features.roof) warnings.push('features.roof');
      if (!masterSpec.features.windows) warnings.push('features.windows');
      if (!masterSpec.features.facade) warnings.push('features.facade');
    }

    const valid = missing.length === 0;

    if (!valid) {
      logger.error('Master specification validation failed:', { missing, warnings });
    } else if (warnings.length > 0) {
      logger.warn('Master specification validation warnings:', warnings);
    } else {
      logger.verbose('Master specification validation passed');
    }

    return {
      valid,
      missing,
      warnings
    };
  }
}

const unifiedPromptService = new UnifiedPromptService();
export default unifiedPromptService;
