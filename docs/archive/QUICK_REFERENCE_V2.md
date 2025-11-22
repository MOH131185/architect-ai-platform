# Quick Reference - Architect AI Platform v2.0

**One-page guide for developers**

---

## 🚀 Quick Start

```javascript
// 1. Import new services
import modelRouter from './services/modelRouter';
import promptLibrary from './services/promptLibrary';
import consistencyEngine from './services/consistencyEngine';
import costEstimationService from './services/costEstimationService';
import sheetExportService from './services/sheetExportService';

// 2. Generate DNA (now uses ModelRouter internally)
const dna = await enhancedDNAGenerator.generateMasterDesignDNA(
  projectContext,
  portfolioAnalysis,
  locationData
);

// 3. Generate A1 sheet
const result = await dnaWorkflowOrchestrator.runA1SheetWorkflow({
  projectContext,
  locationData,
  seed: dna.seed
});

// 4. Validate consistency
const consistency = await consistencyEngine.checkDesignConsistency(result);

// 5. Estimate cost
const cost = costEstimationService.estimateCosts(result);

// 6. Export
const svg = await sheetExportService.export({ format: 'svg', designProject: result });
const dxf = await sheetExportService.export({ format: 'dxf', designProject: result });
const csv = await sheetExportService.export({ format: 'csv', designProject: { ...result, costReport: cost } });
```

---

## 📦 New Services

| Service | Purpose | Key Methods |
|---------|---------|-------------|
| **modelRouter** | AI call routing | `callLLM()`, `callImage()` |
| **promptLibrary** | Prompt templates | `buildDNAGenerationPrompt()`, etc. |
| **consistencyEngine** | Validation | `checkDesignConsistency()` |
| **costEstimationService** | Cost analysis | `estimateCosts()`, `exportToCsv()` |
| **sheetExportService** | Multi-format export | `export({format, ...})` |

---

## 🎯 Model Selection (Automatic)

| Task | Primary | Fallback | Provider |
|------|---------|----------|----------|
| DNA | Qwen 72B | Llama 405B | Together |
| Reasoning | Llama 405B | Qwen 72B | Together |
| A1 Image | FLUX.1-dev | FLUX.1-schnell | Together |
| 2D Tech | FLUX.1-schnell | FLUX.1-dev | Together |
| 3D Photo | FLUX.1-dev | - | Together |

*GPT-5 and Claude will be used when API keys available*

---

## 📝 Prompt Templates

```javascript
import promptLibrary from './services/promptLibrary';

// Available templates
const templates = [
  'siteAnalysis',           // Site intelligence
  'climateLogic',           // Climate analysis
  'portfolioStyle',         // Portfolio extraction
  'blendedStyle',           // Style merging
  'dnaGeneration',          // Master DNA
  'architecturalReasoning', // Design reasoning
  'a1SheetGeneration',      // A1 prompt
  'modification'            // DNA updates
];

// Usage
const prompt = promptLibrary.buildDNAGenerationPrompt({
  projectBrief: 'Modern clinic',
  projectType: 'clinic',
  area: 500,
  locationProfile,
  blendedStyle,
  siteMetrics,
  programSpaces
});

// Returns: { systemPrompt, userPrompt, version: '1.0.0' }
```

---

## ✅ Consistency Checks

```javascript
const report = await consistencyEngine.checkDesignConsistency(result);

// Report structure:
{
  passed: true,              // Overall pass/fail
  score: 0.96,               // 0-1 score
  checks: [                  // Individual checks
    { name: 'DNA Validation', passed: true, score: 1.0 },
    { name: 'Site Boundary', passed: true, score: 0.98 },
    { name: 'Geometry', passed: true, score: 1.0 },
    { name: 'Metrics', passed: true, score: 0.95 },
    { name: 'A1 Structure', passed: true, score: 0.92 },
    { name: 'Version', passed: true, score: 0.94 }
  ],
  issues: [],                // List of issues
  summary: {                 // Summary
    checksRun: 6,
    checksPassed: 6,
    recommendation: '...'
  }
}

// Quick check (fast)
const quick = consistencyEngine.quickCheck(result);
// Returns: { passed: true, message: '...' }
```

---

## 💰 Cost Estimation

```javascript
const cost = costEstimationService.estimateCosts({
  masterDNA: result.masterDNA,
  metrics: result.metrics,
  locationProfile: result.locationProfile,
  projectType: 'residential'
});

// Cost structure:
{
  totalCost: 320000,         // £320,000
  subtotal: 256000,          // Construction only
  softCosts: 64000,          // Prelims + design + contingency
  breakdown: {               // By system
    substructure: { cost: 17000, rate: 85 },
    superstructure: { cost: 84000, rate: 420 },
    envelope: { cost: 76000, rate: 380 },
    finishes: { cost: 58000, rate: 290 },
    mep: { cost: 62000, rate: 310 },
    external: { cost: 19000, rate: 95 }
  },
  summary: {
    ratePerM2: 1600,         // £1,600/m²
    marketRate: 1550,        // Market benchmark
    variance: +3.2,          // 3.2% above market
    locationMultiplier: 1.0  // UK average
  }
}

// Export to CSV
const csv = costEstimationService.exportToCsv(cost);
```

---

## 📤 Export Formats

```javascript
import sheetExportService from './services/sheetExportService';

// SVG (vector)
const svg = await sheetExportService.export({
  format: 'svg',
  designProject: result,
  sheetArtifact: result.a1Sheet
});

// PNG (raster)
const png = await sheetExportService.export({
  format: 'png',
  designProject: result,
  sheetArtifact: result.a1Sheet
});

// DXF (AutoCAD)
const dxf = await sheetExportService.export({
  format: 'dxf',
  designProject: result
});

// IFC (BIM)
const ifc = await sheetExportService.export({
  format: 'ifc',
  designProject: result
});

// CSV (cost)
const csv = await sheetExportService.export({
  format: 'csv',
  designProject: { ...result, costReport: cost }
});

// All return Blob objects ready for download
```

---

## 🎨 UI Components

### Design Reasoning Panel

```javascript
import DesignReasoningPanel from './components/DesignReasoningPanel';

<DesignReasoningPanel 
  reasoning={reasoningResult}
  visible={true}
  onClose={() => setReasoning(null)}
/>

// Shows 7 sections:
// - Design Philosophy
// - Style Rationale
// - Spatial Organization
// - Materials
// - Environmental
// - Code Compliance
// - Cost Strategies
```

---

## ⚙️ Feature Flags

```javascript
import { setFeatureFlag, isFeatureEnabled } from './config/featureFlags';

// New flags in v2.0
setFeatureFlag('useModelRouter', true);          // Default: true
setFeatureFlag('showConsistencyWarnings', true); // Default: true
setFeatureFlag('useFluxKontextForA1', false);    // Default: false (Tier 2+)

// Existing flags
setFeatureFlag('geometryFirst', false);          // Default: false
setFeatureFlag('a1Only', true);                  // Default: true

// Check flag
if (isFeatureEnabled('showConsistencyWarnings')) {
  // Show validation results
}
```

---

## 🔍 Debugging

### Check Model Selection

```javascript
import modelRouter from './services/modelRouter';

// View performance stats
const stats = modelRouter.getPerformanceStats();
console.log('Model performance:', stats);

// Check available providers
console.log('Available:', modelRouter.availableProviders);
```

### Check Consistency

```javascript
import consistencyEngine from './services/consistencyEngine';

// Quick check
const quick = consistencyEngine.quickCheck(result);
console.log('Quick check:', quick.passed);

// Full check
const full = await consistencyEngine.checkDesignConsistency(result);
console.log('Full check:', full.score, full.issues);
```

### Check Cost Calculation

```javascript
import costEstimationService from './services/costEstimationService';

const cost = costEstimationService.estimateCosts(result);
console.log('Total:', cost.totalCost);
console.log('Breakdown:', cost.breakdown);
console.log('Rate/m²:', cost.summary.ratePerM2);
```

---

## 📚 Documentation

- `MIGRATION_GUIDE.md` - How to upgrade
- `ARCHITECTURE_V2.md` - Complete system architecture
- `REDESIGN_IMPLEMENTATION_SUMMARY.md` - Implementation details
- `REDESIGN_COMPLETE.md` - Completion summary

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "ModelRouter not found" | Check import path: `./services/modelRouter` |
| "Template not found" | Use `getAvailableTemplates()` to see list |
| "Consistency check fails" | Review `report.issues` for specific problems |
| "Cost is zero" | Ensure metrics computed first |
| "DXF is placeholder" | Enable `geometryFirst` flag |

---

## ✨ Pro Tips

1. **Always use ModelRouter** for new AI calls
2. **Use PromptLibrary** instead of inline strings
3. **Check consistency** before exports
4. **Include cost estimates** in professional presentations
5. **Enable geometryFirst** for CAD/BIM workflows

---

**Version**: 2.0.0  
**Last Updated**: November 15, 2025  
**Status**: Production Ready

