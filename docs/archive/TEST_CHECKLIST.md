# TEST CHECKLIST
## Verify All 3 Critical Fixes Are Working

Use this checklist to systematically test all fixes. Mark each item when verified.

---

## ✅ FIX #1: GOOGLE MAPS + SITE BOUNDARY

### Map Rendering:
- [ ] Navigate to Step 2 (Intelligence Report page)
- [ ] Google Maps container loads (no blank space)
- [ ] Map shows satellite/hybrid view
- [ ] Red marker appears at site center
- [ ] Map controls visible (zoom +/-, street view, map type selector)
- [ ] No error messages about missing API key

### Basic Drawing:
- [ ] Click on map places first vertex
- [ ] Click again places second vertex
- [ ] Continue clicking to place more vertices
- [ ] Lines connect vertices automatically
- [ ] Polygon fills with semi-transparent blue color
- [ ] Numbered markers (1, 2, 3...) appear at each vertex

### Finishing Polygon:
- [ ] Right-click when 3+ vertices placed
- [ ] Message appears: "Polygon Complete - Drag corners to adjust"
- [ ] Numbered circles remain visible
- [ ] Temporary drawing UI disappears
- [ ] Polygon becomes solid with corner markers

### Vertex Dragging:
- [ ] Click and hold any numbered circle
- [ ] Drag circle to new position
- [ ] Polygon shape updates in real-time as you drag
- [ ] Release mouse to set new position
- [ ] Can drag any corner independently
- [ ] Polygon maintains proper shape while dragging

### Side Panel (Geometry Editing):
- [ ] Panel appears on right side with title "Site Geometry"
- [ ] Shows list of all edges with lengths in meters
- [ ] Shows angles between each pair of edges
- [ ] Can click to edit an edge length
- [ ] Typing new length updates polygon on map
- [ ] Can click to edit an angle
- [ ] Typing new angle updates polygon on map
- [ ] Changes in table reflect immediately on map
- [ ] Changes on map reflect immediately in table

### Advanced Drawing Features:
- [ ] Hold Shift while drawing → line snaps to 90° angles
- [ ] Message shows "ORTHOGONAL (90°)" when Shift held
- [ ] Type number (e.g., "15") while drawing
- [ ] Press Enter → vertex placed at exact distance
- [ ] Press ESC → undoes last vertex
- [ ] "Undo Last" button works
- [ ] "Clear All" button removes entire polygon
- [ ] Real-time measurements panel shows:
  - Current edge length
  - Angle at corner
  - Total vertices count
  - Total perimeter
  - Estimated area
  - List of completed edges

---

## ✅ FIX #2: A1 SHEET DISPLAY

### Sheet Visibility:
- [ ] Complete design generation (Steps 1-6)
- [ ] Navigate to Results page (Step 6)
- [ ] Large image viewer appears (not blank space)
- [ ] A1 sheet is clearly visible inside viewer
- [ ] No "No A1 sheet available" error message

### Sheet Content:
- [ ] Can see floor plans in sheet
- [ ] Can see elevations (multiple views)
- [ ] Can see sections
- [ ] Can see 3D perspectives
- [ ] Can see title block with project info
- [ ] Can see site map inset (if applicable)
- [ ] All text is readable (not blurry)

### Zoom Controls (Top Bar):
- [ ] Control bar appears above viewer
- [ ] "Zoom Out" (-) button present
- [ ] "Fit" button present
- [ ] "Zoom In" (+) button present
- [ ] Current zoom percentage displayed (e.g., "100%")
- [ ] "Download PNG" button present (green)
- [ ] Format label shows "A1 Landscape (841×594mm)"

### Zoom Functionality:
- [ ] Click "Zoom In" (+) → image gets larger
- [ ] Zoom percentage increases (e.g., 100% → 125%)
- [ ] Click "Zoom Out" (-) → image gets smaller
- [ ] Zoom percentage decreases
- [ ] Click "Fit" → resets to fit screen
- [ ] Zoom resets to 100%
- [ ] Can't zoom below 50%
- [ ] Can't zoom above 400%
- [ ] Buttons disable at limits

### Mouse Zoom:
- [ ] Scroll mouse wheel up → zooms in
- [ ] Scroll mouse wheel down → zooms out
- [ ] Zoom is smooth (not jumpy)
- [ ] Zoom centers on current view

### Pan Functionality:
- [ ] Zoom in past 100%
- [ ] Cursor changes to "grab" hand icon
- [ ] Click and hold on image
- [ ] Drag mouse → image pans
- [ ] Cursor changes to "grabbing" while dragging
- [ ] Can pan in all directions
- [ ] Release mouse → panning stops

### Metadata Display:
- [ ] Info panel below viewer shows:
  - Format (A1 landscape)
  - Resolution (width × height pixels)
  - Aspect Ratio (1.414)
  - Design Seed number
- [ ] If site map included, shows green checkmark icon
- [ ] Attribution text shows "Map data © Google"
- [ ] "View Generation Prompt" link works (expands prompt text)

---

## ✅ FIX #3: A1 DOWNLOAD

### Header Download Button:
- [ ] Green "Download A1 Sheet" button visible in header
- [ ] Button shows download icon
- [ ] Click button initiates download
- [ ] Browser shows download starting
- [ ] File appears in Downloads folder
- [ ] Filename format correct: `A1-Sheet-{id}-{date}.png`
- [ ] Example: `A1-Sheet-abc123-2025-11-13.png`

### Viewer Download Button:
- [ ] Click "Download PNG" in viewer controls
- [ ] Button shows "Downloading..." state
- [ ] Spinner animation appears
- [ ] Button text changes during download
- [ ] Download completes within reasonable time
- [ ] Button returns to normal state
- [ ] File appears in Downloads folder

### Downloaded File Quality:
- [ ] Open downloaded PNG file
- [ ] File is not corrupted (opens properly)
- [ ] Image shows complete A1 sheet
- [ ] Resolution is high (sharp, not pixelated)
- [ ] All details are visible:
  - Floor plans clear
  - Elevations clear
  - Text is readable
  - Lines are crisp
  - Colors are accurate
- [ ] Aspect ratio preserved (wide landscape)
- [ ] File size reasonable (2-10 MB typical)

### Console Logs (F12):
- [ ] Open browser console (F12)
- [ ] Click download button
- [ ] See log: "📥 Download triggered..."
- [ ] See log: "✅ Data URL detected..." or "🌐 Fetching image..."
- [ ] See log: "✅ A1 sheet downloaded successfully"
- [ ] No error messages in console

### Error Handling:
- [ ] If download fails, alert appears
- [ ] Error message is user-friendly
- [ ] Suggests using viewer download as fallback
- [ ] Console shows detailed error for debugging

### Multiple Downloads:
- [ ] Click download button multiple times
- [ ] Each download creates separate file
- [ ] Filenames are unique (timestamp differs)
- [ ] No browser crashes or hangs
- [ ] Memory doesn't leak (check Task Manager if concerned)

---

## ✅ BROWSER COMPATIBILITY

### Chrome/Edge:
- [ ] All features work
- [ ] No console errors
- [ ] Download works perfectly
- [ ] Map renders correctly

### Firefox:
- [ ] All features work
- [ ] No console errors
- [ ] Download works (may use different method)
- [ ] Map renders correctly

### Safari (if available):
- [ ] All features work
- [ ] No console errors
- [ ] Download works (may use canvas fallback)
- [ ] Map renders correctly

---

## ✅ INTEGRATION TESTING

### Complete User Flow:
1. [ ] Start from landing page (Step 0)
2. [ ] Enter address (Step 1)
3. [ ] Click "Analyze Location"
4. [ ] Wait for analysis to complete
5. [ ] Verify advancement to Step 2
6. [ ] See map with site marker
7. [ ] Draw site boundary on map
8. [ ] Edit polygon using drag and table
9. [ ] Click "Continue to Portfolio"
10. [ ] Upload portfolio images (Step 3)
11. [ ] Continue to specifications (Step 4)
12. [ ] Enter project details
13. [ ] Continue to generation (Step 5)
14. [ ] Click "Generate AI Designs"
15. [ ] Wait for generation (~60 seconds)
16. [ ] Verify advancement to Results (Step 6)
17. [ ] See A1 sheet display automatically
18. [ ] Test zoom and pan
19. [ ] Download A1 sheet
20. [ ] Verify downloaded file quality

### Site Boundary Persistence:
- [ ] Draw polygon on Step 2
- [ ] Continue to Step 3
- [ ] Go back to Step 2
- [ ] Polygon still visible on map
- [ ] Can still edit polygon
- [ ] Changes persist when continuing forward

### A1 Sheet Persistence:
- [ ] Generate design (Step 6)
- [ ] Go back to Step 5
- [ ] Return to Step 6
- [ ] A1 sheet still visible (not regenerated)
- [ ] Can still zoom and download

---

## 🐛 COMMON ISSUES TO CHECK

### If Map Doesn't Load:
- [ ] Check console for error: "Google Maps API key not configured"
- [ ] Verify `.env` file exists in project root
- [ ] Verify `REACT_APP_GOOGLE_MAPS_API_KEY=` line exists in `.env`
- [ ] API key starts with `AIzaSy...`
- [ ] Restart dev server after editing `.env`: `npm start`
- [ ] Hard refresh browser: Ctrl+Shift+R

### If A1 Sheet Doesn't Show:
- [ ] Check console for errors about missing prop
- [ ] Verify generation completed successfully
- [ ] Check that `generatedDesigns` object exists
- [ ] Verify `a1Sheet.url` is not null
- [ ] Hard refresh browser
- [ ] Try regenerating design

### If Download Doesn't Work:
- [ ] Check browser console for download errors
- [ ] Try viewer download button instead of header button
- [ ] Check browser's download settings (not blocking downloads)
- [ ] Check Downloads folder permissions
- [ ] Try different browser
- [ ] Right-click image and "Save image as..." (manual fallback)

---

## 📊 FINAL VERIFICATION

### All Features Working:
- [ ] Google Maps renders ✅
- [ ] Site boundary drawing works ✅
- [ ] Vertex dragging works ✅
- [ ] Edge/angle editing works ✅
- [ ] A1 sheet displays ✅
- [ ] Zoom/pan controls work ✅
- [ ] Header download works ✅
- [ ] Viewer download works ✅
- [ ] Downloaded files are valid ✅

### Performance Check:
- [ ] Map loads in <5 seconds
- [ ] No lag when dragging vertices
- [ ] Polygon updates instantly when editing table
- [ ] A1 sheet loads in <3 seconds
- [ ] Zoom is smooth (not choppy)
- [ ] Download completes in <10 seconds
- [ ] No memory leaks (no RAM growth over time)
- [ ] Browser doesn't freeze or crash

### User Experience:
- [ ] All instructions are clear
- [ ] UI is intuitive
- [ ] No confusing error messages
- [ ] Features work as expected
- [ ] No broken functionality
- [ ] Professional appearance maintained

---

## 🎉 COMPLETION

**Date Tested:** _________________

**Tester Name:** _________________

**Browser(s) Tested:** _________________

**Result:**
- [ ] ✅ ALL TESTS PASSED - Ready for production
- [ ] ⚠️ SOME ISSUES FOUND - See notes below
- [ ] ❌ CRITICAL FAILURES - Needs immediate attention

**Notes:**
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________

---

**Checklist Version:** 1.0.0
**Last Updated:** 2025-11-13
