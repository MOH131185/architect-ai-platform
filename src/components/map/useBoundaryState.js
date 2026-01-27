/**
 * useBoundaryState.js
 *
 * Unified boundary state management hook.
 * Single Source of Truth for site boundary polygon.
 *
 * Features:
 * - GeoJSON Polygon canonical format (EPSG:4326, [lng, lat])
 * - Full undo/redo history
 * - Real-time validation
 * - Computed metrics (memoized)
 * - Format conversion utilities
 *
 * @module useBoundaryState
 */

import { useState, useCallback, useMemo, useRef } from "react";
import {
  latLngArrayToRing,
  ringToLatLngArray,
  closeRing,
  openRing,
  normalizeRing,
  validatePolygon,
  calculateArea,
  calculatePerimeter,
  calculateCentroid,
  calculateSegments,
  calculateAngles,
  toGeoJSON,
  fromGeoJSON,
  toWKT,
  fromWKT,
  toCSV,
  fromCSV,
  wouldCauseSelfIntersection,
  roundCoord,
  COORDINATE_PRECISION,
} from "./boundaryGeometry.js";

// Maximum history entries
const MAX_HISTORY = 50;

/**
 * Unified boundary state hook
 * @param {Array<{lat: number, lng: number}>} initialPolygon - Initial polygon in lat/lng format
 * @returns {Object} State and actions
 */
export function useBoundaryState(initialPolygon = []) {
  // Convert initial polygon to canonical GeoJSON ring format
  const initialRing = useMemo(() => {
    if (!initialPolygon || initialPolygon.length === 0) return [];
    return latLngArrayToRing(initialPolygon);
  }, []);

  // Core state: GeoJSON ring [lng, lat] format (closed)
  const [ring, setRingInternal] = useState(initialRing);

  // History management
  const [history, setHistory] = useState([initialRing]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Ref to track if we're in a batch update
  const batchUpdateRef = useRef(false);

  // ============================================================
  // COMPUTED VALUES (Memoized)
  // ============================================================

  /**
   * Full validation result
   */
  const validation = useMemo(() => {
    return validatePolygon(ring);
  }, [ring]);

  /**
   * Computed metrics
   */
  const metrics = useMemo(() => {
    if (!ring || ring.length < 4) {
      return {
        area: 0,
        perimeter: 0,
        centroid: [0, 0],
        vertices: 0,
        segments: [],
        angles: [],
        isValid: false,
        isSelfIntersecting: false,
      };
    }

    return {
      area: calculateArea(ring),
      perimeter: calculatePerimeter(ring),
      centroid: calculateCentroid(ring),
      vertices: openRing(ring).length,
      segments: calculateSegments(ring),
      angles: calculateAngles(ring),
      isValid: validation.valid,
      isSelfIntersecting: validation.metrics.selfIntersects || false,
    };
  }, [ring, validation]);

  /**
   * Polygon in lat/lng array format (for Google Maps compatibility)
   */
  const polygon = useMemo(() => {
    return ringToLatLngArray(ring);
  }, [ring]);

  /**
   * Vertices array (open ring, for editing)
   */
  const vertices = useMemo(() => {
    return openRing(ring);
  }, [ring]);

  /**
   * History navigation state
   */
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // ============================================================
  // CORE STATE UPDATE
  // ============================================================

  /**
   * Internal function to update ring with history tracking
   */
  const updateRing = useCallback(
    (newRing, addToHistory = true) => {
      const { ring: normalizedRing } = normalizeRing(newRing);

      setRingInternal(normalizedRing);

      if (addToHistory && !batchUpdateRef.current) {
        setHistory((prev) => {
          // Trim history if we're not at the end
          const trimmed = prev.slice(0, historyIndex + 1);
          const updated = [...trimmed, normalizedRing];

          // Limit history size
          if (updated.length > MAX_HISTORY) {
            return updated.slice(-MAX_HISTORY);
          }
          return updated;
        });
        setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
      }
    },
    [historyIndex],
  );

  // ============================================================
  // PUBLIC ACTIONS
  // ============================================================

  /**
   * Set polygon from lat/lng array
   * @param {Array<{lat: number, lng: number}>} latLngArray
   * @param {boolean} addToHistory
   */
  const setPolygon = useCallback(
    (latLngArray, addToHistory = true) => {
      const newRing = latLngArrayToRing(latLngArray);
      updateRing(newRing, addToHistory);
    },
    [updateRing],
  );

  /**
   * Set ring directly (GeoJSON format)
   * @param {Array<[number, number]>} newRing
   * @param {boolean} addToHistory
   */
  const setRing = useCallback(
    (newRing, addToHistory = true) => {
      updateRing(newRing, addToHistory);
    },
    [updateRing],
  );

  /**
   * Add a vertex at specified index
   * @param {number} index - Insert position
   * @param {[number, number] | {lat: number, lng: number}} point - New vertex
   */
  const addVertex = useCallback(
    (index, point) => {
      const coord = Array.isArray(point)
        ? [roundCoord(point[0]), roundCoord(point[1])]
        : [roundCoord(point.lng), roundCoord(point.lat)];

      const currentVertices = openRing(ring);
      const newVertices = [...currentVertices];
      newVertices.splice(index, 0, coord);

      updateRing(closeRing(newVertices));
    },
    [ring, updateRing],
  );

  /**
   * Remove a vertex at specified index
   * @param {number} index - Vertex index to remove
   * @returns {boolean} Success (false if would leave < 3 vertices)
   */
  const removeVertex = useCallback(
    (index) => {
      const currentVertices = openRing(ring);

      if (currentVertices.length <= 3) {
        console.warn(
          "Cannot remove vertex: polygon must have at least 3 vertices",
        );
        return false;
      }

      const newVertices = currentVertices.filter((_, i) => i !== index);
      updateRing(closeRing(newVertices));
      return true;
    },
    [ring, updateRing],
  );

  /**
   * Update a vertex position
   * @param {number} index - Vertex index
   * @param {[number, number] | {lat: number, lng: number}} newPosition - New position
   * @param {boolean} checkIntersection - Whether to check for self-intersection
   * @returns {{success: boolean, wouldIntersect: boolean}}
   */
  const updateVertex = useCallback(
    (index, newPosition, checkIntersection = false) => {
      const coord = Array.isArray(newPosition)
        ? [roundCoord(newPosition[0]), roundCoord(newPosition[1])]
        : [roundCoord(newPosition.lng), roundCoord(newPosition.lat)];

      if (checkIntersection) {
        const wouldIntersect = wouldCauseSelfIntersection(ring, index, coord);
        if (wouldIntersect) {
          return { success: false, wouldIntersect: true };
        }
      }

      const currentVertices = openRing(ring);
      const newVertices = [...currentVertices];
      newVertices[index] = coord;

      updateRing(closeRing(newVertices));
      return { success: true, wouldIntersect: false };
    },
    [ring, updateRing],
  );

  /**
   * Update a vertex without adding to history (for dragging)
   * Use commitDrag() when drag ends
   */
  const updateVertexTransient = useCallback(
    (index, newPosition) => {
      const coord = Array.isArray(newPosition)
        ? [roundCoord(newPosition[0]), roundCoord(newPosition[1])]
        : [roundCoord(newPosition.lng), roundCoord(newPosition.lat)];

      const currentVertices = openRing(ring);
      const newVertices = [...currentVertices];
      newVertices[index] = coord;

      // Update state without history
      const { ring: normalizedRing } = normalizeRing(closeRing(newVertices));
      setRingInternal(normalizedRing);
    },
    [ring],
  );

  /**
   * Commit current state to history (call after transient updates)
   */
  const commitToHistory = useCallback(() => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const updated = [...trimmed, ring];
      if (updated.length > MAX_HISTORY) {
        return updated.slice(-MAX_HISTORY);
      }
      return updated;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [ring, historyIndex]);

  /**
   * Start batch update (suppress history during batch)
   */
  const startBatch = useCallback(() => {
    batchUpdateRef.current = true;
  }, []);

  /**
   * End batch update and commit to history
   */
  const endBatch = useCallback(() => {
    batchUpdateRef.current = false;
    commitToHistory();
  }, [commitToHistory]);

  /**
   * Clear polygon
   */
  const clearPolygon = useCallback(() => {
    updateRing([]);
  }, [updateRing]);

  /**
   * Reset to initial polygon
   */
  const resetPolygon = useCallback(() => {
    updateRing(initialRing);
    setHistory([initialRing]);
    setHistoryIndex(0);
  }, [initialRing, updateRing]);

  /**
   * Undo last change
   */
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setRingInternal(history[newIndex]);
    }
  }, [history, historyIndex]);

  /**
   * Redo last undone change
   */
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setRingInternal(history[newIndex]);
    }
  }, [history, historyIndex]);

  /**
   * Reverse vertex order
   */
  const reverseOrder = useCallback(() => {
    const currentVertices = openRing(ring);
    const reversed = [...currentVertices].reverse();
    updateRing(closeRing(reversed));
  }, [ring, updateRing]);

  // ============================================================
  // IMPORT/EXPORT
  // ============================================================

  /**
   * Export as GeoJSON Feature
   */
  const exportGeoJSON = useCallback(() => {
    return toGeoJSON(ring);
  }, [ring]);

  /**
   * Import from GeoJSON
   */
  const importGeoJSON = useCallback(
    (geojson) => {
      const newRing = fromGeoJSON(geojson);
      updateRing(newRing);
    },
    [updateRing],
  );

  /**
   * Export as WKT
   */
  const exportWKT = useCallback(() => {
    return toWKT(ring);
  }, [ring]);

  /**
   * Import from WKT
   */
  const importWKT = useCallback(
    (wkt) => {
      const newRing = fromWKT(wkt);
      updateRing(newRing);
    },
    [updateRing],
  );

  /**
   * Export as CSV
   */
  const exportCSV = useCallback(() => {
    return toCSV(ring);
  }, [ring]);

  /**
   * Import from CSV
   */
  const importCSV = useCallback(
    (csv) => {
      const coords = fromCSV(csv);
      if (coords.length >= 3) {
        updateRing(closeRing(coords));
      }
    },
    [updateRing],
  );

  // ============================================================
  // FORMATTED OUTPUT (for UI display)
  // ============================================================

  /**
   * Get formatted metrics for display
   */
  const getFormattedMetrics = useCallback(() => {
    return {
      area: {
        value: metrics.area,
        formatted: `${metrics.area.toFixed(2)} m²`,
        acres: (metrics.area * 0.000247105).toFixed(4),
        hectares: (metrics.area * 0.0001).toFixed(4),
      },
      perimeter: {
        value: metrics.perimeter,
        formatted: `${metrics.perimeter.toFixed(2)} m`,
        feet: (metrics.perimeter * 3.28084).toFixed(2),
      },
      segments: metrics.segments.map((seg, index) => ({
        index,
        length: {
          value: seg.length,
          formatted: `${seg.length.toFixed(2)} m`,
          feet: (seg.length * 3.28084).toFixed(2),
        },
        bearing: {
          value: seg.bearing,
          formatted: `${seg.bearing.toFixed(1)}°`,
        },
      })),
      angles: metrics.angles.map((ang, index) => ({
        index,
        angle: {
          value: ang.angle,
          formatted: `${ang.angle.toFixed(1)}°`,
        },
      })),
      centroid: {
        lat: metrics.centroid[1],
        lng: metrics.centroid[0],
      },
      vertexCount: metrics.vertices,
      isValid: metrics.isValid,
      isSelfIntersecting: metrics.isSelfIntersecting,
    };
  }, [metrics]);

  /**
   * Get DNA format for downstream generation
   */
  const convertToDNA = useCallback(() => {
    if (vertices.length < 3) return null;

    return {
      sitePolygon: polygon,
      siteBoundary: {
        coordinates: polygon,
        geoJSON: exportGeoJSON(),
        area: metrics.area,
        perimeter: metrics.perimeter,
        centroid: {
          lat: metrics.centroid[1],
          lng: metrics.centroid[0],
        },
      },
      dimensions: {
        area: metrics.area,
        perimeter: metrics.perimeter,
        segmentLengths: metrics.segments.map((s) => s.length),
        segmentBearings: metrics.segments.map((s) => s.bearing),
        segmentAngles: metrics.angles.map((a) => a.angle),
      },
      geometry: {
        vertices: metrics.vertices,
        isClosed: true,
        isValid: metrics.isValid,
        isSelfIntersecting: metrics.isSelfIntersecting,
      },
    };
  }, [polygon, vertices, metrics, exportGeoJSON]);

  // ============================================================
  // RETURN VALUE
  // ============================================================

  return {
    // Core state (canonical format)
    ring,
    vertices, // Open ring (for editing)
    polygon, // lat/lng array (for Google Maps)

    // Computed values
    metrics,
    validation,

    // History
    history,
    historyIndex,
    canUndo,
    canRedo,

    // Core actions
    setPolygon,
    setRing,
    addVertex,
    removeVertex,
    updateVertex,
    updateVertexTransient,
    commitToHistory,
    startBatch,
    endBatch,
    clearPolygon,
    resetPolygon,
    undo,
    redo,
    reverseOrder,

    // Import/Export
    exportGeoJSON,
    importGeoJSON,
    exportWKT,
    importWKT,
    exportCSV,
    importCSV,

    // Formatted output
    getFormattedMetrics,
    convertToDNA,
  };
}

export default useBoundaryState;
