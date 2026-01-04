# Migration Guide - Architect AI Platform v2.0

**From**: Version 1.x (Legacy multi-service architecture)  
**To**: Version 2.0 (Unified ModelRouter architecture)  
**Date**: November 15, 2025

---

## Overview

Version 2.0 introduces a unified architecture with:
- **ModelRouter** for env-driven model selection
- **PromptLibrary** for centralized prompt templates
- **ConsistencyEngine** for unified validation
- **CostEstimationService** for construction cost analysis
- **Geometry-First** core modules (TypeScript)
- **SheetComposer** for professional A1 exports

This guide helps you migrate existing code to the new architecture.

---

## Quick Start

### 1. Update Feature Flags

```javascript
import { setFeatureFlag } from './config/featureFlags';

// Enable new features (already default)
setFeatureFlag('useModelRouter', true);
setFeatureFlag('showConsistencyWarnings', true);

// Optional: Use FLUX kontext-max for A1 (requires Tier 2+)
setFeatureFlag('useFluxKontextForA1', true);
```

### 2. No Code Changes Required for Basic Usage

The new architecture is **backward compatible**. Existing services like `enhancedDNAGenerator` and `reasoningOrchestrator` have been refactored internally to use ModelRouter, but their APIs remain the same.

```javascript
// This still works exactly as before
const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
  projectContext,
  portfolioAnalysis,
  locationData
);

// This still works exactly as before
const reasoning = await reasoningOrchestrator.generateDesignReasoning(projectContext);
```

### 3. Use New Export Service (Recommended)

```javascript
import sheetExportService from './services/sheetExportService';

// Export A1 sheet as SVG
const svgBlob = await sheetExportService.export({
  format: 'svg',
  designProject: result,
  sheetArtifact: result.a1Sheet
});

// Export cost report as CSV
const csvBlob = await sheetExportService.export({
  format: 'csv',
  designProject: result
});

// Export as DXF (CAD)
const dxfBlob = await sheetExportService.export({
  format: 'dxf',
  designProject: result
});
```

### 4. Check Consistency Before Export (Recommended)

```javascript
import consistencyEngine from './services/consistencyEngine';

const report = await consistencyEngine.checkDesignConsistency(result);

if (report.passed) {
  console.log(`✅ Consistency: ${(report.score * 100).toFixed(1)}%`);
  // Enable download buttons
} else {
  console.warn('⚠️  Issues found:', report.issues);
  // Show warnings to user
}
```

---

## Detailed Migration Steps

### Step 1: Update Imports (Optional)

If you want to use ModelRouter directly:

```javascript
// Old way (still works)
import togetherAIReasoningService from './services/togetherAIReasoningService';
const result = await togetherAIReasoningService.generateDesignReasoning(context);

// New way (more control)
import modelRouter from './services/modelRouter';
import promptLibrary from './services/promptLibrary';

const prompt = promptLibrary.buildArchitecturalReasoningPrompt({
  projectContext,
  locationProfile,
  blendedStyle,
  masterDNA
});

const result = await modelRouter.callLLM('ARCHITECTURAL_REASONING', {
  systemPrompt: prompt.systemPrompt,
  userPrompt: prompt.userPrompt,
  schema: true,
  temperature: 0.7,
  maxTokens: 2000
});
```

### Step 2: Replace Direct AI Calls

If you have custom AI calls:

```javascript
// Old way
const response = await fetch('/api/together/chat', {
  method: 'POST',
  body: JSON.stringify({
    model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    messages: [...]
  })
});

// New way (automatic model selection + fallback)
import modelRouter from './services/modelRouter';

const result = await modelRouter.callLLM('DNA_GENERATION', {
  systemPrompt: 'You are an architect...',
  userPrompt: 'Generate DNA for...',
  schema: true
});

// ModelRouter automatically:
// - Selects optimal model (Qwen, Llama, GPT-5, Claude)
// - Handles fallbacks on errors
// - Tracks performance
// - Respects rate limits
```

### Step 3: Use PromptLibrary

Replace inline prompts with library templates:

```javascript
// Old way
const prompt = `You are an architect. Generate DNA for...`;

// New way
import promptLibrary from './services/promptLibrary';

const prompt = promptLibrary.buildDNAGenerationPrompt({
  projectBrief: 'Modern residential house',
  projectType: 'residential',
  area: 200,
  locationProfile,
  blendedStyle,
  siteMetrics,
  programSpaces
});

// Returns: { systemPrompt, userPrompt, version: '1.0.0' }
```

Available templates:
- `buildSiteAnalysisPrompt`
- `buildClimateLogicPrompt`
- `buildPortfolioStylePrompt`
- `buildBlendedStylePrompt`
- `buildDNAGenerationPrompt`
- `buildArchitecturalReasoningPrompt`
- `buildA1SheetGenerationPrompt`
- `buildModificationPrompt`

### Step 4: Integrate Consistency Checks

Add validation before exports:

```javascript
import consistencyEngine from './services/consistencyEngine';
import { isFeatureEnabled } from './config/featureFlags';

// After generation
const result = await dnaWorkflowOrchestrator.runA1SheetWorkflow(ctx);

// Check consistency
if (isFeatureEnabled('showConsistencyWarnings')) {
  const report = await consistencyEngine.checkDesignConsistency(result);
  
  if (!report.passed) {
    // Show warning modal
    const proceed = await showConsistencyWarning(report.issues);
    if (!proceed) {
      return; // User cancelled export
    }
  }
}

// Proceed with export
```

### Step 5: Add Cost Estimation

```javascript
import costEstimationService from './services/costEstimationService';

// After DNA and metrics are computed
const costReport = costEstimationService.estimateCosts({
  masterDNA: result.masterDNA,
  metrics: result.metrics,
  locationProfile: result.locationProfile,
  projectType: 'residential'
});

// Display in UI
console.log(`Total: £${costReport.totalCost.toLocaleString()}`);
console.log(`Rate: £${costReport.summary.ratePerM2}/m²`);

// Export to CSV
const csv = costEstimationService.exportToCsv(costReport);
downloadFile('cost-estimate.csv', csv, 'text/csv');

// Or use SheetExportService
const blob = await sheetExportService.export({
  format: 'csv',
  designProject: { ...result, costReport }
});
```

### Step 6: Use Geometry-First (Optional)

Enable geometry-first for CAD/BIM exports:

```javascript
import { setFeatureFlag } from './config/featureFlags';
import { buildGeometryFromDNA } from './geometry/buildGeometry';
import { renderAllViews } from './render/renderViews';

// Enable geometry-first
setFeatureFlag('geometryFirst', true);

// After DNA generation
const geometry = buildGeometryFromDNA(result.masterDNA);

// Render views from geometry
const views = await renderAllViews(geometry);

// Now you can export real CAD/BIM
const dxf = await sheetExportService.export({
  format: 'dxf',
  designProject: { ...result, geometry }
});
```

---

## API Changes

### POST /api/sheet

**Old:**
```
GET /api/sheet?design_id=123&format=svg
```

**New:**
```
POST /api/sheet?format=svg
Content-Type: application/json

{
  "masterDNA": { ... },
  "locationProfile": { ... },
  "views": { ... },
  "metrics": { ... },
  "costReport": { ... },
  "siteMapImage": "data:image/png;base64,...",
  "designId": "design-123",
  "seed": 123456
}
```

**Benefits:**
- No database required (design data in request)
- Real views and site maps embedded
- Complete metadata in SVG
- Supports cost table inclusion

---

## Environment Variables

### New (Optional)

```bash
# For GPT-5 support (future)
OPENAI_GPT5_API_KEY=sk-...

# For Claude 4.5 support (future)
CLAUDE_API_KEY=sk-ant-...
```

### Existing (Still Required)

```bash
TOGETHER_API_KEY=tgp_v1_...
REACT_APP_GOOGLE_MAPS_API_KEY=...
REACT_APP_OPENWEATHER_API_KEY=...
```

ModelRouter will automatically detect available keys and select the best model.

---

## Troubleshooting

### Issue: "ModelRouter not found"

**Solution:** Ensure you're importing from the correct path:

```javascript
import modelRouter from './services/modelRouter';
// NOT: import modelRouter from './services/modelRouter.js';
```

### Issue: "PromptLibrary template not found"

**Solution:** Check template name:

```javascript
// Correct
promptLibrary.buildDNAGenerationPrompt({ ... })

// Incorrect
promptLibrary.buildDNAPrompt({ ... })
```

Available templates: `getAvailableTemplates()`

### Issue: "Consistency check fails"

**Solution:** Check which checks failed:

```javascript
const report = await consistencyEngine.checkDesignConsistency(result);

console.log('Failed checks:', report.checks.filter(c => !c.passed));
console.log('Issues:', report.issues);

// Fix issues and re-run
```

### Issue: "Cost estimation returns zero"

**Solution:** Ensure metrics are computed first:

```javascript
// Compute metrics before cost estimation
const metrics = metricsCalculator.calculateMetrics({
  masterDNA: result.masterDNA,
  geometryData: result.geometry,
  projectContext: result.projectContext
});

result.metrics = metrics;

// Now estimate costs
const costReport = costEstimationService.estimateCosts(result);
```

### Issue: "DXF export is placeholder"

**Solution:** Enable geometry-first:

```javascript
import { setFeatureFlag } from './config/featureFlags';
import { buildGeometryFromDNA } from './geometry/buildGeometry';

setFeatureFlag('geometryFirst', true);

const geometry = buildGeometryFromDNA(result.masterDNA);
result.geometry = geometry;

// Now DXF will include real geometry
const dxf = await sheetExportService.export({
  format: 'dxf',
  designProject: result
});
```

---

## Testing Your Migration

### 1. Test DNA Generation

```bash
node test-dna-pipeline.js
```

Expected: DNA generated via ModelRouter with model name logged

### 2. Test A1 Workflow

```bash
node test-a1-modify-consistency.js
```

Expected: A1 sheet generated with consistency check

### 3. Test Exports

```javascript
// In browser console after generation
import sheetExportService from './services/sheetExportService';

// Test SVG export
const svg = await sheetExportService.export({
  format: 'svg',
  designProject: window.lastDesignResult
});
console.log('SVG size:', svg.size);

// Test DXF export
const dxf = await sheetExportService.export({
  format: 'dxf',
  designProject: window.lastDesignResult
});
console.log('DXF size:', dxf.size);
```

### 4. Test Consistency

```javascript
import consistencyEngine from './services/consistencyEngine';

const report = await consistencyEngine.checkDesignConsistency(window.lastDesignResult);
console.log('Consistency:', report);
```

### 5. Test Cost Estimation

```javascript
import costEstimationService from './services/costEstimationService';

const cost = costEstimationService.estimateCosts(window.lastDesignResult);
console.log('Total cost:', cost.totalCost);
console.log('Rate/m²:', cost.summary.ratePerM2);
```

---

## Rollback Plan

If you encounter issues, you can temporarily disable new features:

```javascript
import { setFeatureFlag } from './config/featureFlags';

// Disable ModelRouter (use legacy services)
setFeatureFlag('useModelRouter', false);

// Disable consistency warnings
setFeatureFlag('showConsistencyWarnings', false);

// Disable geometry-first
setFeatureFlag('geometryFirst', false);
```

The platform will fall back to legacy behavior while you debug.

---

## Performance Considerations

### ModelRouter Overhead

ModelRouter adds ~50-100ms overhead for:
- Provider detection (cached for 5 minutes)
- Model selection logic
- Performance tracking

This is negligible compared to AI call latency (10-60 seconds).

### Consistency Checks

ConsistencyEngine adds ~1-2 seconds for:
- DNA validation
- Site compliance
- Geometry validation (if enabled)
- Metrics sanity checks
- A1 sheet structure validation

Run consistency checks **after generation**, not during, to avoid blocking the UI.

### Cost Estimation

CostEstimationService is fast (<100ms) and can run in parallel with consistency checks.

---

## Best Practices

### 1. Always Use ModelRouter for New Code

```javascript
// ✅ Good
import modelRouter from './services/modelRouter';
const result = await modelRouter.callLLM('DNA_GENERATION', { ... });

// ❌ Avoid
const response = await fetch('/api/together/chat', { ... });
```

### 2. Use PromptLibrary for Consistency

```javascript
// ✅ Good
import promptLibrary from './services/promptLibrary';
const prompt = promptLibrary.buildDNAGenerationPrompt({ ... });

// ❌ Avoid
const prompt = `You are an architect. Generate DNA for ${projectType}...`;
```

### 3. Check Consistency Before Exports

```javascript
// ✅ Good
const report = await consistencyEngine.checkDesignConsistency(result);
if (report.passed) {
  await exportDesign();
}

// ❌ Avoid
await exportDesign(); // No validation
```

### 4. Include Cost Estimates

```javascript
// ✅ Good
const cost = costEstimationService.estimateCosts(result);
result.costReport = cost;

// Display in UI
showCostSummary(cost);

// ❌ Avoid
// Exporting without cost information
```

### 5. Use SheetExportService

```javascript
// ✅ Good
const blob = await sheetExportService.export({ format: 'svg', ... });

// ❌ Avoid
const blob = new Blob([svgContent], { type: 'image/svg+xml' });
// (Misses metadata, site map embedding, etc.)
```

---

## Common Migration Patterns

### Pattern 1: DNA Generation

```javascript
// Before (v1.x)
const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
  projectContext,
  portfolioAnalysis,
  locationData
);

// After (v2.0) - Same API, improved internally
const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
  projectContext,
  portfolioAnalysis,
  locationData
);
// Now uses ModelRouter + promptLibrary internally
```

### Pattern 2: A1 Sheet Export

```javascript
// Before (v1.x)
downloadFile(`sheet-${designId}.svg`, svgContent, 'image/svg+xml');

// After (v2.0)
import sheetExportService from './services/sheetExportService';

const blob = await sheetExportService.export({
  format: 'svg',
  designProject: result,
  sheetArtifact: result.a1Sheet
});

const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `sheet-${designId}.svg`;
a.click();
```

### Pattern 3: Modify Workflow

```javascript
// Before (v1.x)
const updatedDNA = await togetherAIReasoningService.generateUpdatedDNA({
  currentDNA,
  changeRequest,
  projectContext
});

// After (v2.0) - Same API, improved internally
const updatedDNA = await togetherAIReasoningService.generateUpdatedDNA({
  currentDNA,
  changeRequest,
  projectContext
});
// Now uses ModelRouter + promptLibrary.buildModificationPrompt()
// Tracks changes in updatedDNA.changes[]
```

### Pattern 4: Complete Workflow

```javascript
// Before (v1.x)
const result = await dnaWorkflowOrchestrator.runA1SheetWorkflow(ctx);
// Done

// After (v2.0) - Add consistency and cost
const result = await dnaWorkflowOrchestrator.runA1SheetWorkflow(ctx);

// Check consistency
const consistency = await consistencyEngine.checkDesignConsistency(result);
result.consistencyReport = consistency;

// Estimate cost
const cost = costEstimationService.estimateCosts(result);
result.costReport = cost;

// Now result includes:
// - masterDNA
// - a1Sheet
// - consistencyReport ← NEW
// - costReport ← NEW
```

---

## UI Integration

### Add Design Reasoning Panel

```javascript
import DesignReasoningPanel from './components/DesignReasoningPanel';

// In your component
const [reasoning, setReasoning] = useState(null);

// After reasoning generation
const reasoningResult = await reasoningOrchestrator.generateDesignReasoning(context);
setReasoning(reasoningResult);

// Render panel
<DesignReasoningPanel 
  reasoning={reasoning}
  visible={true}
  onClose={() => setReasoning(null)}
/>
```

### Show Consistency Warnings

```javascript
import { isFeatureEnabled } from './config/featureFlags';

// Before export
if (isFeatureEnabled('showConsistencyWarnings')) {
  const report = await consistencyEngine.checkDesignConsistency(result);
  
  if (!report.passed) {
    // Show modal with issues
    const proceed = await showWarningModal({
      title: 'Consistency Issues Detected',
      message: `Consistency score: ${(report.score * 100).toFixed(1)}%`,
      issues: report.issues,
      actions: ['Fix Issues', 'Proceed Anyway', 'Cancel']
    });
    
    if (proceed !== 'Proceed Anyway') {
      return; // Don't export
    }
  }
}
```

### Display Cost Summary

```javascript
// After cost estimation
if (result.costReport) {
  <div className="cost-summary">
    <h3>Cost Estimate</h3>
    <div className="total">
      £{result.costReport.totalCost.toLocaleString()}
    </div>
    <div className="rate">
      £{result.costReport.summary.ratePerM2}/m²
    </div>
    <button onClick={() => exportCostReport()}>
      Export CSV
    </button>
  </div>
}
```

---

## Breaking Changes

### None for Basic Usage

The refactoring maintains backward compatibility. Existing code will continue to work.

### For Advanced Users

If you were directly calling Together.ai or OpenAI APIs:

1. **Replace direct fetch calls** with `modelRouter.callLLM()` or `modelRouter.callImage()`
2. **Update prompt strings** to use `promptLibrary` templates
3. **Add consistency checks** before exports (optional but recommended)

---

## Benefits of Migration

### 1. Env-Driven Model Selection
- Automatically uses best available model (GPT-5, Claude, Llama, Qwen)
- No code changes when adding new API keys
- Graceful fallback on errors

### 2. Centralized Prompts
- Easy to update and version
- Consistent across all services
- Testable in isolation

### 3. Unified Validation
- Single API for all consistency checks
- Comprehensive reports
- User-friendly error messages

### 4. Professional Exports
- Real CAD/BIM formats (DXF, IFC)
- Cost reports (CSV)
- Complete A1 sheets with metadata

### 5. Better Debugging
- Performance tracking
- Model selection reasoning logged
- Consistency issues clearly identified

---

## Support

For issues or questions:

1. Check console logs for ModelRouter selection reasoning
2. Verify feature flags: `getAllFeatureFlags()`
3. Test consistency: `consistencyEngine.quickCheck(result)`
4. Review implementation summary: `REDESIGN_IMPLEMENTATION_SUMMARY.md`

---

## Changelog

### v2.0.0 (November 15, 2025)

**Added:**
- ModelRouter for env-driven model selection
- PromptLibrary with 8 versioned templates
- ConsistencyEngine with 6 check types
- CostEstimationService with location multipliers
- Geometry-first core modules (TypeScript)
- SheetComposer for unified A1 generation
- SheetExportService for multi-format exports
- DesignReasoningPanel UI component
- Real DXF and IFC exports

**Changed:**
- enhancedDNAGenerator uses ModelRouter internally
- reasoningOrchestrator uses ModelRouter internally
- togetherAIReasoningService uses ModelRouter for modify DNA
- workflowOrchestrator includes consistency and cost in completeGeneration()
- api/sheet.js accepts POST with design data
- bimService exports real DXF and IFC (not placeholders)

**Deprecated:**
- Direct AI service calls (use ModelRouter)
- Inline prompts (use PromptLibrary)
- Ad-hoc export functions (use SheetExportService)

**Removed:**
- None (backward compatible)

---

**Migration Status**: ✅ Complete  
**Backward Compatibility**: ✅ Maintained  
**Production Ready**: ✅ Yes (with testing)

