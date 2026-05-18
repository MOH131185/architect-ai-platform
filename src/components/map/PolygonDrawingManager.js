/**
 * PolygonDrawingManager.js
 *
 * Clean polygon drawing interface with click-to-place workflow.
 *
 * Features:
 * - Click to place vertices
 * - Live preview line following cursor (RAF-throttled)
 * - Double-click or Enter to finish
 * - Auto-close when clicking near first point
 * - SHIFT for angle snapping (default 90° / ortho; configurable)
 * - ESC to cancel current drawing
 * - Real-time validation feedback
 * - AutoCAD-style dynamic length input (type a number to place the next
 *   vertex at exact distance along the snapped/cursor bearing)
 *
 * @module PolygonDrawingManager
 */

import {
  roundCoord,
  snapToVertex,
  constrainToAngle,
  destinationFromBearing,
  liveLengthAndBearing,
  validatePolygon,
  closeRing,
  SNAP_PIXEL_THRESHOLD,
  ORTHO_SNAP_DEGREES,
} from "./boundaryGeometry.js";

/**
 * Polygon Drawing Manager Class
 */
export class PolygonDrawingManager {
  constructor(map, google, options = {}) {
    this.map = map;
    this.google = google;

    this.options = {
      onDrawingStart: null, // () => void
      onVertexAdded: null, // (vertices) => void
      onDrawingComplete: null, // (vertices) => void
      onDrawingCancel: null, // () => void
      onValidationError: null, // (errors) => void
      onCursorMove: null, // (position) => void
      // Dynamic-input callbacks — RAF-coalesced (one emit/frame max).
      onDynamicCursor: null, // ({ anchorPx, lengthM, bearingDeg, locked, hasAnchor }) => void
      onDynamicInputKey: null, // ({ key, ctrl, shift, meta, alt }) => boolean (true => consumed)
      onSnapHint: null, // ('vertex' | 'ortho' | null) => void
      minVertices: 3,
      autoCloseThresholdPx: 15,
      snapThresholdPx: SNAP_PIXEL_THRESHOLD,
      // Default to 90° ortho (AutoCAD-style). Callers can pass 45 to opt back.
      angleSnapDegrees: ORTHO_SNAP_DEGREES,
      strokeColor: "#8B5CF6",
      fillColor: "#8B5CF6",
      previewStrokeColor: "#A78BFA",
      vertexColor: "#8B5CF6",
      ...options,
    };

    // State
    this.isDrawing = false;
    this.vertices = [];
    this.cursorPosition = null;
    this.lastSnapHint = null;

    // Keyboard state
    this.shiftPressed = false;
    this.altPressed = false;

    // RAF throttle state
    this.rafHandle = null;
    this.pendingMovePosition = null;

    // Click suppression after a typed-length commit so the Enter keystroke's
    // synthetic map click doesn't spawn a duplicate vertex.
    this._suppressNextClick = false;
    this._suppressClickTimeout = null;

    // Cached projection (invalidated on bounds/zoom/projection changes).
    this._projectionCache = null;

    // Google Maps objects
    this.polyline = null; // Committed edges
    this.previewLine = null; // Cursor preview line
    this.closingLine = null; // Preview line to first vertex
    this.vertexMarkers = [];
    this.cursorMarker = null;

    // OverlayView for projection
    this.overlayView = null;
    this._initOverlayView();

    // Event listeners
    this.mapClickListener = null;
    this.mapMoveListener = null;
    this.mapDblClickListener = null;
    this.boundsListener = null;
    this.zoomListener = null;
    this.projectionListener = null;
    this.keydownHandler = null;
    this.keyupHandler = null;

    // Test/host hook to ask "is the dynamic input pending non-empty input?"
    // SiteBoundaryEditorV2 sets this at runtime so Enter/Esc gating is correct.
    // Default: always false (legacy behavior).
    this.isDynamicInputPending = () => false;
  }

  /**
   * Initialize OverlayView for projection access. `draw` is called by Google
   * Maps whenever the projection changes (pan/zoom/etc.) — we use that signal
   * to invalidate the projection cache cheaply.
   * @private
   */
  _initOverlayView() {
    this.overlayView = new this.google.maps.OverlayView();
    this.overlayView.onAdd = function () {};
    const self = this;
    this.overlayView.draw = function () {
      self._projectionCache = null;
    };
    this.overlayView.onRemove = function () {
      self._projectionCache = null;
    };
    this.overlayView.setMap(this.map);
  }

  /**
   * Get projection (cached). The cache is invalidated by `OverlayView.draw`
   * and by the explicit map listeners attached in `_attachMapListeners`.
   * @private
   */
  _getProjection() {
    if (this._projectionCache) return this._projectionCache;
    const projection = this.overlayView.getProjection();
    if (projection) {
      this._projectionCache = projection;
    }
    return projection;
  }

  /**
   * Convert lat/lng to pixel
   */
  latLngToPixel(coord) {
    const projection = this._getProjection();
    if (!projection) return null;

    const latLng = new this.google.maps.LatLng(coord[1], coord[0]);
    return projection.fromLatLngToDivPixel(latLng);
  }

  /**
   * Start drawing mode
   */
  start() {
    if (this.isDrawing) return;

    this.isDrawing = true;
    this.vertices = [];
    this.cursorPosition = null;

    // Change map cursor
    this.map.setOptions({ draggableCursor: "crosshair" });

    // Attach listeners
    this._attachMapListeners();
    this._attachKeyboardListeners();

    if (this.options.onDrawingStart) {
      this.options.onDrawingStart();
    }
  }

  /**
   * Stop drawing mode (Guardrail 5: cancel pending RAF + drop the projection
   * cache so we don't leak frames or stale projections after mode changes).
   */
  stop() {
    if (!this.isDrawing) return;

    this.isDrawing = false;

    // Restore cursor
    this.map.setOptions({ draggableCursor: null });

    // Cancel any pending animation frame from the throttled mousemove path.
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.pendingMovePosition = null;
    if (this._suppressClickTimeout) {
      clearTimeout(this._suppressClickTimeout);
      this._suppressClickTimeout = null;
    }
    this._suppressNextClick = false;
    this.lastSnapHint = null;
    if (this.options.onSnapHint) {
      this.options.onSnapHint(null);
    }
    if (this.options.onDynamicCursor) {
      this.options.onDynamicCursor({
        anchorPx: null,
        lengthM: 0,
        bearingDeg: 0,
        locked: false,
        hasAnchor: false,
      });
    }

    // Cleanup
    this._detachMapListeners();
    this._detachKeyboardListeners();
    this._clearVisuals();
  }

  /**
   * Cancel current drawing
   */
  cancel() {
    const wasDrawing = this.vertices.length > 0;

    this.stop();
    this.vertices = [];

    if (wasDrawing && this.options.onDrawingCancel) {
      this.options.onDrawingCancel();
    }
  }

  /**
   * Complete drawing and return polygon
   * @returns {Array<[number, number]> | null} Vertices or null if invalid
   */
  complete() {
    if (this.vertices.length < this.options.minVertices) {
      if (this.options.onValidationError) {
        this.options.onValidationError([
          `Polygon must have at least ${this.options.minVertices} vertices`,
        ]);
      }
      return null;
    }

    // Validate
    const ring = closeRing([...this.vertices]);
    const validation = validatePolygon(ring);

    if (!validation.valid) {
      if (this.options.onValidationError) {
        this.options.onValidationError(validation.errors);
      }
      // Still allow completion but with warnings
    }

    const result = [...this.vertices];
    this.stop();

    if (this.options.onDrawingComplete) {
      this.options.onDrawingComplete(result);
    }

    return result;
  }

  /**
   * Undo last vertex
   */
  undoLastVertex() {
    if (this.vertices.length === 0) return;

    this.vertices.pop();
    this._updateVisuals();

    if (this.options.onVertexAdded) {
      this.options.onVertexAdded([...this.vertices]);
    }
  }

  // ============================================================
  // EVENT HANDLING
  // ============================================================

  _attachMapListeners() {
    // Click to add vertex
    this.mapClickListener = this.map.addListener("click", (e) => {
      this._handleMapClick(e);
    });

    // Mouse move for preview
    this.mapMoveListener = this.map.addListener("mousemove", (e) => {
      this._handleMapMove(e);
    });

    // Double-click to finish
    this.mapDblClickListener = this.map.addListener("dblclick", (e) => {
      e.stop(); // Prevent zoom
      this.complete();
    });

    // Invalidate the projection cache when the map view actually changes.
    // OverlayView.draw also nulls it, but listening here is cheaper and
    // covers the cases where draw is debounced.
    const invalidate = () => {
      this._projectionCache = null;
    };
    this.boundsListener = this.map.addListener("bounds_changed", invalidate);
    this.zoomListener = this.map.addListener("zoom_changed", invalidate);
    this.projectionListener = this.map.addListener(
      "projection_changed",
      invalidate,
    );
  }

  _detachMapListeners() {
    if (this.mapClickListener) {
      this.google.maps.event.removeListener(this.mapClickListener);
      this.mapClickListener = null;
    }
    if (this.mapMoveListener) {
      this.google.maps.event.removeListener(this.mapMoveListener);
      this.mapMoveListener = null;
    }
    if (this.mapDblClickListener) {
      this.google.maps.event.removeListener(this.mapDblClickListener);
      this.mapDblClickListener = null;
    }
    if (this.boundsListener) {
      this.google.maps.event.removeListener(this.boundsListener);
      this.boundsListener = null;
    }
    if (this.zoomListener) {
      this.google.maps.event.removeListener(this.zoomListener);
      this.zoomListener = null;
    }
    if (this.projectionListener) {
      this.google.maps.event.removeListener(this.projectionListener);
      this.projectionListener = null;
    }
  }

  _attachKeyboardListeners() {
    this.keydownHandler = (e) => this._handleKeyDown(e);
    this.keyupHandler = (e) => this._handleKeyUp(e);

    document.addEventListener("keydown", this.keydownHandler);
    document.addEventListener("keyup", this.keyupHandler);
  }

  _detachKeyboardListeners() {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      document.removeEventListener("keyup", this.keyupHandler);
      this.keyupHandler = null;
    }
  }

  _handleMapClick(e) {
    // Guardrail 8: typed-length commits trigger Enter, which Maps may relay as
    // a click; skip exactly one click after a programmatic commit so we don't
    // double-place a vertex.
    if (this._suppressNextClick) {
      this._suppressNextClick = false;
      return;
    }

    const rawCoord = [roundCoord(e.latLng.lng()), roundCoord(e.latLng.lat())];
    const placement = this._resolvePlacement(rawCoord, { isClick: true });
    if (placement.autoClosed) {
      this.complete();
      return;
    }
    this._appendVertex(placement.coord);
  }

  /**
   * Compute the snapped/constrained position for a candidate coord, plus an
   * optional auto-close flag for click handling. Used by both the click path
   * and the RAF-driven preview path so the math stays in one place.
   * @private
   */
  _resolvePlacement(rawCoord, { isClick = false } = {}) {
    let coord = rawCoord;
    let snapHint = null;
    let lockedToOrtho = false;

    if (this.altPressed || this.vertices.length === 0) {
      return { coord, snapHint, lockedToOrtho, autoClosed: false };
    }

    // Auto-close detection (click path only).
    if (isClick && this.vertices.length >= this.options.minVertices) {
      const firstVertex = this.vertices[0];
      const firstPixel = this.latLngToPixel(firstVertex);
      const clickPixel = this.latLngToPixel(coord);
      if (firstPixel && clickPixel) {
        const dx = clickPixel.x - firstPixel.x;
        const dy = clickPixel.y - firstPixel.y;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        if (distPx <= this.options.autoCloseThresholdPx) {
          return { coord, snapHint: "vertex", lockedToOrtho, autoClosed: true };
        }
      }
    }

    // SHIFT = angle snapping (default 90° / ortho).
    if (this.shiftPressed) {
      const lastVertex = this.vertices[this.vertices.length - 1];
      coord = constrainToAngle(
        lastVertex,
        coord,
        this.options.angleSnapDegrees,
      );
      lockedToOrtho = true;
      snapHint = "ortho";
    }

    // Vertex snapping.
    const vertexSnap = snapToVertex(
      coord,
      this.vertices,
      this._getSnapThresholdMeters(),
    );
    if (vertexSnap.snapped) {
      const allowSnapToLast = !isClick;
      const isLast = vertexSnap.snapIndex === this.vertices.length - 1;
      if (!isLast || allowSnapToLast) {
        coord = vertexSnap.point;
        snapHint = "vertex";
      }
    }

    return { coord, snapHint, lockedToOrtho, autoClosed: false };
  }

  _appendVertex(coord) {
    this.vertices.push(coord);
    this._updateVisuals();
    if (this.options.onVertexAdded) {
      this.options.onVertexAdded([...this.vertices]);
    }
  }

  _handleMapMove(e) {
    // RAF throttle: store the latest cursor coord and schedule one frame.
    // Discards every intermediate move event — only the most recent matters.
    this.pendingMovePosition = [
      roundCoord(e.latLng.lng()),
      roundCoord(e.latLng.lat()),
    ];
    if (this.rafHandle != null) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      const pending = this.pendingMovePosition;
      this.pendingMovePosition = null;
      if (!pending || !this.isDrawing) return;
      this._processMove(pending);
    });
  }

  _processMove(rawCoord) {
    const placement = this._resolvePlacement(rawCoord, { isClick: false });
    this.cursorPosition = placement.coord;
    this._updatePreviewLine();

    if (this.options.onCursorMove) {
      this.options.onCursorMove(placement.coord);
    }
    this._emitDynamicCursor(placement);
    this._emitSnapHint(placement.snapHint);
  }

  _emitDynamicCursor(placement) {
    if (!this.options.onDynamicCursor) return;
    const anchorPx = this.latLngToPixel(placement.coord);
    const hasAnchor = this.vertices.length > 0;
    let lengthM = 0;
    let bearingDeg = 0;
    if (hasAnchor) {
      const prev = this.vertices[this.vertices.length - 1];
      const live = liveLengthAndBearing(prev, placement.coord);
      lengthM = live.lengthM;
      bearingDeg = live.bearingDeg;
    }
    this.options.onDynamicCursor({
      anchorPx: anchorPx ? { x: anchorPx.x, y: anchorPx.y } : null,
      lengthM,
      bearingDeg,
      locked: placement.lockedToOrtho,
      hasAnchor,
    });
  }

  _emitSnapHint(hint) {
    if (this.lastSnapHint === hint) return;
    this.lastSnapHint = hint;
    if (this.options.onSnapHint) {
      this.options.onSnapHint(hint);
    }
  }

  /**
   * Programmatically place the next vertex at exactly `lengthM` meters from
   * the previous vertex, along either (a) the Shift-snapped ortho bearing, or
   * (b) the live cursor bearing. Routes through the same `onVertexAdded`
   * callback as a normal map click so undo/redo history is identical.
   *
   * Guardrail 3: rejects non-finite, zero, or negative lengths.
   * Guardrail 4: returns/emits `[lng, lat]`, never lat/lng-swapped.
   * Guardrail 8: shares the click commit path (`_appendVertex`).
   *
   * @param {number} lengthM
   * @returns {boolean} true on commit, false on validation failure
   */
  commitLength(lengthM) {
    const distance = Number(lengthM);
    if (!Number.isFinite(distance) || distance <= 0) {
      if (this.options.onValidationError) {
        this.options.onValidationError([
          "Length must be a positive number greater than zero.",
        ]);
      }
      return false;
    }
    if (this.vertices.length === 0) return false;
    if (!this.cursorPosition) return false;

    const prev = this.vertices[this.vertices.length - 1];
    let bearingDeg;
    if (this.shiftPressed) {
      const constrained = constrainToAngle(
        prev,
        this.cursorPosition,
        this.options.angleSnapDegrees,
      );
      bearingDeg = liveLengthAndBearing(prev, constrained).bearingDeg;
    } else {
      bearingDeg = liveLengthAndBearing(prev, this.cursorPosition).bearingDeg;
    }

    const next = destinationFromBearing(prev, distance, bearingDeg);
    if (!next) return false;

    // Suppress the synthetic click that Maps may fire after the Enter keystroke.
    this._suppressNextClick = true;
    if (this._suppressClickTimeout) clearTimeout(this._suppressClickTimeout);
    this._suppressClickTimeout = setTimeout(() => {
      this._suppressNextClick = false;
      this._suppressClickTimeout = null;
    }, 100);

    this._appendVertex(next);
    return true;
  }

  _handleKeyDown(e) {
    if (e.key === "Shift") {
      this.shiftPressed = true;
      this._updatePreviewLine(); // Re-snap preview
    }
    if (e.key === "Alt") {
      this.altPressed = true;
      e.preventDefault();
    }

    // Modifier-bearing keystrokes (Ctrl/Cmd-anything) are not draw input —
    // let the host page (e.g. Ctrl+Z undo) handle them.
    const hasModifier = e.ctrlKey || e.metaKey;
    const targetTag = e.target?.tagName || "";
    const focusInForm = targetTag === "INPUT" || targetTag === "TEXTAREA";

    // Route numeric/decimal/sign characters to the dynamic-input overlay so
    // the user can start typing without first clicking the floating field.
    if (
      !hasModifier &&
      this.vertices.length > 0 &&
      this.options.onDynamicInputKey &&
      this._isDynamicInputCharacter(e.key) &&
      !focusInForm
    ) {
      const consumed = this.options.onDynamicInputKey({
        key: e.key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        meta: e.metaKey,
        alt: e.altKey,
      });
      if (consumed) {
        e.preventDefault();
        return;
      }
    }

    // Enter: if the dynamic input has a pending value, the host has already
    // handled it (and called `commitLength`). Otherwise fall through to the
    // legacy "finish polygon" behavior.
    if (e.key === "Enter") {
      e.preventDefault();
      if (this.isDynamicInputPending && this.isDynamicInputPending()) {
        return;
      }
      this.complete();
      return;
    }

    // Escape: if the dynamic input has a pending value, host clears it; we
    // skip the undo/cancel chain so the user doesn't accidentally lose
    // vertices while editing the length field.
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.isDynamicInputPending && this.isDynamicInputPending()) {
        return;
      }
      if (this.vertices.length > 0) {
        this.undoLastVertex();
      } else {
        this.cancel();
      }
      return;
    }

    // Backspace/Delete to undo last vertex (unless typing in a real form
    // field, or the dynamic input has a pending value).
    if (e.key === "Backspace" || e.key === "Delete") {
      if (focusInForm) return;
      if (this.isDynamicInputPending && this.isDynamicInputPending()) {
        // Let the dynamic-input overlay handle the keystroke itself.
        return;
      }
      e.preventDefault();
      this.undoLastVertex();
    }
  }

  /**
   * Whether a key would meaningfully contribute to a length value.
   * @private
   */
  _isDynamicInputCharacter(key) {
    if (!key) return false;
    if (key.length === 1) {
      return /[0-9.,]/.test(key);
    }
    return key === "Backspace" || key === "Delete";
  }

  _handleKeyUp(e) {
    if (e.key === "Shift") {
      this.shiftPressed = false;
      this._updatePreviewLine();
    }
    if (e.key === "Alt") {
      this.altPressed = false;
    }
  }

  /**
   * Convert pixel threshold to meters
   * @private
   */
  _getSnapThresholdMeters() {
    const zoom = this.map.getZoom();
    const metersPerPx = 156543.03392 / Math.pow(2, zoom);
    return this.options.snapThresholdPx * metersPerPx;
  }

  // ============================================================
  // VISUAL UPDATES
  // ============================================================

  _updateVisuals() {
    this._updatePolyline();
    this._updateVertexMarkers();
    this._updatePreviewLine();
  }

  _clearVisuals() {
    if (this.polyline) {
      this.polyline.setMap(null);
      this.polyline = null;
    }
    if (this.previewLine) {
      this.previewLine.setMap(null);
      this.previewLine = null;
    }
    if (this.closingLine) {
      this.closingLine.setMap(null);
      this.closingLine = null;
    }
    this.vertexMarkers.forEach((m) => m.setMap(null));
    this.vertexMarkers = [];
    if (this.cursorMarker) {
      this.cursorMarker.setMap(null);
      this.cursorMarker = null;
    }
  }

  _updatePolyline() {
    if (this.vertices.length < 2) {
      if (this.polyline) {
        this.polyline.setMap(null);
        this.polyline = null;
      }
      return;
    }

    const path = this.vertices.map((v) => ({ lat: v[1], lng: v[0] }));

    if (this.polyline) {
      this.polyline.setPath(path);
    } else {
      this.polyline = new this.google.maps.Polyline({
        path,
        strokeColor: this.options.strokeColor,
        strokeOpacity: 1,
        strokeWeight: 3,
        map: this.map,
        zIndex: 200,
      });
    }
  }

  _updateVertexMarkers() {
    // Remove excess markers
    while (this.vertexMarkers.length > this.vertices.length) {
      const marker = this.vertexMarkers.pop();
      marker.setMap(null);
    }

    // Update or create markers
    this.vertices.forEach((vertex, index) => {
      const position = { lat: vertex[1], lng: vertex[0] };

      if (this.vertexMarkers[index]) {
        this.vertexMarkers[index].setPosition(position);
      } else {
        const marker = new this.google.maps.Marker({
          position,
          map: this.map,
          icon: this._getVertexIcon(index === 0),
          zIndex: 300 + index,
        });
        this.vertexMarkers.push(marker);
      }
    });
  }

  _getVertexIcon(isFirst = false) {
    return {
      path: this.google.maps.SymbolPath.CIRCLE,
      scale: isFirst ? 10 : 7,
      fillColor: isFirst ? "#10B981" : this.options.vertexColor,
      fillOpacity: 1,
      strokeColor: "#FFFFFF",
      strokeWeight: 2,
      anchor: new this.google.maps.Point(0, 0),
    };
  }

  _updatePreviewLine() {
    if (this.vertices.length === 0 || !this.cursorPosition) {
      if (this.previewLine) {
        this.previewLine.setMap(null);
        this.previewLine = null;
      }
      if (this.closingLine) {
        this.closingLine.setMap(null);
        this.closingLine = null;
      }
      return;
    }

    // Line from last vertex to cursor
    const lastVertex = this.vertices[this.vertices.length - 1];
    const previewPath = [
      { lat: lastVertex[1], lng: lastVertex[0] },
      { lat: this.cursorPosition[1], lng: this.cursorPosition[0] },
    ];

    if (this.previewLine) {
      this.previewLine.setPath(previewPath);
    } else {
      this.previewLine = new this.google.maps.Polyline({
        path: previewPath,
        strokeColor: this.options.previewStrokeColor,
        strokeOpacity: 0.7,
        strokeWeight: 2,
        strokePattern: [
          {
            icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
            offset: "0",
            repeat: "15px",
          },
        ],
        map: this.map,
        zIndex: 150,
      });
    }

    // If we have enough vertices, show closing preview
    if (this.vertices.length >= this.options.minVertices - 1) {
      const firstVertex = this.vertices[0];
      const closingPath = [
        { lat: this.cursorPosition[1], lng: this.cursorPosition[0] },
        { lat: firstVertex[1], lng: firstVertex[0] },
      ];

      if (this.closingLine) {
        this.closingLine.setPath(closingPath);
      } else {
        this.closingLine = new this.google.maps.Polyline({
          path: closingPath,
          strokeColor: "#10B981",
          strokeOpacity: 0.4,
          strokeWeight: 2,
          map: this.map,
          zIndex: 140,
        });
      }
    }
  }

  /**
   * Get current vertices
   * @returns {Array<[number, number]>}
   */
  getVertices() {
    return [...this.vertices];
  }

  /**
   * Check if currently drawing
   * @returns {boolean}
   */
  isActive() {
    return this.isDrawing;
  }

  /**
   * Clean up resources. Idempotent — safe to call after `stop()` or on a
   * never-started instance. Guardrail 5: ensures no listeners, RAF, or
   * timers outlive the instance.
   */
  destroy() {
    // `stop()` only runs its body when isDrawing; force the cleanup path to
    // run regardless so callers that never started drawing still tear down
    // cleanly.
    this.isDrawing = true;
    this.stop();
    this.isDrawing = false;

    // Defensive: if stop() short-circuited for some reason, ensure listeners
    // and timers are gone.
    this._detachMapListeners();
    this._detachKeyboardListeners();
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (this._suppressClickTimeout) {
      clearTimeout(this._suppressClickTimeout);
      this._suppressClickTimeout = null;
    }
    this._projectionCache = null;
    this.isDynamicInputPending = () => false;

    if (this.overlayView) {
      this.overlayView.setMap(null);
      this.overlayView = null;
    }
  }
}

/**
 * Create PolygonDrawingManager instance
 * @param {google.maps.Map} map
 * @param {Object} google
 * @param {Object} options
 * @returns {PolygonDrawingManager}
 */
export function createPolygonDrawingManager(map, google, options = {}) {
  return new PolygonDrawingManager(map, google, options);
}

export default PolygonDrawingManager;
