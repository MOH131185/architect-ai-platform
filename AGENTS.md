# AGENTS.md

This repository is the production `architect-ai-platform` workspace. Work from
the real repository root on `main` unless the user explicitly asks for a feature
branch or worktree.

## Binding Architecture

- The production path is the RIBA A1 ProjectGraph vertical slice.
- The canonical source of truth is `ProjectGraph` / compiled project geometry.
- Required sequence: brief -> programme -> ProjectGraph -> 2D projection -> 3D projection -> A1 sheet -> QA report.
- 2D drawings and 3D assets must derive from the same ProjectGraph/geometry hash. Do not generate them independently with separate prompts.
- Technical drawings are deterministic SVG/geometry outputs. Image models are optional presentation support only and must not be treated as geometry authority.
- `multi_panel` is legacy/debug mode. The default `PIPELINE_MODE` is `project_graph`.

## Key Entrypoints

- `src/services/project/projectGraphVerticalSliceService.js` builds the model-first vertical slice.
- `api/project/generate-vertical-slice.js` exposes the vertical slice to the app and Vercel.
- `src/hooks/useArchitectAIWorkflow.js` routes default generation through the ProjectGraph API.
- `src/services/modelStepResolver.js` resolves base/fine-tuned model IDs from environment variables.
- `docs/repo_audit_architecture_pipeline.md` records the architecture audit and remaining gaps.

## Environment Rules

- Never commit `.env`, `.env.production`, `.env.local`, or real API keys.
- Use `.env.example` for placeholders and Vercel variable names.
- OpenAI variables are the production model path:
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
- Fine-tuned model IDs are optional. Base model fallback must work when fine-tuned IDs are empty.
- `TOGETHER_API_KEY` and FLUX settings are legacy optional settings, not required for ProjectGraph generation.

## Validation Commands

Prefer focused validation before broad builds:

```powershell
npm run check:env
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/modelStepResolver.test.js src/__tests__/services/projectGraphVerticalSliceService.test.js
npm run check:contracts
npm run test:compose:routing
npm run build:active
```

Run `npm run lint` when code changes touch `src`, `api`, or `scripts`. If a check fails, fix the root cause before committing.

## Git Safety

- Check `git status --short --branch` before staging.
- Do not stage `.env` or `.env.production`.
- Do not force-push `main`.
- Ignore generated cache/probe directories unless the user asks to inspect them.
