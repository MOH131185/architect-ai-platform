# Hybrid Drawing Mode - Complete Guide ✅

## 🎉 New Feature: Flexible Drawing with Mouse + Keyboard

You can now draw site boundaries using **BOTH** mouse and keyboard together!

---

## 🖱️ Mouse Drawing (Free Form)

### Click to Place Vertices

**How it works:**
1. Click anywhere on map → First vertex placed
2. Click again → Second vertex placed
3. Click again → Third vertex placed
4. Continue clicking to add more vertices
5. Right-click → Finish polygon (must have 3+ vertices)

**What you get:**
- ✅ Fast free-form drawing
- ✅ Click wherever you want
- ✅ No typing required
- ✅ Perfect for irregular shapes

**Example:**
```
Click 1 ─┐
         │
Click 2 ─┼─── Click 3
         │
    Click 4
```

---

## ⌨️ Keyboard Input (Precision Mode)

### Type Length + Press Enter

**How it works:**
1. Start drawing (click once to place first vertex)
2. **Type numbers** for exact length (e.g., type `1` then `5` for 15 meters)
3. **Point mouse** in the direction you want
4. **Press Enter** → Vertex placed at EXACT distance
5. Repeat for more precise edges

**What you get:**
- ✅ Exact dimensions (e.g., exactly 15.0m)
- ✅ Perfect for measured plans
- ✅ Great for rectangles/squares

**Example:**
```
1. Click to place first corner
2. Type: 1 5 (shows "📏 15m" in status bar)
3. Point mouse to the right
4. Press Enter → Second corner placed exactly 15m away
```

---

## 🔀 Hybrid Mode (Best of Both!)

### Mix Mouse + Keyboard Freely

**You can switch anytime:**
- Click freely for quick corners
- Type dimension + Enter when you need precision
- Both work together seamlessly!

**Example Workflow:**
```
1. Click to place first corner (mouse)
2. Type "10" + Enter → Second corner at exactly 10m (keyboard)
3. Click to place third corner roughly (mouse)
4. Type "15" + Enter → Fourth corner at exactly 15m (keyboard)
5. Right-click to finish
```

**Perfect for:**
- Drawing house with one side along road (use dimension)
- Other sides follow property boundary (use mouse clicks)

---

## 🔧 Special Features

### 1. Hold Shift for 90° Snap

**Works with both mouse and keyboard:**
- Hold Shift key → Preview line turns GREEN
- Line snaps to exact 90° angles (0°, 90°, 180°, 270°)
- Release Shift → Back to free angles

**When to use:**
- Drawing rectangles
- Creating perfect right angles
- Aligning with roads/boundaries

**Visual indicator:**
- Status bar shows: **⊥ ORTHOGONAL (90°)** in green

### 2. ESC to Undo Last Vertex

**Press ESC once:**
- Removes last placed vertex
- Lets you redraw that corner
- Clears any typed dimension

**Example:**
```
You: Click, click, click (oops, wrong position)
Press ESC → Last click removed
Now: Click again in correct position
```

**Console output:**
```
↶ ESC - undoing last vertex
```

### 3. Double ESC to Clear All

**Press ESC twice quickly (within 0.5 seconds):**
- Clears entire drawing
- Starts completely over
- Back to beginning

**Example:**
```
You: Click, click, type, click (this whole thing is wrong)
Press ESC, ESC quickly → Everything cleared
Now: Start fresh
```

**Console output:**
```
⚡ Double ESC - clearing all drawing
```

---

## 📊 Status Bar Indicators

### While Drawing:

**Bottom status bar shows:**

1. **Vertices: X** - Number of corners placed
2. **⊥ ORTHOGONAL (90°)** - Green badge when Shift is held
3. **📏 15m** - Blue badge showing typed dimension
4. **✓ Finish** - Green button (appears after 3+ vertices)
5. **✕ Cancel** - Red button (clear all and start over)

**Example Status Bar:**
```
┌────────────────────────────────────────────┐
│  Vertices: 3  │  ⊥ ORTHOGONAL (90°)  │      │
│               │  📏 15m               │      │
│  [✓ Finish]   │  [✕ Cancel]          │      │
└────────────────────────────────────────────┘
```

---

## ✅ Complete Workflow Examples

### Example 1: Draw a 10m × 15m Rectangle (Precision)

```
1. Click on map → First corner
2. Type: 1 0 → Shows "📏 10m"
3. Hold Shift → Line turns green
4. Move mouse to the right → Snaps to 90° (east)
5. Press Enter → Second corner at exactly 10m

6. Type: 1 5 → Shows "📏 15m"
7. Hold Shift → Line turns green
8. Move mouse upward → Snaps to 0° (north)
9. Press Enter → Third corner at exactly 15m

10. Type: 1 0 → Shows "📏 10m"
11. Hold Shift → Line turns green
12. Move mouse to the left → Snaps to 270° (west)
13. Press Enter → Fourth corner at exactly 10m

14. Right-click → Polygon closes (connects to first corner)

Result: Perfect 10m × 15m rectangle!
```

### Example 2: Draw Irregular Shape (Mouse Only)

```
1. Click at position A → First corner
2. Click at position B → Second corner
3. Click at position C → Third corner
4. Click at position D → Fourth corner
5. Click at position E → Fifth corner
6. Right-click → Polygon finished

Result: 5-sided irregular polygon following terrain!
```

### Example 3: Hybrid Drawing (House with Road Alignment)

```
Scenario: House with 15m frontage on road, irregular back boundary

1. Click on road edge → First corner (street-facing)
2. Type: 1 5 → "📏 15m"
3. Hold Shift, move mouse along road direction
4. Press Enter → Second corner exactly 15m along road ✓

5. Click roughly at back corner → Third corner (free form)
6. Click at other back corner → Fourth corner (free form)
7. Right-click → Finished!

Result: Precise 15m street frontage, natural back boundary!
```

### Example 4: Made a Mistake - Use ESC

```
1. Click, click, click → 3 corners
2. Type: 2 0, press Enter → Fourth corner at 20m
3. (Oops! Should be 25m)
4. Press ESC → Last vertex removed
5. Type: 2 5, press Enter → Fourth corner at 25m ✓
6. Continue...
```

### Example 5: Completely Wrong - Double ESC

```
1. Click, click, click, click → 4 corners
2. (Wait, this is all wrong!)
3. Press ESC, ESC (quickly) → All cleared
4. Start over from scratch ✓
```

---

## 🎯 Tips & Best Practices

### When to Use Mouse:
- ✅ Irregular boundaries (following terrain)
- ✅ Quick rough shapes
- ✅ Organic/curved approximations
- ✅ When you don't care about exact dimensions

### When to Use Keyboard:
- ✅ Known exact measurements (e.g., "15 meters from road")
- ✅ Building rectangles/squares
- ✅ Following architectural plans
- ✅ When precision is critical

### When to Use Shift:
- ✅ Creating right angles (90°)
- ✅ Aligning with roads/boundaries
- ✅ Drawing rectangular buildings
- ✅ Creating grid-aligned shapes

### When to Use ESC:
- ✅ Last vertex is wrong → ESC once
- ✅ Need to redo one corner → ESC once
- ✅ Entire drawing is wrong → ESC twice

---

## 🔍 Troubleshooting

### Issue: "Typing doesn't work"

**Cause:** Drawing hasn't started

**Fix:**
1. Click once on map to start drawing
2. Then try typing
3. Look for "Vertices: 1" in status bar

### Issue: "Enter doesn't place vertex"

**Cause:** No dimension typed or cursor not on map

**Fix:**
1. Type numbers first (e.g., `1`, `5` for 15m)
2. Move mouse over map (preview line should show)
3. Then press Enter

### Issue: "Double ESC doesn't clear"

**Cause:** ESC presses too slow (more than 0.5 seconds apart)

**Fix:**
1. Press ESC, ESC quickly (within half a second)
2. Should see: `⚡ Double ESC - clearing all drawing` in console
3. If too slow, it just undoes last vertex twice

### Issue: "Shift doesn't snap to 90°"

**Cause:** Drawing not started or not holding Shift while moving mouse

**Fix:**
1. Start drawing (click once)
2. Hold Shift key down
3. Move mouse → Line should turn GREEN
4. Look for "⊥ ORTHOGONAL (90°)" in status bar

### Issue: "Can't finish polygon"

**Cause:** Less than 3 vertices

**Fix:**
1. Need at least 3 corners for a polygon
2. Click/type+Enter until you have 3+ vertices
3. "✓ Finish" button will appear
4. Then right-click or press button

---

## 🎓 Keyboard Shortcuts Reference

| Key | Action | Notes |
|-----|--------|-------|
| **Click** | Place vertex | Free-form drawing |
| **0-9, .** | Type dimension | Shows in blue badge |
| **Enter** | Apply dimension | Places vertex at exact distance |
| **Shift (hold)** | Snap to 90° | Line turns green, orthogonal mode |
| **ESC (once)** | Undo last vertex | Remove last corner |
| **ESC ESC (quick)** | Clear all | Start completely over |
| **Backspace** | Delete digit | When typing dimension |
| **Right-click** | Finish polygon | Must have 3+ vertices |

---

## 🎨 Visual Indicators

### Preview Line Colors:

- **Orange dashed line** = Normal preview (free angle)
- **Green dashed line** = Orthogonal preview (Shift held, 90° snap)

### Status Bar Badges:

- **Vertices: X** = Gray, number of corners
- **⊥ ORTHOGONAL (90°)** = Green, Shift is held
- **📏 15m** = Blue, typed dimension
- **✓ Finish** = Green button, complete polygon
- **✕ Cancel** = Red button, clear all

### Help Popup (Before Drawing):

```
┌──────────────────────────┐
│        🖱️📐             │
│   Click to draw freely   │
│                          │
│ • Click to place vertices│
│ • Type number + Enter    │
│   for exact distance     │
│ • Hold Shift for 90° snap│
│ • ESC to undo,           │
│   double ESC to clear    │
└──────────────────────────┘
```

---

## 📝 Console Messages Reference

### Starting:
```
🖱️ Starting drawing with mouse click
```

### Placing Vertices:
```
🖱️ Placing vertex at click position
```

### Typing Dimension:
```
📏 Dimension input: 15
```

### Applying Dimension:
```
✅ Enter pressed - applying dimension: 15
📐 Applying dimension: {length: '15m', bearing: '89.8°', finalBearing: '90.0°', orthogonal: true}
✅ Vertex placed at exact distance: 15m
```

### Shift Key:
```
🔧 Shift pressed - orthogonal mode ON
🔧 Orthogonal snap: 87.3° → 90.0°
🔧 Shift released - orthogonal mode OFF
```

### Undo:
```
↶ ESC - undoing last vertex
```

### Clear All:
```
⚡ Double ESC - clearing all drawing
```

### Finishing:
```
✅ Polygon completed with 4 vertices - drag vertices to adjust
```

---

## ✨ Summary

**What's New:**
- ✅ Click with mouse to place vertices freely
- ✅ Type dimension + Enter for exact placement (optional)
- ✅ ESC to undo last vertex
- ✅ Double ESC to clear all
- ✅ Mix mouse and keyboard anytime

**What Stayed:**
- ✅ Hold Shift for 90° snap (works with both mouse and keyboard)
- ✅ Visual preview with colored lines
- ✅ Drag corners after finishing
- ✅ Status bar with indicators

**Best Part:**
- 🎯 **You choose!** Use mouse for speed, keyboard for precision, or mix both!

---

## 🚀 Try It Now!

1. **Go to Step 2:** Location Intelligence Report
2. **Scroll to map**
3. **See the help popup:** "Click to draw freely"
4. **Start clicking!** Or type dimensions. Your choice!

**Have fun drawing! 🎨**
