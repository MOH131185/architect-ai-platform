# Together AI + FLUX.1 Implementation Guide

## ✅ Successfully Integrated!

The Together AI integration is now working with FLUX.1 for superior architectural consistency.

## API Endpoints

### 1. Chat Completions (Reasoning)
```javascript
POST https://api.together.xyz/v1/chat/completions

{
  "model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert architect..."
    },
    {
      "role": "user",
      "content": "Design a 2-story house..."
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### 2. Image Generation (FLUX.1)
```javascript
POST https://api.together.xyz/v1/images/generations

{
  "model": "black-forest-labs/FLUX.1-schnell",
  "prompt": "Architectural floor plan...",
  "width": 1024,
  "height": 1024,
  "seed": 123456,  // For consistency
  "steps": 4,      // 1-12 for schnell
  "n": 1
}
```

## Available Models

### For Reasoning:
- `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` - Fast, high quality
- `meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo` - Best quality
- `mistralai/Mixtral-8x7B-Instruct-v0.1` - Good balance

### For Image Generation:
- `black-forest-labs/FLUX.1-schnell` - Fast (4 steps), good quality
- `black-forest-labs/FLUX.1-dev` - Better quality (28 steps)
- `stabilityai/stable-diffusion-xl-base-1.0` - Alternative

## Key Features for Architecture

### 1. Seed Control
```javascript
// Use same seed for all views to ensure consistency
const consistentSeed = 123456;

// Floor plan
{ seed: consistentSeed, prompt: "floor plan..." }

// Elevation
{ seed: consistentSeed, prompt: "elevation..." }

// 3D view
{ seed: consistentSeed, prompt: "3d exterior..." }
```

### 2. Proper 2D Floor Plans
```javascript
// FLUX understands technical drawing instructions better
prompt: `Architectural floor plan,
         TRUE 2D OVERHEAD VIEW,
         BLACK LINES ON WHITE BACKGROUND,
         CAD technical drawing style,
         room labels, dimension lines,
         ABSOLUTELY NO 3D, FLAT 2D ONLY`
```

### 3. Consistent Materials & Colors
```javascript
// Define exact specifications
const designDNA = {
  materials: {
    primary: "red brick",
    color: "#B87333",  // Exact hex color
    texture: "smooth"
  },
  windows: {
    type: "sash",
    frame: "white",
    pattern: "6-over-6"
  }
};

// Include in every prompt
prompt: `...${designDNA.materials.primary} facade ${designDNA.materials.color}...`
```

## Implementation in Our App

### Server Configuration (server.js)
```javascript
// Together AI Chat endpoint
app.post('/api/together/chat', async (req, res) => {
  const response = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOGETHER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(req.body)
  });
  // ... handle response
});

// Together AI Image endpoint
app.post('/api/together/image', async (req, res) => {
  const response = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOGETHER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: req.body.model || 'black-forest-labs/FLUX.1-schnell',
      prompt: req.body.prompt,
      width: req.body.width,
      height: req.body.height,
      seed: req.body.seed,
      steps: req.body.num_inference_steps || 4,
      n: 1
    })
  });
  // ... handle response
});
```

### Client Usage (togetherAIService.js)
```javascript
// Generate consistent architectural package
export async function generateArchitecturalPackage(params) {
  const consistentSeed = 123456;

  // Generate all views with same seed
  const views = [
    { type: 'floor_plan', prompt: '2D floor plan...' },
    { type: 'elevation_north', prompt: 'north elevation...' },
    { type: 'exterior_3d', prompt: '3d exterior...' }
  ];

  for (const view of views) {
    await generateImage({
      viewType: view.type,
      prompt: view.prompt,
      seed: consistentSeed,  // Same seed for all!
      width: 1024,
      height: 1024
    });
  }
}
```

## Testing Results

✅ **Successfully Generated:**
- Floor plans (true 2D, not 3D)
- Elevations (flat technical drawings)
- 3D exteriors (matching floor plans)
- Consistent materials across all views
- Proper architectural proportions

## Cost Comparison

| Service | Cost per Image | Quality | Consistency |
|---------|---------------|---------|-------------|
| DALL-E 3 | $0.04-0.08 | Good | Variable |
| FLUX.1 schnell | $0.001 | Good | Excellent |
| FLUX.1 dev | $0.003 | Excellent | Excellent |
| Midjourney | $0.01-0.02 | Excellent | Good |

## API Response Format

### Success Response:
```json
{
  "data": [{
    "url": "https://api.together.ai/shrt/...",
    "seed": 123456
  }]
}
```

### Error Response:
```json
{
  "error": {
    "message": "steps must be between 1 and 12",
    "type": "invalid_request_error",
    "param": "steps"
  }
}
```

## Best Practices

1. **Always use consistent seeds** for related views
2. **Be explicit about 2D vs 3D** in prompts
3. **Include exact specifications** (dimensions, colors, materials)
4. **Use technical terminology** for architectural drawings
5. **Test with schnell first** (faster, cheaper)
6. **Use dev model for final** high-quality renders

## UI Integration

Users can now select between:
- **FLUX.1 AI** (Recommended) - Better consistency, true 2D plans
- **DALL-E 3** (Legacy) - Faster but less consistent

The selection is available in the Portfolio Upload step of the UI.

## Troubleshooting

### If getting HTML responses:
- Server might be using wrong port
- Check if Together AI endpoints are added to server.js

### If "steps" error:
- FLUX.1-schnell: Use 1-12 steps
- FLUX.1-dev: Use 1-50 steps

### If inconsistent results:
- Ensure using same seed for all views
- Include Design DNA in all prompts
- Be more explicit in prompt descriptions

## Next Steps

1. ✅ Together AI integrated
2. ✅ FLUX.1 working
3. ✅ UI updated with model selection
4. ⏳ Monitor usage and costs
5. ⏳ Fine-tune prompts for better results
6. ⏳ Consider training custom LoRA for specific architectural styles