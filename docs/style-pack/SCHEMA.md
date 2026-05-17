# Style Pack Schema

`src/schemas/stylePack.schema.json` locks Style Pack v1 at `1.0.0`.

The pack is deterministic portfolio evidence for upstream ProjectGraph inputs:

- `windowToWallRatio`: overall and N/S/E/W facade aperture targets.
- `roofPitchDistribution`: normalized flat/low/medium/steep evidence with a dominant bucket.
- `openingRhythm`: bay module, repetition type, and sill height.
- `materialFamilies`: primary, secondary, and accent material tokens.
- `massingTendency`: massing form, floor-count range, and footprint aspect-ratio range.
- `facadeModule`: bay spacing and floor-to-floor height in millimetres.
- `layout_archetype`: optional existing ProjectGraph/local-style archetype key.
- `provenance`: source filenames, deterministic extraction timestamp, extractor version, confidence, seed, and evidence breadcrumbs.

The Style Pack hash is computed from stable JSON with sorted keys and excludes `provenance.extractedAt`.
