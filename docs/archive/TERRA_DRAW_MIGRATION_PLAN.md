# Terra Draw Migration Plan

## Overview
Google Maps Drawing Library is deprecated (August 2025) and will be removed in **May 2026**. This document outlines the migration plan to Terra Draw, Google's recommended replacement.

**Timeline:** Complete migration by **April 2026** (1 month buffer before removal)

**Priority:** Medium (9 months until deadline)

---

## Why Terra Draw?

1. **Official Google Recommendation**: Recommended in [official deprecation notice](https://developers.google.com/maps/deprecations)
2. **Feature Parity**: Provides all drawing functionality we currently use (polygons, rectangles, circles, freehand)
3. **Active Development**: Well-maintained with regular updates
4. **Drop-in Replacement**: Minimal code changes required
5. **Better Performance**: Modern architecture with improved rendering

---

## Current Usage Analysis

### Where We Use Drawing Library

**File:** `src/ArchitectAIEnhanced.js` (line 4477)
```javascript
<Wrapper apiKey={...} libraries={['marker', 'drawing', 'geometry']}>
```

**Component:** `SitePolygonDrawer` component
- **Purpose**: Allows users to draw site boundaries on the map
- **Features Used**:
  - Polygon drawing (primary use case)
  - Drawing manager UI
  - Shape editing and deletion
  - Coordinate extraction

**User Workflow:**
1. User views map in Step 2 (Location Analysis)
2. Clicks "Draw Site Boundary" button
3. Draws polygon around property
4. System calculates area, orientation, setbacks
5. DNA generator uses site geometry for building design

---

## Migration Steps

### Phase 1: Setup (1-2 hours)
**Target Date:** January 2026

1. **Install Dependencies**
   ```bash
   npm install terra-draw terra-draw-google-maps-adapter
   ```

2. **Update Package Configuration**
   - Add to `package.json` dependencies
   - Update documentation with new dependencies

### Phase 2: Code Migration (4-6 hours)
**Target Date:** February 2026

1. **Update Library Loading** (`ArchitectAIEnhanced.js:4477`)
   ```javascript
   // Remove 'drawing' from libraries (still need 'marker', 'geometry')
   <Wrapper apiKey={...} libraries={['marker', 'geometry']}>
   ```

2. **Create Terra Draw Integration** (New file: `src/components/TerraDrawIntegration.jsx`)
   ```javascript
   import {
     TerraDraw,
     TerraDrawSelectMode,
     TerraDrawPolygonMode,
     TerraDrawRectangleMode,
     TerraDrawCircleMode,
     TerraDrawFreehandMode
   } from 'terra-draw';
   import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';

   // Initialize Terra Draw with Google Maps adapter
   const adapter = new TerraDrawGoogleMapsAdapter({ map });
   const draw = new TerraDraw({
     adapter,
     modes: [
       new TerraDrawSelectMode(),
       new TerraDrawPolygonMode(),
       new TerraDrawRectangleMode(),
       new TerraDrawCircleMode(),
       new TerraDrawFreehandMode()
     ]
   });
   draw.start();
   draw.setMode('polygon'); // Default to polygon mode for site boundaries
   ```

3. **Update SitePolygonDrawer Component** (`src/components/SitePolygonDrawer.jsx`)
   - Replace `google.maps.drawing.DrawingManager` with Terra Draw
   - Update event listeners:
     - `overlaycomplete` → Terra Draw's shape completion events
     - `setDrawingMode` → `draw.setMode()`
   - Update coordinate extraction logic for Terra Draw format

4. **Update MapView Component** (`ArchitectAIEnhanced.js:572`)
   - Add Terra Draw initialization after map creation
   - Pass Terra Draw instance to SitePolygonDrawer
   - Ensure proper cleanup on component unmount

### Phase 3: Testing (2-3 hours)
**Target Date:** March 2026

1. **Functional Testing**
   - [ ] Polygon drawing works
   - [ ] Shape editing works
   - [ ] Shape deletion works
   - [ ] Coordinate extraction accurate
   - [ ] Area calculation correct
   - [ ] Site metrics generation intact

2. **Integration Testing**
   - [ ] Site polygon saved to state correctly
   - [ ] DNA generator receives correct site geometry
   - [ ] Building designs respect site boundaries
   - [ ] Export functions include site polygon data

3. **Browser Compatibility**
   - [ ] Chrome (latest)
   - [ ] Firefox (latest)
   - [ ] Safari (latest)
   - [ ] Edge (latest)

### Phase 4: Deployment (1 hour)
**Target Date:** April 2026

1. **Update Production Dependencies**
   - Deploy to Vercel
   - Verify no breaking changes

2. **Monitor for Issues**
   - Check error logs
   - Monitor user feedback
   - Have rollback plan ready

3. **Update Documentation**
   - Update CLAUDE.md with Terra Draw info
   - Update README if needed
   - Add migration notes to CHANGELOG

---

## Code Comparison

### Before (Google Drawing Library)
```javascript
// Initialize drawing manager
const drawingManager = new google.maps.drawing.DrawingManager({
  drawingMode: google.maps.drawing.OverlayType.POLYGON,
  drawingControl: true,
  drawingControlOptions: {
    position: google.maps.ControlPosition.TOP_CENTER,
    drawingModes: ['polygon', 'rectangle', 'circle']
  },
  polygonOptions: {
    fillColor: '#2196F3',
    fillOpacity: 0.3,
    strokeWeight: 2,
    strokeColor: '#1976D2',
    clickable: true,
    editable: true,
    zIndex: 1
  }
});

drawingManager.setMap(map);

// Listen for shape completion
google.maps.event.addListener(drawingManager, 'overlaycomplete', (event) => {
  const polygon = event.overlay;
  const path = polygon.getPath();
  const coordinates = [];
  for (let i = 0; i < path.getLength(); i++) {
    const point = path.getAt(i);
    coordinates.push({ lat: point.lat(), lng: point.lng() });
  }
  onSitePolygonChange(coordinates);
});
```

### After (Terra Draw)
```javascript
// Initialize Terra Draw adapter
const adapter = new TerraDrawGoogleMapsAdapter({ map });

// Configure Terra Draw
const draw = new TerraDraw({
  adapter,
  modes: [
    new TerraDrawSelectMode({
      flags: {
        polygon: { feature: { draggable: true, editable: true } }
      }
    }),
    new TerraDrawPolygonMode({
      styles: {
        fillColor: '#2196F3',
        fillOpacity: 0.3,
        strokeWidth: 2,
        strokeColor: '#1976D2'
      }
    }),
    new TerraDrawRectangleMode(),
    new TerraDrawCircleMode()
  ]
});

draw.start();
draw.setMode('polygon');

// Listen for shape completion
draw.on('finish', (id) => {
  const snapshot = draw.getSnapshot();
  const feature = snapshot.find(f => f.id === id);
  if (feature && feature.geometry.type === 'Polygon') {
    const coordinates = feature.geometry.coordinates[0].map(coord => ({
      lat: coord[1],
      lng: coord[0]
    }));
    onSitePolygonChange(coordinates);
  }
});
```

---

## Key Differences

| Feature | Google Drawing Library | Terra Draw |
|---------|----------------------|------------|
| **API Style** | Google Maps events | Modern event emitters |
| **Coordinate Format** | `{lat, lng}` objects | GeoJSON `[lng, lat]` arrays |
| **Shape Storage** | Google Maps overlays | GeoJSON features |
| **Editing** | Built-in with overlays | Separate SelectMode |
| **Styling** | Options object | CSS-like styles object |
| **Performance** | Good | Better (optimized rendering) |

---

## Risks & Mitigation

### Risk 1: Breaking Changes
**Probability:** Low
**Impact:** High
**Mitigation:**
- Thorough testing in development
- Staged rollout (preview environment first)
- Keep old code in feature branch for quick rollback

### Risk 2: User Experience Degradation
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- Maintain same UI/UX as much as possible
- Get user feedback early (beta testing)
- Document any workflow changes

### Risk 3: Coordinate Conversion Errors
**Probability:** Medium
**Impact:** High
**Mitigation:**
- Write conversion utility functions with unit tests
- Validate coordinate accuracy with known test cases
- Add error handling and validation

### Risk 4: Delayed Migration
**Probability:** Medium
**Impact:** Critical (feature breaks in May 2026)
**Mitigation:**
- Set calendar reminders for January 2026
- Add GitHub issue with April 2026 deadline
- Block 1 day in February 2026 for migration work

---

## Testing Checklist

### Unit Tests
- [ ] Coordinate conversion (Google → GeoJSON)
- [ ] Area calculation from GeoJSON
- [ ] Site metrics generation
- [ ] Polygon validation

### Integration Tests
- [ ] Full site boundary drawing workflow
- [ ] Site data passed to DNA generator
- [ ] Building designs respect boundaries
- [ ] Export includes site polygon

### Manual Testing
- [ ] Draw simple rectangle
- [ ] Draw complex polygon (10+ points)
- [ ] Edit existing polygon
- [ ] Delete polygon
- [ ] Multiple polygons (ensure only one active)
- [ ] Zoom in/out during drawing
- [ ] Pan map during drawing

---

## Resources

### Documentation
- [Terra Draw Official Docs](https://github.com/JamesLMilner/terra-draw)
- [Google Maps Adapter Docs](https://www.npmjs.com/package/terra-draw-google-maps-adapter)
- [Google Deprecation Notice](https://developers.google.com/maps/deprecations)
- [Official Google Sample](https://developers.google.com/maps/documentation/javascript/examples/terra-draw-integration)

### Community
- [Terra Draw GitHub](https://github.com/JamesLMilner/terra-draw)
- [Stack Overflow Tag](https://stackoverflow.com/questions/tagged/terra-draw)

---

## Timeline Summary

| Phase | Duration | Target Date | Status |
|-------|----------|-------------|--------|
| Phase 1: Setup | 1-2 hours | January 2026 | Not Started |
| Phase 2: Code Migration | 4-6 hours | February 2026 | Not Started |
| Phase 3: Testing | 2-3 hours | March 2026 | Not Started |
| Phase 4: Deployment | 1 hour | April 2026 | Not Started |
| **TOTAL** | **8-12 hours** | **April 2026** | **Not Started** |
| **Deadline** | - | **May 2026** | - |

---

## Next Steps

1. **Set Calendar Reminder**: January 15, 2026 - "Start Terra Draw Migration"
2. **Create GitHub Issue**: "Migrate from Google Drawing Library to Terra Draw (#deadline: April 2026)"
3. **Block Time**: Reserve 1 day in February 2026 for migration work
4. **Bookmark Resources**: Save Terra Draw docs and samples

---

## Notes

- This is a **mandatory** migration - Google will remove the Drawing Library in May 2026
- Terra Draw is actively maintained and has good community support
- Migration is straightforward with minimal breaking changes expected
- Total effort: ~1 day of development work
- Consider migrating sooner if time permits (removes deprecation warnings)

---

**Last Updated:** 2025-10-28
**Status:** Planning Phase
**Next Review:** January 2026
