# Phase 1 Architecture Backend

This document describes the reliability-oriented backend foundation added for Phase 1. The goal is backend structure, routing, and contracts for future architectural generation work. It does not claim local heavyweight inference, fine-tuning, or completed model integrations.

## What Phase 1 adds

- A category-based open-source model registry in `src/config/openSourceModels.js`.
- A provider/model router in `src/services/models/openSourceModelRouter.js`.
- Style DNA scaffolding in `src/services/style/`.
- Structured floorplan scaffolding in `src/services/floorplan/`.
- Geometry-based technical drawing scaffolding in `src/services/drawing/`.
- Lightweight precedent retrieval scaffolding in `src/services/retrieval/`.
- CAD normalization contracts in `src/services/cad/`.
- Shared request/response validators in `src/services/models/architectureBackendContracts.js`.
- API handlers in `api/models/` plus local Express mounting in `server.cjs`.

## Feature flags

Phase 1 modules are wired behind feature flags in `src/config/featureFlags.js`.

- `useOpenSourceStyleEngine`
- `useFloorplanEngine`
- `useTechnicalDrawingEngine`
- `usePrecedentRetrieval`
- `useCadUnderstandingLayer`
- `useModelRegistryRouter`

Legacy internal names remain supported where they already existed:

- `useFloorplanGenerator`
- `modelRegistry`

Environment overrides supported by this layer include:

- `ARCHIAI_OPEN_SOURCE_STYLE_ENGINE`
- `ARCHIAI_FLOORPLAN_ENGINE`
- `ARCHIAI_FLOORPLAN_GENERATOR`
- `ARCHIAI_TECHNICAL_DRAWING_ENGINE`
- `ARCHIAI_PRECEDENT_RETRIEVAL`
- `ARCHIAI_CAD_UNDERSTANDING_LAYER`
- `ARCHIAI_MODEL_REGISTRY_ROUTER`

## API surface

Phase 1 exposes these backend routes:

- `POST /api/models/generate-style`
- `POST /api/models/generate-floorplan`
- `POST /api/models/generate-drawings`
- `POST /api/models/search-precedents`
- `GET /api/models/status`

Each route returns deterministic placeholder or scaffolded outputs with explicit warnings where real provider work is not yet connected.

## Placeholder boundaries

These parts are intentionally scaffolded rather than fully implemented:

- Portfolio embeddings use deterministic local heuristics, not real CLIP/SigLIP inference.
- Floorplan generation uses a deterministic constraint solver, not a learned planner.
- Technical drawings use deterministic SVG placeholders driven by structured geometry.
- Precedent retrieval uses file-backed JSON and heuristic embeddings, not a vector database.
- CAD understanding uses schema normalization utilities, not a trained CAD model.
- Visualization entries in the model registry are routing hooks only unless an external endpoint is attached later.

## Phase 2 plug-in points

Phase 2 can extend the current contracts without changing the API shape:

- Attach real embedding services behind `styleEmbedding` and `precedentEmbedding`.
- Add a learned floorplan adapter behind `floorplan_generation`.
- Introduce a richer geometry-to-drawing annotation pipeline behind `technical_drawings`.
- Replace JSON precedent search with pgvector, Qdrant, Pinecone, or equivalent.
- Connect CAD parsers or learned semantic models behind `cad_understanding`.
- Wire FLUX, SDXL, ControlNet, or IP-Adapter services into `visualization`.

## Reliability notes

- No model weights are downloaded by default.
- No fine-tuning is performed in this phase.
- Existing routes are preserved.
- The local Express server now mounts the same `api/models/*` handlers used by the serverless layout so local development and deployment share the same contracts.
