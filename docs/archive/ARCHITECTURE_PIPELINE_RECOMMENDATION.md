# Architecture-Specific AI Pipeline Recommendation

## Current Issues with FLUX.1-dev
- **Inconsistent modifications**: Even with low img2img strength (0.10), architectural form changes too much
- **No fine-tuning support**: Cannot train on your architectural portfolio
- **Limited control**: No ControlNet support for precise architectural control

## Recommended Pipeline: SD3/SDXL + ControlNet

### 1. Base Model Selection
```javascript
// Option A: Stable Diffusion XL (Available on Together.ai)
const SDXL_MODELS = {
  base: 'stabilityai/stable-diffusion-xl-base-1.0',
  turbo: 'stabilityai/sdxl-turbo',  // Faster, 4 steps
  lightning: 'ByteDance/SDXL-Lightning'  // Very fast, 2-4 steps
};

// Option B: Stable Diffusion 3 (Better architecture understanding)
const SD3_MODELS = {
  medium: 'stabilityai/stable-diffusion-3-medium',  // Best balance
  turbo: 'stabilityai/sd3-turbo'  // Fast variant
};
```

### 2. ControlNet Integration for Architectural Precision

```javascript
// services/architecturalControlNetService.js
class ArchitecturalControlNetService {
  constructor() {
    this.controlTypes = {
      CANNY: 'canny',        // Edge detection for elevations/sections
      DEPTH: 'depth',        // 3D understanding
      NORMAL: 'normal',      // Surface normals for materials
      MLSD: 'mlsd',         // Line segment detection for floor plans
      SCRIBBLE: 'scribble'  // Sketch-based modifications
    };
  }

  async generateWithControl(params) {
    const {
      prompt,
      controlImage,    // Base architectural drawing
      controlType,     // 'canny' for line drawings
      controlStrength = 0.8,  // High for architectural precision
      initImage,       // Optional img2img base
      imageStrength = 0.05,   // Very low for consistency
      seed
    } = params;

    // Process control image based on type
    const controlCondition = await this.preprocessControl(controlImage, controlType);

    // Call Together.ai or Replicate API with ControlNet
    const result = await this.callControlNetAPI({
      model: 'stabilityai/sdxl-controlnet',
      prompt: prompt,
      control_image: controlCondition,
      control_scale: controlStrength,
      init_image: initImage,
      strength: imageStrength,
      seed: seed,
      num_inference_steps: 20,
      guidance_scale: 7.5
    });

    return result;
  }

  async preprocessControl(image, type) {
    switch(type) {
      case 'canny':
        return await this.extractCannyEdges(image);
      case 'mlsd':
        return await this.extractLineSegments(image);
      case 'depth':
        return await this.generateDepthMap(image);
      default:
        return image;
    }
  }
}
```

### 3. LoRA Fine-Tuning for Portfolio Style

```javascript
// services/portfolioLoRAService.js
class PortfolioLoRAService {
  async trainLoRA(portfolioImages) {
    // Step 1: Prepare dataset from user's portfolio
    const dataset = await this.prepareDataset(portfolioImages);

    // Step 2: Train LoRA on Replicate or Modal
    const loraModel = await this.trainOnReplicate({
      base_model: 'stabilityai/sdxl-base-1.0',
      dataset: dataset,
      steps: 1000,
      learning_rate: 1e-4,
      lora_rank: 32,
      caption_prefix: 'architectural design by [architect]'
    });

    // Step 3: Return LoRA weights URL
    return loraModel.weightsUrl;
  }

  async generateWithLoRA(prompt, loraWeights, seed) {
    return await togetherAI.generate({
      model: 'stabilityai/sdxl-base-1.0',
      prompt: prompt,
      lora: loraWeights,
      lora_scale: 0.8,  // Blend 80% portfolio style
      seed: seed
    });
  }
}
```

### 4. Multi-Stage Modification Pipeline

```javascript
// services/architecturalModificationPipeline.js
class ArchitecturalModificationPipeline {
  async modifyDesign(params) {
    const {
      originalImage,
      modification,
      designDNA,
      portfolioLoRA
    } = params;

    // Stage 1: Extract architectural lines (Canny)
    const cannyLines = await this.extractCannyEdges(originalImage, {
      low_threshold: 50,
      high_threshold: 150
    });

    // Stage 2: Generate with ControlNet + LoRA
    const modifiedDesign = await controlNetService.generateWithControl({
      prompt: this.buildArchitecturalPrompt(modification, designDNA),
      controlImage: cannyLines,
      controlType: 'canny',
      controlStrength: 0.9,  // Very high to preserve structure
      initImage: originalImage,
      imageStrength: 0.05,    // Minimal changes
      seed: designDNA.seed,
      lora: portfolioLoRA,
      lora_scale: 0.7
    });

    // Stage 3: Validate consistency
    const consistency = await this.validateConsistency(
      originalImage,
      modifiedDesign
    );

    if (consistency.score < 0.95) {
      // Retry with even stronger control
      return await this.retryWithStrongerControl(params);
    }

    return modifiedDesign;
  }

  buildArchitecturalPrompt(modification, dna) {
    return `
      Professional UK RIBA architectural drawing
      Style: ${dna.architecturalStyle}
      Building: ${dna.dimensions.length}m × ${dna.dimensions.width}m
      Materials: ${dna.materials.map(m => m.name).join(', ')}

      MODIFICATION: ${modification}

      CRITICAL: Preserve exact building form, proportions, style.
      Technical drawing, architectural precision, clean lines.
    `;
  }
}
```

### 5. Integration with Together.ai

```javascript
// Updated togetherAIService.js
async generateArchitecturalDesign(params) {
  const { prompt, initImage, seed, useControlNet = true } = params;

  // Option 1: Use SDXL (available on Together.ai)
  if (useControlNet) {
    // Together.ai doesn't have native ControlNet yet
    // Use Replicate API for ControlNet models
    return await replicateService.runControlNet({
      version: 'stability-ai/sdxl-controlnet',
      input: {
        prompt: prompt,
        image: initImage,
        condition_scale: 0.9,
        num_inference_steps: 20,
        seed: seed
      }
    });
  }

  // Option 2: Use standard SDXL on Together.ai
  return await this.togetherImage({
    model: 'stabilityai/stable-diffusion-xl-base-1.0',
    prompt: prompt,
    negative_prompt: 'cartoon, sketch, low quality',
    width: 1024,
    height: 1024,
    steps: 25,
    guidance_scale: 7.5,
    seed: seed,
    // For modifications
    init_image: initImage,
    strength: 0.05  // Very low for consistency
  });
}
```

## Implementation Steps

### Phase 1: Switch to SDXL (Immediate)
1. Update `togetherAIService.js` to use SDXL instead of FLUX
2. Adjust prompts for SDXL (more explicit architectural language)
3. Lower img2img strength to 0.05-0.10 for modifications

### Phase 2: Add ControlNet (Week 1-2)
1. Integrate Replicate API for ControlNet support
2. Implement Canny edge extraction for architectural lines
3. Use ControlNet for all modifications

### Phase 3: Portfolio Fine-Tuning (Week 3-4)
1. Implement LoRA training pipeline
2. Allow users to upload portfolio for style training
3. Blend portfolio style with local architecture

### Phase 4: Multi-Modal Control (Week 5-6)
1. Add depth maps for 3D understanding
2. Implement MLSD for floor plan precision
3. Combine multiple control methods

## Cost Comparison

| Model | Cost per Image | Consistency | Fine-Tuning | ControlNet |
|-------|---------------|-------------|-------------|------------|
| FLUX.1-dev | $0.01-0.02 | 70% | No | No |
| SDXL | $0.005-0.01 | 85% | Yes (LoRA) | Yes |
| SD3 Medium | $0.02-0.03 | 90% | Yes | Limited |
| SDXL + ControlNet | $0.01-0.02 | 95%+ | Yes | Yes |

## Recommended Architecture

```
User Input
    ↓
Portfolio LoRA (if trained)
    ↓
Design DNA + Modifications
    ↓
Canny Edge Extraction (preserve structure)
    ↓
SDXL + ControlNet Generation
    ↓
Consistency Validation (>95% required)
    ↓
Final A1 Sheet
```

## API Providers Supporting This Pipeline

1. **Together.ai**: SDXL base models (no ControlNet yet)
2. **Replicate**: Full ControlNet support, LoRA training
3. **Modal**: Custom deployments, fine-tuning
4. **RunPod**: Self-hosted SDXL + ControlNet
5. **Hugging Face Inference**: SDXL, some ControlNet

## Next Steps

1. **Immediate**: Switch modification pipeline to SDXL with 0.05 strength
2. **This Week**: Add Replicate for ControlNet modifications
3. **Next Sprint**: Implement portfolio LoRA training
4. **Future**: Multi-modal control for complex modifications

## Example Implementation

```javascript
// Quick modification with SDXL + ControlNet
async function modifyWithConsistency(originalImage, modification) {
  // Extract edges
  const edges = await extractCannyEdges(originalImage);

  // Generate with strong control
  const result = await replicate.run(
    "stability-ai/sdxl-controlnet-canny",
    {
      input: {
        image: edges,
        prompt: modification,
        condition_scale: 0.95,  // Very strong control
        num_inference_steps: 20,
        seed: originalSeed
      }
    }
  );

  return result;
}
```

This pipeline will achieve 95%+ consistency for architectural modifications while maintaining design quality.