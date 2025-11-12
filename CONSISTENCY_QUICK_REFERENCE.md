# Consistency System Quick Reference

**For Developers:** Fast lookup guide for understanding and modifying the consistency system

---

## File Map

```
Consistency System Files:
├── src/services/enhancedAIIntegrationService.js    [MASTER ORCHESTRATOR - 6-step workflow]
├── src/services/aiIntegrationService.js            [Style signatures, visual extraction, prompts]
├── src/services/designDNAGenerator.js              [Ultra-detailed specifications via OpenAI]
├── src/services/openaiService.js                   [GPT-4 completions, view classification]
├── src/utils/floorPlan2DEnforcement.js             [Post-processing 3D → 2D conversion]
├── src/services/maginaryService.js                 [Midjourney integration]
└── src/services/bimService.js                      [BIM model generation (not used for floor plans yet)]

Documentation:
├── CONSISTENCY_ANALYSIS_REPORT.md                  [Complete 92-page analysis]
├── CONSISTENCY_EXECUTIVE_SUMMARY.md                [Executive overview]
├── CONSISTENCY_QUICK_REFERENCE.md                  [This file]
└── FULL_CONSISTENCY_IMPLEMENTATION.md              [Previous implementation docs]
```

---

## Key Constants & Variables

```javascript
// Project-wide consistency identifier
projectSeed = Math.floor(Math.random() * 1000000); // Generated once in ArchitectAIEnhanced.js

// Style blending weights (0-1 scale)
materialWeight = 0.5;        // 0 = all local materials, 1 = all portfolio materials
characteristicWeight = 0.5;  // 0 = all local characteristics, 1 = all portfolio characteristics

// OpenAI temperature settings
DNA_GENERATION_TEMP = 0.3;       // Low for consistent specifications
VISUAL_EXTRACTION_TEMP = 0.1;    // Very low for precise extraction
VIEW_CLASSIFICATION_TEMP = 0.1;  // Very low for accurate classification

// View types (11 total)
VIEWS = [
  'floor_plan',
  'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
  'section_longitudinal', 'section_cross',
  'exterior', 'interior', 'axonometric', 'perspective'
];
```

---

## Quick Debugging

### Issue: Different materials across views

**Check:**
1. `buildingDNA.materials.exterior.primary` - Is it defined?
2. `extractedVisualDetails.materials.facade` - Was extraction successful?
3. Console log: "🎯 Using EXTRACTED VISUAL DETAILS" - Was it used?

**Fix:**
```javascript
// In aiIntegrationService.js buildPromptKit()
// Ensure extractedDetails is not null and not fallback
if (extractedDetails && !extractedDetails.fallback) {
  materialStr = extractedDetails.materials?.facade || materialStr;
}
```

### Issue: Wrong floor count

**Check:**
1. `buildingDNA.dimensions.floorCount` - What's the DNA value?
2. `extractedVisualDetails.floors_visible` - What did vision extract?
3. Line 458-464 in aiIntegrationService.js - Is override working?

**Fix:**
```javascript
// In extractVisualDetailsFromImage()
const totalFloors = buildingDNA?.dimensions?.floors || buildingDNA?.dimensions?.floorCount;
if (totalFloors && extractedDetails.floors_visible !== totalFloors) {
  console.log(`🔧 Overriding extracted floors (${extractedDetails.floors_visible}) with DNA (${totalFloors})`);
  extractedDetails.floors_visible = totalFloors;
}
```

### Issue: 3D floor plans

**Check:**
1. Line 611-628 in aiIntegrationService.js - Is 2D enforcement running?
2. Console log: "🔧 Applying 2D floor plan enforcement" - Was it applied?
3. `enforce2DFloorPlan()` - Did it throw an error?

**Better Solution:**
```javascript
// Use BIM-based floor plans instead
if (req.viewType === 'floor_plan') {
  const floorPlanImage = await bimService.deriveFloorPlan(context.bimModel, {
    floor: 0,
    style: '2d_blueprint'
  });
  // Skip AI generation, use BIM output
}
```

### Issue: Midjourney not using seed

**Check:**
1. `maginaryService.generateImage()` - Is seed parameter passed?
2. `context.projectSeed` - Is it defined?

**Fix:**
```javascript
// In aiIntegrationService.js line 583
const result = await maginaryService.generateImage({
  prompt: promptKit.prompt,
  aspectRatio: aspectRatio,
  quality: 2,
  stylize: 100,
  seed: context.projectSeed // ADD THIS LINE
});

// Also update maginaryService.js to accept seed
async generateImage({ prompt, aspectRatio, quality, stylize, raw, seed }) {
  const payload = { prompt, aspectRatio, quality, stylize, raw };
  if (seed) payload.seed = seed; // Add to payload
  // ...
}
```

### Issue: Style signature not cached

**Check:**
1. `aiIntegrationService.styleSignatureCache` - Is it set?
2. Console log: "✅ Using cached style signature" - Does it appear?

**Fix:**
```javascript
// In generateStyleSignature()
// Cache for this project session
this.styleSignatureCache = signature;

// To clear cache (between projects)
aiIntegrationService.styleSignatureCache = null;
```

---

## Common Code Patterns

### Pattern 1: Extract DNA safely

```javascript
const buildingDNA = projectContext.buildingDNA ||
                    projectContext.masterDesignSpec ||
                    projectContext.comprehensiveDNA ||
                    {};

const dnaMaterials = buildingDNA.materials?.exterior || {};
const materialPrimary = dnaMaterials.primary || 'brick';
const materialColor = dnaMaterials.color || 'natural';
const materialTexture = dnaMaterials.texture || 'smooth finish';

const specificMaterials = `${materialPrimary} (${materialColor}) with ${materialTexture}`;
```

### Pattern 2: Build prompt with DNA

```javascript
const promptKit = this.buildPromptKit(
  styleSignature,
  req.viewType,
  req.meta || context,
  extractedVisualDetails  // Pass extracted details for consistency
);

// promptKit contains:
// - prompt: Full prompt string with DNA specifications
// - negativePrompt: Things to avoid
// - size: Image dimensions (e.g., "1024x1024")
// - camera: Camera settings (for 3D views)
// - viewType: View type identifier
```

### Pattern 3: Handle async errors gracefully

```javascript
try {
  const dna = await designDNAGenerator.generateComprehensiveDesignDNA(context);
  console.log('✅ DNA generated successfully');
} catch (error) {
  console.error('❌ DNA generation failed:', error);
  const dna = designDNAGenerator.generateEnhancedFallbackDNA(context);
  console.log('⚠️ Using fallback DNA');
}
```

### Pattern 4: Sequential generation with master

```javascript
for (let i = 0; i < viewRequests.length; i++) {
  const req = viewRequests[i];
  const isMaster = (i === 0) && (req.viewType === 'exterior' || req.viewType === 'exterior_front');

  if (isMaster) {
    // Generate master
    const images = await generateImage(promptKit);
    masterImageUrl = images[0].url;

    // Extract details
    extractedVisualDetails = await extractVisualDetailsFromImage(
      masterImageUrl,
      context.buildingDNA
    );
  } else {
    // Generate other views using extracted details
    const promptKit = buildPromptKit(
      styleSignature,
      req.viewType,
      context,
      extractedVisualDetails  // Use master's details
    );
    const images = await generateImage(promptKit);
  }
}
```

---

## Environment Variables

**Required in `.env` (development) and Vercel (production):**

```bash
# OpenAI (for DNA generation, style signatures, visual extraction)
REACT_APP_OPENAI_API_KEY=sk-proj-...your_key...
OPENAI_API_KEY=sk-proj-...your_key...

# Midjourney (for image generation)
REACT_APP_MAGINARY_API_KEY=...your_key...

# Google Maps (for location intelligence)
REACT_APP_GOOGLE_MAPS_API_KEY=...your_key...

# OpenWeather (for climate data)
REACT_APP_OPENWEATHER_API_KEY=...your_key...
```

---

## API Endpoints

### Development (localhost:3001)
```
POST /api/openai/chat          → OpenAI chat completions
POST /api/replicate/predictions → Replicate image generation (not used if Midjourney)
GET  /api/proxy/image?url=...  → CORS proxy for image loading
```

### Production (Vercel)
```
POST /api/openai-chat          → OpenAI serverless function
GET  /api/proxy-image?url=...  → CORS proxy serverless function
```

---

## Console Log Patterns

**Success patterns to look for:**

```
🎯 ============================================
🎯 STARTING COMPLETE INTELLIGENT DESIGN WORKFLOW
🎯 ============================================

📍 STEP 1: UK Location Intelligence Analysis
✅ UK Analysis Complete

🎨 STEP 2: Portfolio Analysis with GPT-4 Vision
✅ Portfolio Analysis Complete

🎨 STEP 3: Style Blending (Portfolio + Location)
✅ Style Blending Complete

🧬 STEP 4: Creating Comprehensive Design DNA for 80%+ Consistency
✅ Comprehensive Design DNA Created

🎨 STEP 4.5: Generating Style Signature for DALL·E 3 Consistency
✅ Style signature generated

🏗️ STEP 5: Generating All Architectural Views with DALL·E 3
🎨 [MASTER] Generating master exterior for visual reference...
✅ Midjourney generation successful
🔍 Extracting exact visual details from master image...
✅ Visual details extracted successfully
🎨 [2/11] Generating floor_plan using extracted details...
✅ Floor plan converted to 2D blueprint style
...

✅ ============================================
✅ COMPLETE INTELLIGENT DESIGN WORKFLOW FINISHED
✅ ============================================
```

**Error patterns to watch for:**

```
❌ DNA generation failed: ...           → OpenAI API key missing or rate limit
⚠️ Using fallback DNA                   → Acceptable, but check if recurring
❌ Midjourney failed: ...                → Maginary API key issue or rate limit
⚠️ Using placeholder image               → Critical - no image generated
❌ Visual extraction failed: ...         → GPT-4o Vision error
⚠️ Using Building DNA only               → Acceptable, but less consistent
⚠️ View mismatch: expected floor_plan, got axonometric  → Auto-regeneration triggered
```

---

## Performance Optimization

### Reduce Generation Time

**Current:** 3-5 minutes for 11 views

**Options:**
1. **Parallel generation** (risky - reduces consistency)
   ```javascript
   // Generate all views in parallel
   const results = await Promise.all(
     viewRequests.map(req => generateImage(req))
   );
   ```

2. **Progressive enhancement** (recommended)
   ```javascript
   // Generate core views first (3), then rest (8)
   const coreViews = ['floor_plan', 'elevation_north', 'exterior_front'];
   const coreResults = await generateSequentially(coreViews);
   // Show preview to user, get approval
   const allResults = await generateSequentially(remainingViews);
   ```

3. **Skip less important views**
   ```javascript
   // Only generate 6 essential views instead of 11
   const essentialViews = [
     'floor_plan',
     'elevation_north',
     'section_longitudinal',
     'exterior', 'interior', 'axonometric'
   ];
   ```

### Reduce API Costs

**Current:** $0.58-1.08 per design

**Options:**
1. **Cache more aggressively**
   ```javascript
   // Cache style signature across projects with same parameters
   const cacheKey = `${architecturalStyle}_${area}_${materials}`;
   if (styleSignatureCache[cacheKey]) {
     return styleSignatureCache[cacheKey];
   }
   ```

2. **Skip optional steps**
   ```javascript
   // Skip view validation for non-critical views
   if (!['floor_plan', 'elevation_north'].includes(req.viewType)) {
     // Skip GPT-4o Vision classification
   }
   ```

3. **Use lower quality for previews**
   ```javascript
   // For preview phase, use lower quality
   const quality = isPreview ? 1 : 2; // Midjourney quality
   ```

---

## Testing Commands

```bash
# Run all tests
npm test

# Run consistency tests only
npm test -- --testPathPattern=consistency

# Run integration tests
npm test -- --testPathPattern=integration

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- designDNAGenerator.test.js
```

---

## Useful Utilities

### Extract dominant color from image

```javascript
// For consistency validation
async function extractDominantColor(imageUrl) {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }

  const pixelCount = data.length / 4;
  return {
    r: Math.round(r / pixelCount),
    g: Math.round(g / pixelCount),
    b: Math.round(b / pixelCount)
  };
}
```

### Calculate color distance

```javascript
// For consistency scoring
function colorDistance(color1, color2) {
  const rDiff = color1.r - color2.r;
  const gDiff = color1.g - color2.g;
  const bDiff = color1.b - color2.b;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff) / 441.67; // Normalize to 0-1
}
```

### Validate DNA completeness

```javascript
// Before generating images
function validateDNA(dna) {
  const required = ['dimensions', 'materials', 'roof', 'windows', 'facade'];
  const missing = required.filter(key => !dna[key]);

  if (missing.length > 0) {
    console.error('Incomplete DNA:', missing);
    return false;
  }

  return true;
}
```

---

## Code Modification Checklist

**Before modifying consistency code:**

- [ ] Read relevant documentation (this file + CONSISTENCY_ANALYSIS_REPORT.md)
- [ ] Understand current flow (trace through console logs)
- [ ] Identify which layer you're modifying (DNA, style signature, extraction, etc.)
- [ ] Check for fallback mechanisms (don't break them)
- [ ] Test with a real project generation
- [ ] Verify console logs show expected behavior
- [ ] Check that all 11 views are still generated
- [ ] Inspect visual consistency manually

**After modifying:**

- [ ] Test with UK address (enhanced intelligence)
- [ ] Test with non-UK address (fallback path)
- [ ] Test with portfolio upload
- [ ] Test without portfolio
- [ ] Verify console logs are clear and helpful
- [ ] Check API costs didn't increase significantly
- [ ] Update documentation if behavior changed
- [ ] Commit with clear message

---

## Quick Fixes for Common Issues

### Fix #1: Yellow elevations

**Symptom:** Elevations showing yellow walls instead of brick

**Root Cause:** Generic material descriptions in prompts

**Fix:** Enhance elevation prompt with exact DNA specs

```javascript
// In replicateService.js buildElevationParameters()
const dnaMaterials = buildingDNA.materials?.exterior || {};
const materialPrimary = dnaMaterials.primary || 'brick';
const materialColor = dnaMaterials.color || 'natural';
const specificMaterials = `${materialPrimary} (${materialColor})`;

// Add to prompt
prompt: `... using EXACT MATERIALS: ${specificMaterials} IDENTICAL to 3D views ...`
```

### Fix #2: 3D floor plans

**Symptom:** Floor plans rendering as 3D isometric

**Root Cause:** DALL·E 3's training bias

**Fix:** Use BIM-based floor plan generator

```javascript
// In aiIntegrationService.js
if (req.viewType === 'floor_plan') {
  try {
    const floorPlanImage = await bimService.deriveFloorPlan(context.bimModel, {
      floor: 0,
      style: '2d_blueprint'
    });
    return { success: true, images: [floorPlanImage], source: 'bim' };
  } catch (error) {
    // Fallback to AI generation
  }
}
```

### Fix #3: Inconsistent colors

**Symptom:** Different colors across views

**Root Cause:** Visual extraction not used or failed

**Fix:** Ensure extracted details are passed to all views

```javascript
// In generateConsistentImages()
if (isMaster && imageUrl) {
  extractedVisualDetails = await extractVisualDetailsFromImage(masterImageUrl, buildingDNA);

  // Validate extraction succeeded
  if (!extractedVisualDetails || extractedVisualDetails.fallback) {
    console.error('Visual extraction failed, regenerating master...');
    // Retry master generation
  }
}

// For subsequent views
const promptKit = buildPromptKit(
  styleSignature,
  req.viewType,
  context,
  extractedVisualDetails  // ALWAYS pass this
);
```

---

## Contact & Support

**Documentation:**
- Full analysis: `CONSISTENCY_ANALYSIS_REPORT.md` (92 pages)
- Executive summary: `CONSISTENCY_EXECUTIVE_SUMMARY.md` (20 pages)
- This guide: `CONSISTENCY_QUICK_REFERENCE.md` (current)

**Code owners:**
- Design DNA: `src/services/designDNAGenerator.js`
- Master workflow: `src/services/enhancedAIIntegrationService.js`
- Style signatures: `src/services/aiIntegrationService.js`

**Troubleshooting:**
1. Check console logs for error patterns
2. Verify environment variables are set
3. Test with a simple project first
4. Compare with working examples in docs

**Getting help:**
1. Search documentation for keywords
2. Check git history for recent changes
3. Review closed issues for similar problems
4. Ask on team Slack with console logs

---

**Version:** 2025-10-20
**Status:** Production Ready
**Consistency Level:** 80-85%
