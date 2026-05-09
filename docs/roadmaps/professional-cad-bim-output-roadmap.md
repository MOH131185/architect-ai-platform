# Professional CAD/BIM Output Roadmap

## Purpose

Architect AI Platform should move from a ProjectGraph A1 concept-sheet system
to a professional production-output pipeline. The production source of truth
remains ProjectGraph / CompiledProject geometry. SVG, PDF, A1 boards, and image
renders are export or presentation views. CAD/BIM geometry is the professional
deliverable authority.

This roadmap must be implemented as separate PRs. Do not collapse the work into
one large change. Each PR should preserve the existing technical-panel authority
contracts and should fail closed when geometry provenance is missing.

## Current baseline

- Project generation routes through the ProjectGraph vertical slice.
- Technical panels are deterministic SVG and carry geometry authority metadata.
- Image2 panels are presentation-only geometry-locked renders.
- DXF export routes through `CanonicalDrawingModel -> canonicalDxfExporter`.
- Canonical CAD export now carries model space, paper-space-marked sheets,
  title blocks, blocks, true DXF dimensions, geometry hashes, and source
  ProjectGraph hashes.
- The native AutoCAD layout fidelity slice implements deterministic DXF
  `0/VIEWPORT` entities with `AcDbViewport` records, per-sheet `AcDbLayout`
  records, `AcDbPlotSettings` records, layout dictionary entries,
  deterministic layout/viewport handles and owner references, CAD QA checks for
  native layouts/viewports/plot settings/plot-style metadata, and the CTB
  plot-style metadata reference `archiai-monochrome.ctb`.
- DWG remains conversion-only and unavailable unless a real converter is
  configured. DXF is the guaranteed CAD output.
- Structural CAD/BIM output is opt-in behind `STRUCTURAL_DRAWINGS_ENABLED` or
  an explicit `includeStructuralDrawings` option. Default architectural DXF
  exports remain non-structural.
- MEP CAD/BIM output is opt-in behind `MEP_DRAWINGS_ENABLED` or an explicit
  `includeMepDrawings` option. All MEP output remains preliminary and requires
  qualified MEP engineer review.
- Construction detail sheets are opt-in behind `DETAIL_DRAWINGS_ENABLED` or an
  explicit `includeDetailDrawings` option. Details are preliminary and require
  responsible architect/engineer review.
- Versioned UK, France, Algeria, and declared generic advisory jurisdiction
  packs are implemented as data-driven metadata for labels, CAD preferences,
  local style defaults, climate assumptions, advisory checklists, and review
  disclaimers.
- The professional deliverable package system now includes deterministic
  manifest/ZIP generation, API/download wiring, deterministic PDF stitching from
  existing generated PDFs, provider-neutral package storage, capability-based
  signed download URLs, and package history metadata. `packageHash` remains
  deterministic package evidence; history timestamps are operational metadata
  and do not feed back into the package hash.

## Non-negotiable authority rules

- Do not weaken existing ProjectGraph, compiled-project, A1, or technical-panel
  gates.
- Do not route technical drawings through image generation.
- Do not allow text-only image generation for project visual panels.
- Do not treat DWG as available unless a real conversion provider is configured.
- Do not hardcode jurisdiction or regulation logic inside renderers.
- Do not return huge base64 payloads from the main project-generation API.

## PR 1: Professional CAD/BIM roadmap and CanonicalDrawingModel contract

Add a CanonicalDrawingModel / CADModel contract derived from CompiledProject.

Deliverables:

- `CanonicalDrawingModel` plain JSON schema version.
- Model-space entities.
- Paper-space sheets and viewports.
- CAD layers, blocks, hatches, lineweights, linetypes, dimension styles, text
  styles, title blocks, drawing scales, sheet metadata, geometry hash, source
  ProjectGraph hash, jurisdiction, and units.
- Validator that fails closed on missing geometry hash, missing source hash,
  missing units, missing entities, missing sheets, missing required layers, and
  raster/image entities in technical drawings.
- Tests proving floor plans, elevations, and sections produce real vector CAD
  entities and that technical output reports `imageProviderUsed: "none"`.

Acceptance criteria:

- `CompiledProject -> CanonicalDrawingModel` works without image providers.
- Floor plan entities include wall, room, opening, and dimension geometry.
- Elevation and section views include line/polyline/hatch vector entities.
- The model carries `geometryHash` and `sourceProjectGraphHash`.
- Validation fails when authority metadata or vector-only guarantees are broken.

## PR 2: DXF/DWG-grade CAD export

Refactor DXF export to consume CanonicalDrawingModel.

Deliverables:

- LINE, LWPOLYLINE, HATCH, TEXT, MTEXT, DIMENSION, BLOCK, and INSERT emission.
- Architectural layers: `A-WALL`, `A-WALL-EXT`, `A-DOOR`, `A-WINDOW`,
  `A-STAIR`, `A-ROOM`, `A-DIMS`, `A-TEXT`, `A-HATCH`, `A-SITE`, `A-TITLE`.
- Structural layers: `S-FOUNDATION`, `S-COLUMN`, `S-BEAM`, `S-SLAB`, `S-ROOF`,
  `S-GRID`, `S-NOTES`.
- MEP layers: `M-DUCT`, `M-PIPE`, `P-DRAIN`, `E-LIGHT`, `E-POWER`,
  `E-SWITCH`, `F-FIRE`.
- Deterministic paper-space-marked layout entities, model-space geometry,
  dimensions, title blocks, blocks, and hatches.
- Native DXF `VIEWPORT` entities with `AcDbViewport` records for sheet
  viewports.
- `AcDbLayout` and `AcDbPlotSettings` records in `OBJECTS`.
- Layout dictionary entries, deterministic handles, owner references, and
  page/plot setup metadata.
- CAD QA checks for native layouts, native viewports, plot settings, and
  plot-style metadata.
- CTB plot-style mapping metadata emitted as a deterministic DXF metadata
  reference using `archiai-monochrome.ctb`. No binary `.ctb` file is generated
  yet.
- Documented DWG conversion adapter seam for ODA File Converter, ODA SDK, or
  Autodesk APS. DXF remains the guaranteed output.

Known limitations after this PR:

- Ownership references are improved, but the export is not yet a complete
  AutoCAD-grade `BLOCK_RECORD` / table ownership graph across every DXF table.
- Plot/page setup metadata is emitted deterministically, but still needs manual
  validation in AutoCAD, BricsCAD, or ODA Viewer.
- CTB metadata is emitted as a plot-style reference/metadata, not a generated
  `.ctb` binary file.
- DWG remains conversion-only and unavailable unless a real converter is
  configured.
- DXF is the guaranteed CAD output.
- The next CAD fidelity PR should validate the DXF in AutoCAD-compatible
  viewers, complete the layout/block ownership graph, add page setup
  dictionaries, generate or export CTB/STB sidecars, and harden advanced
  viewport properties.

Acceptance criteria:

- DXF contains expected layers, dimensions, title blocks, model-space entities,
  and paper-space layout metadata.
- DXF contains native `0/VIEWPORT` entities with `AcDbViewport` records for
  sheet viewports.
- DXF contains `AcDbLayout` and `AcDbPlotSettings` records with layout names,
  page setup metadata, and CTB plot-style references.
- DXF contains no rasterized technical drawings.
- Export fails when `geometryHash` is missing.

## PR 3: Structural model and drawings

Add deterministic `structuralModel` derived from ProjectGraph / CompiledProject.
This package is opt-in: structural drawings and structural CAD/DXF entities are
included only when `STRUCTURAL_DRAWINGS_ENABLED=true` or an explicit
`includeStructuralDrawings` option is passed. Existing architectural CAD/DXF
exports remain architectural-only by default.

Deliverables:

- Foundation plan, column/beam layout, slab/framing plan, roof framing,
  structural sections, structural notes, typical details, and quantity schedules.
- Deterministic preliminary engineering assumptions.
- Structural grid, member IDs, jurisdiction/design-standard metadata, and
  engineer-review-required status.
- DXF structural layers/entities (`S-FOUNDATION`, `S-COLUMN`, `S-BEAM`,
  `S-SLAB`, `S-ROOF`, `S-GRID`, `S-NOTES`, `S-DIMS`) when structural drawings
  are enabled.
- Structural outputs labelled preliminary with licensed structural engineer
  review required.

Acceptance criteria:

- Structural model includes foundations, slabs, beams, columns, and roof framing
  where applicable.
- Structural drawings export to SVG and DXF only when structural drawings are
  enabled.
- Default CanonicalDrawingModel/DXF export remains architectural-only and does
  not emit structural model data or `S-*` structural entities.
- Missing structural model blocks structural drawing export.
- Structural model and drawings carry deterministic hashes, no image-provider
  technical drawing path, and licensed structural engineer review disclaimers.

## PR 4: MEP model and drawings

Add deterministic `mepModel` derived from ProjectGraph / CompiledProject.
This package is opt-in: MEP drawing panels and MEP CAD/DXF entities are included
only when `MEP_DRAWINGS_ENABLED=true` or an explicit `includeMepDrawings` option
is passed. Existing architectural CAD/DXF exports remain non-MEP by default.
All MEP outputs are preliminary coordination information and require review by a
qualified MEP engineer before construction or permit use.

Deliverables:

- Electrical lighting plan, power/socket plan, plumbing supply plan,
  drainage/waste plan, HVAC/ventilation plan, riser/shaft plan, legends, and
  schedules.
- Fixture generation from room types.
- Deterministic preliminary routing and coordination notes derived from room
  geometry, wet rooms, kitchens, habitable rooms, corridors, and service cores
  where available.
- MEP symbols as deterministic SVG/CAD blocks.
- CAD/DXF MEP layers/entities (`E-LIGHT`, `E-POWER`, `E-SWITCH`, `E-DATA`,
  `P-WATER`, `P-DRAIN`, `P-SANITARY`, `M-DUCT`, `M-VENT`, `M-EQUIP`,
  `MEP-RISER`, `MEP-NOTES`, `MEP-DIMS`) when MEP drawings are enabled.
- Preliminary / qualified-MEP-engineer-review-required status.

Acceptance criteria:

- Wet rooms generate plumbing and drainage.
- Bedrooms, living rooms, and kitchens generate lighting and power layouts.
- MEP drawings export to deterministic SVG and DXF only when MEP drawings are
  enabled.
- Default CanonicalDrawingModel/DXF export remains architectural-only and does
  not emit MEP model data or MEP layers/entities.
- MEP model and drawings carry deterministic hashes, no image-provider technical
  drawing path, and qualified MEP engineer review disclaimers.

Current limitations after this slice:

- Preliminary coordination model only.
- No electrical circuit calculations, load schedules, cable sizing, protection
  discrimination, or circuit schedules.
- No pipe sizing, pressure/drop checks, pump sizing, drainage falls verification,
  or fixture unit calculations.
- No duct sizing, fan duty calculations, ventilation rate calculations, acoustic
  checks, or heat/cooling load calculations.
- No automated clash detection or construction-grade service coordination.
- No jurisdiction-specific MEP code compliance yet.
- DWG remains conversion-only and unavailable unless a real converter is
  configured; DXF remains the guaranteed CAD output.

Next MEP fidelity PR:

- Add engineer-reviewed sizing/calculation models, circuit schedules, pipe and
  duct sizing, pressure/drop checks, load schedules, and jurisdiction-specific
  MEP code checks.

## PR 5: Detail library

Add a deterministic construction detail library.
This package is opt-in: construction detail drawing panels and CAD/DXF detail
entities are included only when `DETAIL_DRAWINGS_ENABLED=true` or an explicit
`includeDetailDrawings` option is passed. Existing architectural, structural,
and MEP CAD/DXF exports remain unchanged by default. All details are
preliminary coordination information and require responsible architect/engineer
review before construction, tender, permit, or code-compliance use.

Deliverables:

- Foundation/wall, floor/wall, roof eaves, roof ridge, window head/sill/jamb,
  door threshold, stair, wet room, drainage inspection chamber, and MEP riser
  details.
- Vector CAD details only.
- 1:20, 1:10, and 1:5 detail scales.
- Material hatches and callout bubbles linked from plans/sections.

Acceptance criteria:

- Detail sheets contain expected details.
- Details export to deterministic SVG and DXF only when detail drawings are
  enabled.
- Default CanonicalDrawingModel/DXF export does not emit detail library data,
  detail sheets, detail callouts, or detail layers/entities.
- Detail library and detail sheets carry deterministic hashes, no image-provider
  technical drawing path, and architect/engineer review disclaimers.
- Detail QA requires required detail types, detail hashes, matching geometry
  hash, material hatches, dimensions, callouts, review disclaimer, and no false
  code-compliance or construction-approval claims.
- No image generation is used for details.

Current limitations after this slice:

- Preliminary construction-detail coordination library only.
- Details are not code-certified or approved for construction.
- No jurisdiction-specific construction detail packs yet.
- No fire/acoustic/thermal/waterproofing calculations or product-certified
  assembly data.
- No engineer-sealed structural connections, reinforcement, or fixings design.
- DWG remains conversion-only and unavailable unless a real converter is
  configured; DXF remains the guaranteed CAD output.

Next detail fidelity PR:

- Add jurisdiction-specific detail packs for UK, France, and Algeria with
  reviewable code assumptions, localized notations, and material/assembly
  variants.

## PR 6: Jurisdiction packs

Add versioned jurisdiction packs for UK, France, and Algeria.

Deliverables:

- `src/services/jurisdiction/`.
- `data/uk.json`, `data/france.json`, `data/algeria.json`, and a declared
  `data/generic.json` advisory fallback.
- Labels, title-block formats, CAD layer preferences, units/scales, climate
  defaults, planning/regulatory checklist metadata, preliminary structural/MEP
  assumptions, typical materials/hatches, and disclaimers.
- Jurisdiction resolver precedence: explicit brief jurisdiction, supplied
  country/country code, address/postcode inference, then declared generic
  fallback with source-gap warning.
- Jurisdiction pack metadata threaded into ProjectGraph drawing-set metadata,
  A1 title-block labels, CanonicalDrawingModel, DXF metadata, local style
  evidence, and structural/MEP/detail advisory disclaimers.

Acceptance criteria:

- UK, France, and Algeria briefs select the correct pack.
- France and Algeria can use French title-block labels where configured.
- Missing pack fails clearly or falls back only to a declared generic pack.
- CAD layer names remain DXF-safe ASCII by default; localized labels are
  metadata/title-block labels rather than renderer-hardcoded layer names.
- Outputs remain preliminary/advisory and do not claim legal/code compliance or
  construction approval.

Current limitations after this slice:

- Jurisdiction packs are preliminary advisory data, not official regulation
  databases.
- Planning/regulatory checklist metadata must be verified with the relevant
  local authority and licensed professionals.
- France and Algeria language support is first-pass deterministic metadata;
  full typography/language QA for every sheet and viewer remains future work.
- Algeria Arabic labels are exposed as Arabic-ready alternate metadata while
  French remains the default title-block label set for CAD safety.
- No authority-specific planning checks, official regulation ingestion, seismic
  design verification, fire strategy approval, or permit/construction approval
  is claimed.

Next jurisdiction fidelity PR:

- Add region-level packs, official regulation/source integration, language QA,
  authority-specific planning checks, and localized construction-detail
  variants for UK, France, and Algeria.

## PR 7: A1 and professional drawing sets

Add professional sheet-set generation.

Deliverables:

- A1 presentation package with site/context, plans, sections, elevations,
  axonometric, renders, material palette, and key notes.
- Technical set with cover sheet, site/location plan, GA plans, roof plan,
  elevations, sections, wall sections, details, structural drawings, MEP
  drawings, schedules, and notes.
- Sheet index, drawing numbers, revision, status, scale, paper size, north
  arrow, scale bars, title blocks, legends, and QA metadata.

Acceptance criteria:

- Multi-sheet technical drawing set exports PDF, SVG, and DXF.
- A1 presentation remains available.
- Title blocks use real project data.

## PR 8: QA and reliability gates

Add professional output gates.

Deliverables:

- CAD entity count and layer validation.
- No rasterized technical drawings.
- Lineweight/layer checks, dimension checks, scale checks, geometry-hash
  consistency, structural/MEP clash checks, jurisdiction selection, title-block
  completeness, and export proof for DXF, IFC, PDF, SVG, and A1.
- Visual semantic QA for image2 panels only.

Acceptance criteria:

- QA blocks missing dimensions, rasterized technical drawings, missing CAD
  layers, missing jurisdiction, stale title/location metadata, and blank
  PDF/DXF/SVG outputs.

## PR 9: Production artifact workflow

Add long-running professional export jobs.

Deliverables:

- Queue, artifact storage, job logs, per-stage status, retry policy, artifact
  manifest, and downloadable ZIP.
- ZIP contents: A1 PDF, technical drawing PDF, DXF, optional DWG, IFC, SVG/PNG
  previews, schedules workbook, and QA report.

Acceptance criteria:

- Main generation response returns lightweight artifact metadata and URLs, not
  huge base64 payloads.
- Each export stage has status, logs, retry metadata, and manifest entries.

Current package-delivery implementation:

- Phase 1 implemented deterministic artifact manifests and ZIP packaging using
  sorted entries, fixed timestamps, stored ZIP entries, CRC32, and explicit
  source gaps for unavailable gated artifacts.
- Phase 2 exposed the package builder through the export API and a minimal
  `Download Deliverables ZIP` UI entry point.
- Phase 3 added deterministic PDF stitching from existing generated PDFs only,
  with source gaps for no PDF inputs or stitching failure.
- Phase 4 adds provider-neutral artifact package storage and package history.
  The storage contract supports local/test memory, optional filesystem-backed
  storage when configured, capability reporting, delete/list/get, and signed
  download URLs only when a real signing secret is configured.

Current limitations after Phase 4:

- Storage is provider-neutral and local-first; production object storage
  provider integration remains future work.
- Signed URLs are capability-based. When signing is unsupported, the API returns
  the direct package download route rather than fabricating signed URLs.
- Package history stores operational timestamps, status, package hash,
  authority hashes, flags, source-gap counts, and producer versions. These
  timestamps do not affect deterministic package hashes.
- Retention policies, team/project permissions, audit-log persistence, and a
  full artifact browser UI remain future work.

## Final validation stack

Use focused validation first, then broader checks:

- `npm run check:env`
- Focused CAD/DXF/IFC export tests.
- Focused structural tests.
- Focused MEP tests.
- Focused jurisdiction tests.
- `npm run check:contracts`
- `npm run test:compose:routing`
- `npm run lint`
- `npm run build:active`
- Golden UK terraced-house output.
- Golden France dwelling output.
- Golden Algeria dwelling output.
