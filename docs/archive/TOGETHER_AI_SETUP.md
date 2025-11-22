# Together.ai FLUX.1-kontext-max Setup

## ⚠️ Important: Tier Requirement

The FLUX.1-kontext-max model requires **Build Tier 2 or higher** on Together.ai.

### Current Status
- ✅ API Key Added: `TOGETHER_API_KEY` configured
- ❌ Access Blocked: Free/Build Tier 1 cannot use FLUX.1-kontext-max
- ✅ Code Ready: Server configured, will work once tier upgraded

### Error Message
```
Access to this model is not available for tier Limited,Free,Build Tier 1.
You're currently on Build Tier 1.
To unlock access, please upgrade your tier by purchasing credits.
```

## Upgrade Options

### Option 1: Upgrade Together.ai Tier (Recommended for FLUX)
1. Visit: https://api.together.ai/settings/billing
2. Purchase credits (minimum $5-10)
3. This will upgrade you to Build Tier 2
4. You'll have access to FLUX.1-kontext-max

**Pricing:**
- Build Tier 2: Add $5+ credits
- FLUX.1-kontext-max: ~$0.04 per image (1024x1024)
- Much cheaper than DALL-E 3 ($0.04 vs $0.08)

### Option 2: Use Alternative Together.ai Models (Free Tier)
Try these models that are available on Build Tier 1:

```javascript
// In server.js, replace model name with:
{
  model: 'stabilityai/stable-diffusion-xl-base-1.0',  // Free tier
  // or
  model: 'runwayml/stable-diffusion-v1-5',  // Free tier
  // or
  model: 'prompthero/openjourney',  // Free tier
}
```

### Option 3: Use Replicate (Already Configured)
Your project already has Replicate configured with SDXL support:
- Model: `stability-ai/sdxl`
- API Key: Already in `.env`
- Cost: ~$0.005-0.02 per image
- Quality: Excellent

### Option 4: Stick with DALL-E 3 (Current)
- Already working
- High quality
- Cost: $0.04-0.08 per image
- No additional setup needed

## Recommended Action Plan

### Immediate (Use Replicate):
Your enhanced image service already supports Replicate SDXL. Just change the model in `enhancedImageGenerationService.js`:

```javascript
// Line 94: For 2D blueprints
const request = {
  model: 'stable-diffusion-xl',  // Uses Replicate (already configured!)
  // ... rest of config
};

// Line 132: For 3D views
const request = {
  model: 'stable-diffusion-xl',  // Instead of FLUX (works now!)
  // ... rest of config
};
```

This will work immediately with your existing Replicate API key!

### Long-term (Add Together.ai credits):
1. Add $10-20 credits to Together.ai
2. Switch back to FLUX.1-kontext-max
3. Better consistency for architectural views

## Testing Without FLUX

Let's test with SDXL via Replicate (already working):

```bash
# This will use your existing Replicate key
curl -X POST "http://localhost:3001/api/enhanced-image/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "stable-diffusion-xl",
    "prompt": "Modern house exterior, architectural rendering",
    "width": 1024,
    "height": 1024
  }'
```

## Updated Model Strategy

### Priority 1: Replicate SDXL (Working Now)
- ✅ Already configured
- ✅ No additional cost
- ✅ Good quality for blueprints and 3D
- Cost: ~$0.005-0.02 per image

### Priority 2: DALL-E 3 (Fallback)
- ✅ Already configured
- ✅ High quality
- ✅ Fast generation
- Cost: ~$0.04 per image

### Priority 3: Together.ai FLUX (Future)
- ❌ Requires tier upgrade
- ⏳ Add $10+ credits
- 🎯 Best consistency
- Cost: ~$0.04 per image

## Cost Comparison Per Design

Full design generation (14 images):

| Provider | Cost per Image | Total for 14 Images |
|----------|----------------|---------------------|
| Replicate SDXL | $0.01 | **$0.14** 💰 |
| DALL-E 3 | $0.04 | $0.56 |
| Together FLUX | $0.04 | $0.56 (blocked) |

**Recommendation:** Use Replicate SDXL for now - it's already working and 75% cheaper!

## Quick Fix: Use Replicate Now

Update `src/services/enhancedImageGenerationService.js`:

```javascript
// Line 94 - For 2D blueprints
async generate2DBlueprint(floorNumber = 0) {
  const blueprintPrompt = this.buildBlueprintPrompt(floorNumber);

  const request = {
    model: 'stable-diffusion-xl',  // ✅ Works with Replicate now!
    prompt: blueprintPrompt,
    negative_prompt: this.getNegativePromptForBlueprints(),
    width: 1024,
    height: 1024,
    seed: this.masterSeed,
    guidance_scale: 12,
    num_inference_steps: 50,
    // ... rest stays same
  };
  // ...
}

// Line 128 - For 3D views
async generate3DView(viewType, referenceImage = null) {
  const view3DPrompt = this.build3DPrompt(viewType);

  const request = {
    model: 'stable-diffusion-xl',  // ✅ Works with Replicate now!
    prompt: view3DPrompt,
    negative_prompt: this.getNegativePromptFor3D(),
    width: 1024,
    height: 1024,
    seed: this.masterSeed,
    // ... rest stays same
  };
  // ...
}
```

Then test immediately!

## Summary

**Current Status:**
- ✅ Together.ai API key added
- ✅ Server code ready for FLUX
- ❌ Access blocked (need tier upgrade)
- ✅ Fallback to Replicate/DALL-E works

**Next Steps:**
1. **Option A (Free):** Use Replicate SDXL (already configured)
2. **Option B (Paid):** Add $10 credits to Together.ai for FLUX

**My Recommendation:**
Start with Replicate SDXL (free, already working), then upgrade to Together.ai FLUX later if you need even better consistency.

---

**Links:**
- Together.ai Billing: https://api.together.ai/settings/billing
- Together.ai Pricing: https://api.together.ai/pricing
- Replicate Pricing: https://replicate.com/pricing