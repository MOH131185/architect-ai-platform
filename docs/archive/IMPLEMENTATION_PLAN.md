# IMPLEMENTATION PLAN: Geometry-First Consistency Enhancement

**Branch**: `feature/geometry-first`
**Goal**: Enhance design consistency from 98% to 99.5%+ by integrating geometry-based generation with AI-driven visualization
**Approach**: 8-milestone progressive implementation with feature flag

---

## Current State Analysis

### What We Have (98% Consistency)

**DNA-Driven AI Generation Pipeline**:
- Master DNA generation via GPT-4 (`enhancedDNAGenerator.js`)
- 13 view-specific prompts (`dnaPromptGenerator.js`)
- FLUX.1 image generation with identical seed (`togetherAIService.js`)
- Consistency validation (`consistencyChecker.js`)

**Geometry Services** (Underutilized):
- Site polygon drawing (`PrecisionSiteDrawer.jsx`)
- Vector floor plan generation (`vectorPlanGenerator.js`)
- Spatial layout algorithm (`spatialLayoutAlgorithm.js`)
- Three.js 3D scene building (`geometryBuilder.js`)

### The Gap

**Current Flow**:
```
User Input → DNA Generation (AI guesses dimensions) → Image Generation
```

**Missing Integration**:
- Vector plans generated but NOT fed into DNA
- Geometry calculations available but not used for consistency
- Exact dimensions from spatial layout algorithm ignored

---

## Proposed Architecture: Geometry-First Hybrid

### New Flow

```
User Input
  ↓
Site Polygon + Program
  ↓
GEOMETRY PIPELINE (NEW)
  ├─ Spatial layout algorithm → Exact room dimensions
  ├─ Vector floor plan generation → Precise coordinates
  └─ Constraint-based optimization → Realistic proportions
  ↓
GEOMETRY-SEEDED DNA
  ├─ Use geometry dimensions (not AI-generated)
  ├─ Validate against spatial constraints
  └─ Enhance with AI reasoning (materials, style)
  ↓
HYBRID GENERATION
  ├─ 2D Views: Render from geometry (SVG/Canvas)
  ├─ 3D Views: FLUX with geometry-enforced prompts
  └─ Consistency: Enforced by shared geometry source
  ↓
Results: 99.5%+ consistency
```

---

## 8-Milestone Implementation Plan

### M1 ✅ — Plan & Branch (CURRENT)
**Status**: In Progress
**Tasks**:
- [x] Create branch `feature/geometry-first`
- [x] Scan codebase and document architecture
- [x] Write IMPLEMENTATION_PLAN.md
- [ ] Add feature flag `geometryFirst` (default: true)

**Deliverable**: Feature flag infrastructure without breaking legacy flow

---

### M2 — Geometry Data Pipeline
**Goal**: Create structured geometry output from existing services

**Tasks**:
1. Create `src/services/geometryPipeline.js`
   - Orchestrate: `vectorPlanGenerator` → `spatialLayoutAlgorithm` → structured output
   - Output format:
     ```javascript
     {
       siteMetrics: { area, orientation, centroid },
       building: {
         dimensions: { length, width, height, floors },
         footprint: { vertices: [...], area }
       },
       floors: [
         {
           level: 0,
           rooms: [
             { name, dimensions: { x, y, width, height }, area, adjacency }
           ],
           walls: [...], openings: [...]
         }
       ]
     }
     ```

2. Integrate into `ArchitectAIEnhanced.js`:
   - Call after site polygon drawn
   - Store in state: `geometryData`
   - Display preview (optional)

**Test**: Site polygon → geometry data generation works

---

### M3 — Geometry-Seeded DNA Generation
**Goal**: Use geometry dimensions as DNA seed instead of AI-generated guesses

**Tasks**:
1. Update `enhancedDNAGenerator.js`:
   - Add parameter: `geometryData` (optional)
   - If `geometryFirst` flag enabled AND `geometryData` provided:
     - Use geometry dimensions directly
     - AI only fills in materials, colors, style
   - If not provided: Fall back to current AI-only generation

2. Create geometry → DNA mapper:
   ```javascript
   function geometryToDNASeed(geometryData) {
     return {
       dimensions: {
         length: geometryData.building.dimensions.length,
         width: geometryData.building.dimensions.width,
         totalHeight: geometryData.building.dimensions.height,
         floorCount: geometryData.building.dimensions.floors
       },
       floorPlans: {
         ground: mapRoomsFromGeometry(geometryData.floors[0]),
         upper: mapRoomsFromGeometry(geometryData.floors[1])
       }
     };
   }
   ```

3. Update workflow in `aiIntegrationService.js`:
   - Pass `geometryData` to DNA generator if available

**Test**: Geometry-seeded DNA has exact dimensions from spatial algorithm

---

### M4 — 2D View Rendering from Geometry
**Goal**: Generate floor plans and elevations from geometry (not AI images)

**Tasks**:
1. Create `src/services/geometryRenderer.js`:
   - `renderFloorPlan(geometryData, floor)` → Canvas/SVG
   - `renderElevation(geometryData, orientation)` → Canvas/SVG
   - `renderSection(geometryData, axis)` → Canvas/SVG

2. Use existing geometry services:
   - `geometryBuilder.js` for 3D → 2D projection
   - `openingsGenerator.js` for window/door placement
   - `dimensioningService.js` for annotations

3. Add to generation flow:
   - If `geometryFirst` enabled:
     - Generate 2D views from geometry
     - Convert to image URLs (Canvas → PNG)
   - If disabled: Use FLUX.1 AI generation

**Test**: Floor plans render with exact geometry dimensions

---

### M5 — Hybrid 3D Generation
**Goal**: Use FLUX for 3D photorealistic views, but with geometry-enforced prompts

**Tasks**:
1. Update `dnaPromptGenerator.js`:
   - For 3D views only:
     - Build prompts from geometry-seeded DNA
     - Add explicit dimension constraints
     - Include negative prompts for inconsistencies

2. Keep FLUX for 3D:
   - `exterior_front_3d`, `exterior_side_3d`
   - `axonometric_3d`, `perspective_3d`
   - `interior_3d`

3. Consistency enforcement:
   - Same seed across all views
   - Geometry dimensions in every prompt
   - Cross-reference validation

**Test**: 3D views match geometry dimensions exactly

---

### M6 — Enhanced Consistency Validation
**Goal**: Validate geometry-2D-3D alignment

**Tasks**:
1. Update `consistencyChecker.js`:
   - Add geometry-based checks:
     - Floor plan area matches geometry footprint (±5%)
     - Elevation heights match geometry floors
     - Window counts match openings generator
     - Room positions match spatial layout

2. Create cross-view validator:
   - Compare 2D geometry render vs 3D AI render
   - Flag dimension mismatches
   - Calculate consistency score

3. Add to UI:
   - Show geometry vs AI comparison
   - Highlight any inconsistencies
   - Provide regeneration option

**Test**: Consistency checker catches dimension mismatches

---

### M7 — Performance Optimization
**Goal**: Reduce generation time with geometry caching

**Tasks**:
1. Cache geometry calculations:
   - Store in `sessionStorage` or IndexedDB
   - Reuse for design iterations

2. Parallel generation:
   - Render 2D views from geometry (fast, local)
   - Generate 3D views from FLUX (slow, API) in parallel

3. Progressive display:
   - Show 2D views immediately (~2 seconds)
   - Stream in 3D views as they complete (~2 minutes)

4. Optimize spatial algorithm:
   - Profile `spatialLayoutAlgorithm.js`
   - Reduce optimization iterations if needed
   - Target <5s for geometry pipeline

**Test**: Total generation time < 2 minutes (vs 3 minutes currently)

---

### M8 — Testing, Documentation & Rollout
**Goal**: Validate, document, and deploy

**Tasks**:
1. **Comprehensive Testing**:
   - Create test suite: `test-geometry-first-pipeline.js`
   - Test cases:
     - Small site (100m²)
     - Large site (500m²)
     - Irregular polygon
     - Rectangular site
     - 1-story vs 2-story
   - Compare consistency: Geometry-First vs Legacy

2. **Documentation**:
   - Update `CLAUDE.md` with geometry-first flow
   - Create `GEOMETRY_FIRST_ARCHITECTURE.md`
   - Write user guide: when to use geometry-first

3. **Feature Flag Control**:
   - Add UI toggle in settings
   - Default: `true` (geometry-first)
   - Allow fallback to legacy AI-only

4. **Deployment**:
   - Merge to main when tests pass
   - Monitor consistency metrics
   - Gather user feedback

**Deliverable**: Production-ready geometry-first system

---

## Feature Flag Implementation

### Config File: `src/config/featureFlags.js`

```javascript
/**
 * Feature Flags for Architect AI Platform
 */
export const FEATURE_FLAGS = {
  /**
   * Geometry-First Generation
   *
   * When enabled:
   * - Uses spatial layout algorithm for exact dimensions
   * - Generates 2D views from geometry (not AI)
   * - 3D views use geometry-enforced prompts
   * - Target consistency: 99.5%+
   *
   * When disabled:
   * - Falls back to legacy DNA-only AI generation
   * - All views generated by FLUX.1
   * - Current consistency: 98%
   *
   * Default: true (geometry-first is new standard)
   */
  geometryFirst: true,

  /**
   * Enable geometry data preview in UI
   * Shows spatial layout before generation
   */
  showGeometryPreview: false,

  /**
   * Cache geometry calculations
   * Speeds up iterations on same site
   */
  cacheGeometry: true,

  /**
   * Parallel generation (2D geometry + 3D AI)
   * Reduces total generation time
   */
  parallelGeneration: true
};

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flagName) {
  return FEATURE_FLAGS[flagName] === true;
}

/**
 * Override flag (for testing/admin)
 */
export function setFeatureFlag(flagName, value) {
  if (flagName in FEATURE_FLAGS) {
    FEATURE_FLAGS[flagName] = value;
    console.log(`🚩 Feature flag updated: ${flagName} = ${value}`);
  } else {
    console.warn(`⚠️ Unknown feature flag: ${flagName}`);
  }
}
```

### Usage in Services

**Example: `aiIntegrationService.js`**

```javascript
import { isFeatureEnabled } from '../config/featureFlags';

async function generateCompleteDesign(projectContext) {
  const useGeometryFirst = isFeatureEnabled('geometryFirst');

  if (useGeometryFirst && projectContext.sitePolygon) {
    console.log('🔷 Using Geometry-First pipeline');
    // NEW: Geometry-first workflow
    return await generateWithGeometryFirst(projectContext);
  } else {
    console.log('🔶 Using Legacy DNA-only pipeline');
    // EXISTING: Legacy workflow
    return await togetherAIService.generateConsistentArchitecturalPackage(projectContext);
  }
}
```

---

## Success Metrics

### Consistency Improvement

| Metric | Current (DNA-Only) | Target (Geometry-First) |
|--------|-------------------|------------------------|
| Dimensional accuracy | 99% | 99.9% |
| Floor plan area match | 95% | 99.5% |
| Window positioning | 98% | 99.5% |
| Cross-view alignment | 98% | 99.5% |
| **Overall Consistency** | **98%** | **99.5%+** |

### Performance

| Metric | Current | Target |
|--------|---------|--------|
| Geometry pipeline | N/A | <5s |
| 2D view generation | ~90s (FLUX) | ~2s (geometry render) |
| 3D view generation | ~120s (FLUX) | ~120s (unchanged) |
| **Total generation time** | **~3 min** | **~2 min** |

### User Experience

- ✅ Immediate 2D preview (geometry-rendered)
- ✅ Exact site polygon integration
- ✅ Guaranteed dimension accuracy
- ✅ Faster iterations (cached geometry)

---

## Risk Mitigation

### Risk 1: Geometry pipeline breaks existing flow
**Mitigation**: Feature flag default `true`, but easy to disable

### Risk 2: 2D geometry renders look less realistic than FLUX
**Mitigation**: Hybrid approach - keep FLUX for 3D, only geometry for 2D technical

### Risk 3: Performance regression
**Mitigation**: Benchmark each milestone, optimize spatial algorithm

### Risk 4: Inconsistencies between geometry 2D and FLUX 3D
**Mitigation**: Enhanced consistency checker (M6) with geometry validation

---

## Next Steps (M1 Completion)

1. **Create feature flag config file**:
   - `src/config/featureFlags.js`
   - Add `geometryFirst: true`

2. **No legacy changes yet**:
   - Don't modify existing generation flow
   - Just add infrastructure

3. **Test flag access**:
   - Import in `ArchitectAIEnhanced.js`
   - Log flag status on mount

4. **Commit M1**:
   - Branch ready for M2 implementation

---

## Timeline Estimate

| Milestone | Duration | Dependencies |
|-----------|----------|--------------|
| M1 - Plan & Branch | 1 day | None |
| M2 - Geometry Pipeline | 2-3 days | M1 |
| M3 - Seeded DNA | 2 days | M2 |
| M4 - 2D Rendering | 3-4 days | M3 |
| M5 - Hybrid 3D | 2 days | M4 |
| M6 - Validation | 2 days | M5 |
| M7 - Optimization | 1-2 days | M6 |
| M8 - Testing & Rollout | 2-3 days | M7 |
| **Total** | **15-20 days** | |

---

## References

### Key Files to Modify

**M2 - Geometry Pipeline**:
- NEW: `src/services/geometryPipeline.js`
- MODIFY: `src/ArchitectAIEnhanced.js` (line ~1544)

**M3 - Seeded DNA**:
- MODIFY: `src/services/enhancedDNAGenerator.js` (line 21)
- MODIFY: `src/services/aiIntegrationService.js` (line 1079)

**M4 - 2D Rendering**:
- NEW: `src/services/geometryRenderer.js`
- USE: `src/geometry/geometryBuilder.js`
- USE: `src/geometry/openingsGenerator.js`

**M5 - Hybrid 3D**:
- MODIFY: `src/services/dnaPromptGenerator.js` (line 501+)
- MODIFY: `src/services/togetherAIService.js` (line 106)

**M6 - Validation**:
- MODIFY: `src/services/consistencyChecker.js` (line 29)
- NEW: `src/services/geometryConsistencyValidator.js`

**M7 - Optimization**:
- MODIFY: `src/geometry/spatialLayoutAlgorithm.js` (line 183)
- ADD: Caching layer in `ArchitectAIEnhanced.js`

**M8 - Testing**:
- NEW: `test-geometry-first-pipeline.js`
- UPDATE: All documentation files

---

## Summary

**Approach**: Progressive enhancement with feature flag
**Philosophy**: Geometry provides dimensional truth, AI provides aesthetic quality
**Target**: 99.5%+ consistency with faster generation
**Risk**: Low (feature flag allows instant rollback)
**Timeline**: 15-20 days for complete implementation

**Current Status**: M1 in progress - feature flag infrastructure next
