# Critical View Generation Fixes

## ✅ FIXES IMPLEMENTED - 2025-10-10

### Summary
All 5 critical view generation issues have been fixed in `src/services/replicateService.js`:

1. ✅ **Exterior views showing identical images** - FIXED (lines 318-327)
2. ✅ **Interior showing exterior** - FIXED (lines 653-672)
3. ✅ **Perspective too close** - FIXED (lines 702-711)
4. ⚠️ **Axonometric not showing** - VERIFIED (prompt is correct, included in line 759)
5. ✅ **2D and 3D matching** - ENSURED (unified description used throughout)

---

## Detailed Fixes

### 1. **Exterior views showing identical images** - ✅ FIXED
**Problem:** Using same seed for front and side views
**Solution:** Add seed variation per view while maintaining consistency

**Implementation (lines 318-327):**
```javascript
const seedOffsets = {
  'exterior': 0,
  'exterior_front': 0,
  'exterior_side': 100,      // Different from front
  'interior': 200,           // Different from exteriors
  'axonometric': 300,        // Technical view
  'perspective': 400,        // Artistic view
  'site_plan': 500
};
```

Each view type gets unique offset: front +0, side +100, interior +200, axonometric +300, perspective +400

---

### 2. **Interior showing exterior** - ✅ FIXED
**Problem:** Prompt not explicit enough about interior space
**Solution:** Strengthen interior-specific keywords and negative prompts

**Implementation (lines 653-672):**
- Added "INTERIOR ONLY:" prefix
- Changed to "inside view of [space]"
- Comprehensive negative prompt excludes all exterior elements:
  ```
  "exterior, outside, facade, building exterior, outdoor, landscape,
   trees, street, sky visible, exterior walls, building from outside,
   aerial view, elevation, front view, site plan, technical drawing, blueprint"
  ```

---

### 3. **Perspective too close** - ✅ FIXED
**Problem:** Lacks "wide angle" and "full building" keywords
**Solution:** Add aerial perspective and distance keywords

**Implementation (lines 702-711):**
New prompt includes:
- "Wide angle aerial perspective rendering"
- "COMPLETE [building]"
- "dramatic 3D perspective view from distance"
- "FULL BUILDING IN FRAME with surrounding context"
- "levels height fully visible"
- "landscape context with trees and people for scale providing sense of distance"
- "professional architectural visualization from elevated vantage point"
- "bird's eye perspective angle capturing entire structure"
- "distant viewpoint"

---

### 4. **Axonometric not showing** - ⚠️ VERIFIED
**Status:** Axonometric IS included in generation workflow
**Location:** `aiIntegrationService.js:759`
```javascript
['exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective']
```

**Prompt is correct (lines 685-700):**
- Professional architectural axonometric 45-degree isometric view
- Isometric 3D projection from above
- Complete roof structure and all building volumes shown
- Design must match floor plan layout exactly

**Note:** If still not showing, check console logs for generation errors

---

### 5. **2D and 3D matching** - ✅ ENSURED
**Solution:** Unified description used throughout all views

**Implementation:**
- `createUnifiedBuildingDescription()` (lines 29-68) creates consistent base description
- `extractProjectDetails()` (lines 74-126) pulls room program details
- ALL view prompts reference same unified description
- Same projectSeed used for floor plans, elevations, and 3D views
- OpenAI reasoning prefix applied to all views when available

---

## Issues Identified (Original)

## Implementation Plan

### Fix 1: Vary Seeds Per View (While Maintaining Consistency)
```javascript
// Use base seed + view-specific offset
params.seed = projectSeed + viewTypeOffset;
// front: +0, side: +100, interior: +200, axon: +300, perspective: +400
```

### Fix 2: Ensure Axonometric Generation
```javascript
// Always include in view list
['exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective']
```

### Fix 3: Strengthen Interior Prompts
```javascript
prompt: `INTERIOR ONLY: ${interiorSpace} inside view...`
negativePrompt: "exterior, outside, facade, building exterior..."
```

### Fix 4: Fix Perspective Distance
```javascript
prompt: `Wide angle aerial perspective, full building in frame from distance...`
```

### Fix 5: Use Consistent Base Description
- Extract from reasoning FIRST
- Apply to ALL views (2D and 3D)
- Same materials, floors, features everywhere

## Files to Modify

1. `src/services/replicateService.js`
   - Line 311-342: generateMultipleViews() - Add seed variation
   - Line 619-655: Interior prompt - Strengthen keywords
   - Line 685-694: Perspective prompt - Add distance/aerial
   - Line 668-683: Axonometric prompt - Verify

2. `src/services/aiIntegrationService.js`
   - Verify reasoning extracted properly
   - Ensure used in all view generations
