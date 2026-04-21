# Phase 18: Deeper Section Clipping and Drafting Graphics

## What changed

Phase 18 strengthens the deterministic section pipeline in four places:

1. deeper cut-band clipping from richer roof/foundation/base-condition primitives
2. clearer `direct` vs `contextual` vs `derived` vs `unsupported` construction truth
3. more drafting-grade section graphics driven by clipped truth instead of broad project richness
4. stronger propagation of section-construction evidence into candidate ranking, technical gating, publishability, and route contracts

## How deeper section clipping works

- `sectionClipperService` now builds an explicit cut band with direct and contextual widths.
- Segment, polygon, bbox, and point-backed section clipping use that band instead of broad coordinate-only proximity whenever stronger primitives are available.
- Construction primitives now carry:
  - `truthSupportMode`
  - `constructionTruthState`
  - `clipDepthM`
  - `cutBand`
- `sectionGeometryIntersectionService` now publishes `constructionTruthSummary` across grouped intersection families.

## Construction-truth classification

Section construction truth is classified in this order:

- `direct`: exact clipped geometry with explicit construction support
- `contextual`: near-cut or context-backed geometry that is still useful but not exact cut truth
- `derived`: profile/perimeter/language fallback when explicit clipped truth is unavailable
- `unsupported`: no credible support

Phase 18 adds clearer counts and qualities for:

- overall section construction evidence
- cut walls
- cut openings
- stairs
- slabs
- roof
- foundation and base conditions

## Drafting-grade graphics changes

Section SVG output now follows clipped truth more directly:

- cut walls use stronger poche and weaker dashed/contextual rendering when truth is not direct
- cut openings render with truth-aware emphasis instead of a single flat style
- slab build-up depth responds to clipped depth
- foundation direct clips render separately from broader ground bands
- roof cut planes render separately from roof profile lines

Direct truth is intentionally stronger. Contextual or derived truth remains visibly weaker.

## Ranking changes

Section candidate ranking now prefers cuts with:

- stronger direct construction truth counts
- more exact construction clips
- stronger wall/opening/stair/slab/roof/foundation cut evidence

It penalizes cuts that:

- rely heavily on contextual or derived construction truth
- have broad scene communication but thin exact cut-construction proof

## What is now guaranteed

- Phase 18 route responses expose section construction-evidence quality explicitly.
- The canonical verification bundle carries section-construction evidence and wall/opening/stair truth quality.
- Chosen section rationale is exposed in canonical verification and top-level readiness responses.
- Weak exact section-construction truth can now block technical scoring even when generic section usefulness exists.

## What remains heuristic

- This is still lightweight geometric clipping, not full solid-model boolean sectioning.
- Some roof and foundation truth still depends on upstream primitive richness.
- Drafting-grade graphics are stronger, but still schematic compared with CAD-native construction sections.

## Phase 19

Highest-value next work:

1. deeper exact clipping from richer upstream roof/foundation primitives
2. stronger explicit construction assemblies from canonical geometry
3. further reduction of renderer-local interpretation in favor of clipped truth
