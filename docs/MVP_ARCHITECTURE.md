# MVP Architecture Note

## System Overview

```
User Brief ──► Design DNA ──► Panel Generation ──► A1 Composition ──► Output
                (Qwen 72B)    (SVG + FLUX AI)      (Sharp/Node.js)    (PNG)
```

ArchiAI generates professional A1 architectural sheets from a text brief in ~3 minutes. The system uses a **neuro-symbolic pipeline**: AI generates structured data (Design DNA), which drives both deterministic technical drawings and AI-rendered 3D views.

## Pipeline: Multi-Panel A1

The only production-implemented pipeline mode is `MULTI_PANEL`.

### Stage 1: Design DNA Generation (~15s)

- **Two-pass AI reasoning** via Qwen 2.5 72B (Together.ai)
- Pass A (Author): Generates structured JSON with dimensions, materials, rooms, geometry rules
- Pass B (Reviewer): Validates and repairs DNA at temperature 0.1
- Output: Immutable `masterDNA` object — the single source of truth

### Stage 2: Panel Planning

- 15 panels planned across 3 tiers + data panels
- Deterministic seed derivation: `panelSeed[i] = (baseSeed + i * 137) % 1000000`
- Style lock extracted from DNA for cross-panel consistency

### Stage 3: Panel Generation (~2-3 min)

| Tier   | Panels                                    | Method                 | API Calls | Cost   |
| ------ | ----------------------------------------- | ---------------------- | --------- | ------ |
| Tier 1 | 8 technical (plans, elevations, sections) | SVG — local geometry   | 0         | $0.00  |
| Tier 2 | 2 hero (3D exterior, axonometric)         | FLUX.1 via Together.ai | 2         | ~$0.03 |
| Tier 3 | 2 supplementary (interior, site)          | FLUX.1 via Together.ai | 2         | ~$0.03 |
| Data   | 3 (schedules, materials, climate)         | Server-generated       | 0         | $0.00  |

- 6-second rate limiting between Together.ai requests (prevents 429 cascade)
- Total: 4 API image calls + 2 reasoning calls

### Stage 4: A1 Composition (~10s)

- Server-side Sharp-based image composition
- UK RIBA-standard A1 layout (1792x1269 px working, 7016x9933 px print)
- Title block, material palette, climate card

### Cost Per Sheet

- Together.ai Qwen reasoning: ~$0.03
- Together.ai FLUX images (4 calls): ~$0.06
- **Total: ~$0.09 per sheet**

## Consistency System

The **Design DNA** achieves 98%+ cross-view consistency by:

1. Extracting exact specifications (dimensions, materials, colors) into structured JSON
2. Injecting DNA into every panel prompt as a consistency lock
3. Using deterministic seeds derived from DNA hash
4. Validating DNA before generation (realistic dimensions, compatible materials)

## Technology Stack

| Layer             | Technology                   | Role                                 |
| ----------------- | ---------------------------- | ------------------------------------ |
| Frontend          | React + Framer Motion        | Wizard UI, results viewer            |
| AI Reasoning      | Qwen 2.5 72B (Together.ai)   | DNA generation, validation           |
| AI Rendering      | FLUX.1-schnell (Together.ai) | 3D views, hero panels                |
| Technical Drawing | SVG generation (local)       | Floor plans, elevations, sections    |
| Composition       | Sharp (Node.js)              | A1 sheet assembly                    |
| Hosting           | Vercel                       | Static site + serverless API proxies |

## What's Next (Post-MVP)

1. **GenArch Geometry Pipeline** — Deterministic 3D geometry backend (Python, in development). Generates floor plans, elevations, and 3D models from constraints. Currently dev-only (not Vercel-compatible).

2. **ControlNet-Locked Rendering** — Use SVG geometry as control images for FLUX/SDXL, achieving pixel-level dimensional accuracy in AI renders.

3. **Portfolio LoRA Training** — Fine-tune image models on user portfolio to match their specific architectural style.

4. **BIM Export** — Generate IFC/DXF files from geometry pipeline output.

## Key Files

- `src/services/dnaWorkflowOrchestrator.js` — Main pipeline orchestrator
- `src/services/design/panelGenerationService.js` — Panel planning and generation
- `src/services/twoPassDNAGenerator.js` — Two-pass DNA generation
- `src/services/togetherAIClient.js` — Together.ai API client with rate limiting
- `src/hooks/useArchitectAIWorkflow.js` — React hook for generation lifecycle
- `src/data/demoProjects.js` — Demo mode data (pre-generated outputs)
- `src/config/pipelineMode.js` — Pipeline mode configuration
