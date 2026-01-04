/**
 * Site Boundary Editor Component
 *
 * A professional Google Maps-powered polygon editor for defining
 * site boundaries with real-time geometry calculations.
 *
 * Features:
 * - Auto-detected boundary from address
 * - Draggable vertex markers
 * - Shift+Click to add vertex
 * - Right-click to delete vertex
 * - Live segment/angle calculations
 * - Integration with ArchitectAI workflow
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Map,
  Edit3,
  Eye,
  RotateCcw,
  Download,
  AlertCircle,
  CheckCircle,
  MapPin,
  Maximize2,
  Move,
  Trash2,
  Plus,
  Info,
} from 'lucide-react';

// Import hooks and utilities
import { useGoogleMap, isGoogleMapsLoaded } from './useGoogleMap.js';
import { PolygonEditor } from './polygonEditor.js';
import {
  computeSegmentLengths,
  computeAngles,
  computeArea,
  computePerimeter,
  computeCentroid,
  convertToDNA,
  fetchAutoBoundary,
  validatePolygon,
} from './mapUtils';

// Import UI components
import { Button, Card, Badge, Spinner, cn } from '../ui.js';

// Animation variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/**
 * @typedef {Object} SiteBoundaryEditorProps
 * @property {string} address - Site address for geocoding
 * @property {{lat: number, lng: number}} coordinates - Site coordinates
 * @property {Array<{lat: number, lng: number}>} initialPolygon - Initial polygon vertices
 * @property {Function} onBoundaryUpdated - Callback when boundary is updated
 * @property {string} className - Additional CSS classes
 */

/**
 * Site Boundary Editor Component
 * @param {SiteBoundaryEditorProps} props - Component props
 */
const SiteBoundaryEditor = ({
  address = '',
  coordinates = null,
  initialPolygon = null,
  onBoundaryUpdated = () => {},
  className = '',
}) => {
  // Debug logging
  console.log('🗺️ SiteBoundaryEditor props:', { address, coordinates, initialPolygon: initialPolygon?.length });

  // Refs
  const mapContainerRef = useRef(null);
  const polygonEditorRef = useRef(null);

  // State
  const [polygon, setPolygon] = useState(initialPolygon || []);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Initialize Google Map
  const {
    map,
    isLoaded: mapLoaded,
    isLoading: mapLoading,
    error: mapError,
    fitBounds,
  } = useGoogleMap(mapContainerRef, {
    center: coordinates || { lat: 37.7749, lng: -122.4194 },
    zoom: 18,
  });

  // Computed geometry values
  const geometry = useMemo(() => {
    if (!polygon || polygon.length < 3) {
      return {
        segments: [],
        angles: [],
        area: 0,
        perimeter: 0,
        centroid: null,
        isValid: false,
        errors: ['Need at least 3 vertices'],
      };
    }

    const segments = computeSegmentLengths(polygon);
    const angles = computeAngles(polygon);
    const area = computeArea(polygon);
    const perimeter = computePerimeter(polygon);
    const centroid = computeCentroid(polygon);
    const validation = validatePolygon(polygon);

    return {
      segments,
      angles,
      area,
      perimeter,
      centroid,
      isValid: validation.valid,
      errors: validation.errors,
    };
  }, [polygon]);

  // Handle polygon updates from editor
  const handlePolygonUpdate = useCallback(
    (newVertices) => {
      setPolygon(newVertices);

      // Notify parent with full boundary data
      const dna = convertToDNA(newVertices);
      onBoundaryUpdated({
        polygon: newVertices,
        segments: dna?.segments || [],
        angles: dna?.angles || [],
        area: dna?.metrics?.area || 0,
        perimeter: dna?.metrics?.perimeter || 0,
        centroid: dna?.centroid || null,
        dna,
      });
    },
    [onBoundaryUpdated]
  );

  // Initialize polygon editor when map is ready
  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Destroy existing editor if any
    if (polygonEditorRef.current) {
      polygonEditorRef.current.destroy();
    }

    // Create polygon editor
    polygonEditorRef.current = new PolygonEditor({
      map,
      vertices: polygon,
      editable: isEditing,
      onUpdate: handlePolygonUpdate,
    });

    // Fit map to polygon
    if (polygon.length > 0) {
      polygonEditorRef.current.fitBounds();
    }

    return () => {
      if (polygonEditorRef.current) {
        polygonEditorRef.current.destroy();
        polygonEditorRef.current = null;
      }
    };
  }, [map, mapLoaded, handlePolygonUpdate]);

  // Update editor when polygon changes externally
  useEffect(() => {
    if (polygonEditorRef.current && polygon.length > 0) {
      polygonEditorRef.current.setVertices(polygon);
    }
  }, [polygon]);

  // Update editor editability
  useEffect(() => {
    if (polygonEditorRef.current) {
      polygonEditorRef.current.setEditable(isEditing);
    }
  }, [isEditing]);

  // Auto-detect boundary when coordinates are available
  useEffect(() => {
    if (coordinates && (!polygon || polygon.length === 0)) {
      loadAutoBoundary();
    }
  }, [coordinates]);

  // Load auto-detected boundary
  const loadAutoBoundary = async () => {
    if (!coordinates) {
      setError('Coordinates required for auto-detection');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const autoPolygon = await fetchAutoBoundary(address, coordinates);
      setPolygon(autoPolygon);
      handlePolygonUpdate(autoPolygon);

      // Fit map to new polygon
      if (polygonEditorRef.current) {
        polygonEditorRef.current.setVertices(autoPolygon);
        polygonEditorRef.current.fitBounds();
      }
    } catch (err) {
      console.error('Failed to fetch auto boundary:', err);
      setError('Failed to detect site boundary automatically');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to auto-detected boundary
  const handleReset = () => {
    loadAutoBoundary();
  };

  // Toggle edit mode
  const toggleEditMode = () => {
    setIsEditing(!isEditing);
  };

  // Export boundary data
  const handleExport = () => {
    const dna = convertToDNA(polygon);
    const blob = new Blob([JSON.stringify(dna, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-boundary-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Fit map to polygon bounds
  const handleFitBounds = () => {
    if (polygonEditorRef.current && polygon.length > 0) {
      polygonEditorRef.current.fitBounds();
    }
  };

  // Format number for display
  const formatNumber = (num, decimals = 2) => {
    if (typeof num !== 'number' || isNaN(num)) return '—';
    return num.toFixed(decimals);
  };

  // Render loading state
  if (mapLoading) {
    return (
      <Card className={cn('p-6', className)}>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Spinner size="lg" className="mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Loading Google Maps...</p>
          </div>
        </div>
      </Card>
    );
  }

  // Render error state
  if (mapError) {
    return (
      <Card className={cn('p-6', className)}>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-error-500 mx-auto mb-4" />
            <p className="text-error-600 font-medium mb-2">Failed to load Google Maps</p>
            <p className="text-gray-500 text-sm">{mapError.message}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Map className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Site Boundary Editor</h3>
              {address && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {address.length > 50 ? address.substring(0, 50) + '...' : address}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHelp(!showHelp)}
              icon={<Info className="w-4 h-4" />}
            >
              Help
            </Button>
            <Button
              variant={isEditing ? 'primary' : 'outline'}
              size="sm"
              onClick={toggleEditMode}
              icon={isEditing ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            >
              {isEditing ? 'View Mode' : 'Edit Mode'}
            </Button>
          </div>
        </div>

        {/* Help Panel */}
        <AnimatePresence>
          {showHelp && (
            <motion.div
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={fadeIn}
              className="mt-4 p-4 bg-brand-50 rounded-lg border border-brand-100"
            >
              <h4 className="font-semibold text-brand-700 mb-2">Editing Controls</h4>
              <ul className="text-sm text-brand-600 space-y-1">
                <li className="flex items-center gap-2">
                  <Move className="w-4 h-4" />
                  <span>Drag vertices to adjust boundary</span>
                </li>
                <li className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Shift + Click on map to add vertex</span>
                </li>
                <li className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  <span>Right-click vertex to delete (min 3)</span>
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Map Container */}
      <div className="relative">
        <div
          ref={mapContainerRef}
          className="w-full h-[500px] bg-gray-200"
          style={{ minHeight: '500px' }}
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <div className="text-center">
              <Spinner size="lg" className="mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Detecting site boundary...</p>
            </div>
          </div>
        )}

        {/* Map Controls Overlay */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFitBounds}
            className="bg-white shadow-md"
            icon={<Maximize2 className="w-4 h-4" />}
          >
            Fit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="bg-white shadow-md"
            icon={<RotateCcw className="w-4 h-4" />}
          >
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="bg-white shadow-md"
            icon={<Download className="w-4 h-4" />}
          >
            Export
          </Button>
        </div>

        {/* Edit Mode Indicator */}
        {isEditing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 right-4 z-10"
          >
            <Badge variant="primary" className="bg-brand-500 text-white shadow-md">
              <Edit3 className="w-3 h-3 mr-1" />
              Editing
            </Badge>
          </motion.div>
        )}
      </div>

      {/* Geometry Info Panel */}
      <div className="p-4 border-t border-gray-200 bg-white">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MetricCard
            label="Area"
            value={formatNumber(geometry.area)}
            unit="m²"
            icon={<Map className="w-4 h-4" />}
          />
          <MetricCard
            label="Perimeter"
            value={formatNumber(geometry.perimeter)}
            unit="m"
            icon={<MapPin className="w-4 h-4" />}
          />
          <MetricCard
            label="Vertices"
            value={polygon.length.toString()}
            unit="pts"
            icon={<Edit3 className="w-4 h-4" />}
          />
          <MetricCard
            label="Status"
            value={geometry.isValid ? 'Valid' : 'Invalid'}
            icon={
              geometry.isValid ? (
                <CheckCircle className="w-4 h-4 text-success-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-error-500" />
              )
            }
            variant={geometry.isValid ? 'success' : 'error'}
          />
        </div>

        {/* Error Display */}
        {!geometry.isValid && geometry.errors.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={slideUp}
            className="mb-4 p-3 bg-error-50 rounded-lg border border-error-200"
          >
            <p className="text-error-600 text-sm font-medium">
              {geometry.errors.join('. ')}
            </p>
          </motion.div>
        )}

        {/* Segment Table */}
        {geometry.segments.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-gray-900 mb-3">Segment Details</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">
                      Segment
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      Length (m)
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      Angle (°)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {geometry.segments.map((segment, index) => (
                    <tr
                      key={segment.index}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {segment.index}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">
                        {formatNumber(segment.length)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">
                        {geometry.angles[index]
                          ? formatNumber(geometry.angles[index].angle, 1)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                    <td className="px-3 py-2 text-gray-900">Total</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-900">
                      {formatNumber(geometry.perimeter)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500">
                      {geometry.angles.length > 0
                        ? formatNumber(
                            geometry.angles.reduce((sum, a) => sum + a.angle, 0),
                            1
                          )
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

/**
 * Metric Card Sub-component
 */
const MetricCard = ({ label, value, unit = '', icon, variant = 'default' }) => {
  const variantStyles = {
    default: 'bg-gray-50 border-gray-200',
    success: 'bg-success-50 border-success-200',
    error: 'bg-error-50 border-error-200',
  };

  return (
    <div
      className={cn(
        'p-3 rounded-lg border',
        variantStyles[variant] || variantStyles.default
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-gray-900">{value}</span>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );
};

export default SiteBoundaryEditor;
