/**
 * Polygon Editor - Map Interaction Logic
 *
 * Manages polygon rendering and editing on Google Maps:
 * - Create/update polygon shape
 * - Draggable vertex markers
 * - Add vertex on Shift+Click
 * - Delete vertex on Right-click
 * - Live polygon updates
 */

/**
 * @typedef {Object} PolygonEditorConfig
 * @property {google.maps.Map} map - Google Maps instance
 * @property {Array<{lat: number, lng: number}>} vertices - Initial polygon vertices
 * @property {boolean} editable - Whether editing is enabled
 * @property {Function} onUpdate - Callback when polygon is updated
 * @property {Object} styles - Custom styling options
 */

/**
 * Default polygon styling
 */
const DEFAULT_POLYGON_STYLES = {
  fillColor: '#2962FF',
  fillOpacity: 0.25,
  strokeColor: '#2962FF',
  strokeWeight: 3,
  strokeOpacity: 0.9,
};

/**
 * Default vertex marker styling
 */
const DEFAULT_MARKER_STYLES = {
  default: {
    path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
    fillColor: '#FFFFFF',
    fillOpacity: 1,
    strokeColor: '#2962FF',
    strokeWeight: 3,
    scale: 8,
  },
  hover: {
    fillColor: '#2962FF',
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 3,
    scale: 10,
  },
  dragging: {
    fillColor: '#FF5722',
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 3,
    scale: 12,
  },
};

/**
 * PolygonEditor class for managing polygon editing on Google Maps
 */
export class PolygonEditor {
  /**
   * Create a new PolygonEditor instance
   * @param {PolygonEditorConfig} config - Editor configuration
   */
  constructor(config) {
    this.map = config.map;
    this.vertices = config.vertices || [];
    this.editable = config.editable !== false;
    this.onUpdate = config.onUpdate || (() => {});
    this.styles = { ...DEFAULT_POLYGON_STYLES, ...config.styles };

    // Map objects
    this.polygon = null;
    this.markers = [];
    this.polyline = null;

    // Event listeners
    this.mapListeners = [];

    // Initialize
    this.init();
  }

  /**
   * Initialize the polygon editor
   */
  init() {
    if (!this.map || !window.google) {
      console.warn('PolygonEditor: Map or Google Maps API not available');
      return;
    }

    this.createPolygon();
    if (this.editable) {
      this.createMarkers();
      this.attachMapListeners();
    }
  }

  /**
   * Create the polygon shape on the map
   */
  createPolygon() {
    if (this.polygon) {
      this.polygon.setMap(null);
    }

    if (this.vertices.length < 3) {
      return;
    }

    this.polygon = new window.google.maps.Polygon({
      paths: this.vertices,
      ...this.styles,
      editable: false, // We handle editing manually with markers
      draggable: false,
      map: this.map,
      zIndex: 1,
    });
  }

  /**
   * Create draggable vertex markers
   */
  createMarkers() {
    // Clear existing markers
    this.clearMarkers();

    if (!this.editable) return;

    this.vertices.forEach((vertex, index) => {
      const marker = new window.google.maps.Marker({
        position: vertex,
        map: this.map,
        draggable: true,
        icon: this.getMarkerIcon('default'),
        zIndex: 10 + index,
        title: `Vertex ${index + 1}`,
      });

      // Store vertex index
      marker.vertexIndex = index;

      // Attach marker events
      this.attachMarkerListeners(marker, index);

      this.markers.push(marker);
    });
  }

  /**
   * Get marker icon configuration
   * @param {string} state - Marker state (default, hover, dragging)
   * @returns {Object} Icon configuration
   */
  getMarkerIcon(state) {
    const styles = DEFAULT_MARKER_STYLES[state] || DEFAULT_MARKER_STYLES.default;
    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      ...styles,
    };
  }

  /**
   * Attach event listeners to a vertex marker
   * @param {google.maps.Marker} marker - Marker instance
   * @param {number} index - Vertex index
   */
  attachMarkerListeners(marker, index) {
    // Drag start
    marker.addListener('dragstart', () => {
      marker.setIcon(this.getMarkerIcon('dragging'));
    });

    // Dragging
    marker.addListener('drag', () => {
      const position = marker.getPosition();
      this.vertices[index] = {
        lat: position.lat(),
        lng: position.lng(),
      };
      this.updatePolygon();
    });

    // Drag end
    marker.addListener('dragend', () => {
      marker.setIcon(this.getMarkerIcon('default'));
      this.notifyUpdate();
    });

    // Hover effects
    marker.addListener('mouseover', () => {
      if (!marker.getIcon().fillColor?.includes('FF5722')) {
        marker.setIcon(this.getMarkerIcon('hover'));
      }
    });

    marker.addListener('mouseout', () => {
      if (!marker.getIcon().fillColor?.includes('FF5722')) {
        marker.setIcon(this.getMarkerIcon('default'));
      }
    });

    // Right-click to delete
    marker.addListener('rightclick', () => {
      this.deleteVertex(index);
    });

    // Double-click to delete (alternative)
    marker.addListener('dblclick', () => {
      this.deleteVertex(index);
    });
  }

  /**
   * Attach map-level event listeners
   */
  attachMapListeners() {
    // Shift+Click to add vertex
    const clickListener = this.map.addListener('click', (event) => {
      if (event.domEvent && event.domEvent.shiftKey) {
        this.addVertexAtLocation(event.latLng);
      }
    });

    this.mapListeners.push(clickListener);
  }

  /**
   * Add a new vertex at a clicked location
   * @param {google.maps.LatLng} latLng - Click location
   */
  addVertexAtLocation(latLng) {
    const newVertex = {
      lat: latLng.lat(),
      lng: latLng.lng(),
    };

    // Find the best position to insert the vertex
    // (closest to an existing edge)
    let bestIndex = this.vertices.length;
    let minDistance = Infinity;

    for (let i = 0; i < this.vertices.length; i++) {
      const p1 = this.vertices[i];
      const p2 = this.vertices[(i + 1) % this.vertices.length];

      const distance = this.distanceToSegment(newVertex, p1, p2);

      if (distance < minDistance) {
        minDistance = distance;
        bestIndex = i + 1;
      }
    }

    // Insert vertex
    this.vertices.splice(bestIndex, 0, newVertex);

    // Recreate polygon and markers
    this.createPolygon();
    this.createMarkers();
    this.notifyUpdate();
  }

  /**
   * Calculate distance from a point to a line segment
   * @param {Object} point - Point to check
   * @param {Object} p1 - Segment start
   * @param {Object} p2 - Segment end
   * @returns {number} Distance
   */
  distanceToSegment(point, p1, p2) {
    const x = point.lng;
    const y = point.lat;
    const x1 = p1.lng;
    const y1 = p1.lat;
    const x2 = p2.lng;
    const y2 = p2.lat;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Delete a vertex from the polygon
   * @param {number} index - Vertex index to delete
   */
  deleteVertex(index) {
    // Ensure minimum 3 vertices
    if (this.vertices.length <= 3) {
      console.warn('Cannot delete vertex: minimum 3 vertices required');
      return;
    }

    // Remove vertex
    this.vertices.splice(index, 1);

    // Recreate polygon and markers
    this.createPolygon();
    this.createMarkers();
    this.notifyUpdate();
  }

  /**
   * Update the polygon path with current vertices
   */
  updatePolygon() {
    if (this.polygon) {
      this.polygon.setPath(this.vertices);
    }
  }

  /**
   * Set new vertices
   * @param {Array<{lat: number, lng: number}>} vertices - New vertices
   */
  setVertices(vertices) {
    this.vertices = vertices || [];
    this.createPolygon();
    if (this.editable) {
      this.createMarkers();
    }
  }

  /**
   * Enable or disable editing
   * @param {boolean} editable - Whether editing is enabled
   */
  setEditable(editable) {
    this.editable = editable;

    if (editable) {
      this.createMarkers();
      this.attachMapListeners();
    } else {
      this.clearMarkers();
      this.removeMapListeners();
    }
  }

  /**
   * Update polygon styling
   * @param {Object} styles - New style options
   */
  setStyles(styles) {
    this.styles = { ...this.styles, ...styles };

    if (this.polygon) {
      this.polygon.setOptions(this.styles);
    }
  }

  /**
   * Get current vertices
   * @returns {Array<{lat: number, lng: number}>} Current vertices
   */
  getVertices() {
    return [...this.vertices];
  }

  /**
   * Notify parent of polygon update
   */
  notifyUpdate() {
    this.onUpdate(this.getVertices());
  }

  /**
   * Clear all vertex markers
   */
  clearMarkers() {
    this.markers.forEach((marker) => {
      marker.setMap(null);
    });
    this.markers = [];
  }

  /**
   * Remove map-level event listeners
   */
  removeMapListeners() {
    this.mapListeners.forEach((listener) => {
      window.google.maps.event.removeListener(listener);
    });
    this.mapListeners = [];
  }

  /**
   * Fit map bounds to polygon
   * @param {number} padding - Padding in pixels
   */
  fitBounds(padding = 50) {
    if (this.vertices.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    this.vertices.forEach((vertex) => {
      bounds.extend(vertex);
    });

    this.map.fitBounds(bounds, padding);
  }

  /**
   * Clean up and remove all map objects
   */
  destroy() {
    this.clearMarkers();
    this.removeMapListeners();

    if (this.polygon) {
      this.polygon.setMap(null);
      this.polygon = null;
    }

    if (this.polyline) {
      this.polyline.setMap(null);
      this.polyline = null;
    }
  }
}

/**
 * Create a new PolygonEditor instance
 * @param {PolygonEditorConfig} config - Editor configuration
 * @returns {PolygonEditor} Editor instance
 */
export function createPolygonEditor(config) {
  return new PolygonEditor(config);
}

export default PolygonEditor;
