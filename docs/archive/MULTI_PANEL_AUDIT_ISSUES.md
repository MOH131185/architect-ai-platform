# Multi-Panel A1 Pipeline - Audit Issues Report

## Executive Summary

After comprehensive audit of the multi-panel A1 generation pipeline, I've identified **7 critical issues** that prevent end-to-end execution. All issues have been cataloged with specific locations and proposed fixes.

## Critical Issues Found

### Issue #1: DNA Generator Return Shape Mismatch ⛔ CRITICAL
**Location**: `src/services/dnaWorkflowOrchestrator.js` line 1824  
**Problem**: `generateMasterDesignDNA()` returns `{ success, masterDNA, timestamp }` but workflow expects direct DNA object  
**Impact**: Workflow crashes at Step 2 (DNA validation) with undefined DNA  
**Fix**: Extract `masterDNA` from response: `const dnaResponse = await dnaGeneratorInstance.generateMasterDesignDNA(...); const masterDNA = dnaResponse.masterDNA;`

### Issue #2: DNA Validator Method Name Mismatch ⛔ CRITICAL
**Location**: `src/services/dnaWorkflowOrchestrator.js` line 1832  
**Problem**: Calls `validateDesignDNA()` but dnaValidator exports `validateDNA()`  
**Impact**: Method not found error at Step 2  
**Fix**: Change to `dnaValidatorInstance.validateDNA(masterDNA)`

### Issue #3: Panel Prompt Builders Not Used ⚠️ HIGH
**Location**: `src/services/panelGenerationService.js` line 254  
**Problem**: `buildPanelPrompt()` in panelGenerationService doesn't use the specialized `panelPromptBuilders.js` builders  
**Impact**: Generic prompts instead of specialized 14-panel prompts  
**Fix**: Import and delegate to `panelPromptBuilders.buildPanelPrompt()`

### Issue #4: Missing Climate Data in Panel Context ⚠️ MEDIUM
**Location**: `src/services/panelGenerationService.js` line 254-260  
**Problem**: `buildPanelPrompt()` receives `climate` in context but doesn't pass it to builders  
**Impact**: Climate card panel has no climate data  
**Fix**: Pass `climate` to `buildPanelPrompt()` context

### Issue #5: Label Map Missing New Panels ⚠️ MEDIUM
**Location**: `src/services/a1LayoutComposer.js` line 192  
**Problem**: `labelMap` has `materials` but should be `material_palette`  
**Impact**: Incorrect label for material palette panel  
**Fix**: Update key from `materials` to `material_palette`

### Issue #6: API Compose Route Missing Labels ⚠️ LOW
**Location**: `api/a1/compose.js` line 80  
**Problem**: `generateBorderSvg` labelMap missing `material_palette` and `climate_card`  
**Impact**: Missing labels on composed sheet  
**Fix**: Add both panel types to labelMap

### Issue #7: No Test Coverage ⚠️ MEDIUM
**Location**: N/A  
**Problem**: No automated test to verify end-to-end flow  
**Impact**: Cannot validate fixes or prevent regressions  
**Fix**: Add `test-multi-panel-e2e.js` with mocked Together AI

## Wiring Verification Results

### ✅ PASS: Workflow Routing
- `ArchitectAIEnhanced.js` correctly checks `multiPanelA1` flag
- Routes to `runMultiPanelA1Workflow` when enabled
- Falls back to `runHybridA1SheetWorkflow` or `runA1SheetWorkflow`

### ✅ PASS: Imports and Exports
- All required imports present in orchestrator
- `planA1Panels` exported from panelGenerationService
- `derivePanelSeedsFromDNA` exported from seedDerivation
- `validatePanelConsistency` exported from driftValidator
- `composeA1Sheet` exported from a1LayoutComposer

### ✅ PASS: Server Route
- `/api/a1/compose` mounted in server.js (line 1328)
- Uses sharp for composition
- Returns proper response shape

### ✅ PASS: Panel Layout
- PANEL_LAYOUT contains all 14 panels
- No overlapping coordinates detected
- All panels within bounds (0-1 normalized)

### ⚠️ PARTIAL: Panel Sequence
- BASE_PANEL_SEQUENCE has all 14 types
- `buildPanelSequence()` filters based on floor count
- May exclude `floor_plan_level2` for 2-floor buildings (expected behavior)

### ❌ FAIL: DNA Generation (Issue #1)
- Return shape mismatch breaks workflow at Step 1

### ❌ FAIL: DNA Validation (Issue #2)
- Method name mismatch breaks workflow at Step 2

### ❌ FAIL: Panel Prompts (Issue #3)
- Specialized builders not used, generic prompts generated

## Unified Repair Plan

### Phase 1: Fix DNA Generation (Issue #1)
**File**: `src/services/dnaWorkflowOrchestrator.js`
**Line**: 1824-1828
**Change**:
```javascript
const dnaResponse = await dnaGeneratorInstance.generateMasterDesignDNA(
  projectContext,
  portfolioAnalysis,
  locationData
);

const masterDNA = dnaResponse.masterDNA || dnaResponse;
```

### Phase 2: Fix DNA Validation (Issue #2)
**File**: `src/services/dnaWorkflowOrchestrator.js`
**Line**: 1832
**Change**:
```javascript
const validationResult = dnaValidatorInstance.validateDNA(masterDNA);
```

### Phase 3: Integrate Panel Prompt Builders (Issue #3)
**File**: `src/services/panelGenerationService.js`
**Line**: 1-10 (imports)
**Add**:
```javascript
import { buildPanelPrompt as buildSpecializedPanelPrompt } from './a1/panelPromptBuilders.js';
```

**Line**: 254-260
**Change**:
```javascript
// Try specialized builder first, fallback to generic
let jobPrompt, jobNegativePrompt;
try {
  const specialized = buildSpecializedPanelPrompt(panelType, {
    masterDNA,
    locationData: { climate },
    projectContext: { buildingProgram: buildingType, programSpaces },
    consistencyLock: null
  });
  jobPrompt = specialized.prompt;
  jobNegativePrompt = specialized.negativePrompt;
} catch (err) {
  // Fallback to generic builder
  jobPrompt = buildPanelPrompt(panelType, {
    masterDNA,
    siteBoundary,
    buildingType,
    entranceOrientation,
    programSpaces,
    climate
  });
  jobNegativePrompt = buildNegativePrompt(panelType);
}
```

### Phase 4: Fix Label Maps (Issues #5, #6)
**File**: `src/services/a1LayoutComposer.js`
**Line**: 192
**Change**: `materials` → `material_palette`

**File**: `api/a1/compose.js`
**Line**: 80-95
**Add**:
```javascript
material_palette: 'MATERIAL PALETTE',
climate_card: 'CLIMATE ANALYSIS'
```

### Phase 5: Add Test Harness (Issue #7)
**File**: `test-multi-panel-e2e.js` (NEW)
**Purpose**: End-to-end test with mocked Together AI

## Test Strategy

### Mock Together AI Generator
```javascript
const mockTogetherAI = {
  generateArchitecturalImage: async (params) => ({
    url: `data:image/png;base64,${generateColoredRectangle(params.seed)}`,
    seedUsed: params.seed,
    metadata: { width: params.width, height: params.height }
  })
};
```

### Mock Composition API
```javascript
const mockComposeClient = async (url, options) => ({
  ok: true,
  json: async () => ({
    composedSheetUrl: 'data:image/png;base64,...',
    coordinates: { /* 14 panel coordinates */ },
    metadata: { width: 1792, height: 1269, panelCount: 14 }
  })
});
```

### Assertions
1. 14 panels generated
2. Each panel has unique seed
3. Composition API called with 14 panels
4. Baseline bundle has `panels` object with 14 entries
5. Baseline bundle has `seeds.panelSeeds` with 14 entries
6. Composed sheet dimensions = 1792×1269
7. Response has `composedSheetUrl`, `panels`, `panelMap`, `coordinates`

## Files to Modify

1. `src/services/dnaWorkflowOrchestrator.js` - Fix DNA response extraction and validation method
2. `src/services/panelGenerationService.js` - Integrate specialized prompt builders
3. `src/services/a1LayoutComposer.js` - Fix label map key
4. `api/a1/compose.js` - Add missing labels
5. `test-multi-panel-e2e.js` - NEW test script

## Expected Outcomes

After fixes:
- ✅ DNA generation returns proper structure
- ✅ DNA validation uses correct method
- ✅ All 14 panels use specialized prompts
- ✅ All labels render correctly
- ✅ Test passes with 14 panels + composition + storage
- ✅ End-to-end flow completes without errors

## Risk Assessment

- **High Risk**: Issues #1, #2 (workflow crashes immediately)
- **Medium Risk**: Issue #3 (poor quality panels)
- **Low Risk**: Issues #4, #5, #6 (cosmetic/data quality)
- **Testing Risk**: Issue #7 (no validation)

## Implementation Order

1. Fix Issue #1 (DNA extraction)
2. Fix Issue #2 (validation method)
3. Fix Issue #3 (prompt builders)
4. Fix Issues #5, #6 (labels)
5. Add Issue #7 (test script)

Total estimated fixes: 5 files, ~50 lines of code changes

