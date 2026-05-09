# Local Style + Portfolio Blending Roadmap

## Status

`StyleBlendManifest` is the ProjectGraph production authority for style blend
evidence, weights, resolved material palette, rejected influences, and QA.

The manifest is deterministic: identical inputs produce the same
`manifestHash`. It is auditable: local, climate, user, jurisdiction, and
portfolio evidence remain visible with source gaps and rejected influences.

## Authority Rules

Style blending must never override the ProjectGraph production authority chain:

1. safety and statutory constraints
2. programme and accessibility
3. climate and passive-performance suitability
4. local planning, jurisdiction, and context
5. user style preference
6. portfolio and graphic presentation identity

Technical drawings remain deterministic SVG/CAD outputs from ProjectGraph /
compiled geometry. Image2 panels are presentation renders only and must carry
the same geometry, visual, and style blend hashes.

## Runtime Integration

- `src/services/style/localStylePack.js` remains the local/material evidence
  base and provides the 40/25/20/15 default blend.
- `src/services/style/styleBlendManifestService.js` wraps local, climate, user,
  jurisdiction, and portfolio evidence into the single audited production
  manifest.
- `src/services/render/visualManifestService.js` consumes the style blend hash
  and rejected-influence summary for image2 prompt locks.
- `src/services/dnaPromptContext.js` consumes the resolved palette so A1 data
  panels and key notes use the same source as visual prompts.
- `src/services/ai/adaptiveStyleTransfer.js` is legacy for the older
  panel-generation path and is not the ProjectGraph production authority.

## Data Gaps

- UK evidence is strongest when a UK vernacular pack resolves.
- France and Algeria use deterministic jurisdiction/local-style defaults until
  richer local datasets are connected.
- Missing portfolio inputs produce explicit empty portfolio evidence and
  redistribute portfolio weight; no portfolio identity is invented.
- Missing jurisdiction/local evidence is recorded as a source gap instead of
  being hallucinated.

## QA Expectations

- `styleBlendManifestHash` must match across `StyleBlendManifest`,
  `visualManifest`, SheetDesignContext, A1 metadata, and image2 panel metadata.
- Rejected influences must not appear as allowed prompt direction.
- Portfolio influence must be zero when no portfolio evidence exists.
- Heritage/local context, overheating risk, programme typology, and statutory
  blockers must reject incompatible lower-priority style influences.
