# Phase 10 Final Sheet Credibility And Regression

Phase 10 strengthens the existing deterministic A1 pipeline without replacing it.

## What Changed

- Side-facade extraction now exposes richer deterministic semantics before rendering:
  opening groups, wall zones, roof-edge transitions, and grouped facade feature families.
- Section selection now uses specialized deterministic strategies instead of relying only on generic centerline cuts.
- Final-sheet regression now compares the board against lightweight known-good fixture expectations.
- Rendered text verification now checks panel-header and title-block zones using SVG text evidence first and raster-region variance when a composed buffer exists.
- Readiness and health routes now expose rendered text status, section strategy rationale, technical credibility, and publishability.
- Compose can now run post-compose verification and classify a board as `publishable`, `reviewable`, or `blocked`.

## What Is Guaranteed

- Canonical geometry remains the source of truth for plan, elevation, and section generation.
- Weak east or west elevations are surfaced more explicitly through richer side-facade semantics and final-sheet regression.
- Section candidates expose chosen strategy, rejected alternatives, and semantic rationale.
- Final-sheet verification can use composed-board evidence when available instead of depending only on upstream metadata.
- Publishability is not claimed when final-board blockers remain.

## What Remains Heuristic

- Rendered text verification does not use OCR. It relies on SVG text payloads, zone occupancy, expected-label presence, and raster variance.
- Regression fixtures are lightweight tolerance checks, not strict pixel-perfect snapshots.
- Section strategy selection is deterministic but still heuristic because canonical geometry may not fully describe every architectural intent.

## Limits

- If no final composed SVG or raster buffer is available, the system falls back to weaker pre-compose evidence.
- Sparse upstream facade or section geometry still results in honest warnings or blockers rather than synthetic detail.
- Publishability classification is only as strong as the resolved technical drawings and available composed-board evidence.

## Phase 11 Direction

- Add reference-quality raster fixtures for a broader range of sheet layouts.
- Improve side-facade extraction from richer canonical wall/opening schemas upstream.
- Expand section strategies for asymmetric and multi-volume building types.
- Tighten title-block and legend verification using stronger structural zone maps.
