# Phase 6 Recovery, Regeneration, and Orchestration

## Summary

Phase 6 extends the Phase 5 project-state engine into a more self-healing, regeneration-aware backend while keeping canonical geometry as the source of truth.

This phase adds:

- deeper deterministic repair search with multi-step repair paths
- targeted regeneration planning with minimum-safe scopes
- finer dependency fragments for levels, facade sides, drawings, and panels
- stronger compose blocking and recovery planning
- better irregular-site fallback metadata and partitioning
- stronger schema structure for Phase 6 project-state routes
- technical drawing readability and annotation reliability checks
- honest A1 technical panel gating for stale, weak, or incomplete technical assets

## Deterministic behavior

Phase 6 remains deterministic for identical input.

Deterministic parts:

- repair strategy ordering and candidate IDs
- multi-step repair plan generation and tie-breaking
- targeted regeneration scope resolution
- recovery action ordering
- artifact freshness summaries
- compose blocking reasons
- technical panel readability and annotation checks
- irregular-site fallback partitions and confidence classes

## Heuristic behavior

Phase 6 is still heuristic in these areas:

- layout repair search is deterministic but not globally optimal
- irregular-site solving is still fallback partitioning, not robust polygon packing
- technical readability checks infer quality from backend SVG payloads and metadata rather than full visual layout understanding
- recovery plans recommend minimum safe actions, but they do not auto-execute fixes

## Technical panel readability checks

Technical plans, elevations, and sections remain deterministic SVG outputs.

Phase 6 adds backend checks for:

- plan line hierarchy
- wall and opening visibility
- stair readability
- room-label density
- elevation/section title and level-label presence
- undefined or NaN annotation/rendering tokens inside SVG payloads

These checks are produced from backend drawing contracts and metadata. They do not rely on image generation.

## A1 technical panel gating

Phase 6 separates technical panel honesty from hero-image quality.

Compose can now be blocked when:

- technical drawing fragments are stale
- technical panel source assets are missing
- annotation reliability fails
- readability scores fall below the configured threshold
- geometry-linked drawing signatures are stale relative to the current artifact store

## What backend can and cannot guarantee

Backend can now guarantee:

- deterministic SVG technical drawing generation from canonical geometry
- explicit technical quality warnings and blockers when backend drawing payloads are weak or broken
- deterministic freshness and targeted-regeneration planning for many project-state workflows

Backend cannot yet guarantee:

- perfect label placement in every composed board state
- font rendering consistency across all downstream composition environments
- full visual legibility under every viewport or external renderer
- robust architectural solving for highly concave or extreme irregular sites

## New Phase 6 routes

- `POST /api/models/repair-project`
  - returns chosen repair path, candidate summaries, repaired output, and rationale
- `POST /api/models/project-readiness`
  - returns compose blocking state, technical panel readiness, freshness, and recovery planning
- `POST /api/models/plan-a1-panels`
  - returns panel candidates plus technical panel blockers and stale/missing panel state
- `POST /api/models/plan-regeneration`
  - returns the minimum safe regeneration scope and ordered recovery actions
- `POST /api/models/project-health`
  - returns project health, recovery planning, and rollback planning

## Feature flags

Phase 6 adds:

- `usePhase6RepairSearch`
- `useTargetedRegenerationPlanning`
- `useFragmentEdgesPhase6`
- `useComposeExecutionPlanning`
- `useIrregularSiteFallbackPhase6`
- `useProjectRecoveryFlows`
- `useTechnicalPanelReadabilityChecks`
- `useA1TechnicalPanelGating`

## Phase 7 direction

Phase 7 should solve the remaining gaps:

- deeper repair that can rebuild walls/openings/cores more structurally
- stronger fragment edges for section cuts, openings, and stair-core influenced panels
- compose orchestration that can optionally trigger approved recovery actions
- stronger text layout and annotation placement inside technical drawings
- broader state rollback and recovery against persisted healthy snapshots
