# Phase 5 Repair, Dependency, and Compose State

Phase 5 extends the deterministic backend into a stronger project-state engine without changing the frontend contract shape or replacing canonical geometry as the source of truth.

## Added

- Deterministic repair search:
  - `src/services/floorplan/layoutRepairEngine.js`
  - `src/services/floorplan/layoutCandidateSearch.js`
  - `src/services/floorplan/layoutRepairStrategies.js`
- Formal schema registry and Ajv-style validation:
  - `src/services/contracts/jsonSchemaRegistry.js`
  - `src/services/contracts/ajvValidationService.js`
  - `src/services/contracts/contractVersioningService.js`
- Fragment-level dependency invalidation:
  - `src/services/editing/dependencyEdgeRegistry.js`
  - `src/services/editing/artifactDependencyGraph.js`
  - `src/services/editing/fragmentInvalidationService.js`
- Compose-readiness orchestration:
  - `src/services/a1/a1PanelArtifactPlanner.js`
  - `src/services/a1/a1ComposeInvalidationService.js`
  - `src/services/a1/a1ComposeReadinessService.js`
- Artifact lifecycle store:
  - `src/services/project/projectArtifactStore.js`
  - `src/services/project/artifactFreshnessService.js`
  - `src/services/project/projectStateSnapshotService.js`
- Irregular-site fallback scoring:
  - `src/services/site/irregularSiteScoringService.js`
  - `src/services/site/siteFallbackStrategies.js`
- Route:
  - `POST /api/models/repair-project`

## Deterministic

- Repair candidate generation order and candidate selection are deterministic for identical input.
- Fragment invalidation plans are deterministic and inspectable.
- Compose readiness is driven from canonical geometry, artifact freshness, and fragment dependencies.
- Schema validation messages are stable for the same malformed payload.

## Still Heuristic

- Repair strategies are geometry-first heuristics, not global optimization.
- Irregular-site fallback is not polygon packing or exact space planning.
- Compose readiness blocks fail-closed on stale or missing assets, but it does not regenerate missing assets by itself.
- Structural, daylight, circulation, and wet-stack scoring remain concept-level quality heuristics.

## Public Contract Notes

- `meta.publicApiVersion` moves to `phase5-repair-dependency-compose-v1`.
- `meta.contractVersion` now reflects the stable public project-state contract.
- `meta.legacyContractVersion` preserves the older Phase 1 naming lineage.
- Deprecated aliases remain accepted where practical and are surfaced in `meta.deprecatedAliases`.

## New Project-State Fields

- `artifactStore`: fragment-aware lifecycle state.
- `artifactFreshness`: stale/missing/fresh family and fragment summary.
- `composeReady` and `composeBlocked`: explicit A1 compose orchestration state.
- `freshPanels`, `stalePanels`, `missingPanels`: panel-level readiness detail.
- `missingAssets` and `blockingReasons`: fail-closed compose diagnostics.
- `stateSnapshots`: before/after regeneration snapshots plus a diff summary.

## Phase 6 Likely Next

- Repair actions that rebuild downstream walls/openings/doors more completely after room edits.
- Stronger section and elevation fragment targeting from edit scope.
- Compose orchestration that can queue or trigger regeneration rather than only reporting blocked state.
- More complete JSON Schema coverage and optional real Ajv integration if dependency policy allows it.
