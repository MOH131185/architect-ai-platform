# Vercel Environment Variables Setup

## Critical: Set These Environment Variables in Vercel Dashboard

Go to your Vercel project dashboard → Settings → Environment Variables

Add the following variables for **ALL environments** (Production, Preview, Development):

### 1. Google Maps API Key
```
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```
**Your actual key**: See your local `.env` file (do not commit this file!)

### 2. OpenWeather API Key
```
REACT_APP_OPENWEATHER_API_KEY=your_openweather_api_key_here
```
**Your actual key**: See your local `.env` file

### 3. OpenAI API Keys (NEW - DALL·E 3 Integration)

**IMPORTANT**: These two keys are server-side only (used in Vercel serverless functions):

```
OPENAI_REASONING_API_KEY=your_openai_api_key_here
```
**Purpose**: For GPT-4o reasoning and style signature generation
**Your actual key**: Starts with `sk-proj-` - get from https://platform.openai.com/api-keys

```
OPENAI_IMAGES_API_KEY=your_openai_api_key_here
```
**Purpose**: For DALL·E 3 image generation (NOTE: automatically redirected to FLUX.1 - see TOGETHER_API_KEY)
**Your actual key**: Starts with `sk-proj-` - can be same as reasoning key or separate
**Status**: Optional (code redirects to FLUX.1, but kept for backward compatibility)

```
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
```
**Purpose**: Legacy key for backward compatibility
**Your actual key**: Same key as above - check your local `.env` file

**Note**: You can use the same OpenAI key for all three variables, or use separate keys to track usage separately.

### 4. Together AI API Key (PRIMARY - FLUX.1 Image Generation)
```
TOGETHER_API_KEY=your_together_api_key_here
```
**Your actual key**: Get from https://api.together.xyz/
**Purpose**: **PRIMARY image generator** - All DALL-E 3 calls are automatically redirected to FLUX.1-schnell via Together AI for faster, more consistent results
**IMPORTANT**: This is now required for production deployment

### 5. Replicate API Token (Optional Fallback)
```
REACT_APP_REPLICATE_API_KEY=your_replicate_api_token_here
REPLICATE_API_TOKEN=your_replicate_api_token_here
```
**Your actual token**: Starts with `r8_` - check your local `.env` file
**Purpose**: Optional fallback image generation (currently not used in FLUX.1 workflow)

## How to Set Environment Variables in Vercel

1. Go to https://vercel.com/dashboard
2. Select your project: `architect-ai-platform`
3. Click on **Settings** tab
4. Click on **Environment Variables** in the sidebar
5. For each variable:
   - Click "Add New"
   - Enter the **Name** (e.g., `REACT_APP_OPENAI_API_KEY`)
   - Enter the **Value** (the API key)
   - Select all environments: Production, Preview, Development
   - Click "Save"

## After Setting Variables

1. Go to the **Deployments** tab
2. Find the latest deployment
3. Click the **"..."** menu on the right
4. Select **"Redeploy"**
5. Check **"Use existing Build Cache"**
6. Click **"Redeploy"**

## Verification

After redeployment completes (2-3 minutes):

1. Visit https://www.archiaisolution.pro/
2. Complete the workflow:
   - Enter an address (or detect location)
   - Upload portfolio files
   - Enter project specifications (e.g., Medical Clinic, 500m²)
   - Click "Generate AI Designs"
3. You should see:
   - 2D Floor Plan generated (not placeholder)
   - 3D Model Visualization generated (not placeholder)
   - AI reasoning and feasibility analysis

## Troubleshooting

### If images still show placeholders:

1. Check browser console for errors (F12 → Console tab)
2. Look for API errors like:
   - "Replicate API key not configured"
   - "OpenAI API key not configured"
3. Verify environment variables are set correctly in Vercel
4. Try a fresh deployment without cache:
   - Deployments → "..." → Redeploy → Uncheck "Use existing Build Cache"

### If generation is slow:

- OpenAI typically takes 5-15 seconds
- Replicate image generation takes 20-60 seconds per image
- Total workflow: 60-120 seconds is normal

## API Usage Costs

### Current Architecture (FLUX.1 Primary):
- **OpenAI GPT-4o** (reasoning & style): ~$0.02-$0.08 per design
- **Together AI FLUX.1-schnell** (images): ~$0.20-$0.50 per design (5-10 images @ 4 steps)
- **Total**: ~$0.30-$0.80 per complete design generation

### Cost Comparison:
- **FLUX.1** (current): ~$0.30-$0.80 per design, 2-4 seconds per image
- **DALL·E 3** (legacy): ~$0.60-$1.20 per design, 10-15 seconds per image

Monitor your API usage:
- OpenAI: https://platform.openai.com/usage
- Together AI: https://api.together.xyz/usage

## What's New: FLUX.1 Redirect Architecture

Your platform now uses **FLUX.1-schnell as the primary image generator** with automatic redirect:

1. **Transparent Redirect**: All DALL-E 3 API calls are automatically redirected to FLUX.1-schnell via Together AI for faster generation (2-4 seconds vs 10-15 seconds).

2. **Consistent Behavior**: Both development (server.js) and production (Vercel serverless) use the same FLUX.1 redirect logic.

3. **Style Signature**: GPT-4o generates a comprehensive style signature (materials, colors, facade style, lighting, etc.) based on your portfolio and project specs.

4. **Lower Cost**: FLUX.1-schnell costs ~50% less than DALL·E 3 while providing comparable quality.

5. **Dimension Validation**: Automatically validates and caps image dimensions to FLUX.1 limits (64-1792px).

This ensures consistent, fast, and cost-effective image generation across all environments!
