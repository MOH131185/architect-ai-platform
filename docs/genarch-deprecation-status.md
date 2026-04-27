# genarch — deprecation status

## Decision

**Keep in place; freeze; do not extend.**

The Python `genarch/` tree and the JS bridge it sits behind (`api/genarch/*`, `server/genarch/*`, `src/services/genarch/*`) are a legacy parallel pipeline pre-dating the ProjectGraph vertical slice. Production traffic now flows through `/api/project/generate-vertical-slice` (ProjectGraph), not `/api/genarch/jobs` (genarch).

Migration of remaining genarch endpoints to ProjectGraph is a separate workstream. Deletion before that migration would break:

- `vercel.json` rewrites for `/api/genarch/jobs`, `/api/genarch/jobs/:jobId`, `/api/genarch/runs/:path*`
- `api/genarch-job.js`, `api/blender-render.js`
- `server/genarch/genarchJobManager.cjs`, `server/genarch/genarchContract.cjs`
- `src/services/genarch/genarchPipelineService.js`, `src/services/genarch/genarchContract.js`
- The `check:genarch-contracts` npm script and `scripts/tests/test-phase{2,4}-pipeline.mjs`
- 6 contract files under `src/contracts/genarch-api-v1.json`

The `src/_legacy/genarchPipelineService.js` existing alongside the live `src/services/genarch/genarchPipelineService.js` is evidence that the codebase has already begun teasing apart the two.

## What ProjectGraph supersedes

| genarch responsibility                                                                                                    | ProjectGraph replacement (production today)                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genarch/genarch/generator/{adjacency_resolver,bsp_subdivider,circulation_placer,floor_plan_generator,opening_placer}.py` | `src/services/project/projectGraphVerticalSliceService.js` (`buildProjectGeometryFromProgramme`, `layoutRoomsForLevel`, `addRoomWallsAndOpenings`) + `src/services/design/{optionGenerator, optionScorer}.js` |
| `genarch/genarch/exporters/{dxf_exporter,json_exporter,mesh_exporter}.py`                                                 | `api/project/export/{dxf,xlsx,json,ifc}.js` (Tier 3 work upgrades these in place)                                                                                                                             |
| `genarch/genarch/phase4/{assemble,svg_generator,vector_import}.py`                                                        | `buildA1Sheet` + `buildA1PdfArtifact` + `src/services/sheet/sheetSplitter.js` (Tier 2.5)                                                                                                                      |
| `genarch/genarch/validation/asset_validator.py` + `validator/uk_building_regs.py`                                         | `src/services/regulation/{sourceRegistry, jurisdictionRouter, runRules}.js` + `rules/{partM, partK, partO}.js` (Tier 2.1) plus `validateProjectGraphVerticalSlice`                                            |
| `genarch/genarch/utils/geometry.py`, `units.py`                                                                           | `src/services/cad/projectGeometrySchema.js`, `src/services/utils/geometry.js`, `src/geometry/BuildingModel.js`                                                                                                |
| `genarch/genarch/pipeline/runner.py`, `cache.py`                                                                          | `buildArchitectureProjectVerticalSliceWithRepair` (Tier 2.7) + `src/services/design/repairLoop.js`                                                                                                            |

Every genarch capability above has a JS equivalent in production and is exercised by `npm run test:e2e:riba` against `fixtures/briefs/uk_small_community_library.json`.

## What genarch still does that ProjectGraph does not

- A Python-side `phase4` SVG sheet assembler with vector import — useful only as an alternate generator the team can compare outputs against; not on the critical deployment path.
- A Blender bridge (`api/blender-render.js`) for atmospheric rendering — addressed by Tier 3.2 (headless renderer) which lands an SVG-to-PNG rasteriser now and tracks full Blender integration as Tier 4.
- Long-running job semantics (queue / poll / status) — duplicated by `api/generations/start.js` + `api/generations/complete.js` (Clerk-authenticated, Supabase-backed) which is the production billing path.

## Freeze rules

1. Do **not** add new features inside `genarch/` or `src/services/genarch/`. Add to ProjectGraph instead.
2. Do **not** route new client calls to `/api/genarch/*`. Use `/api/project/generate-vertical-slice` and the export endpoints under `/api/project/export/*`.
3. Bug fixes inside genarch are allowed if a customer is actively on the legacy path; pair with a migration ticket.
4. Tests under `scripts/tests/test-phase{2,3,4}-pipeline.mjs` remain in CI for now (they protect the legacy contract). They will be retired when the last legacy endpoint is decommissioned.

## When to delete

Delete the entire genarch tree (Python + JS bridge + Vercel rewrites + `check:genarch-contracts`) when **all** of the following are true:

- `/api/generations/*` has been the only authenticated entry point for ≥ 30 days with no traffic to `/api/genarch/jobs`.
- Tier 3.6 (DXF), 3.3 (IFC), 3.2 (renderer) have shipped via the ProjectGraph export path so no caller depends on the Python exporters.
- `src/_legacy/genarchPipelineService.js` has been removed.

Until then this document is the single source of truth on the deprecation stance.
