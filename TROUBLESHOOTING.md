# Troubleshooting Guide - ArchiAI Platform

## 🚨 Critical Issue: Environment Variables Not Loading

### Problem:
- 3D maps not showing
- AI generation not happening
- Console shows: "API key not configured" or similar errors

### Root Cause:
In Create React App + Vercel, environment variables must be:
1. **Added in Vercel Dashboard** (which you did ✅)
2. **Build must be triggered AFTER adding them**
3. **No `env` section in vercel.json** (was causing conflicts)

### Solution Applied:

**Fixed `vercel.json`:**
- Removed the `env` section with `@` references
- Environment variables now come directly from Vercel Dashboard during build
- Commit pushed: Will trigger new build with correct env vars

---

## 📋 Verify Environment Variables in Vercel

### Step 1: Check Variables Are Set

Go to: https://vercel.com/dashboard → Project → Settings → Environment Variables

You should see **4 variables**:

```
✅ REACT_APP_GOOGLE_MAPS_API_KEY
✅ REACT_APP_OPENWEATHER_API_KEY
✅ REACT_APP_OPENAI_API_KEY
✅ REACT_APP_REPLICATE_API_KEY
```

**Each variable must have:**
- ✅ "Production" environment checked
- ✅ "Preview" environment checked
- ✅ "Development" environment checked

### Step 2: Verify Values Are Correct

Click "Show" on each variable and verify:
- Google Maps key starts with `AIza...`
- OpenWeather key is alphanumeric
- OpenAI key starts with `sk-...`
- Replicate key starts with `r8_...`

---

## 🔍 Debugging Steps

### 1. Check Build Logs

Go to: Vercel Dashboard → Deployments → [Latest] → "Building"

**Look for:**
```
✅ Build Command: npm run build
✅ Creating an optimized production build...
✅ Compiled successfully!
```

**Warning signs (these are OK):**
```
⚠️  npm warn deprecated workbox-*  (IGNORE - from react-scripts)
⚠️  npm warn deprecated eslint@8  (IGNORE - from react-scripts)
⚠️  Warning: Node.js functions compiled ESM to CommonJS (IGNORE - expected)
```

### 2. Check Runtime Logs

Go to: Vercel Dashboard → Deployments → [Latest] → Functions

**Look for API function calls:**
```
✅ /api/openai-chat - 200 OK
✅ /api/replicate-predictions - 200 OK
❌ /api/openai-chat - 500 Internal Server Error (API key issue)
```

### 3. Check Browser Console

Open your site → Press F12 → Console tab

**Good signs:**
```
🎨 Starting AI design generation with: {...}
✅ AI design generation complete: {...}
```

**Bad signs:**
```
❌ OpenAI API key not found
❌ Failed to fetch
❌ InvalidKeyMapError (Google Maps)
❌ 504 Gateway Timeout
```

---

## 🗺️ 3D Map Not Showing - Specific Fixes

### Issue: Map Section Blank/Empty

**Possible Causes:**

1. **Google Maps API Key Missing**
   ```
   Console Error: "InvalidKeyMapError" or "MissingKeyMapError"
   Solution: Verify REACT_APP_GOOGLE_MAPS_API_KEY in Vercel
   ```

2. **Maps JavaScript API Not Enabled**
   ```
   Console Error: "This API project is not authorized..."
   Solution:
   - Go to: https://console.cloud.google.com/apis/library
   - Search: "Maps JavaScript API"
   - Click: "Enable"
   - Wait 2-3 minutes for activation
   ```

3. **API Key Has Restrictions**
   ```
   Console Error: "RefererNotAllowedMapError"
   Solution:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click your API key
   - Under "Website restrictions"
   - Add: *.archiaisolution.pro/*
   - Add: *.vercel.app/*
   - Save and wait 5 minutes
   ```

4. **Wrapper Component Issue**
   ```
   Check: Browser Console for React errors
   Look for: "Wrapper is not defined" or import errors
   ```

### Verify Map Works:

1. Go through wizard to "Intelligence Report" page
2. Open browser console (F12)
3. Look for Google Maps script loading:
   ```
   ✅ maps.googleapis.com/maps/api/js?key=AIza...&libraries=maps
   ```
4. Check for `window.google.maps` object:
   ```javascript
   // In console, type:
   console.log(window.google?.maps)
   // Should show: {Map: ƒ, Marker: ƒ, ...}
   ```

---

## 🤖 AI Generation Not Happening - Specific Fixes

### Issue: Infinite Loading or Timeout

**Possible Causes:**

1. **Vercel Plan Timeout (Most Likely)**
   ```
   Error: 504 Gateway Timeout or FUNCTION_INVOCATION_TIMEOUT

   Hobby Plan: 10 seconds ❌ (too short)
   Pro Plan: 60 seconds ✅ (required)

   Solution: Upgrade to Vercel Pro
   - Go to: Vercel Dashboard → Settings → General
   - Click: "Upgrade to Pro"
   - Cost: $20/month
   ```

2. **API Keys Not Set**
   ```
   Console Error: "OpenAI API key not configured"

   Solution:
   - Check environment variables in Vercel
   - Trigger new deployment after adding
   ```

3. **API Rate Limits Hit**
   ```
   Console Error: "Rate limit exceeded" or "429 Too Many Requests"

   Solution:
   - Check OpenAI dashboard: platform.openai.com/usage
   - Check Replicate dashboard: replicate.com/account/billing
   - Add credits or wait for rate limit reset
   ```

4. **Invalid API Keys**
   ```
   Console Error: "401 Unauthorized" or "Invalid API key"

   Solution:
   - Verify OpenAI key starts with: sk-
   - Verify Replicate key starts with: r8_
   - Generate new keys if needed
   - Update in Vercel and redeploy
   ```

### Test AI Generation:

1. Complete all steps through "Project Specifications"
2. Open browser console BEFORE clicking "Generate"
3. Click "Generate AI Designs"
4. Watch console for:
   ```
   🎨 Starting AI design generation...
   [API calls happening...]
   ✅ AI design generation complete: {...}
   ```

5. **If stuck at "AI is generating...":**
   - Wait 60 seconds
   - Check console for errors
   - Check Network tab for failed requests (F12 → Network)

---

## ⏱️ Timeout Troubleshooting

### Verify Vercel Function Timeout:

```bash
# Check vercel.json has this:
"functions": {
  "api/**/*.js": {
    "maxDuration": 60
  }
}
```

### Verify You're on Pro Plan:

1. Go to: Vercel Dashboard → Settings → General
2. Check "Plan" section
3. Should say: "Pro" (not "Hobby")

### If Still Timing Out on Pro:

The `quickDesign()` mode should complete in ~30 seconds:
- OpenAI reasoning: 5-10s
- Replicate image: 15-25s
- Processing: 2-5s

If it's still timing out:
1. Check API service status:
   - OpenAI: https://status.openai.com
   - Replicate: https://status.replicate.com

2. Try reducing complexity:
   - Smaller area (100m² instead of 500m²)
   - Simpler building program

---

## 🔄 Force Fresh Deployment

If environment variables still not working:

### Method 1: Redeploy from Vercel

1. Go to: Vercel Dashboard → Deployments
2. Find most recent deployment
3. Click: "⋯" menu → "Redeploy"
4. Select: "Use existing Build Cache" NO (uncheck)
5. Click: "Redeploy"

### Method 2: Git Push (Already Done)

```bash
# Empty commit to trigger build
git commit --allow-empty -m "chore: trigger rebuild"
git push origin main
```

### Method 3: Delete .vercel Folder (Nuclear Option)

```bash
# Remove Vercel cache locally
rm -rf .vercel

# Push change
git add .
git commit -m "chore: clear vercel cache"
git push origin main
```

---

## 📱 Test in Different Browsers

Sometimes caching causes issues:

### Chrome/Edge:
```
1. Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)
2. Clear cache: F12 → Application → Clear storage
3. Incognito mode: Ctrl+Shift+N
```

### Firefox:
```
1. Hard refresh: Ctrl+F5
2. Clear cache: Ctrl+Shift+Delete
3. Private window: Ctrl+Shift+P
```

### Safari:
```
1. Hard refresh: Cmd+Option+R
2. Clear cache: Safari → Preferences → Privacy
3. Private window: Cmd+Shift+N
```

---

## 🎯 Quick Diagnosis Checklist

Run through this quickly:

**Environment Variables:**
- [ ] All 4 variables added in Vercel Dashboard
- [ ] All 3 environments checked for each variable
- [ ] Values are correct (no typos, no extra spaces)
- [ ] Recent deployment after adding variables

**APIs Enabled:**
- [ ] Google Maps JavaScript API enabled
- [ ] OpenAI account has credits
- [ ] Replicate account has credits

**Vercel Plan:**
- [ ] On Pro plan ($20/month) or Enterprise
- [ ] NOT on Hobby plan (10s timeout won't work)

**Code Deployed:**
- [ ] Latest commit includes vercel.json
- [ ] Google Maps Wrapper is uncommented
- [ ] Using quickDesign() mode

**Build Success:**
- [ ] Latest deployment shows "Ready" status
- [ ] Build logs show "Compiled successfully"
- [ ] No red errors in build logs

---

## 🆘 Still Not Working?

### Get Detailed Diagnostics:

1. **Screenshot the console**
   - F12 → Console tab
   - Take screenshot of any errors
   - Share for debugging

2. **Check Function Logs**
   - Vercel Dashboard → Deployments → Latest → Functions
   - Click on /api/openai-chat or /api/replicate-predictions
   - Look for error messages

3. **Test API Keys Directly**

   Test OpenAI key:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer YOUR_OPENAI_KEY"
   ```

   Test Replicate key:
   ```bash
   curl -X GET https://api.replicate.com/v1/predictions \
     -H "Authorization: Token YOUR_REPLICATE_KEY"
   ```

---

## 📞 Next Steps

After the deployment that's building now completes:

1. **Wait 3-4 minutes** for build to finish
2. **Hard refresh** the browser (Ctrl+Shift+R)
3. **Test location entry** → Check if 3D map appears
4. **Test AI generation** → Check if completes in <60s
5. **Report back** with any console errors you see

The new deployment should have:
- ✅ Removed invalid `env` config from vercel.json
- ✅ Environment variables will load from Vercel Dashboard
- ✅ 60-second timeout for serverless functions

---

*Last Updated: 2025-10-05*
