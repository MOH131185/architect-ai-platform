/**
 * Material Detection Service
 * AI-powered material extraction from portfolio images and surrounding area
 * Includes material properties, climate compatibility, and local availability
 */

class MaterialDetectionService {
  constructor() {
    this.materialDatabase = this.initializeMaterialDatabase();
    this.climateCompatibilityMatrix = this.initializeClimateMatrix();
  }

  /**
   * Initialize comprehensive material properties database
   */
  initializeMaterialDatabase() {
    return {
      // Brick materials
      'red_brick': {
        name: 'Red Brick',
        category: 'masonry',
        hexColors: ['#B8604E', '#A0522D', '#8B4513'],
        properties: {
          thermalUValue: 2.0, // W/m²K
          density: 1920, // kg/m³
          durability: 100, // years
          costPerM2: 65, // GBP/m²
          fireRating: 'A1',
          acousticRating: 45, // dB
          embodiedCarbon: 240, // kgCO2e/m³
          recyclability: 0.85, // 85%
          maintenanceInterval: 30 // years
        },
        patterns: ['stretcher_bond', 'english_bond', 'flemish_bond', 'stack_bond'],
        textures: ['smooth', 'textured', 'rustic', 'handmade'],
        weatherResistance: {
          rain: 0.95,
          frost: 0.90,
          heat: 0.95,
          uv: 0.98,
          salt: 0.70
        },
        applications: ['facades', 'load_bearing_walls', 'partition_walls'],
        sustainability: {
          locallySourced: true,
          renewableContent: 0,
          recycledContent: 0.15
        }
      },
      'london_stock_brick': {
        name: 'London Stock Brick',
        category: 'masonry',
        hexColors: ['#8B7355', '#A0826D', '#8B7D6B'],
        properties: {
          thermalUValue: 2.1,
          density: 1850,
          durability: 150,
          costPerM2: 85,
          fireRating: 'A1',
          acousticRating: 47,
          embodiedCarbon: 220,
          recyclability: 0.90,
          maintenanceInterval: 40
        },
        patterns: ['flemish_bond', 'english_bond'],
        textures: ['weathered', 'multi_stock'],
        weatherResistance: {
          rain: 0.92,
          frost: 0.88,
          heat: 0.93,
          uv: 0.96,
          salt: 0.65
        },
        applications: ['facades', 'heritage_restoration'],
        sustainability: {
          locallySourced: true,
          renewableContent: 0,
          recycledContent: 0.20
        }
      },
      // Stone materials
      'portland_stone': {
        name: 'Portland Stone',
        category: 'natural_stone',
        hexColors: ['#E8E0D5', '#F0E8DC', '#E0D5C7'],
        properties: {
          thermalUValue: 1.5,
          density: 2400,
          durability: 200,
          costPerM2: 250,
          fireRating: 'A1',
          acousticRating: 50,
          embodiedCarbon: 150,
          recyclability: 1.0,
          maintenanceInterval: 50
        },
        patterns: ['ashlar', 'random_ashlar'],
        textures: ['honed', 'bush_hammered', 'polished'],
        weatherResistance: {
          rain: 0.98,
          frost: 0.95,
          heat: 0.98,
          uv: 0.99,
          salt: 0.85
        },
        applications: ['facades', 'cladding', 'feature_walls'],
        sustainability: {
          locallySourced: true,
          renewableContent: 0,
          recycledContent: 0
        }
      },
      'yorkshire_sandstone': {
        name: 'Yorkshire Sandstone',
        category: 'natural_stone',
        hexColors: ['#D2B48C', '#C19A6B', '#BDB76B'],
        properties: {
          thermalUValue: 1.7,
          density: 2200,
          durability: 150,
          costPerM2: 180,
          fireRating: 'A1',
          acousticRating: 48,
          embodiedCarbon: 140,
          recyclability: 1.0,
          maintenanceInterval: 40
        },
        patterns: ['coursed_rubble', 'random_rubble'],
        textures: ['split_face', 'sawn', 'pitched_face'],
        weatherResistance: {
          rain: 0.90,
          frost: 0.85,
          heat: 0.95,
          uv: 0.97,
          salt: 0.60
        },
        applications: ['facades', 'boundary_walls'],
        sustainability: {
          locallySourced: true,
          renewableContent: 0,
          recycledContent: 0
        }
      },
      // Modern materials
      'aluminum_composite': {
        name: 'Aluminum Composite Panel',
        category: 'metal',
        hexColors: ['#C0C0C0', '#D3D3D3', '#A9A9A9'],
        properties: {
          thermalUValue: 5.5,
          density: 1500,
          durability: 40,
          costPerM2: 120,
          fireRating: 'B-s1,d0',
          acousticRating: 25,
          embodiedCarbon: 190,
          recyclability: 0.95,
          maintenanceInterval: 15
        },
        patterns: ['flat_panel', 'cassette', 'corrugated'],
        textures: ['brushed', 'anodized', 'powder_coated'],
        weatherResistance: {
          rain: 1.0,
          frost: 1.0,
          heat: 0.85,
          uv: 0.90,
          salt: 0.95
        },
        applications: ['rainscreen', 'cladding', 'signage'],
        sustainability: {
          locallySourced: false,
          renewableContent: 0,
          recycledContent: 0.30
        }
      },
      'timber_cladding': {
        name: 'Timber Cladding',
        category: 'timber',
        hexColors: ['#8B4513', '#A0522D', '#DEB887'],
        properties: {
          thermalUValue: 0.14,
          density: 500,
          durability: 30,
          costPerM2: 95,
          fireRating: 'D-s2,d0',
          acousticRating: 35,
          embodiedCarbon: -800, // carbon negative
          recyclability: 1.0,
          maintenanceInterval: 10
        },
        patterns: ['horizontal_lap', 'vertical_board', 'shiplap', 'board_and_batten'],
        textures: ['smooth', 'rough_sawn', 'charred'],
        weatherResistance: {
          rain: 0.75,
          frost: 0.80,
          heat: 0.70,
          uv: 0.65,
          salt: 0.60
        },
        applications: ['cladding', 'feature_panels'],
        sustainability: {
          locallySourced: true,
          renewableContent: 1.0,
          recycledContent: 0
        }
      },
      // Roofing materials
      'welsh_slate': {
        name: 'Welsh Slate',
        category: 'roofing',
        hexColors: ['#404040', '#2F4F4F', '#36454F'],
        properties: {
          thermalUValue: 2.0,
          density: 2700,
          durability: 100,
          costPerM2: 150,
          fireRating: 'A1',
          acousticRating: 40,
          embodiedCarbon: 100,
          recyclability: 1.0,
          maintenanceInterval: 75
        },
        patterns: ['regular', 'random_width'],
        textures: ['riven', 'smooth'],
        weatherResistance: {
          rain: 1.0,
          frost: 0.98,
          heat: 0.95,
          uv: 1.0,
          salt: 0.90
        },
        applications: ['pitched_roofs'],
        sustainability: {
          locallySourced: true,
          renewableContent: 0,
          recycledContent: 0
        }
      },
      'clay_tiles': {
        name: 'Clay Tiles',
        category: 'roofing',
        hexColors: ['#8B4513', '#A0522D', '#CD853F'],
        properties: {
          thermalUValue: 2.5,
          density: 1900,
          durability: 75,
          costPerM2: 80,
          fireRating: 'A1',
          acousticRating: 38,
          embodiedCarbon: 180,
          recyclability: 0.80,
          maintenanceInterval: 50
        },
        patterns: ['plain', 'pantile', 'roman'],
        textures: ['smooth', 'sanded', 'glazed'],
        weatherResistance: {
          rain: 0.98,
          frost: 0.85,
          heat: 0.95,
          uv: 0.98,
          salt: 0.75
        },
        applications: ['pitched_roofs'],
        sustainability: {
          locallySourced: true,
          renewableContent: 0,
          recycledContent: 0.10
        }
      },
      // Glass
      'curtain_wall_glass': {
        name: 'Curtain Wall Glass',
        category: 'glass',
        hexColors: ['#87CEEB', '#4682B4', '#5F9EA0'],
        properties: {
          thermalUValue: 1.4, // triple glazed
          density: 2500,
          durability: 50,
          costPerM2: 350,
          fireRating: 'A2',
          acousticRating: 42,
          embodiedCarbon: 120,
          recyclability: 1.0,
          maintenanceInterval: 25
        },
        patterns: ['unitized', 'stick_system'],
        textures: ['clear', 'tinted', 'reflective', 'low_e'],
        weatherResistance: {
          rain: 1.0,
          frost: 1.0,
          heat: 0.75,
          uv: 0.90,
          salt: 0.95
        },
        applications: ['facades', 'atriums'],
        sustainability: {
          locallySourced: false,
          renewableContent: 0,
          recycledContent: 0.20
        }
      }
    };
  }

  /**
   * Initialize climate compatibility matrix
   */
  initializeClimateMatrix() {
    return {
      'temperate_maritime': {
        // UK climate
        preferredMaterials: ['brick', 'stone', 'slate', 'timber'],
        requiredProperties: {
          rainResistance: 0.85,
          frostResistance: 0.80,
          uvResistance: 0.70
        },
        avoidMaterials: ['adobe', 'untreated_steel']
      },
      'mediterranean': {
        preferredMaterials: ['stone', 'stucco', 'clay_tiles', 'concrete'],
        requiredProperties: {
          heatResistance: 0.85,
          uvResistance: 0.90,
          rainResistance: 0.60
        },
        avoidMaterials: ['untreated_timber', 'dark_metals']
      },
      'continental': {
        preferredMaterials: ['brick', 'concrete', 'composite_panels'],
        requiredProperties: {
          frostResistance: 0.90,
          heatResistance: 0.85,
          thermalMass: 'high'
        },
        avoidMaterials: ['thin_metals', 'single_glazing']
      },
      'tropical': {
        preferredMaterials: ['concrete', 'treated_timber', 'aluminum'],
        requiredProperties: {
          rainResistance: 0.95,
          humidityResistance: 0.90,
          ventilation: 'high'
        },
        avoidMaterials: ['untreated_steel', 'gypsum']
      },
      'arid': {
        preferredMaterials: ['adobe', 'concrete', 'stone', 'metal'],
        requiredProperties: {
          heatResistance: 0.95,
          uvResistance: 0.95,
          thermalMass: 'high'
        },
        avoidMaterials: ['timber', 'vinyl']
      }
    };
  }

  /**
   * Extract materials from portfolio images using AI vision
   */
  async extractMaterialsFromImage(imageData, context = {}) {
    try {
      // Use Qwen for material analysis (text-based reasoning about the image)
      const prompt = `Analyze this architectural portfolio image and extract:
      1. Primary facade material (name and approximate hex color)
      2. Secondary materials (name and hex colors)
      3. Material patterns or bonds visible
      4. Surface textures (smooth, rough, etc.)
      5. Estimated material percentages of facade
      6. Confidence score (0-100%) for each detection

      Context: ${context.projectType || 'unknown'} building in ${context.location || 'unknown location'}

      Return as structured JSON with materials array containing:
      {
        materials: [
          {
            name: "Material name",
            category: "brick/stone/metal/timber/glass/concrete",
            hexColor: "#RRGGBB",
            pattern: "bond pattern or layout",
            texture: "surface texture",
            percentage: 30,
            confidence: 85,
            application: "facade/roof/cladding"
          }
        ],
        dominant_style: "architectural style detected",
        quality_assessment: "construction quality level"
      }`;

      // Simulate AI response (would use actual AI service in production)
      const detectedMaterials = {
        materials: [
          {
            name: "Red Brick",
            category: "masonry",
            hexColor: "#B8604E",
            pattern: "flemish_bond",
            texture: "textured",
            percentage: 65,
            confidence: 90,
            application: "facade"
          },
          {
            name: "Portland Stone",
            category: "natural_stone",
            hexColor: "#E8E0D5",
            pattern: "ashlar",
            texture: "honed",
            percentage: 20,
            confidence: 85,
            application: "details"
          },
          {
            name: "Aluminum Window Frames",
            category: "metal",
            hexColor: "#C0C0C0",
            pattern: "linear",
            texture: "anodized",
            percentage: 15,
            confidence: 95,
            application: "windows"
          }
        ],
        dominant_style: "Contemporary British",
        quality_assessment: "High quality construction"
      };

      return detectedMaterials;
    } catch (error) {
      console.error('Material extraction error:', error);
      return this.getFallbackMaterials(context);
    }
  }

  /**
   * Detect materials from surrounding area using street view or maps
   */
  async detectSurroundingMaterials(location) {
    try {
      // Extract materials commonly used in the area
      const regionKey = this.getRegionKey(location);
      const localMaterials = this.getLocalMaterialPalette(regionKey);

      // Analyze neighboring buildings (would use street view API in production)
      const neighboringMaterials = {
        primary: [],
        secondary: [],
        avoided: []
      };

      // Common UK materials by region
      if (location.includes('London')) {
        neighboringMaterials.primary = ['london_stock_brick', 'portland_stone'];
        neighboringMaterials.secondary = ['slate', 'lead'];
      } else if (location.includes('Yorkshire')) {
        neighboringMaterials.primary = ['yorkshire_sandstone', 'slate'];
        neighboringMaterials.secondary = ['render', 'timber'];
      } else if (location.includes('Manchester')) {
        neighboringMaterials.primary = ['red_brick', 'terracotta'];
        neighboringMaterials.secondary = ['slate', 'metal'];
      }

      return {
        localMaterials,
        neighboringMaterials,
        vernacularStyle: this.getVernacularStyle(regionKey),
        materialAvailability: this.checkLocalAvailability(regionKey)
      };
    } catch (error) {
      console.error('Surrounding material detection error:', error);
      return this.getDefaultRegionalMaterials(location);
    }
  }

  /**
   * Calculate climate compatibility score for materials
   */
  calculateClimateCompatibility(material, climate) {
    const materialData = this.materialDatabase[material];
    if (!materialData) return 0;

    const climateReqs = this.climateCompatibilityMatrix[climate];
    if (!climateReqs) return 0.5;

    let score = 1.0;
    const weatherRes = materialData.weatherResistance;

    // Check required resistances
    if (climateReqs.requiredProperties.rainResistance &&
        weatherRes.rain < climateReqs.requiredProperties.rainResistance) {
      score *= weatherRes.rain / climateReqs.requiredProperties.rainResistance;
    }
    if (climateReqs.requiredProperties.frostResistance &&
        weatherRes.frost < climateReqs.requiredProperties.frostResistance) {
      score *= weatherRes.frost / climateReqs.requiredProperties.frostResistance;
    }
    if (climateReqs.requiredProperties.uvResistance &&
        weatherRes.uv < climateReqs.requiredProperties.uvResistance) {
      score *= weatherRes.uv / climateReqs.requiredProperties.uvResistance;
    }

    // Boost score if material is preferred
    if (climateReqs.preferredMaterials.includes(materialData.category)) {
      score *= 1.2;
    }

    // Reduce score if material should be avoided
    if (climateReqs.avoidMaterials.includes(material)) {
      score *= 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get sustainability score for material
   */
  getSustainabilityScore(material) {
    const materialData = this.materialDatabase[material];
    if (!materialData) return 0;

    const props = materialData.properties;
    const sustain = materialData.sustainability;

    let score = 0;

    // Carbon footprint (negative is better)
    if (props.embodiedCarbon < 0) {
      score += 30; // Carbon negative
    } else if (props.embodiedCarbon < 100) {
      score += 20; // Low carbon
    } else if (props.embodiedCarbon < 200) {
      score += 10; // Moderate carbon
    }

    // Recyclability
    score += props.recyclability * 20;

    // Renewable content
    score += sustain.renewableContent * 20;

    // Recycled content
    score += sustain.recycledContent * 10;

    // Local sourcing
    if (sustain.locallySourced) {
      score += 10;
    }

    // Durability bonus
    if (props.durability > 50) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Recommend materials based on multiple factors
   */
  async recommendMaterials(context) {
    const {
      location,
      climate,
      projectType,
      budget,
      sustainabilityTarget,
      portfolioMaterials,
      siteConstraints
    } = context;

    const recommendations = {
      primary: [],
      secondary: [],
      accent: [],
      roofing: [],
      reasoning: {}
    };

    // Get local materials
    const localMaterials = await this.detectSurroundingMaterials(location);

    // Score each material
    const materialScores = {};
    for (const [key, material] of Object.entries(this.materialDatabase)) {
      const climateScore = this.calculateClimateCompatibility(key, climate);
      const sustainScore = this.getSustainabilityScore(key) / 100;
      const costScore = 1 - (material.properties.costPerM2 / 500); // Normalize cost
      const durabilityScore = Math.min(material.properties.durability / 100, 1);

      // Weight factors based on project priorities
      const weights = {
        climate: 0.35,
        sustainability: sustainabilityTarget === 'high' ? 0.35 : 0.20,
        cost: budget === 'low' ? 0.35 : 0.20,
        durability: 0.25
      };

      materialScores[key] =
        climateScore * weights.climate +
        sustainScore * weights.sustainability +
        costScore * weights.cost +
        durabilityScore * weights.durability;

      // Boost score if material is used locally
      if (localMaterials.localMaterials.includes(key)) {
        materialScores[key] *= 1.15;
      }

      // Boost if in portfolio
      if (portfolioMaterials && portfolioMaterials.includes(material.name)) {
        materialScores[key] *= 1.10;
      }
    }

    // Sort materials by score
    const sortedMaterials = Object.entries(materialScores)
      .sort(([,a], [,b]) => b - a);

    // Select top materials for each category
    for (const [materialKey, score] of sortedMaterials) {
      const material = this.materialDatabase[materialKey];

      if (material.applications.includes('facades') && recommendations.primary.length < 2) {
        recommendations.primary.push({
          ...material,
          score,
          reasoning: this.generateMaterialReasoning(material, context)
        });
      } else if (material.applications.includes('cladding') && recommendations.secondary.length < 2) {
        recommendations.secondary.push({
          ...material,
          score,
          reasoning: this.generateMaterialReasoning(material, context)
        });
      } else if (material.category === 'roofing' && recommendations.roofing.length < 1) {
        recommendations.roofing.push({
          ...material,
          score,
          reasoning: this.generateMaterialReasoning(material, context)
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate reasoning for material selection
   */
  generateMaterialReasoning(material, context) {
    const reasons = [];

    if (this.calculateClimateCompatibility(material.name.toLowerCase().replace(' ', '_'), context.climate) > 0.8) {
      reasons.push(`Excellent ${context.climate} climate resistance`);
    }

    if (material.sustainability.locallySourced) {
      reasons.push(`Locally sourced in ${context.location}`);
    }

    if (material.properties.embodiedCarbon < 100) {
      reasons.push('Low carbon footprint');
    }

    if (material.properties.durability > 75) {
      reasons.push(`Long lifespan (${material.properties.durability} years)`);
    }

    if (material.properties.costPerM2 < 100) {
      reasons.push('Cost-effective');
    }

    return reasons.join(', ');
  }

  /**
   * Check local availability of materials
   */
  checkLocalAvailability(region) {
    // UK regional availability
    const availability = {
      'london': {
        high: ['london_stock_brick', 'portland_stone', 'concrete'],
        medium: ['welsh_slate', 'timber_cladding'],
        low: ['yorkshire_sandstone', 'local_timber']
      },
      'yorkshire': {
        high: ['yorkshire_sandstone', 'slate', 'brick'],
        medium: ['timber', 'concrete'],
        low: ['portland_stone', 'imported_materials']
      },
      'scotland': {
        high: ['granite', 'slate', 'timber'],
        medium: ['brick', 'concrete'],
        low: ['limestone', 'clay_tiles']
      },
      'wales': {
        high: ['welsh_slate', 'local_stone', 'timber'],
        medium: ['brick', 'concrete'],
        low: ['imported_stone', 'metal_panels']
      }
    };

    return availability[region] || availability['london'];
  }

  /**
   * Get vernacular style for region
   */
  getVernacularStyle(region) {
    const styles = {
      'london': 'Georgian/Victorian terraces with stock brick',
      'yorkshire': 'Stone cottages with slate roofs',
      'cotswolds': 'Honey-colored limestone with stone slate',
      'scotland': 'Granite facades with slate roofs',
      'wales': 'Stone and render with Welsh slate'
    };

    return styles[region] || 'Contemporary British';
  }

  /**
   * Get local material palette
   */
  getLocalMaterialPalette(region) {
    const palettes = {
      'london': ['london_stock_brick', 'portland_stone', 'slate', 'lead'],
      'yorkshire': ['yorkshire_sandstone', 'slate', 'lead', 'timber'],
      'cotswolds': ['cotswold_stone', 'stone_slate', 'timber', 'lead'],
      'scotland': ['granite', 'sandstone', 'slate', 'harling'],
      'wales': ['welsh_stone', 'welsh_slate', 'render', 'timber']
    };

    return palettes[region] || palettes['london'];
  }

  /**
   * Get region key from location string
   */
  getRegionKey(location) {
    const locationLower = location.toLowerCase();
    if (locationLower.includes('london')) return 'london';
    if (locationLower.includes('yorkshire')) return 'yorkshire';
    if (locationLower.includes('manchester')) return 'manchester';
    if (locationLower.includes('scotland')) return 'scotland';
    if (locationLower.includes('wales')) return 'wales';
    if (locationLower.includes('cotswold')) return 'cotswolds';
    return 'london'; // Default
  }

  /**
   * Get default regional materials
   */
  getDefaultRegionalMaterials(location) {
    return {
      localMaterials: ['brick', 'stone', 'slate'],
      neighboringMaterials: {
        primary: ['brick'],
        secondary: ['render'],
        avoided: []
      },
      vernacularStyle: 'Contemporary British',
      materialAvailability: {
        high: ['brick', 'concrete'],
        medium: ['stone', 'timber'],
        low: ['specialty_materials']
      }
    };
  }

  /**
   * Get fallback materials if AI extraction fails
   */
  getFallbackMaterials(context) {
    return {
      materials: [
        {
          name: "Brick",
          category: "masonry",
          hexColor: "#B8604E",
          pattern: "stretcher_bond",
          texture: "standard",
          percentage: 70,
          confidence: 50,
          application: "facade"
        }
      ],
      dominant_style: "Contemporary",
      quality_assessment: "Standard construction"
    };
  }

  /**
   * Validate material compatibility
   */
  validateMaterialCompatibility(primaryMaterial, secondaryMaterial) {
    // Define compatibility rules
    const compatibilityRules = {
      'brick': {
        compatible: ['stone', 'timber', 'metal', 'glass', 'render'],
        incompatible: ['conflicting_brick_types']
      },
      'stone': {
        compatible: ['brick', 'timber', 'metal', 'glass', 'slate'],
        incompatible: []
      },
      'timber': {
        compatible: ['brick', 'stone', 'metal', 'glass'],
        incompatible: ['untreated_metal']
      },
      'metal': {
        compatible: ['glass', 'concrete', 'composite'],
        incompatible: ['dissimilar_metals']
      },
      'glass': {
        compatible: ['all'],
        incompatible: []
      }
    };

    const primary = this.materialDatabase[primaryMaterial];
    const secondary = this.materialDatabase[secondaryMaterial];

    if (!primary || !secondary) return true; // Allow if materials not in database

    const rules = compatibilityRules[primary.category];
    if (!rules) return true;

    if (rules.incompatible.includes(secondary.category)) {
      return false;
    }

    return true;
  }
}

module.exports = new MaterialDetectionService();