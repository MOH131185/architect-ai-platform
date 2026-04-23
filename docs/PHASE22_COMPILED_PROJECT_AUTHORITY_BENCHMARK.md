# Phase 22: Compiled-Project Authority Benchmark And Migration

## Goal

This phase turns the Prompt 1-6 work into an enforceable integration contract:

- `CompiledProject` is the authority for technical A1 panels.
- The canonical technical pack must be built from compiled-project geometry.
- 2D technical panels and 3D rendered views must share one `geometryHash`.
- Legacy `BuildingModel/Projections2D` authority must not drive the live A1 route.

## What Changed

### 1. CompiledProject -> deterministic technical renderer adapter

`src/services/canonical/compiledProjectTechnicalPackBuilder.js`

- Added a compiled-project adapter that translates the compiled schema into the canonical geometry shape expected by the deterministic SVG renderers.
- Preserves relational links between levels, walls, rooms, openings, stairs, slabs, and roof primitives.
- Uses compiled-project section-cut candidates when generating sections instead of falling back to generic section profiles.

This closes the biggest integration seam between the new compiler and the older deterministic drawing stack.

### 2. Canonical pack now keeps the compiled-project geometry hash

`src/services/canonical/CanonicalGeometryPackService.js`

- The pack now carries the authoritative `geometryHash` from `CompiledProject`.
- The SVG bundle hash is still retained separately as `metadata.technicalSvgBundleHash`.

This matters because the old behavior let the technical pack invent a new hash based on SVG payloads, which broke the “one geometry authority across 2D and 3D” contract.

### 3. Legacy model label removed from the live orchestrator path

`src/services/dnaWorkflowOrchestrator.js`

- The compiled-project canonical control path no longer advertises `buildingmodel_projections2d`.

This is partly cosmetic, but also important for operational clarity because Prompt 7 explicitly treats legacy authority leakage as a regression.

## Benchmark Harness

New script:

`scripts/tests/test-compiled-project-benchmark.mjs`

What it verifies:

- 5 fixed residential benchmark cases
- varying climates
- varying locale styles
- varying portfolio blends
- compiled-project canonical pack generation
- compiled-project routing for every technical panel
- one shared `geometryHash` across canonical pack and unified 3D pipeline
- technical views stay deterministic in the unified pipeline
- publishability/consistency gate passes on the assembled board artifact
- the live orchestrator no longer carries the legacy `buildingmodel_projections2d` authority label

Run it with:

```bash
node scripts/tests/test-compiled-project-benchmark.mjs
```

## Active Feature Flags

The compiled-project benchmark assumes these production-intent settings:

- `hybridA1Mode = true`
- `multiPanelA1 = true`
- `requireCanonicalPack = true`
- `threeTierPanelConsistency = true`
- `meshy3DMode = false`
- `controlNetRendering = false`
- `useDraftingGradeSectionGraphicsPhase14 = true`
- `useDraftingGradeSectionGraphicsPhase18 = true`
- `useDraftingGradeSectionGraphicsPhase19 = true`
- `useDraftingGradeSectionGraphicsPhase20 = true`
- `useDraftingGradeSectionGraphicsPhase21 = true`

## Migration Path

The target architecture is now:

1. `compileProject(...)` creates the deterministic `CompiledProject`.
2. `buildCompiledProjectTechnicalPanels(...)` adapts compiled-project geometry into the deterministic renderer lane.
3. `buildCanonicalPack(...)` publishes compiled-project technical assets without changing the authoritative geometry hash.
4. `panelAuthorityRouter.js` keeps technical panels on deterministic compiled authority.
5. `unifiedGeometryPipeline.js` uses the same authority for 3D views and preserves geometry continuity.
6. `CanonicalPackGate.js` and `compiledProjectPublishConsistencyGate.js` block bad boards.

## Rollback Path

There is no clean feature-flag rollback to the old authority model without reintroducing drift.

Operational rollback options are:

1. Keep the compiled-project compiler in place, but let technical panels fall back to direct deterministic SVG generation without compiled canonical assets.
2. As a last-resort service-continuity move, disable `requireCanonicalPack`.
3. Do not treat those rollback states as blueprint-grade output. They restore throughput, not trustworthy 2D/3D coherence.

If a code rollback is necessary, the primary control points are:

- `src/services/canonical/compiledProjectTechnicalPackBuilder.js`
- `src/services/canonical/CanonicalGeometryPackService.js`
- `src/services/design/panelAuthorityRouter.js`
- `src/services/pipeline/unifiedGeometryPipeline.js`

## Remaining Gaps

This phase proves authority continuity, not final product perfection.

Remaining work:

- benchmark real user/site generations, not only fixed synthetic residential fixtures
- move final A1 title block, schedules, notes, and sheet annotation layout further toward deterministic vector drafting
- tighten direct acceptance metrics for elevation semantics and section usefulness on complex geometries
- add final sheet-level SVG/PDF export verification, not only panel/pipeline verification
- reduce dependence on image-edit stylization for the hero render if true architect-grade presentation consistency is required

## Recommended Next Gate

Before claiming “architect blueprint quality” in production:

1. Run the new benchmark in CI.
2. Add 5-10 captured real project fixtures.
3. Fail deploys when any benchmark case loses compiled-project authority or geometry-hash continuity.
