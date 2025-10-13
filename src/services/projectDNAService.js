/**
 * ProjectDNA Service
 * Creates and manages a single source of truth for all architectural generation
 * Ensures consistency across 2D plans, elevations, sections, 3D views, and technical drawings
 */

import logger from '../utils/productionLogger';

class ProjectDNAService {
  /**
   * Create comprehensive ProjectDNA that governs ALL outputs
   * This is the MASTER specification that ensures consistency
   * @param {Object} userInput - User specifications
   * @param {Object} locationAnalysis - Location intelligence data
   * @param {Object} portfolioStyle - Portfolio style detection
   * @param {Object} reasoning - OpenAI design reasoning
   * @returns {Object} Complete ProjectDNA specification
   */
  createProjectDNA(userInput, locationAnalysis, portfolioStyle, reasoning) {
    logger.info('🧬 Creating ProjectDNA - Master consistency framework...');

    // Generate unique project identifier
    const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract core parameters
    const totalArea = userInput.floorArea || userInput.area || 200;
    const buildingType = userInput.buildingProgram || 'residential house';

    // Calculate intelligent floor distribution
    const floorStrategy = this.calculateIntelligentFloorPlan(totalArea, buildingType);

    // Extract or determine entrance configuration
    const entranceConfig = this.determineEntranceConfiguration(
      userInput,
      locationAnalysis,
      reasoning
    );

    // Create blended style with materials
    const finalStyle = this.createFinalStyle(
      locationAnalysis,
      portfolioStyle,
      reasoning,
      userInput.materialWeight || 0.5,
      userInput.characteristicWeight || 0.5
    );

    // Calculate building dimensions
    const dimensions = this.calculateBuildingDimensions(
      totalArea,
      floorStrategy.numberOfFloors,
      buildingType
    );

    // Determine structural system
    const structuralSystem = this.determineStructuralSystem(
      buildingType,
      floorStrategy.numberOfFloors,
      dimensions
    );

    // Create unified seed strategy
    const seeds = this.createSeedStrategy(userInput.projectSeed);

    // Build complete ProjectDNA
    const projectDNA = {
      // Core Identity
      projectId,
      buildingType,
      totalArea,
      timestamp: new Date().toISOString(),

      // Floor Strategy
      floorCount: floorStrategy.numberOfFloors,
      floorPlans: floorStrategy.floorBreakdown,
      floorDistribution: floorStrategy.reasoning,

      // Location Context
      location: {
        address: locationAnalysis?.address || userInput.location?.address,
        coordinates: locationAnalysis?.coordinates || userInput.location?.coordinates,
        climate: locationAnalysis?.climate || { type: 'temperate' },
        localStyle: locationAnalysis?.primary || 'contemporary',
        materials: locationAnalysis?.materials || ['concrete', 'glass', 'steel']
      },

      // Portfolio Style (if provided)
      portfolioStyle: portfolioStyle ? {
        detected: portfolioStyle.primaryStyle?.style || null,
        materials: portfolioStyle.materials || [],
        characteristics: portfolioStyle.designElements || []
      } : null,

      // Final Blended Design
      finalStyle,

      // Dimensional Specifications
      dimensions,

      // Architectural Elements
      elements: {
        entrance: entranceConfig,
        windows: this.determineWindowConfiguration(finalStyle, buildingType),
        roof: this.determineRoofConfiguration(buildingType, finalStyle, reasoning),
        structure: structuralSystem
      },

      // Generation Seeds
      seeds,

      // OpenAI Reasoning Integration
      reasoning: reasoning ? {
        philosophy: reasoning.designPhilosophy,
        spatial: reasoning.spatialOrganization,
        materials: reasoning.materialRecommendations,
        environmental: reasoning.environmentalConsiderations
      } : null,

      // Consistency Flags
      consistencyRules: {
        strictGeometry: true,
        unifiedMaterials: true,
        synchronizedFloors: true,
        coherentStyle: true
      }
    };

    logger.info('✅ ProjectDNA created successfully:', {
      id: projectDNA.projectId,
      floors: projectDNA.floorCount,
      style: projectDNA.finalStyle.name,
      area: projectDNA.totalArea
    });

    return projectDNA;
  }

  /**
   * Calculate intelligent floor distribution based on area and type
   */
  calculateIntelligentFloorPlan(area, buildingType) {
    logger.verbose(`📐 Calculating floor distribution for ${area}m² ${buildingType}`);

    // Single-story buildings
    if (buildingType.includes('cottage') ||
        buildingType.includes('bungalow') ||
        buildingType.includes('warehouse')) {
      return {
        numberOfFloors: 1,
        floorBreakdown: [{
          level: 'Ground Floor',
          area: area,
          program: 'Complete single-level program',
          rooms: this.generateRoomProgram(buildingType, area, 0, 1)
        }],
        reasoning: `Single story design for ${buildingType} typology`
      };
    }

    // Residential buildings
    if (buildingType.includes('house') ||
        buildingType.includes('villa') ||
        buildingType.includes('residential')) {

      if (area <= 120) {
        return {
          numberOfFloors: 1,
          floorBreakdown: [{
            level: 'Ground Floor',
            area: area,
            program: 'Compact single-level living',
            rooms: this.generateRoomProgram(buildingType, area, 0, 1)
          }],
          reasoning: 'Single story for compact residential design'
        };
      }

      if (area <= 250) {
        return {
          numberOfFloors: 2,
          floorBreakdown: [
            {
              level: 'Ground Floor',
              area: area * 0.6,
              program: 'Living, dining, kitchen, guest facilities',
              rooms: this.generateRoomProgram(buildingType, area * 0.6, 0, 2)
            },
            {
              level: 'First Floor',
              area: area * 0.4,
              program: 'Bedrooms, bathrooms, family area',
              rooms: this.generateRoomProgram(buildingType, area * 0.4, 1, 2)
            }
          ],
          reasoning: 'Two-story design for optimal residential layout'
        };
      }

      if (area <= 400) {
        return {
          numberOfFloors: 3,
          floorBreakdown: [
            {
              level: 'Ground Floor',
              area: area * 0.4,
              program: 'Reception, living, dining, kitchen',
              rooms: this.generateRoomProgram(buildingType, area * 0.4, 0, 3)
            },
            {
              level: 'First Floor',
              area: area * 0.35,
              program: 'Master suite, bedrooms',
              rooms: this.generateRoomProgram(buildingType, area * 0.35, 1, 3)
            },
            {
              level: 'Second Floor',
              area: area * 0.25,
              program: 'Guest rooms, recreation, terrace',
              rooms: this.generateRoomProgram(buildingType, area * 0.25, 2, 3)
            }
          ],
          reasoning: 'Three-story design for luxury residential program'
        };
      }
    }

    // Office/Commercial buildings
    if (buildingType.includes('office') || buildingType.includes('commercial')) {
      const floorsNeeded = Math.min(Math.ceil(area / 400), 8);
      const floorArea = area / floorsNeeded;

      const breakdown = [];
      for (let i = 0; i < floorsNeeded; i++) {
        breakdown.push({
          level: i === 0 ? 'Ground Floor' : `Floor ${i + 1}`,
          area: floorArea,
          program: i === 0 ? 'Lobby, reception, retail, services' : 'Office spaces, meeting rooms',
          rooms: this.generateRoomProgram(buildingType, floorArea, i, floorsNeeded)
        });
      }

      return {
        numberOfFloors: floorsNeeded,
        floorBreakdown: breakdown,
        reasoning: `${floorsNeeded}-floor commercial building with ${floorArea}m² per floor`
      };
    }

    // Default fallback
    return {
      numberOfFloors: Math.min(Math.ceil(area / 200), 4),
      floorBreakdown: [{
        level: 'Ground Floor',
        area: area,
        program: 'Mixed-use program',
        rooms: []
      }],
      reasoning: 'Default floor distribution'
    };
  }

  /**
   * Generate specific room program for each floor
   */
  generateRoomProgram(buildingType, floorArea, floorIndex, totalFloors) {
    const rooms = [];

    if (buildingType.includes('house') || buildingType.includes('residential')) {
      if (floorIndex === 0) {
        // Ground floor
        rooms.push(
          { name: 'Living Room', area: Math.round(floorArea * 0.25), type: 'social' },
          { name: 'Kitchen', area: Math.round(floorArea * 0.15), type: 'service' },
          { name: 'Dining Room', area: Math.round(floorArea * 0.15), type: 'social' },
          { name: 'Guest WC', area: Math.round(floorArea * 0.05), type: 'service' },
          { name: 'Entrance Hall', area: Math.round(floorArea * 0.1), type: 'circulation' }
        );

        if (totalFloors === 1) {
          // Add bedrooms if single story
          rooms.push(
            { name: 'Master Bedroom', area: Math.round(floorArea * 0.15), type: 'private' },
            { name: 'Bedroom 2', area: Math.round(floorArea * 0.1), type: 'private' },
            { name: 'Bathroom', area: Math.round(floorArea * 0.05), type: 'service' }
          );
        }
      } else if (floorIndex === 1) {
        // First floor
        rooms.push(
          { name: 'Master Bedroom', area: Math.round(floorArea * 0.25), type: 'private' },
          { name: 'Master Bathroom', area: Math.round(floorArea * 0.1), type: 'service' },
          { name: 'Bedroom 2', area: Math.round(floorArea * 0.2), type: 'private' },
          { name: 'Bedroom 3', area: Math.round(floorArea * 0.15), type: 'private' },
          { name: 'Family Bathroom', area: Math.round(floorArea * 0.1), type: 'service' },
          { name: 'Hallway', area: Math.round(floorArea * 0.1), type: 'circulation' }
        );
      } else {
        // Upper floors
        rooms.push(
          { name: 'Guest Suite', area: Math.round(floorArea * 0.3), type: 'private' },
          { name: 'Recreation Room', area: Math.round(floorArea * 0.25), type: 'social' },
          { name: 'Study', area: Math.round(floorArea * 0.15), type: 'private' },
          { name: 'Terrace', area: Math.round(floorArea * 0.2), type: 'outdoor' }
        );
      }
    } else if (buildingType.includes('office')) {
      if (floorIndex === 0) {
        rooms.push(
          { name: 'Lobby', area: Math.round(floorArea * 0.15), type: 'public' },
          { name: 'Reception', area: Math.round(floorArea * 0.1), type: 'service' },
          { name: 'Meeting Room', area: Math.round(floorArea * 0.15), type: 'work' },
          { name: 'Open Office', area: Math.round(floorArea * 0.4), type: 'work' },
          { name: 'Services', area: Math.round(floorArea * 0.1), type: 'service' }
        );
      } else {
        rooms.push(
          { name: 'Open Office', area: Math.round(floorArea * 0.5), type: 'work' },
          { name: 'Meeting Rooms', area: Math.round(floorArea * 0.2), type: 'work' },
          { name: 'Break Room', area: Math.round(floorArea * 0.1), type: 'social' },
          { name: 'Private Offices', area: Math.round(floorArea * 0.15), type: 'work' }
        );
      }
    }

    return rooms;
  }

  /**
   * Determine entrance configuration
   */
  determineEntranceConfiguration(userInput, locationAnalysis, reasoning) {
    // Priority: User input > Reasoning > Location analysis > Default
    let facade = 'north';

    if (userInput.entranceDirection) {
      facade = this.normalizeDirection(userInput.entranceDirection);
    } else if (reasoning?.spatialOrganization) {
      const spatial = reasoning.spatialOrganization.toString().toLowerCase();
      if (spatial.includes('south')) facade = 'south';
      else if (spatial.includes('east')) facade = 'east';
      else if (spatial.includes('west')) facade = 'west';
    } else if (locationAnalysis?.climate?.type === 'hot') {
      facade = 'north'; // Avoid south in hot climates
    }

    return {
      facade,
      position: 'centered',
      width: 2.4,
      type: 'main_door',
      canopy: true
    };
  }

  /**
   * Create final blended style
   */
  createFinalStyle(locationAnalysis, portfolioStyle, reasoning, materialWeight, characteristicWeight) {
    // Extract materials from various sources
    const localMaterials = locationAnalysis?.materials || ['concrete', 'glass', 'steel'];
    const portfolioMaterials = portfolioStyle?.materials || [];
    const reasoningMaterials = this.extractMaterialsFromReasoning(reasoning);

    // Blend materials based on weights
    const materials = this.blendMaterials(
      localMaterials,
      portfolioMaterials,
      reasoningMaterials,
      materialWeight
    );

    // Determine style name
    const styleName = this.determineStyleName(
      locationAnalysis,
      portfolioStyle,
      characteristicWeight
    );

    // Extract characteristics
    const characteristics = this.blendCharacteristics(
      locationAnalysis,
      portfolioStyle,
      characteristicWeight
    );

    // Define color scheme
    const colors = this.defineColorScheme(materials, styleName);

    return {
      name: styleName,
      materials,
      characteristics,
      colors,
      description: `${styleName} architectural style with ${materials.join(', ')} construction`
    };
  }

  /**
   * Extract materials from reasoning
   */
  extractMaterialsFromReasoning(reasoning) {
    if (!reasoning?.materialRecommendations) return [];

    const text = JSON.stringify(reasoning.materialRecommendations).toLowerCase();
    const commonMaterials = ['brick', 'stone', 'concrete', 'glass', 'steel', 'wood', 'timber', 'metal'];

    return commonMaterials.filter(material => text.includes(material)).slice(0, 3);
  }

  /**
   * Blend materials from different sources
   */
  blendMaterials(local, portfolio, reasoning, weight) {
    // Ensure all inputs are arrays
    const localArray = Array.isArray(local) ? local : [];
    const portfolioArray = Array.isArray(portfolio) ? portfolio : [];
    const reasoningArray = Array.isArray(reasoning) ? reasoning : [];

    const allMaterials = [];

    // Add materials based on weight
    const portfolioCount = Math.round(3 * weight);
    const localCount = 3 - portfolioCount;

    if (portfolioArray.length > 0) {
      allMaterials.push(...portfolioArray.slice(0, portfolioCount));
    }
    if (localArray.length > 0) {
      allMaterials.push(...localArray.slice(0, localCount));
    }

    // Add reasoning materials if space
    if (allMaterials.length < 3 && reasoningArray.length > 0) {
      allMaterials.push(...reasoningArray.slice(0, 3 - allMaterials.length));
    }

    // Ensure we have at least 3 materials with defaults
    const defaults = ['concrete', 'glass', 'steel'];
    let defaultIndex = 0;
    while (allMaterials.length < 3 && defaultIndex < defaults.length) {
      if (!allMaterials.includes(defaults[defaultIndex])) {
        allMaterials.push(defaults[defaultIndex]);
      }
      defaultIndex++;
    }

    return [...new Set(allMaterials)].slice(0, 3);
  }

  /**
   * Determine style name based on blending
   */
  determineStyleName(locationAnalysis, portfolioStyle, weight) {
    const localStyle = locationAnalysis?.primary || 'contemporary';
    const portfolioStyleName = portfolioStyle?.primaryStyle?.style || null;

    if (!portfolioStyleName || weight < 0.2) {
      return localStyle;
    } else if (weight < 0.4) {
      return `${localStyle} with ${portfolioStyleName} influences`;
    } else if (weight < 0.6) {
      return `Hybrid ${portfolioStyleName}-${localStyle}`;
    } else if (weight < 0.8) {
      return `${portfolioStyleName} adapted to local context`;
    } else {
      return portfolioStyleName;
    }
  }

  /**
   * Blend characteristics
   */
  blendCharacteristics(locationAnalysis, portfolioStyle, weight) {
    const local = locationAnalysis?.characteristics || ['clean lines', 'functional', 'sustainable'];
    const portfolio = portfolioStyle?.designElements || [];

    // Ensure both are arrays
    const localArray = Array.isArray(local) ? local : [local];
    const portfolioArray = Array.isArray(portfolio) ? portfolio : [];

    const count = 5;
    const portfolioCount = Math.round(count * weight);
    const localCount = count - portfolioCount;

    const blended = [];
    if (portfolioArray.length > 0) {
      blended.push(...portfolioArray.slice(0, portfolioCount));
    }
    if (localArray.length > 0) {
      blended.push(...localArray.slice(0, localCount));
    }

    // Ensure we have at least some characteristics
    if (blended.length === 0) {
      blended.push('clean lines', 'functional', 'sustainable');
    }

    return [...new Set(blended)].slice(0, 5);
  }

  /**
   * Calculate building dimensions
   */
  calculateBuildingDimensions(totalArea, floorCount, buildingType) {
    const footprintArea = totalArea / floorCount;
    const aspectRatio = buildingType.includes('office') ? 1.5 : 1.2;

    const width = Math.sqrt(footprintArea / aspectRatio);
    const length = footprintArea / width;
    const floorHeight = buildingType.includes('commercial') ? 3.5 : 3.0;
    const totalHeight = floorCount * floorHeight;

    return {
      buildingFootprint: {
        length: Math.round(length * 10) / 10,
        width: Math.round(width * 10) / 10
      },
      totalHeight: Math.round(totalHeight * 10) / 10,
      floorHeight,
      floors: floorCount,
      footprintArea: Math.round(footprintArea)
    };
  }

  /**
   * Determine structural system
   */
  determineStructuralSystem(buildingType, floorCount, dimensions) {
    let system, gridSpacing, material;

    if (floorCount <= 2 && buildingType.includes('house')) {
      system = 'load_bearing_masonry';
      gridSpacing = { x: 4, y: 4 };
      material = 'reinforced masonry';
    } else if (floorCount <= 5) {
      system = 'concrete_frame';
      gridSpacing = { x: 6, y: 6 };
      material = 'reinforced concrete';
    } else {
      system = 'steel_frame';
      gridSpacing = { x: 8, y: 8 };
      material = 'structural steel';
    }

    return {
      system,
      type: 'frame',
      gridSpacing,
      material,
      foundation: floorCount > 3 ? 'pile' : 'spread_footing'
    };
  }

  /**
   * Determine window configuration
   */
  determineWindowConfiguration(finalStyle, buildingType) {
    const isModern = finalStyle.name.toLowerCase().includes('modern') ||
                     finalStyle.name.toLowerCase().includes('contemporary');

    return {
      pattern: isModern ? 'ribbon' : 'punched',
      size: buildingType.includes('office') ? 'large' : 'standard',
      frameColor: isModern ? 'black' : 'white',
      glazing: 'double',
      operability: 'fixed_and_operable'
    };
  }

  /**
   * Determine roof configuration
   */
  determineRoofConfiguration(buildingType, finalStyle, reasoning) {
    const reasoningText = JSON.stringify(reasoning).toLowerCase();

    let type = 'flat';
    let material = 'membrane';

    if (buildingType.includes('house') && !finalStyle.name.includes('modern')) {
      type = reasoningText.includes('hip') ? 'hip' : 'gable';
      material = reasoningText.includes('tile') ? 'tile' : 'slate';
    } else if (buildingType.includes('commercial') || buildingType.includes('office')) {
      type = 'flat';
      material = 'membrane';
    }

    return {
      type,
      material,
      color: material === 'membrane' ? '#2C3E50' : '#8B4513',
      slope: type === 'flat' ? 2 : 30
    };
  }

  /**
   * Define color scheme
   */
  defineColorScheme(materials, styleName) {
    const materialColors = {
      brick: '#B87333',
      stone: '#8B7D6B',
      concrete: '#A9A9A9',
      glass: '#87CEEB',
      steel: '#71797E',
      wood: '#8B4513',
      timber: '#A0522D'
    };

    const facadeColor = materialColors[materials[0]] || '#A9A9A9';
    const accentColor = materialColors[materials[1]] || '#71797E';

    return {
      facade: facadeColor,
      accent: accentColor,
      roof: styleName.includes('modern') ? '#2C3E50' : '#8B4513',
      trim: '#1C1C1C',
      window: styleName.includes('modern') ? '#2C3E50' : '#FFFFFF'
    };
  }

  /**
   * Create seed strategy for consistent generation
   */
  createSeedStrategy(baseSeed) {
    const masterSeed = baseSeed || Math.floor(Math.random() * 1000000);

    return {
      master: masterSeed,
      floorPlan: masterSeed,
      elevation: masterSeed,
      section: masterSeed,
      view3D: masterSeed,
      technical: masterSeed,
      structural: masterSeed,
      mep: masterSeed,
      // View-specific offsets for variation while maintaining consistency
      offsets: {
        ground: 0,
        floor1: 10,
        floor2: 20,
        floor3: 30,
        exterior_front: 100,
        exterior_side: 200,
        interior: 300,
        axonometric: 400,
        perspective: 500
      }
    };
  }

  /**
   * Normalize direction input
   */
  normalizeDirection(direction) {
    const normalized = direction.toString().toLowerCase();
    if (normalized.includes('north')) return 'north';
    if (normalized.includes('south')) return 'south';
    if (normalized.includes('east')) return 'east';
    if (normalized.includes('west')) return 'west';
    return 'north';
  }

  /**
   * Validate ProjectDNA completeness
   */
  validateProjectDNA(projectDNA) {
    const required = [
      'projectId',
      'buildingType',
      'totalArea',
      'floorCount',
      'floorPlans',
      'location',
      'finalStyle',
      'dimensions',
      'elements',
      'seeds'
    ];

    const missing = required.filter(field => !projectDNA[field]);

    if (missing.length > 0) {
      logger.warn('⚠️ ProjectDNA missing required fields:', missing);
      return {
        valid: false,
        missing
      };
    }

    return {
      valid: true,
      complete: true
    };
  }

  /**
   * Get formatted specification for prompts
   */
  getFormattedSpecification(projectDNA) {
    return `
PROJECT DNA SPECIFICATION (ALL VIEWS MUST MATCH):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Building: ${projectDNA.floorCount}-story ${projectDNA.buildingType}
Area: ${projectDNA.totalArea}m² total
Dimensions: ${projectDNA.dimensions.buildingFootprint.length}m × ${projectDNA.dimensions.buildingFootprint.width}m × ${projectDNA.dimensions.totalHeight}m
Style: ${projectDNA.finalStyle.name}
Materials: ${projectDNA.finalStyle.materials.join(', ')}
Entrance: ${projectDNA.elements.entrance.facade} facade
Roof: ${projectDNA.elements.roof.type} with ${projectDNA.elements.roof.material}
Windows: ${projectDNA.elements.windows.pattern} pattern, ${projectDNA.elements.windows.frameColor} frames
Structure: ${projectDNA.elements.structure.system}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THIS EXACT BUILDING MUST APPEAR IN ALL OUTPUTS
    `.trim();
  }
}

const projectDNAService = new ProjectDNAService();
export default projectDNAService;