/**
 * Enhanced Location and Climate Analysis Service
 * Implements comprehensive location analysis with Google Maps Geocoding and OpenWeather One-Call API
 */

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const OPENWEATHER_API_KEY = process.env.REACT_APP_OPENWEATHER_API_KEY;

class EnhancedLocationService {
  /**
   * Complete location and climate analysis workflow
   * @param {string} addressOrCoords - Full address string or "lat,lng"
   * @returns {Promise<Object>} Complete location and climate analysis
   */
  async analyzeLocation(addressOrCoords) {
    try {
      console.log('Starting enhanced location and climate analysis...');

      // Step 1.1: Geocoding to get structured address and coordinates
      const geocodeResult = await this.geocodeAddress(addressOrCoords);

      // Step 1.2: Fetch seasonal climate data using OpenWeather One-Call API
      const climateData = await this.fetchSeasonalClimate(
        geocodeResult.coordinates.lat,
        geocodeResult.coordinates.lng
      );

      // Step 1.3: Calculate sun path and optimal solar orientation
      const solarAnalysis = this.calculateSunPathAndOrientation(
        geocodeResult.coordinates.lat,
        geocodeResult.coordinates.lng,
        climateData
      );

      // Combine all analysis
      return {
        success: true,
        location: geocodeResult,
        climate: climateData,
        solar: solarAnalysis,
        recommendations: this.generateLocationRecommendations(
          geocodeResult,
          climateData,
          solarAnalysis
        ),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Enhanced location analysis error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackAnalysis(addressOrCoords)
      };
    }
  }

  /**
   * Step 1.1: Geocode address using Google Maps Geocoding API
   */
  async geocodeAddress(addressOrCoords) {
    try {
      let url;

      // Check if input is coordinates (lat,lng format)
      const coordsPattern = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
      if (coordsPattern.test(addressOrCoords)) {
        // Reverse geocoding
        const [lat, lng] = addressOrCoords.split(',').map(s => parseFloat(s.trim()));
        url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
      } else {
        // Forward geocoding
        url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressOrCoords)}&key=${GOOGLE_MAPS_API_KEY}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        throw new Error(`Geocoding failed: ${data.status} - ${data.error_message || 'No results'}`);
      }

      const result = data.results[0];

      // Extract structured address components
      const addressComponents = this.parseAddressComponents(result.address_components);

      return {
        formattedAddress: result.formatted_address,
        coordinates: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng
        },
        addressComponents,
        placeTypes: result.types || [],
        viewport: result.geometry.viewport,
        placeId: result.place_id
      };

    } catch (error) {
      console.error('Geocoding error:', error);
      throw new Error(`Geocoding failed: ${error.message}`);
    }
  }

  /**
   * Parse Google Maps address components into structured format
   */
  parseAddressComponents(components) {
    const parsed = {
      streetNumber: '',
      route: '',
      neighborhood: '',
      locality: '',
      adminAreaLevel1: '',
      adminAreaLevel2: '',
      country: '',
      countryCode: '',
      postalCode: '',
      raw: components
    };

    components.forEach(component => {
      const types = component.types;

      if (types.includes('street_number')) {
        parsed.streetNumber = component.long_name;
      }
      if (types.includes('route')) {
        parsed.route = component.long_name;
      }
      if (types.includes('neighborhood') || types.includes('sublocality')) {
        parsed.neighborhood = component.long_name;
      }
      if (types.includes('locality') || types.includes('postal_town')) {
        parsed.locality = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        parsed.adminAreaLevel1 = component.long_name;
        parsed.adminAreaLevel1Short = component.short_name;
      }
      if (types.includes('administrative_area_level_2')) {
        parsed.adminAreaLevel2 = component.long_name;
      }
      if (types.includes('country')) {
        parsed.country = component.long_name;
        parsed.countryCode = component.short_name;
      }
      if (types.includes('postal_code')) {
        parsed.postalCode = component.long_name;
      }
    });

    return parsed;
  }

  /**
   * Step 1.2: Fetch seasonal climate data using OpenWeather One-Call API
   */
  async fetchSeasonalClimate(lat, lng) {
    try {
      // OpenWeather One-Call API 3.0 endpoint
      const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&exclude=minutely,hourly,alerts&units=metric&appid=${OPENWEATHER_API_KEY}`;

      const response = await fetch(url);

      if (!response.ok) {
        // Fallback to 2.5 API if 3.0 fails
        return await this.fetchSeasonalClimateFallback(lat, lng);
      }

      const data = await response.json();

      // Extract current and forecast data
      const current = data.current;
      const daily = data.daily || [];

      // Calculate seasonal averages (approximate from daily forecast)
      const seasonal = this.calculateSeasonalAverages(daily, lat);

      // Classify climate type based on temperature and precipitation
      const climateClassification = this.classifyClimate(seasonal, lat);

      return {
        current: {
          temperature: current.temp,
          feelsLike: current.feels_like,
          humidity: current.humidity,
          pressure: current.pressure,
          windSpeed: current.wind_speed,
          weather: current.weather[0]?.description || 'Unknown',
          timestamp: new Date(current.dt * 1000).toISOString()
        },
        seasonal,
        classification: climateClassification,
        location: { lat, lng },
        source: 'openweather-onecall-3.0'
      };

    } catch (error) {
      console.error('OpenWeather One-Call API error:', error);
      return await this.fetchSeasonalClimateFallback(lat, lng);
    }
  }

  /**
   * Fallback to OpenWeather 2.5 Current Weather API
   */
  async fetchSeasonalClimateFallback(lat, lng) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${OPENWEATHER_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`OpenWeather API error: ${data.message}`);
      }

      // Use current data and approximate seasonal patterns
      const seasonal = this.approximateSeasonalData(data.main, lat);
      const climateClassification = this.classifyClimate(seasonal, lat);

      return {
        current: {
          temperature: data.main.temp,
          feelsLike: data.main.feels_like,
          humidity: data.main.humidity,
          pressure: data.main.pressure,
          windSpeed: data.wind?.speed || 0,
          weather: data.weather[0]?.description || 'Unknown',
          timestamp: new Date().toISOString()
        },
        seasonal,
        classification: climateClassification,
        location: { lat, lng },
        source: 'openweather-2.5-current',
        note: 'Seasonal data approximated from current conditions'
      };

    } catch (error) {
      console.error('OpenWeather fallback error:', error);
      throw new Error(`Climate data fetch failed: ${error.message}`);
    }
  }

  /**
   * Calculate seasonal averages from daily forecast data
   */
  calculateSeasonalAverages(dailyData, lat) {
    // Determine hemisphere
    const hemisphere = lat >= 0 ? 'northern' : 'southern';

    // Define season months (northern hemisphere)
    const seasonMonths = {
      winter: hemisphere === 'northern' ? [12, 1, 2] : [6, 7, 8],
      spring: hemisphere === 'northern' ? [3, 4, 5] : [9, 10, 11],
      summer: hemisphere === 'northern' ? [6, 7, 8] : [12, 1, 2],
      fall: hemisphere === 'northern' ? [9, 10, 11] : [3, 4, 5]
    };

    // For now, use daily forecast to estimate (limited to 7-8 days)
    // In production, you'd want historical data or longer forecasts
    const currentMonth = new Date().getMonth() + 1;

    const seasons = {
      winter: { avgTemp: null, avgPrecip: null, avgHumidity: null },
      spring: { avgTemp: null, avgPrecip: null, avgHumidity: null },
      summer: { avgTemp: null, avgPrecip: null, avgHumidity: null },
      fall: { avgTemp: null, avgPrecip: null, avgHumidity: null }
    };

    // Approximate using current month's data
    let currentSeason = 'spring';
    for (const [season, months] of Object.entries(seasonMonths)) {
      if (months.includes(currentMonth)) {
        currentSeason = season;
        break;
      }
    }

    if (dailyData.length > 0) {
      const temps = dailyData.map(d => (d.temp.day + d.temp.night) / 2);
      const precips = dailyData.map(d => d.rain || d.snow || 0);
      const humidities = dailyData.map(d => d.humidity);

      seasons[currentSeason] = {
        avgTemp: (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1),
        avgPrecip: (precips.reduce((a, b) => a + b, 0) / precips.length).toFixed(1),
        avgHumidity: Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length),
        daysInForecast: dailyData.length,
        note: 'Based on current forecast data'
      };
    }

    return seasons;
  }

  /**
   * Approximate seasonal data from current conditions (fallback)
   */
  approximateSeasonalData(currentMain, lat) {
    const hemisphere = lat >= 0 ? 'northern' : 'southern';
    const currentMonth = new Date().getMonth() + 1;

    // Simple approximation based on hemisphere and current temp
    const baseTemp = currentMain.temp;
    const baseHumidity = currentMain.humidity;

    // Rough seasonal variation (±10°C from current)
    const seasons = {
      winter: {
        avgTemp: (baseTemp - 10).toFixed(1),
        avgPrecip: '50',
        avgHumidity: baseHumidity + 5,
        note: 'Approximated from current conditions'
      },
      spring: {
        avgTemp: (baseTemp - 5).toFixed(1),
        avgPrecip: '60',
        avgHumidity: baseHumidity,
        note: 'Approximated from current conditions'
      },
      summer: {
        avgTemp: (baseTemp + 10).toFixed(1),
        avgPrecip: '40',
        avgHumidity: baseHumidity - 5,
        note: 'Approximated from current conditions'
      },
      fall: {
        avgTemp: (baseTemp + 5).toFixed(1),
        avgPrecip: '55',
        avgHumidity: baseHumidity,
        note: 'Approximated from current conditions'
      }
    };

    return seasons;
  }

  /**
   * Classify climate type based on temperature and precipitation thresholds
   * Uses Köppen climate classification simplified
   */
  classifyClimate(seasonal, lat) {
    // Extract seasonal temperatures
    const temps = Object.values(seasonal)
      .map(s => parseFloat(s.avgTemp))
      .filter(t => !isNaN(t));

    if (temps.length === 0) {
      return {
        type: 'Temperate',
        subtype: 'Unknown',
        description: 'Insufficient data for classification',
        koppen: 'C'
      };
    }

    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);

    // Köppen classification thresholds
    let type, subtype, koppen;

    // Tropical (A): All months > 18°C
    if (minTemp > 18) {
      type = 'Tropical';
      subtype = avgTemp > 25 ? 'Tropical rainforest' : 'Tropical savanna';
      koppen = avgTemp > 25 ? 'Af' : 'Aw';
    }
    // Arid (B): Low precipitation
    else if (avgTemp > 18 && minTemp < 18) {
      const avgPrecip = Object.values(seasonal)
        .map(s => parseFloat(s.avgPrecip))
        .filter(p => !isNaN(p))
        .reduce((a, b) => a + b, 0) / 4;

      if (avgPrecip < 30) {
        type = 'Arid';
        subtype = avgTemp > 25 ? 'Hot desert' : 'Cold desert';
        koppen = avgTemp > 25 ? 'BWh' : 'BWk';
      } else if (avgPrecip < 60) {
        type = 'Semi-arid';
        subtype = avgTemp > 20 ? 'Hot semi-arid' : 'Cold semi-arid';
        koppen = avgTemp > 20 ? 'BSh' : 'BSk';
      } else {
        type = 'Subtropical';
        subtype = 'Humid subtropical';
        koppen = 'Cfa';
      }
    }
    // Cold (D): Coldest month < -3°C, warmest > 10°C
    else if (minTemp < -3 && maxTemp > 10) {
      type = 'Continental';
      subtype = maxTemp > 22 ? 'Hot summer continental' : 'Warm summer continental';
      koppen = maxTemp > 22 ? 'Dfa' : 'Dfb';
    }
    // Polar (E): All months < 10°C
    else if (maxTemp < 10) {
      type = 'Polar';
      subtype = maxTemp > 0 ? 'Tundra' : 'Ice cap';
      koppen = maxTemp > 0 ? 'ET' : 'EF';
    }
    // Temperate (C): Default
    else {
      type = 'Temperate';
      const avgPrecip = Object.values(seasonal)
        .map(s => parseFloat(s.avgPrecip))
        .filter(p => !isNaN(p))
        .reduce((a, b) => a + b, 0) / 4;

      if (avgPrecip > 80) {
        subtype = 'Oceanic';
        koppen = 'Cfb';
      } else if (avgPrecip > 50) {
        subtype = 'Humid subtropical';
        koppen = 'Cfa';
      } else {
        subtype = 'Mediterranean';
        koppen = 'Csa';
      }
    }

    return {
      type,
      subtype,
      description: `${type} - ${subtype}`,
      koppen,
      averageTemperature: avgTemp.toFixed(1),
      temperatureRange: {
        min: minTemp.toFixed(1),
        max: maxTemp.toFixed(1),
        variation: (maxTemp - minTemp).toFixed(1)
      },
      hemisphere: lat >= 0 ? 'Northern' : 'Southern'
    };
  }

  /**
   * Step 1.3: Calculate sun path and optimal solar orientation
   */
  calculateSunPathAndOrientation(lat, lng, climateData) {
    const hemisphere = lat >= 0 ? 'northern' : 'southern';

    // Calculate sunrise/sunset times for summer and winter
    const summerSolstice = this.calculateSunriseSunset(lat, lng, 172); // June 21 (day 172)
    const winterSolstice = this.calculateSunriseSunset(lat, lng, 355); // December 21 (day 355)

    // Calculate optimal orientation
    const optimalOrientation = this.determineOptimalOrientation(hemisphere, climateData);

    // Calculate energy savings potential
    const energySavings = this.calculateEnergySavings(optimalOrientation, climateData);

    return {
      hemisphere,
      sunPath: {
        summer: {
          sunrise: summerSolstice.sunrise,
          sunset: summerSolstice.sunset,
          daylightHours: summerSolstice.daylightHours,
          solarNoonAltitude: summerSolstice.solarNoonAltitude
        },
        winter: {
          sunrise: winterSolstice.sunrise,
          sunset: winterSolstice.sunset,
          daylightHours: winterSolstice.daylightHours,
          solarNoonAltitude: winterSolstice.solarNoonAltitude
        }
      },
      optimalOrientation,
      energySavings,
      climateAdaptations: this.getClimateAdaptations(climateData, optimalOrientation)
    };
  }

  /**
   * Calculate sunrise and sunset times for a given day of year
   */
  calculateSunriseSunset(lat, lng, dayOfYear) {
    // Solar declination angle
    const declination = 23.45 * Math.sin((360/365) * (dayOfYear - 81) * Math.PI / 180);

    // Hour angle at sunrise/sunset
    const latRad = lat * Math.PI / 180;
    const decRad = declination * Math.PI / 180;

    const cosHourAngle = -Math.tan(latRad) * Math.tan(decRad);

    // Check if sun rises/sets (doesn't in polar regions at solstices)
    if (cosHourAngle > 1) {
      // Polar night
      return {
        sunrise: null,
        sunset: null,
        daylightHours: 0,
        solarNoonAltitude: 90 - Math.abs(lat) + declination,
        note: 'Polar night - sun does not rise'
      };
    } else if (cosHourAngle < -1) {
      // Midnight sun
      return {
        sunrise: null,
        sunset: null,
        daylightHours: 24,
        solarNoonAltitude: 90 - Math.abs(lat) + declination,
        note: 'Midnight sun - sun does not set'
      };
    }

    const hourAngle = Math.acos(cosHourAngle) * 180 / Math.PI;

    // Solar noon is at 12:00 local solar time
    // Sunrise/sunset are ±hourAngle/15 hours from solar noon
    const sunriseHour = 12 - hourAngle / 15;
    const sunsetHour = 12 + hourAngle / 15;

    // Format as HH:MM
    const formatTime = (hours) => {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const daylightHours = 2 * hourAngle / 15;

    // Solar altitude at noon
    const solarNoonAltitude = 90 - Math.abs(lat - declination);

    return {
      sunrise: formatTime(sunriseHour),
      sunset: formatTime(sunsetHour),
      daylightHours: daylightHours.toFixed(1),
      solarNoonAltitude: solarNoonAltitude.toFixed(1)
    };
  }

  /**
   * Determine optimal solar orientation
   */
  determineOptimalOrientation(hemisphere, climateData) {
    // Primary orientation: south-facing in northern hemisphere, north-facing in southern
    const primaryDirection = hemisphere === 'northern' ? 'South' : 'North';
    const primaryAzimuth = hemisphere === 'northern' ? 180 : 0;

    // Tolerance: ±30° from optimal (research-backed)
    const toleranceRange = hemisphere === 'northern' ? '150-210°' : '330-30°';

    return {
      primaryDirection,
      primaryAzimuth,
      toleranceRange,
      recommendation: `Orient building's long axis east-west with primary facade facing ${primaryDirection} (within ${toleranceRange})`,
      reasoning: 'Research shows this orientation can reduce heating/cooling energy by 10-40% through optimal passive solar gain',
      sources: [
        'NACHI: Passive Solar Home Design (nachi.org)',
        'DOE: Thermal Mass and R-Value (energy.gov)'
      ]
    };
  }

  /**
   * Calculate energy savings from optimal orientation
   */
  calculateEnergySavings(orientation, climateData) {
    const climateType = climateData.classification?.type || 'Temperate';

    let heatingReduction, coolingReduction, totalReduction;

    if (climateType.includes('Cold') || climateType.includes('Continental')) {
      heatingReduction = '20-40%';
      coolingReduction = '5-15%';
      totalReduction = '15-35%';
    } else if (climateType.includes('Tropical') || climateType.includes('Arid')) {
      heatingReduction = '5-10%';
      coolingReduction = '15-30%';
      totalReduction = '10-25%';
    } else {
      heatingReduction = '10-25%';
      coolingReduction = '10-25%';
      totalReduction = '10-30%';
    }

    return {
      heatingReduction,
      coolingReduction,
      totalEnergyReduction: totalReduction,
      mechanism: 'Optimal orientation + high thermal-mass materials (concrete, brick, stone) regulate interior temperatures',
      note: 'Actual savings depend on building design, insulation, and glazing specifications'
    };
  }

  /**
   * Get climate-specific adaptation recommendations
   */
  getClimateAdaptations(climateData, orientation) {
    const climateType = climateData.classification?.type || 'Temperate';

    const adaptations = {
      orientation: `Primary facade facing ${orientation.primaryDirection} for optimal passive solar performance`,
      thermalMass: '',
      shading: '',
      ventilation: '',
      insulation: '',
      materials: []
    };

    if (climateType.includes('Cold') || climateType.includes('Continental')) {
      adaptations.thermalMass = 'High thermal mass (concrete, brick, stone) inside insulation envelope to store solar heat';
      adaptations.shading = 'Minimal shading; maximize south-facing glazing for winter solar gain';
      adaptations.ventilation = 'Airtight construction; mechanical ventilation with heat recovery';
      adaptations.insulation = 'Superinsulation: R-30+ walls, R-60+ roof';
      adaptations.materials = ['Concrete', 'Brick', 'Stone', 'Triple-glazed windows'];
    } else if (climateType.includes('Tropical') || climateType.includes('Arid')) {
      adaptations.thermalMass = climateType.includes('Arid') ? 'High thermal mass to exploit diurnal temperature swings' : 'Low thermal mass to avoid heat retention';
      adaptations.shading = 'Extensive shading devices, overhangs, and vegetation';
      adaptations.ventilation = 'Cross-ventilation and natural airflow prioritized';
      adaptations.insulation = 'Moderate insulation with reflective barriers';
      adaptations.materials = climateType.includes('Arid') ? ['Rammed earth', 'Thick concrete', 'Adobe'] : ['Lightweight concrete', 'Insulated block', 'Reflective roofing'];
    } else {
      adaptations.thermalMass = 'Medium thermal mass (brick, concrete) to moderate temperature swings';
      adaptations.shading = 'Seasonal shading with deciduous trees and adjustable overhangs';
      adaptations.ventilation = 'Operable windows for natural ventilation in shoulder seasons';
      adaptations.insulation = 'Balanced insulation: R-18 to R-27 walls';
      adaptations.materials = ['Brick', 'Concrete', 'Timber', 'Double-glazed windows'];
    }

    return adaptations;
  }

  /**
   * Generate comprehensive location recommendations
   */
  generateLocationRecommendations(location, climate, solar) {
    return {
      summary: `${climate.classification?.description || 'Temperate'} climate at ${location.coordinates.lat.toFixed(4)}°, ${location.coordinates.lng.toFixed(4)}°`,
      keyInsights: [
        `Climate: ${climate.classification?.description || 'Temperate'}`,
        `Optimal orientation: ${solar.optimalOrientation.primaryDirection}-facing primary facade`,
        `Energy savings potential: ${solar.energySavings.totalEnergyReduction}`,
        `Thermal mass strategy: ${solar.climateAdaptations.thermalMass}`
      ],
      designStrategies: [
        solar.optimalOrientation.recommendation,
        solar.climateAdaptations.shading,
        solar.climateAdaptations.ventilation,
        solar.climateAdaptations.insulation
      ],
      recommendedMaterials: solar.climateAdaptations.materials
    };
  }

  /**
   * Fallback analysis when APIs fail
   */
  getFallbackAnalysis(addressOrCoords) {
    return {
      success: false,
      location: {
        formattedAddress: addressOrCoords,
        coordinates: { lat: 0, lng: 0 },
        note: 'Geocoding unavailable'
      },
      climate: {
        classification: { type: 'Temperate', subtype: 'Unknown' },
        seasonal: {},
        note: 'Climate data unavailable'
      },
      solar: {
        optimalOrientation: {
          primaryDirection: 'South',
          recommendation: 'Default south-facing orientation (northern hemisphere assumed)'
        },
        energySavings: {
          totalEnergyReduction: '10-30%'
        }
      },
      isFallback: true
    };
  }
}

export default new EnhancedLocationService();
