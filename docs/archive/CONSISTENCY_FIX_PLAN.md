# Consistency Fix Implementation Plan

## Problem Summary
Your DNA consistency system exists but has 3 critical bugs preventing it from working:

1. **Double-prompt wrapping** dilutes DNA specifications
2. **Workflow selector** not choosing DNA-enhanced path
3. **Seed offsets** breaking visual consistency

## Solution: 3 Focused Fixes

### FIX 1: Remove Double-Wrapping in togetherAIService.js

**File:** `src/services/togetherAIService.js`
**Lines:** 147-177

**Current Problem:**
```javascript
const viewPrompts = {
  floor_plan_ground: `Architectural GROUND FLOOR plan, BLACK LINES ON WHITE, ${prompt}, MUST include...`
};
const enhancedPrompt = viewPrompts[viewType] || prompt;
```

**Fix:** Use DNA prompts DIRECTLY without wrapping
```javascript
// REMOVE the viewPrompts object entirely
// USE the DNA prompt directly:
const enhancedPrompt = prompt; // prompt already contains full DNA specifications
```

**Impact:** DNA-driven prompts will be used in full detail ✅

---

### FIX 2: Force DNA-Enhanced FLUX Workflow

**File:** `src/ArchitectAIEnhanced.js`
**Lines:** 1346-1361

**Current Problem:**
```javascript
selectOptimalWorkflow(projectContext) {
  // ... conditions ...
  else {
    return 'standard'; // ❌ Using old workflow
  }
}
```

**Fix:** Default to DNA-enhanced FLUX workflow
```javascript
selectOptimalWorkflow(projectContext) {
  if (projectContext.controlImage && projectContext.elevationImages) {
    return 'controlnet';
  } else if (projectContext.location?.country === 'United Kingdom') {
    return 'uk-enhanced';
  }

  // ✅ DEFAULT: Use DNA-enhanced FLUX workflow for ALL other cases
  console.log('🧬 Using DNA-Enhanced FLUX workflow (95%+ consistency)');
  return 'flux';
}
```

**Impact:** Every generation will use the DNA consistency system ✅

---

### FIX 3: Remove Seed Offsets for True Consistency

**File:** `src/services/togetherAIService.js`
**Lines:** 124-145

**Current Problem:**
```javascript
const seedOffsets = {
  floor_plan_ground: 0,
  floor_plan_upper: 7,    // ❌ Different visual characteristics
  elevation_north: 11     // ❌ Different materials/colors
};
const effectiveSeed = seed + seedOffsets[viewType];
```

**Fix Option A - Same Seed (Maximum Consistency):**
```javascript
// REMOVE all seed offsets - use SAME seed for ALL views
const effectiveSeed = seed || designDNA?.seed || Math.floor(Math.random() * 1e6);
```

**Fix Option B - Minimal Offsets (Uniqueness + Consistency Balance):**
```javascript
// Use TINY offsets (1-3) instead of large ones (7-47)
const seedOffsets = {
  floor_plan_ground: 0,
  floor_plan_upper: 1,     // Minimal change
  elevation_north: 2,
  elevation_south: 2,      // Same as north for symmetry
  elevation_east: 3,
  elevation_west: 3,       // Same as east for symmetry
  section_longitudinal: 0, // Same as floor plans
  section_cross: 1,
  exterior_front_3d: 0,    // Same seed for 3D views
  exterior_side_3d: 0,
  axonometric_3d: 0,
  perspective_3d: 1,
  interior_3d: 2
};
```

**Recommendation:** Start with Option A (no offsets), if you get duplicates, use Option B.

**Impact:** All views will have matching materials, colors, proportions ✅

---

## Implementation Order

1. **FIX 2 first** (force FLUX workflow) - 2 minutes
2. **FIX 3 second** (remove seed offsets) - 1 minute
3. **FIX 1 third** (remove prompt wrapping) - 3 minutes

Total time: ~6 minutes

---

## Testing Checklist

After implementing all 3 fixes, test with:

```
Building Program: 2-bedroom family house
Floor Area: 150m²
Location: Manchester, UK
Style: Modern British Contemporary
```

**Expected Results:**
✅ Ground floor plan: Living/kitchen/entrance (NO bedrooms)
✅ Upper floor plan: 2 bedrooms (DIFFERENT from ground)
✅ North elevation: Front facade with entrance
✅ South elevation: Rear facade (DIFFERENT from north)
✅ 3D views: SAME red brick, SAME 2 floors, SAME window positions
✅ Elevations match 3D views (same materials, same proportions)

---

## Rollback Plan

If issues occur, rollback in reverse order:
1. Restore prompt wrapping (FIX 1)
2. Restore seed offsets (FIX 3)
3. Restore workflow selector (FIX 2)

---

## Files to Modify

1. `src/services/togetherAIService.js` (FIX 1 + FIX 3)
2. `src/ArchitectAIEnhanced.js` (FIX 2)

**Backup these files before changes!**
