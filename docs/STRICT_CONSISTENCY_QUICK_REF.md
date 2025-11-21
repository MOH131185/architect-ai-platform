# Strict Multi-Panel Consistency - Quick Reference

## Quick Start

### Enable Two-Pass DNA (Default: ON)
```javascript
import { setFeatureFlag } from './src/config/featureFlags.js';
setFeatureFlag('twoPassDNA', true); // Already default
```

### Run Tests
```bash
# Verify seed derivation
node test-seed-derivation.js

# Verify DNA pipeline
node test-two-pass-dna.js

# Full multi-panel test
node test-multi-panel-e2e.js
```

## DNA Schema

Every DNA must have these four sections:

```json
{
  "site": {
    "polygon": [...],
    "area_m2": 150,
    "orientation": 0,
    "climate_zone": "temperate",
    "sun_path": "south",
    "wind_profile": "moderate"
  },
  "program": {
    "floors": 2,
    "rooms": [
      {
        "name": "Living Room",
        "area_m2": 25,
        "floor": "ground",
        "orientation": "south"
      }
    ]
  },
  "style": {
    "architecture": "contemporary",
    "materials": ["brick", "wood", "glass"],
    "windows": {
      "pattern": "regular grid",
      "proportion": "3:5"
    }
  },
  "geometry_rules": {
    "grid": "1m grid",
    "max_span": "6m",
    "roof_type": "gable"
  }
}
```

## Seed Formula

```javascript
// Base seed from DNA hash
baseSeed = hash(masterDNA)

// Panel seeds (deterministic)
panelSeed[0] = baseSeed + 0*137 = baseSeed
panelSeed[1] = baseSeed + 1*137 = baseSeed + 137
panelSeed[2] = baseSeed + 2*137 = baseSeed + 274
// ... and so on
```

**Important**: Panel order matters! Always use the same sequence:
```javascript
const PANEL_SEQUENCE = [
  'hero_3d', 'interior_3d', 'site_diagram',
  'floor_plan_ground', 'floor_plan_first',
  'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
  'section_AA', 'section_BB',
  'material_palette', 'climate_card'
];
```

## Model Selection

| Panel Type | Model | Steps | Resolution | Use Case |
|------------|-------|-------|------------|----------|
| hero_3d, interior_3d, site_diagram | FLUX.1-dev | 40 | 2000×2000 | Photorealistic 3D |
| floor_plan_*, elevation_*, section_* | FLUX.1-schnell | 4 | 1500×1500 | Fast 2D technical |
| material_palette, climate_card | FLUX.1-dev | 40 | 1500×1500 | High-quality diagrams |

## Prompt Templates

### 3D Panels
```javascript
import { build3DPanelPrompt } from './src/services/dnaPromptContext.js';

const prompt = build3DPanelPrompt('hero_3d', masterDNA, 
  'Entrance on north side. Show building from optimal viewing angle.'
);
```

### 2D Floor Plans
```javascript
import { buildPlanPrompt } from './src/services/dnaPromptContext.js';

const prompt = buildPlanPrompt('ground', masterDNA,
  'Entrance on north side. Building type: residential.'
);
```

### 2D Elevations
```javascript
import { buildElevationPrompt } from './src/services/dnaPromptContext.js';

const prompt = buildElevationPrompt('north', masterDNA,
  'This is the MAIN ENTRANCE facade. Show entrance door prominently.'
);
```

### 2D Sections
```javascript
import { buildSectionPrompt } from './src/services/dnaPromptContext.js';

const prompt = buildSectionPrompt('longitudinal', masterDNA, '');
```

## Common Issues

### "DNA generation failed"

**Cause**: Two-pass DNA generation failed

**Fix**:
1. Check Together.ai API key: `TOGETHER_API_KEY` in `.env`
2. Verify API credits: https://api.together.ai/settings/billing
3. Check network connectivity
4. Temporarily disable: `setFeatureFlag('twoPassDNA', false)`

### "Design uses incomplete DNA"

**Cause**: Design generated before two-pass DNA implementation

**Fix**:
1. Regenerate the base A1 sheet with two-pass DNA enabled
2. Or use legacy DNA generator for that design

### Panels still inconsistent

**Checklist**:
- [ ] Two-pass DNA enabled? Check logs for "Two-Pass DNA Generator"
- [ ] DNA has all 4 sections? Check for "DNA completeness check failed"
- [ ] Seeds are deterministic? Run `node test-seed-derivation.js`
- [ ] Prompts use DNA context? Check prompts include JSON block
- [ ] Correct models used? Check logs show "FLUX.1-dev" for 3D, "schnell" for 2D

## Debugging

### Check DNA Quality
```javascript
// In browser console
import('./src/services/designHistoryService.js').then(m => {
  const designs = m.default.listDesigns();
  console.log('Recent designs:', designs);
  
  const latest = m.default.getDesign(designs[0].designId);
  console.log('Latest DNA:', latest.masterDNA);
  console.log('Has structured DNA?', !!latest.masterDNA._structured);
});
```

### Check Seed Derivation
```bash
node test-seed-derivation.js
```

### Check DNA Schema
```bash
node test-two-pass-dna.js
```

### Full Pipeline Test
```bash
node test-multi-panel-e2e.js
```

## Performance

**Generation Time**:
- DNA generation (2 passes): ~10-15 seconds
- Panel generation (13 panels): ~4-5 minutes
- Composition: ~1-2 seconds
- **Total**: ~5-6 minutes per complete A1 sheet

**API Costs**:
- Qwen2.5-72B (2 passes): ~$0.04-$0.06
- FLUX.1-dev (4 panels): ~$0.08-$0.12
- FLUX.1-schnell (9 panels): ~$0.02-$0.04
- **Total**: ~$0.14-$0.22 per sheet

## Feature Flags

```javascript
// Enable strict consistency mode (default)
setFeatureFlag('twoPassDNA', true);
setFeatureFlag('hybridA1Mode', true);
setFeatureFlag('multiPanelA1', true);

// Adjust rate limiting if needed
setFeatureFlag('togetherImageMinIntervalMs', 9000); // 9 seconds
setFeatureFlag('togetherBatchCooldownMs', 30000);   // 30 seconds
```

## Rollback

If issues arise, disable two-pass DNA:
```javascript
setFeatureFlag('twoPassDNA', false);
```

Or revert the branch:
```bash
git checkout main
```

## Support

For issues or questions:
1. Check logs for "Two-Pass DNA Generator" messages
2. Run diagnostic tests: `test-seed-derivation.js`, `test-two-pass-dna.js`
3. Review `docs/STRICT_MULTI_PANEL_IMPLEMENTATION.md` for details
4. Check browser console for detailed error messages

