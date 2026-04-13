# ArchCAD Backend Module

This backend module adds a local-first ArchCAD ingestion pipeline for ArchiAI.

## Architecture

- `app/core/`: settings, logging, exceptions
- `app/services/`: download, inspect, normalize, index, search
- `app/models/`: SQLite persistence
- `app/api/`: FastAPI routes
- `data/archcad/raw/`: downloaded Hugging Face dataset snapshot
- `data/archcad/processed/`: SQLite index + JSONL normalized output
- `data/archcad/cache/`: future extraction and embedding cache
- `data/archcad/manifests/`: dataset and download manifests

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

## Environment variables

```env
HF_TOKEN=
ARCHCAD_DATASET_ID=jackluoluo/ArchCAD
ARCHCAD_LOCAL_DIR=./data/archcad/raw
ARCHCAD_PROCESSED_DIR=./data/archcad/processed
```

## Example commands

Download and index:

```bash
curl -X POST http://localhost:8000/datasets/archcad/download \
  -H "Content-Type: application/json" \
  -d '{"strategy":"auto","force":false}'

curl -X POST http://localhost:8000/datasets/archcad/index \
  -H "Content-Type: application/json" \
  -d '{"force_reindex":true}'
```

Status and listing:

```bash
curl http://localhost:8000/datasets/archcad/status
curl "http://localhost:8000/datasets/archcad/samples?limit=20&modalities=json,svg"
curl http://localhost:8000/datasets/archcad/samples/train/sample-001
curl http://localhost:8000/datasets/archcad/samples/train/sample-001/elements
curl http://localhost:8000/datasets/archcad/samples/train/sample-001/qa
curl "http://localhost:8000/datasets/archcad/search?semantic=single_door&min_count=1"
curl http://localhost:8000/datasets/archcad/stats/semantics
```

## Notes for future ArchiAI integration

- Plan understanding: use normalized JSON/SVG primitives as structured geometry inputs.
- Object extraction: search and filter on semantic / instance labels before CV inference.
- Compliance checks: run rule engines over walls, doors, stairs, columns, fixtures.
- Precedent retrieval: query samples by semantic density and aligned Q&A content.
- Floor plan semantic analysis: feed normalized JSONL or SQLite records into RAG and fine-tuning jobs.

## TODOs

- Add background workers for large dataset extraction and chunked indexing.
- Add embedding generation for semantic retrieval over QA and element summaries.
- Add native point cloud loading for `.npy`, `.npz`, and `.ply` training pipelines.
