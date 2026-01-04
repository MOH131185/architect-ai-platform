import logger from '../utils/logger.js';

/**
 * Climate-Responsive Design Service
 *
 * Generates climate-specific design parameters for:
 * - Passive solar design
 * - Natural ventilation
 * - Thermal comfort
 * - Moisture control
 * - Energy efficiency
 *
 * Based on local climate data and building science principles
 */

class ClimateResponsiveDesignService {
  constructor() {
    logger.info('🌡️ Climate-Responsive Design Service initialized');
  }

  /**
   * Generate comprehensive climate design parameters
   */
  generateClimateParameters(climateData, latitude = 40) {
    if (!climateData) {
      logger.warn('⚠️ No climate data provided, using temperate defaults');
      return this.getDefaultParameters();
    }

    logger.info('🌡️ Generating climate-responsive parameters for:', climateData.type);

    const params = {};

    // Temperature-based design
    params.thermal = this.generateThermalParameters(climateData);

    // Humidity control
    params.moisture = this.generateMoistureParameters(climateData);

    // Ventilation strategy
    params.ventilation = this.generateVentilationStrategy(climateData);

    // Solar design
    params.solar = this.generatePassiveSolarDesign(climateData, latitude);

    // Material selection
    params.materials = this.selectClimateMaterials(climateData);

    // Energy systems
    params.energy = this.generateEnergyStrategy(climateData);

    // Outdoor spaces
    params.outdoor = this.generateOutdoorSpaceDesign(climateData);

    // Climate-specific features
    params.features = this.generateClimateFeatures(climateData);

    return params;
  }

  /**
   * Generate thermal comfort parameters
   */
  generateThermalParameters(climate) {
    const avgSummerTemp = climate.seasonal?.summer?.avgTemp || 25;
    const avgWinterTemp = climate.seasonal?.winter?.avgTemp || 5;
    const diurnalRange = climate.seasonal?.summer?.maxTemp - climate.seasonal?.summer?.minTemp || 10;

    const params = {
      strategy: '',
      thermalMass: '',
      insulation: {},
      glazingRatio: 0
    };

    // Hot climates (>30°C summer average)
    if (avgSummerTemp > 30) {
      params.strategy = 'cooling-dominated';
      params.thermalMass = diurnalRange > 10 ? 'high' : 'low'; // High mass if large day-night swing
      params.insulation = {
        walls: 'R-15 with reflective barrier',
        roof: 'R-30 with radiant barrier',
        floor: 'R-10 with vapor barrier',
        focus: 'heat rejection'
      };
      params.glazingRatio = 0.15; // Minimize glazing
      params.roofColor = 'white or light (SRI > 80)';
      params.wallColor = 'light colors (absorptance < 0.4)';
    }

    // Cold climates (<0°C winter average)
    else if (avgWinterTemp < 0) {
      params.strategy = 'heating-dominated';
      params.thermalMass = 'high'; // Store solar heat
      params.insulation = {
        walls: 'R-30 minimum',
        roof: 'R-50 minimum',
        floor: 'R-20 with thermal break',
        foundation: 'R-10 perimeter insulation',
        focus: 'heat retention'
      };
      params.glazingRatio = 0.25; // Moderate glazing for solar gain
      params.roofColor = 'dark (absorptance > 0.7)';
      params.wallColor = 'medium to dark colors';
    }

    // Temperate climates
    else {
      params.strategy = 'balanced heating-cooling';
      params.thermalMass = 'medium';
      params.insulation = {
        walls: 'R-20',
        roof: 'R-35',
        floor: 'R-15',
        focus: 'balanced performance'
      };
      params.glazingRatio = 0.20;
      params.roofColor = 'medium colors';
      params.wallColor = 'medium colors';
    }

    // Window specifications
    params.windows = this.specifyWindows(avgSummerTemp, avgWinterTemp);

    return params;
  }

  /**
   * Generate moisture control parameters
   */
  generateMoistureParameters(climate) {
    const avgHumidity = climate.seasonal?.summer?.humidity || 50;
    const rainfall = climate.annualRainfall || 1000; // mm/year

    const params = {
      strategy: '',
      vaporBarrier: '',
      drainage: '',
      materials: []
    };

    // High humidity (>70%)
    if (avgHumidity > 70) {
      params.strategy = 'moisture rejection and ventilation';
      params.vaporBarrier = 'exterior side of insulation';
      params.foundation = 'elevated 0.5m minimum';
      params.drainage = {
        roof: 'large overhangs (1.2m+) with gutters',
        site: 'French drains and swales',
        foundation: 'waterproofing and drainage mat'
      };
      params.materials = [
        'moisture-resistant (cedar, teak, fiber cement)',
        'breathable wall assemblies',
        'mold-resistant finishes'
      ];
      params.ventilation = 'continuous soffit and ridge vents';
    }

    // Dry climates (<30% humidity)
    else if (avgHumidity < 30) {
      params.strategy = 'moisture retention';
      params.vaporBarrier = 'not required';
      params.drainage = {
        roof: 'minimal (0.3m overhangs)',
        site: 'retention for landscaping',
        rainwater: 'harvesting system'
      };
      params.materials = [
        'hygroscopic materials (adobe, rammed earth)',
        'exposed thermal mass'
      ];
    }

    // Moderate humidity
    else {
      params.strategy = 'balanced moisture management';
      params.vaporBarrier = 'interior side in cold climates';
      params.drainage = {
        roof: 'standard overhangs (0.6m)',
        site: 'positive drainage away from building',
        foundation: 'dampproofing'
      };
      params.materials = ['standard materials with proper detailing'];
    }

    return params;
  }

  /**
   * Generate ventilation strategy
   */
  generateVentilationStrategy(climate) {
    const avgTemp = climate.seasonal?.summer?.avgTemp || 20;
    const avgHumidity = climate.seasonal?.summer?.humidity || 50;
    const windSpeed = climate.avgWindSpeed || 10; // km/h

    const strategy = {
      type: '',
      design: [],
      openings: {},
      mechanical: ''
    };

    // Hot and dry - evaporative cooling possible
    if (avgTemp > 25 && avgHumidity < 40) {
      strategy.type = 'evaporative cooling + night flush';
      strategy.design = [
        'courtyard with water feature',
        'wind tower or solar chimney',
        'high ceilings (3.5m+)',
        'thermal mass for night cooling'
      ];
      strategy.openings = {
        size: 'large (40% of wall area)',
        position: 'opposite walls for cross-ventilation',
        control: 'automated based on temperature'
      };
    }

    // Hot and humid - maximize airflow
    else if (avgTemp > 25 && avgHumidity > 60) {
      strategy.type = 'continuous ventilation';
      strategy.design = [
        'raised floor for underfloor ventilation',
        'high ceilings with ceiling fans',
        'open plan for airflow',
        'breezeway or dogtrot design'
      ];
      strategy.openings = {
        size: 'maximum (50%+ of wall area)',
        position: 'all walls with louvers',
        control: 'always open with insect screens'
      };
      strategy.mechanical = 'ceiling fans in all rooms';
    }

    // Temperate - mixed mode
    else if (avgTemp >= 15 && avgTemp <= 25) {
      strategy.type = 'mixed-mode ventilation';
      strategy.design = [
        'operable windows for natural ventilation',
        'stack ventilation with high windows',
        'night flush ventilation'
      ];
      strategy.openings = {
        size: 'moderate (25% of wall area)',
        position: 'strategic for cross and stack effect',
        control: 'manual or automated sensors'
      };
      strategy.mechanical = 'HRV for winter, natural for summer';
    }

    // Cold - minimize infiltration
    else {
      strategy.type = 'controlled mechanical ventilation';
      strategy.design = [
        'airtight construction (<1.5 ACH50)',
        'vestibule entries',
        'heat recovery ventilation (HRV)'
      ];
      strategy.openings = {
        size: 'code minimum',
        position: 'south-facing for solar gain',
        control: 'sealed in winter, operable in summer'
      };
      strategy.mechanical = 'HRV/ERV required';
    }

    return strategy;
  }

  /**
   * Generate passive solar design
   */
  generatePassiveSolarDesign(climate, latitude) {
    const winterTemp = climate.seasonal?.winter?.avgTemp || 5;
    const summerTemp = climate.seasonal?.summer?.avgTemp || 25;

    const solar = {
      strategy: '',
      orientation: {},
      glazing: {},
      shading: {},
      thermalMass: {}
    };

    // Calculate sun angles
    const summerSunAngle = 90 - latitude + 23.5; // Summer solstice
    const winterSunAngle = 90 - latitude - 23.5; // Winter solstice

    // Northern hemisphere assumptions (flip for southern)
    const hemisphere = latitude > 0 ? 'northern' : 'southern';
    const solarFacing = hemisphere === 'northern' ? 'south' : 'north';

    // Heating-dominated climate
    if (winterTemp < 10) {
      solar.strategy = 'maximize winter solar gain';
      solar.orientation = {
        building: `elongated east-west`,
        mainFacade: solarFacing
      };
      solar.glazing = {
        [solarFacing]: '40-60% of wall area',
        opposite: '10-15% of wall area',
        east: '15-20% of wall area',
        west: '10% of wall area',
        type: 'low-e double or triple glazing'
      };
      solar.shading = {
        depth: `${(1.2 / Math.tan(summerSunAngle * Math.PI / 180)).toFixed(1)}m`,
        type: 'fixed horizontal overhang',
        calculation: 'blocks summer sun, admits winter sun'
      };
      solar.thermalMass = {
        location: `${solarFacing}-facing floors and walls`,
        material: 'concrete, tile, or brick',
        thickness: '100-150mm minimum'
      };
    }

    // Cooling-dominated climate
    else if (summerTemp > 25) {
      solar.strategy = 'minimize solar gain';
      solar.orientation = {
        building: 'compact form',
        mainFacade: 'away from west'
      };
      solar.glazing = {
        total: '< 20% of wall area',
        west: 'minimal or none',
        distribution: 'north and south preferred',
        type: 'solar control low-e glazing'
      };
      solar.shading = {
        depth: '1.5m minimum',
        type: 'deep overhangs, fins, or external blinds',
        vegetation: 'deciduous trees on west and east'
      };
      solar.thermalMass = {
        location: 'interior protected from direct sun',
        nightCooling: 'exposed to night ventilation'
      };
    }

    // Balanced climate
    else {
      solar.strategy = 'balanced solar design';
      solar.orientation = {
        building: 'moderate elongation',
        mainFacade: solarFacing
      };
      solar.glazing = {
        total: '25-30% of wall area',
        distribution: 'balanced with solar emphasis',
        type: 'low-e double glazing'
      };
      solar.shading = {
        depth: '0.6-0.9m',
        type: 'adjustable or deciduous'
      };
    }

    return solar;
  }

  /**
   * Select climate-appropriate materials
   */
  selectClimateMaterials(climate) {
    const temp = climate.seasonal?.summer?.avgTemp || 20;
    const humidity = climate.seasonal?.summer?.humidity || 50;
    const rainfall = climate.annualRainfall || 1000;

    const materials = {
      structure: '',
      envelope: '',
      insulation: '',
      finishes: [],
      reasoning: ''
    };

    // Hot and humid
    if (temp > 25 && humidity > 60) {
      materials.structure = 'lightweight frame (steel or timber)';
      materials.envelope = 'fiber cement, treated wood, or metal';
      materials.insulation = 'closed-cell foam or mineral wool';
      materials.finishes = [
        'ceramic tile floors',
        'moisture-resistant paint',
        'stainless steel hardware'
      ];
      materials.reasoning = 'moisture-resistant, low thermal mass, breathable';
    }

    // Hot and dry
    else if (temp > 25 && humidity < 40) {
      materials.structure = 'masonry or rammed earth';
      materials.envelope = 'adobe, stucco, or concrete';
      materials.insulation = 'rigid foam with radiant barrier';
      materials.finishes = [
        'tile or polished concrete floors',
        'lime plaster walls',
        'natural materials'
      ];
      materials.reasoning = 'high thermal mass, light colors, natural cooling';
    }

    // Cold
    else if (temp < 10) {
      materials.structure = 'insulated concrete forms or timber frame';
      materials.envelope = 'brick veneer, fiber cement, or wood';
      materials.insulation = 'high-R value (spray foam, dense pack cellulose)';
      materials.finishes = [
        'carpet or wood floors',
        'gypsum board with vapor barrier',
        'thermal drapes'
      ];
      materials.reasoning = 'high insulation, airtight, thermal mass inside';
    }

    // Temperate
    else {
      materials.structure = 'conventional frame or masonry';
      materials.envelope = 'brick, siding, or stucco';
      materials.insulation = 'standard batts or blown-in';
      materials.finishes = ['versatile options based on preference'];
      materials.reasoning = 'balanced performance, cost-effective';
    }

    // Add durability considerations
    if (rainfall > 1500) {
      materials.waterproofing = 'enhanced drainage and waterproofing details';
    }

    if (climate.extremeWeather?.includes('hurricane')) {
      materials.structure = 'reinforced for wind loads';
      materials.connections = 'hurricane ties and impact-resistant glazing';
    }

    return materials;
  }

  /**
   * Generate energy strategy
   */
  generateEnergyStrategy(climate) {
    const strategy = {
      heating: '',
      cooling: '',
      hotWater: '',
      renewable: [],
      efficiency: ''
    };

    const winterTemp = climate.seasonal?.winter?.avgTemp || 5;
    const summerTemp = climate.seasonal?.summer?.avgTemp || 25;
    const solarRadiation = climate.solarRadiation || 'moderate';

    // Heating strategy
    if (winterTemp < 10) {
      strategy.heating = 'radiant floor with heat pump or condensing boiler';
      strategy.heatingBackup = 'wood stove or fireplace';
    } else if (winterTemp < 18) {
      strategy.heating = 'heat pump (air or ground source)';
    } else {
      strategy.heating = 'minimal - spot heating only';
    }

    // Cooling strategy
    if (summerTemp > 30) {
      strategy.cooling = 'high-efficiency AC with zoning';
      strategy.coolingPassive = 'night flush, thermal mass, shading';
    } else if (summerTemp > 25) {
      strategy.cooling = 'ceiling fans with spot cooling';
      strategy.coolingPassive = 'cross-ventilation, shading';
    } else {
      strategy.cooling = 'natural ventilation only';
    }

    // Hot water
    if (solarRadiation === 'high' || summerTemp > 25) {
      strategy.hotWater = 'solar hot water with electric backup';
    } else {
      strategy.hotWater = 'heat pump water heater';
    }

    // Renewable energy
    if (solarRadiation === 'high') {
      strategy.renewable.push('photovoltaic panels (5-10kW)');
    }
    if (climate.avgWindSpeed > 15) {
      strategy.renewable.push('small wind turbine (if zoning allows)');
    }
    if (winterTemp < 15 && summerTemp < 25) {
      strategy.renewable.push('ground-source heat pump');
    }

    // Efficiency target
    if (winterTemp < 0 || summerTemp > 35) {
      strategy.efficiency = 'Passive House standard recommended';
    } else {
      strategy.efficiency = 'Energy Star or equivalent';
    }

    return strategy;
  }

  /**
   * Design outdoor spaces for climate
   */
  generateOutdoorSpaceDesign(climate) {
    const design = {
      type: [],
      features: [],
      landscaping: [],
      seasonal: ''
    };

    const temp = climate.seasonal?.summer?.avgTemp || 20;
    const humidity = climate.seasonal?.summer?.humidity || 50;
    const rainfall = climate.annualRainfall || 1000;

    // Hot climates - shade and cooling
    if (temp > 25) {
      design.type = ['shaded courtyard', 'covered verandah', 'pergola'];
      design.features = [
        'water feature for evaporative cooling',
        'outdoor ceiling fans',
        'misting system'
      ];
      design.landscaping = [
        'shade trees (deciduous in temperate, evergreen in tropical)',
        'drought-tolerant plants',
        'light-colored paving'
      ];
      design.seasonal = 'year-round use with shade';
    }

    // Cold climates - wind protection and sun
    else if (temp < 10) {
      design.type = ['sunroom', 'enclosed porch', 'wind-protected patio'];
      design.features = [
        'outdoor heating (fire pit, infrared heaters)',
        'wind screens',
        'southern exposure'
      ];
      design.landscaping = [
        'evergreen windbreak',
        'hardy perennials',
        'dark paving for heat absorption'
      ];
      design.seasonal = 'three-season with winter sunroom';
    }

    // Temperate climates
    else {
      design.type = ['deck', 'patio', 'garden'];
      design.features = [
        'retractable awning',
        'outdoor kitchen',
        'flexible furniture'
      ];
      design.landscaping = [
        'mixed plantings',
        'lawn areas',
        'seasonal gardens'
      ];
      design.seasonal = 'four-season adaptable';
    }

    // Rain considerations
    if (rainfall > 1500) {
      design.features.push('covered outdoor areas essential');
      design.landscaping.push('rain garden for stormwater');
    }

    return design;
  }

  /**
   * Generate climate-specific features
   */
  generateClimateFeatures(climate) {
    const features = [];

    const type = climate.type?.toLowerCase();
    const temp = climate.seasonal?.summer?.avgTemp || 20;
    const humidity = climate.seasonal?.summer?.humidity || 50;

    // Tropical features
    if (type === 'tropical' || (temp > 25 && humidity > 70)) {
      features.push(
        'wraparound verandah',
        'jalousie windows',
        'high pitched roof for rain',
        'mosquito screens',
        'outdoor shower'
      );
    }

    // Desert features
    if (type === 'desert' || (temp > 30 && humidity < 30)) {
      features.push(
        'courtyard with fountain',
        'thick walls (thermal mass)',
        'small windows',
        'flat roof with parapet',
        'outdoor rooms'
      );
    }

    // Cold climate features
    if (type === 'cold' || type === 'polar' || temp < 5) {
      features.push(
        'mudroom/airlock entry',
        'radiant floor heating',
        'triple glazing',
        'backup heating (wood stove)',
        'attached garage'
      );
    }

    // Coastal features (if near ocean)
    if (climate.coastal) {
      features.push(
        'corrosion-resistant materials',
        'hurricane shutters',
        'elevated foundation',
        'wind-resistant design',
        'outdoor rinse station'
      );
    }

    // Mountain features (if high altitude)
    if (climate.altitude > 1500) {
      features.push(
        'steep roof for snow',
        'sun space/solarium',
        'protected entry',
        'thermal mass heating',
        'UV-resistant materials'
      );
    }

    return features;
  }

  /**
   * Specify windows based on climate
   */
  specifyWindows(summerTemp, winterTemp) {
    const specs = {
      type: '',
      glazing: '',
      frame: '',
      features: []
    };

    // Very hot climate
    if (summerTemp > 30) {
      specs.type = 'fixed with some awning';
      specs.glazing = 'double low-e with argon, SHGC < 0.25';
      specs.frame = 'thermally broken aluminum or fiberglass';
      specs.features = ['exterior shading required', 'light tint acceptable'];
    }

    // Very cold climate
    else if (winterTemp < -5) {
      specs.type = 'casement or tilt-turn';
      specs.glazing = 'triple pane, low-e, argon fill, U < 0.20';
      specs.frame = 'fiberglass or wood with thermal breaks';
      specs.features = ['warm edge spacers', 'low air infiltration'];
    }

    // Temperate climate
    else {
      specs.type = 'double hung or casement';
      specs.glazing = 'double low-e, argon fill';
      specs.frame = 'vinyl, wood, or composite';
      specs.features = ['insect screens', 'optional storm windows'];
    }

    return specs;
  }

  /**
   * Get default parameters for missing climate data
   */
  getDefaultParameters() {
    return {
      thermal: {
        strategy: 'balanced',
        insulation: {
          walls: 'R-20',
          roof: 'R-35',
          floor: 'R-15'
        },
        glazingRatio: 0.20
      },
      ventilation: {
        type: 'mixed-mode',
        openings: {
          size: '25% of wall area',
          position: 'opposite walls'
        }
      },
      materials: {
        structure: 'conventional',
        envelope: 'standard',
        reasoning: 'temperate climate assumed'
      },
      solar: {
        strategy: 'balanced',
        glazing: {
          total: '25% of wall area'
        }
      }
    };
  }
}

// Export as singleton
const climateResponsiveDesignService = new ClimateResponsiveDesignService();
export default climateResponsiveDesignService;