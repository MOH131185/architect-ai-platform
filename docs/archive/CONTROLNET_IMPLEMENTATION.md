# ControlNet Multi-View Implementation Guide

## 🎯 Overview

This implementation adds a complete ControlNet-based multi-view architectural visualization system to ArchiAI Solution. The system generates 6 consistent views (floor plan, 2 exterior views, interior, axonometric, perspective) that maintain perfect geometric and material consistency through ControlNet conditioning.

## 📋 What Was Implemented

### 1. Core Service Layer

#### `src/services/controlNetMultiViewService.js`
Complete 6-step workflow implementation:
- **Step 1**: Context Setup (AI architecture assistant configuration)
- **Step 2**: Input parameter validation and normalization
- **Step 3**: Reasoning Phase (GPT-4o generates building_core_description)
- **Step 4**: Generation Phase (6 views with SDXL + ControlNet)
- **Step 5**: Consistency Validation (automated checks)
- **Step 6**: Output Format (complete JSON package)

**Key Methods:**
- `generateConsistentMultiViewPackage(params)` - Main entry point
- `validateAndNormalizeInput(params)` - Parameter validation
- `generateBuildingCoreDescription(inputParams)` - AI reasoning via GPT-4o
- `generateViewConfigurations(buildingCoreDescription)` - Prompt generation
- `generateAllViews(viewConfigs)` - Image generation via Replicate
- `validateConsistency(viewConfigs, results)` - Quality checks
- `compileOutputPackage(...)` - JSON assembly

### 2. Integration Layer

#### `src/services/aiIntegrationService.js` (Modified)
Added ControlNet integration methods:
- `generateControlNetMultiViewPackage(projectParams)` - Wrapper method
- `convertToControlNetParams(existingContext, floorPlanUrl)` - Context converter
- `normalizeOrientation(direction)` - Helper for orientation normalization

Feature flag support via `REACT_APP_USE_CONTROLNET_WORKFLOW`

### 3. Documentation

#### `CONTROLNET_USAGE_GUIDE.md`
Complete usage documentation including:
- System architecture overview
- Input parameter reference
- 3 usage examples (direct service, via integration, with file upload)
- Output format specification
- React component example
- Environment configuration
- Performance metrics
- Troubleshooting guide
- Advanced usage patterns

#### `test-controlnet-workflow.js`
Comprehensive test suite:
- Test 1: Basic workflow (full 6-view generation)
- Test 2: Context conversion
- Test 3: Input validation
- Test 4: Consistency validation logic

## 🏗️ Architecture

### Data Flow

```
User Input (project params + optional floor plan)
    ↓
controlNetMultiViewService.validateAndNormalizeInput()
    ↓
generateBuildingCoreDescription() → GPT-4o reasoning
    ↓
generateViewConfigurations() → Prompt generation for 6 views
    ↓
generateAllViews() → Replicate SDXL + ControlNet
    ↓
validateConsistency() → Quality checks
    ↓
compileOutputPackage() → JSON assembly
    ↓
Complete visualization package (6 views + metadata)
```

### Consistency Mechanism

The system ensures consistency through 3 layers:

1. **Unified Seed**: All 6 views use the same seed value
2. **Building Core Description**: Single source of truth for geometry, materials, colors
3. **ControlNet Conditioning**: Floor plan image guides structural layout

### View Types & Specifications

| View | Purpose | Dimensions | ControlNet Scale |
|------|---------|------------|------------------|
| Floor Plan | Base reference | 1024x1024 | 1.0 (canny) |
| Exterior Front | Main facade | 1536x1152 | 1.0 (canny) |
| Exterior Side | Perpendicular facade | 1024x768 | 1.0 (canny) |
| Interior | Main living space | 1536x1024 | 0.9 |
| Axonometric | Isometric view | 1024x768 | 1.0 |
| Perspective | 3D render | 1024x768 | 1.0 |

## 🚀 Integration with Existing Application

### Option A: Replace Existing Workflow (Complete Override)

**When to use**: When you want ControlNet consistency for ALL projects

**Implementation**:

```javascript
// In src/ArchitectAIEnhanced.js

import aiIntegrationService from './services/aiIntegrationService';

// In your generation handler
const handleGenerateDesign = async () => {
  setLoading(true);
  setGenerationProgress('Preparing ControlNet multi-view generation...');

  try {
    // Convert current project context to ControlNet format
    const controlNetParams = aiIntegrationService.convertToControlNetParams(
      {
        buildingProgram: projectSpecs.buildingType,
        floorArea: projectSpecs.totalArea,
        location: locationData,
        portfolio: portfolioData,
        buildingDNA: masterDesignDNA,
        projectSeed: projectSeed
      },
      uploadedFloorPlanUrl // or null if not uploaded
    );

    // Generate consistent multi-view package
    const result = await aiIntegrationService.generateControlNetMultiViewPackage(
      controlNetParams
    );

    // Update state with results
    setGeneratedDesign({
      visualizations: result.generated_views,
      buildingDNA: result.building_core_description,
      consistencyReport: result.consistency_validation,
      metadata: result.metadata
    });

    setGenerationProgress('Complete! 6 consistent views generated.');

  } catch (error) {
    console.error('ControlNet generation failed:', error);
    setError(error.message);
  } finally {
    setLoading(false);
  }
};
```

### Option B: Hybrid Approach (User Choice)

**When to use**: When you want to offer both workflows

**Implementation**:

```javascript
// Add toggle in UI
const [useControlNet, setUseControlNet] = useState(false);

// Conditional generation
const handleGenerateDesign = async () => {
  if (useControlNet && floorPlanUploaded) {
    // Use ControlNet workflow
    await generateWithControlNet();
  } else {
    // Use existing workflow
    await generateWithExistingWorkflow();
  }
};

const generateWithControlNet = async () => {
  const controlNetParams = aiIntegrationService.convertToControlNetParams(
    currentContext,
    floorPlanUrl
  );
  const result = await aiIntegrationService.generateControlNetMultiViewPackage(
    controlNetParams
  );
  displayControlNetResults(result);
};

// In UI
<div className="generation-options">
  <label>
    <input
      type="checkbox"
      checked={useControlNet}
      onChange={(e) => setUseControlNet(e.target.checked)}
      disabled={!floorPlanUploaded}
    />
    Use ControlNet for Perfect Consistency
    {!floorPlanUploaded && ' (upload floor plan first)'}
  </label>
</div>
```

### Option C: Enhancement Layer (Best of Both)

**When to use**: Generate initial design, then enhance with ControlNet

**Implementation**:

```javascript
// Step 1: Generate initial design with existing workflow
const initialDesign = await aiIntegrationService.generateCompleteDesign({
  projectContext,
  portfolio,
  location,
  specs
});

// Step 2: Extract generated floor plan
const floorPlanUrl = initialDesign.visualizations.views.floor_plan_ground.images[0];

// Step 3: Generate ControlNet-enhanced views using that floor plan
const enhancedViews = await aiIntegrationService.generateControlNetMultiViewPackage(
  aiIntegrationService.convertToControlNetParams(projectContext, floorPlanUrl)
);

// Step 4: Merge results - keep initial reasoning, replace visuals with enhanced
const finalDesign = {
  ...initialDesign,
  visualizations: {
    original: initialDesign.visualizations,
    controlnet_enhanced: enhancedViews.generated_views
  },
  consistency_score: enhancedViews.consistency_validation.consistency_check === 'passed' ? 95 : 75
};
```

## 🎨 UI Components

### Floor Plan Upload Component

```jsx
// src/components/FloorPlanUpload.jsx
import React, { useState } from 'react';

function FloorPlanUpload({ onFloorPlanUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);

    // Upload to server or convert to base64
    try {
      // Option 1: Upload to server
      const formData = new FormData();
      formData.append('floorPlan', file);
      const response = await fetch('/api/upload-floor-plan', {
        method: 'POST',
        body: formData
      });
      const { url } = await response.json();

      // Option 2: Use base64 directly (simpler, but larger payload)
      // const url = await new Promise((resolve) => {
      //   const reader = new FileReader();
      //   reader.onloadend = () => resolve(reader.result);
      //   reader.readAsDataURL(file);
      // });

      onFloorPlanUploaded(url);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload floor plan');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="floor-plan-upload">
      <h3>Upload Floor Plan (Optional)</h3>
      <p>Upload a 2D floor plan for ControlNet-guided generation</p>

      <div className="upload-area">
        {preview ? (
          <div className="preview">
            <img src={preview} alt="Floor plan preview" />
            <button onClick={() => {
              setPreview(null);
              onFloorPlanUploaded(null);
            }}>
              Remove
            </button>
          </div>
        ) : (
          <label className="upload-label">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            {uploading ? 'Uploading...' : 'Choose floor plan image'}
          </label>
        )}
      </div>

      <div className="upload-tips">
        <strong>Tips for best results:</strong>
        <ul>
          <li>Use black-and-white line drawings</li>
          <li>Clear wall delineations</li>
          <li>Minimal furniture or annotations</li>
          <li>PNG or JPG format, max 10MB</li>
        </ul>
      </div>
    </div>
  );
}

export default FloorPlanUpload;
```

### Multi-View Results Display

```jsx
// src/components/ControlNetResultsDisplay.jsx
import React, { useState } from 'react';

function ControlNetResultsDisplay({ result }) {
  const [selectedView, setSelectedView] = useState('exterior_front');

  if (!result || !result.generated_views) {
    return <div>No results to display</div>;
  }

  const views = result.generated_views;
  const validation = result.consistency_validation;
  const dna = result.building_core_description;

  return (
    <div className="controlnet-results">
      {/* Header with consistency badge */}
      <div className="results-header">
        <h2>{result.project}</h2>
        <div className={`consistency-badge ${validation.passed ? 'success' : 'warning'}`}>
          {validation.passed ? '✅ Perfect Consistency' : '⚠️ Review Required'}
          <span className="seed">Seed: {result.seed}</span>
        </div>
      </div>

      {/* Main view display */}
      <div className="main-view-container">
        {views[selectedView]?.success ? (
          <>
            <img
              src={views[selectedView].images[0]}
              alt={views[selectedView].view}
              className="main-view-image"
            />
            <div className="view-title">{views[selectedView].view}</div>
          </>
        ) : (
          <div className="error-placeholder">
            <span>❌</span>
            <p>Failed to generate {views[selectedView]?.view}</p>
            <small>{views[selectedView]?.error}</small>
          </div>
        )}
      </div>

      {/* View selector tabs */}
      <div className="view-tabs">
        {Object.entries(views).map(([key, view]) => (
          <button
            key={key}
            onClick={() => setSelectedView(key)}
            className={`view-tab ${selectedView === key ? 'active' : ''} ${!view.success ? 'failed' : ''}`}
          >
            <span className="status-icon">{view.success ? '✅' : '❌'}</span>
            {view.view}
          </button>
        ))}
      </div>

      {/* Thumbnail grid */}
      <div className="thumbnail-grid">
        {Object.entries(views).map(([key, view]) => (
          <div
            key={key}
            className={`thumbnail ${selectedView === key ? 'selected' : ''}`}
            onClick={() => view.success && setSelectedView(key)}
          >
            {view.success ? (
              <img src={view.images[0]} alt={view.view} />
            ) : (
              <div className="thumbnail-error">❌</div>
            )}
            <span className="thumbnail-label">{view.view}</span>
          </div>
        ))}
      </div>

      {/* Building DNA specifications */}
      <div className="building-specs">
        <h3>Building Specifications</h3>
        <div className="spec-grid">
          <div className="spec-item">
            <label>Dimensions</label>
            <value>
              {dna.geometry.length}m × {dna.geometry.width}m × {dna.geometry.height}m
            </value>
          </div>
          <div className="spec-item">
            <label>Floors</label>
            <value>{dna.geometry.floor_count}</value>
          </div>
          <div className="spec-item">
            <label>Floor Area</label>
            <value>{result.metadata.floor_area}m²</value>
          </div>
          <div className="spec-item">
            <label>Materials</label>
            <value>{dna.materials.walls}</value>
          </div>
          <div className="spec-item">
            <label>Roof</label>
            <value>{dna.roof.type} - {dna.roof.material}</value>
          </div>
          <div className="spec-item">
            <label>Windows</label>
            <value>{dna.openings.window_type}</value>
          </div>
        </div>
      </div>

      {/* Consistency validation report */}
      <div className="consistency-report">
        <h3>Consistency Validation Report</h3>
        <div className="validation-summary">
          {validation.summary}
        </div>
        <div className="validation-checks">
          {validation.checks.map((check, idx) => (
            <div key={idx} className={`check ${check.passed ? 'passed' : 'failed'}`}>
              <span className="check-icon">{check.passed ? '✅' : '❌'}</span>
              <div className="check-content">
                <div className="check-test">{check.test}</div>
                <div className="check-details">{check.details}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Download options */}
      <div className="download-actions">
        <button onClick={() => downloadAllViews(views)}>
          Download All Views
        </button>
        <button onClick={() => downloadJSON(result)}>
          Download JSON Package
        </button>
      </div>
    </div>
  );
}

// Helper functions
function downloadAllViews(views) {
  Object.entries(views).forEach(([key, view]) => {
    if (view.success && view.images[0]) {
      const a = document.createElement('a');
      a.href = view.images[0];
      a.download = view.output_file || `${key}.png`;
      a.click();
    }
  });
}

function downloadJSON(result) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${result.project.replace(/\s+/g, '_')}_controlnet_package.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default ControlNetResultsDisplay;
```

### CSS Styles

```css
/* src/styles/controlnet-results.css */

.controlnet-results {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.consistency-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
}

.consistency-badge.success {
  background: #d4edda;
  color: #155724;
  border: 2px solid #28a745;
}

.consistency-badge.warning {
  background: #fff3cd;
  color: #856404;
  border: 2px solid #ffc107;
}

.consistency-badge .seed {
  font-size: 0.9em;
  opacity: 0.8;
}

.main-view-container {
  position: relative;
  background: #f8f9fa;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 20px;
}

.main-view-image {
  width: 100%;
  height: auto;
  display: block;
}

.view-title {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px;
  font-size: 1.2em;
  font-weight: 600;
}

.error-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: #dc3545;
}

.error-placeholder span {
  font-size: 4em;
}

.view-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.view-tab {
  flex: 1;
  min-width: 150px;
  padding: 12px 20px;
  border: 2px solid #dee2e6;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-tab:hover {
  border-color: #4A90E2;
  background: #f8f9fa;
}

.view-tab.active {
  border-color: #4A90E2;
  background: #4A90E2;
  color: white;
}

.view-tab.failed {
  opacity: 0.6;
  cursor: not-allowed;
}

.thumbnail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.thumbnail {
  position: relative;
  aspect-ratio: 4/3;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 3px solid transparent;
  transition: all 0.2s;
}

.thumbnail:hover {
  border-color: #4A90E2;
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.thumbnail.selected {
  border-color: #28a745;
  box-shadow: 0 0 0 2px #28a745;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-error {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8d7da;
  color: #dc3545;
  font-size: 3em;
}

.thumbnail-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px;
  font-size: 0.85em;
  text-align: center;
}

.building-specs {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.spec-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 15px;
}

.spec-item {
  background: white;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #4A90E2;
}

.spec-item label {
  display: block;
  font-size: 0.85em;
  color: #6c757d;
  margin-bottom: 5px;
}

.spec-item value {
  display: block;
  font-weight: 600;
  color: #212529;
}

.consistency-report {
  background: white;
  border: 2px solid #dee2e6;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.validation-summary {
  font-size: 1.1em;
  font-weight: 600;
  margin-bottom: 15px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
}

.validation-checks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.check {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
}

.check.passed {
  background: #d4edda;
}

.check.failed {
  background: #f8d7da;
}

.check-icon {
  font-size: 1.5em;
}

.check-test {
  font-weight: 600;
  margin-bottom: 4px;
}

.check-details {
  font-size: 0.9em;
  opacity: 0.8;
}

.download-actions {
  display: flex;
  gap: 15px;
  justify-content: center;
}

.download-actions button {
  padding: 12px 30px;
  background: #4A90E2;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.download-actions button:hover {
  background: #357ABD;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
}
```

## ⚙️ Configuration

### Environment Variables

Add to `.env`:

```bash
# ControlNet Multi-View Feature Flag
REACT_APP_USE_CONTROLNET_WORKFLOW=true

# Required API Keys (already configured)
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
REACT_APP_REPLICATE_API_KEY=your_replicate_api_key_here
```

Add to `.env.example`:

```bash
# ControlNet Multi-View Workflow
# Enable ControlNet-based multi-view generation for perfect consistency
REACT_APP_USE_CONTROLNET_WORKFLOW=false
```

## 🧪 Testing

### Run Test Suite

```bash
# Run all tests (no API calls)
node test-controlnet-workflow.js

# Or with npm script (add to package.json)
npm run test:controlnet
```

Add to `package.json`:

```json
{
  "scripts": {
    "test:controlnet": "node test-controlnet-workflow.js"
  }
}
```

### Manual Testing Checklist

- [ ] Floor plan upload works
- [ ] Parameter validation catches invalid inputs
- [ ] Building core description is generated correctly
- [ ] All 6 views are generated
- [ ] Consistency validation report shows all checks passed
- [ ] Same seed is used across all views
- [ ] Materials and colors match across views
- [ ] Download functions work for individual views and JSON package
- [ ] UI displays results correctly
- [ ] Error handling works when generation fails

## 📊 Performance Monitoring

### Metrics to Track

```javascript
// Add performance monitoring
const performanceMetrics = {
  startTime: Date.now(),
  steps: {}
};

// Before each step
performanceMetrics.steps.validation_start = Date.now();
// After each step
performanceMetrics.steps.validation_end = Date.now();
performanceMetrics.steps.validation_duration =
  performanceMetrics.steps.validation_end - performanceMetrics.steps.validation_start;

// Expected timings:
// - Validation: < 100ms
// - Building core description: 5-10s
// - View configuration: < 100ms
// - Per view generation: 30-60s
// - Consistency validation: < 500ms
// - Total: 3-6 minutes
```

## 🚨 Error Handling

### Common Errors and Solutions

1. **OpenAI API Error**: Check API key, quota
2. **Replicate Timeout**: Increase timeout in replicateService
3. **Invalid Control Image**: Ensure URL is accessible or base64 is valid
4. **Consistency Validation Failed**: Review seed usage and prompt keywords

### Fallback Strategy

```javascript
// Graceful degradation
try {
  const result = await controlNetService.generateConsistentMultiViewPackage(params);
  return result;
} catch (error) {
  console.warn('ControlNet workflow failed, falling back to standard workflow');
  return await standardWorkflow(params);
}
```

## 📈 Future Enhancements

1. **Additional Views**
   - Site plan (bird's eye)
   - Detail views (entrance, corner details)
   - Section cuts (longitudinal, transverse)

2. **Advanced ControlNet**
   - Multi-ControlNet (depth + edges)
   - ControlNet strength slider
   - Custom preprocessors

3. **Real-time Refinement**
   - User feedback loop
   - Selective regeneration
   - Material swapping

4. **Export Formats**
   - AutoCAD DWG export
   - Revit RVT export
   - IFC export with metadata

## 🎓 Best Practices

1. **Always use consistent seed** across a project
2. **Provide floor plan** when possible for best structural accuracy
3. **Validate materials** match across all views
4. **Review consistency report** before delivering to client
5. **Save building_core_description** for future variations
6. **Use proper orientation** (N/S/E/W) for entrance direction
7. **Set realistic floor counts** (1-5 floors) based on building type

## 📞 Support

For questions or issues:
1. Check console logs for detailed error messages
2. Review consistency validation report
3. Consult troubleshooting guide in CONTROLNET_USAGE_GUIDE.md
4. Check GitHub issues: https://github.com/anthropics/architect-ai-platform/issues

## ✅ Implementation Checklist

- [x] Core service implemented (`controlNetMultiViewService.js`)
- [x] Integration layer added (`aiIntegrationService.js`)
- [x] Usage guide documented (`CONTROLNET_USAGE_GUIDE.md`)
- [x] Test suite created (`test-controlnet-workflow.js`)
- [x] Implementation guide created (this file)
- [ ] UI components integrated into `ArchitectAIEnhanced.js`
- [ ] Floor plan upload component added
- [ ] Results display component added
- [ ] Environment variables configured
- [ ] Tests passing
- [ ] Production deployment complete

---

**Implementation Status**: Core system complete, ready for UI integration and testing.
