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

### 3. OpenAI API Key
Recommended (serverless reads this):
```
OPENAI_API_KEY=your_openai_api_key_here
```
Optional (kept for compatibility with local dev):
```
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
```
**Your actual key**: Starts with `sk-` (e.g., `sk-proj-...`). Either variable works; `OPENAI_API_KEY` is preferred in production.

### 4. Replicate API Token (Set BOTH for compatibility)
Recommended (serverless reads this):
```
REPLICATE_API_TOKEN=your_replicate_api_token_here
```
Optional (kept for compatibility with local dev):
```
REACT_APP_REPLICATE_API_KEY=your_replicate_api_token_here
```
**Your actual token**: Starts with `r8_` - check your local `.env` file

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

1. Visit your deployed site (e.g., https://your-project.vercel.app/)
2. Open https://your-project.vercel.app/api/debug-info
   - Check `apiKeys.openai.exists` is `true`
   - Check `apiKeys.replicate.alternativeExists` or `exists` is `true`
   - Check `replicateTest.success` is `true` (status 200)
3. Return to the app and complete the workflow:
   - Enter an address (or detect location)
   - Upload portfolio files
   - Enter project specifications (e.g., Medical Clinic, 500m²)
   - Click "Generate AI Designs"
You should see:
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

- **OpenAI GPT-4**: ~$0.10-$0.20 per design generation
- **Replicate SDXL**: ~$0.15-$0.45 per design (multiple images)
- **Total**: ~$0.50-$1.00 per complete design generation

Monitor your API usage:
- OpenAI: https://platform.openai.com/usage
- Replicate: https://replicate.com/account/billing
