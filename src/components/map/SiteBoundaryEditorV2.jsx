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

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGoogleMap } from "./useGoogleMap.js";
import { useBoundaryState } from "./useBoundaryState.js";
import { createPrecisionPolygonEditor } from "./PrecisionPolygonEditor.js";
import { createPolygonDrawingManager } from "./PolygonDrawingManager.js";
import { BoundaryNumericEditor } from "./BoundaryNumericEditor.jsx";
import { BoundaryDiagnostics } from "./BoundaryDiagnostics.jsx";
import { BoundaryDynamicInput } from "./BoundaryDynamicInput.jsx";
import {
  fetchAutoBoundary,
  calculateBounds,
  boundsToGoogleBounds,
} from "./mapUtils.js";
import {
  closeRing,
  latLngArrayToRing,
  latLngPolygonsEqual,
  openRing,
} from "./boundaryGeometry.js";
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
  contextualBoundarySource = null,
  contextualBoundaryRole = null,
  orthoSnapDegrees = 90,
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

  // AutoCAD-style dynamic-input overlay state. The drawing manager and
  // precision editor stream cursor / live-dimension events here via
  // RAF-coalesced callbacks (Guardrail 7). Keeping length state in the host
  // is what lets the manager's `_handleKeyDown` route digit keystrokes
  // through `onDynamicInputKey` without having to know about React.
  const [dynamicInput, setDynamicInput] = useState({
    visible: false,
    anchorPx: null,
    mode: "draw", // 'draw' | 'drag'
    lengthValue: "",
    liveLengthM: 0,
    liveBearingDeg: 0,
    snapHint: null,
  });
  const dynamicInputRef = useRef(null);
  const dynamicInputPendingRef = useRef(false);
  const dynamicInputModeRef = useRef("draw");

  const handleMapContainerRef = useCallback((element) => {
    mapContainerRef.current = element;
    setMapContainerElement(element);
  }, []);

  const handleDynamicInputChange = useCallback((next) => {
    const value = String(next ?? "");
    dynamicInputPendingRef.current = value.trim() !== "";
    setDynamicInput((prev) => ({ ...prev, lengthValue: value }));
  }, []);

  const clearDynamicInput = useCallback(() => {
    dynamicInputPendingRef.current = false;
    setDynamicInput((prev) => ({ ...prev, lengthValue: "" }));
  }, []);

  const handleDynamicInputCommit = useCallback(
    (lengthM) => {
      const parsed = Number(lengthM);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      const manager = drawingManagerRef.current;
      if (!manager || typeof manager.commitLength !== "function") return;
      manager.commitLength(parsed);
      // Clear the field after a successful commit so the user can keep
      // chaining vertices without manually deleting digits each time.
      clearDynamicInput();
    },
    [clearDynamicInput],
  );

  const handleDynamicInputCancel = useCallback(() => {
    clearDynamicInput();
    if (
      mapContainerRef.current &&
      typeof mapContainerRef.current.focus === "function"
    ) {
      try {
        mapContainerRef.current.focus({ preventScroll: true });
      } catch (e) {
        // older browsers
      }
    }
  }, [clearDynamicInput]);

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

  const initialBoundaryKey = JSON.stringify(initialBoundaryPolygon || []);
  const lastInitialBoundaryKeyRef = useRef(initialBoundaryKey);

  const polygonLength = polygon.length;
  const contextualBoundaryLength = Array.isArray(contextualBoundaryPolygon)
    ? contextualBoundaryPolygon.length
    : 0;
  const fitBoundaryPolygon =
    polygonLength >= 3 ? polygon : contextualBoundaryPolygon;
  const fitBoundaryLength = Array.isArray(fitBoundaryPolygon)
    ? fitBoundaryPolygon.length
    : 0;
  const contextualBoundaryVertices = useMemo(() => {
    if (polygonLength >= 3 || contextualBoundaryLength < 3) return [];
    return openRing(latLngArrayToRing(contextualBoundaryPolygon));
  }, [contextualBoundaryLength, contextualBoundaryPolygon, polygonLength]);
  const isContextualBuildingFootprint =
    contextualBoundaryRole === "contextual_building_footprint" ||
    contextualBoundarySource === "google_building_outline";
  const contextualMeasurementTitle = isContextualBuildingFootprint
    ? "Detected Building Footprint"
    : "Contextual Boundary Overlay";
  const contextualMeasurementCopy = isContextualBuildingFootprint
    ? "Detected footprint is shown for scale only. Draw or verify the parcel boundary before treating area or setbacks as authoritative."
    : "Estimated boundary is shown for context only. Draw or verify the parcel boundary before treating area or setbacks as authoritative.";

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
    if (lastInitialBoundaryKeyRef.current === initialBoundaryKey) {
      return;
    }

    lastInitialBoundaryKeyRef.current = initialBoundaryKey;

    if (
      initialBoundaryPolygon &&
      initialBoundaryPolygon.length > 0 &&
      !latLngPolygonsEqual(initialBoundaryPolygon, polygon)
    ) {
      setPolygon(initialBoundaryPolygon, false);
    }
  }, [initialBoundaryKey, initialBoundaryPolygon, polygon, setPolygon]);

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
          // Hide the live-dimension overlay once the drag commits.
          dynamicInputModeRef.current = "draw";
          setDynamicInput((prev) => ({
            ...prev,
            visible: false,
            anchorPx: null,
            snapHint: null,
          }));
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
        // AutoCAD-style live dimension tooltip while dragging a corner. Read-only
        // in v1 — the host renders the same overlay component used for DRAW
        // mode but switches it into 'drag' mode (no input field).
        onDragLiveDimension: (info) => {
          if (!info) {
            setDynamicInput((prev) => ({
              ...prev,
              visible: false,
              anchorPx: null,
            }));
            return;
          }
          dynamicInputModeRef.current = "drag";
          setDynamicInput((prev) => ({
            ...prev,
            visible: true,
            anchorPx: info.anchorPx,
            mode: "drag",
            lengthValue: "",
            liveLengthM: Number.isFinite(info.lengthM) ? info.lengthM : 0,
            liveBearingDeg: Number.isFinite(info.bearingDeg)
              ? info.bearingDeg
              : 0,
          }));
        },
        onSnapHint: (hint) => {
          setDynamicInput((prev) => ({ ...prev, snapHint: hint }));
        },
        angleSnapDegrees: orthoSnapDegrees,
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
      // Drop overlay visibility on mode-change cleanup so a stale anchor from
      // a previous drag never sticks around.
      setDynamicInput((prev) => ({
        ...prev,
        visible: false,
        anchorPx: null,
        snapHint: null,
      }));
    };
  }, [
    google,
    isLoaded,
    map,
    mode,
    orthoSnapDegrees,
    setRing,
    updateVertexTransient,
    vertices,
  ]);

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
        // RAF-coalesced cursor stream from the manager. Fires at most once
        // per frame regardless of mousemove rate (Guardrail 7).
        onDynamicCursor: ({ anchorPx, lengthM, bearingDeg, hasAnchor }) => {
          dynamicInputModeRef.current = "draw";
          setDynamicInput((prev) => ({
            ...prev,
            visible: hasAnchor && Boolean(anchorPx),
            anchorPx: anchorPx || null,
            mode: "draw",
            liveLengthM: Number.isFinite(lengthM) ? lengthM : 0,
            liveBearingDeg: Number.isFinite(bearingDeg) ? bearingDeg : 0,
          }));
        },
        // Manager routes digit/dot/comma/Backspace keystrokes here so the user
        // can start typing without first clicking the floating input.
        onDynamicInputKey: ({ key }) => {
          if (dynamicInputModeRef.current !== "draw") return false;
          if (key === "Backspace" || key === "Delete") {
            setDynamicInput((prev) => {
              const next = prev.lengthValue.slice(0, -1);
              dynamicInputPendingRef.current = next.trim() !== "";
              return { ...prev, lengthValue: next };
            });
            // Focus the input so subsequent native keystrokes flow naturally.
            if (
              dynamicInputRef.current &&
              document.activeElement !== dynamicInputRef.current
            ) {
              dynamicInputRef.current.focus({ preventScroll: true });
            }
            return true;
          }
          if (key && key.length === 1 && /[0-9.,]/.test(key)) {
            setDynamicInput((prev) => {
              const next = (prev.lengthValue || "") + key;
              dynamicInputPendingRef.current = next.trim() !== "";
              return { ...prev, lengthValue: next };
            });
            if (
              dynamicInputRef.current &&
              document.activeElement !== dynamicInputRef.current
            ) {
              dynamicInputRef.current.focus({ preventScroll: true });
            }
            return true;
          }
          return false;
        },
        onSnapHint: (hint) => {
          setDynamicInput((prev) => ({ ...prev, snapHint: hint }));
        },
        angleSnapDegrees: orthoSnapDegrees,
        minVertices: 3,
      });

      // Manager peeks at this on Enter/Esc so it doesn't fight the dynamic
      // input over keystrokes (Guardrail 8: typed-length commits route
      // through the same `_appendVertex` path as a normal click).
      drawingManagerRef.current.isDynamicInputPending = () =>
        dynamicInputPendingRef.current;

      drawingManagerRef.current.start();
    }

    return () => {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.destroy();
        drawingManagerRef.current = null;
      }
      dynamicInputPendingRef.current = false;
      setDynamicInput({
        visible: false,
        anchorPx: null,
        mode: "draw",
        lengthValue: "",
        liveLengthM: 0,
        liveBearingDeg: 0,
        snapHint: null,
      });
    };
  }, [google, isLoaded, map, mode, orthoSnapDegrees, polygonLength, setRing]);

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
              className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-900"
              data-testid="edit-mode-instructions"
            >
              <strong className="block mb-1">Edit Mode</strong>
              <ul className="grid gap-1 sm:grid-cols-2">
                <li>Drag blue corner points to adjust the boundary</li>
                <li>Click midpoint dots to add a corner</li>
                <li>Select a corner and press Delete/Backspace to remove it</li>
                <li>
                  <span className="font-mono">Shift</span> = {orthoSnapDegrees}°
                  snap (ortho)
                </li>
                <li>
                  <span className="font-mono">Alt</span> = free movement
                </li>
              </ul>
            </motion.div>
          )}
          {mode === MODES.DRAW && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-900"
              data-testid="draw-mode-instructions"
            >
              <strong className="block mb-1">Draw Mode</strong>
              <ul className="grid gap-1 sm:grid-cols-2">
                <li>Click to place corners</li>
                <li>Double-click or Enter to finish</li>
                <li>Esc/Backspace to undo last point</li>
                <li>
                  <span className="font-mono">Shift</span> = {orthoSnapDegrees}°
                  snap
                </li>
                <li className="sm:col-span-2">
                  Type a number to place the next corner at exact distance —
                  <span className="font-mono">Enter</span> places,{" "}
                  <span className="font-mono">Esc</span> cancels.
                </li>
              </ul>
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
            className="h-[320px] w-full bg-slate-100 md:h-[390px]"
            style={{ minHeight: "300px" }}
          />

          {/* AutoCAD-style dynamic length / live-dimension overlay. Anchored
              to the cursor while drawing, anchored to the dragged corner
              while editing. Hidden on coarse pointers. */}
          <BoundaryDynamicInput
            visible={dynamicInput.visible}
            anchorPx={dynamicInput.anchorPx}
            mode={dynamicInput.mode}
            lengthValue={dynamicInput.lengthValue}
            liveLengthM={dynamicInput.liveLengthM}
            liveBearingDeg={dynamicInput.liveBearingDeg}
            snapHint={dynamicInput.snapHint}
            inputRef={dynamicInputRef}
            onLengthChange={handleDynamicInputChange}
            onCommit={handleDynamicInputCommit}
            onCancel={handleDynamicInputCancel}
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
              <BoundaryNumericEditor
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

      {/* Measurements */}
      {polygon.length >= 3 && (
        <section
          className="bg-white rounded-lg shadow-lg p-4 space-y-3"
          data-testid="boundary-measurements"
        >
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Boundary Measurements
            </h3>
            <p className="text-sm text-slate-600">
              Drag corners, draw a new polygon, or enter numeric values to
              refine the site boundary.
            </p>
          </div>
          <AnimatePresence initial={false}>
            <motion.div
              key={
                showDiagnostics ? "diagnostics-detailed" : "diagnostics-summary"
              }
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <BoundaryDiagnostics
                vertices={vertices}
                showSegments={showDiagnostics}
                showAngles={showDiagnostics}
              />
            </motion.div>
          </AnimatePresence>
        </section>
      )}

      {polygon.length < 3 && contextualBoundaryVertices.length >= 3 && (
        <section
          className="bg-white rounded-lg shadow-lg p-4 space-y-3"
          data-testid="contextual-boundary-measurements"
        >
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {contextualMeasurementTitle}
            </h3>
            <p className="text-sm text-slate-600">
              {contextualMeasurementCopy}
            </p>
          </div>
          <AnimatePresence initial={false}>
            <motion.div
              key={
                showDiagnostics
                  ? "contextual-diagnostics-detailed"
                  : "contextual-diagnostics-summary"
              }
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <BoundaryDiagnostics
                vertices={contextualBoundaryVertices}
                showSegments={showDiagnostics}
                showAngles={showDiagnostics}
              />
            </motion.div>
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}

export default SiteBoundaryEditorV2;
