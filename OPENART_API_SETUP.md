# OpenArt API Setup Guide

## Get Your OpenArt API Key

### Official OpenArt Developer Portal
🔗 **https://openart.ai/developers**

### Step-by-Step Instructions

#### 1. Sign Up / Log In
- Go to https://openart.ai
- Create an account or log in if you already have one
- Free account works for getting started

#### 2. Access Developer Portal
- Navigate to **https://openart.ai/developers**
- Or click your profile → Settings → API Keys
- You'll see the Developer Dashboard

#### 3. Generate API Key
- Click "Generate API Key" or "Create New Key"
- Give it a name (e.g., "ArchiAI Production")
- Copy the key immediately (you won't see it again!)
- Store it securely

#### 4. Add to Your Project

**For Local Development:**
Add to your `.env` file:
```env
OPENART_API_KEY=your_api_key_here
```

**For Vercel Production:**
1. Go to Vercel Dashboard
2. Select your project
3. Settings → Environment Variables
4. Add: `OPENART_API_KEY` = `your_api_key_here`
5. Select all environments (Production, Preview, Development)
6. Save

#### 5. Verify Setup
```bash
# In your terminal:
echo $OPENART_API_KEY  # Should show your key
```

## OpenArt Available Models

### For Architectural Use

1. **Flux Kontext Max** - Best for 3D consistency
   - Model ID: `flux-kontext-max`
   - Best for: Exterior/interior views with geometric consistency
   - Uses reference images to maintain design

2. **SDXL with ControlNet** - Best for 2D blueprints
   - Model ID: `sdxl-controlnet-canny` or `sdxl-controlnet-lineart`
   - Best for: Technical drawings, floor plans, elevations
   - Precise line control

3. **OpenArt Photorealistic** - Best for final renders
   - Model ID: `openart-photorealistic`
   - Best for: Marketing images, presentation renders
   - Highest quality output

## API Pricing (as of 2025)

- **Free Tier**: 50 generations/month
- **Starter**: $10/month - 500 generations
- **Pro**: $30/month - 2000 generations
- **Enterprise**: Custom pricing

Each generation = 1 image at standard resolution (1024x1024)

## API Documentation

📚 **Official Docs**: https://docs.openart.ai/api

### Example API Call

```javascript
const response = await fetch('https://api.openart.ai/v1/generate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENART_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'flux-kontext-max',
    prompt: 'modern residential house exterior, architectural rendering',
    negative_prompt: 'low quality, blurry, distorted',
    width: 1024,
    height: 1024,
    num_images: 1,
    seed: 123456,
    guidance_scale: 7.5,
    reference_image: 'https://...blueprint.jpg',
    reference_strength: 0.7
  })
});

const data = await response.json();
console.log('Generated image:', data.images[0].url);
```

## Integration with ArchiAI

Once you have your API key, the enhanced image generation service will automatically:
1. Detect when `OPENART_API_KEY` is available
2. Use OpenArt models for better consistency
3. Fall back to DALL-E if OpenArt unavailable

**No code changes needed!** Just add the API key.

## Alternative: Replicate (Already Integrated)

If you don't want to use OpenArt, you can use **Replicate** which you already have:

🔗 **https://replicate.com**

Replicate provides:
- Stable Diffusion XL
- Various ControlNet models
- Flux models (newer)

Your current setup already supports Replicate via `REACT_APP_REPLICATE_API_KEY`.

## Comparison: OpenArt vs Replicate vs DALL-E 3

| Feature | DALL-E 3 | Replicate | OpenArt |
|---------|----------|-----------|---------|
| **Quality** | Excellent | Excellent | Excellent |
| **Consistency** | Low | High (with seed) | Very High (with Kontext) |
| **Technical Drawings** | Poor | Good (SDXL) | Best (ControlNet) |
| **3D Consistency** | Poor | Good | Best (Flux Kontext) |
| **Speed** | Fast (~10s) | Medium (~30s) | Medium (~30s) |
| **Cost/Image** | $0.04 | $0.005-0.02 | $0.01-0.03 |
| **API Complexity** | Simple | Medium | Simple |

## Recommendation

**Best Setup for ArchiAI:**
1. **OpenArt** - For technical blueprints and consistent 3D views
2. **DALL-E 3** - For quick iterations and general views
3. **Replicate** - As fallback if OpenArt unavailable

**Cost-Effective Setup:**
1. **Replicate** - For most generations (cheaper)
2. **DALL-E 3** - As fallback

**Simplest Setup (Current):**
1. **DALL-E 3 only** - Works but less consistent

## Troubleshooting

### Can't find Developer Portal?
- Make sure you're logged in
- Try direct link: https://openart.ai/developers
- Check your email for verification

### API Key not working?
- Check it's copied correctly (no spaces)
- Verify it's added to `.env` or Vercel
- Restart server after adding key
- Check API usage limits

### Rate Limit Errors?
- Free tier: 50/month limit
- Upgrade plan or wait for monthly reset
- Use fallback to DALL-E 3

## Support

- OpenArt Support: support@openart.ai
- Discord: https://discord.gg/openart
- Documentation: https://docs.openart.ai

---

**Quick Start:**
1. Go to https://openart.ai/developers
2. Generate API key
3. Add to `.env`: `OPENART_API_KEY=your_key`
4. Restart server
5. Enhanced generation will automatically use OpenArt! ✨