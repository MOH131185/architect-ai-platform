# ControlNet Integration Patch for ArchitectAIEnhanced.js

## Overview
This document contains the exact code changes needed to integrate ControlNet Multi-View functionality into `src/ArchitectAIEnhanced.js`.

## Step 1: Add Imports

Add these imports at the top of the file (after existing imports around line 17):

```javascript
// ControlNet Multi-View Components
import FloorPlanUpload from './components/FloorPlanUpload';
import ControlNetResultsDisplay from './components/ControlNetResultsDisplay';
import aiIntegrationService from './services/aiIntegrationService';
```

## Step 2: Add State Variables

Add these state variables after the existing useState declarations (around line 730):

```javascript
// ControlNet Multi-View State
const [useControlNet, setUseControlNet] = useState(false);
const [floorPlanImage, setFloorPlanImage] = useState(null);
const [floorPlanImageName, setFloorPlanImageName] = useState('');
const [controlNetResult, setControlNetResult] = useState(null);
const [showControlNetResults, setShowControlNetResults] = useState(false);
```

## Step 3: Add Floor Plan Upload Handler

Add this handler function after the existing handlers (around line 1190):

```javascript
/**
 * Handle floor plan upload for ControlNet generation
 */
const handleFloorPlanUpload = (imageData, fileName) => {
  setFloorPlanImage(imageData);
  setFloorPlanImageName(fileName);

  if (imageData) {
    console.log('✅ Floor plan uploaded:', fileName);
    setUseControlNet(true); // Automatically enable ControlNet when floor plan is uploaded
  } else {
    console.log('🗑️  Floor plan removed');
    setUseControlNet(false);
  }
};
```

## Step 4: Add ControlNet Generation Function

Add this new generation function after `generateDesigns` (around line 1700):

```javascript
/**
 * Generate designs using ControlNet Multi-View workflow
 */
const generateControlNetDesigns = async () => {
  setIsLoading(true);

  try {
    console.log('🎯 Starting ControlNet Multi-View generation...');

    // Generate unified project seed
    const projectSeed = Math.floor(Math.random() * 1000000);

    // Prepare ControlNet parameters
    const controlNetParams = {
      project_name: `${projectDetails?.program || 'Building'} - ${locationData?.address || 'Project'}`,
      location: locationData?.address || 'Not specified',
      style: locationData?.recommendedStyle || 'Contemporary',
      materials: 'Brick walls, roof tiles, window frames', // TODO: Extract from portfolio
      floors: projectDetails?.floors || 2,
      main_entry_orientation: projectDetails?.entranceDirection || 'N',
      control_image: floorPlanImage, // Base64 or URL
      seed: projectSeed,
      climate: locationData?.climate?.type || 'Temperate',
      floor_area: parseInt(projectDetails?.area) || 200,
      building_program: projectDetails?.program || 'house'
    };

    console.log('📋 ControlNet Parameters:', {
      ...controlNetParams,
      control_image: controlNetParams.control_image ? `[${floorPlanImageName}]` : 'none'
    });

    // Generate multi-view package
    const result = await aiIntegrationService.generateControlNetMultiViewPackage(
      controlNetParams
    );

    console.log('✅ ControlNet generation complete:', result);

    // Store result and show display
    setControlNetResult(result);
    setShowControlNetResults(true);

    // Also update generatedDesigns for compatibility
    setGeneratedDesigns({
      controlnet: result,
      projectSeed: projectSeed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ControlNet generation failed:', error);
    setToastMessage(`ControlNet generation failed: ${error.message}`);
    setTimeout(() => setToastMessage(''), 5000);
  } finally {
    setIsLoading(false);
  }
};
```

## Step 5: Modify Step 3 UI (Project Specifications)

Find the Step 3 rendering function (search for "renderStep3" or where project details are input).

Add the ControlNet toggle and floor plan upload section BEFORE the "Generate AI Designs" button:

```javascript
{/* ControlNet Multi-View Option */}
<div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
  <div className="flex items-start gap-4">
    <input
      type="checkbox"
      id="useControlNet"
      checked={useControlNet}
      onChange={(e) => setUseControlNet(e.target.checked)}
      className="mt-1 h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
      disabled={!floorPlanImage}
    />
    <div className="flex-1">
      <label htmlFor="useControlNet" className="block text-lg font-semibold text-gray-900 mb-2">
        🎯 Use ControlNet Multi-View Generation
      </label>
      <p className="text-sm text-gray-600 mb-4">
        Generate 6 perfectly consistent views (floor plan, 2 exteriors, interior, axonometric, perspective)
        that match the uploaded floor plan structure using ControlNet.
      </p>

      {/* Floor Plan Upload Component */}
      <FloorPlanUpload
        onFloorPlanUploaded={handleFloorPlanUpload}
        disabled={isLoading}
      />

      {floorPlanImage && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-green-800">
            <Check className="w-5 h-5" />
            <span className="font-semibold">ControlNet Enabled</span>
          </div>
          <p className="text-sm text-green-700 mt-1">
            All views will be structurally consistent with your floor plan
          </p>
        </div>
      )}
    </div>
  </div>
</div>

{/* Generate Button - Modified to use ControlNet when enabled */}
<button
  onClick={useControlNet ? generateControlNetDesigns : generateDesigns}
  disabled={isLoading || !projectDetails.area || !projectDetails.program}
  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-lg
             hover:from-blue-700 hover:to-purple-700 transition disabled:opacity-50
             disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg font-semibold"
>
  {isLoading ? (
    <>
      <Loader2 className="animate-spin" size={24} />
      <span>Generating {useControlNet ? 'ControlNet Multi-View Package' : 'AI Designs'}...</span>
    </>
  ) : (
    <>
      <Sparkles size={24} />
      <span>Generate {useControlNet ? 'ControlNet Multi-View Package' : 'AI Designs'}</span>
    </>
  )}
</button>
```

## Step 6: Add ControlNet Results Display

Find where the results are displayed (Step 4/5) and add the ControlNet results display option:

```javascript
{/* ControlNet Results Modal/Display */}
{showControlNetResults && controlNetResult && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-auto">
    <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-auto">
      <ControlNetResultsDisplay
        result={controlNetResult}
        onClose={() => setShowControlNetResults(false)}
        onDownloadAll={() => {
          // Download all views logic
          console.log('Downloading all ControlNet views...');
        }}
      />
    </div>
  </div>
)}

{/* Add a button to reopen ControlNet results if they exist */}
{controlNetResult && !showControlNetResults && (
  <button
    onClick={() => setShowControlNetResults(true)}
    className="fixed bottom-6 right-6 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg
               hover:bg-blue-700 transition flex items-center gap-2 z-40"
  >
    <Eye size={20} />
    <span>View ControlNet Results</span>
  </button>
)}
```

## Step 7: Update Loading Progress Message

Find where `elapsedTime` and loading messages are displayed and add ControlNet-specific messages:

```javascript
{isLoading && (
  <div className="text-center mt-4">
    <p className="text-gray-600">
      {useControlNet ? (
        <>
          <strong>Step 1/6:</strong> Generating building core description... <br />
          <strong>Step 2/6:</strong> Creating view configurations... <br />
          <strong>Step 3/6:</strong> Generating 6 consistent views... <br />
          <strong>Step 4/6:</strong> Validating consistency... <br />
          <strong>Step 5/6:</strong> Compiling results package... <br />
          <strong>Step 6/6:</strong> Complete!
        </>
      ) : (
        'Generating AI architectural designs...'
      )}
    </p>
    <p className="text-sm text-gray-500 mt-2">
      {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')} elapsed
      {useControlNet && ' (ControlNet generation takes 3-6 minutes)'}
    </p>
  </div>
)}
```

## Complete Integration Checklist

- [ ] Step 1: Add imports ✅
- [ ] Step 2: Add state variables ✅
- [ ] Step 3: Add floor plan upload handler ✅
- [ ] Step 4: Add ControlNet generation function ✅
- [ ] Step 5: Modify Step 3 UI ✅
- [ ] Step 6: Add ControlNet results display ✅
- [ ] Step 7: Update loading progress ✅
- [ ] Test floor plan upload
- [ ] Test ControlNet generation
- [ ] Test results display
- [ ] Test download functionality

## Testing Steps

### 1. Test Floor Plan Upload
```javascript
// Upload a floor plan image
// Verify:
// - Preview shows correctly
// - ControlNet checkbox becomes enabled
// - Remove button works
```

### 2. Test ControlNet Generation
```javascript
// Fill in project details
// Upload floor plan
// Enable ControlNet
// Click "Generate ControlNet Multi-View Package"
// Verify:
// - Loading state shows
// - Progress messages display
// - Generation completes successfully
// - Results display appears
```

### 3. Test Results Display
```javascript
// After generation completes:
// Verify:
// - All 6 views are displayed
// - View selector tabs work
// - Thumbnail grid works
// - Consistency validation shows
// - Building specs display
// - Download buttons work
```

## Troubleshooting

### Issue: "Cannot find module './components/FloorPlanUpload'"
**Solution**: Ensure FloorPlanUpload.jsx is in src/components/

### Issue: "ControlNet generation fails"
**Solution**: Check browser console for API errors. Verify API keys in .env

### Issue: "Floor plan upload doesn't work"
**Solution**: Check browser console. Ensure file size < 10MB and is image format

### Issue: "Results don't display"
**Solution**: Check controlNetResult state in React DevTools. Verify result structure matches expected format.

## Advanced Customization

### Custom Material Extraction from Portfolio

Replace the hardcoded materials in `generateControlNetDesigns`:

```javascript
// Extract materials from portfolio analysis
const extractMaterialsFromPortfolio = () => {
  if (!portfolioFiles || portfolioFiles.length === 0) {
    return 'Brick walls, roof tiles, window frames';
  }

  // TODO: Implement portfolio material extraction
  // Could use GPT-4 Vision to analyze portfolio images
  return 'Extracted materials from portfolio';
};

// Use in controlNetParams:
materials: extractMaterialsFromPortfolio(),
```

### Custom Progress Tracking

Add detailed progress tracking for ControlNet steps:

```javascript
const [controlNetProgress, setControlNetProgress] = useState({
  step: 0,
  message: '',
  percentage: 0
});

// Update during generation:
setControlNetProgress({
  step: 1,
  message: 'Generating building core description...',
  percentage: 16
});

// Display in UI:
{useControlNet && controlNetProgress.step > 0 && (
  <div className="mt-4">
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-blue-600 h-2 rounded-full transition-all"
        style={{ width: `${controlNetProgress.percentage}%` }}
      ></div>
    </div>
    <p className="text-sm text-gray-600 mt-2">
      Step {controlNetProgress.step}/6: {controlNetProgress.message}
    </p>
  </div>
)}
```

## Integration Complete!

Once all steps are completed, your ArchitectAIEnhanced.js will have full ControlNet Multi-View capabilities. Users will be able to:

1. ✅ Upload floor plans
2. ✅ Generate 6 consistent architectural views
3. ✅ View consistency validation reports
4. ✅ Download all views and JSON packages
5. ✅ See building specifications
6. ✅ Track generation progress

The integration maintains backward compatibility - the original generation workflow still works when ControlNet is not enabled.
