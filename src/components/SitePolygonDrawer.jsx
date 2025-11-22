import { useEffect, useRef, useCallback } from 'react';
import { calculateEdgeLengths } from '../utils/geometry.js';

/**
 * Site polygon drawing component for Google Maps
 * Allows user to draw a polygon representing the building site
 * Now includes edge length labels for each side
 *
 * NOTE: Google Maps Drawing library is deprecated (will be removed May 2026)
 * Future migration to Terra Draw is planned (see TERRA_DRAW_MIGRATION_PLAN.md)
 */
const SitePolygonDrawer = ({ map, onPolygonComplete, existingPolygon }) => {
  const drawingManagerRef = useRef(null);
  const polygonRef = useRef(null);
  const edgeLabelsRef = useRef([]);
  const onPolygonCompleteRef = useRef(onPolygonComplete);

  // Keep callback ref updated without triggering re-initialization
  useEffect(() => {
    onPolygonCompleteRef.current = onPolygonComplete;
  }, [onPolygonComplete]);

  // Create or update edge length labels
  const updateEdgeLabels = useCallback((polygon) => {
    if (!map || !polygon || polygon.length < 2) return;

    // Clear existing labels
    edgeLabelsRef.current.forEach(label => {
      if (label && label.setMap) {
        label.setMap(null);
      }
    });
    edgeLabelsRef.current = [];

    // Calculate edge lengths
    const edges = calculateEdgeLengths(polygon);

    // Create labels for each edge
    edges.forEach((edge) => {
      const lengthText = edge.length >= 1
        ? `${edge.length.toFixed(1)}m`
        : `${(edge.length * 100).toFixed(0)}cm`;

      // Create custom marker as label
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = `
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(4px);
        border: 2px solid #1976D2;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 12px;
        font-weight: 600;
        color: #1976D2;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        white-space: nowrap;
        pointer-events: none;
      `;
      labelDiv.textContent = lengthText;

      // Use InfoWindow for better positioning
      const infoWindow = new window.google.maps.InfoWindow({
        content: labelDiv,
        position: edge.midpoint,
        disableAutoPan: true
      });

      // Open the info window
      infoWindow.open(map);

      // Store reference
      edgeLabelsRef.current.push(infoWindow);
    });

    console.log(`📏 Created ${edges.length} edge labels`);
  }, [map]);

  // Stable callback that uses the ref
  const handlePolygonUpdate = useCallback((coordinates) => {
    if (onPolygonCompleteRef.current) {
      onPolygonCompleteRef.current(coordinates);
    }
    // Update edge labels when polygon changes
    updateEdgeLabels(coordinates);
  }, [updateEdgeLabels]);

  useEffect(() => {
    // Enhanced null checks to prevent '__gm' error
    if (!map || !window.google || !window.google.maps || !window.google.maps.drawing) {
      console.warn('🗺️  Google Maps Drawing library not ready');
      return;
    }

    // Verify map is fully initialized
    if (!map.getDiv || !map.getDiv()) {
      console.warn('🗺️  Map not fully initialized');
      return;
    }

    // Initialize drawing manager
    const drawingManager = new window.google.maps.drawing.DrawingManager({
      drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: window.google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [window.google.maps.drawing.OverlayType.POLYGON]
      },
      polygonOptions: {
        fillColor: '#2196F3',
        fillOpacity: 0.3,
        strokeWeight: 3,
        strokeColor: '#1976D2',
        clickable: true,
        editable: true,
        draggable: false, // Don't allow dragging entire polygon
        zIndex: 1
      }
    });

    drawingManager.setMap(map);
    drawingManagerRef.current = drawingManager;

    // Listen for polygon completion
    window.google.maps.event.addListener(drawingManager, 'overlaycomplete', (event) => {
      if (event.type === window.google.maps.drawing.OverlayType.POLYGON) {
        // Remove old polygon if exists
        if (polygonRef.current) {
          polygonRef.current.setMap(null);
        }

        const polygon = event.overlay;
        polygonRef.current = polygon;

        // Extract coordinates
        const path = polygon.getPath();
        const coordinates = [];
        for (let i = 0; i < path.getLength(); i++) {
          const point = path.getAt(i);
          coordinates.push({
            lat: point.lat(),
            lng: point.lng()
          });
        }

        // Callback with coordinates
        handlePolygonUpdate(coordinates);

        // Listen for edits
        window.google.maps.event.addListener(path, 'set_at', () => {
          const updatedCoords = [];
          for (let i = 0; i < path.getLength(); i++) {
            const point = path.getAt(i);
            updatedCoords.push({ lat: point.lat(), lng: point.lng() });
          }
          handlePolygonUpdate(updatedCoords);
        });

        window.google.maps.event.addListener(path, 'insert_at', () => {
          const updatedCoords = [];
          for (let i = 0; i < path.getLength(); i++) {
            const point = path.getAt(i);
            updatedCoords.push({ lat: point.lat(), lng: point.lng() });
          }
          handlePolygonUpdate(updatedCoords);
        });

        // Stop drawing mode after completing polygon
        drawingManager.setDrawingMode(null);
      }
    });

    // Draw existing polygon if provided (auto-detected boundary)
    if (existingPolygon && existingPolygon.length > 0) {
      const polygon = new window.google.maps.Polygon({
        paths: existingPolygon,
        fillColor: '#2196F3',
        fillOpacity: 0.3,
        strokeWeight: 3,
        strokeColor: '#1976D2',
        editable: true,
        draggable: false
      });
      polygon.setMap(map);
      polygonRef.current = polygon;

      console.log('🗺️  Auto-detected site boundary loaded (editable - drag vertices to adjust)');

      // Listen for edits on existing polygon
      const path = polygon.getPath();
      window.google.maps.event.addListener(path, 'set_at', () => {
        const updatedCoords = [];
        for (let i = 0; i < path.getLength(); i++) {
          const point = path.getAt(i);
          updatedCoords.push({ lat: point.lat(), lng: point.lng() });
        }
        handlePolygonUpdate(updatedCoords);
      });

      window.google.maps.event.addListener(path, 'insert_at', () => {
        const updatedCoords = [];
        for (let i = 0; i < path.getLength(); i++) {
          const point = path.getAt(i);
          updatedCoords.push({ lat: point.lat(), lng: point.lng() });
        }
        handlePolygonUpdate(updatedCoords);
      });

      // Create initial edge labels for existing polygon
      updateEdgeLabels(existingPolygon);
    }

    // Cleanup
    return () => {
      if (drawingManagerRef.current) {
        try {
          drawingManagerRef.current.setMap(null);
        } catch (error) {
          console.warn('Error cleaning up drawing manager:', error);
        }
      }
      if (polygonRef.current) {
        try {
          polygonRef.current.setMap(null);
        } catch (error) {
          console.warn('Error cleaning up polygon:', error);
        }
      }
      // Clean up edge labels
      edgeLabelsRef.current.forEach(label => {
        if (label && label.setMap) {
          try {
            label.setMap(null);
          } catch (error) {
            console.warn('Error cleaning up edge label:', error);
          }
        }
      });
      edgeLabelsRef.current = [];
    };
  }, [map, existingPolygon, handlePolygonUpdate, updateEdgeLabels]); // Only re-initialize when map or existingPolygon changes

  return null; // This component doesn't render anything itself
};

export default SitePolygonDrawer;

