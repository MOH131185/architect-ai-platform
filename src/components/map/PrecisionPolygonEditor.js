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
  wouldCauseSelfIntersection,
  openRing,
  closeRing,
  roundCoord,
  SNAP_PIXEL_THRESHOLD,
  ANGLE_SNAP_DEGREES,
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
      minVertices: 3,
      snapThresholdPx: SNAP_PIXEL_THRESHOLD,
      angleSnapDegrees: ANGLE_SNAP_DEGREES,
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
   * Disable editing mode
   */
  disable() {
    if (!this.isEnabled) return;

    this.isEnabled = false;
    this._clearAllMarkers();
    this._removePolygonOverlay();
    this._detachKeyboardListeners();
    this._cancelDrag();
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
      const marker = new this.google.maps.Marker({
        position: { lat: vertex[1], lng: vertex[0] },
        map: this.map,
        icon: this._getVertexIcon(index),
        draggable: true,
        cursor: "move",
        zIndex: 1000 + index,
      });

      // Drag start
      const dragStartListener = marker.addListener("dragstart", () => {
        this._handleDragStart(index);
      });

      // Drag (throttled with RAF)
      const dragListener = marker.addListener("drag", (e) => {
        this._handleDrag(index, e.latLng);
      });

      // Drag end
      const dragEndListener = marker.addListener("dragend", () => {
        this._handleDragEnd(index);
      });

      // Click to select
      const clickListener = marker.addListener("click", () => {
        this._handleVertexClick(index);
      });

      // Hover
      const mouseoverListener = marker.addListener("mouseover", () => {
        if (!this.isDragging) {
          this.hoveredIndex = index;
          marker.setIcon(this._getVertexIcon(index, true));
        }
      });

      const mouseoutListener = marker.addListener("mouseout", () => {
        if (!this.isDragging) {
          this.hoveredIndex = null;
          marker.setIcon(this._getVertexIcon(index));
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

      return marker;
    });
  }

  _clearVertexMarkers() {
    this.vertexMarkers.forEach((m) => m.setMap(null));
    this.vertexMarkers = [];
  }

  _getVertexIcon(index, isHovered = false) {
    const isSelected = index === this.selectedIndex;
    const isDragging = index === this.draggedIndex;

    let fillColor = "#3B82F6"; // Blue
    let scale = 8;

    if (isDragging) {
      fillColor = "#EF4444"; // Red
      scale = 12;
    } else if (isSelected) {
      fillColor = "#8B5CF6"; // Purple
      scale = 10;
    } else if (isHovered) {
      fillColor = "#10B981"; // Green
      scale = 10;
    }

    return {
      path: this.google.maps.SymbolPath.CIRCLE,
      scale,
      fillColor,
      fillOpacity: 1,
      strokeColor: "#FFFFFF",
      strokeWeight: 2,
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
      scale: isHovered ? 6 : 4,
      fillColor: isHovered ? "#10B981" : "#94A3B8",
      fillOpacity: isHovered ? 1 : 0.6,
      strokeColor: "#FFFFFF",
      strokeWeight: 1,
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
    if (this.vertexMarkers[index]) {
      this.vertexMarkers[index].setIcon(this._getVertexIcon(index));
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

        // Revert marker position
        if (this.vertexMarkers[index]) {
          const currentVertex = this.vertices[index];
          this.vertexMarkers[index].setPosition({
            lat: currentVertex[1],
            lng: currentVertex[0],
          });
        }
        return;
      }
    }

    // Update internal state
    this.vertices[index] = newCoord;

    // Update polygon overlay
    this._updatePolygonOverlay();

    // Notify (transient update)
    if (this.options.onVertexUpdate) {
      this.options.onVertexUpdate(index, newCoord, [...this.vertices]);
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

    // Final position from marker
    const marker = this.vertexMarkers[index];
    if (marker) {
      const position = marker.getPosition();
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
      marker.setPosition({ lat: finalCoord[1], lng: finalCoord[0] });
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

    // Update marker appearance
    this.vertexMarkers.forEach((marker, i) => {
      marker.setIcon(this._getVertexIcon(i));
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
      this.vertexMarkers.forEach((marker, i) => {
        marker.setIcon(this._getVertexIcon(i));
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

      if (this.vertexMarkers[index]) {
        this.vertexMarkers[index].setPosition({
          lat: newCoord[1],
          lng: newCoord[0],
        });
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
    this.vertexMarkers.forEach((marker, i) => {
      marker.setIcon(this._getVertexIcon(i));
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
