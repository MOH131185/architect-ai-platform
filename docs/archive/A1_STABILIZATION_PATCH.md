# A1 Sheet Stabilization Patch

## Quick Application Guide

Apply these changes to stabilize the A1 Sheet One-Shot workflow.

## File 1: `src/services/aiIntegrationService.js`

### Add import at top (after line 15):
```javascript
import { safeParseJsonFromLLM } from '../utils/parseJsonFromLLM';
```

### Replace line 228 (JSON.parse for style signature):
```javascript
// OLD:
const signature = JSON.parse(signatureText);

// NEW:
const signature = safeParseJsonFromLLM(signatureText, {
  materialsPalette: ['brick', 'glass', 'concrete'],
  facadeArticulation: 'modern',
  lighting: 'natural daylight'
});
```

### Replace line 636 (JSON.parse for extracted details):
```javascript
// OLD:
const extractedDetails = JSON.parse(response.choices[0].message.content);

// NEW:
const extractedDetails = safeParseJsonFromLLM(response.choices[0].message.content, {
  floors_visible: 2,
  materials: ['brick'],
  windows: { count: 10, style: 'modern' }
});
```

## File 2: `src/services/dnaWorkflowOrchestrator.js`

### Add import at top (after line 20):
```javascript
import normalizeDNA from './dnaNormalization';
```

### Update runA1SheetWorkflow - after line 427 (after getting masterDNA):
```javascript
// After: const masterDNA = dnaResult.masterDNA;

// Add normalization:
const normalizedDNA = normalizeDNA(masterDNA, {
  floors: projectContext.floors || 2,
  area: projectContext.floorArea || projectContext.area || 200,
  style: projectContext.architecturalStyle || 'Contemporary'
});

console.log('🔄 DNA normalized for consistency');
console.log(`   Materials: ${normalizedDNA.materials.length} items (array)`);
console.log(`   Floors: ${normalizedDNA.dimensions.floors}`);

// Then use normalizedDNA instead of masterDNA:
const masterDNA = normalizedDNA;
```

### Disable geometryFirst - add at start of runA1SheetWorkflow (after line 398):
```javascript
async runA1SheetWorkflow(ctx) {
  console.log('\n📐 ========================================');
  console.log('📐 A1 SHEET WORKFLOW (ONE-SHOT)');
  console.log('📐 ========================================\n');

  // Disable geometry-first feature for A1 workflow
  const { isFeatureEnabled, setFeatureFlag } = await import('../config/featureFlags.js');
  const wasGeometryEnabled = isFeatureEnabled('geometryFirst');
  if (wasGeometryEnabled) {
    console.log('🔧 Temporarily disabling geometryFirst for A1 workflow...');
    setFeatureFlag('geometryFirst', false);
  }

  try {
    // ... rest of workflow
  } finally {
    // Restore geometryFirst setting
    if (wasGeometryEnabled) {
      setFeatureFlag('geometryFirst', true);
      console.log('🔧 Restored geometryFirst setting');
    }
  }
}
```

## File 3: `src/ArchitectAIEnhanced.js`

### Update after line 1910 (after aiResult received):
```javascript
// After: console.log('✅ AI design generation complete:', aiResult);

// Check if A1 workflow
if (aiResult.workflow === 'a1-sheet-one-shot') {
  console.log('📐 A1 Sheet workflow detected - skipping multi-view extractors');

  if (aiResult.success && aiResult.a1Sheet) {
    console.log('✅ A1 Sheet available:', aiResult.a1Sheet.url?.substring(0, 80) + '...');

    // Set generation results with ONLY A1 sheet
    const designData = {
      workflow: 'a1-sheet-one-shot',
      a1Sheet: aiResult.a1Sheet,
      masterDNA: aiResult.masterDNA,
      reasoning: aiResult.reasoning || {},
      projectContext: aiResult.projectContext,
      locationData: aiResult.locationData,
      validation: aiResult.validation,
      timestamp: new Date().toISOString(),
      // NO floor plans, NO technical drawings, NO 3D views
      floorPlan: { efficiency: '85%', floorCount: aiResult.masterDNA?.dimensions?.floors || 2 },
      model3D: { images: [] },
      technicalDrawings: { elevations: {}, sections: {} }
    };

    setGeneratedDesigns(designData);
    setIsLoading(false);
    updateProgress('', 0, '');
    setCurrentStep(5);
    return; // EXIT EARLY - skip extractors
  } else {
    console.error('❌ A1 Sheet workflow failed:', aiResult.error);
    setToastMessage(`A1 Sheet generation failed: ${aiResult.error || 'Unknown error'}`);
    setTimeout(() => setToastMessage(''), 5000);
    setIsLoading(false);
    return;
  }
}

// Only run extractors if NOT A1 workflow
updateProgress('Processing', 6, 'Processing and validating results...');
```

## File 4: Update A1SheetViewer (already created, verify aspect ratio)

### In `src/components/A1SheetViewer.jsx` - ensure correct aspect ratio:
```javascript
// Around line 120 (image container):
<img
  ref={imageRef}
  src={sheetData.url}
  alt="A1 Architectural Presentation Sheet"
  className="max-w-full max-h-full object-contain"
  style={{
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    aspectRatio: '1.414'  // A1 landscape ratio
  }}
  draggable={false}
  onError={(e) => {
    console.error('Failed to load A1 sheet image');
    e.target.style.display = 'none';
  }}
/>
```

## Testing After Applying Patch

1. **Clear browser cache and localStorage**:
```javascript
localStorage.clear();
location.reload();
```

2. **Check console for these messages**:
```
📐 Using A1 Sheet One-Shot workflow (single comprehensive sheet, ~30s generation)
🔧 Temporarily disabling geometryFirst for A1 workflow...
🧬 STEP 1: Generating Master Design DNA...
✅ [DNA Generator] Master Design DNA generated and normalized
   Materials: 2 items (array)
   Floors: 2
🔍 STEP 2: Validating Master DNA...
✅ DNA validation passed
📝 STEP 3: Building A1 sheet prompt...
✅ A1 sheet prompt generated
🎨 STEP 4: Generating A1 sheet image...
✅ [FLUX.1-dev] A1 sheet generated successfully
✅ A1 SHEET WORKFLOW COMPLETE
📐 A1 Sheet workflow detected - skipping multi-view extractors
✅ A1 Sheet available: https://...
```

3. **Expected UI**:
- ✅ Single A1 sheet displayed in viewer
- ✅ No "Floor Plan Loading" placeholders
- ✅ No multi-view grid
- ✅ Zoom/pan controls work
- ✅ Download PNG button works
- ✅ Proper 1.414:1 aspect ratio maintained

## If Still Seeing Issues

### Issue: "materials.map is not a function"
**Fix**: Verify `dnaNormalization.js` was created and imported correctly

### Issue: Still showing placeholders
**Fix**: Verify early return in ArchitectAIEnhanced.js after setting A1 sheet data

### Issue: Aspect ratio wrong
**Fix**: Check `aspectRatio: '1.414'` in A1SheetViewer.jsx image style

### Issue: JSON parse errors
**Fix**: Verify `parseJsonFromLLM.js` was created and imported in both services

## Summary of Changes

1. ✅ Created `utils/parseJsonFromLLM.js` - Robust JSON parsing
2. ✅ Created `services/dnaNormalization.js` - Consistent DNA structure
3. ✅ Updated `enhancedDesignDNAService.js` - Use safeParseJsonFromLLM + normalizeDNA
4. ⏳ Update `aiIntegrationService.js` - Use safeParseJsonFromLLM (2 locations)
5. ⏳ Update `dnaWorkflowOrchestrator.js` - Normalize DNA + disable geometryFirst
6. ⏳ Update `ArchitectAIEnhanced.js` - Skip extractors for A1 workflow
7. ✅ Created `A1SheetViewer.jsx` - Already has proper aspect ratio

Apply remaining patches (4-6) and test!
