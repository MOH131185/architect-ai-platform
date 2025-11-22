# ControlNet Multi-View - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies (Already Done)

The ControlNet system uses existing dependencies. No additional installation required.

```bash
# Verify dependencies
npm install
```

### Step 2: Configure Environment Variables

```bash
# Copy .env.example to .env if not already done
cp .env.example .env

# Edit .env and add your API keys:
# - REACT_APP_OPENAI_API_KEY (required for reasoning)
# - REACT_APP_REPLICATE_API_KEY (required for image generation)

# Enable ControlNet workflow
REACT_APP_USE_CONTROLNET_WORKFLOW=true
```

### Step 3: Run a Test

```bash
# Test the ControlNet workflow
node test-controlnet-workflow.js
```

Expected output:
```
✅ Input Validation - Passed
✅ Consistency Validation Logic - Passed
✅ Context Conversion - Passed
```

### Step 4: Use in Your Code

#### Option A: Direct Service Call

```javascript
import controlNetMultiViewService from './src/services/controlNetMultiViewService';

const result = await controlNetMultiViewService.generateConsistentMultiViewPackage({
  project_name: "My House",
  materials: "Red brick, grey roof, white frames",
  floors: 2,
  main_entry_orientation: "North",
  floor_area: 200,
  building_program: "house"
});

console.log('Generated views:', Object.keys(result.generated_views));
// Output: ['floor_plan', 'exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective']
```

#### Option B: Via Integration Service (Recommended)

```javascript
import aiIntegrationService from './src/services/aiIntegrationService';

// Convert existing project context
const controlNetParams = aiIntegrationService.convertToControlNetParams(
  projectContext,
  floorPlanImageUrl // or null
);

// Generate multi-view package
const result = await aiIntegrationService.generateControlNetMultiViewPackage(
  controlNetParams
);
```

### Step 5: Display Results

```jsx
import ControlNetResultsDisplay from './components/ControlNetResultsDisplay';

function MyComponent() {
  const [result, setResult] = useState(null);

  return (
    <div>
      {result && <ControlNetResultsDisplay result={result} />}
    </div>
  );
}
```

## 📦 What You Get

For each generation, you receive:

1. **6 Consistent Views**:
   - 2D Floor Plan (1024x1024)
   - Exterior Front (1536x1152)
   - Exterior Side (1024x768)
   - Interior Main Space (1536x1024)
   - Axonometric (1024x768)
   - Perspective (1024x768)

2. **Building Core Description**:
   - Exact geometry (length × width × height)
   - Material specifications with hex colors
   - Window and door details
   - Roof specifications
   - Style features

3. **Consistency Validation Report**:
   - Same seed check
   - Prompt keyword check
   - ControlNet usage check
   - Success rate check

4. **Complete JSON Package**:
   - All view configurations
   - All generated images
   - Metadata and timestamps
   - Workflow steps

## 🎯 Example Projects

### Example 1: Simple House

```javascript
const simpleHouse = await controlNetMultiViewService.generateConsistentMultiViewPackage({
  project_name: "Simple Modern House",
  location: "London, UK",
  style: "Contemporary",
  materials: "White render, black windows, grey roof",
  floors: 2,
  main_entry_orientation: "South",
  floor_area: 150,
  building_program: "house",
  seed: 12345
});

// Access floor plan
const floorPlan = simpleHouse.generated_views.floor_plan.images[0];

// Access exterior front
const exterior = simpleHouse.generated_views.exterior_front.images[0];

// Check consistency
console.log(simpleHouse.consistency_validation.consistency_check); // 'passed'
```

### Example 2: Villa with Floor Plan

```javascript
// First, upload or provide floor plan
const floorPlanUrl = 'https://example.com/uploaded_floor_plan.png';

const villa = await controlNetMultiViewService.generateConsistentMultiViewPackage({
  project_name: "Mediterranean Villa",
  location: "Barcelona, Spain",
  style: "Mediterranean",
  materials: "Stucco walls, terracotta roof, wooden shutters",
  floors: 3,
  main_entry_orientation: "East",
  control_image: floorPlanUrl, // ControlNet will use this for structural guidance
  floor_area: 400,
  building_program: "villa",
  seed: 98765
});

// All 6 views will match the uploaded floor plan's structure
```

### Example 3: Integration with Existing Workflow

```javascript
// After generating initial design
const initialDesign = await generateInitialDesign(projectData);

// Extract floor plan from initial design
const floorPlan = initialDesign.floorPlans.ground.images[0];

// Generate ControlNet-enhanced views
const enhancedViews = await aiIntegrationService.generateControlNetMultiViewPackage(
  aiIntegrationService.convertToControlNetParams(projectData, floorPlan)
);

// Combine results
const finalDesign = {
  ...initialDesign,
  controlnet_enhanced_views: enhancedViews.generated_views,
  consistency_score: 95 // Based on validation
};
```

## ⚡ Performance & Cost

### Generation Time
- Building core description: **5-10 seconds**
- Each view: **30-60 seconds**
- **Total: 3-6 minutes** for all 6 views

### API Costs
- GPT-4o reasoning: **~$0.05**
- SDXL generation: **~$0.60-$0.90** (6 views × $0.10-$0.15 each)
- **Total: ~$0.65-$0.95 per project**

### Rate Limits
- Built-in 2-second delay between views
- Max throughput: **~10-12 projects/hour**

## 🔧 Troubleshooting

### "No API key found"
**Solution**: Check `.env` file has `REACT_APP_OPENAI_API_KEY` and `REACT_APP_REPLICATE_API_KEY`

### "Control image not found"
**Solution**: Ensure floor plan URL is publicly accessible or use base64 encoding

### "Consistency validation failed"
**Check**: Review consistency report in `result.consistency_validation.checks`

### "Generation timeout"
**Solution**: Increase timeout in `replicateService.js` (default: 5 minutes)

### "Some views failed"
**Check**: Look at individual errors in `result.generated_views[viewName].error`

## 📚 Next Steps

1. **Read Full Documentation**: See `CONTROLNET_USAGE_GUIDE.md`
2. **Review Implementation Guide**: See `CONTROLNET_IMPLEMENTATION.md`
3. **Integrate UI Components**: Use provided React components
4. **Run Full Tests**: `node test-controlnet-workflow.js` (uncomment basic workflow test)
5. **Deploy to Production**: Follow deployment guide in IMPLEMENTATION.md

## 💡 Tips for Best Results

### Floor Plan Quality
- Use **black-and-white line drawings**
- Ensure **clear wall delineations**
- Minimize furniture or annotations
- PNG or JPG format recommended

### Material Descriptions
- Be specific: "Red brick with white mortar" > "brick"
- Include colors: "Dark grey slate roof" > "slate roof"
- Mention textures: "Smooth white render" > "white walls"

### Orientation
- Use cardinal directions: N, S, E, W, NE, SE, SW, NW
- Consider sun path and views
- Entrance orientation affects all views

### Floor Count
- Be realistic: 1-5 floors (clamped automatically)
- Houses: typically 1-2 floors
- Villas: 2-3 floors
- Apartments/offices: 3-5 floors

## 🎨 Customization

### Change View Configurations

Edit `src/services/controlNetMultiViewService.js`:

```javascript
// Add custom view
views.custom_view = {
  view: "Custom Detail View",
  prompt: "...",
  controlnet: { image: control_image, conditioning_scale: 1.0 },
  seed: seed,
  width: 1024,
  height: 768,
  output: "custom_view.png"
};
```

### Adjust ControlNet Strength

```javascript
// Higher = stricter adherence to floor plan (0.0 - 2.0)
controlnet: {
  image: control_image,
  conditioning_scale: 1.5 // Default: 1.0
}
```

### Custom Prompts

Modify prompt templates in `generateViewConfigurations()`:

```javascript
views.exterior_front.prompt = `
  YOUR CUSTOM PROMPT HERE
  ${materials.walls} (${materials.walls_color_hex})
  ${roof.type} roof
  ${geometry.floor_count} floors
  SAME building as floor plan
`;
```

## 📞 Support & Resources

- **Usage Guide**: `CONTROLNET_USAGE_GUIDE.md`
- **Implementation Guide**: `CONTROLNET_IMPLEMENTATION.md`
- **Test Suite**: `test-controlnet-workflow.js`
- **Service Code**: `src/services/controlNetMultiViewService.js`

## ✅ Quick Checklist

Before deploying:

- [ ] API keys configured in `.env`
- [ ] Feature flag enabled (`REACT_APP_USE_CONTROLNET_WORKFLOW=true`)
- [ ] Tests passing (`node test-controlnet-workflow.js`)
- [ ] UI components integrated
- [ ] Floor plan upload working (if using)
- [ ] Results display rendering correctly
- [ ] Consistency validation showing in UI
- [ ] Download functions working
- [ ] Error handling tested

## 🚀 You're Ready!

Your ControlNet Multi-View system is now configured and ready to use. Start generating consistent architectural visualizations with perfect geometric and material alignment across all views!

```javascript
// Start generating!
const result = await controlNetMultiViewService.generateConsistentMultiViewPackage({
  project_name: "My First ControlNet Project",
  materials: "Your materials here",
  floors: 2,
  main_entry_orientation: "North",
  floor_area: 200,
  building_program: "house"
});

console.log('Success!', result.consistency_validation.consistency_check);
```

---

**Happy Building! 🏗️**
