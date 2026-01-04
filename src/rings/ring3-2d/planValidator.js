import { pointInPolygon, polygonToLocalXY } from '../../utils/geometry.js';

function toXY(vertices, origin) {
  if (!Array.isArray(vertices) || vertices.length === 0) {
    return [];
  }
  if (vertices[0].lat !== undefined) {
    return polygonToLocalXY(vertices, origin || vertices[0]);
  }
  return vertices;
}

export function validateRoomAreas(dna, level = 0, tolerance = 0.02) {
  const rooms = (dna?.rooms || []).filter(room => room.level === level);
  const targetArea = parseFloat(dna?.geometry?.floors?.[level]?.area || dna?.geometry?.footprint?.area || 0);

  if (!targetArea || rooms.length === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  const roomAreaSum = rooms.reduce((sum, room) => sum + (room.area || 0), 0);
  const delta = Math.abs(roomAreaSum - targetArea) / targetArea;

  if (delta <= tolerance) {
    return { valid: true, errors: [], warnings: [] };
  }

  return {
    valid: false,
    errors: [
      `Room area mismatch on level ${level}: ${roomAreaSum.toFixed(2)}m² vs target ${targetArea.toFixed(2)}m²`
    ],
    warnings: []
  };
}

export function validateRoomsInsideFootprint(dna, level = 0) {
  const footprint = toXY(dna?.geometry?.footprint?.vertices, dna?.geometry?.footprint?.origin);
  const rooms = (dna?.rooms || []).filter(room => room.level === level);

  if (!footprint.length || rooms.length === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  const errors = [];
  rooms.forEach(room => {
    if (!Array.isArray(room.vertices) || room.vertices.length === 0) {
      return;
    }
    const roomXY = toXY(room.vertices, dna?.geometry?.footprint?.origin);
    roomXY.forEach((vertex, index) => {
      if (!pointInPolygon(vertex, footprint)) {
        errors.push(
          `Room "${room.name || 'Unnamed'}" vertex ${index + 1} lies outside footprint on level ${level}`
        );
      }
    });
  });

  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateFloorPlan(dna, level = 0) {
  const areaValidation = validateRoomAreas(dna, level);
  const footprintValidation = validateRoomsInsideFootprint(dna, level);

  return {
    valid: areaValidation.valid && footprintValidation.valid,
    errors: [...(areaValidation.errors || []), ...(footprintValidation.errors || [])],
    warnings: [...(areaValidation.warnings || []), ...(footprintValidation.warnings || [])]
  };
}

