/**
 * Site Components - Barrel Export
 *
 * Google Maps-powered site boundary editing components
 * for the ArchitectAI platform.
 *
 * V2 components provide expert-level editing with:
 * - Single source of truth (GeoJSON Polygon EPSG:4326)
 * - No drift (OverlayView projection)
 * - Three editing modes: Mouse, Drawing, Table
 * - Full undo/redo history
 * - Import/Export: GeoJSON, WKT, CSV
 */

// Main component - V2 is now the default
export { SiteBoundaryEditorV2 as SiteBoundaryEditor } from "../map/SiteBoundaryEditorV2.jsx";
export { SiteBoundaryEditorV2 } from "../map/SiteBoundaryEditorV2.jsx";

// Legacy component (for backwards compatibility)
export { default as SiteBoundaryEditorLegacy } from "../map/SiteBoundaryEditor.jsx";

// V2 Sub-components
export { VertexTableEditor } from "../map/VertexTableEditor.jsx";
export { BoundaryDiagnostics } from "../map/BoundaryDiagnostics.jsx";

// V2 Hooks
export { useBoundaryState } from "../map/useBoundaryState.js";
export { useGoogleMap } from "../map/useGoogleMap.js";
export { usePolygonTools } from "../map/usePolygonTools.js";

// V2 Editor Classes
export {
  PrecisionPolygonEditor,
  createPrecisionPolygonEditor,
} from "../map/PrecisionPolygonEditor.js";
export {
  PolygonDrawingManager,
  createPolygonDrawingManager,
} from "../map/PolygonDrawingManager.js";

// Legacy Polygon editor
export { PolygonEditor, createPolygonEditor } from "../map/polygonEditor.js";

// V2 Geometry utilities (turf.js based)
export {
  // Coordinate operations
  roundCoord,
  normalizePoint,
  coordToLatLng,
  latLngToCoord,
  // Ring operations
  isRingClosed,
  closeRing,
  openRing,
  removeDuplicates,
  normalizeRing,
  // Validation
  detectSelfIntersection,
  validatePolygon,
  wouldCauseSelfIntersection,
  // Metrics
  calculateArea,
  calculatePerimeter,
  calculateCentroid,
  calculateSegments,
  calculateAngles,
  // Snapping
  snapToVertex,
  snapToEdge,
  snapBearing,
  constrainToAngle,
  // Format conversion
  toGeoJSON,
  fromGeoJSON,
  toWKT,
  fromWKT,
  toCSV,
  fromCSV,
  latLngArrayToRing,
  ringToLatLngArray,
} from "../map/boundaryGeometry.js";

// Legacy Geometry utilities
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
} from "../map/GeometryMath.js";

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
} from "../map/mapUtils.js";
