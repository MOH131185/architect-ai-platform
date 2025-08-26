// src/services/locationIntelligence.js

export const locationIntelligence = {
  analyzeZoning(addressComponents, placeTypes, population) {
    const country = addressComponents.find(c => c.types.includes('country'))?.long_name || '';
    const city = addressComponents.find(c => c.types.includes('locality'))?.long_name || '';
    const isUrban = placeTypes?.some(t => t.includes('locality') || t.includes('city'));
    const isDowntown = addressComponents.some(c =>
      c.long_name.toLowerCase().includes('centre') ||
      c.long_name.toLowerCase().includes('downtown') ||
      c.long_name.toLowerCase().includes('central')
    );

    // Estimate city size based on available data
    const citySize = this.estimateCitySize(city, population, isUrban);

    // Universal zoning patterns
    let zoning = {
      type: '',
      maxHeight: '',
      density: '',
      setbacks: ''
    };

    if (citySize === 'mega') {
      zoning = {
        type: isDowntown ? 'High-Density Commercial/Mixed-Use' : 'Urban Residential/Commercial',
        maxHeight: isDowntown ? '150+ feet (45+ meters)' : '80-120 feet (25-35 meters)',
        density: 'Very High',
        setbacks: 'Minimal to None'
      };
    } else if (citySize === 'large') {
      zoning = {
        type: isDowntown ? 'Central Business District' : 'Mixed-Use Urban',
        maxHeight: isDowntown ? '100-150 feet (30-45 meters)' : '60-80 feet (18-25 meters)',
        density: 'High',
        setbacks: 'Front: 5-10ft, Sides: 5ft'
      };
    } else if (citySize === 'medium') {
      zoning = {
        type: isDowntown ? 'Town Centre Commercial' : 'Medium Density Mixed',
        maxHeight: '40-60 feet (12-18 meters)',
        density: 'Medium',
        setbacks: 'Front: 10ft, Sides: 5-10ft'
      };
    } else {
      zoning = {
        type: 'Suburban/Rural Residential',
        maxHeight: '35-40 feet (10-12 meters)',
        density: 'Low',
        setbacks: 'Front: 20ft, Sides: 10ft'
      };
    }

    // Add country-specific notes
    zoning.note = this.getCountrySpecificNote(country);

    return zoning;
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
