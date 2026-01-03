# Phase 4: A1 Sheet Assembler

Composes a single print-ready A1 PDF from Phase 1-3 outputs.

## Overview

Phase 4 assembles outputs from the genarch pipeline into a professional architectural sheet:

- **Phase 1**: `genarch/` generates floor plans (DXF, JSON, GLB/OBJ)
- **Phase 2**: Blender renders ControlNet snapshots (clay, normal, depth, mask, canny)
- **Phase 3**: AI generates photoreal perspective renders
- **Phase 4**: Assemble A1 PDF from all outputs (this module)

## Installation

```bash
# Install Phase 4 dependencies
pip install reportlab svglib Pillow

# Or install with optional dependencies
pip install genarch[phase4]
```

## Usage

### Basic Usage

```bash
# Generate A1 sheet from run folder
python -m genarch.phase4 --run runs/run_001

# Output: runs/run_001/phase4/A1_sheet.pdf
```

### Full Options

```bash
python -m genarch.phase4 \
    --run runs/run_001 \
    --out output.pdf \
    --orientation landscape \
    --template standard \
    --scale 1:100 \
    --title "Modern Villa" \
    --client "Client Name" \
    --project-number "P-2025-001" \
    --dpi 300 \
    --strict \
    --verbose
```

### CLI Arguments

| Argument           | Default                     | Description                             |
| ------------------ | --------------------------- | --------------------------------------- |
| `--run, -r`        | (required)                  | Path to run folder                      |
| `--out, -o`        | `{run}/phase4/A1_sheet.pdf` | Output PDF path                         |
| `--format`         | `A1`                        | Paper format                            |
| `--orientation`    | `landscape`                 | `landscape` or `portrait`               |
| `--template`       | `standard`                  | Layout template                         |
| `--scale`          | auto                        | Scale (1:50, 1:75, 1:100, 1:150, 1:200) |
| `--title`          | From run.json               | Project title                           |
| `--client`         | ""                          | Client name                             |
| `--project-number` | ""                          | Project number                          |
| `--dpi`            | 300                         | DPI threshold for warnings              |
| `--strict`         | false                       | Error if assets missing                 |
| `--verbose, -v`    | false                       | Verbose logging                         |

## Input Contract

Expected run folder structure:

```
runs/<run_id>/
├── plan.json           # Floor plan data (rooms, walls, openings)
├── plan.dxf            # Vector floor plan (optional)
├── plan.svg            # Vector floor plan (preferred)
├── model.glb           # 3D mesh
├── run.json            # Run metadata
│
├── phase2/             # Phase 2 ControlNet renders
│   ├── manifest.json
│   ├── cameras.json
│   ├── elevation_N_clay.png
│   ├── elevation_N_canny.png
│   ├── section_AA_clay.png
│   ├── section_AA_canny.png
│   ├── hero_perspective_clay.png
│   └── ...
│
└── phase3/             # Phase 3 AI renders (future)
    └── perspective_final.png
```

## Output Contract

```
runs/<run_id>/phase4/
├── A1_sheet.pdf          # Print-ready A1 PDF
└── sheet_manifest.json   # Assembly metadata
```

## A1 Layout

Standard template (landscape):

```
+------------------------------------------------------------------+
|  15mm margin                                                       |
|  +----------------------------+  +-----------------------------+  |
|  |                            |  |   PERSPECTIVE RENDER        |  |
|  |                            |  |   340mm × 200mm             |  |
|  |      FLOOR PLAN            |  +-----------------------------+  |
|  |      460mm × 480mm         |  +-----------------------------+  |
|  |                            |  |   NORTH ELEVATION           |  |
|  |   + North arrow            |  |   340mm × 140mm             |  |
|  |   + Scale bar              |  +-----------------------------+  |
|  |                            |  +-----------------------------+  |
|  +----------------------------+  |   SECTION A-A               |  |
|                                  |   340mm × 140mm             |  |
|  +---------------------------------------------------------------+|
|  |   TITLE BLOCK: Project | Client | Scale | Date | Area | Seed  ||
|  +---------------------------------------------------------------+|
+------------------------------------------------------------------+
```

Page dimensions:

- A1 landscape: 841mm × 594mm (2384 × 1684 points)
- A1 portrait: 594mm × 841mm (1684 × 2384 points)

## Features

### Vector Floor Plans

Floor plans are embedded as vectors (not rasterized) for print quality:

1. **plan.svg** - Preferred, embedded directly
2. **plan.dxf** - Converted to SVG using ezdxf
3. **plan.json** - Generated as SVG fallback

### Auto-Scale Selection

Automatically selects best architectural scale (1:50, 1:75, 1:100, 1:150, 1:200)
to fit the floor plan in the available panel space.

### DPI Quality Checking

Warns when raster images have insufficient resolution for print quality.
Default threshold: 300 DPI.

### Asset Resolution

Automatically finds assets from multiple possible locations:

- Phase 3 renders (priority)
- Phase 2 ControlNet renders (fallback)

### Placeholder Handling

Missing assets are shown as labeled placeholder boxes (unless `--strict` mode).

## Manifest Schema

```json
{
  "version": "4.0.0",
  "phase": "a1_assembler",
  "generated_at": "2025-01-02T12:34:56Z",
  "page": {
    "format": "A1",
    "orientation": "landscape",
    "width_mm": 841,
    "height_mm": 594
  },
  "scale": {
    "chosen": "1:100",
    "auto_selected": true
  },
  "panels": {
    "floor_plan": {
      "source": "plan.svg",
      "vector": true,
      "scale": "1:100"
    },
    "perspective": {
      "source": "phase2/hero_perspective_canny.png",
      "effective_dpi": 287,
      "dpi_warning": false
    }
  },
  "warnings": []
}
```

## Python API

```python
from genarch.phase4 import A1SheetAssembler

assembler = A1SheetAssembler(
    run_path="runs/run_001",
    output_path="output.pdf",
    scale="1:100",
    title="Modern Villa",
    verbose=True,
)

success = assembler.assemble()
```

## Dependencies

- **reportlab** >= 4.0.0 - PDF generation
- **svglib** >= 1.5.0 - SVG loading
- **Pillow** >= 10.0.0 - Image processing
- **ezdxf** >= 1.0.0 (optional) - DXF to SVG conversion

## License

MIT License - See LICENSE file for details.
