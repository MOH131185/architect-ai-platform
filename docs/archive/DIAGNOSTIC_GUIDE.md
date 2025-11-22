# Diagnostic Guide - Troubleshooting View Generation Issues

## Current Status

Based on console logs from your latest test, we can confirm:

### ✅ What's Working:
1. All 12 views are generating successfully (no placeholders during generation)
2. Hybrid model routing is active (DALL-E 3 + Midjourney)
3. Floor plan generates with DALL-E 3
4. All elevations and sections generate with DALL-E 3
5. Exterior views generate with Midjourney
6. Interior generates with Midjourney (after 1 retry)
7. Visual details extraction working (from master exterior image)

### ❌ Reported Issues from Screenshots:
1. Ground floor plan appears missing/placeholder in UI
2. Some technical drawings not displaying correctly
3. Possible view duplication or misclassification

## Diagnostic Steps

### Step 1: Check Browser Console for Floor Plan
Open browser console and look for these specific messages:

```javascript
🔍 Floor plan result: {success: true, viewType: 'floor_plan', images: Array(1), ...}
🔍 Floor plan images: ['https://...']
📊 Extracted floor plan images: {ground: 'https://...'}
```

**Questions:**
- Does the floor plan URL start with `https://via.placeholder.com`? → **Problem**: Placeholder being used
- Does it start with `https://oaidalleapiprodscus.blob.core.windows.net`? → **Good**: DALL-E 3 image
- Does it start with `data:image`? → **Good**: Base64 converted image

### Step 2: Check Network Tab
1. Open Chrome DevTools → Network tab
2. Filter by "Img"
3. Look for floor plan image request
4. Check if it returns 200 OK or error (403, 404, etc.)

**Common Issues:**
- 403 Forbidden → Image proxy blocking the URL
- 404 Not Found → Image URL is invalid
- CORS error → Need to use proxy

### Step 3: Check Image Generation Logs
Look in server console for this exact sequence:

```
🎨 [2/12] Generating floor_plan using extracted details...
   📐 Using DALL-E 3 for floor_plan (technical precision)...
   ✅ DALL-E 3 generation successful for floor_plan
   ✅ floor_plan generated with Midjourney
```

**Wait, what?** Notice it says "DALL-E 3 generation successful" BUT ALSO "floor_plan generated with Midjourney"?

This is a **logging bug** - it always says "generated with Midjourney" even when using DALL-E 3.

### Step 4: Verify Actual Image URLs
In browser console, run:

```javascript
// Get the AI result from React state
const aiResult = window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.get(1)?.currentRootFiber?.memoizedState?.element?.props?.children?.props?.aiResult

// Check floor plan structure
console.log('Floor Plans:', aiResult?.floorPlans)
console.log('Image Generation:', aiResult?.imageGeneration?.allImages?.find(i => i.viewType === 'floor_plan'))
```

This will show you the EXACT structure and URLs.

## Known Issues & Fixes

### Issue 1: Source Field Always Shows 'dalle3'
**File**: aiIntegrationService.js line 753
**Problem**: Hardcoded `source: 'dalle3'` for all results
**Impact**: Can't tell which model was actually used

**Fix Needed**:
```javascript
// Current (wrong):
source: 'dalle3',

// Should be:
source: isTechnical ? 'dalle3' : 'midjourney',
```

### Issue 2: Success Message Says Wrong Model
**File**: aiIntegrationService.js line 764
**Problem**: Always logs "generated with Midjourney"
**Impact**: Confusing logs

**Fix Needed**:
```javascript
// Current (wrong):
console.log(`   ✅ ${req.viewType} generated with Midjourney${retries > 0 ...`);

// Should be:
const modelUsed = isTechnical ? 'DALL-E 3' : 'Midjourney';
console.log(`   ✅ ${req.viewType} generated with ${modelUsed}${retries > 0 ...`);
```

### Issue 3: Floor Plan Might Be There But Not Displaying
**Possible Causes:**
1. CSS hiding it (check z-index, display properties)
2. Image onError handler replacing it with placeholder
3. React state not updating properly
4. Image proxy failing silently

**Debug in Browser Console:**
```javascript
// Find the floor plan image element
const floorPlanImg = document.querySelector('img[alt*="floor plan" i]') ||
                     document.querySelector('img[src*="floor"]')

console.log('Floor Plan Image:', {
  src: floorPlanImg?.src,
  displayed: floorPlanImg?.style.display,
  visible: floorPlanImg?.offsetHeight > 0,
  error: floorPlanImg?.complete && floorPlanImg?.naturalHeight === 0
})
```

## Quick Fixes to Apply

### Fix 1: Correct Source Field
```javascript
// In aiIntegrationService.js around line 753
results.push({
  success: true,
  viewType: req.viewType,
  images: images.map(img => img.url),
  revisedPrompt: images[0]?.revised_prompt,
  source: isTechnical ? 'dalle3' : 'midjourney',  // ← FIX THIS
  promptKit,
  attempts: retries + 1,
  isMaster: isMaster || false,
  usedExtractedDetails: !isMaster && extractedVisualDetails && !extractedVisualDetails.fallback
});
```

### Fix 2: Correct Logging
```javascript
// In aiIntegrationService.js around line 764
const modelUsed = this.isTechnicalView(req.viewType) ? 'DALL-E 3' : 'Midjourney';
console.log(`   ✅ ${req.viewType} generated with ${modelUsed}${retries > 0 ? ` (attempt ${retries + 1})` : ''}`);
```

## What to Share for Further Diagnosis

Please provide:

1. **Browser Console Output** - Copy all messages starting from:
   ```
   🔍 Floor plan result:
   🔍 Floor plan images:
   📊 Extracted floor plan images:
   ```

2. **Network Tab Screenshot** - Filter by "Img" and show floor plan request

3. **Server Console Output** - The section showing:
   ```
   🎨 [2/12] Generating floor_plan...
   ...
   ✅ floor_plan generated...
   ```

4. **React DevTools** - Component state showing `aiResult.floorPlans`

5. **Screenshot of UI** - Specifically the floor plan area

## Expected vs Actual

### Expected Console Output (After Fixes):
```
✅ Completed 12 image generations (HYBRID APPROACH)
   📐 DALL-E 3 (Technical): 8/12  ← floor plans, elevations, sections, axonometric
   📸 Midjourney (Photorealistic): 4/12  ← exterior_front, exterior_side, interior, perspective
   ❌ Placeholder: 0/12
```

### Actual Console Output (Current):
```
✅ Completed 12 image generations (HYBRID APPROACH)
   📐 DALL-E 3 (Technical): 12/12  ← WRONG - should be 8
   📸 Midjourney (Photorealistic): 0/12  ← WRONG - should be 4
   ❌ Placeholder: 0/12
```

This confirms the `source` field bug.

## Next Steps

1. Apply Fix #1 and Fix #2 above
2. Run new generation
3. Check console logs match expected output
4. Verify floor plan displays correctly
5. Share diagnostic info if still not working
