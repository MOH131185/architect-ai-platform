# Design History Integration Guide

This guide shows how to integrate the Design History Service into your Architect AI platform to maintain consistency between 2D floor plans and 3D visualizations.

## 📦 What Was Created

**File**: `src/services/designHistoryService.js`

A complete service that:
- Stores design context in browser localStorage
- Retrieves previous designs for consistency
- Generates continuation prompts with historical context
- Supports export/import for backup

---

## 🔌 Integration Steps

### Step 1: Import the Service in ArchitectAIEnhanced.js

```javascript
// Add to imports at the top of src/ArchitectAIEnhanced.js
import designHistoryService from './services/designHistoryService';
```

### Step 2: Save Context After Ground Floor Generation

After generating the ground floor plan (around line 800-1000 in ArchitectAIEnhanced.js), add:

```javascript
// Example: After successful floor plan generation
const handleFloorPlanGeneration = async () => {
  try {
    // Your existing generation code...
    const floorPlanResult = await aiIntegrationService.generateFloorPlan({
      location: locationData,
      buildingProgram,
      floorArea,
      // ... other params
    });

    // 🆕 SAVE TO DESIGN HISTORY
    const projectId = designHistoryService.saveDesignContext({
      projectId: currentProjectId, // or generate new: designHistoryService.generateProjectId()
      location: locationData,
      buildingDNA: buildingDNA,
      prompt: originalPrompt,
      outputs: {
        floorPlan: floorPlanResult.url,
        seed: floorPlanResult.seed
      },
      floorPlanUrl: floorPlanResult.url,
      seed: floorPlanResult.seed,
      buildingProgram: buildingProgram,
      floorArea: floorArea,
      floors: numberOfFloors,
      style: architecturalStyle
    });

    // Store projectId in component state for later use
    setCurrentProjectId(projectId);

    console.log('✅ Design context saved for future consistency');

  } catch (error) {
    console.error('Floor plan generation failed:', error);
  }
};
```

### Step 3: Retrieve Context for Upper Floors / 3D Views

When generating upper floors or 3D visualizations:

```javascript
// Example: When user clicks "Generate Upper Floor" or "Generate 3D View"
const handleUpperFloorGeneration = async () => {
  try {
    // 🆕 RETRIEVE DESIGN HISTORY
    const previousContext = designHistoryService.getDesignContext(currentProjectId);

    if (!previousContext) {
      console.warn('⚠️  No ground floor context found. Generate ground floor first.');
      return;
    }

    // 🆕 GENERATE CONTINUATION PROMPT
    const enhancedPrompt = designHistoryService.generateContinuationPrompt(
      currentProjectId,
      'Generate second floor maintaining same architectural style and layout logic'
    );

    // Use enhanced prompt for generation
    const upperFloorResult = await aiIntegrationService.generateUpperFloor({
      prompt: enhancedPrompt,
      seed: previousContext.seed, // Use same seed for consistency!
      buildingDNA: previousContext.buildingDNA,
      // ... other params
    });

    console.log('✅ Upper floor generated with consistency');

  } catch (error) {
    console.error('Upper floor generation failed:', error);
  }
};
```

### Step 4: Add State Management in ArchitectAIEnhanced.js

Add these state variables:

```javascript
function ArchitectAIEnhanced() {
  // ... existing state

  // 🆕 Add project tracking
  const [currentProjectId, setCurrentProjectId] = useState(null);

  // ... rest of component
}
```

### Step 5: Optional - Load Previous Project on Mount

```javascript
useEffect(() => {
  // 🆕 Check if there's a previous project to continue
  const latestProject = designHistoryService.getLatestDesignContext();

  if (latestProject) {
    // Optionally show a "Continue Previous Project?" dialog
    console.log('Found previous project:', latestProject.projectId);
    // You could setCurrentProjectId(latestProject.projectId) to auto-resume
  }
}, []);
```

---

## 🎯 Usage Examples

### Example 1: Complete Ground Floor → Upper Floor Workflow

```javascript
// 1. Generate ground floor
const groundFloorResult = await generateFloorPlan(...);

// 2. Save context
const projectId = designHistoryService.saveDesignContext({
  projectId: 'my-house-project-001',
  location: { address: '123 Main St', climate: { type: 'temperate' } },
  buildingDNA: { materials: { exterior: { primary: 'brick' } } },
  prompt: 'Modern 2-story house with open floor plan',
  seed: groundFloorResult.seed,
  floorPlanUrl: groundFloorResult.url
});

// 3. Later: Generate upper floor with consistency
const context = designHistoryService.getDesignContext(projectId);
const upperFloorPrompt = designHistoryService.generateContinuationPrompt(
  projectId,
  'Generate second floor with 3 bedrooms'
);

const upperFloorResult = await generateUpperFloor({
  prompt: upperFloorPrompt,
  seed: context.seed, // ⚠️ CRITICAL: Use same seed!
  buildingDNA: context.buildingDNA
});
```

### Example 2: 2D Floor Plan → 3D Visualization

```javascript
// After generating 2D floor plan
const projectId = designHistoryService.saveDesignContext({ /* ... */ });

// Generate 3D visualization maintaining consistency
const context = designHistoryService.getDesignContext(projectId);

const render3DPrompt = `
Photorealistic 3D exterior rendering based on:
- Materials: ${context.buildingDNA.materials.exterior.primary}
- Style: ${context.metadata.style}
- Location: ${context.location.address}
- Climate: ${context.location.climate.type}

Generate exterior view maintaining exact proportions and style from floor plan.
`;

const render3D = await generateExteriorRender({
  prompt: render3DPrompt,
  seed: context.seed, // Same seed = same style/proportions
  controlImage: context.floorPlanUrl // Use floor plan as ControlNet reference
});
```

### Example 3: Export for Backup

```javascript
// Export all project history
designHistoryService.exportHistory(); // Downloads JSON file

// Export specific project
designHistoryService.exportHistory('my-house-project-001');
```

---

## 🚀 Advanced: Server-Side Storage (Option 2)

For persistent storage across devices and users, add these endpoints to `server.js`:

```javascript
// Add to server.js

const fs = require('fs').promises;
const path = require('path');

// Design history directory
const HISTORY_DIR = path.join(__dirname, 'design_history');

// Ensure directory exists
fs.mkdir(HISTORY_DIR, { recursive: true }).catch(console.error);

// Save design history endpoint
app.post('/api/design-history/save', async (req, res) => {
  try {
    const { projectId, context } = req.body;

    if (!projectId || !context) {
      return res.status(400).json({ error: 'projectId and context required' });
    }

    const filePath = path.join(HISTORY_DIR, `${projectId}.json`);
    await fs.writeFile(filePath, JSON.stringify(context, null, 2));

    console.log(`✅ Saved design history: ${projectId}`);
    res.json({ success: true, projectId });

  } catch (error) {
    console.error('Failed to save design history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve design history endpoint
app.get('/api/design-history/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const filePath = path.join(HISTORY_DIR, `${projectId}.json`);

    const data = await fs.readFile(filePath, 'utf8');
    const context = JSON.parse(data);

    console.log(`📖 Retrieved design history: ${projectId}`);
    res.json(context);

  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Project not found' });
    }
    console.error('Failed to retrieve design history:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all projects endpoint
app.get('/api/design-history', async (req, res) => {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const projects = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));

    res.json({ projects });

  } catch (error) {
    console.error('Failed to list design history:', error);
    res.status(500).json({ error: error.message });
  }
});
```

Then update `designHistoryService.js` to use API calls instead of localStorage.

---

## 📊 Benefits of Design History

### 1. Consistency Between Views
- Same seed → Same style/proportions
- Same materials → Same textures
- Same DNA → Same architectural language

### 2. Progressive Refinement
- Start with ground floor
- Build upper floors maintaining coherence
- Generate elevations/sections from same context

### 3. Multi-Session Projects
- Resume projects days/weeks later
- Export/import for collaboration
- Version control for design evolution

### 4. Quality Control
- Track what prompts produced which results
- Replicate successful generations
- Avoid style drift across iterations

---

## 🎓 Best Practices

1. **Always save context after ground floor generation**
   - This is your "source of truth"

2. **Use the same seed for all views of the same building**
   - Critical for maintaining consistency

3. **Include location + climate data**
   - Ensures appropriate design responses

4. **Store building DNA (materials, colors, style)**
   - Prevents style drift

5. **Generate continuation prompts**
   - Don't manually copy/paste context
   - Use `generateContinuationPrompt()` method

---

## 🧪 Testing

### Test 1: Basic Save/Retrieve
```javascript
// Save
const projectId = designHistoryService.saveDesignContext({
  projectId: 'test-001',
  location: { address: 'Test Location' },
  seed: 12345
});

// Retrieve
const context = designHistoryService.getDesignContext('test-001');
console.log(context.seed); // Should be 12345
```

### Test 2: Continuation Prompt
```javascript
const prompt = designHistoryService.generateContinuationPrompt(
  'test-001',
  'Generate upper floor'
);
console.log(prompt); // Should include location, materials, style
```

### Test 3: Export/Import
```javascript
// Export
designHistoryService.exportHistory('test-001');

// Clear
designHistoryService.deleteProject('test-001');

// Import (select exported JSON file)
// Should restore project
```

---

## 🆘 Troubleshooting

### "No design history found"
- Make sure you called `saveDesignContext()` after ground floor generation
- Check browser console for errors
- Verify localStorage isn't full (5-10MB limit)

### "Generated views don't match"
- Ensure using same `seed` from context
- Verify same `buildingDNA` object
- Use `generateContinuationPrompt()` instead of manual prompts

### "localStorage quota exceeded"
- Switch to server-side storage (Option 2)
- Or implement auto-cleanup of old projects

---

## 📝 Next Steps

1. ✅ Service created: `src/services/designHistoryService.js`
2. 🔄 Integrate into `ArchitectAIEnhanced.js` (see Step 1-5 above)
3. 🧪 Test with a simple ground floor → upper floor workflow
4. 🚀 (Optional) Implement server-side storage for production
5. 📊 (Optional) Add UI to browse/manage project history

---

## 🎯 Quick Start Checklist

- [ ] Import `designHistoryService` in ArchitectAIEnhanced.js
- [ ] Add `currentProjectId` state variable
- [ ] Call `saveDesignContext()` after ground floor generation
- [ ] Call `getDesignContext()` before upper floor generation
- [ ] Pass `context.seed` to ensure consistency
- [ ] Test with a 2-floor building
- [ ] Verify both floors have matching style/materials

