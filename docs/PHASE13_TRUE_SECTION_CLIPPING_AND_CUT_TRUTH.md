## Phase 13

Phase 13 strengthens ArchiAI's section pipeline around true cut truth.

### What changed

- Section evidence now separates exact cut evidence from contextual or inferred support.
- Rooms, stairs, walls, openings, slabs, and roof elements can contribute `direct`, `near`, `inferred`, or `unsupported` section evidence.
- Broad bbox overlap is no longer allowed to overclaim `direct` cut truth.
- Section candidate ranking now prefers exact cut communication value over generic proximity.
- Section graphics can render clipped walls and cut openings when true clipping is enabled.
- Technical scoring, A1 readiness, technical credibility, and publishability now carry:
  - `sectionDirectEvidenceQuality`
  - `sectionInferredEvidenceQuality`

### New feature flags

- `useTrueSectionClippingPhase13`
- `useClippedSectionGraphicsPhase13`
- `useSectionTruthScoringPhase13`
- `useSectionCredibilityGatePhase13`

These default to enabled in the current Phase 13 branch, but the implementation remains flag-aware so the Phase 1 to 12 flow shape is preserved.

### What is now guaranteed

- A section cut only receives `direct` evidence when the cut intersects canonical geometry through segment, polygon, or point-derived clipping logic.
- If only bbox or derived profile support exists, the evidence is downgraded to `near`, `inferred`, or `unsupported`.
- Weak direct section truth can block technical scoring and propagate into A1 readiness and publishability.
- Route responses expose section truth explicitly through the canonical verification bundle and compatibility aliases.

### What remains heuristic

- Section truth is still based on lightweight clipping primitives, not full solid-model boolean clipping.
- Derived slab and roof profiles remain fallback evidence when canonical slab or roof geometry is incomplete.
- Section graphics are stronger, but still constrained by the completeness of upstream canonical geometry.

### Public contract impact

The following response surfaces now expose section truth:

- `POST /api/models/project-readiness`
- `POST /api/models/plan-a1-panels`
- `POST /api/models/project-health`

Relevant fields:

- `sectionEvidenceQuality`
- `sectionDirectEvidenceQuality`
- `sectionInferredEvidenceQuality`
- `sectionCandidateQuality`
- `sectionStrategyRationale`
- `verification`
- `verificationBundle`
- `verificationState`

### Phase 14 recommendation

The next high-value step is true geometric section clipping beyond lightweight polygon and segment intersection, followed by stronger rendered-text proof and upstream facade/schema enrichment so fewer quality decisions depend on inference.
