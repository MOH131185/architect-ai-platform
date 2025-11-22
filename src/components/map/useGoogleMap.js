/**
 * useGoogleMap.js
 * 
 * React hook for Google Maps initialization and management
 * Uses @googlemaps/js-api-loader for modern API loading
 * 
 * @module useGoogleMap
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

/**
 * Custom hook for Google Maps management
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Google Maps API key
 * @param {HTMLElement} options.mapContainer - Map container element
 * @param {{lat: number, lng: number}} options.center - Initial center position
 * @param {number} options.zoom - Initial zoom level
 * @param {Object} options.mapOptions - Additional map options
 * @returns {Object} Map instance and utilities
 */
export function useGoogleMap({
  apiKey,
  mapContainer,
  center = { lat: 37.7749, lng: -122.4194 },
  zoom = 18,
  mapOptions = {}
}) {
  const [map, setMap] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [google, setGoogle] = useState(null);
  
  const loaderRef = useRef(null);
  const mapInstanceRef = useRef(null);

  /**
   * Track if we've attempted initialization
   */
  const initAttempted = useRef(false);

  /**
   * Initialize Google Maps API
   */
  useEffect(() => {
    if (!apiKey) {
      console.error('Google Maps API key is missing');
      setError(new Error('Google Maps API key is required'));
      return;
    }

    if (!mapContainer) {
      // Reset init flag when container is removed
      if (initAttempted.current) {
        console.log('Map container removed, will reinitialize when available');
        initAttempted.current = false;
      }
      return;
    }

    // Skip if already initialized
    if (initAttempted.current || isLoaded || isLoading) {
      return;
    }

    console.log('Initializing Google Maps...', { apiKey: apiKey.substring(0, 10) + '...' });
    initAttempted.current = true;

    const initializeMap = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Create loader instance
        if (!loaderRef.current) {
          loaderRef.current = new Loader({
            apiKey,
            version: 'weekly',
            libraries: ['places', 'drawing', 'geometry']
          });
        }

        // Load Google Maps
        const googleMaps = await loaderRef.current.load();
        setGoogle(googleMaps);

        // Create map instance
        const mapInstance = new googleMaps.maps.Map(mapContainer, {
          center,
          zoom,
          mapTypeId: googleMaps.maps.MapTypeId.HYBRID,
          tilt: 0,
          heading: 0,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: true,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
          ...mapOptions
        });

        mapInstanceRef.current = mapInstance;
        setMap(mapInstance);
        setIsLoaded(true);
        setIsLoading(false);

        console.log('Google Maps loaded successfully!', {
          center,
          zoom,
          mapType: 'HYBRID'
        });

      } catch (err) {
        console.error('Error loading Google Maps:', err);
        setError(err);
        setIsLoading(false);
      }
    };

    initializeMap();
  }, [apiKey, mapContainer, center, zoom, mapOptions, isLoaded, isLoading]);

  /**
   * Pan to location
   */
  const panTo = useCallback((location) => {
    if (map && location) {
      map.panTo(location);
    }
  }, [map]);

  /**
   * Set zoom level
   */
  const setZoom = useCallback((zoomLevel) => {
    if (map) {
      map.setZoom(zoomLevel);
    }
  }, [map]);

  /**
   * Fit bounds to include all points
   */
  const fitBounds = useCallback((points) => {
    if (!map || !google || !points || points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach(point => {
      bounds.extend(point);
    });

    map.fitBounds(bounds);
  }, [map, google]);

  /**
   * Get current map bounds
   */
  const getBounds = useCallback(() => {
    if (!map) return null;
    return map.getBounds();
  }, [map]);

  /**
   * Get current map center
   */
  const getCenter = useCallback(() => {
    if (!map) return null;
    const center = map.getCenter();
    return {
      lat: center.lat(),
      lng: center.lng()
    };
  }, [map]);

  /**
   * Get current zoom level
   */
  const getZoom = useCallback(() => {
    if (!map) return null;
    return map.getZoom();
  }, [map]);

  /**
   * Add event listener to map
   */
  const addListener = useCallback((event, handler) => {
    if (!map || !google) return null;
    return google.maps.event.addListener(map, event, handler);
  }, [map, google]);

  /**
   * Remove event listener
   */
  const removeListener = useCallback((listener) => {
    if (!google || !listener) return;
    google.maps.event.removeListener(listener);
  }, [google]);

  /**
   * Clear all listeners
   */
  const clearListeners = useCallback((event) => {
    if (!map || !google) return;
    google.maps.event.clearListeners(map, event);
  }, [map, google]);

  /**
   * Geocode address to coordinates
   */
  const geocodeAddress = useCallback(async (address) => {
    if (!google) {
      throw new Error('Google Maps not loaded');
    }

    const geocoder = new google.maps.Geocoder();
    
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const location = results[0].geometry.location;
          resolve({
            lat: location.lat(),
            lng: location.lng(),
            formattedAddress: results[0].formatted_address,
            placeId: results[0].place_id
          });
        } else {
          reject(new Error(`Geocoding failed: ${status}`));
        }
      });
    });
  }, [google]);

  /**
   * Reverse geocode coordinates to address
   */
  const reverseGeocode = useCallback(async (location) => {
    if (!google) {
      throw new Error('Google Maps not loaded');
    }

    const geocoder = new google.maps.Geocoder();
    
    return new Promise((resolve, reject) => {
      geocoder.geocode({ location }, (results, status) => {
        if (status === 'OK' && results[0]) {
          resolve({
            formattedAddress: results[0].formatted_address,
            placeId: results[0].place_id,
            addressComponents: results[0].address_components
          });
        } else {
          reject(new Error(`Reverse geocoding failed: ${status}`));
        }
      });
    });
  }, [google]);

  /**
   * Create marker
   */
  const createMarker = useCallback((options) => {
    if (!google || !map) return null;

    return new google.maps.Marker({
      map,
      ...options
    });
  }, [google, map]);

  /**
   * Create polygon
   */
  const createPolygon = useCallback((options) => {
    if (!google || !map) return null;

    return new google.maps.Polygon({
      map,
      ...options
    });
  }, [google, map]);

  /**
   * Create polyline
   */
  const createPolyline = useCallback((options) => {
    if (!google || !map) return null;

    return new google.maps.Polyline({
      map,
      ...options
    });
  }, [google, map]);

  /**
   * Create info window
   */
  const createInfoWindow = useCallback((options) => {
    if (!google) return null;

    return new google.maps.InfoWindow(options);
  }, [google]);

  /**
   * Cleanup map instance
   */
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        // Clear all listeners
        if (google) {
          google.maps.event.clearInstanceListeners(mapInstanceRef.current);
        }
      }
    };
  }, [google]);

  return {
    // State
    map,
    google,
    isLoaded,
    isLoading,
    error,

    // Map controls
    panTo,
    setZoom,
    fitBounds,
    getBounds,
    getCenter,
    getZoom,

    // Event handling
    addListener,
    removeListener,
    clearListeners,

    // Geocoding
    geocodeAddress,
    reverseGeocode,

    // Object creation
    createMarker,
    createPolygon,
    createPolyline,
    createInfoWindow
  };
}

export default useGoogleMap;

