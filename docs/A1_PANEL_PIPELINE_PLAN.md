# A1 Panel Pipeline Plan

## Current A1 FLUX touchpoints
- `src/services/dnaWorkflowOrchestrator.js`: `runA1SheetWorkflow` builds strict/standard prompts then calls `generateA1SheetImage` (Together FLUX one-shot). Hybrid path uses `orchestratePanelGeneration` + `compositeA1Sheet` but stays client-side canvas and is not wired to baseline/drift logic.
- `src/services/pureOrchestrator.js`: uses `buildSheetPrompt` / `buildStrictA1Prompt` then `createTogetherAIClient().generateA1SheetImage` with `A1_ARCH_FINAL` preset.
- `src/services/togetherAIService.js`: `generateA1SheetImage` (one-shot, landscape locked) hitting `/api/together/image`; also has unified-sheet helper via `architecturalSheetService.generateA1SheetPrompt`.
- `src/services/a1SheetPromptBuilder.js`, `a1SheetPromptGenerator.js`, `strictA1PromptGenerator.js`: strict grid-contract prompts used for one-shot FLUX.
- Server: `api/together-image.js` proxies FLUX image generations; `server.js` hosts proxy endpoints (`/api/together/image`, etc.).
- Baseline/drift: `src/services/baselineArtifactStore.js` stores single-sheet artifacts; `sheetConsistencyGuard`, `a1SheetValidator` expect single image; seeds/panel coords from `sheetLayoutConfig`.
- Existing panel flow: `src/services/panelOrchestrator.js` derives seeds/prompts per panel and uses `generateArchitecturalImage`, but layout is loose and not integrated with deterministic/baseline bundles.

## Proposed panel schema
- `type A1PanelType = 'hero_3d' | 'axonometric' | 'floor_plan_ground' | 'floor_plan_first' | 'elevation_north' | 'elevation_south' | 'elevation_east' | 'elevation_west' | 'section_AA' | 'section_BB' | 'site_diagram' | 'program_diagram' | 'climate_diagram'`.
- `interface GeneratedPanel { id: string; type: A1PanelType; imageUrl: string; width: number; height: number; seed: number; prompt: string; negativePrompt: string; dnaSnapshot: MasterDNA; orientation?: 'landscape' | 'portrait'; meta?: { viewName?: string; levelIndex?: number; timestamp?: string; camera?: any }; }`.

## New services to add
- `src/services/panelGenerationService.ts` (pure):
  - Input: `masterDNA`, `siteBoundary/siteSnapshot`, `buildingType`, `entranceOrientation`, `programSpaces`, `seed`.
  - Build panel job list (array of `{ panelType, prompt, negativePrompt, width, height, seed, priority }`), including hero 3D, axonometric, ground plan, first plan (if >1 storey), 2–4 elevations (based on entrance orientation and site), 1–2 sections.
  - Prompt builders per type (`buildHeroPrompt`, `buildAxonPrompt`, `buildFloorPlanPrompt(levelIdx)`, `buildElevationPrompt(direction)`, `buildSectionPrompt(label)`) pull material/style/dimensions/program from strict-A1 parts; share climate/site constraints; keep existing negatives for 2D vs 3D.
  - Sequentially call `togetherAIService.generateImage` (existing `generateArchitecturalImage` or thin wrapper) honoring `imageRequestQueue`; seed derivation via `derivePanelSeeds`.
  - Return `GeneratedPanel[]` plus `seedMap` and per-panel prompt metadata for baseline.

- `src/services/a1LayoutComposer.ts` (Node-capable):
  - Fixed A1 grid (5 rows × 3 cols, landscape 9933×7016px @ 300dpi) with reserved top-left site-plan slot for overlay.
  - Accepts `GeneratedPanel[]`, optional site overlay data URL, layout config, margin/padding.
  - Uses `sharp` (server) or existing export pipeline if `sharp` unavailable to place panels, add white margins, label text, and simple title block.
  - Reads “grid contract” from `a1LayoutTemplate`/`sheetLayoutConfig` to place panels; outputs PNG buffer, optional PDF via `a1PDFExportService`.

## Workflow refactor outline
- `dnaWorkflowOrchestrator` and `pureOrchestrator`:
  - Swap one-shot FLUX path for: DNA → panel job plan via `panelGenerationService` → panel generations → `a1LayoutComposer` (server route) → assembled A1 + panel metadata.
  - UI unchanged (“Generate A1” only); multi-panel complexity stays in services.
  - Preserve drift/determinism: reuse seeds (`seedDerivation`), extend drift detection to per-panel hashes and positions; keep `shouldRetryForDrift` thresholds.
  - Overlay: `a1LayoutComposer` leaves site placeholder; `a1SheetOverlay` applies captured site map post-compose.

- Server integration:
  - Add endpoint (e.g., `/api/a1/compose`) that calls `a1LayoutComposer` with panel URLs (fetch/buffer); reuse existing proxy/security patterns.
  - Continue `/api/together/image` for panel gens; keep rate limiting in `api/together-image.js`.

- Baseline + artifacts:
  - Extend `baselineArtifactStore` bundle with `panels` (without blobs), `seedMap`, `layoutKey`, `panelCoordinates` from composer, and per-panel prompts/negatives.
  - Update drift checks to compare panel hashes/seeds; keep full-sheet SSIM/pHash for compatibility.

## Testing strategy
- Unit: panel prompt builders (hero, plans, elevations NSEW, sections) ensure DNA dimensions, program table, materials, entrance orientation, climate propagate.
- Integration: feed 3–4 dummy `GeneratedPanel` PNGs (colored boxes) into `a1LayoutComposer`; assert output dimensions, reserved site slot, labels, and panel coordinate map.
- E2E: stub FLUX in `/api/together/image` to return colored boxes; run full pipeline via orchestrator, verify composed A1 respects 5×3 grid, seeds preserved in metadata, overlay placeholder intact, drift/baseline logic still executes.
