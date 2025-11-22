// src/services/locationIntelligence.js
// Enhanced with street view material detection and surrounding area analysis
import { architecturalStyleService } from '../data/globalArchitecturalDatabase.js';
import materialDetectionService from './materialDetectionService.js';
import { getClimateDesignRules as buildClimateDesignRules } from '../rings/ring1-site/climateRules.js';
import logger from '../utils/logger.js';


export const locationIntelligence = {
  async recommendArchitecturalStyle(location, climate, options = {}) {
    const components = location.address_components;
    const country = components.find(c => c.types.includes('country'))?.long_name || '';
    const state = components.find(c => c.types.includes('administrative_area_level_1'))?.long_name || '';
    const city = components.find(c => c.types.includes('locality') || c.types.includes('postal_town'))?.long_name || '';
    const postcode = components.find(c => c.types.includes('postal_code'))?.long_name || '';
    const streetName = components.find(c => c.types.includes('route'))?.long_name || '';

    // Get location-specific styles from database
    const locationStyles = architecturalStyleService.getStylesByLocation(country, state, city, postcode);

    // Get climate adaptations
    const climateFeatures = architecturalStyleService.getClimateAdaptations(climate.type);

    // Get local regulations
    const regulations = architecturalStyleService.getRegulations(country);

    // Enhanced: Detect materials from surrounding area
    const surroundingMaterials = await this.detectSurroundingMaterials({
      address: location.formatted_address,
      coordinates: location.geometry?.location,
      city,
      postcode,
      streetName,
      country
    });

    // Enhanced: Get material recommendations with climate compatibility
    const materialRecommendations = await this.getEnhancedMaterialRecommendations({
      location: location.formatted_address,
      climate: climate.type,
      surroundingMaterials: surroundingMaterials.detected,
      localStyles: locationStyles.materials,
      projectType: options.projectType || 'residential'
    });

    // Combine all data with enhanced material intelligence
    return {
      primary: locationStyles.styles?.contemporary[0] || 'Contemporary Local',
      alternatives: locationStyles.styles?.contemporary.slice(1) || [],
      historical: locationStyles.styles?.historical || [],
      vernacular: locationStyles.styles?.vernacular || [],
      materials: materialRecommendations.recommended || locationStyles.materials || [],
      detectedMaterials: surroundingMaterials.detected,
      materialCompatibility: materialRecommendations.compatibility,
      characteristics: [...(locationStyles.characteristics || []), ...(climateFeatures.features || [])],
      regulations: regulations,
      climateAdaptations: climateFeatures,
      materialContext: {
        surrounding: surroundingMaterials,
        recommendations: materialRecommendations,
        localAvailability: surroundingMaterials.availability
      }
    };
  },

  /**
   * Detect materials from surrounding buildings using street view data simulation
   * In production, this would integrate with Google Street View API
   */
  async detectSurroundingMaterials(locationData) {
    const { city, postcode, streetName, country } = locationData;

    try {
      // Get region-specific material patterns
      const regionKey = this.getRegionKey(city, postcode, country);

      // Simulate street view material detection based on location patterns
      const detectedMaterials = await this.analyzeStreetMaterials(regionKey, streetName);

      // Get local material availability
      const availability = materialDetectionService.checkLocalAvailability(regionKey);

      // Analyze architectural consistency in the area
      const areaConsistency = this.analyzeAreaConsistency(detectedMaterials);

      return {
        detected: detectedMaterials,
        availability,
        areaConsistency,
        dominantStyle: this.identifyDominantStyle(detectedMaterials),
        colorPalette: this.extractAreaColorPalette(detectedMaterials)
      };
    } catch (error) {
      logger.warn('Material detection fallback:', error);
      return this.getFallbackMaterials(locationData);
    }
  },

  /**
   * Analyze street materials based on location patterns
   */
  async analyzeStreetMaterials(regionKey, streetName) {
    // UK-specific material patterns by region
    const regionalMaterials = {
      'london': [
        { name: 'London Stock Brick', hexColor: '#8B7355', percentage: 45, confidence: 85 },
        { name: 'Portland Stone', hexColor: '#E8E0D5', percentage: 15, confidence: 80 },
        { name: 'Render', hexColor: '#F5F5F5', percentage: 20, confidence: 75 },
        { name: 'Slate Roof', hexColor: '#404040', percentage: 20, confidence: 90 }
      ],
      'yorkshire': [
        { name: 'Yorkshire Sandstone', hexColor: '#D2B48C', percentage: 35, confidence: 90 },
        { name: 'Red Brick', hexColor: '#B8604E', percentage: 30, confidence: 85 },
        { name: 'Welsh Slate', hexColor: '#36454F', percentage: 20, confidence: 85 },
        { name: 'Render', hexColor: '#FFFEF0', percentage: 15, confidence: 70 }
      ],
      'manchester': [
        { name: 'Red Brick', hexColor: '#A0522D', percentage: 55, confidence: 90 },
        { name: 'Terracotta', hexColor: '#CD5C5C', percentage: 15, confidence: 75 },
        { name: 'Cast Iron', hexColor: '#414141', percentage: 10, confidence: 70 },
        { name: 'Slate', hexColor: '#2F4F4F', percentage: 20, confidence: 85 }
      ],
      'cotswolds': [
        { name: 'Cotswold Stone', hexColor: '#F4E4BC', percentage: 70, confidence: 95 },
        { name: 'Stone Slate', hexColor: '#C19A6B', percentage: 25, confidence: 90 },
        { name: 'Timber', hexColor: '#8B4513', percentage: 5, confidence: 70 }
      ],
      'default': [
        { name: 'Brick', hexColor: '#B8604E', percentage: 50, confidence: 70 },
        { name: 'Render', hexColor: '#F5F5F5', percentage: 30, confidence: 65 },
        { name: 'Slate', hexColor: '#404040', percentage: 20, confidence: 75 }
      ]
    };

    // Get materials for region
    let materials = regionalMaterials[regionKey] || regionalMaterials['default'];

    // Adjust for street type (high streets have more variety)
    if (streetName && (streetName.includes('High Street') || streetName.includes('Market'))) {
      materials = materials.map(m => ({
        ...m,
        confidence: Math.max(60, m.confidence - 10) // Lower confidence due to variety
      }));

      // Add commercial materials
      materials.push(
        { name: 'Large Format Glass', hexColor: '#87CEEB', percentage: 15, confidence: 70 },
        { name: 'Metal Shopfront', hexColor: '#C0C0C0', percentage: 10, confidence: 75 }
      );
    }

    return materials;
  },

  /**
   * Analyze architectural consistency in the area
   */
  analyzeAreaConsistency(materials) {
    if (!materials || materials.length === 0) return 'unknown';

    // Calculate consistency based on material dominance
    const totalPercentage = materials.reduce((sum, m) => sum + m.percentage, 0);
    const dominantMaterial = materials.find(m => m.percentage > 40);

    if (dominantMaterial) {
      return {
        rating: 'high',
        score: 85,
        description: `Area shows consistent use of ${dominantMaterial.name}`,
        recommendation: 'Consider using similar materials for contextual harmony'
      };
    } else if (materials.length <= 3) {
      return {
        rating: 'medium',
        score: 65,
        description: 'Area has moderate material variety',
        recommendation: 'Balance between matching local character and introducing subtle variations'
      };
    } else {
      return {
        rating: 'low',
        score: 40,
        description: 'Area shows diverse material palette',
        recommendation: 'More flexibility in material choices while respecting general character'
      };
    }
  },

  /**
   * Identify dominant architectural style from materials
   */
  identifyDominantStyle(materials) {
    const materialNames = materials.map(m => m.name.toLowerCase());

    if (materialNames.some(m => m.includes('cotswold')) ||
        materialNames.some(m => m.includes('yorkshire sandstone'))) {
      return 'Traditional English Vernacular';
    }
    if (materialNames.some(m => m.includes('london stock'))) {
      return 'Georgian/Victorian London';
    }
    if (materialNames.filter(m => m.includes('brick')).length > 1) {
      return 'British Industrial Heritage';
    }
    if (materialNames.some(m => m.includes('glass')) &&
        materialNames.some(m => m.includes('metal'))) {
      return 'Contemporary Commercial';
    }
    return 'Mixed Contemporary';
  },

  /**
   * Extract color palette from area materials
   */
  extractAreaColorPalette(materials) {
    return materials
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5)
      .map(m => ({
        color: m.name,
        hex: m.hexColor,
        usage: `${m.percentage}%`,
        confidence: m.confidence
      }));
  },

  /**
   * Get enhanced material recommendations with climate and context
   */
  async getEnhancedMaterialRecommendations(context) {
    const { location, climate, surroundingMaterials, localStyles, projectType } = context;

    try {
      // Use materialDetectionService for comprehensive recommendations
      const recommendations = await materialDetectionService.recommendMaterials({
        location,
        climate,
        projectType,
        budget: 'medium',
        sustainabilityTarget: 'high',
        portfolioMaterials: [],
        siteConstraints: []
      });

      // Assess compatibility with surrounding materials
      const compatibility = this.assessMaterialCompatibility(
        recommendations.primary,
        surroundingMaterials
      );

      // Blend recommendations with local context
      const contextualMaterials = this.blendWithLocalContext(
        recommendations,
        surroundingMaterials,
        localStyles
      );

      return {
        recommended: contextualMaterials,
        compatibility,
        climateScore: this.calculateClimateScore(contextualMaterials, climate),
        sustainabilityScore: this.calculateSustainabilityScore(contextualMaterials),
        localAvailability: this.checkLocalAvailability(contextualMaterials)
      };
    } catch (error) {
      logger.warn('Material recommendation fallback:', error);
      return {
        recommended: localStyles || ['Brick', 'Stone', 'Timber'],
        compatibility: { score: 70, rating: 'Good' },
        climateScore: 75,
        sustainabilityScore: 60
      };
    }
  },

  /**
   * Assess compatibility between recommended and surrounding materials
   */
  assessMaterialCompatibility(recommended, surrounding) {
    if (!recommended || !surrounding) return { score: 50, rating: 'Unknown' };

    let compatibilityScore = 0;
    let matches = 0;

    recommended.forEach(recMat => {
      const similar = surrounding.find(surMat =>
        this.areMaterialsSimilar(recMat.name, surMat.name) ||
        this.areColorsSimilar(recMat.hexColors?.[0], surMat.hexColor)
      );
      if (similar) {
        compatibilityScore += similar.confidence;
        matches++;
      }
    });

    const score = matches > 0 ? Math.round(compatibilityScore / matches) : 50;

    return {
      score,
      rating: score > 80 ? 'Excellent' : score > 60 ? 'Good' : score > 40 ? 'Fair' : 'Poor',
      matches,
      recommendation: this.getCompatibilityRecommendation(score)
    };
  },

  /**
   * Check if materials are similar
   */
  areMaterialsSimilar(mat1, mat2) {
    if (!mat1 || !mat2) return false;
    const m1 = mat1.toLowerCase();
    const m2 = mat2.toLowerCase();

    // Direct match
    if (m1 === m2) return true;

    // Category match
    const categories = {
      brick: ['brick', 'clay', 'masonry'],
      stone: ['stone', 'granite', 'limestone', 'sandstone', 'marble'],
      timber: ['timber', 'wood', 'cedar', 'oak'],
      metal: ['metal', 'steel', 'aluminum', 'iron', 'copper'],
      glass: ['glass', 'glazing', 'curtain wall']
    };

    for (const [category, terms] of Object.entries(categories)) {
      if (terms.some(t => m1.includes(t)) && terms.some(t => m2.includes(t))) {
        return true;
      }
    }
    return false;
  },

  /**
   * Check if colors are similar
   */
  areColorsSimilar(hex1, hex2, threshold = 50) {
    if (!hex1 || !hex2) return false;

    // Convert hex to RGB
    const rgb1 = this.hexToRgb(hex1);
    const rgb2 = this.hexToRgb(hex2);

    if (!rgb1 || !rgb2) return false;

    // Calculate color distance
    const distance = Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
    );

    return distance < threshold;
  },

  /**
   * Convert hex to RGB
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  },

  /**
   * Get compatibility recommendation
   */
  getCompatibilityRecommendation(score) {
    if (score > 80) {
      return 'Excellent material harmony with surrounding architecture';
    } else if (score > 60) {
      return 'Good contextual fit with minor adaptations recommended';
    } else if (score > 40) {
      return 'Consider incorporating more local materials for better integration';
    } else {
      return 'Significant material contrast - ensure deliberate design intent';
    }
  },

  /**
   * Blend recommended materials with local context
   */
  blendWithLocalContext(recommendations, surrounding, localStyles) {
    const blended = [];

    // Add primary recommendations
    if (recommendations.primary) {
      recommendations.primary.forEach(mat => blended.push({
        ...mat,
        source: 'climate-optimized',
        priority: 1
      }));
    }

    // Add compatible surrounding materials
    surrounding
      .filter(s => s.confidence > 70)
      .slice(0, 2)
      .forEach(mat => {
        if (!blended.find(b => this.areMaterialsSimilar(b.name, mat.name))) {
          blended.push({
            name: mat.name,
            hexColors: [mat.hexColor],
            source: 'local-context',
            priority: 2
          });
        }
      });

    // Add local style materials if not already included
    if (localStyles) {
      localStyles.slice(0, 2).forEach(style => {
        if (!blended.find(b => this.areMaterialsSimilar(b.name, style))) {
          blended.push({
            name: style,
            source: 'traditional',
            priority: 3
          });
        }
      });
    }

    return blended.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  },

  /**
   * Calculate climate score for materials
   */
  calculateClimateScore(materials, climate) {
    if (!materials || materials.length === 0) return 50;

    const scores = materials.map(mat => {
      const materialKey = mat.name.toLowerCase().replace(/ /g, '_');
      return materialDetectionService.calculateClimateCompatibility(materialKey, climate);
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100);
  },

  /**
   * Calculate sustainability score for materials
   */
  calculateSustainabilityScore(materials) {
    if (!materials || materials.length === 0) return 50;

    const scores = materials.map(mat => {
      const materialKey = mat.name.toLowerCase().replace(/ /g, '_');
      return materialDetectionService.getSustainabilityScore(materialKey);
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  },

  /**
   * Check local availability of materials
   */
  checkLocalAvailability(materials) {
    return materials.map(mat => ({
      material: mat.name,
      availability: mat.source === 'local-context' ? 'High' : 'Medium',
      leadTime: mat.source === 'local-context' ? '1-2 weeks' : '2-4 weeks'
    }));
  },

  /**
   * Get region key from location data
   */
  getRegionKey(city, postcode, country) {
    if (country === 'United Kingdom') {
      if (city?.toLowerCase().includes('london')) return 'london';
      if (postcode?.startsWith('YO') || city?.toLowerCase().includes('york')) return 'yorkshire';
      if (city?.toLowerCase().includes('manchester')) return 'manchester';
      if (postcode?.startsWith('GL') || city?.toLowerCase().includes('cotswold')) return 'cotswolds';
    }
    return 'default';
  },

  /**
   * Get fallback materials when detection fails
   */
  getFallbackMaterials(locationData) {
    return {
      detected: [
        { name: 'Brick', hexColor: '#B8604E', percentage: 50, confidence: 60 },
        { name: 'Render', hexColor: '#F5F5F5', percentage: 30, confidence: 55 },
        { name: 'Slate', hexColor: '#404040', percentage: 20, confidence: 65 }
      ],
      availability: {
        high: ['brick', 'concrete'],
        medium: ['stone', 'timber'],
        low: []
      },
      areaConsistency: {
        rating: 'medium',
        score: 60,
        description: 'Standard material variety'
      },
      dominantStyle: 'Contemporary Mixed',
      colorPalette: [
        { color: 'Brick Red', hex: '#B8604E', usage: '50%', confidence: 60 },
        { color: 'Light Grey', hex: '#F5F5F5', usage: '30%', confidence: 55 }
      ]
    };
  },

  analyzeZoning(addressComponents, placeTypes, coordinates) {
    const country = addressComponents.find(c => c.types.includes('country'))?.long_name || '';
    const city = addressComponents.find(c => c.types.includes('locality'))?.long_name || '';
    const neighborhood = addressComponents.find(c => c.types.includes('neighborhood'))?.long_name || '';
    const route = addressComponents.find(c => c.types.includes('route'))?.long_name || '';
    const postalCode = addressComponents.find(c => c.types.includes('postal_code'))?.long_name || '';

    // For UK postcodes specifically
    if (country === 'United Kingdom') {
      return this.getUKZoning(postalCode, city, neighborhood, route);
    }

    // For US addresses
    if (country === 'United States') {
      return this.getUSZoning(city, neighborhood, route, addressComponents);
    }

    // For other countries
    return this.getInternationalZoning(country, city, neighborhood, route);
  },

  getUKZoning(postcode, city, neighborhood, route) {
    // UK postcode patterns for better zoning estimation
    const postcodePrefix = postcode.substring(0, 2).toUpperCase();

    // Major UK city centers
    const cityZoningMap = {
      'London': {
        'EC': { type: 'City of London Financial District', maxHeight: '200+ feet (60+ meters)', density: 'Very High' },
        'E1': { type: 'Tower Hamlets Mixed Use', maxHeight: '120-180 feet (35-55 meters)', density: 'High' },
        'W1': { type: 'Westminster Central Activities Zone', maxHeight: '100-150 feet (30-45 meters)', density: 'High' },
        'SW': { type: 'Mixed Residential/Commercial', maxHeight: '80-120 feet (25-35 meters)', density: 'Medium-High' }
      },
      'Manchester': {
        'M1': { type: 'City Centre Mixed Use', maxHeight: '120-150 feet (35-45 meters)', density: 'High' },
        'M2': { type: 'Business District', maxHeight: '150+ feet (45+ meters)', density: 'High' },
        'M3': { type: 'Mixed Commercial/Residential', maxHeight: '100-120 feet (30-35 meters)', density: 'Medium-High' }
      },
      'Birmingham': {
        'B1': { type: 'City Centre Business', maxHeight: '100-150 feet (30-45 meters)', density: 'High' },
        'B2': { type: 'Central Mixed Use', maxHeight: '80-120 feet (25-35 meters)', density: 'Medium-High' }
      }
    };

    // Check for specific postcode patterns
    if (postcodePrefix === 'DN') {
      // Doncaster area
      if (postcode.startsWith('DN1')) {
        return {
          type: 'Town Centre Mixed Use',
          maxHeight: '60-80 feet (18-24 meters)',
          density: 'Medium',
          setbacks: 'Front: 5-10ft, Sides: 5ft',
          note: 'Doncaster Metropolitan Borough Council planning zone',
          characteristics: 'Mixed retail/commercial with residential above',
          materials: 'Brick, Stone, Modern cladding permitted'
        };
      } else if (postcode.startsWith('DN4')) {
        // Bentley/Arksey area (more suburban)
        return {
          type: 'Suburban Residential',
          maxHeight: '35-40 feet (10-12 meters)',
          density: 'Low-Medium',
          setbacks: 'Front: 15-20ft, Sides: 10ft',
          note: 'Primarily residential area with local services',
          characteristics: 'Detached and semi-detached housing prevalent',
          materials: 'Traditional brick, Render, Slate/tile roofing'
        };
      }
    }

    // Check if it's in a mapped city
    for (const [cityName, zones] of Object.entries(cityZoningMap)) {
      if (city?.includes(cityName)) {
        for (const [prefix, zoneData] of Object.entries(zones)) {
          if (postcodePrefix === prefix) {
            return {
              ...zoneData,
              setbacks: zoneData.density === 'Very High' ? 'None' : 'Front: 10ft, Sides: 5-10ft',
              note: `${cityName} planning authority zone`,
              characteristics: this.getCharacteristics(zoneData.type),
              materials: this.getMaterials(zoneData.type)
            };
          }
        }
      }
    }

    // Default UK zoning based on route/street type
    if (route) {
      if (route.includes('High Street') || route.includes('Market')) {
        return {
          type: 'Local Centre Commercial',
          maxHeight: '45-60 feet (14-18 meters)',
          density: 'Medium',
          setbacks: 'Minimal street frontage',
          note: 'Traditional high street setting',
          characteristics: 'Ground floor retail with residential above',
          materials: 'Traditional materials to match local character'
        };
      }
    }

    // Generic UK suburban
    return {
      type: 'Suburban Residential',
      maxHeight: '35-40 feet (10-12 meters)',
      density: 'Low-Medium',
      setbacks: 'Front: 15-20ft, Sides: 10ft',
      note: 'Standard UK residential planning zone',
      characteristics: 'Standard construction practices',
      materials: 'Locally Sourced Brick, Timber, Glass'
    };
  },

  getUSZoning(city, neighborhood, route, addressComponents) {
    const state = addressComponents.find(c => c.types.includes('administrative_area_level_1'))?.short_name || '';

    // US zoning patterns
    if (route) {
      if (route.includes('Broadway') || route.includes('Main Street')) {
        return {
          type: 'C-2 General Commercial',
          maxHeight: '65-85 feet',
          density: 'Medium-High',
          setbacks: 'Front: 0-10ft, Sides: 5ft',
          note: 'Commercial corridor zoning',
          characteristics: 'Mixed commercial uses permitted',
          materials: 'Steel, Glass, Concrete, Brick'
        };
      }
    }

    if (neighborhood) {
      if (neighborhood.toLowerCase().includes('downtown')) {
        return {
          type: 'CBD - Central Business District',
          maxHeight: '120+ feet',
          density: 'Very High',
          setbacks: 'None required',
          note: 'Downtown commercial zone',
          characteristics: 'High-rise development allowed',
          materials: 'Modern commercial materials'
        };
      }
    }

    // State-specific defaults
    const stateZoning = {
      'CA': { type: 'R-3 Medium Density', maxHeight: '45 feet', density: 'Medium' },
      'NY': { type: 'R-6 General Residence', maxHeight: '60 feet', density: 'Medium-High' },
      'TX': { type: 'MF-3 Multifamily', maxHeight: '40 feet', density: 'Medium' },
      'FL': { type: 'RM-15 Residential', maxHeight: '35 feet', density: 'Medium' }
    };

    return stateZoning[state] || {
      type: 'R-2 Low Density Residential',
      maxHeight: '35 feet',
      density: 'Low',
      setbacks: 'Front: 20ft, Sides: 10ft',
      note: 'Standard US residential zone',
      characteristics: 'Single family residential',
      materials: 'Wood frame, Vinyl/Fiber cement siding'
    };
  },

  getInternationalZoning(country, city, neighborhood, route) {
    // Generic international zoning
    return {
      type: 'Mixed-Use Urban',
      maxHeight: '45-60 feet (14-18 meters)',
      density: 'Medium',
      setbacks: 'Front: 10ft, Sides: 5ft',
      note: `Consult ${city || country} local planning authorities`,
      characteristics: 'Standard construction practices',
      materials: 'Locally Sourced Materials, Concrete, Steel'
    };
  },

  getCharacteristics(zoneType) {
    const characteristics = {
      'City of London Financial District': 'High-rise offices, Banks, Financial services, Ground floor retail',
      'Town Centre Mixed Use': 'Retail ground floor, Office/residential upper floors, Public spaces',
      'Suburban Residential': 'Family homes, Gardens, Local amenities, Schools nearby',
      'Local Centre Commercial': 'Shops, Cafes, Services, Community facilities'
    };

    return characteristics[zoneType] || 'Standard construction practices, Energy efficiency considerations';
  },

  getMaterials(zoneType) {
    const materials = {
      'City of London Financial District': 'Glass curtain wall, Steel frame, Stone cladding, Modern composites',
      'Town Centre Mixed Use': 'Brick, Stone, Glass shopfronts, Traditional with modern elements',
      'Suburban Residential': 'Brick, Render, Timber, Slate/tile roofing',
      'Local Centre Commercial': 'Traditional brick, Large glazing for shops, Signage zones'
    };

    return materials[zoneType] || 'Locally sourced materials, Sustainable options';
  },

  analyzeMarket(addressComponents, coordinates, zoning) {
    const country = addressComponents.find(c => c.types.includes('country'))?.long_name || '';
    const city = addressComponents.find(c => c.types.includes('locality'))?.long_name || '';
    const state = addressComponents.find(c => c.types.includes('administrative_area_level_1'))?.long_name || '';

    // Get country economic data
    const countryData = this.getCountryEconomicData(country);
    const citySize = this.estimateCitySize(city);

    // Base construction costs by country and city size
    let constructionCost = this.calculateConstructionCost(countryData, citySize, zoning.density);
    let demand = this.calculateDemand(citySize, zoning.density);
    let roi = this.calculateROI(countryData, citySize, demand);

    return {
      avgConstructionCost: constructionCost,
      demandIndex: demand,
      roi: roi,
      marketTrend: this.determineMarketTrend(citySize, countryData),
      investmentGrade: this.calculateInvestmentGrade(demand, roi),
      currency: countryData.currency,
      location: `${city || state || country} Market`
    };
  },

  estimateCitySize(city, population, isUrban) {
    // Use population if available, otherwise estimate from city name recognition
    if (population) {
      if (population > 5000000) return 'mega';
      if (population > 1000000) return 'large';
      if (population > 100000) return 'medium';
      return 'small';
    }

    // Fallback: check against known major cities database
    const megaCities = ['London', 'New York', 'Tokyo', 'Paris', 'Shanghai', 'Mumbai', 'São Paulo'];
    const largeCities = ['Manchester', 'Chicago', 'Berlin', 'Sydney', 'Toronto', 'Madrid'];

    if (megaCities.some(mc => city?.includes(mc))) return 'mega';
    if (largeCities.some(lc => city?.includes(lc))) return 'large';
    if (isUrban) return 'medium';
    return 'small';
  },

  getCountryEconomicData(country) {
    const economicData = {
      'United States': { gdpPerCapita: 70000, currency: '$', multiplier: 1.0, symbol: 'USD' },
      'United Kingdom': { gdpPerCapita: 45000, currency: '£', multiplier: 0.8, symbol: 'GBP' },
      'Canada': { gdpPerCapita: 52000, currency: 'C$', multiplier: 0.75, symbol: 'CAD' },
      'Australia': { gdpPerCapita: 60000, currency: 'A$', multiplier: 0.7, symbol: 'AUD' },
      'Germany': { gdpPerCapita: 50000, currency: '€', multiplier: 0.9, symbol: 'EUR' },
      'France': { gdpPerCapita: 45000, currency: '€', multiplier: 0.85, symbol: 'EUR' },
      'Japan': { gdpPerCapita: 40000, currency: '¥', multiplier: 110, symbol: 'JPY' },
      'India': { gdpPerCapita: 2500, currency: '₹', multiplier: 0.012, symbol: 'INR' },
      'Brazil': { gdpPerCapita: 9000, currency: 'R$', multiplier: 0.2, symbol: 'BRL' },
      'South Africa': { gdpPerCapita: 7000, currency: 'R', multiplier: 0.055, symbol: 'ZAR' },
      'default': { gdpPerCapita: 12000, currency: '$', multiplier: 0.3, symbol: 'USD' }
    };

    return economicData[country] || economicData.default;
  },

  calculateConstructionCost(countryData, citySize, density) {
    // Base cost in USD per sqft
    const baseCosts = {
      'mega': { min: 400, max: 700 },
      'large': { min: 300, max: 500 },
      'medium': { min: 200, max: 350 },
      'small': { min: 150, max: 250 }
    };

    const costs = baseCosts[citySize] || baseCosts.small;

    // Adjust for country economics
    const adjustedMin = Math.round(costs.min * countryData.multiplier);
    const adjustedMax = Math.round(costs.max * countryData.multiplier);

    // Convert to per square meter for metric countries
    const useMetric = ['United Kingdom', 'Germany', 'France', 'Australia'].includes(countryData.symbol);
    if (useMetric) {
      return `${countryData.currency}${adjustedMin * 10.764}-${adjustedMax * 10.764}/sqm`;
    }

    return `${countryData.currency}${adjustedMin}-${adjustedMax}/sqft`;
  },

  calculateDemand(citySize, density) {
    const demandMatrix = {
      'mega': { 'Very High': 9.5, 'High': 9.0, 'Medium': 8.5, 'Low': 7.5 },
      'large': { 'Very High': 8.8, 'High': 8.2, 'Medium': 7.5, 'Low': 6.8 },
      'medium': { 'Very High': 7.5, 'High': 7.0, 'Medium': 6.5, 'Low': 6.0 },
      'small': { 'Very High': 6.5, 'High': 6.0, 'Medium': 5.5, 'Low': 5.0 }
    };

    const score = demandMatrix[citySize]?.[density] || 6.0;
    const labels = {
      9.5: 'Very High',
      9.0: 'Very High',
      8.8: 'High',
      8.5: 'High',
      8.2: 'High',
      8.0: 'High',
      7.5: 'Moderate-High',
      7.0: 'Moderate',
      6.5: 'Moderate',
      6.0: 'Moderate',
      5.5: 'Low-Moderate',
      5.0: 'Low'
    };

    return `${labels[score] || 'Moderate'} (${score}/10)`;
  },

  calculateROI(countryData, citySize, demandScore) {
    // Extract numeric score from demand
    const score = parseFloat(demandScore.match(/\((\d+\.?\d*)/)?.[1] || 6);

    // Base ROI calculation
    const baseROI = score * 1.8; // Simplified: higher demand = higher ROI

    // Adjust for country risk/opportunity
    const countryAdjustment = (countryData.gdpPerCapita / 50000); // Normalize around developed economy
    const adjustedROI = baseROI * Math.max(0.7, Math.min(1.3, countryAdjustment));

    const min = Math.round(adjustedROI - 2);
    const max = Math.round(adjustedROI + 2);

    return `${min}-${max}% annually`;
  },

  calculateInvestmentGrade(demand, roi) {
    const demandScore = parseFloat(demand.match(/\((\d+\.?\d*)/)?.[1] || 6);
    const roiMin = parseInt(roi.match(/(\d+)/)?.[1] || 8);

    const score = (demandScore / 2) + (roiMin / 4);

    if (score >= 7) return 5;
    if (score >= 6) return 4;
    if (score >= 5) return 3;
    if (score >= 4) return 2;
    return 1;
  },

  determineMarketTrend(citySize, countryData) {
    if (citySize === 'mega') return 'Stable High Demand';
    if (citySize === 'large' && countryData.gdpPerCapita > 30000) return 'Growing';
    if (citySize === 'medium') return 'Emerging';
    return 'Developing';
  },

  getCountrySpecificNote(country) {
    const notes = {
      'United States': 'Verify with local city planning department',
      'United Kingdom': 'Check with Local Planning Authority',
      'Canada': 'Consult provincial and municipal regulations',
      'Australia': 'Review state and local council requirements',
      'Germany': 'Confirm with Bauamt (building authority)',
      'France': "Verify with local Plan Local d'Urbanisme",
      'default': 'Consult local planning authorities for specific regulations'
    };

    return notes[country] || notes.default;
  },

  getClimateDesignRules(climateType, context = {}) {
    return buildClimateDesignRules(climateType, context);
  }
};
