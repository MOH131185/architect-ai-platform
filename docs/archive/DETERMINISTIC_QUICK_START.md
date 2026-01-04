# Deterministic Architecture Quick Start

## For Developers: Using the New Pure Services

### Quick Example: Generate A1 Sheet

```javascript
import { createEnvironmentAdapter } from './src/services/environmentAdapter';
import { runA1SheetWorkflow } from './src/services/pureOrchestrator';

// 1. Create environment adapter
const env = createEnvironmentAdapter();

// 2. Prepare inputs
const designSpec = {
  buildingProgram: 'three-bedroom house',
  floorArea: 200,
  floors: 2,
  style: 'Contemporary'
};

const siteSnapshot = {
  address: '123 Main St, Birmingham, UK',
  coordinates: { lat: 52.4862, lng: -1.8904 },
  sitePolygon: [],
  climate: { type: 'temperate oceanic' }
};

// 3. Generate sheet
const result = await runA1SheetWorkflow({
  env,
  siteSnapshot,
  designSpec,
  featureFlags: {},
  seed: 123456,        // Fixed seed for reproducibility
  sheetType: 'ARCH',
  overlays: [],
  mode: 'generate',
  hooks: {}
});

// 4. Use result
console.log('Sheet URL:', result.url);
console.log('Seed used:', result.seed);
console.log('DNA hash:', result.metadata.dnaHash);
console.log('Consistency:', result.consistencyScore);
```

### Quick Example: Modify A1 Sheet

```javascript
import { createEnvironmentAdapter } from './src/services/environmentAdapter';
import { modifySheet } from './src/services/pureModificationService';

// 1. Create environment adapter
const env = createEnvironmentAdapter();

// 2. Prepare modification request
const modifyRequest = {
  designId: 'design_123',
  sheetId: 'sheet_456',
  versionId: 'base',
  quickToggles: {
    addSections: true,
    add3DView: false,
    addDetails: false
  },
  customPrompt: '',
  strictLock: true,
  imageStrength: 0.14  // 86% preserve
};

// 3. Modify sheet
const result = await modifySheet({
  designRef: { id: 'design_123', sheetId: 'sheet_456' },
  modifyRequest,
  env,
  featureFlags: {}
});

// 4. Check results
console.log('Modified URL:', result.sheet.url);
console.log('Drift score:', result.driftScore);
console.log('Consistency:', 1 - result.driftScore);
console.log('Version ID:', result.versionId);
```

### Quick Example: React Component

```javascript
import { useArchitectAIWorkflow } from './src/hooks/useArchitectAIWorkflow';

function MyComponent() {
  const {
    loading,
    error,
    result,
    progress,
    generateSheet,
    modifySheetWorkflow
  } = useArchitectAIWorkflow();
  
  const handleGenerate = async () => {
    await generateSheet({
      designSpec: { buildingProgram: 'house', floorArea: 200, floors: 2 },
      siteSnapshot: { address: '...', coordinates: { ... } },
      seed: 123456,
      sheetType: 'ARCH'
    });
  };
  
  const handleModify = async () => {
    await modifySheetWorkflow({
      designId: result.designId,
      modifyRequest: {
        quickToggles: { addSections: true },
        strictLock: true
      }
    });
  };
  
  return (
    <div>
      {loading && <p>Loading... {progress.message}</p>}
      {error && <p>Error: {error}</p>}
      {result && <img src={result.url} alt="A1 Sheet" />}
      
      <button onClick={handleGenerate} disabled={loading}>
        Generate
      </button>
      <button onClick={handleModify} disabled={loading || !result}>
        Modify
      </button>
    </div>
  );
}
```

## Key Concepts

### 1. Environment Adapter

**What**: Abstracts environment differences
**Why**: Services work in any environment
**How**: Pass `env` to all service functions

```javascript
const env = createEnvironmentAdapter();
// env.api.urls, env.api.keys, env.flags, env.storage
```

### 2. Baseline Artifacts

**What**: Immutable reference for modifications
**Why**: Ensures 100% consistency
**How**: Auto-created on generation, loaded on modification

```javascript
// Auto-created on generation
const baseline = baselineArtifactStore.createBundleFromGenerationResult({ ... });
await baselineArtifactStore.saveBaselineArtifacts({ designId, sheetId, bundle });

// Loaded on modification
const baseline = await baselineArtifactStore.getBaselineArtifacts({ designId, sheetId });
```

### 3. Drift Detection

**What**: Measures consistency between baseline and modified
**Why**: Prevents layout/geometry drift
**How**: SSIM/pHash + DNA comparison

```javascript
const drift = await detectImageDrift(baselineUrl, candidateUrl, { panelCoordinates });

if (drift.driftScore > 0.15) {
  // Retry with stricter lock
}
```

### 4. Deterministic Seeds

**What**: Fixed seeds for reproducibility
**Why**: Same seed → same output
**How**: Pass explicit seed, reuse in modifications

```javascript
// Generation
const result = await generateSheet({ seed: 123456, ... });

// Modification (reuses baseline seed)
const modifyResult = await modifySheet({ ... }); // Auto-uses baseline seed
```

## Common Patterns

### Pattern 1: Generate → Save → Modify

```javascript
// 1. Generate
const generated = await generateSheet({ seed: 123456, ... });

// 2. Save to repository
const designId = await repository.saveDesign({
  dna: generated.dna,
  basePrompt: generated.prompt,
  seed: generated.seed,
  resultUrl: generated.url,
  ...
});

// 3. Modify
const modified = await modifySheet({
  designRef: { id: designId },
  modifyRequest: { quickToggles: { addSections: true } },
  env
});
```

### Pattern 2: Load → Modify → Export

```javascript
// 1. Load design
const design = await repository.getDesignById('design_123');

// 2. Modify
const modified = await modifySheet({
  designRef: { id: design.id },
  modifyRequest: { ... },
  env
});

// 3. Export
const exported = await exportService.exportSheet({
  sheet: modified.sheet,
  format: 'PDF',
  env
});
```

### Pattern 3: Multi-Sheet Generation

```javascript
// Generate ARCH sheet
const archResult = await runA1SheetWorkflow({
  env,
  designSpec,
  siteSnapshot,
  seed: 123456,
  sheetType: 'ARCH',
  ...
});

// Generate STRUCTURE sheet (same DNA, same seed)
const structResult = await runA1SheetWorkflow({
  env,
  designSpec,
  siteSnapshot,
  seed: 123456,          // Same seed
  sheetType: 'STRUCTURE',
  ...
});

// Both sheets consistent with each other
```

## Troubleshooting

### Issue: "Baseline artifacts not found"

```javascript
// Solution: Regenerate base sheet
const result = await generateSheet({ ... });
// Baseline artifacts auto-created
```

### Issue: "Drift too high"

```javascript
// Solution 1: Simplify request
const modifyRequest = {
  quickToggles: { addDetails: true }, // Simpler change
  strictLock: true
};

// Solution 2: Reduce strength
const modifyRequest = {
  quickToggles: { addSections: true },
  imageStrength: 0.10  // More preservation
};
```

### Issue: "Storage quota exceeded"

```javascript
// Solution: Switch to IndexedDB
import { createStorageBackend } from './utils/storageManager';

const backend = createStorageBackend('indexedDB');
const manager = new StorageManager(50, 5, backend);
```

## API Reference

### Core Functions

```javascript
// Environment
createEnvironmentAdapter()
createBrowserEnv()
createServerEnv()

// Orchestration
runA1SheetWorkflow(params)
runModifyWorkflow(params)

// Modification
modifySheet(params)

// Prompt Building
buildSheetPrompt(params)
buildCompactModifyPrompt(params)

// Drift Detection
detectDNADrift(baseline, candidate)
detectImageDrift(baselineUrl, candidateUrl, options)

// DNA Operations
normalizeDNA(dna)
hashDNA(dna)
compareDNA(baseDNA, candidateDNA)

// Layout Operations
computeStableLayout(sheetMetadata)
compareLayouts(baseline, candidate)

// Export
exportService.exportSheet({ sheet, format, env })
exportService.exportCAD({ sheet, format, env })
exportService.exportBIM({ sheet, format, env })
```

## Testing

### Unit Test Template

```javascript
import { buildSheetPrompt } from './services/a1SheetPromptBuilder';

describe('My Service', () => {
  it('is deterministic', () => {
    const params = { ... };
    const result1 = myFunction(params);
    const result2 = myFunction(params);
    expect(result1).toEqual(result2);
  });
});
```

### Integration Test Template

```javascript
import { runA1SheetWorkflow } from './services/pureOrchestrator';

describe('A1 Workflow', () => {
  it('generates sheet', async () => {
    const params = { env, designSpec, seed: 123 };
    const result = await runA1SheetWorkflow(params);
    expect(result.seed).toBe(123);
  });
});
```

---

**Quick Start Version**: 1.0
**Last Updated**: January 19, 2025
**Status**: Phase 1 Complete

