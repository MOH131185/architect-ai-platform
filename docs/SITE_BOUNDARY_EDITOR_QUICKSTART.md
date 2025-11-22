# Site Boundary Editor - Quick Start Guide

## Installation

The required dependency `@googlemaps/js-api-loader` is already installed via `@googlemaps/react-wrapper`.

No additional installation needed!

## Basic Usage

### 1. Import the Component

```jsx
import { SiteBoundaryEditor } from '../components/site';
```

### 2. Add to Your Component

```jsx
function MyComponent() {
  const [sitePolygon, setSitePolygon] = useState([]);
  
  const handleBoundaryChange = (boundaryData) => {
    setSitePolygon(boundaryData.polygon);
    console.log('Area:', boundaryData.metrics.area.formatted);
    console.log('Perimeter:', boundaryData.metrics.perimeter.formatted);
  };
  
  return (
    <SiteBoundaryEditor
      initialBoundaryPolygon={sitePolygon}
      siteAddress="123 Main St, San Francisco, CA"
      onBoundaryChange={handleBoundaryChange}
      apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
      center={{ lat: 37.7749, lng: -122.4194 }}
    />
  );
}
```

### 3. Environment Setup

Ensure `.env` contains:

```bash
REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here
```

## User Guide

### Auto-Detect Boundary
1. Click "🔍 Auto-Detect Boundary"
2. Wait for detection to complete
3. Boundary appears on map with metrics

### Edit Boundary
1. Click "✏️ Enable Editing"
2. **Drag vertices** to move corners
3. **Shift+Click** on map to add vertex
4. **Right-click** vertex to remove
5. **Click midpoints** to add vertex between corners

### Manual Editing
1. Scroll to segment table below map
2. Click any **length value** to edit
3. Type new length in meters, press Enter
4. Click any **angle value** to edit
5. Type new angle in degrees, press Enter

### Drawing Mode
1. Click "✏️ Draw Polygon"
2. Click on map to add points
3. Double-click to finish
4. Minimum 3 points required

### Other Controls
- **📍 Fit to Bounds**: Center map on polygon
- **↶ Undo**: Undo last change
- **↷ Redo**: Redo last undone change
- **🗑️ Clear**: Remove all vertices
- **💾 Export GeoJSON**: Download as GeoJSON file

## Metrics Display

Four metric cards show:
- **Area**: m², acres, hectares
- **Perimeter**: meters, feet
- **Vertices**: Number of corners
- **Status**: Valid/Invalid with validation info

## Segment Table

Shows for each edge:
- Segment number
- Length (meters and feet)
- Interior angle (degrees)

Click values to edit manually!

## Validation

### Errors (Red)
- Less than 3 vertices
- Self-intersecting polygon

### Warnings (Yellow)
- Area < 10 m² (very small)
- Area > 100,000 m² (very large)
- Segment < 1m (very short)
- Angle < 30° or > 330° (very acute)

## Integration with Wizard

Already integrated in `LocationStep.jsx`!

The component:
1. Receives address from location analysis
2. Auto-detects boundary
3. Allows user editing
4. Passes polygon and metrics to wizard state
5. Data flows to next steps automatically

## Data Structure

```javascript
boundaryData = {
  polygon: [
    { lat: 37.7749, lng: -122.4194 },
    { lat: 37.7750, lng: -122.4195 },
    // ... more vertices
  ],
  metrics: {
    area: {
      value: 1234.56,
      formatted: "1234.56 m²",
      acres: "0.3051",
      hectares: "0.1235"
    },
    perimeter: {
      value: 150.25,
      formatted: "150.25 m",
      feet: "492.94"
    },
    segments: [
      {
        index: 0,
        length: { value: 35.5, formatted: "35.50 m", feet: "116.47" },
        angle: { value: 90.0, formatted: "90.0°" }
      },
      // ... more segments
    ],
    centroid: { lat: 37.7749, lng: -122.4194 },
    vertexCount: 4,
    isValid: true,
    isSelfIntersecting: false
  },
  dna: { /* DNA format for architectural processing */ },
  geoJSON: { /* Standard GeoJSON format */ }
}
```

## Tips

### Best Practices
- Start with auto-detect for quick setup
- Use editing mode for fine-tuning
- Manual editing for precise dimensions
- Export GeoJSON for backup

### Performance
- Keep polygon under 50 vertices for best performance
- Use "Fit to Bounds" if polygon goes off-screen
- Undo/redo has unlimited history

### Accuracy
- Measurements use Haversine formula (geodesic)
- Accurate for sites up to several kilometers
- Angles are interior angles (0-360°)
- Area calculation accounts for Earth's curvature

## Troubleshooting

### Map doesn't load
- Check API key in `.env`
- Verify Google Maps JavaScript API is enabled
- Check browser console for errors

### Can't edit polygon
- Click "Enable Editing" button
- Ensure polygon has at least 3 vertices
- Check that editing mode is active (green outline)

### Metrics seem wrong
- Verify coordinates are valid lat/lng
- Check for self-intersecting polygon (red outline)
- Ensure vertices are in correct order

### Changes not saving
- Check `onBoundaryChange` callback is connected
- Verify parent component updates state
- Look for console errors

## Next Steps

1. ✅ Component is production-ready
2. ✅ Integrated with wizard
3. ✅ Full documentation available
4. 🔄 Consider adding real boundary detection API
5. 🔄 Consider 3D visualization features

## Support

See full documentation: `docs/SITE_BOUNDARY_EDITOR_INTEGRATION.md`

## Example: Complete Integration

```jsx
import React, { useState } from 'react';
import { SiteBoundaryEditor } from './components/site';

function App() {
  const [boundary, setBoundary] = useState([]);
  const [metrics, setMetrics] = useState(null);
  
  const handleBoundaryChange = (data) => {
    setBoundary(data.polygon);
    setMetrics(data.metrics);
    
    // Use the data
    console.log('Site area:', data.metrics.area.value, 'm²');
    console.log('Site perimeter:', data.metrics.perimeter.value, 'm');
    console.log('DNA format:', data.dna);
    console.log('GeoJSON:', data.geoJSON);
  };
  
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Site Boundary Editor</h1>
      
      <SiteBoundaryEditor
        initialBoundaryPolygon={boundary}
        siteAddress="1600 Amphitheatre Parkway, Mountain View, CA"
        onBoundaryChange={handleBoundaryChange}
        apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
        center={{ lat: 37.4220, lng: -122.0841 }}
      />
      
      {metrics && (
        <div className="mt-6">
          <h2 className="text-xl font-bold">Current Metrics</h2>
          <p>Area: {metrics.area.formatted}</p>
          <p>Perimeter: {metrics.perimeter.formatted}</p>
          <p>Vertices: {metrics.vertexCount}</p>
          <p>Valid: {metrics.isValid ? 'Yes' : 'No'}</p>
        </div>
      )}
    </div>
  );
}

export default App;
```

That's it! You're ready to use the Site Boundary Editor. 🎉

