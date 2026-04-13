# Blender / 3D Status Summary

**Date**: April 9, 2026
**Scope**: Current repository state only

## Executive Verdict

The older shorthand of `Blender 3D: 2.5/4, Partial` is directionally fair, but it is too compressed to be useful.

The more accurate status is:

- **Overall product readiness**: `2.5/4`
- **Better label**: `Conditional backend-ready`
- **Not accurate enough**: plain `Partial`

Why:

- The Blender path is real and implemented.
- It is not the default path in the active genarch contract.
- Serverless production requires a dedicated external worker.
- The supported genarch surface is backend-only, not a normal React product flow.
- The main orchestration path can continue successfully without Blender.

## Readiness Breakdown

| Area                                | Score | Status          | What is true today                                                                                   |
| ----------------------------------- | ----- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Core 3D artifact generation         | 3.5/4 | Implemented     | `genarch` produces floor plans plus `model.glb`/`model.obj`, and Phase 1 is clearly defined.         |
| Blender Phase 2 rendering           | 3/4   | Conditional     | Local Blender execution and worker forwarding both exist, but availability is environment-dependent. |
| Backend orchestration and contracts | 3/4   | Implemented     | Job manager, contract adapters, and artifact paths are wired, but defaults still skip Blender.       |
| Production deployment readiness     | 2/4   | Worker-required | Serverless mode explicitly needs `BLENDER_WORKER_URL`; without it, Blender is unavailable.           |
| Frontend / product exposure         | 1/4   | Backend-only    | The supported surface is backend-only and the old frontend genarch path is dormant.                  |

## Why It Is Not 4/4

These are the current limiting facts in the codebase:

- `src/contracts/genarch-api-v1.json` sets `skipPhase2: true` by default.
- `api/blender-render.js` returns a not-available path in serverless environments without an external worker.
- `server/blender/BlenderBridgeService.cjs` disables Blender in serverless mode unless a worker URL is configured.
- `src/services/dnaWorkflowOrchestrator.js` explicitly continues with the SVG pipeline when Blender is unavailable.
- `docs/GENARCH_OPERATIONS_RUNBOOK.md` defines genarch as a backend-only surface and says there is no supported browser genarch UI flow.
- `README.md` still describes geometry-first behavior as experimental.

## Better Wording For Future Summaries

Instead of:

> Blender 3D: 2.5/4 - Partial

Use:

> Blender / 3D pipeline: 2.5/4 overall. The backend and local/worker execution paths are implemented, but Phase 2 is skipped by default, serverless needs a dedicated worker, and the supported product surface remains backend-only. Status: Conditional backend-ready, not end-to-end product-ready.

## What Would Move It Higher

To move Blender / 3D from `2.5/4` to `3.5-4/4`, the repo would need all of the following:

1. A production Blender worker deployed and health-checked as part of the normal environment.
2. Capability-aware Phase 2 enablement instead of `skipPhase2: true` as the default contract behavior.
3. A supported non-legacy UI or admin flow for genarch job submission and artifact review.
4. An end-to-end smoke test that exercises real Blender output in CI or a gated release check.

## Bottom Line

`2.5/4` is reasonable if the score means **product readiness**.

It is too low if the score means **core implementation exists at all**.

The best single-line status for the current repo is:

> **Blender / 3D: 2.5/4, conditional backend-ready.**
