# Strict Multi-Panel FLUX Consistency Implementation

**Status**: ✅ Complete  
**Date**: November 21, 2025  
**Branch**: `feat/strict-multi-panel-consistency`

## Overview

This implementation addresses consistency issues in multi-panel A1 sheet generation by introducing:
1. **Two-Pass Structured DNA Generation** using Qwen2.5-72B
2. **Deterministic Seed Derivation** with index*137 formula
3. **Structured DNA-Driven Prompts** with JSON context
4. **Explicit Model Selection** (FLUX.1-dev for 3D, schnell for 2D)
5. **Normalized Panel Resolutions** (2000×2000 for 3D, 1500×1500 for 2D)

## Problem Statement

Previous multi-panel generation had several consistency issues:
- **Fallback DNA used** when AI generation failed, leading to generic designs
- **DNA completeness failures** (missing site, program, style, geometry_rules)
- **Inconsistent seeds** across panels
- **Mixed model usage** without clear 2D/3D distinction
- **Variable panel resolutions** making composition unpredictable

## Solution Architecture

### 1. Two-Pass DNA Generation

**Files Created**:
- `src/services/dnaSchema.js` - Structured DNA schema definition
- `src/services/twoPassDNAGenerator.js` - Two-pass generation logic
- `src/services/dnaRepair.js` - Deterministic DNA repair functions

**Flow**:
```
User Input → Pass A (Author) → Pass B (Reviewer) → Validated DNA
                ↓                      ↓
          Qwen2.5-72B          Qwen2.5-72B + Repair
          (JSON only)          (Validate + Fix)
```

**Pass A - Author**:
- Prompts Qwen2.5-72B to generate **structured JSON only**
- Schema: `{ site, program, style, geometry_rules }`
- Temperature: 0.3 for consistency
- Max tokens: 4000

**Pass B - Reviewer**:
- Validates schema completeness
- Uses Qwen2.5-72B to repair if issues found
- Falls back to deterministic repair if AI fails
- Temperature: 0.1 for deterministic repairs

**Key Benefits**:
- ✅ **No fallback DNA** - errors are surfaced to user
- ✅ **Complete DNA** - all required sections present
- ✅ **Site-aware** - polygon, area, climate, sun path
- ✅ **Program-accurate** - rooms with exact areas and orientations

### 2. Deterministic Seed Derivation

**File Modified**: `src/services/seedDerivation.js`

**Formula**:
```javascript
baseSeed = hash(masterDNA)
panelSeed[i] = (baseSeed + i * 137) % 1000000
```

**Example**:
```javascript
baseSeed = 12345
hero_3d (index 0) = 12345 + 0*137 = 12345
interior_3d (index 1) = 12345 + 1*137 = 12482
floor_plan_ground (index 2) = 12345 + 2*137 = 12619
elevation_north (index 3) = 12345 + 3*137 = 12756
```

**Key Benefits**:
- ✅ **Perfect reproducibility** - same DNA → same seeds
- ✅ **Order-dependent** - panel sequence matters
- ✅ **Simple formula** - easy to debug and verify
- ✅ **Within range** - all seeds 0-999999 (Together.ai compatible)

### 3. Structured DNA-Driven Prompts

**File Created**: `src/services/dnaPromptContext.js`

**Template Structure**:

**3D Panels**:
```
Generate a photorealistic 3D [view type] of the SAME HOUSE defined in this DNA:

{compact JSON with site, program, style, geometry}

STRICT RULES:
- Do NOT change building shape, dimensions, or proportions
- Do NOT change window count or positions
- Do NOT change roof type or pitch
- Do NOT change materials or colors
- Maintain exact consistency with the DNA specification
```

**2D Floor Plans**:
```
Generate a clean black and white architectural FLOOR PLAN for [level] floor of the SAME HOUSE defined in this DNA:

{compact JSON}

FLOOR PLAN REQUIREMENTS:
- Rooms: [list with areas]
- TRUE OVERHEAD ORTHOGRAPHIC VIEW (not perspective, not 3D)
- Maintain consistent wall thickness
- No invented rooms

NEGATIVE: (perspective:1.5), (3D:1.5), (isometric:1.5), photorealistic
```

**2D Elevations**:
```
Generate [DIRECTION] ELEVATION of the SAME HOUSE defined in this DNA:

{compact JSON}

ELEVATION REQUIREMENTS:
- FLAT ORTHOGRAPHIC VIEW (no perspective)
- Maintain exact proportions from DNA
- Show true heights and widths

NEGATIVE: (perspective:1.3), (3D:1.3), photorealistic
```

**Key Benefits**:
- ✅ **DNA-first** - every prompt references the same DNA
- ✅ **Explicit constraints** - "SAME HOUSE", "Do NOT change"
- ✅ **Strong negatives** - prevent perspective/3D in 2D views
- ✅ **Reproducible** - JSON context is stable and sorted

### 4. Model Selection & Panel Priorities

**Files Modified**:
- `src/services/panelOrchestrator.js` - Panel definitions with priorities
- `src/services/panelGenerationService.js` - Panel configs with models
- `src/services/togetherAIService.js` - Explicit model logging

**Model Assignment**:
| Panel Type | Model | Steps | Resolution | Priority |
|------------|-------|-------|------------|----------|
| hero_3d | FLUX.1-dev | 40 | 2000×2000 | 1 |
| interior_3d | FLUX.1-dev | 40 | 2000×2000 | 2 |
| site_diagram | FLUX.1-dev | 40 | 2000×2000 | 3 |
| floor_plan_* | FLUX.1-schnell | 4 | 1500×1500 | 4-6 |
| elevation_* | FLUX.1-schnell | 4 | 1500×1500 | 7-10 |
| section_* | FLUX.1-schnell | 4 | 1500×1500 | 11-12 |
| material_palette | FLUX.1-dev | 40 | 1500×1500 | 13 |
| climate_card | FLUX.1-dev | 40 | 1500×1500 | 14 |

**Generation Order**:
1. **3D views first** (establish massing and materials)
2. **Site context** (establish site relationship)
3. **Floor plans** (establish layout)
4. **Elevations** (establish facades)
5. **Sections** (establish structure)
6. **Diagrams** (establish documentation)

**Key Benefits**:
- ✅ **Right tool for job** - dev for quality, schnell for speed
- ✅ **Logical order** - 3D establishes massing before 2D details
- ✅ **Explicit priorities** - clear generation sequence
- ✅ **Consistent logging** - model choice visible in logs

### 5. Normalized Panel Resolutions

**Changes**:
- **3D panels**: 2000×2000 (high quality, square format)
- **2D technical**: 1500×1500 (clean lines, square format)
- **Diagrams**: 1500×1500 (infographics, square format)

**Composition**:
- A1 layout composer uses 'contain' fit mode
- Preserves aspect ratio with white margins
- Warns if aspect ratio mismatch > 20%

**Key Benefits**:
- ✅ **Predictable composition** - square panels fit cleanly
- ✅ **Quality appropriate** - higher res for 3D, standard for 2D
- ✅ **White backgrounds** - clean presentation for 2D drawings

## Feature Flags

New flag added to `src/config/featureFlags.js`:

```javascript
twoPassDNA: true  // Enable two-pass DNA generation (default: true)
```

**Usage**:
```javascript
import { setFeatureFlag } from './src/config/featureFlags.js';

// Enable two-pass DNA (default)
setFeatureFlag('twoPassDNA', true);

// Disable to use legacy DNA generator
setFeatureFlag('twoPassDNA', false);
```

## Testing

### Automated Tests

**New Tests**:
1. `test-seed-derivation.js` - Verifies deterministic seed formula (7/7 tests)
2. `test-two-pass-dna.js` - Verifies DNA schema and repair (7/7 tests)

**Run Tests**:
```bash
node test-seed-derivation.js
node test-two-pass-dna.js
node test-dna-pipeline.js
node test-multi-panel-e2e.js
```

### Expected Results

**Before** (with fallback DNA):
```
⚠️  [DNA Generator] Using high-quality fallback DNA
⚠️ DNA completeness check failed { missing: Array(6) }
```

**After** (with two-pass DNA):
```
✅  [DNA Generator] Master Design DNA generated and normalized
   📏 Dimensions: 15m × 10m × 6.4m
   🏗️  Floors: 2
   🎨 Materials: 2 items
   🏠 Roof: gable
```

## API Cost Impact

**Per Complete A1 Sheet**:
- Qwen2.5-72B (2 passes for DNA): ~$0.04-$0.06
- FLUX.1-dev (4 panels @ 40 steps): ~$0.08-$0.12
- FLUX.1-schnell (9 panels @ 4 steps): ~$0.02-$0.04
- **Total**: ~$0.14-$0.22 per sheet

**Comparison**:
- Previous (with fallback): ~$0.15-$0.23
- **Change**: Minimal (+$0.01 for better DNA quality)

## Migration Guide

### For Existing Designs

Existing designs with legacy DNA will continue to work:
- `dnaCompletenessValidator` checks for both formats
- Legacy DNA is automatically converted via `extractStructuredDNA()`
- Modify workflows use stored DNA (structured or legacy)

### For New Generations

New generations automatically use two-pass DNA:
- Feature flag `twoPassDNA` defaults to `true`
- No code changes needed in application layer
- DNA is stored in both structured and legacy formats

## Troubleshooting

### "DNA generation failed" error

**Cause**: Two-pass DNA generation failed (AI service unavailable or invalid response)

**Solution**:
1. Check Together.ai API key and credits
2. Verify network connectivity
3. Check browser console for detailed error
4. Temporarily disable with `setFeatureFlag('twoPassDNA', false)`

### "Design uses incomplete DNA" error in AI Modify

**Cause**: Design was generated before two-pass DNA implementation

**Solution**:
1. Regenerate the base A1 sheet with two-pass DNA enabled
2. Or temporarily disable strict validation for legacy designs

### Panels still look inconsistent

**Possible causes**:
1. **DNA not detailed enough** - Check that Pass A generated complete room list
2. **Prompts not using DNA context** - Verify `buildStructuredDNAContext` is called
3. **Seeds not deterministic** - Run `test-seed-derivation.js` to verify
4. **Model mismatch** - Check logs show correct model for each panel type

## Files Modified

### Core Services
- `src/services/dnaWorkflowOrchestrator.js` - Integrated two-pass DNA
- `src/services/panelGenerationService.js` - Updated prompts and resolutions
- `src/services/panelOrchestrator.js` - Updated priorities and resolutions
- `src/services/togetherAIService.js` - Enhanced model logging
- `src/services/seedDerivation.js` - Deterministic formula
- `src/services/a1LayoutComposer.js` - Aspect ratio validation

### New Services
- `src/services/dnaSchema.js` - DNA schema and conversion utilities
- `src/services/twoPassDNAGenerator.js` - Two-pass generation logic
- `src/services/dnaRepair.js` - Deterministic repair functions
- `src/services/dnaPromptContext.js` - Structured prompt builders

### Validators
- `src/validators/dnaCompletenessValidator.js` - Support for structured DNA

### Configuration
- `src/config/featureFlags.js` - Added `twoPassDNA` flag

### Tests
- `test-seed-derivation.js` - Seed formula verification (7 tests)
- `test-two-pass-dna.js` - DNA pipeline verification (7 tests)

## Next Steps

1. **Run full generation** with two-pass DNA enabled
2. **Verify logs** show no fallback DNA messages
3. **Visual QA** - Check consistency across all panels
4. **Test AI Modify** - Verify modifications preserve consistency
5. **Monitor costs** - Track API usage with new pipeline

## Rollback Plan

If issues arise:
```javascript
// Disable two-pass DNA
setFeatureFlag('twoPassDNA', false);

// Or revert the branch
git checkout main
```

## Success Metrics

- ✅ **No fallback DNA** in logs
- ✅ **100% DNA completeness** (no missing sections)
- ✅ **Deterministic seeds** (same DNA → same seeds)
- ✅ **Consistent materials** across all panels
- ✅ **Consistent dimensions** across all panels
- ✅ **Consistent window counts** across elevations
- ✅ **Proper 2D views** (no perspective in plans/elevations)
- ✅ **High-quality 3D** (photorealistic hero and interior)

## References

- ChatGPT Recommendation: Option B - Strict Multi-Panel Image Pipeline
- Original Issue: Inconsistent results despite good resolution quality
- Together.ai Models: Qwen2.5-72B-Instruct-Turbo, FLUX.1-dev, FLUX.1-schnell

