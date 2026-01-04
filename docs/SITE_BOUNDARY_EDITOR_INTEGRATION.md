# Site Boundary Editor - Integration Guide

## Overview

Complete Google Maps-powered site boundary editor for the ArchitectAI platform with drag handles, manual editing, drawing tools, and full wizard integration.

## Architecture

### File Structure

```
src/
├── components/
│   ├── map/
│   │   ├── SiteBoundaryEditor.jsx      # Main component (700+ lines)
│   │   ├── useGoogleMap.js             # Google Maps hook
│   │   ├── usePolygonTools.js          # Polygon manipulation hook
│   │   ├── polygonEditor.js            # Interactive editing logic
│   │   ├── mapUtils.js                 # Map utilities
│   │   └── GeometryMath.js             # Geometric calculations
│   ├── site/
│   │   └── index.js                    # Barrel export
│   └── steps/
│       └── LocationStep.jsx            # Wizard integration
└── docs/
    └── SITE_BOUNDARY_EDITOR_INTEGRATION.md
```

## Features

### 1. Auto-Detection
- Fetches boundary from address (currently mock, ready for API integration)
- Geocoding support via Google Maps
- Automatic map fitting to boundary

### 2. Interactive Editing
- **Drag Handles**: Every vertex has draggable handles
- **Shift+Click**: Add vertex at cursor position
- **Right-Click**: Remove vertex
- **Midpoints**: Click midpoint markers to add vertices
- **Live Updates**: All metrics recalculate in real-time

### 3. Manual Editing Panel
- Click segment length to edit (meters)
- Click vertex angle to edit (degrees)
- Polygon adjusts automatically
- Input validation

### 4. Drawing Tools
- Enable drawing mode
- Click to add points
- Double-click to finish
- Minimum 3 points required

### 5. Computed Metrics
- **Area**: m², acres, hectares
- **Perimeter**: meters, feet
- **Segment Lengths**: Individual edge measurements
- **Vertex Angles**: Interior angles at each corner
- **Centroid**: Center point of polygon
- **Validation**: Self-intersection detection

### 6. Export Capabilities
- GeoJSON export
- Base64 image snapshot
- DNA format for architectural processing

## Component API

### SiteBoundaryEditor Props

```jsx
<SiteBoundaryEditor
  initialBoundaryPolygon={[]}           // Array<{lat, lng}>
  siteAddress=""                         // string
  onBoundaryChange={(data) => {}}       // Function
  apiKey=""                              // Google Maps API key
  center={{ lat: 0, lng: 0 }}           // Initial center
/>
```

### onBoundaryChange Data Structure

```javascript
{
  polygon: [{ lat: number, lng: number }],
  metrics: {
    area: {
      value: number,
      formatted: string,
      acres: string,
      hectares: string
    },
    perimeter: {
      value: number,
      formatted: string,
      feet: string
    },
    segments: [{
      index: number,
      length: { value, formatted, feet },
      angle: { value, formatted }
    }],
    centroid: { lat, lng },
    vertexCount: number,
    isValid: boolean,
    isSelfIntersecting: boolean
  },
  dna: {
    sitePolygon: [...],
    siteBoundary: { coordinates, area, perimeter, centroid },
    dimensions: { area, perimeter, segmentLengths, segmentAngles },
    geometry: { vertices, isClosed, isValid, isSelfIntersecting }
  },
  geoJSON: { type: 'Feature', geometry: {...}, properties: {...} }
}
```

## Wizard Integration

### LocationStep.jsx

```jsx
import { SiteBoundaryEditor } from '../site';

<SiteBoundaryEditor
  initialBoundaryPolygon={sitePolygon}
  siteAddress={address}
  onBoundaryChange={onBoundaryUpdated}
  apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
  center={locationData.coordinates}
/>
```

### ArchitectAIWizardContainer.jsx

```javascript
const handleBoundaryUpdated = useCallback((boundaryData) => {
  if (!boundaryData) return;
  
  setSitePolygon(boundaryData.polygon || []);
  
  const metrics = boundaryData.metrics || {};
  setSiteMetrics({
    area: metrics.area?.value || 0,
    perimeter: metrics.perimeter?.value || 0,
    centroid: metrics.centroid || null,
    segments: metrics.segments || [],
    angles: metrics.segments?.map(s => s.angle?.value) || [],
  });
}, []);
```

## Geometry Utilities

### GeometryMath.js

Core geometric calculations using Haversine formula:

- `getDistance(point1, point2)` - Distance in meters
- `getBearing(point1, point2)` - Bearing in degrees
- `movePointByDistanceAndBearing(point, distance, bearing)` - Move point
- `getPolygonArea(polygon)` - Area in m²
- `getPolygonPerimeter(polygon)` - Perimeter in meters
- `getSegmentLengths(polygon)` - Array of edge lengths
- `getSegmentAngles(polygon)` - Array of interior angles
- `adjustSegmentLength(polygon, index, newLength)` - Adjust edge
- `adjustVertexAngle(polygon, index, newAngle)` - Adjust angle
- `isPolygonSelfIntersecting(polygon)` - Validation
- `polygonToGeoJSON(polygon)` - Export format

### usePolygonTools Hook

React hook for polygon manipulation:

```javascript
const {
  polygon,              // Current polygon state
  metrics,              // Computed metrics
  setPolygon,           // Update polygon
  addVertex,            // Add vertex
  removeVertex,         // Remove vertex
  updateVertex,         // Update vertex position
  adjustLength,         // Adjust segment length
  adjustAngle,          // Adjust vertex angle
  undo,                 // Undo last change
  redo,                 // Redo last undone change
  canUndo,              // Can undo?
  canRedo,              // Can redo?
  exportGeoJSON,        // Export as GeoJSON
  convertToDNA,         // Convert to DNA format
  validateForArchitecture  // Validate polygon
} = usePolygonTools(initialPolygon);
```

### useGoogleMap Hook

Google Maps initialization and management:

```javascript
const {
  map,                  // Google Maps instance
  google,               // Google Maps API object
  isLoaded,             // Map loaded?
  isLoading,            // Map loading?
  error,                // Loading error
  panTo,                // Pan to location
  setZoom,              // Set zoom level
  fitBounds,            // Fit bounds to points
  geocodeAddress,       // Geocode address
  reverseGeocode,       // Reverse geocode
  createMarker,         // Create marker
  createPolygon,        // Create polygon
  addListener,          // Add event listener
  removeListener        // Remove event listener
} = useGoogleMap({ apiKey, mapContainer, center, zoom });
```

## User Interactions

### Editing Mode

1. Click "Enable Editing" button
2. Drag vertex handles to move corners
3. Shift+Click on map to add vertex at cursor
4. Right-click vertex to remove
5. Click midpoint markers to add vertex between corners
6. All metrics update live

### Manual Editing

1. View segment table below map
2. Click length value to edit
3. Type new length in meters
4. Press Enter or blur to apply
5. Polygon adjusts automatically
6. Same for angle editing

### Drawing Mode

1. Click "Draw Polygon" button
2. Click on map to add points
3. Double-click to finish polygon
4. Minimum 3 points required
5. Polygon appears with all metrics

## Validation

### Architectural Validation

- Minimum 3 vertices
- No self-intersection
- Minimum area: 10 m²
- Maximum area: 100,000 m² (10 hectares)
- Segment length: > 1m (warning)
- Vertex angle: 30° - 330° (warning)

### Visual Feedback

- Valid polygon: Blue outline
- Invalid polygon: Red outline
- Editing mode: Green outline
- Hovered vertex: Green fill
- Dragging vertex: Red fill
- Midpoint markers: Gray (hover: green)

## Performance Optimizations

- Debounced metric calculations
- Throttled map updates
- Memoized geometry computations
- History tracking with undo/redo
- Efficient marker management

## Environment Variables

Required in `.env`:

```bash
REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Dependencies

### Required

```json
{
  "@googlemaps/js-api-loader": "^1.16.2",
  "react": "^18.0.0",
  "framer-motion": "^10.0.0"
}
```

### Installation

```bash
npm install @googlemaps/js-api-loader
```

## Future Enhancements

### Auto-Boundary Detection

Currently returns mock rectangular boundary. To integrate real API:

```javascript
// mapUtils.js - fetchAutoBoundary()
export async function fetchAutoBoundary(address, center) {
  // Option 1: Overpass API (OpenStreetMap)
  return fetchBoundaryFromOverpass(center, 50);
  
  // Option 2: Google Places API
  // Implement Google Places boundary detection
  
  // Option 3: Custom boundary detection service
  // Call your own API endpoint
}
```

### Drawing Tools Enhancement

Add more drawing tools:
- Rectangle tool
- Circle tool
- Polygon simplification
- Snap to grid
- Measurement tools

### 3D Visualization

Integrate with Three.js for 3D site visualization:
- Terrain elevation
- Building massing
- Shadow analysis
- Sun path visualization

## Troubleshooting

### Map Not Loading

1. Check API key is set in `.env`
2. Verify API key has Maps JavaScript API enabled
3. Check browser console for errors
4. Ensure billing is enabled on Google Cloud

### Polygon Not Updating

1. Check `onBoundaryChange` callback is connected
2. Verify polygon state is being updated in parent
3. Check for console errors
4. Ensure `initialBoundaryPolygon` prop is passed correctly

### Metrics Incorrect

1. Verify polygon coordinates are valid lat/lng
2. Check for self-intersecting polygons
3. Ensure minimum 3 vertices
4. Validate coordinate order (clockwise/counter-clockwise)

### Performance Issues

1. Reduce polygon complexity (simplify)
2. Disable midpoint markers if many vertices
3. Increase debounce/throttle delays
4. Check for memory leaks in event listeners

## Testing

### Manual Testing Checklist

- [ ] Auto-detect boundary loads
- [ ] Drag vertex updates polygon
- [ ] Shift+Click adds vertex
- [ ] Right-click removes vertex
- [ ] Midpoint click adds vertex
- [ ] Manual length edit works
- [ ] Manual angle edit works
- [ ] Drawing mode creates polygon
- [ ] Undo/redo functions
- [ ] Metrics calculate correctly
- [ ] Validation detects errors
- [ ] GeoJSON export works
- [ ] Map fits to bounds
- [ ] Wizard integration persists data

### Unit Tests

```javascript
// Example test structure
import { getPolygonArea, getPolygonPerimeter } from './GeometryMath';

test('calculates polygon area correctly', () => {
  const polygon = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0.001, lng: 0.001 },
    { lat: 0.001, lng: 0 }
  ];
  
  const area = getPolygonArea(polygon);
  expect(area).toBeGreaterThan(0);
});
```

## Support

For issues or questions:
1. Check this documentation
2. Review component source code
3. Check browser console for errors
4. Verify Google Maps API setup
5. Test with simplified polygon

## License

Part of the ArchitectAI platform. All rights reserved.

