/**
 * useGeometryViews Hook
 *
 * Manages separate state for axonometric, perspective, and interior views
 * (no shared image variable as required by M5)
 */

import { useState, useCallback } from 'react';

export function useGeometryViews() {
  // Separate state keys for each view type (M5 requirement)
  const [axonUrl, setAxonUrl] = useState(null);
  const [perspUrl, setPerspUrl] = useState(null);
  const [interiorUrl, setInteriorUrl] = useState(null);

  // Additional metadata
  const [axonMetadata, setAxonMetadata] = useState(null);
  const [perspMetadata, setPerspMetadata] = useState(null);
  const [interiorMetadata, setInteriorMetadata] = useState(null);

  // Loading states
  const [isLoadingAxon, setIsLoadingAxon] = useState(false);
  const [isLoadingPersp, setIsLoadingPersp] = useState(false);
  const [isLoadingInterior, setIsLoadingInterior] = useState(false);

  // Error states
  const [axonError, setAxonError] = useState(null);
  const [perspError, setPerspError] = useState(null);
  const [interiorError, setInteriorError] = useState(null);

  /**
   * Set axonometric view
   */
  const setAxonometric = useCallback((url, metadata = {}) => {
    setAxonUrl(url);
    setAxonMetadata({
      ...metadata,
      updatedAt: new Date().toISOString()
    });
    setAxonError(null);
  }, []);

  /**
   * Set perspective view
   */
  const setPerspective = useCallback((url, metadata = {}) => {
    setPerspUrl(url);
    setPerspMetadata({
      ...metadata,
      updatedAt: new Date().toISOString()
    });
    setPerspError(null);
  }, []);

  /**
   * Set interior view
   */
  const setInterior = useCallback((url, metadata = {}) => {
    setInteriorUrl(url);
    setInteriorMetadata({
      ...metadata,
      updatedAt: new Date().toISOString()
    });
    setInteriorError(null);
  }, []);

  /**
   * Set all views at once from render API response
   */
  const setAllViews = useCallback((response) => {
    if (response.views) {
      if (response.views.axon) {
        setAxonometric(response.views.axon.url, {
          filename: response.views.axon.filename,
          width: response.views.axon.width,
          height: response.views.axon.height,
          size: response.views.axon.size
        });
      }

      if (response.views.persp) {
        setPerspective(response.views.persp.url, {
          filename: response.views.persp.filename,
          width: response.views.persp.width,
          height: response.views.persp.height,
          size: response.views.persp.size
        });
      }

      if (response.views.interior) {
        setInterior(response.views.interior.url, {
          filename: response.views.interior.filename,
          width: response.views.interior.width,
          height: response.views.interior.height,
          size: response.views.interior.size
        });
      }
    }
  }, [setAxonometric, setPerspective, setInterior]);

  /**
   * Clear all views
   */
  const clearAllViews = useCallback(() => {
    setAxonUrl(null);
    setPerspUrl(null);
    setInteriorUrl(null);
    setAxonMetadata(null);
    setPerspMetadata(null);
    setInteriorMetadata(null);
    setAxonError(null);
    setPerspError(null);
    setInteriorError(null);
  }, []);

  /**
   * Set loading state for specific view
   */
  const setLoading = useCallback((viewType, isLoading) => {
    switch (viewType) {
      case 'axon':
        setIsLoadingAxon(isLoading);
        break;
      case 'persp':
        setIsLoadingPersp(isLoading);
        break;
      case 'interior':
        setIsLoadingInterior(isLoading);
        break;
      case 'all':
        setIsLoadingAxon(isLoading);
        setIsLoadingPersp(isLoading);
        setIsLoadingInterior(isLoading);
        break;
      default:
        console.warn('Unknown view type:', viewType);
    }
  }, []);

  /**
   * Set error for specific view
   */
  const setError = useCallback((viewType, error) => {
    switch (viewType) {
      case 'axon':
        setAxonError(error);
        break;
      case 'persp':
        setPerspError(error);
        break;
      case 'interior':
        setInteriorError(error);
        break;
      default:
        console.warn('Unknown view type:', viewType);
    }
  }, []);

  /**
   * Check if any view is loading
   */
  const isAnyLoading = isLoadingAxon || isLoadingPersp || isLoadingInterior;

  /**
   * Check if all views are loaded
   */
  const allViewsLoaded = axonUrl && perspUrl && interiorUrl;

  /**
   * Check if any view has error
   */
  const hasAnyError = axonError || perspError || interiorError;

  /**
   * Get view count
   */
  const loadedViewCount = [axonUrl, perspUrl, interiorUrl].filter(Boolean).length;

  /**
   * Get all view URLs as array
   */
  const getAllUrls = useCallback(() => {
    return {
      axon: axonUrl,
      persp: perspUrl,
      interior: interiorUrl
    };
  }, [axonUrl, perspUrl, interiorUrl]);

  /**
   * Get all metadata
   */
  const getAllMetadata = useCallback(() => {
    return {
      axon: axonMetadata,
      persp: perspMetadata,
      interior: interiorMetadata
    };
  }, [axonMetadata, perspMetadata, interiorMetadata]);

  return {
    // Individual URL states (M5 requirement: separate state keys)
    axonUrl,
    perspUrl,
    interiorUrl,

    // Metadata
    axonMetadata,
    perspMetadata,
    interiorMetadata,

    // Setters
    setAxonometric,
    setPerspective,
    setInterior,
    setAllViews,
    clearAllViews,

    // Loading states
    isLoadingAxon,
    isLoadingPersp,
    isLoadingInterior,
    isAnyLoading,
    setLoading,

    // Error states
    axonError,
    perspError,
    interiorError,
    hasAnyError,
    setError,

    // Helper flags
    allViewsLoaded,
    loadedViewCount,

    // Getters
    getAllUrls,
    getAllMetadata
  };
}

export default useGeometryViews;
