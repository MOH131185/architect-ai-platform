# Phase 4: Solver, Schema, and A1 Readiness

Phase 4 deepens the deterministic backend without changing the frontend or replacing the existing A1 / Together flows. Canonical geometry remains the source of truth. New visual and A1 orchestration layers are derived from that geometry and are explicitly invalidated when upstream geometry changes.

## What Phase 4 Adds

### Deterministic solver search

- `layoutSearchEngine.js`
- `layoutScoringService.js`
- `roomShapeOptimizer.js`
- `corridorQualityService.js`

The solver now evaluates multiple deterministic layout candidates and scores them using:

- adjacency satisfaction
- corridor quality
- room-shape quality
- buildable-envelope fit
- daylight heuristics
- wet-zone stacking quality

This is still not a full architectural optimizer. It is a stronger deterministic search layer over the previous allocator.

### Site and buildable-envelope reasoning

- `siteConstraintInterpreter.js`
- `buildableEnvelopeService.js`

The backend now derives a buildable envelope from site boundary and setbacks, supports irregular site shapes better than the previous rectangular fallback, and surfaces warnings when the site strongly constrains the solver.

### Formal schema enforcement

- `jsonSchemas.js`
- `schemaValidationService.js`

The Phase 4 routes and canonical geometry now have a formal schema-validation layer. This is intentionally lightweight and conservative. It rejects clearly malformed requests earlier while still preserving backward-compatible coercion where the older routes already accepted minimal shapes.

### Richer facade component semantics

- `facadeComponentLibrary.js`
- `facadeAssemblyService.js`
- `shadingElementService.js`

Facade grammar now includes component-level semantics such as bays, grouped openings, shading elements, feature frames, balcony placeholders, and parapet families. These remain geometry-derived and Style-DNA-influenced.

### Structural semantics

- `supportPathService.js`
- `spanSanityService.js`
- `stackedSupportValidator.js`

This layer remains concept-level only. It adds support continuity and span sanity warnings without claiming code-compliance or structural engineering completeness.

### Dependency-aware regeneration and invalidation

- `projectDependencyGraph.js`
- `regenerationPlanner.js`
- `artifactInvalidationService.js`

Regeneration planning is now dependency-driven. A facade edit can mark drawings, visual package state, and A1 readiness as stale without mutating unrelated geometry. This reduces hidden coupling and makes partial edits more honest.

### A1 orchestration readiness

- `a1ArtifactStateService.js`
- `a1PanelPlanningService.js`
- `a1ProjectReadinessService.js`

These services do not replace the current compose pipeline. They expose:

- readiness status
- panel candidates
- stale assets
- geometry signatures
- readiness reasons

This prepares the backend for cleaner orchestration from canonical state into A1 composition.

## New and Upgraded Routes

### Existing upgraded routes

- `POST /api/models/generate-project`
- `POST /api/models/regenerate-layer`
- `POST /api/models/validate-project`
- `GET /api/models/status`

### New Phase 4 routes

- `POST /api/models/project-readiness`
- `POST /api/models/plan-a1-panels`

All Phase 4 routes preserve the hardened Phase 1 and Phase 3 route safety behavior:

- origin allowlist enforcement
- method checks
- structured error envelopes
- feature-flag gates
- fail-closed responses where validation requires it

## Feature Flags

Phase 4 introduces:

- `usePhase4LayoutSearch`
- `useBuildableEnvelopeReasoning`
- `useFormalSchemaValidation`
- `useFacadeComponentAssembly`
- `useStructuralSemanticsPhase4`
- `useDependencyGraphRegeneration`
- `useA1ProjectReadiness`

These flags keep the new behavior controlled and make it possible to preserve older flows when needed.

## Deterministic vs Heuristic

### Deterministic

- canonical geometry signatures
- candidate layout evaluation order
- room-shape normalization
- facade component assembly
- dependency graph resolution
- artifact invalidation state
- A1 panel planning
- readiness assessment

### Still heuristic

- final layout quality is improved but not globally optimized
- daylight and corridor quality are approximate heuristics
- facade semantics are richer but not construction-detail accurate
- structural reasoning is concept-level only
- A1 readiness prepares composition but does not replace the existing compose implementation

## Backward Compatibility Notes

- Phase 1, 2, and 3 contracts remain intact.
- Deprecated aliases are still surfaced in route metadata while the public API moves toward a cleaner Phase 4 contract version.
- Minimal legacy geometry is still coerced safely for drawing, facade, visual-package, and regeneration endpoints.
- Existing A1 / Together flows are not replaced or removed.

## What Phase 5 Should Solve Next

Phase 5 should focus on:

- deeper deterministic layout optimization with richer search and repair
- stronger corridor and egress reasoning
- more exact facade-to-opening-to-structure coupling
- richer artifact dependency semantics down to sub-layer granularity
- tighter A1 orchestration into actual compose-state refresh behavior
- stronger schema formalization and clearer deprecation of old aliases
