# genarch - Generative Architecture Floor Plan Generator

A deterministic Python package for generating floor plans (DXF) and 3D meshes (GLB/OBJ) from architectural constraints, with end-to-end pipeline support for print-ready A1 PDF sheets.

## One-Command Pipeline

Generate a complete architectural package from a natural language prompt:

```bash
# Install all dependencies
pip install -e ".[phase4]"

# Generate floor plan + Blender renders + A1 PDF in one command
python -m genarch.pipeline --prompt "modern minimalist villa 200sqm" --out runs/villa_001

# Or from a constraints file
python -m genarch.pipeline --constraints constraints.example.json --out runs/villa_001
```

**Output:**

```
runs/villa_001/
├── plan.json           # Floor plan data
├── plan.dxf            # Vector floor plan (AutoCAD)
├── model.glb           # 3D mesh
├── phase2/             # Blender ControlNet renders
│   ├── elevation_N_clay.png
│   ├── section_AA_clay.png
│   └── hero_perspective_clay.png
├── phase4/
│   ├── A1_sheet.pdf    # Print-ready A1 PDF (841×594mm)
│   └── sheet_manifest.json
└── pipeline_manifest.json
```

## Features

- **Deterministic Generation**: Same seed always produces identical output
- **BSP-Based Layout**: Binary Space Partition algorithm for room subdivision
- **UK Building Regulations**: Validates against minimum room sizes and dimensions
- **Multiple Export Formats**: DXF (AutoCAD), GLB (GLTF), OBJ, and JSON
- **Connectivity Validation**: Ensures all rooms are accessible via doors

## Installation

```bash
# Install from local directory
cd genarch
pip install -e .

# Or install with development dependencies
pip install -e ".[dev]"
```

### Dependencies

- `ezdxf>=1.0.0` - DXF export
- `trimesh>=4.0.0` - 3D mesh operations
- `numpy>=1.24.0` - Numerical operations
- `shapely>=2.0.0` - Polygon operations
- `networkx>=3.0` - Graph algorithms

## Quick Start

### Command Line

```bash
# Generate floor plan with default seed
python -m genarch --constraints constraints.example.json --out runs/run_001

# Generate with specific seed (for reproducibility)
python -m genarch -c constraints.example.json -o runs/run_002 --seed 123

# Custom wall height
python -m genarch -c constraints.example.json -o runs/run_003 --wall-height 2.8

# Skip 3D mesh generation (faster)
python -m genarch -c constraints.example.json -o runs/run_004 --skip-mesh

# Verbose output
python -m genarch -c constraints.example.json -o runs/run_005 -v
```

### Python API

```python
from genarch import FloorPlanConstraints, generate_floorplan
from genarch.exporters import export_dxf, export_mesh, export_json

# Load constraints
constraints = FloorPlanConstraints.from_json("constraints.example.json")

# Generate floor plan
floor_plan, metadata = generate_floorplan(constraints, seed=42)

# Export to various formats
export_dxf(floor_plan, "output/plan.dxf", metadata)
export_json(floor_plan, "output/plan.json", metadata)
export_mesh(floor_plan, "output/model.glb", format="glb", metadata=metadata)
```

## Constraints File Format

```json
{
  "envelope": [
    { "x": 0, "y": 0 },
    { "x": 15, "y": 0 },
    { "x": 15, "y": 13.5 },
    { "x": 0, "y": 13.5 }
  ],
  "total_area_m2": 200,
  "entrance_facade": "south",
  "rooms": [
    {
      "name": "Living/Kitchen",
      "area_m2": 45,
      "adjacency": ["Entrance", "Hallway"],
      "exterior_wall_preference": true
    },
    {
      "name": "Master Bedroom",
      "area_m2": 18,
      "adjacency": ["Bathroom 1", "Hallway"],
      "exterior_wall_preference": true
    }
  ]
}
```

See `constraints.example.json` for a complete example.

## Output Files

| File        | Format        | Description                                                       |
| ----------- | ------------- | ----------------------------------------------------------------- |
| `plan.dxf`  | AutoCAD DXF   | Vector floor plan with layers (WALLS, DOORS, WINDOWS, TEXT, DIMS) |
| `plan.json` | JSON          | Floor plan data with rooms, walls, and openings                   |
| `model.glb` | GLTF Binary   | 3D mesh with extruded walls and floor slab                        |
| `model.obj` | Wavefront OBJ | Alternative 3D format with separate JSON metadata                 |
| `run.json`  | JSON          | Run metadata, validation results, and statistics                  |

## Coordinate System

- **X** = East (positive)
- **Y** = North (positive)
- **Z** = Up (positive, for 3D mesh)
- **Origin** = Southwest corner of envelope
- **Units** = Meters (m)

## ID Formats

The package uses stable, semantic IDs compatible with the JavaScript codebase:

- **Room**: `room_{floor}_{index}` (e.g., `room_0_3`)
- **Wall**: `wall_{floor}_{type}_{index}` (e.g., `wall_0_ext_0`, `wall_0_int_5`)
- **Opening**: `{type}_{floor}_{facade}_{index}` (e.g., `win_0_S_1`, `door_0_INT_2`)

## Validation

The package validates generated floor plans against:

1. **Geometry**: No overlapping rooms, minimum dimensions
2. **Connectivity**: All rooms reachable via doors
3. **UK Building Regulations**: Minimum room sizes and widths

```python
from genarch.validator import GeometryValidator, ConnectivityValidator, UKBuildingRegsValidator

geo_valid, geo_errors = GeometryValidator().validate(floor_plan)
conn_valid, conn_errors = ConnectivityValidator().validate(floor_plan)
uk_valid, uk_errors = UKBuildingRegsValidator().validate(floor_plan)
```

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black .
ruff check .

# Type checking
mypy genarch
```

## Pipeline Options

```bash
# Full pipeline with caching (skip unchanged phases)
python -m genarch.pipeline --prompt "villa 200sqm" --out runs/villa

# Force re-run all phases
python -m genarch.pipeline --prompt "villa 200sqm" --out runs/villa --force

# Skip Blender rendering (faster, no Phase 2)
python -m genarch.pipeline --prompt "villa 200sqm" --out runs/villa --skip-phase2

# Custom seed for reproducibility
python -m genarch.pipeline --prompt "villa 200sqm" --out runs/villa --seed 123

# Verbose output
python -m genarch.pipeline --prompt "villa 200sqm" --out runs/villa -v
```

### Pipeline Phases

| Phase | Command                    | Description                     |
| ----- | -------------------------- | ------------------------------- |
| 1     | `python -m genarch`        | Floor plan + 3D mesh generation |
| 2     | Blender headless           | ControlNet snapshot rendering   |
| 3     | (future)                   | AI perspective generation       |
| 4     | `python -m genarch.phase4` | A1 PDF sheet assembly           |

## Architecture

```
genarch/
├── models/           # Data models (constraints, floor_plan, metadata)
├── generator/        # Generation algorithms (BSP, adjacency, openings)
├── validator/        # Validation (geometry, connectivity, UK regs)
├── exporters/        # Export formats (DXF, mesh, JSON)
├── utils/            # Utilities (geometry, units, IDs, random)
├── pipeline/         # End-to-end orchestration with caching
├── phase4/           # A1 PDF sheet assembly
└── tests/            # Unit and smoke tests
```

## License

MIT License - see LICENSE file for details.

## Integration

This package is part of the [Architect AI Platform](https://www.archiaisolution.pro) and is designed to integrate with the existing JavaScript geometry services. The JSON output format is compatible with the `SSoTBuildingModel` schema used by the platform.
