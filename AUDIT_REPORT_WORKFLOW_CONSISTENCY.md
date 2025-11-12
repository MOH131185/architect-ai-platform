# Architect AI Platform - Workflow & Consistency Full Audit Report

**Date:** 2025-01-27  
**Audit Scope:** End-to-end workflow analysis, consistency mechanisms, feature flags, rate limiting, seed determinism, prompt quality, API parity  
**Status:** Complete Read-Only Analysis

---

## Executive Summary

This audit examined the DNA-Enhanced and A1 Sheet workflows, focusing on consistency mechanisms, rate limiting, seed management, prompt quality, and architectural controls. **Key findings:** Adaptive rate limiting works well, seed consistency is enforced correctly, prompts are highly detailed, but feature flag system lacks Geometry-First flags mentioned in documentation. Consistency checker calculates scores but lacks explicit threshold enforcement.

**Overall Assessment:** **GOOD** - Core workflows are solid with minor gaps in feature flag implementation and consistency threshold enforcement.

---

## 1. Feature Flags System

### 1.1 Current State

**Location:** `src/config/featureFlags.js`

**Flags Present:**
- `a1OneShotDefault: true` (default: enabled)
- `a1ProgrammaticComposer: true` (default: enabled)

**Flags Missing (per documentation):**
- ❌ `geometryFirst` - Not found in codebase
- ❌ `parallelGeneration` - Not found in codebase
- ❌ `enhancedConsistencyChecks` - Not found in codebase
- ❌ `showGeometryPreview` - Not found in codebase
- ❌ `cacheGeometry` - Not found in codebase
- ❌ `debugGeometry` - Not found in codebase
- ❌ `showValidationErrors` - Not found in codebase
- ❌ `aiStylization` - Referenced in `aiStylizationService.js` but not in `featureFlags.js`

### 1.2 Findings

**P1 - CRITICAL:** Documentation references Geometry-First pipeline flags that don't exist in codebase. This creates confusion about:
- Whether Geometry-First pipeline is actually implemented
- How to enable/disable it if it exists
- What the actual default workflow is

**Evidence:**
```12:36:src/config/featureFlags.js
export const FEATURE_FLAGS = {
  /**
   * A1 One-Shot Default Workflow
   */
  a1OneShotDefault: true,
  /**
   * A1 Programmatic Composer
   */
  a1ProgrammaticComposer: true
};
```

**Recommendation:**
1. **Option A:** If Geometry-First pipeline exists, add missing flags to `featureFlags.js`
2. **Option B:** If Geometry-First pipeline doesn't exist, update documentation to remove references
3. **Option C:** Add `aiStylization` flag to `featureFlags.js` (currently referenced but not defined)

### 1.3 Suggested Fix

```javascript
// Add to src/config/featureFlags.js
export const FEATURE_FLAGS = {
  a1OneShotDefault: true,
  a1ProgrammaticComposer: true,
  
  // Geometry-First Pipeline (if implemented)
  geometryFirst: false, // Default: disabled
  parallelGeneration: true, // Default: enabled
  enhancedConsistencyChecks: true, // Default: enabled
  showGeometryPreview: false, // Default: disabled
  cacheGeometry: true, // Default: enabled
  debugGeometry: false, // Default: disabled
  showValidationErrors: false, // Default: disabled
  
  // AI Stylization (referenced but not defined)
  aiStylization: false // Default: disabled
};
```

---

## 2. Rate Limiting & Request Sequencing

### 2.1 Current Implementation

**Location:** `src/services/togetherAIService.js` (lines 318-344)

**Strategy:** Adaptive delays based on view type, not fixed minimum

**Delay Logic:**
- 2D → 2D: **6 seconds** (minimum)
- 2D → 3D: **10 seconds** (longer for API breathing room)
- 3D → 3D: **8 seconds** (standard)
- 3D → 2D: **6 seconds** (minimum)
- After failures: **+2 seconds** (recovery delay)

### 2.2 Findings

**P0 - GOOD:** Rate limiting is **adaptive and intelligent**, exceeding the 6-second minimum requirement. The system:
- ✅ Respects Together.ai rate limits (6s minimum enforced)
- ✅ Uses longer delays for 3D views (more resource-intensive)
- ✅ Adds extra recovery time after failures
- ✅ Handles 429 errors with 15-second wait

**Evidence:**
```329:344:src/services/togetherAIService.js
const getAdaptiveDelay = (currentView, nextView) => {
  const current2D = is2DView(currentView);
  const next2D = is2DView(nextView);

  // 2D → 2D: Short delay (6s)
  if (current2D && next2D) return 6000;

  // 2D → 3D: Longer delay to give API breathing room (10s)
  if (current2D && !next2D) return 10000;

  // 3D → 3D: Standard delay (8s)
  if (!current2D && !next2D) return 8000;

  // 3D → 2D: Short delay (6s)
  return 6000;
};
```

**Retry Logic:**
```139:151:src/services/togetherAIService.js
const maxRetries = 5;
let lastError = null;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    if (attempt > 1) {
      // Extended backoff: 3s, 6s, 12s, 24s (more aggressive to avoid server overload)
      const backoffDelay = Math.pow(2, attempt - 1) * 3000;
      console.log(`⏳ [FLUX.1] Retry ${attempt}/${maxRetries} for ${viewType} after ${backoffDelay / 1000}s delay...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
```

### 2.3 Recommendations

**P2 - MINOR:** Consider adding a configuration constant for minimum delay to make it easier to adjust:

```javascript
// Add to top of togetherAIService.js
const RATE_LIMIT_CONFIG = {
  MIN_DELAY_MS: 6000,        // Minimum delay between requests
  DELAY_2D_TO_2D: 6000,      // 2D → 2D transitions
  DELAY_2D_TO_3D: 10000,     // 2D → 3D transitions
  DELAY_3D_TO_3D: 8000,      // 3D → 3D transitions
  FAILURE_RECOVERY_BONUS: 2000  // Extra delay after failures
};
```

---

## 3. Seed Determinism & Consistency

### 3.1 Current Implementation

**Location:** `src/services/togetherAIService.js` (lines 129-132, 249, 360)

**Strategy:** Single consistent seed propagated across all views

### 3.2 Findings

**P0 - EXCELLENT:** Seed consistency is correctly implemented:

**Evidence:**
```129:132:src/services/togetherAIService.js
// 🎲 SEED CONSISTENCY: Use IDENTICAL seed for ALL views for perfect cross-view consistency
// Previously used offsets (+1, +2), but this caused subtle seed drift (904803, 904804, 904805)
// For 98%+ consistency, all 13 views must use the EXACT same seed with view-specific DNA prompts
const effectiveSeed = seed || designDNA?.seed || Math.floor(Math.random() * 1e6);
```

**Master Seed Generation:**
```249:249:src/services/togetherAIService.js
const consistentSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);
```

**Seed Propagation:**
```356:363:src/services/togetherAIService.js
const imageResult = await generateArchitecturalImage({
  viewType: view.type,
  designDNA: masterDNA,
  prompt: allPrompts[view.type],
  seed: consistentSeed,  // ✅ Same seed for all views
  width: view.width,
  height: view.height
});
```

**P0 - GOOD:** No hidden randomness detected. All views use the same seed with view-specific prompts.

### 3.3 Recommendations

**P2 - MINOR:** Add seed validation logging to help debug consistency issues:

```javascript
// Add after seed assignment
console.log(`🎲 [SEED] Using consistent seed: ${consistentSeed} for all ${views.length} views`);
console.log(`🎲 [SEED] Seed source: ${projectContext.seed ? 'projectContext' : projectContext.projectSeed ? 'projectSeed' : 'generated'}`);
```

---

## 4. Prompt Quality & Uniqueness

### 4.1 Floor Plan Prompts

**Location:** `src/services/dnaPromptGenerator.js` (lines 123-347)

**Findings:**

**P0 - EXCELLENT:** Floor plan prompts are extremely detailed with:
- ✅ Strong 2D orthographic constraints
- ✅ Explicit prohibitions against 3D/perspective
- ✅ Floor-specific requirements (ground vs upper)
- ✅ Entrance door requirements for ground floor
- ✅ Room layout specifications
- ✅ Consistency markers (materials, dimensions, seed)

**Evidence:**
```145:152:src/services/dnaPromptGenerator.js
return `FLAT 2D OVERHEAD ARCHITECTURAL FLOOR PLAN - NO 3D, NO PERSPECTIVE, NO AXONOMETRIC, NO ISOMETRIC

Pure orthographic top-down view, black lines on white background, CAD technical drawing style.
Absolutely flat like looking straight down from above. Zero depth. Zero shadows. Zero 3D effects.
This must look like AutoCAD or Revit output - completely flat 2D technical drawing.

DO NOT create: 3D view, perspective view, isometric view, axonometric view, rendered view, shadowed view.
ONLY create: Flat 2D plan view from directly above.
```

### 4.2 Elevation Prompts

**Location:** `src/services/dnaPromptGenerator.js` (lines 349-450+)

**Findings:**

**P0 - GOOD:** Elevation prompts include:
- ✅ View-specific features (north vs south differentiation)
- ✅ Window count specifications
- ✅ Material consistency requirements
- ✅ Explicit prohibition of perspective

**Recommendation:**

**P1 - MEDIUM:** Verify elevation prompts explicitly differentiate between facades:

```javascript
// Suggested enhancement in generateElevationPrompt()
const facadeFeatures = dna.viewSpecificFeatures?.[orientation] || {};
const otherOrientations = ['north', 'south', 'east', 'west'].filter(o => o !== orientation);
const otherFeatures = otherOrientations.map(o => dna.viewSpecificFeatures?.[o]).filter(Boolean);

return `...THIS IS THE ${orientation.toUpperCase()} FACADE - NOT THE ${otherFeatures[0]?.orientation || 'other'} FACADE!
Distinct features: ${facadeFeatures.mainEntrance ? 'MAIN ENTRANCE CENTERED' : 'NO ENTRANCE'}...
`;
```

### 4.3 A1 Sheet Prompts

**Location:** `src/services/a1SheetPromptGenerator.js`

**Findings:**

**P0 - EXCELLENT:** A1 sheet prompts include:
- ✅ Strong negative prompts against placeholder/grid artifacts
- ✅ Professional layout specifications
- ✅ UK RIBA standards compliance
- ✅ Climate-responsive details integration

**Evidence (from buildA1SheetPrompt):**
```150:385:src/services/a1SheetPromptGenerator.js
// Comprehensive professional A1 sheet prompt - UK RIBA Standards
// Includes negative prompts to avoid placeholder artifacts
```

### 4.4 Recommendations

**P2 - MINOR:** Add prompt validation to ensure uniqueness:

```javascript
// Add to dnaPromptGenerator.js
validatePromptUniqueness(prompts) {
  const promptHashes = Object.values(prompts).map(p => 
    p.substring(0, 200).replace(/\s+/g, ' ')
  );
  const uniqueHashes = new Set(promptHashes);
  
  if (uniqueHashes.size < promptHashes.length) {
    console.warn('⚠️  WARNING: Some prompts may be too similar');
    return false;
  }
  return true;
}
```

---

## 5. Consistency Checker

### 5.1 Current Implementation

**Location:** `src/services/consistencyChecker.js`

**Findings:**

**P1 - MEDIUM:** Consistency checker calculates scores but lacks explicit threshold enforcement:

**Current Score Calculation:**
```95:97:src/services/consistencyChecker.js
// Calculate overall score (percentage of passed checks)
const passedChecks = report.checks.filter(c => c.passed).length;
report.overallScore = Math.round((passedChecks / report.checks.length) * 100);
```

**Missing:** No explicit 95% threshold check or warning if score < 95%

**Checks Performed:**
1. ✅ Window count consistency
2. ✅ Door placement consistency
3. ✅ Material consistency
4. ✅ Dimension consistency
5. ✅ Facade feature validation
6. ✅ Mandatory A1 views present

### 5.2 Recommendations

**P1 - HIGH:** Add explicit threshold enforcement:

```javascript
// Add to checkAllViews() after score calculation
const CONSISTENCY_THRESHOLD = 95; // 95% minimum

if (report.overallScore < CONSISTENCY_THRESHOLD) {
  report.thresholdMet = false;
  report.warnings.push(
    `⚠️  Consistency score (${report.overallScore}%) below threshold (${CONSISTENCY_THRESHOLD}%). ` +
    `Consider regenerating views with stronger DNA constraints.`
  );
  
  // Surface in UI if flag enabled
  if (isFeatureEnabled('showValidationErrors')) {
    report.uiDisplay = {
      type: 'warning',
      message: `Consistency score: ${report.overallScore}% (target: ${CONSISTENCY_THRESHOLD}%)`,
      actionable: true
    };
  }
} else {
  report.thresholdMet = true;
}
```

**P2 - MINOR:** Add more granular consistency checks:
- Color hex code matching across views
- Window position consistency (not just count)
- Material application consistency (e.g., brick on north vs south)

---

## 6. Geometry-First Pipeline Audit

### 6.1 Files Searched

**Searched:** `src/geometry/**/*.js`, `src/core/validators.ts`, `src/core/designSchema.ts`

**Result:** ❌ **No Geometry-First pipeline files found**

### 6.2 Findings

**P0 - CRITICAL:** Geometry-First pipeline appears to be **not implemented** or **not in expected location**:

- ❌ `src/geometry/spatialLayoutAlgorithm.js` - Not found
- ❌ `src/geometry/geometryBuilder.js` - Not found
- ❌ `src/geometry/openingsGenerator.js` - Not found
- ❌ `src/core/validators.ts` - Not found
- ❌ `src/core/designSchema.ts` - Not found
- ❌ `src/core/previewRenderer.ts` - Not found

**Test File Found:**
- ✅ `test-geometry-first-local.js` exists (references Geometry-First)

**Conclusion:** Documentation references Geometry-First pipeline, but implementation files are missing. Either:
1. Pipeline exists but files are in different location
2. Pipeline was removed but documentation not updated
3. Pipeline is planned but not yet implemented

### 6.3 Recommendations

**P0 - CRITICAL:** Clarify Geometry-First pipeline status:
1. If implemented: Document actual file locations
2. If removed: Update documentation to remove references
3. If planned: Move to separate "Planned Features" section

---

## 7. API Proxy Parity (Dev vs Production)

### 7.1 Development Server

**Location:** `server.js`

**Endpoints:**
- ✅ `/api/together/chat` - Together.ai chat proxy
- ✅ `/api/together/image` - Together.ai image generation
- ✅ `/api/openai/chat` - OpenAI fallback
- ✅ `/api/replicate/predictions` - Replicate predictions
- ✅ `/api/replicate/predictions/:id` - Replicate status

### 7.2 Production Serverless Functions

**Location:** `api/` directory

**Found Files:**
- ✅ `api/together-chat.js` - Together.ai chat proxy
- ✅ `api/openai-chat.js` - OpenAI fallback
- ✅ `api/replicate-predictions.js` - Replicate predictions
- ✅ `api/replicate-status.js` - Replicate status
- ✅ `api/openai-images.js` - OpenAI images
- ✅ `api/enhanced-image-generate.js` - Enhanced image generation
- ✅ `api/sheet.js` - A1 sheet generation
- ✅ `api/render.js` - Geometry rendering
- ✅ `api/plan.js` - DNA generation

**Missing:** ❌ `api/together-image.js` - Together.ai image generation proxy

### 7.3 Findings

**P1 - MEDIUM:** Production endpoint naming differs from dev:
- Dev: `/api/together/image` → Production: `api/together-image.js` (expected) OR missing?
- Dev: `/api/together/chat` → Production: `api/together-chat.js` ✅

**P1 - MEDIUM:** Client code references `/api/together/image` but production file may be missing:

```164:178:src/services/togetherAIService.js
const response = await fetch(`${API_BASE_URL}/api/together/image`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model,
    prompt: enhancedPrompt,
    width,
    height,
    seed: effectiveSeed,
    num_inference_steps: steps,
    guidance_scale: guidanceScale
  })
});
```

### 7.4 Recommendations

**P1 - HIGH:** Verify `api/together-image.js` exists or create it:

```javascript
// api/together-image.js (if missing)
export default async function handler(req, res) {
  // Match server.js implementation
  // Ensure parity with dev proxy
}
```

**P2 - MINOR:** Add endpoint parity validation script:

```javascript
// scripts/check-api-parity.js
// Compare server.js endpoints with api/*.js files
// Report missing/mismatched endpoints
```

---

## 8. Test Coverage Gaps

### 8.1 Existing Tests

**Found:**
- ✅ `test-geometry-first-local.js` - Geometry-First test suite (49 tests)
- ✅ `test-together-api-connection.js` - Together.ai connectivity
- ✅ `test-dna-pipeline.js` - DNA generation
- ✅ `test-geometry-pipeline.js` - Geometry pipeline
- ✅ `test-consistency-local.js` - Consistency checks

### 8.2 Missing Tests

**P1 - HIGH:** Missing tests for:
1. ❌ **Seed determinism** - Verify same seed produces identical results
2. ❌ **Rate limiting** - Verify delays are enforced correctly
3. ❌ **Prompt uniqueness** - Verify all 13 prompts are unique
4. ❌ **Consistency threshold** - Verify 95% threshold enforcement
5. ❌ **Feature flag gating** - Verify workflows respect flags
6. ❌ **API proxy parity** - Verify dev/prod endpoints match

### 8.3 Recommendations

**P1 - HIGH:** Add missing test suites:

```javascript
// test-seed-determinism.js
// Test: Same seed + same DNA = identical image URLs/hashes

// test-rate-limiting.js
// Test: Verify delays between requests (min 6s)

// test-prompt-uniqueness.js
// Test: All 13 prompts are unique (no duplicates)

// test-consistency-threshold.js
// Test: Consistency checker warns if score < 95%

// test-feature-flags.js
// Test: Feature flags correctly gate workflows

// test-api-parity.js
// Test: Dev and prod endpoints match
```

---

## 9. UI Flow Resilience

### 9.1 Current State

**Location:** `src/ArchitectAIEnhanced.js`

**Findings:**

**P0 - GOOD:** UI handles A1 workflow early exit:
```2030:2075:src/ArchitectAIEnhanced.js
if (aiResult.workflow === 'a1-sheet-one-shot') {
  console.log('📐 A1 Sheet workflow detected - skipping multi-view extractors');
  
  if (aiResult.success && aiResult.a1Sheet) {
    // Set generation results with ONLY A1 sheet
    // ... early exit
    return; // EXIT EARLY - skip all extractors
  }
}
```

**P1 - MEDIUM:** Multiple fallback paths for image extraction (lines 2099-2500+) suggest potential data structure inconsistencies:
- Multiple extraction strategies for same data
- Extensive logging suggests debugging ongoing issues
- Placeholder fallbacks suggest failures are common

### 9.2 Recommendations

**P2 - MINOR:** Consolidate image extraction logic:
- Standardize result structure from AI services
- Reduce fallback chains
- Add type guards for data validation

---

## 10. Regression Checklist

### 10.1 Pre-Deployment Checks

**Must Verify:**
- [ ] Together.ai rate limiting: Minimum 6s delay enforced
- [ ] Seed consistency: Same seed used for all 13 views
- [ ] Prompt uniqueness: All prompts are unique (no duplicates)
- [ ] Consistency threshold: Warnings if score < 95%
- [ ] Feature flags: Flags correctly gate workflows
- [ ] API parity: Dev and prod endpoints match
- [ ] A1 workflow: Early exit works correctly
- [ ] Error handling: Failures gracefully degrade

### 10.2 CI/CD Gates (Proposed)

**Add to `package.json` scripts:**
```json
{
  "scripts": {
    "test:determinism": "node test-seed-determinism.js",
    "test:rate-limit": "node test-rate-limiting.js",
    "test:prompts": "node test-prompt-uniqueness.js",
    "test:consistency": "node test-consistency-threshold.js",
    "test:flags": "node test-feature-flags.js",
    "test:parity": "node test-api-parity.js",
    "test:all-integration": "npm run test:determinism && npm run test:rate-limit && npm run test:prompts && npm run test:consistency && npm run test:flags && npm run test:parity"
  }
}
```

**Pre-build validation:**
```json
{
  "prebuild": "npm run check:all && npm run test:all-integration"
}
```

---

## 11. Priority Summary

### P0 - CRITICAL (Fix Immediately)
1. **Geometry-First Pipeline Status** - Clarify if implemented/removed/planned
2. **API Proxy Parity** - Verify `api/together-image.js` exists

### P1 - HIGH (Fix Soon)
1. **Feature Flags** - Add missing flags or update documentation
2. **Consistency Threshold** - Add explicit 95% threshold enforcement
3. **Test Coverage** - Add determinism, rate-limit, prompt uniqueness tests
4. **Elevation Differentiation** - Verify prompts explicitly differentiate facades

### P2 - MEDIUM (Nice to Have)
1. **Rate Limit Config** - Extract delays to configuration constants
2. **Seed Validation Logging** - Add seed source tracking
3. **Prompt Validation** - Add uniqueness validation
4. **UI Extraction Consolidation** - Reduce fallback chains

---

## 12. Suggested Diffs (Ready to Implement)

See `AUDIT_FIXES_SUGGESTED.md` for ready-to-apply code changes addressing:
- Feature flag additions
- Consistency threshold enforcement
- Test suite additions
- API proxy verification
- Configuration extraction

---

## Appendix: File Inventory

### Core Files Audited
- ✅ `src/config/featureFlags.js` - Feature flag system
- ✅ `src/config/appConfig.js` - Application configuration
- ✅ `src/services/togetherAIService.js` - Primary AI service (rate limiting, seed)
- ✅ `src/services/enhancedDNAGenerator.js` - DNA generation
- ✅ `src/services/dnaValidator.js` - DNA validation
- ✅ `src/services/dnaPromptGenerator.js` - Prompt generation
- ✅ `src/services/consistencyChecker.js` - Consistency validation
- ✅ `src/services/dnaWorkflowOrchestrator.js` - Workflow orchestration
- ✅ `src/services/a1SheetPromptGenerator.js` - A1 sheet prompts
- ✅ `src/ArchitectAIEnhanced.js` - Main UI component
- ✅ `server.js` - Development proxy server
- ✅ `api/together-chat.js` - Production chat proxy
- ✅ `test-geometry-first-local.js` - Geometry-First tests

### Files Not Found (Expected per Documentation)
- ❌ `src/geometry/spatialLayoutAlgorithm.js`
- ❌ `src/geometry/geometryBuilder.js`
- ❌ `src/geometry/openingsGenerator.js`
- ❌ `src/core/validators.ts`
- ❌ `src/core/designSchema.ts`
- ❌ `src/core/previewRenderer.ts`
- ❌ `api/together-image.js` (may exist with different name)

---

**End of Audit Report**

