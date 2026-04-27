# CLAUDE.md

This repository is the production `architect-ai-platform` workspace. Follow
`AGENTS.md` as the source of truth.

## Production Pipeline

- Default mode is `PIPELINE_MODE=project_graph`.
- Production path: brief -> programme -> ProjectGraph -> deterministic 2D
  projection -> ProjectGraph-derived 3D projection -> A1 sheet -> QA report.
- `ProjectGraph` / compiled project geometry is the only geometry authority.
- 2D drawings and 3D assets must share the same geometry hash.
- Technical drawings are deterministic SVG/geometry outputs. Do not route
  plans, elevations, sections, or geometry authority through image models.
- `multi_panel` is legacy/debug mode and must be explicitly selected.

## Environment Contract

Use `.env.example` and `scripts/check-env.cjs` for variable names. Do not edit
or commit real `.env`, `.env.local`, or `.env.production` files.

Primary OpenAI variables:

- `OPENAI_API_KEY`
- `OPENAI_REASONING_API_KEY`
- `OPENAI_IMAGES_API_KEY`
- `OPENAI_REASONING_MODEL`
- `OPENAI_FAST_MODEL`
- `OPENAI_IMAGE_MODEL`
- `STEP_07_PROJECT_GRAPH_MODEL`
- `STEP_08_2D_LABEL_MODEL`
- `STEP_09_3D_QA_MODEL`
- `STEP_12_A1_SHEET_MODEL`
- `STEP_13_QA_MODEL`

Fine-tuned model IDs are optional. Base model fallback must work when
fine-tuned IDs are empty.

`TOGETHER_API_KEY`, FLUX settings, and `/api/together/*` are archived legacy
support only. They are disabled unless `PIPELINE_MODE=multi_panel` or
`REACT_APP_USE_TOGETHER=true` is explicitly set.

## Key Entrypoints

- `src/services/project/projectGraphVerticalSliceService.js`
- `api/project/generate-vertical-slice.js`
- `src/hooks/useArchitectAIWorkflow.js`
- `src/services/modelStepResolver.js`
- `scripts/check-env.cjs`

## Validation

Prefer focused validation before broad builds:

```powershell
npm run check:env
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/modelStepResolver.test.js src/__tests__/services/projectGraphVerticalSliceService.test.js
npm run check:contracts
npm run test:compose:routing
npm run build:active
```

Run `npm run lint` when changes touch `src`, `api`, `scripts`, or
`server.cjs`.
