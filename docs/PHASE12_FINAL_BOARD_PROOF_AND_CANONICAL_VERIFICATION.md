# Phase 12: Final Board Proof And Canonical Verification

## What Phase 12 changed

Phase 12 shifts the A1 verification stack from mostly score aggregation toward stronger evidence quality and final-board proof.

The main backend upgrades are:

- richer cut-specific section evidence with explicit `unsupported` geometry tracking
- stronger rendered-text proof with OCR as an optional verifier instead of the only post-compose path
- richer side-facade schema evidence from canonical wall, feature, and material-zone inputs
- one canonical public `verification` object exposed alongside the older compatibility aliases
- more evidence-driven publishability and post-compose verification output

## What is now guaranteed

- Section evidence can distinguish `direct`, `near`, `inferred`, and `unsupported` cut evidence.
- Weak cuts with little direct architectural communication are penalized more aggressively in section candidate scoring.
- Final-board text verification can use OCR when available, but it can still mark post-compose label zones as verified from strong rendered evidence when OCR is unavailable.
- Side-facade extraction can expose richer orientation aliases and schema evidence sources before elevation rendering.
- Readiness-style routes now expose a canonical `verification` payload while preserving `verificationBundle` and `verificationState` for compatibility.

## What is still heuristic

- Section evidence is still hybrid. It uses polygon and segment-aware logic where possible, but it is not full solid-model clipping.
- OCR remains optional and runtime-dependent. If no OCR adapter or OCR library is available, rendered-text verification falls back to SVG and raster evidence.
- Side-facade schema quality is still bounded by upstream canonical wall and facade metadata quality.

## Public verification model

Phase 12 standardizes on a canonical `verification` object with:

- `phase`
- `postComposeVerified`
- `provisional`
- `decisive`
- `overallStatus`
- `overallDecision`
- `publishabilityDecision`
- `renderedTextEvidenceQuality`
- `sectionEvidenceQuality`
- `sideFacadeEvidenceQuality`
- `ocrEvidenceQuality`
- `components`

Compatibility aliases remain:

- `verificationBundle`
- `verificationState`

These aliases intentionally remain available so existing A1 / Together consumers do not break.

## Publishability behavior

Publishability is still fail-closed, but it now carries a clearer evidence profile:

- `renderedTextEvidenceQuality`
- `sectionEvidenceQuality`
- `sideFacadeEvidenceQuality`

`finalDecision` remains provisional unless the verification phase is `post_compose`.

## Phase 13 should prioritize

- stronger geometric clipping for sections instead of mixed primitive inference
- better OCR-backed proof or equivalent rendered-text validation
- richer canonical side-facade source schema upstream so fewer elevations depend on inferred articulation
- eventual consolidation of `verification`, `verificationBundle`, and `verificationState` into one public model after compatibility pressure drops
