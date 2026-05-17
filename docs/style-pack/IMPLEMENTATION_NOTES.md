# Implementation Notes

- `// PLAN-AMBIGUITY:` `PLAN.md` says `portfolio_style_pack_hash` is audit-only, while the implementation prompt marks Style Pack hash inclusion in the `geometryHash` input set as a hard rule. The implementation includes the hash only when a pack exists, preserving the no-portfolio hash.
- `// PLAN-AMBIGUITY:` `extractedAt` is schema-required, but the Style Pack JSON must be deterministic. v1 uses a stable timestamp, and the hash also excludes `provenance.extractedAt`.
- `// PLAN-AMBIGUITY:` null Style Pack audit fields would change no-portfolio outputs. v1 emits pack audit fields only when a pack exists.
- `// PLAN-AMBIGUITY:` the current option generator only emits rectangular footprints, so non-rectangular Style Pack massing forms are represented by deterministic aspect-aligned rectangular proxy options.
