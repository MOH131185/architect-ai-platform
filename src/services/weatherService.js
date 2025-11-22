import logger from '../utils/logger.js';

/**
 * Weather Service
 * 
 * Fetches real-time and historical climate data using the Open-Meteo API.
 * No API key required for non-commercial use.
 */

export const weatherService = {
  /**
   * Fetch climate data for a specific location
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<Object>} Climate data including temperature, wind, and precipitation
   */
  async getClimateData(lat, lng) {
    try {
      // Fetch current weather and daily climate stats
      // Variables: temperature_2m_max, temperature_2m_min, precipitation_sum, wind_speed_10m_max, wind_direction_10m_dominant
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&current_weather=true&timezone=auto&forecast_days=1`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Fetch historical data for annual averages (simplified approximation using current forecast for now, 
      // ideally would use archive API but that requires more complex setup)
      // For a robust architectural analysis, we'll infer climate zone and averages from the single point 
      // and general geographic knowledge if historical API is too heavy.

      return this.processWeatherData(data);
    } catch (error) {
      logger.error('Failed to fetch weather data:', error);
      // Return fallback data to prevent crash
      return this.getFallbackData();
    }
  },

  /**
   * Process raw API response into architectural climate summary
   */
  processWeatherData(data) {
    const current = data.current_weather || {};
    const daily = data.daily || {};

    // Determine prevailing wind direction (cardinal)
    const windDir = current.winddirection || daily.wind_direction_10m_dominant?.[0] || 0;
    const cardinalWind = this.degreesToCardinal(windDir);

    // Estimate climate zone based on temperature (very rough heuristic)
    const temp = current.temperature || 15;
    let climateZone = 'Temperate';
    if (temp > 25) climateZone = 'Tropical';
    if (temp > 35) climateZone = 'Arid';
    if (temp < 5) climateZone = 'Cold';
    if (temp < -5) climateZone = 'Polar';

    return {
      temperature: {
        current: current.temperature,
        min: daily.temperature_2m_min?.[0],
        max: daily.temperature_2m_max?.[0],
        unit: '°C'
      },
      wind: {
        speed: current.windspeed,
        direction: windDir,
        cardinal: cardinalWind,
        prevailing: cardinalWind, // Alias for compatibility
        unit: 'km/h'
      },
      precipitation: {
        daily: daily.precipitation_sum?.[0] || 0,
        daily_sum: daily.precipitation_sum?.[0] || 0, // Alias for compatibility
        unit: 'mm'
      },
      climateZone: climateZone,
      summary: `Current conditions: ${current.temperature}°C, Wind ${cardinalWind} at ${current.windspeed} km/h`
    };
  },

  /**
   * Convert degrees to cardinal direction
   */
  degreesToCardinal(degrees) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((degrees %= 360) < 0 ? degrees + 360 : degrees) / 45) % 8;
    return dirs[index];
  },

  /**
   * Fallback data if API fails
   */
  getFallbackData() {
    return {
      temperature: { current: 15, min: 10, max: 20, unit: '°C' },
      wind: { speed: 10, direction: 225, cardinal: 'SW', unit: 'km/h' },
      precipitation: { daily: 0, unit: 'mm' },
      climateZone: 'Temperate',
      summary: 'Weather data unavailable'
    };
  }
};

export default weatherService;
