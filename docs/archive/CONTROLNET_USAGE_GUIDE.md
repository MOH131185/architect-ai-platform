# ControlNet Multi-View Architectural Visualization - Usage Guide

## Overview

The ControlNet Multi-View Service generates consistent architectural visualizations across 6 views using a floor plan as the structural reference. This ensures perfect geometric alignment between 2D technical drawings and 3D photorealistic renders.

## 🏗️ System Architecture

### 6-Step Workflow

1. **Context Setup** - AI assistant configured with architectural expertise
2. **Input Parameters** - Structured project data validation
3. **Reasoning Phase** - Building core description generation via GPT-4o
4. **Generation Phase** - 6 views created with SDXL + ControlNet conditioning
5. **Consistency Validation** - Automated checks for seed/material/geometry consistency
6. **Output Format** - Complete JSON package with all views and metadata

### Generated Views

1. **2D Floor Plan** - Base reference (1024x1024)
2. **Exterior Front** - Main facade view (1536x1152)
3. **Exterior Side** - Perpendicular facade (1024x768)
4. **Interior Main Space** - Living/main room (1536x1024)
5. **Axonometric** - 45° isometric projection (1024x768)
6. **Perspective** - 3D perspective render (1024x768)

## 📋 Input Parameters

### Required Fields

```javascript
{
  "project_name": "Modern 2-Storey House",
  "location": "Birmingham, UK",
  "style": "Contemporary British brick house",
  "materials": "Red brick walls, grey roof tiles, white window frames",
  "floors": 2,
  "main_entry_orientation": "North",
  "control_image": "https://example.com/floor_plan.png", // or base64
  "seed": 20251022, // Optional - auto-generated if not provided
  "climate": "Temperate oceanic, mild summers, cool winters",
  "floor_area": 200, // m²
  "building_program": "house"
}
```

### Field Descriptions

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `project_name` | string | No | Project identifier | "Modern 2-Storey House" |
| `location` | string | No | Project location | "Birmingham, UK" |
| `style` | string | No | Architectural style | "Contemporary British brick" |
| `materials` | string | **Yes** | Material specifications | "Red brick, grey roof, white frames" |
| `floors` | number | **Yes** | Number of floors (1-5) | 2 |
| `main_entry_orientation` | string | **Yes** | N/S/E/W/NE/SE/SW/NW | "North" |
| `control_image` | string | Recommended | Floor plan URL/base64 | "https://..." or "data:image/png;base64,..." |
| `seed` | number | No | Consistency seed | 20251022 |
| `climate` | string | No | Climate description | "Temperate oceanic" |
| `floor_area` | number | No | Total area in m² | 200 |
| `building_program` | string | No | Building type | "house", "villa", "office" |

## 🚀 Usage Examples

### Example 1: Basic Usage (Direct Service Call)

```javascript
import controlNetMultiViewService from './services/controlNetMultiViewService';

// Prepare input parameters
const projectParams = {
  project_name: "Modern Birmingham House",
  location: "Birmingham, UK",
  style: "Contemporary British",
  materials: "Red brick walls, grey roof tiles, white window frames",
  floors: 2,
  main_entry_orientation: "North",
  control_image: "https://example.com/uploaded_floor_plan.png",
  seed: 12345678,
  climate: "Temperate",
  floor_area: 250,
  building_program: "house"
};

// Generate complete package
const result = await controlNetMultiViewService.generateConsistentMultiViewPackage(projectParams);

// Access results
console.log('Project:', result.project);
console.log('Seed:', result.seed);
console.log('Generated Views:', Object.keys(result.generated_views));
console.log('Consistency Check:', result.consistency_validation.consistency_check);

// Access individual view images
const floorPlanImage = result.generated_views.floor_plan.images[0];
const exteriorFrontImage = result.generated_views.exterior_front.images[0];
const axonometricImage = result.generated_views.axonometric.images[0];
```

### Example 2: Via AI Integration Service (Recommended)

```javascript
import aiIntegrationService from './services/aiIntegrationService';

// Use from existing project context
const existingContext = {
  buildingProgram: 'villa',
  floorArea: 300,
  location: { address: 'London, UK', climate: { type: 'Temperate' } },
  buildingDNA: {
    materials: { exterior: { primary: 'brick' } },
    roof: { material: 'slate', type: 'gable' },
    windows: { color: 'white' },
    dimensions: { floors: 2 }
  },
  projectSeed: 98765432
};

const floorPlanImageUrl = 'https://example.com/floor_plan.png';

// Convert to ControlNet format
const controlNetParams = aiIntegrationService.convertToControlNetParams(
  existingContext,
  floorPlanImageUrl
);

// Generate multi-view package
const result = await aiIntegrationService.generateControlNetMultiViewPackage(controlNetParams);

// Display results in UI
displayMultiViewResults(result);
```

### Example 3: With Floor Plan Upload

```javascript
// In React component
const handleFloorPlanUpload = async (uploadedFile) => {
  // Convert file to base64 or upload to server
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64FloorPlan = reader.result;

    const projectParams = {
      project_name: "User Project",
      location: userLocation,
      style: selectedStyle,
      materials: userMaterials,
      floors: selectedFloors,
      main_entry_orientation: selectedOrientation,
      control_image: base64FloorPlan, // Use base64 directly
      floor_area: userFloorArea,
      building_program: userBuildingType
    };

    setLoading(true);
    try {
      const result = await aiIntegrationService.generateControlNetMultiViewPackage(projectParams);
      setGeneratedViews(result.generated_views);
      setConsistencyReport(result.consistency_validation);
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  reader.readAsDataURL(uploadedFile);
};
```

## 📤 Output Format

### Complete Package Structure

```javascript
{
  "project": "Modern 2-Storey House",
  "timestamp": "2025-10-23T10:30:00.000Z",
  "seed": 20251022,

  "building_core_description": {
    "geometry": {
      "length": 15,
      "width": 10,
      "height": 7.0,
      "floor_count": 2,
      "floor_height": 3.2
    },
    "materials": {
      "walls": "red brick walls with white mortar",
      "walls_color_hex": "#C4482E",
      "roof": "grey slate tiles",
      "roof_color_hex": "#5A5A5A",
      "windows": "white UPVC frames",
      "windows_color_hex": "#FFFFFF"
    },
    "openings": {
      "window_type": "casement",
      "window_pattern": "symmetrical",
      "window_count_per_floor": 6,
      "door_type": "composite front door",
      "door_position": "North facade"
    },
    "roof": {
      "type": "gable",
      "pitch": "moderate 40 degrees",
      "material": "slate",
      "color": "dark grey"
    },
    "style_features": {
      "facade_articulation": "Traditional British brick with symmetrical window placement",
      "distinctive_elements": ["bay windows", "brick soldier courses", "gable roof"],
      "architectural_style": "Contemporary British brick house"
    },
    "consistency_rules": [
      "Same geometry in all views: 15m × 10m × 7.0m",
      "Exact material colors: red brick #C4482E, grey roof #5A5A5A, white frames #FFFFFF",
      "Window positions consistent across all facades",
      "Floor count always 2 floors",
      "Entry always on North side",
      "Roof type and pitch identical in all views"
    ]
  },

  "view_configurations": {
    "floor_plan": { /* prompt, controlnet settings, etc */ },
    "exterior_front": { /* prompt, controlnet settings, etc */ },
    "exterior_side": { /* prompt, controlnet settings, etc */ },
    "interior": { /* prompt, controlnet settings, etc */ },
    "axonometric": { /* prompt, controlnet settings, etc */ },
    "perspective": { /* prompt, controlnet settings, etc */ }
  },

  "generated_views": {
    "floor_plan": {
      "success": true,
      "images": ["https://replicate.delivery/..."],
      "view": "2D Floor Plan",
      "output_file": "floor_plan.png",
      "prompt_used": "Generate clean architectural 2D floor plan..."
    },
    "exterior_front": {
      "success": true,
      "images": ["https://replicate.delivery/..."],
      "view": "Exterior Front",
      "output_file": "exterior_front.png"
    },
    "exterior_side": {
      "success": true,
      "images": ["https://replicate.delivery/..."],
      "view": "Exterior Side",
      "output_file": "exterior_side.png"
    },
    "interior": {
      "success": true,
      "images": ["https://replicate.delivery/..."],
      "view": "Interior Main Space",
      "output_file": "interior.png"
    },
    "axonometric": {
      "success": true,
      "images": ["https://replicate.delivery/..."],
      "view": "Axonometric",
      "output_file": "axonometric.png"
    },
    "perspective": {
      "success": true,
      "images": ["https://replicate.delivery/..."],
      "view": "Perspective",
      "output_file": "perspective.png"
    }
  },

  "consistency_validation": {
    "checks": [
      {
        "test": "Same seed across all views",
        "passed": true,
        "details": "All views use seed 20251022"
      },
      {
        "test": "Exterior Front prompt includes consistency keywords",
        "passed": true,
        "details": "Contains consistency keywords"
      },
      {
        "test": "ControlNet control_image used",
        "passed": true,
        "details": "6 / 6 views use ControlNet"
      },
      {
        "test": "Generation success rate >= 80%",
        "passed": true,
        "details": "6 / 6 views generated (100%)"
      }
    ],
    "passed": true,
    "summary": "4 / 4 checks passed",
    "consistency_check": "passed",
    "notes": [
      "✅ All 6 views generated using same seed and ControlNet floor plan reference"
    ]
  },

  "metadata": {
    "total_views": 6,
    "successful_views": 6,
    "failed_views": 0,
    "consistency_passed": true,
    "control_image_used": true,
    "generation_method": "SDXL Multi-ControlNet LoRA via Replicate"
  },

  "workflow": "complete",
  "workflow_steps": [
    "✅ Step 1: Context Setup - AI assistant configured",
    "✅ Step 2: Input Parameters - Project data validated",
    "✅ Step 3: Reasoning Phase - Building core description generated",
    "✅ Step 4: Generation Phase - 6 views with ControlNet",
    "✅ Step 5: Consistency Validation - 4 / 4 checks passed",
    "✅ Step 6: Output Format - JSON package compiled"
  ]
}
```

## 🎨 Display Results in UI

### React Component Example

```jsx
import React, { useState } from 'react';

function ControlNetResults({ result }) {
  const [selectedView, setSelectedView] = useState('exterior_front');

  if (!result) return null;

  const views = result.generated_views;
  const validation = result.consistency_validation;

  return (
    <div className="controlnet-results">
      <h2>{result.project}</h2>

      {/* Consistency Badge */}
      <div className={`consistency-badge ${validation.passed ? 'passed' : 'failed'}`}>
        {validation.passed ? '✅' : '⚠️'} Consistency: {validation.consistency_check}
        <span className="seed">Seed: {result.seed}</span>
      </div>

      {/* View Selector */}
      <div className="view-tabs">
        {Object.entries(views).map(([key, view]) => (
          <button
            key={key}
            onClick={() => setSelectedView(key)}
            className={selectedView === key ? 'active' : ''}
          >
            {view.view}
          </button>
        ))}
      </div>

      {/* Main View Display */}
      <div className="main-view">
        {views[selectedView]?.success ? (
          <img
            src={views[selectedView].images[0]}
            alt={views[selectedView].view}
            className="generated-image"
          />
        ) : (
          <div className="error-message">
            Failed to generate {views[selectedView]?.view}
          </div>
        )}
      </div>

      {/* Thumbnail Grid */}
      <div className="thumbnail-grid">
        {Object.entries(views).map(([key, view]) => (
          <div
            key={key}
            className={`thumbnail ${selectedView === key ? 'selected' : ''}`}
            onClick={() => setSelectedView(key)}
          >
            {view.success && (
              <img src={view.images[0]} alt={view.view} />
            )}
            <span className="view-label">{view.view}</span>
          </div>
        ))}
      </div>

      {/* Consistency Report */}
      <div className="consistency-report">
        <h3>Consistency Validation</h3>
        {validation.checks.map((check, idx) => (
          <div key={idx} className={`check ${check.passed ? 'passed' : 'failed'}`}>
            {check.passed ? '✅' : '❌'} {check.test}
            <span className="details">{check.details}</span>
          </div>
        ))}
      </div>

      {/* Building DNA Summary */}
      <div className="building-dna">
        <h3>Building Specifications</h3>
        <div className="specs">
          <div>Dimensions: {result.building_core_description.geometry.length}m ×
                           {result.building_core_description.geometry.width}m ×
                           {result.building_core_description.geometry.height}m</div>
          <div>Floors: {result.building_core_description.geometry.floor_count}</div>
          <div>Materials: {result.building_core_description.materials.walls}</div>
          <div>Roof: {result.building_core_description.roof.type} -
                      {result.building_core_description.roof.material}</div>
          <div>Windows: {result.building_core_description.openings.window_type}</div>
        </div>
      </div>
    </div>
  );
}

export default ControlNetResults;
```

## ⚙️ Environment Configuration

Add to `.env`:

```bash
# Enable ControlNet Multi-View workflow
REACT_APP_USE_CONTROLNET_WORKFLOW=true

# Required API keys (already configured)
REACT_APP_OPENAI_API_KEY=your_openai_key
REACT_APP_REPLICATE_API_KEY=your_replicate_key
```

## 🧪 Testing

See `test-controlnet-workflow.js` for complete test examples.

```bash
# Run ControlNet workflow test
node test-controlnet-workflow.js
```

## 📊 Performance & Cost

### Generation Time
- **Building core description**: 5-10 seconds (GPT-4o)
- **Per view**: 30-60 seconds (SDXL on Replicate)
- **Total (6 views)**: ~3-6 minutes

### API Costs
- **GPT-4o reasoning**: ~$0.05 per project
- **SDXL generation**: ~$0.10-$0.15 per image
- **Total per project**: ~$0.65-$0.95 (6 views)

### Rate Limiting
- Built-in 2-second delay between views
- Total throughput: ~10-12 projects/hour

## 🔧 Troubleshooting

### Issue: No control_image provided
**Solution**: Either provide a floor plan URL or set `control_image: null` to proceed without ControlNet

### Issue: Consistency validation failed
**Check**:
- All views use the same seed
- Prompts include "SAME building" keywords
- Materials/colors match building_core_description

### Issue: Some views failed to generate
**Solution**: Check individual view errors in `generated_views[viewName].error`

## 📚 Advanced Usage

### Custom View Configurations

You can modify `generateViewConfigurations()` in `controlNetMultiViewService.js` to:
- Add more views (sections, detail views)
- Change image dimensions
- Adjust ControlNet conditioning scale
- Customize prompts

### Integration with Existing Workflow

```javascript
// After generating initial designs
const initialDesign = await aiIntegrationService.generateCompleteDesign(...);

// Extract floor plan from initial design
const floorPlanUrl = initialDesign.visualizations.views.floor_plan_ground.images[0];

// Generate ControlNet multi-view package using that floor plan
const controlNetParams = aiIntegrationService.convertToControlNetParams(
  projectContext,
  floorPlanUrl
);

const consistentViews = await aiIntegrationService.generateControlNetMultiViewPackage(
  controlNetParams
);

// Merge results
const enhancedDesign = {
  ...initialDesign,
  controlnet_views: consistentViews.generated_views,
  consistency_report: consistentViews.consistency_validation
};
```

## 📖 API Reference

See inline JSDoc comments in:
- `src/services/controlNetMultiViewService.js`
- `src/services/aiIntegrationService.js`

## 🤝 Support

For issues or questions:
1. Check console logs for detailed error messages
2. Review consistency validation report
3. Verify all required API keys are configured
4. Ensure floor plan image is accessible (URL or valid base64)
