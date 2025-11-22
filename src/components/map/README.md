# Map Components

Google Maps-powered site boundary editor components for ArchitectAI platform.

## Components

### SiteBoundaryEditor.jsx
Main React component with full UI and interaction logic.

**Features:**
- Interactive map with Google Maps
- Drag handles for vertices
- Manual editing table
- Auto-boundary detection
- Drawing mode
- Metrics display
- Validation
- Export capabilities

**Usage:**
```jsx
import { SiteBoundaryEditor } from '../site';

<SiteBoundaryEditor
  initialBoundaryPolygon={[]}
  siteAddress="123 Main St"
  onBoundaryChange={(data) => {}}
  apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
  center={{ lat: 37.7749, lng: -122.4194 }}
/>
```

## Hooks

### useGoogleMap.js
React hook for Google Maps initialization and management.

**Returns:**
- `map` - Google Maps instance
- `google` - Google Maps API object
- `isLoaded` - Loading state
- `panTo`, `setZoom`, `fitBounds` - Map controls
- `geocodeAddress`, `reverseGeocode` - Geocoding
- `createMarker`, `createPolygon` - Object creation

### usePolygonTools.js
React hook for polygon manipulation and calculations.

**Returns:**
- `polygon` - Current polygon state
- `metrics` - Computed metrics
- `setPolygon`, `addVertex`, `removeVertex`, `updateVertex` - Mutations
- `adjustLength`, `adjustAngle` - Manual adjustments
- `undo`, `redo` - History management
- `exportGeoJSON`, `convertToDNA` - Export utilities

## Utilities

### polygonEditor.js
PolygonEditor class for interactive editing.

**Features:**
- Vertex marker management
- Midpoint markers
- Drag event handling
- Shift+Click to add
- Right-click to remove

**Usage:**
```javascript
import { createPolygonEditor } from './polygonEditor';

const editor = createPolygonEditor(map, google, polygon, {
  onPolygonUpdate: (newPolygon) => {},
  enableMidpoints: true,
  enableShiftClickAdd: true,
  enableRightClickRemove: true
});

editor.enable();
```

### mapUtils.js
Map operation utilities.

**Functions:**
- `fetchAutoBoundary(address, center)` - Auto-detect boundary
- `calculateBounds(polygon)` - Calculate map bounds
- `findNearestPointOnPolygon(point, polygon)` - Nearest point
- `isPointInPolygon(point, polygon)` - Point-in-polygon test
- `generateMapSnapshotURL(polygon, apiKey)` - Static map URL
- `createVertexMarkerOptions()` - Marker styling
- `createPolygonStyleOptions()` - Polygon styling
- `formatCoordinate()`, `parseCoordinate()` - Coordinate formatting

### GeometryMath.js
Geometric calculations using Haversine formula.

**Functions:**
- `getDistance(point1, point2)` - Geodesic distance
- `getBearing(point1, point2)` - Bearing calculation
- `movePointByDistanceAndBearing()` - Point movement
- `getPolygonArea(polygon)` - Area (spherical excess)
- `getPolygonPerimeter(polygon)` - Perimeter
- `getSegmentLengths(polygon)` - Edge lengths
- `getSegmentAngles(polygon)` - Interior angles
- `adjustSegmentLength()` - Adjust edge length
- `adjustVertexAngle()` - Adjust vertex angle
- `isPolygonSelfIntersecting()` - Validation
- `polygonToGeoJSON()`, `geoJSONToPolygon()` - Format conversion
- `simplifyPolygon()` - Douglas-Peucker simplification

## Architecture

```
SiteBoundaryEditor (React Component)
├── useGoogleMap (Map initialization)
│   └── @googlemaps/js-api-loader
├── usePolygonTools (State management)
│   └── GeometryMath (Calculations)
├── PolygonEditor (Interactions)
│   └── mapUtils (Utilities)
└── UI Components (Tailwind + Framer Motion)
```

## Data Flow

```
User Interaction
    ↓
PolygonEditor (Event handlers)
    ↓
usePolygonTools (State update)
    ↓
GeometryMath (Calculations)
    ↓
SiteBoundaryEditor (UI update)
    ↓
onBoundaryChange (Parent callback)
    ↓
Wizard State (Persistence)
```

## Coordinate System

- **Format**: `{ lat: number, lng: number }`
- **Precision**: 6 decimal places (~0.1m)
- **Range**: lat: -90 to 90, lng: -180 to 180
- **Calculations**: Geodesic (accounts for Earth's curvature)

## Performance

- **Debounce**: 300ms for metric calculations
- **Throttle**: 100ms for map updates
- **History**: Unlimited undo/redo
- **Memory**: Efficient marker management
- **Cleanup**: Proper event listener removal

## Testing

Run tests:
```bash
npm test -- src/components/map
```

Manual testing checklist in `docs/SITE_BOUNDARY_EDITOR_INTEGRATION.md`

## Documentation

- **Integration Guide**: `docs/SITE_BOUNDARY_EDITOR_INTEGRATION.md`
- **Quick Start**: `docs/SITE_BOUNDARY_EDITOR_QUICKSTART.md`
- **Summary**: `SITE_BOUNDARY_EDITOR_COMPLETE.md`

## Dependencies

- `@googlemaps/js-api-loader` (^1.16.2)
- `react` (^18.0.0)
- `framer-motion` (^10.0.0)

## Environment

Required in `.env`:
```bash
REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Support

For issues or questions:
1. Check documentation
2. Review component source
3. Check browser console
4. Verify API key setup

## License

Part of ArchitectAI platform. All rights reserved.

