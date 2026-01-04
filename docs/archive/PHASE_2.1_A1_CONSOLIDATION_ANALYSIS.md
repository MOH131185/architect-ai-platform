# Phase 2.1: A1 Sheet Services Consolidation Analysis

## Current State: 21 A1 Services (~10,000 lines)

### Composition Services (4 files - HEAVY OVERLAP):
1. **a1Compositor.js** - Canvas-based panel composition with borders/labels
2. **a1SheetCompositor.js** - Site plan overlay compositing  
3. **a1SheetComposer.js** - HTML-based A1 sheet assembly
4. **unifiedSheetGenerator.js** - Unified A1 sheet generation (similar to composer)

**Overlap**: All four services create A1 sheets but using different approaches (Canvas vs HTML, panel-based vs unified)

### Prompt Services (2 files - HEAVY OVERLAP):
1. **a1SheetPromptGenerator.js** - AI prompt generation with consistency locking
2. **a1SheetPromptBuilder.js** - Pure deterministic prompt builder (refactored)

**Overlap**: Both build prompts for A1 generation, PromptBuilder is newer/cleaner

### Validation Services (2+ files):
1. **a1SheetValidator.js** - Complete A1 validation (structure, quality, completeness)
2. **a1SheetConsistencyValidator.js** - Consistency validation (not yet read)

### Export Services:
1. **a1PDFExportService.js** - PDF export functionality

### Other A1 Services (12+ more files to analyze)

---

## Consolidation Plan: 21 → 3 Services

### **NEW: src/services/a1/A1SheetGenerator.js**
**Purpose**: Complete A1 sheet composition and assembly
**Consolidates**: 
- a1Compositor.js (998 lines)
- a1SheetCompositor.js (998 lines)
- a1SheetComposer.js (998 lines)
- unifiedSheetGenerator.js (1,069 lines)

**Core Functions**:
```javascript
// Main composition API
export function composeA1Sheet(data)
export function composeWithCanvas(panels, metadata)
export function compositeSitePlan(sheetUrl, sitePlanUrl, options)

// Rendering helpers
function renderTitleBar(data)
function renderSiteContext(location, siteMap)
function renderFloorPlans(visualizations, dna)
function renderElevations(visualizations, dna)
function render3DViews(visualizations)
function renderLegend(dna)
```

**Estimated Lines**: ~1,200 (consolidating 4,063 lines)

---

### **NEW: src/services/a1/A1PromptService.js**
**Purpose**: AI prompt generation for A1 sheets
**Consolidates**:
- a1SheetPromptGenerator.js (940 lines)
- a1SheetPromptBuilder.js (likely ~800 lines)

**Core Functions**:
```javascript
// Main prompt building (deterministic, pure function)
export function buildPrompt({ dna, siteSnapshot, sheetConfig, sheetType, mode, seed })

// Context-aware prompt building (legacy compatibility)
export function buildPromptWithContext(dna, location, projectContext, blendedStyle)

// Consistency locking for modifications
export function withConsistencyLock(basePrompt, deltaPrompt, masterDNA)

// Context derivation helpers
function derivePromptContext({ masterDNA, location, climate, projectContext })
function getSunPathDescription(sunPathData)
function formatMaterialDescription(materials)
```

**Estimated Lines**: ~700 (consolidating ~1,740 lines)

---

### **NEW: src/services/a1/A1ValidationService.js**
**Purpose**: A1 sheet validation and export
**Consolidates**:
- a1SheetValidator.js (773 lines)
- a1SheetConsistencyValidator.js (unknown lines)
- a1PDFExportService.js (unknown lines)

**Core Functions**:
```javascript
// Main validation
export function validateA1Sheet(a1Result, masterDNA, blendedStyle)
export function validateConsistency(originalSheet, modifiedSheet, threshold = 0.92)

// Export functions
export function exportToPDF(html, metadata)
export function exportToPNG(dataUrl, metadata)
export function exportToSVG(html)

// Validation checks
function validateStructure(a1Result)
function validateImageQuality(a1Result)
function validateSections(a1Result)
function validateTitleBlock(a1Result)
```

**Estimated Lines**: ~900 (consolidating ~1,500+ lines)

---

## Expected Results

### Before:
- 21 A1 services
- ~10,000 lines of code
- Heavy duplication (4 composition services, 2 prompt services)
- Confusing imports (which service to use?)
- Maintenance burden

### After:
- 3 consolidated services
- ~2,800 lines of code (72% reduction)
- Clear separation of concerns:
  - Generation/Composition
  - Prompt Building
  - Validation/Export
- Single import per domain
- Easy to maintain and extend

### Import Changes:
```javascript
// BEFORE (confusing)
import { composeA1Sheet } from './a1SheetComposer.js';
import { generateUnifiedSheet } from './unifiedSheetGenerator.js';
import { compositeSitePlan } from './a1SheetCompositor.js';
import { buildPrompt } from './a1SheetPromptBuilder.js';
import { derivePromptContext } from './a1SheetPromptGenerator.js';
import { validateA1Sheet } from './a1SheetValidator.js';

// AFTER (clear)
import * as A1Generator from './services/a1/A1SheetGenerator.js';
import * as A1Prompts from './services/a1/A1PromptService.js';
import * as A1Validation from './services/a1/A1ValidationService.js';

// Usage
const sheet = A1Generator.composeA1Sheet(data);
const prompt = A1Prompts.buildPrompt({ dna, siteSnapshot, sheetConfig });
const validation = A1Validation.validateA1Sheet(sheet, dna, style);
const pdf = A1Validation.exportToPDF(sheet.html, metadata);
```

---

## Next Steps

1. ✅ Create src/services/a1/ directory
2. ✅ Analyze core A1 services
3. ⏳ Build A1SheetGenerator.js (composition consolidation)
4. ⏳ Build A1PromptService.js (prompt consolidation)
5. ⏳ Build A1ValidationService.js (validation/export consolidation)
6. ⏳ Update all imports across codebase
7. ⏳ Test A1 workflow end-to-end
8. ⏳ Delete 21 deprecated A1 services

**Estimated Time**: 16 hours (Phase 2.1)
**Current Progress**: 2/8 steps complete (25%)
