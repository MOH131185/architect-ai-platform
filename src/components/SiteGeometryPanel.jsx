import React, { useState, useEffect } from 'react';
import { calculateDistance } from '../utils/geometry.js';

/**
 * Site Geometry Panel
 *
 * Displays all edges and angles of the drawn polygon with ability to edit them:
 * - Shows length of each edge in meters
 * - Shows angle between each pair of edges
 * - Allows editing lengths and angles
 * - Updates polygon when values change
 */
const SiteGeometryPanel = ({ vertices, onVerticesChange, visible }) => {
  const [edges, setEdges] = useState([]);
  const [editingEdge, setEditingEdge] = useState(null);
  const [editingAngle, setEditingAngle] = useState(null);

  // Calculate edge lengths and angles whenever vertices change
  useEffect(() => {
    if (!vertices || vertices.length < 3) {
      setEdges([]);
      return;
    }

    const calculatedEdges = [];
    const numVertices = vertices.length;

    // For each edge, calculate length and the INTERIOR ANGLE at the START vertex
    for (let i = 0; i < numVertices; i++) {
      const prevIdx = (i - 1 + numVertices) % numVertices;
      const currIdx = i;
      const nextIdx = (i + 1) % numVertices;

      const prev = vertices[prevIdx];
      const current = vertices[currIdx];
      const next = vertices[nextIdx];

      // Calculate edge length (from current to next)
      const length = calculateDistance(
        current.lat, current.lng,
        next.lat, next.lng
      );

      // Calculate bearing from current to next (outgoing edge)
      const bearingOut = calculateBearing(current, next);

      // Calculate bearing from prev to current (incoming edge)
      const bearingIn = calculateBearing(prev, current);

      // Calculate INTERIOR angle at current vertex (angle between ribs)
      // This is the angle you turn from the incoming edge to the outgoing edge
      let turnAngle = bearingOut - bearingIn;

      // Normalize to 0-360
      while (turnAngle < 0) turnAngle += 360;
      while (turnAngle >= 360) turnAngle -= 360;

      // Convert to interior angle
      // If we turn more than 180°, the interior angle is on the other side
      let interiorAngle = turnAngle;
      if (turnAngle > 180) {
        interiorAngle = 360 - turnAngle;
      }

      calculatedEdges.push({
        index: i,
        from: currIdx,
        to: nextIdx,
        length: length,
        bearing: bearingOut,
        angle: interiorAngle,  // Interior angle at THIS vertex (between incoming and outgoing ribs)
        fromVertex: current,
        toVertex: next
      });
    }

    setEdges(calculatedEdges);
  }, [vertices]);

  // Calculate bearing between two points
  const calculateBearing = (from, to) => {
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;

    return bearing;
  };

  // Calculate destination point given start, distance, and bearing
  const calculateDestination = (start, distance, bearing) => {
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
  };

  // Handle edge length change
  const handleLengthChange = (edgeIndex, newLength) => {
    const edge = edges[edgeIndex];
    if (!edge) return;

    const newLengthMeters = parseFloat(newLength);
    if (isNaN(newLengthMeters) || newLengthMeters <= 0) return;

    // Calculate new position for the "to" vertex
    const newToVertex = calculateDestination(
      edge.fromVertex,
      newLengthMeters,
      edge.bearing
    );

    // Update vertices array
    const newVertices = [...vertices];
    newVertices[edge.to] = newToVertex;

    // Also update the closing vertex if it's the last edge
    if (edge.to === 0) {
      newVertices[newVertices.length - 1] = newToVertex;
    }

    // Recalculate subsequent vertices to maintain their edge lengths and angles
    // This propagates the change through the polygon
    for (let i = edge.to + 1; i < newVertices.length - 1; i++) {
      const prevEdge = edges.find(e => e.to === i);
      if (prevEdge) {
        const updatedVertex = calculateDestination(
          newVertices[prevEdge.from],
          prevEdge.length,
          prevEdge.bearing
        );
        newVertices[i] = updatedVertex;
      }
    }

    // Close the polygon
    newVertices[newVertices.length - 1] = newVertices[0];

    onVerticesChange(newVertices);
    setEditingEdge(null);
  };

  // Handle angle change between two edges
  const handleAngleChange = (edgeIndex, newAngle) => {
    const edge = edges[edgeIndex];
    if (!edge || edgeIndex === 0) return; // Can't change angle at first vertex

    const newAngleDeg = parseFloat(newAngle);
    if (isNaN(newAngleDeg) || newAngleDeg <= 0 || newAngleDeg >= 180) return;

    // Get previous edge
    const prevEdge = edges[edgeIndex - 1];
    if (!prevEdge) return;

    // Calculate new bearing based on angle change
    const angleDiff = newAngleDeg - edge.angle;
    const newBearing = (edge.bearing + angleDiff + 360) % 360;

    // Recalculate all vertices from this point onwards
    const newVertices = [...vertices];

    // Update current edge with new bearing
    newVertices[edge.to] = calculateDestination(
      edge.fromVertex,
      edge.length,
      newBearing
    );

    // Propagate changes to subsequent edges
    for (let i = edgeIndex + 1; i < edges.length; i++) {
      const currentEdge = edges[i];
      const updatedBearing = (currentEdge.bearing + angleDiff + 360) % 360;
      newVertices[currentEdge.to] = calculateDestination(
        newVertices[currentEdge.from],
        currentEdge.length,
        updatedBearing
      );
    }

    // Close the polygon
    newVertices[newVertices.length - 1] = newVertices[0];

    onVerticesChange(newVertices);
    setEditingAngle(null);
  };

  if (!visible || edges.length === 0) return null;

  const totalArea = calculatePolygonArea(vertices);

  return (
    <div
      className="liquid-glass-card"
      style={{
        position: 'absolute',
        top: '80px',
        left: '10px',
        zIndex: 1000,
        maxWidth: '350px',
        maxHeight: '500px',
        overflowY: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)'
      }}
    >
      <h3 style={{
        margin: '0 0 12px 0',
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        borderBottom: '2px solid rgba(0, 168, 255, 0.5)',
        paddingBottom: '8px'
      }}>
        📐 Site Geometry
      </h3>

      <div style={{
        background: 'rgba(0, 168, 255, 0.15)',
        padding: '8px 12px',
        borderRadius: '6px',
        marginBottom: '16px',
        fontSize: '14px',
        color: '#FFFFFF',
        border: '1px solid rgba(0, 168, 255, 0.3)'
      }}>
        <strong>Total Area:</strong> {totalArea.toFixed(1)} m²
      </div>

      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)', marginBottom: '12px' }}>
        Click values to edit lengths and angles
      </div>

      {edges.map((edge, index) => (
        <div
          key={index}
          style={{
            marginBottom: '12px',
            padding: '10px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          <div style={{
            fontWeight: 'bold',
            color: '#FFFFFF',
            marginBottom: '6px',
            fontSize: '13px'
          }}>
            Edge {index + 1} (Corner {index + 1} → {edge.to + 1})
          </div>

          {/* Edge Length */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ width: '70px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500' }}>Length:</span>
            {editingEdge === index ? (
              <input
                type="number"
                step="0.1"
                defaultValue={edge.length.toFixed(2)}
                onBlur={(e) => handleLengthChange(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLengthChange(index, e.target.value);
                  if (e.key === 'Escape') setEditingEdge(null);
                }}
                autoFocus
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  border: '2px solid rgba(0, 168, 255, 0.5)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  fontFamily: 'monospace'
                }}
              />
            ) : (
              <span
                onClick={() => setEditingEdge(index)}
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF',
                  fontWeight: '600'
                }}
                title="Click to edit"
              >
                {edge.length.toFixed(2)} m
              </span>
            )}
          </div>

          {/* Interior Angle (angle between ribs at this corner) */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: '70px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500' }}>Corner ∠:</span>
            {editingAngle === index ? (
              <input
                type="number"
                step="1"
                min="1"
                max="179"
                defaultValue={edge.angle.toFixed(1)}
                onBlur={(e) => handleAngleChange(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAngleChange(index, e.target.value);
                  if (e.key === 'Escape') setEditingAngle(null);
                }}
                autoFocus
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  border: '2px solid rgba(0, 168, 255, 0.5)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  fontFamily: 'monospace'
                }}
              />
            ) : (
              <span
                onClick={() => setEditingAngle(index)}
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  background: edge.angle >= 89 && edge.angle <= 91
                    ? 'rgba(76, 175, 80, 0.2)'
                    : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  border: edge.angle >= 89 && edge.angle <= 91
                    ? '1px solid rgba(76, 175, 80, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF',
                  fontWeight: '600'
                }}
                title="Click to edit (angle between incoming and outgoing ribs)"
              >
                {edge.angle.toFixed(1)}° {edge.angle >= 89 && edge.angle <= 91 ? '⊥' : ''}
              </span>
            )}
          </div>

          {/* Bearing (compass direction) */}
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '4px' }}>
            Direction: {edge.bearing.toFixed(1)}° ({getCompassDirection(edge.bearing)})
          </div>
        </div>
      ))}
    </div>
  );
};

// Calculate polygon area using Shoelace formula
const calculatePolygonArea = (vertices) => {
  if (!vertices || vertices.length < 3) return 0;

  const R = 6371000; // Earth radius in meters

  // Calculate centroid for reference
  const centerLat = vertices.reduce((sum, v) => sum + v.lat, 0) / vertices.length;

  // Convert to Cartesian coordinates
  const cartesian = vertices.map(v => ({
    x: (v.lng - vertices[0].lng) * Math.PI / 180 * R * Math.cos(centerLat * Math.PI / 180),
    y: (v.lat - vertices[0].lat) * Math.PI / 180 * R
  }));

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < cartesian.length - 1; i++) {
    area += cartesian[i].x * cartesian[i + 1].y;
    area -= cartesian[i + 1].x * cartesian[i].y;
  }
  area = Math.abs(area) / 2;

  return area;
};

// Get compass direction from bearing
const getCompassDirection = (bearing) => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(bearing / 22.5) % 16;
  return directions[index];
};

export default SiteGeometryPanel;
