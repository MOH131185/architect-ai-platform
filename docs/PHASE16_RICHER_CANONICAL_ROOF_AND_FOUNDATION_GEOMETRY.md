# Phase 16: Richer Canonical Roof And Foundation Geometry

## What Phase 16 changed

Phase 16 moves more roof and ground truth upstream into canonical geometry so section credibility does not depend mainly on downstream fallback heuristics.

The canonical geometry factory now synthesizes richer deterministic primitives for:

- roof planes
- ridges
- eaves and roof edges
- parapets
- roof breaks
- dormer attachments
- foundations
- ground lines
- plinth lines
- slab-to-ground interfaces
- grade breaks and step lines

These primitives are then propagated into section intersection, section evidence, section scoring, section graphics, A1 regression, publishability, and route contracts.

## Canonical truth modes

### Roof support modes

- `explicit_generated`
  Canonical roof primitives were generated or supplied and section truth can resolve roof structure from those primitives.
- `derived_profile_only`
  Roof truth depends on a simpler roof profile or roof envelope without richer explicit roof primitives.
- `roof_language_only`
  Only high-level roof language exists.
- `missing`
  No usable roof support was resolved.

### Foundation / base-condition support modes

- `explicit_ground_primitives`
  Canonical foundations and/or explicit ground-relation primitives were resolved.
- `contextual_ground_relation`
  Some ground/base-condition context exists, but explicit substructure truth is still thin.
- `missing`
  No reliable foundation / base-condition truth was resolved.

## What downstream section truth now consumes

Phase 16 section truth now consumes:

- canonical roof primitive families and support modes
- canonical foundation and base-condition primitives
- ground relation condition types
- richer facade roof-edge seeds for side-elevation support
- route-level canonical truth summaries in `metadata.canonical_construction_truth`

This lets section evidence expose:

- `roofTruthMode`
- `foundationTruthMode`
- explicit roof-edge / parapet / roof-break counts
- explicit ground-relation counts

Those fields are now surfaced through:

- technical panel scoring
- A1 technical regression
- technical credibility
- publishability
- route contracts for readiness / health / panel planning

## Compatibility behavior

Phase 16 keeps older accepted flows stable:

- Older section fixtures without explicit ground primitives are not automatically blocked if strong direct slab + wall context exists.
- Older side-facade schema consumers still receive the stable Phase 12 schema version even when richer roof-support evidence is present in the payload.
- Strong post-compose boards are not downgraded to `reviewable` only because stale section-thinness warnings survived after stronger rendered and construction evidence was already verified.

## What is still heuristic

Phase 16 is still not full CAD-grade boolean sectioning.

The system still uses lightweight deterministic geometry reasoning for some cases:

- roof truth can still fall back to derived profile support
- foundation truth can still depend partly on site/perimeter context
- section clipping is still lighter-weight than full solid-model clipping
- section graphics are more construction-aware, but still schematic

## What Phase 17 should solve next

Phase 17 should prioritize:

- richer explicit roof primitives from upstream generation so fewer cases fall back to `derived_profile_only`
- richer explicit foundation and base-condition primitives from upstream generation
- deeper section clipping beyond lightweight intersection logic
- stronger construction graphics before adding more scoring layers
