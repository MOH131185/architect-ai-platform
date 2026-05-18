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

const TRANSPARENT_PIXEL_DATA_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221%22%20height%3D%221%22%2F%3E";

const EDGE_LABEL_STYLE_ID = "ppe-edge-label-style";

function ensureEdgeLabelStyleInjected() {
  if (typeof document === "undefined") return;
  if (document.getElementById(EDGE_LABEL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = EDGE_LABEL_STYLE_ID;
  style.textContent = `.ppe-edge-label{
    text-shadow:
      0 0 3px #ffffff,
      0 0 3px #ffffff,
      0 0 4px #ffffff;
    pointer-events: none;
    white-space: nowrap;
  }`;
  document.head.appendChild(style);
}

function formatEdgeLength(lengthM) {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return "";
  if (lengthM < 1) return `${(lengthM * 100).toFixed(0)} cm`;
  if (lengthM < 100) return `${lengthM.toFixed(2)} m`;
  if (lengthM < 1000) return `${lengthM.toFixed(1)} m`;
  return `${(lengthM / 1000).toFixed(3)} km`;
}

function midpointBearingCursor(bearingDeg) {
  // Map a 0-360° bearing to one of four resize cursors based on the closest
  // 45°-step angle. NS = vertical edge → ns-resize, etc.
  const normalized = ((bearingDeg % 180) + 180) % 180;
  if (normalized < 22.5 || normalized >= 157.5) return "ns-resize";
  if (normalized < 67.5) return "nesw-resize";
  if (normalized < 112.5) return "ew-resize";
  return "nwse-resize";
}

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
      // When the user clicks the polygon body (not on a vertex/edge) while
      // it is not focused, the host can promote it to focused state — this
      // is what lets auto-detected boundaries be selected with a single click.
      onPolygonBodyClick: null, // (latLng) => void
      // Body-translate (drag whole polygon).
      onTranslateStart: null, // () => void
      onTranslateEnd: null, // (polygon) => void
      // When true the editor renders vertex/midpoint/edge-label markers and
      // wires drag/translate. When false the polygon is rendered dimmed and
      // is only clickable to fire onPolygonBodyClick.
      focused: true,
      // When true the polygon is rendered as a dashed amber placeholder
      // (no parcel data found, e.g. desert site). Body interactions remain
      // available; the styling is the only change.
      placeholder: false,
      // Toggle always-visible edge length labels on focused polygons.
      showEdgeLabels: true,
      minVertices: 3,
      snapThresholdPx: SNAP_PIXEL_THRESHOLD,
      // Default to 90° ortho (AutoCAD-style). Pass 45 to restore legacy snap.
      angleSnapDegrees: ORTHO_SNAP_DEGREES,
      preventSelfIntersection: true,
      ...options,
    };

    ensureEdgeLabelStyleInjected();

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
    this.edgeLabelMarkers = [];
    this.edgeHighlight = null;

    // Body-translate state (drag whole polygon).
    this.isTranslating = false;
    this.translateStartLatLng = null;
    this.translateOriginalVertices = null;
    this.translateMapListeners = [];
    this.translateRafHandle = null;
    this.pendingTranslateLatLng = null;
    this.previousMapDraggable = null;

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
   * Set focused state. When focused, vertex/midpoint/edge-label markers are
   * shown and dragging is enabled. When not focused, the polygon is rendered
   * dimmed and is only clickable (fires onPolygonBodyClick).
   * @param {boolean} focused
   */
  setFocused(focused) {
    const next = Boolean(focused);
    if (this.options.focused === next) return;
    this.options.focused = next;
    if (this.isEnabled) {
      // End any in-progress translate before defocusing.
      if (!next && this.isTranslating) {
        this._cancelTranslate();
      }
      this._refresh();
    }
  }

  /**
   * Set placeholder state. When true, the polygon renders dashed amber to
   * indicate "no parcel data found — please refine".
   * @param {boolean} placeholder
   */
  setPlaceholder(placeholder) {
    const next = Boolean(placeholder);
    if (this.options.placeholder === next) return;
    this.options.placeholder = next;
    if (this.isEnabled) {
      this._refresh();
    }
  }

  /**
   * Toggle always-visible edge length labels.
   * @param {boolean} visible
   */
  setEdgeLabelsVisible(visible) {
    const next = Boolean(visible);
    if (this.options.showEdgeLabels === next) return;
    this.options.showEdgeLabels = next;
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
    this._createEdgeLabelMarkers();
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
    this._cancelTranslate();
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
    this._createEdgeLabelMarkers();
  }

  // ============================================================
  // POLYGON OVERLAY
  // ============================================================

  _getPolygonOverlayStyle() {
    const { focused, placeholder } = this.options;
    if (placeholder) {
      // Dashed amber outline used when no parcel data was found within
      // 200 m of the site. Conveys low confidence at a glance and prompts
      // the user to refine via Draw mode.
      return {
        strokeColor: "#F59E0B",
        strokeOpacity: 0,
        strokeWeight: 2,
        fillColor: "#F59E0B",
        fillOpacity: 0.08,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeColor: "#F59E0B",
              strokeOpacity: 0.95,
              strokeWeight: 2,
              scale: 3,
            },
            offset: "0",
            repeat: "10px",
          },
        ],
        cursor: focused ? "move" : "pointer",
      };
    }
    if (focused) {
      return {
        strokeColor: "#10B981",
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: "#10B981",
        fillOpacity: 0.15,
        icons: undefined,
        cursor: "move",
      };
    }
    // Latent — boundary present but not the user's current focus. Polygon
    // stays clickable so a single click promotes it back to focused.
    return {
      strokeColor: "#10B981",
      strokeOpacity: 0.55,
      strokeWeight: 2,
      fillColor: "#10B981",
      fillOpacity: 0.08,
      icons: undefined,
      cursor: "pointer",
    };
  }

  _createPolygonOverlay() {
    if (this.polygonOverlay) {
      this.polygonOverlay.setMap(null);
    }

    if (this.vertices.length < 3) return;

    const path = this.vertices.map((v) => ({ lat: v[1], lng: v[0] }));
    const style = this._getPolygonOverlayStyle();

    this.polygonOverlay = new this.google.maps.Polygon({
      paths: path,
      strokeColor: style.strokeColor,
      strokeOpacity: style.strokeOpacity,
      strokeWeight: style.strokeWeight,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
      icons: style.icons,
      clickable: true,
      draggable: false,
      editable: false,
      geodesic: true,
      map: this.map,
      zIndex: 100,
    });
    if (style.cursor) {
      try {
        this.polygonOverlay.setOptions({ cursor: style.cursor });
      } catch (_e) {
        // setOptions on a Polygon supports cursor in modern Maps API; fall
        // back silently if a stub doesn't.
      }
    }

    // Click on polygon edge to add vertex (focused) OR promote to focused
    // (latent). The handler branches on this.options.focused. We also
    // suppress the trailing click that fires immediately after a
    // body-translate mouseup, otherwise releasing a translate inside the
    // polygon would insert a stray vertex.
    const clickListener = this.polygonOverlay.addListener("click", (e) => {
      if (this.isDragging || this.isTranslating) return;
      if (
        this._lastTranslateEndAt &&
        Date.now() - this._lastTranslateEndAt < 80
      ) {
        return;
      }
      this._handlePolygonClick(e);
    });
    this.listeners.push(clickListener);

    // Body-translate via mousedown on the polygon body. Only active when
    // focused and not placeholder; vertex/midpoint markers have higher
    // zIndex so they capture mousedown when hit-tested.
    const mouseDownListener = this.polygonOverlay.addListener(
      "mousedown",
      (e) => {
        if (!this.options.focused) return;
        if (this.isDragging || this.isTranslating) return;
        if (this.hoveredIndex !== null) return;
        if (this.hoveredEdgeIndex !== null) return;
        this._handleBodyMouseDown(e);
      },
    );
    this.listeners.push(mouseDownListener);
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

    this._updatePolygonOverlayPath();
    this._updatePolygonOverlayStyle();
  }

  /**
   * Hot-path setter — called from _processDrag / _processTranslate at RAF
   * frequency. Only `paths` mutates per frame; the visual style does not.
   * Splitting this out of `_updatePolygonOverlay` removes a `setOptions`
   * call per frame that was forcing Google Maps to recomposite the overlay
   * layer (the visible flicker on the map + page background).
   * @private
   */
  _updatePolygonOverlayPath() {
    if (!this.polygonOverlay) return;
    if (this.vertices.length < 3) return;
    const path = this.vertices.map((v) => ({ lat: v[1], lng: v[0] }));
    this.polygonOverlay.setPath(path);
  }

  /**
   * Cold-path setter — called only when focus / placeholder state changes,
   * not per drag frame.
   * @private
   */
  _updatePolygonOverlayStyle() {
    if (!this.polygonOverlay) return;
    const style = this._getPolygonOverlayStyle();
    try {
      this.polygonOverlay.setOptions({
        strokeColor: style.strokeColor,
        strokeOpacity: style.strokeOpacity,
        strokeWeight: style.strokeWeight,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        icons: style.icons,
        cursor: style.cursor,
      });
    } catch (_e) {
      // Older Maps API stubs may not implement setOptions on Polygon.
    }
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

    // Vertex handles are only rendered when the polygon is the user's
    // current focus. A latent (clicked-to-promote) polygon shows no dots;
    // dashed-amber placeholders also suppress vertex markers because the
    // user is expected to use Draw to define the boundary.
    if (!this.options.focused || this.options.placeholder) return;

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
    // Midpoints (insert-vertex affordance) are gated on focus + non-placeholder
    // for the same reason vertex markers are.
    if (!this.options.focused || this.options.placeholder) return;

    this.midpointMarkers = this.vertices.map((vertex, index) => {
      const nextIndex = (index + 1) % this.vertices.length;
      const nextVertex = this.vertices[nextIndex];

      const midpoint = {
        lat: (vertex[1] + nextVertex[1]) / 2,
        lng: (vertex[0] + nextVertex[0]) / 2,
      };

      // Compute resize cursor from edge bearing so the midpoint signals
      // "drag to add a vertex perpendicular to this edge".
      const dLng = nextVertex[0] - vertex[0];
      const dLat = nextVertex[1] - vertex[1];
      const bearingDeg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      const cursor = midpointBearingCursor(bearingDeg);

      const marker = new this.google.maps.Marker({
        position: midpoint,
        map: this.map,
        icon: this._getMidpointIcon(),
        cursor,
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
    this._clearEdgeLabelMarkers();
  }

  // ============================================================
  // EDGE LENGTH LABELS (always visible while focused)
  // ============================================================

  _createEdgeLabelMarkers() {
    this._clearEdgeLabelMarkers();

    if (this.vertices.length < 2) return;
    if (!this.options.focused || this.options.placeholder) return;
    if (!this.options.showEdgeLabels) return;

    const count = this.vertices.length;
    this.edgeLabelMarkers = new Array(count);
    for (let i = 0; i < count; i++) {
      this.edgeLabelMarkers[i] = this._createEdgeLabelMarker(i);
    }
  }

  _createEdgeLabelMarker(index) {
    const start = this.vertices[index];
    const end = this.vertices[(index + 1) % this.vertices.length];
    if (!start || !end) return null;

    const live = liveLengthAndBearing(start, end);
    const text = formatEdgeLength(live.lengthM);

    const midpoint = {
      lat: (start[1] + end[1]) / 2,
      lng: (start[0] + end[0]) / 2,
    };

    const marker = new this.google.maps.Marker({
      position: midpoint,
      map: this.map,
      clickable: false,
      cursor: "default",
      zIndex: 600,
      icon: {
        url: TRANSPARENT_PIXEL_DATA_URL,
        size: new this.google.maps.Size(1, 1),
        anchor: new this.google.maps.Point(0, 0),
        labelOrigin: new this.google.maps.Point(0, 0),
      },
      label: {
        text: text || " ",
        color: "#0F172A",
        fontSize: "11px",
        fontWeight: "700",
        className: "ppe-edge-label",
      },
    });
    // Cache the last-emitted text on the marker so per-frame updates can
    // skip `setLabel` when the rounded text is unchanged. setLabel forces
    // Google Maps to recreate the marker's label DOM, which compounds the
    // per-frame overlay-recompose cost during drag.
    marker.__lastLabelText = text || " ";

    return marker;
  }

  _clearEdgeLabelMarkers() {
    this.edgeLabelMarkers.forEach((m) => {
      if (m) m.setMap(null);
    });
    this.edgeLabelMarkers = [];
  }

  /**
   * Re-position and re-text the edge-label markers adjacent to a vertex
   * during drag. Two edges share the dragged vertex (incoming + outgoing).
   * @private
   */
  _updateEdgeLabelsForVertex(vertexIndex) {
    if (!this.edgeLabelMarkers || this.edgeLabelMarkers.length === 0) return;
    const count = this.vertices.length;
    const incoming = (vertexIndex - 1 + count) % count;
    const outgoing = vertexIndex;
    [incoming, outgoing].forEach((edgeIndex) => {
      const marker = this.edgeLabelMarkers[edgeIndex];
      if (!marker) return;
      const start = this.vertices[edgeIndex];
      const end = this.vertices[(edgeIndex + 1) % count];
      if (!start || !end) return;
      marker.setPosition({
        lat: (start[1] + end[1]) / 2,
        lng: (start[0] + end[0]) / 2,
      });
      const live = liveLengthAndBearing(start, end);
      const text = formatEdgeLength(live.lengthM) || " ";
      // Only re-issue setLabel when the rendered text actually changes —
      // setLabel forces Google Maps to rebuild the marker's label DOM,
      // which is one of the per-frame mutations contributing to flicker
      // during corner drag.
      if (marker.__lastLabelText === text) return;
      marker.__lastLabelText = text;
      const currentLabel = marker.getLabel();
      marker.setLabel({
        text,
        color: currentLabel?.color || "#0F172A",
        fontSize: currentLabel?.fontSize || "11px",
        fontWeight: currentLabel?.fontWeight || "700",
        className: currentLabel?.className || "ppe-edge-label",
      });
    });
  }

  /**
   * Re-position every edge label without recreating markers. Used during
   * body-translate where every edge moves by the same delta.
   * @private
   */
  _updateAllEdgeLabelPositions() {
    if (!this.edgeLabelMarkers || this.edgeLabelMarkers.length === 0) return;
    const count = this.vertices.length;
    for (let i = 0; i < count; i++) {
      const marker = this.edgeLabelMarkers[i];
      if (!marker) continue;
      const start = this.vertices[i];
      const end = this.vertices[(i + 1) % count];
      if (!start || !end) continue;
      marker.setPosition({
        lat: (start[1] + end[1]) / 2,
        lng: (start[0] + end[0]) / 2,
      });
    }
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

    // Update polygon overlay (path only — style is unchanged during drag).
    this._updatePolygonOverlayPath();

    // Live-update the two edge-length labels adjacent to the dragged vertex.
    this._updateEdgeLabelsForVertex(index);

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
    // When the polygon is not the user's current focus, a body click promotes
    // it to focused state instead of inserting a vertex. This is the seam
    // that lets auto-detected boundaries be selected with one click.
    if (!this.options.focused) {
      if (this.options.onPolygonBodyClick && e?.latLng) {
        this.options.onPolygonBodyClick(e.latLng);
      }
      return;
    }

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
  // BODY TRANSLATE (drag whole polygon)
  // ============================================================

  /**
   * Begin a body-translate. Captures the start latLng + a clone of the
   * current vertices so we can compute deltas without losing precision,
   * disables map panning so the gesture doesn't fight the map drag, and
   * binds map mousemove + mouseup listeners.
   * @private
   */
  _handleBodyMouseDown(e) {
    if (!e?.latLng) return;
    this.isTranslating = true;
    this.translateStartLatLng = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    this.translateOriginalVertices = this.vertices.map((v) => [v[0], v[1]]);

    // Disable map drag so the user's cursor controls the polygon, not the
    // map pan. Restored on mouseup or cancel.
    if (this.map && typeof this.map.get === "function") {
      try {
        this.previousMapDraggable = this.map.get("draggable");
      } catch (_e) {
        this.previousMapDraggable = null;
      }
    } else {
      this.previousMapDraggable = null;
    }
    if (this.map && typeof this.map.setOptions === "function") {
      try {
        this.map.setOptions({ draggable: false });
      } catch (_e) {
        // No-op for stubs
      }
    }

    // Hide vertex/midpoint markers during translate so they don't lag behind
    // the polygon body. Edge labels stay visible and reposition each frame.
    this.vertexMarkers.forEach((pair) => {
      if (pair?.visible) pair.visible.setVisible(false);
      if (pair?.hit) pair.hit.setVisible(false);
    });
    this.midpointMarkers.forEach((m) => m.setVisible(false));

    if (this.map && this.google?.maps?.event) {
      const moveListener = this.google.maps.event.addListener(
        this.map,
        "mousemove",
        (ev) => this._handleBodyMouseMove(ev),
      );
      const upListener = this.google.maps.event.addListener(
        this.map,
        "mouseup",
        () => this._handleBodyMouseUp(),
      );
      this.translateMapListeners.push(moveListener, upListener);
    }

    if (this.options.onTranslateStart) {
      this.options.onTranslateStart();
    }
  }

  _handleBodyMouseMove(e) {
    if (!this.isTranslating || !e?.latLng) return;
    this.pendingTranslateLatLng = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    if (!this.translateRafHandle) {
      this.translateRafHandle = requestAnimationFrame(() =>
        this._processTranslate(),
      );
    }
  }

  _processTranslate() {
    this.translateRafHandle = null;
    if (!this.isTranslating || !this.pendingTranslateLatLng) return;

    const { lat, lng } = this.pendingTranslateLatLng;
    this.pendingTranslateLatLng = null;

    let dLat = lat - this.translateStartLatLng.lat;
    let dLng = lng - this.translateStartLatLng.lng;

    // Shift constrains body translate to a single axis (ortho), matching
    // the snap behavior of the AutoCAD-style draw + vertex drag.
    if (this.shiftPressed) {
      if (Math.abs(dLng) >= Math.abs(dLat)) {
        dLat = 0;
      } else {
        dLng = 0;
      }
    }

    const original = this.translateOriginalVertices;
    for (let i = 0; i < original.length; i++) {
      this.vertices[i] = [
        roundCoord(original[i][0] + dLng),
        roundCoord(original[i][1] + dLat),
      ];
    }

    this._updatePolygonOverlayPath();
    this._updateAllEdgeLabelPositions();

    this._emitSnapHint(this.shiftPressed ? "ortho" : null);
  }

  _handleBodyMouseUp() {
    if (!this.isTranslating) return;
    if (this.translateRafHandle) {
      cancelAnimationFrame(this.translateRafHandle);
      this.translateRafHandle = null;
    }
    // Apply any final pending position one last time so we commit at the
    // exact mouseup location, not the last RAF-coalesced sample.
    if (this.pendingTranslateLatLng) {
      this._processTranslate();
    }
    this._endTranslate({ committed: true });
  }

  _cancelTranslate() {
    if (!this.isTranslating) return;
    if (this.translateRafHandle) {
      cancelAnimationFrame(this.translateRafHandle);
      this.translateRafHandle = null;
    }
    // Revert vertices to their pre-translate clone so a cancel leaves no
    // visual artifact.
    if (this.translateOriginalVertices) {
      this.vertices = this.translateOriginalVertices.map((v) => [v[0], v[1]]);
    }
    this._endTranslate({ committed: false });
  }

  _endTranslate({ committed }) {
    this.isTranslating = false;
    this.pendingTranslateLatLng = null;
    this.translateStartLatLng = null;
    this._lastTranslateEndAt = Date.now();

    // Detach map listeners.
    if (this.translateMapListeners.length && this.google?.maps?.event) {
      this.translateMapListeners.forEach((listener) => {
        this.google.maps.event.removeListener(listener);
      });
    }
    this.translateMapListeners = [];

    // Restore map dragging.
    if (this.map && typeof this.map.setOptions === "function") {
      try {
        this.map.setOptions({
          draggable:
            this.previousMapDraggable === false
              ? false
              : this.previousMapDraggable !== null
                ? Boolean(this.previousMapDraggable)
                : true,
        });
      } catch (_e) {
        // No-op for stubs
      }
    }
    this.previousMapDraggable = null;

    this._emitSnapHint(null);

    // Refresh markers regardless of commit/cancel; vertex positions have
    // either moved or been reverted, but in both cases we need to rebuild
    // marker visuals from `this.vertices`.
    if (this.isEnabled) {
      this._refresh();
    }

    if (committed) {
      this.translateOriginalVertices = null;
      if (this.options.onPolygonChange) {
        this.options.onPolygonChange([...this.vertices]);
      }
      if (this.options.onTranslateEnd) {
        this.options.onTranslateEnd([...this.vertices]);
      }
    } else {
      this.translateOriginalVertices = null;
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

    // Escape to cancel any in-progress translate, otherwise deselect
    if (e.key === "Escape") {
      if (this.isTranslating) {
        this._cancelTranslate();
        return;
      }
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
