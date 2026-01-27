/**
 * Map Components Index
 *
 * Expert-level site boundary editing system.
 */

// Main Editor Components
export { SiteBoundaryEditor } from "./SiteBoundaryEditor.jsx";
export { SiteBoundaryEditorV2 } from "./SiteBoundaryEditorV2.jsx";

// Sub-components
export { VertexTableEditor } from "./VertexTableEditor.jsx";
export { BoundaryDiagnostics } from "./BoundaryDiagnostics.jsx";
export { EntranceCompassOverlay } from "./EntranceCompassOverlay.jsx";

// Hooks
export { useGoogleMap } from "./useGoogleMap.js";
export { usePolygonTools } from "./usePolygonTools.js";
export { useBoundaryState } from "./useBoundaryState.js";

// Editor Classes (for advanced usage)
export {
  PrecisionPolygonEditor,
  createPrecisionPolygonEditor,
} from "./PrecisionPolygonEditor.js";
export {
  PolygonDrawingManager,
  createPolygonDrawingManager,
} from "./PolygonDrawingManager.js";
export { PolygonEditor, createPolygonEditor } from "./polygonEditor.js";

// Geometry Utilities
export * from "./boundaryGeometry.js";
export * from "./GeometryMath.js";

// Map Utilities
export {
  fetchAutoBoundary,
  calculateBounds,
  boundsToGoogleBounds,
  findNearestPointOnPolygon,
  isPointInPolygon,
} from "./mapUtils.js";
