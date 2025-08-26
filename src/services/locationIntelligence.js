// src/services/locationIntelligence.js
import { architecturalStyleService } from '../data/globalArchitecturalDatabase';

export const locationIntelligence = {
  recommendArchitecturalStyle(location, climate) {
    const components = location.address_components;
    const country = components.find(c => c.types.includes('country'))?.long_name || '';
    const state = components.find(c => c.types.includes('administrative_area_level_1'))?.long_name || '';
    const city = components.find(c => c.types.includes('locality') || c.types.includes('postal_town'))?.long_name || '';
    const postcode = components.find(c => c.types.includes('postal_code'))?.long_name || '';

    // Get location-specific styles from database
    const locationStyles = architecturalStyleService.getStylesByLocation(country, state, city, postcode);

    // Get climate adaptations
    const climateFeatures = architecturalStyleService.getClimateAdaptations(climate.type);

    // Get local regulations
    const regulations = architecturalStyleService.getRegulations(country);

    // Combine all data
    return {
      primary: locationStyles.styles?.contemporary[0] || 'Contemporary Local',
      alternatives: locationStyles.styles?.contemporary.slice(1) || [],
      historical: locationStyles.styles?.historical || [],
      vernacular: locationStyles.styles?.vernacular || [],
      materials: locationStyles.materials || [],
      characteristics: [...(locationStyles.characteristics || []), ...(climateFeatures.features || [])],
      regulations: regulations,
      climateAdaptations: climateFeatures
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
  }
};
