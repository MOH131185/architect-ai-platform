# Deployment Guide - Architect AI Platform

This document describes the Vercel deployment configuration and requirements.

## Prerequisites

### Required Environment Variables

Configure these in Vercel Dashboard > Settings > Environment Variables:

| Variable                        | Required  | Description                                            |
| ------------------------------- | --------- | ------------------------------------------------------ |
| `TOGETHER_API_KEY`              | **Yes\*** | Together.ai API key (Build Tier 2+ required for FLUX)  |
| `AI_GATEWAY_API_KEY`            | **Alt\*** | Vercel AI Gateway API key (alternative to Together.ai) |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | **Yes**   | Google Maps API key for geocoding and maps             |
| `REACT_APP_OPENWEATHER_API_KEY` | Yes       | OpenWeather API for climate data                       |
| `OPENAI_REASONING_API_KEY`      | Optional  | OpenAI GPT-4 fallback for reasoning                    |

\*Either `TOGETHER_API_KEY` or `AI_GATEWAY_API_KEY` is required. You can use both for hybrid routing.

### Node.js Version

The project requires Node.js 18.x-20.x (specified in `package.json` engines field).
Vercel is configured to use `nodejs20.x` runtime.

## Vercel Configuration

### Framework Settings

| Setting          | Value                  |
| ---------------- | ---------------------- |
| Framework Preset | Create React App       |
| Build Command    | `npm run build:vercel` |
| Output Directory | `build`                |
| Install Command  | `npm install`          |
| Root Directory   | `.` (project root)     |

### vercel.json Summary

```json
{
  "version": 2,
  "buildCommand": "npm run build:vercel",
  "framework": "create-react-app",
  "functions": {
    "api/**/*.js": {
      "maxDuration": 120,
      "memory": 3008,
      "includeFiles": "server/**/*.{js,cjs},src/services/**/*.js,src/config/*.js,src/utils/*.js"
    }
  }
}
```

> **Note**: `npm run build:vercel` runs `CI=false react-scripts build`, which prevents
> CRA warnings from being treated as errors during Vercel builds.

### Rewrite Rules

The `vercel.json` defines 21 rewrite rules mapping clean API paths to function files:

| Source Path                | Destination                        |
| -------------------------- | ---------------------------------- |
| `/api/ai-gateway/chat`     | `/api/ai-gateway/chat.js`          |
| `/api/ai-gateway/image`    | `/api/ai-gateway/image.js`         |
| `/api/together/chat`       | `/api/together-chat.js`            |
| `/api/together/image`      | `/api/together-image.js`           |
| `/api/together-chat`       | `/api/together-chat.js`            |
| `/api/together-image`      | `/api/together-image.js`           |
| `/api/openai-chat`         | `/api/openai-chat.js`              |
| `/api/openai-images`       | `/api/openai-images.js`            |
| `/api/sheet`               | `/api/sheet.js`                    |
| `/api/render`              | `/api/render.js`                   |
| `/api/plan`                | `/api/plan.js`                     |
| `/api/overlay`             | `/api/overlay.js`                  |
| `/api/overlay-site-map`    | `/api/overlay-site-map.js`         |
| `/api/drift-detect`        | `/api/drift-detect.js`             |
| `/api/upscale`             | `/api/upscale.js`                  |
| `/api/proxy-image`         | `/api/proxy-image.js`              |
| `/api/a1/compose`          | `/api/a1/compose.js`               |
| `/api/health`              | `/api/health.js`                   |
| `/api/genarch/jobs`        | `/api/genarch/jobs/index.js`       |
| `/api/genarch/jobs/:jobId` | `/api/genarch/jobs/[jobId].js`     |
| `/api/genarch/runs/:path*` | `/api/genarch/runs/[...params].js` |

### CORS Headers

All API routes (`/api/(.*)`) include these response headers:

| Header                         | Value                                           |
| ------------------------------ | ----------------------------------------------- |
| `Access-Control-Allow-Origin`  | `https://www.archiaisolution.pro`               |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS`               |
| `Access-Control-Allow-Headers` | `X-Requested-With, Content-Type, Authorization` |

## API Functions

All API functions are located in `/api/` and deployed as Vercel Serverless Functions.

### Critical Endpoints

| Endpoint              | Function                 | Max Duration | Memory |
| --------------------- | ------------------------ | ------------ | ------ |
| `/api/together-image` | FLUX image generation    | 120s         | 3008MB |
| `/api/together-chat`  | Qwen chat/DNA generation | 120s         | 3008MB |
| `/api/a1/compose`     | A1 sheet composition     | 120s         | 3008MB |
| `/api/drift-detect`   | Image comparison (sharp) | 120s         | 3008MB |
| `/api/health`         | Health check             | 120s         | 3008MB |

### Sharp (Native Module) Notes

The following endpoints use `sharp` for image processing:

- `api/a1/compose.js` - Image composition
- `api/drift-detect.js` - Image comparison
- `api/overlay-site-map.js` - Image overlay
- `api/together-image.js` - SVG rasterization

Sharp is bundled automatically by Vercel for Node.js 20.x runtime.

## Build Process

1. **Install dependencies**: `npm install`
2. **Build React app**: `npm run build:vercel` (sets `CI=false` to prevent warnings from failing build)
3. **Deploy to Vercel**: Push to GitHub (auto-deploys via integration)

### Local Build Verification

```bash
# Clean install and build
npm ci
npm run build:vercel

# Expected output: "The build folder is ready to be deployed."
```

### Known Build Warnings

The following warnings are expected and do not affect deployment:

1. **Source map warnings** for `arc` package (missing .ts source files)
2. **Module not found warnings** for `fs`/`path` - these are Node.js-only code paths that are safely handled at runtime

## Troubleshooting

### Build Fails on Vercel

1. Check Node.js version matches (18.x-20.x)
2. Verify all required env vars are set
3. Check Vercel build logs for specific error

### API 500 Errors

1. Check function logs in Vercel Dashboard
2. Verify `TOGETHER_API_KEY` is set and valid
3. For rate limits, the system auto-waits per Retry-After headers

### Sharp/Image Processing Errors

1. Ensure function has `runtime: "nodejs20.x"` (not Edge)
2. Increase memory if OOM errors (3008MB max)
3. Check image sizes don't exceed buffer limits

## File Structure

```
architect-ai-platform/
├── api/                    # Vercel Serverless Functions
│   ├── a1/compose.js       # A1 sheet composition
│   ├── together-*.js       # Together.ai proxies
│   ├── health.js           # Health check
│   └── ...
├── server/                 # Server-side utilities
│   ├── utils/              # Shared utilities for API functions
│   └── blender/            # Blender bridge (server-only)
├── src/                    # React frontend source
├── build/                  # Production build output
├── package.json            # Node.js 18-20 engines
└── vercel.json             # Vercel deployment config
```

## Production URL

- Primary: https://www.archiaisolution.pro
- Vercel: Auto-generated `.vercel.app` domain

## Vercel AI Gateway Integration

The platform supports routing AI calls through Vercel AI Gateway as an alternative to direct Together.ai integration.

### Setup

1. **Get AI Gateway API Key**:
   - Go to [Vercel Dashboard](https://vercel.com) > AI Gateway > API Keys
   - Click "Create key" to generate a new API key

2. **Add Environment Variable**:

   ```
   AI_GATEWAY_API_KEY=your_ai_gateway_api_key
   ```

3. **Enable Feature Flag** (optional):
   - Set `useVercelAIGateway: true` in `src/config/featureFlags.js`
   - Or toggle via browser console: `setFeatureFlag('useVercelAIGateway', true)`

### API Endpoints

| Endpoint                | Description      | Model Mapping                   |
| ----------------------- | ---------------- | ------------------------------- |
| `/api/ai-gateway/chat`  | Chat/reasoning   | Qwen 2.5 → `alibaba/qwen3-235b` |
| `/api/ai-gateway/image` | Image generation | FLUX.1-dev → `bfl/flux-pro-1.1` |

### Model Mapping

| Original (Together.ai)             | AI Gateway Equivalent              |
| ---------------------------------- | ---------------------------------- |
| `Qwen/Qwen2.5-72B-Instruct-Turbo`  | `alibaba/qwen3-235b-a22b-instruct` |
| `black-forest-labs/FLUX.1-dev`     | `bfl/flux-pro-1.1`                 |
| `black-forest-labs/FLUX.1-schnell` | `bfl/flux-kontext-pro`             |

### Benefits

- **Unified Billing**: All AI costs through Vercel
- **Free Credits**: $5/month for new accounts
- **Model Fallbacks**: Built-in routing and failover
- **No Extra Accounts**: No separate Together.ai account needed

### Verification

Test the AI Gateway integration:

```bash
# Chat endpoint
curl -X POST https://your-app.vercel.app/api/ai-gateway/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'

# Image endpoint (requires valid prompt)
curl -X POST https://your-app.vercel.app/api/ai-gateway/image \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A modern house","width":512,"height":512}'
```

## Support

For deployment issues, check:

1. Vercel Dashboard > Deployments > [latest] > Build Logs
2. Vercel Dashboard > Functions > [endpoint] > Logs
3. GitHub Issues: https://github.com/MOH131185/architect-ai-platform/issues
