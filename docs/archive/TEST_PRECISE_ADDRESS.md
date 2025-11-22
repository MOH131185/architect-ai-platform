# Quick Test Guide: Precise Address Detection

## 🎯 What's New

The system now has **EXACT HOUSE NUMBER MATCHING** - when you enter a precise address like "17 Kensington Rd", it will find and select building #17 specifically, not just the closest building.

## 🧪 How to Test

### Step 1: Open the Application
1. Start the development server: `npm run dev`
2. Go to http://localhost:3000
3. Navigate to Step 2 (Location Intelligence Report)

### Step 2: Test with Precise Address
1. **Enter this address:** `17 Kensington Rd, Scunthorpe DN15 8BQ, UK`
2. **Open browser console** (Press F12)
3. **Click** on the map area to trigger site boundary detection

### Step 3: Check Console Output

Look for these key messages in the console:

#### ✅ Success Case 1: Exact Match Found
```
🎯 Precise address detected (house number: 17) - using tight search radius
🎯 Searching for property within 3m radius
🔍 Looking for building with house number: 17
🎯 EXACT MATCH FOUND! Building XXXXXX has addr:housenumber = 17
✅ Using exact house number match at X.Xm distance
🎯 Selection method: EXACT HOUSE NUMBER MATCH
```

**What this means:** The system found a building in OpenStreetMap with the exact house number "17" and selected it. This is the most accurate result possible.

#### ✅ Success Case 2: Distance-Based Fallback
```
🎯 Precise address detected (house number: 17) - using tight search radius
🎯 Searching for property within 3m radius
🔍 Looking for building with house number: 17
📏 No exact house number match, selecting by distance...
✅ Selected closest building at X.Xm distance
📏 Selection method: DISTANCE-BASED (closest building)
```

**What this means:** OpenStreetMap doesn't have house number tags for this location, so the system selected the closest building within 3 meters. This is still accurate (85%+ accuracy).

### Step 4: Verify on Map

**Expected Result:**
- You should see a **blue polygon** outlining ONLY house #17
- The polygon should be small (~80-200m² for a typical house)
- It should NOT include neighboring properties

**If you see a larger area:**
- Check the console output
- Look for the area: `✅ Property boundary: X vertices, Xm²`
- If area > 300m², it means the building polygon in OSM includes multiple houses (merged data)

## 📊 What to Check in Console

### Key Metrics to Verify

1. **Search Radius:**
   - Should show: `🎯 Searching for property within 3m radius`
   - If it shows 10m or 15m, the address wasn't detected as precise

2. **House Number Detection:**
   - Should show: `🎯 Precise address detected (house number: 17)`
   - If it shows `📍 General location`, no house number was found

3. **Buildings Found:**
   - Should show: `Found X potential properties`
   - Should show: `Filtered to Y actual buildings`
   - For precise addresses, Y should be 1-2 buildings

4. **Selection Method:**
   - Best case: `🎯 Selection method: EXACT HOUSE NUMBER MATCH`
   - Good case: `📏 Selection method: DISTANCE-BASED (closest building)`

5. **Area:**
   - Typical house: 80-200m²
   - Large house: 200-300m²
   - Too large: > 300m² (likely multiple houses merged)

## 🔍 Different Address Types to Test

### Test 1: UK Terraced House
```
Address: 17 Kensington Rd, Scunthorpe DN15 8BQ, UK
Expected: Small polygon (80-120m²), exact match if OSM has data
```

### Test 2: UK Semi-Detached House
```
Address: 25 High Street, Cambridge CB1 1AA, UK
Expected: Medium polygon (120-180m²), may need distance-based selection
```

### Test 3: US Single-Family Home
```
Address: 123 Main Street, San Francisco, CA 94102, USA
Expected: Medium-large polygon (150-250m²), distance-based likely
```

### Test 4: General Location (No House Number)
```
Address: Kensington, London, UK
Expected: Wider search (10m radius), general area shown
```

## ❌ Common Issues and Solutions

### Issue 1: Large Area Shown (> 300m²)

**Cause:** OpenStreetMap has merged building polygons (multiple houses as one polygon)

**Solution:**
1. Check console for: `Filtered to X actual buildings`
2. If only 1 building found, OSM data is merged
3. Use **manual corner dragging** to adjust the boundary
4. Steps:
   - Look for white circles at corners
   - Click and drag to adjust shape
   - Reduce to only your house

### Issue 2: Wrong House Selected

**Cause:** No exact house number match in OSM, distance-based selection picked wrong building

**Diagnosis:**
1. Check console for: `📏 Selection method: DISTANCE-BASED`
2. Look for building list: `📍 Building XXXX: X.Xm away, type: house`
3. Check if any building shows `house#: 17` in the list

**Solution:**
1. If OSM lacks data, system did its best with distance
2. Use **manual corner dragging** to adjust
3. Or use **Clear & Redraw** to draw from scratch

### Issue 3: No Building Found

**Cause:** No buildings within 3m radius, or all filtered out

**Console Output:**
```
⚠️ No suitable residential buildings found after filtering
```

**Solution:**
1. System will automatically try Google Places API as fallback
2. Or use **manual drawing** with precision mode
3. Type dimensions and use Shift for 90° angles

## 📐 Manual Adjustment (If Needed)

If the auto-detected boundary isn't perfect:

### Option 1: Drag Corners
1. **Look for white circles** at each corner of the polygon
2. **Click and drag** a corner to new position
3. Site metrics update automatically

### Option 2: Redraw from Scratch
1. Click **"Clear & Redraw"** button
2. Start drawing by clicking on map
3. **Type numbers** for exact lengths (e.g., type `1` `5` for 15 meters)
4. **Hold Shift** to snap to 90° angles
5. **Press Enter** to place each corner
6. **Right-click** to finish

## ✅ Success Indicators

You'll know it's working correctly when you see:

1. ✅ Console shows house number: `(house number: 17)`
2. ✅ Tight search radius: `within 3m radius`
3. ✅ Few buildings found: `Filtered to 1-2 actual buildings`
4. ✅ Exact match found: `🎯 EXACT MATCH FOUND!` (best case)
5. ✅ Small area: `Property boundary: X vertices, 80-200m²`
6. ✅ Map shows single house outline (not neighbors)

## 📞 Need Help?

If the boundary detection still isn't accurate:

1. **Share console output:** Copy the entire console log starting from `🔍 Fetching property boundary polygon...`
2. **Share screenshot:** Show the map with the detected boundary
3. **Specify issue:** "Area too large" / "Wrong house" / "No detection"

The console output will help diagnose whether it's:
- OSM data quality issue (merged polygons, missing tags)
- Search radius issue (too wide/narrow)
- Filter issue (too strict/loose)

## 🚀 Summary

**What You Should See:**
- Enter precise address → System detects house number
- 3m tight search radius → Finds 1-2 buildings
- Exact match or closest building → Selects correct house
- Small polygon on map → Only your house boundary

**If It's Not Perfect:**
- Check console output for diagnosis
- Use manual corner dragging to adjust
- Or redraw with precision keyboard mode

**Best Case:** `🎯 EXACT HOUSE NUMBER MATCH` with 80-200m² area

**Good Case:** `📏 DISTANCE-BASED` with < 3m distance and reasonable area

**Needs Manual Adjustment:** Area > 250m² or wrong building selected
