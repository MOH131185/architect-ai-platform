# Site-Aware Design System - User Guide

## Overview

The ArchitectAI Platform now features a comprehensive site-aware design system that automatically detects project location, analyzes climate and architectural context, and generates designs that fit your actual site boundaries.

## New Features

### 1. Site Polygon Drawing

**Location**: Step 2 - Location Intelligence

**How to Use**:
1. After entering your address and viewing the location analysis, you'll see a 3D map view
2. Click the polygon drawing tool in the map controls (top center)
3. Click points on the map to draw your site boundary
4. Close the polygon by clicking the first point again
5. The system automatically calculates:
   - Site area (m²)
   - Primary orientation (degrees from North)
   - Optimal building envelope with setbacks

**Benefits**:
- Ensures designs fit within your actual site
- Optimizes building orientation for sun path
- Respects local setback requirements (3m default)
- Generates accurate floor plans that match your site shape

### 2. Vector Floor Plan Generation

**Automatic Generation**: When you draw a site polygon and click "Generate AI Designs", the system automatically:

1. **Analyzes Site Constraints**:
   - Computes usable building area (60% site coverage)
   - Applies 3m setbacks on all sides
   - Determines optimal building orientation

2. **Generates Structured Floor Plans**:
   - Ground floor with entrance, living spaces, kitchen
   - Upper floors with bedrooms and bathrooms
   - Central corridor layout for efficient circulation
   - Room dimensions that fit within site boundaries

3. **Creates Vector Layers**:
   - Walls (exterior and interior)
   - Doors with swing arcs
   - Windows on exterior walls
   - Room labels with areas
   - Dimension lines

### 3. Enhanced AI Generation

The AI now receives comprehensive context:

**Location Context**:
- Address and coordinates
- Climate type and seasonal data
- Sun path and optimal orientation
- Local architectural styles
- Available local materials

**Site Context**:
- User-drawn site boundary
- Site area and orientation
- Building envelope after setbacks
- Maximum footprint (60% coverage)

**Design DNA Enhancement**:
- All 13 architectural views (floor plans, elevations, sections, 3D views) are generated with perfect consistency
- Floor plans match the site dimensions
- Elevations show correct floor count and façade rhythm
- Sections reflect actual floor heights and roof pitch

### 4. Professional Export Formats

**New Vector Exports**:

#### SVG Export
- **Format**: Scalable Vector Graphics
- **Scale**: 1:100 (1m = 1cm on paper)
- **Layers**: Walls, Doors, Windows, Labels, Dimensions
- **Features**: North arrow, scale bar, title block
- **Use Case**: Web viewing, presentations, further editing in vector software

#### DXF Export
- **Format**: AutoCAD Drawing Exchange Format
- **Compatibility**: AutoCAD, DraftSight, LibreCAD, and all major CAD software
- **Layers**: WALLS, DOORS, WINDOWS, LABELS, DIMENSIONS, ANNOTATIONS
- **Entities**: Lines, arcs, polylines, text with proper layer organization
- **Use Case**: Professional CAD workflows, construction documentation

**Existing Exports** (Enhanced):
- **DWG**: AutoCAD 2D drawings
- **RVT**: Revit 3D BIM models
- **IFC**: Industry standard BIM exchange (ISO-10303-21)
- **PDF**: Complete documentation set

## Workflow

### Complete Site-Aware Design Process

1. **Enter Location** (Step 1)
   - Type address or use "Detect My Location"
   - System analyzes climate, zoning, and architectural context

2. **Draw Site Boundary** (Step 2)
   - View location intelligence report
   - Use polygon tool to draw your site
   - Review site metrics (area, orientation)

3. **Upload Portfolio** (Step 3) - Optional
   - Upload your architectural portfolio
   - AI learns your design style

4. **Specify Program** (Step 4)
   - Enter building program (e.g., "residential house")
   - Specify total area
   - Add any special requirements

5. **Generate Designs** (Step 4)
   - Click "Generate AI Designs"
   - System generates:
     - Vector floor plans (ground + upper floors)
     - 13 unique architectural views
     - Technical drawings (elevations, sections)
     - 3D visualizations
   - All outputs are consistent and site-aware

6. **Export** (Step 5)
   - Download vector plans (SVG/DXF)
   - Export BIM models (DWG/RVT/IFC)
   - Generate documentation (PDF)

## Technical Details

### Site Metrics Calculation

**Area Computation**:
- Uses Shoelace formula for polygon area
- Converts lat/lng to meters using Haversine approximation
- Accurate for sites up to ~1km²

**Orientation Analysis**:
- Principal Component Analysis (PCA) on polygon vertices
- Returns primary axis orientation (0-360°, where 0° is North)
- Used to optimize building orientation for sun path

**Setback Polygon**:
- Insets boundary by 3m (configurable)
- Moves each vertex toward centroid
- Ensures building envelope respects setbacks

### Vector Plan Generation Algorithm

**Layout Strategy**:
1. Compute bounding box of setback polygon
2. Create central corridor along longest axis
3. Divide remaining space into rooms
4. Place rooms on both sides of corridor
5. Add doors connecting rooms to corridor
6. Place windows on exterior walls (3m spacing)
7. Generate dimension lines and labels

**Room Sizing**:
- Minimum room width: 3m
- Corridor width: 2m
- Wall thickness: 0.2m (exterior), 0.15m (interior)
- Floor height: 3.5m (ground), 3.0m (upper)

### AI Integration

**DNA Enhancement**:
```javascript
masterDNA.siteContext = `
  Site Area: ${siteMetrics.areaM2}m²
  Site Orientation: ${siteMetrics.orientationDeg}° from North
  Building Envelope: Must fit within site with 3m setbacks
  Max Footprint: ${siteMetrics.areaM2 * 0.6}m²
`;
```

**Prompt Injection**:
- Site constraints added to all 13 view prompts
- Floor plans enforce site dimensions
- Elevations show correct floor count
- Sections reflect actual heights

## Best Practices

### Drawing Site Polygons

1. **Zoom In**: Use zoom level 19-20 for accuracy
2. **Start at Corner**: Begin at a clear corner of your site
3. **Follow Boundaries**: Click along property lines
4. **Close Polygon**: Click the first point to complete
5. **Edit if Needed**: Drag vertices to adjust

### Optimal Site Coverage

- **Residential**: 40-60% site coverage
- **Commercial**: 60-80% site coverage
- **Industrial**: 70-90% site coverage

The system defaults to 60% coverage with 3m setbacks.

### Export Recommendations

**For Presentations**:
- Use SVG (scales perfectly, web-friendly)
- Use PDF (complete documentation)

**For CAD Work**:
- Use DXF (universal CAD compatibility)
- Use DWG (AutoCAD native)

**For BIM**:
- Use IFC (industry standard)
- Use RVT (Revit native)

## Troubleshooting

### Site Polygon Not Appearing

**Issue**: Drew polygon but no metrics shown
**Solution**: 
- Ensure you closed the polygon (click first point)
- Check that polygon has at least 3 vertices
- Refresh page and try again

### Vector Plans Not Available

**Issue**: SVG/DXF export buttons disabled
**Solution**:
- Draw a site polygon first (Step 2)
- Generate AI designs (Step 4)
- Vector plans are created automatically

### Dimensions Don't Match Site

**Issue**: Generated building larger than site
**Solution**:
- Redraw site polygon more accurately
- Check that you're using the correct map zoom level
- System applies 3m setbacks automatically

## API Reference

### Geometry Utilities

```javascript
import { 
  computePolygonArea,
  computeCentroid,
  computeOrientation,
  computeSetbackPolygon,
  computeSiteMetrics
} from './utils/geometry';

// Compute all site metrics at once
const metrics = computeSiteMetrics(polygon);
// Returns: { areaM2, orientationDeg, centroid, bounds, setbackPolygon }
```

### Vector Plan Generator

```javascript
import { generateVectorFloorPlans } from './services/vectorPlanGenerator';

const vectorPlan = generateVectorFloorPlans({
  sitePolygon,
  setbackPolygon: siteMetrics.setbackPolygon,
  program: 'residential house',
  floors: 2,
  siteMetrics
});
```

### Export Functions

```javascript
import { exportToSVG } from './utils/svgExporter';
import { exportToDXF } from './utils/dxfWriter';

// Export to SVG
const svgContent = exportToSVG(vectorPlan, {
  projectName: 'My House',
  address: '123 Main St'
});

// Export to DXF
const dxfContent = exportToDXF(vectorPlan, {
  projectName: 'My House',
  address: '123 Main St'
});
```

## Future Enhancements

Planned features for future releases:

1. **Advanced Site Analysis**:
   - Topography integration
   - Existing trees and features
   - Utility locations

2. **Custom Setbacks**:
   - Different setbacks per side
   - Zoning-specific requirements
   - Height plane analysis

3. **3D Site Model**:
   - Terrain elevation
   - Shadow analysis
   - View corridors

4. **Enhanced Exports**:
   - 3D DWG/DXF (not just 2D)
   - Parametric Revit families
   - SketchUp models

## Support

For issues or questions:
- GitHub Issues: [architect-ai-platform/issues](https://github.com/yourusername/architect-ai-platform/issues)
- Documentation: See `README.md` and `MVP_README.md`
- API Docs: See `API_SETUP.md`

## License

This feature is part of the ArchitectAI Platform and follows the same license as the main project.

