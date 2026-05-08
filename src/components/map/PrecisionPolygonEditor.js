/**
 * PrecisionPolygonEditor.js
 *
 * Expert-level polygon editor using Google Maps OverlayView projection
 * for pixel-perfect coordinate conversion at all zoom levels.
 *
 * Features:
 * - No drift: Uses official projection API for screen ↔ lat/lng conversion
 * - Smooth dragging with requestAnimationFrame throttling
 * - SHIFT key for precision mode (angle snapping)
 * - ALT key to disable snapping
 * - Click edge to insert vertex
 * - Delete/Backspace to remove selected vertex
 * - Real-time validation during drag
 *
 * @module PrecisionPolygonEditor
 */

import {
  snapToVertex,
  snapToEdge,
  constrainToAngle,
  liveLengthAndBearing,
  wouldCauseSelfIntersection,
  closeRing,
  roundCoord,
  SNAP_PIXEL_THRESHOLD,
  ORTHO_SNAP_DEGREES,
} from "./boundaryGeometry.js";

/**
 * Precision Polygon Editor Class
 */
export class PrecisionPolygonEditor {
  constructor(map, google, options = {}) {
    this.map = map;
    this.google = google;

    this.options = {
      onVertexUpdate: null, // (index, position, polygon) => void
      onVertexAdd: null, // (index, position, polygon) => void
      onVertexRemove: null, // (index, polygon) => void
      onPolygonChange: null, // (polygon) => void
      onDragStart: null, // (index) => void
      onDragEnd: null, // (index, polygon) => void
      onSelectionChange: null, // (selectedIndex) => void
      onValidationWarning: null, // (message) => void
      // Live drag tooltip + snap badge — RAF-coalesced (one emit/frame max).
      onDragLiveDimension: null, // ({ index, lengthM, bearingDeg, anchorPx }) => void
      onSnapHint: null, // ('vertex' | 'ortho' | null) => void
      minVertices: 3,
      snapThresholdPx: SNAP_PIXEL_THRESHOLD,
      // Default to 90° ortho (AutoCAD-style). Pass 45 to restore legacy snap.
      angleSnapDegrees: ORTHO_SNAP_DEGREES,
      preventSelfIntersection: true,
      ...options,
    };

    // State
    this.vertices = []; // [lng, lat] format
    this.isEnabled = false;
    this.isDragging = false;
    this.draggedIndex = null;
    this.selectedIndex = null;
    this.hoveredIndex = null;
    this.hoveredEdgeIndex = null;
    this.lastSnapHint = null;

    // Keyboard state
    this.shiftPressed = false;
    this.altPressed = false;

    // RAF handle for smooth dragging
    this.rafHandle = null;
    this.pendingDragPosition = null;

    // Google Maps objects
    this.overlayView = null;
    this.polygonOverlay = null;
    this.vertexMarkers = [];
    this.midpointMarkers = [];
    this.edgeHighlight = null;

    // Event listeners
    this.listeners = [];
    this.keydownHandler = null;
    this.keyupHandler = null;

    // Initialize overlay view for projection
    this._initOverlayView();
  }

  /**
   * Initialize OverlayView for projection access
   * @private
   */
  _initOverlayView() {
    const self = this;

    this.overlayView = new this.google.maps.OverlayView();
    this.overlayView.onAdd = function () {};
    this.overlayView.draw = function () {};
    this.overlayView.onRemove = function () {};
    this.overlayView.setMap(this.map);

    // Wait for projection to be available
    this.google.maps.event.addListenerOnce(this.map, "idle", () => {
      self._projectionReady = true;
    });
  }

  /**
   * Get projection (only available after map idle)
   * @private
   */
  _getProjection() {
    return this.overlayView.getProjection();
  }

  /**
   * Convert lat/lng to pixel coordinates
   * @param {[number, number]} coord - [lng, lat]
   * @returns {{x: number, y: number} | null}
   */
  latLngToPixel(coord) {
    const projection = this._getProjection();
    if (!projection) return null;

    const latLng = new this.google.maps.LatLng(coord[1], coord[0]);
    const pixel = projection.fromLatLngToDivPixel(latLng);
    return pixel ? { x: pixel.x, y: pixel.y } : null;
  }

  /**
   * Convert pixel coordinates to lat/lng
   * @param {{x: number, y: number}} pixel
   * @returns {[number, number]} [lng, lat]
   */
  pixelToLatLng(pixel) {
    const projection = this._getProjection();
    if (!projection) return null;

    const point = new this.google.maps.Point(pixel.x, pixel.y);
    const latLng = projection.fromDivPixelToLatLng(point);
    return [roundCoord(latLng.lng()), roundCoord(latLng.lat())];
  }

  /**
   * Set polygon vertices
   * @param {Array<[number, number]>} vertices - Open ring [lng, lat] format
   */
  setVertices(vertices) {
    this.vertices = vertices.map((v) => [roundCoord(v[0]), roundCoord(v[1])]);

    if (this.isEnabled) {
      this._refresh();
    }
  }

  /**
   * Enable editing mode
   */
  enable() {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this._createPolygonOverlay();
    this._createVertexMarkers();
    this._createMidpointMarkers();
    this._attachKeyboardListeners();
  }

  /**
   * Disable editing mode. Guardrail 5: also clears any pending RAF and emits
   * a final null snap-hint / drag-dimension so host overlays don't keep stale
   * state after the user leaves EDIT mode.
   */
  disable() {
    if (!this.isEnabled) return;

    this.isEnabled = false;
    this._clearAllMarkers();
    this._removePolygonOverlay();
    this._detachKeyboardListeners();
    this._cancelDrag();
    this._emitSnapHint(null);
    if (this.options.onDragLiveDimension) {
      this.options.onDragLiveDimension(null);
    }
  }

  /**
   * Refresh all visual elements
   * @private
   */
  _refresh() {
    this._clearAllMarkers();
    this._updatePolygonOverlay();
    this._createVertexMarkers();
    this._createMidpointMarkers();
  }

  // ============================================================
  // POLYGON OVERLAY
  // ============================================================

  _createPolygonOverlay() {
    if (this.polygonOverlay) {
      this.polygonOverlay.setMap(null);
    }

    if (this.vertices.length < 3) return;

    const path = this.vertices.map((v) => ({ lat: v[1], lng: v[0] }));

    this.polygonOverlay = new this.google.maps.Polygon({
      paths: path,
      strokeColor: "#10B981",
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: "#10B981",
      fillOpacity: 0.15,
      clickable: true,
      draggable: false,
      editable: false,
      geodesic: true,
      map: this.map,
      zIndex: 100,
    });

    // Click on polygon edge to add vertex
    const clickListener = this.polygonOverlay.addListener("click", (e) => {
      if (this.isDragging) return;
      this._handlePolygonClick(e);
    });

    this.listeners.push(clickListener);
  }

  _updatePolygonOverlay() {
    if (!this.polygonOverlay) {
      this._createPolygonOverlay();
      return;
    }

    if (this.vertices.length < 3) {
      this.polygonOverlay.setMap(null);
      return;
    }

    const path = this.vertices.map((v) => ({ lat: v[1], lng: v[0] }));
    this.polygonOverlay.setPath(path);
  }

  _removePolygonOverlay() {
    if (this.polygonOverlay) {
      this.polygonOverlay.setMap(null);
      this.polygonOverlay = null;
    }
  }

  // ============================================================
  // VERTEX MARKERS
  // ============================================================

  _createVertexMarkers() {
    this._clearVertexMarkers();

    this.vertexMarkers = this.vertices.map((vertex, index) => {
      const position = { lat: vertex[1], lng: vertex[0] };

      // Visible marker: pure visual, never draggable, never clickable.
      // The hit-shadow marker (below) owns all pointer events so the user
      // gets a generously sized hit target without changing the visible dot.
      const visible = new this.google.maps.Marker({
        position,
        map: this.map,
        icon: this._getVertexIcon(index),
        draggable: false,
        clickable: false,
        cursor: "default",
        zIndex: 1000 + index,
      });

      // Hit-shadow marker: invisible (opacity 0.001), bigger than the visible
      // marker, and on top so all clicks/drags resolve here. Forwards every
      // event to the same handlers the visible marker used to own.
      const hit = new this.google.maps.Marker({
        position,
        map: this.map,
        icon: this._getVertexHitIcon(),
        draggable: true,
        clickable: true,
        cursor: "move",
        zIndex: 2000 + index,
      });

      const dragStartListener = hit.addListener("dragstart", () => {
        this._handleDragStart(index);
      });

      // Mirror the hit position to the visible marker so the user can see the
      // drag without waiting for the RAF-driven polygon repaint.
      const dragListener = hit.addListener("drag", (e) => {
        if (visible) visible.setPosition(e.latLng);
        this._handleDrag(index, e.latLng);
      });

      const dragEndListener = hit.addListener("dragend", () => {
        this._handleDragEnd(index);
      });

      const clickListener = hit.addListener("click", () => {
        this._handleVertexClick(index);
      });

      const mouseoverListener = hit.addListener("mouseover", () => {
        if (!this.isDragging) {
          this.hoveredIndex = index;
          if (visible) visible.setIcon(this._getVertexIcon(index, true));
        }
      });

      const mouseoutListener = hit.addListener("mouseout", () => {
        if (!this.isDragging) {
          this.hoveredIndex = null;
          if (visible) visible.setIcon(this._getVertexIcon(index));
        }
      });

      this.listeners.push(
        dragStartListener,
        dragListener,
        dragEndListener,
        clickListener,
        mouseoverListener,
        mouseoutListener,
      );

      return { visible, hit };
    });
  }

  _clearVertexMarkers() {
    this.vertexMarkers.forEach((pair) => {
      if (pair?.visible) pair.visible.setMap(null);
      if (pair?.hit) pair.hit.setMap(null);
    });
    this.vertexMarkers = [];
  }

  _getVertexIcon(index, isHovered = false) {
    const isSelected = index === this.selectedIndex;
    const isDragging = index === this.draggedIndex;

    // Bumped from 10 → 12 default; hover/selected/dragging all bumped to 15
    // so the visible dot is comfortably sized at typical site zoom levels.
    let fillColor = "#2563EB"; // Blue
    let strokeColor = "#FFFFFF";
    let strokeWeight = 3;
    let scale = 12;

    if (isDragging) {
      fillColor = "#EF4444"; // Red
      strokeColor = "#7F1D1D";
      strokeWeight = 4;
      scale = 15;
    } else if (isSelected) {
      fillColor = "#F59E0B"; // Amber
      strokeColor = "#1E3A8A";
      strokeWeight = 4;
      scale = 15;
    } else if (isHovered) {
      fillColor = "#10B981"; // Green
      strokeColor = "#064E3B";
      strokeWeight = 4;
      scale = 15;
    }

    return {
      path: this.google.maps.SymbolPath.CIRCLE,
      scale,
      fillColor,
      fillOpacity: 1,
      strokeColor,
      strokeWeight,
      anchor: new this.google.maps.Point(0, 0),
    };
  }

  /**
   * Hit-shadow icon: invisible to the user (opacity 0.001) but ~22 px wide so
   * the click/drag target is much larger than the visible dot. The hit marker
   * is layered above the visible marker with a higher zIndex.
   * @private
   */
  _getVertexHitIcon() {
    return {
      path: this.google.maps.SymbolPath.CIRCLE,
      scale: 22,
      fillColor: "#FFFFFF",
      fillOpacity: 0.001,
      strokeColor: "#FFFFFF",
      strokeOpacity: 0,
      strokeWeight: 0,
      anchor: new this.google.maps.Point(0, 0),
    };
  }

  // ============================================================
  // MIDPOINT MARKERS (for adding vertices)
  // ============================================================

  _createMidpointMarkers() {
    this._clearMidpointMarkers();

    if (this.vertices.length < 2) return;

    this.midpointMarkers = this.vertices.map((vertex, index) => {
      const nextIndex = (index + 1) % this.vertices.length;
      const nextVertex = this.vertices[nextIndex];

      const midpoint = {
        lat: (vertex[1] + nextVertex[1]) / 2,
        lng: (vertex[0] + nextVertex[0]) / 2,
      };

      const marker = new this.google.maps.Marker({
        position: midpoint,
        map: this.map,
        icon: this._getMidpointIcon(),
        cursor: "pointer",
        zIndex: 500,
      });

      // Click to add vertex
      const clickListener = marker.addListener("click", () => {
        this._handleMidpointClick(index, midpoint);
      });

      // Hover
      const mouseoverListener = marker.addListener("mouseover", () => {
        this.hoveredEdgeIndex = index;
        marker.setIcon(this._getMidpointIcon(true));
      });

      const mouseoutListener = marker.addListener("mouseout", () => {
        this.hoveredEdgeIndex = null;
        marker.setIcon(this._getMidpointIcon());
      });

      this.listeners.push(clickListener, mouseoverListener, mouseoutListener);

      return marker;
    });
  }

  _clearMidpointMarkers() {
    this.midpointMarkers.forEach((m) => m.setMap(null));
    this.midpointMarkers = [];
  }

  _getMidpointIcon(isHovered = false) {
    return {
      path: this.google.maps.SymbolPath.CIRCLE,
      scale: isHovered ? 9 : 6,
      fillColor: isHovered ? "#10B981" : "#F59E0B",
      fillOpacity: isHovered ? 1 : 0.9,
      strokeColor: isHovered ? "#064E3B" : "#FFFFFF",
      strokeWeight: isHovered ? 3 : 2,
      anchor: new this.google.maps.Point(0, 0),
    };
  }

  _clearAllMarkers() {
    this._clearVertexMarkers();
    this._clearMidpointMarkers();
  }

  // ============================================================
  // DRAG HANDLING (with RAF throttling and projection)
  // ============================================================

  _handleDragStart(index) {
    this.isDragging = true;
    this.draggedIndex = index;

    // Update marker appearance
    const pair = this.vertexMarkers[index];
    if (pair?.visible) {
      pair.visible.setIcon(this._getVertexIcon(index));
    }

    // Hide midpoint markers during drag
    this.midpointMarkers.forEach((m) => m.setVisible(false));

    if (this.options.onDragStart) {
      this.options.onDragStart(index);
    }
  }

  _handleDrag(index, latLng) {
    // Store pending position for RAF processing
    this.pendingDragPosition = {
      index,
      lat: latLng.lat(),
      lng: latLng.lng(),
    };

    // Use RAF to throttle updates
    if (!this.rafHandle) {
      this.rafHandle = requestAnimationFrame(() => {
        this._processDrag();
      });
    }
  }

  _processDrag() {
    this.rafHandle = null;

    if (!this.pendingDragPosition) return;

    const { index, lat, lng } = this.pendingDragPosition;
    this.pendingDragPosition = null;

    let newCoord = [roundCoord(lng), roundCoord(lat)];
    let orthoSnapped = false;
    let vertexSnapped = false;

    // Apply snapping based on keyboard state
    if (!this.altPressed) {
      // SHIFT = angle snapping to previous vertex
      if (this.shiftPressed && index > 0) {
        const prevVertex = this.vertices[index - 1];
        newCoord = constrainToAngle(
          prevVertex,
          newCoord,
          this.options.angleSnapDegrees,
        );
        orthoSnapped = true;
      }

      // Vertex snapping (to other vertices)
      const otherVertices = this.vertices.filter((_, i) => i !== index);
      const vertexSnap = snapToVertex(
        newCoord,
        otherVertices,
        this._getSnapThresholdMeters(),
      );
      if (vertexSnap.snapped) {
        newCoord = vertexSnap.point;
        vertexSnapped = true;
      }
    }

    // Check for self-intersection
    if (this.options.preventSelfIntersection) {
      const wouldIntersect = wouldCauseSelfIntersection(
        closeRing(this.vertices),
        index,
        newCoord,
      );

      if (wouldIntersect) {
        // Don't apply the move, show warning
        if (this.options.onValidationWarning) {
          this.options.onValidationWarning(
            "Move would cause self-intersection",
          );
        }

        // Revert BOTH marker positions (visible and hit) so they stay in sync.
        const pair = this.vertexMarkers[index];
        if (pair) {
          const currentVertex = this.vertices[index];
          const revertPos = { lat: currentVertex[1], lng: currentVertex[0] };
          if (pair.visible) pair.visible.setPosition(revertPos);
          if (pair.hit) pair.hit.setPosition(revertPos);
        }
        return;
      }
    }

    // Update internal state
    this.vertices[index] = newCoord;

    // Update polygon overlay
    this._updatePolygonOverlay();

    // Live dimension tooltip (read-only): segment from previous vertex.
    this._emitDragLiveDimension(index, newCoord);

    // Snap hint priority: vertex snap wins over ortho lock (shows 'ENDPOINT'
    // even if the user is also holding Shift, because endpoint snap is the
    // higher-fidelity action).
    let hint = null;
    if (vertexSnapped) hint = "vertex";
    else if (orthoSnapped) hint = "ortho";
    this._emitSnapHint(hint);

    // Notify (transient update)
    if (this.options.onVertexUpdate) {
      this.options.onVertexUpdate(index, newCoord, [...this.vertices]);
    }
  }

  _emitDragLiveDimension(index, newCoord) {
    if (!this.options.onDragLiveDimension) return;
    if (index <= 0) {
      // No "previous" vertex for the first index — emit zeros so the overlay
      // can still show a placeholder anchored on the dragged marker.
      const anchorPx = this.latLngToPixel(newCoord);
      this.options.onDragLiveDimension({
        index,
        lengthM: 0,
        bearingDeg: 0,
        anchorPx: anchorPx ? { x: anchorPx.x, y: anchorPx.y } : null,
      });
      return;
    }
    const prev = this.vertices[index - 1];
    const live = liveLengthAndBearing(prev, newCoord);
    const anchorPx = this.latLngToPixel(newCoord);
    this.options.onDragLiveDimension({
      index,
      lengthM: live.lengthM,
      bearingDeg: live.bearingDeg,
      anchorPx: anchorPx ? { x: anchorPx.x, y: anchorPx.y } : null,
    });
  }

  _emitSnapHint(hint) {
    if (this.lastSnapHint === hint) return;
    this.lastSnapHint = hint;
    if (this.options.onSnapHint) {
      this.options.onSnapHint(hint);
    }
  }

  _handleDragEnd(index) {
    this.isDragging = false;
    this.draggedIndex = null;

    // Cancel any pending RAF
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }

    // Read final position from the hit marker (the one Google Maps was
    // dragging); fall back to the visible marker if the pair is malformed.
    const pair = this.vertexMarkers[index];
    const sourceMarker = pair?.hit || pair?.visible;
    if (sourceMarker) {
      const position = sourceMarker.getPosition();
      let finalCoord = [roundCoord(position.lng()), roundCoord(position.lat())];

      // Apply final snapping
      if (!this.altPressed) {
        if (this.shiftPressed && index > 0) {
          const prevVertex = this.vertices[index - 1];
          finalCoord = constrainToAngle(
            prevVertex,
            finalCoord,
            this.options.angleSnapDegrees,
          );
        }

        const otherVertices = this.vertices.filter((_, i) => i !== index);
        const vertexSnap = snapToVertex(
          finalCoord,
          otherVertices,
          this._getSnapThresholdMeters(),
        );
        if (vertexSnap.snapped) {
          finalCoord = vertexSnap.point;
        }
      }

      // Update to snapped position
      this.vertices[index] = finalCoord;
      const finalLatLng = { lat: finalCoord[1], lng: finalCoord[0] };
      if (pair?.visible) pair.visible.setPosition(finalLatLng);
      if (pair?.hit) pair.hit.setPosition(finalLatLng);
    }

    // Clear the live drag hint state once the drag finishes.
    this._emitSnapHint(null);
    if (this.options.onDragLiveDimension) {
      this.options.onDragLiveDimension(null);
    }

    // Refresh UI
    this._refresh();

    // Notify
    if (this.options.onDragEnd) {
      this.options.onDragEnd(index, [...this.vertices]);
    }

    if (this.options.onPolygonChange) {
      this.options.onPolygonChange([...this.vertices]);
    }
  }

  _cancelDrag() {
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.isDragging = false;
    this.draggedIndex = null;
    this.pendingDragPosition = null;
  }

  /**
   * Convert pixel threshold to meters based on current zoom
   * @private
   */
  _getSnapThresholdMeters() {
    const zoom = this.map.getZoom();
    // Approximate meters per pixel at equator
    const metersPerPx = (156543.03392 * Math.cos(0)) / Math.pow(2, zoom);
    return this.options.snapThresholdPx * metersPerPx;
  }

  // ============================================================
  // CLICK HANDLERS
  // ============================================================

  _handleVertexClick(index) {
    // If already selected, deselect
    if (this.selectedIndex === index) {
      this.selectedIndex = null;
    } else {
      this.selectedIndex = index;
    }

    // Update visible-marker appearance for every vertex.
    this.vertexMarkers.forEach((pair, i) => {
      if (pair?.visible) pair.visible.setIcon(this._getVertexIcon(i));
    });

    if (this.options.onSelectionChange) {
      this.options.onSelectionChange(this.selectedIndex);
    }
  }

  _handleMidpointClick(edgeIndex, midpoint) {
    const insertIndex = edgeIndex + 1;
    const newCoord = [roundCoord(midpoint.lng), roundCoord(midpoint.lat)];

    // Insert vertex
    this.vertices.splice(insertIndex, 0, newCoord);

    // Refresh UI
    this._refresh();

    // Notify
    if (this.options.onVertexAdd) {
      this.options.onVertexAdd(insertIndex, newCoord, [...this.vertices]);
    }

    if (this.options.onPolygonChange) {
      this.options.onPolygonChange([...this.vertices]);
    }
  }

  _handlePolygonClick(e) {
    // Find nearest edge and add vertex
    const clickCoord = [e.latLng.lng(), e.latLng.lat()];
    const ring = closeRing(this.vertices);

    const edgeSnap = snapToEdge(clickCoord, ring, 50); // Large threshold for click
    if (edgeSnap.snapped) {
      const insertIndex = edgeSnap.edgeIndex + 1;

      this.vertices.splice(insertIndex, 0, edgeSnap.point);
      this._refresh();

      if (this.options.onVertexAdd) {
        this.options.onVertexAdd(insertIndex, edgeSnap.point, [
          ...this.vertices,
        ]);
      }

      if (this.options.onPolygonChange) {
        this.options.onPolygonChange([...this.vertices]);
      }
    }
  }

  // ============================================================
  // KEYBOARD HANDLING
  // ============================================================

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

  _handleKeyDown(e) {
    // Track modifier keys
    if (e.key === "Shift") {
      this.shiftPressed = true;
    }
    if (e.key === "Alt") {
      this.altPressed = true;
      e.preventDefault(); // Prevent browser menu
    }

    // Delete/Backspace to remove selected vertex
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      this.selectedIndex !== null
    ) {
      // Don't interfere with input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      e.preventDefault();
      this.removeVertex(this.selectedIndex);
    }

    // Escape to deselect
    if (e.key === "Escape") {
      this.selectedIndex = null;
      this.vertexMarkers.forEach((pair, i) => {
        if (pair?.visible) pair.visible.setIcon(this._getVertexIcon(i));
      });

      if (this.options.onSelectionChange) {
        this.options.onSelectionChange(null);
      }
    }
  }

  _handleKeyUp(e) {
    if (e.key === "Shift") {
      this.shiftPressed = false;
    }
    if (e.key === "Alt") {
      this.altPressed = false;
    }
  }

  // ============================================================
  // PUBLIC METHODS
  // ============================================================

  /**
   * Programmatically add a vertex
   * @param {number} index - Insert position
   * @param {[number, number]} coord - [lng, lat]
   */
  addVertex(index, coord) {
    const newCoord = [roundCoord(coord[0]), roundCoord(coord[1])];
    this.vertices.splice(index, 0, newCoord);

    if (this.isEnabled) {
      this._refresh();
    }

    if (this.options.onVertexAdd) {
      this.options.onVertexAdd(index, newCoord, [...this.vertices]);
    }

    if (this.options.onPolygonChange) {
      this.options.onPolygonChange([...this.vertices]);
    }
  }

  /**
   * Programmatically remove a vertex
   * @param {number} index - Vertex index
   * @returns {boolean} Success
   */
  removeVertex(index) {
    if (this.vertices.length <= this.options.minVertices) {
      if (this.options.onValidationWarning) {
        this.options.onValidationWarning(
          `Cannot remove vertex: polygon must have at least ${this.options.minVertices} vertices`,
        );
      }
      return false;
    }

    this.vertices.splice(index, 1);

    // Clear selection if removed vertex was selected
    if (this.selectedIndex === index) {
      this.selectedIndex = null;
    } else if (this.selectedIndex > index) {
      this.selectedIndex--;
    }

    if (this.isEnabled) {
      this._refresh();
    }

    if (this.options.onVertexRemove) {
      this.options.onVertexRemove(index, [...this.vertices]);
    }

    if (this.options.onPolygonChange) {
      this.options.onPolygonChange([...this.vertices]);
    }

    return true;
  }

  /**
   * Programmatically update a vertex
   * @param {number} index - Vertex index
   * @param {[number, number]} coord - New [lng, lat]
   */
  updateVertexPosition(index, coord) {
    if (index < 0 || index >= this.vertices.length) return;

    const newCoord = [roundCoord(coord[0]), roundCoord(coord[1])];
    this.vertices[index] = newCoord;

    if (this.isEnabled) {
      this._updatePolygonOverlay();

      const pair = this.vertexMarkers[index];
      if (pair) {
        const latLng = { lat: newCoord[1], lng: newCoord[0] };
        if (pair.visible) pair.visible.setPosition(latLng);
        if (pair.hit) pair.hit.setPosition(latLng);
      }
    }

    if (this.options.onVertexUpdate) {
      this.options.onVertexUpdate(index, newCoord, [...this.vertices]);
    }

    if (this.options.onPolygonChange) {
      this.options.onPolygonChange([...this.vertices]);
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
   * Select a vertex
   * @param {number | null} index
   */
  selectVertex(index) {
    this.selectedIndex = index;
    this.vertexMarkers.forEach((pair, i) => {
      if (pair?.visible) pair.visible.setIcon(this._getVertexIcon(i));
    });

    if (this.options.onSelectionChange) {
      this.options.onSelectionChange(index);
    }
  }

  /**
   * Clean up all resources
   */
  destroy() {
    this.disable();

    // Remove all listeners
    this.listeners.forEach((listener) => {
      this.google.maps.event.removeListener(listener);
    });
    this.listeners = [];

    // Remove overlay view
    if (this.overlayView) {
      this.overlayView.setMap(null);
      this.overlayView = null;
    }
  }
}

/**
 * Create PrecisionPolygonEditor instance
 * @param {google.maps.Map} map
 * @param {Object} google - Google Maps API
 * @param {Object} options
 * @returns {PrecisionPolygonEditor}
 */
export function createPrecisionPolygonEditor(map, google, options = {}) {
  return new PrecisionPolygonEditor(map, google, options);
}

export default PrecisionPolygonEditor;
