# Deterministic Refactor Progress

## Status: IN PROGRESS (9/20 steps completed - Phase 1: 100%)

This document tracks the progress of the deterministic refactor plan for the Architect AI platform.

## Phase 1: Core Services (COMPLETED ✅)

### ✅ Step 1: Introduce `environmentAdapter` (DONE)
- **File**: `src/services/environmentAdapter.js`
- **Status**: Created
- **Description**: Abstracts environment differences (browser vs Node, dev vs prod)
- **Features**:
  - Auto-detects environment (browser/Node, dev/prod, Vercel)
  - Provides API URLs based on environment
  - Feature flag backend (memory, sessionStorage, IndexedDB)
  - Storage abstraction for wizard state
  - No direct `window` or `process.env` in consumers

### ✅ Step 2: Abstract storage with `designHistoryRepository` (DONE)
- **File**: `src/services/designHistoryRepository.js`
- **Status**: Created
- **Description**: Repository layer for design history persistence
- **Features**:
  - Pluggable backends (localStorage, IndexedDB, server)
  - Deterministic ID generation (hash-based or UUID)
  - Version management
  - Legacy migration support
  - Schema versioning for future migrations

### ✅ Step 3: Harden `storageManager` and add IndexedDB backend (DONE)
- **File**: `src/utils/storageManager.js`
- **Status**: Refactored
- **Description**: Extended storageManager with pluggable backends
- **Features**:
  - `createStorageBackend(kind)` factory
  - LocalStorageBackend implementation
  - IndexedDBBackend implementation
  - Async API for all operations
  - Schema versioning (_schemaVersion: 2)

### ✅ Step 4: Normalize design and sheet metadata schemas (DONE)
- **File**: `src/types/schemas.js`
- **Status**: Created
- **Description**: Central type definitions and normalization functions
- **Features**:
  - DNA, SheetDescriptor, SheetResult, OverlayDescriptor, ModifyRequest types
  - Normalization functions (normalizeDNA, normalizeSiteSnapshot, etc.)
  - Factory functions (createSheetDescriptor, createModifyRequest, etc.)
  - JSDoc type definitions for IDE support

### ✅ Step 5: Refactor `a1SheetPromptGenerator` into pure, multi-sheet-aware builder (DONE)
- **File**: `src/services/a1SheetPromptBuilder.js`
- **Status**: Created (new pure version)
- **Description**: Pure prompt builder with no dependencies
- **Features**:
  - Supports ARCH, STRUCTURE, MEP sheet types
  - Strict placeholder system for missing data
  - Uses sheetLayoutConfig for layouts
  - No feature flag reads or storage access
  - Deterministic prompt generation

### ✅ Step 6: Refactor `togetherAIService` for deterministic behavior (DONE)
- **File**: `src/services/togetherAIClient.js`
- **Status**: Created (new pure version)
- **Description**: Pure Together.ai client with deterministic behavior
- **Features**:
  - Separated reasoning (Qwen) and image (FLUX) functions
  - Built-in rate limiter with configurable intervals
  - Explicit seed handling
  - Returns rich metadata (seed, model, latency, traceId)
  - No browser dependencies

### ✅ Step 7: Refactor `dnaWorkflowOrchestrator` to be pure and context-driven (DONE)
- **File**: `src/services/pureOrchestrator.js`
- **Status**: Created (new pure version)
- **Description**: Pure orchestrator accepting all context via parameters
- **Features**:
  - No storage/feature flag reads
  - Accepts env, siteSnapshot, sheetConfig, seed, hooks
  - Implements drift → autocorrect → retry cycle
  - Creates baseline artifacts on generation
  - Calls injected hooks for composition/export

### ✅ Step 8: Introduce `a1SheetValidator` / `a1SheetConsistencyValidator` and `driftValidator` (DONE)
- **Files**: `src/services/driftValidator.js`
- **Status**: Created
- **Description**: Drift detection and validation
- **Features**:
  - DNA-level drift detection
  - Image-level drift detection (SSIM/pHash)
  - Per-panel drift analysis
  - Drift correction suggestions
  - Configurable thresholds

### ✅ Step 9: Refactor `aiModificationService` around modify-mode core (DONE)
- **File**: `src/services/pureModificationService.js`
- **Status**: Created (new pure version)
- **Description**: Pure modification service with deterministic behavior
- **Features**:
  - Uses baselineArtifactStore for baseline lookup
  - Deterministic seed reuse
  - Strict consistency lock
  - Drift detection + retry cycle
  - No storage access (uses repository)

## Additional Files Created (Phase 1)

### ✅ `src/config/sheetLayoutConfig.js` (DONE)
- Externalized layout constants
- Panel positions and sizes for ARCH/STRUCTURE/MEP
- Negative prompts by sheet type
- Section ordering
- Layout validation functions

### ✅ `src/utils/dnaUtils.js` (DONE)
- Pure DNA utility functions
- normalizeDNA, hashDNA, compareDNA, mergeDNA
- DNA completeness validation
- DNA summarization

### ✅ `src/utils/panelLayout.js` (DONE)
- Panel layout computation
- Panel overlap detection
- Layout comparison
- Layout hashing

### ✅ `src/services/baselineArtifactStore.js` (DONE)
- Baseline artifact management
- Immutable baseline enforcement
- Pluggable storage (memory, IndexedDB, server)
- Bundle creation from generation results

### ✅ `src/services/exportService.js` (DONE)
- Centralized export logic
- Server-aware API
- PNG, PDF, SVG, CAD, BIM export
- Deterministic filename generation

### ✅ `api/drift-detect.js` (DONE)
- Server-side SSIM/pHash computation
- Whole-sheet and per-panel drift detection
- Returns structured drift metrics

### ✅ `api/overlay.js` (DONE)
- Server-side overlay composition
- Deterministic overlay placement
- Supports multiple overlays
- Returns composited image

## Phase 2: UI Components (Steps 10-11) - NEXT

### ⏳ Step 10: Split `ArchitectAIEnhanced.js` into modules + `useArchitectAIWorkflow` hook
- **Files**: Multiple new files in `src/components/` and `src/hooks/`
- **Status**: NOT STARTED
- **Tasks**:
  - Create `ArchitectAIWizardContainer.jsx`
  - Create step components (LocationStep, IntelligenceStep, etc.)
  - Create `useArchitectAIWorkflow.js` hook
  - Remove direct service calls from components

### ⏳ Step 11: Refactor `A1SheetViewer.jsx` and `AIModifyPanel.jsx` to consume new models
- **Files**: `src/components/A1SheetViewer.jsx`, `src/components/AIModifyPanel.jsx`
- **Status**: NOT STARTED
- **Tasks**:
  - Update props to use `SheetResult`, `ModifyRequest`
  - Display deterministic metadata
  - Remove storage queries

## Phase 3: API Layer (Steps 12-15) - PENDING

### ⏳ Step 10: Split `ArchitectAIEnhanced.js` into modules + `useArchitectAIWorkflow` hook
- **Files**: Multiple new files in `src/components/` and `src/hooks/`
- **Status**: NOT STARTED
- **Tasks**:
  - Create `ArchitectAIWizardContainer.jsx`
  - Create step components (LocationStep, IntelligenceStep, etc.)
  - Create `useArchitectAIWorkflow.js` hook
  - Remove direct service calls from components

### ⏳ Step 11: Refactor `A1SheetViewer.jsx` and `AIModifyPanel.jsx` to consume new models
- **Files**: `src/components/A1SheetViewer.jsx`, `src/components/AIModifyPanel.jsx`
- **Status**: NOT STARTED
- **Tasks**:
  - Update props to use `SheetResult`, `ModifyRequest`
  - Display deterministic metadata
  - Remove storage queries

### ⏳ Step 12: Introduce `exportService` and update export code paths
- **File**: `src/services/exportService.js`
- **Status**: NOT STARTED
- **Tasks**:
  - Centralize export logic (A1 sheet, CAD/BIM, PDF)
  - Server-aware API (call serverless functions or client-side)
  - Move export logic out of components

### ⏳ Step 13: Implement/extend `api/sheet.js` and `api/overlay.js` for server-side composition
- **Files**: `api/sheet.js`, `api/overlay.js`
- **Status**: NOT STARTED
- **Tasks**:
  - Handle multi-sheet export
  - Accept `SheetResult`/`SheetDescriptor` and `overlays`
  - Generate final assets (SVG/PDF) server-side
  - Provide stable, cacheable URLs

### ⏳ Step 14: Align `api/together-image.js` and `api/together-chat.js` with deterministic `togetherAIService`
- **Files**: `api/together-image.js`, `api/together-chat.js`
- **Status**: NOT STARTED
- **Tasks**:
  - Pass through `env`, seeds, deterministic options
  - Ensure routes use `environmentAdapter`
  - Return richer metadata

### ⏳ Step 15: Update `server.js` proxy configuration
- **File**: `server.js`
- **Status**: NOT STARTED
- **Tasks**:
  - Match new/updated API routes
  - Remove unused legacy endpoints
  - Use shared `environmentAdapter` or config module

### ⏳ Step 16: Migrate design history data
- **File**: Migration script or service method
- **Status**: NOT STARTED
- **Tasks**:
  - Implement migration from legacy localStorage to repository schema
  - Run once on app load
  - Handle corrupted data

### ⏳ Step 17: Add/Update Jest unit tests for pure services
- **Files**: `tests/unit/*.test.js`
- **Status**: NOT STARTED
- **Tasks**:
  - Cover prompt generation, orchestrator, modify service, repository, validators
  - Snapshot testing for DNA/prompt/metadata
  - Mock dependencies

### ⏳ Step 18: Update Node integration tests
- **Files**: `test-*.js` scripts
- **Status**: NOT STARTED
- **Tasks**:
  - Adjust scripts to call new orchestrator flows
  - Assert determinism + drift behavior
  - Use mocked Together.ai responses

### ⏳ Step 19: Run full validation: `npm run check:all`, Jest, and Node tests
- **Status**: NOT STARTED
- **Tasks**:
  - Fix contract or type discrepancies
  - Ensure all tests pass
  - Validate schemas

### ⏳ Step 20: Manual end-to-end verification in dev and (optionally) staging
- **Status**: NOT STARTED
- **Tasks**:
  - Generate designs, modify them, export sheets
  - Verify determinism across sessions and browsers
  - Test all workflows

## Next Steps

To continue this refactor, proceed with **Step 3** (Harden `storageManager` and add IndexedDB backend).

## Notes

- This is a massive refactor touching 20+ files and thousands of lines of code
- Estimated time: 20-40 hours of development work
- Each step should be tested before moving to the next
- Breaking changes are expected - document them carefully
- Consider creating a feature branch for this work

## Backward Compatibility

- Design history migration is critical (Step 16)
- API contracts must remain backward compatible where possible
- UI state persistence changes should be additive
- Feature flags should work with both old and new systems during transition

## Risk Areas

- Storage migration could lose user data if not done carefully
- API changes could break external consumers
- Determinism changes will alter visual outputs for same inputs
- SessionStorage removal will break any external scripts relying on those keys

## Testing Strategy

1. Unit tests for each pure service (Step 17)
2. Integration tests for workflows (Step 18)
3. Validation suite (Step 19)
4. Manual E2E testing (Step 20)
5. Regression testing for existing features

## Deployment Plan

1. Complete all 20 steps in feature branch
2. Run full test suite
3. Deploy to staging environment
4. Test with real users
5. Document breaking changes
6. Deploy to production with migration script
7. Monitor for issues

---

**Last Updated**: 2025-01-19
**Status**: 2/20 steps completed (10%)
**Estimated Completion**: TBD (requires dedicated development time)

