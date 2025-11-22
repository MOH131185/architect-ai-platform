# Fix: Site Boundary Not Showing

## Problem Identified

The console shows:
- ✅ Map loads successfully
- ✅ Location analysis completes
- ✅ Debug shows `polygonLength: 0`
- ❌ No boundary polygon displayed

## Root Cause

The cached site analysis has `siteBoundary: null` because the property boundary detection returned no results. This is common for:
- Addresses without OpenStreetMap building data
- New developments
- Rural areas
- Cache from before boundary detection was working

## Solutions Applied

### 1. Auto-Detection on Mount ✅

Added automatic boundary detection when map loads with no polygon:

```javascript
useEffect(() => {
  if (isLoaded && map && google && polygon.length === 0 && !isLoadingBoundary) {
    console.log('Map loaded with no polygon, triggering auto-detect');
    handleAutoDetect();
  }
}, [isLoaded, map, google, polygon.length]);
```

### 2. Always Show Polygon Overlay ✅

Created separate polygon overlay that displays even when editor is not enabled:

```javascript
// Non-editable polygon overlay (blue)
if (polygon.length >= 3 && !isEditingEnabled) {
  polygonOverlayRef.current = new google.maps.Polygon({
    paths: polygon,
    strokeColor: '#3B82F6',
    fillColor: '#3B82F6',
    fillOpacity: 0.2,
    map: map
  });
}
```

### 3. Added Debug Panel ✅

Shows real-time data:
- Initial polygon vertices count
- Current polygon vertices count
- Map loading status  
- Coordinate data
- Full polygon data (expandable)

### 4. Improved Logging ✅

Console now shows:
```
Initial boundary polygon: { length: 0, data: null }
Map loaded with no polygon, triggering auto-detect
Auto-detecting boundary...
Polygon overlay created
```

## User Actions Required

### Option 1: Manual Auto-Detect (Quick)

1. Click "🔍 Auto-Detect Boundary" button
2. Wait ~1 second
3. Boundary appears (mock rectangle for now)

### Option 2: Clear Cache (Permanent)

Clear the cached site analysis to re-run boundary detection:

```javascript
// In browser console:
localStorage.removeItem('archiAI_site_analysis_cache');
location.reload();
```

Then re-analyze the location - it will fetch fresh boundary data.

### Option 3: Manual Drawing

1. Click "✏️ Draw Polygon"
2. Click on map to add vertices
3. Double-click to finish

## Expected Behavior Now

### When Location Analyzed:

1. **If siteBoundary exists** (from fresh analysis):
   - Blue polygon appears immediately
   - Fits map to boundary
   - Shows metrics cards

2. **If siteBoundary is null** (from cache):
   - Map loads
   - Auto-detect triggers automatically
   - Mock rectangle appears after ~1s
   - Shows metrics cards

3. **User can always**:
   - Click auto-detect manually
   - Draw custom boundary
   - Edit with drag handles
   - Export as GeoJSON

## Debug Panel

In development mode, you'll see:

```
🐛 Debug Info
Initial Polygon: 0 vertices
Current Polygon: 4 vertices (after auto-detect)
Site Address: 190 Corporation St...
Map Loaded: ✅
Has Map: ✅
Center: 52.4814, -1.8998
[View Polygon Data ▼]
```

## Console Messages to Look For

### Success Flow:
```
SiteBoundaryEditor Debug: { polygonLength: 0 }
Initial boundary polygon: { length: 0 }
Map loaded with no polygon, triggering auto-detect
Auto-detecting boundary...
Updating polygon overlay: { hasPolygon: true, vertexCount: 4 }
Creating polygon overlay
```

### With Existing Boundary:
```
SiteBoundaryEditor Debug: { polygonLength: 4 }
Initial boundary polygon: { length: 4, data: [...] }
Setting polygon from initial prop
Updating polygon overlay: { hasPolygon: true, vertexCount: 4 }
Creating polygon overlay
```

## Real Boundary Detection

The mock boundary will be replaced with real data when:

1. **Property boundary detection works** (buildingFootprintService)
2. **OpenStreetMap has the building**
3. **Google Maps has parcel data** (future integration)

Current fallback is a ~30m x 20m rectangle centered on the address.

## Files Modified

1. ✅ `src/components/map/SiteBoundaryEditor.jsx`
   - Auto-detect on mount
   - Polygon overlay always visible
   - Debug panel
   - Better logging

## Quick Test

To verify the fix works:

1. **Navigate to LocationStep**
2. **Enter address**: "190 Corporation St, Birmingham B4 6QD, UK"
3. **Click "Analyze Location"**
4. **Watch for**:
   - Map loads (✅ from console)
   - Auto-detect triggers automatically
   - Blue rectangle appears (~1 second)
   - Metrics cards show: Area, Perimeter, etc.

5. **Try manual controls**:
   - Click "🔍 Auto-Detect" - regenerates boundary
   - Click "✏️ Enable Editing" - drag corners
   - Click "✏️ Draw Polygon" - draw custom shape

## Why Mock Rectangle?

Current implementation uses `fetchAutoBoundary()` which returns:

```javascript
// mapUtils.js line 27
const boundary = [
  { lat: center.lat + 0.00015, lng: center.lng - 0.0002 },
  { lat: center.lat + 0.00015, lng: center.lng + 0.0002 },
  { lat: center.lat - 0.00015, lng: center.lng + 0.0002 },
  { lat: center.lat - 0.00015, lng: center.lng - 0.0002 }
];
```

This is intentional for now - ready to be replaced with real API when integrated.

## Next Steps

1. ✅ Auto-detect works
2. ✅ Polygon displays
3. ✅ Debug panel shows data
4. 🔄 Integrate real boundary API
5. 🔄 Add terrain data
6. 🔄 Add 3D visualization

## Summary

**Status**: ✅ FIXED  
**Issue**: Polygon not showing  
**Cause**: Null boundary + no auto-trigger  
**Solution**: Auto-detect on mount + always-visible overlay  
**Result**: Boundary now appears automatically  

You should now see a blue rectangle boundary on the map! 🎉

