# Phase 11 Evidence-Driven Verification

## What Phase 11 Adds

Phase 11 hardens the A1 technical verification path around four backend gaps that remained after Phase 10:

- section evidence should come from cut-specific geometry, not only bbox-level proximity
- rendered text verification should support OCR-backed evidence when an OCR engine is available
- side-facade credibility should come from a richer schema, not only renderer metadata
- readiness, publishability, and post-compose verification should share one verification bundle model

The implementation preserves the existing A1 and Together flows. New behavior is layered behind Phase 11 feature flags and falls back honestly when stronger evidence is unavailable.

## New Guarantees

- `buildSectionEvidence(...)` now uses `sectionGeometryIntersectionService` when Phase 11 section evidence is enabled.
- Section evidence distinguishes `direct`, `near`, and `inferred` evidence for rooms, stairs, walls, openings, entrances, slabs, and roof elements.
- Hosted openings can no longer outrank their wall geometry. A wall-hosted opening is only treated as direct if the host wall is also cut directly.
- `extractSideFacade(...)` can now emit a side-facade schema with grouped openings, wall zones, roof edges, material zones, feature families, and schema credibility.
- Rendered text verification can use OCR through an injected adapter or an optional runtime OCR dependency. If OCR is unavailable, the result remains explicit about being provisional rather than pretending to be verified.
- `verificationBundle` is now a first-class response field alongside the legacy `verificationState`, so callers can distinguish provisional pre-compose evidence from decisive post-compose verification.

## Evidence Model

### Section Evidence

Section evidence now carries:

- `sectionIntersections.version = "phase11-section-geometry-intersection-v1"`
- direct / near / inferred intersection buckets
- `geometrySupport` signals so downstream services can see whether evidence came from segments, points, bboxes, or derived profiles
- compatibility summaries like `cutRoomCount`, `nearOpeningCount`, `directSlabCount`, and `geometrySupportLimited`

This is still deterministic geometry reasoning, not image-based guessing.

### Rendered Text Evidence

Rendered text verification now distinguishes:

- strong rendered evidence from SVG text plus raster-region support
- OCR-confirmed evidence when an OCR engine is available
- provisional evidence when OCR is unavailable or too weak

`ocrEvidenceQuality` is additive. The backend does not treat missing OCR as a failure by itself.

### Side-Facade Evidence

Side facades now expose schema-backed evidence quality that can be consumed by:

- elevation rendering
- technical panel regression
- final-sheet regression
- technical credibility
- publishability

This allows east/west elevation credibility to be reported from canonical side data instead of only from downstream panel scores.

## Route Contract Changes

The following response families now expose a consistent Phase 11 evidence surface:

- `POST /api/models/project-readiness`
- `POST /api/models/plan-a1-panels`
- `POST /api/models/project-health`

Responses now include:

- `renderedTextEvidenceQuality`
- `sideFacadeEvidenceQuality`
- `sectionEvidenceQuality`
- `verificationBundle`

`verificationState` is still returned for backward compatibility.

## What Is Still Heuristic

- Section evidence still depends partly on bbox/derived support when canonical primitives are incomplete.
- OCR is optional. If `tesseract.js` or an injected adapter is unavailable, rendered text verification stays provisional.
- Side-facade schema credibility still depends on upstream wall/facade metadata quality.

## What Phase 11 Does Not Claim

- It does not claim full geometric clipping of every section element.
- It does not claim OCR proof when OCR did not run.
- It does not fabricate facade detail that is absent from canonical geometry and facade grammar.

## Suggested Phase 12 Direction

- true geometric clipping or richer section solids for section evidence
- stronger OCR integration or another deterministic rendered-text proof layer
- richer canonical side-facade upstream schema so east/west elevations rely less on inferred grouping
- consolidation of `verificationState` and `verificationBundle` into one canonical public contract once compatibility debt can be retired
