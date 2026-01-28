/**
 * SiteBoundaryEditor.jsx
 * 
 * Complete Google Maps-powered site boundary editor
 * Features: auto-detection, drag handles, manual editing, drawing tools
 * Integrates with ArchitectAI workflow system
 * 
 * @module SiteBoundaryEditor
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGoogleMap } from './useGoogleMap.js';
import { usePolygonTools } from './usePolygonTools.js';
import { createPolygonEditor } from './polygonEditor.js';
import {
  fetchAutoBoundary,
  calculateBounds,
  boundsToGoogleBounds
} from './mapUtils';
import { calculateEdgeLengths } from '../../utils/geometry.js';
import {
  calculateSegmentData,
  validatePolygonAngles,
  autoFixPolygonAngles,
  formatAngle,
  formatLength
} from '../../utils/sitePolygonUtils';
import EntranceCompassOverlay from './EntranceCompassOverlay.jsx';
import logger from '../../utils/logger.js';


/**
 * Site Boundary Editor Component
 * @param {Object} props - Component props
 * @param {Array<{lat: number, lng: number}>} props.initialBoundaryPolygon - Initial polygon
 * @param {string} props.siteAddress - Site address
 * @param {Function} props.onBoundaryChange - Callback when boundary changes
 * @param {string} props.apiKey - Google Maps API key
 * @param {{lat: number, lng: number}} props.center - Initial center coordinates
 * @returns {JSX.Element}
 */
export function SiteBoundaryEditor({
  initialBoundaryPolygon = [],
  siteAddress = '',
  onBoundaryChange,
  apiKey,
  center = { lat: 37.7749, lng: -122.4194 }
}) {
  // Refs
  const mapContainerRef = useRef(null);
  const editorRef = useRef(null);

  // State
  const [isEditingEnabled, setIsEditingEnabled] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isLoadingBoundary, setIsLoadingBoundary] = useState(false);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState(null);
  const [editingAngleIndex, setEditingAngleIndex] = useState(null);
  const [tempLengthValue, setTempLengthValue] = useState('');
  const [tempAngleValue, setTempAngleValue] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [showValidation, _setShowValidation] = useState(false);
  const [showSegmentEditor, setShowSegmentEditor] = useState(false);
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);

  // Google Maps hook - pass container ref directly
  // Note: fitBounds is available from hook but we use map.fitBounds() directly
  const {
    map,
    google,
    isLoaded,
    isLoading,
    error: mapError,
    geocodeAddress
  } = useGoogleMap({
    apiKey,
    mapContainer: mapContainerRef.current,
    center,
    zoom: 18
  });

  // Polygon tools hook
  // Note: addVertex, removeVertex, updateVertex, metrics available if needed
  const {
    polygon,
    setPolygon,
    adjustLength,
    adjustAngle,
    clearPolygon,
    undo,
    redo,
    canUndo,
    canRedo,
    exportGeoJSON,
    convertToDNA,
    getFormattedMetrics,
    validateForArchitecture
  } = usePolygonTools(initialBoundaryPolygon);

  /**
   * Initialize polygon from initial prop
   */
  useEffect(() => {
    if (initialBoundaryPolygon && initialBoundaryPolygon.length > 0) {
      setPolygon(initialBoundaryPolygon, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBoundaryPolygon]);

  /**
   * Auto-detect boundary when map loads if no polygon exists
   */
  useEffect(() => {
    if (isLoaded && map && google && polygon.length === 0 && !isLoadingBoundary) {
      handleAutoDetect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, google, polygon.length, isLoadingBoundary]);

  /**
   * Notify parent of boundary changes
   */
  useEffect(() => {
    if (onBoundaryChange && polygon.length >= 3) {
      const formattedMetrics = getFormattedMetrics();
      const dna = convertToDNA();

      // Find dominant edge (likely street-facing)
      const edges = calculateEdgeLengths(polygon);
      let dominantEdge = null;
      if (edges.length > 0) {
        dominantEdge = edges.reduce((longest, edge) => 
          edge.length > longest.length ? edge : longest
        );
      }

      onBoundaryChange({
        polygon,
        metrics: formattedMetrics,
        dna,
        geoJSON: exportGeoJSON(),
        primaryFrontEdge: dominantEdge ? {
          index: dominantEdge.index,
          length: dominantEdge.length,
          bearing: calculateBearing(dominantEdge.start, dominantEdge.end)
        } : null
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygon]);

  /**
   * Calculate bearing between two points
   * @private
   */
  const calculateBearing = (point1, point2) => {
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;

    return bearing;
  };

  // Ref for polygon overlay (non-editable display)
  const polygonOverlayRef = useRef(null);

  /**
   * Display polygon overlay (always visible when polygon exists)
   */
  useEffect(() => {
    if (!map || !google || !isLoaded) return;

    // Remove existing overlay
    if (polygonOverlayRef.current) {
      polygonOverlayRef.current.setMap(null);
      polygonOverlayRef.current = null;
    }

    // Create new overlay if polygon exists and not in editing mode
    if (polygon.length >= 3 && !isEditingEnabled) {
      polygonOverlayRef.current = new google.maps.Polygon({
        paths: polygon,
        strokeColor: '#3B82F6',
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: '#3B82F6',
        fillOpacity: 0.2,
        map: map
      });

      // Fit bounds to polygon
      const bounds = calculateBounds(polygon);
      if (bounds) {
        const googleBounds = boundsToGoogleBounds(bounds, google);
        map.fitBounds(googleBounds);
      }
    }

    return () => {
      if (polygonOverlayRef.current) {
        polygonOverlayRef.current.setMap(null);
        polygonOverlayRef.current = null;
      }
    };
  }, [map, google, isLoaded, polygon, isEditingEnabled]);

  /**
   * Initialize polygon editor when editing is enabled
   */
  useEffect(() => {
    if (!map || !google || !isLoaded) return;

    // Create polygon editor
    if (isEditingEnabled && polygon.length >= 3) {
      if (editorRef.current) {
        editorRef.current.destroy();
      }

      editorRef.current = createPolygonEditor(map, google, polygon, {
        onPolygonUpdate: (newPolygon) => {
          setPolygon(newPolygon);
        },
        onVertexAdd: (index, point, newPolygon) => {
          // Vertex added
        },
        onVertexRemove: (index, newPolygon) => {
          // Vertex removed
        },
        enableMidpoints: true,
        enableShiftClickAdd: true,
        enableRightClickRemove: true,
        minVertices: 3
      });

      editorRef.current.enable();
    } else if (editorRef.current) {
      editorRef.current.disable();
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [map, google, isLoaded, polygon, isEditingEnabled, setPolygon]);

  /**
   * Update editor when polygon changes
   */
  useEffect(() => {
    if (editorRef.current && isEditingEnabled) {
      editorRef.current.updatePolygon(polygon);
    }
  }, [polygon, isEditingEnabled]);

  /**
   * Auto-detect boundary
   */
  const handleAutoDetect = useCallback(async () => {
    setIsLoadingBoundary(true);

    try {
      let detectionCenter = center;

      // Geocode address if provided
      if (siteAddress) {
        try {
          const geocoded = await geocodeAddress(siteAddress);
          detectionCenter = { lat: geocoded.lat, lng: geocoded.lng };
        } catch (err) {
          logger.warn('Geocoding failed, using provided center:', err);
        }
      }

      // Fetch auto-detected boundary
      const boundary = await fetchAutoBoundary(siteAddress, detectionCenter);
      setPolygon(boundary);

      // Fit map to boundary
      if (map && google) {
        const bounds = calculateBounds(boundary);
        if (bounds) {
          const googleBounds = boundsToGoogleBounds(bounds, google);
          map.fitBounds(googleBounds);
        }
      }

    } catch (err) {
      logger.error('Auto-detect failed:', err);
    } finally {
      setIsLoadingBoundary(false);
    }
  }, [siteAddress, center, geocodeAddress, setPolygon, map, google]);

  /**
   * Toggle editing mode
   */
  const handleToggleEditing = useCallback(() => {
    setIsEditingEnabled(prev => !prev);
    setIsDrawingMode(false);
  }, []);

  /**
   * Toggle drawing mode
   */
  const handleToggleDrawing = useCallback(() => {
    setIsDrawingMode(prev => !prev);
    setIsEditingEnabled(false);
  }, []);

  /**
   * Fit map to polygon
   */
  const handleFitBounds = useCallback(() => {
    if (polygon.length > 0 && map && google) {
      const bounds = calculateBounds(polygon);
      if (bounds) {
        const googleBounds = boundsToGoogleBounds(bounds, google);
        map.fitBounds(googleBounds);
      }
    }
  }, [polygon, map, google]);

  /**
   * Start editing segment length
   */
  const handleStartEditLength = useCallback((index, currentLength) => {
    setEditingSegmentIndex(index);
    setTempLengthValue(currentLength.toFixed(2));
  }, []);

  /**
   * Save segment length
   */
  const handleSaveLength = useCallback(() => {
    if (editingSegmentIndex !== null && tempLengthValue) {
      const newLength = parseFloat(tempLengthValue);
      if (!isNaN(newLength) && newLength > 0) {
        adjustLength(editingSegmentIndex, newLength);
        
        // Auto-fix if enabled and angles become invalid
        if (autoFixEnabled) {
          setTimeout(() => {
            const validation = validatePolygonAngles(polygon);
            if (!validation.isValid) {
              const fixed = autoFixPolygonAngles(polygon);
              setPolygon(fixed);
            }
          }, 100);
        }
      }
    }
    setEditingSegmentIndex(null);
    setTempLengthValue('');
  }, [editingSegmentIndex, tempLengthValue, adjustLength, autoFixEnabled, polygon, setPolygon]);

  /**
   * Start editing vertex angle
   */
  const handleStartEditAngle = useCallback((index, currentAngle) => {
    setEditingAngleIndex(index);
    setTempAngleValue(currentAngle.toFixed(1));
  }, []);

  /**
   * Save vertex angle
   */
  const handleSaveAngle = useCallback(() => {
    if (editingAngleIndex !== null && tempAngleValue) {
      const newAngle = parseFloat(tempAngleValue);
      if (!isNaN(newAngle) && newAngle > 0 && newAngle < 360) {
        adjustAngle(editingAngleIndex, newAngle);
        
        // Auto-fix if enabled and angles become invalid
        if (autoFixEnabled) {
          setTimeout(() => {
            const validation = validatePolygonAngles(polygon);
            if (!validation.isValid) {
              const fixed = autoFixPolygonAngles(polygon);
              setPolygon(fixed);
            }
          }, 100);
        }
      }
    }
    setEditingAngleIndex(null);
    setTempAngleValue('');
  }, [editingAngleIndex, tempAngleValue, adjustAngle, autoFixEnabled, polygon, setPolygon]);

  /**
   * Export as GeoJSON (available for future UI integration)
   */
  // eslint-disable-next-line no-unused-vars
  const handleExportGeoJSON = useCallback(() => {
    const geoJSON = exportGeoJSON();
    const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-boundary-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportGeoJSON]);

  /**
   * Auto-fix invalid angles
   */
  const handleAutoFix = useCallback(() => {
    const validation = validatePolygonAngles(polygon);
    if (!validation.isValid) {
      const fixed = autoFixPolygonAngles(polygon);
      setPolygon(fixed);
    }
  }, [polygon, setPolygon]);

  /**
   * Reset to initial polygon
   */
  const handleReset = useCallback(() => {
    if (initialBoundaryPolygon && initialBoundaryPolygon.length > 0) {
      setPolygon(initialBoundaryPolygon, false);
      handleFitBounds();
    }
  }, [initialBoundaryPolygon, setPolygon, handleFitBounds]);

  /**
   * Toggle segment editor panel
   */
  const handleToggleSegmentEditor = useCallback(() => {
    setShowSegmentEditor(prev => !prev);
  }, []);

  /**
   * Validate polygon
   */
  const validation = validateForArchitecture();
  const formattedMetrics = getFormattedMetrics();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Site Boundary Editor</h2>
        <p className="text-blue-100">
          {siteAddress || 'Define your site boundary using the interactive map'}
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleAutoDetect}
            disabled={isLoadingBoundary}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors font-medium"
          >
            {isLoadingBoundary ? 'Detecting...' : '🔍 Auto-Detect Boundary'}
          </button>

          <button
            onClick={handleToggleEditing}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isEditingEnabled
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {isEditingEnabled ? '✓ Editing Enabled' : '✏️ Enable Editing'}
          </button>

          <button
            onClick={handleToggleDrawing}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDrawingMode
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {isDrawingMode ? '✓ Drawing Mode' : '✏️ Draw Polygon'}
          </button>

          <button
            onClick={handleFitBounds}
            disabled={polygon.length === 0}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 transition-colors font-medium"
          >
            📍 Fit to Bounds
          </button>

          <button
            onClick={undo}
            disabled={!canUndo}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 transition-colors font-medium"
          >
            ↶ Undo
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 transition-colors font-medium"
          >
            ↷ Redo
          </button>

          <button
            onClick={clearPolygon}
            disabled={polygon.length === 0}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:bg-slate-100 disabled:text-slate-400 transition-colors font-medium"
          >
            🗑️ Clear
          </button>

          <button
            onClick={handleReset}
            disabled={!initialBoundaryPolygon || initialBoundaryPolygon.length === 0}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 transition-colors font-medium"
          >
            🔄 Reset
          </button>

          <button
            onClick={handleAutoFix}
            disabled={polygon.length < 3}
            className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:bg-slate-100 disabled:text-slate-400 transition-colors font-medium"
          >
            🔧 Auto-Fix
          </button>

          <button
            onClick={handleToggleSegmentEditor}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              showSegmentEditor
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {showSegmentEditor ? '✓ Segment Editor' : '📐 Segment Editor'}
          </button>
        </div>

        {/* Instructions */}
        <AnimatePresence>
          {isEditingEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg"
            >
              <p className="text-sm text-blue-800">
                <strong>Editing Mode:</strong> Drag vertices to move • Shift+Click to add vertex • Right-click vertex to remove • Click midpoints to add vertex
              </p>
            </motion.div>
          )}

          {isDrawingMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg"
            >
              <p className="text-sm text-purple-800">
                <strong>Drawing Mode:</strong> Click on map to add points • Double-click to finish • Minimum 3 points required
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Segment Editor Panel */}
      {showSegmentEditor && polygon.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-white rounded-lg shadow-lg p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Advanced Segment Editor</h3>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={autoFixEnabled}
                onChange={(e) => setAutoFixEnabled(e.target.checked)}
                className="rounded"
              />
              Auto-fix invalid angles
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {calculateSegmentData(polygon).map((segment) => (
              <div
                key={segment.index}
                className="p-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-900">Segment {segment.index + 1}</span>
                  <span className="text-xs text-slate-500">
                    Bearing: {segment.bearing.toFixed(1)}°
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Length</label>
                    {editingSegmentIndex === segment.index ? (
                      <input
                        type="number"
                        value={tempLengthValue}
                        onChange={(e) => setTempLengthValue(e.target.value)}
                        onBlur={handleSaveLength}
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveLength()}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                        step="0.1"
                      />
                    ) : (
                      <button
                        onClick={() => handleStartEditLength(segment.index, segment.length)}
                        className="w-full text-left px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        {formatLength(segment.length).meters}
                      </button>
                    )}
                    <span className="text-xs text-slate-500 mt-0.5 block">
                      {formatLength(segment.length).feet}
                    </span>
                  </div>
                  
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Angle</label>
                    {editingAngleIndex === segment.index ? (
                      <input
                        type="number"
                        value={tempAngleValue}
                        onChange={(e) => setTempAngleValue(e.target.value)}
                        onBlur={handleSaveAngle}
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveAngle()}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                        step="0.1"
                        min="5"
                        max="355"
                      />
                    ) : (
                      <button
                        onClick={() => handleStartEditAngle(segment.index, segment.angle)}
                        className="w-full text-left px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        {formatAngle(segment.angle)}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Map Container */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden relative">
        {/* Entrance Compass Overlay */}
        {polygon.length >= 3 && (
          <EntranceCompassOverlay
            entranceDirection={null}
            show={false}
            position="top-right"
            size="md"
          />
        )}

        {/* Loading Overlay */}
        {(isLoading || !isLoaded) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white bg-opacity-90">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">Loading Google Maps...</p>
              <p className="text-sm text-slate-500 mt-2">
                {!mapContainerRef.current ? 'Preparing container...' : 'Initializing map...'}
              </p>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-50">
            <div className="text-center max-w-md p-6">
              <div className="text-red-600 text-5xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-900 mb-2">Map Loading Error</h3>
              <p className="text-red-700 mb-4">{mapError.message}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        )}

        {/* Map Container - Always Rendered */}
        <div
          ref={mapContainerRef}
          className="w-full h-[500px] bg-slate-100"
          style={{ minHeight: '500px' }}
        />
      </div>

      {/* Metrics Cards */}
      {polygon.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
            <div className="text-sm font-medium opacity-90">Area</div>
            <div className="text-2xl font-bold mt-1">{formattedMetrics.area.formatted}</div>
            <div className="text-xs opacity-75 mt-1">{formattedMetrics.area.acres} acres</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white">
            <div className="text-sm font-medium opacity-90">Perimeter</div>
            <div className="text-2xl font-bold mt-1">{formattedMetrics.perimeter.formatted}</div>
            <div className="text-xs opacity-75 mt-1">{formattedMetrics.perimeter.feet} ft</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
            <div className="text-sm font-medium opacity-90">Vertices</div>
            <div className="text-2xl font-bold mt-1">{formattedMetrics.vertexCount}</div>
            <div className="text-xs opacity-75 mt-1">corners</div>
          </div>

          <div className={`bg-gradient-to-br rounded-lg p-4 text-white ${
            formattedMetrics.isValid ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'
          }`}>
            <div className="text-sm font-medium opacity-90">Status</div>
            <div className="text-2xl font-bold mt-1">
              {formattedMetrics.isValid ? '✓ Valid' : '✗ Invalid'}
            </div>
            <div className="text-xs opacity-75 mt-1">
              {formattedMetrics.isSelfIntersecting ? 'Self-intersecting' : 'No issues'}
            </div>
          </div>
        </motion.div>
      )}

      {/* Validation Messages */}
      {showValidation && !validation.isValid && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-lg p-4"
        >
          <h4 className="font-bold text-red-900 mb-2">Validation Errors:</h4>
          <ul className="list-disc list-inside space-y-1">
            {validation.errors.map((error, index) => (
              <li key={index} className="text-red-700 text-sm">{error}</li>
            ))}
          </ul>
        </motion.div>
      )}

      {validation.warnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
        >
          <h4 className="font-bold text-yellow-900 mb-2">Warnings:</h4>
          <ul className="list-disc list-inside space-y-1">
            {validation.warnings.map((warning, index) => (
              <li key={index} className="text-yellow-700 text-sm">{warning}</li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Segment Table */}
      {polygon.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg overflow-hidden"
        >
          <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4">
            <h3 className="text-lg font-bold text-white">Segment Details</h3>
            <p className="text-slate-300 text-sm">Click values to edit manually</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Segment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Length (m)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Angle (°)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {formattedMetrics.segments.map((segment, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      Segment {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                      {editingSegmentIndex === index ? (
                        <input
                          type="number"
                          value={tempLengthValue}
                          onChange={(e) => setTempLengthValue(e.target.value)}
                          onBlur={handleSaveLength}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveLength()}
                          className="w-24 px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => handleStartEditLength(index, segment.length.value)}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {segment.length.formatted}
                        </button>
                      )}
                      <span className="text-xs text-slate-500 ml-2">
                        ({segment.length.feet} ft)
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                      {editingAngleIndex === index ? (
                        <input
                          type="number"
                          value={tempAngleValue}
                          onChange={(e) => setTempAngleValue(e.target.value)}
                          onBlur={handleSaveAngle}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveAngle()}
                          className="w-24 px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => handleStartEditAngle(index, segment.angle.value)}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {segment.angle.formatted}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default SiteBoundaryEditor;

