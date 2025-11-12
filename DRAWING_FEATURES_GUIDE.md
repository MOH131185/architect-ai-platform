# Drawing Features - Complete Guide

## 🎯 Two Main Features

### 1. **Manual Drawing with Precision** (Type dimensions + Shift for 90°)
### 2. **Drag Corners to Adjust** (Edit existing polygon)

---

## 📐 Feature 1: Manual Precision Drawing

### Step-by-Step Instructions:

#### **Step 1: Start Drawing**
1. Go to Step 2 (Location Intelligence Report)
2. Scroll down to the map
3. You'll see a blue box: "Click on map to start drawing"
4. **Click anywhere on the map** to place the first corner

#### **Step 2: Type Length (Keyboard Input)**
After placing the first corner:
1. **Type numbers directly** (no need to click anything)
   - Example: Type `1` then `5` for 15 meters
   - Example: Type `1` `0` `.` `5` for 10.5 meters
2. **Watch the bottom status bar** - it will show: `📏 15m`
3. **Watch the help panel at top** - it will show your current input

**Console Check:** Press F12, you should see:
```
📏 Dimension input: 1
📏 Dimension input: 15
```

#### **Step 3: Hold Shift for 90° Angles**
While typing your dimension:
1. **Hold down Shift key**
2. **Move your mouse** in the direction you want
3. The preview line will:
   - Turn **GREEN** (instead of orange)
   - Snap to exact 90° angles (0°, 90°, 180°, 270°)
4. **Bottom status bar** shows: `⊥ ORTHOGONAL (90°)`

**Console Check:** You should see:
```
🔧 Shift pressed - orthogonal mode ON
🔧 Orthogonal snap: 87.3° → 90.0°
```

#### **Step 4: Apply Dimension**
1. **Press Enter** to place the vertex at exact distance
2. New corner appears exactly X meters away
3. Dimension input clears automatically

**Console Check:** You should see:
```
✅ Enter pressed - applying dimension: 15
📐 Applying dimension: {length: '15m', bearing: '89.8°', finalBearing: '90.0°', orthogonal: true}
✅ Vertex placed at exact distance: 15m
```

#### **Step 5: Continue Drawing**
Repeat steps 2-4 for each edge:
1. Type dimension (e.g., `10`)
2. Hold Shift (if you want 90°)
3. Point mouse in direction
4. Press Enter

#### **Step 6: Close Polygon**
When you have 3+ corners:
- **Right-click** on the map, OR
- **Click "✓ Finish" button** in the bottom status bar

**Result:** Polygon becomes editable with draggable corners!

---

## 🖱️ Feature 2: Drag Corners to Adjust

### After Drawing is Complete:

#### **What You'll See:**
- Green banner at top: "✓ Polygon Complete - Drag corners to adjust"
- Blue polygon with light blue fill
- **Small circles at each corner** (these are draggable)
- **Small squares on edges** (drag these to add new corners)

#### **How to Drag Corners:**
1. **Hover over a corner** - cursor changes to a hand
2. **Click and hold** the corner
3. **Drag to new position**
4. **Release** to place

**Console Check:** You should see:
```
🔧 Vertex moved - polygon updated
```

#### **How to Add New Corners:**
1. **Hover over the middle of an edge** - you'll see a small transparent circle
2. **Click and drag** the circle
3. A new corner is added!

**Console Check:** You should see:
```
➕ Vertex added - polygon updated
```

#### **Site Metrics Update:**
As you drag corners, the site metrics automatically update:
- Total area recalculates
- Edge lengths update
- Perimeter updates

---

## 🔍 Troubleshooting

### Issue: "Typing numbers doesn't work"

**Cause:** Drawing mode hasn't started
**Fix:**
1. Look for the blue "Click on map to start drawing" message
2. Click anywhere on the map first
3. Then try typing

**Verify in Console (F12):**
- You should see: `📏 Dimension input: X` when you type

### Issue: "Shift doesn't make line straight"

**Cause:** Shift not being detected or drawing not started
**Fix:**
1. Make sure you clicked to place first corner
2. Type a dimension first (e.g., `10`)
3. Then hold Shift while moving mouse
4. Line should turn GREEN

**Verify in Console:**
- You should see: `🔧 Shift pressed - orthogonal mode ON`
- You should see: `🔧 Orthogonal snap: XX.X° → 90.0°`

### Issue: "Can't drag corners"

**Cause:** Polygon not in edit mode
**Fix:**
1. Make sure you finished drawing (right-click or press Finish)
2. Look for green banner: "✓ Polygon Complete"
3. Corners should have small circles you can grab

**Verify in Console:**
- You should see: `✅ Polygon completed with X vertices - drag vertices to adjust`

### Issue: "Polygon not showing at all"

**Cause:** Rendering issue or not loaded
**Fix:**
1. Refresh the page
2. Check console for errors

**Verify in Console:**
- Look for: `📐 Loading initial polygon with X vertices`
- Look for: `✅ Editable polygon created and displayed`

### Issue: "Enter doesn't place vertex"

**Cause:** No dimension typed or no cursor position
**Fix:**
1. Type numbers first (e.g., `1`, `5` for 15m)
2. Move mouse over the map (so there's a preview line)
3. Then press Enter

**Verify in Console:**
- If you see: `⚠️ Cannot apply dimension:` - check what's missing

---

## 📊 Visual Indicators

### During Drawing:
- **Orange dashed line** = Normal preview (free angle)
- **Green dashed line** = Orthogonal preview (Shift held, 90° snap)
- **Orange label** = Current distance (normal mode)
- **Green label** = Current distance (orthogonal mode)
- **Blue circles with numbers** = Placed vertices

### Bottom Status Bar (while drawing):
- **Vertices: X** = Number of corners placed
- **⊥ ORTHOGONAL (90°)** = Shift is held (green badge)
- **📏 Xm** = Current dimension typed (blue badge)
- **✓ Finish** = Button to complete (appears after 3+ vertices)
- **✕ Cancel** = Button to cancel and start over

### After Completing:
- **Blue outline** = Polygon boundary
- **Light blue fill** = Interior area
- **Small white circles at corners** = Draggable vertices
- **Small transparent circles on edges** = Add new vertex here
- **Green banner at top** = "✓ Polygon Complete - Drag corners to adjust"

---

## 🎓 Example Workflow: Draw a 10m × 15m Rectangle

### Step-by-Step:

1. **Click on map** → First corner placed

2. **Type `1` `0`** → Input shows "10m"

3. **Hold Shift** → Line turns green

4. **Move mouse to the right** → Line snaps to 90° (east)

5. **Press Enter** → Second corner placed 10m away

6. **Type `1` `5`** → Input shows "15m"

7. **Hold Shift** → Line turns green

8. **Move mouse upward** → Line snaps to 0° (north)

9. **Press Enter** → Third corner placed 15m away

10. **Type `1` `0`** → Input shows "10m"

11. **Hold Shift** → Line turns green

12. **Move mouse to the left** → Line snaps to 270° (west)

13. **Press Enter** → Fourth corner placed 10m away

14. **Right-click** → Polygon closes automatically (connects to first corner)

**Result:** Perfect 10m × 15m rectangle with 90° corners!

---

## ✅ Console Messages Checklist

When everything works correctly, you should see:

**During Drawing:**
```
📏 Dimension input: 1
📏 Dimension input: 10
🔧 Shift pressed - orthogonal mode ON
🔧 Orthogonal snap: 87.3° → 90.0°
✅ Enter pressed - applying dimension: 10
📐 Applying dimension: {length: '10m', bearing: '89.8°', finalBearing: '90.0°', orthogonal: true}
✅ Vertex placed at exact distance: 10m
🔧 Shift released - orthogonal mode OFF
```

**When Completing:**
```
✅ Polygon completed with 4 vertices - drag vertices to adjust
```

**When Dragging Corners:**
```
🔧 Vertex moved - polygon updated
```

---

## 🚀 Pro Tips

### Tip 1: Quick Squares and Rectangles
- Type dimension once (e.g., `10`)
- Hold Shift
- Click 4 times in different directions (right, up, left, down)
- Result: Perfect 10m × 10m square!

### Tip 2: Decimal Precision
- You can type decimals: `1` `0` `.` `5` = 10.5 meters
- Great for precise measurements

### Tip 3: Undo Last Corner
- Press **Delete** or **Backspace** (when no dimension typed)
- Removes the last placed corner

### Tip 4: Cancel and Start Over
- Press **Escape** while drawing
- Or click **✕ Cancel** button
- Or use **Clear & Redraw** button after finishing

### Tip 5: See Exact Measurements
- The site metrics panel shows:
  - Total area in m²
  - Length of each edge (Side 1, Side 2, etc.)
  - Perimeter
  - Orientation

---

## 📝 Summary

**Manual Drawing:**
1. Click to start
2. Type numbers for length
3. Hold Shift for 90° snap
4. Press Enter to place
5. Right-click to finish

**Drag to Edit:**
1. Finish drawing first
2. Hover over corners
3. Click and drag to move
4. Metrics update automatically

Both features work together - draw with precision, then fine-tune by dragging!
