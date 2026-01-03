# genarch.validation

Quality gates for the genarch pipeline. This module validates that:

1. **Drift Check**: Phase 3 AI renders match Phase 2 geometry edges (prevents structural drift)
2. **Asset Validation**: Required files exist before Phase 4 assembly

## Quick Start

```bash
# Full validation (drift + assets)
python -m genarch.validation --run runs/run_001 --all --strict

# Check drift for specific view
python -m genarch.validation --run runs/run_001 --view persp_main --threshold 0.65 --tolerance-px 3

# Check assets for Phase 4
python -m genarch.validation --run runs/run_001 --assets --phase4-check
```

## Drift Checker

The drift checker validates that Phase 3 AI renders maintain geometric consistency with Phase 2 ControlNet edge maps.

### Algorithm

1. **Load Phase 2 edges**: Binary edge map from `canny.png` or `lineart.png`
2. **Extract Phase 3 edges**: Apply Canny edge detection to the AI render
3. **Apply mask** (optional): Ignore background areas
4. **Compute tolerant match** using dilation:
   ```
   geom_dil = dilate(geom_edges, radius=tolerance_px)
   rend_dil = dilate(render_edges, radius=tolerance_px)
   precision = sum(render_edges & geom_dil) / sum(render_edges)
   recall = sum(geom_edges & rend_dil) / sum(geom_edges)
   f1 = 2 * precision * recall / (precision + recall)
   ```
5. **Pass/Fail**: Pass if `F1 >= threshold`

### CLI Options

| Option           | Default | Description                                                |
| ---------------- | ------- | ---------------------------------------------------------- |
| `--view`         | all     | Specific view to check (e.g., `persp_main`, `elevation_N`) |
| `--threshold`    | 0.65    | Minimum F1 score required to pass (0.0-1.0)                |
| `--tolerance-px` | 3       | Dilation radius in pixels for tolerant matching            |
| `--canny-low`    | 50      | Canny edge detection low threshold                         |
| `--canny-high`   | 150     | Canny edge detection high threshold                        |
| `--no-debug`     | false   | Skip generating debug overlay images                       |

### Output Files

```
runs/<run_id>/validation/
├── drift_report.json           # Summary of all views
├── drift_<view>.json           # Per-view metrics
├── drift_<view>_overlay.png    # Phase3 render with edges overlaid
├── drift_<view>_edges_geom.png # Phase2 geometry edges
└── drift_<view>_edges_render.png # Phase3 render edges
```

### Debug Overlay Legend

- **Red**: Phase 2 geometry edges (expected)
- **Cyan**: Phase 3 render edges (detected)
- **Yellow**: Mismatched geometry edges (not matched by render)

### Python API

```python
from genarch.validation import DriftChecker

checker = DriftChecker(
    threshold=0.65,
    tolerance_px=3,
    canny_low=50,
    canny_high=150,
    views=["persp_main", "elevation_N"],
    generate_debug=True,
    verbose=True,
)

# Check single view
result = checker.check_view(run_path, "persp_main")
print(f"F1={result.f1:.3f}, passed={result.passed}")

# Check all views
report = checker.check_all(run_path)
if not report.passed:
    print(f"Failed views: {report.summary['failed_views']}")
```

## Asset Validator

The asset validator ensures required files exist before Phase 4 assembly.

### Asset Categories

| Category              | Required     | Files                                        |
| --------------------- | ------------ | -------------------------------------------- |
| Phase 1 (Required)    | Yes          | `plan.json`, `plan.dxf`, `run.json`          |
| Phase 1 (Optional)    | No           | `model.glb`, `model.obj`, `plan.svg`         |
| Phase 2 (Recommended) | Configurable | `phase2/manifest.json`, elevations, sections |
| Phase 3 (Optional)    | Configurable | `phase3/perspective_render.png`              |

### CLI Options

| Option             | Default | Description                            |
| ------------------ | ------- | -------------------------------------- |
| `--strict`         | false   | Fail on any missing required asset     |
| `--require-phase2` | false   | Treat Phase 2 outputs as required      |
| `--require-phase3` | false   | Treat Phase 3 outputs as required      |
| `--phase4-check`   | false   | Check minimum requirements for Phase 4 |

### Output Files

```
runs/<run_id>/validation/
└── asset_report.json    # Asset inventory with hashes
```

### Python API

```python
from genarch.validation import AssetValidator

validator = AssetValidator(
    strict=True,
    require_phase2=True,
    require_phase3=False,
    verbose=True,
)

# Full validation
result = validator.validate(run_path)

# Phase 4 minimum check
result = validator.validate_for_phase4(run_path)

if not result.passed:
    for error in result.errors:
        print(f"Missing: {error}")
```

## Pipeline Integration

The validation gate runs automatically between Phase 3 and Phase 4:

```
Phase 1 → Phase 2 → Phase 3 → VALIDATE → Phase 4
                              (drift + assets)
```

### Skipping Validation

For debugging, validation can be skipped:

```bash
python -m genarch.pipeline --run runs/run_001 --skip-validate
```

### Thresholds

Default thresholds are tuned for production use:

- **Drift F1**: 0.65 (65% edge alignment)
- **Tolerance**: 3px dilation
- **Canny**: 50-150 thresholds

For stricter validation:

```bash
python -m genarch.validation --run runs/run_001 --threshold 0.75 --tolerance-px 2
```

## Exit Codes

| Code | Meaning                        |
| ---- | ------------------------------ |
| 0    | All validations passed         |
| 1    | One or more validations failed |

## Dependencies

- `numpy`: Required for edge processing
- `opencv-python`: Required for Canny edge detection and image operations

Install:

```bash
pip install numpy opencv-python
```

## Troubleshooting

### "Skipped: opencv-python is required"

Install OpenCV:

```bash
pip install opencv-python
```

### Low F1 scores on valid renders

Try adjusting:

1. Increase `--tolerance-px` to 4-5 for more leniency
2. Adjust `--canny-low` and `--canny-high` to match render style
3. Check if mask files are available to exclude background

### All views skipped

Ensure Phase 2 and Phase 3 output files exist:

```bash
ls runs/run_001/phase2/*.png
ls runs/run_001/phase3/*.png
```
