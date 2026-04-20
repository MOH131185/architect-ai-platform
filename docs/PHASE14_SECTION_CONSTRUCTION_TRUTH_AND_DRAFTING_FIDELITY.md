# Phase 14: Section Construction Truth And Drafting Fidelity

## What Phase 14 changed

Phase 14 extends the Phase 13 true-section-clipping path into a richer
construction-truth and drafting-fidelity layer.

The section stack now distinguishes:

- direct cut truth from actual clipped wall, opening, stair, slab, and roof data
- contextual or inferred construction evidence
- drafting-grade section graphics from weaker schematic section output

The core goal was to improve final-board section credibility without replacing
the geometry-first pipeline or breaking the existing A1 / Together flow.

## New section guarantees

When the relevant Phase 14 flags are enabled:

- section evidence carries explicit construction-truth quality
- cut-wall, cut-opening, stair, slab, roof, and foundation truth are scored
  independently
- section candidate ranking penalizes cuts that still lack construction depth
- section SVG output exposes construction-truth metadata for downstream scoring
  and gating
- A1 regression, technical credibility, publishability, and route contracts now
  surface `sectionConstructionTruthQuality`

## What is deterministic now

- direct cut wall truth uses the existing clipped wall primitives
- direct cut opening truth depends on a compatible wall cut, not a free-floating
  opening marker
- stair truth depends on direct or near-cut stair geometry
- slab, roof, and foundation truth are classified explicitly instead of being
  hidden inside generic section usefulness
- drafting-grade section markup reuses the same construction-truth summary that
  scoring and gating consume

## What is still heuristic

- the clipping path is still lightweight geometric clipping, not full solid-model
  boolean sectioning
- roof and foundation truth still fall back to derived/contextual support when
  canonical primitives are incomplete
- section graphics are materially stronger, but they are still schematic SVG
  drafting rather than CAD-grade detail generation

## Main new services

- `sectionConstructionSemanticService.js`
- `sectionConstructionGeometryService.js`
- `sectionLineweightService.js`
- `sectionWallDetailService.js`
- `sectionOpeningDetailService.js`
- `sectionStairDetailService.js`
- `sectionRoofTruthService.js`
- `sectionSlabTruthService.js`
- `sectionFoundationTruthService.js`

## Public contract impact

The existing hardened Phase 1 to 13 contracts were preserved.

Phase 14 adds one new public readiness concept:

- `sectionConstructionTruthQuality`

This now appears in:

- readiness response shaping
- panel planning response shaping
- project health response shaping
- canonical verification bundle alignment

Backward compatibility fields remain in place.

## What Phase 15 should solve next

Highest-value next work:

1. true solid-model section clipping instead of lightweight segment/polygon logic
2. richer roof and foundation construction primitives in canonical geometry
3. more detailed drafting conventions for wall build-ups, glazing detail, and
   stair/landing depiction
