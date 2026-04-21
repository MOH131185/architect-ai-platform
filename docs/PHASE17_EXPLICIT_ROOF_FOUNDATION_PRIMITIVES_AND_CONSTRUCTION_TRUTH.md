# Phase 17: Explicit Roof / Foundation Primitives And Construction Truth

## What changed

Phase 17 moves more roof and foundation truth upstream into canonical geometry instead of leaving it to later section heuristics.

The main additions are:

- explicit roof primitive synthesis in `geometryFactory` via `roofPrimitiveSynthesisService`
- explicit foundation and base-condition synthesis in `geometryFactory` via `foundationPrimitiveSynthesisService`
- one normalized roof/foundation truth model in `constructionTruthModel`
- deeper section clipping that consumes richer roof and ground primitives
- richer truth-state propagation into section rendering, technical scoring, A1 regression, publishability, and route contracts

## Explicit roof primitive synthesis

When canonical geometry and DNA support it, Phase 17 now synthesizes:

- roof planes
- ridges
- roof edges
- eaves
- parapets
- roof breaks
- hips
- valleys
- dormer attachment relationships

These primitives are deterministic. If support is weak, the system still degrades honestly to:

- `derived_profile_only`
- `roof_language_only`
- `missing`

## Explicit foundation / base-condition synthesis

When canonical geometry and site/base conditions support it, Phase 17 now synthesizes:

- foundation zones
- base wall conditions
- ground lines
- plinth lines
- slab-ground interfaces
- grade breaks
- step lines

This reduces the old dependence on contextual wall/slab adjacency alone. If explicit support is absent, the system still reports contextual or missing truth instead of fabricating substructure detail.

## Normalized construction truth model

Phase 17 centralizes support-mode and truth-state handling in `constructionTruthModel.js`.

The canonical buckets are:

- `direct`
- `contextual`
- `derived`
- `unsupported`

These buckets now flow through:

- section intersections
- section evidence summaries
- section renderer metadata
- technical panel scoring
- A1 technical regression
- publishability
- route responses

## Section ranking changes

Section candidate ranking now responds more clearly to:

- direct roof clips
- explicit hips / valleys / roof breaks
- direct foundation and base-condition clips
- explicit foundation zones
- base wall conditions

Cuts that rely mostly on derived or contextual roof/foundation truth are penalized more explicitly.

## Guarantees

Phase 17 now guarantees:

- richer explicit roof and foundation primitives are synthesized upstream when canonical support exists
- direct vs contextual vs derived construction truth is normalized consistently
- route responses expose roof/foundation truth state without contradicting the canonical verification bundle
- derived roof-profile fallback does not masquerade as direct roof truth

## Still heuristic

Phase 17 is still not full solid-model boolean sectioning.

The remaining heuristic areas are:

- lightweight geometric clipping instead of full volumetric section booleans
- contextual foundation truth when upstream substructure primitives are still thin
- route compatibility fields that still coexist with the canonical verification bundle

## Phase 18 next

Phase 18 should focus on:

- deeper geometric clipping for roof/foundation-heavy cuts
- richer upstream canonical roof/foundation primitives so fewer cases rely on fallback inference
- stronger drafting-grade section graphics driven by explicit construction geometry rather than scoring changes
