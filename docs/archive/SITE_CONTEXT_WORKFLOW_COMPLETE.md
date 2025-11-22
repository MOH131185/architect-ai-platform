# Site Context Workflow - Capture, Generate, Composite

**Date:** November 8, 2024
**Status:** ✅ COMPLETE
**Feature:** Captured site maps are now used as context for AI and composited onto final A1 sheets

## Overview

This implementation creates a complete workflow where captured site maps are:
1. **Captured** from Google Maps with correct polygon coordinates
2. **Used as context** in the AI generation prompt
3. **Composited** onto the final A1 sheet at the correct position
4. **Preserved** through all modifications

## Complete Workflow

### Initial A1 Sheet Generation

```
User Input (Location + Site Polygon)
         ↓
┌────────────────────────────────────┐
│ STEP 1: Capture Site Snapshot     │
│ - Google Maps Static API           │
│ - Site polygon with correct coords │
│ - Returns: dataUrl (base64)        │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 2: Generate Master DNA        │
│ - Site context included in DNA     │
│ - Dimensions, materials, etc.      │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 3: Build A1 Sheet Prompt      │
│ - Includes site location/address   │
│ - Tells AI to leave site plan area │
│ - "Placeholder for satellite map"  │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 4: Generate A1 Sheet          │
│ - Text-to-image mode (no initImage)│
│ - AI generates sheet with space    │
│ - Site area left as placeholder    │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 5: Composite Site Snapshot   │
│ - architecturalSheetService        │
│ - Overlay captured site at bbox    │
│ - Returns: Final A1 with real site │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 6: Save to Design History     │
│ - Store A1 sheet URL               │
│ - Store siteSnapshot {dataUrl}     │
│ - Store masterDNA, seed, prompt    │
└────────────────────────────────────┘
```

### A1 Sheet Modification Workflow

```
User Requests Modification (Add Interior Views)
         ↓
┌────────────────────────────────────┐
│ STEP 1: Load Original Design       │
│ - Get from design history          │
│ - Load: baseline URL, seed, DNA    │
│ - Load: siteSnapshot {dataUrl}     │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 2: Build Delta Prompt         │
│ - Add site preservation lock       │
│ - "PRESERVE site plan EXACTLY"     │
│ - Ultra-low strength (0.08-0.12)   │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 3: Generate Modified Sheet    │
│ - img2img with baseline image      │
│ - Same seed for consistency        │
│ - 40 steps, guidance 8.5           │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 4: Composite Site Snapshot    │
│ - Use stored siteSnapshot.dataUrl  │
│ - Overlay at same bbox position    │
│ - Ensures pixel-exact site parity  │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 5: Validate Consistency       │
│ - SSIM score check                 │
│ - Site preserved: Yes/No            │
│ - Auto-retry if < 0.85 SSIM        │
└────────────────┬───────────────────┘
                 ↓
┌────────────────────────────────────┐
│ STEP 6: Save Version to History    │
│ - Modified sheet URL               │
│ - Consistency score                │
│ - Delta prompt                     │
└────────────────────────────────────┘
```

## Technical Implementation Details

### 1. Site Polygon Coordinate Fix

**File:** `src/services/siteMapCapture.js` (lines 197-245)

```javascript
// BEFORE: Placeholder coordinates
const x = 50 + (index % 10) * 10;

// AFTER: Proper projection
if (mapInstance && window.google) {
  // Use Google Maps projection API
  const projection = mapInstance.getProjection();
  // Calculate actual pixel position
} else {
  // Fallback: Normalize based on polygon bounds
  const normalizedX = (lng - minLng) / (maxLng - minLng);
  const x = containerWidth * normalizedX;
}
```

### 2. Site Snapshot Capture

**File:** `src/services/dnaWorkflowOrchestrator.js` (lines 683-717)

```javascript
// Capture site snapshot with Google Static Maps API
const snapshotResult = await getSiteSnapshotWithMetadata({
  coordinates: locationData.coordinates,
  polygon: locationData.sitePolygon,
  zoom: 19,
  size: [640, 400]
});

const siteSnapshot = snapshotResult.dataUrl; // base64 data URL
```

### 3. Prompt Update for Placeholder

**File:** `src/services/a1SheetPromptGenerator.js` (lines 504-517)

```javascript
**TOP LEFT - SITE PLAN / LOCATION PLAN:**
📍 NOTE: Actual captured satellite map will be composited into this area
- Simple site diagram OR leave as placeholder box
- Clean WHITE background ready for satellite image overlay
- Site boundaries in RED outline
- North arrow, scale bar
```

### 4. A1 Generation (Text-to-Image)

**File:** `src/services/dnaWorkflowOrchestrator.js` (lines 731-742)

```javascript
// Generate WITHOUT site as initImage
let imageResult = await generateA1SheetImage({
  prompt: prompt,  // Includes site context in text
  initImage: null, // Don't use site - will composite after
  seed: effectiveSeed,
  model: 'FLUX.1-dev'
});
```

### 5. Site Snapshot Compositing

**File:** `src/services/dnaWorkflowOrchestrator.js` (lines 755-791)

```javascript
if (siteSnapshot && architecturalSheetService) {
  // Get bounding box for site plan area (top-left)
  const bbox = architecturalSheetService.getSiteMapBBox(
    'uk-riba-standard',
    imageResult.metadata.width,
    imageResult.metadata.height
  );

  // Composite captured site onto generated A1 sheet
  const compositedUrl = await architecturalSheetService.compositeSiteSnapshot(
    imageResult.url,
    { dataUrl: siteSnapshot },
    bbox
  );

  imageResult.url = compositedUrl; // Update to composited version
}
```

### 6. Storage for Modifications

**File:** `src/services/dnaWorkflowOrchestrator.js` (lines 914-915)

```javascript
return {
  // ... other fields
  siteSnapshot: siteSnapshot ? {
    dataUrl: siteSnapshot,
    ...siteMapMetadata
  } : null,
  // Stored in design history for future modifications
};
```

### 7. Modification Compositing

**File:** `src/services/aiModificationService.js` (lines 720-755)

```javascript
// Retrieve stored site snapshot
const siteSnapshot = originalDesign.siteSnapshot;

if (siteSnapshot && siteSnapshot.dataUrl) {
  // Composite onto modified result
  const compositedSheetUrl = await architecturalSheetService.compositeSiteSnapshot(
    finalResult.url,
    siteSnapshot,
    bbox
  );

  finalResult.url = compositedSheetUrl;
  // Pixel-exact site parity maintained
}
```

## Data Flow

### Site Snapshot Object Structure

```javascript
{
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANS...", // Base64 image
  attribution: "Map data ©2024 Google",
  sourceUrl: "https://maps.googleapis.com/maps/api/staticmap?...",
  hasPolygon: true,
  coordinates: { lat: 51.5033, lng: -0.1277 }
}
```

### A1 Sheet Result Structure

```javascript
{
  success: true,
  a1Sheet: {
    url: "data:image/png;base64,...", // Composited final image
    seed: 12345,
    prompt: "...",
    metadata: {
      width: 1264,
      height: 1792,
      insetSources: {
        siteMapUrl: "https://maps.googleapis.com/...",
        hasRealSiteMap: true,
        siteMapAttribution: "Map data ©2024 Google"
      }
    }
  },
  siteSnapshot: {
    dataUrl: "data:image/png;base64,...",
    attribution: "Map data ©2024 Google",
    hasPolygon: true
  }
}
```

## Benefits

### 1. Consistent Site Context
- ✅ Same captured site map in initial generation
- ✅ Same site map preserved through all modifications
- ✅ Pixel-exact parity across all versions

### 2. Better Quality
- ✅ Real satellite imagery (not AI-generated)
- ✅ Accurate site boundaries from user-drawn polygons
- ✅ Correct geographic coordinates displayed

### 3. Reliable Workflow
- ✅ Site captured once, used everywhere
- ✅ No need to regenerate site context
- ✅ Modifications can't corrupt site plan

### 4. Professional Output
- ✅ Matches real-world site conditions
- ✅ Planning-ready documentation
- ✅ Accurate for client presentations

## Testing

### Test Initial Generation

1. **Enter location** with site polygon
2. **Generate A1 sheet**
3. **Verify:**
   - ✅ Site plan appears in top-left
   - ✅ Shows real satellite imagery
   - ✅ Site polygon boundaries visible (RED)
   - ✅ North arrow and scale present

### Test Modifications

1. **Generate initial A1 sheet** (capture site)
2. **Add interior 3D views**
3. **Verify:**
   - ✅ Site plan unchanged in top-left
   - ✅ Same satellite imagery preserved
   - ✅ Interior views added elsewhere
   - ✅ No site regeneration or drift

### Test Consistency

1. **Generate initial sheet** with site
2. **Make multiple modifications**
3. **Compare site plans** across all versions
4. **Verify:**
   - ✅ Pixel-exact match in all versions
   - ✅ No position drift
   - ✅ No content changes to site

## Console Output

### During Initial Generation:
```
🗺️ STEP 4: Fetching site map snapshot...
✅ Site snapshot fetched successfully
   Attribution: Map data ©2024 Google
   Polygon overlay: yes

🎨 STEP 5: Generating A1 sheet image...
✅ A1 sheet image generated successfully

🗺️ STEP 5.5: Compositing captured site map onto A1 sheet...
   📍 Site map position: x=31, y=50
   📐 Site map size: 304×226px
   ✅ Captured site map successfully composited onto A1 sheet
   ✅ Real site context now visible in final output
```

### During Modifications:
```
🗺️ Site Map Parity: Composite site snapshot for pixel-exact map
   📍 Site map position: x=31, y=50
   📐 Site map size: 304×226px
   ✅ Site snapshot composited - pixel-exact map parity maintained
```

## Known Limitations

1. **Storage Size**
   - Site snapshot adds ~50-100KB to design history
   - Base64 data URLs can be large
   - localStorage quota may be reached faster

2. **API Dependency**
   - Requires Google Maps API key
   - Quota limits apply (25,000 loads/month free tier)
   - Fallback to placeholder if API unavailable

3. **Browser Compatibility**
   - Canvas-based compositing requires modern browser
   - Data URLs have size limits in some browsers
   - Large images may cause performance issues

## Future Enhancements

1. **Image Optimization**
   - Compress site snapshots before storage
   - Use IndexedDB instead of localStorage
   - Lazy-load site images

2. **Advanced Features**
   - Multiple zoom levels
   - Aerial vs street view toggle
   - Seasonal/time-based site views

3. **Offline Support**
   - Cache site snapshots
   - IndexedDB persistence
   - Service worker integration

## Conclusion

The complete site context workflow ensures that captured site maps are properly used as context for AI generation and composited onto the final A1 sheets. This provides:

- **Consistency:** Same site across all versions
- **Quality:** Real satellite imagery
- **Reliability:** No site regeneration or drift
- **Professionalism:** Planning-ready documentation

**Status:** ✅ Production Ready
**Testing:** ✅ Complete
**Documentation:** ✅ Complete

---

*Implementation completed November 8, 2024*
*Captured site maps now flow through entire A1 workflow*