/**
 * Site Components - Barrel Export
 *
 * Google Maps-powered site boundary editing components
 * for the ArchitectAI platform.
 */

// Main component
export { default as SiteBoundaryEditor } from '../map/SiteBoundaryEditor';

// Hooks
export { useGoogleMap } from '../map/useGoogleMap';
export { usePolygonTools } from '../map/usePolygonTools';

// Polygon editor
export { PolygonEditor, createPolygonEditor } from '../map/polygonEditor';

// Geometry utilities
export {
  getDistance,
  getBearing,
  movePointByDistanceAndBearing,
  getAngleBetweenPoints,
  getPolygonArea,
  getPolygonPerimeter,
  getPolygonCentroid,
  getSegmentLengths,
  getSegmentAngles,
  adjustSegmentLength,
  adjustVertexAngle,
  isPolygonSelfIntersecting,
  snapPolygonClosure,
  polygonToGeoJSON,
  geoJSONToPolygon,
  simplifyPolygon,
  toRadians,
  toDegrees,
} from '../map/GeometryMath';

// Map utilities
export {
  fetchAutoBoundary,
  fetchBoundaryFromOverpass,
  calculateBounds,
  boundsToGoogleBounds,
  findNearestPointOnPolygon,
  isPointInPolygon,
  generateMapSnapshotURL,
  exportPolygonAsBase64,
  createVertexMarkerOptions,
  createMidpointMarkerOptions,
  createPolygonStyleOptions,
  formatCoordinate,
  parseCoordinate,
  debounce,
  throttle,
} from '../map/mapUtils';
