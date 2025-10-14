/**
 * Enhanced UK Location Intelligence Service
 * Combines UK Architecture Database with Google Maps API for comprehensive analysis
 */

import ukArchitectureDatabase from '../data/ukArchitectureDatabase';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const OPENWEATHER_API_KEY = process.env.REACT_APP_OPENWEATHER_API_KEY;

class EnhancedUKLocationService {
  constructor() {
    this.ukDatabase = ukArchitectureDatabase;
  }

  /**
   * Complete UK location analysis with architecture, climate, and environmental data
   */
  async analyzeUKLocation(address, coordinates) {
    try {
      console.log('🇬🇧 Starting comprehensive UK location analysis...');

      // 1. Detect UK region/city
      const region = await this.detectUKRegion(address, coordinates);
      console.log('✅ Region detected:', region);

      // 2. Get architectural styles for region
      const architecturalData = this.getRegionalArchitecture(region);
      console.log('✅ Architectural data retrieved');

      // 3. Get sun path and orientation data
      const sunData = await this.getSunPathData(coordinates, region);
      console.log('✅ Sun path data calculated');

      // 4. Get wind and climate data
      const climateData = await this.getDetailedClimateData(coordinates, region);
      console.log('✅ Climate data retrieved');

      // 5. Get building regulations for region
      const regulations = this.getBuildingRegulations(region);
      console.log('✅ Building regulations identified');

      // 6. Get material recommendations
      const materials = this.getMaterialRecommendations(region, climateData);
      console.log('✅ Material recommendations generated');

      // 7. Get sustainable design recommendations
      const sustainability = this.getSustainabilityRecommendations(region, climateData, sunData);
      console.log('✅ Sustainability recommendations generated');

      return {
        success: true,
        region,
        architecturalData,
        sunData,
        climateData,
        regulations,
        materials,
        sustainability,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('UK location analysis error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackUKData(address)
      };
    }
  }

  /**
   * Detect UK region from address
   */
  async detectUKRegion(address, coordinates) {
    // Check if address contains known UK cities
    const ukCities = Object.keys(this.ukDatabase.regions);

    for (const city of ukCities) {
      if (address.toLowerCase().includes(city.toLowerCase())) {
        return city;
      }
    }

    // If not found in address, use reverse geocoding
    if (coordinates && GOOGLE_MAPS_API_KEY) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinates.lat},${coordinates.lng}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();

        if (data.results && data.results.length > 0) {
          const components = data.results[0].address_components;

          // Look for locality or postal_town
          for (const component of components) {
            if (component.types.includes('locality') || component.types.includes('postal_town')) {
              const cityName = component.long_name;

              // Check if this city is in our database
              if (this.ukDatabase.regions[cityName]) {
                return cityName;
              }
            }
          }
        }
      } catch (error) {
        console.warn('Reverse geocoding failed:', error);
      }
    }

    // Default to London if UK but city not found
    return 'London';
  }

  /**
   * Get regional architectural styles and characteristics
   */
  getRegionalArchitecture(region) {
    const regionData = this.ukDatabase.regions[region];

    if (!regionData) {
      return this.getFallbackArchitecturalData();
    }

    return {
      region: region,
      country: regionData.country,
      traditionalStyles: regionData.architecturalStyles.traditional,
      contemporaryStyles: regionData.architecturalStyles.contemporary,
      commonMaterials: regionData.commonMaterials,
      recommendations: this.generateStyleRecommendations(regionData)
    };
  }

  /**
   * Generate style recommendations based on regional data
   */
  generateStyleRecommendations(regionData) {
    const recommendations = [];

    // Traditional recommendations
    if (regionData.architecturalStyles.traditional) {
      const latestTraditional = regionData.architecturalStyles.traditional[regionData.architecturalStyles.traditional.length - 1];
      recommendations.push({
        category: 'Traditional/Heritage',
        style: latestTraditional.name,
        rationale: `Respects local architectural heritage and ${regionData.region} character`,
        materials: latestTraditional.commonMaterials,
        characteristics: latestTraditional.characteristics
      });
    }

    // Contemporary recommendations
    if (regionData.architecturalStyles.contemporary) {
      const contemporary = regionData.architecturalStyles.contemporary[0];
      recommendations.push({
        category: 'Contemporary',
        style: contemporary.name,
        rationale: 'Modern interpretation suitable for current building standards',
        materials: contemporary.commonMaterials,
        characteristics: contemporary.characteristics
      });
    }

    // Hybrid recommendation
    recommendations.push({
      category: 'Hybrid',
      style: `Modern ${regionData.region}`,
      rationale: 'Combines traditional materials with contemporary design',
      materials: this.blendMaterials(regionData.commonMaterials),
      characteristics: ['Contextual design', 'Energy efficient', 'Local character', 'Modern construction']
    });

    return recommendations;
  }

  /**
   * Blend traditional and modern materials
   */
  blendMaterials(commonMaterials) {
    const traditional = commonMaterials.walls.filter(m =>
      m.includes('brick') || m.includes('stone') || m.includes('render')
    );
    const modern = commonMaterials.walls.filter(m =>
      m.includes('glass') || m.includes('metal') || m.includes('zinc')
    );

    return [...traditional.slice(0, 2), ...modern.slice(0, 2)];
  }

  /**
   * Get detailed sun path data using coordinates and date
   */
  async getSunPathData(coordinates, region) {
    const regionData = this.ukDatabase.regions[region];

    // Use database sun path if available
    if (regionData && regionData.sunPath) {
      return {
        ...regionData.sunPath,
        calculated: true,
        coordinates,
        solarRecommendations: this.generateSolarRecommendations(regionData.sunPath, coordinates.lat)
      };
    }

    // Calculate sun path based on latitude
    return this.calculateSunPath(coordinates.lat, coordinates.lng);
  }

  /**
   * Calculate sun path for any UK location
   */
  calculateSunPath(latitude, longitude) {
    // Summer solstice (June 21)
    const summerMaxAltitude = 90 - latitude + 23.44; // Simplified calculation
    const summerSunrise = this.calculateSunriseTime(latitude, 23.44);
    const summerSunset = this.calculateSunsetTime(latitude, 23.44);

    // Winter solstice (December 21)
    const winterMaxAltitude = 90 - latitude - 23.44;
    const winterSunrise = this.calculateSunriseTime(latitude, -23.44);
    const winterSunset = this.calculateSunsetTime(latitude, -23.44);

    return {
      summer: `Southeast sunrise (${summerSunrise}), Southwest sunset (${summerSunset}), max altitude ${Math.round(summerMaxAltitude)}°`,
      winter: `Southeast sunrise (${winterSunrise}), Southwest sunset (${winterSunset}), max altitude ${Math.round(winterMaxAltitude)}°`,
      optimalOrientation: 'South-facing for maximum solar gain',
      calculated: true,
      solarRecommendations: this.generateSolarRecommendations({
        summer: `max altitude ${Math.round(summerMaxAltitude)}°`,
        winter: `max altitude ${Math.round(winterMaxAltitude)}°`
      }, latitude)
    };
  }

  /**
   * Simplified sunrise time calculation
   */
  calculateSunriseTime(latitude, declination) {
    const hourAngle = Math.acos(-Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180));
    const sunriseHour = 12 - (hourAngle * 12 / Math.PI);
    const hours = Math.floor(sunriseHour);
    const minutes = Math.round((sunriseHour - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Simplified sunset time calculation
   */
  calculateSunsetTime(latitude, declination) {
    const hourAngle = Math.acos(-Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180));
    const sunsetHour = 12 + (hourAngle * 12 / Math.PI);
    const hours = Math.floor(sunsetHour);
    const minutes = Math.round((sunsetHour - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Generate solar design recommendations
   */
  generateSolarRecommendations(sunPath, latitude) {
    const recommendations = [
      {
        aspect: 'Primary living spaces',
        orientation: 'South-facing',
        rationale: 'Maximum daylight and passive solar gain'
      },
      {
        aspect: 'Bedrooms',
        orientation: 'East or Southeast',
        rationale: 'Morning light, cooler in evening'
      },
      {
        aspect: 'Service spaces (bathrooms, storage)',
        orientation: 'North',
        rationale: 'Less critical for daylight'
      }
    ];

    // Add overhang recommendations based on latitude
    const winterAltitude = parseInt(sunPath.winter.match(/max altitude (\d+)/)?.[1] || '15');
    const summerAltitude = parseInt(sunPath.summer.match(/max altitude (\d+)/)?.[1] || '60');

    if (summerAltitude > 50) {
      recommendations.push({
        aspect: 'South-facing windows',
        element: 'Overhangs or brise-soleil',
        dimension: `${Math.round((summerAltitude - winterAltitude) / 10) * 10}cm overhang`,
        rationale: 'Shade summer sun, allow winter sun penetration'
      });
    }

    return recommendations;
  }

  /**
   * Get detailed climate data from OpenWeather API + database
   */
  async getDetailedClimateData(coordinates, region) {
    const regionData = this.ukDatabase.regions[region];

    // Start with database climate data
    let climateData = regionData?.climate || {};

    // Enhance with live data from OpenWeather API if available
    if (OPENWEATHER_API_KEY && coordinates) {
      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${coordinates.lat}&lon=${coordinates.lng}&appid=${OPENWEATHER_API_KEY}&units=metric`
        );
        const liveData = await response.json();

        climateData = {
          ...climateData,
          currentTemp: liveData.main.temp,
          currentConditions: liveData.weather[0].description,
          windSpeed: liveData.wind.speed,
          windDirection: this.degreesToCardinal(liveData.wind.deg),
          humidity: liveData.main.humidity,
          pressure: liveData.main.pressure,
          liveData: true
        };
      } catch (error) {
        console.warn('Could not fetch live weather data:', error);
      }
    }

    // Add wind recommendations
    climateData.windRecommendations = this.generateWindRecommendations(climateData);

    return climateData;
  }

  /**
   * Convert wind degrees to cardinal direction
   */
  degreesToCardinal(degrees) {
    const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }

  /**
   * Generate wind protection recommendations
   */
  generateWindRecommendations(climate) {
    const prevailingWind = climate.prevailingWind || 'Southwest';

    return [
      {
        element: 'Main entrance',
        recommendation: `Avoid ${prevailingWind.toLowerCase()}-facing if possible`,
        rationale: 'Reduce wind-driven rain and drafts'
      },
      {
        element: 'Outdoor spaces',
        recommendation: `Shelter on ${this.oppositeDirection(prevailingWind).toLowerCase()} side`,
        rationale: 'Protected from prevailing winds'
      },
      {
        element: 'Windows on windward side',
        recommendation: 'Robust sealing and weather-resistant details',
        rationale: 'Wind-driven rain protection'
      },
      {
        element: 'Roof',
        recommendation: 'Secure fixings, consider aerodynamic form',
        rationale: `Withstand ${prevailingWind.toLowerCase()} winds`
      }
    ];
  }

  /**
   * Get opposite direction
   */
  oppositeDirection(direction) {
    const opposites = {
      'North': 'South',
      'Northeast': 'Southwest',
      'East': 'West',
      'Southeast': 'Northwest',
      'South': 'North',
      'Southwest': 'Northeast',
      'West': 'East',
      'Northwest': 'Southeast'
    };
    return opposites[direction] || 'Unknown';
  }

  /**
   * Get building regulations for region
   */
  getBuildingRegulations(region) {
    const regionData = this.ukDatabase.regions[region];
    const country = regionData?.country.toLowerCase().replace(/\s+/g, '') || 'england';

    return {
      regional: regionData?.buildingRegulations || {},
      national: this.ukDatabase.buildingRegulations[country] || this.ukDatabase.buildingRegulations.england,
      summary: this.summarizeRegulations(regionData?.buildingRegulations, country)
    };
  }

  /**
   * Summarize key regulations
   */
  summarizeRegulations(regional, country) {
    const national = this.ukDatabase.buildingRegulations[country]?.energyEfficiency;

    return {
      energyStandards: regional?.energyStandards || 'Part L compliance required',
      fireRegulations: regional?.fireRegulations || 'Standard UK fire safety',
      accessibility: 'Part M - level access and accessible facilities required',
      thermalPerformance: national || {},
      keyRequirements: [
        'SAP or SBEM energy assessment required',
        'U-values must meet minimum standards',
        'Air tightness testing may be required',
        'Ventilation and overheating analysis',
        'Fire safety strategy for buildings >18m'
      ]
    };
  }

  /**
   * Get material recommendations based on region and climate
   */
  getMaterialRecommendations(region, climate) {
    const regionData = this.ukDatabase.regions[region];
    const commonMaterials = regionData?.commonMaterials || {};

    const recommendations = {
      walls: this.selectMaterialsForClimate(commonMaterials.walls, climate, 'walls'),
      roofing: this.selectMaterialsForClimate(commonMaterials.roofing, climate, 'roofing'),
      windows: this.selectMaterialsForClimate(commonMaterials.windows, climate, 'windows'),
      structure: commonMaterials.structure || ['Steel frame', 'Timber frame', 'Masonry'],
      sustainable: this.ukDatabase.sustainableMaterials.filter(m =>
        m.suitability.includes('Residential') || m.suitability.includes('All building types')
      )
    };

    return recommendations;
  }

  /**
   * Select materials appropriate for climate
   */
  selectMaterialsForClimate(materials, climate, category) {
    if (!materials) return [];

    // Filter materials based on climate characteristics
    let recommended = [...materials];

    // High rainfall - prioritize weather-resistant materials
    if (climate.rainfall > 800) {
      if (category === 'walls') {
        recommended = materials.filter(m =>
          m.includes('brick') || m.includes('stone') || m.includes('render') || m.includes('cladding')
        );
      }
      if (category === 'roofing') {
        recommended = materials.filter(m =>
          m.includes('slate') || m.includes('tiles') || m.includes('zinc') || m.includes('metal')
        );
      }
    }

    return recommended.length > 0 ? recommended : materials;
  }

  /**
   * Generate comprehensive sustainability recommendations
   */
  getSustainabilityRecommendations(region, climate, sunData) {
    const regionData = this.ukDatabase.regions[region];
    const considerations = regionData?.sustainabilityConsiderations || [];

    return {
      passive Design: [
        {
          strategy: 'Orientation',
          recommendation: sunData.optimalOrientation,
          benefit: '15-20% reduction in heating energy'
        },
        {
          strategy: 'Natural ventilation',
          recommendation: 'Cross-ventilation with openings on opposite facades',
          benefit: 'Reduce cooling energy and improve air quality'
        },
        {
          strategy: 'Thermal mass',
          recommendation: 'Exposed concrete or masonry floors',
          benefit: 'Moderate temperature swings'
        },
        {
          strategy: 'Insulation',
          recommendation: `Exceed Part L standards by 20% (walls: U-value 0.15 W/m²K)`,
          benefit: '25-30% reduction in heating demand'
        }
      ],
      renewableEnergy: [
        {
          technology: 'Solar PV',
          suitability: climate.sunHours > 1300 ? 'Good' : 'Moderate',
          recommendation: `${Math.round(climate.sunHours / 100)}kWp system`,
          benefit: `Generate ${Math.round(climate.sunHours)}kWh/year`
        },
        {
          technology: 'Air Source Heat Pump',
          suitability: 'Excellent for UK climate',
          recommendation: 'SCOP > 3.5',
          benefit: '60-70% reduction in heating costs vs gas boiler'
        },
        {
          technology: 'Solar thermal',
          suitability: 'Good for hot water',
          recommendation: '4-6m² panels',
          benefit: '50-60% of annual hot water demand'
        }
      ],
      waterManagement: [
        {
          strategy: 'Rainwater harvesting',
          suitability: climate.rainfall > 700 ? 'Excellent' : 'Good',
          recommendation: `${Math.round(climate.rainfall / 10)}m³ storage tank`,
          benefit: '40-50% reduction in mains water use'
        },
        {
          strategy: 'SUDS (Sustainable Drainage)',
          recommendation: 'Green roof, permeable paving, rain gardens',
          benefit: 'Reduce surface water runoff by 50-70%'
        }
      ],
      biodiversity: [
        {
          element: 'Green roof',
          recommendation: 'Sedum or biodiverse roof',
          benefit: 'Habitat creation, thermal performance, SUDS'
        },
        {
          element: 'Bird and bat boxes',
          recommendation: 'Integrated into facade',
          benefit: 'Biodiversity net gain'
        },
        {
          element: 'Native planting',
          recommendation: 'UK native species',
          benefit: 'Support local ecosystems'
        }
      ],
      regional Considerations: considerations.map(c => ({
        consideration: c,
        action: 'Required'
      }))
    };
  }

  /**
   * Fallback UK data when region not in database
   */
  getFallbackUKData(address) {
    return {
      region: 'UK (General)',
      architecturalData: {
        traditionalStyles: [{
          name: 'British Vernacular',
          characteristics: ['Local materials', 'Climate-responsive', 'Traditional construction'],
          commonMaterials: ['Brick', 'Stone', 'Slate', 'Timber']
        }],
        contemporaryStyles: [{
          name: 'Modern British',
          characteristics: ['Contextual design', 'Sustainable', 'Energy efficient'],
          commonMaterials: ['Brick', 'Glass', 'Timber cladding', 'Metal']
        }]
      },
      climate: {
        type: 'Temperate maritime',
        avgTempSummer: 18,
        avgTempWinter: 4,
        rainfall: 800,
        prevailingWind: 'Southwest'
      },
      regulations: this.ukDatabase.buildingRegulations.england,
      isFallback: true
    };
  }

  /**
   * Fallback architectural data
   */
  getFallbackArchitecturalData() {
    return {
      region: 'UK (General)',
      traditionalStyles: [{
        name: 'British Vernacular',
        period: 'Various',
        characteristics: ['Local materials', 'Climate-responsive design'],
        commonMaterials: ['Brick', 'Stone', 'Slate', 'Timber']
      }],
      contemporaryStyles: [{
        name: 'Modern British',
        period: '2000-Present',
        characteristics: ['Energy efficient', 'Contextual', 'Sustainable'],
        commonMaterials: ['Glass', 'Steel', 'Timber', 'Brick']
      }],
      commonMaterials: {
        walls: ['Brick', 'Stone', 'Render', 'Timber cladding'],
        roofing: ['Slate', 'Clay tiles', 'Metal'],
        windows: ['Timber', 'uPVC', 'Aluminum'],
        structure: ['Masonry', 'Timber frame', 'Steel frame']
      }
    };
  }
}

export default new EnhancedUKLocationService();
