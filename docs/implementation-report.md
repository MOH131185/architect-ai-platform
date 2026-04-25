# Implementation Report: ProjectGraph Vertical Slice

## What Changed

- Added `src/services/modelStepResolver.js` to resolve base model IDs from env now and switch to optional `STEP_*_FT_MODEL`, `STEP_*_DPO_MODEL`, or `STEP_*_RFT_MODEL` later.
- Added `src/services/project/projectGraphVerticalSliceService.js` for the vertical slice: brief -> programme -> ProjectGraph -> 2D projection -> 3D projection -> A1 sheet SVG -> QA report.
- Added `api/project/generate-vertical-slice.js` as a lightweight API entrypoint for the ProjectGraph slice.
- Updated `.env.example` with `MODEL_SOURCE=hybrid`, OpenAI base model IDs, and per-step model/fine-tune variables.
- Added focused tests for model resolution and ProjectGraph consistency.

## Pipeline Structure

1. Normalize the incoming UK architecture brief.
2. Build deterministic fallback site, climate, regulation, and local-style packs with explicit data-quality warnings.
3. Generate or normalize a programme and place every programme space into canonical geometry.
4. Compile the geometry through `compileProject()` and use the compiled geometry hash as the single model authority.
5. Generate 2D plan/section/elevation SVG panels with `buildCompiledProjectTechnicalPanels()`.
6. Generate a deterministic 3D scene JSON from the same compiled project.
7. Compose an A1 landscape SVG manifest whose drawings and 3D scene share the same `source_model_hash`.
8. Run machine-readable QA checks for programme/model coverage, 2D/3D hash consistency, area tolerance, and sheet references.

## How To Run

Use the API endpoint:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/project/generate-vertical-slice -ContentType 'application/json' -Body '{}'
```

Or call `buildArchitectureProjectVerticalSlice()` from tests/services with a brief payload.

## Validation

Focused test command:

```powershell
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/modelStepResolver.test.js src/__tests__/services/projectGraphVerticalSliceService.test.js
```

## Remaining Gaps

- The vertical slice currently emits A1 SVG and manifests; PDF export should be wired through the existing export/composition layer next.
- Site, climate, and regulation packs use explicit deterministic fallbacks when live data sources are absent.
- The first generic non-residential layout is suitable for consistency validation, not architectural quality scoring.
- UI integration is not yet wired to the new endpoint.
