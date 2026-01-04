# Vercel Environment Variables Setup Guide

## IMPORTANT: Variable Naming Convention

In Vercel serverless functions, environment variables should **NOT** use the `REACT_APP_` prefix.

### Correct Variable Names for Vercel

Set these exact variable names in your Vercel dashboard:

```
OPENAI_API_KEY=sk-proj-...your-key...
REPLICATE_API_KEY=r8_...your-key...
GOOGLE_MAPS_API_KEY=AIza...your-key...
OPENWEATHER_API_KEY=...your-key...
```

### How to Add Environment Variables in Vercel

1. Go to https://vercel.com/dashboard
2. Select your project: `architect-ai-platform`
3. Click **Settings** → **Environment Variables**
4. Add each variable:
   - **Name**: `OPENAI_API_KEY` (without REACT_APP_ prefix)
   - **Value**: Your actual API key from `.env` file
   - **Environments**: Check all three: Production, Preview, Development
5. Click **Save**
6. Repeat for all 4 API keys

### API Keys to Add

Copy the values from your local `.env` file:

1. **OPENAI_API_KEY**
   - Value from: `REACT_APP_OPENAI_API_KEY` in your .env
   - Used by: `/api/openai-chat.js`

2. **REPLICATE_API_KEY**
   - Value from: `REACT_APP_REPLICATE_API_KEY` in your .env
   - Used by: `/api/replicate-predictions.js`, `/api/replicate-status.js`
   - Alternative name: `REPLICATE_API_TOKEN` (both work)

3. **GOOGLE_MAPS_API_KEY**
   - Value from: `REACT_APP_GOOGLE_MAPS_API_KEY` in your .env
   - Used by: Frontend (build-time variable)
   - For this one, also add with REACT_APP_ prefix since it's used in frontend

4. **OPENWEATHER_API_KEY**
   - Value from: `REACT_APP_OPENWEATHER_API_KEY` in your .env
   - Used by: Frontend (build-time variable)
   - For this one, also add with REACT_APP_ prefix since it's used in frontend

### Frontend vs Backend Variables

**Backend (Serverless Functions)**: Use without `REACT_APP_` prefix
- `OPENAI_API_KEY`
- `REPLICATE_API_KEY`

**Frontend (Build Time)**: Use with `REACT_APP_` prefix
- `REACT_APP_GOOGLE_MAPS_API_KEY`
- `REACT_APP_OPENWEATHER_API_KEY`

### After Adding Variables

1. **Trigger Redeploy**:
   - Go to **Deployments** tab
   - Click ⋯ menu on latest deployment
   - Select **Redeploy**
   - Check "Use existing Build Cache" (faster)

2. **Verify Deployment**:
   - Wait 1-2 minutes for deployment
   - Visit https://www.archiaisolution.pro
   - Open browser console (F12)
   - Generate a design
   - OpenAI 401 errors should be gone

### Troubleshooting

**Still getting 401 errors?**
- Double-check variable names (no typos)
- Ensure all environments are selected (Production, Preview, Development)
- Try redeploying without cache
- Check API key is valid by testing locally first

**Build failures?**
- Frontend variables need `REACT_APP_` prefix
- Backend variables should NOT have `REACT_APP_` prefix

### Summary Checklist

- [ ] Add `OPENAI_API_KEY` (no prefix) for backend
- [ ] Add `REPLICATE_API_KEY` (no prefix) for backend
- [ ] Add `REACT_APP_GOOGLE_MAPS_API_KEY` (with prefix) for frontend
- [ ] Add `REACT_APP_OPENWEATHER_API_KEY` (with prefix) for frontend
- [ ] Select all environments (Production, Preview, Development)
- [ ] Trigger manual redeploy
- [ ] Test on live site
- [ ] Verify console has no 401 errors
