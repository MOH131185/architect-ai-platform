# AI Integration Setup Guide

## Overview

Your ArchitectAI platform is now integrated with:
- **OpenAI API** - For AI-powered design reasoning
- **Replicate API** - For architectural image generation using SDXL

## Current Status

✅ **API Keys Configured** (in `.env` file):
- `REACT_APP_OPENAI_API_KEY` - Configured
- `REACT_APP_REPLICATE_API_KEY` - Configured

✅ **Backend Proxy Server** - Running on http://localhost:3001
✅ **Frontend React App** - Running on http://localhost:3000

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
- `POST /api/openai/chat` - OpenAI chat completions
- `POST /api/replicate/predictions` - Create Replicate prediction
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
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
REACT_APP_OPENWEATHER_API_KEY=your_openweather_key
REACT_APP_OPENAI_API_KEY=sk-svcacct-...
REACT_APP_REPLICATE_API_KEY=r8_...
REACT_APP_API_PROXY_URL=http://localhost:3001
```

**Production (Vercel Environment Variables):**
- Add all the above variables in Vercel Dashboard → Settings → Environment Variables
- Update `REACT_APP_API_PROXY_URL` to your production proxy URL

## API Usage & Costs

### OpenAI (GPT-4):
- **Cost**: ~$0.03 per 1K tokens (input), ~$0.06 per 1K tokens (output)
- **Usage per request**: ~2000-3000 tokens (~$0.10-$0.20 per design)

### Replicate (SDXL):
- **Cost**: ~$0.0025 per second of compute time
- **Usage per image**: 20-60 seconds (~$0.05-$0.15 per image)

**Estimated cost per complete design**: $0.50-$1.00

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
