/**
 * SiteBoundaryEditorV2.jsx
 *
 * Expert-level site boundary editor with 3 editing modes:
 * 1. Mouse editing (drag vertices/edges, add/remove points)
 * 2. Manual drawing (click-to-place new polygon)
 * 3. Table editing (edit lat/lng rows, paste CSV)
 *
 * Features:
 * - Single source of truth: GeoJSON Polygon (EPSG:4326)
 * - No drift: uses Google Maps OverlayView projection
 * - Validation: self-intersection detection, minimum vertices
 * - Precision: SHIFT for angle snapping, ALT to disable snapping
 * - Full undo/redo history
 * - Import/Export: GeoJSON, WKT, CSV
 *
 * @module SiteBoundaryEditorV2
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGoogleMap } from "./useGoogleMap.js";
import { useBoundaryState } from "./useBoundaryState.js";
import { createPrecisionPolygonEditor } from "./PrecisionPolygonEditor.js";
import { createPolygonDrawingManager } from "./PolygonDrawingManager.js";
import { VertexTableEditor } from "./VertexTableEditor.jsx";
import { BoundaryDiagnostics } from "./BoundaryDiagnostics.jsx";
import {
  fetchAutoBoundary,
  calculateBounds,
  boundsToGoogleBounds,
} from "./mapUtils.js";
import { closeRing, latLngPolygonsEqual } from "./boundaryGeometry.js";
import { buildManualVerifiedBoundary } from "../../services/site/boundaryPolicy.js";
import logger from "../../utils/logger.js";

// Editor modes
const MODES = {
  SELECT: "select",
  EDIT: "edit",
  DRAW: "draw",
  TABLE: "table",
};

/**
 * SiteBoundaryEditorV2 Component
 */
export function SiteBoundaryEditorV2({
  initialBoundaryPolygon = [],
  siteAddress = "",
  onBoundaryChange,
  apiKey,
  center = { lat: 37.7749, lng: -122.4194 },
  autoDetectEnabled = true,
  autoDetectOnLoad = true,
  autoDetectDisabledMessage = "Automatic boundary detection is unavailable for this address. Draw or enter a verified boundary manually.",
  contextualBoundaryPolygon = [],
  boundarySource = null,
}) {
  // OGL v3.0 attribution: when the boundary comes from HM Land Registry
  // (via either the bundled INSPIRE fixture or Digital Land's
  // `title-boundary` real-time API) we must surface the attribution
  // wherever the polygon is visible. Both source values map to the same
  // chip — they originate from the same HMLR dataset.
  const isInspireBoundary =
    typeof boundarySource === "string" &&
    (boundarySource.startsWith("hm-land-registry-inspire") ||
      boundarySource.startsWith("digital-land-title-boundary"));
  // Refs
  const mapContainerRef = useRef(null);
  const polygonEditorRef = useRef(null);
  const drawingManagerRef = useRef(null);
  const polygonOverlayRef = useRef(null);
  const contextualBoundaryOverlayRef = useRef(null);

  // State
  const [mode, setMode] = useState(MODES.SELECT);
  const [isLoadingBoundary, setIsLoadingBoundary] = useState(false);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [validationWarning, setValidationWarning] = useState(null);
  const [mapContainerElement, setMapContainerElement] = useState(null);
  // Brownfield overlay (opt-in). When the user toggles it on the wizard
  // fetches `/api/site/brownfield-nearby` and renders one map marker per
  // returned site. Useful for site-selection workflows where the user is
  // looking at where adjacent development opportunities are.
  const [showBrownfieldNearby, setShowBrownfieldNearby] = useState(false);
  const [brownfieldSites, setBrownfieldSites] = useState([]);
  const [brownfieldLoading, setBrownfieldLoading] = useState(false);
  const brownfieldMarkersRef = useRef([]);
  const brownfieldInfoWindowRef = useRef(null);

  const handleMapContainerRef = useCallback((element) => {
    mapContainerRef.current = element;
    setMapContainerElement(element);
  }, []);

  // Google Maps hook
  const {
    map,
    google,
    isLoaded,
    isLoading,
    error: mapError,
    geocodeAddress,
  } = useGoogleMap({
    apiKey,
    mapContainer: mapContainerElement,
    center,
    zoom: 18,
  });

  // Boundary state hook (single source of truth)
  const {
    vertices,
    polygon,
    metrics,
    validation,
    canUndo,
    canRedo,
    setPolygon,
    setRing,
    updateVertexTransient,
    clearPolygon,
    undo,
    redo,
    exportGeoJSON,
    getFormattedMetrics,
    convertToDNA,
  } = useBoundaryState(initialBoundaryPolygon);

  const polygonLength = polygon.length;
  const contextualBoundaryLength = Array.isArray(contextualBoundaryPolygon)
    ? contextualBoundaryPolygon.length
    : 0;
  const fitBoundaryPolygon =
    polygonLength >= 3 ? polygon : contextualBoundaryPolygon;
  const fitBoundaryLength = Array.isArray(fitBoundaryPolygon)
    ? fitBoundaryPolygon.length
    : 0;

  const handleAutoDetect = useCallback(async () => {
    if (!autoDetectEnabled) {
      setValidationWarning(autoDetectDisabledMessage);
      setTimeout(() => setValidationWarning(null), 5000);
      return;
    }

    setIsLoadingBoundary(true);

    try {
      let detectionCenter = center;

      if (siteAddress) {
        try {
          const geocoded = await geocodeAddress(siteAddress);
          detectionCenter = { lat: geocoded.lat, lng: geocoded.lng };
        } catch (err) {
          logger.warn("Geocoding failed, using provided center:", err);
        }
      }

      const boundary = await fetchAutoBoundary(siteAddress, detectionCenter);
      setPolygon(boundary);

      if (map && google) {
        const bounds = calculateBounds(boundary);
        if (bounds) {
          const googleBounds = boundsToGoogleBounds(bounds, google);
          map.fitBounds(googleBounds);
        }
      }

      setMode(MODES.SELECT);
    } catch (err) {
      logger.error("Auto-detect failed:", err);
      setValidationWarning(
        "Auto-detection failed. Please draw the boundary manually.",
      );
      setTimeout(() => setValidationWarning(null), 5000);
    } finally {
      setIsLoadingBoundary(false);
    }
  }, [
    autoDetectDisabledMessage,
    autoDetectEnabled,
    center,
    geocodeAddress,
    google,
    map,
    setPolygon,
    siteAddress,
  ]);

  // ============================================================
  // INITIALIZATION
  // ============================================================

  // Initialize polygon from props
  useEffect(() => {
    if (
      initialBoundaryPolygon &&
      initialBoundaryPolygon.length > 0 &&
      !latLngPolygonsEqual(initialBoundaryPolygon, polygon)
    ) {
      setPolygon(initialBoundaryPolygon, false);
    }
  }, [initialBoundaryPolygon, polygon, setPolygon]);

  // Auto-detect boundary when map loads if no polygon exists
  useEffect(() => {
    if (
      isLoaded &&
      map &&
      google &&
      autoDetectOnLoad &&
      autoDetectEnabled &&
      polygonLength === 0 &&
      !isLoadingBoundary
    ) {
      handleAutoDetect();
    }
  }, [
    autoDetectEnabled,
    autoDetectOnLoad,
    google,
    handleAutoDetect,
    isLoaded,
    isLoadingBoundary,
    map,
    polygonLength,
  ]);

  // ============================================================
  // NOTIFY PARENT OF CHANGES
  // ============================================================

  useEffect(() => {
    if (!onBoundaryChange) return;

    // PR-C re-review blocker 1: emit on EVERY change, not just polygon >= 3.
    // When the polygon is cleared or drops below 3 vertices, emit a
    // manual_invalid payload (clearManualVerified: true) so the parent
    // drops any previously stored manual_verified boundary instead of
    // keeping it indefinitely.
    if (polygonLength < 3) {
      const clearPayload = buildManualVerifiedBoundary({
        polygon: [],
        metrics: null,
        validation: null,
        geoJSON: null,
        primaryFrontEdge: null,
      });
      if (validationWarning) {
        setValidationWarning(null);
      }
      onBoundaryChange({
        ...clearPayload,
        metrics: null,
        dna: null,
        geoJSON: null,
        primaryFrontEdge: null,
      });
      return;
    }

    const formattedMetrics = getFormattedMetrics();
    const dna = convertToDNA();

    // Find dominant edge (longest, likely street-facing)
    const segments = metrics.segments || [];
    let dominantEdge = null;
    if (segments.length > 0) {
      dominantEdge = segments.reduce((longest, seg) =>
        seg.length > longest.length ? seg : longest,
      );
    }

    const primaryFrontEdge = dominantEdge
      ? {
          index: dominantEdge.index,
          length: dominantEdge.length,
          bearing: dominantEdge.bearing,
        }
      : null;
    const verifiedBoundary = buildManualVerifiedBoundary({
      polygon,
      metrics: formattedMetrics,
      validation,
      geoJSON: exportGeoJSON(),
      primaryFrontEdge,
    });

    if (verifiedBoundary.invalid) {
      setValidationWarning(
        verifiedBoundary.warnings?.[0] ||
          "Manual boundary is invalid and has not been verified.",
      );
    } else if (validationWarning) {
      setValidationWarning(null);
    }

    onBoundaryChange({
      ...verifiedBoundary,
      metrics: formattedMetrics,
      dna,
      geoJSON: verifiedBoundary.geoJSON || exportGeoJSON(),
      primaryFrontEdge,
    });
  }, [
    convertToDNA,
    exportGeoJSON,
    getFormattedMetrics,
    metrics.segments,
    onBoundaryChange,
    polygon,
    polygonLength,
    validation,
    validationWarning,
  ]);

  // ============================================================
  // BROWNFIELD OVERLAY (opt-in)
  // ============================================================

  // Fetch nearby brownfield sites whenever the toggle is on, the map
  // center is known, and the center has changed by more than ~10 m.
  useEffect(() => {
    if (!showBrownfieldNearby) {
      setBrownfieldSites([]);
      return undefined;
    }
    const lat = Number(center?.lat);
    const lng = Number(center?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }
    let cancelled = false;
    setBrownfieldLoading(true);
    const url = `/api/site/brownfield-nearby?lat=${lat}&lng=${lng}&radiusM=2000`;
    fetch(url)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((json) => {
        if (cancelled) return;
        setBrownfieldSites(Array.isArray(json?.sites) ? json.sites : []);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn("[Brownfield] nearby fetch failed", err?.message || err);
        setBrownfieldSites([]);
      })
      .finally(() => {
        if (!cancelled) setBrownfieldLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showBrownfieldNearby, center?.lat, center?.lng]);

  // Render Google Maps markers for the brownfield sites. Cleans up on
  // toggle-off and on unmount.
  useEffect(() => {
    if (!map || !google || !isLoaded) return undefined;

    // Always tear down previous markers before deciding whether to draw.
    for (const marker of brownfieldMarkersRef.current) {
      marker.setMap(null);
    }
    brownfieldMarkersRef.current = [];

    if (!showBrownfieldNearby || brownfieldSites.length === 0) {
      return undefined;
    }

    if (!brownfieldInfoWindowRef.current) {
      brownfieldInfoWindowRef.current = new google.maps.InfoWindow();
    }

    for (const site of brownfieldSites) {
      const marker = new google.maps.Marker({
        position: { lat: Number(site.lat), lng: Number(site.lng) },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#F59E0B",
          fillOpacity: 0.9,
          strokeColor: "#FFFFFF",
          strokeWeight: 2,
        },
        title: site.name || site.ref || "Brownfield site",
        zIndex: 50,
      });
      marker.addListener("click", () => {
        if (!brownfieldInfoWindowRef.current) return;
        const planningLink = site.planningUrl
          ? `<a href="${String(site.planningUrl).split(/\s+and\s+/i)[0]}" target="_blank" rel="noopener noreferrer" style="color:#1976d2;">Planning history</a>`
          : "";
        const html = `
          <div style="max-width:240px;font-family:system-ui,sans-serif;color:#0f172a;">
            <div style="font-weight:600;margin-bottom:4px;">${site.name || site.ref || "Brownfield site"}</div>
            <div style="font-size:12px;color:#475569;">
              ${site.planningStatus || "Planning status unknown"} · ${(Number(site.hectares) || 0).toFixed(2)} ha · ${site.distanceM} m away
            </div>
            ${site.ownership ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${site.ownership}</div>` : ""}
            ${planningLink ? `<div style="font-size:12px;margin-top:6px;">${planningLink}</div>` : ""}
          </div>
        `;
        brownfieldInfoWindowRef.current.setContent(html);
        brownfieldInfoWindowRef.current.open({ map, anchor: marker });
      });
      brownfieldMarkersRef.current.push(marker);
    }

    return () => {
      for (const marker of brownfieldMarkersRef.current) {
        marker.setMap(null);
      }
      brownfieldMarkersRef.current = [];
      if (brownfieldInfoWindowRef.current) {
        brownfieldInfoWindowRef.current.close();
      }
    };
  }, [map, google, isLoaded, showBrownfieldNearby, brownfieldSites]);

  // ============================================================
  // POLYGON OVERLAY (non-editable display)
  // ============================================================

  useEffect(() => {
    if (!map || !google || !isLoaded) return undefined;

    if (contextualBoundaryOverlayRef.current) {
      contextualBoundaryOverlayRef.current.setMap(null);
      contextualBoundaryOverlayRef.current = null;
    }

    const shouldShowContextualBoundary =
      contextualBoundaryLength >= 3 &&
      (polygonLength < 3 ||
        !latLngPolygonsEqual(contextualBoundaryPolygon, polygon));

    if (shouldShowContextualBoundary) {
      // Estimated/contextual boundary uses Material Blue 700 with a thinner
      // stroke + lower fill opacity than the authoritative blue overlay so
      // the user can tell at a glance it is non-authoritative — colour
      // matches the A1 site-plan boundary for end-to-end consistency.
      contextualBoundaryOverlayRef.current = new google.maps.Polygon({
        paths: contextualBoundaryPolygon,
        strokeColor: "#1976D2",
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: "#1976D2",
        fillOpacity: 0.08,
        clickable: false,
        zIndex: 1,
        map,
      });
    }

    return () => {
      if (contextualBoundaryOverlayRef.current) {
        contextualBoundaryOverlayRef.current.setMap(null);
        contextualBoundaryOverlayRef.current = null;
      }
    };
  }, [
    contextualBoundaryLength,
    contextualBoundaryPolygon,
    google,
    isLoaded,
    map,
    polygon,
    polygonLength,
  ]);

  useEffect(() => {
    if (!map || !google || !isLoaded) return;

    // Remove existing overlay
    if (polygonOverlayRef.current) {
      polygonOverlayRef.current.setMap(null);
      polygonOverlayRef.current = null;
    }

    // Create new overlay if polygon exists and not in edit/draw mode
    if (polygonLength >= 3 && mode === MODES.SELECT) {
      polygonOverlayRef.current = new google.maps.Polygon({
        paths: polygon,
        strokeColor: "#3B82F6",
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: "#3B82F6",
        fillOpacity: 0.2,
        clickable: false,
        zIndex: 2,
        map,
      });
    }

    return () => {
      if (polygonOverlayRef.current) {
        polygonOverlayRef.current.setMap(null);
        polygonOverlayRef.current = null;
      }
    };
  }, [google, isLoaded, map, mode, polygon, polygonLength]);

  // Fit bounds when polygon changes significantly
  useEffect(() => {
    if (map && google && fitBoundaryLength >= 3 && mode === MODES.SELECT) {
      const bounds = calculateBounds(fitBoundaryPolygon);
      if (bounds) {
        const googleBounds = boundsToGoogleBounds(bounds, google);
        map.fitBounds(googleBounds);
      }
    }
  }, [fitBoundaryLength, fitBoundaryPolygon, google, map, mode]);

  // ============================================================
  // PRECISION POLYGON EDITOR (Edit Mode)
  // ============================================================

  useEffect(() => {
    if (!map || !google || !isLoaded) return;

    // Cleanup previous editor
    if (polygonEditorRef.current) {
      polygonEditorRef.current.destroy();
      polygonEditorRef.current = null;
    }

    if (mode === MODES.EDIT && vertices.length >= 3) {
      polygonEditorRef.current = createPrecisionPolygonEditor(map, google, {
        onPolygonChange: (newVertices) => {
          // Convert from [lng, lat] to {lat, lng} and update state
          const newRing = closeRing(newVertices);
          setRing(newRing);
        },
        onVertexUpdate: (index, position, allVertices) => {
          // Transient update during drag (no history)
          updateVertexTransient(index, position);
        },
        onDragEnd: (index, allVertices) => {
          // Commit to history after drag
          const newRing = closeRing(allVertices);
          setRing(newRing);
        },
        onVertexAdd: (index, position, allVertices) => {
          const newRing = closeRing(allVertices);
          setRing(newRing);
        },
        onVertexRemove: (index, allVertices) => {
          const newRing = closeRing(allVertices);
          setRing(newRing);
        },
        onSelectionChange: (index) => {
          setSelectedVertexIndex(index);
        },
        onValidationWarning: (message) => {
          setValidationWarning(message);
          setTimeout(() => setValidationWarning(null), 3000);
        },
        preventSelfIntersection: true,
        minVertices: 3,
      });

      polygonEditorRef.current.setVertices(vertices);
      polygonEditorRef.current.enable();
    }

    return () => {
      if (polygonEditorRef.current) {
        polygonEditorRef.current.destroy();
        polygonEditorRef.current = null;
      }
    };
  }, [google, isLoaded, map, mode, setRing, updateVertexTransient, vertices]);

  // Update editor vertices when they change externally (e.g., from table)
  useEffect(() => {
    if (polygonEditorRef.current && mode === MODES.EDIT) {
      polygonEditorRef.current.setVertices(vertices);
    }
  }, [vertices, mode]);

  // ============================================================
  // DRAWING MANAGER (Draw Mode)
  // ============================================================

  useEffect(() => {
    if (!map || !google || !isLoaded) return;

    // Cleanup previous drawing manager
    if (drawingManagerRef.current) {
      drawingManagerRef.current.destroy();
      drawingManagerRef.current = null;
    }

    if (mode === MODES.DRAW) {
      drawingManagerRef.current = createPolygonDrawingManager(map, google, {
        onDrawingComplete: (newVertices) => {
          const newRing = closeRing(newVertices);
          setRing(newRing);
          setMode(MODES.EDIT); // Switch to edit mode after drawing
        },
        onDrawingCancel: () => {
          // If we had a polygon before, stay in select mode
          if (polygonLength >= 3) {
            setMode(MODES.SELECT);
          }
        },
        onValidationError: (errors) => {
          // 15-second window (was 5 s) — long enough for the user to read
          // and act, short enough to clear if they ignore. The warning
          // also has a manual dismiss button so the user can clear it
          // immediately without waiting.
          setValidationWarning(errors.join("; "));
          setTimeout(() => setValidationWarning(null), 15000);
        },
        minVertices: 3,
      });

      drawingManagerRef.current.start();
    }

    return () => {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.destroy();
        drawingManagerRef.current = null;
      }
    };
  }, [google, isLoaded, map, mode, polygonLength, setRing]);

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  const handleModeChange = useCallback(
    (newMode) => {
      // Cancel any ongoing operations
      if (drawingManagerRef.current && mode === MODES.DRAW) {
        drawingManagerRef.current.cancel();
      }

      setMode(newMode);
      setSelectedVertexIndex(null);
    },
    [mode],
  );

  const handleFitBounds = useCallback(() => {
    if (fitBoundaryLength >= 3 && map && google) {
      const bounds = calculateBounds(fitBoundaryPolygon);
      if (bounds) {
        const googleBounds = boundsToGoogleBounds(bounds, google);
        map.fitBounds(googleBounds);
      }
    }
  }, [fitBoundaryLength, fitBoundaryPolygon, map, google]);

  const handleTableVerticesChange = useCallback(
    (newVertices) => {
      const newRing = closeRing(newVertices);
      setRing(newRing);

      // Update editor if in edit mode
      if (polygonEditorRef.current && mode === MODES.EDIT) {
        polygonEditorRef.current.setVertices(newVertices);
      }
    },
    [setRing, mode],
  );

  const handleClear = useCallback(() => {
    if (window.confirm("Clear the boundary? This cannot be undone.")) {
      clearPolygon();
      setMode(MODES.SELECT);
    }
  }, [clearPolygon]);

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't interfere with input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }

      // E = Toggle edit mode
      if (e.key === "e" && !e.ctrlKey && !e.metaKey) {
        handleModeChange(mode === MODES.EDIT ? MODES.SELECT : MODES.EDIT);
      }

      // D = Toggle draw mode
      if (e.key === "d" && !e.ctrlKey && !e.metaKey) {
        handleModeChange(mode === MODES.DRAW ? MODES.SELECT : MODES.DRAW);
      }

      // T = Toggle table editor
      if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
        setShowTableEditor((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mode, undo, redo, handleModeChange]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-4 text-white">
        <h2 className="text-xl font-bold mb-1">Site Boundary Editor</h2>
        <p className="text-blue-100 text-sm">
          {siteAddress || "Define your site boundary using the interactive map"}
        </p>
      </div>

      {/* Mode Toolbar */}
      <div className="bg-white rounded-lg shadow p-3">
        <div className="flex flex-wrap gap-2">
          {/* Auto-detect */}
          <button
            onClick={handleAutoDetect}
            disabled={isLoadingBoundary || !autoDetectEnabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors font-medium text-sm"
            title={
              autoDetectEnabled
                ? "Auto-detect boundary"
                : autoDetectDisabledMessage
            }
          >
            {isLoadingBoundary ? "Detecting..." : "🔍 Auto-Detect"}
          </button>

          {/* Mode buttons */}
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            <button
              onClick={() => handleModeChange(MODES.SELECT)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                mode === MODES.SELECT
                  ? "bg-slate-700 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              👆 Select
            </button>
            <button
              onClick={() => handleModeChange(MODES.EDIT)}
              disabled={polygon.length < 3}
              className={`px-3 py-2 text-sm font-medium transition-colors border-l border-slate-300 ${
                mode === MODES.EDIT
                  ? "bg-green-600 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
              }`}
            >
              ✏️ Edit (E)
            </button>
            <button
              onClick={() => handleModeChange(MODES.DRAW)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-l border-slate-300 ${
                mode === MODES.DRAW
                  ? "bg-purple-600 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              🖊️ Draw (D)
            </button>
          </div>

          {/* Undo/Redo */}
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="px-3 py-2 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 transition-colors text-sm"
              title="Undo (Ctrl+Z)"
            >
              ↶
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="px-3 py-2 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 transition-colors text-sm border-l border-slate-300"
              title="Redo (Ctrl+Y)"
            >
              ↷
            </button>
          </div>

          {/* Utility buttons */}
          <button
            onClick={handleFitBounds}
            disabled={fitBoundaryLength < 3}
            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 transition-colors text-sm"
          >
            📍 Fit
          </button>

          <button
            onClick={() => setShowTableEditor((prev) => !prev)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showTableEditor
                ? "bg-indigo-600 text-white"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            📋 Table (T)
          </button>

          <button
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showDiagnostics
                ? "bg-slate-700 text-white"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            📊 Diagnostics
          </button>

          <button
            onClick={() => setShowBrownfieldNearby((prev) => !prev)}
            disabled={brownfieldLoading}
            data-testid="brownfield-toggle"
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showBrownfieldNearby
                ? "bg-amber-600 text-white"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            } disabled:opacity-60`}
            title="Show nearby brownfield development sites from the council Brownfield Land Register"
          >
            🏗️ Brownfield {brownfieldLoading ? "…" : ""}
            {showBrownfieldNearby && brownfieldSites.length > 0 && (
              <span className="ml-1 text-[10px] opacity-90">
                ({brownfieldSites.length})
              </span>
            )}
          </button>

          <button
            onClick={handleClear}
            disabled={polygon.length === 0}
            className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:bg-slate-100 disabled:text-slate-400 transition-colors text-sm"
          >
            🗑️ Clear
          </button>
        </div>

        {/* Mode instructions */}
        <AnimatePresence>
          {mode === MODES.EDIT && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
            >
              <strong>Edit Mode:</strong> Drag vertices • Click midpoints to add
              • Right-click/Delete to remove •
              <span className="font-mono mx-1">SHIFT</span>=angle snap •
              <span className="font-mono mx-1">ALT</span>=disable snap
            </motion.div>
          )}
          {mode === MODES.DRAW && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 p-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800"
            >
              <strong>Draw Mode:</strong> Click to place vertices • Double-click
              or
              <span className="font-mono mx-1">ENTER</span> to finish •
              <span className="font-mono mx-1">ESC</span>/Backspace to undo last
              point •<span className="font-mono mx-1">SHIFT</span>=45° snap
            </motion.div>
          )}
        </AnimatePresence>

        {/* Validation warning — dismissible. Auto-clears after 15 s; the
            user can also click × to dismiss immediately. */}
        <AnimatePresence>
          {validationWarning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2"
              data-testid="boundary-validation-warning"
            >
              <span className="flex-1">⚠️ {validationWarning}</span>
              <button
                type="button"
                onClick={() => setValidationWarning(null)}
                className="text-amber-700 hover:text-amber-900 px-1 leading-none"
                aria-label="Dismiss warning"
              >
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Always-visible summary bar — surfaces area / perimeter / vertex
          count + reference + length-of-each-side data the moment a polygon
          is loaded, so the user never has to discover the Diagnostics
          toggle to see it. */}
      {polygon.length >= 3 && (
        <div
          className="bg-white rounded-lg shadow p-3 mb-3"
          data-testid="boundary-summary-bar"
        >
          <BoundaryDiagnostics vertices={vertices} compact={true} />
        </div>
      )}

      {/* Main Content Grid */}
      <div className={`grid gap-4 ${showTableEditor ? "lg:grid-cols-2" : ""}`}>
        {/* Map Container */}
        <div className="relative bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Loading Overlay */}
          {(isLoading || !isLoaded) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white bg-opacity-90">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-slate-600 font-medium">
                  Loading Google Maps...
                </p>
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {mapError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-50">
              <div className="text-center max-w-md p-4">
                <div className="text-red-600 text-4xl mb-3">⚠️</div>
                <h3 className="text-lg font-bold text-red-900 mb-2">
                  Map Loading Error
                </h3>
                <p className="text-red-700 text-sm mb-4">{mapError.message}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                >
                  Reload Page
                </button>
              </div>
            </div>
          )}

          {/* Map Container */}
          <div
            ref={handleMapContainerRef}
            className="w-full h-[450px] bg-slate-100"
            style={{ minHeight: "450px" }}
          />
        </div>

        {/* HM Land Registry attribution. OGL v3.0 requires the
            attribution to be visible wherever INSPIRE polygons are
            rendered. Renders only when the boundary's source is the
            INSPIRE proxy response. */}
        {isInspireBoundary && (
          <p
            className="mt-2 text-[10px] uppercase tracking-wide text-white/55"
            data-testid="hmlr-attribution"
          >
            Contains HM Land Registry data © Crown copyright and database right
            (Open Government Licence v3.0)
          </p>
        )}

        {showBrownfieldNearby && brownfieldSites.length > 0 && (
          <p
            className="mt-1 text-[10px] uppercase tracking-wide text-white/55"
            data-testid="brownfield-attribution"
          >
            Brownfield sites: contains public sector information licensed under
            the Open Government Licence v3.0 (council Brownfield Land Register).
          </p>
        )}

        {/* Table Editor */}
        <AnimatePresence>
          {showTableEditor && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <VertexTableEditor
                vertices={vertices}
                onVerticesChange={handleTableVerticesChange}
                onVertexSelect={(index) => {
                  setSelectedVertexIndex(index);
                  if (polygonEditorRef.current) {
                    polygonEditorRef.current.selectVertex(index);
                  }
                }}
                selectedIndex={selectedVertexIndex}
                disabled={mode === MODES.DRAW}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Diagnostics */}
      <AnimatePresence>
        {showDiagnostics && polygon.length >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <BoundaryDiagnostics
              vertices={vertices}
              showSegments={true}
              showAngles={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Metrics Bar (when diagnostics hidden) */}
      {!showDiagnostics && polygon.length >= 3 && (
        <div className="bg-white rounded-lg shadow p-3">
          <BoundaryDiagnostics vertices={vertices} compact={true} />
        </div>
      )}
    </div>
  );
}

export default SiteBoundaryEditorV2;
