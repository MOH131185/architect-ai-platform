/**
 * useGoogleMap - Custom Hook for Google Maps API
 *
 * Handles loading the Google Maps JavaScript API using @googlemaps/js-api-loader
 * and initializing a map instance with proper cleanup.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

/**
 * @typedef {Object} UseGoogleMapOptions
 * @property {string} apiKey - Google Maps API key
 * @property {{lat: number, lng: number}} center - Initial map center
 * @property {number} zoom - Initial zoom level
 * @property {string} mapId - Optional map ID for cloud-based styling
 * @property {Object} mapOptions - Additional map options
 */

/**
 * @typedef {Object} UseGoogleMapReturn
 * @property {google.maps.Map|null} map - Map instance
 * @property {boolean} isLoaded - Whether API is loaded
 * @property {boolean} isLoading - Whether API is loading
 * @property {Error|null} error - Loading error if any
 * @property {Function} setCenter - Update map center
 * @property {Function} setZoom - Update map zoom
 */

// Cache the loader instance to avoid multiple loads
let loaderInstance = null;
let loadPromise = null;

/**
 * Get or create the Google Maps API loader
 * @param {string} apiKey - Google Maps API key
 * @returns {Loader} Loader instance
 */
function getLoader(apiKey) {
  if (!loaderInstance) {
    loaderInstance = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'geometry', 'drawing'],
    });
  }
  return loaderInstance;
}

/**
 * Custom hook for Google Maps integration
 * @param {React.RefObject} containerRef - Ref to map container element
 * @param {UseGoogleMapOptions} options - Map configuration options
 * @returns {UseGoogleMapReturn} Map state and controls
 */
export function useGoogleMap(containerRef, options = {}) {
  const {
    apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    center = { lat: 37.7749, lng: -122.4194 },
    zoom = 18,
    mapId = '',
    mapOptions = {},
  } = options;

  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const mapRef = useRef(null);

  // Load Google Maps API
  useEffect(() => {
    if (!apiKey) {
      console.error('❌ Google Maps API key is missing! Set REACT_APP_GOOGLE_MAPS_API_KEY in .env');
      setError(new Error('Google Maps API key is required'));
      return;
    }

    const loadApi = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log('🗺️ Loading Google Maps API...');
        const loader = getLoader(apiKey);

        // Use cached promise if already loading
        if (!loadPromise) {
          loadPromise = loader.load();
        }

        await loadPromise;
        console.log('✅ Google Maps API loaded successfully');
        setIsLoaded(true);
      } catch (err) {
        console.error('❌ Failed to load Google Maps API:', err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadApi();
  }, [apiKey]);

  // Initialize map when API is loaded and container is available
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) {
      console.log('🗺️ Map init check:', { isLoaded, hasContainer: !!containerRef.current, hasMap: !!mapRef.current });
      return;
    }

    try {
      console.log('🗺️ Initializing map...', { center, zoom });
      const mapConfig = {
        center,
        zoom,
        mapTypeId: 'satellite',
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: window.google.maps.ControlPosition.TOP_RIGHT,
          mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
        },
        streetViewControl: false,
        fullscreenControl: true,
        fullscreenControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_TOP,
        },
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
        gestureHandling: 'greedy',
        tilt: 0,
        rotateControl: false,
        ...mapOptions,
      };

      if (mapId) {
        mapConfig.mapId = mapId;
      }

      const newMap = new window.google.maps.Map(containerRef.current, mapConfig);
      mapRef.current = newMap;
      setMapInstance(newMap);
      console.log('✅ Map initialized successfully');
    } catch (err) {
      console.error('❌ Failed to initialize map:', err);
      setError(err);
    }
  }, [isLoaded, containerRef, center, zoom, mapId, mapOptions]);

  // Update center
  const setCenter = useCallback(
    (newCenter) => {
      if (mapInstance && newCenter) {
        mapInstance.setCenter(newCenter);
      }
    },
    [mapInstance]
  );

  // Update zoom
  const setZoom = useCallback(
    (newZoom) => {
      if (mapInstance && typeof newZoom === 'number') {
        mapInstance.setZoom(newZoom);
      }
    },
    [mapInstance]
  );

  // Fit bounds
  const fitBounds = useCallback(
    (bounds, padding = 50) => {
      if (mapInstance && bounds) {
        const googleBounds = new window.google.maps.LatLngBounds();

        if (Array.isArray(bounds)) {
          // Array of LatLng points
          bounds.forEach((point) => {
            googleBounds.extend(point);
          });
        } else if (bounds.north && bounds.south && bounds.east && bounds.west) {
          // LatLngBoundsLiteral
          googleBounds.extend({ lat: bounds.north, lng: bounds.east });
          googleBounds.extend({ lat: bounds.south, lng: bounds.west });
        }

        mapInstance.fitBounds(googleBounds, padding);
      }
    },
    [mapInstance]
  );

  // Pan to location
  const panTo = useCallback(
    (location) => {
      if (mapInstance && location) {
        mapInstance.panTo(location);
      }
    },
    [mapInstance]
  );

  // Get current bounds
  const getBounds = useCallback(() => {
    if (mapInstance) {
      const bounds = mapInstance.getBounds();
      if (bounds) {
        return {
          north: bounds.getNorthEast().lat(),
          south: bounds.getSouthWest().lat(),
          east: bounds.getNorthEast().lng(),
          west: bounds.getSouthWest().lng(),
        };
      }
    }
    return null;
  }, [mapInstance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Note: Google Maps doesn't have a destroy method
      // We just clear the reference
      mapRef.current = null;
    };
  }, []);

  return {
    map: mapInstance,
    isLoaded,
    isLoading,
    error,
    setCenter,
    setZoom,
    fitBounds,
    panTo,
    getBounds,
  };
}

/**
 * Helper to check if Google Maps API is available
 * @returns {boolean} True if API is loaded
 */
export function isGoogleMapsLoaded() {
  return typeof window !== 'undefined' && window.google && window.google.maps;
}

/**
 * Create a LatLng object from coordinates
 * @param {{lat: number, lng: number}} coords - Coordinates
 * @returns {google.maps.LatLng|null} LatLng object
 */
export function createLatLng(coords) {
  if (!isGoogleMapsLoaded() || !coords) return null;
  return new window.google.maps.LatLng(coords.lat, coords.lng);
}

/**
 * Create bounds from polygon points
 * @param {Array<{lat: number, lng: number}>} points - Array of points
 * @returns {google.maps.LatLngBounds|null} Bounds object
 */
export function createBoundsFromPoints(points) {
  if (!isGoogleMapsLoaded() || !points || points.length === 0) return null;

  const bounds = new window.google.maps.LatLngBounds();
  points.forEach((point) => {
    bounds.extend(createLatLng(point));
  });

  return bounds;
}

export default useGoogleMap;
