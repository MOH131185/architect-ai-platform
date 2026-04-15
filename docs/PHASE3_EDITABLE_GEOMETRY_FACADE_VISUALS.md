# Phase 3: Editable Geometry, Facade, and Visual Packaging

Phase 3 extends the Phase 2 geometry-first backend without changing the core rule:
canonical geometry remains the source of truth.

## What Phase 3 Adds

- Stronger multi-level room distribution with deterministic level assignment and vertical stacking.
- Stair/core generation with aligned multi-level footprints.
- Geometry-aware facade grammar derived from canonical geometry and Style DNA.
- Concept-level structural grid and support sanity checks.
- Layer locks, diffs, and partial regeneration scaffolding.
- Geometry-locked visual generation packages for future Together/FLUX or other providers.
- Cross-level, facade, structure, and edit-integrity validation.

## New Feature Flags

- `usePhase3MultiLevelEngine`
- `useStairCoreGenerator`
- `useFacadeGrammarEngine`
- `useStructuralSanityLayer`
- `usePartialRegeneration`
- `useGeometryLockedVisuals`
- `usePhase3Validation`

These flags default to enabled for the Phase 3 backend routes, but the existing
Phase 2 and legacy A1/Together flows remain available because the new logic is
isolated inside the modular architecture backend path.

## New API Routes

- `POST /api/models/generate-project`
- `POST /api/models/regenerate-layer`
- `POST /api/models/generate-facade`
- `POST /api/models/generate-visual-package`

Existing routes remain in place:

- `POST /api/models/generate-floorplan`
- `POST /api/models/generate-drawings`
- `POST /api/models/validate-project`
- `GET /api/models/status`

## Deterministic vs Heuristic

Deterministic:

- level assignment scoring
- vertical stacking groups
- stair/core footprint placement
- structural grid generation
- facade grammar assembly
- visual package prompt and control reference assembly
- partial regeneration diffs

Heuristic:

- vertical room distribution priorities
- stair/core variant selection
- facade material zoning and shading suggestions
- structural sanity warnings
- provider-agnostic visual prompt composition

## What Remains Deferred

- code-compliance structural analysis
- detailed egress and landing geometry
- true facade optimization
- provider-specific image/video inference adapters
- robust CAD/BIM round-tripping
- advanced search/optimization for room packing and circulation

## Integration Notes

- Style DNA can influence facade language, roof/parapet language, opening language, and material zones.
- Geometry validation remains primary; Style DNA does not override geometric sanity.
- Visual packages are locked to canonical geometry signatures, but they do not claim perfect rendered fidelity.
