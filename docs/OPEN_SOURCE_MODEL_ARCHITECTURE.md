# Open-Source Model Backend Extension

This module set adds a local-first orchestration layer for open-source-ready architectural generation without downloading heavyweight models or building any fine-tuning pipeline.

## Added capabilities

- Style engine: blends portfolio references, regional rules, and prompt intent into a normalized `Style DNA` object.
- Floorplan engine: structured adjacency/zoning/circulation solver with adapter hooks for future HouseDiffusion-like models.
- Technical drawing engine: deterministic SVG floor plans, elevations, and sections from structured geometry.
- Visualization routing: provider abstraction for FLUX, SDXL, ControlNet, and IP-Adapter style hooks.
- Precedent retrieval: local JSON embedding index with metadata filters and cosine search.
- CAD understanding prep: normalized schema for walls, doors, windows, stairs, columns, beams, furniture, rooms, and labels.

## Environment variables

Set these in `.env` when you want to override adapter choices or wire external endpoints:

```env
ARCHIAI_OPEN_SOURCE_STYLE_ENGINE=true
ARCHIAI_FLOORPLAN_GENERATOR=true
ARCHIAI_TECHNICAL_DRAWING_ENGINE=true
ARCHIAI_PRECEDENT_RETRIEVAL=true
ARCHIAI_CAD_UNDERSTANDING_LAYER=true

OPEN_SOURCE_STYLE_EMBEDDING_ADAPTER=clip-local-heuristic
OPEN_SOURCE_STYLE_CONDITIONING_ADAPTER=prompt-only
OPEN_SOURCE_FLOORPLAN_ADAPTER=constraint-solver
OPEN_SOURCE_TECHNICAL_DRAWING_ADAPTER=svg-vector-engine
OPEN_SOURCE_VISUAL_PROVIDER=flux-hook
OPEN_SOURCE_PRECEDENT_EMBEDDING_ADAPTER=clip-local-heuristic
OPEN_SOURCE_PRECEDENT_SEARCH_ADAPTER=semantic-json-search
OPEN_SOURCE_CAD_ADAPTER=arch-structured-normalizer

OPEN_SOURCE_FLUX_ENDPOINT=http://localhost:8001/flux
OPEN_SOURCE_SDXL_ENDPOINT=http://localhost:8002/sdxl
OPEN_SOURCE_CONTROLNET_ENDPOINT=http://localhost:8003/controlnet
OPEN_SOURCE_IP_ADAPTER_ENDPOINT=http://localhost:8004/ip-adapter
OPEN_SOURCE_PRECEDENT_INDEX_PATH=./data/cache/precedent-index.json
```

## API examples

Generate Style DNA:

```bash
curl -X POST http://localhost:3000/api/models/generate-style \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "quiet contemporary brick courtyard house",
    "portfolioReferences": [
      { "url": "https://example.com/1.jpg", "tags": ["brick", "courtyard"], "materials": ["brick"] }
    ],
    "location": { "region": "UK", "climate_zone": "marine-temperate" },
    "styleIntent": "contextual contemporary"
  }'
```

Generate floorplan:

```bash
curl -X POST http://localhost:3000/api/models/generate-floorplan \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "demo-house",
    "level_count": 2,
    "footprint": { "width_m": 14, "depth_m": 10 },
    "room_program": [
      { "name": "Living Room", "target_area_m2": 28, "zone": "public", "adjacency": ["room-1"] },
      { "id": "room-1", "name": "Kitchen", "target_area_m2": 18, "zone": "public" },
      { "name": "Bedroom 1", "target_area_m2": 16, "zone": "private", "level": 1 }
    ]
  }'
```

Generate drawings:

```bash
curl -X POST http://localhost:3000/api/models/generate-drawings \
  -H "Content-Type: application/json" \
  -d '{
    "geometry": {
      "project_id": "demo-house",
      "levels": [
        {
          "id": "ground",
          "name": "Ground Floor",
          "rooms": [
            { "id": "living", "name": "Living Room", "bbox": { "x": 0, "y": 0, "width": 6, "height": 5 } }
          ]
        }
      ]
    },
    "drawingTypes": ["plan", "elevation", "section"]
  }'
```

Search precedents:

```bash
curl -X POST http://localhost:3000/api/models/search-precedents \
  -H "Content-Type: application/json" \
  -d '{
    "query": "contemporary brick courtyard house",
    "filters": {
      "building_type": "residential",
      "climate": "marine-temperate",
      "required_classes": ["wall", "door"]
    },
    "limit": 5
  }'
```

## Future plug-in points

- Portfolio style packs: wire `portfolio-lora-pack` or `ip-adapter-hook` in `src/config/openSourceModels.js`.
- Region-specific style packs: wire `regional-lora-pack` and extend `src/services/style/locationStyleRules.js`.
- Floorplan models: attach `house-diffusion-hook` or `graph2plan-hook` to the router.
- Technical drawing stylizers: attach `lineart-stylizer-hook` after SVG generation.
- Embedding providers: replace local heuristic embedding adapters with CLIP/SigLIP service calls.
- Vector search: swap `semantic-json-search` for `vector-db-hook` when you add Pinecone, pgvector, or Qdrant.
