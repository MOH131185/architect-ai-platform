# Repo Audit: Architecture Pipeline

## Current Stack

- React 18 / CRA frontend with Vercel-style `api/` routes and an Express `server.cjs` proxy.
- Core architecture services live under `src/services/`.
- Deterministic geometry path already exists through `projectPipelineV2Service`, `runtimeProjectGeometryFromLayout`, `compileProject`, compiled-project technical panels, SVG renderers, A1 compose gates, and export services.
- Tests run through `react-scripts`; raw Jest is less reliable in this repo because of workspace and ESM constraints.

## Existing Pipeline

- User/project inputs are normalized in API routes such as `api/project/compile.js` and `api/project/generate-sheet.js`.
- Residential V2 currently builds programme evidence, runtime geometry, compiled project authority, technical pack summaries, delivery stages, export manifests, and then hands A1 generation to `dnaWorkflowOrchestrator`.
- Technical drawings are deterministic SVGs when routed through compiled-project authority.
- 3D/control outputs carry geometry hash metadata, but not every endpoint exposes a single explicit `ProjectGraph` object.

## Keep

- `compileProject()` as the BIM-lite compiled geometry authority.
- `buildCompiledProjectTechnicalPanels()` for 2D plan/section/elevation SVGs.
- Existing A1 compose/readiness/publishability gates.
- Existing model routing and env-driven overrides.
- Existing export services for JSON/DXF/IFC/XLSX.

## Replace Or Wrap

- Wrap the current authority pipeline with a V2 `ProjectGraph` vertical slice instead of replacing proven compiled-project seams.
- Demote any prompt-only or image-only final outputs when they do not reference the same geometry hash as technical drawings.
- Add a model-step resolver for the downloaded `.env.example` convention: base models now, optional fine-tuned IDs later.

## Biggest Blockers

- No single explicit `ProjectGraph` contract was returned by the main V2 path.
- 2D drawings and 3D scene metadata were adjacent but not packaged as one source-of-truth graph for QA.
- Model env conventions were split between older `AI_MODEL_*`/Together routing and the new `STEP_*` OpenAI/fine-tune plan.
- General UK/RIBA/community typologies are still early; existing production strength is residential.

## Decision

Use Path B: keep the existing product shell and deterministic compiled-project authority, then add a model-first V2 vertical-slice wrapper. This gives a reviewable route from brief to programme to `ProjectGraph` to 2D/3D/A1/QA without breaking the older A1 pipeline.
