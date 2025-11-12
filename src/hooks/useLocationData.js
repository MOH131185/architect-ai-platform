import { useCallback } from 'react';
import axios from 'axios';
import { useDesignContext } from '../context/DesignContext';
import { locationIntelligence } from '../services/locationIntelligence';
import siteAnalysisService from '../services/siteAnalysisService';
import logger from '../utils/logger';

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
        sunPath: {
          summer: `Sunrise: ~6:00 AM`,
          winter: `Sunset: ~5:00 PM`,
          optimalOrientation: "South-facing (general recommendation)"
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
          sunPath: {
            summer: "Sunrise: ~5:48 AM, Sunset: ~8:35 PM",
            winter: "Sunrise: ~7:20 AM, Sunset: ~5:00 PM",
            optimalOrientation: "South-facing for winter sun"
          }
        };
      }

      return {
        climate: { type: 'Error fetching seasonal data', seasonal: {} },
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
      const architecturalStyle = locationIntelligence.recommendArchitecturalStyle(
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
            source: siteAnalysisResult.siteAnalysis.boundarySource
          });
        }
      } else if (!siteAnalysisResult.success && !detectedBuildingFootprint) {
        logger.warn('Both building footprint and site analysis failed');
      }

      // Step 8: Generate site map snapshot
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
          logger.info('Google Maps plan snapshot generated successfully', null, '✅');
          return snapshotResult.dataUrl;
        }
      } catch (snapshotError) {
        logger.error('Failed to generate site map snapshot', snapshotError);
      }

      return null;
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
    showToast,
    getSeasonalClimateData
  ]);

  /**
   * Detect user's current location using browser geolocation
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

    logger.info('Detecting user location', null, '📍');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        logger.info('Location detected', { lat, lng }, '✅');

        try {
          // Reverse geocode to get address
          const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
              latlng: `${lat},${lng}`,
              key: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
            },
          });

          if (response.data.results && response.data.results.length > 0) {
            const detectedAddress = response.data.results[0].formatted_address;
            setAddress(detectedAddress);
            logger.info('Address detected', { address: detectedAddress }, '📍');
            showToast(`Location detected: ${detectedAddress}`);
          }
        } catch (error) {
          logger.error('Failed to reverse geocode location', error);
          showToast("Could not determine address from location.");
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (error) => {
        logger.error('Geolocation error', error);
        hasDetectedLocation.current = false;
        setIsDetectingLocation(false);

        switch (error.code) {
          case error.PERMISSION_DENIED:
            showToast("Location permission denied. Please enter address manually.");
            break;
          case error.POSITION_UNAVAILABLE:
            showToast("Location information unavailable. Please enter address manually.");
            break;
          case error.TIMEOUT:
            showToast("Location request timed out. Please enter address manually.");
            break;
          default:
            showToast("An unknown error occurred. Please enter address manually.");
            break;
        }
      }
    );
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
