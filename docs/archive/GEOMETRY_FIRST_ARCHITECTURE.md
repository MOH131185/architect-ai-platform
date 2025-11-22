# Geometry-First Architecture Implementation Guide

## Problem Statement

**Current Issue:** The pipeline is "image-first" where the AI generates images somewhat independently, leading to:
- Cross-view inconsistencies (different colors, materials, window counts)
- Floor plans that don't match 3D views
- "Style wins over geometry" - AI hallucinates geometry instead of respecting constraints
- Seed drift (904803, 904804, 904805) causing subtle variations
- Site data not flowing through properly

**Root Cause:** Each view is generated independently with text prompts. The AI model interprets geometry from text, leading to hallucinations and inconsistencies.

## Solution: Geometry-First Architecture

**Core Principle:** Make the plan the single source of truth (SSOT). Generate a canonical 3D model from it. Only stylize, never re-generate geometry.

```
User Input → Site Analysis → PlanJSON (SSOT) → 3D Scene → Snapshots → Styled Images
                                   ↓
                             All geometry locked
```

---

## Implementation Status

### ✅ Phase 1: Foundation (COMPLETE)

**Completed Files:**
1. ✅ `src/types/PlanJSON.ts` - Complete type definitions
2. ✅ `src/utils/planUtils.ts` - Seed, hash, validation, area calculations
3. ✅ `src/services/planGeneratorService.ts` - Generates PlanJSON from site + program
4. ✅ `src/services/siteAnalysisService.js` - Updated to compute `north_deg` and return `siteGeometry`
5. ✅ Seed consistency fix in `togetherAIService.js` - All views use same seed
6. ✅ Google Maps deprecation fixes

**What This Gives You:**
- PlanJSON with deterministic, reproducible geometry
- Site geometry with proper north orientation (no more "Site: undefined")
- Consistent seed policy (no more 904803→904804→904805 drift)
- Ready to build 3D pipeline on top

---

### ✅ Phase 2: 3D Pipeline (COMPLETE)

**Completed Files:**
1. ✅ `three.js` installed with TypeScript definitions
2. ✅ `src/services/bimService.ts` - Builds THREE.Scene from PlanJSON with walls, floors, roof, windows
3. ✅ `src/services/previewRenderer.ts` - Renders 6 canonical view snapshots (front, side, back, axonometric, perspective, interior)
4. ✅ `src/services/consistencyValidator.ts` - Edge IoU, palette matching, window counting for validation

**What This Gives You:**
- Procedural 3D model generation from PlanJSON
- Deterministic snapshots from fixed camera angles
- Automatic validation of AI outputs against reference geometry
- Complete geometry-first pipeline ready to integrate

**Key Functions:**
```typescript
// Generate 3D scene from plan
const {scene, metadata} = await bimService.buildSceneFromPlan(plan);

// Render canonical snapshots
const snapshots = await previewRenderer.snapshotViews(scene, plan);
// Returns: {front, side, back, axonometric, perspective, interior} as PNG data URLs

// Validate AI output
const validation = await consistencyValidator.validate(
  snapshots.front,
  aiGeneratedImage,
  plan,
  'elevation_north'
);
// Returns: {valid, edgeIoU, paletteMatch, windowCountMatch, issues, recommendations}
```

---

## Quick Start Test

Test the foundation that's already built:

```javascript
// In Node.js or browser console
import planGeneratorService from './src/services/planGeneratorService';

const siteGeo = {
  polygon: [[0,0], [15,0], [15,30], [0,30], [0,0]],
  width_m: 15,
  depth_m: 30,
  area_m2: 450,
  north_deg: 0,
  street_side: 'south',
  setbacks: {front_m: 6, rear_m: 3, side_m: 1.5}
};

const plan = await planGeneratorService.createPlan(
  siteGeo,
  {
    bedrooms: 3,
    bathrooms: 2,
    living: true,
    kitchen: true,
    totalArea_m2: 150,
    floors: 2
  },
  'TEST-001',
  {climate: 'temperate', style: 'Modern'}
);

console.log('Generated PlanJSON:', plan);
console.log('Rooms:', plan.levels.flatMap(l => l.rooms.map(r => r.name)));
console.log('Total windows:', plan.levels.flatMap(l => l.rooms.flatMap(r => r.windows)).length);
```

---

## For Complete Details

See `GEOMETRY_FIRST_ARCHITECTURE_DETAILED.md` for:
- Complete architecture diagram
- Detailed implementation guide for each phase
- Code examples and pseudo-code
- Testing strategy
- Migration path
- Performance expectations
- FAQ

---

## Testing the Complete Pipeline

### Test 1: Generate PlanJSON from Site
```typescript
import planGeneratorService from './src/services/planGeneratorService';

const plan = await planGeneratorService.createPlan(
  siteGeometry,
  {bedrooms: 3, bathrooms: 2, totalArea_m2: 150, floors: 2},
  'PROJECT-001'
);
```

### Test 2: Generate 3D Scene
```typescript
import bimService from './src/services/bimService';

const {scene, metadata} = await bimService.buildSceneFromPlan(plan);
console.log('Scene generated:', metadata);
// {polygonCount: 450, vertexCount: 1200, roomCount: 6, windowCount: 12, doorCount: 6}
```

### Test 3: Render Snapshots
```typescript
import previewRenderer from './src/services/previewRenderer';

const snapshots = await previewRenderer.snapshotViews(scene, plan);
console.log('Snapshots:', Object.keys(snapshots));
// ['front', 'side', 'back', 'axonometric', 'perspective', 'interior']

// Download a snapshot
previewRenderer.exportSnapshot(snapshots.front, 'front-elevation.png');
```

### Test 4: Validate Consistency
```typescript
import consistencyValidator from './src/services/consistencyValidator';

const validation = await consistencyValidator.validate(
  snapshots.front,
  aiGeneratedFrontElevation,
  plan,
  'elevation_north'
);

if (!validation.valid) {
  console.log('Validation failed:', validation.issues);
  console.log('Recommendations:', validation.recommendations);
  // Retry with higher reference_strength
}
```

---

## Next Steps (Phase 3: Integration)

**Ready to integrate into main workflow:**

1. Update `togetherAIService.js` to accept reference images
2. Modify `ArchitectAIEnhanced.js` to use geometry-first pipeline
3. Add UI for viewing snapshots before AI generation
4. Wire validation into generation workflow with auto-retry

**Integration point in `ArchitectAIEnhanced.js`:**
```javascript
// OLD WAY (image-first)
const aiResult = await togetherAIService.generate13Views(DNA, seed);

// NEW WAY (geometry-first)
const plan = await planGeneratorService.createPlan(siteGeo, program, projectId);
const {scene} = await bimService.buildSceneFromPlan(plan);
const snapshots = await previewRenderer.snapshotViews(scene, plan);

const aiResult = await togetherAIService.generate13ViewsWithConstraints({
  plan,
  snapshots,
  dna: DNA,
  seed: plan.metadata.seed
});
```

---

**Status:** Phase 1 & 2 Complete ✅✅
**Next:** Phase 3 (Integration) - Wire into main UI workflow
**ETA to Production:** 2-3 days for integration + testing

**Created:** 2025-10-28
**Updated:** 2025-10-28 (Phase 2 Complete)
**Version:** 2.0.0-geometry-first-3d-pipeline
