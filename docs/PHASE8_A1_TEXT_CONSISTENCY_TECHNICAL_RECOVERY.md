# Phase 8 A1 Text, Consistency, and Technical Recovery

## Scope

Phase 8 hardens the A1 presentation pipeline around four visible failure modes:

- unreliable final-sheet text rendering
- weak 2D to 3D identity consistency
- faint or incomplete deterministic technical drawings
- compose-time acceptance of weak technical panels

This phase keeps canonical geometry as the source of truth. It does not replace technical drawings with image generation.

## What Was Fixed

### 1. Final-sheet font embedding

- The main final A1 sheet SVG is now passed through `embedFontInSVG()` before rasterization.
- Incoming SVG payloads in `api/a1/compose.js` are defensively font-embedded before conversion.
- Bundled local fonts were added under `public/fonts/`.
- The root A1 SVG stack now standardizes to an embedded-safe family:
  - `ArchiAISans`
  - `DejaVu Sans`
  - `Segoe UI`
  - `Arial`
  - `Helvetica`
  - `sans-serif`
- Bold and regular font faces are explicitly available for title, heading, label, and body use.

### 2. Canonical material and facade identity SSOT

- A canonical material palette is now derived from DNA, geometry, and facade grammar.
- The same material/facade identity feeds:
  - hero visual prompt construction
  - elevation rendering
  - material spec / swatch output
- A shared design fingerprint and hero identity spec are built before visual generation.
- Hero prompt assembly now carries roof language, storey count, window rhythm, entrance position, massing language, and canonical material data.

### 3. Stronger deterministic technical drawings

- Plan renderer now adds richer deterministic content when geometry supports it:
  - room polygons
  - uppercase room names
  - room areas
  - door swings
  - clearer window markup
  - external dimensions
  - grid bubbles
  - furniture hints
  - north arrow / title / scale metadata
- Elevation renderer now uses facade grammar and canonical materials for:
  - bay rhythm
  - roof profile
  - sill / lintel language
  - datums / FFL markers
  - material zone articulation
  - facade feature propagation
- Section renderer now emphasizes:
  - cut rooms
  - datums
  - slab logic
  - foundation reference
  - stair treads
  - roof profile

### 4. Honest technical gating

- Weak technical panels are now scored more rigorously for readability, annotation completeness, geometry completeness, and drawing-specific richness.
- Compose-time gating distinguishes:
  - `pass`
  - `warning`
  - `block`
- Weak or stale technical panels are no longer allowed to pass silently as credible A1 content.
- Hero-vs-canonical consistency drift is checked through deterministic metadata, not overclaimed image understanding.

## New Guarantees

Phase 8 now guarantees the following when the relevant feature flags are enabled:

- final A1 SVG output is font-embedded before rasterization
- font readiness state is exposed to backend readiness/health surfaces
- hero prompt identity is built from canonical geometry/facade/material data
- plan rendering fails honestly when room geometry is too incomplete
- weak technical panels can block compose readiness
- hero/canonical metadata drift can surface warnings or blockers before finalization

## Still Heuristic

The following remain heuristic or best-effort:

- exact browser-to-browser text rasterization parity
- visual similarity between rendered hero imagery and technical truth
- semantic richness when geometry is sparse or underspecified
- full facade feature propagation when source geometry omits the needed metadata
- section usefulness when no meaningful cut path exists through rooms or circulation

## Backend Rendering Limits

The backend can guarantee:

- embedded font payload injection into SVG
- stable font-family and font-weight declarations in generated A1 SVG
- deterministic technical drawing generation from canonical geometry
- honest blocking when geometry or technical quality is insufficient

The backend cannot guarantee:

- identical glyph rasterization across every browser, OS, and SVG renderer
- perfect image-level agreement between AI hero imagery and deterministic geometry
- technical richness that is not actually supported by the canonical model

## Phase 9 Next

Recommended Phase 9 work:

- improve canonical facade feature coverage so more elevations can pass without fallback warnings
- add deeper section selection semantics for multi-core and multi-wing buildings
- add reference-sheet regression fixtures and lightweight visual diffs for A1 label zones
- tighten east/west elevation completeness logic where side-wall semantics are still sparse
- expand readiness explanations so blocked panels explain exactly which source geometry fields are missing
