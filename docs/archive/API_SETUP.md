# AI Integration Setup Guide

## Overview

Your ArchitectAI platform is now integrated with:
- **OpenAI GPT-4o** - For AI-powered design reasoning and style signature generation
- **OpenAI DALL·E 3** - For consistent architectural image generation (PRIMARY)
- **Replicate SDXL** - For architectural image generation (FALLBACK)

## Current Status

✅ **API Keys Configured** (in `.env` file):
- `OPENAI_REASONING_API_KEY` - For GPT-4o reasoning and prompting (server-side)
- `OPENAI_IMAGES_API_KEY` - For DALL·E 3 image generation (server-side)
- `REACT_APP_OPENAI_API_KEY` - Legacy key for backward compatibility
- `REACT_APP_REPLICATE_API_KEY` - For SDXL fallback

✅ **Backend Proxy Server** - Running on http://localhost:3001
✅ **Frontend React App** - Running on http://localhost:3000

## What's New: DALL·E 3 Consistency System

This platform now uses **DALL·E 3 as the primary image generator** with a sophisticated consistency system:

1. **Style Signature Generation**: GPT-4o analyzes your project and portfolio to create a comprehensive style signature containing:
   - Materials palette (e.g., "polished concrete", "anodized aluminum")
   - Color palette (facade, roof, trim colors)
   - Façade articulation style
   - Glazing ratios
   - Line weight rules for 2D drawings
   - Diagram conventions
   - Lighting and camera settings
   - Post-processing guidelines

2. **Per-View Prompt Kits**: Each architectural view (plan, section, elevation, exterior, interior, axonometric) gets a tailored prompt kit based on the style signature.

3. **Automatic Fallback**: If DALL·E 3 fails or times out, the system automatically falls back to Replicate SDXL with the same prompts.

4. **Session Persistence**: Style signatures are cached in localStorage and reused throughout the project session for maximum consistency.

## Running the Application

### Method 1: Run Both Servers Manually

**Terminal 1 - API Proxy Server:**
```bash
npm run server
```

**Terminal 2 - React Development Server:**
```bash
npm start
```

### Method 2: Run Both Servers Together (Not Yet Tested)
```bash
npm run dev
```

## How It Works

### Architecture

```
Browser (React App) → Proxy Server (Node/Express) → OpenAI/Replicate APIs
  Port 3000              Port 3001                    External APIs
```

### Why We Need a Proxy Server?

Direct API calls from the browser to OpenAI and Replicate are blocked by CORS (Cross-Origin Resource Sharing) security policies. The proxy server:

1. Receives requests from your React app
2. Adds the API keys securely (never exposed to the browser)
3. Forwards requests to OpenAI/Replicate
4. Returns responses back to the React app

### API Endpoints

**Proxy Server Endpoints:**
- `GET /api/health` - Check API configuration status
- `POST /api/openai/chat` - OpenAI GPT-4o chat completions (reasoning)
- `POST /api/openai/images` - OpenAI DALL·E 3 image generation (NEW)
- `POST /api/replicate/predictions` - Create Replicate SDXL prediction
- `GET /api/replicate/predictions/:id` - Get prediction status
- `POST /api/replicate/predictions/:id/cancel` - Cancel prediction

## Testing the Integration

1. **Open the Application:**
   - Navigate to http://localhost:3000
   - You should see the ArchiAI MVP interface

2. **Check API Status:**
   - Look for the green status bar indicating "API Keys Configured"

3. **Generate a Design:**
   - Fill in the project details (location, building type, style, etc.)
   - Click "Quick Design (MVP)" to test OpenAI reasoning + Replicate generation
   - OR click "Complete Design Workflow" for full design alternatives

4. **Expected Behavior:**
   - **OpenAI** will generate design reasoning, philosophy, and recommendations
   - **Replicate** will generate architectural visualizations (may take 30-60 seconds)
   - Results will display in the UI with reasoning text and generated images

## Troubleshooting

### If Generation Fails:

1. **Check Console Logs:**
   - Open browser DevTools (F12)
   - Look for error messages in the Console tab

2. **Check Proxy Server:**
   - Ensure `npm run server` is running
   - Look for "🚀 API Proxy Server running on http://localhost:3001"

3. **Check API Keys:**
   - Verify `.env` file contains valid API keys
   - Restart both servers after changing `.env`

4. **Common Errors:**
   - **CORS errors**: Proxy server not running
   - **401 Unauthorized**: Invalid API keys
   - **Connection refused**: Proxy server not started
   - **Timeout**: Replicate generation can take 30-60 seconds

### Fallback Mode

If APIs fail, the services will return fallback/mock data:
- OpenAI: Generic design reasoning
- Replicate: Placeholder images

## Deployment to Production (Vercel)

### Option 1: Serverless Functions (Recommended)

Create API endpoints in Vercel:

**`/api/openai-proxy.js`:**
```javascript
export default async function handler(req, res) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
    },
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.json(data);
}
```

Then update `.env`:
```
REACT_APP_API_PROXY_URL=https://www.archiaisolution.pro/api
```

### Option 2: Separate Backend Server

Deploy `server.js` to a separate hosting service (Heroku, Railway, Render) and point your React app to it.

## Environment Variables

**Local Development (`.env`):**
```env
# Google & Weather APIs
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
REACT_APP_OPENWEATHER_API_KEY=your_openweather_key

# OpenAI Keys (Server-side - not exposed to browser)
OPENAI_REASONING_API_KEY=sk-proj-...  # For GPT-4o reasoning
OPENAI_IMAGES_API_KEY=sk-proj-...     # For DALL·E 3 images

# Legacy OpenAI Key (backward compatibility)
REACT_APP_OPENAI_API_KEY=sk-proj-...

# Replicate (Fallback)
REACT_APP_REPLICATE_API_KEY=r8_...

# Proxy URL
REACT_APP_API_PROXY_URL=http://localhost:3001
```

**Production (Vercel Environment Variables):**
Add all the above variables in Vercel Dashboard → Settings → Environment Variables:
- `OPENAI_REASONING_API_KEY` - **Required** for style signature and reasoning
- `OPENAI_IMAGES_API_KEY` - **Required** for DALL·E 3 generation
- `REACT_APP_OPENAI_API_KEY` - Keep for backward compatibility
- `REACT_APP_REPLICATE_API_KEY` - **Required** for fallback
- Other variables as listed above

**Important**: The two new OpenAI keys (`OPENAI_REASONING_API_KEY` and `OPENAI_IMAGES_API_KEY`) are server-side only and never exposed to the browser. They can be the same key or different keys depending on your usage tracking needs.

## API Usage & Costs

### OpenAI GPT-4o (Reasoning & Style Signature):
- **Cost**: ~$2.50 per 1M input tokens, ~$10 per 1M output tokens
- **Usage per request**: ~2000-5000 tokens (~$0.02-$0.08 per design)

### OpenAI DALL·E 3 (Primary Image Generation):
- **Cost**: $0.040 per image (standard 1024x1024), $0.080 per image (HD 1024x1024)
- **Usage per design**: 5-10 images @ HD quality (~$0.40-$0.80 per design)

### Replicate SDXL (Fallback):
- **Cost**: ~$0.0025 per second of compute time
- **Usage per image**: 20-60 seconds (~$0.05-$0.15 per image, only when DALL·E 3 fails)

**Estimated cost per complete design** (with DALL·E 3): **$0.60-$1.20**
- GPT-4o reasoning: $0.02-$0.08
- DALL·E 3 images (7 views): $0.56-$0.80 (HD)
- Style signature generation: $0.02 (one-time per project)

**Fallback cost**: If DALL·E 3 fails and all images use SDXL: $0.50-$1.50

## Security Notes

⚠️ **IMPORTANT**:
- Never commit `.env` file to git (it's in `.gitignore`)
- API keys should only be stored server-side
- The proxy server keeps keys secure

## Next Steps

1. **Test the current setup** - Generate a few designs to ensure everything works
2. **Monitor API usage** - Check OpenAI and Replicate dashboards for usage
3. **Set up production deployment** - Configure Vercel serverless functions
4. **Add rate limiting** - Protect against excessive API usage
5. **Implement caching** - Store generated designs to reduce API calls

## Support

For issues:
1. Check the browser console for errors
2. Check the proxy server logs
3. Verify API keys are valid
4. Test APIs directly using curl/Postman

---

Generated: 2025-10-05
