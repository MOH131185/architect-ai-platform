# Phase 15: Canonical Roof And Foundation Truth

## What Phase 15 changes

Phase 15 strengthens section credibility by moving roof and ground-condition truth upstream into canonical geometry instead of relying mainly on derived profile and contextual fallback.

The canonical project geometry now carries additive Phase 15 collections:

- `roof_primitives`
- `foundations`
- `base_conditions`

These are additive to the existing `roof` summary object and do not replace earlier geometry contracts.

## What is now guaranteed

- Canonical coercion backfills deterministic `roof_primitives` when only a top footprint and roof language are available.
- Canonical coercion backfills deterministic `foundations` and `base_conditions` when explicit substructure inputs are missing.
- Section roof truth now distinguishes explicit primitive clips from derived roof-profile fallback.
- Section foundation truth now distinguishes explicit foundation or base-condition clips from contextual wall/slab support.
- Section ranking, section graphics, technical scoring, A1 credibility, publishability, and route contracts all receive the same roof/foundation truth fields.

## Truth model

Phase 15 keeps the geometry-first rule:

- explicit canonical roof or foundation primitives are the highest-trust evidence
- direct cut geometry outranks near or contextual evidence
- derived roof-profile or contextual ground-condition fallback is still allowed, but it is scored and labeled honestly

Important Phase 15 truth fields now propagated through section evidence and A1 verification:

- `slabTruthQuality`
- `roofTruthQuality`
- `foundationTruthQuality`
- `explicitRoofPrimitiveCount`
- `explicitFoundationCount`
- `explicitBaseConditionCount`

## What is still heuristic

- Roof primitives derived from a footprint and roof language are still deterministic approximations, not a full roof-construction model.
- Foundation primitives derived from exterior walls, perimeter edges, and site ground condition are still simplified substructure semantics.
- Section clipping is still lightweight geometric intersection, not full solid-model boolean sectioning.

## Renderer behavior

Section SVG output now uses roof and foundation truth more explicitly:

- explicit roof bands are preferred over a generic whole-width roof fallback
- explicit foundation/base-condition bands are preferred over purely contextual footing markers
- contextual roof or ground truth remains visibly downgraded instead of being drawn as if fully resolved

## Contract behavior

The canonical verification payload now exposes:

- `slabTruthQuality`
- `roofTruthQuality`
- `foundationTruthQuality`

These values are aligned across:

- `verification`
- `verificationBundle`
- `verificationState` compatibility alias
- top-level readiness and health route fields

## What Phase 16 should solve next

Phase 16 should prioritize:

1. richer explicit canonical roof primitives from upstream geometry, not only footprint-derived defaults
2. richer explicit foundation and terrain/base-condition primitives from upstream site and structural geometry
3. deeper section clipping and section graphics fidelity before adding more scoring layers
