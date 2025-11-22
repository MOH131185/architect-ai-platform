# Precision Drawing Mode - Testing Guide

## ✅ Testing Steps

### Step 1: Enable Precision Mode
1. Navigate to Step 2 (Location Intelligence) in the app
2. Scroll down to the map section
3. Click the **"📐 Precision Mode"** button above the map
4. Button should turn **blue** and show "📐 Precision Mode"

### Step 2: Start Drawing
1. You should see a **blue popup** in the center of the map saying "Precision Drawing Mode Active"
2. **Click anywhere on the map** to place the first vertex
3. The popup should disappear
4. A **numbered marker** (1) should appear where you clicked
5. A **help panel** should appear at the top showing keyboard shortcuts

### Step 3: Test Keyboard Number Input
1. After clicking first vertex, **move your mouse** (don't click yet)
2. You should see an **orange dashed line** following your cursor
3. **Type numbers** on your keyboard (e.g., type `1` then `5` for 15 meters)
4. Watch the **bottom status bar** - it should show "📏 15m" in a blue box
5. **Check browser console** - you should see: `📏 Dimension input: 15`

**If numbers don't appear:**
- Make sure you clicked on the map first (isDrawing must be true)
- Check browser console for any errors
- Try clicking on the map area to ensure it has focus
- Make sure no other input fields are selected

### Step 4: Test Shift Snapping (90° Angles)
1. With the orange preview line visible, **hold down Shift key**
2. The line should turn **GREEN** immediately
3. Bottom status bar should show **"⊥ ORTHOGONAL (90°)"** in a green box
4. **Check browser console** - you should see: `🔧 Shift pressed - orthogonal mode ON`
5. Move your mouse - the line should snap to only 4 directions (0°, 90°, 180°, 270°)
6. **Release Shift** - line turns back to orange, green indicator disappears
7. **Check browser console** - you should see: `🔧 Shift released - orthogonal mode OFF`

**If Shift doesn't work:**
- Check browser console when pressing Shift
- Make sure you're in drawing mode (clicked first vertex)
- Try pressing and releasing Shift multiple times

### Step 5: Apply Dimension
1. Type a dimension (e.g., `10`)
2. Hold Shift to set direction (line turns green)
3. Point your mouse in desired direction
4. **Press Enter**
5. **Check browser console** - you should see:
   - `✅ Enter pressed - applying dimension: 10`
   - `📐 Applying dimension: { length: '10m', bearing: 'XX.X°', finalBearing: 'XX.X°', orthogonal: true }`
   - `✅ Vertex placed at exact distance: 10m`
6. A new vertex marker (2) should appear **exactly 10 meters** away
7. The dimension input clears from status bar

**If Enter doesn't work:**
- Check that you typed a valid number
- Check browser console for warnings
- Make sure you're hovering over the map when pressing Enter

### Step 6: Draw Complete Shape
1. Repeat steps 3-5 for each edge
2. Type dimension → Hold Shift → Point direction → Press Enter
3. After **3+ vertices**, you can **right-click** to close the polygon
4. OR click the **"✓ Finish"** button in the status bar

## 🐛 Debugging Checklist

If precision mode isn't working, check these in browser console:

### Console Messages You Should See:

**When pressing Shift:**
```
🔧 Shift pressed - orthogonal mode ON
```

**When typing numbers:**
```
📏 Dimension input: 1
📏 Dimension input: 10
📏 Dimension input: 10.5
```

**When pressing Enter:**
```
✅ Enter pressed - applying dimension: 10.5
📐 Applying dimension: { length: '10.5m', bearing: '45.2°', finalBearing: '45.0°', orthogonal: true }
✅ Vertex placed at exact distance: 10.5m
```

**When releasing Shift:**
```
🔧 Shift released - orthogonal mode OFF
```

**Orthogonal snapping (occasional):**
```
🔧 Orthogonal snap: 47.3° → 45.0°
```

### Common Issues:

**Issue: Typing numbers doesn't work**
- **Cause**: Not in drawing mode yet
- **Fix**: Click on map first to start drawing
- **Verify**: Check if help panel is showing at top

**Issue: Shift key doesn't snap**
- **Cause**: Need at least 1 vertex placed
- **Fix**: Click to place first vertex, then try Shift
- **Verify**: Look for green line color change

**Issue: Enter doesn't apply dimension**
- **Cause**: No dimension typed or no current vertex
- **Fix**: Type numbers first, move mouse over map, then press Enter
- **Verify**: Check console for warning messages

**Issue: Line doesn't follow mouse**
- **Cause**: Map doesn't have focus
- **Fix**: Click on the map area
- **Verify**: Check if mousemove is registered

## 🎯 Expected Behavior Summary

### Visual Feedback:
- ✅ Blue "Precision Mode" button when active
- ✅ Blue instruction popup before first click
- ✅ Numbered vertex markers (1, 2, 3...)
- ✅ Orange preview line (normal mode)
- ✅ Green preview line (orthogonal mode with Shift)
- ✅ InfoWindow label showing dimension on line
- ✅ Bottom status bar showing:
  - Vertex count
  - Dimension input (when typing)
  - Orthogonal mode indicator (when Shift pressed)
  - Finish and Cancel buttons

### Keyboard Behavior:
- ✅ Numbers 0-9: Add to dimension input
- ✅ Decimal point (.): Allow decimal dimensions
- ✅ Shift (hold): Enable 90° snapping
- ✅ Enter: Apply dimension and place vertex
- ✅ Backspace: Remove last digit from dimension
- ✅ Escape: Cancel drawing
- ✅ Delete: Undo last vertex

### Calculation Accuracy:
- ✅ Haversine formula for geodesic distance (±0.5% accuracy)
- ✅ Bearing calculation for direction
- ✅ Orthogonal snapping to nearest 90° angle
- ✅ Geodesic destination calculation for exact placement

## 📝 Testing Workflow Example

### Draw a 10m × 15m Rectangle:

1. **Enable Precision Mode** - Click "📐 Precision Mode" button
2. **Start drawing** - Click on map (Vertex 1 placed)
3. **First edge (10m east)**:
   - Type: `10`
   - Hold Shift
   - Point mouse to the right (east)
   - Line snaps to 90° (east)
   - Press Enter
   - Vertex 2 appears 10m away
4. **Second edge (15m north)**:
   - Type: `15`
   - Hold Shift
   - Point mouse upward (north)
   - Line snaps to 0° (north)
   - Press Enter
   - Vertex 3 appears 15m away
5. **Third edge (10m west)**:
   - Type: `10`
   - Hold Shift
   - Point mouse to the left (west)
   - Line snaps to 270° (west)
   - Press Enter
   - Vertex 4 appears 10m away
6. **Close rectangle**:
   - Right-click to close polygon
   - OR Click "✓ Finish" button
7. **Verify**:
   - 4 vertices visible
   - Edge labels show: 10.0m, 15.0m, 10.0m, 15.0m
   - Total area: ~150 m²

## 🔍 Console Debugging

Open browser console (F12) and look for these patterns:

**Good signs (working correctly):**
- Emoji prefixes (🔧, 📏, ✅, 📐)
- Dimension values appearing
- Bearing calculations showing
- No warning (⚠️) or error messages

**Bad signs (something wrong):**
- ⚠️ Warning messages
- "Cannot apply dimension" warnings
- No console output when typing/pressing Shift
- JavaScript errors in red

## 🎓 Advanced Features

### Decimal Dimensions:
- Type `10.5` for 10.5 meters
- Type `7.25` for 7.25 meters

### Undo Last Vertex:
- Press Delete key to remove last placed vertex
- OR Press Backspace when dimension input is empty

### Cancel Drawing:
- Press Escape to clear all vertices and start over
- OR Click "✕ Cancel" button in status bar

### Edit After Completion:
- Once polygon is closed, you can't edit vertices in precision mode
- Switch back to Standard Mode to edit with Google Maps drawing tools

## 📊 Expected Console Output (Full Example)

```
[After clicking first vertex]
(no output - just places marker)

[After typing "10"]
📏 Dimension input: 1
📏 Dimension input: 10

[After pressing Shift]
🔧 Shift pressed - orthogonal mode ON

[While moving mouse with Shift held]
🔧 Orthogonal snap: 87.3° → 90.0°
🔧 Orthogonal snap: 91.2° → 90.0°

[After pressing Enter]
✅ Enter pressed - applying dimension: 10
📐 Applying dimension: {
  length: '10m',
  bearing: '89.8°',
  finalBearing: '90.0°',
  orthogonal: true
}
✅ Vertex placed at exact distance: 10m

[After releasing Shift]
🔧 Shift released - orthogonal mode OFF
```

## 🚀 Next Steps

If precision mode is working correctly, you should see:
1. ✅ All console messages appearing
2. ✅ Visual feedback (colors, status bars, labels)
3. ✅ Exact dimensions being applied
4. ✅ 90° snapping when Shift is held

If you're still having issues:
1. Share the browser console output
2. Describe which specific step fails
3. Check if any error messages appear in red
4. Verify that React app reloaded after code changes
