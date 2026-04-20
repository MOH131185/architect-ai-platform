# Phase 10 Verification Evidence And Publishability

Phase 10 was strengthened to make final-sheet credibility less dependent on broad heuristics and more dependent on explicit evidence.

## What Changed

- Sections now carry cut-specific evidence instead of relying mainly on project-wide room, wall, stair, and window presence.
- Side-facade semantics now expose richer summary fields, including opening density, material articulation, feature richness, roof communication, and semantic confidence.
- Rendered text verification now distinguishes between provisional SVG evidence and verified post-compose rendered evidence.
- Final-sheet regression, technical credibility, and publishability now expose a shared verification-state model.
- Readiness, panel planning, and project-health responses now surface a top-level `verificationState` bundle.

## Section Evidence Guarantees

`sectionEvidenceService` now evaluates a candidate section from the actual cut line.

It records:

- cut rooms
- cut stairs
- cut walls
- cut openings
- entrance hits
- circulation hits
- focus-entity hits
- direct vs inferred evidence counts
- section usefulness
- evidence quality (`pass`, `warning`, `block`)

This means a section can fail honestly when the chosen cut does not cross meaningful geometry, even if the project itself contains valid rooms or stairs elsewhere.

## Side-Facade Semantic Guarantees

`facadeSemanticAssembler` and `sideFacadeExtractor` now provide stronger side summaries:

- `openingDensity`
- `openingRhythmStrength`
- `materialArticulationScore`
- `featureRichnessScore`
- `roofCommunicationScore`
- `semanticConfidence`
- `semanticStatus`

These values are still deterministic summaries of canonical geometry and facade grammar. They are not image-derived truth.

## Verification State Model

Every major Phase 10 verification stage can now expose a normalized verification state:

- `phase`: `pre_compose` or `post_compose`
- `verified`: true only for post-compose evidence
- `provisional`: true for pre-compose evidence
- `normalizedStatus`: `pass`, `warning`, or `block`
- `evidenceStrength`: `strong`, `moderate`, or `weak`

This prevents pre-compose warnings from being confused with final rendered proof.

## Publishability

Publishability remains strict, but it is now clearer:

- pre-compose publishability is provisional
- post-compose publishability is verified
- hard publishability blocking should come from verified evidence

## Remaining Limits

- Rendered text verification is still heuristic. It uses SVG text evidence plus raster-region variance, not OCR.
- Section evidence is now cut-specific, but it still depends on the quality of canonical room, stair, wall, and opening geometry.
- Side-facade semantics still depend on upstream facade grammar richness. They do not invent missing facade truth.

## Expected Follow-Up For Phase 11

- OCR-grade rendered text verification or another direct text-region proof layer
- richer upstream side-facade schema extraction
- more specialized section strategies tied to building archetype and circulation logic
