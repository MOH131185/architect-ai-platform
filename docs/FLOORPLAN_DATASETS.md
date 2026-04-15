# Floor-Plan Dataset Integration

This repo now uses two external dataset sources to improve floor-plan generation prompts without vendoring raw training data into the web app bundle.

## Sources

- HouseExpo: `https://github.com/TeaganLi/HouseExpo`
  - Local clone path: `data/external/HouseExpo`
  - Local archive used by the corpus builder: `data/external/HouseExpo/HouseExpo/json.tar.gz`
  - Purpose: residential room-mix, footprint, and layout priors
  - License in upstream repo: MIT

- Roboflow Universe floor-plan datasets:
  - `https://universe.roboflow.com/floor-plan-rendering/floor_plan_objects`
  - `https://universe.roboflow.com/architecture-plan/door-object-detection`
  - Purpose: door/window/stair/fixture symbol vocabulary for technical plan prompts
  - Check the live project page before use; Roboflow dataset licensing is controlled per dataset page

## How The App Uses Them

- `src/services/aiFloorPlanLayoutEngine.js`
  - Injects HouseExpo-derived residential priors into:
    - spatial graph generation prompts
    - room placement/layout prompts

- `src/services/a1/panelPromptBuilders.js`
  - Injects Roboflow-derived symbol vocabulary hints into:
    - ground floor plan prompts
    - first floor plan prompts
    - second floor plan prompts

- `src/data/floorPlanReferenceCorpus.js`
  - Generated compact corpus consumed by the app at runtime
  - Safe to bundle because it contains only summary statistics and example metadata, not raw dataset assets

## Rebuild The Corpus

From the repo root:

```powershell
python scripts/datasets/build_floorplan_reference_corpus.py
```

Optional fast iteration:

```powershell
python scripts/datasets/build_floorplan_reference_corpus.py --max-plans 2000
```

This regenerates:

```text
src/data/floorPlanReferenceCorpus.js
```

## Optional Roboflow Export Workflow

If you want exact class names instead of the bundled symbol-family hints:

1. Install the CLI:

```powershell
python -m pip install roboflow
```

2. Download a public dataset export:

```powershell
roboflow download floor-plan-rendering/floor_plan_objects/1 --format coco --location data/external/roboflow/floor_plan_objects
```

3. Extend `scripts/datasets/build_floorplan_reference_corpus.py` or add a dedicated normalizer to merge those class names into the generated corpus.

## Notes

- `data/external/` is ignored by git on purpose.
- HouseExpo is residential-only. The prompt integration deliberately skips non-residential building types.
- The Roboflow block is used as symbol vocabulary guidance, not as a claim that the current app is training an object detector locally.
