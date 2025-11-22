/**
 * polygonEditor.js
 * 
 * Polygon editing utilities and event handlers for Google Maps
 * Manages vertex dragging, adding, and removing
 * 
 * @module polygonEditor
 */

import { findNearestPointOnPolygon } from './mapUtils.js';

/**
 * Polygon Editor class for managing interactive polygon editing
 */
export class PolygonEditor {
  constructor(map, google, polygon, options = {}) {
    this.map = map;
    this.google = google;
    this.polygon = polygon;
    this.options = {
      onVertexDrag: null,
      onVertexAdd: null,
      onVertexRemove: null,
      onPolygonUpdate: null,
      enableMidpoints: true,
      enableShiftClickAdd: true,
      enableRightClickRemove: true,
      minVertices: 3,
      ...options
    };

    this.vertexMarkers = [];
    this.midpointMarkers = [];
    this.polygonOverlay = null;
    this.isEditing = false;
    this.listeners = [];
    this.draggedVertexIndex = null;
    this.hoveredVertexIndex = null;
    this.hoveredMidpointIndex = null;
  }

  /**
   * Enable editing mode
   */
  enable() {
    if (this.isEditing) return;
    
    this.isEditing = true;
    this.createPolygonOverlay();
    this.createVertexMarkers();
    
    if (this.options.enableMidpoints) {
      this.createMidpointMarkers();
    }
    
    this.attachMapListeners();
  }

  /**
   * Disable editing mode
   */
  disable() {
    if (!this.isEditing) return;
    
    this.isEditing = false;
    this.clearMarkers();
    this.removePolygonOverlay();
    this.detachMapListeners();
  }

  /**
   * Update polygon coordinates
   */
  updatePolygon(newPolygon) {
    this.polygon = newPolygon;
    
    if (this.isEditing) {
      this.refresh();
    }
  }

  /**
   * Refresh editor (recreate markers and overlay)
   */
  refresh() {
    this.clearMarkers();
    this.removePolygonOverlay();
    
    if (this.isEditing) {
      this.createPolygonOverlay();
      this.createVertexMarkers();
      
      if (this.options.enableMidpoints) {
        this.createMidpointMarkers();
      }
    }
  }

  /**
   * Create polygon overlay
   */
  createPolygonOverlay() {
    if (this.polygonOverlay) {
      this.polygonOverlay.setMap(null);
    }

    this.polygonOverlay = new this.google.maps.Polygon({
      paths: this.polygon,
      strokeColor: '#10B981',
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: '#10B981',
      fillOpacity: 0.2,
      clickable: true,
      draggable: false,
      editable: false,
      geodesic: true,
      map: this.map
    });
  }

  /**
   * Remove polygon overlay
   */
  removePolygonOverlay() {
    if (this.polygonOverlay) {
      this.polygonOverlay.setMap(null);
      this.polygonOverlay = null;
    }
  }

  /**
   * Create vertex markers
   */
  createVertexMarkers() {
    this.vertexMarkers = this.polygon.map((point, index) => {
      const marker = new this.google.maps.Marker({
        position: point,
        map: this.map,
        icon: this.createVertexIcon(index),
        draggable: true,
        cursor: 'move',
        zIndex: 1000 + index
      });

      // Drag start
      const dragStartListener = marker.addListener('dragstart', () => {
        this.draggedVertexIndex = index;
        marker.setIcon(this.createVertexIcon(index, false, true));
      });

      // Drag
      const dragListener = marker.addListener('drag', () => {
        const position = marker.getPosition();
        const newPoint = {
          lat: position.lat(),
          lng: position.lng()
        };

        const newPolygon = [...this.polygon];
        newPolygon[index] = newPoint;

        this.polygon = newPolygon;
        this.polygonOverlay.setPath(newPolygon);

        if (this.options.onVertexDrag) {
          this.options.onVertexDrag(index, newPoint, newPolygon);
        }
      });

      // Drag end
      const dragEndListener = marker.addListener('dragend', () => {
        const position = marker.getPosition();
        const newPoint = {
          lat: position.lat(),
          lng: position.lng()
        };

        const newPolygon = [...this.polygon];
        newPolygon[index] = newPoint;

        this.polygon = newPolygon;
        this.draggedVertexIndex = null;
        marker.setIcon(this.createVertexIcon(index));

        if (this.options.onPolygonUpdate) {
          this.options.onPolygonUpdate(newPolygon);
        }

        // Refresh midpoints
        if (this.options.enableMidpoints) {
          this.clearMidpointMarkers();
          this.createMidpointMarkers();
        }
      });

      // Mouse over
      const mouseoverListener = marker.addListener('mouseover', () => {
        if (this.draggedVertexIndex === null) {
          this.hoveredVertexIndex = index;
          marker.setIcon(this.createVertexIcon(index, true));
        }
      });

      // Mouse out
      const mouseoutListener = marker.addListener('mouseout', () => {
        if (this.draggedVertexIndex === null) {
          this.hoveredVertexIndex = null;
          marker.setIcon(this.createVertexIcon(index));
        }
      });

      // Right click to remove
      if (this.options.enableRightClickRemove) {
        const rightclickListener = marker.addListener('rightclick', (e) => {
          e.stop();
          this.removeVertex(index);
        });
        
        this.listeners.push(rightclickListener);
      }

      this.listeners.push(dragStartListener, dragListener, dragEndListener, mouseoverListener, mouseoutListener);

      return marker;
    });
  }

  /**
   * Create midpoint markers
   */
  createMidpointMarkers() {
    this.midpointMarkers = this.polygon.map((point, index) => {
      const nextPoint = this.polygon[(index + 1) % this.polygon.length];
      
      const midpoint = {
        lat: (point.lat + nextPoint.lat) / 2,
        lng: (point.lng + nextPoint.lng) / 2
      };

      const marker = new this.google.maps.Marker({
        position: midpoint,
        map: this.map,
        icon: this.createMidpointIcon(),
        cursor: 'pointer',
        zIndex: 500
      });

      // Click to add vertex
      const clickListener = marker.addListener('click', () => {
        this.addVertex(midpoint, index + 1);
      });

      // Mouse over
      const mouseoverListener = marker.addListener('mouseover', () => {
        this.hoveredMidpointIndex = index;
        marker.setIcon(this.createMidpointIcon(true));
      });

      // Mouse out
      const mouseoutListener = marker.addListener('mouseout', () => {
        this.hoveredMidpointIndex = null;
        marker.setIcon(this.createMidpointIcon());
      });

      this.listeners.push(clickListener, mouseoverListener, mouseoutListener);

      return marker;
    });
  }

  /**
   * Clear all markers
   */
  clearMarkers() {
    this.clearVertexMarkers();
    this.clearMidpointMarkers();
  }

  /**
   * Clear vertex markers
   */
  clearVertexMarkers() {
    this.vertexMarkers.forEach(marker => marker.setMap(null));
    this.vertexMarkers = [];
  }

  /**
   * Clear midpoint markers
   */
  clearMidpointMarkers() {
    this.midpointMarkers.forEach(marker => marker.setMap(null));
    this.midpointMarkers = [];
  }

  /**
   * Attach map event listeners
   */
  attachMapListeners() {
    // Shift + Click to add vertex
    if (this.options.enableShiftClickAdd) {
      const clickListener = this.map.addListener('click', (e) => {
        if (e.domEvent.shiftKey) {
          const point = {
            lat: e.latLng.lat(),
            lng: e.latLng.lng()
          };

          // Find nearest segment
          const { segmentIndex } = findNearestPointOnPolygon(point, this.polygon);
          this.addVertex(point, segmentIndex + 1);
        }
      });

      this.listeners.push(clickListener);
    }
  }

  /**
   * Detach all event listeners
   */
  detachMapListeners() {
    this.listeners.forEach(listener => {
      this.google.maps.event.removeListener(listener);
    });
    this.listeners = [];
  }

  /**
   * Add vertex to polygon
   */
  addVertex(point, insertIndex) {
    const newPolygon = [...this.polygon];
    newPolygon.splice(insertIndex, 0, point);

    this.polygon = newPolygon;

    if (this.options.onVertexAdd) {
      this.options.onVertexAdd(insertIndex, point, newPolygon);
    }

    if (this.options.onPolygonUpdate) {
      this.options.onPolygonUpdate(newPolygon);
    }

    this.refresh();
  }

  /**
   * Remove vertex from polygon
   */
  removeVertex(index) {
    if (this.polygon.length <= this.options.minVertices) {
      console.warn(`Cannot remove vertex: polygon must have at least ${this.options.minVertices} vertices`);
      return;
    }

    const newPolygon = this.polygon.filter((_, i) => i !== index);

    this.polygon = newPolygon;

    if (this.options.onVertexRemove) {
      this.options.onVertexRemove(index, newPolygon);
    }

    if (this.options.onPolygonUpdate) {
      this.options.onPolygonUpdate(newPolygon);
    }

    this.refresh();
  }

  /**
   * Create vertex icon
   */
  createVertexIcon(index, isHovered = false, isDragging = false) {
    let scale = 1;
    let fillColor = '#3B82F6';
    let strokeColor = '#FFFFFF';

    if (isDragging) {
      scale = 1.5;
      fillColor = '#EF4444';
    } else if (isHovered) {
      scale = 1.3;
      fillColor = '#10B981';
    }

    return {
      path: this.google.maps.SymbolPath.CIRCLE,
      scale: 8 * scale,
      fillColor,
      fillOpacity: 1,
      strokeColor,
      strokeWeight: 2,
      anchor: new this.google.maps.Point(0, 0)
    };
  }

  /**
   * Create midpoint icon
   */
  createMidpointIcon(isHovered = false) {
    return {
      path: this.google.maps.SymbolPath.CIRCLE,
      scale: isHovered ? 6 : 5,
      fillColor: isHovered ? '#10B981' : '#94A3B8',
      fillOpacity: isHovered ? 1 : 0.7,
      strokeColor: '#FFFFFF',
      strokeWeight: 1,
      anchor: new this.google.maps.Point(0, 0)
    };
  }

  /**
   * Destroy editor and cleanup
   */
  destroy() {
    this.disable();
    this.clearMarkers();
    this.removePolygonOverlay();
    this.detachMapListeners();
  }
}

/**
 * Create polygon editor instance
 * @param {google.maps.Map} map - Google Maps instance
 * @param {Object} google - Google Maps API object
 * @param {Array<{lat: number, lng: number}>} polygon - Polygon coordinates
 * @param {Object} options - Editor options
 * @returns {PolygonEditor} Editor instance
 */
export function createPolygonEditor(map, google, polygon, options) {
  return new PolygonEditor(map, google, polygon, options);
}

export default PolygonEditor;

