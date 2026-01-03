# genarch Setup Guide

Complete setup instructions for running the genarch pipeline end-to-end.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Python Environment](#python-environment)
3. [Phase 1: Floor Plan Generation](#phase-1-floor-plan-generation)
4. [Phase 2: Blender ControlNet Rendering](#phase-2-blender-controlnet-rendering)
5. [Phase 3: AI Perspective Generation](#phase-3-ai-perspective-generation)
6. [Phase 4: A1 PDF Assembly](#phase-4-a1-pdf-assembly)
7. [Environment Variables](#environment-variables)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Clone and install
cd genarch
pip install -e ".[all]"

# 2. Run pipeline (skipping Phase 2/3 for quick test)
python -m genarch.pipeline \
    --prompt "modern minimalist villa 200sqm" \
    --out runs/test_001 \
    --skip-phase2 \
    -v

# 3. Check output
ls runs/test_001/phase4/A1_sheet.pdf
```

---

## Python Environment

### Requirements

- **Python**: 3.10+ (tested on 3.10, 3.11, 3.12, 3.13)
- **OS**: Windows, macOS, Linux

### Installation Options

```bash
# Option 1: Install with all optional dependencies
pip install -e ".[all]"

# Option 2: Install with specific extras
pip install -e ".[phase4]"      # A1 PDF assembly
pip install -e ".[dev]"         # Development tools
pip install -e ".[mesh]"        # 3D mesh visualization
pip install -e ".[draw]"        # DXF to SVG conversion

# Option 3: Install from requirements.lock (pinned versions)
pip install -r requirements.lock
```

### Verify Installation

```bash
# Check genarch is installed
python -c "import genarch; print(genarch.__version__)"

# Run quick test
python -m genarch --help

# Run environment checker (validates all dependencies)
python scripts/genarch/check_env.py

# With Blender check
python scripts/genarch/check_env.py --phase2

# Check all (including ComfyUI)
python scripts/genarch/check_env.py --all
```

### Dependency Lock Files

The project includes both pinned and unpinned dependency files:

```bash
# Install from pinned versions (recommended for reproducibility)
pip install -r requirements.lock

# Install from unpinned versions (for development)
pip install -r requirements.in

# Install dev dependencies
pip install -r requirements-dev.lock

# Regenerate lock files (requires pip-tools)
pip install pip-tools
pip-compile requirements.in -o requirements.lock
pip-compile requirements-dev.in -o requirements-dev.lock
```

---

## Phase 1: Floor Plan Generation

Phase 1 is pure Python with no external dependencies.

### Run Phase 1 Only

```bash
# From constraints file
python -m genarch \
    --constraints constraints.example.json \
    --out runs/run_001 \
    --seed 42 \
    -v

# From prompt (generates constraints automatically)
python -m genarch.pipeline \
    --prompt "3-bedroom house 180sqm" \
    --out runs/run_001 \
    --skip-phase2 \
    --skip-phase4
```

### Output Files

```
runs/run_001/
├── plan.json       # Floor plan data (rooms, walls, openings)
├── plan.dxf        # Vector floor plan (AutoCAD format)
├── model.glb       # 3D mesh (GLTF binary)
├── model.obj       # 3D mesh (Wavefront OBJ)
└── run.json        # Run metadata and validation results
```

### Troubleshooting Phase 1

**Error: `ModuleNotFoundError: No module named 'scipy'`**

```bash
# scipy is needed for mesh export (model.glb)
pip install scipy

# Or skip mesh export
python -m genarch --constraints ... --out ... --skip-mesh
```

---

## Phase 2: Blender ControlNet Rendering

Phase 2 renders 3D views from the generated mesh using Blender headless mode.

### Blender Requirements

| Component | Version                     | Notes                            |
| --------- | --------------------------- | -------------------------------- |
| Blender   | 4.0+ (recommended: 4.2 LTS) | Must support `--background` mode |
| Python    | Blender's bundled Python    | Scripts run inside Blender       |

### Installation

**Windows:**

```powershell
# Option 1: Install from blender.org
# Download from https://www.blender.org/download/
# Install to C:\Program Files\Blender Foundation\Blender 4.2\

# Option 2: Install via winget
winget install BlenderFoundation.Blender

# Set environment variable
setx BLENDER_PATH "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
```

**macOS:**

```bash
# Install via Homebrew
brew install --cask blender

# Set environment variable
export BLENDER_PATH="/Applications/Blender.app/Contents/MacOS/Blender"
echo 'export BLENDER_PATH="/Applications/Blender.app/Contents/MacOS/Blender"' >> ~/.zshrc
```

**Linux:**

```bash
# Ubuntu/Debian
sudo apt install blender

# Or download from blender.org
wget https://download.blender.org/release/Blender4.2/blender-4.2.0-linux-x64.tar.xz
tar xf blender-4.2.0-linux-x64.tar.xz
export BLENDER_PATH="$PWD/blender-4.2.0-linux-x64/blender"
```

### Verify Blender Installation

```bash
# Check version
blender --version
# or
$BLENDER_PATH --version

# Expected output:
# Blender 4.2.0
# ...
```

### Blender Scripts

The pipeline uses scripts in `blender_scripts/`:

```
blender_scripts/
├── controlnet_rendering.py    # Main ControlNet snapshot renderer
├── phase2_config.json         # Camera positions, render settings
└── postprocess.py             # Canny edge detection (optional)
```

### Run Phase 2

```bash
# Via pipeline
python -m genarch.pipeline \
    --prompt "villa 200sqm" \
    --out runs/run_001 \
    --blender-path "/path/to/blender"

# Or manually
blender -b \
    -P blender_scripts/controlnet_rendering.py \
    -- \
    --in runs/run_001/model.glb \
    --config blender_scripts/phase2_config.json \
    --out runs/run_001/phase2/
```

### Phase 2 Output

```
runs/run_001/phase2/
├── manifest.json              # Render manifest
├── cameras.json               # Camera configurations
├── elevation_N_clay.png       # North elevation (clay render)
├── elevation_N_canny.png      # North elevation (edge map)
├── elevation_S_clay.png       # South elevation
├── section_AA_clay.png        # Section A-A
├── hero_perspective_clay.png  # Perspective view
└── ... (28+ PNG files)
```

### Troubleshooting Phase 2

**Error: `Blender not found`**

```bash
# Set BLENDER_PATH explicitly
export BLENDER_PATH="/path/to/blender"

# Or pass via CLI
python -m genarch.pipeline ... --blender-path "/path/to/blender"
```

**Error: `model.glb not found`**

```bash
# Phase 1 failed to generate mesh
# Check Phase 1 logs and ensure scipy is installed
pip install scipy
python -m genarch --constraints ... --out ... -v
```

---

## Phase 3: AI Perspective Generation

Phase 3 uses ComfyUI to generate photorealistic perspective renders from ControlNet inputs.

> **Note**: Phase 3 is experimental and skipped by default.

### ComfyUI Requirements

| Component | Version | Notes                                     |
| --------- | ------- | ----------------------------------------- |
| ComfyUI   | Latest  | https://github.com/comfyanonymous/ComfyUI |
| Python    | 3.10+   | ComfyUI environment                       |
| CUDA      | 11.8+   | GPU acceleration (recommended)            |

### Required Models

Download and place in `ComfyUI/models/`:

```
ComfyUI/models/
├── checkpoints/
│   └── architectureExterior_v110.safetensors    # Architecture-specific SDXL
│       # Alt: juggernautXL_v9.safetensors
│       # Alt: realvisxlV40.safetensors
│
├── controlnet/
│   ├── control_v11p_sd15_canny.pth              # Canny edge ControlNet
│   ├── control_v11p_sd15_depth.pth              # Depth ControlNet
│   └── control_v11p_sd15_lineart.pth            # Lineart ControlNet
│
├── loras/
│   └── architectural_photography_v1.safetensors # Optional style LoRA
│
└── vae/
    └── sdxl_vae.safetensors                     # SDXL VAE
```

### Model Download Links

| Model                       | Source                                                           | Size    |
| --------------------------- | ---------------------------------------------------------------- | ------- |
| Architecture Exterior v1.10 | [CivitAI](https://civitai.com/models/123456)                     | ~6.5 GB |
| ControlNet Canny            | [HuggingFace](https://huggingface.co/lllyasviel/ControlNet-v1-1) | ~1.4 GB |
| ControlNet Depth            | [HuggingFace](https://huggingface.co/lllyasviel/ControlNet-v1-1) | ~1.4 GB |

### ComfyUI Setup

```bash
# 1. Clone ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# or: venv\Scripts\activate  # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Install custom nodes
cd custom_nodes
git clone https://github.com/Fannovel16/comfyui_controlnet_aux.git

# 5. Start ComfyUI API server
cd ..
python main.py --listen 0.0.0.0 --port 8188
```

### Environment Variables

```bash
# ComfyUI API endpoint
export COMFYUI_URL="http://localhost:8188"

# Or for remote server
export COMFYUI_URL="http://192.168.1.100:8188"
```

### Run Phase 3

```bash
# Enable Phase 3 (experimental)
python -m genarch.pipeline \
    --prompt "villa 200sqm" \
    --out runs/run_001 \
    --phase3 \
    -v
```

### Phase 3 Output

```
runs/run_001/phase3/
├── manifest.json
├── perspective_render.png     # Main perspective
├── elevation_N_render.png     # Photoreal north elevation
└── ...
```

---

## Phase 4: A1 PDF Assembly

Phase 4 assembles all outputs into a print-ready A1 PDF sheet.

### Dependencies

```bash
pip install -e ".[phase4]"
# Installs: reportlab, svglib, Pillow
```

### Run Phase 4

```bash
# Via pipeline
python -m genarch.pipeline \
    --prompt "villa 200sqm" \
    --out runs/run_001

# Or standalone
python -m genarch.phase4 \
    --run runs/run_001 \
    --scale 1:100 \
    --title "Modern Villa" \
    -v
```

### Phase 4 Output

```
runs/run_001/phase4/
├── A1_sheet.pdf           # Print-ready A1 (841×594mm)
└── sheet_manifest.json    # Layout metadata, asset hashes
```

### PDF Verification

```bash
# Check PDF size is A1
python -c "
from pypdf import PdfReader
r = PdfReader('runs/run_001/phase4/A1_sheet.pdf')
w, h = float(r.pages[0].mediabox.width), float(r.pages[0].mediabox.height)
print(f'Size: {w/(72/25.4):.0f}mm x {h/(72/25.4):.0f}mm')
print(f'A1 landscape: {abs(w/(72/25.4)-841)<2 and abs(h/(72/25.4)-594)<2}')
"
```

---

## Environment Variables

| Variable            | Default                 | Description                |
| ------------------- | ----------------------- | -------------------------- |
| `BLENDER_PATH`      | `blender`               | Path to Blender executable |
| `COMFYUI_URL`       | `http://localhost:8188` | ComfyUI API endpoint       |
| `GENARCH_CACHE_DIR` | `~/.cache/genarch`      | Cache directory            |

### Setting Environment Variables

**Windows (PowerShell):**

```powershell
$env:BLENDER_PATH = "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
$env:COMFYUI_URL = "http://localhost:8188"
```

**Windows (Permanent):**

```powershell
setx BLENDER_PATH "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
```

**macOS/Linux:**

```bash
export BLENDER_PATH="/path/to/blender"
export COMFYUI_URL="http://localhost:8188"

# Add to ~/.bashrc or ~/.zshrc for persistence
echo 'export BLENDER_PATH="/path/to/blender"' >> ~/.bashrc
```

---

## Smoke Tests & Validation

Quick verification commands that don't require Blender or ComfyUI:

```bash
# Verify CLI help (no deps required)
python -m genarch --help
python -m genarch.pipeline --help
python -m genarch.validation --help
python -m genarch.phase4 --help

# Run environment checker
python scripts/genarch/check_env.py

# Phase 1 only (no external deps)
python -m genarch.pipeline \
    --prompt "test house 100sqm" \
    --out runs/smoke_test \
    --skip-phase2 \
    --skip-phase4 \
    -v

# Phase 1 + Phase 4 (no Blender)
python -m genarch.pipeline \
    --prompt "test house 100sqm" \
    --out runs/smoke_test \
    --skip-phase2 \
    -v

# Validate existing run
python -m genarch.validation --run runs/smoke_test --assets -v
```

### Expected Output Structure

```
runs/smoke_test/
├── constraints.json      # Auto-generated from prompt
├── plan.json             # Floor plan data
├── plan.dxf              # Vector floor plan
├── model.glb             # 3D mesh (if scipy installed)
├── model.obj             # 3D mesh alternate format
├── run.json              # Run metadata
├── pipeline_manifest.json
└── phase4/               # If --skip-phase4 not set
    ├── A1_sheet.pdf
    └── sheet_manifest.json
```

---

## Troubleshooting

### Common Issues

**1. `pip install` fails with build errors**

```bash
# Install build dependencies
pip install --upgrade pip setuptools wheel

# On Windows, install Visual C++ Build Tools
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
```

**2. `ImportError: No module named 'genarch'`**

```bash
# Ensure you're in the genarch directory
cd genarch
pip install -e .

# Verify installation
python -c "import genarch; print('OK')"
```

**3. Phase 1 validation errors**

```
Geometry validation errors:
  - Total area 243.4m² deviates 21.7% from target 200.0m²
```

This is expected for auto-generated constraints. The BSP algorithm produces
approximate areas. Use explicit room dimensions in constraints.json for
precise control.

**4. Phase 2 timeout**

```bash
# Increase timeout (default: 5 minutes)
# Edit genarch/pipeline/runner.py, line 467:
timeout=600,  # 10 minutes
```

**5. Phase 4 missing assets warning**

```
[Phase4] WARNING: Missing asset: Perspective
```

This is expected when Phase 2/3 is skipped. The PDF will show placeholders.

### Debug Mode

```bash
# Enable verbose output
python -m genarch.pipeline ... -v

# Check pipeline manifest
cat runs/run_001/pipeline_manifest.json

# Check validation reports
cat runs/run_001/asset_report.json
cat runs/run_001/drift_report.json
```

### Getting Help

- **Issues**: https://github.com/architect-ai/genarch/issues
- **Documentation**: https://docs.archiaisolution.pro/genarch

---

## REST API Integration

For programmatic access, genarch provides a REST API via the Express server:

```bash
# Start the Express server (port 3001)
npm run server

# Create a job
curl -X POST http://localhost:3001/api/genarch/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt": "modern villa 200sqm", "seed": 42}'

# Poll for status
curl http://localhost:3001/api/genarch/jobs/<job_id>

# Download A1 PDF when complete
curl -O http://localhost:3001/api/genarch/runs/<job_id>/phase4/A1_sheet.pdf
```

**API Endpoints:**

| Method | Endpoint                  | Description            |
| ------ | ------------------------- | ---------------------- |
| POST   | `/api/genarch/jobs`       | Create and start a job |
| GET    | `/api/genarch/jobs`       | List all jobs          |
| GET    | `/api/genarch/jobs/:id`   | Get job status         |
| DELETE | `/api/genarch/jobs/:id`   | Cancel a job           |
| GET    | `/api/genarch/runs/:id/*` | Download artifacts     |

See `docs/GENARCH_API.md` for complete API documentation.

---

## Version Compatibility Matrix

| genarch | Python | Blender | ComfyUI | Notes           |
| ------- | ------ | ------- | ------- | --------------- |
| 0.1.x   | 3.10+  | 4.0+    | Latest  | Initial release |

---

## Appendix: Full Pipeline Example

```bash
# Complete pipeline with all phases
python -m genarch.pipeline \
    --prompt "modern minimalist villa with pool 250sqm" \
    --out runs/villa_001 \
    --seed 42 \
    --phase3 \
    --blender-path "/path/to/blender" \
    --drift-threshold 0.20 \
    --strict \
    -v

# Output structure
tree runs/villa_001/
# runs/villa_001/
# ├── constraints.json
# ├── plan.json
# ├── plan.dxf
# ├── model.glb
# ├── model.obj
# ├── run.json
# ├── pipeline_manifest.json
# ├── asset_report.json
# ├── drift_report.json
# ├── phase2/
# │   ├── manifest.json
# │   ├── cameras.json
# │   ├── elevation_N_clay.png
# │   ├── elevation_N_canny.png
# │   └── ...
# ├── phase3/
# │   ├── manifest.json
# │   ├── perspective_render.png
# │   └── ...
# └── phase4/
#     ├── A1_sheet.pdf
#     └── sheet_manifest.json
```
