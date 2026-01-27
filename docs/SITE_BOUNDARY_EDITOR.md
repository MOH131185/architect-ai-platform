# Site Boundary Editor - Expert Level

A comprehensive, expert-level site boundary editing system with precision editing, validation, and multiple input modes.

## Features

- **No Drift**: Uses Google Maps OverlayView projection for pixel-perfect coordinate conversion at all zoom levels
- **Single Source of Truth**: GeoJSON Polygon format (EPSG:4326, [lng, lat])
- **Real-time Validation**: Self-intersection detection, minimum vertices, area/perimeter calculation
- **Precision Editing**: SHIFT for angle snapping, ALT to disable snapping
- **Multiple Edit Modes**: Mouse editing, manual drawing, table editing
- **Full History**: Unlimited undo/redo with keyboard shortcuts
- **Import/Export**: GeoJSON, WKT, CSV formats

## Components

### SiteBoundaryEditorV2

The main editor component that integrates all sub-components.

```jsx
import { SiteBoundaryEditorV2 } from "./components/map";

<SiteBoundaryEditorV2
  initialBoundaryPolygon={[
    { lat: 37.7749, lng: -122.4194 },
    { lat: 37.7759, lng: -122.4194 },
    { lat: 37.7759, lng: -122.4184 },
    { lat: 37.7749, lng: -122.4184 },
  ]}
  siteAddress="123 Main St, San Francisco, CA"
  onBoundaryChange={(data) => {
    console.log("Polygon:", data.polygon);
    console.log("Metrics:", data.metrics);
    console.log("GeoJSON:", data.geoJSON);
    console.log("DNA:", data.dna);
  }}
  apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
  center={{ lat: 37.7749, lng: -122.4194 }}
/>;
```

### VertexTableEditor

Table-based coordinate editor with CSV paste support.

```jsx
import { VertexTableEditor } from './components/map';

<VertexTableEditor
  vertices={[
    [-122.4194, 37.7749],
    [-122.4194, 37.7759],
    [-122.4184, 37.7759],
    [-122.4184, 37.7749]
  ]}
  onVerticesChange={(newVertices) => { ... }}
  onVertexSelect={(index) => { ... }}
  selectedIndex={0}
/>
```

### BoundaryDiagnostics

Real-time validation and metrics display.

```jsx
import { BoundaryDiagnostics } from "./components/map";

<BoundaryDiagnostics
  vertices={vertices}
  showSegments={true}
  showAngles={true}
  compact={false}
/>;
```

## Keyboard Shortcuts

### Global Shortcuts

| Key                                      | Action              |
| ---------------------------------------- | ------------------- |
| `E`                                      | Toggle Edit mode    |
| `D`                                      | Toggle Draw mode    |
| `T`                                      | Toggle Table editor |
| `Ctrl/Cmd + Z`                           | Undo                |
| `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z` | Redo                |

### Edit Mode

| Key                    | Action                          |
| ---------------------- | ------------------------------- |
| `Delete` / `Backspace` | Remove selected vertex          |
| `Escape`               | Deselect vertex                 |
| `SHIFT` (hold)         | Angle snapping (45° increments) |
| `ALT` (hold)           | Disable all snapping            |

### Draw Mode

| Key                    | Action                          |
| ---------------------- | ------------------------------- |
| Click                  | Place vertex                    |
| Double-click           | Finish polygon                  |
| `Enter`                | Finish polygon                  |
| `Escape`               | Undo last vertex                |
| `Backspace` / `Delete` | Undo last vertex                |
| `SHIFT` (hold)         | Angle snapping (45° increments) |
| `ALT` (hold)           | Disable snapping                |

### Mouse Controls

| Action             | Result                          |
| ------------------ | ------------------------------- |
| Click vertex       | Select vertex                   |
| Drag vertex        | Move vertex                     |
| Click midpoint     | Insert new vertex               |
| Click polygon edge | Insert vertex at click position |
| Right-click vertex | Remove vertex (Edit mode)       |

## Hooks

### useBoundaryState

Unified boundary state management hook.

```jsx
import { useBoundaryState } from "./components/map";

const {
  ring, // GeoJSON ring [lng, lat] format (closed)
  vertices, // Open ring (for editing)
  polygon, // lat/lng array (for Google Maps)
  metrics, // Computed metrics
  validation, // Validation result
  canUndo,
  canRedo,
  setPolygon, // Set from lat/lng array
  setRing, // Set from GeoJSON ring
  addVertex,
  removeVertex,
  updateVertex,
  undo,
  redo,
  exportGeoJSON,
  exportWKT,
  exportCSV,
  importGeoJSON,
  importWKT,
  importCSV,
} = useBoundaryState(initialPolygon);
```

## Geometry Utilities

### Core Functions

```javascript
import {
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
} from "./components/map/boundaryGeometry.js";
```

## Data Formats

### GeoJSON (Canonical Format)

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [-122.4194, 37.7749],
        [-122.4194, 37.7759],
        [-122.4184, 37.7759],
        [-122.4184, 37.7749],
        [-122.4194, 37.7749]
      ]
    ]
  },
  "properties": {
    "area": 12345.67,
    "perimeter": 456.78,
    "vertices": 4,
    "valid": true
  }
}
```

### WKT Format

```
POLYGON ((-122.4194 37.7749, -122.4194 37.7759, -122.4184 37.7759, -122.4184 37.7749, -122.4194 37.7749))
```

### CSV Format

```csv
-122.4194,37.7749
-122.4194,37.7759
-122.4184,37.7759
-122.4184,37.7749
```

## Validation Rules

1. **Minimum Vertices**: At least 3 unique vertices required
2. **No Self-Intersection**: Polygon edges cannot cross each other
3. **Closed Ring**: First and last points must match (handled automatically)
4. **No Consecutive Duplicates**: Duplicate points are automatically removed
5. **Coordinate Precision**: Coordinates rounded to 7 decimal places (~1cm)

## Warnings (Non-blocking)

- **Small Area**: Sites under 10 m²
- **Large Area**: Sites over 10 hectares
- **Short Segments**: Edges under 0.5m
- **Acute Angles**: Interior angles under 15° or over 345°

## Root Cause Analysis (Original Issues)

### 1. Drag Drift

**Problem**: Vertex dragging felt imprecise, especially at different zoom levels.

**Root Cause**: The original `polygonEditor.js` used Google Maps Marker's built-in drag functionality which updates lat/lng positions directly. However, the conversion between screen pixels and lat/lng at different zoom levels caused perceptible drift.

**Solution**: `PrecisionPolygonEditor.js` uses Google Maps OverlayView's `getProjection()` method to access `fromLatLngToDivPixel()` and `fromDivPixelToLatLng()` for pixel-perfect coordinate conversion.

### 2. State Synchronization

**Problem**: Edits didn't sync reliably between map and downstream steps.

**Root Cause**: Polygon state was stored in multiple places:

- `usePolygonTools` hook state
- `PolygonEditor` class internal state
- Google Maps Polygon overlay path
- Parent component state

These could get out of sync during drag operations.

**Solution**: `useBoundaryState.js` provides a single source of truth using GeoJSON ring format. All components read from and write to this canonical state.

### 3. Invalid Polygons

**Problem**: Manual editing sometimes created invalid polygons or weird jumps.

**Root Cause**: No real-time validation during editing. Self-intersection checks only ran after edits completed.

**Solution**:

- Real-time self-intersection detection during drag
- `wouldCauseSelfIntersection()` checks proposed moves before applying
- Visual warnings when invalid states are attempted

### 4. Drawing Mode Not Implemented

**Problem**: The "Draw Polygon" button existed but didn't work properly.

**Root Cause**: The `isDrawingMode` state toggle existed but had no actual drawing implementation.

**Solution**: `PolygonDrawingManager.js` provides full click-to-place polygon drawing with:

- Live preview line following cursor
- Auto-close when clicking near first point
- SHIFT for angle snapping
- ESC/Backspace to undo
- Double-click or Enter to finish

## Dependencies

- `@turf/turf` - Robust geometry calculations
- `framer-motion` - Smooth animations
- `@googlemaps/js-api-loader` - Google Maps API loading

## Installation

```bash
npm install @turf/turf
```

## Testing

```bash
npm test -- src/components/map/__tests__/boundaryGeometry.test.js
```
