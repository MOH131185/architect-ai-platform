/**
 * PolygonDrawingManager.js
 *
 * Clean polygon drawing interface with click-to-place workflow.
 *
 * Features:
 * - Click to place vertices
 * - Live preview line following cursor
 * - Double-click or Enter to finish
 * - Auto-close when clicking near first point
 * - SHIFT for angle snapping (45° increments)
 * - ESC to cancel current drawing
 * - Real-time validation feedback
 *
 * @module PolygonDrawingManager
 */

import {
  roundCoord,
  snapToVertex,
  constrainToAngle,
  validatePolygon,
  closeRing,
  SNAP_PIXEL_THRESHOLD,
  ANGLE_SNAP_DEGREES,
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
      minVertices: 3,
      autoCloseThresholdPx: 15,
      snapThresholdPx: SNAP_PIXEL_THRESHOLD,
      angleSnapDegrees: ANGLE_SNAP_DEGREES,
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

    // Keyboard state
    this.shiftPressed = false;
    this.altPressed = false;

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
    this.keydownHandler = null;
    this.keyupHandler = null;
  }

  /**
   * Initialize OverlayView for projection access
   * @private
   */
  _initOverlayView() {
    this.overlayView = new this.google.maps.OverlayView();
    this.overlayView.onAdd = function () {};
    this.overlayView.draw = function () {};
    this.overlayView.onRemove = function () {};
    this.overlayView.setMap(this.map);
  }

  /**
   * Get projection
   * @private
   */
  _getProjection() {
    return this.overlayView.getProjection();
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
   * Stop drawing mode
   */
  stop() {
    if (!this.isDrawing) return;

    this.isDrawing = false;

    // Restore cursor
    this.map.setOptions({ draggableCursor: null });

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
    let coord = [roundCoord(e.latLng.lng()), roundCoord(e.latLng.lat())];

    // Apply snapping
    if (!this.altPressed) {
      // Check if clicking near first vertex to auto-close
      if (this.vertices.length >= this.options.minVertices) {
        const firstVertex = this.vertices[0];
        const firstPixel = this.latLngToPixel(firstVertex);
        const clickPixel = this.latLngToPixel(coord);

        if (firstPixel && clickPixel) {
          const dx = clickPixel.x - firstPixel.x;
          const dy = clickPixel.y - firstPixel.y;
          const distPx = Math.sqrt(dx * dx + dy * dy);

          if (distPx <= this.options.autoCloseThresholdPx) {
            // Auto-close: complete the polygon
            this.complete();
            return;
          }
        }
      }

      // SHIFT = angle snapping
      if (this.shiftPressed && this.vertices.length > 0) {
        const lastVertex = this.vertices[this.vertices.length - 1];
        coord = constrainToAngle(
          lastVertex,
          coord,
          this.options.angleSnapDegrees,
        );
      }

      // Vertex snapping
      if (this.vertices.length > 0) {
        const vertexSnap = snapToVertex(
          coord,
          this.vertices,
          this._getSnapThresholdMeters(),
        );
        if (
          vertexSnap.snapped &&
          vertexSnap.snapIndex !== this.vertices.length - 1
        ) {
          coord = vertexSnap.point;
        }
      }
    }

    // Add vertex
    this.vertices.push(coord);
    this._updateVisuals();

    if (this.options.onVertexAdded) {
      this.options.onVertexAdded([...this.vertices]);
    }
  }

  _handleMapMove(e) {
    let coord = [roundCoord(e.latLng.lng()), roundCoord(e.latLng.lat())];

    // Apply preview snapping
    if (!this.altPressed && this.vertices.length > 0) {
      // SHIFT = angle snapping
      if (this.shiftPressed) {
        const lastVertex = this.vertices[this.vertices.length - 1];
        coord = constrainToAngle(
          lastVertex,
          coord,
          this.options.angleSnapDegrees,
        );
      }

      // Vertex snapping
      const vertexSnap = snapToVertex(
        coord,
        this.vertices,
        this._getSnapThresholdMeters(),
      );
      if (vertexSnap.snapped) {
        coord = vertexSnap.point;
      }
    }

    this.cursorPosition = coord;
    this._updatePreviewLine();

    if (this.options.onCursorMove) {
      this.options.onCursorMove(coord);
    }
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

    // Enter to complete
    if (e.key === "Enter") {
      e.preventDefault();
      this.complete();
    }

    // Escape to cancel
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.vertices.length > 0) {
        this.undoLastVertex();
      } else {
        this.cancel();
      }
    }

    // Backspace/Delete to undo last vertex
    if (e.key === "Backspace" || e.key === "Delete") {
      if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        this.undoLastVertex();
      }
    }
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
   * Clean up resources
   */
  destroy() {
    this.stop();

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
