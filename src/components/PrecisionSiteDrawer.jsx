import React, { useEffect, useRef, useState, useCallback } from 'react';
import { calculateDistance } from '../utils/geometry.js';
import SiteGeometryPanel from './SiteGeometryPanel.jsx';
import logger from '../utils/logger.js';


/**
 * Hybrid Site Boundary Drawing Component
 *
 * Features:
 * - Click with mouse to place vertices freely (free drawing)
 * - Type numbers + Enter to place vertex at exact distance (e.g., "10" then Enter for 10 meters)
 * - Hold Shift to snap to 90-degree angles (orthogonal mode)
 * - Press ESC once to undo last vertex
 * - Press ESC twice (double tap) to clear all and start over
 * - Visual dimension preview
 * - Right-click to finish (3+ vertices) and make editable
 * - Site Geometry panel shows edge lengths and angles with editing capability
 */
const PrecisionSiteDrawer = ({ map, onPolygonComplete, initialPolygon, enabled }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertices, setVertices] = useState(initialPolygon || []);
  const [currentVertex, setCurrentVertex] = useState(null);
  const [dimensionInput, setDimensionInput] = useState('');
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [lastEscapeTime, setLastEscapeTime] = useState(0);

  const polygonRef = useRef(null);
  const previewLineRef = useRef(null);
  const markersRef = useRef([]);
  const cornerMarkersRef = useRef([]); // Draggable corner markers when polygon is complete
  const dimensionLabelRef = useRef(null);
  const initialPolygonLoadedRef = useRef(false);

  // Calculate bearing between two points
  const calculateBearing = useCallback((from, to) => {
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;

    return bearing;
  }, []);

  // Calculate angle between two lines (for corner angles)
  const calculateAngleBetweenLines = useCallback((bearing1, bearing2) => {
    let angle = Math.abs(bearing2 - bearing1);
    if (angle > 180) {
      angle = 360 - angle;
    }
    return angle;
  }, []);

  // Calculate polygon area using Shoelace formula (works for incomplete polygons)
  const calculatePolygonArea = useCallback((vertices, includeCurrent = false) => {
    const points = [...vertices];
    if (includeCurrent && currentVertex && vertices.length > 0) {
      points.push(currentVertex);
    }

    if (points.length < 3) return 0;

    // Close the polygon for area calculation
    const closedPoints = [...points, points[0]];

    let area = 0;
    for (let i = 0; i < closedPoints.length - 1; i++) {
      const p1 = closedPoints[i];
      const p2 = closedPoints[i + 1];

      // Convert to meters using a simple projection
      const lat = (p1.lat + p2.lat) / 2;
      const R = 6371000; // Earth radius in meters
      const mPerDegLat = R * Math.PI / 180;
      const mPerDegLng = R * Math.PI / 180 * Math.cos(lat * Math.PI / 180);

      const x1 = p1.lng * mPerDegLng;
      const y1 = p1.lat * mPerDegLat;
      const x2 = p2.lng * mPerDegLng;
      const y2 = p2.lat * mPerDegLat;

      area += (x1 * y2 - x2 * y1);
    }

    return Math.abs(area / 2);
  }, [currentVertex]);

  // Calculate total perimeter
  const calculatePerimeter = useCallback((vertices, includeCurrent = false) => {
    if (vertices.length === 0) return 0;

    let perimeter = 0;
    for (let i = 1; i < vertices.length; i++) {
      perimeter += calculateDistance(
        vertices[i - 1].lat, vertices[i - 1].lng,
        vertices[i].lat, vertices[i].lng
      );
    }

    // Add current preview line if drawing
    if (includeCurrent && currentVertex && vertices.length > 0) {
      const lastVertex = vertices[vertices.length - 1];
      perimeter += calculateDistance(
        lastVertex.lat, lastVertex.lng,
        currentVertex.lat, currentVertex.lng
      );
    }

    return perimeter;
  }, [currentVertex]);

  // Snap bearing to nearest 90-degree angle
  const snapToOrthogonal = useCallback((bearing) => {
    const angles = [0, 90, 180, 270];
    let closest = angles[0];
    let minDiff = Math.abs(bearing - angles[0]);

    angles.forEach(angle => {
      const diff = Math.abs(bearing - angle);
      if (diff < minDiff) {
        minDiff = diff;
        closest = angle;
      }
    });

    return closest;
  }, []);

  // Calculate destination point given start, distance, and bearing
  const calculateDestination = useCallback((start, distance, bearing) => {
    const R = 6371000; // Earth radius in meters
    const δ = distance / R;
    const θ = bearing * Math.PI / 180;
    const φ1 = start.lat * Math.PI / 180;
    const λ1 = start.lng * Math.PI / 180;

    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(δ) +
      Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
    );

    const λ2 = λ1 + Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

    return {
      lat: φ2 * 180 / Math.PI,
      lng: λ2 * 180 / Math.PI
    };
  }, []);

  // Cancel drawing
  const cancelDrawing = useCallback(() => {
    logger.info('🗑️ Clearing all drawing');
    setIsDrawing(false);
    setVertices([]);
    setCurrentVertex(null);
    setDimensionInput('');

    // Also clear the completed polygon if it exists
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    // Clear corner markers and their listeners
    cornerMarkersRef.current.forEach(marker => {
      if (marker) {
        try {
          window.google.maps.event.clearInstanceListeners(marker);
          marker.setMap(null);
        } catch (e) {
          // Ignore errors
        }
      }
    });
    cornerMarkersRef.current = [];

    // Reset the initial polygon loaded flag so it can be reloaded
    initialPolygonLoadedRef.current = false;

    // Notify parent that polygon was cleared
    if (onPolygonComplete) {
      onPolygonComplete([]);
    }
  }, [onPolygonComplete]);

  // Undo last vertex
  const undoLastVertex = useCallback(() => {
    setVertices(prev => {
      const newVertices = prev.slice(0, -1);
      logger.info(`↶ Undo: ${prev.length} → ${newVertices.length} vertices`);
      if (newVertices.length === 0) {
        setIsDrawing(false);
      }
      return newVertices;
    });
  }, []);

  // Create draggable corner markers for finished polygon
  const createCornerMarkers = useCallback((polygon) => {
    logger.info('🔧 Creating draggable corner markers...');
    logger.info('   Map instance:', map ? '✓ Available' : '✗ Missing');
    logger.info('   Polygon instance:', polygon ? '✓ Available' : '✗ Missing');

    if (!map || !polygon) {
      logger.error('❌ Cannot create corner markers - missing map or polygon');
      return;
    }

    // Clear existing corner markers
    cornerMarkersRef.current.forEach(marker => {
      try {
        window.google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      } catch (e) {
        logger.warn('Error clearing marker:', e);
      }
    });
    cornerMarkersRef.current = [];
    logger.info('   Cleared existing markers');

    const path = polygon.getPath();
    const currentVertices = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      currentVertices.push({ lat: point.lat(), lng: point.lng() });
    }

    // Create a draggable marker for each corner
    currentVertices.forEach((vertex, index) => {
      const marker = new window.google.maps.Marker({
        position: vertex,
        map: map,
        draggable: true,
        label: {
          text: (index + 1).toString(),
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold'
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 18,  // Increased from 12 to 18 for easier dragging
          fillColor: '#1976D2',
          fillOpacity: 0.9,
          strokeColor: '#FFFFFF',
          strokeWeight: 4  // Increased from 3 to 4 for better visibility
        },
        title: `Drag to move corner ${index + 1}`,
        zIndex: 2000,
        optimized: false,  // Better dragging performance
        cursor: 'move'  // Show move cursor on hover
      });

      // Capture index in a separate variable to avoid closure issues
      const markerIndex = index;

      // Add hover effect - enlarge marker on mouseover
      marker.addListener('mouseover', function() {
        marker.setIcon({
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 22,  // Enlarge on hover
          fillColor: '#2196F3',  // Lighter blue on hover
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 5
        });
      });

      // Reset marker size on mouseout
      marker.addListener('mouseout', function() {
        marker.setIcon({
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 18,  // Return to normal size
          fillColor: '#1976D2',
          fillOpacity: 0.9,
          strokeColor: '#FFFFFF',
          strokeWeight: 4
        });
      });

      // Update polygon while dragging
      marker.addListener('drag', function(event) {
        try {
          const newPos = event.latLng;
          path.setAt(markerIndex, newPos);
        } catch (e) {
          logger.error('Drag error:', e);
        }
      });

      // Save final position when drag ends
      marker.addListener('dragend', function(event) {
        try {
          const newPos = event.latLng;
          path.setAt(markerIndex, newPos);

          // Update vertices array
          const updatedCoords = [];
          for (let i = 0; i < path.getLength(); i++) {
            const point = path.getAt(i);
            updatedCoords.push({ lat: point.lat(), lng: point.lng() });
          }

          setVertices(updatedCoords);
          if (onPolygonComplete) {
            onPolygonComplete(updatedCoords);
          }
          logger.info(`🎯 Corner ${markerIndex + 1} moved to (${newPos.lat().toFixed(6)}, ${newPos.lng().toFixed(6)})`);

          // Return to normal size after drag
          marker.setIcon({
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: '#1976D2',
            fillOpacity: 0.9,
            strokeColor: '#FFFFFF',
            strokeWeight: 4
          });
        } catch (e) {
          logger.error('Dragend error:', e);
        }
      });

      cornerMarkersRef.current.push(marker);
    });

    logger.success(` Successfully created ${currentVertices.length} draggable corner markers`);
    logger.info(`   Markers are now visible on the map with numbers 1-${currentVertices.length}`);
    logger.info(`   Hover over circles to see them enlarge, then drag to adjust corners`);
  }, [map, onPolygonComplete, setVertices]);

  // Finish drawing and make polygon editable with draggable corner markers
  const finishDrawing = useCallback(() => {
    if (vertices.length >= 3) {
      setIsDrawing(false);

      // Clear existing polygon
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }

      // Create polygon with visible area (not using built-in edit handles)
      const editablePolygon = new window.google.maps.Polygon({
        paths: vertices,
        strokeColor: '#1976D2',
        strokeOpacity: 1,  // Increased from 0.9 to 1 for better visibility
        strokeWeight: 4,  // Increased from 3 to 4 for thicker, more visible boundaries
        fillColor: '#2196F3',
        fillOpacity: 0.3,  // Increased from 0.25 to 0.3 for better contrast
        editable: false,  // Disable built-in handles, use custom markers instead
        draggable: false,
        map: map,
        clickable: false,  // Prevent polygon clicks to avoid interference
        geodesic: true
      });

      polygonRef.current = editablePolygon;

      // Create custom draggable corner markers
      createCornerMarkers(editablePolygon);

      if (onPolygonComplete) {
        onPolygonComplete(vertices);
      }

      logger.success(' Polygon completed - drag the numbered circles to adjust corners');
    }
  }, [vertices, onPolygonComplete, map, createCornerMarkers]);

  // Apply dimension and place vertex
  // Handle vertices change from Site Geometry panel
  const handleGeometryPanelChange = useCallback((newVertices) => {
    logger.info('📐 Geometry panel updated vertices:', newVertices.length);
    setVertices(newVertices);

    // Update the polygon on the map
    if (polygonRef.current) {
      polygonRef.current.setPath(newVertices);
    }

    // Notify parent
    if (onPolygonComplete) {
      onPolygonComplete(newVertices);
    }
  }, [onPolygonComplete]);

  const applyDimensionAndPlace = useCallback(() => {
    if (!currentVertex || !dimensionInput || vertices.length === 0) {
      logger.warn('⚠️ Cannot apply dimension:', {
        hasCurrentVertex: !!currentVertex,
        hasDimensionInput: !!dimensionInput,
        verticesCount: vertices.length
      });
      return;
    }

    const targetLength = parseFloat(dimensionInput);
    if (isNaN(targetLength) || targetLength <= 0) {
      logger.warn('⚠️ Invalid dimension input:', dimensionInput);
      return;
    }

    const lastVertex = vertices[vertices.length - 1];

    // Calculate direction from last vertex to current mouse position
    const bearing = calculateBearing(lastVertex, currentVertex);

    // Snap to 90 degrees if Shift is pressed
    const finalBearing = isShiftPressed ? snapToOrthogonal(bearing) : bearing;

    logger.info('📐 Applying dimension:', {
      length: targetLength + 'm',
      bearing: bearing.toFixed(1) + '°',
      finalBearing: finalBearing.toFixed(1) + '°',
      orthogonal: isShiftPressed
    });

    // Calculate new vertex at exact distance
    const newVertex = calculateDestination(lastVertex, targetLength, finalBearing);

    setVertices(prev => [...prev, newVertex]);
    setDimensionInput('');
    logger.info('✅ Vertex placed at exact distance:', targetLength + 'm');

  }, [currentVertex, dimensionInput, vertices, isShiftPressed, calculateBearing, snapToOrthogonal, calculateDestination]);

  // Handle keyboard input - works immediately when precision mode enabled
  useEffect(() => {
    if (!enabled || !map) return;

    const handleKeyDown = (e) => {
      // Shift key for orthogonal mode - works anytime precision mode is on
      if (e.key === 'Shift') {
        e.preventDefault();
        setIsShiftPressed(true);
        logger.info('🔧 Shift pressed - orthogonal mode ON');
      }

      // Only handle other keys when drawing has started
      if (!isDrawing) return;

      // Number input for dimension (also support decimal point)
      if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
        e.preventDefault();
        setDimensionInput(prev => {
          const newValue = prev + e.key;
          logger.info('📏 Dimension input:', newValue);
          return newValue;
        });
      }

      // Backspace to delete last digit
      if (e.key === 'Backspace') {
        e.preventDefault();
        setDimensionInput(prev => {
          const newValue = prev.slice(0, -1);
          logger.info('⌫ Backspace - dimension:', newValue || '(empty)');
          return newValue;
        });
      }

      // Enter to apply dimension
      if (e.key === 'Enter' && dimensionInput && currentVertex) {
        e.preventDefault();
        logger.info('✅ Enter pressed - applying dimension:', dimensionInput);
        applyDimensionAndPlace();
      }

      // Escape to undo last vertex or clear all (double ESC)
      if (e.key === 'Escape') {
        e.preventDefault();
        const now = Date.now();
        const timeSinceLastEscape = now - lastEscapeTime;

        if (timeSinceLastEscape < 500 && lastEscapeTime > 0) {
          // Double ESC (within 500ms) - clear all drawing
          logger.info('⚡ Double ESC - clearing all drawing');
          cancelDrawing();
          setLastEscapeTime(0);
        } else {
          // Single ESC - undo last vertex
          if (vertices.length > 0) {
            logger.info('↶ ESC - undoing last vertex');
            undoLastVertex();
            setDimensionInput(''); // Also clear dimension input
          }
          setLastEscapeTime(now);
        }
      }

      // Delete/Backspace to undo last vertex (only if no dimension input)
      if ((e.key === 'Delete' || (e.key === 'Backspace' && !dimensionInput)) && vertices.length > 0) {
        e.preventDefault();
        undoLastVertex();
      }
    };

    const handleKeyUp = (e) => {
      // Shift release works anytime precision mode is on
      if (e.key === 'Shift') {
        e.preventDefault();
        setIsShiftPressed(false);
        logger.info('🔧 Shift released - orthogonal mode OFF');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, map, dimensionInput, currentVertex, vertices, isDrawing, applyDimensionAndPlace, cancelDrawing, undoLastVertex, lastEscapeTime]);

  // Handle map click to place vertex
  useEffect(() => {
    if (!enabled || !map) return;

    const clickListener = window.google.maps.event.addListener(map, 'click', (e) => {
      const newVertex = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      };

      if (!isDrawing) {
        // Start drawing
        logger.info('🖱️ Starting drawing with mouse click');
        setIsDrawing(true);
        setVertices([newVertex]);
      } else {
        // Always place vertex at click location (free drawing)
        // User can optionally type dimension + Enter for precision
        logger.info('🖱️ Placing vertex at click position');
        setVertices(prev => [...prev, newVertex]);
        setDimensionInput(''); // Clear dimension input after placing vertex
      }
    });

    // Throttle mouse move updates to reduce lag (only update every 100ms)
    let lastUpdate = 0;
    const mouseMoveListener = window.google.maps.event.addListener(map, 'mousemove', (e) => {
      if (isDrawing) {
        const now = Date.now();
        if (now - lastUpdate < 100) return; // Throttle to 10 updates per second
        lastUpdate = now;

        let mousePos = {
          lat: e.latLng.lat(),
          lng: e.latLng.lng()
        };

        // Snap to orthogonal if Shift is pressed
        if (isShiftPressed && vertices.length > 0) {
          const lastVertex = vertices[vertices.length - 1];
          const bearing = calculateBearing(lastVertex, mousePos);
          const snappedBearing = snapToOrthogonal(bearing);
          const distance = calculateDistance(
            lastVertex.lat, lastVertex.lng,
            mousePos.lat, mousePos.lng
          );
          mousePos = calculateDestination(lastVertex, distance, snappedBearing);

          // Log snapping (throttled to avoid console spam)
          if (Math.random() < 0.01) { // Log ~1% of moves
            logger.info('🔧 Orthogonal snap:', bearing.toFixed(1) + '° → ' + snappedBearing.toFixed(1) + '°');
          }
        }

        setCurrentVertex(mousePos);
      }
    });

    const rightClickListener = window.google.maps.event.addListener(map, 'rightclick', (e) => {
      if (isDrawing && vertices.length >= 3) {
        // Close polygon
        finishDrawing();
      }
    });

    return () => {
      window.google.maps.event.removeListener(clickListener);
      window.google.maps.event.removeListener(mouseMoveListener);
      window.google.maps.event.removeListener(rightClickListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, map, isDrawing, vertices, dimensionInput, isShiftPressed]);

  // Render polygon and preview line (only during drawing)
  useEffect(() => {
    if (!map || !window.google) return;

    // Don't render if not drawing (finished polygon is managed separately)
    if (!isDrawing) {
      // Clear any temporary drawing elements
      if (previewLineRef.current) {
        previewLineRef.current.setMap(null);
      }
      if (dimensionLabelRef.current) {
        dimensionLabelRef.current.close();
      }
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      return;
    }

    // During drawing, temporarily remove the finished polygon
    const tempPolygon = polygonRef.current;
    if (tempPolygon && isDrawing) {
      tempPolygon.setMap(null);
    }

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Clear preview line
    if (previewLineRef.current) {
      previewLineRef.current.setMap(null);
    }

    // Draw polygon if vertices exist
    if (vertices.length > 0) {
      // Draw markers for each vertex during drawing
      vertices.forEach((vertex, idx) => {
        // Create custom HTML marker content
        const markerContent = document.createElement('div');
        markerContent.style.cssText = `
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: #1976D2;
          border: 2px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
          font-weight: bold;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          cursor: pointer;
        `;
        markerContent.textContent = (idx + 1).toString();

        // Use AdvancedMarkerElement if available, fallback to Marker
        let marker;
        if (window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement) {
          marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: vertex,
            map: map,
            content: markerContent
          });
        } else {
          // Fallback to standard Marker (deprecated but supported for 12+ months)
          // AdvancedMarkerElement requires mapId - see ArchitectAIEnhanced.js for migration notes
          marker = new window.google.maps.Marker({
            position: vertex,
            map: map,
            label: {
              text: (idx + 1).toString(),
              color: 'white',
              fontSize: '12px',
              fontWeight: 'bold'
            },
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: '#1976D2',
              fillOpacity: 0.9,
              strokeColor: 'white',
              strokeWeight: 2
            },
            draggable: false,
            clickable: true,
            optimized: true
          });
        }
        markersRef.current.push(marker);
      });

      // Draw temporary polygon during drawing (not editable yet)
      if (vertices.length >= 2 && isDrawing) {
        const drawingPolygon = new window.google.maps.Polygon({
          paths: vertices,
          strokeColor: '#1976D2',
          strokeOpacity: 0.8,  // Slightly more transparent during drawing
          strokeWeight: 3,  // Increased from 2 to 3 for better visibility
          fillColor: '#2196F3',
          fillOpacity: 0.2,  // Increased from 0.15 to 0.2 for better visibility
          map: map,
          editable: false,  // Not editable during drawing
          geodesic: true  // Smooth curves on map projection
        });
        // Store temporarily but will be replaced when finished
        if (!tempPolygon) {
          polygonRef.current = drawingPolygon;
        }
      }

      // Draw preview line from last vertex to cursor
      if (isDrawing && currentVertex && vertices.length > 0) {
        const lastVertex = vertices[vertices.length - 1];

        // Calculate current distance
        const distance = calculateDistance(
          lastVertex.lat, lastVertex.lng,
          currentVertex.lat, currentVertex.lng
        );

        // Update existing preview line instead of creating new one
        if (previewLineRef.current) {
          previewLineRef.current.setPath([lastVertex, currentVertex]);
          previewLineRef.current.setOptions({
            strokeColor: isShiftPressed ? '#4CAF50' : '#FFA726'
          });
        } else {
          previewLineRef.current = new window.google.maps.Polyline({
            path: [lastVertex, currentVertex],
            strokeColor: isShiftPressed ? '#4CAF50' : '#FFA726',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            map: map,
            geodesic: true,
            clickable: false
          });
        }

        // Calculate angle if there's a previous line
        let angleDisplay = '';
        if (vertices.length >= 2) {
          const prevVertex = vertices[vertices.length - 2];
          const bearing1 = calculateBearing(prevVertex, lastVertex);
          const bearing2 = calculateBearing(lastVertex, currentVertex);
          const angle = calculateAngleBetweenLines(bearing1, bearing2);
          angleDisplay = `∠${angle.toFixed(0)}°`;
        }

        // Update dimension label with comprehensive measurements
        const midpoint = {
          lat: (lastVertex.lat + currentVertex.lat) / 2,
          lng: (lastVertex.lng + currentVertex.lng) / 2
        };

        // Create a more detailed display with all measurements
        const lengthText = dimensionInput
          ? `${dimensionInput}m`
          : `${distance.toFixed(1)}m`;

        // Calculate real-time area and perimeter
        const currentArea = calculatePolygonArea(vertices, true);
        const currentPerimeter = calculatePerimeter(vertices, true);

        // Build the complete display HTML
        const createDisplayContent = () => {
          const div = document.createElement('div');
          div.style.cssText = `
            background: ${isShiftPressed ? 'rgba(76, 175, 80, 0.95)' : 'rgba(33, 150, 243, 0.95)'};
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            white-space: nowrap;
            line-height: 1.4;
          `;

          // Main measurements
          const mainLine = document.createElement('div');
          mainLine.style.cssText = `
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
          `;

          // Length display
          const lengthSpan = document.createElement('span');
          lengthSpan.textContent = `📏 ${lengthText}`;
          mainLine.appendChild(lengthSpan);

          // Angle display (if applicable)
          if (angleDisplay) {
            const angleSpan = document.createElement('span');
            angleSpan.style.cssText = `
              background: rgba(255,255,255,0.2);
              padding: 2px 6px;
              border-radius: 4px;
            `;
            angleSpan.textContent = angleDisplay;
            mainLine.appendChild(angleSpan);
          }

          // Orthogonal indicator
          if (isShiftPressed) {
            const orthoSpan = document.createElement('span');
            orthoSpan.style.cssText = `
              background: rgba(255,255,255,0.3);
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 12px;
            `;
            orthoSpan.textContent = '⊥ 90°';
            mainLine.appendChild(orthoSpan);
          }

          div.appendChild(mainLine);

          // Add summary stats if we have enough vertices
          if (vertices.length >= 2) {
            const statsLine = document.createElement('div');
            statsLine.style.cssText = `
              font-size: 11px;
              opacity: 0.9;
              margin-top: 2px;
              padding-top: 4px;
              border-top: 1px solid rgba(255,255,255,0.2);
            `;

            const perimText = `Perimeter: ${currentPerimeter.toFixed(1)}m`;
            const areaText = currentArea > 0 ? ` • Area: ${currentArea.toFixed(0)}m²` : '';
            statsLine.textContent = perimText + areaText;

            div.appendChild(statsLine);
          }

          return div;
        };

        // Update existing label or create new one
        if (dimensionLabelRef.current) {
          dimensionLabelRef.current.setPosition(midpoint);
          dimensionLabelRef.current.setContent(createDisplayContent());
        } else {
          dimensionLabelRef.current = new window.google.maps.InfoWindow({
            content: createDisplayContent(),
            position: midpoint,
            disableAutoPan: true
          });
          dimensionLabelRef.current.open(map);
        }
      }
    }

    return () => {
      // Only clean up temporary drawing elements, not the finished editable polygon
      if (previewLineRef.current) previewLineRef.current.setMap(null);
      if (dimensionLabelRef.current) dimensionLabelRef.current.close();
      if (isDrawing) {
        // Only clear markers during active drawing
        markersRef.current.forEach(marker => marker.setMap(null));
      }
    };
  }, [map, vertices, currentVertex, isDrawing, dimensionInput, isShiftPressed, calculateBearing, snapToOrthogonal, calculateDestination, calculateAngleBetweenLines, calculatePolygonArea, calculatePerimeter]);

  // Handle initial polygon (auto-detected or existing) - make it editable
  useEffect(() => {
    if (!map) {
      logger.loading(' Waiting for map to load...');
      return;
    }
    if (!window.google || !window.google.maps) {
      logger.loading(' Waiting for Google Maps API...');
      return;
    }
    if (!initialPolygon || initialPolygon.length === 0) {
      logger.info('ℹ️ No initial polygon provided');
      return;
    }
    if (initialPolygonLoadedRef.current) {
      logger.info('ℹ️ Initial polygon already loaded');
      return;
    }

    logger.info('📐 Loading initial polygon with', initialPolygon.length, 'vertices');
    logger.info('   First vertex:', initialPolygon[0]);

    // Set vertices from initial polygon
    setVertices(initialPolygon);

    // Clear any existing polygon
    if (polygonRef.current) {
      logger.info('   Clearing existing polygon');
      try {
        polygonRef.current.setMap(null);
      } catch (e) {
        logger.warn('   Error clearing polygon:', e);
      }
    }

    // Create polygon with draggable corner markers
    try {
      const editablePolygon = new window.google.maps.Polygon({
        paths: initialPolygon,
        strokeColor: '#1976D2',
        strokeOpacity: 1,  // Increased from 0.9 to 1 for better visibility
        strokeWeight: 4,  // Increased from 3 to 4 for thicker, more visible boundaries
        fillColor: '#2196F3',
        fillOpacity: 0.3,  // Increased from 0.25 to 0.3 for better contrast
        editable: false,  // Disable built-in handles, use custom markers
        draggable: false,
        map: map,
        clickable: false,  // Prevent polygon clicks
        geodesic: true
      });

      polygonRef.current = editablePolygon;
      logger.info('   ✅ Polygon created and displayed');

      // IMPORTANT: Create custom draggable corner markers after a small delay
      // to ensure map is fully ready
      setTimeout(() => {
        logger.info('   🔧 Creating corner markers for auto-detected polygon...');
        try {
          createCornerMarkers(editablePolygon);
          logger.info('   ✅ Corner markers created successfully');
        } catch (error) {
          logger.error('   ❌ Error creating corner markers:', error);
        }
      }, 100);

      initialPolygonLoadedRef.current = true;
      logger.success(' Initial polygon loaded - numbered circles will appear shortly');

    } catch (error) {
      logger.error('❌ Error creating editable polygon:', error);
    }

  }, [map, initialPolygon, onPolygonComplete, createCornerMarkers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up corner markers and their listeners
      cornerMarkersRef.current.forEach(marker => {
        if (marker) {
          try {
            window.google.maps.event.clearInstanceListeners(marker);
            marker.setMap(null);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
      cornerMarkersRef.current = [];
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      {/* Editing polygon indicator - ALWAYS SHOW when polygon exists (auto-detected or manual) */}
      {!isDrawing && vertices.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(76, 175, 80, 0.95)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '13px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '90%',
            textAlign: 'center'
          }}
        >
          ✓ Site Boundary Ready - Hover over numbered circles to drag corners
          <button
            onClick={() => {
              logger.info('🗑️ Clearing boundary for redraw...');
              setVertices([]);
              setIsDrawing(false);
              if (polygonRef.current) {
                polygonRef.current.setMap(null);
                polygonRef.current = null;
              }
              // Clear corner markers
              cornerMarkersRef.current.forEach(marker => {
                try {
                  window.google.maps.event.clearInstanceListeners(marker);
                  marker.setMap(null);
                } catch (e) {
                  logger.warn('Error clearing marker:', e);
                }
              });
              cornerMarkersRef.current = [];
              initialPolygonLoadedRef.current = false;
              logger.success(' Boundary cleared - click on map to redraw');
            }}
            style={{
              background: 'rgba(244, 67, 54, 0.9)',
              border: '2px solid white',
              color: 'white',
              cursor: 'pointer',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(211, 47, 47, 1)';
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(244, 67, 54, 0.9)';
              e.target.style.transform = 'scale(1)';
            }}
          >
            🗑️ Clear & Redraw
          </button>
        </div>
      )}

      {/* Real-time measurements panel - shows on the LEFT side during drawing to avoid overlap with Site Geometry on right */}
      {isDrawing && vertices.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '20px',
            transform: 'translateY(-50%)',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '16px',
            borderRadius: '12px',
            fontSize: '12px',
            zIndex: 1001,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            width: '200px',
            maxWidth: 'calc(50% - 40px)',
            color: '#FFFFFF'
          }}
        >
          <div style={{
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '12px',
            color: '#FFFFFF',
            borderBottom: '2px solid rgba(255, 255, 255, 0.3)',
            paddingBottom: '8px'
          }}>
            📐 Real-Time Measurements
          </div>

          {/* Current edge being drawn */}
          {currentVertex && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '11px', marginBottom: '2px' }}>Current Edge:</div>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFFFFF' }}>
                {calculateDistance(
                  vertices[vertices.length - 1].lat, vertices[vertices.length - 1].lng,
                  currentVertex.lat, currentVertex.lng
                ).toFixed(1)}m
                {vertices.length >= 2 && (() => {
                  const prevVertex = vertices[vertices.length - 2];
                  const lastVertex = vertices[vertices.length - 1];
                  const bearing1 = calculateBearing(prevVertex, lastVertex);
                  const bearing2 = calculateBearing(lastVertex, currentVertex);
                  const angle = calculateAngleBetweenLines(bearing1, bearing2);
                  return (
                    <span style={{
                      marginLeft: '8px',
                      background: 'rgba(255, 193, 7, 0.3)',
                      border: '1px solid rgba(255, 193, 7, 0.5)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#FFD700',
                      fontWeight: '600'
                    }}>
                      ∠{angle.toFixed(0)}°
                    </span>
                  );
                })()}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '11px', marginBottom: '2px' }}>Vertices:</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFFFFF' }}>
              {vertices.length} points
            </div>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '11px', marginBottom: '2px' }}>Total Perimeter:</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFFFFF' }}>
              {calculatePerimeter(vertices, !!currentVertex).toFixed(1)}m
            </div>
          </div>

          {vertices.length >= 2 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '11px', marginBottom: '2px' }}>Estimated Area:</div>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFFFFF' }}>
                {calculatePolygonArea(vertices, !!currentVertex).toFixed(0)}m²
              </div>
            </div>
          )}

          {/* Edge list */}
          {vertices.length > 1 && (
            <div style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '11px', marginBottom: '6px', fontWeight: '500' }}>Completed Edges:</div>
              <div style={{ fontSize: '11px', maxHeight: '120px', overflowY: 'auto' }}>
                {vertices.slice(1).map((vertex, index) => {
                  const distance = calculateDistance(
                    vertices[index].lat, vertices[index].lng,
                    vertex.lat, vertex.lng
                  );
                  return (
                    <div key={index} style={{
                      padding: '2px 0',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}>
                      <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Edge {index + 1}:</span>
                      <span style={{ fontWeight: '600', color: '#FFFFFF' }}>{distance.toFixed(1)}m</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Banner - always shown when drawing mode enabled */}
      {enabled && !isDrawing && vertices.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(33, 150, 243, 0.95)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            fontWeight: '500',
            textAlign: 'center',
            maxWidth: '90%',
            border: '2px solid rgba(255, 255, 255, 0.3)'
          }}
        >
          🖱️ <strong>Click on map</strong> to start drawing | Hold <strong>SHIFT</strong> for 90° straight lines | <strong>Right-click</strong> to finish (3+ points)
        </div>
      )}

      {/* Current status display */}
      {isDrawing && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '13px',
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            color: '#FFFFFF'
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#FFFFFF' }}>
            <strong>Vertices:</strong> {vertices.length}
          </div>

          {isShiftPressed && (
            <div style={{
              color: '#90EE90',
              fontWeight: 'bold',
              background: 'rgba(76, 175, 80, 0.3)',
              padding: '4px 12px',
              borderRadius: '4px',
              border: '2px solid rgba(76, 175, 80, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              ⊥ ORTHOGONAL (90°)
            </div>
          )}

          {dimensionInput && (
            <div style={{
              background: 'rgba(0, 168, 255, 0.2)',
              padding: '6px 16px',
              borderRadius: '6px',
              color: '#FFFFFF',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              fontSize: '16px',
              border: '2px solid rgba(0, 168, 255, 0.5)',
              boxShadow: '0 2px 8px rgba(0, 168, 255, 0.3)'
            }}>
              📏 {dimensionInput}m
            </div>
          )}

          {vertices.length > 0 && (
            <button
              onClick={undoLastVertex}
              style={{
                background: '#FF9800',
                color: 'white',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '12px'
              }}
              title="Undo last vertex (or press ESC)"
            >
              ↶ Undo Last
            </button>
          )}

          {vertices.length >= 3 && (
            <button
              onClick={finishDrawing}
              style={{
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '12px'
              }}
            >
              ✓ Finish
            </button>
          )}

          <button
            onClick={cancelDrawing}
            style={{
              background: '#f44336',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px'
            }}
            title="Clear all and start over (or double-press ESC)"
          >
            ✕ Clear All
          </button>
        </div>
      )}

      {/* Site Geometry Panel - shows when polygon is completed or being edited */}
      <SiteGeometryPanel
        vertices={vertices}
        onVerticesChange={handleGeometryPanelChange}
        visible={!isDrawing && vertices.length >= 3}
      />
    </>
  );
};

export default PrecisionSiteDrawer;
