# Deterministic Architecture Guide

## Overview

This guide explains the new deterministic architecture for the Architect AI platform. The architecture ensures reproducible, testable, and drift-free A1 sheet generation and modification.

## Core Principles

### 1. Determinism
**Same inputs → Same outputs**

- Fixed seeds throughout the pipeline
- Deterministic prompt generation
- No random elements
- Reproducible across sessions and environments

### 2. Purity
**No side effects**

- Pure functions (no storage reads, no feature flag checks)
- All context passed via parameters
- No browser dependencies
- Environment-agnostic

### 3. Immutability
**Baseline artifacts never change**

- Baseline artifacts frozen (Object.freeze)
- Modifications reference baseline, never mutate it
- Version history preserves all states

### 4. Testability
**Easy to test**

- Pure functions with no side effects
- Dependency injection
- Mockable dependencies
- Deterministic behavior

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    React UI Layer                        │
│  Components, Hooks, State Management                     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Workflow Orchestration Layer                │
│  useArchitectAIWorkflow Hook                             │
│  - Manages state (loading, error, result)               │
│  - Calls pure services                                   │
│  - Handles progress tracking                             │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────┐
│                 Pure Service Layer                       │
│  pureOrchestrator, pureModificationService, etc.        │
│  - No side effects                                       │
│  - All context via parameters                            │
│  - Deterministic behavior                                │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Infrastructure Layer                        │
│  environmentAdapter, designHistoryRepository, etc.      │
│  - Environment abstraction                               │
│  - Storage backends                                      │
│  - Configuration                                         │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### Environment Adapter

**Purpose**: Abstract environment differences

```javascript
import { createEnvironmentAdapter } from './services/environmentAdapter';

const env = createEnvironmentAdapter();

// Environment info
env.env.isBrowser    // true in browser
env.env.isNode       // true in Node
env.env.isDev        // true in development
env.env.isProd       // true in production
env.env.isVercel     // true on Vercel

// API configuration
env.api.urls.togetherImage  // '/api/together/image'
env.api.keys.togetherApiKey // (server only)

// Feature flags
await env.flags.get('geometryFirst', false)
await env.flags.set('geometryFirst', true)

// Storage
env.storage.get('wizardState')
env.storage.set('wizardState', data)
```

### Design History Repository

**Purpose**: Persist designs with version history

```javascript
import repository from './services/designHistoryRepository';

// Save design
const designId = await repository.saveDesign({
  dna,
  basePrompt,
  seed,
  sheetType: 'ARCH',
  sheetMetadata,
  overlays,
  projectContext,
  locationData,
  siteSnapshot,
  resultUrl
});

// Get design
const design = await repository.getDesignById(designId);

// Add version
const versionId = await repository.updateDesignVersion(designId, {
  resultUrl,
  deltaPrompt,
  seed,
  driftScore,
  metadata
});

// List designs
const designs = await repository.listDesigns();

// Migrate legacy data
await repository.migrateFromLegacyStorage();
```

### Pure Orchestrator

**Purpose**: Orchestrate A1 sheet generation workflow

```javascript
import { runA1SheetWorkflow } from './services/pureOrchestrator';

const sheetResult = await runA1SheetWorkflow({
  env,                    // Environment adapter
  siteSnapshot,           // Site data
  designSpec,             // Design specifications
  featureFlags: {},       // Feature flags
  seed: 123456,           // Generation seed
  sheetType: 'ARCH',      // Sheet type
  overlays: [],           // Overlays
  mode: 'generate',       // Mode (generate/modify)
  hooks: {                // Injected hooks
    composeOverlay: async (baseUrl, overlays) => { ... },
    exportSheet: async (sheetResult) => { ... }
  }
});

// Result
sheetResult.url              // Sheet image URL
sheetResult.seed             // Seed used
sheetResult.dna              // Master DNA
sheetResult.metadata         // Sheet metadata
sheetResult.consistencyScore // Consistency score
```

### Pure Modification Service

**Purpose**: Modify A1 sheets with consistency guarantees

```javascript
import { modifySheet } from './services/pureModificationService';

const modifyResult = await modifySheet({
  designRef: {
    id: 'design_123',
    sheetId: 'sheet_456'
  },
  baseSheet: null,        // Loaded from baseline
  dna: null,              // Loaded from baseline
  modifyRequest: {
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
    imageStrength: 0.14
  },
  env,
  featureFlags: {},
  seed: null              // Uses baseline seed
});

// Result
modifyResult.sheet.url        // Modified sheet URL
modifyResult.versionId        // New version ID
modifyResult.driftScore       // Drift score (0-1)
modifyResult.consistencyScore // 1 - driftScore
modifyResult.modifiedPanels   // Panels that changed
```

### Baseline Artifact Store

**Purpose**: Manage immutable baseline artifacts

```javascript
import baselineArtifactStore from './services/baselineArtifactStore';

// Create bundle from generation result
const bundle = baselineArtifactStore.createBundleFromGenerationResult({
  designId,
  sheetId,
  sheetResult,
  dna,
  siteSnapshot,
  layout,
  seed,
  basePrompt
});

// Save baseline artifacts
await baselineArtifactStore.saveBaselineArtifacts({
  designId,
  sheetId,
  bundle
});

// Load baseline artifacts
const baseline = await baselineArtifactStore.getBaselineArtifacts({
  designId,
  sheetId
});

// Ensure immutability
await baselineArtifactStore.ensureImmutable(baselineKey);
```

### Workflow Hook

**Purpose**: React hook for UI integration

```javascript
import { useArchitectAIWorkflow } from './hooks/useArchitectAIWorkflow';

function MyComponent() {
  const {
    loading,
    error,
    result,
    progress,
    generateSheet,
    modifySheetWorkflow,
    exportSheetWorkflow,
    loadDesign,
    listDesigns,
    clearError,
    reset
  } = useArchitectAIWorkflow();
  
  const handleGenerate = async () => {
    try {
      const result = await generateSheet({
        designSpec: { ... },
        siteSnapshot: { ... },
        featureFlags: {},
        seed: 123456,
        sheetType: 'ARCH',
        overlays: []
      });
      
      console.log('Generated:', result.url);
    } catch (err) {
      console.error('Generation failed:', err);
    }
  };
  
  const handleModify = async () => {
    try {
      const result = await modifySheetWorkflow({
        designId: 'design_123',
        sheetId: 'sheet_456',
        modifyRequest: {
          quickToggles: { addSections: true },
          customPrompt: '',
          strictLock: true
        }
      });
      
      console.log('Modified:', result.sheet.url);
      console.log('Drift score:', result.driftScore);
    } catch (err) {
      console.error('Modification failed:', err);
    }
  };
  
  return (
    <div>
      {loading && <p>Loading... {progress.message}</p>}
      {error && <p>Error: {error}</p>}
      {result && <img src={result.url} alt="A1 Sheet" />}
      
      <button onClick={handleGenerate}>Generate</button>
      <button onClick={handleModify}>Modify</button>
    </div>
  );
}
```

## Workflows

### Generation Workflow

```
1. User Input
   ↓
2. Generate Master DNA (Qwen reasoning)
   ↓
3. Validate DNA (auto-fix if needed)
   ↓
4. Build Prompt (deterministic, multi-sheet aware)
   ↓
5. Generate Image (FLUX.1-dev, fixed seed)
   ↓
6. Validate Result (consistency checks)
   ↓
7. Detect Drift (if validation fails)
   ├─ Autocorrect DNA
   ├─ Rebuild prompt
   └─ Retry generation
   ↓
8. Create Baseline Artifacts (immutable)
   ├─ baseline.png
   ├─ baselineDNA.json
   ├─ panelCoordinates.json
   ├─ seeds.json
   └─ metadata.json
   ↓
9. Compose Overlays (if provided)
   ↓
10. Save to Design History
```

### Modification Workflow

```
1. User Modification Request
   ↓
2. Load Baseline Artifacts (immutable)
   ├─ baseline.png
   ├─ baselineDNA
   ├─ panelCoordinates
   ├─ seeds
   └─ metadata
   ↓
3. Build Delta Prompt (only changes)
   ↓
4. Apply Consistency Lock
   ├─ Freeze: layout, geometry, materials
   ├─ Allow: only delta operations
   └─ Reuse: baseline seed
   ↓
5. Load Baseline Image (for img2img)
   ↓
6. Generate Modified Image
   ├─ img2img mode
   ├─ strength: 0.08-0.22
   ├─ guidance: 9.0
   └─ seed: baseline seed (reused)
   ↓
7. Detect Drift
   ├─ DNA comparison
   ├─ SSIM (whole-sheet)
   ├─ SSIM (per-panel)
   └─ pHash distance
   ↓
8. If drift > threshold:
   ├─ Retry with stricter lock
   ├─ Reduce strength by 40%
   └─ Increase guidance to 9.5
   ↓
9. If still drift > threshold:
   └─ Fail gracefully with diagnostics
   ↓
10. Save Version (with drift metrics)
```

## Configuration

### Feature Flags

```javascript
// Get feature flags
const flags = await env.flags.getAll();

// Common flags
flags.geometryFirst          // Use geometry-first pipeline
flags.hybridA1Mode           // Use hybrid panel-based generation
flags.compositeSiteSnapshot  // Composite site snapshot on modify
flags.a1PromptVersion        // Prompt version (v3, v4)
```

### Sheet Types

```javascript
const sheetTypes = ['ARCH', 'STRUCTURE', 'MEP'];

// ARCH: Architectural presentation
// STRUCTURE: Structural general arrangement
// MEP: Mechanical, electrical, plumbing
```

### Layout Keys

```javascript
const layoutKeys = [
  'uk-riba-standard',      // UK RIBA architectural
  'uk-riba-structural',    // UK RIBA structural
  'uk-riba-mep'            // UK RIBA MEP
];
```

## Error Handling

### Structured Errors

```javascript
try {
  const result = await generateSheet({ ... });
} catch (error) {
  if (error.message.includes('drift')) {
    // Drift error - suggest simplifying request
    console.error('Drift too high:', error.message);
  } else if (error.message.includes('baseline')) {
    // Baseline error - regenerate base sheet
    console.error('Baseline missing:', error.message);
  } else {
    // Other error
    console.error('Generation failed:', error.message);
  }
}
```

### Error Types

- **Validation errors**: Missing or invalid parameters
- **Generation errors**: AI generation failed
- **Drift errors**: Consistency threshold exceeded
- **Storage errors**: Storage backend failed
- **Network errors**: API call failed

## Best Practices

### 1. Always Use Seeds

```javascript
// Good: Explicit seed
const result = await generateSheet({ seed: 123456, ... });

// Bad: Random seed
const result = await generateSheet({ seed: Date.now(), ... });
```

### 2. Preserve Baseline Artifacts

```javascript
// Good: Load from baseline
const baseline = await baselineArtifactStore.getBaselineArtifacts({ designId, sheetId });

// Bad: Reconstruct from partial data
const baseline = { baselineDNA: design.dna, ... };
```

### 3. Use Type Schemas

```javascript
// Good: Normalize inputs
const dna = normalizeDNA(rawDNA);
const sheetResult = createSheetResult({ url, seed, dna, ... });

// Bad: Use raw objects
const dna = rawDNA;
const sheetResult = { url, seed, dna, ... };
```

### 4. Handle Drift Gracefully

```javascript
// Good: Check drift and retry
const modifyResult = await modifySheet({ ... });
if (modifyResult.driftScore > 0.15) {
  console.warn('High drift detected');
  // Retry with stricter lock or simplify request
}

// Bad: Ignore drift
const modifyResult = await modifySheet({ ... });
// Assume it worked
```

## Migration Guide

### From Old Services to New Services

#### Generation

**Before:**
```javascript
import dnaWorkflowOrchestrator from './services/dnaWorkflowOrchestrator';

const result = await dnaWorkflowOrchestrator.runA1SheetWorkflow({
  projectContext,
  locationData,
  seed: 123456
});
```

**After:**
```javascript
import { createEnvironmentAdapter } from './services/environmentAdapter';
import { runA1SheetWorkflow } from './services/pureOrchestrator';

const env = createEnvironmentAdapter();
const result = await runA1SheetWorkflow({
  env,
  siteSnapshot: locationData,
  designSpec: projectContext,
  featureFlags: {},
  seed: 123456,
  sheetType: 'ARCH',
  overlays: [],
  mode: 'generate',
  hooks: {}
});
```

#### Modification

**Before:**
```javascript
import aiModificationService from './services/aiModificationService';

const result = await aiModificationService.modifyA1Sheet({
  designId,
  deltaPrompt: 'Add sections',
  quickToggles: { addSections: true }
});
```

**After:**
```javascript
import { createEnvironmentAdapter } from './services/environmentAdapter';
import { modifySheet } from './services/pureModificationService';

const env = createEnvironmentAdapter();
const result = await modifySheet({
  designRef: { id: designId, sheetId: 'default' },
  modifyRequest: {
    designId,
    quickToggles: { addSections: true },
    customPrompt: 'Add sections',
    strictLock: true
  },
  env,
  featureFlags: {}
});
```

### Storage Migration

**Automatic migration** on first load:

```javascript
import repository from './services/designHistoryRepository';

// Migrate legacy data
const migrated = await repository.migrateFromLegacyStorage('design_history');
console.log(`Migrated ${migrated} designs`);
```

## Testing

### Unit Test Example

```javascript
import { buildSheetPrompt } from './services/a1SheetPromptBuilder';

describe('Prompt Builder', () => {
  it('is deterministic', () => {
    const params = { dna, siteSnapshot, seed: 123 };
    const result1 = buildSheetPrompt(params);
    const result2 = buildSheetPrompt(params);
    expect(result1).toEqual(result2);
  });
});
```

### Integration Test Example

```javascript
import { runA1SheetWorkflow } from './services/pureOrchestrator';

describe('A1 Generation', () => {
  it('generates deterministic sheet', async () => {
    const params = { env, designSpec, seed: 123 };
    const result1 = await runA1SheetWorkflow(params);
    const result2 = await runA1SheetWorkflow(params);
    expect(result1.seed).toBe(result2.seed);
    expect(result1.metadata.dnaHash).toBe(result2.metadata.dnaHash);
  });
});
```

## Performance

### Generation Times
- DNA generation: ~10-15 seconds
- A1 sheet generation: ~40-60 seconds
- Modification: ~40-60 seconds
- Drift detection: ~2-5 seconds

### Storage Usage
- Baseline artifacts: ~2-5 MB per design
- Design history: ~500 KB per design
- IndexedDB: 50+ MB available

### API Costs
- DNA generation: ~$0.03
- A1 sheet generation: ~$0.02-0.03
- Modification: ~$0.02-0.03
- Total per design: ~$0.05-0.09

## Troubleshooting

### Issue: "Baseline artifacts not found"
**Solution**: Regenerate the base A1 sheet to create baseline artifacts

### Issue: "Drift too high after retry"
**Solution**: Simplify modification request or regenerate base sheet

### Issue: "Storage quota exceeded"
**Solution**: Clear old designs or switch to IndexedDB backend

### Issue: "API rate limit"
**Solution**: Wait for rate limiter cooldown (automatic)

## Future Enhancements

### Short-term
- Complete Phase 2 (UI components)
- Complete Phase 3 (API layer)
- Complete Phase 4 (testing)

### Medium-term
- Real-time collaboration
- Cloud storage for baseline artifacts
- Advanced drift detection (ML-based)
- Version branching

### Long-term
- Multi-user design editing
- Design templates library
- Automated optimization suggestions
- Integration with CAD/BIM tools

---

**Architecture Version**: 2.0
**Status**: Phase 1 Complete
**Last Updated**: 2025-01-19

