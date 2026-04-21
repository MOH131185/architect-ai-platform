# Phase 19: Richer Section Clipping And Drafting-Grade Section Truth

Phase 19 deepens the section pipeline without replacing the geometry-first backend.

## What changed

- The section clipper now emits richer clip-profile evidence instead of reducing exact clipping to a single count.
- Section evidence now carries Phase 19 fields for:
  - `exactConstructionProfileClipCount`
  - `constructionProfileSegmentCount`
  - `directConstructionProfileHitCount`
  - `sectionProfileComplexityScore`
  - `sectionDraftingEvidenceScore`
  - `wallSectionClipQuality`
  - `openingSectionClipQuality`
  - `stairSectionClipQuality`
  - `slabSectionClipQuality`
  - `roofSectionClipQuality`
  - `foundationSectionClipQuality`
- Section ranking now prefers candidates with stronger clipped construction truth and richer profile evidence.
- Section SVG metadata, A1 technical regression, technical credibility, publishability, and route contracts now expose the same Phase 19 section-clip fields.

## What is now guaranteed

- Direct section-construction quality is no longer inferred only from broad construction buckets when richer clip-profile evidence exists.
- Route responses expose the canonical Phase 19 section-clip qualities through both `verification` and top-level compatibility fields.
- Weak wall-clip truth can now block a section even when broader section evidence still looks passable.

## What is still heuristic

- This is still lightweight geometric section clipping, not full solid-model boolean sectioning.
- Drafting-grade graphics are improved, but still schematic rather than CAD-grade construction drafting.
- Roof and foundation clip truth still degrade when upstream canonical geometry is thin or mostly derived.

## Safe flags

- `useDeeperSectionClippingPhase19`
- `useDraftingGradeSectionGraphicsPhase19`
- `useConstructionTruthDrivenSectionRankingPhase19`
- `useSectionConstructionCredibilityGatePhase19`

## Next step

Phase 20 should deepen the actual clipping geometry again before adding more scoring or gating layers.
