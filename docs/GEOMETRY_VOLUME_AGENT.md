# Geometry Volume Agent Architecture

**Status**: ✅ Implemented  
**Date**: November 21, 2025  
**Feature Flag**: `geometryVolumeFirst` (default: false)

## Overview

The Geometry Volume Agent introduces a **3D-massing-first** approach to architectural generation where:
1. AI reasons about building volume based on site, climate, and style
2. A canonical 3D geometry is generated and rendered
3. All image models (FLUX/SDXL) are conditioned on this geometry
4. Modifications preserve the 3D volume unless explicitly changing massing

This ensures **single coherent projects** with no mixed roof types or inconsistent massing.

## Problem Solved

**Before** (DNA-only):
- AI could generate different roof types across panels (gable + flat)
- Window counts varied between elevations
- Massing inconsistent between 3D and 2D views
- No geometric "source of truth"

**After** (Geometry Volume First):
- Single 3D volume specification resolves all ambiguities
- Geometry renders serve as control images for FLUX/SDXL
- All panels reference the same canonical massing
- Modifications classified: appearance vs volume changes

## Architecture

### Pipeline Flow

```
User Input
    ↓
Two-Pass DNA (site, program, style, geometry_rules)
    ↓
Pass C: Volume Reasoning (Qwen2.5-72B)
    ↓
3D Volume Specification (massing, roof, facades, heights)
    ↓
Geometry Renders (elevations, axonometric, perspective)
    ↓
Panel Generation (FLUX/SDXL conditioned on geometry)
    ↓
A1 Sheet Composition
    ↓
Baseline Storage (DNA + Volume + Geometry Renders)
```

### Components

#### 1. Volume Reasoning (`geometryVolumeReasoning.js`)

**Input**: Structured DNA (site, program, style, geometry_rules)

**Process**: Qwen2.5-72B analyzes:
- Site constraints (polygon, area, setbacks)
- Climate requirements (sun path, wind, thermal)
- Style preferences (architecture type, materials)
- Program needs (rooms, circulation, access)

**Output**: Volume Specification JSON:
```json
{
  "massing": {
    "type": "single_volume|multi_wing|courtyard",
    "footprint_shape": "rectangular|L_shape|U_shape",
    "floor_stacking": "uniform|setback|cantilever",
    "wings": [...]
  },
  "roof": {
    "type": "gable|hip|flat|shed",
    "pitch_degrees": 35,
    "overhang_m": 0.5,
    "ridge_orientation": "north_south|east_west"
  },
  "facades": {
    "north": { "type": "primary", "features": [...], "window_count": 4 },
    "south": { "type": "secondary", "features": [...], "window_count": 3 },
    "east": { "type": "side", "features": [...], "window_count": 2 },
    "west": { "type": "side", "features": [...], "window_count": 2 }
  },
  "heights": {
    "ground_floor_m": 3.0,
    "upper_floors_m": 2.7,
    "total_height_m": 5.7
  },
  "volumes": [...],
  "reasoning": {
    "massing_strategy": "...",
    "roof_choice": "...",
    "facade_hierarchy": "...",
    "climate_response": "..."
  }
}
```

#### 2. Geometry Render Service (`geometryRenderService.js`)

**Input**: Volume Specification

**Process**: Generates neutral-shaded geometry images using Canvas API:
- Orthographic elevations (N/S/E/W) - 1500×1500px
- Axonometric view (45° isometric) - 1500×1500px
- Perspective hero view - 1500×1500px

**Output**: Data URLs for each geometry render

**Features**:
- Simple line drawings (no materials/colors)
- Accurate proportions from volume spec
- Tagged by facade direction
- Cached for reuse in modifications

#### 3. Multi-Model Image Service (`multiModelImageService.js`)

**Purpose**: Generate images with FLUX primary, SDXL fallback

**Flow**:
```
Try FLUX (Together.ai)
    ↓
  Success? → Return FLUX result
    ↓ No
Try SDXL (Replicate)
    ↓
  Success? → Return SDXL result (marked as fallback)
    ↓ No
  Throw error
```

**Geometry Conditioning**:
- If geometry render available: use as img2img/control image
- Geometry strength: 0.6 (moderate influence - allows AI to add details)
- Prompt includes DNA JSON + explicit geometry constraints

#### 4. Modification Classifier (`modificationClassifier.js`)

**Purpose**: Classify user modification requests

**Categories**:
1. **Appearance-only**: colors, materials, finishes, details
   - Reuse geometry baseline
   - Regenerate affected panels only
   - Keep same seeds

2. **Minor elevation**: balconies, window patterns (keep massing)
   - Reuse geometry baseline
   - Regenerate affected facades
   - Keep same seeds

3. **Volume change**: add floor, extend wing, change roof
   - Regenerate geometry volume
   - Regenerate all geometry renders
   - Regenerate all panels
   - New seeds derived from updated DNA

4. **New project**: complete redesign
   - Start fresh DNA + geometry pipeline
   - New designId

**Process**: Qwen2.5-72B analyzes request and returns:
```json
{
  "classification": "appearance_only|minor_elevation|volume_change|new_project",
  "confidence": 0.9,
  "reasoning": "...",
  "affected_elements": ["colors", "materials"],
  "requires_geometry_regeneration": false,
  "requires_new_baseline": false
}
```

## Usage

### Enable Geometry Volume First

```javascript
import { setFeatureFlag } from './src/config/featureFlags.js';

// Enable geometry-first mode
setFeatureFlag('geometryVolumeFirst', true);
```

### Generation Flow

When `geometryVolumeFirst` is enabled:

1. **Two-Pass DNA** generates structured DNA
2. **Pass C** (Volume Reasoning) generates volume specification
3. **Geometry Renders** created from volume spec
4. **Panel Generation** uses geometry renders as control images
5. **Baseline Storage** includes volume spec + geometry renders

### Modification Flow

When modifying with geometry volume:

1. **Classify Request** → appearance/elevation/volume/new
2. **If appearance-only or minor elevation**:
   - Load geometry baseline
   - Reuse geometry renders
   - Regenerate affected panels only
   - Keep same 3D volume
3. **If volume change**:
   - Regenerate volume specification
   - Regenerate geometry renders
   - Regenerate all panels
   - Save as new version
4. **If new project**:
   - Start fresh pipeline
   - New designId

## API Requirements

### Together.ai
- **Qwen2.5-72B-Instruct-Turbo**: DNA + volume reasoning
- **FLUX.1-dev**: High-quality 3D panels
- **FLUX.1-schnell**: Fast 2D technical panels

### Replicate (Fallback)
- **SDXL**: Fallback when FLUX fails
- **ControlNet**: For geometry-conditioned generation

**Environment Variables**:
```bash
TOGETHER_API_KEY=tgp_v1_...
REPLICATE_API_KEY=r8_...  # Optional fallback
```

## Benefits

### Consistency
- ✅ **Single roof type** across all views
- ✅ **Consistent massing** between 3D and 2D
- ✅ **Accurate window counts** per facade
- ✅ **Coherent proportions** across all panels

### Flexibility
- ✅ **Appearance changes** don't regenerate geometry
- ✅ **Elevation changes** preserve overall massing
- ✅ **Volume changes** regenerate geometry when needed
- ✅ **Version history** tracks geometry baselines

### Reliability
- ✅ **SDXL fallback** if FLUX fails
- ✅ **Deterministic geometry** from volume spec
- ✅ **Cached renders** for fast modifications
- ✅ **Clear classification** of modification types

## Performance

**Generation Time** (with geometry volume):
- DNA generation (2 passes): ~10-15 seconds
- Volume reasoning (Pass C): ~5-10 seconds
- Geometry renders: ~2-3 seconds
- Panel generation (13 panels): ~4-5 minutes
- **Total**: ~5-6 minutes

**Modification Time**:
- Appearance-only: ~30-60 seconds (reuse geometry)
- Minor elevation: ~1-2 minutes (reuse geometry, regen facades)
- Volume change: ~5-6 minutes (full regeneration)

**API Costs**:
- Qwen (3 passes): ~$0.06-$0.08
- FLUX panels: ~$0.14-$0.20
- **Total**: ~$0.20-$0.28 per sheet

## Testing

### Test Geometry Volume Generation
```bash
# Run geometry volume test
node test-geometry-volume.js
```

### Test Modification Classification
```bash
# Run modification classifier test
node test-modification-classifier.js
```

### Manual Testing

1. Enable feature flag:
```javascript
setFeatureFlag('geometryVolumeFirst', true);
```

2. Generate A1 sheet and check logs:
```
✅ Pass C: Volume specification generated
   Massing: single_volume
   Roof: gable @ 35°
✅ Geometry renders generated
   Elevations: 4 (N/S/E/W)
   Axonometric: 1
   Perspective: 1
```

3. Verify consistency:
- All elevations show same roof type
- Window counts match across views
- Massing consistent between 3D and 2D

4. Test modification:
- Request appearance change: "change brick to white"
- Verify geometry baseline reused
- Request volume change: "add a third floor"
- Verify geometry regenerated

## Troubleshooting

### "Volume specification generation failed"

**Cause**: Qwen2.5-72B failed to generate volume spec

**Solution**:
- Check Together.ai API key and credits
- Verify network connectivity
- Fallback volume spec will be used automatically

### "Geometry renders generation failed"

**Cause**: Canvas API not available or rendering error

**Solution**:
- In browser: Should work automatically
- In Node.js: Install `canvas` package: `npm install canvas`
- Fallback: Generation continues without geometry control

### "SDXL fallback used for all panels"

**Cause**: FLUX API failing repeatedly

**Solution**:
- Check Together.ai API status
- Verify FLUX.1-dev model availability
- Check rate limiting (increase delays if needed)

### Panels still show mixed roof types

**Possible causes**:
1. **Geometry volume disabled** - Check `geometryVolumeFirst` flag
2. **Volume reasoning failed** - Check for fallback volume spec in logs
3. **Geometry renders not used** - Check panel metadata for `hadGeometryControl`

## Files

### New Files
- `src/services/geometryVolumeReasoning.js` - Volume specification reasoning
- `src/services/geometryRenderService.js` - Geometry render generation
- `src/services/multiModelImageService.js` - FLUX + SDXL wrapper
- `src/services/modificationClassifier.js` - Modification classification
- `api/replicate-generate.js` - Replicate SDXL endpoint

### Modified Files
- `src/services/dnaSchema.js` - Added geometry section
- `src/services/twoPassDNAGenerator.js` - Added Pass C (volume reasoning)
- `src/services/dnaWorkflowOrchestrator.js` - Integrated geometry pipeline
- `src/services/aiModificationService.js` - Added classification logic
- `src/config/featureFlags.js` - Added `geometryVolumeFirst` flag

## Rollback

To disable geometry volume mode:
```javascript
setFeatureFlag('geometryVolumeFirst', false);
```

This reverts to DNA-only generation without geometry control.

## Future Enhancements

- [ ] Three.js-based 3D viewer for geometry volume
- [ ] Interactive geometry editing before generation
- [ ] Export geometry as OBJ/FBX for CAD import
- [ ] Real-time geometry preview during DNA generation
- [ ] Advanced massing strategies (courtyard, atrium, etc.)

