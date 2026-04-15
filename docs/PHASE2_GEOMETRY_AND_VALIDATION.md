# Phase 2 Geometry And Validation

Phase 2 upgrades the architecture backend from Phase 1 scaffolding into a deterministic geometry-first technical pipeline.

This phase does not use image generation as the source of truth.
Canonical project geometry is now the authoritative backend artifact for floorplans, technical drawings, and validation.

## What Phase 2 Adds

- Canonical project geometry schema in `src/services/cad/projectGeometrySchema.js`
- Canonical geometry assembly helpers in `src/services/cad/geometryFactory.js`
- Geometry schema/reference checks in `src/services/cad/geometryValidators.js`
- Program normalization in `src/services/floorplan/programNormalizer.js`
- Adjacency graph construction and scoring in `src/services/floorplan/adjacencyGraphBuilder.js`
- Deterministic zoning/layout solving in `src/services/floorplan/layoutSolver.js`
- Zone assignment helpers in `src/services/floorplan/zoningEngine.js`
- Wall derivation in `src/services/floorplan/wallGraphBuilder.js`
- Door/window placement heuristics in `src/services/floorplan/openingPlacementService.js`
- Simple circulation generation in `src/services/floorplan/circulationGenerator.js`
- Geometry-based SVG plan/elevation/section rendering in `src/services/drawing/*`
- Project and drawing validation in `src/services/validation/projectValidationEngine.js`
- New route: `POST /api/models/validate-project`

## Canonical Geometry

Canonical geometry uses `canonical-project-geometry-v2`.

The schema is intended to be stable and deterministic. It includes:

- `project_id`
- `site`
- `levels`
- `rooms`
- `walls`
- `doors`
- `windows`
- `stairs`
- `circulation`
- `columns`
- `beams`
- `slabs`
- `roof`
- `footprints`
- `elevations`
- `sections`
- `annotations`
- `metadata`
- `provenance`

All generated entities use stable IDs so later phases can safely reference them.

## Route Behavior

### `POST /api/models/generate-floorplan`

Current Phase 2 flow:

1. Normalize program
2. Build adjacency graph
3. Solve deterministic zoning/layout
4. Derive walls, openings, stairs, and circulation
5. Assemble canonical geometry
6. Validate geometry
7. Return canonical geometry plus report

If `useFailClosedTechnicalFlow` is enabled and validation is `invalid`, the route returns `422` with structured validation details.

### `POST /api/models/generate-drawings`

Current Phase 2 flow:

1. Coerce input to canonical geometry
2. Render deterministic SVG plan/elevation/section outputs from geometry only
3. Validate drawing completeness against the same geometry
4. Return drawings plus validation report

If `useFailClosedTechnicalFlow` is enabled and validation is `invalid`, the route returns `422`.

### `POST /api/models/validate-project`

Runs the validation engine against canonical geometry and optional drawings.
This route always reports validation state directly and does not mark anything complete.

## Feature Flags

Phase 2 adds:

- `useCanonicalGeometryPhase2`
- `useAdjacencySolver`
- `useDeterministicSvgPlans`
- `useGeometryValidationEngine`
- `useFailClosedTechnicalFlow`

These flags are enabled by default for the Phase 2 backend path, but they are isolated from the legacy A1 / Together flows.

## Deterministic vs Heuristic

Deterministic:

- Program normalization
- Adjacency graph construction
- Zoning assignment
- Strip-band room allocation inside the buildable envelope
- Wall segment derivation
- Door/window placement rules
- SVG plan/elevation/section rendering
- Validation status computation

Heuristic:

- Zone assignment from room semantics
- Multi-level room distribution when no explicit level hint exists
- Door placement based on shared-wall adjacency
- Window placement on the strongest exterior wall per room
- Stair placeholder placement

These heuristics are intentionally simple and honest. They are not presented as optimized architectural synthesis.

## What Remains For Later Phases

- Better room packing and search/optimization
- Richer stair/core generation
- More complete structural systems
- Better section/elevation semantics
- Detailed annotation and dimensioning
- Learned layout candidates behind the same canonical geometry contract
- External model adapters that consume or refine structured geometry without replacing it as source of truth
