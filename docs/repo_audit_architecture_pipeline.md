# Repository Audit: RIBA A1 ProjectGraph Pipeline

## Current Stack

- React 18 / Create React App frontend with Vercel serverless API routes.
- Express development proxy in `server.cjs`.
- JavaScript service layer with deterministic geometry, SVG drawing, PDF export, and validation helpers.
- Existing legacy A1 generation services remain in the repo for comparison and backwards compatibility.

## Target Pipeline

The binding production path is:

```text
brief -> programme -> ProjectGraph -> 2D projection -> 3D projection -> A1 sheet -> QA report
```

The important architecture rule is that 2D and 3D are not separate AI guesses.
They are projections from the same ProjectGraph / compiled geometry authority and
must share the same `geometryHash` / `source_model_hash`.

## Implemented Source Of Truth

- `src/services/project/projectGraphVerticalSliceService.js` normalises the brief, creates context packs, generates a programme, compiles geometry, builds ProjectGraph output, exports 2D drawings, exports a deterministic 3D scene, composes an A1 SVG/PDF sheet, and returns a QA report.
- `api/project/generate-vertical-slice.js` exposes the vertical slice through Vercel/API.
- `src/hooks/useArchitectAIWorkflow.js` now defaults app generation to the ProjectGraph API path.
- `src/config/pipelineMode.js` defaults to `project_graph`; `multi_panel` is retained only as explicit legacy/debug mode.

## Context Packs

- Site/context pack: location, coordinates, boundary, access, constraints, and site metrics.
- Climate pack: orientation, daylight, wind/rain, flood and overheating flags with deterministic fallback data.
- Regulation pack: early-stage UK/RIBA checks and warnings with professional-review disclaimers.
- Material/construction pack: structure, envelope, roof, glazing, low-carbon notes, and buildability flags.
- Local style pack: style keywords, context weighting, and portfolio/local blend metadata.

## Projection And Export

- 2D plans/elevations/sections are deterministic SVG assets derived from the compiled geometry.
- 3D output is a deterministic scene JSON asset from the same ProjectGraph geometry.
- A1 output includes an SVG sheet and a PDF sheet at A1 landscape size, 841 mm by 594 mm.
- QA validates shared programme IDs, shared source model hash, geometry hash consistency, A1 sheet size, and professional-review disclaimers.

## Environment And Models

- `.env.example` defines placeholders only.
- `.env` and `.env.production` remain local/ignored and must not be committed.
- OpenAI is the production model path through:
  - `OPENAI_API_KEY`
  - `OPENAI_REASONING_API_KEY`
  - `OPENAI_IMAGES_API_KEY`
  - `OPENAI_REASONING_MODEL`
  - `OPENAI_FAST_MODEL`
  - `OPENAI_IMAGE_MODEL`
  - `STEP_*` model variables
- Fine-tuned model IDs remain optional. `modelStepResolver` uses base-model fallback when fine-tuned IDs are empty.
- Together/FLUX variables are legacy optional variables and are not required by the ProjectGraph vertical slice.

## Reusable Modules

- `src/services/modelStepResolver.js` for provider/model/fallback resolution.
- `src/services/compiler/index.js` for compiled project generation.
- `src/services/canonical/compiledProjectTechnicalPackBuilder.js` for technical pack output.
- `src/services/validation/cdsHash.js` for stable source hashes.
- `src/services/project/v2ProjectContracts.js` for sheet artifact metadata contracts.

## Remaining Gaps

- Context packs are deterministic and schema-shaped, but not yet backed by full live Ordnance Survey, Met Office, UKCP, or planning authority APIs.
- ProjectGraph PDF export is a deterministic proof-of-contract sheet, not a full print-production drawing board renderer.
- Legacy multi-panel/Together/FLUX code remains available when explicitly selected; it should be retired after the ProjectGraph UI path is fully adopted.
- The vertical slice is a RIBA Stage 2 concept package and still requires professional architectural, structural, planning, and building-control review.
