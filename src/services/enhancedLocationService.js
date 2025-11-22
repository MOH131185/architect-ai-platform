/**
 * Enhanced Location Service
 *
 * Provides high-accuracy geolocation with intelligent reverse geocoding
 * - High-accuracy GPS positioning with fallback
 * - Smart result filtering for best address match
 * - Multiple geocoding strategies
 * - Accuracy validation and retry logic
 */

import axios from 'axios';
import logger from '../utils/logger.js';

/**
 * Geolocation options for high accuracy
 */
const HIGH_ACCURACY_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000, // 10 seconds
  maximumAge: 0 // Don't use cached position
};

/**
 * Geolocation options for fallback (faster but less accurate)
 */
const FALLBACK_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 30000 // Accept 30 second old position
};

/**
 * Minimum acceptable accuracy in meters
 */
const MIN_ACCEPTABLE_ACCURACY = 100; // 100 meters
const IDEAL_ACCURACY = 20; // 20 meters

/**
 * Get user's current location with high accuracy
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export async function getCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser');
  }

  logger.info('Requesting high-accuracy location', null, '📍');

  try {
    // Try high accuracy first
    const position = await getPositionWithTimeout(HIGH_ACCURACY_OPTIONS);

    if (position.coords.accuracy <= IDEAL_ACCURACY) {
      logger.info('High-accuracy location obtained', {
        accuracy: `${position.coords.accuracy.toFixed(1)}m`
      }, '✅');

      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        heading: position.coords.heading,
        speed: position.coords.speed
      };
    }

    // If accuracy is poor, try fallback
    if (position.coords.accuracy > MIN_ACCEPTABLE_ACCURACY) {
      logger.warn('Location accuracy poor, trying fallback', {
        accuracy: `${position.coords.accuracy.toFixed(1)}m`
      });

      const fallbackPosition = await getPositionWithTimeout(FALLBACK_OPTIONS);

      // Use whichever has better accuracy
      if (fallbackPosition.coords.accuracy < position.coords.accuracy) {
        logger.info('Fallback position more accurate', {
          accuracy: `${fallbackPosition.coords.accuracy.toFixed(1)}m`
        });

        return {
          lat: fallbackPosition.coords.latitude,
          lng: fallbackPosition.coords.longitude,
          accuracy: fallbackPosition.coords.accuracy,
          altitude: fallbackPosition.coords.altitude,
          heading: fallbackPosition.coords.heading,
          speed: fallbackPosition.coords.speed
        };
      }
    }

    logger.info('Location obtained', {
      accuracy: `${position.coords.accuracy.toFixed(1)}m`
    }, '✅');

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      heading: position.coords.heading,
      speed: position.coords.speed
    };

  } catch (error) {
    // If high accuracy fails, try fallback
    logger.warn('High-accuracy location failed, trying fallback', error);

    try {
      const fallbackPosition = await getPositionWithTimeout(FALLBACK_OPTIONS);

      logger.info('Fallback location obtained', {
        accuracy: `${fallbackPosition.coords.accuracy.toFixed(1)}m`
      }, '⚠️');

      return {
        lat: fallbackPosition.coords.latitude,
        lng: fallbackPosition.coords.longitude,
        accuracy: fallbackPosition.coords.accuracy,
        altitude: fallbackPosition.coords.altitude,
        heading: fallbackPosition.coords.heading,
        speed: fallbackPosition.coords.speed,
        fallback: true
      };
    } catch (fallbackError) {
      logger.error('All location attempts failed', fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Get position with promise wrapper and timeout
 * @private
 */
function getPositionWithTimeout(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Reverse geocode coordinates to address with smart result filtering
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<Object>} Best address result
 */
export async function reverseGeocode(lat, lng, apiKey) {
  if (!apiKey) {
    throw new Error('Google Maps API key is required for reverse geocoding');
  }

  logger.info('Reverse geocoding coordinates', { lat, lng }, '🗺️');

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        latlng: `${lat},${lng}`,
        key: apiKey,
        // Request multiple result types
        result_type: 'street_address|premise|subpremise|neighborhood|locality'
      },
    });

    if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
      throw new Error(`Reverse geocoding failed: ${response.data.status}`);
    }

    const results = response.data.results;

    // Filter and rank results by specificity
    const bestResult = selectBestAddressResult(results);

    logger.info('Best address selected', {
      address: bestResult.formatted_address,
      type: bestResult.types[0],
      components: bestResult.address_components.length
    }, '✅');

    return bestResult;

  } catch (error) {
    logger.error('Reverse geocoding failed', error);
    throw error;
  }
}

/**
 * Select best address result from multiple results
 * Prioritizes specific addresses over general areas
 * @private
 */
function selectBestAddressResult(results) {
  if (results.length === 0) {
    throw new Error('No geocoding results available');
  }

  // Scoring system for result types (higher is better)
  const typeScores = {
    'street_address': 100,    // Most specific
    'premise': 90,             // Building/property
    'subpremise': 85,          // Unit/suite within building
    'establishment': 80,       // Named location
    'point_of_interest': 75,   // POI
    'route': 60,               // Street
    'intersection': 55,        // Street intersection
    'neighborhood': 40,        // Neighborhood
    'locality': 30,            // City
    'sublocality': 35,         // District within city
    'administrative_area_level_3': 20,
    'administrative_area_level_2': 15,
    'administrative_area_level_1': 10,
    'country': 5,
    'postal_code': 25
  };

  // Score each result
  const scoredResults = results.map(result => {
    let score = 0;

    // Add type scores
    for (const type of result.types) {
      if (typeScores[type]) {
        score += typeScores[type];
      }
    }

    // Bonus for street number
    const hasStreetNumber = result.address_components.some(
      component => component.types.includes('street_number')
    );
    if (hasStreetNumber) {
      score += 50;
    }

    // Bonus for route (street name)
    const hasRoute = result.address_components.some(
      component => component.types.includes('route')
    );
    if (hasRoute) {
      score += 30;
    }

    // Bonus for postal code
    const hasPostalCode = result.address_components.some(
      component => component.types.includes('postal_code')
    );
    if (hasPostalCode) {
      score += 20;
    }

    // Penalty for partial match
    if (result.partial_match) {
      score -= 10;
    }

    // Count address components (more specific addresses have more components)
    score += result.address_components.length * 2;

    return {
      result,
      score
    };
  });

  // Sort by score (highest first)
  scoredResults.sort((a, b) => b.score - a.score);

  logger.debug('Address results scored', {
    count: scoredResults.length,
    topScore: scoredResults[0].score,
    topType: scoredResults[0].result.types[0]
  });

  return scoredResults[0].result;
}

/**
 * Get user location and reverse geocode to address
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<Object>} Location data with address
 */
export async function getUserLocationWithAddress(apiKey) {
  logger.info('Getting user location with address', null, '📍');

  // Step 1: Get current location
  const location = await getCurrentLocation();

  // Check accuracy
  if (location.accuracy > MIN_ACCEPTABLE_ACCURACY) {
    logger.warn('Location accuracy below threshold', {
      accuracy: `${location.accuracy.toFixed(1)}m`,
      threshold: `${MIN_ACCEPTABLE_ACCURACY}m`
    });
  }

  // Step 2: Reverse geocode to get address
  const addressResult = await reverseGeocode(location.lat, location.lng, apiKey);

  return {
    coordinates: {
      lat: location.lat,
      lng: location.lng
    },
    accuracy: location.accuracy,
    address: addressResult.formatted_address,
    addressComponents: addressResult.address_components,
    addressType: addressResult.types[0],
    placeId: addressResult.place_id,
    geometry: addressResult.geometry,
    fullResult: addressResult,
    qualityScore: getLocationQualityScore(location.accuracy, addressResult)
  };
}

/**
 * Calculate quality score for location result
 * @private
 */
function getLocationQualityScore(accuracy, addressResult) {
  let score = 100;

  // Penalize for poor accuracy
  if (accuracy > IDEAL_ACCURACY) {
    score -= Math.min(40, (accuracy - IDEAL_ACCURACY) / 2);
  }

  // Penalize for vague address types
  const vagueTypes = ['locality', 'administrative_area_level_1', 'country'];
  if (vagueTypes.includes(addressResult.types[0])) {
    score -= 20;
  }

  // Bonus for street address
  if (addressResult.types.includes('street_address')) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Format location accuracy for display
 * @param {number} accuracy - Accuracy in meters
 * @returns {string} Formatted accuracy
 */
export function formatAccuracy(accuracy) {
  if (accuracy < 10) {
    return `±${accuracy.toFixed(1)}m (Excellent)`;
  } else if (accuracy < 50) {
    return `±${accuracy.toFixed(0)}m (Good)`;
  } else if (accuracy < 100) {
    return `±${accuracy.toFixed(0)}m (Fair)`;
  } else {
    return `±${accuracy.toFixed(0)}m (Poor)`;
  }
}

/**
 * Get location quality description
 * @param {number} qualityScore - Quality score (0-100)
 * @returns {Object} Quality info
 */
export function getLocationQuality(qualityScore) {
  if (qualityScore >= 90) {
    return {
      level: 'excellent',
      description: 'High precision location with specific address',
      color: 'green'
    };
  } else if (qualityScore >= 70) {
    return {
      level: 'good',
      description: 'Good location accuracy',
      color: 'blue'
    };
  } else if (qualityScore >= 50) {
    return {
      level: 'fair',
      description: 'Approximate location - verify address',
      color: 'yellow'
    };
  } else {
    return {
      level: 'poor',
      description: 'Low accuracy - please verify or enter manually',
      color: 'red'
    };
  }
}

export default {
  getCurrentLocation,
  reverseGeocode,
  getUserLocationWithAddress,
  formatAccuracy,
  getLocationQuality
};
