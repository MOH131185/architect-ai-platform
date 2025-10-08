/**
 * Material Selection Service
 * Recommends building materials based on climate analysis and thermal performance
 * Includes thermal mass calculations and sustainable material strategies
 */

class MaterialSelectionService {
  /**
   * Recommend materials based on climate and building requirements
   * @param {Object} climate - Climate data with type and seasonal information
   * @param {Object} location - Location data
   * @param {string} buildingType - Type of building
   * @param {Object} solarOrientation - Solar orientation data
   * @returns {Object} Material recommendations with thermal analysis
   */
  recommendMaterials(climate, location, buildingType, solarOrientation) {
    try {
      console.log('Analyzing materials for climate:', climate?.type);

      // Determine climate category
      const climateCategory = this.categorizeClimate(climate);

      // Select optimal materials for climate
      const primaryMaterials = this.selectPrimaryMaterials(climateCategory, buildingType);

      // Calculate thermal mass requirements
      const thermalMassAnalysis = this.analyzeThermalMassRequirements(climateCategory, climate);

      // Recommend insulation strategy
      const insulationStrategy = this.determineInsulationStrategy(climateCategory, climate);

      // Select roof materials
      const roofingRecommendations = this.selectRoofingMaterials(climateCategory, climate);

      // Select glazing specifications
      const glazingSpecifications = this.selectGlazingSpecifications(
        climateCategory,
        solarOrientation
      );

      // Sustainable material alternatives
      const sustainableAlternatives = this.recommendSustainableAlternatives(
        primaryMaterials,
        location
      );

      // Cost implications
      const costAnalysis = this.analyzeMaterialCosts(primaryMaterials, climateCategory);

      return {
        climateCategory,
        primaryMaterials,
        thermalMassAnalysis,
        insulationStrategy,
        roofingRecommendations,
        glazingSpecifications,
        sustainableAlternatives,
        costAnalysis,
        recommendations: this.generateMaterialRecommendations(
          climateCategory,
          primaryMaterials,
          thermalMassAnalysis
        )
      };
    } catch (error) {
      console.error('Material selection error:', error);
      return this.getFallbackMaterials(climate);
    }
  }

  /**
   * Categorize climate for material selection
   */
  categorizeClimate(climate) {
    if (!climate?.type) {
      return {
        primary: 'temperate',
        characteristics: ['moderate', 'four-seasons'],
        challenges: ['variable temperatures', 'seasonal adaptation']
      };
    }

    const climateType = climate.type.toLowerCase();

    // Hot climates
    if (climateType.includes('hot') || climateType.includes('tropical') || climateType.includes('arid')) {
      return {
        primary: 'hot',
        subType: climateType.includes('humid') ? 'hot-humid' : 'hot-arid',
        characteristics: ['high temperatures', 'solar radiation', climateType.includes('humid') ? 'high humidity' : 'low humidity'],
        challenges: ['cooling loads', 'solar heat gain', 'moisture control']
      };
    }

    // Cold climates
    if (climateType.includes('cold') || climateType.includes('continental') || climateType.includes('polar')) {
      return {
        primary: 'cold',
        subType: climateType.includes('continental') ? 'continental' : 'polar',
        characteristics: ['low temperatures', 'heating demand', 'snow loads'],
        challenges: ['heat loss', 'thermal bridging', 'freeze-thaw cycles']
      };
    }

    // Temperate climates
    if (climateType.includes('temperate') || climateType.includes('oceanic') || climateType.includes('mediterranean')) {
      return {
        primary: 'temperate',
        subType: climateType.includes('mediterranean') ? 'mediterranean' : 'oceanic',
        characteristics: ['moderate temperatures', 'seasonal variation', 'mixed heating/cooling'],
        challenges: ['day-night temperature swings', 'seasonal adaptation', 'moisture management']
      };
    }

    // Default: temperate
    return {
      primary: 'temperate',
      characteristics: ['moderate', 'seasonal'],
      challenges: ['variable conditions']
    };
  }

  /**
   * Select primary construction materials
   */
  selectPrimaryMaterials(climateCategory, buildingType) {
    const materials = {
      structural: {},
      envelope: {},
      interior: {},
      reasoning: ''
    };

    const isPrimarilyResidential = buildingType?.toLowerCase().includes('residential');

    // Hot-Humid Climate
    if (climateCategory.primary === 'hot' && climateCategory.subType === 'hot-humid') {
      materials.structural = {
        primary: 'Reinforced concrete or steel frame',
        secondary: 'Lightweight concrete block',
        reasoning: 'Concrete provides thermal mass to moderate temperature swings; resistant to moisture and termites'
      };
      materials.envelope = {
        walls: 'Insulated concrete block or lightweight concrete with external insulation',
        finish: 'Light-colored stucco or cementitious render',
        thermalMass: 'Medium (sufficient to moderate daily swings without storing excessive heat)',
        reasoning: 'Lightweight construction reduces heat storage; external insulation keeps mass on interior side'
      };
      materials.interior = {
        floors: 'Tile or polished concrete for thermal comfort',
        walls: 'Plaster on masonry or drywall',
        ceilings: 'Suspended ceilings with ventilation plenum'
      };
      materials.reasoning = 'Lightweight, well-ventilated construction minimizes heat gain and promotes air movement. Moderate thermal mass helps stabilize indoor temperatures without retaining excessive heat.';
    }

    // Hot-Arid Climate
    else if (climateCategory.primary === 'hot' && climateCategory.subType === 'hot-arid') {
      materials.structural = {
        primary: 'Concrete, rammed earth, or adobe',
        secondary: 'Thick masonry walls',
        reasoning: 'High thermal mass moderates large day-night temperature swings typical of arid climates'
      };
      materials.envelope = {
        walls: 'Thick concrete, rammed earth (300-450mm), or insulated masonry',
        finish: 'Light-colored stucco, lime render, or earth plaster',
        thermalMass: 'High (absorbs daytime heat, releases at night)',
        reasoning: 'High thermal mass walls (>200mm thick) exploit diurnal temperature variation: absorb heat during hot day, radiate to cool night sky'
      };
      materials.interior = {
        floors: 'Tile, stone, or polished concrete on thick slab',
        walls: 'Thick plaster or earth-based finishes',
        ceilings: 'Vaulted or high ceilings for heat stratification'
      };
      materials.reasoning = 'High thermal mass construction (concrete, rammed earth, thick masonry) absorbs daytime heat and releases it at night when outdoor temperatures drop, reducing cooling loads by 30-50%.';
    }

    // Cold Climate
    else if (climateCategory.primary === 'cold') {
      materials.structural = {
        primary: isPrimarilyResidential ? 'Timber frame or cross-laminated timber (CLT)' : 'Reinforced concrete or steel frame',
        secondary: 'Insulated concrete forms (ICF) or structural insulated panels (SIP)',
        reasoning: 'High insulation values critical; timber is renewable and provides good thermal performance'
      };
      materials.envelope = {
        walls: 'Thick insulated timber frame (200-300mm insulation) or ICF',
        finish: 'Brick veneer, fiber cement, or timber cladding with ventilated air gap',
        thermalMass: 'Medium to High (on interior side of insulation to store solar heat)',
        reasoning: 'Superinsulated envelope minimizes heat loss; thermal mass placed inside insulation layer stores passive solar gains'
      };
      materials.interior = {
        floors: 'Concrete slab with radiant heating, timber, or engineered wood',
        walls: 'Drywall or timber paneling',
        ceilings: 'Insulated to R-60 or higher in roof'
      };
      materials.reasoning = 'Superinsulation (walls R-30+, roof R-60+) and airtight construction minimize heat loss. Interior thermal mass (concrete floors, masonry walls) stores passive solar heat gained through south-facing windows.';
    }

    // Temperate Climate
    else {
      materials.structural = {
        primary: isPrimarilyResidential ? 'Timber frame or brick masonry' : 'Reinforced concrete or steel',
        secondary: 'Concrete block or brick',
        reasoning: 'Balanced approach: moderate thermal mass with good insulation for mixed heating/cooling seasons'
      };
      materials.envelope = {
        walls: 'Brick cavity wall with insulation or insulated timber frame',
        finish: 'Brick, render, weatherboard, or fiber cement',
        thermalMass: 'Medium (moderates day-night swings, stores some solar heat)',
        reasoning: 'Medium thermal mass balances winter heat retention with summer cooling; traditional cavity wall construction'
      };
      materials.interior = {
        floors: 'Timber, engineered wood, or concrete with finish',
        walls: 'Plasterboard or plaster on masonry',
        ceilings: 'Standard insulated ceiling (R-4 to R-6)'
      };
      materials.reasoning = 'Medium thermal mass materials (brick, concrete) moderate temperature swings in climates with significant day-night variation. Adequate insulation (walls R-3 to R-4) provides year-round comfort.';
    }

    return materials;
  }

  /**
   * Analyze thermal mass requirements
   */
  analyzeThermalMassRequirements(climateCategory, climate) {
    const analysis = {
      requirement: '',
      optimalMaterials: [],
      placement: '',
      thickness: '',
      thermalProperties: {},
      performanceBenefit: ''
    };

    // Hot-Arid: High thermal mass
    if (climateCategory.primary === 'hot' && climateCategory.subType === 'hot-arid') {
      analysis.requirement = 'High';
      analysis.optimalMaterials = [
        { material: 'Concrete', density: '2400 kg/m³', specificHeat: '0.88 kJ/kg·K', thermalMass: 'High' },
        { material: 'Brick', density: '1800 kg/m³', specificHeat: '0.84 kJ/kg·K', thermalMass: 'High' },
        { material: 'Stone', density: '2500 kg/m³', specificHeat: '0.80 kJ/kg·K', thermalMass: 'Very High' },
        { material: 'Rammed Earth', density: '2000 kg/m³', specificHeat: '0.84 kJ/kg·K', thermalMass: 'High' }
      ];
      analysis.placement = 'Throughout building: floors, walls exposed to daytime sun';
      analysis.thickness = '300-450mm for walls; 150-200mm for floors';
      analysis.thermalProperties = {
        thermalLag: '8-12 hours (heat absorbed during day released at night)',
        temperatureModeration: 'Reduces indoor temperature swings by 5-10°C',
        coolingSavings: '30-50% reduction in cooling loads'
      };
      analysis.performanceBenefit = 'High thermal mass exploits large diurnal temperature range (20-30°C daily swing). Walls absorb solar heat during 35-45°C daytime, release to 15-20°C night sky, naturally cooling building.';
    }

    // Hot-Humid: Low to Medium thermal mass
    else if (climateCategory.primary === 'hot' && climateCategory.subType === 'hot-humid') {
      analysis.requirement = 'Low to Medium';
      analysis.optimalMaterials = [
        { material: 'Lightweight Concrete', density: '1400 kg/m³', specificHeat: '0.92 kJ/kg·K', thermalMass: 'Medium' },
        { material: 'Insulated Concrete Block', density: '1200 kg/m³', specificHeat: '0.88 kJ/kg·K', thermalMass: 'Medium' },
        { material: 'Tile on Concrete Slab', density: '2400 kg/m³ (slab)', specificHeat: '0.88 kJ/kg·K', thermalMass: 'Medium (floor only)' }
      ];
      analysis.placement = 'Primarily in floors; limit mass in walls to avoid heat retention';
      analysis.thickness = '100-150mm for floors; 150-200mm for walls';
      analysis.thermalProperties = {
        thermalLag: '4-6 hours (moderate heat storage)',
        temperatureModeration: 'Reduces indoor temperature swings by 2-4°C',
        coolingSavings: '10-20% reduction in cooling loads'
      };
      analysis.performanceBenefit = 'Lightweight construction with moderate floor mass provides thermal stability without retaining excessive heat. Prioritize ventilation and shading over thermal mass in hot-humid climates.';
    }

    // Cold: Medium to High thermal mass (inside insulation)
    else if (climateCategory.primary === 'cold') {
      analysis.requirement = 'Medium to High (inside insulation envelope)';
      analysis.optimalMaterials = [
        { material: 'Concrete Floor Slab', density: '2400 kg/m³', specificHeat: '0.88 kJ/kg·K', thermalMass: 'High', placement: 'Inside insulation' },
        { material: 'Brick or Masonry', density: '1800 kg/m³', specificHeat: '0.84 kJ/kg·K', thermalMass: 'High', placement: 'Interior walls' },
        { material: 'Gypsum/Concrete Board', density: '1200 kg/m³', specificHeat: '1.0 kJ/kg·K', thermalMass: 'Medium', placement: 'Interior finishes' }
      ];
      analysis.placement = 'Inside insulation layer: concrete floors in direct sun, interior masonry walls';
      analysis.thickness = '100-150mm for floors receiving solar gain; 100mm+ for interior walls';
      analysis.thermalProperties = {
        thermalLag: '6-10 hours (stores daytime solar heat, releases overnight)',
        temperatureModeration: 'Moderates indoor temperatures, reduces heating cycles',
        heatingSavings: '15-25% reduction in heating loads with passive solar design'
      };
      analysis.performanceBenefit = 'Thermal mass inside insulation layer stores free solar heat from south-facing windows during the day, releases it overnight, reducing heating demand. Critical: mass must be inside insulation to work effectively.';
    }

    // Temperate: Medium thermal mass
    else {
      analysis.requirement = 'Medium';
      analysis.optimalMaterials = [
        { material: 'Brick', density: '1800 kg/m³', specificHeat: '0.84 kJ/kg·K', thermalMass: 'Medium-High' },
        { material: 'Concrete', density: '2400 kg/m³', specificHeat: '0.88 kJ/kg·K', thermalMass: 'High' },
        { material: 'Timber (dense)', density: '600 kg/m³', specificHeat: '1.6 kJ/kg·K', thermalMass: 'Low-Medium' }
      ];
      analysis.placement = 'Floors and selected walls; balance with insulation';
      analysis.thickness = '150-200mm for exposed mass elements';
      analysis.thermalProperties = {
        thermalLag: '5-8 hours (moderates daily temperature fluctuations)',
        temperatureModeration: 'Reduces indoor temperature swings by 3-6°C',
        energySavings: '12-22% reduction in heating/cooling loads'
      };
      analysis.performanceBenefit = 'Medium thermal mass balances winter solar heat storage with summer cooling. Brick or concrete walls/floors moderate day-night temperature swings common in temperate climates with 10-15°C daily variation.';
    }

    return analysis;
  }

  /**
   * Determine insulation strategy
   */
  determineInsulationStrategy(climateCategory, climate) {
    const strategy = {
      walls: {},
      roof: {},
      floor: {},
      thermalBridging: '',
      airtightness: ''
    };

    if (climateCategory.primary === 'cold') {
      strategy.walls = {
        rValue: 'R-5.0 to R-7.0 (metric) / R-30 to R-40 (imperial)',
        material: 'Mineral wool, spray foam, or cellulose insulation',
        thickness: '250-350mm',
        placement: 'Continuous external insulation or thick cavity insulation'
      };
      strategy.roof = {
        rValue: 'R-10.0 to R-12.0 (metric) / R-60 to R-70 (imperial)',
        material: 'Mineral wool, cellulose, or spray foam',
        thickness: '400-500mm',
        placement: 'Above ceiling or in roof assembly'
      };
      strategy.floor = {
        rValue: 'R-3.0 to R-5.0 (metric) / R-20 to R-30 (imperial)',
        material: 'Rigid foam or mineral wool under slab',
        thickness: '150-250mm',
        placement: 'Under slab or in floor assembly'
      };
      strategy.thermalBridging = 'Eliminate thermal bridges with continuous insulation; use thermally broken connections';
      strategy.airtightness = 'Critical: target ≤0.6 ACH50 (Passive House) or ≤3.0 ACH50 (standard). Use air barrier membrane and seal all penetrations.';
    }

    else if (climateCategory.primary === 'hot') {
      strategy.walls = {
        rValue: 'R-2.5 to R-4.0 (metric) / R-15 to R-25 (imperial)',
        material: 'Reflective insulation, foam board, or mineral wool',
        thickness: '100-150mm',
        placement: 'External insulation preferred to keep mass cool'
      };
      strategy.roof = {
        rValue: 'R-5.0 to R-7.0 (metric) / R-30 to R-40 (imperial)',
        material: 'Reflective foil, polyisocyanurate, or mineral wool',
        thickness: '200-300mm',
        placement: 'Above roof deck with ventilated air space or cool roof finish'
      };
      strategy.floor = {
        rValue: 'R-1.0 to R-2.0 (metric) / R-6 to R-12 (imperial)',
        material: 'Minimal insulation; prioritize ventilation',
        thickness: '50-100mm',
        placement: 'Under slab if air-conditioned'
      };
      strategy.thermalBridging = 'Minimize but less critical than in cold climates; focus on shading and ventilation';
      strategy.airtightness = 'Moderate: target 5-10 ACH50. Balance airtightness with natural ventilation opportunities.';
    }

    else { // Temperate
      strategy.walls = {
        rValue: 'R-3.0 to R-4.5 (metric) / R-18 to R-27 (imperial)',
        material: 'Mineral wool, fiberglass batts, or foam board',
        thickness: '150-200mm',
        placement: 'Cavity insulation or external insulation'
      };
      strategy.roof = {
        rValue: 'R-6.0 to R-8.0 (metric) / R-38 to R-49 (imperial)',
        material: 'Mineral wool, fiberglass, or blown cellulose',
        thickness: '250-350mm',
        placement: 'Above ceiling in attic or roof assembly'
      };
      strategy.floor = {
        rValue: 'R-2.0 to R-3.0 (metric) / R-12 to R-19 (imperial)',
        material: 'Rigid foam or batts in floor framing',
        thickness: '100-150mm',
        placement: 'Under slab or in suspended floor'
      };
      strategy.thermalBridging = 'Important: minimize with attention to junctions and penetrations';
      strategy.airtightness = 'Target 3-5 ACH50 for good performance';
    }

    return strategy;
  }

  /**
   * Select roofing materials
   */
  selectRoofingMaterials(climateCategory, climate) {
    const recommendations = {
      primary: {},
      alternatives: [],
      color: '',
      solarReflectance: '',
      features: []
    };

    if (climateCategory.primary === 'hot') {
      recommendations.primary = {
        material: 'Cool roof: light-colored metal or reflective membrane',
        color: 'White or light colors (SRI 78+)',
        solarReflectance: 'High (≥0.65)',
        thermalEmittance: 'High (≥0.90)'
      };
      recommendations.alternatives = [
        'White TPO or PVC membrane (flat roofs)',
        'Light-colored metal roofing with reflective coating',
        'Clay tile in light terra cotta or white',
        'Concrete tile with reflective coating'
      ];
      recommendations.features = [
        'Cool roof technology reduces surface temperature by 25-30°C',
        'Ventilated air space below roof deck for additional cooling',
        'Green roof option for evaporative cooling',
        'Solar PV integration for energy generation'
      ];
    }

    else if (climateCategory.primary === 'cold') {
      recommendations.primary = {
        material: 'Dark-colored metal or asphalt shingles',
        color: 'Dark colors to absorb solar heat',
        solarReflectance: 'Low to Medium (0.20-0.40)',
        snowShedding: 'Metal preferred for snow shedding'
      };
      recommendations.alternatives = [
        'Standing seam metal (excellent for snow shedding)',
        'Architectural asphalt shingles (economical)',
        'Slate or concrete tile (durable, long-lasting)',
        'Green roof (insulation and stormwater management)'
      ];
      recommendations.features = [
        'Steep pitch (6:12 to 12:12) for snow shedding',
        'Ice and water shield at eaves and valleys',
        'Adequate attic ventilation to prevent ice dams',
        'High insulation values (R-60+) above ceiling'
      ];
    }

    else { // Temperate
      recommendations.primary = {
        material: 'Medium-toned metal, tile, or asphalt shingles',
        color: 'Medium colors balancing aesthetics and performance',
        solarReflectance: 'Medium (0.40-0.60)'
      };
      recommendations.alternatives = [
        'Metal roofing (longevity and recyclability)',
        'Clay or concrete tile (durability and thermal mass)',
        'Asphalt shingles (economical)',
        'Slate (premium, very long life)'
      ];
      recommendations.features = [
        'Moderate pitch for water shedding and aesthetics',
        'Good drainage and ventilation',
        'Insulation per local code (typically R-38 to R-49)',
        'Consider solar PV for renewable energy'
      ];
    }

    return recommendations;
  }

  /**
   * Select glazing specifications
   */
  selectGlazingSpecifications(climateCategory, solarOrientation) {
    const specifications = {
      type: '',
      uValue: '',
      shgc: '',
      vlt: '',
      coating: '',
      frame: '',
      recommendations: []
    };

    if (climateCategory.primary === 'cold') {
      specifications.type = 'Triple glazing with low-E coating';
      specifications.uValue = '≤0.8 W/m²K (≤0.14 Btu/h·ft²·°F)';
      specifications.shgc = '0.50-0.60 (high solar heat gain on south-facing windows)';
      specifications.vlt = '0.60-0.70 (high visible light transmission)';
      specifications.coating = 'Low-E coating on surface #2 or #3 (allows solar gain, blocks heat loss)';
      specifications.frame = 'Thermally broken aluminum, fiberglass, or vinyl with insulated spacers';
      specifications.recommendations = [
        'Triple glazing on north facade for maximum insulation',
        'Double glazing with high SHGC on south facade to capture solar heat',
        'Argon or krypton gas fill for enhanced performance',
        'Warm-edge spacers to reduce edge-of-glass heat loss'
      ];
    }

    else if (climateCategory.primary === 'hot') {
      specifications.type = 'Double glazing with spectrally selective low-E coating';
      specifications.uValue = '≤1.2 W/m²K (≤0.21 Btu/h·ft²·°F)';
      specifications.shgc = '0.25-0.35 (low solar heat gain coefficient)';
      specifications.vlt = '0.50-0.65 (good visible light, blocked heat)';
      specifications.coating = 'Low-E coating on surface #2 (blocks solar heat, admits light)';
      specifications.frame = 'Thermally broken aluminum or fiberglass';
      specifications.recommendations = [
        'Spectrally selective glazing admits daylight while blocking infrared heat',
        'External shading devices (brise-soleil, louvers) for additional control',
        'Tinted or reflective glazing on east/west facades to control low-angle sun',
        'Double glazing minimum; triple in extreme climates'
      ];
    }

    else { // Temperate
      specifications.type = 'Double glazing with low-E coating';
      specifications.uValue = '≤1.4 W/m²K (≤0.25 Btu/h·ft²·°F)';
      specifications.shgc = '0.40-0.50 (moderate solar heat gain)';
      specifications.vlt = '0.60-0.70 (high visible light transmission)';
      specifications.coating = 'Low-E coating on surface #3 (balanced performance)';
      specifications.frame = 'Thermally broken aluminum, wood, or composite';
      specifications.recommendations = [
        'Balance heating and cooling performance with moderate SHGC',
        'Low-E coating reduces heat loss in winter, heat gain in summer',
        'Argon gas fill for improved insulation',
        'Consider operable windows for natural ventilation in mild seasons'
      ];
    }

    return specifications;
  }

  /**
   * Recommend sustainable material alternatives
   */
  recommendSustainableAlternatives(primaryMaterials, location) {
    return {
      structural: [
        {
          material: 'Cross-Laminated Timber (CLT)',
          benefit: 'Carbon sequestration; renewable; fast construction',
          application: 'Multi-story structures up to 18 stories',
          consideration: 'Fire rating; moisture protection required'
        },
        {
          material: 'Recycled Steel',
          benefit: '90%+ recycled content; durable; high strength',
          application: 'Commercial and industrial structures',
          consideration: 'Embodied energy in production; thermal bridging'
        },
        {
          material: 'Rammed Earth or Compressed Earth Blocks',
          benefit: 'Locally sourced; low embodied energy; excellent thermal mass',
          application: 'Low-rise residential in appropriate climates',
          consideration: 'Labor-intensive; moisture protection; structural limitations'
        }
      ],
      envelope: [
        {
          material: 'Hempcrete',
          benefit: 'Carbon-negative; excellent insulation; breathable',
          application: 'Insulating infill in timber frame construction',
          consideration: 'Slow drying; needs protection from moisture'
        },
        {
          material: 'Recycled Content Insulation (cellulose, denim)',
          benefit: 'Diverts waste; good R-value; non-toxic',
          application: 'Wall and roof insulation',
          consideration: 'Settling in walls; fire treatment required'
        },
        {
          material: 'Cork',
          benefit: 'Renewable; good insulation; pest-resistant',
          application: 'Exterior insulation or interior finishes',
          consideration: 'Cost; availability'
        }
      ],
      finishes: [
        {
          material: 'Reclaimed or FSC-Certified Timber',
          benefit: 'Reduced deforestation; unique character',
          application: 'Flooring, cladding, structural elements',
          consideration: 'Sourcing; quality variation'
        },
        {
          material: 'Recycled Glass or Tile',
          benefit: 'Waste diversion; durable',
          application: 'Countertops, backsplashes, flooring',
          consideration: 'Cost; aesthetic preferences'
        },
        {
          material: 'Natural Plasters (lime, clay)',
          benefit: 'Breathable; low VOC; beautiful finish',
          application: 'Interior walls',
          consideration: 'Skill required; repair/maintenance'
        }
      ],
      localMaterials: this.identifyLocalMaterials(location),
      recommendations: [
        'Prioritize locally sourced materials to reduce transportation emissions',
        'Select materials with Environmental Product Declarations (EPDs)',
        'Use materials with high recycled content where structural requirements allow',
        'Design for disassembly to enable future material reuse'
      ]
    };
  }

  /**
   * Identify local materials based on location
   */
  identifyLocalMaterials(location) {
    // Simplified local material identification
    const country = location?.address?.split(',').pop()?.trim().toLowerCase() || '';

    const localMaterialsDatabase = {
      'uk': ['Brick', 'Stone (limestone, sandstone)', 'Slate', 'Timber (oak, ash)'],
      'usa': ['Timber (various species by region)', 'Brick', 'Stone (regional varieties)', 'Adobe (Southwest)'],
      'canada': ['Timber (softwood, hardwood)', 'Stone', 'Brick'],
      'australia': ['Brick', 'Timber (eucalyptus, hardwoods)', 'Sandstone', 'Corrugated metal'],
      'default': ['Locally quarried stone', 'Regional clay brick', 'Native timber species', 'Earth (rammed or compressed)']
    };

    const materials = localMaterialsDatabase[country] || localMaterialsDatabase['default'];

    return {
      materials,
      recommendation: 'Use locally sourced materials to reduce embodied energy and support regional economy'
    };
  }

  /**
   * Analyze material costs
   */
  analyzeMaterialCosts(primaryMaterials, climateCategory) {
    const analysis = {
      initialCost: '',
      lifecycleCost: '',
      paybackPeriod: '',
      recommendations: []
    };

    if (climateCategory.primary === 'cold') {
      analysis.initialCost = 'Higher (+15-25% vs. standard construction due to superior insulation)';
      analysis.lifecycleCost = 'Lower (energy savings offset higher initial cost within 7-12 years)';
      analysis.paybackPeriod = '7-12 years through reduced heating costs';
      analysis.recommendations = [
        'Invest in high-performance insulation and glazing for significant long-term savings',
        'Superinsulation and airtightness reduce heating costs by 30-50%',
        'Consider Passive House standard for ultra-low energy use'
      ];
    }

    else if (climateCategory.primary === 'hot') {
      analysis.initialCost = 'Moderate (+10-15% for cool roofs, shading, reflective materials)';
      analysis.lifecycleCost = 'Lower (reduced cooling costs and HVAC system sizing)';
      analysis.paybackPeriod = '5-10 years through reduced cooling costs';
      analysis.recommendations = [
        'Cool roof and shading devices provide immediate comfort and energy savings',
        'Invest in high-performance glazing on east and west facades',
        'Natural ventilation strategies can reduce or eliminate AC in some climates'
      ];
    }

    else { // Temperate
      analysis.initialCost = 'Moderate (+10-20% for balanced insulation and thermal mass)';
      analysis.lifecycleCost = 'Lower to Moderate (energy savings in both heating and cooling seasons)';
      analysis.paybackPeriod = '8-15 years through balanced energy performance';
      analysis.recommendations = [
        'Balanced investment in insulation, glazing, and moderate thermal mass',
        'Focus on adaptable design for year-round comfort',
        'Operable windows and natural ventilation extend comfort season'
      ];
    }

    return analysis;
  }

  /**
   * Generate material recommendations summary
   */
  generateMaterialRecommendations(climateCategory, primaryMaterials, thermalMassAnalysis) {
    const recommendations = [];

    recommendations.push({
      priority: 'High',
      category: 'Primary Materials',
      recommendation: primaryMaterials.structural.primary,
      benefit: primaryMaterials.structural.reasoning
    });

    recommendations.push({
      priority: 'High',
      category: 'Thermal Mass',
      recommendation: `${thermalMassAnalysis.requirement} thermal mass: ${thermalMassAnalysis.optimalMaterials[0]?.material}`,
      benefit: thermalMassAnalysis.performanceBenefit
    });

    recommendations.push({
      priority: 'High',
      category: 'Envelope Strategy',
      recommendation: primaryMaterials.envelope.walls,
      benefit: primaryMaterials.envelope.reasoning
    });

    recommendations.push({
      priority: 'Medium',
      category: 'Sustainability',
      recommendation: 'Prioritize locally sourced, low-embodied-carbon materials',
      benefit: 'Reduces transportation emissions and supports local economy'
    });

    return recommendations;
  }

  /**
   * Fallback materials
   */
  getFallbackMaterials(climate) {
    return {
      climateCategory: { primary: 'temperate', characteristics: ['moderate'] },
      primaryMaterials: {
        structural: { primary: 'Concrete or steel frame', reasoning: 'Standard construction' },
        envelope: { walls: 'Brick or concrete with insulation', thermalMass: 'Medium' },
        interior: { floors: 'Concrete or timber', walls: 'Plasterboard' }
      },
      thermalMassAnalysis: {
        requirement: 'Medium',
        optimalMaterials: [{ material: 'Concrete', thermalMass: 'Medium' }]
      },
      recommendations: [
        {
          priority: 'High',
          category: 'Materials',
          recommendation: 'Use locally appropriate materials with adequate insulation',
          benefit: 'Balanced performance and cost'
        }
      ],
      isFallback: true
    };
  }
}

export default new MaterialSelectionService();
