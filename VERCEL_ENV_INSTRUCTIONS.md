# IMPORTANT: Fix OpenAI 401 Errors in Production

## Quick Fix Instructions

You're getting 401 errors because the OpenAI API key isn't configured in Vercel. Follow these steps:

### 1. Go to Vercel Dashboard
https://vercel.com/dashboard

### 2. Select Your Project
Click on `architect-ai-platform`

### 3. Go to Settings → Environment Variables

### 4. Add These Exact Variables

**CRITICAL**: Use these exact names (NO "REACT_APP_" prefix for backend APIs):

```
Variable Name: OPENAI_API_KEY
Value: [Copy the value from your .env file's REACT_APP_OPENAI_API_KEY]
Environment: ✅ Production ✅ Preview ✅ Development
```

```
Variable Name: REPLICATE_API_KEY
Value: [Copy the value from your .env file's REACT_APP_REPLICATE_API_KEY]
Environment: ✅ Production ✅ Preview ✅ Development
```

### 5. Also Add Frontend Variables (with REACT_APP_ prefix)

```
Variable Name: REACT_APP_GOOGLE_MAPS_API_KEY
Value: [Same as in your .env file]
Environment: ✅ Production ✅ Preview ✅ Development
```

```
Variable Name: REACT_APP_OPENWEATHER_API_KEY
Value: [Same as in your .env file]
Environment: ✅ Production ✅ Preview ✅ Development
```

### 6. Trigger Redeploy

After adding all variables:
1. Go to **Deployments** tab
2. Click the **⋯** menu on the latest deployment
3. Select **Redeploy**
4. ✅ Use existing Build Cache (faster)
5. Click **Redeploy**

### 7. Verify It Works

After deployment (1-2 minutes):
1. Visit https://www.archiaisolution.pro
2. Generate a design
3. Check browser console (F12)
4. OpenAI 401 errors should be gone!

## Why This Happens

- **Backend APIs** (in `/api` folder) need variables WITHOUT `REACT_APP_` prefix
- **Frontend** (React app) needs variables WITH `REACT_APP_` prefix
- Vercel serverless functions can't access `REACT_APP_` prefixed variables

## Your .env Values to Copy

Based on your .env file, add these in Vercel:

```
OPENAI_API_KEY = [value of REACT_APP_OPENAI_API_KEY from .env]
REPLICATE_API_KEY = [value of REACT_APP_REPLICATE_API_KEY from .env]
```