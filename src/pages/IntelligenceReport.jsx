import React, { useRef, useEffect, useState } from 'react';
import { Sun, MapPin, Building2, ArrowRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { useDesignContext } from '../context/DesignContext.jsx';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow.js';
import { useLocationData } from '../hooks/useLocationData.js';
import PrecisionSiteDrawer from '../components/PrecisionSiteDrawer.jsx';
import SiteBoundaryInfo from '../components/SiteBoundaryInfo.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import logger from '../utils/logger.js';


/**
 * IntelligenceReport - Step 2: Display location intelligence analysis
 *
 * Features:
 * - Climate analysis with seasonal data
 * - Zoning information and regulations
 * - Architectural style recommendations
 * - 3D Google Maps view
 * - Site polygon drawing interface
 * - Site boundary detection results
 *
 * @component
 */
const IntelligenceReport = () => {
  const { locationData } = useDesignContext();
  const { nextStep, prevStep } = useArchitectWorkflow();
  const { sitePolygon, siteMetrics, updateSitePolygon } = useLocationData();

  // Map state for Google Maps integration
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Initialize Google Maps when location data is available
  useEffect(() => {
    if (!locationData || !locationData.coordinates) {
      return;
    }

    // Check if Google Maps API is already loaded
    if (window.google && window.google.maps) {
      initializeMap();
      return;
    }

    // Load Google Maps API if not already loaded
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setMapError('Google Maps API key not configured');
      logger.error('Google Maps API key missing');
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for existing script to load
      existingScript.addEventListener('load', initializeMap);
      return () => existingScript.removeEventListener('load', initializeMap);
    }

    // Load Google Maps API script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=drawing,geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      logger.info('✅ Google Maps API loaded successfully');
      initializeMap();
    };

    script.onerror = () => {
      setMapError('Failed to load Google Maps API');
      logger.error('Failed to load Google Maps API');
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [locationData]);

  // Initialize the map instance
  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps) {
      logger.info('⏳ Cannot initialize map - prerequisites not met');
      return;
    }

    // Prevent double initialization
    if (mapInstanceRef.current) {
      logger.info('ℹ️ Map already initialized');
      return;
    }

    try {
      const { lat, lng } = locationData.coordinates;

      const mapOptions = {
        center: { lat, lng },
        zoom: 18,
        mapTypeId: 'hybrid', // Satellite view with labels
        tilt: 0, // Top-down view for site drawing
        heading: 0,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: window.google.maps.MapTypeControlStyle.DROPDOWN_MENU,
          position: window.google.maps.ControlPosition.TOP_RIGHT
        },
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER
        }
      };

      const map = new window.google.maps.Map(mapRef.current, mapOptions);

      // Wait for map to be fully initialized before using it
      window.google.maps.event.addListenerOnce(map, 'idle', () => {
        mapInstanceRef.current = map;
        setIsMapLoaded(true);
        logger.info('✅ Google Maps fully initialized and ready at', lat, lng);

        // Add a marker for the site center after map is ready
        try {
          new window.google.maps.Marker({
            position: { lat, lng },
            map: map,
            title: locationData.address,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#FF0000',
              fillOpacity: 0.8,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            }
          });
        } catch (markerError) {
          console.warn('Failed to add center marker:', markerError);
        }
      });

    } catch (error) {
      logger.error('Error initializing map:', error);
      setMapError('Failed to initialize map: ' + error.message);
    }
  };

  if (!locationData) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center text-amber-600 mb-4">
          <AlertCircle className="w-6 h-6 mr-2" />
          <h3 className="text-lg font-semibold">No Location Data</h3>
        </div>
        <p className="text-gray-600 mb-6">
          Please complete location analysis first.
        </p>
        <button
          onClick={prevStep}
          className="flex items-center text-blue-600 hover:text-blue-700 font-medium"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Location Analysis
        </button>
      </div>
    );
  }

  const climate = locationData.climate || {};
  const zoning = locationData.zoning || {};
  const sunPath = locationData.sunPath || {};

  return (
    <ErrorBoundary>
      <div className="space-y-8 animate-fadeIn">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl shadow-2xl p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <MapPin className="w-8 h-8 mr-3" />
                <div>
                  <h2 className="text-2xl font-bold">Site Intelligence Report</h2>
                  <p className="text-blue-100">{locationData.address}</p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <p className="text-sm text-blue-100">Climate Type</p>
                <p className="text-lg font-semibold">{climate.type || 'N/A'}</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <p className="text-sm text-blue-100">Zoning</p>
                <p className="text-lg font-semibold">{zoning.type || 'N/A'}</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <p className="text-sm text-blue-100">Recommended Style</p>
                <p className="text-lg font-semibold">{locationData.recommendedStyle || 'Contemporary'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Climate Analysis */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center mb-4">
            <Sun className="w-6 h-6 text-yellow-500 mr-2" />
            <h3 className="text-xl font-bold text-gray-800">Climate Analysis</h3>
          </div>

          {climate.seasonal && (
            <div className="grid md:grid-cols-4 gap-4">
              {Object.entries(climate.seasonal).map(([season, data]) => (
                <div key={season} className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-semibold text-gray-800 capitalize mb-2">{season}</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">Temp:</span> {data.avgTemp || 'N/A'}
                    </p>
                    <p>
                      <span className="font-medium">Rain:</span> {data.precipitation || 'N/A'}
                    </p>
                    <p>
                      <span className="font-medium">Solar:</span> {data.solar || 'N/A'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sunPath.optimalOrientation && (
            <div className="mt-4 p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Optimal Orientation:</span> {sunPath.optimalOrientation}
              </p>
            </div>
          )}
        </div>

        {/* Zoning Information */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center mb-4">
            <Building2 className="w-6 h-6 text-blue-600 mr-2" />
            <h3 className="text-xl font-bold text-gray-800">Zoning & Regulations</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Zoning Type</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.type || 'Mixed Use'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Max Height</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.maxHeight || 'Check local codes'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Density Limit</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.density || 'Standard'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Setbacks</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.setbacks || 'Per code'}</p>
            </div>
          </div>
        </div>

        {/* Site Boundary Drawing with Google Maps */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Site Boundary (Optional)</h3>

          {siteMetrics && (
            <SiteBoundaryInfo
              shapeType={siteMetrics.shapeType}
              confidence={siteMetrics.confidence}
              source={siteMetrics.source}
              area={siteMetrics.areaM2}
              vertexCount={siteMetrics.vertexCount}
            />
          )}

          {/* Google Maps Container */}
          <div className="relative mt-4">
            {mapError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm">
                  <strong>Map Error:</strong> {mapError}
                </p>
                <p className="text-red-600 text-xs mt-1">
                  Site boundary editing requires Google Maps. Please check your API key configuration.
                </p>
              </div>
            )}

            {!isMapLoaded && !mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg z-10" style={{ height: '500px' }}>
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading Google Maps...</p>
                </div>
              </div>
            )}

            {/* Map Container - fixed height */}
            <div
              ref={mapRef}
              className="w-full rounded-lg border-2 border-gray-200 shadow-inner"
              style={{
                height: '500px',
                minHeight: '500px',
                position: 'relative'
              }}
            />

            {/* Precision Site Drawer - Overlays on map with editing controls */}
            {isMapLoaded && mapInstanceRef.current && (
              <PrecisionSiteDrawer
                map={mapInstanceRef.current}
                onPolygonComplete={updateSitePolygon}
                initialPolygon={sitePolygon}
                enabled={true}
              />
            )}
          </div>

          <p className="text-sm text-gray-500 mt-4">
            <strong>Draw your site boundary:</strong> Click on the map to place vertices.
            Hold Shift for 90° angles. Right-click to finish. Hover over corner markers to see them enlarge, then drag to adjust.
            Edit edge lengths and angles in the geometry panel on the right.
          </p>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">✨ Drawing & Editing Features:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Click to place vertices freely</li>
              <li>• Hold <kbd className="px-2 py-1 bg-white rounded">Shift</kbd> to snap to 90° angles</li>
              <li>• Type numbers + <kbd className="px-2 py-1 bg-white rounded">Enter</kbd> for exact distances</li>
              <li>• Press <kbd className="px-2 py-1 bg-white rounded">ESC</kbd> to undo last point</li>
              <li>• Right-click when done (3+ vertices required)</li>
              <li>• <strong>Hover over numbered corner circles</strong> - they enlarge for easier grabbing</li>
              <li>• <strong>Drag corners</strong> to reshape the boundary visually</li>
              <li>• Edit precise lengths/angles in the side panel</li>
            </ul>
          </div>
        </div>

        {/* Architectural Recommendations */}
        {locationData.localStyles && locationData.localStyles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Local Architectural Styles</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {locationData.localStyles.map((style, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-gray-800">{style}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={prevStep}
            className="flex items-center px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          <button
            onClick={nextStep}
            className="flex items-center px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 font-medium"
          >
            Continue to Portfolio
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default IntelligenceReport;
