# Site Boundary Detection Feature

## Overview

The architect-ai-platform now automatically detects and analyzes the actual **site boundary polygon** and **surface area** for any address entered by the user. This provides accurate geospatial context for AI-driven architectural design generation.

## How It Works

### 1. Multi-Source Boundary Detection

When you enter an address, the system automatically tries to detect the property boundary using **three data sources** in priority order:

#### Priority 1: OpenStreetMap (OSM) / Overpass API ⭐ **Most Accurate**
- Queries OSM database for building footprints and land parcels near the coordinates
- Returns actual property boundary polygons from community-mapped data
- Provides real-world accuracy for most urban and suburban locations worldwide
- **Free and open-source**

#### Priority 2: Google Places API
- Uses Google's Place Details API to get property viewport bounds
- Converts bounding box (northeast/southwest corners) to polygon
- Good fallback when OSM data is unavailable
- Requires Google Maps API key

#### Priority 3: Estimated Dimensions
- Falls back to intelligent estimation based on:
  - Plot type (urban/suburban/rural)
  - Zoning regulations
  - Neighborhood characteristics
- Provides reasonable defaults when no boundary data is available

### 2. Surface Area Calculation

The system computes the actual surface area using the **Shoelace formula** for polygon area calculation:

- Converts lat/lng coordinates to Cartesian (meters) using local tangent plane projection
- Applies Haversine-based distance calculation accounting for Earth's curvature
- Returns area in **square meters (m²)**
- Accurate for small to medium-sized plots (residential to commercial)

### 3. Data Structure

The detected site boundary is stored in `locationData.siteAnalysis`:

```javascript
{
  siteBoundary: [
    { lat: 52.489500, lng: -1.898000 },  // Array of polygon vertices
    { lat: 52.489520, lng: -1.897980 },
    { lat: 52.489540, lng: -1.898020 },
    { lat: 52.489500, lng: -1.898000 }   // Closed polygon
  ],
  surfaceArea: 450,                      // Area in m²
  surfaceAreaUnit: "m²",
  boundarySource: "OpenStreetMap",       // Data source used
  plotType: "suburban_residential",
  plotShape: "rectangular",              // Detected from polygon sides
  plotDimensions: {
    width: 15,                           // meters
    depth: 30                            // meters
  },
  buildableArea: {
    width: 12,                           // After setbacks
    depth: 21,
    area: 252                            // Buildable m²
  }
}
```

## Integration with AI Design Generation

### Site-Aware Design Context

The site boundary data is automatically passed to the AI reasoning pipeline:

```javascript
// In AI generation context
projectContext: {
  location: {
    address: "123 Main St, Birmingham, UK",
    coordinates: { lat, lng },
    climate: { ... },
    siteAnalysis: {
      surfaceArea: 450,                // 🆕 Actual plot size
      siteBoundary: [...],             // 🆕 Polygon coordinates
      plotShape: "rectangular",        // 🆕 Shape analysis
      buildableArea: 252               // 🆕 After setbacks
    }
  }
}
```

### AI Reasoning Enhancement

The AI models (Meta Llama 3.1 70B) now receive site-specific constraints:

**Before (estimated):**
> "Design a 3-bedroom house on a typical suburban lot"

**After (site-aware):**
> "Design a 3-bedroom house on a **450m² rectangular plot** (15m × 30m) with **252m² buildable area** after 6m front setback and 1.5m side setbacks"

This enables:
- ✅ **Proportional design** that fits the actual site
- ✅ **Setback compliance** based on real dimensions
- ✅ **Orientation optimization** using actual plot shape
- ✅ **Buildability validation** against available space

## Visualization

### SitePolygonDrawer Component

The detected boundary can be visualized on Google Maps:

```jsx
<SitePolygonDrawer
  map={googleMapInstance}
  existingPolygon={locationData?.siteAnalysis?.siteBoundary}
  onPolygonComplete={(updatedCoords) => {
    // User can edit the detected boundary
    setSitePolygon(updatedCoords);
  }}
/>
```

Features:
- **Auto-display** detected boundary polygon
- **Editable vertices** - user can refine the boundary
- **Visual feedback** - blue fill with semi-transparency
- **Real-time area updates** when edited

## API Requirements

### Required API Keys

1. **Google Maps API Key** (already required)
   - Used for: Geocoding + Place Details
   - Set in `.env`: `REACT_APP_GOOGLE_MAPS_API_KEY`

2. **OpenStreetMap Overpass API** (FREE, no key required)
   - Public API: `https://overpass-api.de/api/interpreter`
   - No authentication needed
   - Rate limit: Fair use (reasonable request frequency)

### No Additional Cost

- OSM/Overpass API is **completely free**
- Google Places API calls are minimal (1 per address analysis)
- Site boundary detection adds **$0.00 - $0.002** per generation

## Technical Architecture

### Service: `siteAnalysisService.js`

Located in: `src/services/siteAnalysisService.js`

**Main Methods:**

```javascript
// Primary method
siteAnalysisService.analyzeSiteContext(address, coordinates)

// Returns:
{
  success: true,
  siteAnalysis: {
    siteBoundary: [...],      // Polygon coordinates
    surfaceArea: 450,         // m²
    surfaceAreaUnit: "m²",
    boundarySource: "OpenStreetMap" | "Google Places" | "estimated",
    plotType: "suburban_residential",
    plotShape: "rectangular" | "L-shaped" | "irregular",
    // ... other site analysis data
  }
}
```

**Helper Methods:**

- `getPropertyBoundary()` - Orchestrates multi-source detection
- `getOSMPropertyBoundary()` - Queries Overpass API
- `getPlaceGeometry()` - Queries Google Places API
- `computePolygonArea()` - Shoelace formula calculation
- `detectPolygonShape()` - Analyzes polygon geometry
- `calculatePolygonDimensions()` - Bounding box calculation

### Integration Flow

```
User enters address
    ↓
Google Geocoding API → Get coordinates
    ↓
siteAnalysisService.analyzeSiteContext()
    ↓
┌─────────────────────────────────────┐
│ Try OSM Overpass API                │
│   ✅ Success → Use OSM polygon      │
│   ❌ Fail → Try Google Places       │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Try Google Places API               │
│   ✅ Success → Use viewport polygon │
│   ❌ Fail → Use estimation          │
└─────────────────────────────────────┘
    ↓
Compute polygon area (Shoelace formula)
    ↓
Store in locationData.siteAnalysis
    ↓
Pass to AI reasoning pipeline
    ↓
Generate site-aware designs
```

## Testing

### Test with Real Addresses

Try entering these addresses to see different boundary detection scenarios:

**Urban (OSM data available):**
- "1600 Amphitheatre Parkway, Mountain View, CA" (Google HQ)
- "221B Baker Street, London, UK" (Sherlock Holmes)
- "350 Fifth Avenue, New York, NY 10118" (Empire State Building)

**Suburban (Google Places fallback):**
- "123 Elm Street, Springfield, IL"
- Any residential address in your area

**Rural (Estimation fallback):**
- Rural farm addresses with sparse OSM data

### Console Output

Check browser console for detailed logs:

```
🗺️  Analyzing site boundary and surface area...
🔍 Fetching property boundary polygon...
✅ Property boundary from OpenStreetMap
📐 Using actual plot dimensions: 15m × 30m (450m²)
✅ Site analysis complete: {...}
```

## Troubleshooting

### No Boundary Detected

**Symptoms:**
- Console shows: "⚠️ No property boundary found, using estimation"
- `boundarySource: "estimated"` in site analysis

**Causes:**
1. Address in remote/rural area with no OSM data
2. Google Places API not returning viewport bounds
3. API rate limits exceeded

**Solution:**
- The system gracefully falls back to intelligent estimation
- No action needed - estimation still provides useful constraints
- For critical projects, user can manually draw boundary using SitePolygonDrawer

### OSM Timeout

**Symptoms:**
- Console error: "OSM boundary fetch error"
- Slow location analysis (>10 seconds)

**Causes:**
- Overpass API is experiencing high load
- Network connectivity issues

**Solution:**
- System automatically falls back to Google Places
- If persistent, check: https://overpass-api.de/api/status

### Incorrect Boundary

**Symptoms:**
- Polygon doesn't match actual property
- Area calculation seems wrong

**Causes:**
- OSM data is outdated or inaccurate
- Multiple buildings/parcels at same coordinates
- Property boundary not yet mapped in OSM

**Solution:**
- User can manually edit polygon using SitePolygonDrawer
- Updated coordinates will be used for AI generation
- Consider contributing correct data to OpenStreetMap

## Future Enhancements

Planned improvements:

- [ ] **Cadastral API Integration** - Official property parcel boundaries
- [ ] **3D Terrain Analysis** - Elevation, slope, contours
- [ ] **Solar Analysis** - Shadow patterns based on site geometry
- [ ] **Neighboring Buildings** - Context awareness of surroundings
- [ ] **Automatic Plot Subdivision** - For multi-unit developments
- [ ] **Historical Boundary Changes** - Track property modifications

## Summary

The Site Boundary Detection feature provides:

✅ **Automatic Detection** - No user input required
✅ **Multi-Source Redundancy** - OSM → Google → Estimation
✅ **Accurate Calculations** - Real polygon area in m²
✅ **AI Integration** - Site-aware design generation
✅ **Visual Feedback** - Interactive map polygon
✅ **Free to Use** - Minimal API costs
✅ **Global Coverage** - Works worldwide

This enhancement makes the architect-ai-platform truly **site-aware**, generating designs that are:
- **Proportionally correct** for the actual plot size
- **Regulation-compliant** with real setbacks
- **Context-sensitive** to the site geometry

---

**Implementation Date:** October 27, 2025
**Service:** `src/services/siteAnalysisService.js`
**Component:** `src/components/SitePolygonDrawer.jsx`
**Integration:** `src/ArchitectAIEnhanced.js` (line 1165-1183)
