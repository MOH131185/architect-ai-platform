# Phase 9 Technical Sheet Fidelity

Phase 9 closes the remaining visible A1 technical-credibility gap without replacing the geometry-first pipeline.

## What Changed

- Added canonical side-facade extraction so east and west elevations are driven by side-specific geometry, projected openings, facade grammar, and normalized facade features instead of broad envelope assumptions alone.
- Upgraded elevation rendering to consume side-facade status, semantic readability, and explicit side coverage before a panel is allowed into final A1 composition.
- Upgraded section planning with candidate scoring for stair alignment, room coverage, circulation narrative, and entrance alignment.
- Upgraded section output with semantic candidate metadata and deterministic annotation overlays so a cut explains why it exists.
- Added fragment-level technical scoring, per-side elevation status, and section-candidate quality to the A1 readiness payload.
- Added final-sheet regression checks that combine:
  - technical panel regression
  - text/font sanity
  - expected label-zone presence when a final sheet SVG is available

## What Is Now Guaranteed

- East and west elevation blockers are explicit and deterministic.
- Weak side elevations no longer pass silently as if they were credible technical drawings.
- Section candidates carry semantic quality data instead of only a simple ordered list.
- Final readiness routes expose:
  - `finalSheetRegression`
  - `perSideElevationStatus`
  - `sectionCandidateQuality`
  - `technicalFragmentScores`
- Compose can optionally enforce pre-compose regression verification when the caller supplies Phase 9 readiness context.

## What Remains Heuristic

- Final-sheet text-zone sanity is strongest when the actual final sheet SVG is available. Without it, checks fall back to pre-compose font readiness and expected-label coverage.
- Elevation richness still depends on how much facade grammar and canonical side geometry exist. Phase 9 blocks thin sides honestly; it does not fabricate architectural detail.
- Section usefulness scoring is deterministic but still heuristic. It ranks cuts by likely communicative value rather than claiming full architectural understanding.

## Browser / Serverless Text Rendering Reality

- Bundled font embedding remains the main protection against missing system fonts.
- Phase 9 adds stronger verification around text readiness and embedded-font presence.
- It still cannot guarantee identical raster text output across every Sharp/librsvg/serverless revision. It can only fail closed when the evidence is weak.

## Recommended Phase 10 Direction

- Add reference-sheet regression fixtures for known label zones and known side-elevation richness targets.
- Add stronger section-type specialization for stair/core cuts versus room-sequence cuts.
- Add more explicit facade-side geometry fragments upstream so east/west articulation depends less on inferred envelope coverage.
