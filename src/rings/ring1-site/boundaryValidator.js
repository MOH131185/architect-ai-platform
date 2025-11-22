import {
  computeSiteMetrics,
  polygonToLocalXY,
  validateFootprintInsideBoundary,
  applyDirectionalSetbacks
} from '../../utils/geometry';

const DEFAULT_SETBACKS = {
  front: 3,
  rear: 3,
  sideLeft: 3,
  sideRight: 3
};

function normalizePolygon(sitePolygon, coordinates) {
  if (sitePolygon && sitePolygon.length >= 3) {
    return sitePolygon;
  }

  if (!coordinates) {
    return null;
  }

  const { lat, lng } = coordinates;
  const width = 30; // meters
  const depth = 20;
  const latOffset = depth / 110540;
  const lngOffset = width / (111320 * Math.cos(lat * Math.PI / 180));

  return [
    { lat: lat - latOffset / 2, lng: lng - lngOffset / 2 },
    { lat: lat - latOffset / 2, lng: lng + lngOffset / 2 },
    { lat: lat + latOffset / 2, lng: lng + lngOffset / 2 },
    { lat: lat + latOffset / 2, lng: lng - lngOffset / 2 }
  ];
}

export function buildBoundaryContext({
  sitePolygon,
  coordinates,
  siteAnalysis,
  setbacks = DEFAULT_SETBACKS,
  orientationDeg
} = {}) {
  const normalizedPolygon = normalizePolygon(sitePolygon, coordinates);

  if (!normalizedPolygon) {
    return null;
  }

  const metrics = computeSiteMetrics(normalizedPolygon);
  const centroid = metrics.centroid;
  const boundaryXY = polygonToLocalXY(normalizedPolygon, centroid);
  const resolvedOrientation = orientationDeg ?? metrics.orientationDeg ?? 0;
  const resolvedSetbacks = {
    front: setbacks.front ?? DEFAULT_SETBACKS.front,
    rear: setbacks.rear ?? DEFAULT_SETBACKS.rear,
    sideLeft: setbacks.sideLeft ?? DEFAULT_SETBACKS.sideLeft,
    sideRight: setbacks.sideRight ?? DEFAULT_SETBACKS.sideRight
  };
  const buildableArea = applyDirectionalSetbacks(boundaryXY, resolvedSetbacks, resolvedOrientation);

  return {
    polygon: normalizedPolygon,
    centroid,
    area: metrics.areaM2,
    orientationDeg: resolvedOrientation,
    perimeter: metrics.perimeterM,
    vertices: metrics.vertices,
    setbacks: resolvedSetbacks,
    boundaryXY,
    buildableArea,
    siteAnalysis
  };
}

export function validateFootprintWithinBoundary(footprintXY, boundaryContext) {
  if (!boundaryContext || !boundaryContext.buildableArea || !Array.isArray(footprintXY)) {
    return {
      isValid: false,
      compliancePercentage: 0,
      errors: ['Missing boundary context or footprint data']
    };
  }

  return validateFootprintInsideBoundary(footprintXY, boundaryContext.buildableArea);
}

