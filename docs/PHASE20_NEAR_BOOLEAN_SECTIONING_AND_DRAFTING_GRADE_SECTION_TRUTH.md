# Phase 20: Near-Boolean Sectioning And Drafting-Grade Section Truth

## What changed

Phase 20 pushes the section pipeline closer to near-boolean cut reasoning without pretending full CAD-grade solid boolean sectioning where canonical primitives are incomplete.

The main backend additions are:

- a shared cut-band geometry service for denser deterministic sampling
- richer clip metadata such as band coverage, near-boolean clip counts, and exact profile hit counts
- a centralized section-truth model that classifies direct, contextual, derived, and unsupported construction truth
- stronger section ranking driven by actual cut-construction value
- truth-aware section renderer metadata and drafting detail styling

## How near-boolean sectioning works

For supported primitives, the section clipper now:

- builds a direct cut band and a wider contextual band around the selected section line
- samples that band more densely than the earlier lightweight clipping path
- measures how much of the band is actually supported by clipped profile segments
- records exact clip counts, profile clip counts, profile hit counts, and band coverage

This is still deterministic geometric reasoning, not full solid-model boolean sectioning. When upstream canonical primitives are thin, the system degrades honestly to contextual or derived truth instead of overclaiming direct section truth.

## Direct vs contextual vs derived truth

The centralized section-truth model now normalizes section truth into four states:

- `direct`: exact clipped construction support exists
- `contextual`: the cut is near useful geometry, but not strongly clipped enough to claim direct truth
- `derived`: truth still depends on profile fallback or indirect support
- `unsupported`: canonical cut support is missing

This model is built in `sectionTruthModel.js` and is propagated into:

- section evidence summaries
- section candidate scoring
- section renderer metadata
- technical panel scoring
- A1 technical regression
- A1 verification bundle
- readiness, planning, and health route responses

## Drafting-grade section graphics changes

Section graphics remain deterministic and truth-aware.

Phase 20 strengthens:

- cut wall poche and direct-vs-contextual visual distinction
- opening detail emphasis when cut truth is stronger
- stair detail strength from stronger cut truth
- roof and foundation metadata propagation into the final section SVG
- section metadata needed for downstream credibility checks

Explicit truth is rendered more strongly. Contextual or derived truth remains visibly weaker and should not imply unsupported construction detail.

## Section ranking changes

Section ranking now leans more on actual cut-construction value and less on generic scene richness.

The ranking now gives more weight to:

- centralized direct truth score
- near-boolean clip count
- band coverage ratio
- direct wall, opening, stair, slab, roof, and foundation truth

It penalizes:

- high contextual burden
- high derived burden
- weak cut-wall or cut-slab direct truth
- sections that are communicative only through broad context rather than cut truth

## What is now guaranteed

- Phase 20 does not silently upgrade contextual or derived cut truth into direct truth.
- The same section-truth model is reused across evidence, ranking, rendering, technical scoring, and route exposure.
- Route responses can expose contextual and derived section evidence explicitly through the canonical verification bundle and top-level compatibility fields.
- Technical section gating can now react to thinner exact cut truth instead of relying only on broad section presence.

## What remains heuristic

- Sectioning is still lightweight geometric reasoning rather than full solid-model boolean sectioning.
- Roof and foundation truth still degrade quickly when upstream canonical primitives are thin.
- Section graphics are stronger and more honest, but still schematic rather than full CAD-grade construction documentation.

## Phase 21 priority

Phase 21 should focus on deeper true geometric section clipping from richer upstream construction primitives, not on adding more downstream scoring layers.

The next highest-value work is:

- better true geometric clipping for supported section primitives
- richer explicit roof and foundation primitives where canonical inputs are still thin
- stronger drafting graphics driven by exact cut geometry rather than interpreted fallback
