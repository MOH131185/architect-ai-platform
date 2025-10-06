/**
 * Solar Orientation Service
 * Calculates optimal building orientation based on sun path analysis
 * Provides passive-solar design recommendations
 */

class SolarOrientationService {
  /**
   * Calculate optimal building orientation for passive solar design
   * @param {number} latitude - Site latitude
   * @param {number} longitude - Site longitude
   * @param {Object} climate - Climate data with seasonal information
   * @param {string} entranceDirection - Preferred entrance direction (optional)
   * @returns {Object} Solar orientation analysis and recommendations
   */
  calculateOptimalOrientation(latitude, longitude, climate, entranceDirection = null) {
    try {
      // Determine hemisphere
      const hemisphere = latitude >= 0 ? 'northern' : 'southern';

      // Calculate sun path angles
      const sunPath = this.calculateSunPath(latitude);

      // Determine optimal facade orientation
      const optimalOrientation = this.determineOptimalOrientation(
        hemisphere,
        latitude,
        climate,
        entranceDirection
      );

      // Calculate recommended overhang dimensions
      const overhangRecommendations = this.calculateOverhangs(latitude, climate);

      // Provide glazing recommendations
      const glazingStrategy = this.determineGlazingStrategy(hemisphere, climate);

      // Calculate shading requirements
      const shadingRequirements = this.calculateShadingRequirements(latitude, climate);

      return {
        hemisphere,
        sunPath,
        optimalOrientation,
        overhangRecommendations,
        glazingStrategy,
        shadingRequirements,
        energySavingsEstimate: this.estimateEnergySavings(optimalOrientation, climate),
        recommendations: this.generateRecommendations(
          hemisphere,
          optimalOrientation,
          climate,
          entranceDirection
        )
      };
    } catch (error) {
      console.error('Solar orientation calculation error:', error);
      return this.getFallbackOrientation(latitude);
    }
  }

  /**
   * Calculate sun path for the given latitude
   */
  calculateSunPath(latitude) {
    // Summer and winter solstice sun angles
    const summerSolsticeAltitude = 90 - Math.abs(latitude) + 23.5;
    const winterSolsticeAltitude = 90 - Math.abs(latitude) - 23.5;
    const equinoxAltitude = 90 - Math.abs(latitude);

    // Azimuth range (approximate)
    const summerAzimuthRange = { sunrise: 60, sunset: 300 };
    const winterAzimuthRange = { sunrise: 120, sunset: 240 };

    return {
      summer: {
        maxAltitude: Math.round(summerSolsticeAltitude * 10) / 10,
        azimuthRange: summerAzimuthRange,
        description: `Summer sun reaches ${Math.round(summerSolsticeAltitude)}° altitude at solar noon`,
        daylightHours: this.calculateDaylightHours(latitude, 'summer')
      },
      winter: {
        maxAltitude: Math.round(winterSolsticeAltitude * 10) / 10,
        azimuthRange: winterAzimuthRange,
        description: `Winter sun reaches ${Math.round(winterSolsticeAltitude)}° altitude at solar noon`,
        daylightHours: this.calculateDaylightHours(latitude, 'winter')
      },
      equinox: {
        maxAltitude: Math.round(equinoxAltitude * 10) / 10,
        azimuthRange: { sunrise: 90, sunset: 270 },
        description: `Equinox sun reaches ${Math.round(equinoxAltitude)}° altitude at solar noon`,
        daylightHours: 12
      }
    };
  }

  /**
   * Calculate daylight hours for season
   */
  calculateDaylightHours(latitude, season) {
    const latRad = (Math.PI / 180) * latitude;
    let declination;

    if (season === 'summer') {
      declination = 23.5; // Summer solstice
    } else if (season === 'winter') {
      declination = -23.5; // Winter solstice
    } else {
      declination = 0; // Equinox
    }

    const decRad = (Math.PI / 180) * declination;
    const hourAngle = Math.acos(-Math.tan(latRad) * Math.tan(decRad));
    const daylightHours = (2 * hourAngle * 24) / (2 * Math.PI);

    return Math.round(daylightHours * 10) / 10;
  }

  /**
   * Determine optimal building orientation
   */
  determineOptimalOrientation(hemisphere, latitude, climate, entranceDirection) {
    let primaryOrientation;
    let secondaryOrientation;
    let reasoning;

    // In northern hemisphere, south-facing is optimal (0-30° from true south)
    // In southern hemisphere, north-facing is optimal
    if (hemisphere === 'northern') {
      primaryOrientation = {
        direction: 'South',
        azimuth: 180,
        toleranceRange: '150-210°',
        description: 'Primary facade facing south (±30° tolerance)'
      };
      secondaryOrientation = {
        direction: 'North',
        azimuth: 0,
        description: 'Minimal glazing on north facade to reduce heat loss'
      };
      reasoning = 'South-facing orientation maximizes winter solar gain while allowing for summer shading through overhangs';
    } else {
      primaryOrientation = {
        direction: 'North',
        azimuth: 0,
        toleranceRange: '330-30°',
        description: 'Primary facade facing north (±30° tolerance)'
      };
      secondaryOrientation = {
        direction: 'South',
        azimuth: 180,
        description: 'Minimal glazing on south facade to reduce heat loss'
      };
      reasoning = 'North-facing orientation maximizes winter solar gain in southern hemisphere';
    }

    // Adjust for entrance direction if specified
    if (entranceDirection) {
      const entranceAdjustment = this.adjustForEntrance(
        primaryOrientation,
        entranceDirection,
        hemisphere
      );
      return {
        ...primaryOrientation,
        ...entranceAdjustment,
        secondaryOrientation,
        reasoning,
        entranceNote: `Entrance prioritized on ${entranceDirection} side as requested`
      };
    }

    // Consider prevailing winds
    const windAdjustment = this.adjustForWind(latitude, climate);

    return {
      primaryOrientation,
      secondaryOrientation,
      windConsideration: windAdjustment,
      reasoning,
      recommendation: `Orient building with long axis along ${primaryOrientation.direction}-facing facade for optimal passive solar performance`
    };
  }

  /**
   * Adjust orientation for entrance direction
   */
  adjustForEntrance(primaryOrientation, entranceDirection, hemisphere) {
    const directionMap = {
      'north': 0,
      'northeast': 45,
      'east': 90,
      'southeast': 135,
      'south': 180,
      'southwest': 225,
      'west': 270,
      'northwest': 315
    };

    const entranceAzimuth = directionMap[entranceDirection.toLowerCase()] || 0;
    const primaryAzimuth = primaryOrientation.azimuth;
    const deviation = Math.abs(entranceAzimuth - primaryAzimuth);

    if (deviation <= 30) {
      return {
        entranceCompatibility: 'Excellent',
        note: 'Entrance direction aligns well with optimal solar orientation'
      };
    } else if (deviation <= 60) {
      return {
        entranceCompatibility: 'Good',
        note: 'Minor compromise between entrance and solar orientation',
        adjustment: `Consider angled entrance or vestibule to maintain solar performance`
      };
    } else {
      return {
        entranceCompatibility: 'Challenging',
        note: 'Significant deviation from optimal solar orientation',
        adjustment: `Recommend L-shaped or courtyard plan to accommodate both entrance direction and solar orientation`
      };
    }
  }

  /**
   * Adjust for prevailing winds
   */
  adjustForWind(latitude, climate) {
    // Simplified wind analysis based on latitude and climate
    let prevailingDirection;
    let strategy;

    if (Math.abs(latitude) < 30) {
      // Tropical/subtropical - trade winds
      prevailingDirection = latitude >= 0 ? 'Northeast' : 'Southeast';
      strategy = 'Orient openings to capture prevailing breezes for natural ventilation';
    } else if (Math.abs(latitude) < 60) {
      // Temperate - westerlies
      prevailingDirection = 'West';
      strategy = 'Protect west facade from prevailing winds; consider windbreaks';
    } else {
      // Polar - easterlies
      prevailingDirection = 'East';
      strategy = 'Minimize east facade openings to reduce wind exposure';
    }

    return {
      prevailingDirection,
      strategy,
      recommendation: `Position entrance to avoid direct exposure to ${prevailingDirection.toLowerCase()} winds`
    };
  }

  /**
   * Calculate overhang dimensions for seasonal shading
   */
  calculateOverhangs(latitude, climate) {
    const sunPath = this.calculateSunPath(latitude);

    // Calculate overhang projection ratio (P/H ratio)
    // P = overhang projection, H = window height
    const summerAltitude = sunPath.summer.maxAltitude;
    const winterAltitude = sunPath.winter.maxAltitude;

    // Overhang should block summer sun but allow winter sun
    const overhangRatio = Math.tan((90 - summerAltitude) * Math.PI / 180);

    // For a typical 2m (6.5ft) window height
    const windowHeight = 2.0; // meters
    const recommendedProjection = windowHeight * overhangRatio;

    return {
      projectionRatio: Math.round(overhangRatio * 100) / 100,
      recommendedProjection: {
        meters: Math.round(recommendedProjection * 10) / 10,
        feet: Math.round(recommendedProjection * 3.28 * 10) / 10
      },
      windowHeight: {
        meters: windowHeight,
        feet: windowHeight * 3.28
      },
      description: `For ${windowHeight}m tall windows, provide ${Math.round(recommendedProjection * 10) / 10}m overhang`,
      summerShading: `Blocks sun at ${Math.round(summerAltitude)}° altitude (summer)`,
      winterAdmittance: `Allows sun at ${Math.round(winterAltitude)}° altitude (winter)`,
      additionalStrategies: [
        'Consider adjustable louvers for seasonal control',
        'Use deciduous trees for additional summer shading',
        'Extend overhangs on east and west facades for low-angle sun control'
      ]
    };
  }

  /**
   * Determine glazing strategy based on orientation
   */
  determineGlazingStrategy(hemisphere, climate) {
    const strategy = {
      primaryFacade: {},
      secondaryFacade: {},
      eastWest: {},
      recommendations: []
    };

    if (hemisphere === 'northern') {
      strategy.primaryFacade = {
        orientation: 'South',
        glazingRatio: '40-60%',
        type: 'High-performance double or triple glazing with low-E coating',
        reasoning: 'Maximize solar gain in winter while minimizing heat loss'
      };
      strategy.secondaryFacade = {
        orientation: 'North',
        glazingRatio: '15-25%',
        type: 'High-performance insulated glazing',
        reasoning: 'Minimize heat loss while providing daylighting'
      };
    } else {
      strategy.primaryFacade = {
        orientation: 'North',
        glazingRatio: '40-60%',
        type: 'High-performance double or triple glazing with low-E coating',
        reasoning: 'Maximize solar gain in winter while minimizing heat loss'
      };
      strategy.secondaryFacade = {
        orientation: 'South',
        glazingRatio: '15-25%',
        type: 'High-performance insulated glazing',
        reasoning: 'Minimize heat loss while providing daylighting'
      };
    }

    // East and West facades
    strategy.eastWest = {
      orientation: 'East & West',
      glazingRatio: '20-30%',
      type: 'High-performance glazing with external shading devices',
      reasoning: 'Control low-angle morning and afternoon sun; prevent overheating'
    };

    // Climate-specific recommendations
    if (climate?.type?.includes('hot') || climate?.type?.includes('tropical')) {
      strategy.recommendations.push('Use high solar heat gain coefficient (SHGC) glazing on all facades');
      strategy.recommendations.push('Specify external shading devices (brise-soleil, screens) to reduce cooling loads');
    } else if (climate?.type?.includes('cold') || climate?.type?.includes('continental')) {
      strategy.recommendations.push('Use low-U value glazing (≤1.2 W/m²K) to minimize heat loss');
      strategy.recommendations.push('Consider triple glazing on north facade for enhanced thermal performance');
    } else {
      strategy.recommendations.push('Balance solar heat gain and thermal insulation with moderate SHGC (0.4-0.6)');
    }

    return strategy;
  }

  /**
   * Calculate shading requirements
   */
  calculateShadingRequirements(latitude, climate) {
    const requirements = {
      horizontal: {},
      vertical: {},
      vegetation: {},
      seasonal: {}
    };

    // Horizontal shading (overhangs)
    requirements.horizontal = {
      primaryUse: 'Block high-angle summer sun on primary facade',
      depth: this.calculateOverhangs(latitude, climate).recommendedProjection,
      materials: 'Solid roof overhang, louvered system, or pergola with deciduous vines'
    };

    // Vertical shading (fins)
    requirements.vertical = {
      primaryUse: 'Block low-angle sun on east and west facades',
      spacing: 'Fins spaced at 0.5-1.0m intervals',
      depth: '0.3-0.6m projection',
      materials: 'Metal, timber, or concrete fins; vertical louvers'
    };

    // Vegetation
    requirements.vegetation = {
      deciduousTrees: {
        placement: 'South and west sides (northern hemisphere)',
        purpose: 'Summer shading; allow winter sun when leaves drop',
        species: 'Select native species with dense summer canopy'
      },
      evergreenTrees: {
        placement: 'North and northwest sides',
        purpose: 'Windbreak and winter protection',
        species: 'Select tall evergreens for wind buffering'
      }
    };

    // Seasonal considerations
    requirements.seasonal = {
      summer: 'Maximum shading on all facades; cross-ventilation encouraged',
      winter: 'Allow solar penetration on primary facade; minimize heat loss',
      spring_fall: 'Moderate shading; operable windows for natural ventilation'
    };

    return requirements;
  }

  /**
   * Estimate energy savings from optimal orientation
   */
  estimateEnergySavings(optimalOrientation, climate) {
    // Simplified energy savings estimation
    let heatingReduction = '15-25%';
    let coolingReduction = '10-20%';
    let annualSavings = '12-22%';

    if (climate?.type?.includes('cold')) {
      heatingReduction = '20-30%';
      coolingReduction = '5-10%';
      annualSavings = '18-28%';
    } else if (climate?.type?.includes('hot')) {
      heatingReduction = '5-10%';
      coolingReduction = '15-30%';
      annualSavings = '12-25%';
    }

    return {
      heatingReduction,
      coolingReduction,
      annualSavings,
      note: 'Estimates based on optimal orientation combined with appropriate shading and glazing strategies',
      additionalBenefits: [
        'Improved thermal comfort year-round',
        'Reduced peak demand on HVAC systems',
        'Enhanced natural daylighting',
        'Lower carbon footprint'
      ]
    };
  }

  /**
   * Generate comprehensive recommendations
   */
  generateRecommendations(hemisphere, optimalOrientation, climate, entranceDirection) {
    const recommendations = [];

    // Primary orientation
    recommendations.push({
      priority: 'High',
      category: 'Building Orientation',
      recommendation: `Align building long axis with ${optimalOrientation.primaryOrientation.direction}-facing facade within ${optimalOrientation.primaryOrientation.toleranceRange}`,
      benefit: 'Maximizes passive solar heating in winter, minimizes cooling loads in summer'
    });

    // Glazing
    recommendations.push({
      priority: 'High',
      category: 'Glazing Strategy',
      recommendation: `Concentrate glazing (40-60%) on ${optimalOrientation.primaryOrientation.direction} facade; limit glazing on opposite facade to 15-25%`,
      benefit: 'Optimizes solar heat gain while minimizing heat loss'
    });

    // Overhangs
    recommendations.push({
      priority: 'Medium',
      category: 'Shading Devices',
      recommendation: 'Install fixed roof overhangs sized to block summer sun while admitting winter sun',
      benefit: 'Passive seasonal solar control without mechanical systems'
    });

    // East/West protection
    recommendations.push({
      priority: 'Medium',
      category: 'East/West Facades',
      recommendation: 'Use vertical fins, louvers, or vegetation to control low-angle morning and afternoon sun',
      benefit: 'Prevents overheating from low-angle sun, reduces glare'
    });

    // Thermal mass
    if (climate?.type?.includes('temperate') || climate?.type?.includes('continental')) {
      recommendations.push({
        priority: 'Medium',
        category: 'Thermal Mass',
        recommendation: 'Incorporate high thermal mass materials (concrete, brick, stone) on floors and walls receiving direct sun',
        benefit: 'Absorbs solar heat during day, releases at night; moderates temperature swings'
      });
    }

    // Ventilation
    recommendations.push({
      priority: 'Medium',
      category: 'Natural Ventilation',
      recommendation: 'Position operable windows to facilitate cross-ventilation; align with prevailing breezes',
      benefit: 'Reduces cooling loads through natural airflow'
    });

    // Entrance consideration
    if (entranceDirection && optimalOrientation.entranceNote) {
      recommendations.push({
        priority: 'High',
        category: 'Entrance Design',
        recommendation: optimalOrientation.adjustment || `Entrance on ${entranceDirection} side as requested`,
        benefit: 'Balances user access requirements with passive solar performance'
      });
    }

    return recommendations;
  }

  /**
   * Fallback orientation data
   */
  getFallbackOrientation(latitude) {
    const hemisphere = latitude >= 0 ? 'northern' : 'southern';
    const primaryDirection = hemisphere === 'northern' ? 'South' : 'North';

    return {
      hemisphere,
      sunPath: {
        summer: { maxAltitude: 75, description: 'Summer sun path (estimated)' },
        winter: { maxAltitude: 30, description: 'Winter sun path (estimated)' }
      },
      optimalOrientation: {
        primaryOrientation: {
          direction: primaryDirection,
          description: `Orient primary facade toward ${primaryDirection}`
        },
        reasoning: 'Standard passive solar orientation principle'
      },
      recommendations: [
        {
          priority: 'High',
          category: 'Building Orientation',
          recommendation: `Align building with ${primaryDirection}-facing facade`,
          benefit: 'Passive solar design principle'
        }
      ],
      isFallback: true
    };
  }
}

export default new SolarOrientationService();
