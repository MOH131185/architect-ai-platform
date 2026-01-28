/**
 * usePolygonTools.js
 * 
 * React hook providing polygon manipulation and calculation utilities
 * Wraps GeometryMath functions with React state management
 * 
 * @module usePolygonTools
 */

import { useState, useCallback, useMemo } from 'react';
import {
  getPolygonArea,
  getPolygonPerimeter,
  getPolygonCentroid,
  getSegmentLengths,
  getSegmentAngles,
  adjustSegmentLength,
  adjustVertexAngle,
  isPolygonSelfIntersecting,
  snapPolygonClosure,
  polygonToGeoJSON,
  simplifyPolygon
} from './GeometryMath.js';

/**
 * Custom hook for polygon tools and calculations
 * @param {Array<{lat: number, lng: number}>} initialPolygon - Initial polygon coordinates
 * @returns {Object} Polygon tools and metrics
 */
export function usePolygonTools(initialPolygon = []) {
  const [polygon, setPolygon] = useState(initialPolygon);
  const [history, setHistory] = useState([initialPolygon]);
  const [historyIndex, setHistoryIndex] = useState(0);

  /**
   * Calculate all polygon metrics
   */
  const metrics = useMemo(() => {
    if (polygon.length < 3) {
      return {
        area: 0,
        perimeter: 0,
        centroid: { lat: 0, lng: 0 },
        segmentLengths: [],
        segmentAngles: [],
        vertexCount: polygon.length,
        isValid: false,
        isSelfIntersecting: false
      };
    }

    const area = getPolygonArea(polygon);
    const perimeter = getPolygonPerimeter(polygon);
    const centroid = getPolygonCentroid(polygon);
    const segmentLengths = getSegmentLengths(polygon);
    const segmentAngles = getSegmentAngles(polygon);
    const isSelfIntersecting = isPolygonSelfIntersecting(polygon);

    return {
      area,
      perimeter,
      centroid,
      segmentLengths,
      segmentAngles,
      vertexCount: polygon.length,
      isValid: polygon.length >= 3 && !isSelfIntersecting,
      isSelfIntersecting
    };
  }, [polygon]);

  /**
   * Update polygon with history tracking
   */
  const updatePolygon = useCallback((newPolygon, addToHistory = true) => {
    setPolygon(newPolygon);

    if (addToHistory) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newPolygon);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [history, historyIndex]);

  /**
   * Add a vertex to the polygon
   */
  const addVertex = useCallback((point, insertIndex = null) => {
    const newPolygon = [...polygon];

    if (insertIndex !== null && insertIndex >= 0 && insertIndex <= polygon.length) {
      newPolygon.splice(insertIndex, 0, point);
    } else {
      newPolygon.push(point);
    }

    updatePolygon(newPolygon);
  }, [polygon, updatePolygon]);

  /**
   * Remove a vertex from the polygon
   */
  const removeVertex = useCallback((index) => {
    if (polygon.length <= 3) {
      console.warn('Cannot remove vertex: polygon must have at least 3 vertices');
      return;
    }

    const newPolygon = polygon.filter((_, i) => i !== index);
    updatePolygon(newPolygon);
  }, [polygon, updatePolygon]);

  /**
   * Update a specific vertex position
   */
  const updateVertex = useCallback((index, newPosition) => {
    if (index < 0 || index >= polygon.length) return;

    const newPolygon = [...polygon];
    newPolygon[index] = newPosition;
    updatePolygon(newPolygon);
  }, [polygon, updatePolygon]);

  /**
   * Adjust segment length
   */
  const adjustLength = useCallback((segmentIndex, newLength) => {
    if (newLength <= 0) {
      console.warn('Segment length must be positive');
      return;
    }

    const newPolygon = adjustSegmentLength(polygon, segmentIndex, newLength);
    updatePolygon(newPolygon);
  }, [polygon, updatePolygon]);

  /**
   * Adjust vertex angle
   */
  const adjustAngle = useCallback((vertexIndex, newAngle) => {
    if (newAngle <= 0 || newAngle >= 360) {
      console.warn('Angle must be between 0 and 360 degrees');
      return;
    }

    const newPolygon = adjustVertexAngle(polygon, vertexIndex, newAngle);
    updatePolygon(newPolygon);
  }, [polygon, updatePolygon]);

  /**
   * Clear polygon
   */
  const clearPolygon = useCallback(() => {
    updatePolygon([]);
  }, [updatePolygon]);

  /**
   * Reset to initial polygon
   */
  const resetPolygon = useCallback(() => {
    updatePolygon(initialPolygon);
  }, [initialPolygon, updatePolygon]);

  /**
   * Undo last change
   */
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setPolygon(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  /**
   * Redo last undone change
   */
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setPolygon(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  /**
   * Snap polygon closure
   */
  const snapClosure = useCallback(() => {
    const snappedPolygon = snapPolygonClosure(polygon);
    updatePolygon(snappedPolygon);
  }, [polygon, updatePolygon]);

  /**
   * Simplify polygon
   */
  const simplify = useCallback((tolerance = 1) => {
    const simplifiedPolygon = simplifyPolygon(polygon, tolerance);
    updatePolygon(simplifiedPolygon);
  }, [polygon, updatePolygon]);

  /**
   * Export polygon as GeoJSON
   */
  const exportGeoJSON = useCallback(() => {
    return polygonToGeoJSON(polygon);
  }, [polygon]);

  /**
   * Convert polygon to DNA format for architectural processing
   */
  const convertToDNA = useCallback(() => {
    if (polygon.length < 3) return null;

    return {
      sitePolygon: polygon,
      siteBoundary: {
        coordinates: polygon,
        area: metrics.area,
        perimeter: metrics.perimeter,
        centroid: metrics.centroid
      },
      dimensions: {
        area: metrics.area,
        perimeter: metrics.perimeter,
        segmentLengths: metrics.segmentLengths,
        segmentAngles: metrics.segmentAngles
      },
      geometry: {
        vertices: polygon.length,
        isClosed: true,
        isValid: metrics.isValid,
        isSelfIntersecting: metrics.isSelfIntersecting
      }
    };
  }, [polygon, metrics]);

  /**
   * Get formatted metrics for display
   */
  const getFormattedMetrics = useCallback(() => {
    return {
      area: {
        value: metrics.area,
        formatted: `${metrics.area.toFixed(2)} m²`,
        acres: (metrics.area * 0.000247105).toFixed(4),
        hectares: (metrics.area * 0.0001).toFixed(4)
      },
      perimeter: {
        value: metrics.perimeter,
        formatted: `${metrics.perimeter.toFixed(2)} m`,
        feet: (metrics.perimeter * 3.28084).toFixed(2)
      },
      segments: metrics.segmentLengths.map((length, index) => ({
        index,
        length: {
          value: length,
          formatted: `${length.toFixed(2)} m`,
          feet: (length * 3.28084).toFixed(2)
        },
        angle: {
          value: metrics.segmentAngles[index],
          formatted: `${metrics.segmentAngles[index].toFixed(1)}°`
        }
      })),
      centroid: metrics.centroid,
      vertexCount: metrics.vertexCount,
      isValid: metrics.isValid,
      isSelfIntersecting: metrics.isSelfIntersecting
    };
  }, [metrics]);

  /**
   * Validate polygon for architectural use
   */
  const validateForArchitecture = useCallback(() => {
    const errors = [];
    const warnings = [];

    // Minimum vertices
    if (polygon.length < 3) {
      errors.push('Polygon must have at least 3 vertices');
    }

    // Self-intersection
    if (metrics.isSelfIntersecting) {
      errors.push('Polygon cannot self-intersect');
    }

    // Minimum area (10 m²)
    if (metrics.area < 10) {
      warnings.push('Site area is very small (< 10 m²)');
    }

    // Maximum area (100,000 m² = 10 hectares)
    if (metrics.area > 100000) {
      warnings.push('Site area is very large (> 10 hectares)');
    }

    // Check for very short segments (< 1m)
    metrics.segmentLengths.forEach((length, index) => {
      if (length < 1) {
        warnings.push(`Segment ${index + 1} is very short (< 1m)`);
      }
    });

    // Check for very acute angles (< 30°)
    metrics.segmentAngles.forEach((angle, index) => {
      if (angle < 30 || angle > 330) {
        warnings.push(`Vertex ${index + 1} has a very acute angle (${angle.toFixed(1)}°)`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }, [polygon, metrics]);

  return {
    // State
    polygon,
    metrics,
    history,
    historyIndex,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,

    // Actions
    setPolygon: updatePolygon,
    addVertex,
    removeVertex,
    updateVertex,
    adjustLength,
    adjustAngle,
    clearPolygon,
    resetPolygon,
    undo,
    redo,
    snapClosure,
    simplify,

    // Utilities
    exportGeoJSON,
    convertToDNA,
    getFormattedMetrics,
    validateForArchitecture
  };
}

export default usePolygonTools;

