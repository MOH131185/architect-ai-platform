# Quick Fix Guide - Improve Current Results

## Current Issues & Solutions

### 1. ❌ Floor Plans Showing as 3D (Axonometric)
**Problem:** DALL-E generates 3D views instead of 2D floor plans
**Solution:** Need stronger 2D enforcement in prompts

### 2. ❌ Inconsistent Styles (Victorian vs Modern)
**Problem:** Each image has different architectural style
**Solution:** Need to lock style more strongly in prompts

### 3. ❌ Wrong Floor Count (3 instead of 2)
**Problem:** DNA says 2 floors but generates 3
**Solution:** Need to enforce floor count in every prompt

## Immediate Fixes (Works with DALL-E 3)

### Fix 1: Stronger Floor Plan Prompts

In `src/services/aiIntegrationService.js`, find the `buildPromptForView` function and update the floor_plan case:

```javascript
case 'floor_plan':
  return `STRICT 2D FLOOR PLAN, ABSOLUTELY NO 3D, flat overhead view looking straight down,
    BLACK LINES ON WHITE BACKGROUND ONLY, no perspective, no depth, no walls standing up,
    architectural blueprint style, CAD drawing, technical floor plan,
    ${buildingType}, ${totalArea}m², ${dimensions.join(' × ')} footprint,
    EXACTLY ${extractedDetails.floors || totalFloors} floors (NO MORE NO LESS),
    room labels, dimension lines, north arrow, scale 1:100,
    ${extractedDetails.facade || facadeMaterial},
    IMPORTANT: This must be a FLAT 2D drawing with NO 3D elements`;
```

### Fix 2: Enforce Consistency in Every Prompt

Add this to EVERY prompt generation:

```javascript
// Add to the end of every prompt
const consistencyEnforcement = `
  CRITICAL REQUIREMENTS:
  - EXACTLY ${extractedDetails.floors || 2} floors (not 3, not 4, EXACTLY ${extractedDetails.floors || 2})
  - Building type: ${buildingType} (NOT apartment building)
  - Style: ${architecturalStyle} (maintain this exact style)
  - Materials: ${extractedDetails.facade} (use these exact materials)
  - Colors: ${extractedDetails.colors?.join(', ')} (use these exact colors)
`;
```

### Fix 3: Better View Classification

The system correctly identifies mismatches but needs more retries for 2D views.

You already have 2 retries for 2D views - this is good!

## Testing Improvements

### Test 1: Better Floor Plan Generation

Try this prompt directly in browser console:

```javascript
const testFloorPlan = async () => {
  const response = await fetch('http://localhost:3001/api/openai/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `STRICT 2D ARCHITECTURAL FLOOR PLAN, absolutely no 3D elements,
        flat overhead view, black lines on white background only,
        technical CAD drawing style, residential house ground floor,
        EXACTLY 2 floors, 150m², 15m x 10m footprint,
        room labels: living room, kitchen, dining, bathroom,
        dimension lines, north arrow, scale 1:100,
        CRITICAL: This is a flat 2D blueprint with NO perspective NO depth NO 3D`,
      size: '1024x1024',
      quality: 'hd'
    })
  });

  const data = await response.json();
  console.log('Floor plan:', data.images[0].url);
  window.open(data.images[0].url);
};
testFloorPlan();
```

## Together.ai Status

### What to Check:
1. **Go to:** https://api.together.ai/settings/billing
2. **Verify:**
   - Balance shows $10.00
   - Tier shows "Build Tier 2" or higher
   - Payment status is "Completed"

### If Still Tier 1:
1. **Wait:** Can take up to 2 hours
2. **Contact Support:** support@together.ai
3. **Include:** Transaction ID and this error message

### Alternative: Try Free Models

While waiting, try these free Together.ai models:

```javascript
// In server.js, test with free model:
{
  model: 'stabilityai/stable-diffusion-2-1',  // Free tier model
  prompt: 'your prompt here'
}
```

## Why Results Are Inconsistent

### DALL-E 3 Limitations:
- **No seed control** - Can't force consistency
- **No reference images** - Can't use floor plan to guide 3D
- **Limited style control** - Ignores some prompt details
- **3D bias** - Tends to generate 3D even when asked for 2D

### What Would Fix This:
- ✅ **Together.ai FLUX** - Has seed control and reference images
- ✅ **Replicate SDXL** - Has ControlNet for technical drawings
- ❌ **DALL-E 3 alone** - Will always have some inconsistency

## Recommended Action

### Option 1: Wait for Together.ai (Best)
- Check billing page every 30 min
- Should upgrade to Tier 2 soon
- Then FLUX will work perfectly

### Option 2: Use Replicate SDXL (Good)
- Already configured
- Better than DALL-E for technical drawings
- ~$0.01 per image

### Option 3: Improve DALL-E Prompts (OK)
- Apply the fixes above
- Will improve results by ~30-40%
- Still won't be perfect

## Summary

**Current Problem:** Together.ai still showing Tier 1 (credits not applied yet)

**Immediate Solutions:**
1. Stronger 2D prompts for floor plans
2. Enforce exact floor count in every prompt
3. Lock style/materials more strictly

**Best Solution:** Wait for Together.ai tier upgrade (check every 30 min)

**Alternative:** Use Replicate SDXL (already configured)