import { useCallback } from 'react';
import axios from 'axios';
import { useDesignContext } from '../context/DesignContext.jsx';
import { locationIntelligence } from '../services/locationIntelligence.js';
import siteAnalysisService from '../services/siteAnalysisService.js';
import logger from '../utils/logger.js';
import { buildSiteContext } from '../rings/ring1-site/siteContextBuilder.js';

/**
 * useLocationData - Location Analysis Hook
 *
 * Handles all location-related operations:
 * - Address geocoding
 * - Climate data retrieval
 * - Zoning analysis
 * - Architectural style recommendations
 * - Building footprint detection
 * - Site boundary analysis
 * - Site map snapshot generation
 *
 * @returns {Object} Location analysis functions and state
 */
export const useLocationData = () => {
  const {
    address,
    setAddress,
    locationData,
    setLocationData,
    sitePolygon,
    setSitePolygon,
    siteMetrics,
    setSiteMetrics,
    locationAccuracy,
    setLocationAccuracy,
    isDetectingLocation,
    setIsDetectingLocation,
    isLoading,
    setIsLoading,
    hasDetectedLocation,
    goToStep,
    showToast
  } = useDesignContext();

  /**
   * Get seasonal climate data from OpenWeather API
   */
  const getSeasonalClimateData = useCallback(async (lat, lon) => {
    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          lat,
          lon,
          units: 'metric',
          appid: process.env.REACT_APP_OPENWEATHER_API_KEY,
        },
      });

      const weatherData = response.data;
      const currentTemp = weatherData.main.temp;
      const tempVariation = 15;

      // Extract wind data from OpenWeather API
      const windData = weatherData.wind || {};
      const windSpeed = windData.speed || 0; // m/s
      const windDeg = windData.deg || 0; // degrees (0 = North, 90 = East, 180 = South, 270 = West)
      const windGust = windData.gust || windSpeed; // m/s

      // Convert wind direction degrees to cardinal direction
      const getWindDirection = (deg) => {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(deg / 22.5) % 16;
        return directions[index];
      };

      // Convert m/s to km/h
      const windSpeedKmh = (windSpeed * 3.6).toFixed(1);
      const windGustKmh = (windGust * 3.6).toFixed(1);

      // Determine facade orientation recommendation based on wind
      const optimalFacadeOrientation = (() => {
        // For prevailing winds, place service/utility areas on windward side
        // Place main living areas on leeward (protected) side
        if (windSpeed > 5) { // Moderate to strong winds (> 18 km/h)
          if (windDeg >= 315 || windDeg < 45) return "Main rooms facing South (protected from North wind)";
          if (windDeg >= 45 && windDeg < 135) return "Main rooms facing West (protected from East wind)";
          if (windDeg >= 135 && windDeg < 225) return "Main rooms facing North (protected from South wind)";
          if (windDeg >= 225 && windDeg < 315) return "Main rooms facing East (protected from West wind)";
        }
        return "South-facing for solar optimization (low wind impact)";
      })();

      const finalProcessedData = {
        climate: {
          type: weatherData.weather[0]?.main || "Varied",
          seasonal: {
            winter: {
              avgTemp: `${(currentTemp - tempVariation).toFixed(1)}°C`,
              precipitation: "Moderate",
              solar: "40-50%",
            },
            spring: {
              avgTemp: `${(currentTemp - 5).toFixed(1)}°C`,
              precipitation: "Moderate",
              solar: "60-70%",
            },
            summer: {
              avgTemp: `${(currentTemp + tempVariation).toFixed(1)}°C`,
              precipitation: "Low",
              solar: "80-90%",
            },
            fall: {
              avgTemp: `${(currentTemp + 5).toFixed(1)}°C`,
              precipitation: "Moderate-High",
              solar: "50-60%",
            },
          }
        },
        wind: {
          speed: `${windSpeedKmh} km/h`,
          speedMs: windSpeed,
          direction: getWindDirection(windDeg),
          directionDeg: windDeg,
          gust: `${windGustKmh} km/h`,
          gustMs: windGust,
          impact: windSpeed > 5 ? 'Moderate-High' : windSpeed > 3 ? 'Moderate' : 'Low',
          facadeRecommendation: optimalFacadeOrientation
        },
        sunPath: {
          summer: `Sunrise: ~6:00 AM`,
          winter: `Sunset: ~5:00 PM`,
          optimalOrientation: optimalFacadeOrientation
        }
      };

      return finalProcessedData;
    } catch (error) {
      logger.warn("Could not retrieve seasonal climate data", error);

      // Fallback to mock data
      if (error.response && error.response.status === 401) {
        return {
          climate: {
            type: "Mild, Mediterranean (Mock Data)",
            seasonal: {
              winter: { avgTemp: "14.0°C", precipitation: "100mm", solar: "50%" },
              spring: { avgTemp: "17.5°C", precipitation: "40mm", solar: "75%" },
              summer: { avgTemp: "22.0°C", precipitation: "5mm", solar: "90%" },
              fall: { avgTemp: "19.5°C", precipitation: "25mm", solar: "65%" },
            }
          },
          wind: {
            speed: "12.5 km/h",
            speedMs: 3.5,
            direction: "SW",
            directionDeg: 225,
            gust: "18.0 km/h",
            gustMs: 5.0,
            impact: "Moderate",
            facadeRecommendation: "Main rooms facing East (protected from West wind)"
          },
          sunPath: {
            summer: "Sunrise: ~5:48 AM, Sunset: ~8:35 PM",
            winter: "Sunrise: ~7:20 AM, Sunset: ~5:00 PM",
            optimalOrientation: "Main rooms facing East (protected from West wind)"
          }
        };
      }

      return {
        climate: { type: 'Error fetching seasonal data', seasonal: {} },
        wind: { speed: 'N/A', direction: 'N/A', impact: 'Unknown' },
        sunPath: { summer: 'N/A', winter: 'N/A', optimalOrientation: 'N/A' }
      };
    }
  }, []);

  /**
   * Analyze location based on address input
   */
  const analyzeLocation = useCallback(async () => {
    if (!address) {
      showToast("Please enter an address.");
      return;
    }

    setIsLoading(true);
    logger.info('Analyzing location', { address }, '🗺️');

    try {
      // Step 1: Geocode address to get coordinates
      let geocodeResponse;
      if (!process.env.REACT_APP_GOOGLE_MAPS_API_KEY) {
        // Fallback data if no API key
        geocodeResponse = {
          data: {
            status: 'OK',
            results: [
              {
                formatted_address: address || "123 Main Street, San Francisco, CA 94105, USA",
                geometry: {
                  location: { lat: 37.795, lng: -122.394 }
                },
                address_components: [
                  { long_name: 'San Francisco', types: ['locality'] },
                  { long_name: 'California', types: ['administrative_area_level_1'] },
                  { long_name: 'United States', types: ['country'] }
                ]
              }
            ]
          }
        };
      } else {
        geocodeResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: {
            address: address,
            key: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
          },
        });
      }

      if (geocodeResponse.data.status !== 'OK' || !geocodeResponse.data.results || geocodeResponse.data.results.length === 0) {
        throw new Error(`Geocoding failed: ${geocodeResponse.data.status}`);
      }

      const locationResult = geocodeResponse.data.results[0];
      const { lat, lng } = locationResult.geometry.location;
      const formattedAddress = locationResult.formatted_address;
      const addressComponents = locationResult.address_components;

      logger.info('Geocoding successful', { formattedAddress, lat, lng }, '📍');

      // Step 2: Get seasonal climate data
      const seasonalClimateData = await getSeasonalClimateData(lat, lng);

      // Step 3: Analyze zoning
      const zoningData = locationIntelligence.analyzeZoning(
        addressComponents,
        locationResult.types,
        locationResult.geometry.location
      );

      // Step 4: Analyze market
      const marketContext = locationIntelligence.analyzeMarket(
        addressComponents,
        { lat, lng },
        zoningData
      );

      // Step 5: Recommend architectural style
      const architecturalStyle = await locationIntelligence.recommendArchitecturalStyle(
        locationResult,
        seasonalClimateData.climate
      );

      // Step 6: Detect building footprint
      logger.info('Detecting building footprint from address', null, '🏢');
      const buildingFootprintService = (await import('../services/buildingFootprintService')).default;

      const footprintResult = await buildingFootprintService.detectAddressShape(
        formattedAddress,
        process.env.REACT_APP_GOOGLE_MAPS_API_KEY
      );

      let detectedBuildingFootprint = null;
      let detectedShapeType = null;

      if (footprintResult.success) {
        logger.info('Building footprint detected', {
          shape: footprintResult.shape.name,
          area: `${footprintResult.area.toFixed(1)} m²`,
          vertices: footprintResult.shape.vertexCount
        }, '✅');

        detectedBuildingFootprint = footprintResult.polygon;
        detectedShapeType = footprintResult.shape;

        // Auto-populate site polygon
        setSitePolygon(footprintResult.polygon);
        setSiteMetrics({
          areaM2: footprintResult.area,
          shapeType: footprintResult.shape.name,
          shapeDescription: footprintResult.shape.description,
          vertexCount: footprintResult.shape.vertexCount,
          isConvex: footprintResult.shape.isConvex,
          source: 'google_building_outline',
          confidence: 0.95, // High confidence for Google Building API
          detectedAt: footprintResult.metadata.detectedAt
        });
      } else {
        logger.warn('Building footprint not available, trying site analysis');
      }

      // Step 7: Analyze site boundary (fallback)
      logger.info('Analyzing site boundary and surface area', null, '🗺️');
      const siteAnalysisResult = await siteAnalysisService.analyzeSiteContext(formattedAddress, { lat, lng });

      if (siteAnalysisResult.success && !detectedBuildingFootprint) {
        logger.info('Site analysis complete (fallback)', siteAnalysisResult.siteAnalysis);

        if (siteAnalysisResult.siteAnalysis.siteBoundary) {
          setSitePolygon(siteAnalysisResult.siteAnalysis.siteBoundary);
          setSiteMetrics({
            areaM2: siteAnalysisResult.siteAnalysis.surfaceArea,
            unit: siteAnalysisResult.siteAnalysis.surfaceAreaUnit,
            source: siteAnalysisResult.siteAnalysis.boundarySource,
            shapeType: siteAnalysisResult.siteAnalysis.boundaryShapeType,
            confidence: siteAnalysisResult.siteAnalysis.boundaryConfidence || 0.40,
            vertexCount: siteAnalysisResult.siteAnalysis.siteBoundary?.length
          });
        }
      } else if (!siteAnalysisResult.success && !detectedBuildingFootprint) {
        logger.warn('Both building footprint and site analysis failed');
      }

      // Step 8: Generate site map snapshot
      let siteMapUrl = null;
      try {
        logger.info('Generating Google Maps plan mode snapshot for A1 sheet', null, '🗺️');
        const { getSiteSnapshotWithMetadata } = await import('../services/siteMapSnapshotService');

        const sitePolygonForMap = sitePolygon || detectedBuildingFootprint || null;

        const snapshotResult = await getSiteSnapshotWithMetadata({
          coordinates: { lat, lng },
          polygon: sitePolygonForMap,
          mapType: 'roadmap',
          size: [640, 400],
          zoom: sitePolygonForMap ? undefined : 19
        });

        if (snapshotResult && snapshotResult.dataUrl) {
          siteMapUrl = snapshotResult.dataUrl;
          logger.info('Google Maps plan snapshot generated successfully', null, '✅');
        }
      } catch (snapshotError) {
        logger.error('Failed to generate site map snapshot', snapshotError);
      }

      // Step 9: Save location data and advance to next step
      const sitePolygonForMap = sitePolygon || detectedBuildingFootprint || siteAnalysisResult?.siteAnalysis?.siteBoundary || null;

      const siteDNA = buildSiteContext({
        location: { address: formattedAddress, coordinates: { lat, lng } },
        sitePolygon: sitePolygonForMap,
        detectedBuildingFootprint,
        siteAnalysis: siteAnalysisResult.siteAnalysis,
        climate: seasonalClimateData.climate,
        seasonalClimate: seasonalClimateData,
        streetContext: siteAnalysisResult.siteAnalysis?.streetContext
      });

      const newLocationData = {
        address: formattedAddress,
        coordinates: { lat, lng },
        address_components: addressComponents,
        climate: seasonalClimateData.climate,
        sunPath: siteDNA?.solar || seasonalClimateData.sunPath,
        zoning: zoningData,
        recommendedStyle: architecturalStyle.primary,
        localStyles: architecturalStyle.alternatives,
        sustainabilityScore: 85,
        marketContext: marketContext,
        architecturalProfile: architecturalStyle,
        siteAnalysis: siteAnalysisResult.success ? siteAnalysisResult.siteAnalysis : null,
        buildingFootprint: detectedBuildingFootprint,
        detectedShape: detectedShapeType,
        siteMapUrl: siteMapUrl,
        mapImageUrl: siteMapUrl,
        siteDNA
      };

      setLocationData(newLocationData);
      logger.info('Location analysis complete, advancing to step 2', null, '✅');
      goToStep(2);

      return siteMapUrl;
    } catch (error) {
      logger.error("Error analyzing location", error);

      let errorMessage = "An error occurred during analysis.";
      if (error.response) {
        errorMessage = `Error: ${error.response.data.message || 'Failed to fetch data.'}`;
      } else if (error.request) {
        errorMessage = "Could not connect to the server. Please check your network.";
      } else {
        errorMessage = error.message;
      }

      showToast(`Error: ${errorMessage}. Check API keys and address.`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [
    address,
    sitePolygon,
    setSitePolygon,
    setSiteMetrics,
    setIsLoading,
    setLocationData,
    goToStep,
    showToast,
    getSeasonalClimateData
  ]);

  /**
   * Detect user's current location using enhanced geolocation
   */
  const detectUserLocation = useCallback(async () => {
    if (hasDetectedLocation.current) {
      logger.info('Location already detected, skipping');
      return;
    }

    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser");
      return;
    }

    setIsDetectingLocation(true);
    hasDetectedLocation.current = true;

    logger.info('Detecting user location with high accuracy', null, '📍');

    try {
      // Use enhanced location service for better accuracy
      const enhancedLocationService = (await import('../services/enhancedLocationService')).default;

      const locationResult = await enhancedLocationService.getUserLocationWithAddress(
        process.env.REACT_APP_GOOGLE_MAPS_API_KEY
      );

      logger.info('Enhanced location detected', {
        address: locationResult.address,
        accuracy: `${locationResult.accuracy.toFixed(1)}m`,
        qualityScore: locationResult.qualityScore
      }, '✅');

      // Set the detected address
      setAddress(locationResult.address);

      // Store accuracy info
      setLocationAccuracy({
        accuracy: locationResult.accuracy,
        qualityScore: locationResult.qualityScore,
        addressType: locationResult.addressType
      });

      // Show quality feedback
      const quality = enhancedLocationService.getLocationQuality(locationResult.qualityScore);
      const accuracyText = enhancedLocationService.formatAccuracy(locationResult.accuracy);

      if (quality.level === 'excellent' || quality.level === 'good') {
        showToast(`Location detected: ${locationResult.address} (${accuracyText})`);
      } else if (quality.level === 'fair') {
        showToast(`Location detected (${accuracyText}): ${locationResult.address}\n⚠️ Please verify this address is correct`);
      } else {
        showToast(`⚠️ ${quality.description}\nDetected: ${locationResult.address}\nAccuracy: ${accuracyText}\nPlease verify or enter manually`);
      }

      // Store accuracy info for later use
      if (locationResult.qualityScore < 70) {
        logger.warn('Location quality below recommended threshold', {
          qualityScore: locationResult.qualityScore,
          accuracy: locationResult.accuracy
        });
      }

    } catch (error) {
      logger.error('Enhanced location detection failed', error);
      hasDetectedLocation.current = false;

      // Provide specific error messages
      if (error.message.includes('Geolocation is not supported')) {
        showToast("Geolocation is not supported by your browser. Please enter address manually.");
      } else if (error.message.includes('User denied')) {
        showToast("Location permission denied. Please enable location access or enter address manually.");
      } else if (error.message.includes('timeout')) {
        showToast("Location request timed out. Please try again or enter address manually.");
      } else if (error.message.includes('API key')) {
        showToast("Location services unavailable. Please enter address manually.");
      } else {
        showToast(`Could not detect location: ${error.message}\nPlease enter address manually.`);
      }
    } finally {
      setIsDetectingLocation(false);
    }
  }, [hasDetectedLocation, setAddress, setIsDetectingLocation, showToast]);

  /**
   * Update site polygon manually (from drawing interface)
   */
  const updateSitePolygon = useCallback((polygon) => {
    setSitePolygon(polygon);

    if (polygon && polygon.length > 0) {
      // Recalculate metrics
      const { computeSiteMetrics } = require('../utils/geometry');
      const metrics = computeSiteMetrics(polygon);

      setSiteMetrics({
        ...metrics,
        source: 'user_drawn'
      });

      logger.info('Site polygon updated', {
        vertices: polygon.length,
        area: `${metrics.areaM2?.toFixed(1)} m²`
      }, '🖊️');
    }
  }, [setSitePolygon, setSiteMetrics]);

  return {
    // State
    address,
    setAddress,
    locationData,
    sitePolygon,
    siteMetrics,
    locationAccuracy,
    isDetectingLocation,
    isLoading,

    // Actions
    analyzeLocation,
    detectUserLocation,
    updateSitePolygon,

    // Convenience flags
    hasLocation: locationData !== null,
    hasSitePolygon: sitePolygon !== null && sitePolygon.length > 0
  };
};

export default useLocationData;
