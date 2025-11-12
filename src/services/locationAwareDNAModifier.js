/**
 * Location-Aware DNA Modifier Service
 *
 * Modifies Master Design DNA based on:
 * - Geographic location and climate
 * - Local architectural styles
 * - Site constraints and geometry
 * - Zoning requirements
 * - Sun path and orientation
 *
 * Ensures buildings are contextually appropriate for their location
 */

class LocationAwareDNAModifier {
  constructor() {
    console.log('🌍 Location-Aware DNA Modifier initialized');
  }

  /**
   * Main method to apply all location-based modifications to DNA
   */
  applyLocationContext(masterDNA, locationData, siteAnalysis) {
    console.log('🌍 Applying location context to Master DNA...');

    let modifiedDNA = { ...masterDNA };

    // Apply modifications in order of priority
    modifiedDNA = this.applyClimateAdaptations(modifiedDNA, locationData?.climate);
    modifiedDNA = this.applyArchitecturalStyle(modifiedDNA, locationData);
    modifiedDNA = this.applySiteGeometry(modifiedDNA, siteAnalysis);
    modifiedDNA = this.applyZoningRequirements(modifiedDNA, locationData?.zoning);
    modifiedDNA = this.applySunPathOptimization(modifiedDNA, locationData?.sunPath);
    modifiedDNA = this.applyLocalMaterials(modifiedDNA, locationData);

    // Add location context for prompts
    modifiedDNA.locationContext = this.generateLocationContext(locationData, siteAnalysis);

    console.log('✅ Location context applied to DNA');
    console.log('   Climate:', locationData?.climate?.type);
    console.log('   Style:', locationData?.recommendedStyle);
    console.log('   Site:', siteAnalysis?.plotGeometry?.shape);

    return modifiedDNA;
  }

  /**
   * Apply climate-specific adaptations
   */
  applyClimateAdaptations(dna, climate) {
    if (!climate) return dna;

    const modified = { ...dna };
    const climateType = climate.type?.toLowerCase();
    const avgTemp = climate.seasonal?.summer?.avgTemp || 20;
    const avgHumidity = climate.seasonal?.summer?.humidity || 50;

    console.log(`🌡️ Applying ${climateType} climate adaptations (${avgTemp}°C, ${avgHumidity}% humidity)`);

    // TROPICAL/HOT CLIMATES (>25°C average)
    if (climateType === 'tropical' || climateType === 'desert' || avgTemp > 25) {
      modified.roof = {
        ...modified.roof,
        type: 'flat' || 'low-pitch',
        material: 'Light-colored tiles',
        color: '#FFFFFF',
        pitch: '15°',
        overhang: '1.2m', // Deep overhangs for shade
        ventilation: 'ridge and soffit vents'
      };

      modified.materials = {
        ...modified.materials,
        exterior: {
          ...modified.materials?.exterior,
          primary: 'Light stucco or concrete',
          color: '#F5F5DC', // Beige - heat reflective
          texture: 'smooth',
          insulation: 'reflective roof coating'
        }
      };

      modified.windows = {
        ...modified.windows,
        type: 'Louvered or operable',
        glazing: 'Low-E double',
        shading: 'External blinds or brise-soleil',
        placement: 'High for stack ventilation',
        size: 'Moderate (25% wall area)'
      };

      modified.features = {
        ...modified.features,
        ventilation: 'Cross-ventilation design',
        courtyard: true,
        elevatedFloor: avgHumidity > 70, // Raise if humid
        ceilingHeight: '3.5m' // Higher ceilings
      };
    }

    // COLD CLIMATES (<10°C average)
    else if (climateType === 'cold' || climateType === 'polar' || avgTemp < 10) {
      modified.roof = {
        ...modified.roof,
        type: 'gable' || 'hip',
        material: 'Metal or heavy tiles',
        color: '#2C3E50', // Dark - heat absorption
        pitch: '45°', // Steep for snow shedding
        overhang: '0.3m', // Small to allow winter sun
        insulation: 'R-50 minimum'
      };

      modified.materials = {
        ...modified.materials,
        exterior: {
          ...modified.materials?.exterior,
          primary: 'Insulated brick or timber',
          color: '#8B4513', // Brown - heat absorption
          texture: 'textured for snow grip',
          insulation: 'R-30 walls minimum'
        }
      };

      modified.windows = {
        ...modified.windows,
        type: 'Fixed with some operable',
        glazing: 'Triple-pane argon-filled',
        placement: 'Maximize south-facing',
        size: 'Large south (40% wall), small north (10%)',
        features: 'Thermal breaks in frames'
      };

      modified.features = {
        ...modified.features,
        entrance: 'Airlock vestibule',
        heating: 'Radiant floor heating',
        thermalMass: 'Concrete floors for heat storage',
        ceilingHeight: '2.7m' // Lower for heating efficiency
      };
    }

    // TEMPERATE CLIMATES
    else if (climateType === 'temperate' || climateType === 'mediterranean') {
      modified.roof = {
        ...modified.roof,
        type: 'gable' || 'hip',
        material: 'Clay tiles or shingles',
        color: '#A0522D', // Medium brown
        pitch: '30°',
        overhang: '0.6m', // Moderate overhangs
        insulation: 'R-30'
      };

      modified.materials = {
        ...modified.materials,
        exterior: {
          ...modified.materials?.exterior,
          primary: 'Brick or stone veneer',
          color: '#CD853F', // Tan
          texture: 'moderate texture',
          insulation: 'R-20 walls'
        }
      };

      modified.windows = {
        ...modified.windows,
        type: 'Casement or sliding',
        glazing: 'Double-pane low-E',
        placement: 'Balanced all orientations',
        size: 'Moderate (30% wall area)'
      };

      modified.features = {
        ...modified.features,
        ventilation: 'Natural with mechanical backup',
        ceilingHeight: '3.0m'
      };
    }

    // Add climate-specific consistency rules
    modified.consistencyRules = {
      ...modified.consistencyRules,
      climate: [
        `ALL views must show ${modified.roof.overhang} overhang depth`,
        `ALL views must show ${modified.roof.type} roof at ${modified.roof.pitch}`,
        `ALL views must show ${modified.materials.exterior.primary} in ${modified.materials.exterior.color}`,
        `ALL elevations must show climate-appropriate window placement`
      ]
    };

    return modified;
  }

  /**
   * Apply regional architectural style
   */
  applyArchitecturalStyle(dna, locationData) {
    const style = locationData?.recommendedStyle?.toLowerCase();
    if (!style) return dna;

    const modified = { ...dna };
    console.log(`🏛️ Applying ${style} architectural style`);

    const styleModifications = {
      'mediterranean': {
        materials: {
          exterior: { primary: 'White stucco', color: '#FFFFFF' },
          roof: { material: 'Red clay tiles', color: '#B22222' }
        },
        features: {
          arches: true,
          courtyard: true,
          balconies: 'Wrought iron railings',
          windows: 'Arched with shutters'
        }
      },
      'nordic': {
        materials: {
          exterior: { primary: 'Timber cladding', color: '#4B4B4D' },
          roof: { material: 'Standing seam metal', color: '#2C3E50' }
        },
        features: {
          minimalist: true,
          largeWindows: true,
          sauna: true,
          colors: ['#000000', '#FFFFFF', '#8B7355']
        }
      },
      'british': {
        materials: {
          exterior: { primary: 'Red brick', color: '#8B4513' },
          roof: { material: 'Slate tiles', color: '#2F4F4F' }
        },
        features: {
          bayWindows: true,
          chimney: true,
          symmetrical: true,
          doorStyle: 'Georgian with fanlight'
        }
      },
      'japanese': {
        materials: {
          exterior: { primary: 'Wood and plaster', color: '#F5DEB3' },
          roof: { material: 'Dark ceramic tiles', color: '#1C1C1C' }
        },
        features: {
          engawa: 'Perimeter veranda',
          shoji: 'Sliding screens',
          garden: 'Integrated zen garden',
          minimal: true
        }
      },
      'modernist': {
        materials: {
          exterior: { primary: 'Concrete and glass', color: '#CCCCCC' },
          roof: { material: 'Flat membrane', color: '#F5F5F5' }
        },
        features: {
          openPlan: true,
          flatRoof: true,
          largeGlazing: true,
          cantilevers: true
        }
      }
    };

    const styleMods = styleModifications[style] || {};

    // Merge style modifications
    if (styleMods.materials) {
      modified.materials = {
        ...modified.materials,
        ...styleMods.materials
      };
    }

    if (styleMods.features) {
      modified.features = {
        ...modified.features,
        ...styleMods.features
      };
    }

    // Add style to consistency rules
    modified.consistencyRules = {
      ...modified.consistencyRules,
      style: [
        `ALL views must reflect ${style} architectural style`,
        `Materials must be consistent with ${style} tradition`
      ]
    };

    return modified;
  }

  /**
   * Adapt building to site geometry
   */
  applySiteGeometry(dna, siteAnalysis) {
    if (!siteAnalysis?.plotGeometry) return dna;

    const modified = { ...dna };
    const { shape, dimensions, slope, orientation } = siteAnalysis.plotGeometry;

    console.log(`📐 Adapting to ${shape} site (${dimensions?.width}m × ${dimensions?.length}m)`);

    // Site shape adaptations
    switch(shape?.toLowerCase()) {
      case 'narrow':
      case 'rectangular-narrow':
        modified.dimensions = {
          ...modified.dimensions,
          length: Math.min(dimensions?.length * 0.8, 25),
          width: Math.min(dimensions?.width * 0.8, 8),
        };
        modified.layout = {
          type: 'linear',
          circulation: 'side corridor',
          rooms: 'sequential arrangement',
          lightWells: true
        };
        break;

      case 'corner':
      case 'l-shaped':
        modified.layout = {
          type: 'L-shaped',
          wings: 'public and private separation',
          courtyard: 'internal courtyard at corner',
          entrance: 'at the junction'
        };
        break;

      case 'triangular':
        modified.layout = {
          type: 'triangular',
          arrangement: 'radial from center',
          entrance: 'at widest point',
          rooms: 'wedge-shaped'
        };
        break;

      case 'irregular':
        modified.layout = {
          type: 'organic',
          arrangement: 'following site boundaries',
          maximize: 'usable space within setbacks'
        };
        break;

      case 'square':
      case 'rectangular':
      default:
        modified.layout = {
          type: 'compact',
          arrangement: 'central core with perimeter rooms',
          efficiency: 'maximized'
        };
        break;
    }

    // Slope adaptations
    if (slope && slope > 10) {
      modified.foundation = {
        type: slope > 20 ? 'pile foundation' : 'stepped foundation',
        grading: 'minimal site disturbance'
      };
      modified.layout.levels = slope > 15 ? 'split-level' : 'single-level with raised areas';
      modified.entrance = {
        ...modified.entrance,
        location: 'mid-slope for easy access'
      };
    }

    // Apply setbacks
    if (siteAnalysis.setbacks) {
      modified.siteConstraints = {
        frontSetback: siteAnalysis.setbacks.front || 3,
        sideSetback: siteAnalysis.setbacks.side || 1.5,
        rearSetback: siteAnalysis.setbacks.rear || 3,
        buildableArea: siteAnalysis.buildableArea
      };

      // Adjust dimensions to respect setbacks
      const maxWidth = dimensions?.width - (2 * modified.siteConstraints.sideSetback);
      const maxLength = dimensions?.length - modified.siteConstraints.frontSetback - modified.siteConstraints.rearSetback;

      modified.dimensions.width = Math.min(modified.dimensions.width, maxWidth);
      modified.dimensions.length = Math.min(modified.dimensions.length, maxLength);
    }

    return modified;
  }

  /**
   * Apply zoning requirements
   */
  applyZoningRequirements(dna, zoning) {
    if (!zoning) return dna;

    const modified = { ...dna };
    console.log(`🏛️ Applying ${zoning.type} zoning requirements`);

    // Height restrictions
    if (zoning.maxHeight) {
      const maxFloors = Math.floor(parseFloat(zoning.maxHeight) / 3.0);
      if (modified.dimensions.floorCount > maxFloors) {
        console.warn(`⚠️ Reducing floors from ${modified.dimensions.floorCount} to ${maxFloors} for zoning compliance`);
        modified.dimensions.floorCount = maxFloors;
        modified.dimensions.totalHeight = maxFloors * 3.0;
      }
    }

    // Density/coverage restrictions
    if (zoning.density) {
      modified.coverage = {
        maxPlotRatio: zoning.density,
        maxBuildingCoverage: zoning.maxCoverage || 0.6
      };
    }

    // Use-specific requirements
    const zoningRequirements = {
      'residential': {
        parking: '2 spaces minimum',
        greenSpace: '20% of plot',
        privacy: 'windows offset from neighbors'
      },
      'commercial': {
        parking: '1 space per 50m²',
        loading: 'rear loading dock',
        signage: 'street-facing signage zone'
      },
      'mixed': {
        separation: 'commercial ground, residential upper',
        entrance: 'separate residential entrance',
        parking: 'underground or rear'
      }
    };

    const requirements = zoningRequirements[zoning.type?.toLowerCase()] || {};
    modified.zoningCompliance = requirements;

    return modified;
  }

  /**
   * Optimize for sun path
   */
  applySunPathOptimization(dna, sunPath) {
    if (!sunPath) return dna;

    const modified = { ...dna };
    const optimalOrientation = sunPath.optimalOrientation || 'south';

    console.log(`☀️ Optimizing for ${optimalOrientation} solar orientation`);

    // Window distribution based on orientation
    const hemisphere = sunPath.hemisphere || 'northern';

    modified.windows = {
      ...modified.windows,
      distribution: {
        north: hemisphere === 'northern' ? '15%' : '40%',
        south: hemisphere === 'northern' ? '40%' : '15%',
        east: '20%',
        west: '15%', // Minimize western exposure
        placement: `Primary living spaces face ${optimalOrientation}`
      }
    };

    // Overhang calculations based on sun angles
    if (sunPath.summerAngle && sunPath.winterAngle) {
      const overhangDepth = this.calculateOptimalOverhang(
        sunPath.summerAngle,
        sunPath.winterAngle
      );
      modified.roof.overhang = `${overhangDepth}m`;
    }

    return modified;
  }

  /**
   * Apply local materials and construction methods
   */
  applyLocalMaterials(dna, locationData) {
    const localMaterials = locationData?.localMaterials;
    if (!localMaterials?.length) return dna;

    const modified = { ...dna };
    console.log(`🏗️ Using local materials:`, localMaterials.join(', '));

    // Map local materials to DNA
    const materialMapping = {
      'timber': { primary: 'Timber frame', cladding: 'Wood siding' },
      'brick': { primary: 'Brick masonry', color: '#8B4513' },
      'stone': { primary: 'Stone veneer', color: '#808080' },
      'adobe': { primary: 'Adobe brick', color: '#DEB887' },
      'bamboo': { primary: 'Bamboo frame', sustainable: true },
      'concrete': { primary: 'Reinforced concrete', modern: true }
    };

    // Apply first available local material
    const primaryLocal = localMaterials[0]?.toLowerCase();
    if (materialMapping[primaryLocal]) {
      modified.materials.exterior = {
        ...modified.materials.exterior,
        ...materialMapping[primaryLocal]
      };
    }

    // Mark as locally sourced
    modified.sustainability = {
      ...modified.sustainability,
      localMaterials: true,
      materials: localMaterials,
      carbonFootprint: 'reduced'
    };

    return modified;
  }

  /**
   * Generate location context string for prompts
   */
  generateLocationContext(locationData, siteAnalysis) {
    if (!locationData) return '';

    const context = [];

    // Location
    context.push(`Location: ${locationData.address || 'Urban site'}`);

    // Climate
    if (locationData.climate) {
      context.push(`Climate: ${locationData.climate.type} (${
        locationData.climate.description || 'moderate conditions'
      })`);
    }

    // Style
    if (locationData.recommendedStyle) {
      context.push(`Architectural Style: ${locationData.recommendedStyle}`);
    }

    // Zoning
    if (locationData.zoning) {
      context.push(`Zoning: ${locationData.zoning.type} (max height: ${
        locationData.zoning.maxHeight || 'unrestricted'
      })`);
    }

    // Site
    if (siteAnalysis?.plotGeometry) {
      context.push(`Site: ${siteAnalysis.plotGeometry.shape} plot, ${
        siteAnalysis.plotGeometry.dimensions?.area || '500'
      }m²`);
    }

    // Sun path
    if (locationData.sunPath) {
      context.push(`Solar Orientation: ${locationData.sunPath.optimalOrientation}`);
    }

    return context.join(' | ');
  }

  /**
   * Calculate optimal overhang depth based on sun angles
   */
  calculateOptimalOverhang(summerAngle, winterAngle) {
    // Simple calculation for overhang depth
    // Block summer sun, allow winter sun
    const windowHeight = 1.5; // Standard window height
    const summerRad = summerAngle * Math.PI / 180;
    const winterRad = winterAngle * Math.PI / 180;

    // Overhang should block summer sun
    const overhangDepth = windowHeight / Math.tan(summerRad);

    // But allow winter sun (check)
    const winterReach = windowHeight / Math.tan(winterRad);

    // Return optimal depth (capped at 1.5m)
    return Math.min(Math.max(overhangDepth, 0.3), 1.5).toFixed(1);
  }
}

// Export as singleton
const locationAwareDNAModifier = new LocationAwareDNAModifier();
export default locationAwareDNAModifier;